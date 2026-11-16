/**
 * 开发会话「卡在提问」：找出会话里尚未回答的 ask_user_question，并允许在工作站内直接回答。
 *
 * 背景：DSH 的 ask_user_question 会阻塞等待用户；如果人不在会话页，流程就卡住不动。
 * 工作站把待答问题捞出来、就地作答，开发会话才能继续。
 *
 * 只读事实 + 一个动作：
 * - 待答：扫描会话事件里"最后一个 ask_user_question 的 tool/call 没有对应 tool/result"；
 * - 作答：`ctx.userQuestions.answer(liveRootAgent, callId, answer)`（必须是该会话的活根 agent）。
 */

const ASK_TOOL = 'ask_user_question'
const MAX_SCAN = 400

function parseArguments(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

function normalizeQuestions(payload) {
  const questions = Array.isArray(payload?.questions) ? payload.questions : []
  return questions.map((question, index) => ({
    id: String(question?.id ?? `q${index + 1}`),
    question: String(question?.question ?? '').trim(),
    detail: String(question?.detail ?? '').trim() || null,
    header: String(question?.header ?? '').trim() || null,
    multiSelect: Boolean(question?.multiSelect),
    options: (Array.isArray(question?.options) ? question.options : []).map((option) => ({
      label: String(option?.label ?? '').trim(),
      description: String(option?.description ?? '').trim() || null,
    })).filter((option) => option.label),
  })).filter((question) => question.question)
}

/**
 * 读一条会话当前待回答的问题。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} sessionId
 */
export function readPendingQuestions(ctx, sessionId) {
  const id = String(sessionId ?? '').trim()
  if (!id) return { sessionId: null, pending: [], reason: '未绑定会话' }
  const sessions = ctx.get('sessions')
  const session = sessions?.get?.(id) ?? null
  if (!session) return { sessionId: id, pending: [], reason: '会话不在当前进程中（可能已结束）' }

  let events = []
  try {
    events = session.snapshotEvents().slice(-MAX_SCAN)
  } catch (error) {
    return { sessionId: id, pending: [], reason: `读取会话事件失败：${String(error?.message ?? error)}` }
  }

  // 最近的 tool/call 与 tool/result 配对，找出仍挂着的 ask_user_question
  const calls = new Map()
  const results = new Set()
  for (const event of events) {
    if (event?.type === 'tool/call' && event.data?.name === ASK_TOOL) {
      calls.set(String(event.data.callId), {
        callId: String(event.data.callId),
        arguments: event.data.arguments,
        askedAt: event.time ?? null,
      })
    } else if (event?.type === 'tool/result') {
      results.add(String(event.data?.message?.toolCallId ?? event.data?.callId ?? ''))
    }
  }

  // 只有 timed ask 在 projection 里有 open/continued 状态；blocking legacy 提问不在其中，
  // 一律视为 open：前台阻塞提问只能由会话页的 answerer 回答，工作站 Remote answer 会返回 false。
  const agent = ctx.get('agents')?.get?.(id) ?? null
  let active = []
  try {
    active = ctx.get('sessionProjections')?.stateOf?.(agent?.session, 'userQuestions')?.questions?.active ?? []
  } catch {
    active = []
  }
  const projected = new Map(active.map((question) => [String(question?.callId ?? ''), question]))
  const pending = []
  for (const [callId, call] of calls) {
    if (results.has(callId)) continue
    const projection = projected.get(callId) ?? null
    const payload = parseArguments(call.arguments)
    const questions = normalizeQuestions(projection?.questions ? { questions: projection.questions } : payload)
    const state = projection?.state === 'continued' ? 'continued' : 'open'
    pending.push({
      callId,
      questions,
      askedAt: call.askedAt,
      state,
      answerable: state === 'continued',
    })
  }
  pending.sort((a, b) => Number(a.askedAt ?? 0) - Number(b.askedAt ?? 0))
  return { sessionId: id, pending, reason: null }
}

/**
 * 回答一个待答问题。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} sessionId
 * @param {string} callId
 * @param {Array<{ id: string, selected: string[], custom?: string }>} answers
 */
export async function answerPendingQuestion(ctx, sessionId, callId, answers) {
  const id = String(sessionId ?? '').trim()
  if (!id || !callId) throw new Error('缺少会话或问题标识')
  const agents = ctx.get('agents')
  const agent = agents?.get?.(id)
  if (!agent) throw new Error('会话不在当前进程中：无法作答（可在会话页打开后重试）')
  const userQuestions = ctx.get('userQuestions')
  if (!userQuestions?.answer) throw new Error('当前 DSH 不支持在工作站内回答提问')
  // open 提问的前台 waterfall 只接受会话页 answerer；Remote answer 只对 continued 生效
  const current = readPendingQuestions(ctx, id).pending.find((entry) => entry.callId === String(callId))
  if (current && current.answerable === false) {
    throw new Error('这个提问正在会话前台等待选择，工作站不能代答；请到会话页点选（或等超时后在工作站回答）')
  }
  const accepted = userQuestions.answer(agent, callId, { answers })
  return { accepted: Boolean(accepted) }
}

const APPROVAL_RE = /approval|authoriz|permission|consent/i
const PENDING_RE = /request|ask|begin|prompt|waiting|required/i
const SETTLE_RE = /settle|result|answer|approve|reject|decid|resolve|cancel|complete|end/i

/**
 * 会话里"在等你授权/审批"的请求（OAuth 登录、工具授权、权限确认等）。
 *
 * 这类请求由 Web 端的 answerer 处理，Host 插件没有直接放行的 API，所以这里只做**只读发现**：
 * 把请求内容捞出来、显示在流程上，并给出"去会话处理"的入口 —— 比藏在对话里强。
 */
export function readPendingApprovals(ctx, sessionId, { limit = 4 } = {}) {
  const id = String(sessionId ?? '').trim()
  if (!id) return { sessionId: null, approvals: [], reason: '未绑定会话' }
  const session = ctx.get('sessions')?.get?.(id) ?? null
  if (!session) return { sessionId: id, approvals: [], reason: '会话不在当前进程中（可能已结束）' }

  let events = []
  try {
    events = session.snapshotEvents().slice(-800)
  } catch (error) {
    return { sessionId: id, approvals: [], reason: `读取会话事件失败：${String(error?.message ?? error)}` }
  }

  const open = new Map()
  for (const event of events) {
    const type = String(event?.type ?? '')
    if (!APPROVAL_RE.test(type)) continue
    const data = event?.data ?? {}
    // approval/asked 与 approval/decided 用同一个 id 配对；callId 只在部分事件里出现，不能优先
    const key = String(data.id ?? data.callId ?? data.requestId ?? type)
    if (SETTLE_RE.test(type) && !PENDING_RE.test(type)) {
      // 不同事件可能只带 id / callId / requestId 之一：都清一遍，避免残留等待卡片
      for (const alias of [data.id, data.callId, data.requestId]) {
        if (alias) open.delete(String(alias))
      }
      open.delete(key)
      continue
    }
    if (!PENDING_RE.test(type)) continue
    const title = String(
      data.title ?? data.name ?? data.subject?.name ?? data.toolName ?? data.kind ?? data.label ?? '需要授权',
    ).trim().slice(0, 120)
    const detail = String(
      data.detail ?? data.message ?? data.reason ?? data.description ?? data.prompt ?? '',
    ).replace(/\s+/g, ' ').trim().slice(0, 240)
    open.set(key, { id: key, type, title, detail, at: event?.time ?? null })
  }

  const approvals = [...open.values()].sort((a, b) => Number(a.at ?? 0) - Number(b.at ?? 0)).slice(-limit)
  return { sessionId: id, approvals, reason: null }
}
