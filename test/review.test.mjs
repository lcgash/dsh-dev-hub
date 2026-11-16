import assert from 'node:assert/strict'
import test from 'node:test'

const {
  REVIEW_SCHEMA,
  applyReviewerOutput,
  buildReviewerSlots,
  correctionsOf,
  describeReview,
  deriveReviewStatus,
  formatReviewLine,
  normalizeReview,
  normalizeReviewerCount,
  normalizeReviewerVerdict,
  reviewAdvancePlan,
  reviewFailureHint,
  reviewerPrompt,
  reviewerRolesFor,
  startReviewRound,
} = await import('../src/core/review.mjs')
const { deriveAttention } = await import('../src/core/attention.mjs')
const { buildReport } = await import('../src/core/report.mjs')
const { deriveStage } = await import('../src/core/stage.mjs')

const AT = '2026-11-13T08:00:00.000Z'

function reviewer(id, status, extra = {}) {
  return {
    id,
    label: `审核员 ${id.slice(-1)}`,
    role: id.endsWith('1') ? 'direction' : 'correctness',
    status,
    verdict: status === 'passed' ? 'pass' : status === 'failed' ? 'fail' : null,
    summary: status === 'passed' ? '通过' : status === 'failed' ? '发现阻塞问题' : '',
    findings: status === 'failed' ? [{ severity: 'major', summary: '少了回滚路径', file: 'src/a.mjs' }] : [],
    ...extra,
  }
}

function item(overrides = {}) {
  return {
    id: 'flow-1',
    title: '给流程加独立评审',
    status: 'reviewing',
    goal: '在开发与测试之间加独立评审',
    nonGoals: ['不替代测试'],
    acceptance: ['阶段里出现评审', '不通过要退回开发'],
    scope: ['src/core', 'src/client'],
    tasks: [{ text: '实现评审模型', done: true }],
    checks: [{ id: 'c1', text: 'npm test', command: 'npm test', status: 'passed' }],
    workflow: {
      stage: 'review',
      rootProblem: '缺少独立视角',
      plan: { summary: '先模型再界面', steps: ['模型', '界面'], estimate: { size: 'M', days: 2 } },
      tests: {
        local: { status: 'passed', command: 'npm test', output: '120 tests pass', at: AT },
        environment: { status: 'not_run' },
      },
      changePoints: [{ type: 'api', summary: '新增 POST /api/dev-hub/review' }],
      ...overrides,
    },
    fileNotes: { 'src/core/review.mjs': { note: '评审模型', source: 'human' } },
    risks: ['模型输出可能不稳定'],
    history: [{ at: AT, type: 'review', message: '派发独立评审' }],
    session: { id: 'session-dev' },
    ...overrides,
  }
}

test('normalizeReviewerCount / buildReviewerSlots：1~3 位，每位有独立标识与视角', () => {
  assert.equal(normalizeReviewerCount(undefined), 2)
  assert.equal(normalizeReviewerCount(0), 1)
  assert.equal(normalizeReviewerCount(9), 3)
  assert.equal(normalizeReviewerCount('bad'), 2)

  assert.deepEqual(reviewerRolesFor(1), ['direction'])
  assert.deepEqual(reviewerRolesFor(2), ['direction', 'correctness'])
  assert.deepEqual(reviewerRolesFor(3), ['direction', 'correctness', 'risk'])

  const slots = buildReviewerSlots(3)
  assert.deepEqual(slots.map((slot) => slot.id), ['reviewer-1', 'reviewer-2', 'reviewer-3'])
  assert.deepEqual(slots.map((slot) => slot.role), ['direction', 'correctness', 'risk'])
  assert.match(slots[2].label, /风险/)
})

test('normalizeReview：status 永远从审核员事实重算，手写 passed 不算数', () => {
  const pending = normalizeReview({ status: 'passed', reviewers: [reviewer('reviewer-1', 'pending')] })
  assert.equal(pending.status, 'pending')

  const failed = normalizeReview({ reviewers: [reviewer('reviewer-1', 'passed'), reviewer('reviewer-2', 'failed')] })
  assert.equal(failed.status, 'failed')

  // 一通过一异常：不是通过，而是待处理
  const errored = normalizeReview({ reviewers: [reviewer('reviewer-1', 'passed'), reviewer('reviewer-2', 'error')] })
  assert.equal(errored.status, 'error')

  assert.equal(normalizeReview(null), null)
  assert.equal(deriveReviewStatus([]), 'idle')
})

