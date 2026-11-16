import assert from 'node:assert/strict'
import test from 'node:test'

const { buildFileNotePrompt, applyAgentNotes, filesNeedingNotes, noteSignature } = await import('../src/core/file-note-agent.mjs')

const files = [
  { path: 'src/main/java/x/source/A.java', status: 'modified', origin: 'both', added: 12, removed: 3, noteSource: 'auto' },
  { path: 'README.md', status: 'added', origin: 'working', added: 5, removed: 0, noteSource: 'auto' },
]

test('noteSignature：路径/状态/增删行变化 → 签名变化', () => {
  assert.equal(noteSignature(files[0]), noteSignature({ ...files[0] }))
  assert.notEqual(noteSignature(files[0]), noteSignature({ ...files[0], added: 13 }))
  assert.notEqual(noteSignature(files[0]), noteSignature({ ...files[0], status: 'deleted' }))
})

test('filesNeedingNotes：跳过人工说明；agent 说明签名一致时也跳过', () => {
  const item = { fileNotes: {} }
  assert.equal(filesNeedingNotes(files, item).length, 2)

  item.fileNotes[files[0].path] = { note: '人工写的', source: 'human' }
  assert.deepEqual(filesNeedingNotes(files, item).map((file) => file.path), ['README.md'])

  const sig = noteSignature(files[1])
  item.fileNotes[files[1].path] = { note: '已生成', source: 'agent', sig }
  assert.deepEqual(filesNeedingNotes(files, item), [], '版本没变就不重复生成')

  item.fileNotes[files[1].path] = { note: '已生成', source: 'agent', sig: 'old' }
  assert.equal(filesNeedingNotes(files, item).length, 1, '版本变了要重生成')
})

test('filesNeedingNotes：有 limit 上限', () => {
  const many = Array.from({ length: 20 }, (_, index) => ({ path: `f${index}`, status: 'modified', added: 1, removed: 0 }))
  assert.equal(filesNeedingNotes(many, { fileNotes: {} }, 8).length, 8)
})

test('buildFileNotePrompt：带文件、diff 摘录与 JSON 契约', () => {
  const prompt = buildFileNotePrompt({
    item: { title: '给源加告警', description: '失败没人知道' },
    files: [files[0]],
    excerpts: { [files[0].path]: '+ if (failed) notify()' },
  })
  assert.match(prompt, /src\/main\/java\/x\/source\/A\.java/)
  assert.match(prompt, /\+ if \(failed\) notify\(\)/)
  assert.match(prompt, /30 字以内/)
  assert.match(prompt, /只输出 JSON/)
})

test('applyAgentNotes：只接受本次文件、压缩空白、标 agent 与签名', () => {
  const item = { fileNotes: {} }
  const applied = applyAgentNotes(item, files, [
    { path: files[0].path, note: '  补 webhook\n 失败告警  ' },
    { path: 'not/in/this/batch.java', note: '应该被忽略' },
    { path: files[1].path, note: '' },
  ])
  assert.deepEqual(applied, [files[0].path])
  assert.equal(item.fileNotes[files[0].path].note, '补 webhook 失败告警')
  assert.equal(item.fileNotes[files[0].path].source, 'agent')
  assert.equal(item.fileNotes[files[0].path].sig, noteSignature(files[0]))
  assert.equal(item.fileNotes['not/in/this/batch.java'], undefined)
})
