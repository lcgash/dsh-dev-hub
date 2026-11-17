import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const {
  appendRepoMemory,
  forgetRepoMemory,
  loadRepoMemory,
  saveRepoMemory,
  searchRepoMemory,
  selectMemoryForContext,
} = await import('../src/core/memory.mjs')

const REPO = '/repo/memory-test'

test('memory：写入/持久化/读取 roundtrip，重复文本不重复写', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-memory-'))
  try {
    let entries = await loadRepoMemory(dir, REPO)
    assert.deepEqual(entries, [])

    const first = appendRepoMemory(entries, { text: 'DOCKERFILE_PATH 的 URL 下载失败要回滚临时文件', kind: 'pitfall', tags: ['image-build'] })
    entries = first.entries
    assert.equal(first.entry.kind, 'pitfall')
    assert.equal(first.duplicate, false)

    const again = appendRepoMemory(entries, { text: 'DOCKERFILE_PATH 的 URL 下载失败要回滚临时文件' })
    assert.equal(again.duplicate, true, '同文本不重复写')
    assert.equal(again.entries.length, 1)

    await saveRepoMemory(dir, REPO, entries)
    const loaded = await loadRepoMemory(dir, REPO)
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].text, first.entry.text)
    assert.deepEqual(loaded[0].tags, ['image-build'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('memory：检索按 token 命中与置顶/新鲜度排序，forget 删除指定项', () => {
  const entries = [
    { id: 'm1', at: '2026-11-01T00:00:00.000Z', kind: 'decision', text: '本仓库统一用 mvn -o clean test', tags: ['test'], pinned: false },
    { id: 'm2', at: '2026-11-10T00:00:00.000Z', kind: 'convention', text: 'Dockerfile 下载统一走 HttpFetcher，不新写 HTTP 客户端', tags: ['image-build', 'http'], pinned: true },
    { id: 'm3', at: '2026-11-12T00:00:00.000Z', kind: 'note', text: '镜像构建的临时目录要清理', tags: ['image-build'], pinned: false },
  ]
  const hits = searchRepoMemory(entries, 'Dockerfile 镜像下载', { limit: 2 })
  assert.equal(hits[0].id, 'm2', '置顶 + 标签命中排第一')
  assert.ok(hits.some((entry) => entry.id === 'm3'))

  const empty = searchRepoMemory(entries, '', { limit: 10 })
  assert.equal(empty.length, 3, '无检索词时列全部')

  const after = forgetRepoMemory(entries, 'm1')
  assert.equal(after.removed, 1)
  assert.deepEqual(after.entries.map((entry) => entry.id), ['m2', 'm3'])
})

test('memory：Context Pack 只带置顶 + 最近，限制条数与长度', () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    id: `m${index}`,
    at: `2026-11-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    kind: 'note',
    text: `记忆 ${index} ${'x'.repeat(index === 11 ? 400 : 0)}`,
    tags: [],
    pinned: index === 2,
  }))
  const picked = selectMemoryForContext(entries)
  assert.equal(picked.length, 8)
  assert.equal(picked[0].id, 'm2', '置顶优先')
  assert.ok(picked.find((entry) => entry.id === 'm11').text.length <= 301, '超长记忆截断')
})