test('startReviewRound：上一轮进 history，新一轮审核员从 pending 开始', () => {
  const first = startReviewRound(null, { count: 2, at: AT, basis: { files: 3, added: 10, removed: 2, localTest: 'passed' } })
  assert.equal(first.round, 1)
  assert.equal(first.reviewers.length, 2)
  assert.equal(first.status, 'pending')
  assert.ok(first.reviewers.every((entry) => entry.status === 'pending' && entry.source === 'agent'))
  assert.deepEqual(first.basis, { files: 3, added: 10, removed: 2, head: '', localTest: 'passed', at: null })

  const decided = applyReviewerOutput(first, 'reviewer-1', { verdict: 'fail', summary: '方向不对', findings: [{ severity: 'blocker', summary: '没有处理失败路径' }], at: AT })
  const second = startReviewRound(decided, { count: 3, at: AT })
  assert.equal(second.round, 2)
  assert.equal(second.reviewers.length, 3)
  assert.equal(second.status, 'pending')
  assert.equal(second.history.length, 1)
  assert.equal(second.history[0].round, 1)
  assert.equal(second.history[0].reviewers[0].verdict, 'fail')
})

test('applyReviewerOutput：通过/不通过/异常都会如实落账，纠偏意见可追溯', () => {
  const started = startReviewRound(null, { count: 2, at: AT })
  const failed = applyReviewerOutput(started, 'reviewer-1', {
    verdict: 'fail',
    summary: '方向偏了',
    findings: [
      { severity: 'minor', summary: '命名可以更好' },
      { severity: 'blocker', summary: '失败路径没处理', detail: '提交失败时没有回滚', file: 'src/a.mjs' },
    ],
    direction: '先补失败路径',
    at: AT,
  })
  // 只要有一位明确不通过，结论就是「不通过」（不退回到「再等等」），纠偏可以立刻开始
  assert.equal(failed.status, 'failed')
  const reviewer1 = failed.reviewers.find((entry) => entry.id === 'reviewer-1')
  assert.equal(reviewer1.status, 'failed')
  assert.equal(reviewer1.verdict, 'fail')
  assert.equal(reviewer1.finishedAt, AT)
  const corrections = correctionsOf(failed)
  assert.equal(corrections.length, 1)
  assert.match(corrections[0].findings[0], /失败路径没处理/)
  assert.match(corrections[0].findings[0], /src\/a\.mjs/)
  assert.equal(corrections[0].findings.length, 1, '有 blocker 时纠偏只留拦路的意见，minor 不淹没重点')
  assert.match(corrections[0].findings[0], /回滚/)

  // 异常覆盖 verdict：会话没结论时不能当通过
  const errored = applyReviewerOutput(failed, 'reviewer-2', { verdict: 'pass', error: '审核员会话异常：provider down', at: AT })
  assert.equal(errored.status, 'failed', '已有一位不通过时，整体仍是不通过')
  assert.equal(errored.reviewers[1].status, 'error')
  assert.equal(errored.reviewers[1].verdict, null)

  const allPassed = applyReviewerOutput(
    applyReviewerOutput(started, 'reviewer-1', { verdict: 'pass', summary: 'ok', at: AT }),
    'reviewer-2',
    { verdict: 'pass', summary: 'ok', at: AT },
  )
  assert.equal(allPassed.status, 'passed')
  assert.equal(allPassed.decidedAt, AT)

  // 没有明确 verdict 的输出按异常处理，而不是默认通过
  const noVerdict = applyReviewerOutput(started, 'reviewer-1', { verdict: 'maybe', summary: '看不清', at: AT })
  assert.equal(noVerdict.reviewers[0].status, 'error')
  assert.equal(noVerdict.reviewers[0].verdict, null)
  assert.throws(() => applyReviewerOutput(started, 'reviewer-9', {}), /审核员不存在/)
})

