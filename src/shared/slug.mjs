/**
 * 共享的命名/检索词工具：Host 与浏览器半都要用，所以不能依赖 node:fs。
 * （core/wizard.mjs 与 core/recon.mjs 直接复用这里的实现。）
 */

const MAX_NAME = 40
const MAX_GOAL = 2000

/** Slug suitable for an item id（允许中文，但优先英文）。 */
export function safeSlug(input, fallback = 'item') {
  const slug = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || fallback
}

/** First sentence of the description, used as the default flow name. */
export function suggestName(description) {
  const text = String(description ?? '').trim()
  if (!text) return ''
  const line = text.split(/\r?\n/).map((value) => value.trim()).find(Boolean) ?? ''
  const sentence = line.split(/[。！？!?；;]/).map((value) => value.trim()).find(Boolean) ?? line
  return sentence.slice(0, MAX_NAME)
}

function timestampId(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `flow-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

/**
 * 把“我要做什么”这句话变成流程名称与 id。
 * 英文词优先做 id（id 会变成文件名）；纯中文描述回退成时间戳 id。
 */
export function draftFromDescription(description, { date = new Date() } = {}) {
  const text = String(description ?? '').trim().slice(0, MAX_GOAL)
  const name = suggestName(text)
  const words = text.toLowerCase().match(/[a-z][a-z0-9]*/g) ?? []
  const ascii = words.filter((word) => word.length > 1).slice(0, 6).join('-')
  const id = ascii.length >= 3 ? safeSlug(ascii).slice(0, 60) : timestampId(date)
  return { name, id, goal: text }
}

export const SLUG_LIMITS = { MAX_NAME, MAX_GOAL }
