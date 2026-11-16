import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'devhub-wizard-home-'))
process.env.DEVHUB_HOME = home

const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')
const { suggestModules, normalizeScope, scopeOverlap } = await import('../src/core/modules.mjs')
const { draftFromDescription, wizardSteps } = await import('../src/core/wizard.mjs')
const { parallelOverview, conflictsForScope } = await import('../src/core/parallel.mjs')

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-wizard-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'pom.xml'), '<project/>\n', 'utf8')
  await mkdir(join(dir, 'scripts'), { recursive: true })
  await writeFile(join(dir, 'scripts/check.sh'), '#!/bin/sh\nexit 0\n', 'utf8')
  for (const name of ['controller', 'service', 'source']) {
    const dir2 = join(dir, 'src/main/java/com/gitee/pipeline', name)
    await mkdir(dir2, { recursive: true })
    await writeFile(join(dir2, 'Sample.java'), 'class Sample {}\n', 'utf8')
  }
  await writeFile(join(dir, 'README.md'), '# demo\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

function fakeContext(repo) {
  const routes = new Map()
  const tools = new Map()
  const ctx = {
    webServer: { register(route) { routes.set(route.path, route); return () => {} } },
    sessions: { get(id) { return { header: { cwd: repo, id } } } },
    get(name) {
      if (name === 'tools') return { register(tool) { tools.set(tool.name, tool); return () => {} } }
      if (name === 'systemPrompt') return null
      return undefined
    },
    effect(fn) { fn(); return () => {} },
  }
  return { ctx, routes, tools }
}

function fakeResponse() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {} },
    end(body) { this.body = String(body ?? '') },
  }
}

async function call(routes, path, { method = 'GET', body, queryParams } = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(queryParams ?? {})) params.set(key, String(value))
  const url = path + (params.size ? '?' + params.toString() : '')
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.socket = { remoteAddress: '127.0.0.1' }
  const res = fakeResponse()
  const route = routes.get(path)
  assert.ok(route, `route missing: ${path}`)
  await route.handler(req, res)
  return { status: res.status, body: JSON.parse(res.body) }
}

test('wizard: 新增代码库即装好内置技能，可直接创建可并行的开发流程', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })

    const first = await call(routes, API.wizard)
    assert.equal(first.status, 200)
    // 新增代码库时已经初始化了内置技能：不再有"首次必须 bootstrap"的额外一步
    assert.equal(first.body.firstRun, false)
    assert.ok(first.body.conventions, '规范应已初始化')
    assert.ok((first.body.conventions.constraintsById ?? []).includes('layering'), '规范摘要里应包含分层约束')
    assert.ok(first.body.modules.some((module) => module.name === 'source' && module.kind === 'java-package'))
    assert.ok(first.body.steps.some((step) => step.id === 'start'))
    const onDisk = JSON.parse(await readFile(join(repo, '.dev-hub/conventions.json'), 'utf8'))
    assert.equal(onDisk.project.language, 'java')
    assert.equal(onDisk.workflow.parallelPolicy, 'scope-overlap-serial')

    const describe = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'describe', description: '给 Gerrit 源补 webhook 事件解析' },
    })
    assert.equal(describe.body.suggested.name, '给 Gerrit 源补 webhook 事件解析')
    assert.equal(describe.body.suggested.id, 'gerrit-webhook')

    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        description: '给 Gerrit 源补 webhook 事件解析',
        name: 'Gerrit webhook 事件解析',
        id: 'gerrit-webhook',
        scope: ['module:source'],
      },
    })
    assert.equal(created.status, 200)
    assert.equal(created.body.item.status, 'planned')
    assert.deepEqual(created.body.item.scope, ['module:source'])
    assert.deepEqual(created.body.item.scopeModules, ['module:source'])
    assert.equal(created.body.parallel.canParallel, true)

    const context = await call(routes, API.context, { method: 'POST', body: { id: 'gerrit-webhook' } })
    assert.match(context.body.context.prompt, /【项目约束】/)
    assert.match(context.body.context.prompt, /\[layering\]|\[scope\]/)

    const second = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        description: 'source 的 webhook 重试与去重',
        id: 'webhook-retry',
        scope: ['module:source'],
      },
    })
    assert.equal(second.status, 200)
    assert.equal(second.body.parallel.canParallel, false)
    assert.match(second.body.parallel.advice, /重叠/)

    // 阶段/状态现在由事实推导：绑定开发会话即视为进行中（手工改 status 会被推导覆盖）
    await call(routes, API.session, { method: 'POST', body: { action: 'bind', id: 'gerrit-webhook', sessionId: 'session-a' } })
    await call(routes, API.session, { method: 'POST', body: { action: 'bind', id: 'webhook-retry', sessionId: 'session-b' } })
    const parallel = await call(routes, API.parallel)
    assert.equal(parallel.body.canParallel, false)
    assert.equal(parallel.body.pairs.length, 1)
    assert.ok(parallel.body.active.some((flow) => flow.id === 'gerrit-webhook'))
    assert.equal(parallel.body.flows.length, 2)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('wizard: 第二次进入直接创建流程，不再要求初始化规范', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '李四' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })

    const state = await call(routes, API.wizard)
    assert.equal(state.body.firstRun, false)
    assert.ok(state.body.conventions.constraints > 0)

    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', description: 'controller 新增 v1 接口', scope: ['src/main/java/com/gitee/pipeline/controller'] },
    })
    assert.equal(created.status, 200)
    assert.equal(created.body.firstRun, false)

    const conventions = await call(routes, API.conventions)
    assert.equal(conventions.body.firstRun, false)
    assert.equal(conventions.body.path, '.dev-hub/conventions.json')
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('core: scope 归并与重叠判定', () => {
  assert.deepEqual(normalizeScope(['./a/', 'a', 'module:Source', 'module:source']), ['a', 'module:source'])
  assert.deepEqual(scopeOverlap(['src/main/java/com/gitee/pipeline'], ['src/main/java/com/gitee/pipeline/source']), ['src/main/java/com/gitee/pipeline'])
  assert.deepEqual(scopeOverlap(['module:source'], ['module:source']), ['module:source'])
  assert.deepEqual(scopeOverlap(['module:source'], ['module:controller']), [])
  assert.deepEqual(scopeOverlap(['a'], ['b']), [])
})

