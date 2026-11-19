/**
 * 独立评审：阶段模型与纯逻辑（不读盘、不调模型、不 import 宿主）。
 *
 * 为什么要有这一层：
 * 开发完成后直接进测试验证，测试只能回答「跑不跑得通」，回答不了「方向对不对、
 * 边界取舍合不合理、有没有留下隐患」。评审把这件事交给 1~3 个独立审核员会话：
 * 他们拿同一份证据（目标/验收/scope/改动/测试/报告）分别给出结论，宿主按结论决定
 * 放行进入测试验证，还是退回开发并附上具体纠偏意见。
 *
 * 判定口径（本模块固化）：
 * - 全部审核员通过才算通过（单一审核员即可判定自己的结论，但整条流程不看多数票）；
 * - 任一审核员不通过 → 流程回到开发，带着该审核员的纠偏意见；
 * - 任一审核员异常/未返回结论 → 状态是「待处理」，绝不当成通过；
 * - 评审不替代测试：通过只是允许进入测试验证，测试门禁仍照旧。
 *
 * 「继续推进」的入口语义也在这里固化（reviewAdvancePlan）：
 * 开发阶段完成后点「继续推进」就自动开始评审，不需要到独立评审页手工派发；
 * 已有 pending 评审时不重复派发（幂等）；派发失败或评审 failed/error 时按钮保持可点，
 * 再点即重试派发并展示上次失败原因；评审 running 时按钮禁用并显示「评审中」。
 *
 * 数据落在 item.workflow.review（见 normalizeReview），阶段由 stage.mjs 按事实推导。
 */

import {
  REVIEWER_ROLES,
  REVIEW_DEFAULT_REVIEWERS,
  REVIEW_MAX_REVIEWERS,
  REVIEW_MAX_AUTO_ROUNDS,
  REVIEW_ROLE_BY_ID,
  REVIEW_VERDICTS,
} from '../shared/workflow.mjs'

const REVIEWER_STATUSES = ['pending', 'passed', 'failed', 'error']
const SEVERITIES = ['blocker', 'major', 'minor']
const CONFIDENCE = ['high', 'medium', 'low']
const MAX_FINDINGS = 12
const MAX_HISTORY_ROUNDS = 5

function str(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max)
}

function strList(value, max = 10, itemMax = 400) {
  return (Array.isArray(value) ? value : []).map((entry) => str(entry, itemMax)).filter(Boolean).slice(0, max)
}

/** 审核员数量收敛到 1~3；非法值回落到默认值。 */
export function normalizeReviewerCount(value) {
  const count = Number(value)
  if (!Number.isFinite(count)) return REVIEW_DEFAULT_REVIEWERS
  return Math.min(REVIEW_MAX_REVIEWERS, Math.max(1, Math.round(count)))
}

/** 默认派发哪几个视角：1 位→方向；2 位→方向+正确性；3 位→再加风险。 */
export function reviewerRolesFor(count) {
  const total = normalizeReviewerCount(count)
  return REVIEWER_ROLES.slice(0, total).map((role) => role.id)
}

/** 审核员槽位：id 稳定（reviewer-1..3），界面与台账都用它对齐。 */
export function buildReviewerSlots(count) {
  return reviewerRolesFor(count).map((roleId, index) => {
    const role = REVIEW_ROLE_BY_ID[roleId] ?? REVIEWER_ROLES[0]
    return {
      id: `reviewer-${index + 1}`,
      label: `审核员 ${index + 1}（${role.label}）`,
      role: role.id,
    }
  })
}

function normalizeFindings(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((finding) => ({
      severity: SEVERITIES.includes(finding?.severity) ? finding.severity : 'major',
      summary: str(finding?.summary ?? finding?.title, 400),
      detail: str(finding?.detail, 1200),
      file: str(finding?.file, 400),
    }))
    .filter((finding) => finding.summary)
    .slice(0, MAX_FINDINGS)
}

function normalizeReviewer(raw, index) {
  const role = REVIEW_ROLE_BY_ID[raw?.role] ? raw.role : REVIEWER_ROLES[index % REVIEWER_ROLES.length].id
  return {
    id: str(raw?.id, 40) || `reviewer-${index + 1}`,
    label: str(raw?.label, 80) || `审核员 ${index + 1}`,
    role,
    status: REVIEWER_STATUSES.includes(raw?.status) ? raw.status : 'pending',
    verdict: REVIEW_VERDICTS.includes(raw?.verdict) ? raw.verdict : null,
    summary: str(raw?.summary, 2000),
    findings: normalizeFindings(raw?.findings),
    direction: str(raw?.direction, 1200),
    evidence: strList(raw?.evidence, 8, 400),
    confidence: CONFIDENCE.includes(raw?.confidence) ? raw.confidence : null,
    // 结论来源：审核员会话自动评审 vs 会话不可用时的人工记录（不混淆两种证据强度）
    source: raw?.source === 'manual' ? 'manual' : 'agent',
    sessionId: str(raw?.sessionId, 120),
    provider: str(raw?.provider, 40),
    elapsedMs: Number.isFinite(Number(raw?.elapsedMs)) ? Number(raw.elapsedMs) : null,
    error: str(raw?.error, 1200),
    dispatchedAt: raw?.dispatchedAt || null,
    finishedAt: raw?.finishedAt || null,
  }
}

