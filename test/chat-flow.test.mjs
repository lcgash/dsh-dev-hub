import assert from 'node:assert/strict'
import test from 'node:test'

const { probeCode, confirmAndStart, summarizeRecon, PHASE, message } = await import('../src/client/chat-flow.mjs')

function reconFixture(overrides = {}) {
  return {
    description: '给 GitlabCodeProvider 补 webhook 重试',
    tokens: ['gitlabcodeprovider', 'webhook'],
    files: [{ path: 'src/main/java/com/gitee/pipeline/source/GitlabCodeProvider.java', score: 7, matches: [{ line: 42, text: 'retry' }] }],
    modules: [{ name: 'source', path: 'src/main/java/com/gitee/pipeline/source', hits: 1 }],
    suggestedScope: ['src/main/java/com/gitee/pipeline/source'],
    scanned: 120,
    truncated: false,
    ...overrides,
  }
}

test('probeCode：描述太短直接拒绝，正常描述带出草稿与探测结果', async () => {
  let seenOptions = null
  const deps = { recon: async (text, options) => { seenOptions = options; return reconFixture({ description: text }) } }
  await assert.rejects(() => probeCode(deps, '改一下'), /再多写一点/)

  const result = await probeCode(deps, '给 GitlabCodeProvider 补 webhook 重试', { repoPath: '/repo/plugins' })
  assert.equal(seenOptions.repoPath, '/repo/plugins')
  assert.equal(result.recon.files.length, 1)
  assert.equal(result.draft.name, '给 GitlabCodeProvider 补 webhook 重试')
  assert.equal(result.draft.id, 'gitlabcodeprovider-webhook')
})

test('summarizeRecon：给结论（扫了多少、命中几个、集中在哪）', () => {
  assert.match(summarizeRecon(reconFixture()), /扫了 120 个文件，命中 1 个候选，集中在 source/)
  assert.match(summarizeRecon(reconFixture({ files: [] })), /没找到明确相关的位置/)
})

test('confirmAndStart：首次先落规范，再建流程、记 baseline、开开发会话', async () => {
  const calls = []
  const deps = {
    bootstrap: async () => {
      calls.push(['bootstrap'])
      return { summary: { constraints: 12 } }
    },
    create: async (payload) => {
      calls.push(['create', payload])
      return { item: { id: payload.id, title: payload.name }, parallel: { canParallel: true } }
    },
    start: async (id) => {
      calls.push(['start', id])
      return { item: { id, title: 'Gitlab webhook' }, context: { prompt: 'PACK' } }
    },
    launch: async (payload) => {
      calls.push(['launch', payload])
      return { sessionId: 'session-3', sent: true }
    },
    prompt: (pack, item) => `HEAD|${item.id}|${pack}`,
  }

  const result = await confirmAndStart(deps, {
    description: '给 GitlabCodeProvider 补 webhook 重试',
    draft: { name: 'Gitlab webhook', id: 'gitlab-webhook' },
    scope: ['src/main/java/com/gitee/pipeline/source'],
    recon: reconFixture(),
    firstRun: true,
    cwd: '/repo',
    spec: { problem: 'webhook 失败后没有重试，通知丢失', goals: ['给 webhook 增加失败重试'] },
  })

  assert.deepEqual(calls.map((call) => call[0]), ['bootstrap', 'create', 'start', 'launch'])
  const created = calls[1][1]
  assert.deepEqual(created.scope, ['src/main/java/com/gitee/pipeline/source'])
  assert.equal(created.recon.files.length, 1, '确认过的文件必须带进流程')
  // 目标/根因不再用 `|| description` 拿客户原话兜底：由 Host 按澄清规格规范化
  assert.equal(created.rootProblem, undefined, '不把原始描述直接当根因')
  assert.equal(created.goal, undefined, '不把原始描述直接当目标')
  assert.deepEqual(created.spec, { problem: 'webhook 失败后没有重试，通知丢失', goals: ['给 webhook 增加失败重试'] }, '澄清规格要透传给 Host')
  assert.deepEqual(calls[3][1], {
    cwd: '/repo',
    itemId: 'gitlab-webhook',
    contextPack: 'PACK',
    context: { prompt: 'PACK' },
    item: { id: 'gitlab-webhook', title: 'Gitlab webhook' },
    prompt: 'HEAD|gitlab-webhook|PACK',
  })
  assert.equal(result.sessionId, 'session-3')
  assert.equal(result.messages.length, 4, '首次：规范 + 流程 + baseline + 会话 四条工作站消息')
  assert.match(result.messages[0].text, /12 条约束/)
})

test('confirmAndStart：开工前默认先同步代码；关闭 syncBeforeStart 则跳过', async () => {
  const calls = []
  const deps = {
    create: async (payload) => ({ item: { id: payload.id, title: payload.name } }),
    sync: async (id) => {
      calls.push(['sync', id])
      return { ok: true, repos: [{ name: 'web', before: 'aaa', after: 'bbb', updated: true }] }
    },
    start: async (id) => { calls.push(['start', id]); return { item: { id }, context: { prompt: 'P' } } },
    launch: async () => ({ sessionId: 's', sent: true }),
    prompt: (pack) => pack,
  }
  const synced = await confirmAndStart(deps, {
    description: 'x', draft: { name: 'n', id: 'flow-sync' }, scope: ['src'], firstRun: false, syncBeforeStart: true,
  })
  assert.deepEqual(calls.map((call) => call[0]), ['sync', 'start'])
  assert.ok(synced.messages.some((msg) => /开工前已同步/.test(msg.text)), JSON.stringify(synced.messages))

  calls.length = 0
  await confirmAndStart(deps, {
    description: 'x', draft: { name: 'n', id: 'flow-nosync' }, scope: ['src'], firstRun: false, syncBeforeStart: false,
  })
  assert.deepEqual(calls.map((call) => call[0]), ['start'])
})

