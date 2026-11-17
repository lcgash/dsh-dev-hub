/**
 * 会话页的 DevHub 快捷入口。
 *
 * 会话里正在干活时，最需要两件事：
 * 1. 知道"这个会话属于哪个开发流程"；
 * 2. 一键切到别的流程会话 / 回到工作站。
 *
 * 所以这里只读 Host 的 state + sessions（不新增接口），下拉里给出进行中的流程，
 * 点流程直接 openSession 切换；没有会话的流程则回工作站开。
 */
import { useEffect, useState } from 'react'
import { h } from './i18n.mjs'
import { API } from '../shared/api.mjs'
import { Button, IconSeat, Pill, Tag, T, api, errorText, styles, fmtTime } from './common.mjs'

const STAGE_TEXT = {
  discovery: '需求澄清',
  techdoc: '技术文档',
  plan: '开发计划',
  develop: '开发中',
  review: '独立评审',
  verify: '测试验证',
  submit: '待提交',
  done: '已完成',
}

function relativeTime(state, now) {
  if (!state) return ''
  if (state.idleSeconds !== null && state.idleSeconds !== undefined) {
    const seconds = Number(state.idleSeconds)
    if (seconds < 60) return '刚刚'
    if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`
    if (seconds < 86400) return `${Math.round(seconds / 3600)} 小时前`
    return `${Math.round(seconds / 86400)} 天前`
  }
  return state.lastEventAt ? fmtTime(state.lastEventAt) : ''
}

function sessionTone(state) {
  if (!state) return 'neutral'
  if (state.running) return 'ok'
  if (state.alive) return 'neutral'
  return 'warn'
}

function sessionLabel(state) {
  if (!state) return '未读取到状态'
  if (state.running) return '运行中'
  if (state.alive) return '空闲'
  return '已结束'
}

/** 会话页头部的快捷入口：当前流程 + 流程切换下拉。 */
export function DevHubSessionQuick({ sessionId, ctx }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [state, setState] = useState(null)
  const [states, setStates] = useState({})
  const [error, setError] = useState('')

  const [repo, setRepo] = useState(null)
  const [repos, setRepos] = useState([])
  const [activeRepoPath, setActiveRepoPath] = useState(null)
  const [match, setMatch] = useState(null)
  const [switching, setSwitching] = useState(null)

  async function load() {
    setError('')
    try {
      const [state, sessions] = await Promise.all([api(API.state), api(API.sessions)])
      setState(state)
      setItems(state.items ?? [])
      setRepo(state.repo ?? null)
      setRepos(state.profile?.repos ?? [])
      setActiveRepoPath(state.repo?.path ?? null)
      const map = {}
      for (const row of sessions.sessions ?? []) map[row.itemId] = row
      setStates(map)
      // 跨项目反查：本会话到底属于哪个仓库的哪个流程（会话页要能看出来）
      if (sessionId) {
        try {
          const lookup = await api(`${API.lookup}?sessionId=${encodeURIComponent(sessionId)}`)
          setMatch((lookup.matches ?? [])[0] ?? null)
        } catch { setMatch(null) }
      } else {
        setMatch(null)
      }
    } catch (err) {
      setError(errorText(err))
    }
  }

  /** 在会话页切到另一个开发站的项目（不用回工作站）。 */
  async function switchRepo(repoPath) {
    if (!repoPath || repoPath === activeRepoPath) return
    const name = state?.profile?.member
    setSwitching(repoPath)
    setError('')
    try {
      const next = await api(API.switchRepo, {
        method: 'POST',
        body: JSON.stringify({ repoPath, name, detect: false }),
      })
      setActiveRepoPath(next.repo?.path ?? repoPath)
      await load()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSwitching(null)
    }
  }

  useEffect(() => { load() }, [sessionId])

  // 优先用跨仓库反查结果：即使当前激活的是别的仓库，也能看出本会话属于哪个开发站/流程
  const current = match
    ? { ...match.item, repo: match.repo }
    : (items.find((item) => item.session?.id === sessionId) ?? null)
  const active = items.filter((item) => item.status !== 'done')
  const sorted = [
    ...active.filter((item) => item.id !== current?.id),
    ...active.filter((item) => item.id === current?.id),
  ]

  function openSession(id) {
    setOpen(false)
    const ui = ctx?.get?.('uiWorkspace')
    if (!ui?.openSession) { setError('当前 DSH 不支持切换会话'); return }
    try { ui.openSession(id) } catch (err) { setError(errorText(err)) }
  }

  function openStation() {
    setOpen(false)
    const layout = ctx?.get?.('layout')
    if (!layout?.selectPanel) { setError('当前 DSH 不支持切换面板'); return }
    layout.selectPanel('dev-hub')
  }

  return h('span', {
    style: { position: 'relative', display: 'inline-flex', alignItems: 'center' },
  },
    h('button', {
      type: 'button',
      title: current ? `本会话属于开发流程「${current.title}」` : '这个会话还没有关联开发流程',
      onClick: () => { setOpen((value) => !value); if (!open) load() },
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 26,
        padding: '0 10px',
        border: `1px solid ${current ? T.brandBorder : T.border}`,
        borderRadius: T.rPill,
        background: current ? T.brandSoft : T.surface,
        color: current ? T.brand : T.text3,
        fontSize: T.font.sm,
        cursor: 'pointer',
        fontFamily: 'inherit',
      },
    },
      h(IconSeat, { size: 18, tone: current ? 'accent' : 'neutral' }, '◈'),
      (() => {
        const repoName = current?.repo?.name ?? repo?.name
        const label = current ? `${repoName ? `${repoName} · ` : ''}${current.title}` : (repoName ? `${repoName} · 开发工作站` : '开发工作站')
        return label.length > 26 ? `${label.slice(0, 26)}…` : label
      })(),
      h('span', { style: { fontSize: 10, opacity: 0.7 } }, '▾'),
    ),
    open
      ? h('div', {
        style: {
          position: 'absolute',
          top: 32,
          right: 0,
          zIndex: 10001,
          width: 360,
          maxHeight: 420,
          overflow: 'auto',
          padding: 10,
          border: `1px solid ${T.borderSoft}`,
          borderRadius: T.rLg,
          background: T.surface,
          boxShadow: T.shadowModal,
        },
      },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 } },
          h('div', { style: styles.row },
            h('span', { style: styles.sectionTitle }, current ? `本会话 · ${current.repo?.name ?? repo?.name ?? ''}` : '开发站'),
            h('div', { style: styles.spacer }),
            h(Button, { style: { height: 24, padding: '0 8px' }, onClick: openStation, children: '打开工作站' }),
          ),
          current
            ? h('div', { style: { ...styles.sectionHint, fontFamily: T.mono } }, `${current.repo?.path ?? ''} · ${current.id}`)
            : h('div', { style: styles.sectionHint }, repo?.path ? `${repo.path}（本会话尚未关联流程）` : '未选择项目'),
        ),
        repos.length > 1
          ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 } },
            h('span', { style: { ...styles.sectionHint, width: '100%' } }, '切换开发站（项目）：'),
            repos.map((path) => h('button', {
              key: path,
              type: 'button',
              disabled: Boolean(switching),
              onClick: () => switchRepo(path),
              style: {
                height: 26,
                padding: '0 10px',
                border: `1px solid ${path === activeRepoPath ? T.brandBorder : T.border}`,
                borderRadius: T.rPill,
                background: path === activeRepoPath ? T.brandSoft : T.surface,
                color: path === activeRepoPath ? T.brand : T.text3,
                fontSize: T.font.xs,
                cursor: switching ? 'progress' : 'pointer',
                fontFamily: 'inherit',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            }, path.split('/').filter(Boolean).pop() ?? path)),
          )
          : null,
        error ? h('div', { style: styles.smallDanger }, error) : null,
        sorted.length
          ? sorted.map((item) => {
            const state = states[item.id]
            const bound = Boolean(item.session?.id)
            const isCurrent = item.id === current?.id
            return h('div', {
              key: item.id,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 6px',
                borderTop: `1px solid ${T.borderSoft}`,
              },
            },
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 auto' } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
                  h('span', {
                    style: {
                      fontSize: T.font.sm,
                      fontWeight: isCurrent ? 600 : 500,
                      color: isCurrent ? T.brand : T.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  }, item.title),
                  isCurrent ? h(Tag, { tone: 'accent' }, '当前') : null,
                ),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, color: T.text4, fontSize: T.font.xs } },
                  h('span', null, STAGE_TEXT[item.stage] ?? item.stage ?? '—'),
                  bound ? h(Tag, { tone: sessionTone(state) }, sessionLabel(state)) : h(Tag, { tone: 'neutral' }, '未开会话'),
                  bound && relativeTime(state) ? h('span', null, relativeTime(state)) : null,
                ),
              ),
              bound && !isCurrent
                ? h(Button, { style: { height: 24, padding: '0 8px' }, onClick: () => openSession(item.session.id), children: '进入' })
                : null,
              !bound
                ? h(Button, { style: { height: 24, padding: '0 8px' }, onClick: openStation, children: '去开启' })
                : null,
            )
          })
          : h('div', { style: { ...styles.sectionHint, padding: '8px 6px' } }, '还没有进行中的开发流程'),
        h('div', { style: { borderTop: `1px solid ${T.borderSoft}`, marginTop: 4, paddingTop: 8 } },
          h('span', { style: styles.sectionHint }, '提示：流程阶段随工作自动推进；会话状态每 5 秒刷新一次。'),
          error ? null : null,
        ),
      )
      : null,
  )
}