function normalizeBasis(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    files: Number.isFinite(Number(raw.files)) ? Number(raw.files) : 0,
    added: Number.isFinite(Number(raw.added)) ? Number(raw.added) : 0,
    removed: Number.isFinite(Number(raw.removed)) ? Number(raw.removed) : 0,
    head: str(raw.head, 80),
    localTest: str(raw.localTest, 40) || 'not_run',
    at: raw.at || null,
  }
}

function normalizeHistoryRound(raw) {
  return {
    round: Number.isFinite(Number(raw?.round)) ? Number(raw.round) : 0,
    decidedAt: raw?.decidedAt || null,
    status: ['passed', 'failed', 'error', 'pending', 'idle'].includes(raw?.status) ? raw.status : 'idle',
    reviewers: (Array.isArray(raw?.reviewers) ? raw.reviewers : []).map((reviewer, index) => {
      const normalized = normalizeReviewer(reviewer, index)
      return {
        id: normalized.id,
        label: normalized.label,
        role: normalized.role,
        status: normalized.status,
        verdict: normalized.verdict,
        summary: normalized.summary,
        findings: normalized.findings,
        source: normalized.source,
      }
    }).slice(0, REVIEW_MAX_REVIEWERS),
  }
}

/** 台账归一化：review 为空时返回 null（旧流程不受影响）。 */
export function normalizeReview(raw) {
  if (!raw || typeof raw !== 'object') return null
  const reviewers = (Array.isArray(raw.reviewers) ? raw.reviewers : [])
    .map(normalizeReviewer)
    .slice(0, REVIEW_MAX_REVIEWERS)
  if (!reviewers.length && !raw.history?.length) return null
  return {
    // status 永远从审核员事实重算：手写 status=passed 不会被当成通过
    status: deriveReviewStatus(reviewers),
    round: Number.isFinite(Number(raw.round)) && Number(raw.round) > 0 ? Number(raw.round) : 1,
    dispatchedAt: raw.dispatchedAt || null,
    decidedAt: raw.decidedAt || null,
    // 纠偏意见已发回开发：此时不允许人工通过，等重新评审后再决定
    reworkAt: raw.reworkAt || null,
    basis: normalizeBasis(raw.basis),
    // 代码/诉求在评审后有改动 → 结论作废（历史轮次保留，谁在什么结论上被作废可追溯）
    invalidatedAt: raw.invalidatedAt || null,
    invalidatedReason: str(raw.invalidatedReason, 400),
    reviewers,
    history: (Array.isArray(raw.history) ? raw.history : [])
      .map(normalizeHistoryRound)
      .filter((entry) => entry.round > 0)
      .slice(-MAX_HISTORY_ROUNDS),
  }
}

/** 结论聚合：不通过 > 异常 > 进行中 > 通过；没有审核员就是未评审。 */
export function deriveReviewStatus(reviewers) {
  const list = Array.isArray(reviewers) ? reviewers : []
  if (!list.length) return 'idle'
  if (list.some((reviewer) => reviewer.status === 'failed')) return 'failed'
  if (list.some((reviewer) => reviewer.status === 'error')) return 'error'
  if (list.some((reviewer) => reviewer.status === 'pending')) return 'pending'
  if (list.every((reviewer) => reviewer.status === 'passed')) return 'passed'
  return 'error'
}

/** 开始一轮评审：清空上一轮结论（旧轮次进 history），审核员从 pending 开始。 */
export function startReviewRound(review, { count, at = new Date().toISOString(), basis = null } = {}) {
  const previous = normalizeReview(review)
  const total = normalizeReviewerCount(count ?? previous?.reviewers?.length ?? REVIEW_DEFAULT_REVIEWERS)
  const slots = buildReviewerSlots(total)
  const history = [...(previous?.history ?? [])]
  if (previous?.reviewers?.length && previous.status !== 'idle') {
    history.push({
      round: previous.round,
      decidedAt: previous.decidedAt,
      status: previous.status,
      reviewers: previous.reviewers.map((reviewer) => ({
        id: reviewer.id,
        label: reviewer.label,
        role: reviewer.role,
        status: reviewer.status,
        verdict: reviewer.verdict,
        summary: reviewer.summary,
        findings: reviewer.findings,
        source: reviewer.source,
      })),
    })
  }
  return {
    status: 'pending',
    round: (previous?.round ?? 0) + 1,
    dispatchedAt: at,
    decidedAt: null,
    reworkAt: null,
    basis: normalizeBasis(basis) ?? previous?.basis ?? null,
    reviewers: slots.map((slot) => ({
      ...slot,
      status: 'pending',
      verdict: null,
      summary: '',
      findings: [],
      direction: '',
      evidence: [],
      confidence: null,
      source: 'agent',
      sessionId: '',
      provider: '',
      elapsedMs: null,
      error: '',
      dispatchedAt: at,
      finishedAt: null,
    })),
    history: history.slice(-MAX_HISTORY_ROUNDS),
  }
}

