import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { loadLocaleBundle } from '../src/host/locales.mjs'
import { finalizeLocaleBundle, normalizeLocaleDictionary } from '../src/shared/locale.mjs'
import { API } from '../src/shared/api.mjs'
import {
  h,
  LocaleProvider,
  LOCALE_NAMESPACE,
  LOCALE_ENDPOINT,
  installLocaleDictionaries,
  loadLocaleDictionaries,
  normalizeLocalePayload,
  setActiveLocaleForTest,
} from '../src/client/i18n.mjs'
import { extractChineseTemplates, extractStaticChineseStrings } from './helpers/static-strings.mjs'

/** 最小 DSH locale 运行时：字典注册、语言定义、fallback 链与订阅。 */
function createLocaleService({ active = 'zh', registered = [] } = {}) {
  const languages = new Map([
    ['zh', { id: 'zh', label: '中文' }],
    ['en', { id: 'en', label: 'English' }],
  ])
  const dictionaries = new Map()
  const listeners = new Set()
  const added = []
  let current = active
  let revision = 0

  for (const language of registered) languages.set(language.id, { ...language })

  const notify = () => {
    revision += 1
    for (const listener of [...listeners]) listener()
  }
  const fallbackChain = (id) => {
    const chain = []
    const seen = new Set()
    let language = languages.get(id)
    while (language && !seen.has(language.id)) {
      seen.add(language.id)
      chain.push(language.id)
      language = language.fallback ? languages.get(language.fallback) : undefined
    }
    if (!seen.has('en')) chain.push('en')
    return chain
  }

  return {
    added,
    languages,
    dictionaries,
    getLocale: () => ({ active: current, revision, locales: [...languages.values()] }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setActive: (id) => {
      current = id
      notify()
    },
    register(namespace, localeOrDicts, dict) {
      const pairs = typeof localeOrDicts === 'string'
        ? [[localeOrDicts, dict]]
        : Object.entries(localeOrDicts)
      const target = dictionaries.get(namespace) ?? new Map()
      for (const [locale] of pairs) {
        if (target.has(locale)) throw new Error(`namespace ${namespace} already has locale ${locale}`)
      }
      for (const [locale, messages] of pairs) target.set(locale, messages)
      dictionaries.set(namespace, target)
      notify()
      return () => {
        for (const [locale] of pairs) target.delete(locale)
        notify()
      }
    },
    bind(namespace) {
      return (key) => {
        for (const locale of fallbackChain(current)) {
          const value = dictionaries.get(namespace)?.get(locale)?.[key]
          if (value !== undefined) return value
        }
        return key
      }
    },
    addLanguage({ id, label, fallback }) {
      if (languages.has(id)) throw new Error(`locale ${id} already registered`)
      if (!fallback || !languages.has(fallback)) {
        throw new Error(`locale fallback ${fallback} is not registered`)
      }
      const language = { id, label, fallback }
      languages.set(id, language)
      added.push(language)
      notify()
      return () => {
        if (languages.get(id) !== language) return
        languages.delete(id)
        notify()
      }
    },
  }
}

function dictionary(id, label, messages, {
  fallback,
  title = `${label} title`,
  description = `${label} description`,
  templates,
  templateValues,
} = {}) {
  return {
    meta: { title, description },
    language: { label, ...(fallback ? { fallback } : {}) },
    messages,
    ...(templates ? { templates } : {}),
    ...(templateValues ? { templateValues } : {}),
  }
}

async function readBundle(dir) {
  return loadLocaleBundle({ dir })
}

test('本地化词典：zh/en messages 与 templates 完整对齐，元数据仍可读', async () => {
  const bundle = await loadLocaleBundle()
  assert.deepEqual(bundle.errors, [])
  const byId = new Map(bundle.locales.map((entry) => [entry.id, entry]))
  const zh = byId.get('zh')
  const en = byId.get('en')
  assert.ok(zh && en, 'zh/en 词典都必须存在')
  assert.deepEqual(Object.keys(en.messages).sort(), Object.keys(zh.messages).sort())
  assert.ok(Object.keys(en.messages).length >= 700, '界面文案覆盖应显著超过旧 194 条')
  assert.equal(en.messages['开发工作站'], 'Development Workstation')
  assert.equal(en.messages['独立评审'], 'Independent review')
  assert.equal(en.messages['关闭'], 'Close')
  assert.equal(zh.messages['开发工作站'], '开发工作站')
  assert.equal(zh.meta.title, '开发工作站')
  assert.equal(en.meta.title, 'Development Workstation')
  for (const [key, value] of Object.entries(en.messages)) {
    assert.ok(value.trim().length > 0, `empty translation: ${key}`)
    assert.notEqual(value, key, `untranslated key: ${key}`)
  }
  for (const [key, value] of Object.entries(zh.messages)) {
    assert.equal(value, key, `zh dictionary must keep the Chinese source key: ${key}`)
  }
  assert.deepEqual(Object.keys(en.templates).sort(), Object.keys(zh.templates).sort())
  assert.ok(Object.keys(en.templates).length >= 10)
  assert.equal(en.templates['任务 {done}/{total}'], 'Tasks {done}/{total}')
  assert.equal(en.templateValues['通过'], 'passed')
})

test('覆盖率：src/client 与状态/阶段表的全部静态中文都进入词典', async () => {
  const bundle = await loadLocaleBundle()
  const en = bundle.locales.find((entry) => entry.id === 'en')
  const zh = bundle.locales.find((entry) => entry.id === 'zh')
  const clientFiles = (await readdir(new URL('../src/client', import.meta.url)))
    .filter((file) => file.endsWith('.mjs'))
    .map((file) => `src/client/${file}`)
  const files = [
    ...clientFiles,
    'src/shared/api.mjs',
    'src/shared/workflow.mjs',
    'src/shared/wizard.mjs',
    'src/core/attention.mjs',
    'src/core/stage.mjs',
  ]
  const missing = []
  let total = 0
  for (const file of files) {
    const content = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    for (const text of extractStaticChineseStrings(content)) {
      total += 1
      if (en.messages[text] === undefined || zh.messages[text] === undefined) {
        missing.push(`${file}: ${text}`)
      }
    }
  }
  assert.ok(total >= 900, `扫描到的静态文案过少（${total}），覆盖率测试可能失效`)
  assert.deepEqual(missing, [], `未进入词典的静态中文：\n${missing.slice(0, 40).join('\n')}`)
})

test('状态/阶段映射表的英文值全部来自词典', async () => {
  const bundle = await loadLocaleBundle()
  const en = bundle.locales.find((entry) => entry.id === 'en')
  const { STATUS_LABELS } = await import('../src/shared/api.mjs')
  const { STAGE_LABELS, WORKFLOW_STAGES, REVIEW_STATUS_LABELS } = await import('../src/shared/workflow.mjs')
  const values = [
    ...Object.values(STATUS_LABELS),
    ...Object.values(STAGE_LABELS ?? {}),
    ...Object.values(REVIEW_STATUS_LABELS ?? {}),
    ...WORKFLOW_STAGES.map((stage) => stage.hint),
  ].filter((value) => typeof value === 'string' && /\p{Script=Han}/u.test(value))
  assert.ok(values.length >= 10)
  for (const value of new Set(values)) {
    assert.ok(en.messages[value], `状态/阶段表缺少英文翻译：${value}`)
  }
})

test('shared/core 标签表与门禁文案：英文全部来自词典或模板', async () => {
  const bundle = await loadLocaleBundle()
  const en = bundle.locales.find((entry) => entry.id === 'en')
  const { WIZARD_STEPS } = await import('../src/shared/wizard.mjs')
  const { REQUIREMENT_SOURCE_LABEL, requirementStatusLabel } = await import('../src/shared/requirement.mjs')
  const { reviewGate, reviewFailureHint } = await import('../src/core/review.mjs')
  const values = [
    ...WIZARD_STEPS.flatMap((step) => [step.label, step.hint]),
    ...Object.values(REQUIREMENT_SOURCE_LABEL),
    '未规范化',
    reviewGate({ workflow: { review: { status: 'passed' } } }).reason,
    reviewGate({ workflow: { review: { status: 'pending' } } }).reason,
    reviewGate({}).reason,
    reviewFailureHint({ status: 'failed', corrections: [] }),
  ]
  for (const value of new Set(values)) {
    assert.ok(value && en.messages[value], `shared/core 文案缺英文：${value}`)
  }
  const service = createLocaleService({ active: 'en' })
  const handle = installLocaleDictionaries({ locale: service }, bundle, { warn() {} })
  setActiveLocaleForTest('en', service.bind(LOCALE_NAMESPACE))
  try {
    const rendered = renderToStaticMarkup(h('span', null, requirementStatusLabel({ source: 'local', needsReview: true })))
    assert.equal(rendered, '<span>Local draft (normalization pending) · normalization pending</span>')
  } finally {
    setActiveLocaleForTest('zh', (key) => key)
    handle.dispose()
  }
})

test('状态胶囊与流程提示：英文模式下渲染结果来自词典', async () => {
  const bundle = await loadLocaleBundle()
  const en = bundle.locales.find((entry) => entry.id === 'en')
  const { StatusPill, statusText } = await import('../src/client/common.mjs')
  const { pendingFlowStep, sessionStageText } = await import('../src/client/home.mjs')
  setActiveLocaleForTest('en', (key) => en.messages[key] ?? key)
  try {
    for (const status of ['planned', 'designing', 'developing', 'reviewing', 'verifying', 'done', 'blocked']) {
      assert.ok(en.messages[statusText(status)], `statusText 缺英文：${status}`)
      const html = renderToStaticMarkup(h(StatusPill, { status }))
      assert.doesNotMatch(html, /\p{Script=Han}/u, `StatusPill 英文下仍有中文：${html}`)
    }
    const pending = [
      pendingFlowStep({ status: 'developing', stage: 'develop', testState: 'not_run' }),
      pendingFlowStep({ status: 'reviewing', stage: 'review', reviewState: 'pending' }),
      pendingFlowStep({ status: 'verifying', stage: 'verify', testState: 'passed', environmentTestState: 'not_run' }),
    ]
    for (const text of pending) {
      assert.ok(text && en.messages[text], `pendingFlowStep 缺英文：${text}`)
    }
    for (const stage of ['turn', 'tool', 'assistant', 'ended']) {
      const text = sessionStageText(stage)
      assert.ok(text && en.messages[text], `sessionStageText 缺英文：${text}`)
    }
  } finally {
    setActiveLocaleForTest('zh', (key) => key)
  }
})

test('动态模板覆盖率：src/client 的中文模板字面量都有对应 templates', async () => {
  const bundle = await loadLocaleBundle()
  const en = bundle.locales.find((entry) => entry.id === 'en')
  const clientFiles = (await readdir(new URL('../src/client', import.meta.url)))
    .filter((file) => file.endsWith('.mjs'))
  const normalize = (text) => text.replace(/\\n/g, '\n').replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, '{}')
  const existing = new Set(Object.keys(en.templates).map(normalize))
  const missing = []
  let total = 0
  for (const file of clientFiles) {
    const content = await readFile(new URL(`../src/client/${file}`, import.meta.url), 'utf8')
    for (const template of extractChineseTemplates(content)) {
      total += 1
      if (!existing.has(normalize(template))) missing.push(`${file}: ${template}`)
    }
  }
  assert.ok(total >= 250, `扫描到的动态模板过少（${total}）`)
  assert.deepEqual(missing, [], `缺少 templates 的动态文案：\n${missing.slice(0, 30).join('\n')}`)
})