test('reviewGate / deriveStage：通过才放行，不通过退回开发，异常停在待处理', () => {
  const passedItem = item({ review: normalizeReview({ round: 1, reviewers: [reviewer('reviewer-1', 'passed'), reviewer('reviewer-2', 'passed')] }) })
  assert.equal(deriveStage(passedItem).stage, 'verify')
  assert.equal(describeReview(passedItem).allowed, true)

  const failedItem = item({
    review: normalizeReview({ round: 1, reviewers: [reviewer('reviewer-1', 'failed'), reviewer('reviewer-2', 'passed')] }),
  })
  assert.equal(deriveStage(failedItem).stage, 'develop', '评审不通过必须回到开发')
  const failedView = describeReview(failedItem)
  assert.equal(failedView.allowed, false)
  assert.equal(failedView.corrections.length, 1)
  assert.match(deriveStage(failedItem).reason, /退回开发/)

  const erroredItem = item({ review: normalizeReview({ round: 1, reviewers: [reviewer('reviewer-1', 'error')] }) })
  assert.equal(deriveStage(erroredItem).stage, 'review')
  assert.match(describeReview(erroredItem).gateReason, /待处理/)

  const pendingItem = item({ review: normalizeReview({ round: 1, reviewers: [reviewer('reviewer-1', 'pending')] }) })
  assert.equal(deriveStage(pendingItem).stage, 'review')
  assert.equal(describeReview(pendingItem).allowed, false)

  // 未评审 + 自测通过：停在独立评审，不直接进测试验证
  const idle = item({ review: null })
  assert.equal(deriveStage(idle).stage, 'review')
  assert.match(describeReview(idle).gateReason, /继续推进即开始独立评审/)
})

test('reviewAdvancePlan：继续推进即开始评审；pending 幂等禁用；failed/error 可重试并带原因', () => {
  // 开发阶段完成（stage=review 且评审 idle）：继续推进＝自动开始评审
  const idle = item({ review: null })
  const dispatch = reviewAdvancePlan(idle)
  assert.equal(dispatch.action, 'dispatch')
  assert.equal(dispatch.disabled, false)
  assert.equal(dispatch.label, '开始独立评审')
  assert.match(dispatch.hint, /开始独立评审/)

  // 不在评审这一步：仍走原来的继续推进开发会话
  assert.equal(reviewAdvancePlan(item({ stage: 'develop', review: null })).action, 'continue')

  // 已有 pending：不重复派发，按钮禁用并显示「评审中」
  const waiting = reviewAdvancePlan(item({ review: normalizeReview({ round: 1, reviewers: [reviewer('reviewer-1', 'pending')] }) }))
  assert.equal(waiting.action, 'wait')
  assert.equal(waiting.label, '评审中')
  assert.equal(waiting.disabled, true)

  // 评审未通过：先提交纠偏意见返工，而不是继续/重试评审
  const failed = reviewAdvancePlan(item({ review: normalizeReview({ round: 2, reviewers: [reviewer('reviewer-1', 'failed')] }) }))
  assert.equal(failed.action, 'rework')
  assert.equal(failed.disabled, false)
  assert.match(failed.hint, /评审未通过/)
  assert.match(failed.hint, /返工/)
  assert.equal(failed.label, '提交纠偏并返工')

  // 审核员异常：同样可重试，原因里带审核员会话的错误
  const errored = reviewAdvancePlan(item({
    review: normalizeReview({ round: 1, reviewers: [reviewer('reviewer-1', 'error', { error: 'provider down' })] }),
  }))
  assert.equal(errored.action, 'retry')
  assert.equal(errored.disabled, false)
  assert.match(errored.hint, /provider down/)

  // 评审通过且阶段到 verify：顶栏直接去测试验证
  assert.equal(reviewAdvancePlan(item({
    stage: 'verify',
    review: normalizeReview({ reviewers: [reviewer('reviewer-1', 'passed')] }),
  })).action, 'verify')
  assert.equal(reviewAdvancePlan(item({ review: normalizeReview({ reviewers: [reviewer('reviewer-1', 'passed')] }) })).action, 'continue')

  // 失败原因可单独取用（按钮旁内联提示复用同一口径）
  assert.match(reviewFailureHint(describeReview(item({ review: normalizeReview({ reviewers: [reviewer('reviewer-1', 'error', { error: 'timeout' })] }) }))), /timeout/)
})

test('describeReview：票数、轮次、依据与来源都能在界面/报告里还原', () => {
  let review = startReviewRound(null, { count: 3, at: AT, basis: { files: 2, added: 5, removed: 1, head: 'abc123', localTest: 'passed' } })
  review = applyReviewerOutput(review, 'reviewer-1', { verdict: 'pass', summary: 'ok', sessionId: 's-1', elapsedMs: 1200, at: AT })
  review = applyReviewerOutput(review, 'reviewer-2', { verdict: 'fail', summary: '不行', findings: [{ severity: 'blocker', summary: '缺测试' }], sessionId: 's-2', at: AT })
  review = applyReviewerOutput(review, 'reviewer-3', { verdict: 'pass', summary: '人工放行', source: 'manual', at: AT })
  const view = describeReview(item({ review }))
  assert.equal(view.status, 'failed')
  assert.equal(view.verdict, 'fail')
  assert.equal(view.round, 1)
  assert.equal(view.total, 3)
  assert.equal(view.passed, 2)
  assert.equal(view.failed, 1)
  assert.equal(view.finished, 3)
  assert.equal(view.basis.files, 2)
  assert.equal(view.reviewers[2].source, 'manual')
  assert.equal(view.reviewers[0].sessionId, 's-1')
})

