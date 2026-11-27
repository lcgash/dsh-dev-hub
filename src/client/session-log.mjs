/**
 * 内嵌的会话内容面板：在流程详情里直接看最近对话、直接发一句话，
 * 不用跳到会话页（"跳转"会丢掉流程上下文，也打断了工作站的产出）。
 *
 * 数据：GET /api/dev-hub/session-log（Host 只读投影）。
 * 发送：客户端会话控制器 `sessions.retain(id).binding.session.prompt(...)`。
 */
import { useEffect, useState } from 'react'
import { h } from './i18n.mjs'
import { API } from '../shared/api.mjs'
import { Button, C, T, api, errorText, styles } from './common.mjs'

const ROLE_TONE = {
  user: { bg: T.brandSoft, color: T.brand },
  assistant: { bg: T.surface2, color: T.text2 },
  tool: { bg: T.warnSoft, color: T.warnText },
}

const TOOL_STATUS = {
  running: { dot: T.brand, label: '执行中' },
  ok: { dot: T.ok, label: '' },
  error: { dot: T.danger, label: '失败' },
}

/** 连续工具调用折成一组：默认只显示"执行了 N 个操作"，点开再看每条命令。 */
function ToolGroup({ items }) {
  const [open, setOpen] = useState(false)
  const failed = items.filter((item) => item.status === 'error').length
  const running = items.filter((item) => item.status === 'running').length
  const tone = failed ? T.danger : running ? T.brand : T.ok
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 } },
    h('div', {
      style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: T.font.xs, color: T.text3, cursor: 'pointer' },
      onClick: () => setOpen((value) => !value),
    },
      h('span', { style: { width: 6, height: 6, borderRadius: 999, background: tone, flex: '0 0 auto' } }),
      h('span', null, `执行了 ${items.length} 个操作`),
      failed ? h('span', { style: { color: T.danger } }, `${failed} 个失败`) : null,
      running ? h('span', { style: { color: T.brand } }, `${running} 个进行中`) : null,
      h('span', { style: { color: T.brand } }, open ? '收起' : '展开'),
    ),
    open
      ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: 14, marginTop: 2 } },
        items.map((item, index) => h('div', {
          key: `${index}-${item.name}`,
          style: { display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0, fontSize: T.font.xs, color: T.text4 },
        },
          h('span', { style: { ...styles.mono, color: T.text3, flex: '0 0 auto' } }, item.name),
          h('span', {
            style: {
              ...styles.mono,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: '1 1 auto',
            },
            title: item.brief ?? '',
          }, item.brief || '（无参数）'),
          item.status === 'error' ? h('span', { style: { color: T.danger, flex: '0 0 auto' } }, '失败') : null,
        )))
      : null,
  )
}

/** 一条会话时间线：用户/助手文本 + 工具调用（工具是"在做什么"的关键）。 */
function TimelineRow({ item }) {
  const [expanded, setExpanded] = useState(false)
  if (item.kind === 'tool') {
    const status = TOOL_STATUS[item.status] ?? TOOL_STATUS.ok
    return h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '2px 0',
        fontSize: T.font.xs,
        color: T.text3,
        minWidth: 0,
      },
    },
      h('span', { style: { width: 6, height: 6, borderRadius: 999, background: status.dot, flex: '0 0 auto' } }),
      h('span', { style: { ...styles.mono, color: T.text2, fontWeight: 500 } }, item.name),
      item.brief
        ? h('span', {
          style: {
            ...styles.mono,
            color: T.text4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: '1 1 auto',
          },
          title: item.brief,
        }, item.brief)
        : null,
      status.label ? h('span', { style: { color: status.dot } }, status.label) : null,
    )
  }

  const isUser = item.kind === 'user'
  const long = String(item.text ?? '').length > 320
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 } },
    isUser ? h('span', { style: { fontSize: T.font.xs, color: T.text4 } }, '你') : null,
    h('div', {
      style: {
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        fontSize: T.font.sm,
        lineHeight: 1.7,
        color: isUser ? T.brand : T.text2,
        background: isUser ? T.brandSoft : 'transparent',
        borderRadius: isUser ? T.rBase : 0,
        padding: isUser ? '6px 10px' : 0,
        maxHeight: long && !expanded ? 160 : undefined,
        overflow: 'hidden',
      },
    }, expanded ? item.text : String(item.text ?? '').slice(0, long ? 320 : 1200)),
    long
      ? h('span', {
        style: { fontSize: T.font.xs, color: T.brand, cursor: 'pointer' },
        onClick: () => setExpanded((value) => !value),
      }, expanded ? '收起' : '展开全文')
      : null,
  )
}

