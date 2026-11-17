import { draftFromDescription } from '../shared/slug.mjs'

/**
 * 「聊天式开发入口」的纯逻辑：不依赖 React，也不直接发请求。
 * 组件把 `api()` / `launchDevSession` 包成 deps 传进来，因此这里可以单测。
 *
 * 流程（2026-11 起：用户只写一句话，工程量和计划都由工作站自评）：
 *   用户说「我要做什么」
 *     -> probe：工作站自己扫一遍仓库（POST /api/dev-hub/recon）
 *     -> 工作站追问（最多 4 问，可跳过）+ 用户勾选文件与范围
 *     -> plan：工作站出开发计划（步骤/验收/风险/规模/人天），POST /api/dev-hub/plan
 *     -> 用户确认计划
 *     -> confirm：首次先落规范 -> 建流程（带计划与问答）-> 记 baseline -> 开启开发会话
 */

/** 工作站一次最多追问几个：问多了用户会烦，答案也只影响计划细节。 */
export const MAX_QUESTIONS = 4

export const PHASE = {
  idle: 'idle',
  analyzing: 'analyzing',
  // 探测结果与追问确认中（用户勾文件/范围、回答追问）
  confirm: 'confirm',
  // 正在向 Host 要计划
  planning: 'planning',
  // 计划已生成，等用户确认开工
  plan: 'plan',
  creating: 'creating',
  done: 'done',
}

let messageSeq = 0

/** 构造一条对话消息（id 单调递增，React 列表 key 用）。 */
export function message(role, kind, payload = {}) {
  messageSeq += 1
  return { id: `m${messageSeq}`, at: new Date().toISOString(), role, kind, ...payload }
}

export function userMessage(text, attachments = []) {
  const list = Array.isArray(attachments) ? attachments.filter(Boolean) : []
  return message('user', 'text', {
    text: String(text ?? '').trim(),
    ...(list.length ? { attachments: list } : {}),
  })
}

export function stationMessage(text, extra = {}) {
  return message('workstation', 'text', { text: String(text ?? '').trim(), ...extra })
}

/** 探测结果的对话卡片（用户要在这一步二次确认）。 */
export function reconMessage(recon, draft) {
  return message('workstation', 'recon', { recon, draft })
}

/**
 * 工作站追问卡片。questions 原样来自 recon.questions：
 * `[{ id, question, why, kind: 'choice'|'text', options?: [{ id, label, value }] }]`
 */
/**
 * 需求澄清卡片：一轮追问（agent 产出的问题）+ 当前规格。
 * `{ round, reply, questions, spec, ready, missing, engine }`
 */
export function clarifyMessage(payload) {
  return message('workstation', 'clarify', {
    round: payload.round ?? 1,
    reply: payload.reply ?? '',
    questions: Array.isArray(payload.questions) ? payload.questions : [],
    spec: payload.spec ?? {},
    ready: Boolean(payload.ready),
    missing: Array.isArray(payload.missing) ? payload.missing : [],
    engine: payload.engine ?? 'dsh',
    degraded: Boolean(payload.degraded),
  })
}

export function questionsMessage(questions, extra = {}) {
  return message('workstation', 'questions', {
    questions: Array.isArray(questions) ? questions.slice(0, MAX_QUESTIONS) : [],
    ...extra,
  })
}

/**
 * 计划卡片。plan 原样来自 Host 的 /api/dev-hub/plan：
 * `{ summary, steps, acceptance, risks, estimate, modules }`
 */
export function planMessage(plan, extra = {}) {
  return message('workstation', 'plan', { plan, ...extra })
}

