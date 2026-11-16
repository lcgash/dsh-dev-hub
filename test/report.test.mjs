import assert from 'node:assert/strict'
import test from 'node:test'

import { buildReport, formatReportTime, REPORT_SCHEMA_VERSION } from '../src/core/report.mjs'

const AT = '2026-11-12T02:30:00.000Z'

function fixture(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'dev-report',
    title: '每个流程一份开发报告',
    status: 'done',
    goal: '流程开发完毕后，有一份可以直接点击查看的报告',
    description: '客户原话：每个流程结束都要有报告',
    requirement: {
      raw: '客户原话：每个流程结束都要有报告',
      goal: '流程开发完毕后有一份可点击查看的报告',
      rootProblem: '目前流程结束后只能翻台账，没有统一的结项视图',
      background: '跨人交接时不知道改了什么、测了什么',
      expected: '点一下就能看到目标、改动范围与测试结果',
      source: 'clarify',
      needsReview: false,
    },
    nonGoals: ['不做报告数据库'],
    acceptance: ['npm test 全绿', '报告三段齐全'],
    scope: ['src/core', 'src/client'],
    scopeModules: ['module:report'],
    tasks: [
      { text: '实现报告模型', done: true },
      { text: '接入工作站', done: true },
      { text: '补测试', done: false },
    ],
    workflow: {
      intent: 'feature',
      stage: 'done',
      stageReason: '已提交代码',
      rootProblem: '目前流程结束后只能翻台账',
      questions: [],
      plan: {
        summary: '先做只读报告，再接页签',
        steps: ['模型', '渲染', '路由', '前端'],
        estimate: { size: 'M', days: 2, confidence: 'high' },
      },
      techDoc: { decision: 'local', localPath: '.dev-hub/design/dev-report.md' },
      gitRepo: true,
      // 独立评审：报告必须能单独展示审核员结论与纠偏意见
      review: {
        status: 'passed',
        round: 1,
        dispatchedAt: AT,
        decidedAt: AT,
        basis: { files: 3, added: 335, removed: 3, head: 'abc1234', localTest: 'passed', at: AT },
        reviewers: [
          { id: 'reviewer-1', label: '审核员 1（方向）', role: 'direction', status: 'passed', verdict: 'pass', summary: '方向与验收一致', findings: [], sessionId: 'devhub-reviewer-1', source: 'agent' },
          { id: 'reviewer-2', label: '审核员 2（正确性）', role: 'correctness', status: 'passed', verdict: 'pass', summary: '边界与测试覆盖到位', findings: [], sessionId: 'devhub-reviewer-2', source: 'agent' },
        ],
      },
      tests: {
        local: {
          status: 'passed',
          command: 'npm test',
          output: '290 tests, 290 pass',
          at: AT,
          durationMs: 42000,
          by: '张三',
        },
        environment: {
          status: 'passed',
          command: 'npm run check',
          output: 'check ok',
          at: AT,
          durationMs: 9000,
          by: '张三',
        },
      },
      submission: {
        status: 'pushed',
        branch: 'main',
        commit: 'abc1234',
        pushed: true,
        at: AT,
        message: 'feat: dev report',
      },
    },
    checks: [
      { id: 'c1', text: '本机测试', command: 'npm test', status: 'passed', at: AT },
      { id: 'c2', text: '人工确认报告', assertion: '三段齐全', status: 'not_run', at: null },
    ],
    changePoints: [
      { type: 'api', summary: '新增 GET /api/dev-hub/report' },
      { type: 'ui', summary: '新增报告页签' },
    ],
    risks: ['测试输出可能很长'],
    history: [
      { at: AT, type: 'create', message: '创建流程' },
      { at: AT, type: 'submit', message: '提交 abc1234' },
    ],
    baseline: { startedAt: AT, commit: 'base123', branch: 'main' },
    references: [{ path: 'src/core/context.mjs', why: '同类只读视图' }],
    session: { id: 'session-1' },
    createdAt: AT,
    updatedAt: AT,
    provenance: { pluginVersion: '0.1.0' },
    ...overrides,
  }
}

function fileEvidence(overrides = {}) {
  return {
    evidenceComplete: true,
    reason: null,
    excludedCount: 2,
    files: [
      {
        path: 'src/core/report.mjs',
        displayPath: 'src/core/report.mjs',
        status: 'added',
        added: 320,
        removed: 0,
        binary: false,
        inScope: true,
        note: '报告模型',
      },
      {
        path: 'README.md',
        displayPath: 'README.md',
        status: 'modified',
        added: 12,
        removed: 3,
        binary: false,
        inScope: false,
        note: '',
      },
      {
        path: '.DS_Store',
        displayPath: '.DS_Store',
        status: 'added',
        added: 3,
        removed: 0,
        binary: false,
        inScope: true,
        note: '本地噪声',
      },
    ],
    totals: { files: 3, added: 335, removed: 3, binary: 0 },
    repos: [],
    ...overrides,
  }
}

