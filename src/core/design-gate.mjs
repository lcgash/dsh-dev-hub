/**
 * 设计文档门禁：把「技术方案是否真的写清楚」变成可复算的事实。
 *
 * 只做纯文本检查与稳定哈希，不读盘、不调模型；Host 负责把本地/飞书文档渲染进来。
 * 参考 dev-workflow 的 check-design.py，但兼容 DevHub 现有技术方案章节：
 * 背景与目标 / 现状与约束 / 方案设计 / 接口数据兼容与回滚 / 验收与测试。
 */
import { hashOf } from './provenance.mjs'
import { isRawEcho } from '../shared/requirement.mjs'

const MAX_SECTION = 12000

const REQUIRED = [
  { id: 'intent', label: '意图/背景与目标', aliases: ['背景', '目标', 'intent', 'why'] },
  { id: 'design', label: '方案/详细设计', aliases: ['方案设计', '详细设计', 'design', 'approach'] },
  { id: 'verification', label: '验收/验证与测试', aliases: ['验收', '验证', '测试', 'verification'] },
]

const LEGACY = [
  { id: 'current', label: '现状与约束', aliases: ['现状', '约束', 'current state'] },
  { id: 'blast', label: '兼容/回滚/影响面', aliases: ['兼容', '回滚', '影响面', 'blast radius'] },
]

const PLACEHOLDER = /^\s*[-*]?\s*(\*\*[^*]+\*\*\s*)?(\.\.\.|…|TBD|TODO|待补充|待确认|（未填写）|（待确认）)\s*$/i
const INLINE_PLACEHOLDER = /(\bTBD\b|\bTODO\b|待补充|待确认|（未填写）|（待确认）)/i
const ROLLBACK = /(回滚|rollback)/i

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, MAX_SECTION)
}

/** 按 `##` 标题切段；同时保留一级标题下的正文（兼容没有编号的方案）。 */
export function parseDesignSections(markdown) {
  const sections = []
  let current = null
  for (const line of String(markdown ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (match) {
      current = { title: match[1].trim(), body: [] }
      sections.push(current)
      continue
    }
    if (current) current.body.push(line)
  }
  return sections.map((section) => ({ title: section.title, body: section.body.join('\n').trim() }))
}

function findSection(sections, aliases) {
  const lower = aliases.map((alias) => alias.toLowerCase())
  return sections.find((section) => lower.some((alias) => section.title.toLowerCase().includes(alias))) ?? null
}

function meaningfulLines(body) {
  return String(body ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
}

function placeholderOnly(body) {
  const lines = meaningfulLines(body)
  if (!lines.length) return true
  return lines.every((line) => PLACEHOLDER.test(line))
}

function makeScope(scope) {
  return [...new Set((Array.isArray(scope) ? scope : []).map((entry) => String(entry ?? '').trim()).filter(Boolean))].sort()
}

/**
 * @param {string} markdown 技术方案正文
 * @param {{ rawRequest?: string, legacy?: boolean, scope?: string[] }} [options]
 * @returns {{ ok: boolean, status: 'pass'|'warn'|'fail', errors: string[], warnings: string[], basisHash: string, scope: string[] }}
 */
export function checkDesign(markdown, { rawRequest = '', legacy = false, scope = [] } = {}) {
  const sections = parseDesignSections(markdown)
  const errors = []
  const warnings = []
  const scopeFiles = makeScope(scope)

  for (const requirement of REQUIRED) {
    const section = findSection(sections, requirement.aliases)
    if (!section) {
      errors.push(`缺少必填章节：${requirement.label}`)
      continue
    }
    if (placeholderOnly(section.body)) errors.push(`章节为空或只有占位符：${requirement.label}`)
  }

  if (legacy) {
    for (const requirement of LEGACY) {
      const section = findSection(sections, requirement.aliases)
      if (!section) warnings.push(`存量项目建议补章节：${requirement.label}`)
      else if (placeholderOnly(section.body)) warnings.push(`存量章节未填写：${requirement.label}`)
    }
    const blast = findSection(sections, LEGACY[1].aliases)
    if (blast && !ROLLBACK.test(blast.body)) warnings.push('存量项目缺少回滚方案（Rollback）')
  }

  const intent = findSection(sections, REQUIRED[0].aliases)
  if (intent && rawRequest && isRawEcho(intent.body, rawRequest)) {
    errors.push('意图章节是用户原话的照搬：请写清根本问题与为什么现在做')
  }

  for (const section of sections) {
    for (const line of meaningfulLines(section.body)) {
      if (PLACEHOLDER.test(line) || INLINE_PLACEHOLDER.test(line)) warnings.push(`「${section.title}」存在未填写占位：${line.slice(0, 80)}`)
    }
  }
  if (!scopeFiles.length) warnings.push('没有记录改动范围（scope）：建议在方案里写清要改哪些文件/目录')

  const basisHash = hashOf({
    intent: normalizeText(intent?.body),
    design: normalizeText(findSection(sections, REQUIRED[1].aliases)?.body),
    verification: normalizeText(findSection(sections, REQUIRED[2].aliases)?.body),
    goals: normalizeText(findSection(sections, ['目标', 'non-goals', '非目标'])?.body),
    scope: scopeFiles,
  })

  const status = errors.length ? 'fail' : warnings.length ? 'warn' : 'pass'
  return {
    ok: errors.length === 0,
    status,
    errors: errors.slice(0, 12),
    warnings: warnings.slice(0, 12),
    basisHash,
    scope: scopeFiles,
    legacy: Boolean(legacy),
  }
}

/** 给界面/审核员的一句话摘要，不把完整错误列表塞进每一处。 */
export function designGateSummary(gate) {
  if (!gate) return ''
  if (gate.ok === false) return `方案门禁 FAIL：${gate.errors?.[0] ?? '缺少必要的方案信息'}`
  if (gate.warnings?.length) return `方案门禁 PASS（${gate.warnings.length} 条提醒）`
  return '方案门禁 PASS'
}
