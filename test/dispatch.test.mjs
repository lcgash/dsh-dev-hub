import assert from 'node:assert/strict'
import test from 'node:test'

const { DISPATCH_SCHEMA, buildDispatchPrompt, fallbackDispatch, normalizeDispatch } = await import('../src/core/dispatch.mjs')

test('DISPATCH_SCHEMA：action 只允许四种，reply 必填', () => {
  assert.deepEqual(DISPATCH_SCHEMA.properties.action.enum, ['ledger', 'session', 'both', 'none'])
  assert.deepEqual(DISPATCH_SCHEMA.required, ['action', 'reply'])
})

test('buildDispatchPrompt：带流程现状与会话状态，要求不编造 updates', () => {
  const prompt = buildDispatchPrompt({
    item: { id: 'f1', title: '修上传', goal: 'g', acceptance: ['a'], risks: ['r'], tasks: [{ text: 't', done: true }], workflow: { stage: 'develop' } },
    message: '验收再加一条失败回滚，然后接着做',
    session: { running: false, turns: 2 },
  })
  assert.match(prompt, /分诊助手/)
  assert.match(prompt, /已绑定（空闲，第 2 轮）/)
  assert.match(prompt, /不要编造/)
  assert.match(prompt, /action=both/)
})

test('fallbackDispatch：要求开工 → session；补信息 → ledger；没会话时降级为 ledger', () => {
  assert.equal(fallbackDispatch('继续把测试跑完', { hasSession: true }).action, 'session')
  assert.equal(fallbackDispatch('继续把测试跑完', { hasSession: false }).action, 'ledger')
  assert.equal(fallbackDispatch('验收再加一条失败回滚', { hasSession: true }).action, 'ledger')
  assert.equal(fallbackDispatch('你好', { hasSession: true }).action, 'none')
})

test('normalizeDispatch：没绑会话时 session/both 降级为 ledger', () => {
  assert.equal(normalizeDispatch({ action: 'session', reply: 'r' }, { hasSession: false }).action, 'ledger')
  assert.equal(normalizeDispatch({ action: 'both', reply: 'r' }, { hasSession: false }).action, 'ledger')
  assert.equal(normalizeDispatch({ action: 'session', reply: 'r', sessionMessage: 'x' }, { hasSession: true }).sessionMessage, 'x')
})
