import assert from 'node:assert/strict'
import test from 'node:test'

const { autoFileNote, fileNoteOf } = await import('../src/core/file-notes.mjs')

const item = {
  scope: ['src/main/java/com/gitee/pipeline/source'],
  recon: { files: [{ path: 'src/main/java/com/gitee/pipeline/source/GitlabCodeProvider.java', why: 'webhook 主落点' }] },
  workflow: { plan: { template: { id: 'source-provider' } } },
  fileNotes: {},
}

test('autoFileNote：探测命中的文件用探测里的 why', () => {
  const note = autoFileNote({ path: 'src/main/java/com/gitee/pipeline/source/GitlabCodeProvider.java', group: 'source' }, item)
  assert.match(note, /探测命中：webhook 主落点/)
})

test('autoFileNote：按分组给出确定性的解释', () => {
  assert.match(autoFileNote({ path: 'src/test/java/A.java', group: 'code' }, item), /测试/)
  assert.match(autoFileNote({ path: 'docs/x.md', group: 'docs' }, item), /文档/)
  assert.match(autoFileNote({ path: 'src/main/resources/db/migration/V1.sql', group: 'database' }, item), /库表|迁移/)
  assert.match(autoFileNote({ path: 'src/main/java/x/controller/A.java', group: 'contract' }, item), /接口契约/)
  assert.match(autoFileNote({ path: 'src/main/java/x/source/A.java', group: 'source' }, item), /模板触点：源适配/)
  assert.match(autoFileNote({ path: '.dev-hub/items/a.json', group: 'code' }, item), /流程台账/)
  assert.match(autoFileNote({ path: 'elsewhere/x.java', group: 'code', inScope: false }, item), /scope 外/)
})

test('fileNoteOf：人工说明优先于默认解释，并给出来源', () => {
  const file = { path: 'README.md', group: 'docs' }
  const auto = fileNoteOf(file, item)
  assert.equal(auto.source, 'auto')
  assert.match(auto.note, /文档/)

  const withNote = fileNoteOf(file, { ...item, fileNotes: { 'README.md': { note: '补充了安装说明', source: 'human' } } })
  assert.equal(withNote.source, 'human')
  assert.equal(withNote.note, '补充了安装说明')
})

test('autoFileNote：同一输入多次结果一致（确定性）', () => {
  const file = { path: 'src/main/java/x/source/A.java', group: 'source' }
  assert.equal(autoFileNote(file, item), autoFileNote(file, item))
})


test('store 归一化：fileNotes 保留 agent 来源与版本签名', async () => {
  const { sanitizeItem } = await import('../src/core/store.mjs')
  const item = sanitizeItem({
    id: 'x', title: 't',
    fileNotes: {
      'a/b.java': { note: '注册新源', source: 'agent', sig: 'p|m|12|3' },
      'c/d.md': { note: '补文档', source: 'human' },
      'e/f.js': { note: 'x', source: 'unknown' },
    },
  })
  assert.equal(item.fileNotes['a/b.java'].source, 'agent')
  assert.equal(item.fileNotes['a/b.java'].sig, 'p|m|12|3')
  assert.equal(item.fileNotes['c/d.md'].source, 'human')
  assert.equal(item.fileNotes['e/f.js'].source, 'human', '未知来源按人工处理')
})
