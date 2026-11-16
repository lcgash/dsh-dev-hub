import assert from 'node:assert/strict'
import test from 'node:test'

const store = await import('../src/client/chat-store.mjs')
const {
  chatKey, loadStore, saveStore, listChats, getActiveChat, saveActiveChat, saveChat,
  clearConversationJob, getConversation, getActiveConversationId, startNewChat, selectChat, clearChat, titleOf,
} = store

const REPO = '/repo/multi'

test('chat-store：澄清卡里改过的流程标题会随对话持久化', () => {
  clearChat('/repo/title')
  saveActiveChat('/repo/title', {
    messages: [{ id: 'u1', role: 'user', kind: 'text', text: '改标题的流程' }],
    phase: 'plan',
    clarifyTitle: '我的流程标题',
    titleTouched: true,
  })
  const conversation = getActiveChat('/repo/title').conversation
  assert.equal(conversation.clarifyTitle, '我的流程标题')
  assert.equal(conversation.titleTouched, true)
})

test('chat-store：按代码库分区，互不干扰', () => {
  clearChat(REPO)
  clearChat('/repo/other')
  saveActiveChat(REPO, { messages: [{ id: 'm1', role: 'user', kind: 'text', text: 'A 仓库的对话' }], phase: 'idle' })
  saveActiveChat('/repo/other', { messages: [{ id: 'm2', role: 'user', kind: 'text', text: 'B 仓库的对话' }], phase: 'idle' })
  assert.equal(getActiveChat(REPO).conversation.messages[0].text, 'A 仓库的对话')
  assert.equal(getActiveChat('/repo/other').conversation.messages[0].text, 'B 仓库的对话')
  assert.notEqual(chatKey(REPO), chatKey('/repo/other'))
})

test('chat-store：多段历史对话可新建、切换、列表按更新时间排序', () => {
  clearChat(REPO)
  saveActiveChat(REPO, { messages: [{ id: 'a', role: 'user', kind: 'text', text: '第一件事' }], phase: 'idle' })
  const second = startNewChat(REPO)
  saveActiveChat(REPO, { messages: [{ id: 'b', role: 'user', kind: 'text', text: '第二件事' }], phase: 'idle' })

  const chats = listChats(REPO)
  assert.equal(chats.length, 2)
  assert.equal(chats[0].title, '第二件事', '最新的排前面')
  assert.ok(chats.some((chat) => chat.id === second.id))

  const first = chats.find((chat) => chat.title === '第一件事')
  const switched = selectChat(REPO, first.id)
  assert.equal(switched.messages[0].text, '第一件事')
  assert.equal(getActiveChat(REPO).conversation.messages[0].text, '第一件事', '切换后应恢复那段对话')
})

test('chat-store：标题取第一条用户消息，过长截断；空对话叫「新对话」', () => {
  assert.equal(titleOf([]), '新对话')
  assert.equal(titleOf([{ role: 'user', text: '给 source 加 webhook 重试' }]), '给 source 加 webhook 重试')
  assert.ok(titleOf([{ role: 'user', text: 'x'.repeat(100) }]).length <= 41)
})

test('chat-store：落盘有上限（消息条数、文本、recon/plan 字段）', () => {
  clearChat('/repo/big')
  const messages = Array.from({ length: 100 }, (_, i) => ({
    id: `m${i}`, role: 'workstation', kind: 'recon',
    text: 'x'.repeat(9999),
    recon: {
      files: Array.from({ length: 30 }, (_, j) => ({ path: `f${j}.java`, why: 'x', confidence: 'high', score: 9, matches: Array.from({ length: 20 }, () => ({ line: 1, text: 'y' })) })),
      questions: Array.from({ length: 10 }, (_, j) => ({ id: `q${j}`, question: 'q?', why: 'w', options: [] })),
    },
    plan: { steps: Array.from({ length: 60 }, () => 's'), acceptance: Array.from({ length: 40 }, () => 'a'), risks: Array.from({ length: 40 }, () => 'r') },
  }))
  saveActiveChat('/repo/big', { messages, input: 'x'.repeat(9999), phase: 'idle' })
  const saved = getActiveChat('/repo/big').conversation
  assert.ok(saved.messages.length <= 80)
  const last = saved.messages.at(-1)
  assert.ok(last.text.length <= 4001)
  assert.ok(last.recon.files.length <= 20)
  assert.ok(last.recon.files[0].matches.length <= 5)
  assert.ok(last.plan.steps.length <= 30)
  assert.ok(saved.input.length <= 4000)
})

test('chat-store：旧版单对话数据能迁移成一段历史', async () => {
  const legacyKey = 'dev-hub:chat:/repo/legacy'
  const data = new Map()
  const fakeWindow = {
    localStorage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
      removeItem: (key) => data.delete(key),
    },
  }
  const original = globalThis.window
  globalThis.window = fakeWindow
  try {
    data.set(legacyKey, JSON.stringify({
      messages: [{ id: 'old', role: 'user', kind: 'text', text: '旧版对话' }],
      phase: 'idle', input: '', answers: {}, selectedFiles: [], scopeList: [],
    }))
    const migrated = getActiveChat('/repo/legacy').conversation
    assert.equal(migrated.messages[0].text, '旧版对话')
    assert.ok(!data.has(legacyKey), '旧 key 应被清理')
    assert.ok(data.has('dev-hub:chats:/repo/legacy::new'), '应写入新版（按作用域分区）key')
  } finally {
    globalThis.window = original
  }
})

