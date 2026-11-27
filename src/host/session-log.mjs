/**
 * 读一条开发会话的最近对话，供工作站内嵌展示（不用跳到会话页）。
 *
 * 只做只读投影：从 Session.deriveMessages() 拿到的消息里取文本/工具名，
 * 按 role 压平成一行行，界面直接渲染。会话不在当前进程时明确返回原因。
 */

const DEFAULT_LIMIT = 30
const TEXT_MAX = 600

/**
 * 终端快照清理：Claude Code / Codex 的 `logs` 输出带 ANSI 颜色、光标移动和清屏序列，
 * 直接塞进详情页会变成 `[2C`、`[H` 这类乱码。这里只保留可读字符，不改变对话内容。
 * 先删 OSC/CSI 序列，再删单字符 ESC，最后去掉 C0 控制码与多余空行。
 */
export function sanitizeTerminalText(value) {
  return String(value ?? '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[P^_][^\x1b]*\x1b\\/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][A-Za-z0-9]/g, '')
    .replace(/\x1b[>=]/g, '')
    .replace(/\x1b/g, '')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function textOnly(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => (block?.type === 'text' ? String(block.text ?? '') : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function summarizeToolArgs(args) {
  let value = args
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return value.slice(0, 300) }
  }
  if (!value || typeof value !== 'object') return ''
  const direct = value.command ?? value.path ?? value.file_path ?? value.pattern ?? value.query ?? value.url
  if (typeof direct === 'string' && direct.trim()) return direct.trim().slice(0, 300)
  const first = Object.values(value).find((entry) => typeof entry === 'string' && entry.trim())
  return first ? String(first).trim().slice(0, 300) : ''
}

function textOfContent(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'text' && block.text) parts.push(String(block.text))
    else if (block.type === 'tool-call') {
      const brief = summarizeToolArgs(block.arguments ?? block.args ?? block.input)
      parts.push(`[调用工具] ${block.name ?? 'unknown'}${brief ? ` · ${brief}` : ''}`)
    } else if (block.type === 'image') parts.push('[图片]')
    else if (block.type === 'file') parts.push('[文件]')
  }
  return parts.join('\n').trim()
}

/** 系统提示/时间上下文不是人写的对话，展开历史时不占行。 */
function isTranscriptNoise(text) {
  const value = String(text ?? '').trim()
  return value.startsWith('<system-reminder>')
    || /^Time sampled while preparing/i.test(value)
    || value.startsWith('A skill is a reusable set of task-specific instructions')
}

/** 把 Claude Code 的 JSONL 消息压成与 DSH transcript 相同的事件形状。 */
export function claudeTranscriptFromJsonl(text, { limit = 80 } = {}) {
  const events = []
  const lines = String(text ?? '').split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    let entry = null
    try { entry = JSON.parse(line) } catch { continue }
    if (entry?.isSidechain) continue
    if (entry?.type === 'user') {
      const content = entry?.message?.content
      if (typeof content === 'string') {
        events.push({ type: 'user/message', time: entry.timestamp ? Date.parse(entry.timestamp) : null, data: { content: [{ type: 'text', text: content }] } })
        continue
      }
      if (!Array.isArray(content)) continue
      for (const block of content) {
        if (!block || typeof block !== 'object') continue
        if (block.type === 'tool_result') {
          const resultText = typeof block.content === 'string'
            ? block.content
            : textOfContent(block.content)
          if (!resultText) continue
          events.push({
            type: 'tool/result',
            time: entry.timestamp ? Date.parse(entry.timestamp) : null,
            data: { message: { toolCallId: block.tool_use_id, content: [{ type: 'text', text: resultText }] } },
          })
        } else if (block.type === 'text' && block.text) {
          events.push({ type: 'user/message', time: entry.timestamp ? Date.parse(entry.timestamp) : null, data: { content: [{ type: 'text', text: block.text }] } })
        }
      }
      continue
    }
    if (entry?.type === 'assistant') {
      const blocks = []
      for (const block of entry?.message?.content ?? []) {
        if (!block || typeof block !== 'object') continue
        if (block.type === 'text' && block.text) blocks.push({ type: 'text', text: block.text })
        else if (block.type === 'tool_use') blocks.push({ type: 'tool-call', id: block.id, name: block.name, arguments: block.input })
      }
      if (!blocks.length) continue
      events.push({
        type: 'assistant/message',
        time: entry.timestamp ? Date.parse(entry.timestamp) : null,
        data: { message: { content: blocks } },
      })
    }
  }
  return transcriptRowsFromEvents(events, { limit })
}

