import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { repoRelative } from './paths.mjs'
import { suggestModules } from './modules.mjs'

/**
 * 代码探测：用户只说“我要做什么”，这里先把仓库扫一遍，回答
 * “大概要改哪些文件、命中在哪一行”，交给用户二次确认。
 *
 * 设计取舍：
 * - 纯本地、确定性（同样的描述 + 同样的仓库 = 同样的结果），便于缓存与测试；
 * - 不用 LLM：探测结果要能被用户逐条核对，且不能把仓库内容整份发出去；
 * - 只读文本、有上限（文件数/大小/深度/命中数），仓库再大也不会卡住。
 */

/** 目录级跳过：这些东西里不可能有本次要改的源码。 */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'target', 'build', 'dist', 'out', 'coverage', '.next',
  'vendor', '.idea', '.vscode', '.gradle', '__pycache__', '.venv', 'venv', '.dev-hub',
])

export const TEXT_EXTS = new Set([
  '.java', '.kt', '.kts', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.py', '.go', '.rs',
  '.xml', '.yml', '.yaml', '.json', '.md', '.sql', '.sh', '.properties', '.gradle', '.toml', '.txt',
])

/** 中文功能词：出现在 2-gram 里基本没有检索价值（“表的”“的标”）。 */
const CJK_STOP_CHARS = /[的了着过给和与把被为对从到向在就也都很更最会能可要将需想使让并且但而且或是之其这那个上下中里后前时]/
const CJK_STOP_WORDS = new Set([
  '实现', '支持', '新增', '修改', '需要', '可以', '功能', '进行', '完成', '处理', '使用',
  '以及', '相关', '内容', '问题', '代码', '文件', '方法', '时候', '一个', '这个', '什么',
  '怎么', '如何', '现在', '目前', '希望', '能够', '应该', '不要', '没有', '已有', '补齐',
])

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'then', 'than', 'have', 'has',
  'are', 'was', 'were', 'will', 'would', 'should', 'could', 'not', 'but', 'you', 'your', 'our', 'its',
  'of', 'to', 'in', 'on', 'at', 'by', 'as', 'is', 'be', 'or', 'an', 'it', 'we', 'can', 'need', 'want',
  'add', 'new', 'use', 'make', 'let', 'get', 'set',
])

const DEFAULT_LIMITS = {
  maxFiles: 12,
  maxScan: 4000,
  maxDepth: 12,
  maxBytes: 256 * 1024,
  maxMatchesPerFile: 3,
  maxTokens: 30,
  maxFilesPerToken: 40,
}

/** 从自然语言描述里抽检索词：英文词 + 中文整段 + 中文 2-gram。 */
export function extractTokens(description, { max = DEFAULT_LIMITS.maxTokens } = {}) {
  const text = String(description ?? '')
  const ascii = (text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []).filter((word) => !STOP_WORDS.has(word))
  const runs = text.match(/[\u4e00-\u9fff]{2,}/g) ?? []
  const tokens = []
  for (const run of runs) {
    // 整段保留（够具体，命中就非常可信）
    tokens.push(run)
    // 2-gram 只作为补充；含功能词的切法（“表的”“的标”）直接丢掉
    if (run.length > 4) {
      for (let i = 0; i + 2 <= run.length; i++) {
        const bigram = run.slice(i, i + 2)
        if (CJK_STOP_CHARS.test(bigram) || CJK_STOP_WORDS.has(bigram)) continue
        tokens.push(bigram)
      }
    }
  }
  const seen = new Set()
  const out = []
  for (const token of [...ascii, ...tokens]) {
    const value = token.trim()
    if (value.length < 2 || seen.has(value)) continue
    // 纯功能词（“实现”“支持”）或含功能词的 2-gram 不值得检索
    if (CJK_STOP_WORDS.has(value)) continue
    if (value.length === 2 && CJK_STOP_CHARS.test(value)) continue
    seen.add(value)
    out.push(value)
    if (out.length >= max) break
  }
  return out
}

export function isTextFile(name) {
  const index = name.lastIndexOf('.')
  return index > 0 && TEXT_EXTS.has(name.slice(index).toLowerCase())
}

