import assert from 'node:assert/strict'
import test from 'node:test'

const { deriveStage, deriveStatus, applyDerivedProgress, STAGE_ORDER, stageIndex } = await import('../src/core/stage.mjs')
const { sanitizeItem } = await import('../src/core/store.mjs')

function base(extra = {}) {
  return {
    id: 'x',
    title: 't',
    status: 'planned',
    acceptance: ['ok'],
    workflow: {
      rootProblem: '要解决的问题',
      techDoc: { decision: 'none' },
      plan: { summary: '计划', steps: ['a'], estimate: { size: 'S', days: 1 } },
      ...extra,
    },
  }
}

/** 评审事实：两位审核员都通过 / 一位不通过 / 一位异常 / 进行中。 */
function review(overrides = {}) {
  const base = {
    status: 'passed',
    round: 1,
    reviewers: [
      { id: 'reviewer-1', label: '审核员 1（方向）', role: 'direction', status: 'passed', verdict: 'pass', summary: '方向一致' },
      { id: 'reviewer-2', label: '审核员 2（正确性）', role: 'correctness', status: 'passed', verdict: 'pass', summary: '实现正确' },
    ],
  }
  return { ...base, ...overrides }
}

test('deriveStage：开发 → 独立评审 → 测试验证 → 提交 → 完成', () => {
  assert.equal(deriveStage(base({ rootProblem: '', techDoc: {}, plan: {} })).stage, 'discovery')
  assert.equal(deriveStage(base({ plan: {} })).stage, 'techdoc')
  assert.equal(deriveStage(base()).stage, 'plan')

  const started = base()
  started.baseline = { commit: 'abc', startedAt: 'x' }
  assert.equal(deriveStage(started).stage, 'develop')

  // 本机自测通过只是评审的入口：没有评审事实时停在独立评审，不直接进测试验证
  const local = base()
  local.workflow.tests = { local: { status: 'passed' } }
  assert.equal(deriveStage(local).stage, 'review')
  assert.match(deriveStage(local).reason, /「继续推进」即开始独立评审/)

  const reviewed = base()
  reviewed.workflow.tests = { local: { status: 'passed' } }
  reviewed.workflow.review = review()
  assert.equal(deriveStage(reviewed).stage, 'verify')

  // 评审通过但还没跑测试：一样进入测试验证（评审放行的就是这个阶段）
  const reviewedNoTest = base()
  reviewedNoTest.workflow.review = review()
  assert.equal(deriveStage(reviewedNoTest).stage, 'verify')
  assert.match(deriveStage(reviewedNoTest).reason, /评审通过/)

  // 人工通过后即使还有旧的测试 rework 标记，也应进入评审之后的路线（去测试/提交），
  // 不能因为“测试曾过期”看起来又退回开发。
  const manual = base()
  manual.workflow.tests = { local: { status: 'passed' } }
  manual.workflow.review = review()
  manual.workflow.rework = { at: 'x', reason: '旧的测试 rework' }
  assert.equal(deriveStage(manual).stage, 'verify')
  manual.workflow.tests.environment = { status: 'passed' }
  assert.equal(deriveStage(manual).stage, 'submit')

  // 评审进行中 / 异常：停在评审，不能静默通过
  const pending = base()
  pending.workflow.tests = { local: { status: 'passed' } }
  pending.workflow.review = review({ status: 'pending', reviewers: [{ id: 'reviewer-1', role: 'direction', status: 'pending' }] })
  assert.equal(deriveStage(pending).stage, 'review')

  const errored = base()
  errored.workflow.tests = { local: { status: 'passed' } }
  errored.workflow.review = review({ reviewers: [{ id: 'reviewer-1', role: 'direction', status: 'error' }] })
  assert.equal(deriveStage(errored).stage, 'review')
  assert.match(deriveStage(errored).reason, /待处理/)

  // 评审不通过：即使自测/环境测试都过了，也退回开发纠偏
  const failed = base()
  failed.workflow.tests = { local: { status: 'passed' }, environment: { status: 'passed' } }
  failed.workflow.review = review({ reviewers: [{ id: 'reviewer-1', role: 'direction', status: 'failed', verdict: 'fail', summary: '方向不对', findings: [{ severity: 'major', summary: '少了回滚路径' }] }] })
  assert.equal(deriveStage(failed).stage, 'develop')
  assert.match(deriveStage(failed).reason, /评审未通过/)

  // 老数据没有评审事实：保持原行为，环境验证通过即待提交
  const env = base()
  env.workflow.tests = { local: { status: 'passed' }, environment: { status: 'passed' } }
  assert.equal(deriveStage(env).stage, 'submit')

  const envReviewed = base()
  envReviewed.workflow.tests = { local: { status: 'passed' }, environment: { status: 'passed' } }
  envReviewed.workflow.review = review()
  assert.equal(deriveStage(envReviewed).stage, 'submit')

  const done = base()
  done.workflow.submission = { commit: 'deadbeef' }
  assert.equal(deriveStage(done).stage, 'done')
})