test('chat-store：坏 JSON 不抛错，按无记录处理', () => {
  const data = new Map([['dev-hub:chats:/repo/broken', '{not json']])
  const original = globalThis.window
  globalThis.window = {
    localStorage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
      removeItem: (key) => data.delete(key),
    },
  }
  try {
    assert.equal(loadStore('/repo/broken'), null)
  } finally {
    globalThis.window = original
  }
})

test('chat-store：澄清上下文（描述/轮次/历史）会随快照留存，刷新后还能续聊', () => {
  clearChat('/repo/clarify')
  saveActiveChat('/repo/clarify', {
    messages: [{ id: 'm1', role: 'user', kind: 'text', text: '给 source 加告警' }],
    phase: 'confirm',
    clarify: { description: '给 source 加告警', round: 2, history: [{ role: 'user', text: '给 source 加告警' }], spec: { problem: '失败没人知道' } },
    clarifyOrigin: '给 source 加告警',
  })
  const saved = getActiveChat('/repo/clarify').conversation
  assert.equal(saved.clarify?.description, '给 source 加告警')
  assert.equal(saved.clarify?.round, 2)
  assert.equal(saved.clarifyOrigin, '给 source 加告警')
  assert.equal(saved.clarify?.spec?.problem, '失败没人知道')
})

test('chat-store：进行中的任务（扫描/澄清）会随快照留存，供回来续跑', () => {
  clearChat('/repo/job')
  saveActiveChat('/repo/job', {
    messages: [{ id: 'm1', role: 'user', kind: 'text', text: '给 source 加告警' }],
    phase: 'analyzing',
    job: { kind: 'recon', description: '给 source 加告警', at: 1700000000000 },
  })
  const saved = getActiveChat('/repo/job').conversation
  assert.equal(saved.job?.kind, 'recon')
  assert.equal(saved.job?.description, '给 source 加告警')
  assert.equal(saved.job?.at, 1700000000000)
})

test('chat-store：重复的澄清卡片能被识别（按 round 判重）', () => {
  clearChat('/repo/dup')
  saveActiveChat('/repo/dup', {
    messages: [
      { id: 'c1', role: 'workstation', kind: 'clarify', round: 1, reply: 'a', resolved: true },
      { id: 'c2', role: 'workstation', kind: 'clarify', round: 1, reply: 'b', resolved: false },
    ],
    phase: 'confirm',
  })
  const saved = getActiveChat('/repo/dup').conversation
  assert.equal(saved.messages.filter((msg) => msg.kind === 'clarify' && msg.round === 1).length, 2, '存储层保留原样，去重在渲染层做')
})

test('chat-store：saveChat 只写指定对话、不改 activeId（后台结果不串到当前对话）', () => {
  clearChat('/repo/iso')
  saveActiveChat('/repo/iso', {
    messages: [{ id: 'a1', role: 'user', kind: 'text', text: 'A 流程' }],
    phase: 'confirm',
  })
  const first = getActiveChat('/repo/iso').id
  const second = startNewChat('/repo/iso')
  saveActiveChat('/repo/iso', {
    messages: [{ id: 'b1', role: 'user', kind: 'text', text: 'B 流程' }],
    phase: 'idle',
  })

  // 模拟「A 流程的扫描结果晚到」：按 A 的 id 写回，不能动用户正在看的 B
  saveChat('/repo/iso', first, {
    messages: [
      { id: 'a1', role: 'user', kind: 'text', text: 'A 流程' },
      { id: 'a2', role: 'workstation', kind: 'recon', text: 'A 的扫描结果' },
    ],
    phase: 'confirm',
  })

  const store = loadStore('/repo/iso')
  assert.equal(store.activeId, second.id, 'activeId 必须还是用户正在看的 B 流程')
  assert.equal(getActiveChat('/repo/iso').conversation.messages.length, 1, 'B 流程不能被写进 A 的结果')
  const a = store.conversations.find((entry) => entry.id === first)
  assert.equal(a.messages.length, 2)
  assert.equal(a.messages[1].text, 'A 的扫描结果')
})

test('chat-store：saveChat 对尚未落盘的新对话按 id 建条目（不抢 activeId）', () => {
  clearChat('/repo/upsert')
  saveActiveChat('/repo/upsert', { messages: [{ id: 'x', role: 'user', text: '已有对话' }] })
  const existing = getActiveChat('/repo/upsert').id
  const saved = saveChat('/repo/upsert', 'c-manual-new', { messages: [{ id: 'n', role: 'user', text: '新对话' }] })
  assert.ok(saved)
  const store = loadStore('/repo/upsert')
  assert.equal(store.activeId, existing, '后台写另一段对话不能把用户切走')
  assert.ok(store.conversations.some((entry) => entry.id === 'c-manual-new'))
})

