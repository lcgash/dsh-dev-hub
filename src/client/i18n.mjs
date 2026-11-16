/**
 * 开发站的客户端本地化桥。
 *
 * 现有界面已经大量使用中文静态文案；这里不重写每个组件，而是把 React 元素工厂
 * 接到 DSH 的 locale 字典上：字符串子节点与常见可读属性命中词典时翻译，未命中时
 * 保留原文。这样语言切换由 DSH 设置页统一驱动，新增文案也能逐步补进字典。
 */
import {
  cloneElement,
  createElement as reactCreateElement,
  useEffect,
  useState,
} from 'react'

export const LOCALE_NAMESPACE = 'dev-hub'

/** 以中文原文为 key 的英文词典；key 集合就是当前已覆盖的界面文案。 */
export const en = {
  '开发工作站': 'Development Workstation',
  '开发流程台账 · 会话状态 · 并行开发 · 独立评审 · 测试与提交': 'Flow ledger · session state · parallel work · review & delivery',
  '新建开发流程 · 说一句要做什么 · 工作站扫仓库、追问、自评计划': 'New flow · describe intent · scan, clarify, plan',
  '专注流程：': 'Focused flow: ',
  '流程': 'Flows',
  '新建流程': 'New flow',
  '技能': 'Skills',
  '回流程': '← Back to flows',
  '进行中': 'In progress',
  '待处理': 'Needs attention',
  '开发中': 'Developing',
  '刷新': 'Refresh',
  '新对话': 'New chat',
  '历史': 'History',
  '回首页': 'Home',
  '回到开发站首页（流程列表）': 'Back to workbench home (flow list)',
  '回到开发站首页': 'Back to workbench home',
  '更多（低频操作）': 'More (less common)',
  '预览报告': 'Preview report',
  '继续推进': 'Continue',
  '开启开发会话': 'Open development session',
  '正在继续开发会话…': 'Continuing development session…',
  '正在开启开发会话…': 'Opening development session…',
  '正在开发…': 'Developing…',
  '开发进度': 'Progress',
  '任务': 'Tasks',
  '本机自测': 'Local tests',
  '环境测试': 'Environment tests',
  '验收': 'Acceptance',
  '变更文件': 'Changed files',
  '已完成': 'Done',
  '评审中': 'In review',
  '独立评审': 'Independent review',
  '测试验证': 'Verification',
  '待提交': 'Ready to submit',
  '提交代码': 'Submit',
  '开发计划': 'Plan',
  '需求澄清': 'Requirement',
  '技术文档': 'Tech doc',
  '保存并探测环境': 'Save and detect environment',
  '添加并探测环境': 'Add and detect environment',
  '探测中…': 'Detecting…',
  '代码库路径': 'Repository path',
  '你的名字/成员标识': 'Your name / member id',
  '选择目录': 'Choose directory',
  '例如：张三': 'For example: Alex',
  '新增代码库': 'Add repository',
  '初始化 DevHub': 'Initialize DevHub',
  '新增开发目标': 'Add development target',
  '新建虚拟库': 'New virtual workspace',
  '开发流程': 'Development flows',
  '还没有开发流程': 'No development flows yet',
  '成员': 'Member',
  '扫描文档': 'Scan documents',
  '用一段话描述你要做什么：工作站会扫仓库、追问、自评计划，再确认范围。': 'Describe what you want to do: the workstation scans, clarifies, estimates and asks you to confirm the scope.',
  '可以并行': 'Parallel work',
  '正在读取…': 'Reading…',
  '展开/收起': 'Expand / collapse',
  '当前没有进行中的流程。': 'No active flows right now.',
  '开发目标': 'Development targets',
  '当前开发目标': 'Current development target',
  '代码库': 'Repository',
  '虚拟库': 'Virtual workspace',
  '当前': 'Current',
  '点击切换': 'Click to switch',
  '流程进度': 'Flow progress',
  '报告': 'Report',
  '计划': 'Plan',
  '概览': 'Overview',
  '测试与提交': 'Tests & submit',
  '独立工作区': 'Isolated worktree',
  '工作区': 'Workspace',
  '关联会话': 'Session',
  '解绑会话': 'Unbind session',
  '下一步': 'Next step',
  '发送': 'Send',
  '提交回答': 'Submit answer',
  '跳过（按默认推进）': 'Skip (use defaults)',
  '去会话处理': 'Open session',
  '重新描述': 'Describe again',
  '再调整范围': 'Adjust scope',
  '继续，生成计划': 'Continue to plan',
  '确认开工': 'Confirm and start',
  '生成计划': 'Generate plan',
  '正在生成计划…': 'Generating plan…',
  '正在扫描…': 'Scanning…',
  '扫描中…': 'Scanning…',
  '正在扫描仓库…': 'Scanning repository…',
  '新建开发流程': 'New development flow',
  '澄清中': 'Clarifying',
  '需求澄清 · 第': 'Clarification · round ',
  '扫描仓库': 'Scan repository',
  '命中': 'matched',
  '候选': 'candidates',
  '确认': 'Confirm',
  '取消': 'Cancel',
  '关闭': 'Close',
  '保存到本机': 'Save locally',
  '打开完整报告': 'Open full report',
  '报告预览': 'Report preview',
  '开发报告预览': 'Development report preview',
  '加载中…': 'Loading…',
  '目标背景': 'Goals & background',
  '改动范围': 'Change scope',
  '测试报告': 'Test report',
  '计划与进度': 'Plan & progress',
  '过程记录': 'Timeline',
  '证据与边界': 'Evidence & boundaries',
  '报告口径': 'Report scope',
  '文件': 'File',
  '状态': 'Status',
  '增删': 'Changes',
  '范围': 'Scope',
  '修改意义': 'Meaning',
  '新增': 'Added',
  '修改': 'Modified',
  '删除': 'Deleted',
  '重命名': 'Renamed',
  '通过': 'Passed',
  '失败': 'Failed',
  '未运行': 'Not run',
  '运行中': 'Running',
  '完整': 'Complete',
  '不完整': 'Incomplete',
  '还没有提交记录': 'No submission yet',
  '变更统计': 'Change stats',
  '提交结果': 'Submission',
  '计划范围': 'Planned scope',
  '证据完整性': 'Evidence completeness',
  '排除的台账文件': 'Excluded ledger files',
  '审核员': 'Reviewers',
  '结论': 'Verdict',
  '方向': 'Direction',
  '正确性': 'Correctness',
  '风险': 'Risk',
  '通过（允许进入测试验证）': 'Passed (ready for verification)',
  '评审通过': 'Review passed',
  '评审未通过': 'Review failed',
  '待派发评审': 'Review not dispatched',
  '待派发独立评审': 'Independent review not dispatched',
  '评审通过 · 待环境测试': 'Review passed · awaiting environment tests',
  '等待独立评审': 'Waiting for independent review',
  '报告已归档': 'Report archived',
  '任务完成': 'Tasks done',
  '并行开发': 'Parallel work',
  '评审门禁': 'Review gate',
  '上下文包': 'Context packs',
  '本机优先': 'Local-first',
  '个流程': 'flows',
  '个成员库': 'repos',
  '个任务': 'tasks',
  '个审核员': 'reviewers',
  '个开发目标': 'development targets',
  '需要你处理': 'need attention',
  '全部开发目标': 'All development targets',
  '有进展，但没有绑定开发会话': 'Progress exists, but no session is bound',
  '开发会话动态（默认收起，避免挤占进度）': 'Session activity (collapsed by default)',
  '展开': 'Expand',
  '收起': 'Collapse',
  '删除流程': 'Delete flow',
  '生成上下文': 'Generate context',
  '同步最新上下文': 'Sync latest context',
  '让工作站规范化': 'Normalize with workstation',
  '流程未结束': 'Flow not complete',
  '先确认文件/范围与追问，再让工作站生成计划。': 'Confirm files/scope and questions before generating a plan.',
  '计划已生成：确认后按计划开工，或点「再调整范围」改完重算。': 'Plan ready: confirm to start, or adjust scope and regenerate.',
  'Enter 发送 · Shift+Enter 换行': 'Enter to send · Shift+Enter for a new line',
  '用一句话补充或纠偏，例如：验收再加一条失败可回滚；顺便把「跑门禁」标成已完成': 'Add a sentence to clarify, e.g. add rollback to acceptance and mark the gate as done',
  '直接说就行：工作站会判断这句话是补台账、发开发会话，还是两者都做。': 'Just say it: the workstation decides whether to update the ledger, the session, or both.',
  '当前流程': 'Current flow',
  '扫描范围': 'Scan scope',
  '候选人': 'Candidates',
  '小提示': 'Tip',
  '新建 · 还没建流程台账': 'New · no flow ledger yet',
  '澄清不会直接改代码；确认计划后才创建流程并开启开发会话。': 'Clarification does not change code; the flow is created only after you approve the plan.',
  '切到其他页面再回来，进度和扫描结果会从本机对话记录恢复。': 'Switch pages and come back; progress and scan results are restored from the local chat log.',
  '为什么问': 'Why we ask',
  '补充说明（可选）': 'Additional notes (optional)',
  '继续补充（再问一轮）': 'Ask another round',
  '直接生成计划': 'Generate plan',
  '这一轮已经提交，可以继续补充，或直接生成计划。': 'This round is submitted. Ask another round or generate the plan.',
  '答案已提交': 'Answer submitted',
  '已提交': 'Submitted',
  '已降级': 'Degraded',
  '本地规则': 'Local rules',
  'DSH 模型': 'DSH model',
  'DSH 对话': 'DSH chat',
  'DSH 扫描': 'DSH scan',
  '本地关键词兜底': 'Local keyword fallback',
  '命中里没有测试文件。这次要不要一起补单测？': 'No test files in the matches. Add unit tests in this flow?',
  '先不补，后面单独做': 'Skip for now; do it separately',
  '一起补单测（推荐）': 'Add unit tests (recommended)',
  '澄清降级为本地规则': 'Clarification fell back to local rules',
  '需求通常很粗：先用 dsh 走一轮澄清（后续可多轮），问准“到底解决什么问题”': 'Requirements are usually rough: clarify first, then plan.',
}

