/**
 * 开发站的客户端本地化桥。
 *
 * 界面已经大量使用中文静态文案；这里不重写每个组件，而是把 React 元素工厂
 * 接到 DSH 的 locale 字典上：字符串子节点与常见可读属性（含 props.children）
 * 命中词典时翻译，未命中时保留原文。词典不再硬编码在本文件里：Host 在运行时
 * 读取 locale/*.json 并通过 API.locales 下发，本文件只负责拉取、校验并注册到
 * DSH locale 服务。动态模板（任务 3/5、成员 X 等）也来自词典的 templates，
 * 因此新增一种语言 = 新增一个 locale/<id>.json 文件，组件代码零改动。
 */
import {
  cloneElement,
  createElement as reactCreateElement,
  useEffect,
  useState,
} from 'react'
import { API } from '../shared/api.mjs'
import {
  finalizeLocaleBundle,
  languageRegistrationOrder,
  mergeLocaleIssues,
  normalizeLocaleDictionary,
} from '../shared/locale.mjs'

/** 开发站在 DSH locale 服务里的命名空间。 */
export const LOCALE_NAMESPACE = 'dev-hub'

/** Host 下发的词典包路由（loopback），与 Host 路由共用同一常量。 */
export const LOCALE_ENDPOINT = API.locales

let activeT = (key) => key
let activeLocale = 'zh'

/** locale -> { templates, templateValues, fallback }，由 installLocaleDictionaries 维护。 */
const templateResources = new Map()

export function setActiveLocaleForTest(locale, translate = (key) => key) {
  activeLocale = locale
  activeT = translate
}

export function currentLocale() {
  return activeLocale
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileTemplate(source, target) {
  const names = []
  const allowNewline = String(source).includes('\n')
  const literalLength = String(source).replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, '').length
  // 很短的标签模板（扫描仓库 X 等）不允许吞掉逗号/句号，否则会把整句结论塞进一个占位符。
  const riskyShort = literalLength <= 6 && /\{[A-Za-z][A-Za-z0-9_]*\}$/.test(String(source))
  const capturePattern = allowNewline ? '([\\s\\S]*?)' : riskyShort ? '([^，。；\\n]*?)' : '([\\s\\S]*?)'
  const pattern = String(source)
    .split(/(\{[A-Za-z][A-Za-z0-9_]*\})/u)
    .map((part) => {
      const placeholder = part.match(/^\{([A-Za-z][A-Za-z0-9_]*)\}$/u)
      if (placeholder) {
        names.push(placeholder[1])
        return capturePattern
      }
      return escapeRegExp(part)
    })
    .join('')
  return { source, target, names, regex: new RegExp(`^${pattern}$`, 'u') }
}

function resourcesFor(localeId) {
  return templateResources.get(String(localeId).toLowerCase()) ?? null
}

function resourceChain(localeId) {
  const chain = []
  const seen = new Set()
  let current = String(localeId ?? '').toLowerCase()
  while (current && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    const resource = resourcesFor(current)
    const next = resource?.fallback
    current = next ? String(next).toLowerCase() : (current === 'en' ? '' : 'en')
  }
  if (!seen.has('en')) chain.push('en')
  return chain
}

function translateCaptured(value, depth = 0) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  const chain = resourceChain(activeLocale)
  for (const locale of chain) {
    const mapped = resourcesFor(locale)?.templateValues?.[trimmed]
    if (mapped !== undefined) return mapped
  }
  // 审核员标签、applied 标签等用「、」拼接的列表：逐项翻译后可保留英文 chrome。
  if (trimmed.includes("、") && depth < 4) {
    const items = trimmed.split("、")
    const translatedItems = items.map((item) => translateCaptured(item, depth + 1))
    if (translatedItems.every((item, index) => item !== items[index].trim())) {
      return translatedItems.join(", ")
    }
  }
  let translated = trimmed
  try {
    translated = activeT(trimmed)
  } catch {
    translated = trimmed
  }
  if (translated !== trimmed) return translated
  // 捕获片段本身可能是多行（如 tooltip 的第 2 段），逐行翻译后再拼回。
  if (trimmed.includes("\n") && depth < 4) {
    return trimmed.split("\n").map((line) => {
      let value = line
      try { value = activeT(line) } catch { value = line }
      return value !== line ? value : applyTemplate(line, depth + 1)
    }).join("\n")
  }
  // 捕获片段本身可能还是动态句子：递归走模板，但限制深度避免自引用。
  return depth < 4 ? applyTemplate(trimmed, depth + 1) : trimmed
}

