import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const { flowFileChanges, fileDiff, parseUnifiedDiff } = await import('../src/core/diff.mjs')

async function repoWithCommits() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-diff-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir })
  await mkdir(join(dir, 'src'), { recursive: true })
  await writeFile(join(dir, 'src/a.txt'), 'one\ntwo\nthree\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim()
  return { dir, base }
}

test('flowFileChanges：已提交 + 工作区 + 未跟踪，按路径合并并标注来源', async () => {
  const { dir, base } = await repoWithCommits()
  try {
    // 已提交的修改
    await writeFile(join(dir, 'src/a.txt'), 'one\nTWO\nthree\n', 'utf8')
    execFileSync('git', ['commit', '-qam', 'change a'], { cwd: dir })
    // 工作区修改 + 新增未跟踪
    await writeFile(join(dir, 'src/b.txt'), 'new file\n', 'utf8')
    await writeFile(join(dir, 'src/a.txt'), 'one\nTWO\nthree\nfour\n', 'utf8')

    const result = await flowFileChanges(dir, { commit: base })
    assert.equal(result.evidenceComplete, true)
    const a = result.files.find((file) => file.path === 'src/a.txt')
    assert.equal(a.origin, 'both', '既有提交又有未提交改动')
    const b = result.files.find((file) => file.path === 'src/b.txt')
    assert.equal(b.status, 'added')
    assert.equal(b.origin, 'working')
    assert.ok(b.added >= 1, '未跟踪文件应估算新增行数')
    assert.ok(result.totals.files >= 2)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('fileDiff：以 baseline 为基准，能同时看到已提交和未提交改动', async () => {
  const { dir, base } = await repoWithCommits()
  try {
    await writeFile(join(dir, 'src/a.txt'), 'one\nTWO\nthree\n', 'utf8')
    execFileSync('git', ['commit', '-qam', 'change a'], { cwd: dir })
    await writeFile(join(dir, 'src/a.txt'), 'one\nTWO\nthree\nfour\n', 'utf8')

    const file = await fileDiff(dir, { path: 'src/a.txt', baseline: { commit: base } })
    assert.equal(file.mode, 'baseline')
    const added = file.lines.filter((line) => line.type === 'added').map((line) => line.text)
    assert.ok(added.some((text) => text.includes('TWO')), '包含已提交的新增')
    assert.ok(added.some((text) => text.includes('four')), '包含未提交的新增')
    assert.ok(file.removed >= 1, '包含删除行')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('fileDiff：未跟踪文件按新增展示；没有 baseline 时退化工作区', async () => {
  const { dir } = await repoWithCommits()
  try {
    await writeFile(join(dir, 'src/new.txt'), 'hello\nworld\n', 'utf8')
    const untracked = await fileDiff(dir, { path: 'src/new.txt', baseline: null })
    assert.equal(untracked.mode, 'untracked')
    assert.ok(untracked.lines.every((line) => line.type === 'added'))
    assert.equal(untracked.added, 2)

    await writeFile(join(dir, 'src/a.txt'), 'one\ntwo\nthree\nfour\n', 'utf8')
    const worktree = await fileDiff(dir, { path: 'src/a.txt', baseline: null })
    assert.equal(worktree.mode, 'worktree')
    assert.ok(worktree.lines.some((line) => line.type === 'added' && line.text.includes('four')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('fileDiff：非法路径/不存在文件给明确结果，不抛给界面', async () => {
  const { dir, base } = await repoWithCommits()
  try {
    await assert.rejects(() => fileDiff(dir, { path: '../etc/passwd', baseline: { commit: base } }), /非法的文件路径/)
    const missing = await fileDiff(dir, { path: 'src/nope.txt', baseline: { commit: base } })
    assert.equal(missing.lines.length, 0)
    assert.match(missing.message, /不存在/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('parseUnifiedDiff：行类型标注（+/-/@@/meta/context）', () => {
  const parsed = parseUnifiedDiff([
    'diff --git a/x b/x',
    '--- a/x',
    '+++ b/x',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    ' same',
  ].join('\n'))
  assert.deepEqual(parsed.map((line) => line.type), ['meta', 'meta', 'meta', 'hunk', 'removed', 'added', 'context'])
})

test('flowFileChanges：台账目录（.dev-hub/）不计入流程变更', async () => {
  const { dir, base } = await repoWithCommits()
  try {
    await mkdir(join(dir, '.dev-hub', 'items'), { recursive: true })
    await writeFile(join(dir, '.dev-hub/items/x.json'), '{"id":"x"}\n', 'utf8')
    await writeFile(join(dir, 'src/a.txt'), 'one\nTWO\nthree\n', 'utf8')
    const result = await flowFileChanges(dir, { commit: base })
    assert.ok(result.files.every((file) => !file.path.startsWith('.dev-hub/')), '台账不应出现在变更里')
    assert.ok(result.files.some((file) => file.path === 'src/a.txt'))
    assert.equal(result.excludedCount, 1)
    assert.equal(result.totals.files, result.files.length, '统计只算保留的文件')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