/** 中文词典：中文 key 原样返回，保证 fallback 不丢文案。 */
export const zh = Object.fromEntries(Object.keys(en).map((key) => [key, key]))

let activeT = (key) => key
let activeLocale = 'zh'

export function setActiveLocaleForTest(locale, translate = (key) => key) {
  activeLocale = locale
  activeT = translate
}

export function currentLocale() {
  return activeLocale
}

function translateText(value) {
  if (typeof value !== 'string' || value.length === 0) return value
  if (activeLocale === 'zh') return value
  let translated = value
  try {
    translated = activeT(value)
  } catch {
    translated = value
  }
  if (translated !== value) return translated
  // 常见“静态词 + 数字/名字”的模板：字典只能精确命中整串，这里补一层可预测的模式。
  const status = (text) => ({ '通过': 'passed', '失败': 'failed', '未运行': 'not run', '运行中': 'running' }[text] ?? text)
  const rules = [
    [/^成员 (.+)$/, (_m, name) => `Member ${name}`],
    [/^开发目标（(\d+)）$/, (_m, n) => `Development targets (${n})`],
    [/^开发流程（(\d+)）$/, (_m, n) => `Development flows (${n})`],
    [/^任务 (\d+)\/(\d+)$/, (_m, done, total) => `Tasks ${done}/${total}`],
    [/^任务 (\d+)\/(\d+) · (\d+)%$/, (_m, done, total, pct) => `Tasks ${done}/${total} · ${pct}%`],
    [/^验收 (\d+)\/(\d+)$/, (_m, done, total) => `Acceptance ${done}/${total}`],
    [/^(\d+) 个流程$/, (_m, n) => `${n} flows`],
    [/^(\d+) 个开发目标$/, (_m, n) => `${n} development targets`],
    [/^(\d+) 个成员库$/, (_m, n) => `${n} repositories`],
    [/^本机自测 (.+)$/, (_m, value) => `Local tests ${status(value)}`],
    [/^环境测试 (.+)$/, (_m, value) => `Environment tests ${status(value)}`],
    [/^(\d+) 个任务$/, (_m, n) => `${n} tasks`],
    [/^(\d+) 个审核员$/, (_m, n) => `${n} reviewers`],
    [/^(\d+) 个流程需要你处理$/, (_m, n) => `${n} flows need attention`],
  ]
  for (const [pattern, replacer] of rules) {
    if (pattern.test(value)) return value.replace(pattern, replacer)
  }
  return value
}

