/**
 * 会话管理页：把工作站创建/使用的 DSH 会话按用途分类，并提供打开、归档、置顶、
 * 放进 Workspace 等管理动作。
 *
 * 数据全部来自 Host 的 `GET /api/dev-hub/sessions/manage`（会话持久化快照 + 实时状态
 * + 流程/评审归属 + Workspace 映射）；本文件只做展示和动作调用。
 */
import { createElement as h, useEffect, useRef, useState } from 'react'
import {
  Button,
  EmptyState,
  IconSeat,
  Tag,
  T,
  api,
  errorText,
  fmtTime,
  styles,
} from './common.mjs'
import { API } from '../shared/api.mjs'

const CATEGORY_ICON = {
  development: '◈',
  review: '◎',
  scan: '⌕',
  clarify: '？',
  internal: '⚙',
  unbound: '◇',
  other: '·',
}

const CATEGORY_TONE = {
  development: 'accent',
  review: 'info',
  scan: 'neutral',
  clarify: 'neutral',
  internal: 'neutral',
  unbound: 'warn',
  other: 'neutral',
}

function normalizePath(value) {
  return String(value ?? '').replace(/[/\\]+$/, '')
}

function shortNumber(value) {
  const number = Number(value) || 0
  if (number > 1024 * 1024) return `${(number / 1024 / 1024).toFixed(1)} MB`
  if (number > 1024) return `${Math.round(number / 1024)} KB`
  return String(number)
}