test('buildReport：固定七个章节，独立评审单独成段', () => {
  const report = buildReport({ item: fixture(), files: fileEvidence(), git: { isRepo: true, branch: 'main', head: 'abc1234' }, generatedAt: AT })
  assert.equal(report.schemaVersion, REPORT_SCHEMA_VERSION)
  assert.equal(report.itemId, 'dev-report')
  assert.equal(report.statusLabel, '已完成')
  assert.equal(report.stageLabel, '已完成')
  assert.equal(report.intent, 'feature')
  assert.deepEqual(report.sections.map((section) => section.id), ['goal', 'scope', 'review', 'test', 'plan', 'timeline', 'evidence'])
  assert.deepEqual(report.sections.slice(0, 3).map((section) => section.title), ['目标背景', '改动范围', '独立评审'])
  // 评审结论进入报告摘要，报告结论与被否掉的改动关联
  assert.equal(report.summary.review.status, 'passed')
  assert.equal(report.summary.review.allowed, true)
  const reviewSection = report.sections[2]
  assert.equal(reviewSection.blocks.find((block) => block.type === 'fields').fields.find((field) => field.label === '结论').value, '通过（允许进入测试验证）')

  const goal = report.sections[0]
  const goalFields = goal.blocks.find((block) => block.type === 'fields').fields
  assert.equal(goalFields.find((field) => field.label === '目标').value, fixture().goal)
  assert.match(goalFields.find((field) => field.label === '根本问题').value, /翻台账/)
  assert.deepEqual(goal.blocks.find((block) => block.type === 'list' && block.title === '验收标准').items.map((entry) => entry.text), fixture().acceptance)

  const scope = report.sections[1]
  const scopeTable = scope.blocks.find((block) => block.type === 'table')
  assert.equal(scopeTable.rows.length, 1)
  assert.equal(scopeTable.rows[0].path, 'src/core/report.mjs')
  assert.equal(scopeTable.rows[0].change, '+320 / -0')
  assert.equal(scopeTable.rows[0].note, '报告模型')
  assert.match(scope.blocks.find((block) => block.type === 'text' && block.title === '报告口径').text, /1 个 scope 外改动/)
  assert.match(scope.blocks.find((block) => block.type === 'text' && block.title === '报告口径').text, /1 个 \.DS_Store/)
  assert.match(scope.blocks.find((block) => block.type === 'fields').fields.find((field) => field.label === '报告范围').value, /已排除 2 个/)
  assert.equal(scopeTable.columns.find((column) => column.key === 'change').align, 'right')
  // 状态列带 tone，渲染层据此画家族 Tag；tones 不是列
  assert.deepEqual(scopeTable.rows[0].tones, { status: 'ok' })
  assert.equal(scopeTable.columns.some((column) => column.key === 'tones'), false)

  const testSection = report.sections[3]
  const testFields = testSection.blocks.find((block) => block.type === 'fields').fields
  assert.ok(testFields.some((field) => field.label === '本机自测' && field.value.includes('通过') && field.value.includes('npm test')))
  assert.ok(testSection.blocks.some((block) => block.type === 'code' && block.text.includes('290 tests')))
  const checkRows = testSection.blocks.find((block) => block.type === 'table' && block.title === '验收项').rows
  assert.deepEqual(checkRows.map((row) => row.tones.status), ['ok', 'neutral'])

  assert.equal(report.summary.changedFiles, 1)
  assert.equal(report.summary.testsPassed, 2)
  assert.equal(report.summary.submission.commit, 'abc1234')
  assert.equal(report.verdict, 'passed')
  assert.equal(report.verdictLabel, '通过')
  assert.match(report.verdictReason, /abc1234/)
})