/**
 * 作废当前评审结论：代码/诉求在评审通过后又变了，旧结论不能再当放行依据。
 *
 * 不是删除证据：当前轮次压进 history（保留各位审核员的结论与 findings），
 * reviewers 清空后 status 回到 idle，重新「继续推进」会派发新的一轮评审。
 * 评审已经 failed 时保留纠偏意见（流程本来就在开发中纠偏）。
 */
export function invalidateReview(review, { at = new Date().toISOString(), reason = '' } = {}) {
  const current = normalizeReview(review)
  if (!current) return null
  if (current.status === 'failed') return current
  const history = [...current.history]
  if (current.reviewers.length) {
    history.push({
      round: current.round,
      decidedAt: current.decidedAt ?? at,
      status: current.status,
      reviewers: current.reviewers.map((reviewer) => ({
        id: reviewer.id,
        label: reviewer.label,
        role: reviewer.role,
        status: reviewer.status,
        verdict: reviewer.verdict,
        summary: reviewer.summary,
        findings: reviewer.findings,
        source: reviewer.source,
      })),
    })
  }
  return {
    ...current,
    status: 'idle',
    reviewers: [],
    decidedAt: null,
    dispatchedAt: null,
    basis: null,
    invalidatedAt: at,
    invalidatedReason: reason,
    history: history.slice(-MAX_HISTORY_ROUNDS),
  }
}

/**
 * 把一位审核员的结构化输出并入台账。
 * @param {object|null} review
 * @param {string} reviewerId
 * @param {{ verdict?: string, summary?: string, findings?: object[], direction?: string,
 *   evidence?: string[], confidence?: string, sessionId?: string, provider?: string,
 *   elapsedMs?: number, error?: string, at?: string }} output
 */
export function applyReviewerOutput(review, reviewerId, output = {}) {
  const current = normalizeReview(review)
  if (!current) throw new Error('评审尚未派发：没有可写入的审核员')
  const index = current.reviewers.findIndex((reviewer) => reviewer.id === reviewerId)
  if (index < 0) throw new Error(`审核员不存在：${reviewerId}`)
  const normalized = normalizeReviewerVerdict(output)
  const at = output.at || new Date().toISOString()
  const reviewerStatus = output.error ? 'error' : normalized.verdict === 'pass' ? 'passed' : normalized.verdict === 'fail' ? 'failed' : 'error'
  const reviewers = current.reviewers.map((reviewer, position) => position !== index
    ? reviewer
    : {
        ...reviewer,
        status: reviewerStatus,
        verdict: reviewerStatus === 'error' ? null : normalized.verdict,
        summary: normalized.summary || (reviewerStatus === 'error' ? '' : reviewer.summary),
        findings: normalized.findings,
        direction: normalized.direction,
        evidence: normalized.evidence,
        confidence: normalized.confidence,
        // 结论来源：人工记录必须留痕，不能冒充审核员会话自动评审
        source: output.source === 'manual' ? 'manual' : (reviewer.source ?? 'agent'),
        sessionId: str(output.sessionId, 120) || reviewer.sessionId,
        provider: str(output.provider, 40) || reviewer.provider,
        elapsedMs: Number.isFinite(Number(output.elapsedMs)) ? Number(output.elapsedMs) : reviewer.elapsedMs,
        error: str(output.error, 1200),
        finishedAt: at,
      })
  const status = deriveReviewStatus(reviewers)
  return {
    ...current,
    reviewers,
    status,
    decidedAt: status === 'passed' || status === 'failed' ? at : null,
  }
}

/** 把模型输出规范化成可落盘的结论；无法判断时返回 null verdict（由调用方记 error）。 */
export function normalizeReviewerVerdict(raw) {
  const verdict = REVIEW_VERDICTS.includes(raw?.verdict) ? raw.verdict : null
  return {
    verdict,
    summary: str(raw?.summary, 2000),
    findings: normalizeFindings(raw?.findings),
    direction: str(raw?.direction, 1200),
    evidence: strList(raw?.evidence, 8, 400),
    confidence: CONFIDENCE.includes(raw?.confidence) ? raw.confidence : null,
  }
}