function SessionRow({ session, busy, onOpen, onAction }) {
  const [expanded, setExpanded] = useState(false)
  const [transcript, setTranscript] = useState(null)
  const [transcriptBusy, setTranscriptBusy] = useState(false)
  const [transcriptError, setTranscriptError] = useState('')
  const title = session.title || session.shortId

  async function toggleTranscript() {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (transcript) return
    setTranscriptBusy(true)
    setTranscriptError('')
    try {
      const body = await api(`${API.sessionTranscript}?sessionId=${encodeURIComponent(session.id)}&limit=80`)
      setTranscript(body)
    } catch (err) {
      setTranscriptError(errorText(err))
    } finally {
      setTranscriptBusy(false)
    }
  }
  const meta = [
    session.flow?.title ? `流程：${session.flow.title}` : null,
    session.reviewer?.label ? `审核员：${session.reviewer.label}${session.reviewer.status ? `（${session.reviewer.status}）` : ''}` : null,
    session.workspace?.title ? `Workspace：${session.workspace.title}` : null,
    session.cwd ? `目录：${session.cwd}` : null,
  ].filter(Boolean)
  return h('div', {
    style: {
      border: `1px solid ${T.borderSoft}`,
      borderRadius: T.rLg,
      background: T.surface,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 } },
      h(IconSeat, { size: 24, tone: CATEGORY_TONE[session.category] ?? 'neutral' }, CATEGORY_ICON[session.category] ?? '·'),
      h('span', {
        style: { fontWeight: 600, color: T.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 220px' },
        title,
      }),
      h(Tag, { tone: CATEGORY_TONE[session.category] ?? 'neutral' }, session.categoryLabel),
      session.running ? h(Tag, { tone: 'accent' }, '运行中') : null,
      session.live ? h(Tag, { tone: 'neutral' }, '已加载') : h(Tag, { tone: 'neutral' }, '历史'),
      session.archived ? h(Tag, { tone: 'warn' }, '已归档') : null,
      session.pinned ? h(Tag, { tone: 'accent' }, '置顶') : null,
      session.origin === 'subagent' || session.delegationDepth ? h(Tag, { tone: 'neutral' }, '子代理') : null,
    ),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: T.font.xs, color: T.text4 } },
      h('span', { style: styles.mono }, session.shortId),
      h('span', null, `创建 ${fmtTime(session.createdAt)}`),
      session.eventCount !== null && session.eventCount !== undefined ? h('span', null, `${session.eventCount} 事件`) : null,
      session.sizeBytes ? h('span', null, shortNumber(session.sizeBytes)) : null,
      session.turns ? h('span', null, `${session.turns} 轮`) : null,
      session.workspace?.title
        ? h('span', { style: { color: T.text2 } }, `Workspace · ${session.workspace.title}`)
        : null,
    ),
    meta.length
      ? h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: T.font.xs, color: T.text3 } },
        meta.slice(0, expanded ? meta.length : 2).map((line) => h('span', {
          key: line,
          style: { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          title: line,
        }, line)),
        meta.length > 2
          ? h('span', {
            style: { color: T.brand, cursor: 'pointer' },
            onClick: () => setExpanded((value) => !value),
          }, expanded ? '收起' : `+${meta.length - 2}`)
          : null,
      )
      : null,
    session.preview
      ? h('div', {
        style: { ...styles.sectionHint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        title: session.preview,
      }, session.preview)
      : null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 } },
      h(Button, {
        style: { height: 26, padding: '0 10px', fontSize: T.font.xs },
        disabled: busy || !session.live && !session.workspace,
        onClick: () => onOpen(session),
        children: '打开会话',
      }),
      h(Button, {
        style: { height: 26, padding: '0 10px', fontSize: T.font.xs, background: expanded ? T.brandSoft : undefined, color: expanded ? T.brand : undefined },
        disabled: transcriptBusy,
        onClick: toggleTranscript,
        children: transcriptBusy ? '正在读取对话…' : expanded ? '收起对话' : '查看对话',
      }),
      h(Button, {
        style: { height: 26, padding: '0 10px', fontSize: T.font.xs },
        disabled: busy,
        onClick: () => onAction(session.pinned ? 'unpin' : 'pin', session),
        children: session.pinned ? '取消置顶' : '置顶',
      }),
      h(Button, {
        style: { height: 26, padding: '0 10px', fontSize: T.font.xs },
        disabled: busy,
        onClick: () => onAction(session.archived ? 'unarchive' : 'archive', session),
        children: session.archived ? '取消归档' : '归档',
      }),
    ),
    expanded
      ? h('div', {
        style: {
          marginTop: 4,
          padding: '8px 10px',
          border: `1px solid ${T.borderSoft}`,
          borderRadius: T.rBase,
          background: T.surface2,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          maxHeight: 360,
          overflow: 'auto',
        },
      },
        transcriptError ? h('div', { style: styles.dangerCard }, transcriptError) : null,
        transcript?.persisted ? h('div', { style: styles.sectionHint }, `历史记录 · ${transcript.messages?.length ?? 0} 条`) : null,
        transcript?.messages?.length
          ? transcript.messages.map((message, index) => h('div', {
            key: `${message.role}-${index}`,
            style: { display: 'flex', flexDirection: 'column', gap: 2 },
          },
            h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: T.font.xs, color: T.text4 } },
              h('span', { style: { fontWeight: 600, color: message.role === 'user' ? T.brand : T.text2 } }, message.roleLabel ?? message.role),
              message.at ? h('span', null, fmtTime(message.at)) : null,
            ),
            h('div', { style: { fontSize: T.font.sm, color: T.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, message.text),
          ))
          : h('div', { style: styles.sectionHint }, transcript?.reason ?? '这条会话还没有可读的对话内容'),
      )
      : null,
  )
}

const ROLE_LABEL = {
  development: '开发',
  review: '评审',
  clarify: '澄清',
  scan: '扫描',
  internal: '内部',
}

