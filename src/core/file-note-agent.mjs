/**
 * 让 agent 自动为变更文件补「修改意义」：开发时顺手生成，不需要用户逐条填。
 *
 * 只做纯逻辑：挑文件、拼指令、定义契约、合并结果；调用 agent 在 Host 侧。
 * 生成结果标 source='agent' 并带版本签名（文件增删行变了会自动重生成）。
 */

import { filesNeedingNotes, noteSignature } from './file-notes.mjs'

export const FILE_NOTE_SCHEMA = {
  type: 'object',
  properties: {
    notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['path', 'note'],
        additionalProperties: true,
      },
    },
  },
  required: ['notes'],
  additionalProperties: true,
}

const MAX_FILES = 8
const MAX_EXCERPT_LINES = 120

/**
 * 拼给 agent 的指令：文件清单 + （压缩后的）diff 片段，要求一句话说明"改了什么/为什么"。
 * @param {{ item: object, files: object[], excerpts: Record<string,string> }} input
 */
export function buildFileNotePrompt({ item, files, excerpts = {} }) {
  const rows = files.map((file) => {
    const excerpt = String(excerpts[file.path] ?? '').split('\n').slice(0, MAX_EXCERPT_LINES).join('\n')
    return [
      `### ${file.path}`,
      `状态：${file.status}｜来源：${file.origin}｜+${file.added} / -${file.removed}`,
      excerpt ? `diff 摘录：\n${excerpt}` : '（无 diff 摘录）',
    ].join('\n')
  }).join('\n\n')
  return [
    '你是「DevHub 开发工作站」的变更说明助手。',
    `开发流程：${item?.title ?? ''}（目标：${item?.description || item?.goal || '未填写'}）`,
    '请为下面每个变更文件写一句**简短的修改意义**（中文，30 字以内），说明它改了什么、为什么改。',
    '',
    rows,
    '',
    '要求：',
    '1. 只根据给出的路径、状态与 diff 摘录判断，不要编造没出现的内容；',
    '2. 一句话，不要换行、不要 Markdown；说人话（例：「注册新源类型与显示名」「补 webhook 重试单测」）；',
    '3. 每个文件都要有一条，path 必须与上面完全一致。',
    '只输出 JSON：{"notes":[{"path":"...","note":"..."}]}',
  ].join('\n')
}

/** 校验并合并 agent 结果（只接受本次请求里出现过的路径）。 */
export function applyAgentNotes(item, files, rawNotes) {
  const allowed = new Set((files ?? []).map((file) => file.path))
  const byPath = new Map((files ?? []).map((file) => [file.path, file]))
  const applied = []
  item.fileNotes ??= {}
  for (const entry of Array.isArray(rawNotes) ? rawNotes : []) {
    const path = String(entry?.path ?? '').trim()
    if (!allowed.has(path)) continue
    const note = String(entry?.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!note) continue
    item.fileNotes[path] = { note, source: 'agent', sig: noteSignature(byPath.get(path)), at: new Date().toISOString() }
    applied.push(path)
  }
  return applied
}

export { filesNeedingNotes, noteSignature }
export const FILE_NOTE_LIMITS = { MAX_FILES, MAX_EXCERPT_LINES }