/** 退回开发时带上的纠偏意见：按审核员分组，blocker/major 优先。 */
export function correctionsOf(review) {
  const current = normalizeReview(review)
  if (!current) return []
  const severityRank = { blocker: 0, major: 1, minor: 2 }
  return current.reviewers
    .filter((reviewer) => reviewer.status === 'failed')
    .map((reviewer) => {
      const findings = [...reviewer.findings].sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      const lines = findings
        .filter((finding) => finding.severity !== 'minor' || !findings.some((entry) => entry.severity !== 'minor'))
        .slice(0, 6)
        .map((finding) => `${finding.summary}${finding.file ? `（${finding.file}）` : ''}${finding.detail ? `：${finding.detail}` : ''}`)
      return {
        reviewerId: reviewer.id,
        reviewerLabel: reviewer.label,
        role: reviewer.role,
        summary: reviewer.summary,
        direction: reviewer.direction,
        findings: lines.length ? lines : [reviewer.summary || '审核员未给出具体意见'],
      }
    })
}

/**
 * 评审门禁：唯一的放行判断。stage.mjs 只消费这里的事实，不再自己判断。
 * @returns {{ allowed: boolean, status: string, stage: 'develop'|'review'|'verify', reason: string, corrections: object[] }}
 */

/**
 * 按工程量决定是否值得引入独立评审。
 *
 * 经验规则：S（<1.5 人日）的小改动直接进测试验证，避免每次都为一个小修调用
 * 1~3 个审核员；M/L/XL 仍保留评审。没有估算或旧台账按需要评审处理，保持原行为。
 * 也允许台账显式写 reviewRequired=true/false 覆盖（审计/特殊流程）。
 */
export function reviewPolicy(item) {
  const workflow = item?.workflow ?? {}
  const estimate = workflow.plan?.estimate ?? {}
  const size = String(estimate.size ?? '').trim().toUpperCase()
  const days = Number(estimate.days)
  if (typeof workflow.reviewRequired === 'boolean') {
    return {
      required: workflow.reviewRequired,
      reviewers: workflow.reviewRequired ? 2 : 0,
      size: size || null,
      days: Number.isFinite(days) ? days : null,
      reason: workflow.reviewRequired ? '台账显式要求独立评审' : '台账显式跳过独立评审',
      source: 'explicit',
    }
  }
  if (workflow.intent === 'analysis') {
    return { required: false, reviewers: 0, size: size || null, days: Number.isFinite(days) ? days : null, reason: '分析流程只读，产出结论即可', source: 'intent' }
  }
  if (size === 'S' || (Number.isFinite(days) && days < 1.5)) {
    return {
      required: false,
      reviewers: 0,
      size: size || 'S',
      days: Number.isFinite(days) ? days : null,
      reason: '小改动（S / 少于 1.5 人日）：默认跳过独立评审，直接进入测试验证',
      source: 'size',
    }
  }
  if (size === 'M' || (Number.isFinite(days) && days < 4)) {
    return {
      required: true,
      reviewers: 1,
      size: size || 'M',
      days: Number.isFinite(days) ? days : null,
      reason: '中等改动（M）：保留 1 位审核员的轻量评审，控制成本',
      source: 'size',
    }
  }
  if (['L', 'XL'].includes(size) || (Number.isFinite(days) && days >= 4)) {
    return {
      required: true,
      reviewers: 2,
      size: size || null,
      days: Number.isFinite(days) ? days : null,
      reason: `${size || 'L'} 规模改动：保留 2 位审核员复核方向与风险`,
      source: 'size',
    }
  }
  return { required: true, reviewers: 2, size: null, days: null, reason: '没有可用的工程量估算：保留独立评审', source: 'default' }
}

export function reviewGate(item) {
  const review = normalizeReview(item?.workflow?.review)
  const status = review?.status ?? 'idle'
  const corrections = correctionsOf(review)
  if (status === 'passed') {
    return { allowed: true, status, stage: 'verify', reason: '评审通过，允许进入测试验证', corrections: [] }
  }
  if (status === 'failed') {
    return {
      allowed: false,
      status,
      stage: 'develop',
      reason: `评审未通过，退回开发纠偏（${corrections.length} 位审核员给出意见）`,
      corrections,
    }
  }
  if (status === 'error') {
    const failed = (review?.reviewers ?? []).filter((reviewer) => reviewer.status === 'error')
    return {
      allowed: false,
      status,
      stage: 'review',
      reason: `评审异常待处理：${failed.map((reviewer) => reviewer.label).join('、') || '有审核员'}未返回结论，不能视为通过`,
      corrections: [],
    }
  }
  if (status === 'pending') {
    return { allowed: false, status, stage: 'review', reason: '独立评审进行中', corrections: [] }
  }
  const policy = reviewPolicy(item)
  if (!policy.required) {
    return {
      allowed: true,
      status,
      stage: 'verify',
      reason: policy.reason,
      corrections: [],
      required: false,
      skipped: true,
      policy,
    }
  }
  return {
    allowed: false,
    status,
    stage: 'review',
    reason: '继续推进即开始独立评审：自动派 1~3 位审核员复核改动与证据',
    corrections: [],
    required: true,
    skipped: false,
    policy,
  }
}

