/**
 * 独立版 macOS 风格侧边栏（NavigationSplitView 左栏）。
 *
 * 只负责导航与项目选择；流程/会话/设置内容仍由现有面板渲染。
 * 项目列表直接来自 /state，切项目走同一 /switch-repo，不新增第二套状态。
 */
import { useState } from 'react'
import { h } from './i18n.mjs'
import { API } from '../shared/api.mjs'
import { T, api, errorText, styles } from './common.mjs'

const S = {
  width: 'var(--devhub-sidebar-width, 248px)',
  bg: 'var(--devhub-sidebar, rgba(246,246,248,.78))',
  border: 'var(--devhub-sidebar-border, rgba(60,60,67,.10))',
  text: T.text2,
  muted: T.text4,
  active: 'var(--devhub-sidebar-active, rgba(10,132,255,.14))',
  activeText: T.brand,
  font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
}

const NAV = [
  { id: 'flows', label: '流程', icon: 'list' },
  { id: 'sessions', label: '会话', icon: 'bubble' },
  { id: 'clarify', label: '需求澄清', icon: 'spark' },
  { id: 'settings', label: '设置', icon: 'gear' },
]

function NavIcon({ kind }) {
  const p = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (kind === 'list') return h('svg', p, h('path', { d: 'M8 6h12M8 12h12M8 18h12' }), h('path', { d: 'M4 6h.01M4 12h.01M4 18h.01' }))
  if (kind === 'bubble') return h('svg', p, h('path', { d: 'M20 11.5a7.5 7.5 0 0 1-8 7.5H7l-3 3v-4.2A7.5 7.5 0 1 1 20 11.5Z' }))
  if (kind === 'spark') return h('svg', p, h('path', { d: 'm12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z' }))
  return h('svg', p, h('circle', { cx: 12, cy: 12, r: 8.5 }), h('path', { d: 'M12 8v4l2 2' }))
}

function NavRow({ item, active, badge, onClick }) {
  return h('button', {
    type: 'button',
    onClick,
    style: {
      width: '100%', height: 34, padding: '0 10px', border: 'none', borderRadius: 9,
      background: active ? S.active : 'transparent', color: active ? S.activeText : S.text,
      display: 'flex', alignItems: 'center', gap: 9, font: `${active ? 600 : 500} 13px ${S.font}`,
      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
    },
  },
    h('span', { style: { display: 'inline-flex', width: 18, color: active ? S.activeText : S.muted } }, h(NavIcon, { kind: item.icon })),
    h('span', { style: { flex: '1 1 auto' } }, item.label),
    badge ? h('span', { style: { minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: active ? 'rgba(10,132,255,.22)' : 'rgba(60,60,67,.10)', color: active ? S.activeText : S.muted, font: `600 10px ${S.font}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } }, String(badge)) : null,
  )
}

function projectRows(state) {
  const rows = []
  for (const workspace of state?.workspaces ?? []) {
    rows.push({
      kind: 'workspace', id: workspace.id, name: workspace.name, sub: `${(workspace.repos ?? []).length} 个成员库`,
      active: Boolean(state?.workspace && workspace.id === state.workspace.id),
    })
  }
  const cards = state?.profile?.repoCards ?? (state?.profile?.repos ?? []).map((path) => ({ path }))
  for (const card of cards) {
    const path = String(card?.path ?? card ?? '')
    if (!path) continue
    const name = card?.name || path.split(/[\\/]/).filter(Boolean).pop() || path
    rows.push({ kind: 'repo', id: path, name, sub: card?.branch ? `${card.branch}${card.head ? `@${String(card.head).slice(0, 7)}` : ''}` : '本机项目', active: path === state?.repo?.path })
  }
  return rows
}

export function StandaloneSidebar({ state, tab, onTab, onSelectTarget, onNewProject, switching = false, counts = {} }) {
  const rows = projectRows(state)
  return h('aside', {
    className: 'devhub-sidebar',
    style: {
      width: S.width, flex: `0 0 ${S.width}`, height: '100%', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 10px',
      background: S.bg, borderRight: `1px solid ${S.border}`,
      backdropFilter: 'blur(30px) saturate(180%)', WebkitBackdropFilter: 'blur(30px) saturate(180%)',
      fontFamily: S.font, overflow: 'hidden',
    },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 9, padding: '0 8px 10px' } },
      h('span', { style: { width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(145deg, #0a84ff, #5e5ce6)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 13 } }, '⌘'),
      h('div', { style: { display: 'flex', flexDirection: 'column' } },
        h('span', { style: { font: `650 13px ${S.font}`, color: T.text } }, 'DevHub'),
        h('span', { style: { font: `400 10px ${S.font}`, color: S.muted } }, '开发工作站'),
      ),
    ),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
      NAV.map((item) => h(NavRow, {
        key: item.id, item, active: tab === item.id,
        badge: item.id === 'flows' ? counts.flows : item.id === 'sessions' ? counts.sessions : null,
        onClick: () => onTab(item.id),
      }))),
    h('div', { style: { padding: '12px 10px 5px', font: `600 10px ${S.font}`, color: S.muted, letterSpacing: '.06em', textTransform: 'uppercase' } }, '项目'),
    h('div', { style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 } },
      rows.length ? rows.map((row) => h('button', {
        key: `${row.kind}:${row.id}`,
        type: 'button',
        disabled: switching,
        onClick: () => onSelectTarget(row),
        style: {
          width: '100%', minHeight: 38, padding: '5px 9px', border: 'none', borderRadius: 9,
          background: row.active ? S.active : 'transparent', color: row.active ? S.activeText : S.text,
          display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', cursor: switching ? 'wait' : 'pointer', fontFamily: 'inherit',
        },
      },
        h('span', { style: { width: 18, height: 18, borderRadius: 5, background: row.active ? 'rgba(10,132,255,.18)' : 'rgba(60,60,67,.08)', display: 'grid', placeItems: 'center', fontSize: 10, color: row.active ? S.activeText : S.muted } }, row.kind === 'workspace' ? '▣' : '◈'),
        h('span', { style: { minWidth: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column' } },
          h('span', { style: { font: `${row.active ? 600 : 500} 12px ${S.font}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.name),
          h('span', { style: { font: `400 10px ${S.font}`, color: row.active ? 'rgba(10,132,255,.8)' : S.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.sub),
        ),
        row.active ? h('span', { style: { color: S.activeText, fontSize: 12 } }, '✓') : null,
      )) : h('div', { style: { padding: '8px 10px', font: `400 11px ${S.font}`, color: S.muted } }, '还没有项目'),
    ),
    h('button', {
      type: 'button', onClick: onNewProject,
      style: { height: 32, margin: '4px 6px 0', border: `1px solid ${T.borderSoft}`, borderRadius: 9, background: T.surface, color: T.text2, font: `500 12px ${S.font}`, cursor: 'pointer', fontFamily: 'inherit' },
    }, '+ 添加项目'),
  )
}

