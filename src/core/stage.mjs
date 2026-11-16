/**
 * 阶段/状态只有一个来源：**事实推导**，不是用户点选。
 *
 * 为什么：阶段条如果可点，会出现"来回反复"——人点一下、工具又改一下，台账就成了噪音。
 * 这里按"工作推进到哪一步"的事实推导，任何一次落盘都会重新算一遍。
 *
 * 推导顺序（取最靠后的成立项，也就是"已经走到哪"）：
 *   done(已提交) > submit(环境验证通过) > verify(评审通过，进入测试验证)
 *   > review(评审进行中/待评审/待处理) > develop(有 baseline 或绑定了开发会话)
 *   > plan(有计划) > techdoc(技术文档已定) > discovery(其余)
 *
 * 独立评审插在 develop 与 verify 之间（见 review.mjs 的 reviewGate）：
 * - 评审不通过 → 回到 develop，并带着纠偏意见（台账里 review.corrections 可查）；
 * - 评审进行中/异常/未评审 → 停在 review，绝不静默进入测试验证；
 * - 评审通过 → 才允许进入 verify（测试验证）。
 * 老数据没有 review 字段时保持原行为：本机自测通过即进入测试验证，不强制补评审。
 *
 * 唯一保留的人工状态是 `blocked`（阻塞是事实，不是进度）。
 */

import { normalizeReview, reviewGate } from './review.mjs'
import { normalizeIntent } from './intent.mjs'

export const STAGE_ORDER = ['discovery', 'techdoc', 'plan', 'develop', 'review', 'verify', 'submit', 'done']

const STATUS_BY_STAGE = {
  discovery: 'planned',
  techdoc: 'designing',
  plan: 'planned',
  develop: 'developing',
  review: 'reviewing',
  verify: 'verifying',
  submit: 'verifying',
  done: 'done',
}

function answeredQuestions(workflow) {
  return (workflow?.questions ?? []).filter((question) => String(question?.answer ?? '').trim()).length
}

/** 推导「当前应该处于哪一步」，返回 stage 与判断依据（便于界面/日志解释）。 */
export function deriveStage(item) {
  const workflow = item?.workflow ?? {}
  const tests = workflow.tests ?? {}
  // stale = 测试通过后代码/诉求又变了：旧结果不能再当作"已通过"
  const localPassed = tests.local?.status === 'passed' && !tests.local?.stale
  const envPassed = tests.environment?.status === 'passed' && !tests.environment?.stale
  // “完成”只能来自提交事实：手写 status=done 不算，否则又会变成手工切换
  // 分析流程只读：永远不进入提交阶段，也不认提交记录
  const intent = normalizeIntent(workflow.intent) ?? 'feature'
  const isAnalysis = intent === 'analysis'
  const isGit = workflow.gitRepo !== false && !isAnalysis
  const submitted = isGit && Boolean(String(workflow.submission?.commit ?? '').trim())
  const started = Boolean(item?.baseline?.commit || item?.baseline?.startedAt) || Boolean(item?.session?.id)
  const planReady = Boolean(String(workflow.plan?.summary ?? '').trim()) && (workflow.plan?.steps?.length ?? 0) > 0
  const techDocReady = Boolean(workflow.techDoc?.decision)
  const review = normalizeReview(workflow.review)
  const gate = reviewGate(item)

  if (submitted) return { stage: 'done', reason: '已提交代码' }
  // 评审被否/未完成时，测试通过也不能把流程往前推：先纠偏或先把评审结论拿回来
  if (review?.status === 'failed') return { stage: 'develop', reason: gate.reason }
  if (review?.status === 'pending') return { stage: 'review', reason: gate.reason }
  if (review?.status === 'error') return { stage: 'review', reason: gate.reason }
  // 评审通过（包括人工确认忽略）后，直接进入评审之后的路线；即使之前有测试 rework 标记，
  // 也应该去测试验证重跑，而不是退回开发。后续新代码改动会由 invalidateReview 重新打开评审。
  if (review?.status === 'passed') {
    if (envPassed) return { stage: 'submit', reason: '评审通过，环境测试已通过，等待提交' }
    return { stage: 'verify', reason: localPassed ? '评审通过，本机自测已通过' : '评审通过，允许进入测试验证' }
  }
  // 测试/评审通过后又检测到新改动：流程回到开发中，旧结论等重跑（不能停在验证中）
  if (workflow.rework?.at) {
    return { stage: 'develop', reason: workflow.rework.reason || '测试通过后又有新改动：已回到开发中，请重跑本机自测' }
  }
  // 分析流程没有提交环节：本机自测（只读证据）与环境测试通过即结束，阶段绝不进入 submit
  if (isAnalysis && (localPassed || envPassed)) {
    return { stage: 'done', reason: '分析流程：只读结论已产出，不进入提交' }
  }
  // 非 git 仓库没有提交/推送环节：两项测试通过就是终点
  if (envPassed && !isGit) return { stage: 'done', reason: '非 git 仓库：测试通过即完成' }
  if (envPassed) return { stage: 'submit', reason: '环境验证通过，等待提交' }
  // 老数据没有评审事实：保持原行为（自测通过即进入测试验证），不因为新阶段卡住旧流程
  if ((review?.status ?? 'idle') === 'idle' && localPassed) {
    return { stage: 'review', reason: '本机自测通过：点「继续推进」即开始独立评审' }
  }
  if (started) return { stage: 'develop', reason: item?.session?.id ? '已绑定开发会话' : '已记录 baseline' }
  if (planReady) return { stage: 'plan', reason: '计划摘要与步骤齐备' }
  if (techDocReady) return { stage: 'techdoc', reason: '技术文档方案已确定' }
  if (String(workflow.rootProblem ?? '').trim() || answeredQuestions(workflow) > 0) {
    return { stage: 'discovery', reason: '正在澄清需求' }
  }
  return { stage: 'discovery', reason: '刚刚创建' }
}

/** 状态随阶段推导；`blocked` 是唯一保留的人工状态。 */
export function deriveStatus(item, stage) {
  if (item?.status === 'blocked') return { status: 'blocked', reason: '人工标记阻塞' }
  return { status: STATUS_BY_STAGE[stage] ?? 'planned', reason: '随阶段自动推进' }
}

/**
 * 就地修正 item 的 workflow.stage 与 status，返回是否发生变化。
 * 每次落盘（sanitizeItem）都会调用，所以任何来源的写入都会被归一。
 */
export function applyDerivedProgress(item) {
  const { stage, reason } = deriveStage(item)
  const { status } = deriveStatus(item, stage)
  let changed = false
  if (!item.workflow || typeof item.workflow !== 'object') item.workflow = {}
  if (item.workflow.stage !== stage) {
    item.workflow.stage = stage
    item.workflow.stageReason = reason
    changed = true
  } else if (item.workflow.stageReason !== reason) {
    item.workflow.stageReason = reason
  }
  if (item.status !== status) {
    item.status = status
    changed = true
  }
  return changed
}

/** 阶段序号，用于界面判断“已走过/当前/未到”。 */
export function stageIndex(stage) {
  const index = STAGE_ORDER.indexOf(stage)
  return index < 0 ? 0 : index
}
