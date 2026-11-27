/**
 * 自定义确认弹层：替代 window.confirm。
 *
 * 原生 confirm 由浏览器/系统绘制：样式不受工作站的令牌控制、深色主题下也不跟随、
 * 还会同步阻塞渲染进程（弹层期间页面动画/状态全部停住）。这里用模块级队列 +
 * React 宿主实现同样的「是/否」语义：
 *
 * - 任意模块直接 `await askConfirm({...})`，不必把回调一路透传到根组件；
 * - 同时只显示一个，其余排队，避免叠出多层遮罩；
 * - Esc 取消、Enter 确认（焦点在按钮时走按钮默认行为）、点遮罩取消；
 * - 文案照常交给 i18n 的 h 工厂，中英切换无需额外处理。
 */
import { useEffect, useRef, useState } from 'react'
import { h } from './i18n.mjs'
import { Button, IconSeat, T } from './common.mjs'

/** 队列里同时只让第一条成为当前弹层；resolve 由 settleConfirm 保证只调用一次。 */
const queue = []
let active = null
let nextId = 0
const listeners = new Set()
let mountedHosts = 0

function notify() {
  for (const listener of [...listeners]) {
    try { listener() } catch { /* 单个订阅者出错不能拖垮其它订阅 */ }
  }
}

/** 当前正在显示的确认请求（无弹层时为 null）。 */
export function currentConfirm() {
  return active
}

/** React 宿主订阅入口；返回取消订阅函数。 */
export function subscribeConfirm(listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function normalizeRequest(options) {
  const input = typeof options === 'string' ? { message: options } : (options ?? {})
  const danger = input.tone === 'danger'
  return {
    id: ++nextId,
    title: String(input.title ?? '请确认操作'),
    message: String(input.message ?? ''),
    confirmLabel: String(input.confirmLabel ?? (danger ? '确认删除' : '确认')),
    cancelLabel: String(input.cancelLabel ?? '取消'),
    tone: danger ? 'danger' : 'default',
    // 双重提交保护：settleConfirm 先摘队列再 resolve，重复点击只会命中一次。
    resolve: null,
  }
}

function advance() {
  active = queue[0] ?? null
  notify()
}

/**
 * 请求一次确认。返回 true 表示用户确认，false 表示取消/弹层被卸载。
 * 队列里已有未处理请求时排队，不会覆盖前一个（前一个仍是待决状态）。
 */
export function askConfirm(options) {
  const request = normalizeRequest(options)
  return new Promise((resolve) => {
    request.resolve = resolve
    queue.push(request)
    if (!active) advance()
  })
}

/** 结算指定请求；找不到（重复点击/已卸载）时返回 false，不产生副作用。 */
export function settleConfirm(id, accepted) {
  const index = queue.findIndex((request) => request.id === id)
  if (index < 0) return false
  const [request] = queue.splice(index, 1)
  try { request.resolve?.(Boolean(accepted)) } finally {
    // 只有当前显示的那条被关掉才推进队列；后台排队项被取消不影响当前弹层。
    if (active?.id === id) advance()
  }
  return true
}

/** 宿主卸载时把等待中的请求都结算为取消，避免调用方永远 await。 */
function cancelAll() {
  while (queue.length) {
    const request = queue.shift()
    try { request.resolve?.(false) } catch { /* 调用方异常不影响其它请求 */ }
  }
  if (active) active = null
  notify()
}

const backdropStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 10020, // 高于 styles.modal(10000)：确认弹层必须盖住已经打开的弹窗
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(15,23,42,.46)',
  backdropFilter: 'blur(2px)',
  WebkitBackdropFilter: 'blur(2px)',
}

const cardStyle = {
  width: 'min(520px, calc(100vw - 32px))',
  maxHeight: '86vh',
  display: 'flex',
  flexDirection: 'column',
  gap: T.gap.sm,
  padding: '18px 20px 16px',
  background: T.surface,
  color: T.text,
  borderRadius: T.rLg,
  border: `1px solid ${T.borderSoft}`,
  boxShadow: T.shadowModal,
}

const messageStyle = {
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  maxHeight: '48vh',
  overflow: 'auto',
  fontSize: T.font.base,
  lineHeight: 1.7,
  color: T.text2,
}

const dangerButtonStyle = {
  minWidth: 88,
  height: 32,
  padding: '0 14px',
  border: `1px solid ${T.danger}`,
  borderRadius: T.rSm,
  background: T.danger,
  color: '#fff',
  fontSize: T.font.base,
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

/** 全局挂载一次；任何组件里的 askConfirm 都渲染到这里。 */
export function ConfirmHost() {
  const [request, setRequest] = useState(active)
  const cardRef = useRef(null)

  useEffect(() => {
    mountedHosts += 1
    const unsubscribe = subscribeConfirm(() => setRequest(active))
    // 订阅前可能已经换了一条，补一次同步。
    setRequest(active)
    return () => {
      unsubscribe()
      mountedHosts -= 1
      if (mountedHosts <= 0) cancelAll()
    }
  }, [])

  // 键盘可达：Esc 取消；Enter 在焦点不在按钮上时才手动确认，
  // 焦点在按钮时交给按钮的默认激活，避免一次按键结算两次。
  useEffect(() => {
    if (!request) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        settleConfirm(request.id, false)
        return
      }
      if (event.key === 'Tab') {
        // 焦点陷阱：确认弹层是模态的，Tab 不能把焦点带回后面的页面控件。
        const card = cardRef.current
        if (!card) return
        const focusables = [...card.querySelectorAll('button:not([disabled])')]
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const target = event.target
        if (event.shiftKey ? (target === first || !card.contains(target)) : (target === last || !card.contains(target))) {
          event.preventDefault()
          event.stopPropagation()
          const nextFocus = event.shiftKey ? last : first
          nextFocus.focus()
        }
        return
      }
      if (event.key !== 'Enter') return
      if (String(event.target?.tagName ?? '').toLowerCase() === 'button') return
      event.preventDefault()
      event.stopPropagation()
      settleConfirm(request.id, true)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [request])

  if (!request) return null
  const danger = request.tone === 'danger'

  return h('div', {
    className: 'devhub-confirm-backdrop',
    style: backdropStyle,
    onMouseDown: (event) => {
      if (event.target === event.currentTarget) settleConfirm(request.id, false)
    },
  },
    h('div', {
      ref: cardRef,
      className: 'devhub-confirm-card',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': request.title,
      style: cardStyle,
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 } },
        h(IconSeat, { size: 34, tone: danger ? 'danger' : 'accent' }, danger ? '!' : '?'),
        h('span', {
          style: {
            minWidth: 0,
            fontSize: T.font.md,
            fontWeight: 650,
            color: T.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        }, request.title),
      ),
      request.message
        ? h('div', { style: messageStyle }, request.message)
        : null,
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 } },
        h(Button, {
          onClick: () => settleConfirm(request.id, false),
          children: request.cancelLabel,
        }),
        h(Button, {
          // 打开即聚焦确认键：键盘用户可以直接回车，也是 Enter 兜底之外的明确落点。
          autoFocus: true,
          primary: !danger,
          style: danger ? dangerButtonStyle : { minWidth: 88, height: 32, padding: '0 14px' },
          onClick: () => settleConfirm(request.id, true),
          children: request.confirmLabel,
        }),
      ),
    ),
  )
}
