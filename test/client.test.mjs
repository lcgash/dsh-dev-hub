import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const client = await import('../src/client/index.mjs')
const common = await import('../src/client/common.mjs')

/**
 * Regression guard for the Web-boot failure of 2026-11-06:
 * a Client half without a static `inject: ['slots']` activates before the
 * renderer's `slots` service exists, `ctx.slots` is undefined, the entry
 * fiber fails and the whole page boot aborts with
 * "web boot: 1 entry did not activate / dsh-dev-hub: failed".
 * The shape is fixed by the plugin template: the module exports
 * `inject` (services to wait for) and `apply(ctx)`.
 */
test('client half declares the slots service before applying', () => {
  assert.ok(Array.isArray(client.inject), 'client module must export inject')
  assert.ok(client.inject.includes('slots'), 'client module must wait for the slots service')
  assert.equal(typeof client.apply, 'function')
})

test('client apply 把入口挂到左上角面板列表，并在 main 里渲染大页面', () => {
  const registered = []
  const ctx = {
    slots: {
      inject(key, callback) { callback() },
      register(spec, Component) { registered.push({ spec, Component }); return () => {} },
    },
  }
  client.apply(ctx)
  assert.deepEqual(
    registered.map(({ spec }) => (spec.key ? `${spec.name}#key=${spec.key}` : `${spec.name}#${spec.id}`)),
    ['sidebar.panellist#dev-hub', 'conversation.session.header.actions#dev-hub-session', 'main#key=dev-hub'],
  )
  // 面板图标与 main 面板靠同名 id/key 互相寻址，改名必须两边一起改
  assert.equal(registered[0].spec.id, registered[2].spec.key)
  assert.equal(typeof registered[1].Component, 'function', '会话页快捷入口必须能渲染')
  assert.equal(typeof registered[0].spec.label, 'function')
  assert.equal(registered[0].spec.label(), '开发工作站')

  // 图标是可渲染的 svg（owner 传 size/active），页面壳在未加载数据时也要能渲染
  const icon = renderToStaticMarkup(h(registered[0].Component, { size: 18, active: true }))
  assert.match(icon, /<svg/)
  assert.match(icon, /viewBox="0 0 24 24"/)
  assert.match(icon, /M7 11\.5l2\.6-2\.6/)
  const page = renderToStaticMarkup(h(registered[1].Component))
  assert.match(page, /开发工作站/)
})

test('表单里的主按钮必须是 submit 类型（否则点“保存并探测”毫无反应）', async () => {
  // Button 固定 type="button"，表单必须用 SubmitButton
  const button = renderToStaticMarkup(h(common.Button, { primary: true }, '保存'))
  assert.match(button, /type="button"/)
  const submit = renderToStaticMarkup(h(common.SubmitButton, null, '保存并探测环境'))
  assert.match(submit, /type="submit"/)

  const source = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const form = source.slice(source.indexOf("h('form'"), source.indexOf("h('form'") + 900)
  assert.match(form, /SubmitButton/, '表单内必须使用 SubmitButton')
  assert.doesNotMatch(form, /h\(Button,\s*\{[^}]*children: busy \? '探测中…'/, '表单内不要用普通 Button 当提交按钮')
})

test('工作站开启开发会话：新会话 + Context Pack 入队 + 切过去', async () => {
  const calls = []
  const opened = []
  let released = false
  const ctx = {
    get(name) {
      if (name === 'sessions') {
        return {
          create: async (opts) => {
            calls.push(['create', opts])
            return 'session-9'
          },
          retain: (id, opts) => {
            calls.push(['retain', id, opts])
            return {
              ready: Promise.resolve({
                session: {
                  prompt: async (parts, mode) => {
                    calls.push(['prompt', parts, mode])
                    return { ok: true, value: { accepted: true } }
                  },
                },
              }),
              release() { released = true },
            }
          },
        }
      }
      if (name === 'uiWorkspace') return { openSession: (id) => opened.push(id) }
      return undefined
    },
  }

  const result = await client.launchDevSession(ctx, { cwd: '/repo', prompt: 'CONTEXT' })
  assert.deepEqual(result, { sessionId: 'session-9', sent: true, continued: false })
  assert.deepEqual(calls[0], ['create', { cwd: '/repo' }])
  assert.deepEqual(calls.at(-1), ['prompt', [{ type: 'text', text: 'CONTEXT' }], 'queue'])
  assert.deepEqual(opened, ['session-9'])
  assert.equal(released, true)
})

test('会话控制器不可用时退化为带草稿的新会话', async () => {
  const startCalls = []
  const ctx = {
    get(name) {
      if (name === 'sessions') return { create: async () => { throw new Error('no controller') } }
      if (name === 'uiWorkspace') {
        return { startSession: (workspaceId, options) => startCalls.push([workspaceId, options]) }
      }
      return undefined
    },
  }
  const result = await client.launchDevSession(ctx, { cwd: '/repo', prompt: 'PACK' })
  assert.deepEqual(result, { sessionId: null, sent: false, continued: false })
  assert.deepEqual(startCalls, [[undefined, { prompt: 'PACK', whenDraftExists: 'replace' }]])
})

test('首条消息把会话钉在 Context Pack 与规范上', () => {
  const prompt = client.launchPrompt('【目标】x', { id: 'gerrit-hook', title: 'Gerrit webhook' })
  assert.match(prompt, /DevHub 开发工作站启动的开发会话/)
  assert.match(prompt, /Gerrit webhook（gerrit-hook）/)
  assert.match(prompt, /【项目约束】是本次开发的硬规则/)
  assert.match(prompt, /devhub_get/)
  assert.match(prompt, /【阶段边界】/)
  assert.match(prompt, /不要运行本机自测/)
  assert.match(prompt, /【目标】x$/)
})


test('工作站继续已有会话：发回同一会话并切过去，而不是从零开始', async () => {
  const calls = []
  const opened = []
  const ctx = {
    get(name) {
      if (name === 'sessions') {
        return {
          create: async () => { throw new Error('不应新建会话') },
          retain: (id) => {
            calls.push(['retain', id])
            return {
              ready: Promise.resolve({
                session: {
                  prompt: async (parts, mode) => { calls.push(['prompt', parts, mode]); return { ok: true } },
                },
              }),
              release() { calls.push(['release']) },
            }
          },
        }
      }
      if (name === 'uiWorkspace') return { openSession: (id) => opened.push(id) }
      return undefined
    },
  }
  const result = await client.launchDevSession(ctx, { cwd: '/repo', prompt: 'PACK', continueSessionId: 'session-old' })
  assert.deepEqual(result, { sessionId: 'session-old', sent: true, continued: true })
  assert.deepEqual(calls[0], ['retain', 'session-old'])
  assert.deepEqual(calls.at(-1), ['release'])
  assert.deepEqual(opened, ['session-old'])
})

test('开发工作站新建/接管的会话默认写入完全权限，避免仓库外写入反复卡授权', async () => {
  const modes = []
  const ctx = {
    get(name) {
      if (name === 'sessions') {
        return {
          create: async () => 'session-perm',
          retain: () => ({
            ready: Promise.resolve({
              session: {
                append: (type, data) => modes.push([type, data]),
                prompt: async () => ({ ok: true }),
              },
            }),
            release() {},
          }),
        }
      }
      return undefined
    },
  }
  await client.launchDevSession(ctx, { cwd: '/repo', prompt: 'P', open: false })
  assert.deepEqual(modes[0], ['sandbox/mode', { mode: 'danger-full-access' }])
})

test('继续失败（会话已归档）时退化为新建，并说明原因', async () => {
  const created = []
  const ctx = {
    get(name) {
      if (name === 'sessions') {
        return {
          create: async () => { created.push('create'); return 'session-new' },
          retain: (id) => ({
            ready: id === 'session-gone'
              ? Promise.reject(new Error('session not found'))
              : Promise.resolve({ session: { prompt: async () => ({ ok: true }) } }),
            release() {},
          }),
        }
      }
      if (name === 'uiWorkspace') return { openSession: () => {} }
      return undefined
    },
  }
  const result = await client.launchDevSession(ctx, { cwd: '/repo', prompt: 'PACK', continueSessionId: 'session-gone' })
  assert.equal(result.sessionId, 'session-new')
  assert.equal(result.continued, false)
  assert.match(result.continueFailed, /session not found/)
  assert.deepEqual(created, ['create'])
})

test('回归：launchDevSession / launchPrompt 必须有本地绑定（export ... from 不产生绑定）', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(source, /import\s*\{[^}]*launchDevSession[^}]*\}\s*from\s*'\.\/session\.mjs'/, '必须 import 进来，不能只 export ... from')
  assert.match(source, /import\s*\{[^}]*launchPrompt[^}]*\}\s*from\s*'\.\/session\.mjs'/)
  // 调用点至少有「开启开发会话」这条路径会用到
  assert.match(source, /launchDevSession\(ctx/)
})

test('回归：ItemEditor 必须从 props 接收 ctx（否则渲染时 ReferenceError → 白屏）', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const signature = source.match(/function ItemEditor\(\{([^}]*)\}\)/)
  assert.ok(signature, '找不到 ItemEditor 定义')
  assert.match(signature[1], /\bctx\b/, 'ItemEditor 必须在解构里接住 ctx')
  // 用到 ctx 的地方要在 ItemEditor 内部（SessionLogPanel 的传参）
  assert.match(source, /h\(SessionLogPanel, \{\s*ctx,/s)
})

test('兜底：渲染抛错时显示错误卡而不是白屏', async () => {
  const { DevHubBoundary } = await import('../src/client/error-boundary.mjs')
  // 没有错误时透传 children
  const instance = new DevHubBoundary({ children: 'ok' })
  instance.state = { error: null }
  assert.equal(instance.render(), 'ok')
  // 有错误时渲染错误卡，且包含原始信息
  instance.state = { error: new Error('boom') }
  const { renderToStaticMarkup } = await import('react-dom/server')
  const html = renderToStaticMarkup(instance.render())
  assert.match(html, /开发工作站渲染出错/)
  assert.match(html, /boom/)
  assert.equal(typeof DevHubBoundary.getDerivedStateFromError(new Error('x')), 'object')
})

test('渲染冒烟：流程详情整块能渲染（含内嵌会话面板），不会因未定义变量白屏', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { ItemEditor } = await import('../src/client/index.mjs')
  const { sanitizeItem } = await import('../src/core/store.mjs')

  const item = sanitizeItem({
    id: 'render-check',
    title: '渲染冒烟流程',
    goal: '验证详情页能渲染',
    acceptance: ['能渲染'],
    scope: ['src/main/java/x'],
    workflow: {
      rootProblem: '白屏',
      entry: 'chat',
      techDoc: { decision: 'none' },
      plan: { summary: '计划', steps: ['一步'], estimate: { size: 'M', days: 2 } },
    },
    session: { id: 'session-x', boundAt: '2026-11-11T00:00:00.000Z' },
  })

  const ctx = { get: () => undefined }
  const html = renderToStaticMarkup(h(ItemEditor, {
    item,
    ctx,
    session: { sessionId: 'session-x', alive: true, running: false, turns: 3, lastStage: 'ended', idleSeconds: 60 },
    onBack() {}, onSaved() {}, onContext() {}, onStarted() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
  assert.match(html, /渲染冒烟流程/)
  assert.match(html, /关联会话/)
  assert.match(html, /开发会话动态/)
  // 已绑定会话：主按钮是轻量「继续推进」，整包上下文重发降级到「更多」
  assert.match(html, /继续推进/)
  assert.doesNotMatch(html, /继续开发会话/)
  assert.match(html, /重发最新上下文/)
  // 首屏进度摘要：任务、测试、还差什么一眼可见；会话动态默认收起
  assert.match(html, /开发任务进度/)
  assert.match(html, /开发会话动态（默认收起/)
  assert.match(html, /开发任务|开发中/)
  // 概览页变更文件自动刷新：停留时每 8 秒静默拉一次，不要求手动点刷新
  assert.match(html, /自动刷新|每 8 秒自动刷新/)
  // 顶栏：报告随时可预览；低频的生成上下文收进「更多」；不会再出现记录 baseline 按钮
  assert.match(html, /预览报告/)
  assert.doesNotMatch(html, /记录 baseline/)
  assert.doesNotMatch(html, /生成上下文/)
})


test('渲染：风险/阻塞每行一个勾选框，勾选＝已知晓，数量与上方「下一步」联动', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { ItemEditor } = await import('../src/client/index.mjs')
  const { sanitizeItem } = await import('../src/core/store.mjs')

  const item = sanitizeItem({
    id: 'risk-check',
    title: '风险勾选',
    goal: '勾选即知晓',
    acceptance: ['能勾'],
    scope: ['src/x'],
    risks: ['依赖外部系统', '缺少回滚方案'],
    riskAcks: ['依赖外部系统'],
    workflow: {
      rootProblem: '风险没人确认',
      techDoc: { decision: 'none' },
      plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1 } },
    },
  })
  const html = renderToStaticMarkup(h(ItemEditor, {
    item,
    ctx: { get: () => undefined },
    session: null,
    onBack() {}, onSaved() {}, onContext() {}, onStarted() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
  // 每条风险一个 checkbox；已勾选的标「已知晓」，未勾选的标「待处理」
  assert.equal((html.match(/type="checkbox"/g) ?? []).length >= 2, true)
  assert.match(html, /依赖外部系统/)
  assert.match(html, /缺少回滚方案/)
  assert.match(html, /已知晓/)
  assert.match(html, /待处理/)
  assert.match(html, /已知晓 1\/2/)
  // 上方「下一步」联动：待处理 1 个，建议卡也说 1 个
  assert.match(html, /1 个风险待处理/)
  assert.match(html, /处理 1 个风险\/阻塞/)
})

test('回归：风险勾选直接落盘，删掉风险行会清掉孤儿勾选', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /async function toggleRiskAck\(text\)/)
  assert.match(index, /draft\.riskAcks/)
  assert.match(index, /勾选＝同意并知晓/)
  // 点「处理风险」应滚到勾选列表，而不是自动进文本编辑态
  const riskAt = index.indexOf("if (action === 'edit-risks')")
  const step = index.slice(riskAt, riskAt + 700)
  assert.doesNotMatch(step, /beginEdit\('risks'\)/)

  const { sanitizeItem } = await import('../src/core/store.mjs')
  const item = sanitizeItem({ id: 'risk-acks', title: 't', risks: ['A', 'B'], riskAcks: ['A', '已删除的风险', 'A'] })
  assert.deepEqual(item.risks, ['A', 'B'])
  assert.deepEqual(item.riskAcks, ['A'])
})