test('buildReport：没有 baseline / 测试 / 提交时是未完成，并显式标注证据不足', () => {
  const item = fixture({
    status: 'developing',
    workflow: { intent: 'feature', stage: 'develop', gitRepo: true, plan: {}, tests: {} },
    baseline: null,
    checks: [],
    history: [],
    tasks: [{ text: '写代码', done: false }],
  })
  const report = buildReport({ item, files: null, git: { isRepo: false, reason: '不是 git 仓库' }, generatedAt: AT })
  assert.equal(report.verdict, 'incomplete')
  assert.equal(report.verdictLabel, '未完成')
  assert.match(report.verdictReason, /还没有测试结果/)
  const scope = report.sections[1]
  const fields = scope.blocks.find((block) => block.type === 'fields').fields
  assert.equal(fields.find((field) => field.label === 'baseline').tone, 'warn')
  assert.equal(fields.find((field) => field.label === '证据完整性').value, '还没有统计变更文件')
  const reviewSection = report.sections[2]
  assert.ok(reviewSection.blocks.some((block) => block.type === 'text' && block.title === '还没有独立评审'))
  const testSection = report.sections[3]
  assert.ok(testSection.blocks.some((block) => block.type === 'text' && block.title === '还没开始测试'))
  assert.ok(testSection.blocks.some((block) => block.type === 'fields'))
  assert.equal(report.summary.testsPassed, 0)
  assert.equal(report.summary.baseline, null)
})

test('buildReport：失败测试 / 推送失败 / 验收失败都算未通过，原因逐条列出', () => {
  const item = fixture({
    checks: [{ id: 'c1', text: '人工确认', status: 'failed', at: AT }],
    workflow: {
      ...fixture().workflow,
      tests: {
        local: { ...fixture().workflow.tests.local, status: 'failed', output: 'boom' },
        environment: { ...fixture().workflow.tests.environment, status: 'not_run' },
      },
      submission: { ...fixture().workflow.submission, pushed: false, status: 'committed' },
    },
  })
  const report = buildReport({ item, files: fileEvidence({ evidenceComplete: false, reason: 'worktree 不完整' }), git: { isRepo: true, branch: 'main', head: 'abc1234' } })
  assert.equal(report.verdict, 'failed')
  assert.match(report.verdictReason, /本机自测未通过/)
  assert.match(report.verdictReason, /推送失败/)
  assert.match(report.verdictReason, /验收项未通过/)
  assert.match(report.sections[1].blocks.find((block) => block.type === 'fields').fields.find((field) => field.label === '证据完整性').value, /不完整/)
})

test('buildReport：blocked 优先于测试事实', () => {
  const report = buildReport({ item: fixture({ status: 'blocked' }) })
  assert.equal(report.verdict, 'blocked')
  assert.equal(report.verdictLabel, '阻塞')
})

test('buildReport：非 git 仓库、测试通过即完成，不要求提交记录', () => {
  const item = fixture({
    status: 'done',
    workflow: {
      ...fixture().workflow,
      gitRepo: false,
      submission: null,
      tests: {
        local: { status: 'passed', command: 'npm test', output: 'ok', at: AT, durationMs: 1000 },
        environment: { status: 'passed', command: 'make check', output: 'ok', at: AT, durationMs: 1000 },
      },
    },
  })
  const report = buildReport({ item, files: { ok: true, evidenceComplete: false, reason: '不是 git 仓库：无法统计 git 变更', files: [], totals: { files: 0, added: 0, removed: 0, binary: 0 }, excludedCount: 0 }, git: { isRepo: false, reason: '不是 git 仓库' } })
  assert.equal(report.verdict, 'passed')
  assert.match(report.verdictReason, /非 git 仓库/)
  assert.equal(report.sections[1].blocks.find((block) => block.type === 'fields').fields.find((field) => field.label === '证据完整性').tone, 'warn')
  assert.match(report.sections[6].blocks.find((block) => block.type === 'fields').fields.find((field) => field.label === 'git 证据').value, /不是 git 仓库/)
})

