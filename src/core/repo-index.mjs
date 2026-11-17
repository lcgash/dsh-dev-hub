/**
 * 本机仓库索引（repo map）：路径 + 语言 + 模块 + 粗粒度 token/符号集合。
 *
 * 目的：需求描述扫描时不再每次都「walk 全仓 + 读每个文本文件」。
 * - 首次/失效时构建一次，后续只做 stat 增量；
 * - 查询时先用 token/符号在内存里筛出候选文件，再让 recon 只读这些文件拿命中行；
 * - 只存 token 集合与符号名，不存文件内容；索引落在本机 profile，不提交到仓库。
 *
 * 这是候选来源，不是事实来源：命中的文件最终仍以磁盘内容为准，读不到/过期就回退全量扫描。
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { repoRelative } from './paths.mjs'
import { extractTokens, walkFiles } from './recon.mjs'

export const REPO_INDEX_VERSION = 1
const INDEX_LIMITS = { maxScan: 20000, maxDepth: 20, maxBytes: 512 * 1024 }
const MAX_FILE_TOKENS = 500
const MAX_FILE_SYMBOLS = 80

export function repoIndexKey(repo) {
  return createHash('sha1').update(String(repo ?? '')).digest('hex').slice(0, 16)
}

export function repoIndexPath(indexDir, repo) {
  return join(indexDir, `${repoIndexKey(repo)}.json`)
}

function addToken(set, value) {
  const token = String(value ?? '').trim().toLowerCase()
  if (token.length < 2 || token.length > 40) return
  set.add(token)
}

/** 从文件内容 + 路径提取检索 token（英文标识符、中文整段/二元组、路径片段）。 */
export function tokenizeFile(relPath, content) {
  const set = new Set()
  const text = String(content ?? '')
  for (const match of text.toLowerCase().matchAll(/[a-z_$][a-z0-9_$.-]{2,}/g)) {
    addToken(set, match[0])
    if (set.size >= MAX_FILE_TOKENS) break
  }
  if (set.size < MAX_FILE_TOKENS) {
    for (const match of text.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
      const run = match[0]
      if (run.length <= 12) addToken(set, run)
      for (let index = 0; index + 2 <= run.length; index += 1) {
        addToken(set, run.slice(index, index + 2))
        if (set.size >= MAX_FILE_TOKENS) break
      }
      if (set.size >= MAX_FILE_TOKENS) break
    }
  }
  for (const part of String(relPath ?? '').toLowerCase().split(/[\\/._-]+/)) addToken(set, part)
  return [...set].slice(0, MAX_FILE_TOKENS)
}

const DECL_RE = /(?:^|\s)(?:class|interface|enum|record|function|def|fn|struct|type)\s+([A-Za-z_$][\w$]*)|(?:^|\s)(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g

/** 声明名 + Markdown 标题：让查询能直接命中「类/函数/文档标题」。 */
export function extractSymbols(content) {
  const set = new Set()
  for (const match of String(content ?? '').matchAll(DECL_RE)) {
    const name = match[1] ?? match[2]
    if (name) set.add(name)
    if (set.size >= MAX_FILE_SYMBOLS) break
  }
  if (set.size < MAX_FILE_SYMBOLS) {
    for (const line of String(content ?? '').split(/\r?\n/)) {
      const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line)
      if (heading?.[1]) set.add(heading[1].trim())
      if (set.size >= MAX_FILE_SYMBOLS) break
    }
  }
  return [...set].slice(0, MAX_FILE_SYMBOLS)
}

/** 读取并校验本机索引；不存在/损坏/版本不符时返回 null。 */
export async function loadRepoIndex(indexDir, repo) {
  if (!indexDir) return null
  try {
    const raw = JSON.parse(await readFile(repoIndexPath(indexDir, repo), 'utf8'))
    if (!raw || raw.version !== REPO_INDEX_VERSION || String(raw.repo) !== String(repo)) return null
    if (!Array.isArray(raw.files)) return null
    return raw
  } catch {
    return null
  }
}

export async function saveRepoIndex(indexDir, repo, index) {
  if (!indexDir) return
  const path = repoIndexPath(indexDir, repo)
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, JSON.stringify(index), 'utf8')
  await rename(temp, path)
}