test('h 合并相邻文本子节点、confirmText 多行模板都翻译', async () => {
  const bundle = await loadLocaleBundle()
  const service = createLocaleService({ active: 'en' })
  const handle = installLocaleDictionaries({ locale: service }, bundle, { warn() {} })
  setActiveLocaleForTest('en', service.bind(LOCALE_NAMESPACE))
  const originalWindow = globalThis.window
  let confirmed = ''
  globalThis.window = { confirm: (message) => { confirmed = message; return true } }
  try {
    const html = renderToStaticMarkup(h('span', null, '更新于 ', '2026-11-16 16:20'))
    assert.equal(html, '<span>Updated 2026-11-16 16:20</span>')
    const { confirmText } = await import('../src/client/i18n.mjs')
    assert.equal(confirmText('确认提交 2 个文件到「main」，并立即 git push？\n\nsrc/a.mjs\nsrc/b.mjs'), true)
    assert.doesNotMatch(confirmed, /\p{Script=Han}/u)
    assert.match(confirmed, /Commit 2 files to "main"/)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    setActiveLocaleForTest('zh', (key) => key)
    handle.dispose()
  }
})

test('运行时组合串与多行 tooltip：整句或按行翻译', async () => {
  const bundle = await loadLocaleBundle()
  const service = createLocaleService({ active: 'en' })
  const handle = installLocaleDictionaries({ locale: service }, bundle, { warn() {} })
  setActiveLocaleForTest('en', service.bind(LOCALE_NAMESPACE))
  try {
    const combined = [
      '提醒：这次没拿到工作站总结后的需求（目标/根因还是客户原话，已标记待规范化）。到「流程」详情页点「让工作站规范化」再开工，效果更稳。',
      '已把客户原话整理成目标/根因，并补了验收标准',
      '本页只读：不再提供手工派发入口。「继续推进」即开始评审——自动起 1~3 位只读审核员会话，他们自己读目标/验收/scope/改动/自测结果/开发报告，各自给结论。全部通过才允许进入测试验证；不通过退回开发并附纠偏意见；审核员异常或未返回时标记为待处理，绝不当成通过。',
      '提交或推送失败\n已提交：abc（main）\ndemo：失败（network）',
      '扫描仓库 demo，扫描 12 个文件，命中 3 个候选，集中在 src，覆盖 2 个成员库。',
      '本机台账 /Users/me/ws\n台账/规范/上下文/证据都写在本机，不写任何成员库',
      '12 步 · M / 2 人日',
      '成员库：a、b（成员库平权）',
      '虚拟库「dev」：2 个成员库',
      '虚拟库 dev · 2 库',
      '上次评审未通过：审核员给出纠偏意见（再点「继续推进」重试评审）',
      '已提交并推送 2 个成员库（main）',
      '独立评审未通过：2 位审核员给出纠偏意见',
      '已更新虚拟库「dev」（2 个成员库；新增 a；移除 b）',
      '进行中 2 · 1 待处理 ▾',
      '已选 0 项',
      '已建立开发流程「demo」（flow-1）',
      '候选文件 ',
      '2 个目标 · 1 个进行中',
      '代码库路径，每行一个，例如：\n/Users/you/backend\n/Users/you/frontend',
      '评审通过 · 1/1',
      '评审未通过 · 0/1',
      '评审异常待处理 · 0/1',
      '开发中，未验证；1 个任务未完成（A、B）',
      '扫了 12 个文件，命中 3 个候选，集中在 src、web。下面是可能要改的文件与命中行，确认后我再建流程并开启开发会话。',
      '审核员 1（方向）',
      '两个流程都改了 src/client',
      '目标、根本问题',
    ]
    for (const sentence of combined) {
      const html = renderToStaticMarkup(h('div', null, sentence))
      assert.doesNotMatch(html, /\p{Script=Han}/u, `组合串仍有中文：${html.slice(0, 200)}`)
    }
    const tooltip = '当前代码库：/tmp/demo\n分支 main@abc\n虚拟库：a、b'
    const userText = '登录成功，错误提示清晰。'
    assert.equal(renderToStaticMarkup(h('div', null, userText)), `<div>${userText}</div>`)
    const riskText = '可能影响旧数据，需要迁移。'
    assert.equal(renderToStaticMarkup(h('div', null, riskText)), `<div>${riskText}</div>`)
    const html = renderToStaticMarkup(h('div', { title: tooltip }, 'x'))
    assert.doesNotMatch(html, /\p{Script=Han}/u, `多行 tooltip 仍有中文：${html.slice(0, 300)}`)
    assert.match(html, /Current repository: \/tmp\/demo/)
  } finally {
    setActiveLocaleForTest('zh', (key) => key)
    handle.dispose()
  }
})

