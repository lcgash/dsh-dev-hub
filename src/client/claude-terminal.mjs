/**
 * 站内 PTY 终端：xterm.js + Host 的 script/PTY 会话。
 *
 * Claude Code 仍运行在真正的伪终端里（不是把日志当终端），浏览器直接读写
 * 终端输出/按键；不再调用本机 Terminal.app。
 */
import { useEffect, useRef, useState } from 'react'
import * as XtermPkg from '@xterm/xterm'
const Terminal = XtermPkg.Terminal ?? XtermPkg.default?.Terminal
import { h } from './i18n.mjs'
import { API } from '../shared/api.mjs'
import { Button, T, api, errorText, styles } from './common.mjs'
import { XTERM_CSS } from './xterm-style.mjs'

export function ClaudeTerminal({ itemId, sessionId, onClose }) {
  const hostRef = useRef(null)
  const termRef = useRef(null)
  const ttyRef = useRef('')
  const aliveRef = useRef(false)
  const [status, setStatus] = useState('starting')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!hostRef.current) return undefined
    let stop = false
    let timer = null
    let term = null
    let ttyId = ''
    let sequence = 0

    // bundle 不处理 CSS import：把 xterm 需要的布局样式注入一次
    if (!document.querySelector('style[data-devhub-xterm]')) {
      const tag = document.createElement('style')
      tag.dataset.devhubXterm = '1'
      tag.textContent = XTERM_CSS
      document.head.appendChild(tag)
    }

    async function poll() {
      if (stop || !ttyId) return
      try {
        const body = await api(`${API.tty}?id=${encodeURIComponent(ttyId)}&after=${sequence}`)
        if (stop) return
        for (const chunk of body.chunks ?? []) {
          term?.write(chunk.data)
          sequence = Math.max(sequence, Number(chunk.seq) || sequence)
        }
        aliveRef.current = Boolean(body.alive)
        if (!body.alive) {
          setStatus('ended')
          clearInterval(timer)
        }
      } catch (err) {
        if (!stop) setError(errorText(err))
      }
    }

    async function start() {
      try {
        const body = await api(API.tty, {
          method: 'POST',
          body: JSON.stringify({ action: 'create', itemId, sessionId }),
        })
        if (stop) return
        ttyId = body.ttyId
        ttyRef.current = ttyId
        aliveRef.current = true
        setStatus('running')
        sequence = 0
        poll()
        timer = setInterval(poll, 100)
      } catch (err) {
        setError(`无法创建站内终端：${errorText(err)}`)
        setStatus('failed')
      }
    }

    term = new Terminal({
      convertEol: false,
      cursorBlink: true,
      scrollback: 5000,
      cols: 100,
      rows: 32,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0f1724',
        foreground: '#d6deeb',
        cursor: '#7c9cff',
        selectionBackground: '#334155',
        black: '#011627',
        red: '#ef5350',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#5b8cff',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#d6deeb',
      },
    })
    term.open(hostRef.current)
    termRef.current = term
    term.focus()
    term.onData((data) => {
      if (!ttyId || !aliveRef.current) return
      api(API.tty, {
        method: 'POST',
        body: JSON.stringify({ action: 'input', ttyId, data }),
      }).catch(() => { /* 轮询会展示终端状态 */ })
    })
    start()

    return () => {
      stop = true
      if (timer) clearInterval(timer)
      if (ttyId) api(API.tty, { method: 'POST', body: JSON.stringify({ action: 'close', ttyId }) }).catch(() => {})
      try { term?.dispose() } catch { /* ignore */ }
      ttyRef.current = ''
      termRef.current = null
    }
  }, [itemId, sessionId])

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, minHeight: 360 } },
    h('div', { style: { ...styles.row, gap: 8 } },
      h('span', { style: styles.sectionHint }, status === 'running' ? 'PTY 终端 · 可直接按键/授权' : status === 'ended' ? '会话已结束（只读）' : '正在创建 PTY…'),
      h('div', { style: styles.spacer }),
      h(Button, { style: { height: 24, padding: '0 8px' }, onClick: () => termRef.current?.focus(), children: '聚焦' }),
    ),
    h('div', {
      ref: hostRef,
      style: {
        flex: '1 1 auto',
        minHeight: 300,
        height: '56vh',
        background: '#0f1724',
        border: `1px solid ${T.borderSoft}`,
        borderRadius: T.rBase,
        padding: 6,
        overflow: 'hidden',
      },
    }),
    error ? h('div', { style: styles.dangerCard }, error) : null,
    h('div', { style: { ...styles.row, gap: 8 } },
      h('span', { style: styles.sectionHint }, '终端直接在站内运行；关闭弹窗会结束这个 PTY（Claude 后台会话仍保留）。'),
      h('div', { style: styles.spacer }),
      onClose ? h(Button, { onClick: onClose, children: '关闭终端' }) : null,
    ),
  )
}
