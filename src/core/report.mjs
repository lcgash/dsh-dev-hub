/**
 * 开发报告：把一个流程的台账 + 本机 git 事实压成一份只读、可点击查看的报告。
 *
 * 设计原则：
 * - **纯函数**：不读盘、不调模型、不发网络；Host 负责把 item / files / git / workspace 传进来；
 * - **固定三段主结构**：目标背景 → 改动范围 → 测试报告，再补计划、过程与证据边界；
 * - **不伪造**：没有 baseline、不是 git 仓库、没跑测试，都写进报告并标注「证据不完整」；
 * - **渲染层无关**：这里只产出纯文本/纯数据，Markdown 与 HTML 由 report-render.mjs 负责。
 */

import { STATUS_LABELS } from '../shared/api.mjs'
import { REVIEW_ROLE_BY_ID, REVIEW_STATUS_LABELS, STAGE_LABELS } from '../shared/workflow.mjs'
import { describeReview } from './review.mjs'
import { normalizeIntent } from './intent.mjs'

export const REPORT_SCHEMA_VERSION = 1

const TEST_STATUS_LABEL = {
  not_run: '未运行',
  running: '运行中',
  passed: '通过',
  failed: '失败',
  skipped: '已跳过',
}

const STATUS_TONE = {
  not_run: 'neutral',
  running: 'info',
  passed: 'ok',
  failed: 'danger',
  skipped: 'warn',
}

const FILE_STATUS_LABEL = {
  added: '新增',
  modified: '修改',
  deleted: '删除',
  renamed: '重命名',
}

const FILE_STATUS_TONE = {
  added: 'ok',
  modified: 'info',
  deleted: 'danger',
  renamed: 'warn',
}

const TEST_STATUS_TONE = {
  passed: 'ok',
  failed: 'danger',
  running: 'info',
  not_run: 'neutral',
  skipped: 'warn',
}

