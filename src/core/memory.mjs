/**
 * 项目记忆（本机、跨流程）：记录“为什么这么做/踩过什么坑/约定是什么”，
 * 与 `.dev-hub` 的流程台账互补——台账记流程事实，记忆记跨流程可复用的经验。
 *
 * 只写本机 profile（~/.dsh/dev-hub/memory/<repo>.json），不提交到代码库；
 * 存储是普通 JSON，方便人工查看/备份，不引入数据库或嵌入模型。
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { extractTokens } from './recon.mjs'

export const MEMORY_VERSION = 1
export const MEMORY_KINDS = ['decision', 'convention', 'pitfall', 'fact', 'note']
export const MAX_MEMORY_ENTRIES = 500
export const MAX_MEMORY_TEXT = 2000
export const MAX_CONTEXT_ENTRIES = 8

export function memoryKey(repo) {
  return createHash('sha1').update(String(repo ?? '')).digest('hex').slice(0, 16)
}

export function memoryPath(dir, repo) {
  return join(dir, `${memoryKey(repo)}.json`)
}

function cleanTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag ?? '').trim().slice(0, 40))
    .filter(Boolean))].slice(0, 12)
}

export function normalizeMemoryEntry(raw, { now = new Date().toISOString() } = {}) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const text = String(value.text ?? '').trim().slice(0, MAX_MEMORY_TEXT)
  if (!text) return null
  return {
    id: String(value.id ?? '').trim() || `mem-${randomUUID()}`,
    at: value.at || now,
    kind: MEMORY_KINDS.includes(value.kind) ? value.kind : 'note',
    text,
    tags: cleanTags(value.tags),
    pinned: value.pinned === true,
    by: String(value.by ?? '').trim().slice(0, 80),
  }
}

export async function loadRepoMemory(dir, repo) {
  if (!dir) return []
  try {
    const raw = JSON.parse(await readFile(memoryPath(dir, repo), 'utf8'))
    if (!raw || raw.version !== MEMORY_VERSION || String(raw.repo) !== String(repo)) return []
    return (Array.isArray(raw.entries) ? raw.entries : []).map((entry) => normalizeMemoryEntry(entry)).filter(Boolean)
  } catch {
    return []
  }
}

export async function saveRepoMemory(dir, repo, entries) {
  if (!dir) return
  const path = memoryPath(dir, repo)
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, JSON.stringify({
    version: MEMORY_VERSION,
    repo: String(repo),
    updatedAt: new Date().toISOString(),
    entries: (entries ?? []).slice(-MAX_MEMORY_ENTRIES),
  }), 'utf8')
  await rename(temp, path)
}

/** 追加一条记忆；同文本重复时返回已存在项，不重复写。 */
export function appendRepoMemory(entries, input) {
  const entry = normalizeMemoryEntry(input)
  if (!entry) throw new Error('记忆内容为空')
  const list = Array.isArray(entries) ? entries : []
  const duplicate = list.find((item) => item.text === entry.text)
  if (duplicate) return { entries: list, entry: duplicate, duplicate: true }
  const next = [...list, entry].slice(-MAX_MEMORY_ENTRIES)
  return { entries: next, entry, duplicate: false }
}

export function forgetRepoMemory(entries, id) {
  const target = String(id ?? '').trim()
  const list = Array.isArray(entries) ? entries : []
  const next = list.filter((entry) => entry.id !== target)
  return { entries: next, removed: list.length - next.length }
}

/** 按描述/问题检索记忆：token 命中 + 置顶/新鲜度加权。 */
export function searchRepoMemory(entries, query, { limit = 8 } = {}) {
  const tokens = extractTokens(query)
  const now = Date.now()
  const rows = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    const text = entry.text.toLowerCase()
    const tags = entry.tags.join(' ').toLowerCase()
    let score = entry.pinned ? 2 : 0
    for (const token of tokens) {
      if (tags.includes(token)) score += 3
      else if (text.includes(token)) score += 1
    }
    const ageDays = Math.max(0, (now - Date.parse(entry.at ?? '')) / 86_400_000 || 0)
    score += 1 / (1 + ageDays / 30)
    if (score > 0 || !tokens.length) rows.push({ ...entry, score: Math.round(score * 100) / 100 })
  }
  rows.sort((left, right) => (right.score - left.score) || String(right.at).localeCompare(String(left.at)))
  return rows.slice(0, Math.max(1, limit))
}

/** Context Pack 注入：置顶优先，其次最近，限制条数与单条长度。 */
export function selectMemoryForContext(entries, { limit = MAX_CONTEXT_ENTRIES } = {}) {
  const list = (Array.isArray(entries) ? entries : []).filter((entry) => entry?.text)
  const pinned = list.filter((entry) => entry.pinned)
  const recent = [...list].filter((entry) => !entry.pinned)
    .sort((left, right) => String(right.at).localeCompare(String(left.at)))
  return [...pinned, ...recent].slice(0, Math.max(1, limit)).map((entry) => ({
    ...entry,
    text: entry.text.length > 300 ? `${entry.text.slice(0, 300)}…` : entry.text,
  }))
}
