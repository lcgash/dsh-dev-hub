/**
 * 「本机命令」：用户用一句话描述这台电脑上实际怎么跑，由 dsh agent 整理成
 * 一条可复用的 shell 命令，只保存到 ~/.dsh/dev-hub/profile.json，不提交到仓库。
 *
 * 为什么单独一层：
 * - 项目命令（.dev-hub/project.json）是团队共享的通用做法，提交到代码库；
 * - 但每个人本机可能不同（例如本机用 `kpipe-dev` 做环境部署），写进仓库对别人没意义，
 *   还会覆盖别人的做法。所以本机覆盖单独存放，只影响这台电脑上的测试按钮。
 *
 * 本模块只做纯函数（提示词/归一化/阶段定义），agent 调用与落盘在 Host 半。
 */

export const LOCAL_COMMAND_PHASES = [
  { id: 'localTest', label: '本机自测', hint: '编译 + 单测；跑通后流程进入「验证中」' },
  { id: 'environmentTest', label: '环境测试', hint: '部署到本机环境并验证；跑通后进入「待提交」' },
  { id: 'gate', label: '门禁', hint: '提交前检查；只在本机生效' },
]

/** 允许的本机命令槽位（与项目命令同名，便于覆盖）。 */
export const LOCAL_COMMAND_KEYS = LOCAL_COMMAND_PHASES.map((phase) => phase.id)

/** agent 必须返回的结构：一条命令 + 为什么 + 不确定项。 */
export const LOCAL_COMMAND_SCHEMA = {
  type: 'object',
  properties: {
    command: { type: 'string', description: '一条可直接在仓库根目录执行的 shell 命令' },
    explanation: { type: 'string', description: '这条命令做什么，为什么适合这台机器与这个仓库' },
    caveats: { type: 'array', items: { type: 'string' }, description: '不确定/需要人工确认的点' },
    alternatives: { type: 'array', items: { type: 'string' }, description: '可选的其他写法' },
  },
  required: ['command', 'explanation'],
  additionalProperties: false,
}

export function phaseLabel(id) {
  return LOCAL_COMMAND_PHASES.find((phase) => phase.id === id)?.label ?? '本机自测'
}

/**
 * 生成提示词：把用户原话、项目共享命令、本机环境与已装工具一起交给 agent，
 * 让它先看仓库再给命令，而不是凭空猜。
 */
export function buildLocalCommandPrompt({ description, phase = 'localTest', repoName = '', projectCommands = {}, env = null } = {}) {
  const label = phaseLabel(phase)
  const hint = LOCAL_COMMAND_PHASES.find((entry) => entry.id === phase)?.hint ?? ''
  const tools = Object.keys(env?.tools ?? {}).filter((name) => env.tools[name]?.available).sort()
  const shared = Object.entries(projectCommands ?? {})
    .filter(([, value]) => String(value ?? '').trim())
    .map(([key, value]) => `- ${key}: ${String(value).trim()}`)
  return [
    '你是 DevHub 的「本机命令探测」助手。用户会用一句话描述他在这台电脑上怎么做某个步骤；',
    '你要结合仓库里的脚本与这台机器已安装的工具，整理成一条可复用的 shell 命令。',
    '',
    `仓库：${repoName || '(当前仓库)'}`,
    `阶段：${label}（${hint}）`,
    `本机环境：${env?.os ?? '未知'} ${env?.arch ?? ''} / shell ${env?.shell?.name ?? '未知'}`.trim(),
    tools.length ? `本机可用工具：${tools.join(', ')}` : '本机可用工具：未探测',
    shared.length ? `项目共享命令：\n${shared.join('\n')}` : '项目共享命令：未配置',
    '',
    `用户描述：${String(description ?? '').trim()}`,
    '',
    '要求：',
    '1. 先看仓库（scripts/、package.json、Makefile、README、CI 配置等）和已装工具，再给命令；',
    '2. 只给一条命令，能在仓库根目录直接执行；步骤多就用 && 串起来；',
    '3. 不要编造不存在的脚本或参数；不确定的地方写进 caveats；',
    '4. 命令必须非交互（自动确认/无提示），不能等待人工输入；',
    '5. 只输出 JSON：',
    '{"command":"...","explanation":"...","caveats":["..."],"alternatives":["..."]}',
  ].join('\n')
}

/**
 * 把 agent 返回的命令收敛成一行可执行文本：
 * 去掉 markdown 代码块、行首 `$ `、多余换行（多行时取第一行有效命令）。
 */
export function normalizeLocalCommand(value) {
  let text = String(value ?? '').trim()
  if (!text) return ''
  text = text.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
  const line = text.split('\n').map((entry) => entry.trim()).find(Boolean) ?? ''
  return line.replace(/^\$\s+/, '').slice(0, 500).trim()
}
