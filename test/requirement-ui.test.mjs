import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const { ItemEditor } = await import('../src/client/index.mjs')
const { sanitizeItem } = await import('../src/core/store.mjs')

const RAW = '流程和技能的时候其实都是在某个开发库或者工作区了，把这个信息放在头上面，不然不知道这个技能是在管理什么库的'

function renderItem(item) {
  return renderToStaticMarkup(h(ItemEditor, {
    item,
    ctx: { get: () => undefined },
    session: null,
    onBack() {}, onSaved() {}, onContext() {}, onStarted() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
}

function baseItem(extra = {}) {
  return sanitizeItem({
    id: 'req-ui',
    title: '头部显示所属库',
    goal: RAW,
    description: RAW,
    acceptance: ['头部能看到库名'],
    scope: ['src/client'],
    workflow: {
      rootProblem: RAW,
      entry: 'chat',
      techDoc: { decision: 'none' },
      plan: { summary: RAW, steps: ['一步'], estimate: { size: 'S', days: 1 } },
    },
    ...extra,
  })
}

test('流程详情：目标还是客户原话时，显式提示待规范化并给「让工作站规范化」入口', () => {
  const html = renderItem(baseItem())
  assert.match(html, /目标/)
  assert.match(html, /待规范化/)
  assert.match(html, /还没整理成根因/)
  assert.match(html, /让工作站规范化/)
  // 原始需求单独折叠展示，并说明只作追溯
  assert.match(html, /原始需求/)
  assert.match(html, /客户原话 · 仅追溯/)
  assert.match(html, /不会拿它直接当目标/)
})

test('流程详情：已规范化时不出现"待规范化"入口，来源可追溯', () => {
  const normalizedGoal = '在流程页与技能页头部常驻展示当前代码库/工作区'
  const normalizedProblem = '流程页与技能页只显示「开发工作站」，看不到当前作用的代码库或工作区'
  const item = baseItem({
    goal: normalizedGoal,
    description: RAW,
    workflow: {
      rootProblem: normalizedProblem,
      entry: 'chat',
      techDoc: { decision: 'none' },
      plan: { summary: normalizedGoal, steps: ['一步'], estimate: { size: 'S', days: 1 } },
    },
    requirement: {
      raw: RAW,
      goal: normalizedGoal,
      rootProblem: normalizedProblem,
      source: 'clarify',
      needsReview: false,
      acceptance: ['头部能看到库名'],
    },
  })
  const html = renderItem(item)
  assert.match(html, /澄清规范化/)
  assert.doesNotMatch(html, /让工作站规范化/)
  assert.doesNotMatch(html, /还没整理成根因/)
  // 原始需求仍然保留
  assert.match(html, new RegExp(RAW.slice(0, 12)))
})

test('聊天入口：澄清规格与"不用原话兜底"的约束写进了客户端代码', async () => {
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  const flow = await readFile(new URL('../src/client/chat-flow.mjs', import.meta.url), 'utf8')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const wizard = await readFile(new URL('../src/client/wizard.mjs', import.meta.url), 'utf8')

  // 计划与建流程都带上澄清规格
  assert.match(chat, /spec: clarify\?\.spec \?\? \{\}/)
  assert.match(flow, /plan\.spec && typeof plan\.spec === 'object'/)
  // 不再用原始描述兜底成目标/根因
  assert.doesNotMatch(flow, /goal: plan\.goal \|\| description/)
  assert.doesNotMatch(flow, /rootProblem: plan\.rootProblem \|\| description/)
  // 详情页有规范化入口
  assert.match(index, /api\(API\.requirement, \{ method: 'POST'/)
  // 新建表单向导不再把原话预填成目标
  assert.doesNotMatch(wizard, /setGoal\(suggested\.goal\)/)
  assert.match(wizard, /工作站会按需求规范化生成/)
})

test('流程详情：标题像代码/原话时提示并可一键自动生成', async () => {
  const source = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // 详情页标题区：弱标题给标记 + 自动生成入口
  assert.match(source, /标题待整理/)
  assert.match(source, /自动生成标题/)
  assert.match(source, /body: JSON\.stringify\(\{ id: draft\.id, regenerateTitle: true \}\)/)

  const item = baseItem({
    title: '@JsonSubTypes({',
    goal: '补齐源构建请求的多态反序列化子类型',
    description: RAW,
    workflow: {
      rootProblem: '子类型缺失',
      entry: 'chat',
      techDoc: { decision: 'none' },
      plan: { summary: '补齐子类型', steps: ['一步'], estimate: { size: 'S', days: 1 } },
    },
  })
  const html = renderItem(item)
  assert.match(html, /标题待整理/)
  assert.match(html, /自动生成标题/)
})

test('聊天与向导入口：标题用澄清/概括结果，不把用户第一行当名字', async () => {
  const flow = await readFile(new URL('../src/client/chat-flow.mjs', import.meta.url), 'utf8')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  const wizard = await readFile(new URL('../src/client/wizard.mjs', import.meta.url), 'utf8')
  const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')

  assert.match(flow, /const name = String\(plan\.title \?\? ''\)\.trim\(\) \|\| String\(plan\.name/)
  assert.match(flow, /\.\.\.\(plan\.title \? \{ title: String\(plan\.title\) \} : \{\}\)/)
  assert.match(chat, /title: planData\.name \|\| currentTitle\(\)/)
  assert.match(wizard, /suggestFlowTitle/)
  assert.match(home, /标题待整理/)
  // 列表级批量整理：弱标题计数 + 一键整理
  assert.match(home, /整理标题 \$\{weakTitleCount\}/)
  assert.match(index, /async function fixWeakTitles\(\)/)
  assert.match(index, /action: 'retitleWeak'/)
})