function localizeNode(node) {
  if (Array.isArray(node)) return node.map(localizeNode)
  return translateText(node)
}

function localizeProps(props) {
  if (!props || typeof props !== 'object') return props
  const next = { ...props }
  for (const key of ['title', 'placeholder', 'aria-label', 'alt']) {
    if (typeof next[key] === 'string') next[key] = translateText(next[key])
  }
  if (typeof next.label === 'string') next.label = translateText(next.label)
  return next
}

/** 本地化元素工厂：替换组件里的 React createElement，让静态文案命中词典时翻译。 */
export function h(type, props, ...children) {
  const localizedChildren = children.map(localizeNode)
  return reactCreateElement(type, localizeProps(props), ...localizedChildren)
}

/**
 * 语言切换时重新渲染子树：现有组件不逐个订阅 locale，父级重渲染即可让所有
 * 静态文案重新经过 h 工厂；不换 key，避免丢失当前页签/流程状态。
 */
export function LocaleProvider({ ctx, children }) {
  const [, setRevision] = useState(0)
  useEffect(() => {
    try {
      const subscribe = ctx?.locale?.subscribe
      if (typeof subscribe !== 'function') return undefined
      return subscribe(() => setRevision((value) => value + 1))
    } catch {
      // 语言服务不可用时保留中文原文，不影响工作站主体
      return undefined
    }
  }, [ctx])

  let locale = 'zh'
  try {
    locale = ctx?.locale?.getLocale?.().active ?? 'zh'
    activeLocale = locale
    activeT = typeof ctx?.locale?.bind === 'function' ? ctx.locale.bind(LOCALE_NAMESPACE) : (key) => key
  } catch {
    activeLocale = 'zh'
    activeT = (key) => key
  }
  const child = Array.isArray(children) ? children[0] : children
  if (!child) return null
  // 重新克隆但不换 key：保留当前页签/流程状态，只让子树重新经过 h 工厂翻译
  return cloneElement(child)
}
