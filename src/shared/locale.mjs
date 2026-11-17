/**
 * 语言词典文件（locale/<id>.json）的共享契约。
 *
 * 一个词典文件同时承载插件元数据、语言定义、界面词条与动态模板：
 * {
 *   "meta": { "title": "...", "description": "..." },
 *   "language": { "label": "日本語", "fallback": "en" },
 *   "messages": { "开发工作站": "開発ワークステーション", ... },
 *   "templates": { "任务 {done}/{total}": "タスク {done}/{total}" },
 *   "templateValues": { "通过": "合格", ... }
 * }
 *
 * 本模块不依赖 Node 或浏览器：Host 用它在运行时读目录，客户端用它校验下发
 * 结果并注册到 DSH locale 服务；单元测试也用同一套校验驱动临时词典夹具。
 * 中文原文仍是 key，新增语言只需要新增一个文件。
 */

/**
 * 默认已知语言。DSH 的内置语言会随版本变化（0.2.x 除 zh/en 外还内置
 * ja/es/fr/de/ru/pt），因此这里只作为无运行时信息时的兜底；客户端实际
 * 以 ctx.locale.getLocale().locales 的 catalog 为准。
 */
export const BUILTIN_LOCALE_IDS = Object.freeze(['zh', 'en'])

/** 回退链终点：en 必须存在于每个词典包中。 */
export const FALLBACK_LOCALE_ID = 'en'

/** DSH 接受的 BCP 47 风格语言 id：首段 2~8 个字母，后续段 1~8 位字母数字。 */
const LOCALE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u

/** 词典模板占位符：{name}。 */
const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function issue(code, message, details = {}) {
  return { code, message, ...details }
}

function placeholdersOf(text) {
  return [...String(text).matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1])
}