test('buildReport：虚拟库展示成员库与逐库测试/提交结果', () => {
  const item = fixture({
    workflow: {
      ...fixture().workflow,
      tests: {
        local: {
          status: 'failed',
          command: 'web: npm test ; api: mvn test',
          output: '[web] failed\nboom',
          at: AT,
          durationMs: 30000,
          repos: [
            { name: 'web', path: '/repo/web', command: 'npm test', status: 'passed', durationMs: 12000 },
            { name: 'api', path: '/repo/api', command: 'mvn test', status: 'failed', durationMs: 18000, error: 'api boom' },
          ],
        },
        environment: { status: 'not_run', command: '', output: '', at: null, durationMs: 0 },
      },
      submission: {
        status: 'committed',
        branch: 'main',
        commit: 'abc',
        pushed: false,
        at: AT,
        message: 'feat',
        repos: [
          { name: 'web', branch: 'main', commit: 'w1', pushed: true },
          { name: 'api', branch: 'main', commit: 'a1', pushed: false, error: 'push rejected' },
        ],
      },
    },
  })
  const files = fileEvidence({
    files: [
      { path: 'src/a.ts', displayPath: 'web/src/a.ts', repoName: 'web', status: 'modified', added: 5, removed: 1, inScope: true, note: '前端' },
      { path: 'src/A.java', displayPath: 'api/src/A.java', repoName: 'api', status: 'modified', added: 2, removed: 0, inScope: true, note: '' },
    ],
    totals: { files: 2, added: 7, removed: 1, binary: 0 },
    repos: [
      { name: 'web', branch: 'main', head: 'w1', baseCommit: 'wb', evidenceComplete: true, changedFiles: 1 },
      { name: 'api', branch: 'main', head: 'a1', baseCommit: 'ab', evidenceComplete: false, reason: '不是 git 仓库', changedFiles: 1 },
    ],
  })
  const report = buildReport({
    item,
    files,
    git: { isRepo: true, available: true, branch: null, head: null },
    workspace: { id: 'ws-1', name: '前后端联动', members: [{ name: 'web', path: '/repo/web', primary: true }, { name: 'api', path: '/repo/api', primary: false }] },
  })
  const scope = report.sections[1]
  assert.ok(scope.blocks.some((block) => block.type === 'table' && block.title === '成员库证据'))
  assert.ok(scope.blocks.some((block) => block.type === 'table' && block.title === '逐库提交结果'))
  assert.ok(scope.blocks.some((block) => block.type === 'fields' && block.title === '虚拟库'))
  const testSection = report.sections[3]
  const rows = testSection.blocks.find((block) => block.type === 'table' && block.title === '成员库测试结果').rows
  assert.equal(rows.length, 2)
  assert.equal(rows.find((row) => row.repo === 'api').status, '失败')
  assert.match(rows.find((row) => row.repo === 'api').note, /api boom/)
  assert.deepEqual(rows.find((row) => row.repo === 'web').tones, { status: 'ok' })
  assert.deepEqual(rows.find((row) => row.repo === 'api').tones, { status: 'danger' })
  const pushRows = scope.blocks.find((block) => block.type === 'table' && block.title === '逐库提交结果').rows
  assert.deepEqual(pushRows.map((row) => row.tones.pushed), ['ok', 'danger'])
  assert.equal(report.summary.workspace.name, '前后端联动')
  assert.equal(report.verdict, 'failed')
})

test('buildReport：空台账也能生成报告，不抛错', () => {
  const report = buildReport({ item: { id: 'empty', title: '空流程' } })
  assert.equal(report.verdict, 'incomplete')
  assert.equal(report.sections.length, 7)
  assert.equal(report.sections[0].blocks.find((block) => block.type === 'fields').fields.find((field) => field.label === '目标').value, '未填写')
  assert.deepEqual(report.sections[0].blocks.find((block) => block.type === 'list' && block.title === '非目标').items, [])
  assert.throws(() => buildReport({}), /需要开发项台账/)
})

test('buildReport：分析流程展示结论而非代码改动，不渲染改动范围', () => {
  const baseItem = fixture()
  const item = fixture({
    workflow: {
      ...baseItem.workflow,
      intent: 'analysis',
      stage: 'done',
      stageReason: '分析流程：只读结论已产出，不进入提交',
      submission: null,
      tests: { local: { status: 'passed', command: 'npm test', at: AT }, environment: { status: 'not_run' } },
      review: { status: 'idle', reviewers: [] },
    },
    changePoints: [
      { type: 'manual', summary: '结论：失败发生在 upload.mjs 的提前 return 分支' },
      { type: 'manual', summary: '补丁建议：在 return 前补空值判断（不落地）' },
    ],
  })
  const report = buildReport({
    item,
    files: fileEvidence(),
    git: { isRepo: true, available: true, branch: 'main', head: 'abc1234' },
  })
  assert.equal(report.intent, 'analysis')
  assert.equal(report.verdict, 'passed')
  assert.match(report.verdictReason, /不进入提交/)
  assert.deepEqual(report.sections.map((section) => section.id), ['goal', 'conclusion', 'review', 'test', 'plan', 'timeline', 'evidence'])
  const conclusion = report.sections[1]
  assert.equal(conclusion.title, '分析结论')
  assert.ok(conclusion.blocks.some((block) => block.type === 'fields' && block.fields.some((field) => field.label === '代码改动' && /无/.test(field.value))))
  const list = conclusion.blocks.find((block) => block.type === 'list' && block.title === '结论与补丁建议')
  assert.equal(list.items.length, 2)
  assert.match(list.items[0].text, /upload\.mjs/)
  assert.ok(!conclusion.blocks.some((block) => block.type === 'table'))
})

test('formatReportTime：ISO 转本地时间，空值给破折号，坏值原样展示', () => {
  assert.match(formatReportTime(AT), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  assert.equal(formatReportTime(null), '—')
  assert.equal(formatReportTime('not-a-date'), 'not-a-date')
})
