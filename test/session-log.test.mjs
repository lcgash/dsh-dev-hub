import assert from 'node:assert/strict'
import test from 'node:test'

const { sanitizeTerminalText, sessionLog } = await import('../src/host/session-log.mjs')

function ctxWith(messages, { alive = true, present = true } = {}) {
  return {
    get(name) {
      if (name === 'agents') return { get: () => (alive ? { id: 's1' } : undefined) }
      if (name === 'sessions') return { get: () => (present ? { deriveMessages: () => messages } : undefined) }
      return undefined
    },
  }
}

const msg = (role, content) => ({ role, content })

test('sessionLog：把消息压平成可展示的行，保留角色与文本', () => {
  const ctx = ctxWith([
    msg('user', [{ type: 'text', text: '给 source 加 webhook 重试' }]),
    msg('assistant', [{ type: 'text', text: '我先看 GitlabCodeProvider' }, { type: 'tool-call', name: 'grep' }]),
    msg('tool', [{ type: 'text', text: '3 处命中' }]),
    msg('assistant', [{ type: 'text', text: '' }]), // 空消息应被跳过
  ])
  const log = sessionLog(ctx, 's1')
  assert.equal(log.sessionId, 's1')
  assert.equal(log.alive, true)
  assert.equal(log.total, 3)
  assert.deepEqual(log.messages.map((row) => row.role), ['user', 'assistant', 'tool'])
  assert.match(log.messages[1].text, /\[调用工具\] grep/)
  assert.equal(log.messages[0].roleLabel, '你')
})

test('sessionLog：limit 只截最近 N 条，并标记 truncated', () => {
  const ctx = ctxWith(Array.from({ length: 10 }, (_, i) => msg('user', [{ type: 'text', text: `第 ${i} 条` }])))
  const log = sessionLog(ctx, 's1', { limit: 3 })
  assert.equal(log.messages.length, 3)
  assert.equal(log.truncated, true)
  assert.match(log.messages.at(-1).text, /第 9 条/)
})

test('sessionLog：会话不在进程内时给原因，不返回假消息', () => {
  const gone = sessionLog(ctxWith([], { alive: false, present: false }), 's1')
  assert.equal(gone.alive, false)
  assert.deepEqual(gone.messages, [])
  assert.match(gone.reason, /不在当前进程中/)

  const unbound = sessionLog(ctxWith([]), '')
  assert.equal(unbound.sessionId, null)
  assert.match(unbound.reason, /未绑定/)
})

test('sessionLog：deriveMessages 抛错时返回原因而不是整页崩', () => {
  const ctx = {
    get(name) {
      if (name === 'agents') return { get: () => ({ id: 's1' }) }
      if (name === 'sessions') return { get: () => ({ deriveMessages() { throw new Error('bad log') } }) }
      return undefined
    },
  }
  const log = sessionLog(ctx, 's1')
  assert.deepEqual(log.messages, [])
  assert.match(log.reason, /读取会话消息失败：bad log/)
})

test('sessionLog：超长文本截断，避免把整段输出塞进详情页', () => {
  const ctx = ctxWith([msg('tool', [{ type: 'text', text: 'x'.repeat(2000) }])])
  const log = sessionLog(ctx, 's1')
  assert.ok(log.messages[0].text.length <= 601)
  assert.match(log.messages[0].text, /…$/)
})

test('sessionTimeline：工具调用能读出来（名称/关键参数/状态），文本按角色分开', async () => {
  const { sessionTimeline } = await import('../src/host/session-log.mjs')
  const events = [
    { type: 'user/message', time: 1, data: { message: { content: [{ type: 'text', text: '给 source 加告警' }] } } },
    { type: 'tool/call', time: 2, data: { callId: 'c1', name: 'read', arguments: { path: 'src/main/java/x/source/A.java' } } },
    { type: 'tool/result', time: 3, data: { message: { toolCallId: 'c1' } } },
    { type: 'tool/call', time: 4, data: { callId: 'c2', name: 'bash', arguments: { command: 'mvn -o clean test' } } },
    { type: 'assistant/message', time: 5, data: { message: { content: [{ type: 'text', text: '测试跑完了，两处要改。' }] } } },
  ]
  const ctx = { get: (name) => (name === 'sessions' ? { get: () => ({ snapshotEvents: () => events }) } : { get: () => ({ id: 's1' }) }) }
  const result = sessionTimeline(ctx, 's1')
  assert.deepEqual(result.items.map((item) => item.kind), ['user', 'tool', 'tool', 'assistant'])
  assert.equal(result.items[1].name, 'read')
  assert.match(result.items[1].brief, /source\/A\.java/)
  assert.equal(result.items[1].status, 'ok', '有 tool/result 就是完成')
  assert.equal(result.items[2].status, 'running', '没有 result 就是执行中')
  assert.match(result.items[2].brief, /mvn -o clean test/)
  assert.match(result.items[3].text, /测试跑完了/)
})


test('sessionTimeline：job/settled 当作工具活动（命令可读）', async () => {
  const { sessionTimeline } = await import('../src/host/session-log.mjs')
  const events = [
    { type: 'job/settled', time: 1, data: { kind: 'bash', label: 'mvn -o clean test', status: 'completed' } },
    { type: 'job/settled', time: 2, data: { kind: 'bash', label: 'sh scripts/check.sh', status: 'failed' } },
  ]
  const ctx = { get: (name) => (name === 'sessions' ? { get: () => ({ snapshotEvents: () => events }) } : { get: () => ({ id: 's1' }) }) }
  const result = sessionTimeline(ctx, 's1')
  assert.equal(result.items.length, 2)
  assert.equal(result.items[0].name, 'bash')
  assert.match(result.items[0].brief, /mvn -o clean test/)
  assert.equal(result.items[1].status, 'error')
})

test('sanitizeTerminalText：清掉 ANSI/光标序列，保留可读文本', () => {
  const raw = '\u001b[2J\u001b[H\u001b[38;2;255;255;255m·\u001b[39mLoading\r\u001b[2CNo sessions match "x".'
  const clean = sanitizeTerminalText(raw)
  assert.equal(clean, '·Loading\nNo sessions match "x".')
  assert.doesNotMatch(clean, /\u001b|\[2C|\[H/)
})