/** 一句话概括探测结果，先给用户一个结论，再展开细节。 */
export function summarizeRecon(recon) {
  if (!recon) return '没探测到相关内容。'
  const files = recon.files?.length ?? 0
  if (!files) {
    return recon.truncated
      ? `扫描了 ${recon.scanned} 个文件（已截断），没找到明确相关的位置。可以把要做什么写得更具体，或直接手动指定目录。`
      : `扫描了 ${recon.scanned} 个文件，没找到明确相关的位置。可以补充关键词，或直接指定目录。`
  }
  const modules = (recon.modules ?? []).map((entry) => entry.name).filter(Boolean).slice(0, 4)
  const summary = [
    `扫了 ${recon.scanned} 个文件`,
    `命中 ${files} 个候选`,
    modules.length ? `集中在 ${modules.join('、')}` : '',
  ].filter(Boolean).join('，') + '。'
  return summary + '下面是可能要改的文件与命中行，确认后我再建流程并开启开发会话。'
}

/** 探测：只调一个接口，失败向上抛，由界面渲染成工作站消息。 */
export async function probeCode(deps, description, { attachments = [], repoPath = null } = {}) {
  const text = String(description ?? '').trim()
  const list = Array.isArray(attachments) ? attachments.filter(Boolean) : []
  // 只贴图/文件、文字很短时也允许扫描：附件本身就是需求输入
  if (text.length < 4 && !list.length) throw new Error('再多写一点：至少一句话说明要做什么')
  const recon = await deps.recon(text, { attachments: list, repoPath })
  return { description: text, recon, draft: draftFromDescription(text), attachments: list }
}

/** 置信度的中文说法（低/中/高），未知值不把英文枚举直接抛给用户。 */
export const CONFIDENCE_TEXT = { low: '低', medium: '中', high: '高' }

export function confidenceText(confidence) {
  return CONFIDENCE_TEXT[confidence] ?? '未知'
}

/**
 * 自评工程量的标题行：`规模 M · 2 人日 · 置信度：中`。
 * 这些数字只来自 Host 的 estimateWork，界面上永远是只读结果，不是输入项。
 */
export function estimateSummary(estimate) {
  if (!estimate || !estimate.size) return '工程量：工作站暂未给出自评'
  const days = Number(estimate.days)
  const dayText = Number.isFinite(days) ? `${days} 人日` : '人日未知'
  return `规模 ${estimate.size} · ${dayText} · 置信度：${confidenceText(estimate.confidence)}`
}

/** 计划的一句话摘要，用于计划卡片前面的工作站消息。 */
export function summarizePlan(plan) {
  if (!plan) return ''
  const steps = Array.isArray(plan.steps) ? plan.steps.length : 0
  const estimate = plan.estimate ?? {}
  const days = Number(estimate.days)
  const scale = estimate.size ? `规模 ${estimate.size}` : '规模未知'
  const dayText = Number.isFinite(days) ? `${days} 人日` : '人日未知'
  return `工作站出了计划：${steps} 步 · ${scale} / ${dayText}（工作站自评，可调整范围后重算）`
}

/**
 * 把追问整理成可写进台账的澄清记录：`[{ id, question, answer, answeredAt }]`。
 * 答案可能是字符串（选择题的 value）或对象（如 `{ mode:'only', module:'source' }`），
 * 对象按 JSON 存证 —— 与 Host 的 core/questions.answeredQuestions 保持同一形状。
 *
 * 也接受“已经是答复记录”的入参（含 answer 字段），方便调用方二次透传；没有答案的问题直接跳过。
 */
export function answeredQuestions(questions, answers) {
  const out = []
  const list = Array.isArray(questions) ? questions : []
  list.forEach((question, index) => {
    if (!question || typeof question !== 'object') return
    const id = String(question.id ?? question.key ?? `q${index + 1}`).trim() || `q${index + 1}`
    const raw = question.answer !== undefined && question.answer !== null
      ? question.answer
      : answers?.[id] ?? answers?.[question.id]
    if (raw === undefined || raw === null) return
    const answer = typeof raw === 'string' ? raw.trim() : JSON.stringify(raw)
    if (!answer) return
    out.push({
      id,
      question: String(question.question ?? question.text ?? '').trim(),
      answer,
      answeredAt: question.answeredAt || new Date().toISOString(),
    })
  })
  return out
}

/**
 * 生成计划：工作站自己出步骤/验收/风险/工程量（用户不填规模与人天）。
 * deps.plan(payload) -> WorkPlan；失败向上抛，由界面渲染成中文工作站消息。
 */