test('中文数据：翻译界面 chrome，数据片段原样保留', async () => {
  const bundle = await loadLocaleBundle()
  const service = createLocaleService({ active: 'en' })
  const handle = installLocaleDictionaries({ locale: service }, bundle, { warn() {} })
  setActiveLocaleForTest('en', service.bind(LOCALE_NAMESPACE))
  const originalWindow = globalThis.window
  let confirmed = ''
  globalThis.window = { confirm: (message) => { confirmed = message; return true } }
  try {
    const { confirmText } = await import('../src/client/i18n.mjs')
    confirmText('删除流程「多语言词典改造」？\n\n只删台账；代码不回滚、DSH 会话不删除。这个操作不可撤销。')
    assert.match(confirmed, /Delete flow "多语言词典改造"/)
    assert.match(confirmed, /Only the ledger is deleted/)
    assert.doesNotMatch(confirmed.replace('多语言词典改造', ''), /\p{Script=Han}/u)

    const tip = renderToStaticMarkup(h('div', { title: '切换到虚拟库「我的库」：2 个成员库' }, 'x'))
    assert.match(tip, /Switch to virtual repository “我的库”: 2 member repositories/)
    assert.doesNotMatch(tip.replace('我的库', ''), /\p{Script=Han}/u)

    const { reviewGate } = await import('../src/core/review.mjs')
    const reason = reviewGate({
      workflow: {
        review: {
          status: 'error',
          reviewers: [
            { id: 'r1', label: '审核员 1（方向）', role: 'direction', status: 'error' },
            { id: 'r2', label: '审核员 2（正确性）', role: 'correctness', status: 'error' },
          ],
        },
      },
    }).reason
    const html = renderToStaticMarkup(h('div', null, reason))
    assert.doesNotMatch(html, /\p{Script=Han}/u, `评审异常 chrome 仍有中文：${html}`)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    setActiveLocaleForTest('zh', (key) => key)
    handle.dispose()
  }
})

