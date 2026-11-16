/**
 * 流程级变更预览：这个开发流程到底改了哪些文件、每个文件改了什么。
 *
 * 数据来源全部是本地 git（不调模型、不发网络）：
 * - 已提交部分：`baseline..HEAD`
 * - 未提交部分：工作区（含暂存）+ 未跟踪文件
 * 两者按路径合并，标明来源（committed / working / both）。
 *
 * 预览 diff 时以 baseline 为基准（`git diff <baseline> -- <path>`），这样已提交和未提交的
 * 改动都能看到；没有 baseline 时退化为工作区 diff（并明确标注证据不完整）。
 */

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { classifyPath, git, hasCommit } from './git.mjs'

/** 这些是工作站自己的台账，不算"本流程改的文件"（否则会把 .dev-hub/*.json 全列出来）。 */
const EXCLUDE_PREFIXES = ['.dev-hub/']

const MAX_DIFF_LINES = 1200
const MAX_DIFF_BYTES = 400 * 1024
const MAX_FILE_BYTES = 200 * 1024

function lines(text) {
  return String(text ?? '').split(/\r?\n/)
}

function parseNumStat(text) {
  const map = new Map()
  for (const line of lines(text)) {
    if (!line.trim()) continue
    const [added, removed, ...rest] = line.split('\t')
    const path = rest.join('\t').trim()
    if (!path) continue
    map.set(path, {
      added: added === '-' ? null : Number(added) || 0,
      removed: removed === '-' ? null : Number(removed) || 0,
      binary: added === '-' || removed === '-',
    })
  }
  return map
}

function statusType(code) {
  if (code.includes('D')) return 'deleted'
  if (code.includes('A') || code.includes('?')) return 'added'
  if (code.includes('R')) return 'renamed'
  return 'modified'
}

/** 解析 `--name-status` 输出。 */
function parseNameStatus(text) {
  const out = []
  for (const line of lines(text)) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const code = parts[0] ?? ''
    const path = parts[parts.length - 1] ?? ''
    if (path) out.push({ path, code, type: statusType(code) })
  }
  return out
}

/**
 * 汇总一个流程涉及的文件（已提交 + 工作区），并标注是否在 scope 内。
 * @param {string} repo
 * @param {{ commit?: string } | null} baseline
 */
export async function flowFileChanges(repo, baseline) {
  const baselineOk = Boolean(baseline?.commit) && await hasCommit(repo, baseline.commit)
  const headProbe = await git(repo, ['rev-parse', '--short', 'HEAD'])
  const hasHead = headProbe.ok && Boolean(headProbe.stdout.trim())
  // 没有 baseline 时也要能看到"工作区相对 HEAD"的改动（已暂存 + 未暂存）
  const worktreeBase = baselineOk ? baseline.commit : (hasHead ? 'HEAD' : null)

  const [committed, nameStatus, numstat, status, head] = await Promise.all([
    baselineOk ? git(repo, ['diff', '--name-status', `${baseline.commit}..HEAD`]) : Promise.resolve({ ok: true, stdout: '' }),
    worktreeBase
      ? git(repo, ['diff', '--name-status', worktreeBase, '--'])
      : git(repo, ['diff', '--name-status']),
    worktreeBase
      ? git(repo, ['diff', '--numstat', worktreeBase, '--'])
      : git(repo, ['diff', '--numstat']),
    git(repo, ['status', '--porcelain', '-uall']),
    Promise.resolve(headProbe),
  ])
  const byPath = new Map()

  for (const entry of parseNameStatus(committed.stdout)) {
    byPath.set(entry.path, { ...entry, origin: 'committed' })
  }
  for (const entry of parseNameStatus(nameStatus.stdout)) {
    const existing = byPath.get(entry.path)
    byPath.set(entry.path, {
      ...entry,
      origin: existing ? 'both' : 'working',
    })
  }

  // 未跟踪文件：git diff 看不到，单独补进来
  const untracked = []
  for (const line of lines(status.stdout)) {
    if (!line.trim()) continue
    const code = line.slice(0, 2)
    const path = line.slice(3).trim()
    if (!path) continue
    if (code.includes('?')) {
      untracked.push(path)
      byPath.set(path, { path, code: '??', type: 'added', origin: 'working' })
    }
  }

  const stats = parseNumStat(numstat.stdout)
  const files = []
  for (const entry of byPath.values()) {
    let { added, removed, binary } = stats.get(entry.path) ?? {}
    if (entry.type === 'added' && untracked.includes(entry.path) && added === undefined) {
      // 未跟踪文件：按行数估算新增
      try {
        const info = await stat(join(repo, entry.path))
        if (info.size > MAX_FILE_BYTES) { binary = true } else {
          const content = await readFile(join(repo, entry.path), 'utf8').catch(() => '')
          added = content ? content.split(/\r?\n/).length : 0
          removed = 0
        }
      } catch {
        added = 0
        removed = 0
      }
    }
    files.push({
      path: entry.path,
      status: entry.type,
      origin: entry.origin,
      added: added ?? 0,
      removed: removed ?? 0,
      binary: Boolean(binary),
      group: classifyPath(entry.path),
    })
  }
  files.sort((a, b) => a.path.localeCompare(b.path))

  // 台账/工作站数据不算代码变更：从清单和统计里都剔除
  const excluded = files.filter((file) => EXCLUDE_PREFIXES.some((prefix) => file.path.startsWith(prefix)))
  const kept = files.filter((file) => !EXCLUDE_PREFIXES.some((prefix) => file.path.startsWith(prefix)))

  const totals = kept.reduce((acc, file) => ({
    files: acc.files + 1,
    added: acc.added + (file.binary ? 0 : file.added),
    removed: acc.removed + (file.binary ? 0 : file.removed),
    binary: acc.binary + (file.binary ? 1 : 0),
  }), { files: 0, added: 0, removed: 0, binary: 0 })

  return {
    evidenceComplete: baselineOk,
    reason: baselineOk ? null : (baseline?.commit
      ? `本机找不到 baseline commit ${baseline.commit}（浅克隆或分支已删除），下面只显示工作区改动`
      : '该开发项还没有 baseline，下面只显示工作区改动'),
    baseCommit: baseline?.commit ?? null,
    headCommit: head.stdout.trim() || null,
    files: kept,
    totals,
    excludedCount: excluded.length,
  }
}

