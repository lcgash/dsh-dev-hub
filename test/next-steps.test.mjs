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

test('suggestNextSteps：会话相关操作收口到右上角「继续推进」，下一步不再重复 ask-session', () => {
  const running = suggestNextSteps(flow({ status: 'developing' }), { sessionId: 's1', running: true, alive: true })
  assert.ok(!running.steps.some((step) => step.action === 'ask-session'), '运行中不再建议“看看它现在在做什么”')

  const idle = suggestNextSteps(flow({ status: 'developing' }), { sessionId: 's1', running: false, alive: true })
  assert.ok(!idle.steps.some((step) => step.action === 'ask-session'), '空闲时“继续推进”由右上角按钮负责')
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

  // 已经发回返工：下一步改成重新评审，不再出现人工通过/返工入口
  const reworking = suggestNextSteps(
    flow({
      workflow: {
        stage: 'develop',
        review: {
          status: 'failed',
          round: 1,
          reworkAt: '2026-11-16T00:00:00.000Z',
          reviewers: [{ id: 'reviewer-1', role: 'direction', status: 'failed', verdict: 'fail', summary: '方向不对', findings: [] }],
        },
        tests: { local: { status: 'passed' }, environment: { status: 'not_run' } },
      },
    }),
    { sessionId: 's1', running: false },
  )
  assert.ok(reworking.steps.some((step) => step.action === 'start-review'))
  assert.ok(!reworking.steps.some((step) => step.action === 'rework'))

  // 达到自动轮次上限：不再自动返工/复审，给人工决定入口
  const exhausted = suggestNextSteps(
    flow({
      workflow: {
        stage: 'develop',
        review: {
          status: 'failed',
          round: 3,
          reviewers: [{ id: 'reviewer-1', role: 'direction', status: 'failed', verdict: 'fail', summary: '方向不对', findings: [] }],
        },
        tests: { local: { status: 'passed' }, environment: { status: 'not_run' } },
      },
    }),
    { sessionId: 's1', running: false },
  )
  assert.ok(exhausted.steps.some((step) => step.action === 'review'))
  assert.ok(!exhausted.steps.some((step) => step.action === 'rework' || step.action === 'start-review'))

  const envPassed = suggestNextSteps(
    flow({ workflow: { stage: 'submit', review: reviewPassed, tests: { local: { status: 'passed' }, environment: { status: 'passed' } } } }),
    { sessionId: 's1', running: false },
  )
  assert.ok(envPassed.steps.some((step) => step.action === 'submit'))
})

test('suggestNextSteps：会话还在跑时不催着跑本机自测，空闲后仍保留测试建议', () => {
  const running = suggestNextSteps(flow({ status: 'developing' }), { sessionId: 's1', running: true, alive: true })
  // 正在开发：下一步不重复会话操作（右上角显示「正在开发…」），也不催跑本机自测
  assert.ok(!running.steps.some((step) => step.action === 'ask-session'))
  assert.ok(!running.steps.some((step) => step.action === 'local-test'), 'running 会话不应建议 local-test')

  const idle = suggestNextSteps(flow({ status: 'developing' }), { sessionId: 's1', running: false, alive: true })
  assert.ok(!idle.steps.some((step) => step.action === 'local-test'), '开发阶段不催测试：测试在评审通过后由工作站执行')

  const reviewPassed = { status: 'passed', round: 1, reviewers: [{ id: 'reviewer-1', role: 'direction', status: 'passed', verdict: 'pass', findings: [] }] }
  const verify = suggestNextSteps(
    flow({ workflow: { stage: 'verify', review: reviewPassed, tests: { local: { status: 'not_run' }, environment: { status: 'not_run' } } } }),
    { sessionId: 's1', running: false, alive: true },
  )
  assert.ok(verify.steps.some((step) => step.action === 'local-test'), '评审通过、进入测试验证后才建议 local-test')
})