test('回归：测试命令分两层——项目命令进仓库，本机命令只存本机并可一句话生成', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /项目命令（提交到 \.dev-hub\/project\.json）/)
  assert.match(index, /本机命令（只在这台电脑生效，不提交）/)
  assert.match(index, /localCommands: state\.localCommands \?\? \{\}/)
  // 保存本机命令只发 localCommands，不会顺手改写项目命令
  assert.match(index, /JSON\.stringify\(\{ localCommands: local \}\)/)
  // 一句话生成：调 Host 的探测动作，结果只填入、不执行
  assert.match(index, /action: 'suggest-local-command'/)
  assert.match(index, /已把建议命令填入/)
  assert.match(index, /不会自动执行/)
  const host = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
  assert.match(host, /body\.action === 'suggest-local-command'/)
  assert.match(host, /probeLocalCommand\(repo, command\)/)
  assert.match(host, /setProfileForRepo\(profile, repo, \{ localCommands: next \}/)
})

test('渲染：测试命令分两层，本机覆盖与一句话生成入口都能看到', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { ProjectCommands } = await import('../src/client/index.mjs')
  const html = renderToStaticMarkup(h(ProjectCommands, {
    project: {
      context: {
        commands: {
          localTest: 'mvn -o clean test',
          environmentTest: 'sh scripts/sit.sh',
          gate: 'sh scripts/check.sh --full',
        },
      },
    },
    localCommands: { localTest: 'mvn -o clean test -DskipITs' },
    onSaved() {},
  }))
  assert.match(html, /项目命令（提交到/)
  assert.match(html, /本机命令（只在这台电脑生效，不提交）/)
  assert.match(html, /mvn -o clean test -DskipITs/)
  assert.match(html, /留空则用项目命令：mvn -o clean test/)
  assert.match(html, /用一句话生成本机命令/)
  assert.match(html, /让 DSH 生成命令/)
  assert.match(html, /不会自动执行/)
})

test('渲染：没绑定会话但有进展/测试记录时，提示「台账是 Agent 直接写入」，不再像状态错乱', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { ItemEditor } = await import('../src/client/index.mjs')
  const { sanitizeItem } = await import('../src/core/store.mjs')

  const item = sanitizeItem({
    id: 'evidence-no-session',
    title: '有进展没会话',
    goal: '解释清楚状态',
    acceptance: ['能渲染'],
    workflow: {
      rootProblem: '台账被直接写入',
      techDoc: { decision: 'none' },
      plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1 } },
      tests: { local: { status: 'passed', command: 'npm test' }, environment: { status: 'not_run' } },
    },
  })
  const html = renderToStaticMarkup(h(ItemEditor, {
    item,
    ctx: { get: () => undefined },
    session: null,
    onBack() {}, onSaved() {}, onContext() {}, onStarted() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
  assert.match(html, /台账有进展，但没有绑定开发会话/)
  assert.match(html, /Agent 直接写入台账/)
  assert.match(html, /开启开发会话/)
})

test('回归：状态与阶段文案相同时只显示一次，不再并排重复', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // 开发中/已完成等状态与阶段同义时，只保留 StatusPill；阶段文案不同才追加 Tag
  assert.match(index, /const showStageTag = stageLabelText !== statusLabelText/)
  assert.match(index, /showStageTag \? h\(Tag, \{ tone: 'neutral' \}, stageLabelText\) : null/)
  // 「流程」卡片的当前阶段已经由阶段条高亮表达，不再额外挂一个同文案 Tag
  const flowCard = index.slice(index.indexOf("styles.sectionTitle }, '流程'"), index.indexOf('h(ArrowSteps'))
  assert.ok(flowCard.length > 0)
  assert.doesNotMatch(flowCard, /STAGE_LABELS\[stage\]/)
  // 首页列表行同理：状态与阶段同义时只留 StatusPill
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(home, /const showStageTag = stageLabel !== statusLabel/)
  assert.match(home, /showStageTag \? h\(Tag, \{ tone: 'neutral' \}, stageLabel\) : null/)
})

test('新建开发流程弹窗里不再有第二个「关闭」（外层 Modal 已提供）', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { NewFlowWizard } = await import('../src/client/wizard.mjs')
  const html = renderToStaticMarkup(h(NewFlowWizard, { state: { repo: { name: 'demo' } }, onClose() {}, onCreated() {} }))
  assert.match(html, /新建开发流程/)
  assert.doesNotMatch(html, /关闭/, '向导内部不应再有「关闭」按钮')
})

test('渲染冒烟：流程详情进入后先是「下一步」对话（状态 + 建议 + 输入框）', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { ItemEditor } = await import('../src/client/index.mjs')
  const { sanitizeItem } = await import('../src/core/store.mjs')

  const item = sanitizeItem({
    id: 'next-step-check',
    title: '下一步对话',
    goal: '进入流程先问要不要推进',
    acceptance: ['能问'],
    scope: ['src/x'],
    tasks: [{ text: 'a', done: true }, { text: 'b', done: false }],
    workflow: {
      rootProblem: '不知道下一步做什么',
      plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1 } },
      techDoc: { decision: 'none' },
    },
  })
  const html = renderToStaticMarkup(h(ItemEditor, {
    item,
    ctx: { get: () => undefined },
    session: null,
    onBack() {}, onSaved() {}, onContext() {}, onStarted() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
  assert.match(html, /下一步/)
  assert.match(html, /开发任务 1\/2/)
  assert.match(html, /开启开发会话/)
  assert.match(html, /发送/)
  assert.match(html, /工作站会判断这句话是补台账、发开发会话/)
  assert.match(html, /用一句话补充或纠偏/)
})

test('回归：工作站要记住"切走时的页面"（页签 + 上次打开的流程）', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // 页签：初始化读留存、切换写留存
  assert.match(source, /const saved = loadLastTab\(\) \?\? 'flows'/)
  assert.match(source, /saveLastTab\(next\)/)
  // 流程详情：加载后按仓库恢复、变化即保存
  assert.match(source, /loadPanelState\(repoPath\)/)
  assert.match(source, /savePanelState\(repoPath, \{ selectedId: selected/)
})

test('回归：插件版本与 package.json 一致（provenance 要记录正确版本）', async () => {
  const { readFile } = await import('node:fs/promises')
  const { pluginVersion } = await import('../src/core/provenance.mjs')
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pluginVersion(), pkg.version)
})

test('回归：计划校验（repro）在详情页有入口，且建流程时带上结构化答案', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /api\(API\.repro, \{ method: 'POST'/)
  assert.match(index, /计划与输入一致|计划需要校验/)
  const flow = await readFile(new URL('../src/client/chat-flow.mjs', import.meta.url), 'utf8')
  assert.match(flow, /answers: plan\.answers \?\? \{\}/)
})

test('回归：下一步建议点下去必须有可见反应（风险滚到勾选列表，计划进编辑态并滚动）', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // 风险区是勾选列表：切页签 + 滚过去即可，不能自动进编辑态（编辑态是改风险文本）
  assert.match(source, /action === 'edit-risks'[\s\S]{0,200}scrollToId\('devhub-risks'/)
  assert.doesNotMatch(source.slice(source.indexOf("action === 'edit-risks'"), source.indexOf("action === 'edit-plan'")), /beginEdit\('risks'\)/)
  assert.match(source, /action === 'edit-plan'[\s\S]{0,160}beginEdit\('plan'\)[\s\S]{0,120}scrollToId\('devhub-plan'/)
  // 区块必须有可滚动的 id
  assert.match(source, /id: 'devhub-risks'/)
  assert.match(source, /id: 'devhub-plan'/)
})

test('回归：客户端不得使用 window.prompt（Electron 不弹窗 → 点了没反应）', async () => {
  const { readdir, readFile } = await import('node:fs/promises')
  const dir = new URL('../src/client/', import.meta.url)
  const files = (await readdir(dir)).filter((name) => name.endsWith('.mjs'))
  const offenders = []
  for (const name of files) {
    const source = await readFile(new URL(name, dir), 'utf8')
    // 注释里提到 window.prompt 不算
    const code = source.split('\n').filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n')
    if (/window\.prompt\s*\(/.test(code)) offenders.push(name)
  }
  assert.deepEqual(offenders, [], `这些文件还在用 window.prompt：${offenders.join('、')}`)
})

test('回归：文件说明用行内编辑（不依赖原生弹窗）', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(source, /noteEdit/)
  assert.match(source, /placeholder: '一句话说明这个文件改了什么、为什么改'/)
})

test('回归：详情页有真正的「删除这个流程」入口（不是只写说明）', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(source, /删除这个流程/)
  assert.match(source, /API\.deleteItem/)
  assert.match(source, /onDeleted/)
  assert.doesNotMatch(source, /当前 Host 尚未暴露删除接口/)
})

test('回归：删除流程按钮必须是危险色（红色标识）', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const index = source.indexOf('删除这个流程')
  assert.ok(index > 0)
  // 删除按钮的样式里要用 T.danger（红）
  const around = source.slice(Math.max(0, index - 1600), index + 100)
  assert.match(around, /T\.danger/, '删除按钮的样式应使用危险色')
  assert.match(around, /T\.dangerSoft/, '背景用淡红')
})

test('回归：聊天页接入多轮需求澄清（卡片 + 继续澄清 + 生成计划）', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /需求澄清 · 第/)
  assert.match(chat, /API\.clarify/)
  assert.match(chat, /MAX_CLARIFY_ROUNDS/)
  assert.match(chat, /生成计划/)
})

test('回归：需求澄清要有进度反馈、已提交卡片锁死、聊天框不再有整条灰线', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  // 进度：消息流里的打字气泡（动作名 + 已用秒数 + 三个点）
  assert.match(chat, /正在结合仓库证据整理问题/)
  assert.match(chat, /devhub-typing-dot/)
  assert.match(chat, /\$\{progress\.seconds\}s/)
  // 已提交：resolved 锁 + 防重复提交
  assert.match(chat, /if \(clarifyBusy \|\| card\?\.resolved\) return/)
  assert.match(chat, /已提交/)
  assert.match(chat, /resolved: true/)
  // 恢复时：有 plan 之后旧卡片一律锁死
  assert.match(chat, /const hasPlan = restored\.some/)
  // 聊天框：footer 不再有整条 border-top
  assert.doesNotMatch(chat, /footer: \{[^}]*borderTop/s)
})

test('回归：澄清上下文要能跨刷新续聊（描述兜底、不因缺失直接失败）', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /function originDescription/)
  assert.match(chat, /clarifyOrigin/)
  assert.match(chat, /conversation\?\.clarify/)
  // 恢复旧数据：只有卡片时补出 clarify 上下文
  assert.match(chat, /兼容旧数据：只有卡片、没有 clarify 上下文时/)
})

test('回归：已提交的澄清卡按"问题在上、答案在下"排，长问题不再把答案挤成竖排', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  const start = chat.indexOf('// 问题一行、答案一行')
  assert.ok(start > 0, '找不到已提交澄清卡的摘要行渲染')
  const block = chat.slice(start, chat.indexOf('specRows.length', start))
  // 每行是纵向布局：先问题、再答案；不能再用 flex 横排（长问题会把答案压成一字宽）
  assert.match(block, /flexDirection: 'column'/)
  assert.doesNotMatch(block, /display: 'flex', gap: 8, alignItems: 'baseline'/)
  assert.match(block, /row\.question/)
  assert.match(block, /row\.answer/)
})

test('回归：澄清卡「流程标题」是受控输入，MessageRow 必须传 clarifyTitle/onChange', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  // 漏传这两个 prop 会让 input 的 value 永远是空、onChange 是 undefined → 打字被“冲掉”
  assert.match(chat, /clarifyTitle,\s*\n\s*onClarifyTitleChange: \(value\) => \{\s*\n\s*setTitleTouched\(true\)\s*\n\s*setClarifyTitle\(value\)/)
  // 输入框本身仍然是受控绑定
  assert.match(chat, /value: title \?\? ''/)
  assert.match(chat, /onChange: \(event\) => onTitleChange\?\.\(event\.target\.value\)/)
  // 切走/刷新要恢复用户改过的标题，不能被空值覆盖
  assert.match(chat, /setClarifyTitle\(String\(conversation\?\.clarifyTitle \|\| conversation\?\.clarify\?\.title \|\| ''\)\)/)
  assert.match(chat, /titleTouched, job \}, scope\)/)
})

test('回归：澄清卡已提交时只回看不对齐输入框，重复用户消息会被去重', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  // resolved 分支：直接 return 摘要视图，不再渲染 input/chip
  assert.match(chat, /if \(resolved\) \{/)
  assert.match(chat, /这一轮已经提交，可以继续补充，或直接生成计划/)
  // 相邻重复用户消息去重
  assert.match(chat, /function visibleMessages\(\)/)
  assert.match(chat, /visibleMessages\(\)\.map/)
})

test('回归：聊天布局 agent 左对齐、用户右对齐，消息区不再居中窄栏', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /stationRow: \{ display: 'flex', justifyContent: 'flex-start'/)
  assert.match(chat, /userRow: \{ display: 'flex', justifyContent: 'flex-end'/)
  // 与输入框同宽（780，对齐 DSH 对话栏）居中，左右对齐发生在同一栏内
  assert.match(chat, /canvas: \{ width: '100%', maxWidth: 780/)
  assert.match(chat, /alignItems: 'center'/)
})

test('细节：用户气泡悬停显示时间、agent 回复有打字气泡', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /devhub-msg-time/)
  assert.match(chat, /devhub-msg:hover .devhub-msg-time/)
  assert.match(chat, /@keyframes devhub-typing/)
  assert.match(chat, /progress\?\.seconds/)
})

