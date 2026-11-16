import assert from 'node:assert/strict'
import test from 'node:test'

const { describeFlow, suggestNextSteps, composeAsk, continuePrompt } = await import('../src/client/next-steps.mjs')

function flow(overrides = {}) {
  return {
    id: 'f1',
    title: '给 source 补 webhook',
    status: 'planned',
    tasks: [{ text: 'a', done: true }, { text: 'b', done: false }],
    risks: [],
    workflow: {
      stage: 'plan',
      stageReason: '计划摘要与步骤齐备',
      tests: { local: { status: 'not_run' }, environment: { status: 'not_run' } },
    },
    ...overrides,
  }
}

test('describeFlow：把阶段/任务/测试/风险压成可展示的事实', () => {
  const summary = describeFlow(flow(), null)
  assert.equal(summary.stageLabel, '开发计划')
  assert.deepEqual(summary.tasks, { done: 1, total: 2 })
  assert.equal(summary.localTestLabel, '未运行')
  assert.equal(summary.session.bound, false)
})

test('suggestNextSteps：没会话时先建议开会话；有风险时先处理风险', () => {
  const noSession = suggestNextSteps(flow(), null)
  assert.ok(noSession.steps.some((step) => step.action === 'launch'))
  assert.ok(noSession.steps.length <= 3)

  const risky = suggestNextSteps(flow({ risks: ['依赖外部系统'] }), null)
  assert.equal(risky.steps[0].action, 'edit-risks')
})

test('suggestNextSteps：会话运行中 vs 空闲给不同建议', () => {
  const running = suggestNextSteps(flow({ status: 'developing' }), { sessionId: 's1', running: true, alive: true })
  assert.ok(running.steps.some((step) => step.action === 'ask-session'))
  assert.match(running.steps.find((step) => step.action === 'ask-session').title, /在做/)

  const idle = suggestNextSteps(flow({ status: 'developing' }), { sessionId: 's1', running: false, alive: true })
  assert.match(idle.steps.find((step) => step.action === 'ask-session').title, /继续推进/)
})

const reviewPassed = {
  status: 'passed',
  round: 1,
  reviewers: [
    { id: 'reviewer-1', role: 'direction', status: 'passed', verdict: 'pass', summary: '方向一致' },
    { id: 'reviewer-2', role: 'correctness', status: 'passed', verdict: 'pass', summary: '实现正确' },
  ],
}

test('suggestNextSteps：评审是测试验证的门禁', () => {
  // 本机自测通过但还没评审：建议「继续推进即开始评审」，不给环境测试
  const localPassed = suggestNextSteps(
    flow({ workflow: { stage: 'review', tests: { local: { status: 'passed' }, environment: { status: 'not_run' } } } }),
    { sessionId: 's1', running: false },
  )
  const startReviewStep = localPassed.steps.find((step) => step.action === 'start-review')
  assert.ok(startReviewStep)
  assert.ok(!localPassed.steps.some((step) => step.action === 'env-test'))
  assert.match(startReviewStep.title, /继续推进即开始评审/)
  // 评审阶段不该再把「继续推进」误发给开发会话（那会绕开评审门禁）
  assert.ok(!localPassed.steps.some((step) => step.action === 'ask-session'))

  // 评审通过：才提示环境测试
  const reviewed = suggestNextSteps(
    flow({ workflow: { stage: 'verify', review: reviewPassed, tests: { local: { status: 'passed' }, environment: { status: 'not_run' } } } }),
    { sessionId: 's1', running: false },
  )
  assert.ok(reviewed.steps.some((step) => step.action === 'env-test'))

  // 评审不通过：先按纠偏意见改，环境测试已通过也不给「提交」
  const failed = suggestNextSteps(
    flow({
      workflow: {
        stage: 'develop',
        review: {
          status: 'failed',
          round: 1,
          reviewers: [{ id: 'reviewer-1', role: 'direction', status: 'failed', verdict: 'fail', summary: '方向不对', findings: [{ severity: 'major', summary: '少了回滚路径' }] }],
        },
        tests: { local: { status: 'passed' }, environment: { status: 'passed' } },
      },
    }),
    { sessionId: 's1', running: false },
  )
  assert.ok(failed.steps.some((step) => step.action === 'rework'))
  assert.ok(!failed.steps.some((step) => step.action === 'submit'))
  assert.match(failed.steps.find((step) => step.action === 'rework').hint, /1 条意见/)
  assert.match(failed.steps.find((step) => step.action === 'rework').hint, /返工/)

  const envPassed = suggestNextSteps(
    flow({ workflow: { stage: 'submit', review: reviewPassed, tests: { local: { status: 'passed' }, environment: { status: 'passed' } } } }),
    { sessionId: 's1', running: false },
  )
  assert.ok(envPassed.steps.some((step) => step.action === 'submit'))
})

test('suggestNextSteps：会话还在跑时不催着跑本机自测，空闲后仍保留测试建议', () => {
  const running = suggestNextSteps(flow({ status: 'developing' }), { sessionId: 's1', running: true, alive: true })
  // 正在开发：先让「看看它现在在做什么」排前面；不要让「跑本机自测」和开发抢活
  assert.ok(running.steps.some((step) => step.action === 'ask-session'))
  assert.ok(!running.steps.some((step) => step.action === 'local-test'), 'running 会话不应建议 local-test')

  const idle = suggestNextSteps(flow({ status: 'developing' }), { sessionId: 's1', running: false, alive: true })
  assert.ok(idle.steps.some((step) => step.action === 'local-test'), 'idle 已绑定会话仍应建议 local-test')
})

