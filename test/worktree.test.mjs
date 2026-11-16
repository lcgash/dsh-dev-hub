import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'devhub-worktree-home-'))
process.env.DEVHUB_HOME = home

const {
  ensureFlowWorktree,
  removeFlowWorktree,
  worktreeBranchFor,
  worktreeExists,
  worktreePathFor,
} = await import('../src/core/worktree.mjs')

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-worktree-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'a.txt'), 'base\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

function status(repo) {
  return execFileSync('git', ['status', '--porcelain'], { cwd: repo }).toString().trim()
}

test('worktree：每个流程独立目录/分支，复用且不污染主工作区', async () => {
  const repo = await tempRepo()
  try {
    const item = { id: 'flow-a', workflow: {} }
    const first = await ensureFlowWorktree(repo, item)
    assert.equal(first.created, true)
    assert.equal(first.branch, worktreeBranchFor('flow-a'))
    assert.equal(first.path, worktreePathFor(repo, 'flow-a'))
    assert.ok(await worktreeExists(first.path))
    assert.equal((await readFile(join(first.path, 'a.txt'), 'utf8')), 'base\n')
    // 不是主工作区
    assert.notEqual(first.path, repo)
    assert.ok(first.path.startsWith(home))

    // 两次 ensure 复用同一路径
    const second = await ensureFlowWorktree(repo, { id: 'flow-a', workflow: { worktree: { branch: first.branch, baseCommit: first.baseCommit } } })
    assert.equal(second.created, false)
    assert.equal(second.path, first.path)

    // 在 worktree 改文件，主工作区保持干净；反过来主工作区的未提交改动也不会出现在 worktree
    await writeFile(join(first.path, 'a.txt'), 'flow-a change\n', 'utf8')
    await writeFile(join(repo, 'main-only.txt'), 'main dirty\n', 'utf8')
    assert.equal(status(repo).includes('main-only.txt'), true)
    assert.equal(status(first.path).includes('a.txt'), true)
    assert.equal(status(first.path).includes('main-only.txt'), false)

    // 两个流程分支/目录互不相同
    const other = await ensureFlowWorktree(repo, { id: 'flow-b', workflow: {} })
    assert.notEqual(other.path, first.path)
    assert.notEqual(other.branch, first.branch)

    const removed = await removeFlowWorktree(repo, { id: 'flow-a' })
    assert.equal(removed.removed, true)
    assert.equal(await worktreeExists(first.path), false)
    // 分支仍在，留给合并/人工清理
    const branch = execFileSync('git', ['branch', '--list', first.branch], { cwd: repo }).toString()
    assert.match(branch, new RegExp(first.branch.replace('/', '\\/')))
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('worktree：非 git 仓库明确报错，不假装隔离', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-worktree-plain-'))
  try {
    await assert.rejects(() => ensureFlowWorktree(dir, { id: 'x' }), /不是 git 仓库/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