test('回归：消息必须渲染在与输入框同宽的 canvas 容器里', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  // renderBody 里必须有 S.canvas 包裹消息（只有 maxWidth 常量、没有实际使用 = 宽度失控）
  const body = chat.slice(chat.indexOf('style: S.body'))
  assert.match(body.slice(0, 600), /style: S\.canvas/)
  assert.match(chat, /canvas: \{ width: '100%', maxWidth: 780/)
})

test('回归：右侧详情栏打开时，输入框仍与消息列同轴（不能按整页宽度居中）', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  // 聊天列 = 消息区 + 输入区；右栏是聊天列的同级。否则右栏会把消息列挤窄，
  // 而 footer 仍按整页宽度居中，输入框会相对消息列偏移半个右栏宽（本次线上问题）。
  const shell = chat.slice(chat.indexOf("return h('div', { style: S.root, onPaste"))
  const rowAt = shell.indexOf('style: S.row')
  const chatColAt = shell.indexOf('style: S.chatCol')
  const bodyAt = shell.indexOf('renderBody()')
  const footerAt = shell.indexOf('style: S.footer')
  const sideAt = shell.indexOf('renderSide()')
  assert.ok(rowAt >= 0, '最外层要有横向排列的 row')
  assert.ok(chatColAt > rowAt, 'row 内要有聊天列')
  assert.ok(bodyAt > chatColAt, '消息区要在聊天列内')
  assert.ok(footerAt > bodyAt, '输入区要在聊天列内、消息区之后')
  assert.ok(sideAt > footerAt, '右侧详情栏必须是聊天列的同级（footer 之后）')
  assert.match(chat, /chatCol: \{ display: 'flex', flexDirection: 'column'/)
  // 聊天根不再用 height:100%（会与页头叠加把底部输入区顶出可视区），靠 flex 拿剩余高度
  assert.match(chat, /root: \{ \.\.\.styles\.page, height: 'auto', flex: '1 1 auto', minHeight: 0 \}/)
})

test('回归：项目卡片支持移除，失效路径显示红标且不可切换', async () => {
  const { readFile } = await import('node:fs/promises')
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(home, /路径不存在/)
  assert.match(home, /onRemove\?\.\(path\)/)
  assert.match(home, /从列表移除这个项目/)
  assert.match(home, /repoCards/)
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /API\.removeRepo/)
})

test('回归：切走后回来会续跑扫描/澄清（不再显示"中断"）', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /自动重新扫描/)
  assert.match(chat, /已自动接着问/)
  assert.match(chat, /kind: 'recon'/)
  assert.match(chat, /kind: 'clarify'/)
  assert.match(chat, /resumeTriedRef/)
})

test('回归：输出过程中用户往上翻，不应被自动拽回底部（贴底才跟随）', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /stickRef/)
  assert.match(chat, /if \(!stickRef\.current\) return/)
  assert.match(chat, /function onBodyScroll\(\)/)
  assert.match(chat, /onScroll: onBodyScroll/)
})

test('回归：变更说明由 agent 自动补充（用户只做纠偏）', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(source, /API\.genFileNotes/)
  assert.match(source, /正在由 agent 补充说明/)
  assert.match(source, /notesTriedRef/)
  assert.match(source, /'agent'/)
})

test('回归：澄清阶段总结的标题会作为流程标题带进创建', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /clarifyTitle/)
  assert.match(chat, /plan\.name = currentTitle\(\)/)
  assert.match(chat, /流程标题/)
  // 用户改过标题后，agent 再返回标题不覆盖
  assert.match(chat, /titleTouched/)
})

test('回归：内嵌会话可读（工具时间线/折叠长文），开发到测试有"推进"入口', async () => {
  const { readFile } = await import('node:fs/promises')
  const panel = await readFile(new URL('../src/client/session-log.mjs', import.meta.url), 'utf8')
  assert.match(panel, /function TimelineRow/)
  assert.match(panel, /item\.kind === 'tool'/)
  assert.match(panel, /执行中/)
  assert.match(panel, /展开全文/)
  assert.doesNotMatch(panel, /消息直接发到这条开发会话/)
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /推进到验证/)
  assert.match(index, /devhub-submit/)
  assert.match(index, /查看失败输出/)
})

test('回归：角标 / 进行中抽屉 / 需你处理标签都存在', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /attentionCount/)
  assert.match(index, /function FlowDrawer/)
  assert.match(index, /需要你处理/)
  assert.match(index, /进行中 \$\{/)
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(home, /item\?\.attention/)
})

test('技能页：已有规范的前端仓库能看到并一键补装前端原型规范', async () => {
  const { SkillsPanel } = await import('../src/client/skills.mjs')
  const view = {
    firstRun: false,
    profile: 'node',
    frontend: true,
    frameworks: ['react', 'react-dom'],
    path: '.dev-hub/conventions.json',
    installed: [
      { id: 'core-discipline', name: '通用开发纪律', level: 'L0', constraints: 4, installedAt: null },
    ],
    catalog: [
      { id: 'core-discipline', name: '通用开发纪律', level: 'L0', description: '纪律', appliesTo: ['node'], autoInstall: [], constraints: 4, installed: true },
      { id: 'frontend-ui', name: '前端原型设计规范', level: 'L1', description: '家族化规范', appliesTo: ['node', 'java'], autoInstall: ['frontend'], constraints: 11, installed: false },
    ],
    constraints: [],
  }
  const html = renderToStaticMarkup(h(SkillsPanel, { initialRepo: { name: 'web' }, initialView: view }))
  assert.match(html, /node · react \/ react-dom/)
  assert.match(html, /检测到前端框架（react \/ react-dom）/)
  assert.match(html, /建议补装前端原型规范/)
  assert.match(html, /安装 前端原型设计规范/)
  assert.match(html, /推荐安装/)
})

test('技能页：非前端仓库 / 首次生成不显示补装入口', async () => {
  const { SkillsPanel } = await import('../src/client/skills.mjs')
  const base = {
    firstRun: false,
    profile: 'node',
    path: '.dev-hub/conventions.json',
    installed: [],
    constraints: [],
    catalog: [
      { id: 'frontend-ui', name: '前端原型设计规范', level: 'L1', description: '', appliesTo: ['node'], autoInstall: ['frontend'], constraints: 11, installed: false },
    ],
  }
  const backend = renderToStaticMarkup(h(SkillsPanel, {
    initialRepo: { name: 'cli' },
    initialView: { ...base, frontend: false, frameworks: [] },
  }))
  assert.doesNotMatch(backend, /建议补装前端原型规范/)

  const firstRun = renderToStaticMarkup(h(SkillsPanel, {
    initialRepo: { name: 'web' },
    initialView: { ...base, firstRun: true, frontend: true, frameworks: ['vue'] },
  }))
  assert.doesNotMatch(firstRun, /建议补装前端原型规范/)
})

test('回归：变更文件数量按"当前可见（默认 scope 内）"统计，并排除台账', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /visible\.length === totals\.files/)
  assert.match(index, /含 scope 外/)
  assert.match(index, /已排除 \$\{filesInfo\.excludedCount\} 个工作站台账文件/)
  assert.match(index, /统计口径：baseline 以来的提交/)
})

test('回归：变更区默认展开 1~5 个关键改动（模型优先），并保留完整变更文件列表', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /from '\.\/key-files\.mjs'/)
  assert.match(index, /pickKeyFiles\(visible, KEY_FILE_LIMIT\)/)
  assert.match(index, /默认展开 \$\{picks\.length\} 个：数据库模型 \/ 接口契约 \/ 配置优先/)
  assert.match(index, /关键改动/)
  assert.match(index, /完整 diff/)
  assert.match(index, /← 关键改动/)
  // 自动拉 diff 按文件指纹去重：8 秒轮询不会反复请求
  assert.match(index, /keyDiffsRef\.current\.fingerprint/)
  assert.match(index, /filesInfo, onlyScope, item\?\.id/)
  // 卡片头用固定列对齐：分类 / 状态 / 路径 / 行数 / 操作，避免每行参差
  assert.match(index, /gridTemplateColumns: '88px 52px minmax\(0, 1fr\) 78px 64px'/)
  assert.match(index, /textAlign: 'right', whiteSpace: 'nowrap'/)
  // 关键改动全部展开（不内部滚动），左侧列表占满等高；概览卡吸底
  assert.doesNotMatch(index, /maxHeight: 460, overflowY: 'auto'/)
  assert.match(index, /flex: '1 1 auto', minHeight: 0, overflowY: 'auto'/)
  assert.match(index, /共 \$\{visible\.length\} 个文件/)
  assert.match(index, /marginTop: 'auto'/)
})

test('回归：授权/审批要在流程里可见（等待授权标签 + 去会话处理入口）', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /会话在等待授权 \/ 审批/)
  assert.match(index, /去会话处理/)
  assert.match(index, /pendingApprovals/)
})

test('回归：提交必须选分支并真正推送，台账一起提交，失败可重试推送', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /基于当前分支推送/)
  assert.match(index, /新建分支后推送/)
  assert.match(index, /提交并推送/)
  assert.match(index, /重试推送/)
  assert.match(index, /提交后会立即执行 git push/)
  assert.doesNotMatch(index, /提交后立即 git push',/)
  // 提交前自动补齐模板验收项，避免到了推送环节才被 Host 门禁拒绝
  assert.match(index, /async function runPendingChecksBeforeSubmit/)
  assert.match(index, /!pushOnly && !\(await runPendingChecksBeforeSubmit\(\)\)/)
  assert.match(index, /postAllowingFailure\(API\.check, \{ id: draft\.id, checkId: check\.id \}\)/)
})

test('回归：会话动作只保留一个（开启/继续推进），重发上下文收进「更多」', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // 头部只允许一个主会话按钮（按按钮文案定位，避免命中前面的 renderSession 定义）
  const start = index.indexOf("advance.label || '继续推进'")
  assert.ok(start > 0, '头部应有开启/继续推进按钮')
  const header = index.slice(start, start + 400)
  assert.doesNotMatch(header, /新建开发会话/)
  // 继续推进必须是轻量消息：不重发 Context Pack、不记 baseline、不弹确认
  const continueStart = index.indexOf('async function continueDev()')
  assert.ok(continueStart > 0, '缺少轻量继续实现 continueDev')
  const body = index.slice(continueStart, index.indexOf('async function', continueStart + 10))
  assert.match(body, /sendToDeveloperSession\(boundId, continuePrompt\(/)
  assert.doesNotMatch(body, /launchPrompt|API\.start|window\.confirm/)
  // 重发整包上下文降为「更多」里的低频动作
  assert.match(index, /重发最新上下文/)
  assert.match(index, /resync/)
  // 「进入会话」不再出现在关联会话区，也不出现在流程列表：
  // 开发统一走工作站标准流程，不鼓励用户绕过流程直接介入对话。
  assert.doesNotMatch(index, /children: '进入会话'/)
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(home, /children: '进入会话'/)
  assert.doesNotMatch(home, /onOpenSession/)
  // 新建会话收进「更多」
  assert.match(index, /换一条开发会话/)
})

test('回归：会话运行中主按钮变成禁用的「正在开发…」，不再提供继续推进；评审可确认覆盖', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /const sessionRunning = Boolean\(draft\.session\?\.id\) && Boolean\(session\?\.running \?\? draft\.running\)/)
  assert.match(index, /disabled: busy \|\| Boolean\(launchBusy\) \|\| reviewBusy \|\| advance\.disabled \|\| \(sessionRunning && !reviewAction\)/)
  assert.match(index, /开发会话还在运行。现在开始评审可能读到半成品代码/)
  assert.match(index, /sessionRunning && reviewAction/)
  assert.match(index, /advance\.label \|\| '评审'/)
  assert.match(index, /sessionRunning\s*\?\s*\[h\(Spinner/)
  // 顶栏按钮不参与收缩：标题/标签再长也不会把「正在开发…」挤成和旁边按钮重叠
  assert.match(index, /gap: T\.gap\.sm, flexWrap: 'wrap', flex: '0 0 auto' \}/)
  assert.match(index, /display: 'inline-flex',[\s\S]{0,160}?minWidth: 104,[\s\S]{0,80}?flex: '0 0 auto'/)
  assert.match(index, /开发会话正在工作：等当前这步结束再继续推进/)
  // 防御：即使状态还没刷新，continueDev 也不在运行中重复排队
  const start = index.indexOf('async function continueDev()')
  const body = index.slice(start, index.indexOf('async function', start + 10))
  assert.match(body, /if \(session\?\.running\)/)
  assert.match(body, /等当前这步结束再继续推进/)

  const { renderToStaticMarkup } = await import('react-dom/server')
  const { ItemEditor } = await import('../src/client/index.mjs')
  const { sanitizeItem } = await import('../src/core/store.mjs')
  const item = sanitizeItem({
    id: 'running-flow',
    title: '运行中的流程',
    goal: '正在开发时不该出现继续推进',
    acceptance: ['能渲染'],
    workflow: {
      rootProblem: '运行时重复推进',
      techDoc: { decision: 'none' },
      plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1 } },
    },
    session: { id: 'session-running', boundAt: '2026-11-12T00:00:00.000Z' },
  })
  const html = renderToStaticMarkup(h(ItemEditor, {
    item,
    ctx: { get: () => undefined },
    session: { sessionId: 'session-running', alive: true, running: true, turns: 2, lastStage: 'step' },
    onBack() {}, onSaved() {}, onContext() {}, onStarted() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
  assert.match(html, /title="开发会话正在工作：等当前这步结束再继续推进"/)
  assert.doesNotMatch(html, />继续推进</)
})

test('回归：会话错误卡片只代表最近一轮，并提供去会话处理入口', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /开发会话本轮失败/)
  assert.match(index, /只代表最近一轮；新一轮开始后会自动清掉/)
  assert.match(index, /children: '去会话处理'/)
})

