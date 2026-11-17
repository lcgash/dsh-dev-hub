/**
 * 「会话管理」的纯分类/投影逻辑。
 *
 * 工作站会在 DSH 里创建多种会话：
 * - 需求开发会话：绑定到流程 `item.session`；
 * - 独立评审会话：记录在 `item.workflow.review.reviewers[].sessionId`；
 * - 扫描/澄清等内部任务：`runAgentJson` 起的 root + spawn 子代理；
 * - 用户自己的其他 DSH 会话。
 *
 * 这里只根据持久化快照、实时状态和台账做确定性分类，不读磁盘、不调模型，
 * 方便单测；Host 路由负责把 ctx.sessions / sessionPersistence / workspace 数据喂进来。
 */
import { basename, relative, resolve, isAbsolute, sep } from 'node:path'

export const SESSION_CATEGORIES = [
  { id: 'development', label: '开发会话', hint: '绑定到开发流程的实际需求会话' },
  { id: 'review', label: '评审会话', hint: '独立评审员会话（默认不可见）' },
  { id: 'scan', label: '扫描会话', hint: 'recon 扫描子代理' },
  { id: 'clarify', label: '澄清会话', hint: '需求澄清/追问子代理' },
  { id: 'internal', label: '其他内部任务', hint: '计划、补充、标题、文件说明等' },
  { id: 'unbound', label: '未绑定会话', hint: '工作目录属于工作站仓库/工作区，但没有关联流程' },
  { id: 'other', label: '其他会话', hint: '主会话或其他 DSH 会话' },
]

const INTERNAL_PREFIXES = [
  { pattern: /^devhub-scan-/, kind: 'scan', label: '扫描' },
  { pattern: /^devhub-clarify-/, kind: 'clarify', label: '澄清' },
  { pattern: /^devhub-reviewer?-/, kind: 'review', label: '评审' },
  { pattern: /^devhub-review-/, kind: 'review', label: '评审' },
  { pattern: /^devhub-plan-/, kind: 'internal', label: '计划' },
  { pattern: /^devhub-assist-/, kind: 'internal', label: '补充' },
  { pattern: /^devhub-requirement-/, kind: 'internal', label: '需求规范化' },
  { pattern: /^devhub-title-/, kind: 'internal', label: '标题' },
  { pattern: /^devhub-file-notes-/, kind: 'internal', label: '文件说明' },
  { pattern: /^devhub-analyze-/, kind: 'internal', label: '分析' },
]

function internalOf(id) {
  const value = String(id ?? '')
  return INTERNAL_PREFIXES.find((entry) => entry.pattern.test(value)) ?? null
}

function isInternalId(id) {
  return Boolean(internalOf(id))
}

/** 沿 parentSession 链找内部任务类型（子代理自己的 id 通常不带 devhub 前缀）。 */
function internalOfHeader(header, byId) {
  let current = header
  for (let depth = 0; current && depth < 6; depth += 1) {
    const own = internalOf(current.id)
    if (own) return own
    const parent = current.parentSession ? byId.get(String(current.parentSession)) : null
    if (!parent) return null
    current = parent
  }
  return null
}

function shortId(id) {
  const value = String(id ?? '')
  return value.length > 22 ? `${value.slice(0, 18)}…` : value
}

function pathName(path) {
  const value = String(path ?? '').trim()
  if (!value) return '未记录目录'
  return basename(value.replace(/[/\\]+$/, '')) || value
}

function under(child, parent) {
  if (!child || !parent) return false
  const value = resolve(String(child))
  const root = resolve(String(parent))
  const rel = relative(root, value)
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))
}

