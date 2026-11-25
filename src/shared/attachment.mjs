/**
 * 工作站消息附件：用户粘贴的截图 / 引用的文件。
 *
 * 浏览器半只上传字节并展示 chip；Host 把文件落到本机附件目录，再把**路径**注入
 * 给 dsh 子代理的提示词：
 * - 图片让模型用 `read_image` 读取（要求当前模型支持图片输入；不支持时工具会报错）；
 * - 文本/日志/配置等让模型用 `read` / `grep` 读取。
 *
 * 这样不依赖 provider 的图片直传协议，也不把二进制塞进台账；模型能力不足时
 * 会在提示词里明确要求"说明不支持"，界面也会提前提示。
 */

export const ATTACHMENT_LIMIT = 8
export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max)
}

function baseName(path) {
  return String(path ?? '').split(/[/\\]/).filter(Boolean).pop() ?? ''
}

/** 是否是受支持的图片类型（read_image 支持 png/jpeg/webp/gif）。 */
export function isSupportedImageType(mediaType) {
  return IMAGE_TYPES.includes(String(mediaType ?? '').toLowerCase())
}

/** 把任意来源的附件列表收敛成稳定形状；非法/越界路径直接丢弃。 */
export function normalizeAttachments(raw, { limit = ATTACHMENT_LIMIT } = {}) {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set()
  const out = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const path = text(entry.path, 1000)
    if (!path || path.includes('..')) continue
    if (!path.startsWith('/') && !/^[A-Za-z]:/.test(path) && !path.startsWith('\\\\')) continue
    if (seen.has(path)) continue
    seen.add(path)
    const mediaType = text(entry.mediaType, 100) || 'application/octet-stream'
    const name = text(entry.name, 200) || baseName(path)
    out.push({
      id: text(entry.id, 80) || `att-${out.length + 1}`,
      name,
      path,
      mediaType,
      size: Number.isFinite(Number(entry.size)) ? Number(entry.size) : null,
      kind: entry.kind === 'image' || /^image\//i.test(mediaType) ? 'image' : 'file',
    })
    if (out.length >= limit) break
  }
  return out
}

export function isImageAttachment(attachment) {
  return attachment?.kind === 'image' || /^image\//i.test(String(attachment?.mediaType ?? ''))
}

/** 人类可读大小（1024 进制，一位小数）。 */
export function formatBytes(size) {
  const value = Number(size)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

/** 附件在界面上的简短标签：文件名 + 大小。 */
export function attachmentLabel(attachment) {
  const name = text(attachment?.name, 120) || baseName(attachment?.path) || '附件'
  const size = formatBytes(attachment?.size)
  return size ? `${name} · ${size}` : name
}

/**
 * 注入给 dsh 子代理的附件说明（纯文本）。
 * 没有附件时返回空字符串，调用方直接拼接即可。
 */
export function attachmentPrompt(attachments) {
  const list = normalizeAttachments(attachments)
  if (!list.length) return ''
  const images = list.filter((entry) => isImageAttachment(entry))
  const files = list.filter((entry) => !isImageAttachment(entry))
  const lines = ['【用户随消息提供的文件/图片】']
  for (const image of images) {
    lines.push(`- 图片：${image.path}（${image.mediaType}${image.size ? `，${formatBytes(image.size)}` : ''}）`)
  }
  for (const file of files) {
    lines.push(`- 文件：${file.path}（${file.mediaType}${file.size ? `，${formatBytes(file.size)}` : ''}）`)
  }
  if (images.length) {
    lines.push('图片必须用 `read_image` 工具按上面的绝对路径读取；**不要凭文件名猜图片内容**。')
    lines.push('如果 `read_image` 报“当前模型不支持图片输入”之类的错误，就明确告诉用户"当前模型不支持图片"，然后只基于文字需求继续。')
  }
  if (files.length) lines.push('文件用 `read` / `grep` 读取，作为需求证据。')
  lines.push('')
  return lines.join('\n')
}