function normalizeStringMap(value, where, field, { required = false, placeholders = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${where}: 缺少 ${field} 对象`)
    return {}
  }
  if (!isPlainObject(value)) throw new Error(`${where}: ${field} 必须是对象`)
  const output = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!nonEmptyString(key)) throw new Error(`${where}: ${field} 存在空 key`)
    if (!nonEmptyString(raw)) throw new Error(`${where}: ${field}["${key}"] 必须是非空字符串`)
    if (placeholders) {
      const sourcePlaceholders = new Set(placeholdersOf(key))
      for (const name of placeholdersOf(raw)) {
        if (!sourcePlaceholders.has(name)) {
          throw new Error(`${where}: ${field}["${key}"] 使用了源模板中不存在的占位符 {${name}}`)
        }
      }
    }
    output[key] = raw
  }
  return output
}

/** 从文件名解析语言 id；非法文件名返回 null。 */
export function localeIdOfFile(fileName) {
  const match = String(fileName ?? '').match(/^(.+)\.json$/i)
  if (!match) return null
  const id = match[1].toLowerCase()
  return LOCALE_ID_PATTERN.test(id) ? id : null
}

/**
 * 校验并规范化单个词典文件。
 * @param {object} input - { id, raw, source }
 * @param {string} input.id - 语言 id（通常来自文件名）
 * @param {string|object} input.raw - 文件内容
 * @param {string} [input.source] - 出错时展示的文件名
 * @returns {{id:string,label:string,fallback:string|undefined,meta:{title:string,description:string},messages:Record<string,string>,templates:Record<string,string>,templateValues:Record<string,string>}}
 */
export function normalizeLocaleDictionary({ id, raw, source } = {}) {
  const where = source || `${id ?? 'locale'}.json`
  const normalizedId = String(id ?? '').toLowerCase()
  if (!LOCALE_ID_PATTERN.test(normalizedId)) {
    throw new Error(`${where}: 语言 id「${id ?? ''}」不是 DSH 接受的 BCP 47 标签（首段 2~8 个字母）`)
  }
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`${where}: JSON 解析失败（${String(error?.message ?? error)}）`)
    }
  }
  if (!isPlainObject(parsed)) throw new Error(`${where}: 顶层必须是对象`)

  const meta = parsed.meta
  if (!isPlainObject(meta)) throw new Error(`${where}: 缺少 meta 对象`)
  if (!nonEmptyString(meta.title)) throw new Error(`${where}: meta.title 必须是非空字符串`)
  if (!nonEmptyString(meta.description)) throw new Error(`${where}: meta.description 必须是非空字符串`)

  const language = parsed.language
  if (!isPlainObject(language)) throw new Error(`${where}: 缺少 language 对象`)
  if (!nonEmptyString(language.label)) throw new Error(`${where}: language.label 必须是非空字符串（用该语言自称）`)

  let fallback
  if (language.fallback !== undefined && language.fallback !== null) {
    const declared = String(language.fallback).toLowerCase()
    if (!LOCALE_ID_PATTERN.test(declared)) {
      throw new Error(`${where}: language.fallback「${language.fallback}」不是合法语言 id`)
    }
    if (normalizedId === FALLBACK_LOCALE_ID) {
      throw new Error(`${where}: en 是回退链终点，不能声明 language.fallback`)
    }
    fallback = declared
  } else if (normalizedId !== FALLBACK_LOCALE_ID) {
    // 第三方语言默认回退到英文；与 DSH 的回退链合约一致。
    fallback = FALLBACK_LOCALE_ID
  }

  const messages = normalizeStringMap(parsed.messages, where, 'messages', { required: true })
  const templates = normalizeStringMap(parsed.templates, where, 'templates', { placeholders: true })
  const templateValues = normalizeStringMap(parsed.templateValues, where, 'templateValues')

  return Object.freeze({
    id: normalizedId,
    label: language.label.trim(),
    fallback,
    meta: Object.freeze({ title: meta.title.trim(), description: meta.description.trim() }),
    messages: Object.freeze(messages),
    templates: Object.freeze(templates),
    templateValues: Object.freeze(templateValues),
  })
}

function keyMismatch(zhMap, enMap, field) {
  const zhKeys = new Set(Object.keys(zhMap ?? {}))
  const enKeys = new Set(Object.keys(enMap ?? {}))
  const missingInEn = [...zhKeys].filter((key) => !enKeys.has(key))
  const missingInZh = [...enKeys].filter((key) => !zhKeys.has(key))
  return { missingInEn, missingInZh }
}

/**
 * 汇总并校验一组词典：重复 id、缺失 en、zh/en key/模板对齐、回退链。
 * 有问题的语言不会进入 locales（避免 addLanguage 时抛错拖垮插件），
 * 问题写进 errors 由调用方显式记录，不静默吞掉。
 *
 * @param {Array} locales - normalizeLocaleDictionary 的结果
 * @param {object} [options]
 * @param {Array} [options.errors] - 已有问题（如单个文件解析失败）
 * @param {string[]} [options.knownLocales] - 运行时已注册语言（客户端传 catalog）
 * @param {boolean} [options.allowUnknownFallback] - Host 侧允许暂不认识的回退目标
 *   （例如 fr-CA → fr 由客户端按真实 catalog 再校验），避免 Host 误丢词典。
 * @returns {{locales: Array, errors: Array}}
 */
export function finalizeLocaleBundle(locales, {
  errors = [],
  knownLocales = BUILTIN_LOCALE_IDS,
  allowUnknownFallback = false,
} = {}) {
  const issues = [...errors]
  const seen = new Map()
  const kept = []
  for (const locale of Array.isArray(locales) ? locales : []) {
    const previous = seen.get(locale.id)
    if (previous) {
      issues.push(issue('duplicate-locale', `语言「${locale.id}」被多个词典文件重复定义`, {
        file: locale.id,
      }))
      continue
    }
    seen.set(locale.id, locale)
    kept.push(locale)
  }

  if (!seen.has(FALLBACK_LOCALE_ID)) {
    issues.push(issue('missing-fallback-locale', '词典包缺少 en 词典：非英文语言的回退链无法终止', {
      file: 'en.json',
    }))
  }

  const zh = seen.get('zh')
  const en = seen.get(FALLBACK_LOCALE_ID)
  if (zh && en) {
    const missing = keyMismatch(zh.messages, en.messages, 'messages')
    if (missing.missingInEn.length || missing.missingInZh.length) {
      issues.push(issue(
        'key-mismatch',
        `zh/en 词典 key 未对齐：en 缺 ${missing.missingInEn.length} 条、zh 缺 ${missing.missingInZh.length} 条`,
        {
          file: 'zh.json/en.json',
          missingInEn: missing.missingInEn.slice(0, 20),
          missingInZh: missing.missingInZh.slice(0, 20),
        },
      ))
    }
    const templateMismatch = keyMismatch(zh.templates, en.templates, 'templates')
    if (templateMismatch.missingInEn.length || templateMismatch.missingInZh.length) {
      issues.push(issue(
        'template-mismatch',
        `zh/en 动态模板未对齐：en 缺 ${templateMismatch.missingInEn.length} 条、zh 缺 ${templateMismatch.missingInZh.length} 条`,
        {
          file: 'zh.json/en.json',
          missingInEn: templateMismatch.missingInEn.slice(0, 20),
          missingInZh: templateMismatch.missingInZh.slice(0, 20),
        },
      ))
    }
  }

  const known = new Set([
    ...knownLocales.map((id) => String(id).toLowerCase()).filter(Boolean),
    ...seen.keys(),
  ])
  const valid = []
  for (const locale of kept) {
    // en 是终点；zh 等运行时已知语言由 DSH 保证其自身回退链有效。
    if (locale.id === FALLBACK_LOCALE_ID || knownLocales.map((id) => String(id).toLowerCase()).includes(locale.id)) {
      valid.push(locale)
      continue
    }
    const visited = new Set()
    let current = locale
    let problem = null
    while (current) {
      if (visited.has(current.id)) {
        problem = `语言「${locale.id}」的 fallback 链存在循环`
        break
      }
      visited.add(current.id)
      if (current.id === FALLBACK_LOCALE_ID) break
      const next = current.fallback
      if (!next) {
        problem = `语言「${locale.id}」的 fallback 链没有终止于 en`
        break
      }
      if (!known.has(next)) {
        if (allowUnknownFallback) break
        problem = `语言「${locale.id}」的 fallback「${next}」没有对应词典文件，也未在运行时注册`
        break
      }
      const nextEntry = seen.get(next)
      if (!nextEntry) break // 已由运行时注册的外部语言：DSH 保证其回退链
      current = nextEntry
    }
    if (problem) {
      issues.push(issue('invalid-fallback', problem, { file: `${locale.id}.json` }))
      continue
    }
    valid.push(locale)
  }

  return { locales: Object.freeze(valid), errors: issues }
}

/**
 * 计算 addLanguage 的安全顺序：fallback 目标必须先注册。
 * @param {Array} locales - 已通过 finalizeLocaleBundle 的词典
 * @param {{availableLocales?: string[]}} [options] - 运行时已注册语言
 * @returns {{order: Array, unresolved: Array, alreadyAvailable: string[]}}
 */
export function languageRegistrationOrder(locales, { availableLocales = BUILTIN_LOCALE_IDS } = {}) {
  const available = new Set([
    ...availableLocales.map((id) => String(id).toLowerCase()).filter(Boolean),
    FALLBACK_LOCALE_ID,
  ])
  const alreadyAvailable = []
  const pending = []
  for (const locale of Array.isArray(locales) ? locales : []) {
    if (available.has(locale.id)) alreadyAvailable.push(locale.id)
    else pending.push(locale)
  }
  const order = []
  let progressed = true
  while (pending.length && progressed) {
    progressed = false
    for (let index = 0; index < pending.length; index += 1) {
      const locale = pending[index]
      if (!available.has(locale.fallback)) continue
      order.push(locale)
      available.add(locale.id)
      pending.splice(index, 1)
      index -= 1
      progressed = true
    }
  }
  return { order, unresolved: pending, alreadyAvailable }
}

/** 合并多来源的校验问题，按 code+message 去重（Host 与客户端可能各报一次）。 */
export function mergeLocaleIssues(...lists) {
  const seen = new Set()
  const output = []
  for (const list of lists) {
    for (const entry of Array.isArray(list) ? list : []) {
      const key = `${entry?.code ?? ''}|${entry?.message ?? entry?.file ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      output.push(entry)
    }
  }
  return output
}