export async function generatePlan(deps, input = {}) {
  const description = String(input.description ?? '').trim()
  if (description.length < 4) throw new Error('再多写一点：至少一句话说明要做什么')
  if (typeof deps?.plan !== 'function') throw new Error('当前版本缺少计划接口，请升级工作站插件后再试')
  const scope = Array.isArray(input.scope) ? input.scope.filter(Boolean) : []
  if (!scope.length) throw new Error('至少要保留一个目录或模块，否则并行冲突没法判定')
  const answers = input.answers && typeof input.answers === 'object' ? input.answers : {}
  const spec = input.spec && typeof input.spec === 'object' ? input.spec : null
  const plan = await deps.plan({
    description,
    // 只送用户二次确认过的文件：没勾的文件不参与计划与工程量自评
    recon: {
      tokens: Array.isArray(input.recon?.tokens) ? input.recon.tokens : [],
      files: Array.isArray(input.recon?.files) ? input.recon.files : [],
    },
    scope,
    answers,
    // 澄清过的规格：计划摘要要用规范化后的目标，不能拿客户原话当摘要
    ...(spec ? { spec } : {}),
  })
  if (!plan || typeof plan !== 'object') throw new Error('工作站没有返回开发计划')
  if (!Array.isArray(plan.steps) || !plan.steps.length) {
    throw new Error('工作站返回的计划没有步骤，先别开工；补充描述或调整范围后重试')
  }
  return plan
}

/**
 * 把计划整理成 Host 建流程时接受的 `plan` 形状（summary/steps/acceptance/estimate）。
 * 没有可用字段时返回 null —— 老调用方不带计划，建流程保持旧行为。
 */
function planPayloadOf(plan = {}) {
  const payload = {}
  if (plan.summary) payload.summary = String(plan.summary)
  if (Array.isArray(plan.steps) && plan.steps.length) payload.steps = plan.steps
  if (Array.isArray(plan.acceptance) && plan.acceptance.length) payload.acceptance = plan.acceptance
  if (plan.estimate && typeof plan.estimate === 'object') payload.estimate = plan.estimate
  return Object.keys(payload).length ? payload : null
}

/**
 * 二次确认之后：首次落规范 -> 建流程（带确认过的文件与范围、计划、追问答案）-> 记 baseline -> 开启开发会话。
 * 返回新增的工作站消息与结果，调用方负责把它们追加到对话里。
 *
 * plan 新增字段（都可选，不传就完全按旧行为）：
 *   summary / steps / acceptance / estimate  —— 工作站自评计划
 *   questions（原始追问定义，或已答复记录）/ answers（{ [questionId]: value }）
 */