test('回归：开发会话动态把连续工具调用折叠成一组（不再一屏 bash）', async () => {
  const { readFile } = await import('node:fs/promises')
  const panel = await readFile(new URL('../src/client/session-log.mjs', import.meta.url), 'utf8')
  assert.match(panel, /function ToolGroup/)
  assert.match(panel, /执行了 \$\{items\.length\} 个操作/)
  assert.match(panel, /toolBuffer/)
  assert.match(panel, /limit=80/)
})

test('回归：只保留一处输入（下一步），会话动态只读；下一步在流程阶段条之后', async () => {
  const { readFile } = await import('node:fs/promises')
  const panel = await readFile(new URL('../src/client/session-log.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(panel, /<textarea|h\('textarea'/)
  assert.match(panel, /更早的 \$\{head\.length\} 条/)
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // 下一步应该在「流程」阶段条之后（说完话就是在推动流程）
  const flowPos = index.indexOf("h('span', { style: styles.sectionTitle }, '流程')")
  const nextPos = index.indexOf('renderNextStep(),')
  assert.ok(flowPos > 0 && nextPos > flowPos, '下一步应排在流程阶段条之后')
})

test('开发前同步：顶栏提供「拉取代码」，调用 /sync 并展示逐库结果', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /async function syncCode\(\)/)
  assert.match(index, /postAllowingFailure\(API\.sync, \{ id: draft\.id \}\)/)
  assert.match(index, /merge --ff-only/)
  assert.match(index, /children: syncBusy/)
  assert.match(index, /'⟳ 拉取代码'/)
  const api = await readFile(new URL('../src/shared/api.mjs', import.meta.url), 'utf8')
  assert.match(api, /sync: '\/api\/dev-hub\/sync'/)
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /开工前拉取最新代码（git fetch \+ merge --ff-only）/)
  assert.match(chat, /const \[syncBeforeStart, setSyncBeforeStart\] = useState\(true\)/)
})

test('聊天恢复：确认/计划阶段没有可操作卡片时解锁输入，输入区给出继续按钮；顶栏徽标可被聊天状态纠正', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  // 恢复时只有 pending 对象、没有未提交的卡片，就不能停在 confirm/plan 把输入锁死
  assert.match(chat, /const pendingActionable = Boolean\(pending && \(/)
  assert.match(chat, /const planActionable = Boolean\(pendingPlan && planCard && !planCard\.resolved\)/)
  assert.match(chat, /conversation\?\.phase === PHASE\.plan && planActionable/)
  assert.match(chat, /conversation\?\.phase === PHASE\.confirm && pendingActionable/)
  // 输入区在锁住阶段仍给唯一能推进的动作
  assert.match(chat, /phase === PHASE\.confirm && pending[\s\S]{0,220}继续，生成计划/)
  assert.match(chat, /phase === PHASE\.plan && pendingPlan[\s\S]{0,220}确认开工/)

  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // 切页签/回到前台都重取 /state；只接受最后一次发起的目标响应，聊天页不回写顶栏
  assert.match(index, /document\.addEventListener\('visibilitychange'/)
  assert.match(index, /\[flowsNonce, scopeNonce, tab\]/)
  assert.match(index, /const seq = flowStateSeqRef\.current \+ 1/)
  assert.match(index, /seq === flowStateSeqRef\.current/)
  assert.doesNotMatch(index, /onStateLoaded:/)
  assert.doesNotMatch(chat, /onStateLoaded/)
  // 旧组件请求还在飞时，新组件轮询 chat store，收尾后自动载入结果而不是永远空白
  assert.match(chat, /isConversationRunning\(state\.repo\.path, scope, activeChatIdRef\.current, resumeKind\)\) \{/)
  assert.match(chat, /当前扫描\/澄清还在处理，结束后会自动继续…/)
  assert.match(chat, /const stillRunning = isConversationRunning\(repoPath, scope, activeChatIdRef\.current, resumeKind\)/)
})

test('回归：澄清重复卡片不会重复渲染/重复续跑（去重 + 续跑保护 + 并发保护）', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  // 恢复时同轮卡片去重
  assert.match(chat, /seenClarify/)
  assert.match(chat, /同轮重复/)
  // 续跑保护：已有同轮卡片就不再问
  assert.match(chat, /lastClarify\.round \?\? 0\) >= Number\(job\.round/)
  assert.match(chat, /resumeCount/)
  // 并发保护
  assert.match(chat, /clarifyInFlightRef/)
})

test('回归：首页右上角的小房子按钮在「进行中」右侧，且带品牌底色', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // 小房子图标（SVG）+ 品牌淡底；hover/focus 反白
  assert.match(index, /function HomeGlyph/)
  assert.match(index, /h\('path', \{ d: 'M3\.8 11\.2 12 4\.4l8\.2 6\.8' \}\)/)
  assert.match(index, /background: homeHover \? T\.brand : T\.brandSoft/)
  assert.match(index, /'aria-label': '回到开发站首页'/)
  // 位置：在「进行中」按钮之后、页签之前
  const runningAt = index.indexOf('进行中 ${')
  const homeAt = index.indexOf('background: homeHover')
  const tabsAt = index.indexOf('h(Segmented, {', homeAt)
  assert.ok(runningAt > 0 && homeAt > runningAt, '小房子按钮必须在「进行中」右侧')
  assert.ok(tabsAt > homeAt, '小房子按钮在页签左侧')
  // 详情面包屑首段仍是 hub（流程内返回，不是页头按钮）
  assert.match(index, /}, 'hub'\)/)
  assert.match(index, /homeNonce/)
})

test('回归：聊天右区展示候选文件/计划，并支持按最新讨论重新扫描', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /function renderSide/)
  assert.match(chat, /候选文件/)
  assert.match(chat, /重新扫描/)
  assert.match(chat, /正在按最新讨论重新扫描/)
  assert.match(chat, /setSideOpen/)
})

test('回归：多库项目入口（多库项目卡片 / 新建弹窗 / 切换）', async () => {
  const { readFile } = await import('node:fs/promises')
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(home, /多库项目/)
  assert.match(home, /新建多库项目/)
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /API\.workspaces/)
  assert.match(index, /switchRepo.*workspaceId|workspaceId/)
  assert.match(index, /创建并切换/)
})

test('回归：新增项目/新建多库项目收进「项目管理」旁的 + 下拉，不再占一张卡', async () => {
  const { readFile } = await import('node:fs/promises')
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  // 不再有末尾的「新增项目」大卡片
  assert.doesNotMatch(home, /function AddTargetCard/)
  assert.doesNotMatch(home, /h\(AddTargetCard, \{/)
  // 标题旁的 + 按钮，点开是项目/多库项目两个入口
  assert.match(home, /'aria-label': '新增项目'/)
  assert.match(home, /setAddOpen/)
  assert.match(home, /'\+ 新增项目'/)
  assert.match(home, /'▣ 新建多库项目'/)
  assert.match(home, /onAddRepo\?\.\(\)/)
  assert.match(home, /onNewWorkspace\?\.\(\)/)
  // 项目多时网格换行，不再横向滚动裁掉最后一张卡
  assert.match(home, /repeat\(auto-fill, minmax\(min\(230px, 100%\), 1fr\)\)/)
  assert.doesNotMatch(home, /gridAutoFlow: 'column'/)
  assert.match(home, /const GRID_CARD_MIN_HEIGHT = 120/)
  assert.doesNotMatch(home, /function AddRepoCard/)
})

test('项目卡：上区名称+路径、下区 footer 显示 Git 分支（多库项目归属只放 tooltip）', async () => {
  const { readFile } = await import('node:fs/promises')
  const { HomeView } = await import('../src/client/home.mjs')
  const html = renderToStaticMarkup(h(HomeView, {
    state: {
      repo: { name: 'web', path: '/w/web' },
      profile: {
        member: '吕晨光',
        repoCards: [
          { path: '/w/web', name: 'web', exists: true, isRepo: true, branch: 'main', head: 'abc1234', initialized: true, workspaces: ['用户中心'] },
          { path: '/w/api', name: 'api', exists: true, isRepo: false, branch: null, head: null, initialized: false, workspaces: [] },
          { path: '/w/gone', name: 'gone', exists: false, isRepo: false, branch: null, head: null, initialized: false, workspaces: [] },
        ],
        repos: [],
      },
      workspace: null,
      workspaces: [],
      items: [],
    },
    items: [],
    sessionStates: new Map(),
  }))
  // 上区：名称 + 路径；当前库有「当前」标记
  assert.match(html, /web/)
  assert.match(html, /\/w\/web/)
  assert.match(html, /当前/)
  // footer：Git 分支@HEAD、非 git/失效说明；多库项目归属只在 tooltip，不能显示成多库项目卡
  assert.match(html, /main@abc1234/)
  assert.match(html, /多库项目：用户中心/)
  assert.doesNotMatch(html, /多库项目 · 用户中心/)
  assert.match(html, /非 git 仓库/)
  assert.match(html, /路径不存在，不能切换/)

  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(home, /flexDirection: 'column',\n        alignItems: 'stretch',\n        justifyContent: 'space-between'/)
  assert.match(home, /borderTop: `1px solid \$\{exists \? T\.borderSoft : T\.danger\}`/)
  assert.doesNotMatch(home, /workspaceLabel/)
  // 目录最多两行换行展示，而不是一行省略号+中间留空
  assert.match(home, /WebkitLineClamp: 2/)
  assert.match(home, /WebkitBoxOrient: 'vertical'/)
  assert.match(home, /wordBreak: 'break-all'/)

  // 多库项目激活时点主库代码卡必须能切回单库：不能按 state.repo.path 直接 return
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /const alreadySingle = !state\?\.workspace && target === state\?\.repo\?\.path/)
  assert.match(index, /if \(!target \|\| alreadySingle\) return/)
})

test('会话管理页：工作站「会话」页签 + 分类卡 + 展开对话/归档/置顶', async () => {
  const { readFile } = await import('node:fs/promises')
  const sessions = await readFile(new URL('../src/client/sessions.mjs', import.meta.url), 'utf8')
  assert.match(sessions, /export function SessionsPanel/)
  assert.match(sessions, /API\.managedSessions/)
  assert.match(sessions, /CATEGORY_ICON/)
  assert.match(sessions, /开发会话|评审会话|扫描会话|澄清会话/)
  assert.match(sessions, /打开会话/)
  assert.match(sessions, /查看对话/)
  assert.match(sessions, /收起对话/)
  assert.match(sessions, /API\.sessionTranscript/)
  assert.doesNotMatch(sessions, /children: '放入 Workspace'/)
  assert.match(sessions, /\$\{API\.sessionTranscript\}\?sessionId=/)
  assert.match(sessions, /归档本组/)
  assert.match(sessions, /session\.archived \? '取消归档' : '归档'/)
  assert.match(sessions, /项目 Workspace/)
  assert.match(sessions, /ui\.openWorkspace\(workspace\.id\)/)
  assert.match(sessions, /projectWorkspaces/)
  // 项目 → 需求 → 会话层级
  assert.match(sessions, /function ProjectNode/)
  assert.match(sessions, /function FlowNode/)
  assert.doesNotMatch(sessions, /未关联到需求的会话/)
  assert.match(sessions, /按项目/)
  assert.match(sessions, /按类型/)
  // 只渲染顶部选中的项目，不再一次铺开所有项目
  assert.match(sessions, /activeRepoPath = null, activeWorkspacePath = null/)
  assert.match(sessions, /const selectedProject = hierarchyAvailable && activePath/)
  assert.match(sessions, /只显示顶部选中的项目/)
  assert.doesNotMatch(sessions, /data\.projects\.map/)
  const index2 = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index2, /activeRepoPath: flowList\?\.repo\?\.path \?\? null/)
  assert.match(index2, /activeWorkspacePath: flowList\?\.workspace\?\.path \?\? null/)
  // 旧 Host 没有 projects 时退回按类型，并提示重启，不要显示空白层级
  assert.match(sessions, /const hierarchyAvailable = Array\.isArray\(data\?\.projects\)/)
  assert.match(sessions, /effectiveView = view === 'project' && !hierarchyAvailable \? 'category' : view/)
  assert.match(sessions, /当前 Host 版本还不支持“项目 → 需求 → 会话”层级/)

  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /import \{ SessionsPanel \} from '\.\/sessions\.mjs'/)
  assert.match(index, /\{ value: 'sessions', label: '会话' \}/)
  assert.match(index, /h\(SessionsPanel, \{/)
  assert.match(index, /会话管理 · 开发\/评审\/扫描\/澄清分类/)

  const api = await readFile(new URL('../src/shared/api.mjs', import.meta.url), 'utf8')
  assert.match(api, /managedSessions: '\/api\/dev-hub\/sessions\/manage'/)
})

test('回归：流程类型可在详情顶部点击纠正，列表用 Tag 标出 bug / 多库', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /INTENT_LABEL/)
  assert.match(index, /refactor: '代码重构'/)
  assert.match(index, /INTENT_ORDER = \['bug', 'feature', 'refactor', 'analysis'\]/)
  assert.match(index, /已更新流程类型/)
  assert.doesNotMatch(index, /'聊天创建'|「聊天创建」/)
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(home, /item\?\.intent === 'bug'/)
  assert.match(home, /item\?\.intent === 'refactor'/)
  assert.match(home, /多库/)
  // Tag 要支持点击（否则"可纠正"是假的）
  const common = await readFile(new URL('../src/client/common.mjs', import.meta.url), 'utf8')
  assert.match(common, /function Tag\(\{ tone = 'neutral', children, style, onClick, title \}\)/)
})