test('reviewerPrompt：审核员无需人工重述上下文就能读到改动与证据', () => {
  const files = {
    evidenceComplete: true,
    totals: { files: 2, added: 30, removed: 4 },
    files: [
      { path: 'src/core/review.mjs', status: 'added', added: 30, removed: 0, inScope: true, note: '评审模型' },
      { path: 'docs/x.md', status: 'modified', added: 2, removed: 4, inScope: false, note: '' },
    ],
  }
  const report = buildReport({ item: { ...item({ review: null }), workflow: { ...item().workflow, stage: 'review' } }, files, git: { isRepo: true, branch: 'main', head: 'abc123' }, generatedAt: AT })
  const direction = reviewerPrompt({
    item: item({ review: null }),
    reviewer: { id: 'reviewer-1', label: '审核员 1（方向）', role: 'direction' },
    repoName: 'dsh-dev-hub',
    repoPath: '/repo',
    files,
    report,
    constraints: ['[scope] 只改 scope 内文件'],
    total: 2,
  })
  const correctness = reviewerPrompt({
    item: item({ review: null }),
    reviewer: { id: 'reviewer-2', label: '审核员 2（正确性）', role: 'correctness' },
    repoName: 'dsh-dev-hub',
    files,
    report,
    total: 2,
  })
  assert.match(direction, /独立审核员 1\/2/)
  assert.match(direction, /在开发与测试之间加独立评审/)
  assert.match(direction, /A1\. 阶段里出现评审/)
  assert.match(direction, /src\/core、src\/client/)
  assert.match(direction, /src\/core\/review\.mjs/)
  assert.match(direction, /不在 scope 内/)
  assert.match(direction, /本机自测：通过/)
  assert.match(direction, /120 tests pass/)
  assert.match(direction, /开发报告摘要/)
  assert.match(direction, /\[scope\] 只改 scope 内文件/)
  assert.match(direction, /只读纪律/)
  assert.match(direction, /"verdict":"pass\|fail"/)
  assert.match(correctness, /边界\/异常\/失败路径/)
  assert.notEqual(direction, correctness, '不同视角的提示词必须不同')
  assert.throws(() => reviewerPrompt({}), /需要开发项/)
})

test('REVIEW_SCHEMA / normalizeReviewerVerdict：契约只接受 pass/fail 与三档问题级别', () => {
  assert.deepEqual(REVIEW_SCHEMA.properties.verdict.enum, ['pass', 'fail'])
  assert.deepEqual(REVIEW_SCHEMA.properties.findings.items.properties.severity.enum, ['blocker', 'major', 'minor'])
  const normalized = normalizeReviewerVerdict({
    verdict: 'pass',
    summary: '  可以  ',
    findings: [{ severity: 'huge', summary: 'x' }, { severity: 'minor', summary: '' }],
    confidence: 'maybe',
  })
  assert.equal(normalized.verdict, 'pass')
  assert.equal(normalized.summary, '可以')
  assert.equal(normalized.findings.length, 1)
  assert.equal(normalized.findings[0].severity, 'major')
  assert.equal(normalized.confidence, null)
  assert.equal(normalizeReviewerVerdict({ verdict: 'lgtm' }).verdict, null)
})

test('formatReviewLine：通过/不通过与纠偏意见能直接给开发会话看', () => {
  const idle = formatReviewLine(item({ review: null }))
  assert.match(idle, /未评审/)

  const passed = formatReviewLine(item({ review: normalizeReview({ round: 1, reviewers: [reviewer('reviewer-1', 'passed')] }) }))
  assert.match(passed, /评审通过/)

  const failed = formatReviewLine(item({ review: normalizeReview({ round: 2, reviewers: [reviewer('reviewer-1', 'failed')] }) }))
  assert.match(failed, /第 2 轮/)
  assert.match(failed, /评审未通过/)
  assert.match(failed, /少了回滚路径/)
})