export function StandaloneProjectModal({ onDone, onClose }) {
  const [repoPath, setRepoPath] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (!repoPath.trim()) { setError('请填写项目路径'); return }
    if (!name.trim()) { setError('请填写你的名字/成员标识'); return }
    setBusy(true); setError('')
    try {
      const next = await api(API.setup, { method: 'POST', body: JSON.stringify({ repoPath: repoPath.trim(), name: name.trim() }) })
      onDone(next)
    } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }
  return h('div', { role: 'dialog', 'aria-modal': 'true', style: { position: 'fixed', inset: 0, zIndex: 5000, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.28)', backdropFilter: 'blur(8px)' } },
    h('div', { style: { width: 'min(520px, 92vw)', borderRadius: 20, background: T.surface, boxShadow: T.shadowModal, padding: 24, fontFamily: S.font } },
      h('div', { style: { font: `650 20px ${S.font}`, color: T.text, letterSpacing: '-.02em' } }, '添加项目'),
      h('div', { style: { marginTop: 6, font: `400 12px ${S.font}`, color: S.muted } }, '粘贴本机 Git 仓库的绝对路径；DevHub 会探测环境并写 .dev-hub。'),
      h('form', { onSubmit: submit, style: { marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 } },
        h('input', { autoFocus: true, value: repoPath, placeholder: '/Users/you/Projects/repo', onChange: (e) => setRepoPath(e.target.value), style: { ...styles.input, height: 42, borderRadius: 11, background: 'var(--devhub-sidebar-input, rgba(255,255,255,.8))' } }),
        h('input', { value: name, placeholder: '你的名字 / 成员标识', onChange: (e) => setName(e.target.value), style: { ...styles.input, height: 38, borderRadius: 11 } }),
        error ? h('div', { style: { color: T.danger, fontSize: 12 } }, error) : null,
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 } },
          h('button', { type: 'button', onClick: onClose, style: { height: 34, padding: '0 14px', border: `1px solid ${T.border}`, borderRadius: 9, background: T.surface, color: T.text2, cursor: 'pointer', fontFamily: 'inherit' } }, '取消'),
          h('button', { type: 'submit', disabled: busy, style: { height: 34, padding: '0 16px', border: 'none', borderRadius: 9, background: T.brand, color: '#fff', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' } }, busy ? '添加中…' : '添加'),
        ),
      ),
    ),
  )
}
