import assert from 'node:assert/strict'
import test from 'node:test'

const { ASSIST_SCHEMA, applyAssistUpdates, buildAssistPrompt, assistThread } = await import('../src/core/assist.mjs')

function item(overrides = {}) {
  return {
    id: 'f1',
    title: '给 source 补 webhook',
    goal: '',
    nonGoals: [],
    acceptance: ['能跑'],
    tasks: [{ text: '写 provider', done: false }, { text: '补测试', done: false }],
    risks: [],
    changePoints: [],
    history: [],
    workflow: { rootProblem: '', plan: { summary: '', steps: [] } },
    ...overrides,
  }
}

test('ASSIST_SCHEMA：必须返回 reply，updates 白名单内可选', () => {
  assert.deepEqual(ASSIST_SCHEMA.required, ['reply'])
  assert.ok(ASSIST_SCHEMA.properties.updates.properties.acceptanceAdd)
  assert.deepEqual(ASSIST_SCHEMA.properties.updates.properties.techDocDecision.enum, ['existing', 'create', 'none'])
})

test('buildAssistPrompt：带上当前台账与用户那句话，并限制"不要编造"', () => {
  const prompt = buildAssistPrompt({ item: item({ goal: '现有目标' }), message: '验收再加一条：失败要能回滚', repoName: 'gitee-go' })
  assert.match(prompt, /gitee-go/)
  assert.match(prompt, /现有目标/)
  assert.match(prompt, /验收再加一条/)
  assert.match(prompt, /不要编造/)
  assert.match(prompt, /只输出 JSON/)
})

test('applyAssistUpdates：增量合并、去重、任务按片段完成', () => {
  const target = item()
  const applied = applyAssistUpdates(target, {
    goal: '新的目标',
    rootProblem: '根因是 X',
    acceptanceAdd: ['能跑', '失败可回滚'],
    nonGoalsAdd: ['不做 UI'],
    tasksAdd: ['写 provider', '跑门禁'],
    tasksCompleteMatch: ['provider'],
    risksAdd: ['依赖外部系统'],
    changePointsAdd: ['新增接口'],
    planSummary: '分三步',
    planSteps: ['一', '二'],
    techDocDecision: 'none',
    question: '要不要兼容旧数据？',
  }, { message: '目标是新的目标；验收再加一条失败可回滚；计划改成三步；技术文档先不写；根因是 X' })
  assert.equal(target.goal, '新的目标')
  assert.equal(target.workflow.rootProblem, '根因是 X')
  assert.deepEqual(target.acceptance, ['能跑', '失败可回滚'], '重复项不重复加')
  assert.deepEqual(target.tasks.map((task) => task.text), ['写 provider', '补测试', '跑门禁'])
  assert.equal(target.tasks[0].done, true, '按片段匹配完成任务')
  assert.deepEqual(target.risks, ['依赖外部系统'])
  assert.equal(target.changePoints[0].type, 'assist')
  assert.equal(target.workflow.plan.summary, '分三步')
  assert.deepEqual(target.workflow.plan.steps, ['一', '二'])
  assert.equal(target.workflow.techDoc.decision, 'none')
  assert.equal(target.workflow.questions.at(-1).question, '要不要兼容旧数据？')
  assert.ok(applied.length >= 8)
})

test('applyAssistUpdates：空 updates 不改任何东西；非法类型被忽略', () => {
  const target = item()
  const before = JSON.stringify(target)
  const applied = applyAssistUpdates(target, { goal: 123, acceptanceAdd: 'not-array', tasksAdd: [null, ''] })
  assert.equal(JSON.stringify(target), before)
  assert.deepEqual(applied, [])
})

test('assistThread：只取对话式补充记录，最多 limit 条', () => {
  const history = [
    { type: 'create', message: 'x' },
    { type: 'assist', message: 'a' },
    { type: 'assist-reply', message: 'b' },
    { type: 'assist', message: 'c' },
  ]
  const thread = assistThread(history, 2)
  assert.equal(thread.length, 2)
  assert.equal(thread.at(-1).message, 'c')
})


test('applyAssistUpdates：用户没提到的字段不会被"顺手"改掉', () => {
  const target = item({ workflow: { rootProblem: '原根因', plan: { summary: '原计划', steps: ['原一步'] }, techDoc: { decision: 'existing' } } })
  const applied = applyAssistUpdates(target, {
    goal: '偷偷改目标',
    planSummary: '偷偷改计划',
    techDocDecision: 'none',
    rootProblem: '偷偷改根因',
    acceptanceAdd: ['只说验收'],
  }, { message: '验收再加一条' })
  assert.equal(target.goal, '', '没提目标就不改')
  assert.equal(target.workflow.plan.summary, '原计划')
  assert.equal(target.workflow.techDoc.decision, 'existing')
  assert.equal(target.workflow.rootProblem, '原根因')
  assert.deepEqual(target.acceptance, ['能跑', '只说验收'])
  assert.deepEqual(applied, ['验收 +1'])
})
