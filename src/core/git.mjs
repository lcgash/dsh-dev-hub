import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Run one git command in a fixed repo with argv (never a shell string). */
export async function git(repo, args, options = {}) {
  try {
    const result = await execFileAsync('git', ['-C', repo, ...args], {
      timeout: options.timeout ?? 8000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: process.env,
    })
    return { ok: true, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') }
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout ?? ''),
      stderr: String(error?.stderr ?? error?.message ?? ''),
    }
  }
}

function lines(text) {
  return String(text ?? '').split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean)
}

/** Parse porcelain v1 status into browser-safe entries. */
export function parseStatus(text) {
  const entries = []
  for (const line of lines(text)) {
    const code = line.slice(0, 2)
    let path = line.slice(3).trim()
    if (path.includes(' -> ')) path = path.split(' -> ').pop().trim()
    if (!path) continue
    entries.push({ path, code, type: statusType(code) })
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path))
}

function statusType(code) {
  if (code.includes('D')) return 'deleted'
  if (code.includes('A') || code.includes('?')) return 'added'
  if (code.includes('R')) return 'renamed'
  return 'modified'
}

/** Classify a changed file for the context pack. */
export function classifyPath(path) {
  const p = String(path).replace(/\\/g, '/')
  if (/^src\/main\/java\/.*\/controller\//.test(p) || p.startsWith('request-tests/')) return 'contract'
  if (p.includes('/db/migration/') || p.includes('/db/dm-migration/') || p.startsWith('src/main/resources/db/')) return 'database'
  if (p.startsWith('src/main/java/') && p.includes('/source/')) return 'source'
  if (p.startsWith('src/main/java/') && p.includes('/architecture/')) return 'architecture'
  if (p.startsWith('src/main/resources/') || p.includes('/config/')) return 'config'
  if (p.startsWith('docs/') || p.startsWith('README') || p.startsWith('AGENTS')) return 'docs'
  if (p.startsWith('tools/dsh-dev-hub/')) return 'plugin'
  return 'code'
}

/** Current branch, HEAD, working-tree state and recent commits. */
export async function gitInfo(repo) {
  const [branch, head, status, log] = await Promise.all([
    git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(repo, ['rev-parse', '--short', 'HEAD']),
    git(repo, ['status', '--porcelain=v1', '--untracked-files=all']),
    git(repo, ['log', '-n', '10', '--pretty=format:%h%x09%an%x09%ad%x09%s', '--date=short']),
  ])
  if (!branch.ok && !head.ok && !status.ok) {
    return { available: false, branch: null, head: null, changes: [], commits: [], clean: true }
  }
  const changes = parseStatus(status.stdout)
  return {
    available: true,
    branch: branch.ok ? branch.stdout.trim() : null,
    head: head.ok ? head.stdout.trim() : null,
    changes,
    clean: changes.length === 0,
    commits: lines(log.stdout).map((line) => {
      const [hash, author, date, ...subject] = line.split('\t')
      return { hash, author, date, subject: subject.join('\t') }
    }),
    shortStat: status.ok ? changeSummary(changes) : null,
  }
}

function changeSummary(changes) {
  const counts = {}
  for (const change of changes) counts[change.type] = (counts[change.type] ?? 0) + 1
  return counts
}

/** Snapshot used when a development item starts. */
export async function startBaseline(repo) {
  const info = await gitInfo(repo)
  return {
    startedAt: new Date().toISOString(),
    commit: info.head ?? null,
    branch: info.branch ?? null,
  }
}

/** Whether a commit-ish exists in this repo. */
export async function hasCommit(repo, commit) {
  if (!commit) return false
  const result = await git(repo, ['cat-file', '-e', `${commit}^{commit}`])
  return result.ok
}

/** 是否在一个 git 工作区里（非 git 仓库没有提交/推送流程）。 */
export async function isGitRepo(repo) {
  const result = await git(repo, ['rev-parse', '--is-inside-work-tree'])
  return result.ok && result.stdout.trim() === 'true'
}

/** Parse `git diff --name-status` output. */
export function parseNameStatus(text) {
  return lines(text).map((line) => {
    const parts = line.split('\t')
    const status = parts[0] ?? ''
    const path = parts[parts.length - 1] ?? ''
    return { path, code: status, type: statusType(status) }
  }).filter((entry) => entry.path)
}

/**
 * Changes since a baseline. When the baseline commit is missing (shallow
 * clone, rebase, deleted branch), return the working tree with an explicit
 * incomplete flag rather than pretending it is a full diff.
 */
export async function changesSince(repo, baseline) {
  if (!baseline?.commit) {
    const info = await gitInfo(repo)
    return {
      evidenceComplete: false,
      reason: '该开发项还没有 baseline commit',
      changes: info.changes,
      commits: [],
      stat: info.shortStat,
      baseCommit: null,
      headCommit: info.head,
    }
  }
  if (!(await hasCommit(repo, baseline.commit))) {
    const info = await gitInfo(repo)
    return {
      evidenceComplete: false,
      reason: `本机找不到 baseline commit ${baseline.commit}（浅克隆、rebase 或分支已不存在）`,
      changes: info.changes,
      commits: [],
      stat: info.shortStat,
      baseCommit: baseline.commit,
      headCommit: info.head,
    }
  }
  const [diff, log, stat] = await Promise.all([
    git(repo, ['diff', '--name-status', `${baseline.commit}..HEAD`]),
    git(repo, ['log', '--pretty=format:%h%x09%an%x09%ad%x09%s', '--date=short', `${baseline.commit}..HEAD`]),
    git(repo, ['diff', '--stat', `${baseline.commit}..HEAD`]),
  ])
  const changes = parseNameStatus(diff.stdout)
  return {
    evidenceComplete: diff.ok,
    reason: diff.ok ? null : 'git diff 执行失败',
    changes: changes.sort((a, b) => a.path.localeCompare(b.path)),
    commits: lines(log.stdout).map((line) => {
      const [hash, author, date, ...subject] = line.split('\t')
      return { hash, author, date, subject: subject.join('\t') }
    }),
    stat: changeSummary(changes),
    baseCommit: baseline.commit,
    headCommit: (await git(repo, ['rev-parse', '--short', 'HEAD'])).stdout.trim() || null,
    diffStat: stat.stdout.trim(),
  }
}

/** Group changes by stable semantic category. */
export function groupChanges(changes) {
  const groups = {}
  for (const change of changes) {
    const key = classifyPath(change.path)
    ;(groups[key] ??= []).push(change)
  }
  for (const key of Object.keys(groups)) groups[key].sort((a, b) => a.path.localeCompare(b.path))
  return groups
}

/**
 * 拉取当前分支的上游并快进合并（开发前同步用）。
 * 只做 fetch + merge --ff-only：有本地改动/分叉时明确失败，不自动 rebase/reset。
 */
export async function syncRepo(repo) {
  const before = await gitInfo(repo)
  const fetch = await git(repo, ['fetch', '--all', '--prune'], { timeout: 120000 })
  if (!fetch.ok) {
    return {
      ok: false,
      branch: before.branch,
      before: before.head,
      after: before.head,
      updated: false,
      error: `git fetch 失败：${(fetch.stderr || fetch.stdout).slice(-1000)}`,
      output: (fetch.stderr || fetch.stdout).slice(-4000),
    }
  }
  const upstreamProbe = await git(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  if (!upstreamProbe.ok) {
    return {
      ok: false,
      branch: before.branch,
      before: before.head,
      after: before.head,
      updated: false,
      error: '当前分支没有 upstream，无法确定要拉取哪个远端分支',
      output: (upstreamProbe.stderr || upstreamProbe.stdout).slice(-2000),
    }
  }
  const upstream = upstreamProbe.stdout.trim()
  const merge = await git(repo, ['merge', '--ff-only', upstream], { timeout: 120000 })
  const after = await gitInfo(repo)
  return {
    ok: merge.ok,
    branch: after.branch ?? before.branch,
    upstream,
    before: before.head,
    after: after.head,
    updated: Boolean(before.head && after.head && before.head !== after.head),
    error: merge.ok ? null : `快进合并失败：${(merge.stderr || merge.stdout).slice(-1200)}`,
    output: `${merge.stdout}${merge.stderr}`.trim().slice(-4000),
  }
}