test('回归：流程类型支持第三类「分析」，详情/列表/报告/下一步都按只读展示', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /analysis: '分析'/)
  assert.match(index, /INTENT_ORDER = \['bug', 'feature', 'refactor', 'analysis'\]/)
  assert.match(index, /nextIntentOf/)
  assert.match(index, /分析流程只读：不建 worktree、不产生提交/)
  assert.match(index, /entry\.id !== 'submit'/)

  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(home, /item\?\.intent === 'analysis'/)
  assert.match(home, /item\?\.intent === 'analysis'[\s\S]{0,200}不进入提交/)

  const report = await readFile(new URL('../src/client/report.mjs', import.meta.url), 'utf8')
  assert.match(report, /分析产出/)
  assert.match(report, /report\.intent === 'analysis'/)

  const nextSteps = await readFile(new URL('../src/client/next-steps.mjs', import.meta.url), 'utf8')
  assert.match(nextSteps, /开启分析会话/)
  assert.match(nextSteps, /不进入提交/)
})

test('回归：下一步只保留一个"发送"，由工作站判断补台账还是发会话', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /API\.dispatch/)
  assert.match(index, /async function sendUnified/)
  assert.match(index, /工作站会判断这句话是补台账、发开发会话/)
  assert.doesNotMatch(index, /children: '补充信息'/)
  assert.doesNotMatch(index, /children: '推进开发'/)
})

test('头部项目徽标：项目 / 多库项目 / 未选择 三种情况都说清楚', async () => {
  const { RepoScopeBadge } = await import('../src/client/common.mjs')

  const repoHtml = renderToStaticMarkup(h(RepoScopeBadge, {
    repo: { name: 'demo', path: '/Users/lcg/demo' },
  }))
  assert.match(repoHtml, /项目/)
  assert.match(repoHtml, /demo/)
  assert.match(repoHtml, /\/Users\/lcg\/demo/) // 全路径仍保留在 tooltip 里
  assert.match(repoHtml, /…\/lcg/) // 可见文本只留定位目录，避免长路径撑爆徽标

  const wsHtml = renderToStaticMarkup(h(RepoScopeBadge, {
    repo: { name: 'web', path: '/w/web' },
    workspace: { id: 'w1', name: '用户中心 前后端', repos: ['/w/web', '/w/api'], path: '/home/u/.dev-hub/workspaces/w1' },
  }))
  assert.match(wsHtml, /多库项目/)
  assert.match(wsHtml, /用户中心 前后端/)
  assert.match(wsHtml, /2 个代码库/)
  assert.match(wsHtml, /本机台账/)
  // 没有主库：徽标不能再出现「主库 X / 写入主库」这类文案
  assert.doesNotMatch(wsHtml, /主库/)
  // 本机台账位置进 tooltip，成员库只是平权组合
  assert.match(wsHtml, /\/home\/u\/\.dev-hub\/workspaces\/w1/)

  const emptyHtml = renderToStaticMarkup(h(RepoScopeBadge, {}))
  assert.match(emptyHtml, /未选择项目/)
  assert.match(emptyHtml, /到「流程」页选择或新增/)
})

