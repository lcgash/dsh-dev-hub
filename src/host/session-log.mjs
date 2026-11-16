/**
 * 读一条开发会话的最近对话，供工作站内嵌展示（不用跳到会话页）。
 *
 * 只做只读投影：从 Session.deriveMessages() 拿到的消息里取文本/工具名，
 * 按 role 压平成一行行，界面直接渲染。会话不在当前进程时明确返回原因。
 */

const DEFAULT_LIMIT = 30
const TEXT_MAX = 600

function textOnly(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => (block?.type === 'text' ? String(block.text ?? '') : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function textOfContent(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'text' && block.text) parts.push(String(block.text))
    else if (block.type === 'tool-call') parts.push(`[调用工具] ${block.name ?? 'unknown'}`)
    else if (block.type === 'image') parts.push('[图片]')
    else if (block.type === 'file') parts.push('[文件]')
  }
  return parts.join('\n').trim()
}

const ROLE_TEXT = { user: '你', assistant: '助手', tool: '工具', developer: '开发', system: '系统' }

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} sessionId
 * @param {{ limit?: number }} [options]
 */
export function sessionLog(ctx, sessionId, { limit = DEFAULT_LIMIT } = {}) {
  const id = String(sessionId ?? '').trim()
  if (!id) return { sessionId: null, alive: false, messages: [], reason: '未绑定会话' }
  const sessions = ctx.get('sessions')
  const agents = ctx.get('agents')
  const session = sessions?.get?.(id) ?? null
  const alive = Boolean(agents?.get?.(id)) || Boolean(session)
  if (!session) {
    return {
      sessionId: id,
      alive,
      messages: [],
      reason: alive ? '会话已注册但未加载消息' : '会话不在当前进程中（可能已结束或被清理）',
    }
  }

  let messages = []
  try {
    messages = session.deriveMessages() ?? []
  } catch (error) {
    return { sessionId: id, alive, messages: [], reason: `读取会话消息失败：${String(error?.message ?? error)}` }
  }

  const rows = []
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue
    const text = textOfContent(message.content)
    if (!text) continue
    rows.push({
      role: message.role ?? 'unknown',
      roleLabel: ROLE_TEXT[message.role] ?? message.role ?? '未知',
      text: text.length > TEXT_MAX ? text.slice(0, TEXT_MAX) + '…' : text,
    })
  }

  return {
    sessionId: id,
    alive,
    total: rows.length,
    messages: rows.slice(-limit),
    truncated: rows.length > limit,
    reason: null,
  }
}


/**
 * 会话时间线：用户在干什么、助手说了什么、**调用了哪些工具**（工作站要能看懂"正在做什么"）。
 * 只读事件投影；拿不到会话时明确返回原因。
 *
 * items: [{ kind:'user'|'assistant'|'tool', text?, name?, brief?, status?, at? }]
 */
export function sessionTimeline(ctx, sessionId, { limit = 60 } = {}) {
  const id = String(sessionId ?? '').trim()
  if (!id) return { sessionId: null, alive: false, items: [], reason: '未绑定会话' }
  const sessions = ctx.get('sessions')
  const agents = ctx.get('agents')
  const session = sessions?.get?.(id) ?? null
  const alive = Boolean(agents?.get?.(id)) || Boolean(session)
  if (!session) {
    return { sessionId: id, alive, items: [], reason: alive ? '会话已注册但未加载事件' : '会话不在当前进程中（可能已结束或被清理）' }
  }

  let events = []
  try {
    events = session.snapshotEvents?.() ?? []
  } catch (error) {
    return { sessionId: id, alive, items: [], reason: `读取会话事件失败：${String(error?.message ?? error)}` }
  }

  const items = []
  const pendingTools = new Map()
  const briefOf = (args) => {
    if (!args || typeof args !== 'object') return ''
    const pick = ['command', 'path', 'file_path', 'pattern', 'query', 'url', 'description', 'sessionId']
    for (const key of pick) {
      const value = args[key]
      if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120)
    }
    const first = Object.entries(args).find(([, value]) => typeof value === 'string' && value.trim())
    return first ? String(first[1]).slice(0, 120) : ''
  }

  for (const event of events.slice(-600)) {
    const at = event?.time ?? null
    if (event?.type === 'user/message') {
      const text = textOfContent(event?.data?.message?.content)
      if (text) items.push({ kind: 'user', text: text.slice(0, 800), at })
      continue
    }
    if (event?.type === 'assistant/message') {
      const text = textOnly(event?.data?.message?.content)
      if (text) items.push({ kind: 'assistant', text: text.slice(0, 1200), at })
      continue
    }
    if (event?.type === 'job/settled') {
      const data = event?.data ?? {}
      const label = String(data.label ?? '').trim()
      items.push({
        kind: 'tool',
        name: String(data.kind ?? 'job'),
        brief: label.slice(0, 140),
        status: data.status && /error|fail/i.test(String(data.status)) ? 'error' : 'ok',
        at,
      })
      continue
    }
    if (event?.type === 'tool/call') {
      const callId = String(event?.data?.callId ?? '')
      const args = event?.data?.arguments ?? event?.data?.args ?? event?.data?.input ?? event?.data?.parameters
      const item = {
        kind: 'tool',
        name: String(event?.data?.name ?? 'tool'),
        brief: briefOf(args),
        status: 'running',
        at,
      }
      if (callId) pendingTools.set(callId, item)
      items.push(item)
      continue
    }
    if (event?.type === 'tool/result') {
      const callId = String(event?.data?.message?.toolCallId ?? event?.data?.callId ?? '')
      const target = pendingTools.get(callId)
      if (target) {
        target.status = event?.data?.error ? 'error' : 'ok'
        pendingTools.delete(callId)
      }
      continue
    }
  }

  return {
    sessionId: id,
    alive,
    total: items.length,
    items: items.slice(-limit),
    truncated: items.length > limit,
    reason: null,
  }
}
