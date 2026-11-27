import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const chatFlow = await import('../src/client/chat-flow.mjs')

const read = (path) => readFile(new URL(`../src/client/${path}`, import.meta.url), 'utf8')

test('聊天框：支持粘贴/拖入/选择文件，图片不支持时明确提示', async () => {
  const chat = await read('chat.mjs')
  assert.match(chat, /onPaste: onPasteFiles/)
  assert.match(chat, /onDrop: onDropFiles/)
  assert.match(chat, /API\.attach/)
  assert.match(chat, /API\.capabilities/)
  assert.match(chat, /当前模型不支持图片输入/)
  assert.match(chat, /引用文件\/图片/)
  // 用户文案不暴露 read_image 这类工具名；Host prompt 仍会用工具读取
  assert.match(chat, /文件路径交给会话/)
  assert.doesNotMatch(chat, /图片用 read_image 读取/)
  // 附件跟着消息进入 recon / clarify / create
  assert.match(chat, /probeCode\(makeDeps\(ctx\), text, \{ attachments: usedAttachments(?:, repoPath: state\?\.repo\?\.path)? \}\)/)
  assert.match(chat, /attachments: usedAttachments/)
  assert.match(chat, /attachments: normalizeAttachments\(pending\.attachments \?\? attachments\)/)
})

test('聊天持久化：附件随对话保存/恢复（刷新、切走回来不丢）', async () => {
  const store = await read('chat-store.mjs')
  assert.match(store, /attachments: normalizeAttachments\(raw\.attachments\)/)
  const chat = await read('chat.mjs')
  assert.match(chat, /saveChat\(repoPath, activeChatId, \{ messages/)
  assert.match(chat, /attachments, clarify, clarifyOrigin/)
})

test('流程详情：显示随需求提供的引用文件/截图，并说明 read_image / read', async () => {
  const index = await read('index.mjs')
  assert.match(index, /引用文件 \/ 截图/)
  assert.match(index, /read_image \/ read/)
})

test('probeCode：只贴附件、文字很短时也允许探测；附件透传给 recon', async () => {
  const calls = []
  const deps = {
    recon: async (text, options) => {
      calls.push({ text, options })
      return { files: [], suggestedScope: [], scanned: 0 }
    },
  }
  await assert.rejects(() => chatFlow.probeCode(deps, '看图'), /再多写一点/)
  const result = await chatFlow.probeCode(deps, '看图', { attachments: [{ path: '/tmp/shot.png', mediaType: 'image/png', size: 1 }] })
  assert.equal(result.description, '看图')
  assert.equal(result.attachments.length, 1)
  assert.equal(calls[0].options.attachments[0].path, '/tmp/shot.png')
})

test('userMessage 带上附件元信息，供历史消息渲染', () => {
  const msg = chatFlow.userMessage('看这张图', [{ id: 'a1', name: 'shot.png', path: '/tmp/shot.png', mediaType: 'image/png' }])
  assert.equal(msg.role, 'user')
  assert.equal(msg.text, '看这张图')
  assert.equal(msg.attachments.length, 1)
  assert.equal(chatFlow.userMessage('纯文字').attachments, undefined)
})

test('聊天附件：发送后清空输入区，图片可点击预览', async () => {
  const chat = await read('chat.mjs')
  assert.match(chat, /API\.attachment\}\?path=/)
  assert.match(chat, /function AttachmentPreview/)
  assert.match(chat, /onPreviewAttachment: setPreviewAttachment/)
  assert.match(chat, /const pendingAttachments = attachments\n    setAttachments\(\[\]\)/)
})

test('剪贴板取图：兼容 Windows/Edge 只在 items 里给截图、files 为空', async () => {
  const { clipboardFiles } = await import('../src/client/chat.mjs')
  const shot = { name: 'image.png', type: 'image/png', size: 1024, lastModified: 1 }
  const itemFile = { name: 'clip.png', type: 'image/png', size: 2048, lastModified: 2 }
  const files = clipboardFiles({
    files: [shot],
    items: [
      { kind: 'string', getAsFile: () => null },
      { kind: 'file', getAsFile: () => itemFile },
      { kind: 'file', getAsFile: () => itemFile },
    ],
  })
  assert.deepEqual(files, [shot, itemFile])
  assert.deepEqual(clipboardFiles({ files: [], items: [{ kind: 'file', getAsFile: () => shot }] }), [shot])
  assert.deepEqual(clipboardFiles({ files: [], items: [{ kind: 'string' }] }), [])
})

test('澄清恢复：有扫描结果但没有 clarify 卡片时，回来补问而不是直接生成计划', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(chat, /clarifyResumeRef/)
  assert.match(chat, /phase !== PHASE\.confirm \|\| !pending\?\.recon/)
  assert.match(chat, /messages\.some\(\(msg\) => msg\.kind === 'clarify'\)/)
  assert.match(chat, /recon: pending\.recon/)
})