test('core: 描述生成名称与 id', () => {
  assert.equal(draftFromDescription('给 Gerrit 源补 webhook 事件解析').id, 'gerrit-webhook')
  assert.equal(draftFromDescription('support gitlab merge request hooks').name, 'support gitlab merge request hooks')
  const chineseOnly = draftFromDescription('补齐流水线标签功能').id
  assert.match(chineseOnly, /^flow-\d{8}-\d{4}$/)
  assert.deepEqual(
    wizardSteps({ firstRun: false, description: 'x', name: 'n', id: 'i', scope: ['a'] }).map((step) => step.done),
    [true, true, true, true, false],
  )
})

test('core: 并行概览与冲突检测', () => {
  const items = [
    { id: 'a', title: 'A', status: 'developing', scope: ['module:source'], scopeModules: ['module:source'] },
    { id: 'b', title: 'B', status: 'verifying', scope: ['module:controller'], scopeModules: [] },
    { id: 'c', title: 'C', status: 'done', scope: ['module:source'], scopeModules: [] },
  ]
  const overview = parallelOverview(items)
  assert.equal(overview.active.length, 2)
  assert.equal(overview.canParallel, true)
  assert.deepEqual(conflictsForScope(items, ['module:controller']), [
    { id: 'b', title: 'B', status: 'verifying', overlap: ['module:controller'] },
  ])
  assert.deepEqual(conflictsForScope(items, ['module:controller'], { ignoreId: 'b' }), [])
  // planned 的流程也算占用 scope：还没开工就不能再排一个改同一目录的流程
  const planned = [{ id: 'p', title: 'P', status: 'planned', scope: ['module:source'], scopeModules: [] }]
  assert.equal(conflictsForScope(planned, ['module:source']).length, 1)
  // done 的流程不再占用 scope（items 里 c 是 done 的 module:source，只剩 a 一个冲突）
  assert.equal(conflictsForScope(items, ['module:source']).length, 1)
})

