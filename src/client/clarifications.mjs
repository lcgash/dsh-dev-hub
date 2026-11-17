/**
 * 需求澄清工作区：管理「还没变成流程」的对话。
 *
 * 这些会话不是 DSH 开发会话，而是工作站里的需求草稿：扫描、追问、计划确认都发生在这里。
 * 用户可以在一个地方看到哪些需求还在澄清、哪些已能生成计划、哪些已经搁置。
 */
import { useEffect, useState } from 'react'
import { h } from './i18n.mjs'
import { API } from '../shared/api.mjs'
import {
  Button,
  EmptyState,
  IconSeat,
  Pill,
  T,
  fmtTime,
  styles,
} from './common.mjs'
import { getConversation, listChats } from './chat-store.mjs'

function statusOf(conversation) {
  const job = conversation?.job ?? null
  if (job) {
    const label = job.kind === 'clarify'
      ? `正在澄清 · 第 ${Number(job.round) || 1} 轮`
      : job.kind === 'plan' ? '正在生成计划' : '正在扫描仓库'
    return { label, tone: 'accent' }
  }
  if (conversation?.pendingPlan) return { label: '计划待确认', tone: 'warn' }
  if (conversation?.pending) return { label: '文件/范围待确认', tone: 'warn' }
  if (conversation?.clarify?.ready) return { label: '可生成计划', tone: 'ok' }
  if (conversation?.clarify) return { label: `澄清中 · 第 ${Number(conversation.clarify.round) || 1} 轮`, tone: 'accent' }
  return { label: '需求草稿', tone: 'neutral' }
}

function lastUserText(conversation) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : []
  const user = [...messages].reverse().find((msg) => msg?.role === 'user' && String(msg?.text ?? '').trim())
  const assistant = [...messages].reverse().find((msg) => msg?.role === 'assistant' && String(msg?.text ?? '').trim())
  return String(user?.text ?? assistant?.text ?? conversation?.title ?? '').trim()
}

/** 纯函数：把 chat store 里的会话投影成澄清卡片（可单测）。 */
export function clarificationCards(repoPath) {
  return listChats(repoPath, 'new')
    .map((summary) => {
      const conversation = getConversation(repoPath, summary.id, 'new')
      if (!conversation) return null
      const messages = Array.isArray(conversation.messages) ? conversation.messages : []
      const meaningful = messages.length > 0 || conversation.job || conversation.pending || conversation.pendingPlan
      if (!meaningful) return null
      return {
        id: summary.id,
        title: String(conversation.clarifyTitle || conversation.clarify?.title || summary.title || '未命名需求').trim() || '未命名需求',
        updatedAt: summary.updatedAt,
        messageCount: summary.messageCount,
        lastText: lastUserText(conversation).slice(0, 160),
        status: statusOf(conversation),
        busy: Boolean(conversation.job),
        hasPlan: Boolean(conversation.pendingPlan),
      }
    })
    .filter(Boolean)
}

function ClarificationCard({ card, onOpen, onDelete }) {
  return h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 0,
      height: '100%',
      padding: '14px 15px',
      border: `1px solid ${T.borderSoft}`,
      borderRadius: T.rLg,
      background: T.surface,
      boxShadow: T.shadowCard,
    },
  },
    h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 } },
      h(IconSeat, { size: 26, tone: 'accent' }, '✦'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 auto' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'nowrap' } },
          h('span', { style: { flex: '1 1 auto', minWidth: 0, fontSize: T.font.base, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, card.title),
          h('span', { style: { flex: '0 0 auto' } }, h(Pill, { tone: card.status.tone }, card.status.label)),
        ),
        h('div', { style: { ...styles.sectionHint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, card.lastText || '还没有开始描述需求'),
      ),
    ),
    // 底部操作条：卡片内容再高再矮，按钮都贴底对齐（删除在左、主操作在右）
    h('div', {
      style: {
        marginTop: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingTop: 8,
        borderTop: `1px solid ${T.borderSoft}`,
      },
    },
      h(Button, {
        disabled: card.busy,
        title: card.busy ? '任务处理中，暂不能删除' : '删除这段澄清草稿',
        onClick: () => onDelete?.(card),
        style: { height: 30, padding: '0 10px', fontSize: T.font.sm, flex: '0 0 auto' },
        children: '删除',
      }),
      h('div', { style: styles.spacer }),
      h('span', {
        style: {
          ...styles.sectionHint,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
      }, `${card.messageCount} 条消息 · 更新于 ${fmtTime(card.updatedAt)}`),
      h(Button, {
        primary: true,
        disabled: card.busy,
        onClick: () => onOpen?.(card.id),
        style: { height: 30, padding: '0 12px', fontSize: T.font.sm, minWidth: 96, flex: '0 0 auto' },
        children: card.busy ? '处理中…' : (card.hasPlan ? '确认计划' : '继续澄清'),
      }),
    ),
  )
}

export function ClarificationWorkspace({ repoPath, refreshNonce = 0, onOpen, onNew, onDelete }) {
  const [cards, setCards] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!repoPath) { setCards([]); return }
    try {
      setCards(clarificationCards(repoPath))
      setError('')
    } catch (err) {
      setError(String(err?.message ?? err))
    }
  }, [repoPath, refreshNonce])

  function remove(card) {
    if (!card || card.busy) return
    if (typeof window !== 'undefined' && typeof window.confirm === 'function'
      && !window.confirm(`删除澄清草稿「${card.title}」？这不会删除任何代码或已创建的流程。`)) return
    onDelete?.(card)
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm, padding: '14px 16px' } },
    h('div', {
      style: {
        border: `1px solid ${T.brandBorder}`,
        borderRadius: T.rLg,
        background: `linear-gradient(135deg, ${T.brandSoft}, ${T.surface})`,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      },
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h(IconSeat, { size: 32, tone: 'accent' }, '✧'),
        h('span', { style: { fontSize: T.font.md, fontWeight: 650, color: T.text } }, '需求澄清工作区'),
        h('span', { style: styles.sectionHint }, '先把需求问清楚，再创建流程；这里不会直接改代码。'),
        h('div', { style: styles.spacer }),
        h(Button, { primary: true, onClick: onNew, children: '开始新的需求澄清' }),
      ),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        ['描述一句要做什么', '回答工作站的追问', '确认计划后建流程'].map((text, index) => h('span', {
          key: text,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 26,
            padding: '0 10px',
            borderRadius: 6,
            background: T.surface,
            border: `1px solid ${T.borderSoft}`,
            color: T.text2,
            fontSize: T.font.sm,
          },
        }, `${index + 1}. ${text}`)),
      ),
    ),
    error ? h('div', { style: styles.dangerCard }, `读取澄清会话失败：${error}`) : null,
    cards.length
      ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gridAutoRows: '1fr', alignItems: 'stretch', gap: 10 } },
        cards.map((card) => h(ClarificationCard, { key: card.id, card, onOpen, onDelete: remove })))
      : h('div', { style: styles.card },
        h(EmptyState, {
          icon: '✎',
          title: '还没有需求澄清草稿',
          hint: '从一个真实问题开始，工作站会先扫仓库、再只问影响实现和验收的问题。',
        }),
        h('div', { style: { display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10 } },
          h(Button, { primary: true, onClick: onNew, children: '开始需求澄清' }),
        ),
      ),
  )
}
