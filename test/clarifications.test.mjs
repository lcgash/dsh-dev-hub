import assert from 'node:assert/strict'
import test from 'node:test'

const store = await import('../src/client/chat-store.mjs')
const { clarificationCards } = await import('../src/client/clarifications.mjs')

const REPO = '/tmp/devhub-clarify-workspace-test'

test('需求澄清工作区：把 chat store 中的草稿投影成可管理卡片', () => {
  store.clearChat(REPO, 'new')
  const first = store.startNewChat(REPO, '旧对话', 'new')
  store.saveChat(REPO, first.id, {
    messages: [{ role: 'user', text: '给 Webhook 加重试' }, { role: 'assistant', text: '先确认失败边界' }],
    pending: { messageId: 'm1', description: '给 Webhook 加重试' },
    clarify: { round: 2, ready: false },
  }, 'new')
  const second = store.startNewChat(REPO, '新需求', 'new')
  store.saveChat(REPO, second.id, {
    messages: [{ role: 'user', text: '计划已经出来的需求' }],
    pendingPlan: { id: 'm2', plan: { steps: ['a'] } },
  }, 'new')

  const cards = clarificationCards(REPO)
  assert.equal(cards.length, 2)
  const planned = cards.find((card) => card.id === second.id)
  assert.equal(planned.status.label, '计划待确认')
  assert.equal(planned.hasPlan, true)
  const draft = cards.find((card) => card.id === first.id)
  assert.match(draft.status.label, /待确认|澄清/)
  assert.match(draft.lastText, /Webhook/)

  store.deleteChat(REPO, first.id, 'new')
  assert.equal(clarificationCards(REPO).length, 1)
  store.clearChat(REPO, 'new')
})