test('chat-store：任务收尾只清发起它的那段对话的 job（避免下次挂载重复续跑）', () => {
  clearChat('/repo/job-clear')
  saveActiveChat('/repo/job-clear', {
    messages: [{ id: 'j1', role: 'user', text: 'A' }],
    job: { kind: 'recon', description: 'A', at: 1 },
  })
  const first = getActiveChat('/repo/job-clear').id
  const second = startNewChat('/repo/job-clear')
  saveActiveChat('/repo/job-clear', {
    messages: [{ id: 'j2', role: 'user', text: 'B' }],
    job: { kind: 'clarify', description: 'B', at: 2 },
  })

  assert.equal(clearConversationJob('/repo/job-clear', first), true)
  let store = loadStore('/repo/job-clear')
  assert.equal(store.conversations.find((entry) => entry.id === first).job, null)
  assert.equal(store.conversations.find((entry) => entry.id === second.id).job.kind, 'clarify', 'B 的任务不能被 A 的清掉')

  // 没有任务时不重复写
  assert.equal(clearConversationJob('/repo/job-clear', first), false)
})

test('chat-store：连续新建对话不堆空对话（有内容的历史保留）', () => {
  clearChat('/repo/empty-new')
  saveActiveChat('/repo/empty-new', { messages: [{ id: 'k1', role: 'user', text: '有内容的一段' }] })
  const a = startNewChat('/repo/empty-new')
  const b = startNewChat('/repo/empty-new')
  const store = loadStore('/repo/empty-new')
  assert.equal(store.activeId, b.id)
  assert.ok(!store.conversations.some((entry) => entry.id === a.id), '没有任何内容的中间对话应被清掉')
  assert.ok(store.conversations.some((entry) => entry.messages[0]?.text === '有内容的一段'), '有内容的历史不能被清')
  assert.equal(store.conversations.filter((entry) => !entry.messages.length).length, 1, '只保留当前这段空对话')
})

test('会话隔离回归：连开两个新流程，第一个的扫描结果不会出现在第二个里', () => {
  clearChat('/repo/two-flows')
  // 第一个新流程：用户发了一句，扫描进行中
  const first = startNewChat('/repo/two-flows')
  saveChat('/repo/two-flows', first.id, {
    messages: [{ id: 'u1', role: 'user', kind: 'text', text: '支持制品版本删除' }],
    phase: 'analyzing',
    job: { kind: 'recon', description: '支持制品版本删除', at: 1 },
  })

  // 用户又点「新建流程」：入口先落一段新对话
  const second = startNewChat('/repo/two-flows')
  saveChat('/repo/two-flows', second.id, {
    messages: [{ id: 'u2', role: 'user', kind: 'text', text: '支持制品版本删除' }],
    phase: 'analyzing',
    job: { kind: 'recon', description: '支持制品版本删除', at: 2 },
  })

  // 第一个流程的扫描晚到：按它的 id 写回（组件已卸载的那条路径）
  const origin = getConversation('/repo/two-flows', first.id)
  saveChat('/repo/two-flows', first.id, {
    messages: [
      ...origin.messages,
      { id: 's1', role: 'workstation', kind: 'text', text: '扫了 307 个文件，命中 5 个候选' },
      { id: 'r1', role: 'workstation', kind: 'recon', text: '探测结果' },
    ],
    phase: 'confirm',
    job: null,
  })

  const store = loadStore('/repo/two-flows')
  assert.equal(store.activeId, second.id, '用户还在第二个新流程里')
  const secondNow = store.conversations.find((entry) => entry.id === second.id)
  assert.equal(secondNow.messages.length, 1, '第一个流程的结果不能混进第二个')
  assert.ok(!secondNow.messages.some((msg) => /307 个文件/.test(msg.text ?? '')), '第二个流程没有第一个的扫描结果')
  const firstNow = store.conversations.find((entry) => entry.id === first.id)
  assert.equal(firstNow.messages.length, 3, '第一个流程自己的结果要保住')
  assert.equal(firstNow.job, null, '结果写入后清掉进行中任务，避免重复续跑')
  assert.equal(secondNow.job?.kind, 'recon', '第二个流程自己的任务不能被清掉')
})

test('chat-store：getActiveConversationId 只读当前 id，不会凭空造对话', () => {
  clearChat('/repo/active-id')
  assert.equal(getActiveConversationId('/repo/active-id'), null)
  const first = startNewChat('/repo/active-id')
  assert.equal(getActiveConversationId('/repo/active-id'), first.id)
  const second = startNewChat('/repo/active-id')
  assert.equal(getActiveConversationId('/repo/active-id'), second.id)
  // 按 id 写旧对话不会改变"当前是哪段"
  saveChat('/repo/active-id', first.id, { messages: [{ id: 'x', role: 'user', text: '旧对话结果' }] })
  assert.equal(getActiveConversationId('/repo/active-id'), second.id)
})