function FlowNode({ flow, busy, onOpen, onAction }) {
  const [expanded, setExpanded] = useState(false)
  const roles = ['development', 'review', 'clarify', 'scan', 'internal']
  const sessions = roles.flatMap((role) => (flow.sessions?.[role] ?? []).map((session) => ({ role, session })))
  return h('div', {
    style: {
      border: `1px solid ${T.borderSoft}`,
      borderRadius: T.rBase,
      background: T.surface2,
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', cursor: 'pointer' },
      onClick: () => setExpanded((value) => !value) },
      h('span', { style: { color: T.brand, fontSize: 12, width: 14 } }, expanded ? '▾' : '▸'),
      h('span', { style: { fontWeight: 600, color: T.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 220px' }, title: flow.title }, flow.title),
      flow.status ? h(Tag, { tone: flow.status === 'blocked' ? 'danger' : flow.status === 'done' ? 'ok' : 'neutral' }, flow.status) : null,
      flow.stage ? h(Tag, { tone: 'neutral' }, flow.stage) : null,
      ...roles.filter((role) => flow.counts?.[role]).map((role) => h(Tag, { key: role, tone: role === 'development' ? 'accent' : 'neutral' }, `${ROLE_LABEL[role]} ${flow.counts[role]}`)),
      h('span', { style: styles.sectionHint }, flow.workspaceName ? `· ${flow.workspaceName}` : ''),
    ),
    expanded
      ? sessions.length
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 } },
          sessions.map(({ role, session }) => h('div', { key: session.id, style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('span', { style: { fontSize: T.font.xs, color: T.text4 } }, `${ROLE_LABEL[role] ?? role}`),
            h(SessionRow, { session, busy, onOpen, onAction }),
          )),
        )
        : h('div', { style: styles.sectionHint }, '这个需求还没有关联会话；开启开发会话、跑扫描/澄清/评审后会出现在这里。')
      : null,
  )
}

function ProjectNode({ project, busy, onOpenWorkspace, onOpen, onAction }) {
  const requirements = (project.requirements ?? []).filter((flow) => (flow.counts?.total ?? 0) > 0)
  const linkedSessions = requirements.reduce((sum, flow) => sum + (flow.counts?.total ?? 0), 0)
  return h('div', { style: { ...styles.cardFlat, display: 'flex', flexDirection: 'column', gap: 8 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
      h(IconSeat, { size: 28, tone: 'accent' }, '▤'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
        h('span', { style: styles.sectionTitle, title: project.title }, project.title),
        h('span', { style: { ...styles.mono, fontSize: T.font.xs, color: T.text4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }, title: project.path }, project.path),
      ),
      h(Tag, { tone: 'neutral' }, `${requirements.length} 个需求`),
      h(Tag, { tone: 'accent' }, `${linkedSessions} 个会话`),
      h('div', { style: styles.spacer }),
      project.id
        ? h(Button, {
          style: { height: 26, padding: '0 9px', fontSize: T.font.xs },
          disabled: busy,
          onClick: () => onOpenWorkspace(project),
          children: '打开项目 Workspace',
        })
        : null,
    ),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      requirements.length
        ? requirements.map((flow) => h(FlowNode, { key: flow.id, flow, busy, onOpen, onAction }))
        : h('div', { style: styles.sectionHint }, '这个项目还没有关联会话的需求。'),
    ),
  )
}

export function SessionsPanel({ ctx, activeRepoPath = null, activeWorkspacePath = null }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState('project')
  const mountedRef = useRef(true)

  async function load() {
    try {
      const body = await api(API.managedSessions)
      if (!mountedRef.current) return
      setData(body)
      setError('')
    } catch (err) {
      if (mountedRef.current) setError(errorText(err))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    setFilter('all')
  }, [activeRepoPath, activeWorkspacePath])

  useEffect(() => {
    mountedRef.current = true
    load()
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      load()
    }, 10000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      mountedRef.current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  async function act(action, session) {
    const label = action === 'archive' ? '归档' : action === 'unarchive' ? '取消归档' : action === 'pin' ? '置顶' : action === 'unpin' ? '取消置顶' : action
    if (action === 'archive' && session.running
      && !window.confirm(`会话「${session.title}」正在运行。归档会停止它当前的工作。\n\n继续归档？`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = await api(API.managedSessions, {
        method: 'POST',
        body: JSON.stringify({ action, sessionId: session.id, title: session.title }),
      })
      if (body.catalog) setData(body.catalog)
      setNotice(`${label}完成：${session.title}`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function archiveCategory(category) {
    const targets = (category.sessions ?? []).filter((session) => !session.archived)
    if (!targets.length) return
    if (!window.confirm(`归档「${category.label}」里的 ${targets.length} 个会话？\n\n正在运行的会话会被停止；归档只隐藏 Workspace 分组，不删除会话日志。`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = await api(API.managedSessions, {
        method: 'POST',
        body: JSON.stringify({ action: 'archive', sessionIds: targets.map((session) => session.id) }),
      })
      if (body.catalog) setData(body.catalog)
      setNotice(`已归档 ${targets.length} 个会话（${category.label}）`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function openProjectWorkspace(workspace) {
    const ui = ctx?.get?.('uiWorkspace')
    if (!ui?.openWorkspace) { setError('当前环境没有可用的 Workspace 服务'); return }
    setBusy(true)
    setError('')
    try {
      await ui.openWorkspace(workspace.id)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function open(session) {
    const ui = ctx?.get?.('uiWorkspace')
    if (!ui?.openSession) { setError('当前环境没有可用的会话工作区，无法打开会话'); return }
    setBusy(true)
    setError('')
    try {
      await ui.openSession(session.id)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return h('div', { style: styles.wrap }, '加载会话…')

  // 旧 Host 还没有 projects/projectWorkspaces：不要显示一个空的项目层级，先退回按类型
  const hierarchyAvailable = Array.isArray(data?.projects)
  const effectiveView = view === 'project' && !hierarchyAvailable ? 'category' : view
  const activePath = normalizePath(activeWorkspacePath || activeRepoPath)
  const projects = data?.projects ?? []
  const selectedProject = hierarchyAvailable && activePath
    ? projects.find((project) => normalizePath(project.path) === activePath)
      ?? projects.find((project) => (project.requirements ?? []).some((flow) => normalizePath(flow.repoPath) === activePath))
      ?? null
    : null
  // 会话管理页只显示「顶部选中的项目」，不再把所有项目一次性铺开
  const selectedSessions = selectedProject
    ? (selectedProject.requirements ?? []).flatMap((flow) => Object.values(flow.sessions ?? {}).flat())
    : hierarchyAvailable
      ? []
      : (data?.sessions ?? []).filter((session) => !activePath
        || normalizePath(session.cwd).startsWith(`${activePath}/`)
        || normalizePath(session.cwd) === activePath
        || normalizePath(session.flow?.repoPath) === activePath
        || normalizePath(session.workspace?.path) === activePath)
  const selectedIds = new Set(selectedSessions.map((session) => session.id))
  const categories = (data?.categories ?? [])
    .map((category) => ({ ...category, sessions: category.sessions.filter((session) => selectedIds.has(session.id)) }))
    .filter((category) => category.sessions.length > 0)
  const visible = filter === 'all' ? categories : categories.filter((category) => category.id === filter)
  const counts = Object.fromEntries(categories.map((category) => [category.id, category.sessions.length]))
  const total = selectedSessions.length
  const running = selectedSessions.filter((session) => session.running).length
  const archived = selectedSessions.filter((session) => session.archived).length

  return h('div', { style: { ...styles.wrap, display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
    h('div', { style: { ...styles.cardFlat, display: 'flex', flexDirection: 'column', gap: 8 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h(IconSeat, { size: 32 }, '▤'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
          h('div', { style: styles.sectionTitle }, '会话管理'),
          h('div', { style: styles.sectionHint },
            '只显示顶部选中的项目；切换上方项目/多库项目即可查看对应需求与会话。'),
        ),
        h('div', { style: styles.spacer }),
        h(Button, {
          style: { height: 26, padding: '0 9px', fontSize: T.font.xs, background: effectiveView === 'project' ? T.brandSoft : undefined, color: effectiveView === 'project' ? T.brand : undefined },
          disabled: Boolean(data) && !hierarchyAvailable,
          title: Boolean(data) && !hierarchyAvailable ? '当前 Host 版本还不支持项目层级：重启 DSH 后可用' : undefined,
          onClick: () => setView('project'),
          children: '按项目',
        }),
        h(Button, {
          style: { height: 26, padding: '0 9px', fontSize: T.font.xs, background: effectiveView === 'category' ? T.brandSoft : undefined, color: effectiveView === 'category' ? T.brand : undefined },
          onClick: () => setView('category'),
          children: '按类型',
        }),
        h(Button, { disabled: busy || loading, onClick: load, children: loading ? '刷新中…' : '刷新' }),
      ),
      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        h(Tag, { tone: 'neutral' }, `共 ${total}`),
        h(Tag, { tone: 'accent' }, `运行中 ${running}`),
        h(Tag, { tone: 'warn' }, `已归档 ${archived}`),
        ...categories.map((category) => h('button', {
          key: category.id,
          type: 'button',
          onClick: () => setFilter(filter === category.id ? 'all' : category.id),
          title: category.hint,
          style: {
            height: 26,
            padding: '0 9px',
            border: `1px solid ${filter === category.id ? T.brandBorder : T.borderSoft}`,
            borderRadius: 999,
            background: filter === category.id ? T.brandSoft : T.surface,
            color: filter === category.id ? T.brand : T.text2,
            fontSize: T.font.xs,
            cursor: 'pointer',
            fontFamily: 'inherit',
          },
        }, `${CATEGORY_ICON[category.id] ?? '·'} ${category.label} ${counts[category.id] ?? 0}`)),
        filter !== 'all'
          ? h(Button, { style: { height: 26, padding: '0 9px', fontSize: T.font.xs }, onClick: () => setFilter('all'), children: '全部' })
          : null,
      ),
    ),
    activePath
      ? h('div', { style: { ...styles.sectionHint, paddingLeft: 2 } },
        selectedProject
          ? `当前项目：${selectedProject.title} · ${total} 个会话`
          : '当前选中的项目还没有会话管理数据；如果刚切换项目，请点刷新。')
      : h('div', { style: { ...styles.sectionHint, paddingLeft: 2 } }, '请先在顶部选择项目或多库项目'),
    error ? h('div', { style: styles.dangerCard }, error) : null,
    notice ? h('div', { style: styles.infoCard }, notice) : null,
    data && !hierarchyAvailable
      ? h('div', { style: styles.infoCard }, '当前 Host 版本还不支持“项目 → 需求 → 会话”层级：先按类型显示。重启 DSH 加载新的 Host 插件后即可使用项目层级。')
      : null,
    effectiveView === 'project'
      ? selectedProject
        ? h(ProjectNode, {
          key: selectedProject.path,
          project: selectedProject,
          busy,
          onOpenWorkspace: openProjectWorkspace,
          onOpen: open,
          onAction: act,
        })
        : h(EmptyState, {
          icon: '▤',
          title: activePath ? '当前选中的项目还没有会话数据' : '还没有选择项目',
          hint: activePath ? '切换顶部项目或点刷新；需求流程与扫描/澄清/开发/评审会话会出现在这里。' : '请先在顶部选择一个项目或多库项目。',
        })
      : !visible.length
      ? h(EmptyState, { icon: '▤', title: '没有符合条件的会话', hint: '切换分类或点刷新；开发会话会在开启开发会话后出现在这里。' })
      : visible.map((category) => h('div', { key: category.id, style: { ...styles.cardFlat, display: 'flex', flexDirection: 'column', gap: 6 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          h('span', { style: { color: T.brand, fontSize: 16 } }, CATEGORY_ICON[category.id] ?? '·'),
          h('span', { style: styles.sectionTitle }, category.label),
          h(Tag, { tone: 'neutral' }, String(category.sessions.length)),
          h('span', { style: styles.sectionHint }, category.hint),
          h('div', { style: styles.spacer }),
          ['scan', 'clarify', 'internal'].includes(category.id)
            ? h(Button, {
              style: { height: 26, padding: '0 9px', fontSize: T.font.xs },
              disabled: busy,
              onClick: () => archiveCategory(category),
              children: '归档本组',
            })
            : null,
        ),
        category.sessions.map((session) => h(SessionRow, {
          key: session.id,
          session,
          busy,
          onOpen: open,
          onAction: act,
        })),
      )),
  )
}
