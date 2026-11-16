/**
 * 流程类型：定位 bug / 修复  vs  开发需求/功能  vs  只读分析。
 *
 * 为什么分三类：三类工作的第一步不同 —— bug 要先复现、拿到根因证据；需求要先对齐范围与验收；
 * 分析只读排查、给出结论，不改代码也不提交。这里只做确定性判定（关键词），类型可被用户在流程里改。
 *
 * 判定优先级：bug/功能词优先。描述里同时出现分析词与 bug/功能词时，仍按 bug/功能判，
 * 避免「分析一下这个 bug」被误判成只读分析、绕开复现与修复。两类词都没命中时才看分析词。
 */

const BUG_WORDS = ['bug', '修复', '报错', '异常', '崩溃', '失败', '不生效', '不工作', '回归', '排查', '定位', '错误', '500', '404', '超时', '卡住', '错乱', '不一致', '重复']
const FEATURE_WORDS = ['新增', '支持', '需求', '功能', '实现', '加一个', '增加', '接入', '改造', '优化', '重构', '迁移', '扩展']
const ANALYSIS_WORDS = ['分析', '梳理', '盘点', '调研', '评估', '诊断', '解释', '说明一下', '看看', '为什么', '调用链', '只读']

/** 流程类型全集：创建入口/台账归一都只认这三个值。 */
export const INTENTS = ['bug', 'feature', 'analysis']

/** 把外部传入的 intent 收敛到合法值；非法/缺省返回 fallback（默认 null）。 */
export function normalizeIntent(value, fallback = null) {
  const intent = String(value ?? '').trim().toLowerCase()
  return INTENTS.includes(intent) ? intent : fallback
}

/** @returns {'bug'|'feature'|'analysis'} */
export function detectIntent(description, { fallback = 'feature' } = {}) {
  const text = String(description ?? '').toLowerCase()
  if (!text.trim()) return fallback
  const bugScore = BUG_WORDS.filter((word) => text.includes(word.toLowerCase())).length
  const featureScore = FEATURE_WORDS.filter((word) => text.includes(word.toLowerCase())).length
  // bug/功能词优先：只要命中，就沿用原来的二分类逻辑（平手仍回退，不因为分析词改变结论）
  if (bugScore === 0 && featureScore === 0) {
    const analysisScore = ANALYSIS_WORDS.filter((word) => text.includes(word.toLowerCase())).length
    return analysisScore > 0 ? 'analysis' : fallback
  }
  return bugScore > featureScore ? 'bug' : featureScore > bugScore ? 'feature' : fallback
}

export const INTENT_LABEL = { bug: '定位/修复 bug', feature: '开发需求功能', analysis: '分析' }
