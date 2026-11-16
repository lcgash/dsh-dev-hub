/** Wizard steps shared by Host and browser half. */

export const WIZARD_STEPS = [
  { id: 'describe', label: '要开发什么', hint: '用一段话说清功能与要解决的问题' },
  { id: 'name', label: '流程名称', hint: '自动生成一个名字，可修改' },
  { id: 'scope', label: '代码目录与模块', hint: '勾选这次要动的目录/模块，用于并行冲突判定' },
  { id: 'bootstrap', label: '初始化仓库规范', hint: '仅首次开发：生成 .dev-hub/conventions.json' },
  { id: 'start', label: '开始开发流程', hint: '进入需求澄清 → 技术文档 → 计划' },
]

export const WIZARD_STEP_LABELS = Object.fromEntries(WIZARD_STEPS.map((step) => [step.id, step.label]))

/** Entry modes returned by the Host so the UI can pick the first screen. */
export const ENTRY_MODES = {
  setup: 'setup',
  firstRun: 'first-run',
  flow: 'flow',
}
