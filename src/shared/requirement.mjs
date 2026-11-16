/**
 * 需求规范化：客户原话 ≠ 可执行的开发目标。
 *
 * 工作站必须在建流程前把「客户/用户原始需求」整理成结构化、可执行、可验收的描述：
 *   - goal：做什么 + 为什么（动宾，一两句，不含实现细节）
 *   - rootProblem：现状问题与根因（不允许直接写解决方案）
 *   - background / expected：触发场景与期望的行为变化
 *   - nonGoals / acceptance / scopeHints：边界、可验证验收、范围提示
 *
 * 原始需求（raw）一字不改地保留，只用于追溯与重放，**不能直接当成目标/根因**。
 * 这里的函数都是纯函数，Host 与浏览器半共用；真正调模型由 Host 负责（agent-run）。
 */

/** 需求的来源：界面据此说明"目标是怎么来的"。 */
export const REQUIREMENT_SOURCE_LABEL = {
  clarify: '澄清规范化',
  agent: '工作站规范化',
  manual: '手工填写',
  local: '本地草稿（待规范化）',
}

/** agent 规范化需求的输出契约。 */
export const REQUIREMENT_SCHEMA = {
  type: 'object',
  properties: {
    // 流程标题：工作站概括出来的短标题（不照抄原话/代码），列表与详情都用它
    title: { type: 'string' },
    goal: { type: 'string' },
    rootProblem: { type: 'string' },
    background: { type: 'string' },
    expected: { type: 'string' },
    nonGoals: { type: 'array', items: { type: 'string' } },
    acceptance: { type: 'array', items: { type: 'string' } },
    scopeHints: { type: 'array', items: { type: 'string' } },
    missing: { type: 'array', items: { type: 'string' } },
  },
  required: ['goal', 'rootProblem'],
  additionalProperties: true,
}

const MAX_TEXT = 2000
const SOURCES = ['clarify', 'agent', 'manual', 'local']

function text(value, max = MAX_TEXT) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max)
}

function strList(value, limit = 10, max = 500) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const seen = new Set()
  const out = []
  for (const entry of list) {
    const item = text(entry, max)
    if (!item || seen.has(item)) continue
    seen.add(item)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

/** 归一化到"只比语义"的形态：去空白与标点、大小写。 */
export function squashText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？；、,.!?;:："'“”‘’（）()\[\]【】<>《》\-—_~·]/g, '')
}

/**
 * 原样回填检测：目标/根因是不是把客户原话（或其中一大段）直接抄了一遍。
 * 抄句子本身不能算"总结与规范化"，界面必须继续提示。
 */
export function isRawEcho(value, raw) {
  const a = squashText(value)
  const b = squashText(raw)
  if (!a || !b) return false
  if (a === b) return true
  // 一方完整包含另一方且长度接近（>=80%）：视为原样搬运，而不是真正改写
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 12 && long.includes(short) && short.length / long.length >= 0.8
}

const MAX_TITLE = 40
const TITLE_MAX = 32
const TITLE_FILLER = /^(请|麻烦你?|帮我|帮忙|我想|想要|需要|要|看一下|看看|处理一下|做一下)\s*/
const TITLE_VERB_ANY = /(补充|新增|修复|修改|完善|支持|实现|接入|改造|迁移|重构|优化|拆分|提取|评估|分析|梳理|排查|调整|删除|移除|升级|替换|统一|暴露|扩展|处理|整理|对齐|补齐|合并|补全|接通|打通)/
const TITLE_VERB = /^(补充|补齐|新增|增加|修复|修改|完善|支持|实现|接入|改造|迁移|重构|优化|拆分|提取|评估|分析|梳理|排查|调整|删除|移除|升级|替换|统一|暴露|扩展|处理|整理|对齐|补齐|合并|补全|接通|打通)/

/**
 * 标题是否"还不够像标题"：空、原话搬运、代码片段/注解/文件名/纯标识符。
 * 标题要能概括"这次做什么"，不能拿用户输入的第一行（尤其代码/注解）直接当标题。
 */