test('continuePrompt：轻量继续只带事实，不重发整包 Context Pack', () => {
  const summary = describeFlow(flow(), null)
  const text = continuePrompt(summary)
  assert.match(text, /继续推进/)
  assert.match(text, /任务 1\/2/)
  assert.match(text, /本机自测 未运行/)
  assert.doesNotMatch(text, /Context Pack|=====/)
  assert.ok(text.length < 200, '继续推进应是一句短消息，而不是整包上下文')
})

test('风险勾选：已知晓的从待处理数量里扣掉，全勾后不再建议「处理风险」', () => {
  const risky = flow({ risks: ['依赖外部系统', '缺少回滚方案'] })
  const partly = describeFlow({ ...risky, riskAcks: ['依赖外部系统'] }, null)
  assert.equal(partly.risks, 1, '待处理 = 总数 - 已知晓')
  assert.equal(partly.risksTotal, 2)
  assert.equal(partly.risksAcked, 1)

  const partialSteps = suggestNextSteps({ ...risky, riskAcks: ['依赖外部系统'] }, { sessionId: 's1', running: false })
  const step = partialSteps.steps.find((entry) => entry.action === 'edit-risks')
  assert.ok(step, '还有未勾选风险时要提示处理')
  assert.match(step.title, /处理 1 个风险\/阻塞/)
  assert.match(step.hint, /1\/2/)

  const allAcked = suggestNextSteps({ ...risky, riskAcks: ['依赖外部系统', '缺少回滚方案'] }, { sessionId: 's1', running: false })
  assert.ok(!allAcked.steps.some((entry) => entry.action === 'edit-risks'), '全部已知晓后不应再建议处理风险')
})

test('composeAsk：带上状态摘要；有用户输入时原样保留并要求说明做法', () => {
  const summary = describeFlow(flow(), null)
  const empty = composeAsk(summary, '')
  assert.match(empty, /请评估当前进度/)
  assert.match(empty, /本机自测 未运行/)

  const withText = composeAsk(summary, '我觉得应该先补测试')
  assert.match(withText, /我觉得应该先补测试/)
  assert.match(withText, /先说明你打算怎么做/)
})

test('已完成流程不再给「继续推进」建议', () => {
  const done = suggestNextSteps({ status: 'done', workflow: { stage: 'done', tests: {} }, tasks: [] }, null)
  assert.deepEqual(done.steps, [])
  assert.equal(done.summary.stageLabel, '已完成')
})

test('suggestNextSteps：分析流程只读，不建议评审/环境测试/提交', () => {
  const analysis = flow({
    status: 'developing',
    workflow: {
      stage: 'develop',
      intent: 'analysis',
      rootProblem: '分析调用链',
      tests: { local: { status: 'not_run' }, environment: { status: 'not_run' } },
    },
  })
  const summary = describeFlow(analysis, { sessionId: 's1', running: false })
  assert.equal(summary.intent, 'analysis')
  const next = suggestNextSteps(analysis, { sessionId: 's1', running: false })
  assert.ok(next.steps.some((step) => step.action === 'local-test'))
  assert.ok(!next.steps.some((step) => ['review', 'env-test', 'submit'].includes(step.action)))
  assert.match(next.steps.find((step) => step.action === 'local-test').hint, /只读证据/)

  // 没有会话时，开场提示也要说清是只读分析
  const fresh = suggestNextSteps(analysis, null)
  assert.match(fresh.steps.find((step) => step.action === 'launch').title, /分析会话/)
})

test('suggestNextSteps：评审 pending 不重复派发，异常给「重试评审」入口', () => {
  const pendingFlow = flow({
    workflow: {
      stage: 'review',
      review: {
        status: 'pending',
        round: 2,
        reviewers: [
          { id: 'reviewer-1', role: 'direction', status: 'pending' },
          { id: 'reviewer-2', role: 'correctness', status: 'pending' },
        ],
      },
      tests: { local: { status: 'passed' }, environment: { status: 'not_run' } },
    },
  })
  const pending = suggestNextSteps(pendingFlow, { sessionId: 's1', running: false })
  const pendingStep = pending.steps.find((step) => step.action === 'review')
  assert.ok(pendingStep)
  assert.match(pendingStep.title, /进行中/)
  assert.match(pendingStep.hint, /不重复派发/)
  assert.ok(!pending.steps.some((step) => step.action === 'start-review'), 'pending 时不应再给派发入口')

  const erroredFlow = flow({
    workflow: {
      stage: 'review',
      review: {
        status: 'error',
        round: 1,
        reviewers: [{ id: 'reviewer-1', role: 'direction', status: 'error', error: 'provider down' }],
      },
      tests: { local: { status: 'passed' }, environment: { status: 'not_run' } },
    },
  })
  const errored = suggestNextSteps(erroredFlow, { sessionId: 's1', running: false })
  const retryStep = errored.steps.find((step) => step.action === 'start-review')
  assert.ok(retryStep, '异常时应给重试评审入口')
  assert.match(retryStep.title, /重试评审/)
  assert.match(retryStep.hint, /待处理/)
})