test('confirmAndStart：非首次不落规范；没有范围要报错', async () => {
  const calls = []
  const deps = {
    bootstrap: async () => { calls.push('bootstrap'); return {} },
    create: async (payload) => ({ item: { id: payload.id, title: payload.name } }),
    start: async (id) => ({ item: { id }, context: { prompt: 'P' } }),
    launch: async () => ({ sessionId: null, sent: false }),
    prompt: (pack) => pack,
  }
  const result = await confirmAndStart(deps, {
    description: 'x',
    draft: { name: 'n', id: 'i' },
    scope: ['module:source'],
    firstRun: false,
  })
  assert.deepEqual(calls, [], '非首次不调 bootstrap')
  assert.match(result.messages.at(-1).text, /确认后按发送/)

  await assert.rejects(() => confirmAndStart(deps, { description: 'x', draft: { name: 'n', id: 'i' }, scope: [] }), /至少要保留一个目录或模块/)
})

test('message：id 单调递增，便于 React 列表 key', () => {
  const a = message('user', 'text', { text: 'a' })
  const b = message('workstation', 'text', { text: 'b' })
  assert.notEqual(a.id, b.id)
  assert.equal(PHASE.confirm, 'confirm')
})

test('generatePlan：只把工作站需要的字段发出去，并校验输入', async () => {
  const { generatePlan, questionsMessage, planMessage, estimateSummary } = await import('../src/client/chat-flow.mjs')
  const calls = []
  const deps = {
    plan: async (body) => {
      calls.push(body)
      return { steps: ['a', 'b'], acceptance: ['x'], estimate: { size: 'M', days: 2, confidence: 'medium' }, risks: [], summary: 's' }
    },
  }
  const result = await generatePlan(deps, {
    description: '给 source 补 webhook 重试',
    recon: { tokens: ['webhook'], files: [{ path: 'a.java' }] },
    scope: ['module:source'],
    answers: { tests: 'add-tests' },
  })
  assert.equal(calls.length, 1)
  assert.deepEqual(Object.keys(calls[0]).sort(), ['answers', 'description', 'recon', 'scope'])
  assert.deepEqual(Object.keys(calls[0].recon).sort(), ['files', 'tokens'])
  assert.equal(result.steps.length, 2)

  await assert.rejects(() => generatePlan(deps, { description: 'x', recon: {}, scope: ['a'] }), /再多写一点/)
  await assert.rejects(() => generatePlan(deps, { description: '足够长的描述', recon: {}, scope: [] }), /目录或模块/)
  await assert.rejects(() => generatePlan({ plan: async () => ({ steps: [] }) }, { description: '足够长的描述', recon: {}, scope: ['a'] }), /计划/)

  const q = questionsMessage([{ id: 'a' }, { id: 'b' }])
  assert.equal(q.kind, 'questions')
  assert.equal(q.questions.length, 2)
  const p = planMessage({ steps: ['a'] })
  assert.equal(p.kind, 'plan')
  assert.match(estimateSummary({ size: 'M', days: 2, confidence: 'medium' }), /M/)
  assert.match(estimateSummary(null), /暂未给出/)
})

test('confirmAndStart：把计划与追问答案透传给 create（并保持旧调用兼容）', async () => {
  const { confirmAndStart } = await import('../src/client/chat-flow.mjs')
  const created = []
  const deps = {
    bootstrap: async () => ({ summary: { constraints: 3 } }),
    create: async (payload) => {
      created.push(payload)
      return { item: { id: payload.id, title: payload.name } }
    },
    start: async (id) => ({ item: { id }, context: { prompt: 'P' } }),
    launch: async () => ({ sessionId: 's1', sent: true }),
    prompt: (pack) => pack,
  }
  await confirmAndStart(deps, {
    description: '给 source 补 webhook',
    draft: { name: 'n', id: 'i' },
    scope: ['module:source'],
    firstRun: false,
    // 计划字段是平的（与 chat.mjs 的调用一致），不是嵌套 plan 对象
    summary: 's',
    steps: ['a'],
    acceptance: ['x'],
    estimate: { size: 'M', days: 2 },
    questions: [{ id: 'tests', question: '补测试？', answer: 'add-tests' }],
  })
  assert.deepEqual(created[0].plan, { summary: 's', steps: ['a'], acceptance: ['x'], estimate: { size: 'M', days: 2 } })
  assert.equal(created[0].questions[0].id, 'tests')
  assert.equal(created[0].questions[0].answer, 'add-tests')
  assert.ok(created[0].questions[0].answeredAt)

  // 旧调用不带 plan/questions -> 不塞这两个键
  created.length = 0
  await confirmAndStart(deps, { description: 'x', draft: { name: 'n', id: 'i2' }, scope: ['a'], firstRun: false })
  assert.equal('plan' in created[0], false)
  assert.equal('questions' in created[0], false)
})
