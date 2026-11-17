/**
 * 工作站对话的本地留存（按代码库分区，支持多段历史对话）。
 *
 * 结构（每个代码库一份）：
 * ```
 * {
 *   version: 2,
 *   activeId: 'c-...',
 *   conversations: [{ id, title, createdAt, updatedAt, messages, phase, input,
 *                     answers, selectedFiles, scopeList, pending, pendingPlan }]
 * }
 * ```
 *
 * 为什么：
 * - 切走面板/页签再回来，DevHubChat 会被卸载 —— 对话要能恢复；
 * - 一个仓库往往不止一件事，需要「历史对话」可进入，而不是只有最后一段；
 * - 全放内存会在刷新后丢，全放 localStorage 又怕塞爆，所以内存 + localStorage 双写并限流。
 *
 * 这不是 DSH 会话记录：真正的开发会话在 DSH 里；这里只保留工作站的对话与待确认内容。
 */

import { normalizeAttachments } from '../shared/attachment.mjs'

const MEMORY = new Map()
const STORAGE_PREFIX = 'dev-hub:chats:'
const LEGACY_PREFIX = 'dev-hub:chat:'
const MAX_CONVERSATIONS = 10
const MAX_MESSAGES = 80
const MAX_TEXT = 4000
const MAX_TITLE = 40

function storage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * 对话归属键：仓库 + 作用域。
 * - scope = 'new'：新建流程时的工作对话；
 * - scope = <flowId>：某个已建流程的开发对话（会话页/详情页继续用它）。
 */
export function chatKey(repoPath, scope = 'new') {
  const repo = String(repoPath ?? '').trim() || 'unknown-repo'
  const scopeId = String(scope ?? '').trim() || 'new'
  return `${repo}::${scopeId}`
}