function messageText(message) {
  const content = message?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => (block?.type === 'text' ? String(block.text ?? '') : ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstUserText(session) {
  try {
    const events = session?.snapshotEvents?.() ?? []
    for (const event of events) {
      if (event?.type !== 'user/message') continue
      const text = messageText(event?.data?.message)
      if (text) return text.slice(0, 120)
    }
  } catch {
    /* ignore */
  }
  return ''
}

/**
 * @param {object} input
 * @param {Array<{header: object, eventCount?: number, sizeBytes?: number, location?: object}>} input.snapshots
 * @param {Map<string, object>} [input.liveStates] sessionId -> sessionState()
 * @param {Map<string, object>} [input.liveSessions] sessionId -> live Session（用于取首条用户消息）
 * @param {Array<object>} [input.items] 台账流程，附加 repoPath/repoName/workspaceName
 * @param {Array<object>} [input.workspaces] WorkspaceView（含 sessionIds）
 * @param {string[]} [input.roots] 工作站已知仓库/工作区根目录
 * @param {string[]} [input.archived]
 * @param {string[]} [input.pinned]
 */
export function buildSessionCatalog({
  snapshots = [],
  liveStates = new Map(),
  liveSessions = new Map(),
  items = [],
  workspaces = [],
  roots = [],
  archived = [],
  pinned = [],
} = {}) {
  const byId = new Map()
  for (const snapshot of snapshots) {
    const header = snapshot?.header ?? snapshot
    if (header?.id) byId.set(String(header.id), header)
  }

  const devBySession = new Map()
  const reviewBySession = new Map()
  const clarifyBySession = new Map()
  const scanBySession = new Map()
  for (const entry of items) {
    const item = entry?.item ?? entry
    if (!item?.id) continue
    const flow = {
      id: item.id,
      title: item.title ?? item.id,
      repoPath: entry.repoPath ?? null,
      repoName: entry.repoName ?? pathName(entry.repoPath),
      workspaceName: entry.workspaceName ?? null,
    }
    if (item.session?.id) devBySession.set(String(item.session.id), flow)
    for (const sessionId of item.workflow?.clarifySessions ?? []) {
      if (sessionId) clarifyBySession.set(String(sessionId), flow)
    }
    for (const sessionId of item.workflow?.scanSessions ?? []) {
      if (sessionId) scanBySession.set(String(sessionId), flow)
    }
    for (const reviewer of item.workflow?.review?.reviewers ?? []) {
      if (!reviewer?.sessionId) continue
      reviewBySession.set(String(reviewer.sessionId), {
        ...flow,
        reviewer: {
          id: reviewer.id ?? null,
          label: reviewer.label ?? reviewer.id ?? null,
          status: reviewer.status ?? null,
          verdict: reviewer.verdict ?? null,
        },
      })
    }
  }

  const workspaceBySession = new Map()
  for (const workspace of workspaces) {
    for (const sessionId of workspace.sessionIds ?? []) {
      workspaceBySession.set(String(sessionId), workspace)
    }
  }
  const archivedSet = new Set((archived ?? []).map(String))
  const pinnedSet = new Set((pinned ?? []).map(String))

  // 内部 root 只是 runAgentJson 的壳，真正干活的是 spawn 子代理：有子会话时隐藏壳
  const parentsWithChild = new Set()
  for (const snapshot of snapshots) {
    const header = snapshot?.header ?? snapshot
    if (header?.parentSession) parentsWithChild.add(String(header.parentSession))
  }

  const rows = []
  for (const snapshot of snapshots) {
    const header = snapshot?.header ?? snapshot
    const id = String(header?.id ?? '').trim()
    if (!id) continue
    if (parentsWithChild.has(id) && isInternalId(id)) continue

    const dev = devBySession.get(id) ?? null
    const review = reviewBySession.get(id) ?? null
    const clarifyLinked = clarifyBySession.get(id) ?? null
    const scanLinked = scanBySession.get(id) ?? null
    const internal = internalOfHeader(header, byId)
    let category
    if (dev) category = 'development'
    else if (review) category = 'review'
    else if (clarifyLinked) category = 'clarify'
    else if (scanLinked) category = 'scan'
    else if (internal?.kind) category = internal.kind
    else if (roots.some((root) => under(header.cwd, root))) category = 'unbound'
    else category = 'other'

    const live = liveStates.get(id) ?? null
    const liveSession = liveSessions.get(id) ?? null
    const userText = liveSession ? firstUserText(liveSession) : ''
    const flow = dev ?? review ?? clarifyLinked ?? scanLinked ?? null
    const categoryMeta = SESSION_CATEGORIES.find((entry) => entry.id === category) ?? SESSION_CATEGORIES.at(-1)
    const workspace = workspaceBySession.get(id) ?? null
    const title = flow?.title
      ? (category === 'review' ? `评审 · ${flow.title}` : flow.title)
      : internal
        ? `${internal.label} · ${pathName(header.cwd)}`
        : userText
          ? userText
          : `${category === 'unbound' ? '未绑定' : '会话'} · ${pathName(header.cwd)}`

    rows.push({
      id,
      shortId: shortId(id),
      title,
      category,
      categoryLabel: categoryMeta.label,
      kind: internal?.kind ?? category,
      kindLabel: internal?.label ?? categoryMeta.label,
      createdAt: header.createdAt ?? null,
      cwd: header.cwd ?? null,
      cwdName: pathName(header.cwd),
      parentSession: header.parentSession ?? null,
      origin: header.origin ?? null,
      delegationDepth: header.delegationDepth ?? null,
      agentPreset: header.agentPreset ?? null,
      eventCount: snapshot?.eventCount ?? null,
      sizeBytes: snapshot?.sizeBytes ?? null,
      location: snapshot?.location ?? null,
      live: Boolean(liveSession || live),
      running: Boolean(live?.running),
      turns: Number(live?.turns) || 0,
      lastEventAt: live?.lastEventAt ?? null,
      lastText: live?.lastText ?? '',
      archived: archivedSet.has(id),
      pinned: pinnedSet.has(id),
      visible: Boolean(workspace) && !archivedSet.has(id),
      workspace: workspace
        ? { id: workspace.workspaceId ?? workspace.id ?? null, title: workspace.title ?? '', path: workspace.path ?? null }
        : null,
      flow,
      reviewer: review?.reviewer ?? null,
      preview: userText || live?.lastText || '',
    })
  }

  // 分类内的排序：运行中优先，其次最近创建
  rows.sort((left, right) => {
    if (left.running !== right.running) return left.running ? -1 : 1
    return Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0)
  })

  const categories = SESSION_CATEGORIES.map((meta) => ({
    ...meta,
    sessions: rows.filter((row) => row.category === meta.id),
  }))
  return {
    categories,
    sessions: rows,
    counts: Object.fromEntries(SESSION_CATEGORIES.map((meta) => [meta.id, rows.filter((row) => row.category === meta.id).length])),
    archivedSessionIds: [...archivedSet],
    pinnedSessionIds: [...pinnedSet],
    generatedAt: new Date().toISOString(),
  }
}