/** 界面/报告用的一次性快照（不产生副作用）。 */
export function describeReview(item) {
  const review = normalizeReview(item?.workflow?.review)
  const gate = reviewGate(item)
  const reviewers = review?.reviewers ?? []
  const passed = reviewers.filter((reviewer) => reviewer.status === 'passed').length
  const failed = reviewers.filter((reviewer) => reviewer.status === 'failed').length
  const pending = reviewers.filter((reviewer) => reviewer.status === 'pending').length
  const errored = reviewers.filter((reviewer) => reviewer.status === 'error').length
  return {
    status: review?.status ?? 'idle',
    verdict: review?.status === 'passed' ? 'pass' : review?.status === 'failed' ? 'fail' : null,
    round: review?.round ?? 0,
    maxRounds: REVIEW_MAX_AUTO_ROUNDS,
    // 自动轮次用尽：不再自动返工/复审，把决定权交给用户
    exhausted: Boolean(review && ['failed', 'error'].includes(review.status) && (review.round ?? 0) >= REVIEW_MAX_AUTO_ROUNDS),
    dispatchedAt: review?.dispatchedAt ?? null,
    decidedAt: review?.decidedAt ?? null,
    reworkAt: review?.reworkAt ?? null,
    basis: review?.basis ?? null,
    total: reviewers.length,
    passed,
    failed,
    pending,
    errored,
    finished: reviewers.length - pending,
    allowed: gate.allowed,
    gateReason: gate.reason,
    required: gate.required !== false,
    skipped: gate.skipped === true,
    policy: gate.policy ?? reviewPolicy(item),
    corrections: gate.corrections,
    reviewers,
    history: review?.history ?? [],
  }
}

/**
 * 上次评审失败/异常的原因：给「继续推进」按钮旁的内联提示用。
 * @param {ReturnType<typeof describeReview>} view
 */
export function reviewFailureHint(view) {
  if (view.status === 'error') {
    const errored = (view.reviewers ?? []).filter((reviewer) => reviewer.status === 'error')
    const first = errored.find((reviewer) => reviewer.error) ?? errored[0]
    if (first?.error) return `${first.label}：${first.error}`
    return `${view.errored || errored.length} 位审核员没有返回结论`
  }
  const correction = (view.corrections ?? [])[0]
  const finding = correction?.findings?.[0]
  return correction?.summary || finding || '审核员给出纠偏意见'
}

/**
 * 「继续推进」在评审这一步该做什么：唯一判定，Host/前端/下一步建议共用。
 *
 * - action=dispatch：开发阶段完成（stage=review 且评审 idle）→ 自动创建评审轮；
 * - action=wait：已有 pending 评审 → 幂等不重复派发，按钮禁用并显示「评审中」；
 * - action=retry：上次派发失败或评审 failed/error → 按钮保持可点，再点即重试派发；
 * - action=continue：不在评审这一步 → 仍按原来的「继续推进开发会话」走。
 *
 * 返回值不含副作用，纯函数；label/disabled/hint 直接给按钮用。
 * @returns {{ action: 'dispatch'|'wait'|'retry'|'continue', status: string, label: string,
 *   disabled: boolean, hint: string }}
 */