export async function walkFiles(root, limits, state) {
  const out = []
  async function visit(dir, depth) {
    if (depth > limits.maxDepth || out.length >= limits.maxScan || state.truncated) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (out.length >= limits.maxScan) { state.truncated = true; return }
      if (entry.name.startsWith('.') && entry.name !== '.github') continue
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await visit(join(dir, entry.name), depth + 1)
        continue
      }
      if (!entry.isFile() || !isTextFile(entry.name)) continue
      const path = join(dir, entry.name)
      try {
        const info = await stat(path)
        if (info.size > limits.maxBytes) continue
      } catch {
        continue
      }
      out.push(path)
    }
  }
  await visit(root, 0)
  return out
}

function matchLines(content, tokenList, limit) {
  const lines = content.split(/\r?\n/)
  const preferred = []
  const fallback = []
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase()
    if (!tokenList.some((token) => lower.includes(token))) continue
    const text = lines[i].trim()
    if (!text) continue
    const entry = { line: i + 1, text: text.length > 200 ? text.slice(0, 200) + '…' : text }
    // package/import 行信息量最低，只在没有别的命中时才用
    if (/^(package|import)\b/.test(entry.text)) fallback.push(entry)
    else preferred.push(entry)
    if (preferred.length >= limit) break
  }
  return [...preferred, ...fallback].slice(0, limit)
}

/** 命中文件 -> 归属模块（取最长的路径前缀）。 */
function moduleFor(modules, path) {
  let best = null
  for (const module of modules) {
    if (!module.path) continue
    if (path === module.path || path.startsWith(module.path + '/')) {
      if (!best || module.path.length > best.path.length) best = module
    }
  }
  return best
}

/** 代码文件比文档/测试配置更可能是“要改的地方”，同分时排在前面。 */
function isCodePath(path) {
  return /\.(java|kt|ts|tsx|js|jsx|mjs|vue|py|go|rs)$/.test(path)
    && !path.includes('/test/')
    && !path.startsWith('docs/')
}

/**
 * 建议范围：只在“真正的模块”里挑，并且去掉被更深范围覆盖的父目录。
 * 否则会给出 src/main、docs 这类粗粒度路径，让并行冲突判定形同虚设。
 */
function pickScope(modules, files) {
  const chosen = []
  // 只保留“更具体”的范围：父目录不会顶掉子目录，子目录会替换掉父目录
  const add = (path) => {
    if (!path || chosen.includes(path)) return
    for (const existing of chosen) {
      if (existing.startsWith(path + '/')) return // 已有更具体范围，忽略父目录
    }
    for (let i = chosen.length - 1; i >= 0; i--) {
      if (path.startsWith(chosen[i] + '/')) chosen.splice(i, 1) // 用子目录替换父目录
    }
    chosen.push(path)
  }

  const specific = modules.filter((entry) => entry.path && entry.kind !== 'dir')
  // 有具体模块时不再补 src/main、docs 这类粗粒度目录，否则并行冲突判定形同虚设
  for (const entry of specific) add(entry.path)
  if (!chosen.length) {
    for (const entry of modules.filter((item) => item.path)) add(entry.path)
  }
  if (!chosen.length) {
    for (const file of files.slice(0, 3)) {
      add(file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : file.path)
    }
  }
  return chosen.slice(0, 4)
}

