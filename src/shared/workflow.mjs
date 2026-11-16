/** Workflow stages shared by Host and browser. */
export const WORKFLOW_STAGES = [
  { id: 'discovery', label: '需求澄清', hint: '多问询，确定根本问题' },
  { id: 'techdoc', label: '技术文档', hint: '已有文档，或用 lark-cli 创建' },
  { id: 'plan', label: '开发计划', hint: '列步骤，评估工程量' },
  { id: 'develop', label: '开发中', hint: '实时更新进度与细节' },
  { id: 'review', label: '独立评审', hint: '继续推进即开始评审，通过才放行' },
  { id: 'verify', label: '测试验证', hint: '评审通过后跑本机自测与环境测试' },
  { id: 'submit', label: '提交代码', hint: '选择文件，提交并推送' },
  { id: 'done', label: '已完成', hint: '归档并交接' },
]

export const STAGE_LABELS = Object.fromEntries(WORKFLOW_STAGES.map((stage) => [stage.id, stage.label]))

/**
 * 独立评审：审核员数量上限与默认值。
 * 1 位用于小改动；默认 2 位（方向 + 正确性）；3 位时补一位风险视角。
 */
export const REVIEW_MAX_REVIEWERS = 3
export const REVIEW_DEFAULT_REVIEWERS = 2

/**
 * 审核视角：同一份证据换不同角度审，避免 3 个审核员给出同一段结论。
 * 顺序即默认派发顺序（1 位 → 方向；2 位 → 方向 + 正确性；3 位 → 再加风险）。
 */
export const REVIEWER_ROLES = [
  { id: 'direction', label: '方向', focus: '实现方向是否符合目标与验收标准；有没有偏离需求、过度设计或做小了' },
  { id: 'correctness', label: '正确性', focus: '实现是否正确，边界/异常/失败路径是否处理，测试是否覆盖到新增行为' },
  { id: 'risk', label: '风险', focus: '兼容性、数据与迁移、性能、权限、回滚与可观测性等隐患，以及是否留下未说明的缺口' },
]

export const REVIEW_ROLE_BY_ID = Object.fromEntries(REVIEWER_ROLES.map((role) => [role.id, role]))

/** 评审结论只有两种；待处理/异常由状态表达，不混进 verdict。 */
export const REVIEW_VERDICTS = ['pass', 'fail']

export const REVIEW_STATUS_LABELS = {
  idle: '未评审',
  pending: '评审中',
  passed: '评审通过',
  failed: '评审未通过',
  error: '评审异常待处理',
}

export const REVIEW_STATUS_TONES = {
  idle: 'neutral',
  pending: 'info',
  passed: 'ok',
  failed: 'danger',
  error: 'warn',
}

/** Questions that must be answered before a plan is credible. */
export const DEFAULT_QUESTIONS = [
  '真正要解决的根本问题是什么？现在团队是怎么绕过它的？',
  '谁受影响？成功的可观测指标是什么？',
  '这个功能的边界和非目标是什么？明确不做什么。',
  '有没有现有实现、替代方案或历史尝试？为什么不用？',
  '有哪些技术约束：兼容性、数据迁移、性能、权限、回滚？',
  '验收标准是什么？失败时如何定位和回滚？',
]

export const ESTIMATE_SIZES = ['S', 'M', 'L', 'XL']
export const ESTIMATE_CONFIDENCE = ['low', 'medium', 'high']
export const TECH_DOC_DECISIONS = ['existing', 'create', 'none']