export function reviewAdvancePlan(item) {
  const view = describeReview(item)
  const stage = item?.workflow?.stage ?? 'discovery'
  if (view.status === 'pending') {
    return {
      action: 'wait',
      status: view.status,
      label: '评审中',
      disabled: true,
      hint: `独立评审进行中（${view.passed}/${view.total} 位已返回）：等审核员结论，不重复派发`,
    }
  }
  if (view.status === 'failed') {
    if (view.exhausted) {
      return {
        action: 'manual',
        status: view.status,
        label: '人工决定评审',
        disabled: false,
        hint: `自动返工/评审已达到 ${view.maxRounds} 轮上限：不再自动继续纠偏。请人工选择「人工通过本轮」或「重置本轮」后手工重试。`,
      }
    }
    if (view.reworkAt) {
      return {
        action: 'retry',
        status: view.status,
        label: '重新评审',
        disabled: false,
        hint: '纠偏意见已发回开发会话；完成修改后点它重新评审（测试仍由工作站「测试验证」阶段执行，不再允许本轮人工通过）',
      }
    }
    return {
      action: 'rework',
      status: view.status,
      label: '提交纠偏并返工',
      disabled: false,
      hint: `评审未通过：把 ${view.corrections.length} 位审核员的纠偏意见发回开发会话返工；修完先重新评审，测试由工作站「测试验证」阶段执行。若要忽略拒绝，请用评审页的「人工通过本轮」并确认。`,
    }
  }
  if (view.status === 'error') {
    if (view.exhausted) {
      return {
        action: 'manual',
        status: view.status,
        label: '人工决定评审',
        disabled: false,
        hint: `自动返工/评审已达到 ${view.maxRounds} 轮上限：请人工决定重试、重置或人工通过。`,
      }
    }
    return {
      action: 'retry',
      status: view.status,
      label: '重试评审',
      disabled: false,
      hint: `上次评审异常：${reviewFailureHint(view)}（重试评审或重置本轮）`,
    }
  }
  // 开发任务全部完成就可以开始评审：评审在测试验证之前（阶段条顺序），
  // 不能因为「还没跑本机自测」把流程永远卡在开发中、点「继续推进」却只往会话里发消息。
  const tasks = Array.isArray(item?.tasks) ? item.tasks : []
  const devDone = tasks.length > 0 && tasks.every((task) => Boolean(task?.done))
  if (view.status === 'idle' && view.required === false
    && (stage === 'review' || stage === 'verify' || (stage === 'develop' && devDone))) {
    return {
      action: 'verify',
      status: view.status,
      label: '去测试验证',
      disabled: false,
      hint: view.policy?.reason || '小改动免独立评审：直接进入测试验证',
    }
  }
  if (view.status === 'idle' && (stage === 'review' || (stage === 'develop' && devDone))) {
    return {
      action: 'dispatch',
      status: view.status,
      label: '开始独立评审',
      disabled: false,
      hint: stage === 'develop'
        ? '开发任务已完成：开始独立评审（审核员复核改动与证据）；评审通过后再跑本机/环境测试'
        : '开始独立评审：自动派 1~3 位审核员复核改动与证据',
    }
  }
  // 评审通过后，顶栏按钮直接推进到“下一步真实测试”，而不是只切个页签：
  // 本机自测未通过 → 跑本机自测；本机过了 → 跑环境测试；都过了 → 去提交。
  if (view.status === 'passed' && (stage === 'verify' || stage === 'submit')) {
    const tests = item?.workflow?.tests ?? {}
    const localValid = tests.local?.status === 'passed' && !tests.local?.stale
    const envValid = tests.environment?.status === 'passed' && !tests.environment?.stale
    const localSkipped = tests.local?.status === 'skipped' && !tests.local?.stale
    const envSkipped = tests.environment?.status === 'skipped' && !tests.environment?.stale
    if (stage === 'verify' && !localValid && !localSkipped) {
      return {
        action: 'verify',
        phase: 'local',
        status: view.status,
        label: '跑本机自测',
        disabled: false,
        hint: '评审已通过：点它直接跑本机自测，通过后进入环境测试',
      }
    }
    if (!envValid && !envSkipped) {
      return {
        action: 'verify',
        phase: 'environment',
        status: view.status,
        label: '跑环境测试',
        disabled: false,
        hint: '评审与本机自测已通过：点它直接跑环境测试，通过后进入提交',
      }
    }
    return {
      action: 'verify',
      phase: 'submit',
      status: view.status,
      label: '提交并推送',
      disabled: false,
      hint: '验证都过了：点它直接按当前变更提交并推送（提交信息自动生成）',
    }
  }
  return { action: 'continue', status: view.status, label: '继续推进', disabled: false, hint: '' }
}

/** 从最近一轮 history 里找回某审核员上一轮的结论（重审时界面可对比）。 */
export function previousReviewerVerdict(review, reviewerId) {
  const current = normalizeReview(review)
  const round = (current?.history ?? []).slice(-1)[0]
  return round?.reviewers?.find((reviewer) => reviewer.id === reviewerId) ?? null
}

/**
 * 审核员提示词：不需要人工重述上下文 —— 目标/验收/scope/改动/测试/报告/取舍说明
 * 都在里面，审核员只需按视角读代码并给结论。
 *
 * @param {object} input
 * @param {object} input.item 台账开发项
 * @param {object} input.reviewer { id, label, role }
 * @param {string} [input.repoName]
 * @param {string} [input.repoPath]
 * @param {object|null} [input.files] collectItemFiles 的结果（改动证据）
 * @param {object|null} [input.report] buildReport 的结果（开发报告）
 * @param {object|null} [input.workspace] { name, members: [{ name, path }] }
 * @param {string[]} [input.constraints] 仓库规范约束
 * @param {number} [input.total] 本轮审核员总数
 */