function MessageRow({ message }) {
  const tone = ROLE_TONE[message.role] ?? ROLE_TONE.assistant
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0', borderTop: `1px solid ${T.borderSoft}` } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
      h('span', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          height: 18,
          padding: '0 6px',
          borderRadius: T.rTag,
          background: tone.bg,
          color: tone.color,
          fontSize: T.font.xs,
          fontWeight: 500,
        },
      }, message.roleLabel ?? message.role),
    ),
    h('div', {
      style: {
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontSize: T.font.sm,
        color: T.text2,
        lineHeight: T.line,
        maxHeight: 220,
        overflow: 'auto',
      },
    }, message.text),
  )
}

/**
 * DSH 风格时间线：相邻助手文本合并，连续工具调用折叠成一组；
 * 详情、站内控制台、澄清等待共用，避免每处各画一套。
 */
export function SessionTimeline({ items: rawItems = [], emptyText = '（还没有消息）', maxHeight = 300, collapseOlder = true }) {
  const merged = []
  for (const item of rawItems) {
    if (!item) continue
    if (item.kind === 'toolGroup') { merged.push(item); continue }
    if (item.kind === 'assistant') {
      const last = merged[merged.length - 1]
      if (last?.kind === 'assistant') {
        last.text = `${String(last.text ?? '')}\n\n${String(item.text ?? '')}`.trim()
        continue
      }
    }
    merged.push({ ...item })
  }
  const rows = []
  let tools = []
  for (const item of merged) {
    if (item.kind === 'tool') { tools.push(item); continue }
    if (tools.length) { rows.push({ kind: 'toolGroup', items: tools }); tools = [] }
    rows.push(item)
  }
  if (tools.length) rows.push({ kind: 'toolGroup', items: tools })
  if (!rows.length) return h('div', { style: styles.sectionHint }, emptyText)
  const head = collapseOlder ? rows.slice(0, Math.max(0, rows.length - 6)) : []
  const tail = collapseOlder ? rows.slice(-6) : rows
  const row = (item, key) => item.kind === 'toolGroup'
    ? h('div', { key }, h(ToolGroup, { items: item.items }))
    : h(TimelineRow, { key, item })
  return h('div', { style: { maxHeight, overflow: 'auto', paddingRight: 4 } },
    head.length
      ? h('details', null,
        h('summary', { style: { cursor: 'pointer', fontSize: T.font.xs, color: T.text4, padding: '2px 0' } }, `更早的 ${head.length} 条（展开）`),
        ...head.map((item, index) => row(item, `h${index}`)),
      )
      : null,
    ...tail.map((item, index) => row(item, `t${index}`)),
  )
}

/**
 * @param {{ ctx: any, sessionId: string|null, alive?: boolean, onError?: (message: string) => void }} props
 */
export function SessionLogPanel({ ctx, itemId, sessionId, alive, onError }) {
  const [log, setLog] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load({ silent = false } = {}) {
    if (!sessionId) { setLog(null); return }
    if (!silent) setLoading(true)
    setError('')
    try {
      const body = await api(`${API.sessionLog}?itemId=${encodeURIComponent(String(itemId ?? ''))}&limit=80`)
      setLog(body)
    } catch (err) {
      setError(errorText(err))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (!sessionId) { setLog(null); return }
    let stop = false
    const run = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (stop) return
      await load({ silent: Boolean(log) })
    }
    load()
    const timer = setInterval(run, 8000)
    return () => { stop = true; clearInterval(timer) }
  }, [sessionId, itemId])

  if (!sessionId) {
    return h('div', { style: styles.sectionHint }, '还没有关联开发会话。')
  }

  const items = log?.items ?? []
  const rows = log?.messages ?? []
  return h('div', { style: { marginTop: T.gap.xs } },
    h('div', { style: { ...styles.row, marginBottom: 6 } },
      h('span', { style: styles.sectionTitle }, '开发会话动态'),
      h('span', { style: styles.sectionHint },
        loading ? '加载中…' : (log?.truncated ? `共 ${log?.total ?? 0} 条，展示最近 ${rows.length} 条` : `共 ${rows.length} 条`)),
      h('div', { style: styles.spacer }),
      h(Button, { style: { height: 24, padding: '0 8px' }, onClick: () => load(), disabled: loading, children: '刷新' }),
    ),
    error ? h('div', { style: styles.dangerCard }, error) : null,
    !alive && log?.reason ? h('div', { style: styles.warnCard }, log.reason) : null,
    h(SessionTimeline, { items, maxHeight: 320, emptyText: log?.reason ? '没有可展示的消息（会话可能尚未开始或已被清理）' : '（还没有消息）' }),
  )
}