test('流程页 / 技能页头部常驻「现在管的是哪个库或多库项目」，切库后立刻刷新', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // 头部徽标读 /state 的 repo + workspace，并且点击能回「流程」列表（切库入口在那里）
  const page = index.slice(index.indexOf('function DevHubPage'), index.indexOf('// Static service requirement'))
  // 头部三栏：左右等宽，徽标落在正中（不再挤在标题后面）
  assert.match(page, /gridTemplateColumns: 'minmax\(0, 1fr\) auto minmax\(0, 1fr\)'/)
  assert.match(page, /justifyContent: 'center', minWidth: 0, maxWidth: 560/)
  assert.match(page, /h\(RepoScopeBadge, \{/)
  assert.match(page, /repo: flowList\.repo/)
  assert.match(page, /workspace: flowList\.workspace/)
  assert.match(page, /setTab\('flows'\); setOpenFlow\(null\); setHomeNonce/)
  // 切库/新增/初始化/新建多库项目后立刻重取 state，而不是等 10 秒轮询
  assert.match(page, /scopeNonce/)
  assert.match(index, /onScopeChanged: \(\) => setScopeNonce\(/)
  assert.match(index, /function Panel\(\{[^}]*onScopeChanged/)
  const notifyCount = (index.match(/onScopeChanged\?\.\(\)/g) ?? []).length
  assert.ok(notifyCount >= 5, `切库路径都要通知头部刷新，实际 ${notifyCount} 处`)

  const skills = await readFile(new URL('../src/client/skills.mjs', import.meta.url), 'utf8')
  assert.match(skills, /setWorkspace\(state\.workspace \?\? null\)/)
  assert.match(skills, /多库项目 · /)
  assert.match(skills, /技能与约束只写入多库项目本机目录/)
})

test('技能页：多库项目时标出本机规范目录，并说明成员库不共享规范', async () => {
  const { SkillsPanel } = await import('../src/client/skills.mjs')
  const view = {
    firstRun: false,
    profile: 'node',
    frontend: false,
    frameworks: [],
    path: '.dev-hub/conventions.json',
    installed: [],
    catalog: [],
    constraints: [],
  }
  const html = renderToStaticMarkup(h(SkillsPanel, {
    initialRepo: { name: 'web', path: '/w/web' },
    initialWorkspace: {
      name: '用户中心 前后端',
      repos: ['/w/web', '/w/api'],
      path: '/home/u/.dev-hub/workspaces/w1',
    },
    initialView: view,
  }))
  assert.match(html, /多库项目 · 用户中心 前后端/)
  assert.match(html, /2 个代码库/)
  assert.match(html, /本机规范/)
  assert.doesNotMatch(html, /主库/)
  assert.match(html, /成员库不共享规范/)
  assert.match(html, /技能与约束只写入多库项目本机目录 \/home\/u\/\.dev-hub\/workspaces\/w1/)
})

test('流程页项目条：激活多库项目时显示多库项目名与本机台账目录，不再只显示某个成员库名', async () => {
  const { HomeView } = await import('../src/client/home.mjs')
  const html = renderToStaticMarkup(h(HomeView, {
    state: {
      repo: { name: 'web', path: '/w/web' },
      profile: { member: '吕晨光', repoCards: [], repos: [] },
      workspace: {
        id: 'w1',
        name: '用户中心 前后端',
        repos: ['/w/web', '/w/api'],
        path: '/home/u/.dev-hub/workspaces/w1',
      },
      workspaces: [],
      items: [],
    },
    items: [],
    sessionStates: new Map(),
  }))
  assert.match(html, /多库项目 · 用户中心 前后端/)
  assert.match(html, /2 个代码库/)
  assert.match(html, /本机台账/)
  assert.doesNotMatch(html, /主库 · /)
  assert.match(html, /\/home\/u\/\.dev-hub\/workspaces\/w1/)
})

test('开发中 loading：Spinner 是纯 CSS 转圈，动画名与聊天页区分', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/client/common.mjs', import.meta.url), 'utf8')
  // 组件契约：size/tone/title；样式只注入一次，keyframes 用 devhub-hub-spin（chat.mjs 是 devhub-spin）
  assert.match(source, /export function Spinner\(\{ size = 12, tone = 'accent', title/)
  assert.match(source, /@keyframes devhub-hub-spin/)
  assert.match(source, /animation: 'devhub-hub-spin/)
  assert.doesNotMatch(source, /@keyframes devhub-spin\b/)

  const html = renderToStaticMarkup(h(common.Spinner, { size: 14, tone: 'ok', title: '正在开发…' }))
  assert.match(html, /devhub-hub-spin/)
  assert.match(html, /width:14px/)
  assert.match(html, /#00875a/, '颜色应取 ok 语义色')
  assert.match(html, /aria-label="正在开发…"/)
})

test('开发中 loading：首页流程行 / 会话徽标在运行时转圈并写中文 loading 文案', async () => {
  const { HomeView } = await import('../src/client/home.mjs')
  const html = renderToStaticMarkup(h(HomeView, {
    state: {
      repo: { name: 'web', path: '/w/web' },
      profile: { member: '吕晨光', repoCards: [], repos: [] },
      items: [],
    },
    items: [{
      id: 'flow-running',
      title: '正在跑的流程',
      status: 'developing',
      stage: 'develop',
      taskCount: 2,
      doneCount: 1,
      updatedAt: null,
      session: { id: 's1' },
    }],
    sessionStates: new Map([['flow-running', { itemId: 'flow-running', sessionId: 's1', running: true, alive: true, turns: 2 }]]),
  }))
  assert.match(html, /正在开发…/, '流程行要显示「正在开发…」')
  assert.match(html, /会话运行中/, '会话徽标仍要说明运行中')
  assert.match(html, /devhub-hub-spin/, '徽标/行内都要有转圈')
})

test('开发中 loading：详情/阶段条/启动按钮/抽屉的源码级回归', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')

  // 阶段条：当前节点用 Spinner 替代圆点 + 「正在开发…」
  assert.match(index, /function ArrowSteps\(\{[^}]*activeLoading/)
  assert.match(index, /active && activeLoading[\s\S]{0,160}Spinner/)
  assert.match(index, /activeDetail: \(\(\) => \{[\s\S]{0,120}stage === 'develop' && running\) return '正在开发…'/)

  // 详情标题行 + 「流程」卡 loading 提示
  assert.match(index, /正在开发…/)
  assert.match(index, /开发中：开发会话正在工作；完成后点顶栏「继续推进」开始独立评审/)

  // 开启/继续开发会话：本地 launchBusy 包住 onLaunch，finally 复位，失败也复位
  assert.match(index, /const \[launchBusy, setLaunchBusy\] = useState\(null\)/)
  assert.match(index, /async function runLaunch\(mode, action\)/)
  assert.match(index, /finally \{\s*setLaunchBusy\(null\)\s*\}/)
  assert.match(index, /正在开启开发会话…/)
  assert.match(index, /正在继续开发会话…/)
  // 「更多 → 换一条开发会话」也要进 busy 态
  assert.match(index, /runLaunch\('fresh', \(\) => onLaunch\?\.\(draft\.id, \{ fresh: true \}\)\)/)

  // 右上角「进行中」按钮 + 抽屉：running>0 时转圈并追加「 · N 开发中」
  assert.match(index, /isItemRunning/)
  assert.match(index, /typeof item\?\.running === 'boolean'/)
  assert.match(index, /Array\.isArray\(states\)/)
  assert.match(index, /runningCount/)
  assert.match(index, /· \$\{runningCount\} 开发中/)
  assert.match(index, /开发中…/)
})

test('渲染：开发会话运行中的流程详情出现「正在开发」loading 提示', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { ItemEditor } = await import('../src/client/index.mjs')
  const { sanitizeItem } = await import('../src/core/store.mjs')

  const item = sanitizeItem({
    id: 'running-render-check',
    title: '运行中 detail',
    goal: '确认开发中 loading 可见',
    acceptance: ['有转圈'],
    scope: ['src/x'],
    tasks: [{ text: 'a', done: true }, { text: 'b', done: false }],
    workflow: {
      stage: 'develop',
      rootProblem: '看不到进度',
      techDoc: { decision: 'none' },
      plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1 } },
    },
    session: { id: 'session-running', boundAt: '2026-11-11T00:00:00.000Z' },
  })
  const html = renderToStaticMarkup(h(ItemEditor, {
    item,
    ctx: { get: () => undefined },
    session: { sessionId: 'session-running', alive: true, running: true, turns: 2, lastStage: 'tool' },
    onBack() {}, onSaved() {}, onContext() {}, onStarted() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
  assert.match(html, /正在开发…/)
  assert.match(html, /开发中：开发会话正在工作/)
  assert.match(html, /devhub-hub-spin/)
  // 会话在跑时下一步不再催「跑本机自测」（流程卡里的说明文案不算建议按钮）
  assert.doesNotMatch(html, /本机自测当前未运行/)
})

test('scope 词条：多库项目 `<成员库>:<路径>` 显示成 `成员库 · 路径`，module: 保持原样', () => {
  assert.equal(common.scopeTokenLabel('web:src/x.js'), 'web · src/x.js')
  assert.equal(common.scopeTokenLabel('module:pipeline-service'), '模块 pipeline-service')
  assert.equal(common.scopeTokenLabel('src/main/java'), 'src/main/java')
  assert.equal(common.scopeTokenLabel(''), '')
  // 冒号在开头/结尾不拆（不是合法的 label:path）
  assert.equal(common.scopeTokenLabel('web:'), 'web:')
  assert.equal(common.scopeTokenLabel(':x'), ':x')
})

test('流程列表：展示流程阶段进度（不是任务数），说清还差哪一步、完成才变绿', async () => {
  const { HomeView, pendingFlowStep } = await import('../src/client/home.mjs')
  // 口径：开发任务完成 ≠ 流程完成
  assert.equal(pendingFlowStep({ status: 'done', stage: 'done' }), null)
  assert.match(pendingFlowStep({ status: 'verifying', stage: 'verify', testState: 'passed', environmentTestState: 'not_run' }), /还差环境测试/)
  assert.match(pendingFlowStep({ status: 'verifying', stage: 'verify', testState: 'not_run' }), /还差本机自测/)
  assert.match(pendingFlowStep({ status: 'verifying', stage: 'submit', testState: 'passed', environmentTestState: 'passed' }), /待提交/)
  assert.match(pendingFlowStep({ status: 'developing', stage: 'develop' }), /开发中，待评审/)
  // 评审未通过时不能含糊成「开发中，未验证」：要说清卡在评审纠偏
  assert.equal(pendingFlowStep({ status: 'developing', stage: 'develop', reviewState: 'failed' }), '评审未通过，待纠偏')
  assert.equal(pendingFlowStep({ status: 'developing', stage: 'review', reviewState: 'pending' }), '独立评审进行中')
  assert.equal(pendingFlowStep(null), null)

  const html = renderToStaticMarkup(h(HomeView, {
    state: {
      repo: { name: 'dsh-dev-hub', path: '/r' },
      profile: { member: '吕晨光', repoCards: [{ path: '/r', name: 'dsh-dev-hub', exists: true, initialized: true, isRepo: false }], repos: [] },
      workspace: null,
      workspaces: [],
      items: [],
    },
    items: [
      {
        id: 'done-flow', title: '已完成流程', status: 'done', stage: 'done',
        taskCount: 9, doneCount: 9, testState: 'passed', environmentTestState: 'passed',
        scope: ['src/a'], updatedAt: '2026-11-12T00:00:00.000Z', attention: null, session: null,
      },
      {
        id: 'verifying-flow', title: '验证中流程', status: 'verifying', stage: 'verify',
        taskCount: 3, doneCount: 3, testState: 'passed', environmentTestState: 'not_run',
        scope: ['src/b'], updatedAt: '2026-11-12T00:00:00.000Z', attention: null, session: null,
      },
    ],
    sessionStates: new Map(),
  }))
  // 列表列是「流程进度」：8 个阶段中已完成 8/8，验证中流程停在 6/8（测试验证）
  assert.match(html, /流程进度/)
  assert.match(html, /8\/8/)
  assert.match(html, /6\/8/)
  assert.doesNotMatch(html, /实现任务/)
  // 未结束的流程要说清还差哪一步；本机自测通过后先等独立评审
  assert.match(html, /继续推进即开始评审|还差环境测试/)
  assert.match(html, /流程已完成/)
})

test('流程页项目条：成员库 chip 平权展示分支/HEAD，缺失成员用 warn 警示', async () => {
  const { HomeView } = await import('../src/client/home.mjs')
  const html = renderToStaticMarkup(h(HomeView, {
    state: {
      repo: { name: 'web', path: '/w/web' },
      profile: { member: '吕晨光', repoCards: [], repos: [] },
      workspace: {
        id: 'w1',
        name: '用户中心',
        repos: ['/w/web', '/w/api'],
        path: '/home/u/.dev-hub/workspaces/w1',
        members: [
          { path: '/w/web', name: 'web', exists: true, isRepo: true, initialized: true, branch: 'main', head: 'abc1234' },
          { path: '/w/api', name: 'api', exists: false, isRepo: false, initialized: false, branch: null, head: null },
        ],
      },
      workspaces: [],
      items: [],
    },
    items: [],
    sessionStates: new Map(),
  }))
  // 成员库摘要 + 分支/HEAD；没有主库标记
  assert.match(html, /成员库（2）/)
  assert.doesNotMatch(html, /主库/)
  assert.match(html, /main@abc1234/)
  // 缺失成员不能静默：chip 上有「缺失」，下面还有 warn 提示
  assert.match(html, /缺失/)
  assert.match(html, /个成员库路径不存在/)
  assert.match(html, /\/w\/api/)
})

test('项目：多库项目与项目同一网格；激活多库项目时不再选中主库代码卡', async () => {
  const { readFile } = await import('node:fs/promises')
  const { HomeView } = await import('../src/client/home.mjs')
  const workspace = {
    id: 'w1', name: '用户中心', repos: ['/w/web', '/w/api'], path: '/home/u/.dev-hub/workspaces/w1',
    members: [
      { path: '/w/web', name: 'web', exists: true, isRepo: true, initialized: true, branch: 'main', head: 'abc1234' },
      { path: '/w/api', name: 'api', exists: true, isRepo: true, initialized: true, branch: 'main', head: 'def5678' },
    ],
  }
  const html = renderToStaticMarkup(h(HomeView, {
    state: {
      repo: { name: 'web', path: '/w/web' },
      profile: { member: '吕晨光', repoCards: [{ path: '/w/web', name: 'web', exists: true, isRepo: true, branch: 'main', head: 'abc1234', initialized: true, workspaces: ['用户中心'] }], repos: [] },
      workspace,
      workspaces: [{ id: 'w1', name: '用户中心', repos: ['/w/web', '/w/api'], path: '/home/u/.dev-hub/workspaces/w1' }],
      items: [],
    },
    items: [],
    sessionStates: new Map(),
  }))
  // 平铺成一行：多库项目 + 项目都在同一个横向卡片行里，不再分「多库项目」「项目」两块
  assert.match(html, /2 个项目/)
  assert.doesNotMatch(html, /多库项目（1）/)
  assert.doesNotMatch(html, /项目（1）/)
  // 多库项目卡是唯一选中项；主库代码卡不再跟着显示选中
  assert.match(html, /aria-pressed="true" title="切换到多库项目「用户中心」/)
  const repoAt = html.indexOf('切换到 /w/web')
  assert.ok(repoAt > 0, '主库代码卡应存在且是未选中状态')
  assert.match(html.slice(repoAt, repoAt + 320), /aria-pressed="false"/)

  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(home, /\.\.\.workspaceViews\.map/)
  assert.match(home, /active: !activeWorkspace &&/)
  assert.match(home, /repeat\(auto-fill, minmax\(min\(230px, 100%\), 1fr\)\)/)

  // 重复点击当前多库项目/同一目标切换中不再发请求、不再弹「已切到」提示
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /state\?\.workspace\?\.id === target/)
  assert.match(index, /const switchTargetRef = useRef\(null\)/)
  assert.match(index, /if \(switchTargetRef\.current === targetKey\) return/)
  assert.match(index, /setSwitchingRepo\(targetKey\)/)
})

test('多库项目卡片支持移除：只删本机登记，不动成员库磁盘与台账', async () => {
  const { readFile } = await import('node:fs/promises')
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(home, /onRemoveWorkspace/)
  assert.match(home, /从本机移除这个多库项目/)
  assert.match(home, /从本机移除这个多库项目（不动成员库代码与流程台账）/)
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /action: 'remove', id: workspace\?\.id/)
  assert.match(index, /只删本机的分组登记/)
  assert.match(index, /成员库代码与 \.dev-hub 未动/)
  assert.match(index, /本机台账仍保留/)
})

test('新建多库项目弹窗：勾选已登记项目 + 额外路径，>=2 校验，后端错误显示在弹窗内', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // 只列路径存在的已登记卡片；编辑时额外保留当前成员（即使路径已失效，便于移除）
  assert.match(index, /state\.profile\?\.repoCards \?\? \[\]\)\.filter\(\(card\) => card/)
  assert.match(index, /card\.exists !== false \|\| editingRepos\.includes\(card\.path\)/)
  assert.match(index, /已登记的代码库（勾选加入/)
  assert.match(index, /type: 'checkbox'/)
  assert.match(index, /toggleWorkspaceRepo/)
  // 额外路径 textarea + 去重合并 + 至少两个
  assert.match(index, /function workspaceDraftRepos/)
  assert.match(index, /至少需要两个不同的代码库/)
  // 错误在弹窗里，不在页面顶部
  assert.match(index, /wsError/)
  assert.match(index, /setWsError\(errorText\(err\)\)/)
  // 成功后按成员数提示并刷新页面 state
  assert.match(index, /已创建并切到多库项目/)
  assert.match(index, /台账在本机/)
  // 同一个弹窗承担编辑：action update、成员库平权（没有锁定项）、保存修改
  assert.match(index, /function openEditWorkspace/)
  assert.match(index, /action: 'update'/)
  assert.match(index, /成员库平权/)
  assert.doesNotMatch(index, /主库不可更换/)
  assert.doesNotMatch(index, /disabled: isPrimary/)
  assert.match(index, /children: busy \? \(wsEditId \? '保存中…' : '创建中…'\)/)
})

test('多库项目卡支持编辑成员：✎ 入口 + 编辑弹窗预填现有成员', async () => {
  const { readFile } = await import('node:fs/promises')
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(home, /function WorkspaceCard\(\{ workspace, active, busy, onSelect, onEdit, onRemove[^}]*\}\)/)
  assert.match(home, /title: '编辑这个多库项目：改名、增删成员库（成员库平权，任意成员都可移除\/替换）'/)
  assert.match(home, /onEdit\?\.\(workspace\)/)
  assert.match(home, /onEdit: onEditWorkspace/)
  assert.match(home, /onEditWorkspace,/)

  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /const \[wsEditId, setWsEditId\] = useState\(null\)/)
  assert.match(index, /setWsPicked\(\[\.\.\.\(workspace\?\.repos \?\? \[\]\)\]\)/)
  assert.match(index, /title: wsEditId \? '编辑多库项目（成员库）' :/)
  assert.match(index, /onEditWorkspace: openEditWorkspace/)
})

test('流程详情：多库项目流程显示「多库项目 X · N 库」徽标（成员名按 repos 目录名兜底）', async () => {
  const { ItemEditor } = await import('../src/client/index.mjs')
  const { sanitizeItem } = await import('../src/core/store.mjs')
  const base = {
    id: 'workspace-badge',
    title: '跨前后端流程',
    goal: '多库',
    acceptance: ['能渲染'],
    workflow: { rootProblem: 'x', techDoc: { decision: 'none' } },
  }
  const multi = renderToStaticMarkup(h(ItemEditor, {
    item: sanitizeItem({ ...base, repos: ['/w/web', '/w/api'], workspace: { id: 'w1', name: '用户中心' } }),
    ctx: { get: () => undefined },
    session: null,
    onBack() {}, onSaved() {}, onContext() {}, onStarted() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
  assert.match(multi, /多库项目 用户中心 · 2 库/)

  // 单库流程保持旧界面：没有多库项目徽标
  const single = renderToStaticMarkup(h(ItemEditor, {
    item: sanitizeItem({ ...base, id: 'single-badge', repos: ['/w/web'] }),
    ctx: { get: () => undefined },
    session: null,
    onBack() {}, onSaved() {}, onContext() {}, onStarted() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
  assert.doesNotMatch(single, /多库项目/)
})

test('变更文件：多库项目用 file.key 唯一标识 + 成员库 Tag，diff 请求带 repo', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /function fileKeyOf\(file\)/)
  assert.match(index, /file\?\.key \?\?/)
  assert.match(index, /function fileDisplayOf\(file\)/)
  assert.match(index, /function fileRepoOf\(file\)/)
  // 同一相对路径可能在多个成员库：diff 必须带 repo
  assert.match(index, /params\.set\('repo', file\.repo\)/)
  assert.match(index, /if \(file\?\.repo\) params\.set\('repo'/)
  // 每行显示成员库 Tag，唯一 key 用于选中态
  assert.match(index, /h\(Tag, \{ tone: 'accent', title: `成员库：\$\{file\.repo \?\? repoName\}` \}, repoName\)/)
  assert.match(index, /const key = fileKeyOf\(file\)/)
  assert.match(index, /background: diffFile === key/)
})

test('测试与提交：按成员库显示 test 结果与 submit 结果，部分失败显式提示', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('.../src/client/index.mjs'.replace('.../', '../'), import.meta.url), 'utf8')
  // 本机/环境测试：逐库结果来自 body.result.repos（持久化在 workflow.tests.*.repos）
  assert.match(index, /function repoTestRows\(result\)/)
  assert.match(index, /Array\.isArray\(result\?\.repos\)/)
  assert.match(index, /成员库结果（/)
  assert.match(index, /repoTestRows\(result\)/)
  // 提交：保留 ok:false 的 body（api() 会抛掉逐库结果）
  assert.match(index, /postAllowingFailure\(API\.submit/)
  assert.match(index, /postAllowingFailure\(API\.test/)
  assert.match(index, /body\.repos/)
  assert.match(index, /submitData\.repos/)
  assert.match(index, /部分成员库失败/)
  // 多库部分推送失败也能重试
  assert.match(index, /function submissionNeedsRetry/)
  assert.match(index, /entry\.commit && entry\.pushed === false/)
  // 单库仍走原来的 pre 结果，不额外渲染逐库块
  assert.match(index, /: submitResult\s*\n\s*\? h\('pre'/)
})

test('变更文件确认按成员库分组；探测卡片与右区按 repoName 分组并显示成员库扫描摘要', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /function changesByRepo/)
  assert.match(index, /按库分组|多库项目按成员库分组/)
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /function groupReconFiles/)
  assert.match(chat, /function reconFileRepo/)
  assert.match(chat, /function reconMembers/)
  assert.match(chat, /成员库扫描（/)
  assert.match(chat, /repoName/)
  // 单库没有 repoName 时只有一组，不显示组标题
  assert.match(chat, /multiRepo/)
})

test('开发报告：详情新增「报告」页签，ReportView 只在报告页签挂载；列表入口不抢整行点击', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  const report = await readFile(new URL('../src/client/report.mjs', import.meta.url), 'utf8')

  // 页签接线：只加报告页签，其余页签逻辑不动
  assert.match(index, /import \{ ReportView \} from '\.\/report\.mjs'/)
  assert.match(index, /\{ value: 'report', label: '报告' \}/)
  assert.match(index, /tab === 'report'\s*\n\s*\? h\(ReportView, \{ itemId: draft\.id \}\)/)
  assert.match(index, /onOpenReport: \(id\) => setReportPreviewId\(id\)/)
  assert.match(index, /const \[reportPreviewId, setReportPreviewId\] = useState\(null\)/)
  assert.match(index, /h\(ReportView, \{ itemId: reportPreviewId \}\)/)
  // 顶栏操作整理：预览报告常驻；生成上下文进「更多」菜单；记录 baseline 不再作为按钮
  assert.match(index, /function HeaderMenu/)
  assert.match(index, /label: '生成上下文'/)
  assert.match(index, /预览报告/)
  assert.match(index, /setReportPreviewOpen\(true\)/)
  assert.match(index, /title: '开发报告预览'/)
  assert.match(index, /width: 'min\(1120px, 96vw\)'/)
  // 弹窗标题与内容之间必须有间距，避免标题直接贴住报告内容
  assert.match(index, /marginBottom: T\.gap\.md \}/)
  assert.doesNotMatch(index, /'记录 baseline'/)
  // 顶栏顺序与高度：继续推进（主）→ 预览报告 → ⋯ 更多；三者同高 32
  const headerStart = index.indexOf('// 顶栏操作从主到次')
  // 顶栏新增了「上次评审失败原因」内联提示，切片长度跟着放宽（顺序断言不变）
  const headerActions = index.slice(headerStart, headerStart + 4200)
  const primaryAt = headerActions.indexOf("'继续推进'")
  const previewAt = headerActions.indexOf("children: '预览报告'")
  const moreAt = headerActions.indexOf('h(HeaderMenu')
  assert.ok(primaryAt >= 0 && primaryAt < previewAt && previewAt < moreAt)
  // 主按钮与预览按钮都显式同高；⋯ 触发器也在 HeaderMenu 内声明 32
  assert.equal((headerActions.match(/height: 32/g) ?? []).length >= 2, true)
  assert.match(index, /与顶栏其它操作同高（32）/)

  // ReportView 契约：GET 取数 + 工具栏四个动作 + 错误卡不白屏
  assert.match(report, /export function ReportView\(\{ itemId, onNotice, onError \}\)/)
  assert.match(report, /export function ReportSections/)
  assert.match(report, /export function ReportBlock/)
  assert.match(report, /api\(`\$\{API\.report\}\?id=\$\{encodeURIComponent\(itemId\)\}`\)/)
  assert.match(report, /format=html/)
  assert.match(report, /action: 'save'/)
  assert.match(report, /body\.saved/)
  assert.match(report, /保存到本机/)
  assert.match(report, /styles\.dangerCard/)
  assert.match(report, /流程还没完成，报告会随台账更新/)
  // 风格按 prototype-ui-designer：家族表头、渐变统计卡、状态 Tag、等宽数字
  assert.match(report, /#eaedf1/)
  assert.match(report, /linear-gradient\(135deg/)
  assert.match(report, /tones\[key\]/)
  assert.match(report, /fontVariantNumeric: 'tabular-nums'/)

  // 列表入口：整行进详情，报告入口 stopPropagation 后新标签打开完整报告
  assert.match(home, /onOpenReport/)
  assert.match(home, /event\.stopPropagation\(\)/)
  assert.match(home, /format=html/)
  assert.match(home, /children: '报告'/)
})

test('开发报告：ReportSections SSR 冒烟，六种 block 都渲染且 XSS 文本被转义', async () => {
  const { ReportSections } = await import('../src/client/report.mjs')
  const html = renderToStaticMarkup(h(ReportSections, {
    sections: [
      {
        id: 'goal',
        title: '目标背景',
        summary: '为什么做、做什么',
        blocks: [
          { type: 'text', title: '需求原话', text: '<script>alert("xss")</script>' },
          { type: 'fields', fields: [{ label: '目标', value: '给每个流程生成报告' }] },
          { type: 'list', items: [{ text: '不做自动提交', meta: '非目标' }] },
          { type: 'tags', items: [{ label: 'feature', tone: 'info' }, { label: '只读', tone: 'neutral' }] },
        ],
      },
      {
        id: 'test',
        title: '测试报告',
        summary: '本机自测 · 环境测试',
        blocks: [
          {
            type: 'table',
            columns: [{ key: 'name', label: '检查项' }, { key: 'count', label: '数量', align: 'right' }],
            rows: [{ name: '单元测试', count: 3 }],
          },
          { type: 'code', language: 'text', text: 'ok 3 tests' },
        ],
      },
    ],
  }))

  // 固定章节名是报告契约的一部分
  assert.match(html, /目标背景/)
  assert.match(html, /测试报告/)
  // 用户文本只转义、不解释：script 不能作为标签执行
  assert.match(html, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>alert/)
  // 六种 block 都有实际内容
  assert.match(html, /给每个流程生成报告/)
  assert.match(html, /不做自动提交/)
  assert.match(html, /单元测试/)
  assert.match(html, /text-align:right/)
  assert.match(html, /ok 3 tests/)
  assert.match(html, /feature/)
  assert.match(html, /只读/)
})

test('开发报告：空列表/空表/空代码显示未填写或未运行，不显示空白', async () => {
  const { ReportSections } = await import('../src/client/report.mjs')
  const html = renderToStaticMarkup(h(ReportSections, {
    sections: [
      {
        id: 'empty',
        title: '测试报告',
        summary: '还没有跑',
        blocks: [
          { type: 'list', title: '验收项', items: [] },
          { type: 'table', title: '测试结果', columns: [{ key: 'name', label: '检查项' }], rows: [] },
          { type: 'code', title: '输出', text: '' },
        ],
      },
    ],
  }))
  assert.match(html, /未填写/)
  assert.doesNotMatch(html, /undefined/)
})

test('开发报告：状态列按 row.tones 渲染成家族 Tag（文字语义色 + 淡底）', async () => {
  const { ReportSections } = await import('../src/client/report.mjs')
  const html = renderToStaticMarkup(h(ReportSections, {
    sections: [
      {
        id: 'test',
        title: '测试报告',
        blocks: [
          {
            type: 'table',
            columns: [{ key: 'name', label: '检查项' }, { key: 'status', label: '状态' }],
            rows: [
              { name: 'npm test', status: '通过', tones: { status: 'ok' } },
              { name: 'npm run check', status: '失败', tones: { status: 'danger' } },
            ],
          },
        ],
      },
    ],
  }))
  assert.match(html, /通过/)
  assert.match(html, /失败/)
  assert.match(html, /#00875a|#e2ffee/)
  assert.match(html, /#de350d|#ffebe5/)
  assert.match(html, /border-radius:4px/)
})

test('流程列表：只展示会话状态，不提供「进入会话」按钮', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { HomeView } = await import('../src/client/home.mjs')
  const html = renderToStaticMarkup(h(HomeView, {
    state: {
      repo: { name: 'demo', path: '/tmp/demo' },
      profile: { member: '张三', repoCards: [] },
      project: { context: { commands: {} } },
    },
    items: [{
      id: 'demo-flow',
      title: '演示流程',
      status: 'developing',
      stage: 'develop',
      taskCount: 2,
      doneCount: 1,
      scope: ['src'],
      session: { id: 'session-x', boundAt: '2026-11-12T02:28:00.000Z' },
      updatedAt: '2026-11-12T03:00:00.000Z',
    }],
    sessionStates: new Map([['demo-flow', {
      sessionId: 'session-x', alive: true, running: false, turns: 3, idleSeconds: 60, lastStage: 'ended',
    }]]),
    onOpenItem() {}, onRefresh() {}, onNewFlow() {}, onOpenReport() {},
  }))
  assert.match(html, /演示流程/)
  // 状态可以看，但不再提供直接跳会话的入口：开发走工作站标准流程
  assert.match(html, /会话空闲|会话运行中/)
  assert.doesNotMatch(html, /进入会话/)
})

test('变更文件：停留概览页自动刷新，页面可见时每 8 秒静默拉取', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /loadFiles\(\{ silent: true \}\)/)
  assert.match(index, /\}, 8000\)/)
  assert.match(index, /addEventListener\('visibilitychange', onVisible\)/)
  assert.match(index, /if \(!silent\) setError\(errorText\(err\)\)/)
  assert.match(index, /自动刷新 · \$\{fmtTime\(filesAutoAt\)\}/)
})

test('变更文件：scope 外文件提供显式「纳入 scope」入口，不静默扩大范围', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /async function adoptFileScope\(file\)/)
  assert.match(index, /const token = file\?\.repoName \? `\$\{file\.repoName\}:\$\{dir\}` : dir/)
  assert.match(index, /纳入 scope/)
  assert.match(index, /scope 是开工确认时的边界，不会随改动自动扩大/)
  // 按钮不能触发行点击（行点击会打开 diff）
  assert.match(index, /event\.stopPropagation\(\)\n\s*adoptFileScope\(file\)/)
})

test('流程详情首屏：开发进度摘要能直接看出任务/测试/还差哪一步', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { ItemEditor } = await import('../src/client/index.mjs')
  const { sanitizeItem } = await import('../src/core/store.mjs')
  const item = sanitizeItem({
    id: 'progress-check',
    title: '进度摘要',
    goal: '一眼看出开发到哪',
    acceptance: ['能看出进度'],
    scope: ['src'],
    tasks: [
      { text: '实现接口', done: true },
      { text: '补测试', done: false },
    ],
    checks: [
      { id: 'c1', text: '本机测试', command: 'npm test', status: 'passed' },
      { id: 'c2', text: '人工验收', assertion: '人工确认', status: 'not_run' },
    ],
    workflow: {
      rootProblem: '进度不透明',
      techDoc: { decision: 'none' },
      plan: { summary: '计划', steps: ['一步'], estimate: { size: 'M', days: 2 } },
      // 评审已通过：阶段才会从「独立评审」进入「测试验证」
      review: {
        status: 'passed',
        round: 1,
        reviewers: [
          { id: 'reviewer-1', label: '审核员 1（方向）', role: 'direction', status: 'passed', verdict: 'pass', summary: '方向一致' },
          { id: 'reviewer-2', label: '审核员 2（正确性）', role: 'correctness', status: 'passed', verdict: 'pass', summary: '实现正确' },
        ],
      },
      tests: {
        local: { status: 'passed', command: 'npm test', output: 'ok' },
        environment: { status: 'not_run', command: '', output: '' },
      },
    },
  })
  const html = renderToStaticMarkup(h(ItemEditor, {
    item,
    ctx: { get: () => undefined },
    session: null,
    onBack() {}, onSaved() {}, onContext() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
  assert.match(html, /开发任务进度/)
  assert.match(html, /开发任务 1\/2/)
  assert.match(html, /进度条只统计开发任务，不代表流程完成/)
  assert.match(html, /本机自测 通过/)
  assert.match(html, /环境测试 未运行/)
  assert.match(html, /验收 1\/2/)
  assert.match(html, /还差环境测试/)
  assert.match(html, /1 个任务未完成（补测试）/)
  // 过程证据默认收起，不把首屏挤满
  assert.match(html, /开发会话动态（默认收起/)
})

test('回归：右上角切流程会先清旧详情、丢弃过期响应，变更内容不串到下一条', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // 切到另一条流程时立即清掉上一条 selectedItem（否则旧流程的变更/测试内容会顶着新流程渲染）
  assert.match(index, /current\.selectedItem\.id !== selected/)
  // 同一帧渲染也只认匹配 selected 的详情，避免一次闪烁
  assert.match(index, /state\.selectedItem\.id === selected \? state\.selectedItem : null/)
  // 快速切换时，晚到的旧详情响应不能覆盖当前流程
  assert.match(index, /selectedLoadSeqRef/)
  assert.match(index, /if \(seq !== selectedLoadSeqRef\.current\) return/)
  // ItemEditor 按流程 id 重建：文件清单 / 关键改动 diff 不残留上一条流程
  assert.match(index, /key: detail\.id,/)
})

test('抽屉进详情：先等 /state 就位再拉 item，reload 不会清空已加载详情', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // 详情请求必须等 state 就位，否则响应会在 setState 时被丢掉
  assert.match(index, /if \(!state\?\.repo\) return/)
  assert.match(index, /\}, \[selected, state\?\.repo\?\.path\]\)/)
  // reload 合并时保留同一仓库、同一流程的 selectedItem；/state 本身不带详情
  assert.match(index, /current\?\.selectedItem\?\.id === selected/)
  assert.match(index, /merged\.selectedItem = current\.selectedItem/)
  assert.match(index, /\/state 不带 selectedItem/)
})

