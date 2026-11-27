/**
 * 站内 Claude Code 会话控制台。
 *
 * Claude Code 本身跑在终端里，DevHub 不再调用本机 Terminal.app 去 attach；
 * 这里直接渲染它落盘的会话记录，并提供一句话发送入口。发送走 Host 的
 * `claude send`（必要时会 resume/fork 出新后台会话），不需要用户自己开终端。
 */
import { useEffect, useState } from 'react'
import { h } from './i18n.mjs'
import { API } from '../shared/api.mjs'
import { Button, T, api, errorText, styles } from './common.mjs'
import { SessionTimeline } from './session-log.mjs'

const ROLE_LABEL = { user: '你', assistant: '助手', tool: '工具', system: '系统' }

export function ClaudeConsole({ itemId, sessionId, onSessionChange }) {
  const [messages, setMessages] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [currentId, setCurrentId] = useState(sessionId)

  async function load({ silent = false } = {}) {
    if (!currentId) return
    if (!silent) setLoading(true)
    setError('')
    try {
      const body = await api(`${API.sessionTranscript}?sessionId=${encodeURIComponent(currentId)}&engine=claude&limit=120`)
      setMessages(Array.isArray(body.messages) ? body.messages : [])
      setItems(Array.isArray(body.items) ? body.items : [])
    } catch (err) {
      setError(errorText(err))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => { setCurrentId(sessionId) }, [sessionId])
  useEffect(() => {
    let stop = false
    load()
    const timer = setInterval(() => { if (!stop && document.visibilityState !== 'hidden') load({ silent: true }) }, 2000)
    return () => { stop = true; clearInterval(timer) }
  }, [currentId])

  async function send() {
    const prompt = text.trim()
    if (!prompt || busy) return
    setBusy(true); setError('')
    try {
      const body = await api(API.claude, {
        method: 'POST',
        body: JSON.stringify({ id: itemId, action: 'send', sessionId: currentId, prompt, force: true }),
      })
      const nextId = body?.sessionId || currentId
      setText('')
      if (nextId !== currentId) {
        setCurrentId(nextId)
        onSessionChange?.(nextId)
      }
      await load()
    } catch (err) {
      setError(`发送失败：${errorText(err)}`)
    } finally { setBusy(false) }
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, minHeight: 320 } },
    h('div', { style: { ...styles.row, gap: 8 } },
      h('span', { style: styles.sectionHint }, `会话 ${String(currentId ?? '').slice(0, 12)}`),
      h('div', { style: styles.spacer }),
      h(Button, { style: { height: 24, padding: '0 8px' }, onClick: () => load(), disabled: loading, children: loading ? '读取中…' : '刷新' }),
    ),
    h('div', {
      style: {
        flex: '1 1 auto',
        minHeight: 220,
        maxHeight: '52vh',
        overflow: 'auto',
        border: `1px solid ${T.borderSoft}`,
        borderRadius: T.rBase,
        background: T.surface2,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      },
    },
      items.length
        ? h(SessionTimeline, { items, maxHeight: '52vh', collapseOlder: false })
        : h('div', { style: styles.sectionHint }, loading ? '正在读取会话…' : '会话还没有可读记录；发送一句话后 Claude 会继续。'),
    ),
    error ? h('div', { style: styles.dangerCard }, error) : null,
    h('textarea', {
      style: { ...styles.textarea, minHeight: 64 },
      placeholder: '给 Claude Code 发一句话（Enter 发送，Shift+Enter 换行）',
      value: text,
      disabled: busy,
      onChange: (event) => setText(event.target.value),
      onKeyDown: (event) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() }
      },
    }),
    h('div', { style: { ...styles.row, gap: 8 } },
      h(Button, { primary: true, onClick: send, disabled: busy || !text.trim(), children: busy ? '发送中…' : '发送' }),
      h('span', { style: styles.sectionHint }, '发送会在后台继续这个 Claude 会话；授权/登录类操作仍以 Claude 的终端能力为准。'),
    ),
  )
}