test('deriveStage：绑定开发会话也算已开工', () => {
  const item = base()
  item.session = { id: 'session-1' }
  assert.equal(deriveStage(item).stage, 'develop')
  assert.match(deriveStage(item).reason, /会话/)
})

test('deriveStage：analysis 只读流程本机自测通过即结束，绝不进入提交', () => {
  const started = base()
  started.workflow.intent = 'analysis'
  started.baseline = { commit: 'abc', startedAt: 'x' }
  started.workflow.tests = { local: { status: 'not_run' }, environment: { status: 'not_run' } }
  assert.equal(deriveStage(started).stage, 'develop', '还没跑本机自测时停在开发')

  const localPassed = base()
  localPassed.workflow.intent = 'analysis'
  localPassed.workflow.tests = { local: { status: 'passed' } }
  assert.equal(deriveStage(localPassed).stage, 'done')
  assert.match(deriveStage(localPassed).reason, /不进入提交/)

  // 即使台账里有提交记录（旧数据/人工写入），分析流程也不认，不会因此进入提交或完成于“已提交代码”
  const withSubmission = base()
  withSubmission.workflow.intent = 'analysis'
  withSubmission.workflow.tests = { local: { status: 'passed' } }
  withSubmission.workflow.submission = { commit: 'deadbeef' }
  assert.equal(deriveStage(withSubmission).stage, 'done')
  assert.equal(deriveStage(withSubmission).reason, '分析流程：只读结论已产出，不进入提交')

  // 环境测试通过同样结束（不经过 submit）
  const envPassed = base()
  envPassed.workflow.intent = 'analysis'
  envPassed.workflow.tests = { local: { status: 'not_run' }, environment: { status: 'passed' } }
  assert.equal(deriveStage(envPassed).stage, 'done')
  assert.doesNotMatch(deriveStage(envPassed).reason, /待提交/)

  // sanitizeItem 保留三态 intent，并按 analysis 规则推导
  const sanitized = sanitizeItem({ ...localPassed, status: 'developing' })
  assert.equal(sanitized.workflow.intent, 'analysis')
  assert.equal(sanitized.workflow.stage, 'done')
  assert.equal(sanitized.status, 'done')
})

test('deriveStatus：状态随阶段走；blocked 是唯一保留的人工状态', () => {
  assert.equal(deriveStatus({ status: 'planned' }, 'plan').status, 'planned')
  assert.equal(deriveStatus({ status: 'planned' }, 'develop').status, 'developing')
  assert.equal(deriveStatus({ status: 'planned' }, 'review').status, 'reviewing')
  assert.equal(deriveStatus({ status: 'planned' }, 'verify').status, 'verifying')
  assert.equal(deriveStatus({ status: 'planned' }, 'done').status, 'done')
  assert.equal(deriveStatus({ status: 'blocked' }, 'develop').status, 'blocked')
})

test('sanitizeItem：手工写 stage/status 会被事实推导覆盖', () => {
  const item = sanitizeItem({
    ...base(),
    status: 'done',
    workflow: { ...base().workflow, stage: 'done' },
  })
  assert.equal(item.workflow.stage, 'plan', '没有提交事实就不能算完成')
  assert.equal(item.status, 'planned')
  assert.ok(item.workflow.stageReason)

  // 有事实时自动前进
  const started = sanitizeItem({ ...base(), baseline: { commit: 'abc', startedAt: 'x' } })
  assert.equal(started.workflow.stage, 'develop')
  assert.equal(started.status, 'developing')
})

test('sanitizeItem：blocked 不会被推导冲掉', () => {
  const item = sanitizeItem({ ...base(), status: 'blocked' })
  assert.equal(item.status, 'blocked')
  assert.equal(item.workflow.stage, 'plan')
})

test('applyDerivedProgress：原地修改并返回是否变化', () => {
  const item = base()
  item.workflow.stage = 'done'
  item.status = 'done'
  const changed = applyDerivedProgress(item)
  assert.equal(changed, true)
  assert.equal(item.workflow.stage, 'plan')
  assert.equal(item.status, 'planned')
  assert.equal(applyDerivedProgress(item), false, '第二次不应再变化')
})

test('stageIndex：评审阶段排在开发与测试验证之间', () => {
  assert.equal(stageIndex('develop'), STAGE_ORDER.indexOf('develop'))
  assert.ok(STAGE_ORDER.indexOf('review') > STAGE_ORDER.indexOf('develop'))
  assert.ok(STAGE_ORDER.indexOf('review') < STAGE_ORDER.indexOf('verify'))
  assert.equal(stageIndex('nope'), 0)
})