/**
 * 构建/增量更新索引。previous 里 size+mtime 未变的文件直接复用 token/符号。
 * @returns {Promise<{ index: object, reused: number, added: number, removed: number }>}
 */
export async function buildRepoIndex(repo, { previous = null, indexDir = null, head = null } = {}) {
  const startedAt = Date.now()
  const state = { truncated: false }
  const paths = await walkFiles(repo, INDEX_LIMITS, state)
  const oldFiles = new Map((previous?.files ?? []).map((file) => [file.path, file]))
  const files = []
  let reused = 0
  let added = 0
  const seen = new Set()
  for (const absolute of paths) {
    const rel = repoRelative(repo, absolute)
    seen.add(rel)
    let info
    try {
      info = await stat(absolute)
    } catch {
      continue
    }
    const old = oldFiles.get(rel)
    if (old && old.size === info.size && old.mtimeMs === info.mtimeMs) {
      files.push(old)
      reused += 1
      continue
    }
    const content = await readFile(absolute, 'utf8').catch(() => '')
    files.push({
      path: rel,
      size: info.size,
      mtimeMs: info.mtimeMs,
      lang: extname(rel).slice(1).toLowerCase(),
      tokens: tokenizeFile(rel, content),
      symbols: extractSymbols(content),
    })
    if (!old) added += 1
  }
  const index = {
    version: REPO_INDEX_VERSION,
    repo: String(repo),
    head: head ?? previous?.head ?? null,
    builtAt: Date.now(),
    buildMs: Date.now() - startedAt,
    scanned: paths.length,
    truncated: state.truncated,
    files,
  }
  if (indexDir) await saveRepoIndex(indexDir, repo, index)
  return {
    index,
    reused,
    added,
    removed: [...oldFiles.keys()].filter((path) => !seen.has(path)).length,
  }
}

/**
 * 取可用索引：TTL 内且（可选）HEAD 未变则复用，否则增量重建。
 * 首次调用会构建；调用方应在失败时回退全量扫描。
 */
export async function ensureRepoIndex(repo, { indexDir = null, ttlMs = 5 * 60 * 1000, head = null } = {}) {
  const previous = await loadRepoIndex(indexDir, repo)
  const fresh = previous
    && Date.now() - Number(previous.builtAt ?? 0) < ttlMs
    && (!head || !previous.head || previous.head === head)
  if (fresh) return previous
  const { index } = await buildRepoIndex(repo, { previous, indexDir, head })
  return index
}

const dfCache = new WeakMap()
const tokenSetCache = new WeakMap()

function tokenSetOf(file) {
  let set = tokenSetCache.get(file)
  if (!set) {
    set = new Set(file?.tokens ?? [])
    tokenSetCache.set(file, set)
  }
  return set
}

function dfOf(index) {
  let df = dfCache.get(index)
  if (!df) {
    df = new Map()
    for (const file of index?.files ?? []) {
      for (const token of new Set(file.tokens ?? [])) df.set(token, (df.get(token) ?? 0) + 1)
    }
    dfCache.set(index, df)
  }
  return df
}

/**
 * 按描述检索候选文件（只返回文件路径与分数，不读文件内容）。
 * 命中路径/符号权重更高；内容 token 按 IDF 计分。
 * @returns {Array<{ path: string, score: number }>}
 */
export function queryRepoIndex(index, description, { limit = 300 } = {}) {
  const tokens = extractTokens(description)
  if (!tokens.length || !index?.files?.length) return []
  const df = dfOf(index)
  const total = index.files.length
  const rows = []
  for (const file of index.files) {
    const pathLower = String(file.path ?? '').toLowerCase()
    const symbols = (file.symbols ?? []).map((symbol) => String(symbol).toLowerCase())
    const set = tokenSetOf(file)
    let score = 0
    for (const token of tokens) {
      const idf = 1 + Math.log((total + 1) / ((df.get(token) ?? 0) + 1))
      if (pathLower.includes(token)) score += 5 * idf
      else if (symbols.some((symbol) => symbol.includes(token))) score += 4 * idf
      else if (set.has(token)) score += 1.5 * idf
    }
    if (score > 0) rows.push({ path: file.path, score: Math.round(score * 10) / 10 })
  }
  rows.sort((left, right) => (right.score - left.score) || left.path.localeCompare(right.path))
  return rows.slice(0, Math.max(1, limit))
}