function newId() {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function clampMessage(message) {
  if (!message || typeof message !== 'object') return null
  const copy = { ...message }
  if (typeof copy.text === 'string' && copy.text.length > MAX_TEXT) copy.text = `${copy.text.slice(0, MAX_TEXT)}…`
  if (copy.recon && typeof copy.recon === 'object') {
    copy.recon = {
      ...copy.recon,
      files: (copy.recon.files ?? []).slice(0, 20).map((file) => ({
        path: file?.path,
        why: file?.why,
        confidence: file?.confidence,
        score: file?.score,
        matches: (file?.matches ?? []).slice(0, 5),
      })),
      questions: (copy.recon.questions ?? []).slice(0, 6),
    }
  }
  if (copy.plan && typeof copy.plan === 'object') {
    copy.plan = {
      ...copy.plan,
      steps: (copy.plan.steps ?? []).slice(0, 30),
      acceptance: (copy.plan.acceptance ?? []).slice(0, 20),
      risks: (copy.plan.risks ?? []).slice(0, 20),
    }
  }
  return copy
}

/** 从消息里取一个能看懂的小标题（优先第一条用户消息）。 */
export function titleOf(messages) {
  const firstUser = (messages ?? []).find((message) => message?.role === 'user' && message?.text)
  const fallback = (messages ?? []).find((message) => message?.text)
  const text = String(firstUser?.text ?? fallback?.text ?? '').replace(/\s+/g, ' ').trim()
  return text ? (text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE)}…` : text) : '新对话'
}

function emptyConversation(title = '新对话') {
  const now = new Date().toISOString()
  return {
    id: newId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    phase: 'idle',
    input: '',
    answers: {},
    selectedFiles: [],
    scopeList: [],
    pending: null,
    pendingPlan: null,
  }
}

function normalizeConversation(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    id: String(raw.id ?? newId()),
    title: String(raw.title ?? '新对话').slice(0, MAX_TITLE),
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? new Date().toISOString(),
    messages: Array.isArray(raw.messages) ? raw.messages.slice(-MAX_MESSAGES).map(clampMessage).filter(Boolean) : [],
    phase: raw.phase ?? 'idle',
    input: typeof raw.input === 'string' ? raw.input.slice(0, MAX_TEXT) : '',
    answers: raw.answers && typeof raw.answers === 'object' ? raw.answers : {},
    selectedFiles: Array.isArray(raw.selectedFiles) ? raw.selectedFiles : [],
    scopeList: Array.isArray(raw.scopeList) ? raw.scopeList : [],
    pending: raw.pending ?? null,
    pendingPlan: raw.pendingPlan ?? null,
    // 用户随消息提供的截图/文件（只存路径与元信息；二进制在本机附件目录）
    attachments: normalizeAttachments(raw.attachments),
    // 需求澄清上下文：刷新/切走再回来还能接着聊（否则会丢 description，续聊直接 400）
    clarify: raw.clarify && typeof raw.clarify === 'object' ? raw.clarify : null,
    // 进行中的长任务（扫描/澄清）：切走再回来据此自动续跑，而不是看起来中断
    job: raw.job && typeof raw.job === 'object' ? raw.job : null,
    clarifyOrigin: typeof raw.clarifyOrigin === 'string' ? raw.clarifyOrigin.slice(0, MAX_TEXT) : '',
    // 用户在澄清卡里改过的流程标题：不持久化的话刷新/切对话后会被空值覆盖
    clarifyTitle: typeof raw.clarifyTitle === 'string' ? raw.clarifyTitle.slice(0, MAX_TITLE) : '',
    titleTouched: raw.titleTouched === true,
  }
}

function normalizeStore(raw) {
  if (raw && Array.isArray(raw.conversations) && raw.conversations.length) {
    const conversations = raw.conversations.slice(0, MAX_CONVERSATIONS).map(normalizeConversation).filter(Boolean)
    const activeId = conversations.some((entry) => entry.id === raw.activeId) ? raw.activeId : conversations[0].id
    return { version: 2, activeId, conversations }
  }
  // 兼容 v1：单个 snapshot
  if (raw && Array.isArray(raw.messages)) {
    const conversation = normalizeConversation({ ...raw, id: newId(), title: titleOf(raw.messages) })
    return { version: 2, activeId: conversation.id, conversations: [conversation] }
  }
  return null
}

/** 读取某代码库的对话集合（内存优先，其次 localStorage；老 key 自动迁移）。 */
export function loadStore(repoPath, scope = 'new') {
  const key = chatKey(repoPath, scope)
  if (MEMORY.has(key)) return MEMORY.get(key)
  const store = storage()
  if (!store) return null
  try {
    let raw = store.getItem(STORAGE_PREFIX + key)
    let legacy = null
    if (!raw) {
      // 老版本是「一个仓库一份对话」（dev-hub:chat:<repo>）；作用域 new 时迁移过来
      const legacyCandidates = [LEGACY_PREFIX + key]
      if (scope === 'new') legacyCandidates.push(LEGACY_PREFIX + (String(repoPath ?? '').trim() || 'unknown-repo'))
      legacy = legacyCandidates.map((candidate) => store.getItem(candidate)).find(Boolean) ?? null
      raw = legacy
      if (!legacy) return null
    }
    const normalized = normalizeStore(JSON.parse(raw))
    if (!normalized) return null
    MEMORY.set(key, normalized)
    if (legacy) {
      try {
        store.removeItem(LEGACY_PREFIX + key)
        if (scope === 'new') store.removeItem(LEGACY_PREFIX + (String(repoPath ?? '').trim() || 'unknown-repo'))
      } catch { /* ignore */ }
      saveStore(repoPath, normalized, scope)
    }
    return normalized
  } catch {
    return null
  }
}

/** 写回对话集合（内存总是写；localStorage 失败静默降级）。 */
export function saveStore(repoPath, store, scope = 'new') {
  const key = chatKey(repoPath, scope)
  const safe = {
    version: 2,
    activeId: store.activeId,
    conversations: (store.conversations ?? []).slice(0, MAX_CONVERSATIONS).map((conversation) => ({
      ...conversation,
      messages: (conversation.messages ?? []).slice(-MAX_MESSAGES).map(clampMessage).filter(Boolean),
      input: typeof conversation.input === 'string' ? conversation.input.slice(0, MAX_TEXT) : '',
    })),
  }
  MEMORY.set(key, safe)
  const backing = storage()
  if (!backing) return safe
  try {
    backing.setItem(STORAGE_PREFIX + key, JSON.stringify(safe))
  } catch {
    // 容量满等异常：保留内存副本即可
  }
  return safe
}

/** 历史对话摘要列表（最新的在前）。 */
export function listChats(repoPath, scope = 'new') {
  const store = loadStore(repoPath, scope)
  if (!store) return []
  return [...store.conversations]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages.length,
    }))
}

/** 读当前活跃对话；没有就造一个空的（不落盘，等首次保存）。 */
export function getActiveChat(repoPath, scope = 'new') {
  const store = loadStore(repoPath, scope)
  if (!store || !store.conversations.length) {
    const conversation = emptyConversation()
    return { id: conversation.id, conversation }
  }
  const active = store.conversations.find((entry) => entry.id === store.activeId) ?? store.conversations[0]
  return { id: active.id, conversation: active }
}

/**
 * 保存当前活跃对话。
 * @param {string} repoPath
 * @param {object} snapshot { messages, phase, input, answers, selectedFiles, scopeList, pending, pendingPlan }
 */
export function saveActiveChat(repoPath, snapshot, scope = 'new') {
  let store = loadStore(repoPath, scope)
  if (!store) {
    const conversation = emptyConversation(titleOf(snapshot?.messages))
    store = { version: 2, activeId: conversation.id, conversations: [conversation] }
    saveStore(repoPath, store, scope)
  }
  return saveChat(repoPath, store.activeId, snapshot, scope)
}

/**
 * 只写指定的那段对话（**不依赖也不修改 activeId**）。
 *
 * 为什么要按 id 写：扫描/澄清这类请求会在用户切走之后才返回。如果一律写
 * `store.activeId`，结果就会落进"用户后来打开的另一段对话"，表现为两个流程的
 * 消息串在一起。按 id 写能保证：谁发起的任务，结果只回到发起它的那段对话。
 */
export function saveChat(repoPath, conversationId, snapshot, scope = 'new') {
  const id = String(conversationId ?? '').trim()
  if (!id) return null
  let store = loadStore(repoPath, scope)
  if (!store) store = { version: 2, activeId: id, conversations: [] }
  const index = store.conversations.findIndex((entry) => entry.id === id)
  const current = index >= 0 ? store.conversations[index] : emptyConversation()
  const messages = (snapshot?.messages ?? current.messages ?? []).slice(-MAX_MESSAGES)
  const next = normalizeConversation({
    ...current,
    ...snapshot,
    id,
    messages,
    title: titleOf(messages) === '新对话' ? (current.title || '新对话') : titleOf(messages),
    updatedAt: new Date().toISOString(),
  })
  if (index >= 0) store.conversations[index] = next
  else store.conversations.unshift(next)
  // 排序/淘汰只动顺序，不切 activeId：后台任务写回旧对话时不能把用户正在看的对话换掉
  store.conversations = store.conversations
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, MAX_CONVERSATIONS)
  if (!store.conversations.some((entry) => entry.id === store.activeId)) {
    store.activeId = store.conversations[0]?.id ?? id
  }
  return saveStore(repoPath, store, scope)
}

/** 当前活跃对话 id（没有留存时返回 null；不会像 getActiveChat 那样造新对话）。 */
export function getActiveConversationId(repoPath, scope = 'new') {
  return loadStore(repoPath, scope)?.activeId ?? null
}

/** 读某段对话（按 id，不看 activeId）；不存在返回 null。 */
export function getConversation(repoPath, conversationId, scope = 'new') {
  const id = String(conversationId ?? '').trim()
  if (!id) return null
  const store = loadStore(repoPath, scope)
  return store?.conversations?.find((entry) => entry.id === id) ?? null
}

/**
 * 清掉某段对话的"进行中任务"。
 *
 * 任务真正跑完（哪怕组件已经卸载）后必须清掉，否则下次挂载会把它当成
 * "上次被切走的扫描"再跑一遍——截图里两条重复的「已自动重新扫描」就是这么来的。
 */
export function clearConversationJob(repoPath, conversationId, scope = 'new') {
  const id = String(conversationId ?? '').trim()
  if (!id) return false
  const store = loadStore(repoPath, scope)
  const target = store?.conversations?.find((entry) => entry.id === id)
  if (!target?.job) return false
  return Boolean(saveChat(repoPath, id, { job: null }, scope))
}

/** 新建一段对话并切过去。 */
export function startNewChat(repoPath, title = '新对话', scope = 'new') {
  let store = loadStore(repoPath, scope) ?? { version: 2, activeId: null, conversations: [] }
  const conversation = emptyConversation(title)
  // 连续点「新建流程」不应该在历史里堆一串空对话：只保留真正有内容/有任务的
  store.conversations = store.conversations.filter((entry) => (entry.messages?.length ?? 0) > 0
    || entry.job || entry.pending || entry.pendingPlan)
  store.conversations = [conversation, ...store.conversations].slice(0, MAX_CONVERSATIONS)
  store.activeId = conversation.id
  saveStore(repoPath, store, scope)
  return conversation
}

/** 切到某段历史对话。 */
export function selectChat(repoPath, id, scope = 'new') {
  const store = loadStore(repoPath, scope)
  if (!store) return null
  const target = store.conversations.find((entry) => entry.id === id)
  if (!target) return null
  store.activeId = target.id
  saveStore(repoPath, store, scope)
  return target
}

/** 删除某段澄清会话；如果删的是 active，自动切到剩余最近一段（没有就留空由组件创建）。 */
export function deleteChat(repoPath, id, scope = 'new') {
  const targetId = String(id ?? '').trim()
  if (!targetId) return null
  const store = loadStore(repoPath, scope)
  if (!store) return null
  const before = store.conversations.length
  store.conversations = store.conversations.filter((entry) => entry.id !== targetId)
  if (store.conversations.length === before) return store.activeId ?? null
  if (store.activeId === targetId) {
    store.activeId = store.conversations
      .slice()
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]?.id ?? null
  }
  saveStore(repoPath, store, scope)
  return store.activeId ?? null
}

/** 清空某代码库的全部对话留存（调试/重置用）。 */
export function clearChat(repoPath, scope = 'new') {
  const key = chatKey(repoPath, scope)
  MEMORY.delete(key)
  const store = storage()
  try {
    store?.removeItem(STORAGE_PREFIX + key)
    store?.removeItem(LEGACY_PREFIX + key)
  } catch { /* ignore */ }
}