/**
 * 历史事件 → 可读对话行：用户文本、助手文本+工具调用、工具结果。
 * tool/result 是「看到了什么」，只给工具名会像截图里那样整页都是「[调用工具] bash」。
 */
export function transcriptRowsFromEvents(events, { limit = 80, resultMax = 1200 } = {}) {
  const rows = []
  const pending = new Map()
  for (const event of events ?? []) {
    if (event?.type === 'user/message') {
      const text = textOfContent(event?.data?.message?.content ?? event?.data?.content)
      if (!text || isTranscriptNoise(text)) continue
      rows.push({ role: 'user', roleLabel: '你', text: text.slice(0, 1600), at: event?.time ?? null })
      continue
    }
    if (event?.type === 'assistant/message') {
      const text = textOfContent(event?.data?.message?.content)
      if (!text) continue
      rows.push({ role: 'assistant', roleLabel: '助手', text: text.slice(0, 1600), at: event?.time ?? null })
      for (const block of event?.data?.message?.content ?? []) {
        if (block?.type === 'tool-call' && block?.id) {
          pending.set(String(block.id), { name: String(block.name ?? 'tool'), brief: summarizeToolArgs(block.arguments ?? block.args ?? block.input) })
        }
      }
      continue
    }
    if (event?.type === 'tool/result') {
      const text = textOfContent(event?.data?.message?.content)
      if (!text || isTranscriptNoise(text)) continue
      const callId = String(event?.data?.message?.toolCallId ?? event?.data?.callId ?? '')
      const call = pending.get(callId)
      rows.push({
        role: 'tool',
        roleLabel: call?.name ? `工具 ${call.name}` : '工具结果',
        text: text.length > resultMax ? `${text.slice(0, resultMax)}…` : text,
        at: event?.time ?? null,
      })
      if (callId) pending.delete(callId)
    }
  }
  return rows.slice(-limit)
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
      const text = textOfContent(event?.data?.message?.content ?? event?.data?.content)
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

/**
 * 会话对话投影（管理页内嵌展开用）：
 * - 活会话直接 deriveMessages；
 * - 已结束/历史会话从 sessionPersistence 读事件（只读，不接管写锁）。
 *
 * 和历史 `sessionLog` 的区别：不要求会话仍在当前进程，也不要求属于当前活动仓库。
 */
export async function sessionTranscript(ctx, sessionId, { limit = 80 } = {}) {
  const id = String(sessionId ?? '').trim()
  if (!id) return { sessionId: null, alive: false, messages: [], reason: '缺少会话' }
  const live = sessionLog(ctx, id, { limit })
  if (live.messages.length) return { ...live, persisted: false }
  const persistence = ctx.get('sessionPersistence')
  if (!persistence?.open) return { ...live, persisted: false }

  let handle = null
  try {
    handle = await persistence.open(id, 'read')
    let events = []
    const count = Number(handle.eventCount ?? (await persistence.stat?.(id))?.eventCount) || 0
    try {
      events = count > 0
        ? (await handle.read(Math.max(0, count - 1200), 1200)).events
        : (await handle.read()).events
    } catch {
      events = (await handle.read()).events
    }
    const allRows = transcriptRowsFromEvents(events, { limit: Number.MAX_SAFE_INTEGER })
    return {
      sessionId: id,
      alive: false,
      persisted: true,
      total: allRows.length,
      messages: allRows.slice(-limit),
      truncated: allRows.length > limit,
      reason: allRows.length ? null : '这条会话还没有可读的对话内容',
    }
  } catch (error) {
    return {
      sessionId: id,
      alive: false,
      persisted: false,
      messages: [],
      reason: `读取历史会话失败：${String(error?.message ?? error)}`,
    }
  } finally {
    try { await handle?.close?.() } catch { /* ignore */ }
  }
}
