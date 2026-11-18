import assert from 'node:assert/strict'
import test from 'node:test'

const { extractJson, runAgentJson } = await import('../src/host/agent-run.mjs')

function fakeCtx(result) {
  return {
    get(name) {
      if (name === 'agents') return { create: async () => ({ agent: { id: 'agent-1' }, dispose: async () => {} }) }
      if (name === 'subagents') return {
        list: () => ['spawn'],
        getProvider: () => ({ capabilities: { agentPreset: true } }),
        startActivation: async () => ({ childId: 'child-1', result: Promise.resolve(result), dispose: async () => {} }),
      }
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) }
      if (name === 'agentPresets') return { list: async () => [{ id: 'standard' }] }
      return null
    },
  }
}

test('extractJson：容忍尾逗号、截断与智能引号', () => {
  assert.deepEqual(extractJson('{"reply":"ok",}'), { reply: 'ok' })
  assert.deepEqual(extractJson('前言 {"reply":"ok","questions":[{"id":"q1"'), { reply: 'ok', questions: [{ id: 'q1' }] })
  assert.deepEqual(extractJson('{“reply”:“ok”}'), { reply: 'ok' })
  assert.equal(extractJson('没有 JSON'), null)
})

test('runAgentJson：agent 收尾报错但已产出合法 JSON 时仍返回结果，不触发无谓降级', async () => {
  const result = await runAgentJson(fakeCtx({
    stopReason: 'error',
    diagnostic: 'tool hook failed',
    output: [{ type: 'text', text: '{"reply":"已经生成好了","questions":[]}' }],
  }), { cwd: '/tmp', prompt: 'x', schema: { type: 'object' }, label: 'test' })
  assert.deepEqual(result.value, { reply: '已经生成好了', questions: [] })
  assert.equal(result.sessionId, 'child-1')
})
