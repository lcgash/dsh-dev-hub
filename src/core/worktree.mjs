/**
 * 每个开发流程一个独立 git worktree + 分支。
 *
 * 背景：同一仓库的多个流程如果共用一个工作区，A 的未提交改动会出现在 B 的变更列表里，
 * A 的提交也会被 B 算进自己的 baseline..HEAD，测试/提交同样互相影响。scope 只能判断
 * "路径归谁"，无法隔离真实工作区。
 *
 * 这里只负责单代码库的独立工作区生命周期；台账仍写仓库 `.dev-hub`：
 * - 绝对路径只在本机推导（`~/.dsh/dev-hub/worktrees/<repo-hash>/<item-id>`），不写进仓库台账；
 * - 台账只记 `workflow.worktree = { branch, baseCommit, createdAt }`，换机后路径可重新生成；
 * - 分支从仓库 HEAD（或显式 baseCommit）创建，名字 `devhub/<item-id>`。
 */

import { createHash } from 'node:crypto'
import { access, mkdir, rm, symlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { git, hasCommit, isGitRepo } from './git.mjs'
import { safeId } from './paths.mjs'

export function worktreeRoot() {
  return join(process.env.DEVHUB_HOME || join(homedir(), '.dsh', 'dev-hub'), 'worktrees')
}

/** 本机稳定的 worktree 路径：同一 repo + item 永远落同一目录，不写进仓库。 */
export function worktreePathFor(repo, itemId) {
  const repoHash = createHash('sha1').update(String(repo ?? '')).digest('hex').slice(0, 10)
  return join(worktreeRoot(), repoHash, safeId(itemId, 'item'))
}

export function worktreeBranchFor(itemId) {
  return `devhub/${safeId(itemId, 'item')}`
}

export async function worktreeExists(path) {
  if (!path) return false
  try {
    await access(join(path, '.git'))
    return true
  } catch {
    return false
  }
}

/** 仓库里的 worktree 元数据（台账里只存 branch/baseCommit，不存绝对路径）。 */
export function worktreeOf(item) {
  const value = item?.workflow?.worktree
  if (!value || typeof value !== 'object' || !value.branch) return null
  return {
    branch: String(value.branch),
    baseCommit: value.baseCommit ? String(value.baseCommit) : null,
    createdAt: value.createdAt ?? null,
  }
}

async function branchExists(repo, branch) {
  return (await git(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])).ok
}

/**
 * 确保流程有独立 worktree。
 * - 已有且目录存在：直接复用；
 * - 目录存在但分支元数据丢失：抛错，不静默退回主工作区；
 * - 新建：从 baseCommit（若本机存在）或 HEAD 建分支，避免把别的流程未提交改动带进来。
 */
export async function ensureFlowWorktree(repo, item, { baseCommit = null } = {}) {
  if (!(await isGitRepo(repo))) throw new Error('不是 git 仓库，无法创建独立工作区')
  const meta = worktreeOf(item)
  const branch = meta?.branch || worktreeBranchFor(item?.id)
  const path = worktreePathFor(repo, item?.id)
  if (await worktreeExists(path)) {
    return { path, branch, baseCommit: meta?.baseCommit ?? null, createdAt: meta?.createdAt ?? null, created: false }
  }
  // 目录残留（不是有效 worktree）就清掉，避免 git worktree add 失败
  await rm(path, { recursive: true, force: true })
  await mkdir(dirname(path), { recursive: true })

  const hasBase = Boolean(baseCommit) && await hasCommit(repo, baseCommit)
  const base = hasBase ? baseCommit : 'HEAD'
  const exists = await branchExists(repo, branch)
  const args = exists
    ? ['worktree', 'add', path, branch]
    : ['worktree', 'add', '-b', branch, path, base]
  const result = await git(repo, args, { timeout: 120000 })
  if (!result.ok) {
    throw new Error(`创建独立工作区失败（${branch}）：${(result.stderr || result.stdout).slice(-2000)}`)
  }
  // 本机依赖缓存通常不进 git：给 Node/Python 工作区链过去，避免每个 worktree 重新装一遍；
  // 不链 target/dist 这类构建产物，避免并发构建互相覆盖。
  for (const name of ['node_modules', '.venv']) {
    const source = join(repo, name)
    const target = join(path, name)
    try {
      await access(source)
      await symlink(source, target, 'dir')
    } catch { /* 没有或已存在，跳过 */ }
  }
  const head = (await git(path, ['rev-parse', '--short', 'HEAD'])).stdout.trim() || null
  return {
    path,
    branch,
    baseCommit: head,
    createdAt: new Date().toISOString(),
    created: true,
  }
}

/** 删除 worktree（只删本机目录与登记，不删分支/提交；分支留给合并或人工清理）。 */
export async function removeFlowWorktree(repo, item, { force = true } = {}) {
  const path = worktreePathFor(repo, item?.id)
  if (!(await worktreeExists(path))) return { removed: false, path }
  const args = ['worktree', 'remove', path]
  if (force) args.push('--force')
  const result = await git(repo, args)
  if (!result.ok) throw new Error(`删除独立工作区失败：${(result.stderr || result.stdout).slice(-2000)}`)
  return { removed: true, path }
}