export function reviewerPrompt({
  item,
  reviewer,
  repoName = '',
  repoPath = '',
  files = null,
  report = null,
  workspace = null,
  constraints = [],
  total = 1,
} = {}) {
  if (!item?.id) throw new Error('reviewerPrompt 需要开发项')
  const role = REVIEW_ROLE_BY_ID[reviewer?.role] ?? REVIEWER_ROLES[0]
  const workflow = item.workflow ?? {}
  const tests = workflow.tests ?? {}
  const order = reviewer?.id?.startsWith('reviewer-') ? reviewer.id.slice('reviewer-'.length) : '1'
  const changed = Array.isArray(files?.files) ? files.files : []
  const outOfScope = changed.filter((file) => file.inScope === false)
  const lines = []

  lines.push(
    `你是 DevHub 开发工作站的独立审核员 ${order}/${total}（${reviewer?.label ?? role.label}）。你没有参与这次实现，任务是独立判断这次改动能否通过评审。`,
    `审核视角：${role.label} —— ${role.focus}`,
    '只读纪律：只允许 glob / grep / read / git diff 等只读命令；绝不修改、创建、删除文件，不运行会写盘或改变环境的命令。',
    '时间有限：先看变更清单与 diff，按验收标准定向读关键文件/调用方；不要从零全仓搜索，也不要重复读同一文件。',
    '',
    '【流程】',
    `- 开发项：${item.id}`,
    `- 标题：${item.title ?? ''}`,
    `- 目标：${str(item.goal, 2000) || '（未填写）'}`,
  )
  if (item.requirement?.raw && item.requirement.raw !== item.goal) {
    lines.push(`- 客户原始需求（仅追溯）：${str(item.requirement.raw, 2000)}`)
  }
  if (workflow.rootProblem) lines.push(`- 根本问题：${str(workflow.rootProblem, 2000)}`)
  lines.push(`- 当前阶段：${workflow.stage ?? 'develop'}${workflow.stageReason ? `（${workflow.stageReason}）` : ''}`)
  lines.push('', '【非目标（明确不做）】', ...((item.nonGoals ?? []).length
    ? item.nonGoals.map((goal) => `- ${goal}`)
    : ['- （未填写）']))
  lines.push('', '【验收标准（逐条对照）】')
  if ((item.acceptance ?? []).length) item.acceptance.forEach((entry, index) => lines.push(`- A${index + 1}. ${entry}`))
  else lines.push('- （未填写：缺少验收标准本身就是审核问题）')

  lines.push('', '【改动范围】')
  if (workspace) {
    lines.push(`- 虚拟库：${workspace.name || '未命名'}（成员库平权，路径如下）`)
    for (const member of workspace.members ?? []) lines.push(`  - ${member.name}：${member.path}`)
  } else {
    lines.push(`- 仓库：${repoName || '（未命名）'}${repoPath ? `（${repoPath}）` : ''}`)
  }
  if (files) {
    lines.push(`- 证据完整性：${files.evidenceComplete === false ? `不完整（${files.reason ?? '原因未知'}）` : '完整'}`)
    lines.push(`- 变更文件：${changed.length} 个（+${files.totals?.added ?? 0} / -${files.totals?.removed ?? 0}）`)
    for (const file of changed.slice(0, 40)) {
      const bits = [
        `- ${file.path}`,
        file.status ? `[${file.status}]` : '',
        file.binary ? '[二进制]' : `+${file.added ?? 0}/-${file.removed ?? 0}`,
        file.inScope === false ? '【不在 scope 内】' : '',
        file.note ? `说明：${file.note}` : '',
      ].filter(Boolean)
      lines.push(bits.join(' '))
    }
    if (changed.length > 40) lines.push(`- …还有 ${changed.length - 40} 个文件（请按需 read）`)
    if (outOfScope.length) {
      lines.push(`- 注意：${outOfScope.length} 个文件不在已确认 scope 内（${outOfScope.slice(0, 5).map((file) => file.path).join('、')}），请判断是否属于必要的范围扩展。`)
    }
    if (!changed.length) lines.push('- 没有检测到变更文件：可能 baseline 缺失或改动未落盘，请把它当作证据不足处理。')
  } else {
    lines.push('- （未读到改动证据：改动内容请以仓库实际状态为准）')
  }
  lines.push(`- 已确认 scope：${(item.scope ?? []).length ? item.scope.join('、') : '（未限定）'}`)

  lines.push('', '【已有测试结果（事实，不是结论）】')
  lines.push(`- 本机自测：${testLabel(tests.local?.status)}${tests.local?.command ? ` · ${tests.local.command}` : ''}`)
  lines.push(`- 环境测试：${testLabel(tests.environment?.status)}${tests.environment?.command ? ` · ${tests.environment.command}` : ''}`)
  if (tests.local?.output) lines.push(`  - 本机输出尾部：${str(tests.local.output, 1600).slice(-1600)}`)
  const checks = Array.isArray(item.checks) ? item.checks : []
  if (checks.length) {
    lines.push('- 验收项：')
    for (const check of checks) lines.push(`  - ${check.text}：${check.status ?? 'not_run'}`)
  }
  lines.push('', '【开发报告摘要】')
  if (report) {
    lines.push(`- 报告结论：${report.verdictLabel ?? report.verdict ?? '未知'}${report.verdictReason ? `（${report.verdictReason}）` : ''}`)
    lines.push(`- 改动规模：${report.summary?.changedFiles ?? 0} 个文件，+${report.summary?.added ?? 0}/-${report.summary?.removed ?? 0}`)
    lines.push(`- 任务：${report.summary?.tasksDone ?? 0}/${report.summary?.tasksTotal ?? 0} 完成`)
  } else {
    lines.push('- （报告未生成；以仓库事实为准）')
  }

  const points = Array.isArray(item.changePoints) ? item.changePoints : []
  if (points.length) {
    lines.push('', '【开发者记录的变更点（用于理解取舍，不能替代你的判断）】')
    for (const point of points.slice(0, 20)) lines.push(`- ${str(point.summary, 400)}`)
  }
  const notes = Object.entries(item.fileNotes ?? {})
  if (notes.length) {
    lines.push('', '【文件改动说明（开发者自述）】')
    for (const [path, entry] of notes.slice(0, 20)) lines.push(`- ${path}：${str(entry.note, 400)}`)
  }
  if ((item.risks ?? []).length) {
    lines.push('', '【已知风险/阻塞】', ...item.risks.map((risk) => `- ${risk}`))
  }
  const history = (item.history ?? []).slice(-10)
  if (history.length) {
    lines.push('', '【最近的流程记录】')
    for (const entry of history) lines.push(`- ${entry.at ?? ''} ${str(entry.message, 400)}`)
  }
  if ((constraints ?? []).length) {
    lines.push('', '【仓库规范约束（硬规则）】', ...constraints.slice(0, 20).map((rule) => `- ${rule}`))
  }

  lines.push(
    '',
    '【判定口径】',
    '1. 自己读代码核对验收标准 A1..An：每条都要能找到实现或说明缺口；只信仓库事实，不信开发者的自述。',
    '2. 只有「没有 blocker/major 问题，且验收标准都有对应实现/测试」时才给 pass；minor 问题可以列出但仍可 pass。',
    '3. 有 blocker/major 问题（方向偏离、实现错误、边界/失败路径缺失、测试没覆盖新增行为、越出 scope、证据不足）→ fail。',
    '4. fail 必须给可执行的纠偏意见：指向文件/行为/缺失的测试，不要只说「建议优化」。',
    '5. 你看不到必要证据（例如没有 diff、文件不存在）时不要猜：按证据不足给 fail 并说明缺什么。',
    '6. 不要修改任何文件；不要给「看起来差不多」的宽容结论。',
    '',
    '【输出】只输出一个 JSON 对象，不要解释、不要 Markdown 代码块：',
    '{"verdict":"pass|fail","summary":"一句话结论","findings":[{"severity":"blocker|major|minor","summary":"问题一句话","detail":"影响与建议","file":"相对路径"}],"direction":"方向建议（可选）","evidence":["你实际读过的文件/命令"],"confidence":"high|medium|low"}',
  )
  return lines.filter((line) => line !== undefined).join('\n')
}

