/**
 * 可复现性基础设施：把"输入是什么、由哪个版本/模型算出来、结果哈希是多少"记进台账。
 *
 * 目标：同样的 description + answers + 仓库约束 ⇒ 同样的 planHash；
 * 输入变了、规则（插件/技能包）变了、模型变了，都能被区分开，而不是含糊地说"好像不一样"。
 *
 * 这里全是纯函数（除读版本号），便于单测与跨机对比。
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 提示词版本：改了 scan/assist 的指令就 +1，provenance 会记录，便于归因。 */
export const PROMPT_VERSION = {
  scan: 2,
  assist: 1,
}

/** 插件版本（与 package.json 同步；有单测保证一致）。 */
export function pluginVersion() {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8'))
    return String(pkg.version ?? '0.0.0')
  } catch {
    return '0.0.0'
  }
}

/** 稳定序列化：对象键排序、数组保持顺序，保证同内容 hash 一致。 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

export function hashOf(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16)
}

/**
 * 规范化追问答案：id 排序、选项排序、去空白。
 * 支持两种形态：`'只看 source'`（自由文本）与 `{ selected: ['only:source'], custom: '...' }`。
 */
export function normalizeAnswers(raw) {
  const out = {}
  for (const [key, value] of Object.entries(raw ?? {})) {
    const id = String(key ?? '').trim()
    if (!id) continue
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const selected = [...new Set((value.selected ?? []).map((item) => String(item).trim()).filter(Boolean))].sort()
      const custom = String(value.custom ?? '').trim()
      out[id] = { selected, ...(custom ? { custom } : {}) }
      if (!selected.length && !custom) delete out[id]
      continue
    }
    const text = String(value ?? '').trim()
    if (text) out[id] = { selected: [], custom: text }
  }
  return out
}

/** 规格指纹：description + 答案 + 范围（不含规则与模型）。 */
export function specHash({ description, answers, scope }) {
  return hashOf({
    description: String(description ?? '').trim(),
    answers: normalizeAnswers(answers),
    scope: [...new Set((scope ?? []).map((item) => String(item ?? '').trim()).filter(Boolean))].sort(),
  })
}

/** 规则指纹：技能包与约束（同一仓库的规范是否一致）。 */
export function conventionsHash(conventions) {
  return hashOf({
    skills: (conventions?.installedSkills ?? []).map((entry) => entry.id).sort(),
    constraints: (conventions?.constraints ?? []).map((entry) => entry.id).sort(),
  })
}

/** 输入指纹：规格 + 规则。跨机对比"是不是同一个需求 + 同一套约束"。 */
export function inputHash({ description, answers, scope, conventions }) {
  return hashOf({
    spec: specHash({ description, answers, scope }),
    conventions: conventionsHash(conventions),
  })
}

/** 计划指纹：只覆盖影响"怎么做"的语义字段，不含时间。 */
export function planHash(plan) {
  return hashOf({
    steps: plan?.steps ?? [],
    acceptance: plan?.acceptance ?? [],
    modules: plan?.modules ?? [],
    risks: plan?.risks ?? [],
    // 模板与验收命令也是"怎么做"的一部分：模板表/命令变了，计划指纹必须跟着变
    template: { id: plan?.template?.id ?? null, touchpoints: plan?.template?.touchpoints ?? [] },
    checks: (plan?.checks ?? []).map((check) => ({ id: check.id, command: check.command ?? null, assertion: check.assertion ?? null })),
    references: (plan?.references ?? []).map((reference) => reference.path),
    estimate: {
      size: plan?.estimate?.size ?? null,
      days: plan?.estimate?.days ?? null,
      confidence: plan?.estimate?.confidence ?? null,
    },
  })
}

/**
 * 合并 provenance 到 item（只写事实，不覆盖历史里的其他段）。
 * @param {object} item
 * @param {'recon'|'assist'|'plan'} kind
 * @param {object} data
 */
export function recordProvenance(item, kind, data) {
  item.provenance ??= {}
  item.provenance.pluginVersion = item.provenance.pluginVersion ?? pluginVersion()
  item.provenance[kind] = {
    ...(item.provenance[kind] ?? {}),
    ...data,
    at: new Date().toISOString(),
  }
  item.provenance.updatedAt = new Date().toISOString()
  return item.provenance[kind]
}