export function isWeakTitle(title, description = '') {
  const value = text(title, 200)
  if (!value || value.length < 2) return true
  if (value.includes('\n')) return true
  // 短句原样当标题可以接受（例如「source 补 webhook」）；长句/整段描述才算"没整理"
  if (description && isRawEcho(value, description) && value.length > 24) return true
  // 代码/注解/路径/表达式：这些都不该出现在标题里
  if (/[@{};=<>`+*|\\]|=>/.test(value)) return true
  // 英文函数签名（如 deleteArtVersion(Long)）也不是标题；中文标题里的括号可以保留
  if (!/[\u4e00-\u9fff]/.test(value) && /[()]/.test(value)) return true
  if (/[\w.-]+\.(java|kt|ts|tsx|js|jsx|mjs|cjs|vue|svelte|go|py|rb|rs|sql|yml|yaml|xml|json|md)\b/i.test(value)) return true
  // 纯英文标识符（没有中文）：例如 JsonSubTypes、BuildTriggerStruct
  if (!/[\u4e00-\u9fff]/.test(value) && /^[A-Za-z_$][\w$.-]*$/.test(value)) return true
  return false
}

/** 从描述里挑出"人话"：跳过注解/声明/赋值等代码行。 */
export function extractProse(description) {
  const lines = String(description ?? '').split(/\r?\n/)
  const kept = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (/^[@#{}]/.test(line)) continue
    if (/[{};]\s*$/.test(line)) continue
    if (/^\(?\s*(import|package|public|private|protected|class|interface|enum|def|func|const|let|var|return|if|for|while)\b/.test(line)) continue
    if (/=/.test(line) && !/[\u4e00-\u9fff]/.test(line)) continue
    if (!/[\u4e00-\u9fff]/.test(line) && !/[A-Za-z]{4,}/.test(line)) continue
    kept.push(line)
  }
  return kept.join('。')
}

/** 英文/标识符不砍半：优先在空格处截断，但不能为了空格丢掉太多内容。 */
function trimToTitle(value, max) {
  if (value.length <= max) return value
  const slice = value.slice(0, max + 1)
  const space = slice.lastIndexOf(' ')
  if (space >= Math.ceil(max * 0.8)) return value.slice(0, space)
  return value.slice(0, max)
}

/** 把一句话压成短标题：去客套词/括号补充/代码符号/尾部语气，优先在逗号处截断。 */
function titleFromText(input, description = '') {
  let value = text(input, 400)
  if (!value) return ''
  value = value
    .replace(/（[^）]{0,200}）/g, ' ')
    .replace(/\([^)]{0,200}\)/g, ' ')
    .replace(TITLE_FILLER, '')
    .replace(/一下|一点/g, '')
    .replace(/[<>?=+*{}]/g, ' ')
    .replace(/([\u4e00-\u9fff])([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])([\u4e00-\u9fff])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  let title = value.split(/[。！？!?；;\n]/).map((part) => part.trim()).find(Boolean) ?? ''
  title = title.replace(/^[让使将把]\s*/, '')
  if (title.length > MAX_TITLE) {
    const head = title.split(/[，,、]/).map((part) => part.trim()).find(Boolean) ?? ''
    if (head.length >= 8) title = head
  }
  title = trimToTitle(title, MAX_TITLE)
  title = title.replace(/[，,、。.!！?？:：;；\s]+$/, '').trim()
  title = title.replace(/(的|了|吗|吧|呢|与|和|及|并|或)\s*$/, '').trim()
  if (!title || isWeakTitle(title, description)) return ''
  return title.slice(0, MAX_TITLE)
}

/** 兜底标题：从注解名/类名/散文里拼一个动宾短语（agent 不可用时用）。 */
function fallbackTitle(description, intent = 'feature') {
  const verb = intent === 'bug' ? '修复' : intent === 'analysis' ? '分析' : '完善'
  const annotation = /@([A-Za-z_][\w.$]*)/.exec(String(description ?? ''))
  if (annotation) return `${verb} ${annotation[1]} 注解相关逻辑`.slice(0, MAX_TITLE)
  const className = /\b([A-Z][A-Za-z0-9_]{2,})\b/.exec(String(description ?? ''))
  if (className) return `${verb} ${className[1]} 相关逻辑`.slice(0, MAX_TITLE)
  return `${verb}一个代码改动`
}

/**
 * 生成/挑选流程标题，优先级：
 * 澄清 agent 的标题 → 规范化目标 → 描述里的"人话" → 兜底（注解名/类名）。
 * 空值/原话/代码片段一律视为不可用。
 */
export function suggestFlowTitle({ description, spec, goal, intent, fallback } = {}) {
  const raw = text(description, 4000)
  const value = spec && typeof spec === 'object' ? spec : {}
  const explicit = text(value.title, MAX_TITLE)
  if (explicit && !isWeakTitle(explicit, raw)) return explicit
  const target = text(goal) || strList(value.goals, 4)[0] || text(value.problem)
  const fromGoal = titleFromText(target, raw)
  if (fromGoal) return fromGoal
  const fromProse = titleFromText(extractProse(raw), raw)
  // 散文里没提到"做什么"（例如只有现象描述）时，宁可用注解名/类名兜底
  if (fromProse && TITLE_VERB_ANY.test(fromProse)) return fromProse
  const fb = text(fallback, MAX_TITLE)
  if (fb && !isWeakTitle(fb, raw)) return fb
  return fallbackTitle(raw, intent)
}

function answerLines(answers) {
  const rows = []
  for (const [id, value] of Object.entries(answers ?? {})) {
    const resolved = typeof value === 'string'
      ? value
      : [value?.selected?.join?.('、'), value?.custom].filter(Boolean).join('；')
    const line = text(resolved, 300)
    if (line) rows.push(`- ${id}：${line}`)
  }
  return rows.join('\n') || '（没有已确认的追问答案）'
}

/**
 * 给 agent 的需求规范化指令。
 * 输入是客户原话 + 已有澄清规格 + 追问答案 + 仓库探测证据；输出一份可执行的需求说明。
 */
export function buildRequirementPrompt({ description, spec, answers, recon, title } = {}) {
  const value = spec && typeof spec === 'object' ? spec : {}
  const files = (recon?.files ?? []).slice(0, 8)
  const candidateFiles = files.length
    ? files.map((file) => `- ${file?.path ?? ''}${file?.why ? `（${file.why}）` : ''}`).join('\n')
    : '（没有探测到明确相关文件）'
  return [
    '你是「DevHub 开发工作站」的需求规范化助手。',
    '客户/用户的原话只是问题线索，**不能直接当开发目标**：照抄原话等于没整理，视为不合格。',
    '请把它整理成一份可执行、可验收的需求说明，供后续开发会话直接使用。',
    '',
    `【流程标题】${text(title, 80) || '（未命名）'}`,
    '',
    '【客户原始需求（原话，禁止逐字照抄）】',
    text(description, 4000) || '（空）',
    '',
    '【已有澄清规格（可能不完整，可信）】',
    `问题：${text(value.problem) || '（未确认）'}`,
    `目标：${strList(value.goals, 8).join('；') || '（未确认）'}`,
    `背景：${text(value.background) || '（未确认）'}`,
    `期望行为：${text(value.expected) || '（未确认）'}`,
    `非目标：${strList(value.nonGoals, 8).join('；') || '（未确认）'}`,
    `验收：${strList(value.acceptance, 8).join('；') || '（未确认）'}`,
    `范围：${strList(value.scope, 8).join('、') || '（未确认）'}`,
    '',
    '【已确认的追问答案】',
    answerLines(answers),
    '',
    '【仓库探测证据（只用于判断边界，不要替用户下结论）】',
    candidateFiles,
    '',
    '规则：',
    '0. `title`：给这个流程起一个 10~20 字的短标题（动宾短语，概括这次改动的主体与动作）；不得逐字照抄原话/代码/注解/文件名，不要标点、不要“需求/功能”这类空词。',
    '1. `goal`：动宾结构的一到两句，写清「做什么 + 为什么」；不得与原始需求逐字相同，不写实现方案，不罗列文件名。',
    '2. `rootProblem`：现状问题与根因（现象 → 为什么会这样），禁止写解决方案；不得与原始需求逐字相同。',
    '3. `background`：谁、在什么场景下、遇到什么问题；`expected`：期望发生的行为变化。',
    '4. `acceptance`：可验证的验收标准（最多 6 条）；信息不足就留空并写进 `missing`，不要编造。',
    '5. 非目标与范围只写明确提到或可由证据确定的；不确定的写进 `missing`。',
    '6. 只输出 JSON，不要 Markdown：',
    '{"title":"...","goal":"...","rootProblem":"...","background":"...","expected":"...","nonGoals":["..."],"acceptance":["..."],"scopeHints":["..."],"missing":["..."]}',
  ].join('\n')
}

/**
 * 从「澄清规格」派生需求记录；没有规格时给出本地草稿（明确标记待规范化）。
 * 本地兜底不假装总结过：它保留原话并让界面提示"还没规范化"。
 */
export function deriveRequirement({ description, spec, answers, title } = {}) {
  const raw = text(description, 4000)
  const value = spec && typeof spec === 'object' ? spec : {}
  const problem = text(value.problem)
  const goals = strList(value.goals, 8)
  const hasSpec = Boolean(problem || goals.length)
  const goal = goals.length ? goals.join('；') : (problem || raw)
  const rootProblem = problem || raw
  const echo = isRawEcho(goal, raw) || isRawEcho(rootProblem, raw)
  return normalizeRequirementRecord({
    raw,
    goal,
    rootProblem,
    // 标题也一起整理：不能拿用户输入的第一行（代码/注解）直接当标题
    title: suggestFlowTitle({ description: raw, spec: value, goal }),
    background: text(value.background),
    expected: text(value.expected),
    nonGoals: value.nonGoals,
    acceptance: value.acceptance,
    scopeHints: value.scope,
    source: hasSpec ? 'clarify' : 'local',
    // 只有"澄清过、且目标/根因不是原话"才算规范化过
    needsReview: !hasSpec || echo,
    missing: hasSpec
      ? strList(value.missing, 8)
      : ['目标与根因还是客户原话，没经过工作站规范化'],
  }, { description: raw })
}

/** 把任意来源的需求记录收敛成稳定形状（存台账/过接口都用它）。 */
export function normalizeRequirementRecord(raw, { description = '' } = {}) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const rawText = text(value.raw, 4000) || text(description, 4000)
  const goal = text(value.goal)
  const rootProblem = text(value.rootProblem)
  const echo = Boolean(rawText) && (
    !goal
    || !rootProblem
    || isRawEcho(goal, rawText)
    || isRawEcho(rootProblem, rawText)
  )
  const source = SOURCES.includes(value.source) ? value.source : 'local'
  const needsReview = echo || value.needsReview === true
  const missing = strList(value.missing, 8)
  // agent 可能把原话/代码当标题：这种标题不采用，交给调用方重新生成
  const generatedTitle = text(value.title, MAX_TITLE)
  const title = generatedTitle && !isWeakTitle(generatedTitle, rawText) ? generatedTitle : ''
  return {
    raw: rawText,
    goal: goal || rawText,
    rootProblem: rootProblem || rawText,
    background: text(value.background),
    expected: text(value.expected),
    nonGoals: strList(value.nonGoals, 8),
    acceptance: strList(value.acceptance, 12),
    scopeHints: strList(value.scopeHints, 10),
    source,
    needsReview,
    missing: missing.length || !needsReview ? missing : ['目标/根因还没经过工作站规范化'],
    ...(value.degraded ? { degraded: true, reason: text(value.reason, 300) } : {}),
    normalizedAt: value.normalizedAt || null,
    ...(title ? { title } : {}),
  }
}

/** 界面用的一句话状态（来源 + 是否已规范化）。 */
export function requirementStatusLabel(record) {
  if (!record || typeof record !== 'object') return '未规范化'
  const source = REQUIREMENT_SOURCE_LABEL[record.source] ?? '未规范化'
  return record.needsReview ? `${source} · 待规范化` : source
}