function testLabel(status) {
  return { not_run: '未运行', running: '运行中', passed: '通过', failed: '失败' }[status] ?? (status || '未运行')
}

/** 审核员输出契约（Host 校验用，不替审核员推理）。 */
export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          summary: { type: 'string' },
          detail: { type: 'string' },
          file: { type: 'string' },
        },
        required: ['severity', 'summary'],
        additionalProperties: true,
      },
    },
    direction: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['verdict', 'summary'],
  additionalProperties: true,
}

/**
 * 一句话给 Context Pack / 阶段提示用。
 * 通过时告诉开发会话「评审已放行」，不通过时把纠偏意见原样带回去。
 */
export function formatReviewLine(item) {
  const view = describeReview(item)
  if (view.status === 'idle') return '未评审（开发完成后点「继续推进」即开始独立评审，自动派 1~3 位审核员复核改动与证据）'
  const head = `第 ${view.round} 轮 · ${view.passed}/${view.total} 通过 · ${view.pending ? `${view.pending} 待返回 · ` : ''}${view.errored ? `${view.errored} 异常 · ` : ''}${stateLabel(view.status)}`
  if (view.status !== 'failed') return head
  const lines = [head]
  for (const correction of view.corrections) {
    lines.push(`  - ${correction.reviewerLabel}：${correction.summary || ''}`)
    for (const finding of correction.findings) lines.push(`    - ${finding}`)
  }
  return lines.join('\n')
}

function stateLabel(status) {
  return { idle: '未评审', pending: '评审中', passed: '评审通过', failed: '评审未通过', error: '待处理（异常）' }[status] ?? status
}