test('开发报告：评审结论单独成段，不通过时列出纠偏意见并影响报告结论', () => {
  const passed = buildReport({
    item: item({ review: normalizeReview({ round: 1, reviewers: [reviewer('reviewer-1', 'passed'), reviewer('reviewer-2', 'passed')] }) }),
    files: null,
    git: { isRepo: true, branch: 'main', head: 'abc123' },
    generatedAt: AT,
  })
  const passedSection = passed.sections.find((section) => section.id === 'review')
  assert.ok(passedSection)
  assert.equal(passedSection.blocks.find((block) => block.type === 'fields').fields.find((field) => field.label === '结论').value, '通过（允许进入测试验证）')
  assert.equal(passed.summary.review.allowed, true)
  assert.equal(passed.verdict, 'incomplete', '评审通过但还没环境测试：报告仍是未完成')

  const failed = buildReport({
    item: { ...item({ review: normalizeReview({ round: 1, reviewers: [reviewer('reviewer-1', 'failed')] }) }), status: 'developing' },
    files: null,
    git: { isRepo: true, branch: 'main', head: 'abc123' },
    generatedAt: AT,
  })
  assert.equal(failed.verdict, 'failed')
  assert.match(failed.verdictReason, /独立评审未通过/)
  const failedSection = failed.sections.find((section) => section.id === 'review')
  assert.ok(failedSection.blocks.some((block) => block.type === 'list' && block.title === '退回开发的纠偏意见'))
  assert.ok(failedSection.blocks.some((block) => block.type === 'table' && block.title === '审核员与结论'))
})

test('attention：评审未通过/异常/进行中/待派发各有显式信号', () => {
  const bound = (review) => ({
    ...item({ review }),
    session: { id: 'session-dev' },
    workflow: { ...item().workflow, review },
  })
  assert.equal(deriveAttention(bound(normalizeReview({ reviewers: [reviewer('reviewer-1', 'failed')] }))).kind, 'review-failed')
  assert.equal(deriveAttention(bound(normalizeReview({ reviewers: [reviewer('reviewer-1', 'error')] }))).kind, 'review-error')
  assert.equal(deriveAttention(bound(normalizeReview({ reviewers: [reviewer('reviewer-1', 'pending')] }))).kind, 'review-pending')
  assert.equal(deriveAttention(bound(null)).kind, 'ready-review')
  assert.equal(
    deriveAttention(bound(normalizeReview({ reviewers: [reviewer('reviewer-1', 'passed')] }))).kind,
    'ready-env',
  )
})

