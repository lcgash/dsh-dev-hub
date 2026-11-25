import assert from 'node:assert/strict'
import test from 'node:test'

const {
  ATTACHMENT_MAX_BYTES,
  attachmentLabel,
  attachmentPrompt,
  isImageAttachment,
  isSupportedImageType,
  normalizeAttachments,
} = await import('../src/shared/attachment.mjs')

test('normalizeAttachments：只保留绝对路径、去重、限制数量，图片按 mediaType 识别', () => {
  const list = normalizeAttachments([
    { id: 'a', name: 'shot.png', path: '/tmp/shot.png', mediaType: 'image/png', size: 2048 },
    { name: 'dup', path: '/tmp/shot.png', mediaType: 'image/png' },
    { name: 'rel', path: 'src/x.js', mediaType: 'text/javascript' },
    { name: 'escape', path: '/tmp/../etc/passwd' },
    { name: 'log.txt', path: '/tmp/log.txt', mediaType: 'text/plain', size: 10 },
  ])
  assert.equal(list.length, 2)
  assert.equal(list[0].kind, 'image')
  assert.equal(list[1].kind, 'file')
  assert.equal(list[0].id, 'a')
  assert.equal(list[1].name, 'log.txt')
  assert.ok(normalizeAttachments(Array.from({ length: 20 }, (_, index) => ({ path: `/tmp/${index}.txt` }))).length <= 8)
})

test('attachmentLabel / isImageAttachment / isSupportedImageType', () => {
  assert.equal(attachmentLabel({ name: 'a.png', size: 2048 }), 'a.png · 2.0 KB')
  assert.equal(attachmentLabel({ name: 'big.log', size: 3 * 1024 * 1024 }), 'big.log · 3.0 MB')
  assert.equal(isImageAttachment({ kind: 'image' }), true)
  assert.equal(isImageAttachment({ mediaType: 'text/plain' }), false)
  assert.equal(isSupportedImageType('image/png'), true)
  assert.equal(isSupportedImageType('image/svg+xml'), false)
  assert.ok(ATTACHMENT_MAX_BYTES >= 1024 * 1024)
})

test('attachmentPrompt：图片要求 read_image，并声明"模型不支持就明说"', () => {
  const prompt = attachmentPrompt([
    { name: 'shot.png', path: '/tmp/shot.png', mediaType: 'image/png', size: 2048 },
    { name: 'run.log', path: '/tmp/run.log', mediaType: 'text/plain', size: 100 },
  ])
  assert.match(prompt, /【用户随消息提供的文件\/图片】/)
  assert.match(prompt, /\/tmp\/shot\.png/)
  assert.match(prompt, /read_image/)
  assert.match(prompt, /当前模型不支持图片/)
  assert.match(prompt, /\/tmp\/run\.log/)
  assert.match(prompt, /read/)
  assert.equal(attachmentPrompt([]), '', '没有附件时不注入任何内容')
})

test('Windows 盘符附件路径也按绝对路径保留', () => {
  const list = normalizeAttachments([{ path: 'C:\\Users\\me\\shot.png', mediaType: 'image/png', name: 'shot.png' }])
  assert.equal(list.length, 1)
  assert.equal(list[0].path, 'C:\\Users\\me\\shot.png')
})