function orderedTemplates(resource) {
  if (resource.ordered?.length) return resource.ordered
  const ordered = [...resource.templates].map(([sourceText, target]) => {
    const compiled = resource.compiled.get(sourceText) ?? compileTemplate(sourceText, target)
    resource.compiled.set(sourceText, compiled)
    return compiled
  })
  // 字面量更长的模板更具体；同等长度时占位符更少者优先。
  // 避免 `{value1} 个成员库` 抢先吞掉 `多库项目「X」：N 个成员库` 这种长句。
  ordered.sort((a, b) => {
    const literal = (sourceText) => sourceText.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, '').length
    return (literal(b.source) - literal(a.source)) || (a.names.length - b.names.length)
  })
  resource.ordered = ordered
  return ordered
}

function applyTemplate(value, depth = 0) {
  if (depth > 4) return value
  for (const locale of resourceChain(activeLocale)) {
    const resource = resourcesFor(locale)
    if (!resource?.templates?.size) continue
    for (const compiled of orderedTemplates(resource)) {
      // 单行模板不能吞掉多行文本：否则 `{x}：失败（{y}）` 会把前面几行一并吃进捕获。
      if (value.includes("\n") && !compiled.source.includes("\n")) continue
      const match = value.match(compiled.regex)
      if (!match) continue
      const captures = {}
      for (let index = 0; index < compiled.names.length; index += 1) {
        captures[compiled.names[index]] = match[index + 1] ?? ''
      }
      // 模板字面量已翻译；捕获出来的中文数据（流程名/仓库名/评审意见）原样保留。
      return compiled.target.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (whole, name) => (
        name in captures ? translateCaptured(captures[name], depth) : whole
      ))
    }
  }
  return value
}

/**
 * 非 React 路径（自建弹层、日志/提示文本）的翻译入口。
 * React 组件请优先使用 `h` 工厂：它会翻译子节点与常见可读属性。
 */
export function translateText(value) {
  if (typeof value !== 'string' || value.length === 0) return value
  if (activeLocale === 'zh') return value
  let translated = value
  try {
    translated = activeT(value)
  } catch {
    translated = value
  }
  if (translated !== value) return translated
  // 先尝试整串模板（包含真实换行的 key），再按行回退：
  // 多行 confirm/tooltip 整句有模板时不能拆行，否则只翻到一半。
  const whole = applyTemplate(value)
  if (whole !== value) return whole
  if (value.includes("\n")) {
    const lines = value.split("\n").map((line) => translateText(line)).join("\n")
    if (lines !== value) return lines
  }
  // 列表型文案（applied 标签、评审人、技能分类等）用「、」拼成：
  // 逐项翻译，全部可译才改写，避免逐项混杂。
  if (value.includes("、")) {
    const items = value.split("、")
    const translated = items.map((item) => translateText(item.trim()))
    if (translated.every((item, index) => item !== items[index].trim() || !/\p{Script=Han}/u.test(items[index]))) {
      return translated.join(", ")
    }
  }
  // 运行时用中文句读拼起来的结论型文案：按句读拆段翻译后拼回。
  // 只有每一段都能翻译时才改写；任一段仍是中文就原样返回，避免改用户/宿主正文。
  if (/[，；。！？]/.test(value)) {
    const parts = value.match(/[^，；。！？]+[，；。！？]?/g) ?? []
    if (parts.length > 1) {
      const translated = parts.map((part) => {
        const punctuation = /[，；。！？]$/.test(part) ? part.slice(-1) : ''
        const body = punctuation ? part.slice(0, -1) : part
        const text = translateText(body.trim())
        if (text === body.trim() && /\p{Script=Han}/u.test(body)) return part
        if (!punctuation) return text
        const mapped = punctuation === '，' ? ', ' : punctuation === '；' ? '; ' : punctuation === '。' ? '. ' : punctuation
        return text + mapped
      })
      if (translated.every((part) => !/\p{Script=Han}/u.test(part))) {
        return translated.join('').trimEnd()
      }
    }
  }
  return value
}

function translateParts(parts) {
  const combined = parts.join("")
  // 先逐段翻译：相邻的静态文案各自都是 key 时，不能因为拼起来多了一个逗号
  // 就交给整句回退，否则会把其中一半留在中文。
  const translatedParts = parts.map((part) => translateText(part))
  if (translatedParts.some((part, index) => part !== parts[index])) {
    return translatedParts.join("")
  }
  const translated = translateText(combined)
  if (translated !== combined) return translated
  return combined
}

function localizeChildren(children) {
  const output = []
  let buffer = []
  const flush = () => {
    if (!buffer.length) return
    output.push(translateParts(buffer))
    buffer = []
  }
  for (const child of children) {
    if (typeof child === "string" || typeof child === "number") {
      buffer.push(String(child))
      continue
    }
    flush()
    output.push(localizeNode(child))
  }
  flush()
  return output
}