test('continuePrompt：轻量继续只带事实，不重发整包 Context Pack', () => {
  const summary = describeFlow(flow(), null)
  const text = continuePrompt(summary)
  assert.match(text, /继续推进/)
  assert.match(text, /任务 1\/2/)
  assert.match(text, /本机自测 未运行/)
  assert.doesNotMatch(text, /Context Pack|=====/)
  assert.match(text, /开发阶段只修改代码/)
  assert.ok(text.length < 600, '继续推进应是一句短消息，而不是整包上下文')
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
  assert.ok(!next.steps.some((step) => ['local-test', 'review', 'env-test', 'submit'].includes(step.action)))

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

test('suggestNextSteps：人工跳过测试后不再催跑本机自测，下一步转环境测试/提交', () => {
  const skippedLocal = suggestNextSteps(
    flow({
      workflow: {
        stage: 'verify',
        review: { reviewers: [{ id: 'reviewer-1', role: 'direction', status: 'passed', verdict: 'pass' }] },
        tests: { local: { status: 'skipped', skipReason: '依赖不可用' }, environment: { status: 'not_run' } },
      },
    }),
    { sessionId: 's1', running: false },
  )
  assert.ok(!skippedLocal.steps.some((step) => step.action === 'local-test'), '已跳过本机自测不应再建议跑本机自测')
  assert.ok(skippedLocal.steps.some((step) => step.action === 'env-test'))

  const bothSkipped = suggestNextSteps(
    flow({
      workflow: {
        stage: 'submit',
        review: { reviewers: [{ id: 'reviewer-1', role: 'direction', status: 'passed', verdict: 'pass' }] },
        tests: { local: { status: 'skipped' }, environment: { status: 'skipped' } },
      },
    }),
    { sessionId: 's1', running: false },
  )
  assert.ok(bothSkipped.steps.some((step) => step.action === 'submit'))
})

test('suggestNextSteps：小改动自动免评审，直接进入测试验证', () => {
  const small = flow({
    workflow: {
      stage: 'review',
      plan: { summary: '小修', steps: ['a'], estimate: { size: 'S', days: 0.5 } },
      tests: { local: { status: 'passed' }, environment: { status: 'not_run' } },
    },
    tasks: [{ text: 'a', done: true }],
  })
  const summary = describeFlow(small, { sessionId: 's1', running: false })
  assert.equal(summary.review.required, false)
  assert.equal(summary.stage, 'review')
  const steps = suggestNextSteps(small, { sessionId: 's1', running: false })
  assert.ok(steps.steps.some((step) => step.action === 'env-test'))
  assert.ok(!steps.steps.some((step) => step.action === 'start-review'), '小改动不应再自动建议评审')

  const smallNoTest = flow({
    workflow: {
      stage: 'develop',
      plan: { summary: '小修', steps: ['a'], estimate: { size: 'S', days: 0.5 } },
      tests: { local: { status: 'not_run' }, environment: { status: 'not_run' } },
    },
    tasks: [{ text: 'a', done: true }],
  })
  const local = suggestNextSteps(smallNoTest, { sessionId: 's1', running: false })
  assert.ok(local.steps.some((step) => step.action === 'local-test'))
  assert.ok(!local.steps.some((step) => step.action === 'start-review'))
})

test('会话等待授权：下一步只给“先处理授权”，不再建议重新评审/继续开发', () => {
  const blocked = suggestNextSteps(
    flow({ status: 'developing', workflow: { stage: 'develop', tests: { local: { status: 'not_run' }, environment: { status: 'not_run' } } } }),
    { sessionId: 's1', running: false, blocked: true, alive: true },
  )
  assert.equal(blocked.steps[0].action, 'open-session')
  assert.match(blocked.steps[0].title, /授权/)
  assert.ok(!blocked.steps.some((step) => ['start-review', 'rework', 'local-test', 'env-test'].includes(step.action)))
})
