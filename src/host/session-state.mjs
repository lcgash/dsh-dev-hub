/**
 * 会话状态：工作站要能"看见"每条流程关联的开发会话在干什么。
 *
 * 数据来源只有 Host 侧的只读事实：
 * - `ctx.agents.get(id)` 判断是否还有活的 agent；
 * - `ctx.sessions.get(id)` 读会话事件，推导是否在跑、第几轮、最后活动与最后一句。
 *
 * 拿不到会话（已归档/未加载/被清理）时返回 alive:false + reason，不伪造状态。
 */

const MAX_EVENTS = 3000
const LAST_TEXT_MAX = 180

function textOfMessage(message) {
  const content = message?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => (block?.type === 'text' ? block.text : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 读一条会话的当前状态。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} sessionId
 * @param {{ now?: number }} [options]
 */
export function sessionState(ctx, sessionId, { now = Date.now() } = {}) {
  const id = String(sessionId ?? '').trim()
  if (!id) return { sessionId: null, alive: false, reason: '未绑定会话' }

  const agents = ctx.get('agents')
  const sessions = ctx.get('sessions')
  const agent = agents?.get?.(id) ?? null
  const session = sessions?.get?.(id) ?? null

  if (!session) {
    return {
      sessionId: id,
      alive: Boolean(agent),
      running: false,
      loaded: false,
      reason: agent ? '会话已注册但未加载事件' : '会话不在当前进程中（可能已结束或被清理）',
      turns: 0,
      lastEventAt: null,
      idleSeconds: null,
    }
  }

  const events = session.snapshotEvents().slice(-MAX_EVENTS)
  let turns = 0
  let lastEventAt = null
  let lastText = ''
  let lastTool = null
  let lastStage = 'idle'
  let error = null

  for (const event of events) {
    if (typeof event?.time === 'number') lastEventAt = event.time
    switch (event?.type) {
      case 'turn/start':
        turns += 1
        lastStage = 'turn'
        // 新一轮开始/重试：上一轮的报错不再代表当前状态，避免旧错误长期挂在流程上
        error = null
        break
      case 'step/start':
        lastStage = 'step'
        break
      case 'tool/call':
        lastStage = 'tool'
        lastTool = event?.data?.name ?? lastTool
        break
      case 'assistant/message': {
        const text = textOfMessage(event?.data?.message)
        if (text) lastText = text.slice(0, LAST_TEXT_MAX)
        lastStage = 'assistant'
        break
      }
      case 'turn/end': {
        const reason = event?.data?.reason
        lastStage = 'ended'
        // 只反映“最近这一轮”的结果：成功结束也要把之前轮的报错清掉
        error = reason?.kind === 'error'
          ? (reason?.error?.message ?? '会话报错')
          : null
        break
      }
      default:
        break
    }
  }

  // 用"最后一个 turn/start 是否晚于最后一个 turn/end"判断是否在跑。
  // 只看"最后一个 turn 事件"在长回合下会误判：几百个工具事件会把 turn/start 挤出窗口。
  let lastStartIndex = -1
  let lastEndIndex = -1
  for (let index = 0; index < events.length; index++) {
    if (events[index]?.type === 'turn/start') lastStartIndex = index
    else if (events[index]?.type === 'turn/end') lastEndIndex = index
  }
  const running = lastStartIndex >= 0 && lastStartIndex > lastEndIndex
  const idleSeconds = lastEventAt ? Math.max(0, Math.round((now - lastEventAt) / 1000)) : null

  return {
    sessionId: id,
    alive: Boolean(agent) || Boolean(session),
    loaded: true,
    running,
    turns,
    lastEventAt,
    idleSeconds,
    lastStage: running ? (lastStage === 'ended' ? 'tool' : lastStage) : 'ended',
    lastTool,
    lastText,
    error,
    reason: null,
  }
}

/**
 * 汇总当前仓库所有流程的会话状态。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Array<object>} items
 */
export function sessionStates(ctx, items) {
  const now = Date.now()
  const rows = []
  for (const item of items ?? []) {
    if (!item?.session?.id) continue
    rows.push({
      itemId: item.id,
      itemTitle: item.title,
      status: item.status,
      boundAt: item.session.boundAt ?? null,
      ...sessionState(ctx, item.session.id, { now }),
    })
  }
  return { now, sessions: rows }
}