/** 把 unified diff 解析成带类型标签的行，供界面着色。 */
export function parseUnifiedDiff(text) {
  const out = []
  for (const line of lines(text)) {
    let type = 'context'
    if (line.startsWith('@@')) type = 'hunk'
    else if (line.startsWith('+++') || line.startsWith('---')) type = 'meta'
    else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) type = 'meta'
    else if (line.startsWith('+')) type = 'added'
    else if (line.startsWith('-')) type = 'removed'
    out.push({ type, text: line })
  }
  return out
}

/**
 * 单个文件的 diff（以 baseline 为基准；没有 baseline 时看工作区）。
 * @param {string} repo
 * @param {{ path: string, baseline?: { commit?: string } | null, maxLines?: number }} input
 */
export async function fileDiff(repo, { path, baseline, maxLines = MAX_DIFF_LINES }) {
  const target = String(path ?? '').trim()
  if (!target || target.includes('..')) throw new Error('非法的文件路径')

  const baselineOk = Boolean(baseline?.commit) && await hasCommit(repo, baseline.commit)
  const tracked = (await git(repo, ['ls-files', '--error-unmatch', target])).ok
  let raw = ''
  let mode = baselineOk && tracked ? 'baseline' : 'worktree'

  if (mode === 'baseline') {
    const diff = await git(repo, ['diff', '--no-color', baseline.commit, '--', target], { timeout: 15000 })
    raw = diff.stdout
  } else if (tracked) {
    const [unstaged, staged] = await Promise.all([
      git(repo, ['diff', '--no-color', '--', target], { timeout: 15000 }),
      git(repo, ['diff', '--no-color', '--cached', '--', target], { timeout: 15000 }),
    ])
    raw = [staged.stdout, unstaged.stdout].filter(Boolean).join('\n')
  }

  // 未跟踪文件：整份内容当"新增"展示（有上限）
  if (!raw) {
    try {
      const info = await stat(join(repo, target))
      if (info.isDirectory()) {
        return { path: target, mode, binary: false, truncated: false, lines: [], message: '目录，不显示内容', added: 0, removed: 0 }
      }
      if (!tracked) {
        if (info.size > MAX_FILE_BYTES) return { path: target, mode: 'untracked', binary: false, truncated: true, lines: [], message: '文件超过预览上限' }
        const content = await readFile(join(repo, target), 'utf8')
        const contentLines = content.split(/\r?\n/)
        if (contentLines.at(-1) === '') contentLines.pop() // 末尾换行不算一行
        const body = contentLines.slice(0, maxLines).map((line) => ({ type: 'added', text: `+${line}` }))
        return {
          path: target,
          mode: 'untracked',
          binary: false,
          truncated: contentLines.length > maxLines,
          lines: body,
          added: body.length,
          removed: 0,
        }
      }
      if (info.size > MAX_FILE_BYTES) {
        return { path: target, mode, binary: true, truncated: true, lines: [], message: '二进制或过大文件，不显示内容' }
      }
    } catch {
      return { path: target, mode, binary: false, truncated: false, lines: [], message: '文件不存在（可能已删除）', added: 0, removed: 0 }
    }
    return { path: target, mode, binary: false, truncated: false, lines: [], message: '该文件相对 baseline 没有差异', added: 0, removed: 0 }
  }

  const bytes = Buffer.byteLength(raw, 'utf8')
  let allLines = parseUnifiedDiff(raw)
  const added = allLines.filter((line) => line.type === 'added').length
  const removed = allLines.filter((line) => line.type === 'removed').length
  let truncated = false
  if (bytes > MAX_DIFF_BYTES || allLines.length > maxLines) {
    allLines = allLines.slice(0, maxLines)
    truncated = true
  }
  return { path: target, mode, binary: false, truncated, lines: allLines, added, removed }
}
