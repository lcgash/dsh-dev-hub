/**
 * 流程类型：定位 bug / 修复 vs 开发需求/功能 vs 代码重构 vs 只读分析。
 *
 * 为什么分四类：四类工作的第一步不同 —— bug 要先复现、拿到根因证据；需求要先对齐范围与验收；
 * 重构要先确认行为不变的边界、补保护网；分析只读排查、给出结论，不改代码也不提交。
 * 这里只做确定性判定（关键词），类型可被用户在流程里改。
 *
 * 判定优先级：bug 词优先；其次是重构词（避免“重构”被当成普通功能）；再是功能词；
 * 只有都没有时才看分析词。这样「分析一下这个 bug」仍按 bug 处理，不会绕开复现。
 */

const BUG_WORDS = ['bug', '修复', '报错', '异常', '崩溃', '失败', '不生效', '不工作', '回归', '排查', '定位', '错误', '500', '404', '超时', '卡住', '错乱', '不一致', '重复']
const FEATURE_WORDS = ['新增', '支持', '需求', '功能', '实现', '加一个', '增加', '接入', '改造', '优化', '迁移', '扩展']
const REFACTOR_WORDS = ['重构', 'refactor', '重写', '拆分', '解耦', '提取', '抽取', '重命名', '整理代码', '清理代码', '替换实现', '模块化', '去重', '简化', '代码整理']
const ANALYSIS_WORDS = ['分析', '梳理', '盘点', '调研', '评估', '诊断', '解释', '说明一下', '看看', '为什么', '调用链', '只读']

/** 流程类型全集：创建入口/台账归一都只认这三个值。 */
export const INTENTS = ['bug', 'feature', 'refactor', 'analysis']

/** 把外部传入的 intent 收敛到合法值；非法/缺省返回 fallback（默认 null）。 */
export function normalizeIntent(value, fallback = null) {
  const intent = String(value ?? '').trim().toLowerCase()
  return INTENTS.includes(intent) ? intent : fallback
}

/** @returns {'bug'|'feature'|'refactor'|'analysis'} */
export function detectIntent(description, { fallback = 'feature' } = {}) {
  const text = String(description ?? '').toLowerCase()
  if (!text.trim()) return fallback
  const bugScore = BUG_WORDS.filter((word) => text.includes(word.toLowerCase())).length
  const featureScore = FEATURE_WORDS.filter((word) => text.includes(word.toLowerCase())).length
  const refactorScore = REFACTOR_WORDS.filter((word) => text.includes(word.toLowerCase())).length
  // bug 优先；其次重构（“重构”不能被普通功能词淹没）；再次功能；都没有才看分析。
  if (bugScore > 0 && bugScore >= refactorScore) return 'bug'
  if (refactorScore > 0 && refactorScore >= featureScore) return 'refactor'
  if (featureScore > 0) return 'feature'
  const analysisScore = ANALYSIS_WORDS.filter((word) => text.includes(word.toLowerCase())).length
  return analysisScore > 0 ? 'analysis' : fallback
}

export const INTENT_LABEL = { bug: '定位/修复 bug', feature: '开发需求功能', refactor: '代码重构', analysis: '分析' }
