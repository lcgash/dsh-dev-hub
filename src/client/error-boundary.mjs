/**
 * 渲染兜底：任何工作站子组件抛错，都显示一张可读的错误卡，
 * 而不是让整个 Web GUI 白屏（白屏时用户拿不到任何信息）。
 */
import { Component, createElement as h } from 'react'
import { T, styles } from './common.mjs'

export class DevHubBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // 控制台留完整栈，方便排查；界面上只显示摘要
    if (typeof console !== 'undefined') console.error('[dev-hub] 渲染出错：', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return h('div', { style: { ...styles.card, margin: T.gap.md } },
      h('div', { style: { ...styles.sectionTitle, color: T.danger } }, '开发工作站渲染出错'),
      h('div', {
        style: {
          marginTop: T.gap.xs,
          fontFamily: T.mono,
          fontSize: T.font.sm,
          color: T.text2,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        },
      }, String(error?.message ?? error)),
      h('div', { style: { ...styles.sectionHint, marginTop: T.gap.xs } },
        '界面没有白屏，但这一段没法渲染。请刷新页面重试；如果反复出现，把上面的错误信息发给维护者（控制台有完整堆栈）。'),
    )
  }
}
