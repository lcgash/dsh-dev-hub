/**
 * 验证基线：本机自测/评审到底是在哪一版「诉求 + 计划 + 范围 + 验收」上做的。
 *
 * 事故背景：本机自测通过后阶段就固定停在「测试验证」；用户改了诉求、会话又改了代码，
 * 旧测试结果看起来仍然通过，流程却不会再回到「开发中」。这里把验证时的输入压成哈希，
 * 测试通过时随结果落盘；后续一旦诉求/计划/范围/验收变化，就能判定"旧结论已过期"。
 *
 * 只做纯计算，不读盘、不 import 宿主。
 */
import { hashOf } from './provenance.mjs'

/** 会直接影响验证结论的输入（任务勾选/风险这类过程信息不算）。 */
export function verificationBasis(item) {
  const workflow = item?.workflow ?? {}
  return {
    goal: String(item?.goal ?? '').trim(),
    rootProblem: String(workflow.rootProblem ?? '').trim(),
    planSummary: String(workflow.plan?.summary ?? '').trim(),
    planSteps: (Array.isArray(workflow.plan?.steps) ? workflow.plan.steps : []).map(String),
    scope: (Array.isArray(item?.scope) ? item.scope : []).map(String),
    scopeModules: (Array.isArray(item?.scopeModules) ? item.scopeModules : []).map(String),
    acceptance: (Array.isArray(item?.acceptance) ? item.acceptance : []).map(String),
    nonGoals: (Array.isArray(item?.nonGoals) ? item.nonGoals : []).map(String),
    requirementGoal: String(item?.requirement?.goal ?? '').trim(),
    requirementRootProblem: String(item?.requirement?.rootProblem ?? '').trim(),
  }
}

/** 验证基线哈希（测试通过时写入 tests.<phase>.basisHash）。 */
export function verificationBasisHash(item) {
  return hashOf(verificationBasis(item))
}

/** 旧结果没有存指纹时，用会话在测试通过后是否又有活动做保守兜底。 */
export function sessionActiveAfter(ms, iso) {
  const after = Date.parse(String(iso ?? ''))
  if (!Number.isFinite(Number(ms)) || !Number.isFinite(after)) return false
  return Number(ms) > after
}