test('独立工作区：第二个并行流程的会话开在 worktree，列表/详情有标识', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const chat = await readFile(new URL('../src/client/chat-flow.mjs', import.meta.url), 'utf8')
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(index, /cwd: started\.workRoot \?\? state\.repo\.path/)
  assert.match(chat, /cwd: started\?\.workRoot \?\? plan\.cwd/)
  assert.match(index, /独立工作区/)
  assert.match(index, /draft\.workflow\?\.worktree\?\.branch/)
  assert.match(home, /独立工作区/)
  assert.match(home, /item\?\.worktree\?\.branch/)
})

test('聊天计划卡：与输入框同宽同轴，深色主题不再用硬编码深灰/亮底浅字', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  const common = await readFile(new URL('../src/client/common.mjs', import.meta.url), 'utf8')
  // 卡片类消息铺满聊天列，不再被头像缩进；width:100% 必须 box-sizing，否则会溢出/错位
  assert.match(chat, /const wrapCard = \(content\) =>/)
  assert.match(chat, /boxSizing: 'border-box'/)
  assert.match(chat, /export function PlanCard/)
  // 风险框内容是 inherit，不再被全局 list 的浅色正文覆盖成低对比
  assert.match(chat, /riskList:/)
  assert.match(chat, /background: 'color-mix\(in srgb, #ca8a04 14%/)
  // 三级/四级文字跟随 DSH 主题变量，深色主题可读
  assert.match(common, /--dsw-alias-label-tertiary/)
  assert.match(common, /--dsw-alias-label-caption/)
})

test('切换项目后聊天页重建，扫描显式绑定当前库', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  const flow = await readFile(new URL('../src/client/chat-flow.mjs', import.meta.url), 'utf8')
  // 聊天组件 key 带 repo path：换库后旧对话/探测结果不能留在新库聊天页
  assert.match(index, /key: `\$\{flowList\?\.repo\?\.path \?\? 'none'\}:\$\{chatScope \?\? 'new'\}:\$\{chatNonce\}`/)
  // 扫描请求显式带 repoPath，Host 不再依赖可能已变化的 activeRepo
  assert.match(chat, /repoPath: state\?\.repo\?\.path/)
  assert.match(chat, /options\.repoPath \? \{ repoPath: options\.repoPath \} : \{\}/)
  assert.match(flow, /deps\.recon\(text, \{ attachments: list, repoPath \}\)/)
})

test('流程详情已完成：不再出现「继续推进」和推进输入区，改为报告/结果入口', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { ItemEditor } = await import('../src/client/index.mjs')
  const { sanitizeItem } = await import('../src/core/store.mjs')
  const item = sanitizeItem({
    id: 'done-flow',
    title: '已完成的流程',
    goal: '已经交付',
    acceptance: ['测试通过'],
    scope: ['src'],
    tasks: [{ text: '实现', done: true }],
    workflow: {
      stage: 'done',
      rootProblem: '已经完成',
      techDoc: { decision: 'none' },
      plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1 } },
      tests: {
        local: { status: 'passed', command: 'npm test', output: 'ok' },
        environment: { status: 'passed', command: 'npm run check', output: 'ok' },
      },
      submission: { status: 'pushed', branch: 'main', commit: 'abc1234', pushed: true, message: 'done' },
    },
  })
  const html = renderToStaticMarkup(h(ItemEditor, {
    item,
    ctx: { get: () => undefined },
    session: null,
    onBack() {}, onSaved() {}, onContext() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
  assert.match(html, /流程已完成/)
  assert.match(html, /预览开发报告/)
  assert.doesNotMatch(html, />继续推进</)
  assert.doesNotMatch(html, /用一句话补充或纠偏/)
})

test('会话前台阻塞提问：工作站只引导去会话，不提供会失败的代答按钮', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /entry\.answerable === false \|\| entry\.state === 'open'/)
  assert.match(index, /只能在开发会话里点选/)
  assert.match(index, /去会话处理/)
})