export async function reconRepo(repo, description, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options }
  const tokens = extractTokens(description, { max: limits.maxTokens })
  const state = { truncated: false }
  const result = {
    description: String(description ?? '').trim(),
    tokens,
    files: [],
    modules: [],
    suggestedScope: [],
    scanned: 0,
    truncated: false,
  }
  if (!tokens.length) return result

  const modules = await suggestModules(repo, { limit: 200 })
  // 有索引时只对候选文件做二次扫描（读文件拿命中行），避免每次全仓 walk+read。
  const provided = Array.isArray(options.fileList) && options.fileList.length ? options.fileList : null
  const candidates = provided ?? await walkFiles(repo, limits, state)
  result.scanned = Number(options.scannedTotal) || candidates.length
  result.truncated = provided ? false : state.truncated

  // 第一遍：记录每个文件命中了哪些检索词（用于文档频率过滤），以及命中行
  const perFile = []
  const df = new Map()
  for (const path of candidates) {
    const rel = repoRelative(repo, path)
    const lowerRel = rel.toLowerCase()
    const content = await readFile(path, 'utf8').catch(() => '')
    // 先多收一些命中行，等“稀有词”筛完再截断，否则前 3 行可能全是 package/import 这种噪声
    const matches = content ? matchLines(content, tokens, Math.max(12, limits.maxMatchesPerFile)) : []
    const lowerMatches = matches.map((match) => match.text.toLowerCase())
    const hitTokens = new Set()
    for (const token of tokens) {
      const inPath = lowerRel.includes(token)
      const inBody = lowerMatches.some((text) => text.includes(token))
      if (inPath || inBody) hitTokens.add(token)
    }
    for (const token of hitTokens) df.set(token, (df.get(token) ?? 0) + 1)
    if (hitTokens.size) perFile.push({ rel, lowerRel, matches, hitTokens })
  }

  // 第二遍：丢掉“到处都是”的词（中文 2-gram 尤其容易噪声），再按保留词重新计分
  // 只对中文词做“太常见就丢掉”（中文 2-gram 噪声大）；英文词保留，靠 IDF 权重自然降权
  const ubiquitous = Math.max(3, Math.floor(candidates.length * 0.15))
  const isCjk = (token) => /[\u4e00-\u9fff]/.test(token)
  let kept = tokens.filter((token) => {
    const count = df.get(token) ?? 0
    if (count <= 0) return false
    if (isCjk(token)) return count <= ubiquitous
    return true
  })
  if (!kept.length) kept = tokens.filter((token) => (df.get(token) ?? 0) > 0)

  const scored = []
  for (const file of perFile) {
    let score = 0
    const base = file.lowerRel.slice(file.lowerRel.lastIndexOf('/') + 1)
    for (const token of kept) {
      // 越少见的词越可信：用户点名的 GitlabCodeProvider 应压过到处都有的 webhook
      const weight = 1 + Math.log((candidates.length + 1) / ((df.get(token) ?? 1) + 1))
      if (base.includes(token)) score += 7 * weight
      else if (file.lowerRel.includes(token)) score += 4 * weight
      for (const text of file.matches.map((match) => match.text.toLowerCase())) {
        if (text.includes(token)) { score += weight; break }
      }
    }
    if (score <= 0) continue
    // 构建产物/依赖目录里的文本（尤其是本插件自己的 bundle）不是要改的地方
    if (/(^|\/)(lib|dist|build|out|target|coverage)\//.test(file.lowerRel) || file.lowerRel.endsWith('.min.js')) score *= 0.4
    // 展示的命中行优先用“少见词”命中（用户点名的类名），而不是 source 这种到处都是的词
    const rare = Math.max(5, Math.floor(candidates.length * 0.02))
    const specific = kept.filter((token) => !isCjk(token) ? (df.get(token) ?? 0) <= rare : true)
    const pickTokens = specific.length ? specific : kept
    let matches = file.matches.filter((match) => pickTokens.some((token) => match.text.toLowerCase().includes(token)))
    if (!matches.length) matches = file.matches
    // package/import 行信息量最低，有别的命中就不要展示它们
    const meaningful = matches.filter((match) => !/^(package|import)\b/.test(match.text))
    if (meaningful.length) matches = meaningful
    scored.push({ path: file.rel, score: Math.round(score * 10) / 10, matches: matches.slice(0, limits.maxMatchesPerFile) })
  }

  result.effectiveTokens = kept
  scored.sort((a, b) => (b.score - a.score)
    || (Number(isCodePath(b.path)) - Number(isCodePath(a.path)))
    || a.path.localeCompare(b.path))
  result.files = scored.slice(0, limits.maxFiles)

  const hitsByModule = new Map()
  for (const file of result.files) {
    const module = moduleFor(modules, file.path)
    const key = module ? `${module.name}\u0000${module.path}` : `\u0000${file.path.split('/')[0] ?? ''}`
    const entry = hitsByModule.get(key) ?? {
      name: module?.name ?? (file.path.split('/')[0] ?? ''),
      path: module?.path ?? '',
      kind: module?.kind ?? 'dir',
      hits: 0,
    }
    entry.hits += 1
    hitsByModule.set(key, entry)
  }

  const allModules = [...hitsByModule.values()]
  const specificModules = allModules.filter((entry) => entry.kind !== 'dir')
  // 有具体模块时只报具体模块（source/controller…），避免 main、test 这类目录噪音
  result.modules = (specificModules.length ? specificModules : allModules)
    .sort((a, b) => (b.hits - a.hits) || a.path.localeCompare(b.path))
  result.suggestedScope = pickScope(allModules, result.files)
  return result
}