test('关键页面英文渲染：首页/详情/向导不残留界面中文（数据除外）', async () => {
  const bundle = await loadLocaleBundle()
  const service = createLocaleService({ active: 'en' })
  const handle = installLocaleDictionaries({ locale: service }, bundle, { warn() {} })
  const { HomeView } = await import('../src/client/home.mjs')
  const { ItemEditor } = await import('../src/client/index.mjs')
  const { NewFlowWizard } = await import('../src/client/wizard.mjs')
  setActiveLocaleForTest('en', service.bind(LOCALE_NAMESPACE))
  const item = {
    id: 'flow-1',
    title: 'Multilingual dictionary',
    status: 'developing',
    stage: 'develop',
    intent: 'feature',
    updatedAt: new Date().toISOString(),
    scope: ['src/client'],
    scopeModules: [],
    tasks: [{ text: 'done', done: true }],
    acceptance: ['a'],
    risks: [],
    changes: [],
    tests: { local: { status: 'passed' }, environment: { status: 'not_run' } },
    review: { status: 'idle', reviewers: [] },
    baseline: { commit: 'abc', startedAt: new Date().toISOString() },
    attention: { kind: 'blocked', label: '被阻塞', tone: 'danger' },
    workflow: {
      stage: 'develop',
      stageReason: '正在澄清需求',
      review: { status: 'idle' },
      tests: { local: { status: 'not_run' }, environment: { status: 'not_run' } },
      rework: null,
      submission: null,
      worktree: { path: '/tmp/wt', branch: 'devhub/demo' },
    },
    session: null,
  }
  const noHan = (html, label) => {
    assert.doesNotMatch(html, /\p{Script=Han}/u, `${label} 在 en 下仍有界面中文：${html.slice(0, 400)}`)
  }
  try {
    const home = renderToStaticMarkup(h(HomeView, {
      state: { repo: { path: '/tmp/demo', name: 'demo', branch: 'main', head: 'abc' }, profile: { member: 'Alex', repoCards: [{ path: '/tmp/demo', name: 'demo', exists: true }] }, items: [item], workspaces: [], workspace: null },
      items: [item],
      selectedId: null,
      parallel: { active: [], pairs: [] },
      sessionStates: new Map(),
      onOpenItem() {}, onRefresh() {}, onFixTitles() {}, onSelectRepo() {}, onAddRepo() {}, onScan() {}, onNewFlow() {}, onOpenReport() {}, onRemoveRepo() {}, onSelectWorkspace() {}, onEditWorkspace() {}, onRemoveWorkspace() {}, onNewWorkspace() {},
    }))
    noHan(home, 'HomeView')

    const detail = renderToStaticMarkup(h(ItemEditor, {
      item,
      ctx: { get() {}, sessions: {}, slots: { inject() {} } },
      pendingQuestions: [],
      pendingApprovals: [],
      onBack() {}, onSaved() {}, onContext() {}, onLaunch() {},
      session: { sessionId: 's1', alive: true, running: false, idleSeconds: 60, lastEventAt: new Date().toISOString(), turns: 1 },
      onOpenSession() {}, onUnbindSession() {}, onDeleted() {}, onEditingChange() {},
    }))
    noHan(detail, 'ItemEditor')

    const wizard = renderToStaticMarkup(h(NewFlowWizard, {
      state: { repo: { path: '/tmp/demo', name: 'demo' }, firstRun: false, conventions: null, active: [] },
      onCreated() {},
    }))
    noHan(wizard, 'NewFlowWizard')
  } finally {
    setActiveLocaleForTest('zh', (key) => key)
    handle.dispose()
  }
})

