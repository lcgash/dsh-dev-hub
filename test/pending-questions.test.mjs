import assert from 'node:assert/strict'
import test from 'node:test'

const { readPendingQuestions, answerPendingQuestion } = await import('../src/host/pending-questions.mjs')

function ctxWith(events, { agent = { id: 's1' }, present = true, answer, active } = {}) {
  return {
    get(name) {
      if (name === 'agents') return { get: () => agent }
      if (name === 'sessions') return { get: () => (present ? { snapshotEvents: () => events } : undefined) }
      if (name === 'sessionProjections') return active ? { stateOf: () => ({ questions: { active } }) } : undefined
      if (name === 'userQuestions') return answer ? { answer } : undefined
      return undefined
    },
  }
}

const askArgs = (questions) => JSON.stringify({ questions })

test('readPendingQuestions：没有 tool/result 的 ask_user_question 就是待答', () => {
  const events = [
    { type: 'tool/call', time: 1, data: { callId: 'c1', name: 'ask_user_question', arguments: askArgs([
      { id: 'q1', question: '要不要改 A？', header: '确认', options: [{ label: '要', description: '改 A' }, { label: '不要' }] },
    ]) } },
  ]
  const result = readPendingQuestions(ctxWith(events), 's1')
  assert.equal(result.pending.length, 1)
  assert.equal(result.pending[0].callId, 'c1')
  assert.equal(result.pending[0].questions[0].question, '要不要改 A？')
  assert.deepEqual(result.pending[0].questions[0].options.map((option) => option.label), ['要', '不要'])
})

test('readPendingQuestions：已有 tool/result 的提问不算待答', () => {
  const events = [
    { type: 'tool/call', time: 1, data: { callId: 'c1', name: 'ask_user_question', arguments: askArgs([{ id: 'q1', question: 'q' }]) } },
    { type: 'tool/result', time: 2, data: { message: { toolCallId: 'c1' } } },
  ]
  assert.deepEqual(readPendingQuestions(ctxWith(events), 's1').pending, [])
})

test('readPendingQuestions：多个待答按时间排序；坏参数给空问题列表', () => {
  const events = [
    { type: 'tool/call', time: 5, data: { callId: 'c2', name: 'ask_user_question', arguments: '{bad json' } },
    { type: 'tool/call', time: 3, data: { callId: 'c1', name: 'ask_user_question', arguments: askArgs([{ id: 'q1', question: '先问' }]) } },
  ]
  const result = readPendingQuestions(ctxWith(events), 's1')
  assert.deepEqual(result.pending.map((entry) => entry.callId), ['c1', 'c2'])
  assert.deepEqual(result.pending[1].questions, [])
})

test('readPendingQuestions：未绑定/会话不在进程内给原因，不编造', () => {
  assert.match(readPendingQuestions(ctxWith([]), '').reason, /未绑定/)
  const gone = readPendingQuestions(ctxWith([], { present: false }), 's1')
  assert.deepEqual(gone.pending, [])
  assert.match(gone.reason, /不在当前进程中/)
})

test('answerPendingQuestion：把完整答案批次交给 userQuestions.answer', async () => {
  const calls = []
  const ctx = ctxWith([], {
    answer: (agent, callId, answer) => { calls.push([agent.id, callId, answer]); return true },
  })
  const result = await answerPendingQuestion(ctx, 's1', 'c1', [{ id: 'q1', selected: ['要'], custom: '再补一句' }])
  assert.equal(result.accepted, true)
  assert.deepEqual(calls, [['s1', 'c1', { answers: [{ id: 'q1', selected: ['要'], custom: '再补一句' }] }]])
})

test('answerPendingQuestion：会话不在进程内/不支持时明确报错', async () => {
  await assert.rejects(
    () => answerPendingQuestion(ctxWith([], { agent: null }), 's1', 'c1', [{ id: 'q1', selected: [] }]),
    /会话不在当前进程中/,
  )
  await assert.rejects(
    () => answerPendingQuestion(ctxWith([], { answer: undefined }), 's1', 'c1', [{ id: 'q1', selected: [] }]),
    /不支持在工作站内回答提问/,
  )
})

