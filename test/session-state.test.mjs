import assert from 'node:assert/strict'
import test from 'node:test'

const { sessionState, sessionStates } = await import('../src/host/session-state.mjs')

function fakeCtx({ agent = null, events = [], present = true } = {}) {
  const session = {
    snapshotEvents: () => events,
  }
  return {
    get(name) {
      if (name === 'agents') return { get: () => agent }
      if (name === 'sessions') return { get: () => (present ? session : undefined) }
      return undefined
    },
  }
}

const t = (minutes) => Date.UTC(2026, 10, 9, 3, minutes)

function assistant(text) {
  return { type: 'assistant/message', time: t(0), data: { message: { content: [{ type: 'text', text }] } } }
}

test('sessionState：运行中（最后一个 turn 事件是 start）', () => {
  const ctx = fakeCtx({
    agent: { id: 's1' },
    events: [
      { type: 'turn/start', time: t(0), data: { turn: 1 } },
      { type: 'step/start', time: t(1), data: {} },
      { type: 'tool/call', time: t(2), data: { name: 'grep' } },
      assistant('正在查调用方'),
    ],
  })
  const state = sessionState(ctx, 's1', { now: t(3) })
  assert.equal(state.alive, true)
  assert.equal(state.loaded, true)
  assert.equal(state.running, true)
  assert.equal(state.turns, 1)
  assert.equal(state.lastTool, 'grep')
  assert.match(state.lastText, /正在查调用方/)
  assert.equal(state.error, null)
  assert.ok(state.idleSeconds >= 0)
})

test('sessionState：空闲/已结束（最后一个 turn 事件是 end）', () => {
  const ctx = fakeCtx({
    agent: { id: 's1' },
    events: [
      { type: 'turn/start', time: t(0), data: {} },
      assistant('做完了'),
      { type: 'turn/end', time: t(1), data: { reason: { kind: 'completed' } } },
    ],
  })
  const state = sessionState(ctx, 's1', { now: t(2) })
  assert.equal(state.running, false)
  assert.equal(state.lastStage, 'ended')
})

test('sessionState：会话报错会带出来，不把失败当成功', () => {
  const ctx = fakeCtx({
    agent: { id: 's1' },
    events: [
      { type: 'turn/start', time: t(0), data: {} },
      { type: 'turn/end', time: t(1), data: { reason: { kind: 'error', error: { message: '模型超时' } } } },
    ],
  })
  const state = sessionState(ctx, 's1')
  assert.equal(state.running, false)
  assert.equal(state.error, '模型超时')
})

test('sessionState：只保留最近一轮的报错，重试开始/成功结束都会清掉旧错误', () => {
  const afterRetry = sessionState(fakeCtx({
    agent: { id: 's1' },
    events: [
      { type: 'turn/start', time: t(0), data: {} },
      { type: 'turn/end', time: t(1), data: { reason: { kind: 'error', error: { message: '上游流式响应错误' } } } },
      { type: 'turn/start', time: t(2), data: {} },
      assistant('重新开始跑'),
    ],
  }), 's1', { now: t(3) })
  assert.equal(afterRetry.running, true)
  assert.equal(afterRetry.error, null, '新一轮开始后旧错误不能继续挂着')

  const afterSuccess = sessionState(fakeCtx({
    agent: { id: 's1' },
    events: [
      { type: 'turn/start', time: t(0), data: {} },
      { type: 'turn/end', time: t(1), data: { reason: { kind: 'error', error: { message: '上游流式响应错误' } } } },
      { type: 'turn/start', time: t(2), data: {} },
      { type: 'turn/end', time: t(3), data: { reason: { kind: 'completed' } } },
    ],
  }), 's1', { now: t(4) })
  assert.equal(afterSuccess.error, null, '成功结束应清掉上一轮报错')
})

test('sessionState：未加载/不在进程内时明确说明，不伪造状态', () => {
  const missing = sessionState(fakeCtx({ present: false }), 'gone')
  assert.equal(missing.alive, false)
  assert.equal(missing.loaded, false)
  assert.match(missing.reason, /不在当前进程中/)
  assert.equal(missing.turns, 0)

  const none = sessionState(fakeCtx(), '')
  assert.equal(none.sessionId, null)
  assert.match(none.reason, /未绑定/)
})

test('sessionStates：只汇总已绑定会话的流程', () => {
  const ctx = fakeCtx({ agent: { id: 's1' }, events: [{ type: 'turn/start', time: t(0), data: {} }] })
  const result = sessionStates(ctx, [
    { id: 'a', title: '有会话', status: 'developing', session: { id: 's1', boundAt: 'x' } },
    { id: 'b', title: '没会话', status: 'planned', session: null },
  ])
  assert.equal(result.sessions.length, 1)
  assert.equal(result.sessions[0].itemId, 'a')
  assert.equal(result.sessions[0].running, true)
  assert.equal(result.sessions[0].boundAt, 'x')
  assert.ok(result.now > 0)
})

test('长回合：turn/start 被大量工具事件挤出窗口也要判定为在跑', async () => {
  const { sessionState } = await import('../src/host/session-state.mjs')
  const events = [
    { type: 'turn/start', time: 1, data: {} },
    ...Array.from({ length: 900 }, (_, index) => ({ type: 'job/settled', time: 2 + index, data: { kind: 'bash', label: `cmd-${index}` } })),
  ]
  const ctx = {
    get(name) {
      if (name === 'sessions') return { get: () => ({ snapshotEvents: () => events }) }
      if (name === 'agents') return { get: () => ({ id: 's1' }) }
      return undefined
    },
  }
  const state = sessionState(ctx, 's1', { now: 1000 })
  assert.equal(state.running, true, 'turn/start 之后没有 turn/end，就是在跑')
  assert.equal(state.alive, true)
})

test('回合结束：turn/end 之后即使还有零散事件也不算在跑', async () => {
  const { sessionState } = await import('../src/host/session-state.mjs')
  const events = [
    { type: 'turn/start', time: 1, data: {} },
    { type: 'turn/end', time: 2, data: { reason: { kind: 'completed' } } },
    { type: 'job/settled', time: 3, data: { kind: 'bash', label: 'late' } },
  ]
  const ctx = {
    get(name) {
      if (name === 'sessions') return { get: () => ({ snapshotEvents: () => events }) }
      if (name === 'agents') return { get: () => ({ id: 's1' }) }
      return undefined
    },
  }
  const state = sessionState(ctx, 's1', { now: 1000 })
  assert.equal(state.running, false)
  assert.equal(state.lastStage, 'ended')
})

test('sessionState：会话还在但 agent 已不在（重启/清理）→ 不算在跑，不能把流程永远卡在开发中', () => {
  const ctx = fakeCtx({
    agent: null,
    events: [
      { type: 'turn/start', time: t(0), data: {} },
      { type: 'tool/call', time: t(1), data: { name: 'job_output' } },
    ],
  })
  const state = sessionState(ctx, 's1', { now: t(2) })
  assert.equal(state.alive, true, '会话对象还在：仍可读历史/绑定关系')
  assert.equal(state.agentAlive, false)
  assert.equal(state.running, false, '没有活 agent 就不该显示“正在开发”，否则「继续推进」永远被禁用')
  assert.equal(state.lastStage, 'ended')
})