test('i18n.mjs 不再硬编码词条表或英文模板规则，路由复用 API 常量', async () => {
  const source = await readFile(new URL('../src/client/i18n.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /'开发工作站':\s*'Development Workstation'/)
  assert.doesNotMatch(source, /export const en\b/)
  assert.doesNotMatch(source, /export const zh\b/)
  assert.doesNotMatch(source, /成员 \(\\.\+\)/)
  assert.match(source, /loadLocaleDictionaries/)
  assert.match(source, /installLocaleDictionaries/)
  assert.equal(LOCALE_ENDPOINT, API.locales)
})

test('本地化元素工厂：子节点/占位符/选项标题与 props.children 都翻译', async () => {
  const bundle = await loadLocaleBundle()
  const en = bundle.locales.find((entry) => entry.id === 'en')
  setActiveLocaleForTest('en', (key) => en.messages[key] ?? key)
  try {
    const html = renderToStaticMarkup(h('div', { title: '开发工作站' },
      h('span', null, '独立评审'),
      h('input', { placeholder: '代码库路径' }),
      h('button', { children: '刷新' }),
      h('button', { children: ['取消', '关闭'] }),
      h('span', null, '未收录的自定义文案'),
    ))
    assert.match(html, /Development Workstation/)
    assert.match(html, /Independent review/)
    assert.match(html, /Repository path/)
    assert.match(html, /Refresh/)
    assert.match(html, /Cancel/)
    assert.match(html, /Close/)
    assert.match(html, /未收录的自定义文案/)
  } finally {
    setActiveLocaleForTest('zh', (key) => key)
  }
})

test('LocaleProvider：跟随 ctx.locale，语言切换后静态文案重新翻译', async () => {
  const bundle = await loadLocaleBundle()
  const service = createLocaleService({ active: 'zh' })
  const handle = installLocaleDictionaries({ locale: service }, bundle, { warn() {} })
  const ctx = { locale: service }
  function Demo() {
    return h('div', null, h('span', null, '开发工作站'))
  }
  try {
    const zhHtml = renderToStaticMarkup(h(LocaleProvider, { ctx }, h(Demo)))
    assert.match(zhHtml, /开发工作站/)
    service.setActive('en')
    const enHtml = renderToStaticMarkup(h(LocaleProvider, { ctx }, h(Demo)))
    assert.match(enHtml, /Development Workstation/)
  } finally {
    setActiveLocaleForTest('zh', (key) => key)
    handle.dispose()
  }
})

test('动态模板：en 走词典模板，ja 用自己的模板并回退 en', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-templates-'))
  try {
    const zh = dictionary('zh', '中文', {
      '开发工作站': '开发工作站',
      '通过': '通过',
    }, {
      title: '开发工作站',
      templates: {
        '任务 {done}/{total}': '任务 {done}/{total}',
        '本机自测 {status}': '本机自测 {status}',
        '还有 {count} 个任务未完成': '还有 {count} 个任务未完成',
      },
      templateValues: { '通过': '通过' },
    })
    const en = dictionary('en', 'English', {
      '开发工作站': 'Development Workstation',
      '通过': 'Passed',
    }, {
      title: 'Development Workstation',
      templates: {
        '任务 {done}/{total}': 'Tasks {done}/{total}',
        '本机自测 {status}': 'Local tests {status}',
        '还有 {count} 个任务未完成': '{count} tasks remain unfinished',
      },
      templateValues: { '通过': 'passed' },
    })
    const ja = dictionary('ja', '日本語', {
      '开发工作站': '開発ワークステーション',
      '通过': '合格',
    }, {
      fallback: 'en',
      title: '開発ワークステーション',
      templates: {
        '任务 {done}/{total}': 'タスク {done}/{total}',
        '本机自测 {status}': 'ローカルテスト {status}',
      },
      templateValues: { '通过': '合格' },
    })
    await writeFile(join(dir, 'zh.json'), JSON.stringify(zh), 'utf8')
    await writeFile(join(dir, 'en.json'), JSON.stringify(en), 'utf8')
    await writeFile(join(dir, 'ja.json'), JSON.stringify(ja), 'utf8')

    const bundle = await readBundle(dir)
    assert.deepEqual(bundle.errors, [])
    const service = createLocaleService({ active: 'en' })
    const handle = installLocaleDictionaries({ locale: service }, bundle, { warn() {} })
    try {
      setActiveLocaleForTest('en', service.bind(LOCALE_NAMESPACE))
      assert.equal(renderToStaticMarkup(h('span', null, '任务 3/5')), '<span>Tasks 3/5</span>')
      assert.equal(renderToStaticMarkup(h('span', null, '本机自测 通过')), '<span>Local tests passed</span>')
      assert.equal(renderToStaticMarkup(h('span', null, '还有 4 个任务未完成')), '<span>4 tasks remain unfinished</span>')

      service.setActive('ja')
      setActiveLocaleForTest('ja', service.bind(LOCALE_NAMESPACE))
      assert.equal(renderToStaticMarkup(h('span', null, '任务 3/5')), '<span>タスク 3/5</span>')
      assert.equal(renderToStaticMarkup(h('span', null, '本机自测 通过')), '<span>ローカルテスト 合格</span>')
      // ja 没定义的模板回退 en，而不是把中文留在界面上。
      assert.equal(renderToStaticMarkup(h('span', null, '还有 4 个任务未完成')), '<span>4 tasks remain unfinished</span>')
    } finally {
      setActiveLocaleForTest('zh', (key) => key)
      handle.dispose()
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('新增语言 = 新增词典文件：临时 ja 夹具驱动 Host 加载、注册与翻译，组件代码零改动', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-locales-'))
  const zh = dictionary('zh', '中文', {
    '开发工作站': '开发工作站',
    '独立评审': '独立评审',
    '代码库路径': '代码库路径',
  }, { title: '开发工作站' })
  const en = dictionary('en', 'English', {
    '开发工作站': 'Development Workstation',
    '独立评审': 'Independent review',
    '代码库路径': 'Repository path',
  }, { title: 'Development Workstation' })
  const ja = dictionary('ja', '日本語', {
    '开发工作站': '開発ワークステーション',
    '独立评审': '独立レビュー',
  }, { fallback: 'en', title: '開発ワークステーション' })
  try {
    await writeFile(join(dir, 'zh.json'), JSON.stringify(zh), 'utf8')
    await writeFile(join(dir, 'en.json'), JSON.stringify(en), 'utf8')
    await writeFile(join(dir, 'ja.json'), JSON.stringify(ja), 'utf8')
    // 坏文件不能拖垮其余语言：错误可见，有效词典照常下发。
    await writeFile(join(dir, 'broken.json'), '{ not json', 'utf8')

    const bundle = await loadLocaleBundle({ dir })
    assert.equal(bundle.ok, false)
    assert.deepEqual(bundle.locales.map((entry) => entry.id), ['en', 'ja', 'zh'])
    assert.equal(bundle.errors.length, 1)
    assert.match(bundle.errors[0].message, /JSON 解析失败/)
    const loadedJa = bundle.locales.find((entry) => entry.id === 'ja')
    assert.equal(loadedJa.fallback, 'en')
    assert.equal(loadedJa.meta.title, '開発ワークステーション')

    // 客户端只做形状校验；语义校验由 install 按实际 catalog 完成。
    const payload = JSON.parse(JSON.stringify({ locales: bundle.locales, errors: [bundle.errors[0]] }))
    const normalized = normalizeLocalePayload(payload)
    assert.deepEqual(normalized.locales.map((entry) => entry.id), ['en', 'ja', 'zh'])
    assert.equal(normalized.errors.length, 1)

    const service = createLocaleService({ active: 'zh' })
    const handle = installLocaleDictionaries({ locale: service }, normalized, { warn() {} })
    assert.ok(handle.installed.includes('ja'))
    assert.equal(handle.warnings.length, 1)
    assert.match(handle.warnings[0], /JSON 解析失败/)
    assert.deepEqual(service.added, [{ id: 'ja', label: '日本語', fallback: 'en' }])
    assert.equal(service.dictionaries.get(LOCALE_NAMESPACE).get('ja')['独立评审'], '独立レビュー')

    // 组件仍只用中文原文作为 key 调 h：切到 ja 后词典生效，缺的 key 沿 fallback 取英文。
    service.setActive('ja')
    setActiveLocaleForTest('ja', service.bind(LOCALE_NAMESPACE))
    try {
      const html = renderToStaticMarkup(h('div', { title: '开发工作站' },
        h('span', null, '独立评审'),
        h('span', null, '代码库路径'),
      ))
      assert.match(html, /開発ワークステーション/)
      assert.match(html, /独立レビュー/)
      assert.match(html, /Repository path/)
    } finally {
      setActiveLocaleForTest('zh', (key) => key)
    }

    // 卸载后语言与字典都清理干净，HMR/重载可以重新注册。
    handle.dispose()
    assert.equal(service.dictionaries.get(LOCALE_NAMESPACE).has('ja'), false)
    assert.equal(service.languages.has('ja'), false)
    const again = installLocaleDictionaries({ locale: service }, { locales: normalized.locales, errors: [] }, { warn() {} })
    assert.ok(again.installed.includes('ja'))
    again.dispose()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('宿主已内置语言：ja 不重复 addLanguage，fr-CA 可回退到已注册 fr', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-builtin-'))
  const zh = dictionary('zh', '中文', { '开发工作站': '开发工作站' }, { title: '开发工作站' })
  const en = dictionary('en', 'English', { '开发工作站': 'Development Workstation' }, { title: 'Development Workstation' })
  const ja = dictionary('ja', '日本語', { '开发工作站': '開発ワークステーション' }, { fallback: 'en', title: '開発ワークステーション' })
  const frCa = dictionary('fr-CA', 'Français (Canada)', { '开发工作站': 'Poste de développement' }, { fallback: 'fr', title: 'Poste de développement' })
  try {
    await writeFile(join(dir, 'zh.json'), JSON.stringify(zh), 'utf8')
    await writeFile(join(dir, 'en.json'), JSON.stringify(en), 'utf8')
    await writeFile(join(dir, 'ja.json'), JSON.stringify(ja), 'utf8')
    await writeFile(join(dir, 'fr-CA.json'), JSON.stringify(frCa), 'utf8')
    const bundle = await readBundle(dir)
    assert.deepEqual(bundle.errors, [])

    const service = createLocaleService({
      active: 'zh',
      registered: [
        { id: 'ja', label: '日本語', fallback: 'en' },
        { id: 'fr', label: 'Français', fallback: 'en' },
      ],
    })
    const handle = installLocaleDictionaries({ locale: service }, bundle, { warn() {} })
    try {
      assert.deepEqual(handle.warnings, [])
      assert.deepEqual(service.added, [{ id: 'fr-ca', label: 'Français (Canada)', fallback: 'fr' }])
      assert.equal(service.dictionaries.get(LOCALE_NAMESPACE).get('ja')['开发工作站'], '開発ワークステーション')
      assert.equal(service.dictionaries.get(LOCALE_NAMESPACE).get('fr-ca')['开发工作站'], 'Poste de développement')

      service.setActive('ja')
      setActiveLocaleForTest('ja', service.bind(LOCALE_NAMESPACE))
      assert.equal(renderToStaticMarkup(h('span', null, '开发工作站')), '<span>開発ワークステーション</span>')

      service.setActive('fr-ca')
      setActiveLocaleForTest('fr-ca', service.bind(LOCALE_NAMESPACE))
      assert.equal(renderToStaticMarkup(h('span', null, '开发工作站')), '<span>Poste de développement</span>')
      service.setActive('zh')
      setActiveLocaleForTest('zh', (key) => key)
    } finally {
      setActiveLocaleForTest('zh', (key) => key)
      handle.dispose()
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('词典校验：重复语言、缺失 en、key/模板未对齐、非法 id/回退链都显式报错', async () => {
  const mk = (id, messages, { fallback, templates } = {}) => normalizeLocaleDictionary({
    id,
    source: `${id}.json`,
    raw: {
      meta: { title: `${id} title`, description: `${id} description` },
      language: { label: id, ...(fallback ? { fallback } : {}) },
      messages,
      ...(templates ? { templates } : {}),
    },
  })
  const zh = mk('zh', { '开发工作站': '开发工作站' })
  const en = mk('en', { '开发工作站': 'Development Workstation' })
  const jaA = mk('ja', { '开发工作站': 'A' })
  const jaB = mk('ja', { '开发工作站': 'B' })
  const dup = finalizeLocaleBundle([zh, en, jaA, jaB])
  assert.ok(dup.errors.some((entry) => entry.code === 'duplicate-locale'))
  const noEn = finalizeLocaleBundle([zh, jaA])
  assert.ok(noEn.errors.some((entry) => entry.code === 'missing-fallback-locale'))
  const badFallback = finalizeLocaleBundle([zh, en, mk('ja', { '开发工作站': 'A' }, { fallback: 'fr' })])
  assert.ok(badFallback.errors.some((entry) => entry.code === 'invalid-fallback'))

  const dir = await mkdtemp(join(tmpdir(), 'devhub-locales-invalid-'))
  try {
    await writeFile(join(dir, 'zh.json'), JSON.stringify(dictionary('zh', '中文', {
      '开发工作站': '开发工作站',
      '独立评审': '独立评审',
    }, { templates: { '任务 {done}/{total}': '任务 {done}/{total}' } })), 'utf8')
    await writeFile(join(dir, 'en.json'), JSON.stringify(dictionary('en', 'English', {
      '开发工作站': 'Development Workstation',
    }, { templates: { '验收 {done}/{total}': 'Acceptance {done}/{total}' } })), 'utf8')
    await writeFile(join(dir, 'ja.json'), JSON.stringify(dictionary('ja', '日本語', {
      '开发工作站': '開発ワークステーション',
    }, { fallback: 'fr' })), 'utf8')
    await writeFile(join(dir, 'e.json'), JSON.stringify(dictionary('en', 'English', {
      '开发工作站': 'Workstation',
    })), 'utf8')
    await writeFile(join(dir, 'portuguese.json'), JSON.stringify(dictionary('pt', 'Português', {
      '开发工作站': 'Estação de trabalho',
    })), 'utf8')
    const bundle = await loadLocaleBundle({ dir })
    const codes = bundle.errors.map((entry) => entry.code)
    assert.ok(codes.includes('key-mismatch'))
    assert.ok(codes.includes('template-mismatch'))
    // Host 允许暂不认识的回退目标（fr-CA → fr），由客户端按真实 catalog 再校验；
    // 真正非法的回退链用上面的 finalizeLocaleBundle 直接断言。
    assert.ok(codes.includes('invalid-file-name'))
    // Host 不知道浏览器侧 catalog，因此保留 ja；客户端 install 时才会按真实 catalog 拒绝。
    assert.ok(bundle.locales.some((entry) => entry.id === 'ja'))
    assert.ok(bundle.locales.some((entry) => entry.id === 'zh'))
    assert.ok(bundle.locales.some((entry) => entry.id === 'en'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('DSH 接入：client 运行时加载词典，并提供中英文插件元数据', async () => {
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const localeEn = JSON.parse(await readFile(new URL('../locale/en.json', import.meta.url), 'utf8'))
  const localeZh = JSON.parse(await readFile(new URL('../locale/zh.json', import.meta.url), 'utf8'))
  assert.match(index, /export const inject = \['slots', 'locale'\]/)
  assert.match(index, /loadLocaleDictionaries\(/)
  assert.match(index, /installLocaleDictionaries\(ctx, bundle\)/)
  assert.doesNotMatch(index, /ctx\.locale\.register\(LOCALE_NAMESPACE, \{ zh, en \}\)/)
  assert.match(index, /LocaleProvider/)
  assert.ok(manifest.exports['./locale/*.json'])
  assert.equal(localeEn.meta.title, 'Development Workstation')
  assert.equal(localeZh.meta.title, '开发工作站')
  assert.equal(localeEn.language.label, 'English')
  assert.equal(localeZh.language.label, '中文')
})

test('DSH 接入：字典重复注册/HMR 失败不能拖垮整个插件', async () => {
  const client = await import('../src/client/index.mjs')
  const slots = { inject() {}, register() { return () => {} } }
  const locale = {
    register() { throw new Error('locale namespace already registered') },
    addLanguage() { throw new Error('locale already registered') },
    bind() { return (key) => key },
    subscribe() { return () => {} },
    getLocale() { return { active: 'zh', locales: [{ id: 'zh' }, { id: 'en' }] } },
  }
  const ctx = { slots, locale, effect(fn) { return fn() || (() => {}) }, on() { return () => {} }, get() { return undefined } }
  const warnings = []
  const originalWarn = console.warn
  const originalFetch = globalThis.fetch
  console.warn = (...args) => warnings.push(args.join(' '))
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      errors: [],
      locales: [
        { id: 'zh', label: '中文', meta: { title: '开发工作站', description: '说明' }, messages: { '开发工作站': '开发工作站' } },
        { id: 'en', label: 'English', meta: { title: 'Development Workstation', description: 'Description' }, messages: { '开发工作站': 'Development Workstation' } },
      ],
    }),
  })
  try {
    assert.doesNotThrow(() => client.apply(ctx))
    await new Promise((resolve) => setImmediate(resolve))
    assert.ok(warnings.some((warning) => /locale|词典|注册/.test(warning)))
  } finally {
    console.warn = originalWarn
    globalThis.fetch = originalFetch
  }
})

test('Host 路由：GET /api/dev-hub/locales 下发词典包，仅限 loopback', async () => {
  const { apply } = await import('../src/index.mjs')
  const routes = new Map()
  const ctx = {
    webServer: { register(route) { routes.set(route.path, route); return () => {} } },
    sessions: {},
    get() { return undefined },
    effect(fn) { fn(); return () => {} },
  }
  apply(ctx)
  const route = routes.get(API.locales)
  assert.ok(route, 'locales 路由必须注册')

  const call = async ({ method = 'GET', remote = '127.0.0.1' } = {}) => {
    const res = {
      status: 0,
      body: '',
      writeHead(status) { this.status = status },
      end(body) { this.body = String(body ?? '') },
    }
    const req = { method, url: API.locales, socket: { remoteAddress: remote } }
    await route.handler(req, res)
    return { status: res.status, body: JSON.parse(res.body) }
  }

  const ok = await call()
  assert.equal(ok.status, 200)
  assert.equal(ok.body.ok, true)
  assert.deepEqual(ok.body.errors, [])
  assert.deepEqual(ok.body.locales.map((entry) => entry.id), ['en', 'zh'])
  assert.equal(ok.body.locales.find((entry) => entry.id === 'en').meta.title, 'Development Workstation')

  const forbidden = await call({ remote: '10.0.0.1' })
  assert.equal(forbidden.status, 403)
  const wrongMethod = await call({ method: 'POST' })
  assert.equal(wrongMethod.status, 405)
})

test('词典加载：fetch 失败/非 2xx/空 payload 都显式抛错，不静默降级', async () => {
  await assert.rejects(
    () => loadLocaleDictionaries({ fetchImpl: async () => ({ ok: false, status: 500 }) }),
    /语言词典请求失败：HTTP 500/,
  )
  await assert.rejects(
    () => loadLocaleDictionaries({ fetchImpl: async () => ({ ok: true, json: async () => ({ locales: [] }) }) }),
    /词典包为空/,
  )
})