test('readPendingApprovals：识别等待中的授权/审批请求，已被处理的不算', async () => {
  const { readPendingApprovals } = await import('../src/host/pending-questions.mjs')
  const events = [
    { type: 'approval/request', time: 1, data: { callId: 'a1', title: '允许写入 .env', detail: '工具需要写配置' } },
    { type: 'approval/request', time: 2, data: { id: 'a2', kind: 'oauth', message: '登录 GitHub' } },
    { type: 'approval/result', time: 3, data: { callId: 'a2', decision: 'approved' } },
    { type: 'authorization/begin', time: 4, data: { requestId: 'a3', description: '连接 GitLab' } },
  ]
  const ctx = { get: (name) => (name === 'sessions' ? { get: () => ({ snapshotEvents: () => events }) } : undefined) }
  const result = readPendingApprovals(ctx, 's1')
  const titles = result.approvals.map((entry) => entry.title)
  assert.ok(titles.includes('允许写入 .env'))
  assert.ok(!titles.some((title) => title.includes('GitHub')), '已处理的授权不该出现')
  assert.equal(result.approvals.length, 2)
})

test('readPendingApprovals：approval/asked 在 approval/decided 后不再显示（按 id 配对，不被 callId 带偏）', async () => {
  const { readPendingApprovals } = await import('../src/host/pending-questions.mjs')
  const asked = {
    type: 'approval/asked',
    time: 1,
    data: { id: 'req-1', callId: 'call-9', toolName: 'bash', reason: 'escalate sandbox to danger-full-access' },
  }
  const pending = readPendingApprovals(ctxWith([asked]), 's1')
  assert.equal(pending.approvals.length, 1)
  const decided = readPendingApprovals(ctxWith([
    asked,
    { type: 'approval/decided', time: 2, data: { id: 'req-1', outcome: 'allowed-once' } },
  ]), 's1')
  assert.deepEqual(decided.approvals, [], '已审批的请求不能继续显示为等待授权')
})

test('readPendingApprovals：没有会话/读失败都明确返回原因', async () => {
  const { readPendingApprovals } = await import('../src/host/pending-questions.mjs')
  assert.match(readPendingApprovals({ get: () => ({}) }, '').reason, /未绑定/)
  const ctx = { get: () => ({ get: () => undefined }) }
  assert.match(readPendingApprovals(ctx, 's1').reason, /不在当前进程中/)
})

test('readPendingQuestions：timed 提问区分 open / continued，open 不能在工作站代答', async () => {
  const events = [
    { type: 'tool/call', time: 1, data: { callId: 'c1', name: 'ask_user_question', arguments: askArgs([{ id: 'q1', question: '分支策略？' }]) } },
  ]
  const open = readPendingQuestions(ctxWith(events, {
    active: [{ callId: 'c1', state: 'open', questions: [{ id: 'q1', question: '分支策略？' }] }],
  }), 's1')
  assert.equal(open.pending[0].state, 'open')
  assert.equal(open.pending[0].answerable, false)
  await assert.rejects(
    () => answerPendingQuestion(ctxWith(events, {
      active: [{ callId: 'c1', state: 'open', questions: [{ id: 'q1', question: '分支策略？' }] }],
      answer: () => true,
    }), 's1', 'c1', [{ id: 'q1', selected: ['新建分支'] }]),
    /只能在会话里|不能代答|前台/,
  )

  const continued = readPendingQuestions(ctxWith(events, {
    active: [{ callId: 'c1', state: 'continued', questions: [{ id: 'q1', question: '分支策略？' }] }],
  }), 's1')
  assert.equal(continued.pending[0].state, 'continued')
  assert.equal(continued.pending[0].answerable, true)
})

test('readPendingQuestions：没有 projection 的 blocking 提问按 open 处理，引导去会话', () => {
  const events = [
    { type: 'tool/call', time: 1, data: { callId: 'c1', name: 'ask_user_question', arguments: askArgs([{ id: 'q1', question: '分支策略？' }]) } },
  ]
  const result = readPendingQuestions(ctxWith(events), 's1')
  assert.equal(result.pending[0].answerable, false)
})