test('recon 路由：按一句话带回候选文件与建议范围，并能带进流程与 Context Pack', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  const sourceFile = 'src/main/java/com/gitee/pipeline/source/Sample.java'
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await writeFile(join(repo, sourceFile), 'class Sample {\n  // webhook 重试\n}\n', 'utf8')

    const tooShort = await call(routes, API.recon, { method: 'POST', body: { description: 'x' } })
    assert.equal(tooShort.status, 400)
    assert.match(tooShort.body.error, /描述太短/)

    const recon = await call(routes, API.recon, { method: 'POST', body: { description: '给 source 的 Sample 加 webhook 重试' } })
    assert.equal(recon.status, 200)
    assert.ok(recon.body.tokens.includes('webhook'))
    assert.equal(recon.body.files[0].path, sourceFile)
    assert.ok(recon.body.files[0].matches.some((match) => /webhook/.test(match.text)))
    // 同名文件（controller/service 下也有 Sample.java）也会被列为候选，范围里包含 source 即可
    assert.ok(recon.body.suggestedScope.includes('src/main/java/com/gitee/pipeline/source'))

    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        description: '给 source 的 Sample 加 webhook 重试',
        id: 'webhook-retry',
        scope: recon.body.suggestedScope,
        recon: { tokens: recon.body.tokens, files: recon.body.files },
      },
    })
    assert.equal(created.status, 200)
    assert.equal(created.body.item.recon.files[0].path, sourceFile)
    assert.ok(created.body.item.recon.confirmedAt)
    assert.equal(created.body.item.workflow.rootProblem, '给 source 的 Sample 加 webhook 重试')

    const context = await call(routes, API.context, { method: 'POST', body: { id: 'webhook-retry' } })
    assert.match(context.body.context.prompt, /【目标文件与摘录】/)
    assert.match(context.body.context.prompt, /Sample\.java/)
    assert.match(context.body.context.prompt, /L2: \/\/ webhook 重试/)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('聊天式入口：一句话创建后可直接开工（默认值带入，门禁按 chat 分支）', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    const recon = await call(routes, API.recon, { method: 'POST', body: { description: '给 source 的 Sample 补 webhook 重试' } })

    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        entry: 'chat',
        description: '给 source 的 Sample 补 webhook 重试',
        id: 'chat-entry-check',
        scope: recon.body.suggestedScope,
        recon: { tokens: recon.body.tokens, files: recon.body.files },
      },
    })
    assert.equal(created.status, 200)
    const item = created.body.item
    assert.equal(item.workflow.entry, 'chat')
    assert.equal(item.workflow.rootProblem, '给 source 的 Sample 补 webhook 重试')
    assert.ok(item.workflow.plan.summary, '计划摘要自动带入')
    assert.ok(item.workflow.plan.steps.length >= 2)
    assert.ok(item.workflow.plan.estimate.days > 0)
    assert.equal(item.workflow.techDoc.decision, 'none')
    assert.ok(item.acceptance.length >= 2, '验收标准自动带入')
    assert.match(item.acceptance.join(' '), /本机自测/)

    const started = await call(routes, API.wizard, { method: 'POST', body: { action: 'start', id: 'chat-entry-check' } })
    assert.equal(started.status, 200, JSON.stringify(started.body))
    assert.ok(started.body.context.contextHash)
    assert.match(started.body.context.prompt, /【目标文件与摘录】/)
    assert.match(started.body.context.prompt, /【项目约束】/)
    assert.ok(started.body.item.baseline.commit)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('工作站自评计划：recon 带回追问与估算，/plan 出计划，create 落库后可直接开工', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    const sourceFile = 'src/main/java/com/gitee/pipeline/source/Sample.java'
    await writeFile(join(repo, sourceFile), 'class Sample {\n  // webhook 重试\n}\n', 'utf8')

    const recon = await call(routes, API.recon, { method: 'POST', body: { description: '给 source 的 Sample 补 webhook 重试' } })
    assert.equal(recon.status, 200)
    assert.ok(Array.isArray(recon.body.questions), 'recon 要带回追问')
    assert.ok(recon.body.estimate, 'recon 要带回自评工程量')
    assert.ok(recon.body.estimate.basis.length >= 3)
    assert.ok(['S', 'M', 'L', 'XL'].includes(recon.body.estimate.size))

    const planRes = await call(routes, API.plan, {
      method: 'POST',
      body: {
        description: '给 source 的 Sample 补 webhook 重试',
        recon: { tokens: recon.body.effectiveTokens, files: recon.body.files },
        scope: recon.body.suggestedScope,
        answers: { tests: 'add-tests' },
      },
    })
    assert.equal(planRes.status, 200)
    assert.ok(planRes.body.steps.length >= 3)
    assert.ok(planRes.body.acceptance.some((item) => /本机自测/.test(item)))
    assert.ok(planRes.body.estimate.days > 0)
    assert.match(planRes.body.steps.join(' '), /source/)

    // 用户只给一句话 + 回答追问，不需要填工程量
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        entry: 'chat',
        description: '给 source 的 Sample 补 webhook 重试',
        id: 'self-estimate-check',
        scope: recon.body.suggestedScope,
        recon: { tokens: recon.body.effectiveTokens, files: recon.body.files },
        plan: { summary: planRes.body.summary, steps: planRes.body.steps, acceptance: planRes.body.acceptance, estimate: planRes.body.estimate },
        questions: [{ id: 'tests', question: '要不要补测试', answer: 'add-tests' }],
      },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    const item = created.body.item
    assert.deepEqual(item.workflow.plan.steps, planRes.body.steps, '计划步骤来自工作站，不是模板')
    assert.equal(item.workflow.plan.estimate.days, planRes.body.estimate.days, '人天来自工作站自评')
    assert.equal(item.workflow.plan.estimate.notes, '工作站自评（estimateWork）')
    assert.equal(item.workflow.questions[0].answer, 'add-tests', '追问答案要存证')
    assert.ok(item.acceptance.some((entry) => /本机自测/.test(entry)))

    const started = await call(routes, API.wizard, { method: 'POST', body: { action: 'start', id: 'self-estimate-check' } })
    assert.equal(started.status, 200, JSON.stringify(started.body))
    assert.match(started.body.context.prompt, /【工作流】/)
    assert.match(started.body.context.prompt, /人日/)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('会话联动：绑定/解绑会话，列表返回状态，item 摘要带 session', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '会话联动验证', id: 'session-link', scope: ['src/main/java/com/gitee/pipeline/source'] },
    })
    assert.equal(created.status, 200)

    const bind = await call(routes, API.session, { method: 'POST', body: { action: 'bind', id: 'session-link', sessionId: 'session-abc' } })
    assert.equal(bind.status, 200)
    assert.equal(bind.body.item.session.id, 'session-abc')
    assert.ok(bind.body.item.session.boundAt)
    // 假 ctx 没有真实会话 → 明确说明而不是伪造运行中
    assert.equal(bind.body.session.sessionId, 'session-abc')
    assert.equal(bind.body.session.alive, false)
    assert.match(bind.body.session.reason, /不在当前进程中/)

    const items = await call(routes, API.items)
    assert.equal(items.body.items[0].session.id, 'session-abc')

    const sessions = await call(routes, API.sessions)
    assert.equal(sessions.status, 200)
    assert.equal(sessions.body.sessions.length, 1)
    assert.equal(sessions.body.sessions[0].itemId, 'session-link')
    assert.equal(sessions.body.sessions[0].sessionId, 'session-abc')

    const state = await call(routes, API.state)
    assert.equal(state.body.sessionStates.length, 1)

    const unbind = await call(routes, API.session, { method: 'POST', body: { action: 'unbind', id: 'session-link' } })
    assert.equal(unbind.body.item.session, null)
    const after = await call(routes, API.sessions)
    assert.deepEqual(after.body.sessions, [])
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('技能页：安装/卸载/自定义约束/重建默认，走真实路由', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })

    const list = await call(routes, API.skills)
    assert.equal(list.status, 200)
    assert.equal(list.body.profile, 'java')
    assert.ok(list.body.installed.length >= 2)
    assert.ok(list.body.catalog.some((pack) => pack.id === 'java-db'))
    assert.ok(list.body.constraints.every((entry) => entry.skill))
    assert.equal(list.body.path, '.dev-hub/conventions.json')

    // 卸载 java-db → 约束变少、技能不在已安装里
    const before = list.body.constraints.length
    const uninstall = await call(routes, API.skills, { method: 'POST', body: { action: 'uninstall', skillId: 'java-db' } })
    assert.equal(uninstall.status, 200)
    assert.equal(uninstall.body.changed, true)
    assert.ok(!uninstall.body.installed.some((entry) => entry.id === 'java-db'))
    assert.ok(uninstall.body.constraints.length < before)

    // 重新安装
    const install = await call(routes, API.skills, { method: 'POST', body: { action: 'install', skillId: 'java-db' } })
    assert.equal(install.body.changed, true)
    assert.ok(install.body.catalog.find((pack) => pack.id === 'java-db').installed)

    // 自定义约束：增 → 改 → 删
    const added = await call(routes, API.skills, {
      method: 'POST',
      body: { action: 'addConstraint', constraint: { id: 'team-rule', title: '团队规则', rule: '提交前找 owner 过一遍', check: { kind: 'checklist', value: 'owner' } } },
    })
    assert.equal(added.status, 200)
    assert.ok(added.body.constraints.some((entry) => entry.id === 'team-rule' && entry.skill === 'custom'))

    const updated = await call(routes, API.skills, {
      method: 'POST',
      body: { action: 'updateConstraint', constraint: { id: 'team-rule', title: '团队规则（改）' } },
    })
    assert.ok(updated.body.constraints.find((entry) => entry.id === 'team-rule').title.includes('改'))

    const removed = await call(routes, API.skills, { method: 'POST', body: { action: 'removeConstraint', id: 'team-rule' } })
    assert.ok(!removed.body.constraints.some((entry) => entry.id === 'team-rule'))
    // 内置约束不能直接删
    const guarded = await call(routes, API.skills, { method: 'POST', body: { action: 'removeConstraint', id: 'layering' } })
    assert.equal(guarded.status, 400)
    assert.match(guarded.body.error, /卸载对应技能包/)

    // 重建默认：仍保留已安装集合
    const regen = await call(routes, API.skills, { method: 'POST', body: { action: 'regenerate' } })
    assert.equal(regen.status, 200)
    assert.ok(regen.body.constraints.some((entry) => entry.skill === 'java-layering'))

    // 未知动作明确报错
    const bad = await call(routes, API.skills, { method: 'POST', body: { action: 'nope' } })
    assert.equal(bad.status, 400)
    assert.match(bad.body.error, /未知技能动作/)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('切换代码库：复用环境缓存（detect:false）更快，且返回的 items 属于目标库', async () => {
  const repoA = await tempRepo()
  const repoB = await tempRepo()
  const { ctx, routes } = fakeContext(repoA)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repoA, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: 'A 库的流程', id: 'flow-a', scope: ['src'] },
    })
    // 初始化 B 库（会探测一次环境并缓存）
    const first = await call(routes, API.switchRepo, { method: 'POST', body: { repoPath: repoB, name: '张三' } })
    assert.equal(first.status, 200)
    assert.ok(first.body.env, '首次切换必须探测')
    assert.equal(first.body.items.length, 0)
    // macOS 上 /var → /private/var，比较 canonical 后的路径
    assert.ok(first.body.profile.repos.some((path) => path.endsWith(repoB.split('/').pop())))

    // 切回 A：复用缓存（detect:false 不应报错），items 是 A 的
    const back = await call(routes, API.switchRepo, { method: 'POST', body: { repoPath: repoA, name: '张三', detect: false } })
    assert.equal(back.status, 200)
    assert.ok(back.body.env, '复用缓存也要带 env')
    assert.deepEqual(back.body.items.map((item) => item.id), ['flow-a'])
    assert.ok(back.body.repo.path.endsWith(repoA.split('/').pop()))

    // 再切 B 并显式 detect:true 也正常
    const again = await call(routes, API.switchRepo, { method: 'POST', body: { repoPath: repoB, name: '张三', detect: true } })
    assert.equal(again.status, 200)
    assert.deepEqual(again.body.items, [])
  } finally {
    await rm(repoA, { recursive: true, force: true })
    await rm(repoB, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('内嵌会话内容：session-log 返回状态与最近消息；未绑定给原因', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '会话内容内嵌', id: 'log-check', scope: ['src'] },
    })

    const unbound = await call(routes, API.sessionLog, { queryParams: { itemId: 'log-check' } })
    assert.equal(unbound.status, 200)
    assert.equal(unbound.body.sessionId, null)
    assert.match(unbound.body.reason, /未绑定/)
    assert.deepEqual(unbound.body.messages, [])

    await call(routes, API.session, { method: 'POST', body: { action: 'bind', id: 'log-check', sessionId: 'session-log-1' } })
    const bound = await call(routes, API.sessionLog, { queryParams: { itemId: 'log-check', limit: 10 } })
    assert.equal(bound.status, 200)
    assert.equal(bound.body.sessionId, 'session-log-1')
    // 假 ctx 没有真实会话：明确说"不在当前进程中"，不伪造对话
    assert.equal(bound.body.alive, false)
    assert.match(bound.body.reason, /不在当前进程中/)

    const missing = await call(routes, API.sessionLog, { queryParams: { itemId: 'nope' } })
    assert.equal(missing.status, 400)
    assert.match(missing.body.error, /开发项不存在/)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('跨仓库反查：lookup 能指出会话属于哪个仓库的哪个流程', async () => {
  const repoA = await tempRepo()
  const repoB = await tempRepo()
  const { ctx, routes } = fakeContext(repoA)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repoA, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: 'A 库的会话流程', id: 'flow-a', scope: ['src'] },
    })
    await call(routes, API.session, { method: 'POST', body: { action: 'bind', id: 'flow-a', sessionId: 'session-a' } })

    // 再把 B 库初始化并激活（模拟用户切到别的开发站）
    await call(routes, API.switchRepo, { method: 'POST', body: { repoPath: repoB, name: '张三' } })

    const found = await call(routes, API.lookup, { queryParams: { sessionId: 'session-a' } })
    assert.equal(found.status, 200)
    assert.equal(found.body.matches.length, 1)
    assert.ok(found.body.matches[0].repo.path.endsWith(repoA.split('/').pop()), '要指出是 A 仓库')
    assert.equal(found.body.matches[0].item.id, 'flow-a')
    assert.equal(found.body.matches[0].item.title, 'A 库的会话流程')

    const none = await call(routes, API.lookup, { queryParams: { sessionId: 'session-nope' } })
    assert.deepEqual(none.body.matches, [])
    const missing = await call(routes, API.lookup, { queryParams: {} })
    assert.equal(missing.status, 400)
  } finally {
    await rm(repoA, { recursive: true, force: true })
    await rm(repoB, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('可复现性：创建流程记录指纹；repro 同输入一致，改答案后提示输入已变', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create', entry: 'chat', description: '给 Sample 加 webhook',
        id: 'repro-check', scope: ['src/main/java/com/gitee/pipeline/source'],
        answers: { tests: { selected: ['add-tests'] } },
        plan: { summary: 's', steps: ['a', 'b'], acceptance: ['x'], estimate: { size: 'S', days: 1 } },
      },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    const item = created.body.item
    assert.equal(item.description, '给 Sample 加 webhook')
    assert.deepEqual(item.answers, { tests: { selected: ['add-tests'] } })
    assert.ok(item.provenance?.plan?.hash, '必须记录 plan hash')
    assert.ok(item.provenance?.plan?.inputHash, '必须记录 input hash')

    const repro = await call(routes, API.repro, { method: 'POST', body: { id: 'repro-check' } })
    assert.equal(repro.status, 200)
    assert.equal(repro.body.recorded, true)
    assert.equal(repro.body.inputChanged, false)
    assert.equal(repro.body.same, true, JSON.stringify(repro.body).slice(0, 400))

    // 改答案（模拟"两个人在追问上给了不同回答"）→ input hash 变
    const raw = JSON.parse(await readFile(join(repo, '.dev-hub/items/repro-check.json'), 'utf8'))
    raw.answers = { tests: { selected: ['no-tests'] } }
    await writeFile(join(repo, '.dev-hub/items/repro-check.json'), JSON.stringify(raw, null, 2), 'utf8')
    const after = await call(routes, API.repro, { method: 'POST', body: { id: 'repro-check' } })
    assert.equal(after.body.inputChanged, true)
    assert.equal(after.body.same, false)
    assert.match(after.body.message, /输入已变化/)

    // save=true 重新记录指纹
    const saved = await call(routes, API.repro, { method: 'POST', body: { id: 'repro-check', save: true } })
    assert.ok(saved.body.item?.provenance?.plan?.hash)
    const again = await call(routes, API.repro, { method: 'POST', body: { id: 'repro-check' } })
    assert.equal(again.body.same, true, '重算并记录后，指纹与当前输入一致')
    assert.equal(again.body.planChanged, false)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('模板验收可执行：check 路由只跑登记命令；未通过时提交被挡', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create', entry: 'chat', description: '给 source 新增一个源',
        id: 'check-run', scope: ['src/main/java/com/gitee/pipeline/source'],
      },
    })
    assert.equal(created.status, 200)
    const item = created.body.item
    assert.ok((item.checks ?? []).length >= 1, '新流程应带模板验收')
    assert.ok((item.references ?? []).length >= 1, '新流程应带参考实现')
    assert.ok(item.workflow?.plan?.template?.id, '计划里应记录模板 id')

    // 只允许运行登记过的 checkId
    const unknown = await call(routes, API.check, { method: 'POST', body: { id: 'check-run', checkId: 'nope' } })
    assert.equal(unknown.status, 400)
    assert.match(unknown.body.error, /验收项不存在/)

    // 跑一个真实可执行的命令：把 test 项命令替换成 node -e exit 0
    const raw = JSON.parse(await readFile(join(repo, '.dev-hub/items/check-run.json'), 'utf8'))
    raw.checks = raw.checks.map((check) => (check.command ? { ...check, command: 'node -e "process.exit(0)"' } : check))
    await writeFile(join(repo, '.dev-hub/items/check-run.json'), JSON.stringify(raw, null, 2), 'utf8')
    const checkId = raw.checks.find((check) => check.command).id
    const run = await call(routes, API.check, { method: 'POST', body: { id: 'check-run', checkId } })
    assert.equal(run.status, 200)
    assert.equal(run.body.ok, true)
    assert.equal(run.body.item.checks.find((entry) => entry.id === checkId).status, 'passed')

    // 还有未运行的命令型验收时，提交会被挡（先制造一条 failed）
    const raw2 = JSON.parse(await readFile(join(repo, '.dev-hub/items/check-run.json'), 'utf8'))
    raw2.checks = raw2.checks.map((check) => (check.command ? { ...check, status: 'not_run' } : check))
    raw2.workflow.tests = { local: { status: 'passed' }, environment: { status: 'passed' } }
    await writeFile(join(repo, '.dev-hub/items/check-run.json'), JSON.stringify(raw2, null, 2), 'utf8')
    const blocked = await call(routes, API.submit, {
      method: 'POST', body: { id: 'check-run', paths: ['README.md'], message: 'x', push: false },
    })
    assert.equal(blocked.status, 400)
    assert.match(blocked.body.error, /还有验收项没通过/)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('变更预览：files/diff 路由返回未提交改动与 diff 行', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '变更预览验证', id: 'diff-check', scope: ['README.md'] },
    })
    assert.equal(created.status, 200)

    // 改一个已跟踪文件 + 新增一个未跟踪文件
    await writeFile(join(repo, 'README.md'), '# demo changed\n', 'utf8')
    await writeFile(join(repo, 'NEW.md'), 'hello\nworld\n', 'utf8')

    const files = await call(routes, API.files, { queryParams: { itemId: 'diff-check' } })
    assert.equal(files.status, 200)
    assert.ok(files.body.files.some((file) => file.path === 'README.md'))
    assert.ok(files.body.files.some((file) => file.path === 'NEW.md' && file.status === 'added'))
    const readme = files.body.files.find((file) => file.path === 'README.md')
    assert.equal(readme.inScope, true, 'scope 内的文件要标出来')

    const diff = await call(routes, API.diff, { queryParams: { itemId: 'diff-check', path: 'README.md' } })
    assert.equal(diff.status, 200)
    assert.ok(diff.body.file.lines.some((line) => line.type === 'added' && line.text.includes('demo changed')))

    const untracked = await call(routes, API.diff, { queryParams: { itemId: 'diff-check', path: 'NEW.md' } })
    assert.equal(untracked.body.file.mode, 'untracked')
    assert.equal(untracked.body.file.added, 2)

    const missingPath = await call(routes, API.diff, { queryParams: { itemId: 'diff-check' } })
    assert.equal(missingPath.status, 400)
    assert.match(missingPath.body.error, /缺少 path/)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('变更文件说明：files 返回默认说明；file-note 可覆盖并可清除', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '文件说明验证', id: 'note-check', scope: ['README.md'] },
    })
    await writeFile(join(repo, 'README.md'), '# changed\n', 'utf8')

    const files = await call(routes, API.files, { queryParams: { itemId: 'note-check' } })
    const readme = files.body.files.find((file) => file.path === 'README.md')
    assert.equal(readme.noteSource, 'auto')
    assert.ok(readme.note, '应有默认的修改意义')

    const saved = await call(routes, API.fileNote, {
      method: 'POST', body: { id: 'note-check', path: 'README.md', note: '更新了安装说明' },
    })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.source, 'human')
    const after = await call(routes, API.files, { queryParams: { itemId: 'note-check' } })
    const noted = after.body.files.find((file) => file.path === 'README.md')
    assert.equal(noted.note, '更新了安装说明')
    assert.equal(noted.noteSource, 'human')

    await call(routes, API.fileNote, { method: 'POST', body: { id: 'note-check', path: 'README.md', note: '' } })
    const cleared = await call(routes, API.files, { queryParams: { itemId: 'note-check' } })
    assert.equal(cleared.body.files.find((file) => file.path === 'README.md').noteSource, 'auto')

    const bad = await call(routes, API.fileNote, { method: 'POST', body: { id: 'note-check', path: '../x', note: 'x' } })
    assert.equal(bad.status, 400)
    assert.match(bad.body.error, /非法的文件路径/)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('删除流程：只删台账，重复删除报不存在', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '要删掉的流程', id: 'to-delete', scope: ['src'] },
    })
    await writeFile(join(repo, 'CODE.txt'), 'keep me\n', 'utf8')

    const removed = await call(routes, API.deleteItem, { method: 'POST', body: { id: 'to-delete' } })
    assert.equal(removed.status, 200)
    assert.equal(removed.body.deleted, true)
    const items = await call(routes, API.items)
    assert.deepEqual(items.body.items.map((item) => item.id), [])
    // 代码文件不受影响
    assert.equal(await readFile(join(repo, 'CODE.txt'), 'utf8'), 'keep me\n')
    // 删除前会留一份可恢复的副本
    const { readdir } = await import('node:fs/promises')
    const trash = await readdir(join(repo, '.dev-hub', '.trash')).catch(() => [])
    assert.ok(trash.some((name) => name.startsWith('to-delete-') && name.endsWith('.json')), '删除应留 trash 副本')

    const again = await call(routes, API.deleteItem, { method: 'POST', body: { id: 'to-delete' } })
    assert.equal(again.status, 400)
    assert.match(again.body.error, /不存在/)
    const missing = await call(routes, API.deleteItem, { method: 'POST', body: {} })
    assert.equal(missing.status, 400)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('需求澄清：agent 不可用时降级为本地规则，不阻断创建', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })

    const clarify = await call(routes, API.clarify, {
      method: 'POST',
      body: { description: '给 source 加个告警', history: [{ role: 'user', text: '给 source 加个告警' }], round: 1, recon: { files: [], suggestedScope: ['src'] } },
    })
    assert.equal(clarify.status, 200)
    assert.equal(clarify.body.engine, 'local', '测试环境没有 agents 服务，应降级')
    assert.equal(clarify.body.degraded, true)
    assert.ok(Array.isArray(clarify.body.questions))
    assert.ok(clarify.body.questions.length <= 2)

    const short = await call(routes, API.clarify, { method: 'POST', body: { description: 'x' } })
    assert.equal(short.status, 400)
    assert.match(short.body.error, /先写一句要做什么/)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('新增代码库：没用工作站开发过就直接初始化内置技能；已有规范不覆盖', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    const setup = await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    assert.equal(setup.status, 200, JSON.stringify(setup.body).slice(0, 300))
    assert.equal(setup.body.skills?.initialized, true, '首次新增应初始化内置技能')
    assert.ok((setup.body.skills.installedSkills ?? []).length >= 2, '默认技能包应装好')
    assert.ok(setup.body.skills.constraints >= 3)

    const conventions = JSON.parse(await readFile(join(repo, '.dev-hub/conventions.json'), 'utf8'))
    assert.ok((conventions.installedSkills ?? []).length >= 2)
    assert.ok((conventions.constraints ?? []).length >= 3)

    // 再次新增（模拟换一台机器/换人重新添加）：不应覆盖已有规范
    await writeFile(join(repo, '.dev-hub/conventions.json'), JSON.stringify({ ...conventions, custom: 'keep' }, null, 2), 'utf8')
    const again = await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '李四' } })
    assert.equal(again.status, 200)
    assert.equal(again.body.skills?.initialized, false)
    assert.equal(again.body.skills?.alreadyHad, true)
    const kept = JSON.parse(await readFile(join(repo, '.dev-hub/conventions.json'), 'utf8'))
    assert.equal(kept.custom, 'keep', '已有规范不能被覆盖')
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('新增代码库：前端框架仓库自动装 frontend-ui，纯 Node 仓库不装', async () => {
  const frontendRepo = await mkdtemp(join(tmpdir(), 'devhub-frontend-repo-'))
  const backendRepo = await mkdtemp(join(tmpdir(), 'devhub-node-repo-'))
  const { ctx, routes } = fakeContext(frontendRepo)
  try {
    apply(ctx)
    await writeFile(
      join(frontendRepo, 'package.json'),
      JSON.stringify({ name: 'web', dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' } }),
      'utf8',
    )
    const setup = await call(routes, API.setup, { method: 'POST', body: { repoPath: frontendRepo, name: '张三' } })
    assert.equal(setup.status, 200, JSON.stringify(setup.body).slice(0, 300))
    assert.ok((setup.body.skills?.installedSkills ?? []).includes('frontend-ui'), '前端仓库应自动装前端原型包')
    const conventions = JSON.parse(await readFile(join(frontendRepo, '.dev-hub/conventions.json'), 'utf8'))
    assert.equal(conventions.project.frontend, true)
    assert.deepEqual(conventions.project.frameworks, ['react', 'react-dom'])
    assert.ok(conventions.constraints.some((entry) => entry.skill === 'frontend-ui' && entry.id === 'ui-tokens'))

    await writeFile(
      join(backendRepo, 'package.json'),
      JSON.stringify({ name: 'cli', dependencies: { express: '^4.19.0' }, devDependencies: { vitest: '^2' } }),
      'utf8',
    )
    const backendSetup = await call(routes, API.setup, { method: 'POST', body: { repoPath: backendRepo, name: '张三' } })
    assert.equal(backendSetup.status, 200, JSON.stringify(backendSetup.body).slice(0, 300))
    assert.ok(!(backendSetup.body.skills?.installedSkills ?? []).includes('frontend-ui'), '纯 Node 仓库不应自动装前端包')
    const backendConventions = JSON.parse(await readFile(join(backendRepo, '.dev-hub/conventions.json'), 'utf8'))
    assert.equal(backendConventions.project.frontend, false)
    assert.equal(backendConventions.project.language, 'node')
  } finally {
    await rm(frontendRepo, { recursive: true, force: true })
    await rm(backendRepo, { recursive: true, force: true })
  }
})

test('代码库卡片：state 带 exists；removed 路径标记失效；可从列表移除', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    const setup = await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    assert.equal(setup.status, 200)
    const cards = setup.body.profile.repoCards
    assert.ok(cards.some((card) => card.path.endsWith(repo.split('/').pop()) && card.exists === true), '刚添加的库应 exists=true')

    // 制造一个"路径已被移除"的库卡片（独立目录，否则 findRepoRoot 会认到父仓库）
    const gone = await mkdtemp(join(tmpdir(), 'devhub-gone-'))
    await writeFile(join(gone, 'pom.xml'), '<project/>\n', 'utf8')
    await call(routes, API.setup, { method: 'POST', body: { repoPath: gone, name: '张三' } })
    await rm(gone, { recursive: true, force: true })
    // 激活切回正常仓库，再看卡片（激活库失效时 state 会走 needsSetup 分支）
    await call(routes, API.switchRepo, { method: 'POST', body: { repoPath: repo, name: '张三', detect: false } })
    const state = await call(routes, API.state)
    const goneName = gone.split('/').filter(Boolean).pop()
    const goneCard = state.body.profile.repoCards.find((card) => card.path.endsWith(goneName))
    assert.equal(goneCard?.exists, false, '不存在的路径应标记 exists=false')

    // 移除失效卡片
    const removed = await call(routes, API.removeRepo, { method: 'POST', body: { repoPath: gone } })
    assert.equal(removed.status, 200)
    assert.ok(String(removed.body.removed).endsWith(goneName))
    assert.ok(!removed.body.state.profile.repoCards.some((card) => card.path.endsWith(goneName)))
    // 磁盘上的原始仓库不受影响
    assert.ok(await readFile(join(repo, 'pom.xml'), 'utf8').then(() => true))

    const missing = await call(routes, API.removeRepo, { method: 'POST', body: { repoPath: '/not/registered' } })
    assert.equal(missing.status, 400)
    assert.match(missing.body.error, /不在列表里/)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('变更说明自动生成：无 agent 时返回可解释的失败，不写假说明', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'create', entry: 'chat', description: '说明自动生成验证', id: 'notes-auto', scope: ['README.md'] } })
    await writeFile(join(repo, 'README.md'), '# changed again\n', 'utf8')

    const result = await call(routes, API.genFileNotes, { method: 'POST', body: { id: 'notes-auto' } })
    assert.equal(result.status, 200)
    assert.equal(result.body.ok, false, '没有 agents 服务时应明确失败')
    assert.match(result.body.error, /自动补说明暂不可用/)

    const files = await call(routes, API.files, { queryParams: { itemId: 'notes-auto' } })
    const readme = files.body.files.find((file) => file.path === 'README.md')
    assert.equal(readme.noteSource, 'auto', '失败时不应写入假说明')
    assert.ok(readme.note, '仍然有确定性的默认说明兜底')
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('流程状态感知：state 带 attention / attentionCount（待答、待跑测试、待提交）', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'create', entry: 'chat', description: '关注信号验证', id: 'attn', scope: ['src'] } })
    // 需求规范化：目标/根因先整理成可执行表述，否则 attention 会先提示"需求还没规范化"
    await call(routes, API.requirement, {
      method: 'POST',
      body: {
        id: 'attn',
        spec: {
          problem: '流程状态缺少统一的“需要你处理”信号',
          goals: ['按台账与会话事实推导并展示需要处理的信号'],
          acceptance: ['新流程提示下一步'],
        },
      },
    })
    const st = await call(routes, API.state)
    const item = st.body.items.find((entry) => entry.id === 'attn')
    assert.ok(item.attention, '没有会话的新流程必须提示"还没开发会话"')
    assert.equal(item.attention.kind, 'no-session')
    assert.ok(st.body.attentionCount >= 1)

    // 绑定一个会话（没任务、没跑测试，会话空闲）→ 不能再提示"可以跑本机自测"：
    // 开发任务没做完/没有任务时，attention 应为 null（旧逻辑在这里误报 ready-test）。
    await call(routes, API.session, { method: 'POST', body: { action: 'bind', id: 'attn', sessionId: 's-attn' } })
    const st2 = await call(routes, API.state)
    const bound = st2.body.items.find((entry) => entry.id === 'attn')
    assert.equal(bound.running, false, '没有 live 会话事件时 running 必须是 false，不能伪装成在跑')
    assert.equal(bound.attention, null, '绑定会话但任务未完成时不能提示可以跑本机自测')
    // GET /items 与 /state 同源：items 也带 running/attention（loadItems 覆盖后不丢信号）
    const listed = await call(routes, API.items)
    const listedItem = listed.body.items.find((entry) => entry.id === 'attn')
    assert.equal(listedItem.running, false)
    assert.equal(listedItem.attention, null)

    // 本机自测通过 → 先派独立评审；评审通过 → 可以跑环境测试；环境也过 → 可以提交
    const raw = JSON.parse(await readFile(join(repo, '.dev-hub/items/attn.json'), 'utf8'))
    raw.workflow.review = { reviewers: [{ status: 'passed', verdict: 'pass' }] }
    raw.workflow.tests = { local: { status: 'passed' }, environment: { status: 'not_run' } }
    await writeFile(join(repo, '.dev-hub/items/attn.json'), JSON.stringify(raw, null, 2), 'utf8')
    const st3 = await call(routes, API.state)
    assert.equal(st3.body.items.find((entry) => entry.id === 'attn').attention.kind, 'ready-env')

    raw.workflow.tests.environment = { status: 'passed' }
    await writeFile(join(repo, '.dev-hub/items/attn.json'), JSON.stringify(raw, null, 2), 'utf8')
    const st4 = await call(routes, API.state)
    assert.equal(st4.body.items.find((entry) => entry.id === 'attn').attention.kind, 'ready-submit')
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('非 git 仓库：没有提交环节，测试通过即完成', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-nogit-'))
  const { ctx, routes } = fakeContext(dir)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: dir, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'create', entry: 'chat', description: '非 git 仓库流程', id: 'nogit', scope: ['src'] } })
    const item = (await call(routes, API.item, { queryParams: { id: 'nogit' } })).body.item
    assert.equal(item.workflow.gitRepo, false, '创建时要记录不是 git 仓库')

    // 提交接口直接拒绝
    const submit = await call(routes, API.submit, { method: 'POST', body: { id: 'nogit', paths: ['x'], message: 'x' } })
    assert.equal(submit.status, 400)
    assert.match(submit.body.error, /不是 git 仓库/)

    // 两项测试通过 → 阶段自动完成（没有 submit 阶段）
    const raw = JSON.parse(await readFile(join(dir, '.dev-hub/items/nogit.json'), 'utf8'))
    raw.workflow.tests = { local: { status: 'passed' }, environment: { status: 'passed' } }
    await writeFile(join(dir, '.dev-hub/items/nogit.json'), JSON.stringify(raw, null, 2), 'utf8')
    const after = (await call(routes, API.item, { queryParams: { id: 'nogit' } })).body.item
    assert.equal(after.workflow.stage, 'done')
    assert.equal(after.status, 'done')
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('流程类型：创建时按描述记录 intent（bug / feature），并进计划', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    const bug = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '修复上传大文件 500 报错', id: 'bugflow', scope: ['src'] },
    })
    assert.equal(bug.body.item.workflow.intent, 'bug')
    const feature = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '新增 Gerrit 源支持', id: 'featflow', scope: ['src'] },
    })
    assert.equal(feature.body.item.workflow.intent, 'feature')
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('流程类型：分析类描述自动识别为 analysis，显式 analysis 不被 detectIntent 降级', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })

    // 自动识别：分析类描述 → analysis，并生成只读计划
    const autoPlan = await call(routes, API.plan, {
      method: 'POST', body: { description: '分析下这条调用链', scope: ['src'] },
    })
    assert.equal(autoPlan.status, 200, JSON.stringify(autoPlan.body).slice(0, 300))
    assert.equal(autoPlan.body.intent, 'analysis')
    assert.equal(autoPlan.body.template.id, 'analysis')
    assert.match(autoPlan.body.steps.join('\n'), /只读排查/)
    assert.ok(autoPlan.body.acceptance.some((text) => /不改代码、不建 worktree、不产生提交/.test(text)))

    const auto = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        entry: 'chat',
        description: '分析下这条调用链',
        id: 'analysis-auto',
        scope: ['src'],
        plan: autoPlan.body,
      },
    })
    assert.equal(auto.status, 200, JSON.stringify(auto.body).slice(0, 300))
    assert.equal(auto.body.item.workflow.intent, 'analysis')
    assert.equal(auto.body.item.workflow.plan.template.id, 'analysis')
    assert.match(auto.body.item.workflow.plan.steps.join('\n'), /只读排查/)
    assert.ok(auto.body.item.acceptance.some((text) => /只读/.test(text)))

    // 显式 analysis：描述里全是 bug 词，计划接口也不能按 detectIntent 降级回 bug
    const explicitPlan = await call(routes, API.plan, {
      method: 'POST', body: { description: '修复上传大文件 500 报错', intent: 'analysis', scope: ['src'] },
    })
    assert.equal(explicitPlan.body.intent, 'analysis')
    assert.match(explicitPlan.body.steps.join('\n'), /只读排查/)

    const explicit = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        entry: 'chat',
        description: '修复上传大文件 500 报错',
        intent: 'analysis',
        id: 'analysis-explicit',
        scope: ['src'],
        plan: explicitPlan.body,
      },
    })
    assert.equal(explicit.status, 200, JSON.stringify(explicit.body).slice(0, 300))
    assert.equal(explicit.body.item.workflow.intent, 'analysis', '创建入口显式传入的 analysis 必须保留')
    assert.equal(explicit.body.item.workflow.plan.intent, 'analysis')
    assert.equal(explicit.body.item.workflow.plan.template.id, 'analysis')

    // 同时出现分析词与 bug 词：自动判定仍以 bug 为准
    const mixed = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '分析一下这个 bug 为什么 500 报错', id: 'analysis-mixed', scope: ['src'] },
    })
    assert.equal(mixed.body.item.workflow.intent, 'bug')
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('analysis：开始分析不建 worktree，提交入口直接拒绝', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    // 先有一个进行中的流程：若分析流程走通用分支，hasActiveSibling 会触发独立工作区
    const other = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '新增一个导出功能', id: 'other-flow', scope: ['src'] },
    })
    assert.equal(other.status, 200)
    const otherStart = await call(routes, API.start, { method: 'POST', body: { id: 'other-flow' } })
    assert.equal(otherStart.status, 200)
    assert.ok(otherStart.body.worktree?.branch, '普通开发流程默认独立工作区')

    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '分析下这条调用链', id: 'analysis-start', scope: ['src'] },
    })
    assert.equal(created.status, 200)
    const started = await call(routes, API.start, { method: 'POST', body: { id: 'analysis-start' } })
    assert.equal(started.status, 200, JSON.stringify(started.body).slice(0, 300))
    assert.equal(started.body.worktree, undefined, '分析流程不建独立工作区')
    assert.equal(started.body.item.workflow.worktree, undefined)
    assert.match(started.body.item.history.at(-1).message, /只读分析/)

    const submit = await call(routes, API.submit, {
      method: 'POST',
      body: { id: 'analysis-start', paths: ['README.md'], message: 'should not commit' },
    })
    assert.equal(submit.status, 400)
    assert.match(submit.body.error, /只读/)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('虚拟库：创建两个库的组合、切换后 recon 合并、流程记录归属', async () => {
  const repoA = await tempRepo()
  const repoB = await tempRepo()
  const { ctx, routes } = fakeContext(repoA)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repoA, name: '张三' } })
    const ws = await call(routes, API.workspaces, {
      method: 'POST', body: { name: '前后端组合', repos: [repoA, repoB] },
    })
    assert.equal(ws.status, 200, JSON.stringify(ws.body).slice(0, 300))
    assert.equal(ws.body.workspace.name, '前后端组合')
    assert.equal(ws.body.workspace.repos.length, 2)
    assert.equal(ws.body.state.workspace?.name, '前后端组合')

    // 激活状态指向虚拟库；它的台账/规范在本机独立目录，不落任何成员库
    const state = await call(routes, API.state)
    assert.equal(state.body.workspace?.name, '前后端组合')
    assert.equal(state.body.workspace.repos.length, 2)

    // 虚拟库的 recon 会逐成员扫描并带 repo 信息
    const recon = await call(routes, API.recon, {
      method: 'POST', body: { description: '给 source 加告警', reconAll: true },
    })
    assert.equal(recon.status, 200)
    assert.equal(recon.body.workspace?.name, '前后端组合')
    assert.equal((recon.body.members ?? []).length, 2)

    // 建流程后记录 repos + workspace：scope 必须带成员库前缀（成员库平权）
    const memberNames = (ws.body.state.workspace.members ?? []).map((member) => member.name)
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '联动改造', id: 'wsflow', scope: memberNames.map((name) => `${name}:src`) },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body).slice(0, 400))
    const item = (await call(routes, API.item, { queryParams: { id: 'wsflow' } })).body.item
    assert.equal(item.workspace?.name, '前后端组合')
    assert.equal(item.repos?.length, 2)
    // 虚拟库台账在本机目录，成员库 B 一个 .dev-hub 都没有
    assert.ok(created.body.ledger.path.includes('workspaces'), created.body.ledger.path)
    await assert.rejects(() => stat(join(repoB, '.dev-hub')))

    // 切回普通代码库
    const back = await call(routes, API.switchRepo, { method: 'POST', body: { repoPath: repoB, name: '张三', detect: false } })
    assert.equal(back.body.workspace, null)
  } finally {
    await rm(repoA, { recursive: true, force: true })
    await rm(repoB, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('统一入口：dispatch 在 agent 不可用时按关键词分诊，并记录台账', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'create', entry: 'chat', description: '统一入口验证', id: 'dispatch-flow', scope: ['src'] } })

    // 补台账（关键词命中）
    const ledger = await call(routes, API.dispatch, { method: 'POST', body: { id: 'dispatch-flow', message: '验收再加一条失败要能回滚' } })
    assert.equal(ledger.status, 200)
    assert.equal(ledger.body.engine, 'local')
    assert.equal(ledger.body.action, 'ledger')
    // 降级时不做字段改写（不编造），但要把这次分诊记进 history
    assert.ok((ledger.body.item.history ?? []).some((entry) => entry.type === 'dispatch'), JSON.stringify(ledger.body.item.history ?? []))

    // 要求开工但没绑会话 → 仍然降级成 ledger，并说明
    const session = await call(routes, API.dispatch, { method: 'POST', body: { id: 'dispatch-flow', message: '继续把代码改完' } })
    assert.equal(session.body.action, 'ledger')
    assert.match(session.body.reply, /关键词|暂不可用/)

    const short = await call(routes, API.dispatch, { method: 'POST', body: { id: 'dispatch-flow', message: 'x' } })
    assert.equal(short.status, 400)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})