export async function confirmAndStart(deps, plan) {
  const messages = []
  const description = String(plan.description ?? '').trim()
  const draft = plan.draft ?? draftFromDescription(description)
  // 标题优先用澄清阶段概括出来的短标题；用户输入的第一行（常常是代码/注解）只作最后兜底
  const name = String(plan.title ?? '').trim() || String(plan.name ?? '').trim() || draft.name || '未命名流程'
  const id = String(plan.id ?? '').trim() || draft.id
  const scope = Array.isArray(plan.scope) ? plan.scope.filter(Boolean) : []
  if (!scope.length) throw new Error('至少要保留一个目录或模块，否则并行冲突没法判定')

  const planPayload = planPayloadOf(plan)
  const answered = answeredQuestions(plan.questions, plan.answers)

  if (plan.firstRun) {
    const boot = await deps.bootstrap()
    const count = boot?.summary?.constraints ?? boot?.conventions?.constraints?.length
    messages.push(stationMessage(`这个仓库是首次开发，已按默认规范生成 .dev-hub/conventions.json${count ? `（${count} 条约束）` : ''}。`))
  }

  const created = await deps.create({
    description,
    name,
    ...(plan.title ? { title: String(plan.title) } : {}),
    id,
    // 目标/根因只接受工作站规范化后的表述（澄清规格或用户明确写的）；
    // 不再用 `|| description` 把客户原话直接当目标 —— 那等于没整理。
    ...(plan.goal ? { goal: String(plan.goal) } : {}),
    ...(plan.rootProblem ? { rootProblem: String(plan.rootProblem) } : {}),
    ...(plan.spec && typeof plan.spec === 'object' ? { spec: plan.spec } : {}),
    // 告诉 Host 这是聊天式入口：计划/技术文档/验收按默认值带入，门禁按 chat 分支校验
    entry: 'chat',
    // 用户随需求提供的截图/文件：随流程入库，Context Pack 会带上路径
    ...(Array.isArray(plan.attachments) && plan.attachments.length ? { attachments: plan.attachments } : {}),
    // 结构化答案随流程入库：可复现性（repro）与跨机对比都依赖它
    answers: plan.answers ?? {},
    scope,
    recon: {
      at: new Date().toISOString(),
      description,
      tokens: plan.recon?.tokens ?? [],
      files: plan.recon?.files ?? [],
      scanSessionId: plan.recon?.scanSessionId ?? null,
    },
    // 需求关联的澄清子代理（评审/开发会话由 Host 另外写）
    clarifySessionId: plan.clarifySessionId ?? null,
    // 工作站自评的计划：只透传 Host 认可的字段；没计划就不带，避免把空计划写进台账
    ...(planPayload ? { plan: planPayload } : {}),
    // 追问兜底：用户全跳过时不带该字段（Host 会按自己的默认问题兜底）
    ...(answered.length ? { questions: answered } : {}),
  })
  const item = created?.item ?? null
  if (!item?.id) throw new Error('Host 没有返回流程 id，创建可能没成功')
  messages.push(stationMessage(`已建立开发流程「${item.title ?? name}」（${item.id}）${created?.parallel?.canParallel === false ? '；注意：与进行中的流程 scope 有重叠，建议串行。' : ''}`))

  // 开工前同步：先 fetch + ff-only 合并，worktree 从最新 HEAD 创建，减少后续合并工作
  if (plan.syncBeforeStart !== false && typeof deps.sync === 'function') {
    try {
      const synced = await deps.sync(item.id)
      const rows = Array.isArray(synced?.repos) ? synced.repos : []
      const updated = rows.filter((row) => row?.updated)
      messages.push(stationMessage(updated.length
        ? `开工前已同步 ${updated.length} 个仓库：${updated.map((row) => `${row.name} ${row.before ?? '?'} → ${row.after ?? '?'}`).join('、')}`
        : '开工前检查：当前代码已是最新。'))
    } catch (error) {
      // 同步失败不阻断开工，但必须说明将按当前 HEAD 继续
      messages.push(stationMessage(`开工前同步失败：${String(error?.message ?? error)}；继续按当前 HEAD 开工（可稍后在详情页重试「拉取代码」）。`, { tone: 'warn' }))
    }
  }

  const started = await deps.start(item.id)
  messages.push(stationMessage('已记录 baseline，并按规范 + 目标文件生成了 Context Pack。'))
  if (started?.worktree) {
    messages.push(stationMessage(`已创建独立工作区：${started.worktree.path}（分支 ${started.worktree.branch}）；本流程的改动、测试与提交都在这里。`))
  } else if (Array.isArray(started?.workspaceWorktrees) && started.workspaceWorktrees.length) {
    messages.push(stationMessage(`已为 ${started.workspaceWorktrees.length} 个成员库创建独立工作区：${started.workspaceWorktrees.map((entry) => `${entry.name}@${entry.branch}`).join('、')}。`))
  }

  const launched = await deps.launch({
    cwd: started?.workRoot ?? plan.cwd,
    prompt: deps.prompt(started?.context?.prompt, started?.item ?? item),
  })
  messages.push(stationMessage(launched?.sent
    ? `已开启开发会话 ${launched.sessionId}：约束、目标文件与命中行已发给它，开发在那个会话里继续。`
    : '已开启新会话并把上下文放进输入框（当前版本不支持自动发送），确认后按发送即可开始。'))

  return { messages, item, sessionId: launched?.sessionId ?? null, sent: Boolean(launched?.sent) }
}