/** 这些不是“本流程改的代码”：OS 元数据、IDE/构建缓存，报告一律不计入。 */
const NOISE_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized'])
const NOISE_DIRS = [/(^|\/)\.idea\//, /(^|\/)\.vscode\//, /(^|\/)node_modules\//, /(^|\/)target\//, /(^|\/)dist\//, /(^|\/)build\//, /(^|\/)__pycache__\//]

function reportPathOf(file) {
  return String(file?.displayPath ?? file?.path ?? '').replace(/\\/g, '/')
}

function isNoiseFile(file) {
  const path = reportPathOf(file)
  if (!path) return true
  const name = path.split('/').filter(Boolean).pop() ?? ''
  if (NOISE_NAMES.has(name)) return true
  return NOISE_DIRS.some((pattern) => pattern.test(path))
}

/**
 * 报告只统计“本流程的工作站改动”：
 * - scope 外的文件是别的流程/手工改动，报告不背这个锅；
 * - .DS_Store / IDE / 构建缓存是本地噪声，不进入报告；
 * 完整列表仍在流程详情「变更文件」里，可在那里逐文件纳入 scope。
 */
function reportFileSet(files) {
  const all = Array.isArray(files?.files) ? files.files : []
  const noise = all.filter(isNoiseFile)
  const rest = all.filter((file) => !isNoiseFile(file))
  const outOfScope = rest.filter((file) => file.inScope === false)
  const kept = rest.filter((file) => file.inScope !== false)
  const totals = kept.reduce((acc, file) => ({
    files: acc.files + 1,
    added: acc.added + (file.binary ? 0 : numberOrZero(file.added)),
    removed: acc.removed + (file.binary ? 0 : numberOrZero(file.removed)),
    binary: acc.binary + (file.binary ? 1 : 0),
  }), { files: 0, added: 0, removed: 0, binary: 0 })
  return {
    files: kept,
    totals,
    excludedNoise: noise.length,
    excludedOutOfScope: outOfScope.length,
    allCount: all.length,
  }
}

const HISTORY_TYPE_LABEL = {
  create: '创建',
  start: '开工',
  plan: '计划',
  techdoc: '技术文档',
  develop: '开发',
  test: '测试',
  review: '评审',
  submit: '提交',
  update: '更新',
  repro: '计划校验',
  check: '验收',
  note: '文件说明',
  assist: '对话补充',
  'assist-reply': '对话回复',
}

const REQUIREMENT_SOURCE_LABEL = {
  manual: '人工填写',
  clarify: '澄清对话',
  wizard: '工作站规范化',
  local: '本地草稿',
}

const TECH_DOC_LABEL = {
  existing: '已有文档',
  create: '开发中创建',
  none: '暂不需要',
}

const TECH_DOC_PROVIDER_LABEL = {
  feishu: '飞书文档',
  local: '本地 Markdown',
  link: '外部链接',
  none: '暂不需要',
}

function textOf(value) {
  return String(value ?? '').trim()
}

function listOf(values, max = 200) {
  return (Array.isArray(values) ? values : [])
    .map((value) => textOf(value))
    .filter(Boolean)
    .slice(0, max)
}

function numberOrZero(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/** 本地时间（YYYY-MM-DD HH:mm），空值给「—」。报告是给人看的，不展示时区标记。 */
export function formatReportTime(value) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return textOf(value) || '—'
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDuration(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value < 1000) return `${Math.round(value)}ms`
  if (value < 60000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.floor(value / 60000)}m${Math.round((value % 60000) / 1000)}s`
}

function tail(text, max = 6000) {
  const value = textOf(text)
  if (!value) return ''
  return value.length > max ? `…（只保留最后 ${max} 字符）\n${value.slice(-max)}` : value
}

function scopeTokens(item) {
  return [...new Set([...(item.scope ?? []), ...(item.scopeModules ?? [])].map(textOf).filter(Boolean))]
}

function testStatus(test) {
  const status = test?.status
  return TEST_STATUS_LABEL[status] ?? (status ? String(status) : '未运行')
}

function testTone(test) {
  return STATUS_TONE[test?.status] ?? 'neutral'
}

function testField(label, test) {
  if (!test || !test.status) {
    return { label, value: '未运行', tone: 'neutral' }
  }
  const bits = [testStatus(test)]
  if (test.status === 'skipped') {
    if (test.skipReason) bits.push(`原因：${test.skipReason}`)
    if (test.skippedBy) bits.push(`跳过人 ${test.skippedBy}`)
  } else {
    if (test.command) bits.push(test.command)
    const duration = formatDuration(test.durationMs)
    if (duration !== '—') bits.push(duration)
    if (test.by) bits.push(`执行人 ${test.by}`)
  }
  return { label, value: bits.join(' · '), tone: testTone(test) }
}

function baselineOf(item) {
  const baseline = item.baseline ?? null
  if (!baseline) return null
  return {
    commit: baseline.commit ? String(baseline.commit) : null,
    branch: baseline.branch ? String(baseline.branch) : null,
    startedAt: baseline.startedAt ?? null,
  }
}

function submissionOf(item) {
  const submission = item.workflow?.submission ?? null
  if (!submission) return null
  return {
    branch: submission.branch ?? null,
    commit: submission.commit ?? null,
    pushed: submission.pushed !== false && Boolean(submission.commit),
    at: submission.at ?? null,
    message: submission.message ?? '',
  }
}

function estimateOf(item) {
  const plan = item.workflow?.plan ?? {}
  return plan.estimate ?? item.estimate ?? {}
}

function goalSection(item) {
  const requirement = item.requirement ?? null
  const rootProblem = textOf(requirement?.rootProblem) || textOf(item.workflow?.rootProblem)
  const raw = textOf(requirement?.raw) || textOf(item.description)
  const fields = [
    { label: '目标', value: textOf(item.goal) || '未填写' },
    { label: '根本问题', value: rootProblem || '未填写' },
    { label: '背景', value: textOf(requirement?.background) || '未填写' },
    { label: '期望结果', value: textOf(requirement?.expected) || '未填写' },
    { label: '原始需求（仅追溯）', value: raw || '未填写' },
    { label: '需求来源', value: REQUIREMENT_SOURCE_LABEL[requirement?.source] ?? (requirement?.source ? String(requirement.source) : '—') },
    { label: '创建时间', value: formatReportTime(item.createdAt) },
    { label: '最近更新', value: formatReportTime(item.updatedAt) },
  ]
  const blocks = [
    { type: 'fields', fields },
    { type: 'list', title: '非目标', items: listOf(item.nonGoals).map((text) => ({ text })) },
    { type: 'list', title: '验收标准', items: listOf(item.acceptance).map((text) => ({ text })) },
  ]
  if (requirement?.needsReview) {
    blocks.unshift({
      type: 'text',
      title: '需求状态',
      text: `需求还没有规范化${requirement.reason ? `：${requirement.reason}` : '：当前目标可能还是客户原话'}。报告按台账原样展示，建议先在详情页「让工作站规范化」。`,
    })
  }
  return {
    id: 'goal',
    title: '目标背景',
    summary: textOf(item.goal) || '还没有写目标',
    blocks,
  }
}

function scopeSection(item, files, workspace, reportSet = reportFileSet(files)) {
  const totals = reportSet.totals ?? {}
  const fileRows = reportSet.files.slice(0, 300).map((file) => ({
    path: file.displayPath || file.path,
    status: FILE_STATUS_LABEL[file.status] ?? (file.status || '—'),
    change: file.binary ? '二进制' : `+${numberOrZero(file.added)} / -${numberOrZero(file.removed)}`,
    scope: scopeTokens(item).length ? '是' : '未限定',
    note: textOf(file.note) || '—',
    repo: file.repoName ?? '',
    tones: { status: FILE_STATUS_TONE[file.status] ?? 'neutral' },
  }))
  const baseline = baselineOf(item)
  const submission = submissionOf(item)
  const fields = [
    { label: '计划范围', value: scopeTokens(item).join('、') || '未限定 scope' },
    {
      label: 'baseline',
      value: baseline
        ? [baseline.commit ? String(baseline.commit).slice(0, 12) : '无 commit', baseline.branch, formatReportTime(baseline.startedAt)].filter(Boolean).join(' · ')
        : '未记录（没有基线，diff 证据不完整）',
      tone: baseline ? 'neutral' : 'warn',
    },
    {
      label: '提交结果',
      value: submission
        ? `${submission.pushed ? '已提交并推送' : '提交未推送'} · ${submission.commit ?? '—'}${submission.branch ? ` @ ${submission.branch}` : ''} · ${formatReportTime(submission.at)}`
        : '还没有提交记录',
      tone: submission ? (submission.pushed ? 'ok' : 'danger') : 'neutral',
    },
    {
      label: '变更统计',
      value: `${numberOrZero(totals.files)} 个文件 · +${numberOrZero(totals.added)} / -${numberOrZero(totals.removed)}${numberOrZero(totals.binary) ? ` · ${totals.binary} 个二进制` : ''}`,
    },
    {
      label: '报告范围',
      value: (reportSet.excludedNoise + reportSet.excludedOutOfScope)
        ? `仅 scope 内 ${reportSet.totals.files} 个；已排除 ${reportSet.excludedOutOfScope + reportSet.excludedNoise} 个（scope 外/本地噪声）`
        : 'scope 内全部改动',
    },
    {
      label: '证据完整性',
      value: files?.evidenceComplete === false
        ? `不完整${files.reason ? `：${files.reason}` : ''}`
        : (files ? '完整' : '还没有统计变更文件'),
      tone: files?.evidenceComplete === false ? 'warn' : (files ? 'ok' : 'neutral'),
    },
    {
      label: '排除的台账文件',
      value: numberOrZero(files?.excludedCount) ? `${files.excludedCount} 个 .dev-hub/ 下的文件不计入` : '无',
    },
  ]
  const blocks = [
    { type: 'fields', fields },
    {
      type: 'table',
      title: workspace ? '变更文件（跨成员库）' : '变更文件',
      columns: [
        { key: 'path', label: '文件' },
        { key: 'status', label: '状态' },
        { key: 'change', label: '增删', align: 'right' },
        { key: 'scope', label: '范围' },
        { key: 'note', label: '修改意义' },
      ],
      rows: fileRows,
    },
  ]
  if (reportSet.files.length > 300) {
    blocks.push({
      type: 'text',
      text: `变更文件较多，报告只展开前 300 个（共 ${reportSet.files.length} 个）；完整列表见「概览 → 变更文件」。`,
    })
  }
  const excludedTotal = reportSet.excludedNoise + reportSet.excludedOutOfScope
  blocks.push({
    type: 'text',
    title: '报告口径',
    text: excludedTotal
      ? `只统计 scope 内、非本地噪声的文件；已排除 ${reportSet.excludedOutOfScope} 个 scope 外改动、${reportSet.excludedNoise} 个 .DS_Store/IDE/构建缓存等本地噪声。完整变更见流程详情「变更文件」（可逐文件「纳入 scope」）。`
      : '只统计 scope 内、非本地噪声的文件；不含 .dev-hub 台账。完整变更见流程详情「变更文件」。',
  })
  if (workspace) {
    blocks.push({
      type: 'fields',
      title: '多库项目',
      fields: [
        { label: '多库项目', value: textOf(workspace.name) || textOf(workspace.id) || '—' },
        { label: '成员库', value: (workspace.members ?? []).map((member) => member.name || member.path).join('、') || '—' },
      ],
    })
    blocks.push({
      type: 'table',
      title: '成员库证据',
      columns: [
        { key: 'name', label: '成员库' },
        { key: 'branch', label: '分支' },
        { key: 'head', label: 'HEAD' },
        { key: 'base', label: '基线' },
        { key: 'changed', label: '变更文件', align: 'right' },
        { key: 'evidence', label: '证据' },
      ],
      rows: (files?.repos ?? workspace.members ?? []).map((repo) => ({
        name: repo.name || repo.path || '—',
        branch: repo.branch || '—',
        head: repo.head || '—',
        base: repo.baseCommit ? String(repo.baseCommit).slice(0, 10) : '—',
        changed: numberOrZero(repo.changedFiles),
        evidence: repo.evidenceComplete === false ? (repo.reason || '不完整') : (repo.isRepo === false ? '不是 git 仓库' : '完整'),
        tones: {
          evidence: repo.evidenceComplete === false ? 'warn' : (repo.isRepo === false ? 'neutral' : 'ok'),
        },
      })),
    })
  }
  if (submission && Array.isArray(item.workflow?.submission?.repos) && item.workflow.submission.repos.length) {
    blocks.push({
      type: 'table',
      title: '逐库提交结果',
      columns: [
        { key: 'name', label: '成员库' },
        { key: 'branch', label: '分支' },
        { key: 'commit', label: 'commit' },
        { key: 'pushed', label: '推送' },
        { key: 'error', label: '错误' },
      ],
      rows: item.workflow.submission.repos.map((repo) => ({
        name: repo.name || repo.path || '—',
        branch: repo.branch || '—',
        commit: repo.commit || '—',
        pushed: repo.pushed ? '已推送' : (repo.commit ? '未推送' : '未提交'),
        error: textOf(repo.error) || '—',
        tones: { pushed: repo.pushed ? 'ok' : (repo.commit ? 'danger' : 'neutral') },
      })),
    })
  }
  blocks.push({
    type: 'list',
    title: '变更点',
    items: (item.changePoints ?? []).map((point) => {
      const summary = textOf(point?.summary)
      return summary ? { text: summary } : null
    }).filter(Boolean),
  })
  if (baseline === null) {
    blocks.push({
      type: 'text',
      title: '证据说明',
      text: '这个流程没有记录 baseline：报告只能展示工作区相对 HEAD 的改动，无法证明「本流程开始之后」改了哪些文件。',
    })
  }
  return {
    id: 'scope',
    title: '改动范围',
    summary: `${numberOrZero(totals.files)} 个文件 · +${numberOrZero(totals.added)} / -${numberOrZero(totals.removed)}`,
    blocks,
  }
}

/**
 * 分析流程的产出是结论，不是代码改动：报告用「分析结论」段替换「改动范围」，
 * 不展示 diff 表格，避免把只读排查误读成一次代码提交。
 */
function analysisSection(item, files, reportSet) {
  const plan = item.workflow?.plan ?? {}
  const conclusions = (item.changePoints ?? [])
    .map((point) => textOf(point?.summary))
    .filter(Boolean)
  const blocks = [
    {
      type: 'fields',
      fields: [
        { label: '分析对象', value: textOf(item.goal) || textOf(item.description) || '未填写' },
        { label: '排查方式', value: '只读排查（不改代码、不建独立工作区、不产生提交）', tone: 'ok' },
        { label: '代码改动', value: '无（补丁建议只记录、不落地）', tone: 'ok' },
        {
          label: '证据完整性',
          value: files?.evidenceComplete === false
            ? `不完整${files.reason ? `：${files.reason}` : ''}`
            : (files ? '完整' : '还没有统计排查证据'),
          tone: files?.evidenceComplete === false ? 'warn' : (files ? 'ok' : 'neutral'),
        },
        {
          label: '排除的台账文件',
          value: numberOrZero(files?.excludedCount) ? `${files.excludedCount} 个 .dev-hub/ 下的文件不计入` : '无',
        },
      ],
    },
    { type: 'list', title: '排查路径', items: listOf(plan.steps).map((text) => ({ text })) },
    {
      type: 'list',
      title: '结论与补丁建议',
      items: conclusions.length
        ? conclusions.map((text) => ({ text, tone: 'ok' }))
        : [{ text: '还没有记录结论：在流程里补充结论、证据与影响面后，报告会更新。', tone: 'warn' }],
    },
    { type: 'list', title: '风险与未决', items: listOf(item.risks, 50).map((text) => ({ text, tone: 'warn' })) },
    {
      type: 'text',
      title: '报告口径',
      text: '分析流程只产出结论与证据，不统计代码改动；补丁建议仅供参考，不在本流程落地，也不会产生提交。',
    },
  ]
  if (files?.evidenceComplete === false) {
    blocks.push({
      type: 'text',
      title: '证据说明',
      text: `本机证据不完整${files.reason ? `：${files.reason}` : ''}。报告按台账原样展示，不补造事实。`,
    })
  }
  return {
    id: 'conclusion',
    title: '分析结论',
    summary: conclusions.length ? `${conclusions.length} 条结论 · 只读排查` : '只读排查 · 还没有记录结论',
    blocks,
  }
}

/**
 * 独立评审：报告里单独一段（与测试报告并列），因为两者回答的是不同问题——
 * 测试回答「跑不跑得通」，评审回答「方向对不对、值不值得放行」。
 */
function reviewSection(item) {
  const review = describeReview(item)
  const statusLabel = !review.required && review.status === 'idle'
    ? '免评审'
    : (REVIEW_STATUS_LABELS[review.status] ?? review.status)
  const conclusion = review.verdict === 'pass'
    ? '通过（允许进入测试验证）'
    : review.verdict === 'fail'
      ? '未通过（退回开发纠偏）'
      : review.status === 'error'
        ? '待处理：有审核员异常或未返回结论，不能视为通过'
        : review.status === 'pending'
          ? '评审进行中'
          : review.required === false
            ? `免评审（${review.policy?.reason ?? '小改动自动跳过'}）`
            : '未评审'
  const basis = review.basis
  const fields = [
    { label: '结论', value: conclusion, tone: review.verdict === 'pass' ? 'ok' : review.verdict === 'fail' ? 'danger' : review.status === 'error' ? 'warn' : 'neutral' },
    { label: '轮次', value: review.round ? `第 ${review.round} 轮` : '—' },
    {
      label: '评审策略',
      value: review.required === false ? `免独立评审 · ${review.policy?.reason ?? '按规模自动判定'}` : '需要独立评审',
      tone: review.required === false ? 'warn' : 'neutral',
    },
    {
      label: '审核员',
      value: review.total
        ? `${review.total} 位 · ${review.passed} 通过 / ${review.failed} 不通过 / ${review.errored} 异常 / ${review.pending} 待返回`
        : '还没有开始评审',
      tone: review.total && review.passed === review.total ? 'ok' : review.failed ? 'danger' : review.total ? 'info' : 'neutral',
    },
    { label: '开始时间', value: formatReportTime(review.dispatchedAt) },
    { label: '结论时间', value: formatReportTime(review.decidedAt) },
    {
      label: '评审依据',
      value: basis
        ? `${basis.files} 个文件 +${basis.added}/-${basis.removed} · 本机自测${TEST_STATUS_LABEL[basis.localTest] ?? basis.localTest}${basis.head ? ` · ${String(basis.head).slice(0, 12)}` : ''}`
        : '—',
    },
  ]
  const blocks = [{ type: 'fields', fields }]
  if (review.total) {
    blocks.push({
      type: 'table',
      title: '审核员与结论',
      columns: [
        { key: 'reviewer', label: '审核员' },
        { key: 'role', label: '视角' },
        { key: 'status', label: '结论' },
        { key: 'summary', label: '结论摘要' },
        { key: 'session', label: '审核会话' },
      ],
      rows: review.reviewers.map((reviewer) => ({
        reviewer: reviewer.label,
        role: REVIEW_ROLE_BY_ID[reviewer.role]?.label ?? reviewer.role,
        status: reviewer.status === 'error' ? '异常/未返回' : reviewer.verdict === 'pass' ? '通过' : reviewer.verdict === 'fail' ? '未通过' : '待返回',
        summary: reviewer.summary || reviewer.error || '—',
        session: reviewer.sessionId || (reviewer.source === 'manual' ? '人工记录' : '—'),
        tones: { status: reviewer.status === 'passed' ? 'ok' : reviewer.status === 'failed' ? 'danger' : reviewer.status === 'error' ? 'warn' : 'neutral' },
      })),
    })
    const findings = review.reviewers.flatMap((reviewer) => reviewer.findings.map((finding) => ({
      text: `${finding.summary}${finding.file ? `（${finding.file}）` : ''}${finding.detail ? `：${finding.detail}` : ''}`,
      meta: `${reviewer.label} · ${finding.severity}`,
    })))
    if (findings.length) blocks.push({ type: 'list', title: '问题清单', items: findings })
    if (review.corrections.length) {
      blocks.push({
        type: 'list',
        title: '退回开发的纠偏意见',
        items: review.corrections.flatMap((correction) => correction.findings.map((finding) => ({
          text: finding,
          meta: correction.reviewerLabel,
        }))),
      })
    }
    if (review.history.length) {
      blocks.push({
        type: 'table',
        title: '历史轮次',
        columns: [
          { key: 'round', label: '轮次' },
          { key: 'status', label: '结论' },
          { key: 'decided', label: '时间' },
          { key: 'reviewers', label: '审核员结论' },
        ],
        rows: review.history.map((round) => ({
          round: `第 ${round.round} 轮`,
          status: REVIEW_STATUS_LABELS[round.status] ?? round.status,
          decided: formatReportTime(round.decidedAt),
          reviewers: (round.reviewers ?? []).map((reviewer) => `${reviewer.label}：${reviewer.verdict === 'pass' ? '通过' : reviewer.verdict === 'fail' ? '不通过' : '未返回'}`).join('；') || '—',
        })),
      })
    }
  }
  if (review.status === 'idle') {
    blocks.push({
      type: 'text',
      title: '还没有独立评审',
      text: '开发阶段完成后点顶栏「继续推进」即自动开始独立评审（审核员按默认配置产生，不需要手工派发）：他们读同一份目标/验收/scope/改动/测试/报告，各自给结论。全部通过才允许进入测试验证；不通过会退回开发并附纠偏意见；审核员异常/未返回时标记为待处理，再点「继续推进」可重试。',
    })
  } else if (review.status === 'error') {
    blocks.push({
      type: 'text',
      title: '待处理（不是通过）',
      text: '有审核员会话异常或没有返回结论。流程不会因此进入测试验证；点顶栏「继续推进」可重试派发，或补齐证据后重新评审。',
    })
  }
  return {
    id: 'review',
    title: '独立评审',
    summary: review.total ? `${statusLabel} · ${review.passed}/${review.total} 通过` : statusLabel,
    blocks,
  }
}

function testSection(item, files) {
  const tests = item.workflow?.tests ?? {}
  const checks = item.checks ?? []
  const passedChecks = checks.filter((check) => check.status === 'passed').length
  const testRows = []
  for (const [phase, label] of [['local', '本机自测'], ['environment', '环境测试']]) {
    const rows = Array.isArray(tests[phase]?.repos) ? tests[phase].repos : []
    for (const row of rows) {
      testRows.push({
        repo: row.name || row.path || '—',
        phase: label,
        status: row.skipped ? '跳过' : (TEST_STATUS_LABEL[row.status] ?? (row.status || '—')),
        command: row.command || '—',
        duration: formatDuration(row.durationMs),
        note: textOf(row.error) || textOf(row.output).slice(-120) || '—',
        tones: { status: row.skipped ? 'neutral' : (TEST_STATUS_TONE[row.status] ?? 'neutral') },
      })
    }
  }
  const blocks = [
    {
      type: 'fields',
      fields: [
        testField('本机自测', tests.local),
        testField('环境测试', tests.environment),
        {
          label: '验收项',
          value: checks.length ? `${passedChecks}/${checks.length} 通过` : '没有配置验收项',
          tone: checks.length ? (passedChecks === checks.length ? 'ok' : 'warn') : 'neutral',
        },
        { label: '测试时间', value: formatReportTime(tests.local?.at || tests.environment?.at) },
      ],
    },
  ]
  if (!tests.local?.status && !tests.environment?.status) {
    blocks.push({
      type: 'text',
      title: '还没开始测试',
      text: '台账里还没有测试结果：在流程详情「测试与提交」跑完本机自测/环境测试后，报告会自动更新。',
    })
  }
  if (testRows.length) {
    blocks.push({
      type: 'table',
      title: '成员库测试结果',
      columns: [
        { key: 'repo', label: '成员库' },
        { key: 'phase', label: '阶段' },
        { key: 'status', label: '状态' },
        { key: 'command', label: '命令' },
        { key: 'duration', label: '耗时', align: 'right' },
        { key: 'note', label: '说明' },
      ],
      rows: testRows,
    })
  }
  if (checks.length) {
    blocks.push({
      type: 'table',
      title: '验收项',
      columns: [
        { key: 'text', label: '验收项' },
        { key: 'status', label: '状态' },
        { key: 'how', label: '命令 / 断言' },
        { key: 'at', label: '时间' },
      ],
      rows: checks.map((check) => ({
        text: check.text,
        status: TEST_STATUS_LABEL[check.status] ?? (check.status || '未运行'),
        how: check.command || check.assertion || '人工确认',
        at: formatReportTime(check.at),
        tones: { status: TEST_STATUS_TONE[check.status] ?? 'neutral' },
      })),
    })
  }
  for (const [phase, label] of [['local', '本机自测'], ['environment', '环境测试']]) {
    const test = tests[phase]
    const output = tail(test?.output)
    if (!output) continue
    blocks.push({
      type: 'code',
      title: `${label}输出（尾部）${test.command ? ` · ${test.command}` : ''}`,
      language: 'text',
      text: output,
    })
  }
  return {
    id: 'test',
    title: '测试报告',
    summary: `本机${testStatus(tests.local)} · 环境${testStatus(tests.environment)}${checks.length ? ` · 验收 ${passedChecks}/${checks.length}` : ''}`,
    blocks,
  }
}

function planSection(item) {
  const plan = item.workflow?.plan ?? {}
  const estimate = estimateOf(item)
  const tasks = item.tasks ?? []
  const done = tasks.filter((task) => task.done).length
  const pending = tasks.filter((task) => !task.done)
  const techDoc = item.workflow?.techDoc ?? {}
  const fields = [
    { label: '规模', value: textOf(estimate.size) || '待评估' },
    { label: '人日', value: estimate.days === null || estimate.days === undefined || estimate.days === '' ? '—' : `${estimate.days} 人日` },
    { label: '置信度', value: { low: '低', medium: '中', high: '高' }[estimate.confidence] ?? '待评估' },
    { label: '开发任务', value: tasks.length ? `${done}/${tasks.length} 完成` : '没有任务清单', tone: tasks.length && done === tasks.length ? 'ok' : 'neutral' },
    {
      label: '技术文档',
      value: techDoc.provider
        ? (TECH_DOC_PROVIDER_LABEL[techDoc.provider] ?? techDoc.provider)
        : (techDoc.decision ? (TECH_DOC_LABEL[techDoc.decision] ?? techDoc.decision) : '未选择'),
    },
    { label: '开发会话', value: item.session?.id ? String(item.session.id) : '未绑定' },
  ]
  if (techDoc.url || techDoc.localPath) {
    fields.push({ label: '文档位置', value: techDoc.url || techDoc.localPath })
  }
  const blocks = [
    { type: 'fields', fields },
    ...(String(techDoc.supplement ?? '').trim()
      ? [{ type: 'text', title: '技术方案补充', text: String(techDoc.supplement).trim().slice(0, 4000) }]
      : []),
    { type: 'text', title: '计划摘要', text: textOf(plan.summary) || '还没有计划摘要' },
    { type: 'list', title: '计划步骤', items: listOf(plan.steps).map((text) => ({ text })) },
    {
      type: 'list',
      title: '任务清单',
      items: tasks.map((task) => ({
        text: textOf(task.text),
        meta: task.done ? '已完成' : '待办',
        tone: task.done ? 'ok' : 'neutral',
      })).filter((item) => item.text),
    },
  ]
  if (pending.length) {
    blocks.push({
      type: 'text',
      text: `还有 ${pending.length} 个任务没完成：${pending.slice(0, 8).map((task) => textOf(task.text)).join('、')}${pending.length > 8 ? ' 等' : ''}。`,
    })
  }
  blocks.push({
    type: 'list',
    title: '风险',
    items: listOf(item.risks, 50).map((text) => ({ text, tone: 'warn' })),
  })
  if ((item.references ?? []).length) {
    blocks.push({
      type: 'list',
      title: '参考实现',
      items: item.references.map((reference) => ({
        text: textOf(reference.path),
        meta: textOf(reference.why) || undefined,
      })).filter((entry) => entry.text),
    })
  }
  return {
    id: 'plan',
    title: '计划与进度',
    summary: tasks.length ? `${done}/${tasks.length} 任务完成` : (textOf(plan.summary) || '还没有计划'),
    blocks,
  }
}

function timelineSection(item) {
  const history = Array.isArray(item.history) ? item.history : []
  const items = [...history].reverse().slice(0, 40).map((entry) => ({
    text: textOf(entry.message) || '（无描述）',
    meta: `${formatReportTime(entry.at)}${entry.type ? ` · ${HISTORY_TYPE_LABEL[entry.type] ?? entry.type}` : ''}`,
  }))
  return {
    id: 'timeline',
    title: '过程记录',
    summary: history.length ? `${history.length} 条记录` : '还没有记录',
    blocks: [{ type: 'list', items }],
  }
}

function evidenceSection(item, files, git, generatedAt) {
  const baseline = baselineOf(item)
  const fields = [
    { label: '流程', value: `${item.id} · ${item.title}` },
    { label: '状态', value: STATUS_LABELS[item.status] ?? item.status ?? '—' },
    { label: '阶段', value: STAGE_LABELS[item.workflow?.stage] ?? item.workflow?.stage ?? '—' },
    { label: '插件版本', value: textOf(item.provenance?.pluginVersion) || '—' },
    { label: '报告生成时间', value: formatReportTime(generatedAt) },
    {
      label: 'git 证据',
      value: git?.isRepo === false
        ? `不是 git 仓库${git.reason ? `：${git.reason}` : '：无法统计提交与 diff'}`
        : (git?.branch ? `${git.branch}${git.head ? ` @ ${git.head}` : ''}` : '没有读取到 git 信息'),
      tone: git?.isRepo === false ? 'warn' : 'neutral',
    },
    {
      label: 'baseline',
      value: baseline?.commit ? `${String(baseline.commit).slice(0, 12)}${baseline.branch ? ` @ ${baseline.branch}` : ''}` : '未记录',
      tone: baseline?.commit ? 'neutral' : 'warn',
    },
    { label: '排除的台账文件', value: numberOrZero(files?.excludedCount) ? String(files.excludedCount) : '0' },
    ...(item.workflow?.worktree?.branch
      ? [{
          label: '独立工作区',
          value: `${item.workflow.worktree.branch}${files?.workRoot ? ` · ${files.workRoot}` : ''}`,
        }]
      : []),
  ]
  return {
    id: 'evidence',
    title: '证据与边界',
    summary: files?.evidenceComplete === false ? '证据不完整，请结合台账人工确认' : '证据来自台账与本机 git',
    blocks: [
      { type: 'fields', fields },
      {
        type: 'text',
        title: '阅读说明',
        text: '报告由 .dev-hub 台账与本机 git 事实生成，不调用模型、不发网络请求；没有 baseline 或不是 git 仓库时会显式标注「证据不完整」，不伪造 diff。测试结论只认台账里记录的命令与退出状态，报告不会替人判定通过。',
      },
    ],
  }
}

/**
 * 生成一份开发报告模型。
 *
 * @param {object} input
 * @param {object} input.item 台账里的开发项（已 sanitize）
 * @param {object|null} [input.files] 与 GET /api/dev-hub/files 同形的变更文件证据
 * @param {object|null} [input.git] { isRepo, available, branch, head, reason }
 * @param {object|null} [input.workspace] { id, name, members }
 * @param {string} [input.generatedAt]
 */
export function buildReport({ item, files = null, git = null, workspace = null, generatedAt = new Date().toISOString() } = {}) {
  if (!item || typeof item !== 'object') throw new Error('buildReport 需要开发项台账')
  const itemId = textOf(item.id) || 'item'
  const title = textOf(item.title) || itemId
  const status = textOf(item.status) || 'planned'
  const stage = textOf(item.workflow?.stage) || 'discovery'
  const tests = item.workflow?.tests ?? {}
  const tasks = item.tasks ?? []
  const baseline = baselineOf(item)
  const submission = submissionOf(item)
  const intent = normalizeIntent(item.workflow?.intent) ?? 'feature'
  const isAnalysis = intent === 'analysis'
  const reportSet = reportFileSet(files)
  const review = describeReview(item)
  const testsPassed = ['local', 'environment'].filter((phase) => tests[phase]?.status === 'passed').length
  const checks = item.checks ?? []
  const taskDone = tasks.filter((task) => task.done).length

  // 结论：只按事实推导，不做「看起来差不多了」的宽容判断。
  const failures = []
  if (tests.local?.status === 'failed') failures.push('本机自测未通过')
  if (tests.environment?.status === 'failed') failures.push('环境测试未通过')
  const failedChecks = checks.filter((check) => check.status === 'failed')
  if (failedChecks.length) failures.push(`${failedChecks.length} 个验收项未通过`)
  if (review.verdict === 'fail') failures.push(`独立评审未通过（${review.failed} 位审核员给出纠偏意见）`)
  if (submission && submission.pushed === false) failures.push('已提交但推送失败')
  let verdict = 'incomplete'
  let verdictLabel = '未完成'
  let verdictReason = `阶段还停在「${STAGE_LABELS[stage] ?? stage}」`
  if (status === 'blocked') {
    verdict = 'blocked'
    verdictLabel = '阻塞'
    verdictReason = '流程被标记为阻塞，报告只反映当前事实'
  } else if (failures.length) {
    verdict = 'failed'
    verdictLabel = '未通过'
    verdictReason = failures.join('；')
  } else if (stage === 'done') {
    const skippedTests = ['local', 'environment'].filter((phase) => tests[phase]?.status === 'skipped')
    verdict = 'passed'
    verdictLabel = '通过'
    verdictReason = [
      isAnalysis
        ? '分析流程：只读结论已产出，不进入提交'
        : submission?.commit
          ? `已提交 ${submission.commit}${submission.pushed ? ' 并推送' : ''}`
          : '非 git 仓库：测试通过或已跳过后完成',
      skippedTests.length
        ? `测试人工跳过：${skippedTests.map((phase) => (phase === 'local' ? '本机自测' : '环境测试')).join('、')}（见测试报告）`
        : '',
    ].filter(Boolean).join('；')
  } else if (stage === 'review') {
    verdictReason = review.gateReason || '阶段停在「独立评审」：等审核员结论'
  } else if (stage === 'verify') {
    verdictReason = isAnalysis
      ? (tests.local?.status === 'passed' ? '分析流程：只读排查完成，等结论回写' : '分析流程：评审已通过，等待本机自测作为只读证据')
      : tests.local?.status === 'passed'
        ? (tests.environment?.status === 'passed' ? '本机与环境测试已通过，等待提交' : '评审已通过、本机自测已通过，环境测试还没跑')
        : tests.local?.status === 'skipped'
          ? '评审已通过，本机自测已跳过，等待环境测试或跳过'
          : '评审已通过，等待本机自测'
  } else if (tests.local?.status === 'passed') {
    verdictReason = tests.environment?.status === 'passed'
      ? '本机与环境测试已通过，等待提交'
      : '本机自测已通过，环境测试还没跑'
  } else if (tests.local?.status) {
    verdictReason = `本机自测${testStatus(tests.local)}`
  } else {
    verdictReason = `阶段还停在「${STAGE_LABELS[stage] ?? stage}」：还没有测试结果`
  }

  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    itemId,
    title,
    status,
    statusLabel: STATUS_LABELS[status] ?? status,
    stage,
    stageLabel: STAGE_LABELS[stage] ?? stage,
    stageReason: textOf(item.workflow?.stageReason),
    intent,
    generatedAt,
    generatedAtLabel: formatReportTime(generatedAt),
    verdict,
    verdictLabel,
    verdictReason,
    summary: {
      goal: textOf(item.goal),
      rootProblem: textOf(item.requirement?.rootProblem) || textOf(item.workflow?.rootProblem),
      changedFiles: numberOrZero(reportSet.totals.files),
      added: numberOrZero(reportSet.totals.added),
      removed: numberOrZero(reportSet.totals.removed),
      testsPassed,
      testsTotal: 2,
      tasksDone: taskDone,
      tasksTotal: tasks.length,
      baseline,
      submission,
      review: {
        status: review.status,
        verdict: review.verdict,
        round: review.round,
        total: review.total,
        passed: review.passed,
        failed: review.failed,
        errored: review.errored,
        pending: review.pending,
        allowed: review.allowed,
      },
      workspace: workspace ? { id: textOf(workspace.id), name: textOf(workspace.name) } : null,
    },
    sections: [
      goalSection(item),
      isAnalysis ? analysisSection(item, files, reportSet) : scopeSection(item, files, workspace, reportSet),
      reviewSection(item),
      testSection(item, files),
      planSection(item),
      timelineSection(item),
      evidenceSection(item, files, git, generatedAt),
    ],
  }
  return report
}