function localizeNode(node) {
  if (Array.isArray(node)) return localizeChildren(node)
  return translateText(node)
}

function localizeProps(props) {
  if (!props || typeof props !== 'object') return props
  const next = { ...props }
  for (const key of ['title', 'placeholder', 'aria-label', 'alt']) {
    if (typeof next[key] === 'string') next[key] = translateText(next[key])
  }
  if (typeof next.label === 'string') next.label = translateText(next.label)
  // 组件也常用 <Button children="刷新" /> 的写法；React 会把它当子节点，
  // 不处理就会在英文/第三方语言下漏翻。
  if (typeof next.children === 'string') next.children = translateText(next.children)
  else if (Array.isArray(next.children)) next.children = next.children.map(localizeNode)
  return next
}

/** 本地化元素工厂：替换组件里的 React createElement，让静态文案命中词典时翻译。 */
export function h(type, props, ...children) {
  // JSX 常把 `更新于 {${time}}` 拆成相邻的字符串/数字子节点；先合并再匹配模板，
  // 否则「更新于 」和「2026-…」各自翻译，动态文案永远命中不了 templates。
  return reactCreateElement(type, localizeProps(props), ...localizeChildren(children))
}

/**
 * 把 Host 下发的词典包规范化为可安装条目（只做形状校验）。
 * 语义校验（重复语言/回退链）留给 installLocaleDictionaries：那里才拿得到
 * DSH 实际注册的语言目录。
 * @param {object} payload - { locales, errors? }
 * @returns {{locales: Array, errors: Array}}
 */
export function normalizeLocalePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('词典包格式错误：期望 JSON 对象')
  }
  const errors = Array.isArray(payload.errors) ? [...payload.errors] : []
  const locales = []
  for (const raw of Array.isArray(payload.locales) ? payload.locales : []) {
    const id = String(raw?.id ?? '')
    try {
      // Host 下发的是规范化后的扁平形状，这里还原成文件契约再校验一次。
      locales.push(normalizeLocaleDictionary({
        id,
        source: `${id || 'locale'}.json`,
        raw: {
          meta: raw?.meta,
          language: { label: raw?.label, fallback: raw?.fallback },
          messages: raw?.messages,
          templates: raw?.templates,
          templateValues: raw?.templateValues,
        },
      }))
    } catch (error) {
      errors.push({
        code: 'invalid-dictionary',
        file: `${id || 'locale'}.json`,
        message: String(error?.message ?? error),
      })
    }
  }
  return { locales, errors }
}

/**
 * 拉取并规范化当前安装包里的全部语言词典。
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - 测试注入
 * @param {string} [options.endpoint] - 路由地址
 * @param {AbortSignal} [options.signal] - 卸载时中断
 * @returns {Promise<{locales: Array, errors: Array}>}
 */
export async function loadLocaleDictionaries({
  fetchImpl = globalThis.fetch,
  endpoint = LOCALE_ENDPOINT,
  signal,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('当前环境没有 fetch，无法加载语言词典')
  const response = await fetchImpl(endpoint, {
    signal,
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(globalThis.__DEVHUB_TOKEN__ ? { 'x-devhub-token': String(globalThis.__DEVHUB_TOKEN__) } : {}),
    },
  })
  if (!response?.ok) {
    throw new Error(`语言词典请求失败：HTTP ${response?.status ?? 'unknown'}`)
  }
  const bundle = normalizeLocalePayload(await response.json())
  if (!bundle.locales.length) {
    throw new Error('语言词典包为空：Host 没有下发任何可用词典')
  }
  return bundle
}