test('流程详情：阶段条/概览/页签都能看到独立评审与纠偏意见', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { createElement: h } = await import('react')
  const { ItemEditor } = await import('../src/client/index.mjs')
  const { sanitizeItem } = await import('../src/core/store.mjs')
  const failedReview = normalizeReview({
    round: 2,
    reviewers: [
      reviewer('reviewer-1', 'failed', { summary: '方向偏了：只处理了 happy path', findings: [{ severity: 'major', summary: '少了回滚路径', file: 'src/a.mjs' }] }),
      reviewer('reviewer-2', 'passed'),
    ],
  })
  const flowItem = sanitizeItem({
    id: 'review-ui',
    title: '评审界面',
    goal: '流程界面能看见评审结论',
    acceptance: ['显示结论'],
    scope: ['src'],
    tasks: [{ text: '实现', done: true }],
    workflow: {
      rootProblem: '缺少独立复核',
      techDoc: { decision: 'none' },
      plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1 } },
      tests: { local: { status: 'passed' } },
      review: failedReview,
    },
  })
  const html = renderToStaticMarkup(h(ItemEditor, {
    item: flowItem,
    ctx: { get: () => undefined },
    session: null,
    onBack() {}, onSaved() {}, onContext() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
  assert.match(html, /独立评审/)
  assert.match(html, /评审未通过/)
  assert.match(html, /退回开发/)
  assert.match(html, /少了回滚路径/)
  assert.match(html, /派发评审|查看评审/)
  // 阶段条必须真的把「独立评审」插在开发与测试验证之间
  const reviewAt = html.indexOf('独立评审')
  assert.ok(reviewAt > 0)

  // 页签里的评审面板：结论、审核员、纠偏意见、只读报告入口都在源码里接线
  const index = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8'))
  assert.match(index, /\{ value: 'review', label: '独立评审' \}/)
  assert.match(index, /tab === 'review'[\s\S]{0,80}renderReview\(\)/)
  // 「继续推进」复用现有 dispatch（幂等、审核员数量沿用默认配置）
  assert.match(index, /API\.review, \{ id: draft\.id, action: 'dispatch', count \}/)
  assert.match(index, /退回开发的纠偏意见/)
  // 独立评审页不提供审核员数量选择/手工派发；但卡在 pending 时允许显式重置本轮
  assert.doesNotMatch(index, /'审核员数量'/)
  assert.doesNotMatch(index, /dispatchReview\(/)
  assert.match(index, /async function resetReview\(/)
  assert.match(index, /async function overrideReview\(/)
  assert.match(index, /评审调整：忽略拒绝/)
  assert.match(index, /children: '重新评审'/)
  assert.match(index, /查看开发报告/)

  // 「继续推进」在评审阶段自动开始评审：走共用判定 + 复用现有 dispatch，不弹确认框
  const continueStart = index.indexOf('async function continueDev()')
  const continueBody = index.slice(continueStart, index.indexOf('async function', continueStart + 10))
  assert.match(continueBody, /reviewAdvancePlan\(draft\)/)
  assert.match(continueBody, /startReview\(\)/)
  const reviewStart = index.indexOf('async function startReview()')
  const reviewBody = index.slice(reviewStart, index.indexOf('async function', reviewStart + 10))
  assert.doesNotMatch(reviewBody, /window\.confirm/)
  assert.match(reviewBody, /current\.status === 'pending'/)
  assert.match(reviewBody, /reviewFailureHint\(view\)/)
})

test('流程详情：评审 running 时顶栏「继续推进」禁用并显示「评审中」，失败时保持可点且内联原因', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { createElement: h } = await import('react')
  const { ItemEditor } = await import('../src/client/index.mjs')
  const { sanitizeItem } = await import('../src/core/store.mjs')
  const base = {
    id: 'review-advance-ui',
    title: '自动开始评审流程',
    goal: '点继续推进就自动开始评审',
    acceptance: ['自动开始评审', 'pending 不重复派发'],
    scope: ['src'],
    tasks: [{ text: '实现', done: true }],
    workflow: {
      rootProblem: '评审要手工派发',
      techDoc: { decision: 'none' },
      plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1 } },
      tests: { local: { status: 'passed' } },
      review: normalizeReview({ round: 1, reviewers: [reviewer('reviewer-1', 'pending'), reviewer('reviewer-2', 'pending')] }),
    },
  }
  const render = (item) => renderToStaticMarkup(h(ItemEditor, {
    item: sanitizeItem(item),
    ctx: { get: () => undefined },
    session: null,
    onBack() {}, onSaved() {}, onContext() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))

  // pending：顶栏按钮禁用，文案是「评审中」
  const pendingHtml = render(base)
  const disabledAt = pendingHtml.indexOf('disabled=""')
  assert.ok(disabledAt > 0, '评审中时顶栏按钮应禁用')
  const disabledButton = pendingHtml.slice(disabledAt, pendingHtml.indexOf('</button>', disabledAt))
  assert.match(disabledButton, /评审中/)
  assert.doesNotMatch(disabledButton, /继续推进/)

  // failed：顶栏改成「提交纠偏并返工」，不再让用户反复点评审；详细原因只放评审页
  const failedHtml = render({
    ...base,
    workflow: {
      ...base.workflow,
      review: normalizeReview({ round: 2, reviewers: [reviewer('reviewer-1', 'failed')] }),
    },
  })
  assert.match(failedHtml, /提交纠偏并返工/)
  assert.doesNotMatch(failedHtml, /上次评审未通过：/)

  // idle：顶栏是「开始独立评审」，不再引导到独立评审页手工派发
  const idleHtml = render({ ...base, workflow: { ...base.workflow, review: null } })
  assert.match(idleHtml, /开始独立评审/)
  assert.doesNotMatch(idleHtml, /待派发评审|到「独立评审」页派/)
})


test('评审可观测性：派发时落 sessionId，pending 轮询 /review，并有卡死重置入口', async () => {
  const fs = await import('node:fs/promises')
  const host = await fs.readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
  const run = await fs.readFile(new URL('../src/host/agent-run.mjs', import.meta.url), 'utf8')
  const index = await fs.readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(run, /onStarted/)
  assert.match(host, /onStarted: async \(\{ sessionId \}\) =>/)
  assert.match(host, /reconcileStaleReview/)
  assert.match(index, /API\.review\}\?id=/)
  assert.match(index, /setInterval\(load, 3000\)/)
  assert.match(index, /重置本轮/)
  assert.match(index, /API\.sessionLog\}\?itemId=.*sessionId=/)
  assert.match(index, /renderReviewerProgress/)
})
