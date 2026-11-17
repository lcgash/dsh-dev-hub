import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const {
  buildRepoIndex,
  ensureRepoIndex,
  loadRepoIndex,
  queryRepoIndex,
  repoIndexKey,
  saveRepoIndex,
  tokenizeFile,
} = await import('../src/core/repo-index.mjs')

async function tempRepo() {
  const repo = await mkdtemp(join(tmpdir(), 'devhub-index-'))
  await mkdir(join(repo, 'src/main/java/com/demo/source'), { recursive: true })
  await mkdir(join(repo, 'src/main/java/com/demo/model'), { recursive: true })
  await mkdir(join(repo, 'node_modules/pkg'), { recursive: true })
  await writeFile(join(repo, 'src/main/java/com/demo/source/Worker.java'), [
    'package com.demo.source;',
    'public class Worker {',
    '  // 下载 Dockerfile 并构建镜像',
    '  String DOCKERFILE_PATH;',
    '  void downloadDockerfile() {}',
    '}',
  ].join('\n'), 'utf8')
  await writeFile(join(repo, 'src/main/java/com/demo/model/User.java'), 'public class User { String name; }\n', 'utf8')
  await writeFile(join(repo, 'node_modules/pkg/ignored.js'), 'dockerfile download\n', 'utf8')
  await writeFile(join(repo, 'README.md'), '# 镜像构建\n支持 http 下载 Dockerfile\n', 'utf8')
  return repo
}

test('repo-index：构建时跳过 node_modules，记录 token/符号，查询命中相关文件', async () => {
  const repo = await tempRepo()
  const indexDir = join(repo, '.index-cache')
  const { index } = await buildRepoIndex(repo, { indexDir })
  try {
    assert.equal(index.version, 1)
    assert.ok(index.files.some((file) => file.path.endsWith('Worker.java')))
    assert.ok(!index.files.some((file) => file.path.includes('node_modules')), '依赖目录不索引')
    const worker = index.files.find((file) => file.path.endsWith('Worker.java'))
    assert.ok(worker.tokens.includes('dockerfile'))
    assert.ok(worker.symbols.includes('Worker'))

    const candidates = queryRepoIndex(index, '支持 Dockerfile 远程下载并构建镜像')
    assert.ok(candidates.length >= 2)
    assert.ok(candidates.some((entry) => /Worker\.java$/.test(entry.path)), '命中 Dockerfile 的源码文件要在候选里')
    assert.ok(candidates.some((entry) => /README\.md$/.test(entry.path)), '文档命中也要保留')

    const loaded = await loadRepoIndex(indexDir, repo)
    assert.ok(loaded)
    assert.equal(loaded.files.length, index.files.length)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('repo-index：增量构建复用未变文件、只重读变更文件', async () => {
  const repo = await tempRepo()
  try {
    const first = await buildRepoIndex(repo, {})
    assert.ok(first.reused === 0)

    const second = await buildRepoIndex(repo, { previous: first.index })
    assert.equal(second.reused, first.index.files.length, '未变文件全部复用')

    const target = join(repo, 'src/main/java/com/demo/source/Worker.java')
    await writeFile(target, 'public class Worker { void deploy() {} }\n', 'utf8')
    const third = await buildRepoIndex(repo, { previous: second.index })
    assert.ok(third.reused < first.index.files.length, '变更文件被重读')
    const changed = third.index.files.find((file) => file.path.endsWith('Worker.java'))
    assert.ok(changed.tokens.includes('deploy'))
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('repo-index：ensure 在 TTL 内复用，过期后重建；保存/加载 roundtrip', async () => {
  const repo = await tempRepo()
  const indexDir = join(repo, '.index-cache')
  try {
    const first = await ensureRepoIndex(repo, { indexDir, ttlMs: 60_000 })
    const second = await ensureRepoIndex(repo, { indexDir, ttlMs: 60_000 })
    assert.equal(second.builtAt, first.builtAt, 'TTL 内不重建')

    const empty = await loadRepoIndex(indexDir, '/repo/not-indexed')
    assert.equal(empty, null)
    assert.equal(repoIndexKey(repo), repoIndexKey(repo))

    await saveRepoIndex(indexDir, repo, { ...first, builtAt: 1 })
    const stale = await ensureRepoIndex(repo, { indexDir, ttlMs: 1 })
    assert.notEqual(stale.builtAt, 1, '过期后重建')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('tokenizeFile：中文整段/二元组与路径片段都会进索引', () => {
  const tokens = tokenizeFile('src/镜像/BuildService.java', '下载 Dockerfile 并构建镜像')
  assert.ok(tokens.includes('dockerfile'))
  assert.ok(tokens.includes('镜像'))
  assert.ok(tokens.includes('buildservice'))
  assert.ok(tokens.includes('下载'))
})