function registeredLocaleIds(locale) {
  try {
    const catalog = locale?.getLocale?.()?.locales
    return (Array.isArray(catalog) ? catalog : [])
      .map((entry) => String(entry?.id ?? '').toLowerCase())
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * 把词典包注册进 DSH locale 服务：已注册语言只注册命名空间字典，未注册语言
 * 再按 fallback 顺序 addLanguage。动态模板保存在本模块内，供 h 工厂使用。
 * 返回幂等 disposer，供 ctx.effect 在卸载/HMR 时清理。
 * @param {object} ctx - DSH 插件上下文
 * @param {{locales:Array, errors?:Array}|Array} bundle - 词典包
 * @param {{warn?: Function}} [options]
 * @returns {{installed: string[], warnings: string[], errors: Array, dispose: Function}}
 */
export function installLocaleDictionaries(ctx, bundle, { warn = console.warn } = {}) {
  const locale = ctx?.locale
  const entries = Array.isArray(bundle) ? bundle : (bundle?.locales ?? [])
  const warnings = []
  const disposers = []
  const installedResources = []
  const installed = []
  const report = (warning) => {
    warnings.push(warning)
    try {
      if (typeof warn === 'function') warn(`[dev-hub] ${warning}`)
    } catch { /* 日志失败不影响工作站 */ }
  }

  if (!locale || typeof locale.register !== 'function') {
    report('locale 服务不可用：界面保留中文原文')
    return { installed, warnings, errors: [], dispose() {} }
  }

  // DSH 版本不同，内置语言目录也不同（0.2.x 还内置 ja/es/fr/de/ru/pt）。
  // 以运行时 snapshot 为准，已注册语言跳过 addLanguage，只补命名空间字典。
  const knownLocales = registeredLocaleIds(locale)
  const inputErrors = Array.isArray(bundle?.errors) ? bundle.errors : []
  const final = finalizeLocaleBundle(entries, { errors: inputErrors, knownLocales })
  const errors = mergeLocaleIssues(inputErrors, final.errors)
  for (const entry of errors) {
    report(`词典校验：${entry?.message ?? entry}`)
  }

  for (const entry of final.locales) {
    try {
      disposers.push(locale.register(LOCALE_NAMESPACE, entry.id, entry.messages))
      installed.push(entry.id)
      // DSH 只接收 messages；模板由本桥保存，按 locale 覆盖/回退 en。
      const resource = {
        templates: new Map(Object.entries(entry.templates ?? {})),
        templateValues: { ...(entry.templateValues ?? {}) },
        fallback: entry.fallback,
        compiled: new Map(),
      }
      templateResources.set(entry.id, resource)
      installedResources.push({ id: entry.id, resource })
    } catch (error) {
      report(`语言「${entry.id}」词典注册失败：${String(error?.message ?? error)}`)
    }
  }

  if (typeof locale.addLanguage === 'function') {
    const { order, unresolved } = languageRegistrationOrder(final.locales, {
      availableLocales: knownLocales,
    })
    for (const entry of unresolved) {
      report(`语言「${entry.id}」的 fallback 链无法排序，已跳过`)
    }
    for (const entry of order) {
      try {
        disposers.push(locale.addLanguage({
          id: entry.id,
          label: entry.label,
          fallback: entry.fallback,
        }))
        if (!installed.includes(entry.id)) installed.push(entry.id)
      } catch (error) {
        report(`语言「${entry.id}」注册失败：${String(error?.message ?? error)}`)
      }
    }
  } else if (final.locales.some((entry) => !knownLocales.includes(entry.id))) {
    report('locale 服务不支持 addLanguage：未注册语言只注册字典，需宿主侧提供语言定义')
  }

  return {
    installed,
    warnings,
    errors,
    dispose() {
      for (const dispose of disposers.splice(0).reverse()) {
        try {
          if (typeof dispose === 'function') dispose()
        } catch { /* 清理失败不阻塞卸载 */ }
      }
      // 只删自己安装的资源：HMR 期间旧 disposer 不能清掉新实例的模板。
      for (const { id, resource } of installedResources) {
        if (templateResources.get(id) === resource) templateResources.delete(id)
      }
    },
  }
}

/**
 * 语言切换时重新渲染子树：现有组件不逐个订阅 locale，父级重渲染即可让所有
 * 静态文案重新经过 h 工厂；不换 key，避免丢失当前页签/流程状态。
 */
export function LocaleProvider({ ctx, children }) {
  const [, setRevision] = useState(0)
  useEffect(() => {
    try {
      const subscribe = ctx?.locale?.subscribe
      if (typeof subscribe !== 'function') return undefined
      const dispose = subscribe(() => setRevision((value) => value + 1))
      // 词典是异步下发的：订阅后强制刷一次，覆盖“首帧已渲染、词典刚注册完”的窗口。
      setRevision((value) => value + 1)
      return dispose
    } catch {
      // 语言服务不可用时保留中文原文，不影响工作站主体
      return undefined
    }
  }, [ctx])

  let locale = 'zh'
  try {
    locale = ctx?.locale?.getLocale?.().active ?? 'zh'
    activeLocale = locale
    activeT = typeof ctx?.locale?.bind === 'function' ? ctx.locale.bind(LOCALE_NAMESPACE) : (key) => key
  } catch {
    activeLocale = 'zh'
    activeT = (key) => key
  }
  const child = Array.isArray(children) ? children[0] : children
  if (!child) return null
  // 重新克隆但不换 key：保留当前页签/流程状态，只让子树重新经过 h 工厂翻译
  return cloneElement(child)
}
