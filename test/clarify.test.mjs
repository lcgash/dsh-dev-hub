import assert from 'node:assert/strict'
import test from 'node:test'

const { CLARIFY_SCHEMA, MAX_ROUNDS, buildClarifyPrompt, normalizeClarify, answerSummary } = await import('../src/core/clarify.mjs')

test('CLARIFY_SCHEMA：reply 必填，questions/spec 形状固定', () => {
  assert.deepEqual(CLARIFY_SCHEMA.required, ['reply'])
  assert.ok(CLARIFY_SCHEMA.properties.questions.items.properties.options)
  assert.ok(CLARIFY_SCHEMA.properties.spec.properties.acceptance)
})

test('buildClarifyPrompt：带上原始描述、探测证据、已有问答与轮次约束', () => {
  const prompt = buildClarifyPrompt({
    description: '给 source 加个告警',
    history: [{ role: 'user', text: '什么时候告警？' }, { role: 'assistant', text: '失败时还是慢的时候？' }],
    recon: { files: [{ path: 'src/main/java/x/source/A.java', why: 'webhook 落点' }], suggestedScope: ['src/main/java/x/source'] },
    spec: { problem: '', goals: [] },
    round: 2,
  })
  assert.match(prompt, /给 source 加个告警/)
  assert.match(prompt, /webhook 落点/)
  assert.match(prompt, /第 2 轮/)
  assert.match(prompt, /最多问 2 个/)
  assert.match(prompt, /只输出 JSON/)
})

test('normalizeClarify：ready 需要问题/验收齐全且没有待问问题', () => {
  const ready = normalizeClarify({
    reply: '可以了',
    ready: true,
    questions: [],
    spec: { problem: '失败无告警', acceptance: ['失败时收到告警'], goals: ['补告警'] },
  })
  assert.equal(ready.ready, true)
  assert.deepEqual(ready.questions, [])
  assert.equal(ready.spec.problem, '失败无告警')

  const notReady = normalizeClarify({
    reply: '还需要确认',
    ready: true,
    questions: [{ id: 'q1', question: '告警发到哪里？' }],
    spec: { problem: 'x', acceptance: [] },
  })
  assert.equal(notReady.ready, false, '还有问题或没有验收时不算 ready')
})

test('normalizeClarify：最多 3 个问题、选项去空、id 兜底', () => {
  const result = normalizeClarify({
    reply: 'r',
    questions: [
      { question: 'A?', options: [{ label: 'x' }, { label: ' ' }] },
      { question: 'B?' },
      { question: 'C?' },
      { question: 'D?' },
    ],
  }, { round: 3 })
  assert.equal(result.questions.length, 3)
  assert.equal(result.questions[0].id, 'q3-1')
  assert.deepEqual(result.questions[0].options.map((option) => option.label), ['x'])
})

test('answerSummary：把选择与自由文本拼成可读记录', () => {
  const text = answerSummary(
    [{ id: 'q1', question: '范围？' }, { id: 'q2', question: '告警渠道？' }],
    { q1: { selected: ['只改 source'] }, q2: { selected: [], custom: '飞书' } },
  )
  assert.match(text, /范围？ → 只改 source/)
  assert.match(text, /告警渠道？ → 飞书/)
})

test('MAX_ROUNDS 是有限的正整数（不能让澄清无限循环）', () => {
  assert.ok(Number.isInteger(MAX_ROUNDS) && MAX_ROUNDS >= 2 && MAX_ROUNDS <= 6)
})

test('normalizeClarify：顺带总结流程标题（去句号、限长、空白归一）', () => {
  const result = normalizeClarify({ reply: 'r', title: ' 给源补失败告警。  ', questions: [], spec: { problem: 'p', acceptance: ['a'] } })
  assert.equal(result.title, '给源补失败告警')
  const long = normalizeClarify({ reply: 'r', title: '标'.repeat(80) })
  assert.ok(long.title.length <= 40)
})

test('buildClarifyPrompt：要求同时给出流程标题，并声明以用户修改为准', () => {
  const prompt = buildClarifyPrompt({ description: '给源加告警', round: 1 })
  assert.match(prompt, /流程标题/)
  assert.match(prompt, /10~20 字/)
  assert.match(prompt, /以用户为准/)
})