test('新建流程：同一 scope 也强制重建聊天，澄清期间不能生成计划', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(index, /const \[chatNonce, setChatNonce\] = useState\(0\)/)
  assert.match(index, /setChatNonce\(\(value\) => value \+ 1\)/)
  assert.match(index, /chatNonce\}`/)
  assert.match(index, /key: `\$\{flowList\?\.repo\?\.path \?\? 'none'\}:\$\{chatScope \?\? 'new'\}:\$\{chatNonce\}`/)
  assert.match(chat, /const busy = clarifyBusy \|\| phase === PHASE\.analyzing/)
  assert.match(chat, /const activeId = repoPath \? getActiveConversationId\(repoPath, scope\) : null/)
})

test('聊天任务恢复：切页/刷新回来 job 与进度可见，不会静默丢失', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /setJob\(conversation\?\.job \?\? null\)/)
  assert.match(chat, /已恢复任务，正在等待工作站继续/)
  assert.match(chat, /setJob\(conversation\?\.job \?\? null\)/)
  assert.match(chat, /resumeTriedRef\.current = false/)
})

test('点项目卡片只切换目标，不自动跳进该库上次打开的流程', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const start = index.indexOf('async function selectRepo(repoPath)')
  assert.ok(start > 0)
  const body = index.slice(start, index.indexOf('async function', start + 10))
  assert.match(body, /setSelected\(null\)/)
  assert.doesNotMatch(body, /loadPanelState\(targetRepo\)/)
  assert.match(body, /点项目卡片是“切换目标”/)
})

test('需求澄清工作区：独立页签 + 空工作区首屏引导', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(index, /value: 'clarify', label: '需求澄清'/)
  assert.match(index, /ClarificationWorkspace/)
  assert.match(index, /onOpenClarifications: \(\) => setTab\('clarify'\)/)
  assert.match(home, /从一次需求澄清开始/)
  assert.match(home, /开始需求澄清/)
})

test('需求澄清工作区取代「新建流程」顶层页签：聊天页归属澄清页签', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(index, /value: 'chat', label: '新建流程'/)
  assert.match(index, /value: tab === 'chat' \? 'clarify' : tab/)
  assert.match(index, /value: 'clarify', label: '需求澄清'/)
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(home, /children: '开始需求澄清'/)
})

test('需求澄清多选：题目标注可多选，选项按 toggle 合并而不是单选', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /multi \? h\(Pill/)
  assert.match(chat, /toggle: option\.label/)
  assert.match(chat, /hasOwnProperty\.call\(patch, 'toggle'\)/)
})

test('自动化设置：默认完全自动化，详情页自动评审并自动跑测试到提交前', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const settings = await readFile(new URL('../src/client/settings.mjs', import.meta.url), 'utf8')
  const automation = await readFile(new URL('../src/shared/automation.mjs', import.meta.url), 'utf8')
  assert.match(automation, /mode: AUTOMATION_MODES\.includes\(value\.mode\) \? value\.mode : 'full'/)
  assert.match(settings, /完全自动化（默认）/)
  assert.match(settings, /人工触发每个节点/)
  assert.match(settings, /启用独立评审环节/)
  assert.match(settings, /reviewEnabled/)
  assert.match(index, /automation\?\.mode !== 'full'/)
  assert.match(index, /runTest\('local', \{ auto: true \}\)/)
  assert.match(index, /runTest\('environment', \{ auto: true \}\)/)
  assert.match(index, /startReview\(\)\.finally\(\(\) => \{ autoNextRef\.current = '' \}\)/)
})

test('项目管理：项目多时网格换行，不横向裁掉最后一张卡', async () => {
  const { readFile } = await import('node:fs/promises')
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  assert.match(home, /repeat\(auto-fill, minmax\(min\(230px, 100%\), 1fr\)\)/)
  assert.doesNotMatch(home, /gridAutoFlow: 'column'/)
})

test('评审启动：POST 未返回前先显示 pending，避免顶栏评审中而阶段还停在开发中', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /const beforeReview = draft/)
  assert.match(index, /const optimisticReviewers = Array\.from/)
  assert.match(index, /status: 'pending'/)
  assert.match(index, /setDraft\(beforeReview\)/)
})

test('评审中/异常可人工通过；错误轮次重试先 reset 再 dispatch', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /\['failed', 'error', 'pending'\]\.includes\(view\.status\)/)
  assert.match(index, /disabled: overrideBusy \|\| busy/)
  assert.match(index, /if \(current\.status === 'error'\) \{/)
  assert.match(index, /action: 'reset'/)
})

test('需求澄清：聊天绑定进入时的项目，外部切换后自动切回而不是换掉会话', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(chat, /lockedRepoPath/)
  assert.match(chat, /state\.repo\.path === lockedRepoPath/)
  assert.match(chat, /api\(API\.switchRepo/)
  assert.match(index, /setChatRepoPath\(repoPath\)/)
  assert.match(index, /lockedRepoPath: chatRepoPath/)
})

test('需求澄清卡片：行高按内容自适应，底部元信息与按钮分行不重叠', async () => {
  const { readFile } = await import('node:fs/promises')
  const file = await readFile(new URL('../src/client/clarifications.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(file, /gridAutoRows: '1fr'/)
  assert.match(file, /minmax\(340px, 1fr\)/)
  assert.match(file, /flexDirection: 'column',\s*gap: 6,\s*paddingTop: 8/)
})

test('技能并入设置：不再占顶层页签，设置页按项目展示自动化/评审/技能', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const settings = await readFile(new URL('../src/client/settings.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(index, /value: 'skills', label: '技能'/)
  assert.match(settings, /id: 'skills', label: '技能'/)
  assert.match(settings, /SkillsPanel/)
  assert.match(settings, /控制当前项目/)
})

test('流程详情：检测到本机 IDE 时可在 worktree 中打开', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const api = await readFile(new URL('../src/shared/api.mjs', import.meta.url), 'utf8')
  assert.match(api, /openIde: '\/api\/dev-hub\/open-ide'/)
  assert.match(index, /async function openInIde\(editorId\)/)
  assert.match(index, /API\.openIde/)
  assert.match(index, /ideEditors\?\.length/)
  assert.match(index, /onClick: \(\) => \{ setIdeHover\(null\); openInIde\(editor\.id\) \}/)
  assert.match(index, /function EditorLogo/)
  assert.match(index, /onMouseEnter: \(\) => setIdeHover\(editor\)/)
  assert.match(index, /用 \$\{ideHover\.label\} 打开当前流程的 worktree/)
})

test('删除流程：可勾选同时清理 worktree 与 devhub 分支', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /const \[deleteWorktree, setDeleteWorktree\]/)
  assert.match(index, /deleteWorktree, deleteBranch: deleteWorktree/)
  assert.match(index, /worktree 和 devhub 分支/)
})


test('下一步输入框：点击发送即清空，失败才恢复原文；连按不会重复发', async () => {
  const fs = await import('node:fs/promises')
  const index = await fs.readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const start = index.indexOf('async function sendUnified()')
  const block = index.slice(start, index.indexOf('async function', start + 10))
  const clearAt = block.indexOf("setAskText('')")
  const dispatchAt = block.indexOf('await api(API.dispatch')
  assert.ok(clearAt > 0 && dispatchAt > clearAt, '先清空输入框，再发请求')
  assert.match(block, /catch \(err\)[\s\S]{0,400}setAskText\(\(current\) => \(current \? current : message\)\)/, '失败时恢复原文，但不要覆盖用户新输入')
  assert.match(block, /sendingRef\.current = true/)
  assert.match(block, /sendingRef\.current = false/)

  const assistStart = index.indexOf('async function sendAssist()')
  const assist = index.slice(assistStart, index.indexOf('const pending', assistStart))
  assert.ok(assist.indexOf("setAskText('')") < assist.indexOf('await api(API.assist'), '补充入口同样先清空')
  assert.match(assist, /sendingRef\.current = true/)
})

test('提交恢复：commit 已成功但推送失败时，空变更会重试推送当前 HEAD', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /没有新的改动：尝试推送当前已提交的 HEAD/)
  assert.match(index, /submitCode\(\{ pushOnly: true, auto: true \}\)/)
  const host = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
  assert.match(host, /const headBefore = .*rev-parse.*HEAD/)
  assert.match(host, /timeout: 120000/)
  assert.match(host, /git\(root, \['diff', '--cached', '--quiet'\]\)/)
  assert.match(host, /git\(workRoot, \['diff', '--cached', '--quiet'\]\)/)
})

test('提交冲突：自动把冲突文件交给模型合并并继续 rebase', async () => {
  const { readFile } = await import('node:fs/promises')
  const host = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
  assert.match(host, /async function resolveRebaseConflicts/)
  assert.match(host, /runLlmJson\(ctx,/)
  assert.match(host, /rebase', '--continue'/)
  assert.match(host, /自动解决冲突失败/)
  assert.match(host, /needsConfirmation: true/)
  assert.match(host, /冲突已自动解决/)
  assert.match(host, /自动解决冲突后已停在待提交/)
})

test('提交：缺失且未跟踪的 pathspec 会被跳过，不再让 git add 整体失败', async () => {
  const { readFile } = await import('node:fs/promises')
  const host = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
  assert.match(host, /async function addSelectedPaths/)
  assert.match(host, /git add.*--all|'add', '--all'/)
  assert.match(host, /trackedSet/)
  assert.match(host, /warnings/)
  assert.match(host, /skipped/)
})

test('提交阶段自动 rebase/解决冲突不会把评审作废、退回开发', async () => {
  const { readFile } = await import('node:fs/promises')
  const host = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
  assert.match(host, /const analysis = item\.workflow\?\.intent === 'analysis'/)
  assert.match(host, /分析流程只读：清除台账\/报告写入造成的测试过期标记/)
  assert.match(host, /const submitting = item\.workflow\?\.stage === 'submit'/)
  assert.match(host, /submitted \|\| submitting \|\| item\.workflow\?\.rework/)
})

test('开发引擎可切换：DSH / Claude Code，Claude 走后台会话与追加消息', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const settings = await readFile(new URL('../src/client/settings.mjs', import.meta.url), 'utf8')
  const automation = await readFile(new URL('../src/shared/automation.mjs', import.meta.url), 'utf8')
  const api = await readFile(new URL('../src/shared/api.mjs', import.meta.url), 'utf8')
  assert.match(automation, /DEVELOPER_ENGINES/)
  assert.match(api, /claude: '\/api\/dev-hub\/claude'/)
  assert.match(settings, /AI 引擎（开发 \/ 澄清 \/ 评审）/)
  assert.match(settings, /claudeAvailable/)
  assert.match(index, /API\.claude/)
  assert.match(index, /action: continueExisting \? 'send' : 'launch'/)
  assert.match(index, /sendToDeveloperSession/)
})

test('Windows 兼容：Claude CLI 的 .cmd/.bat 经 cmd.exe 启动', async () => {
  const { readFile } = await import('node:fs/promises')
  const host = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
  assert.match(host, /async function runExecutable/)
  assert.match(host, /process\.platform === 'win32'/)
  assert.match(host, /cmd\.exe|ComSpec/)
  assert.match(host, /runExecutable\(bin, args/)
})

test('Claude 联动 CLI：bridge token 路由、get/update 协议与绝对路径提示', async () => {
  const { readFile } = await import('node:fs/promises')
  const host = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
  const cli = await readFile(new URL('../bin/devhub.mjs', import.meta.url), 'utf8')
  assert.match(host, /CLAUDE_BRIDGES/)
  assert.match(host, /path: API.cli/)
  assert.match(host, /x-devhub-token/)
  assert.match(host, /CLAUDE_CLI/)
  assert.match(cli, /action: parsed\.action/)
  assert.match(cli, /taskText/)
  assert.match(cli, /changePoint/)
  assert.match(cli, /risk/)
})

test('Windows 路径：提交路径拒绝盘符/UNC，展示不再按 / 切割盘符', async () => {
  const { readFile } = await import('node:fs/promises')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const host = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
  assert.match(host, /const windowsAbsolute = \/\^\[A-Za-z\]:/)
  assert.match(host, /value\.startsWith/)
  assert.match(host, /windowsAbsolute/)
  assert.match(index, /repoBaseName\(repoPath\)/)
})

test('Claude 引擎覆盖澄清/评审，不只开发会话', async () => {
  const { readFile } = await import('node:fs/promises')
  const host = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
  const review = await readFile(new URL('../src/core/review.mjs', import.meta.url), 'utf8')
  assert.match(host, /async function runClaudeJson/)
  assert.match(host, /const clarifyEngine = projectAutomation/)
  assert.match(host, /clarifyEngine === 'dsh'/)
  assert.match(host, /const reviewEngine = projectAutomation/)
  assert.match(host, /reviewEngine !== 'dsh'/)
  assert.match(review, /reviewer.engine !== 'dsh'/)
})

test('Codex / Pi 引擎：澄清评审走结构化 CLI，开发走终端', async () => {
  const { readFile } = await import('node:fs/promises')
  const host = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
  const automation = await readFile(new URL('../src/shared/automation.mjs', import.meta.url), 'utf8')
  assert.match(automation, /'codex'/)
  assert.match(automation, /'pi'/)
  assert.match(host, /async function runCodexJson/)
  assert.match(host, /async function runPiJson/)
  assert.match(host, /runExternalJson\(reviewEngine/)
  assert.match(host, /runExternalJson\(clarifyEngine/)
  assert.match(host, /path: API.external/)
})
