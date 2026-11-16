import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { repoRelative } from './paths.mjs'

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'target', 'build', 'dist', 'out', '.idea', '.vscode',
  'vendor', 'coverage', '.next', '__pycache__', '.venv', 'venv', '.gradle',
])

/** Default role labels for the package names this repository uses most. */
const JAVA_ROLES = {
  controller: '接口层',
  service: '业务编排',
  dao: '持久化',
  model: '数据载体',
  manager: '配置原子能力',
  scheduler: '状态机调度',
  executor: '任务执行器',
  hook: '副作用扩展',
  source: '源适配',
  client: '出站客户端',
  config: '配置',
  constant: '常量',
  utils: '工具',
  exception: '异常',
}

const MAX_MODULES = 60

async function isDir(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function subdirs(path, { skip = SKIP_DIRS } = {}) {
  let entries
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !skip.has(entry.name))
    .map((entry) => entry.name)
    .sort()
}

/** Descend through single-child package directories (src/main/java/com/acme/app). */
async function javaPackageRoot(repo) {
  let current = join(repo, 'src', 'main', 'java')
  if (!(await isDir(current))) return null
  for (let depth = 0; depth < 8; depth++) {
    const children = await subdirs(current, { skip: new Set(['META-INF']) })
    const javaFiles = await readdir(current).catch(() => [])
    const hasJava = javaFiles.some((name) => name.endsWith('.java'))
    if (hasJava) return current
    if (children.length !== 1) return current
    current = join(current, children[0])
  }
  return current
}

/**
 * Suggest the directories/modules a flow can own.
 * Best effort: an absent or unreadable tree yields fewer suggestions, never an error.
 */
export async function suggestModules(repo, { limit = MAX_MODULES } = {}) {
  const out = []
  const seen = new Set()
  const push = (name, path, kind, role) => {
    const key = path
    if (!name || !path || seen.has(key)) return
    seen.add(key)
    out.push({ name, path, kind, ...(role ? { role } : {}), suggested: kind === 'java-package' })
  }

  const javaRoot = await javaPackageRoot(repo)
  if (javaRoot) {
    push(javaRoot.split(/[/\\]/).pop(), repoRelative(repo, javaRoot), 'dir', '根包')
    for (const name of await subdirs(javaRoot)) {
      push(name, repoRelative(repo, join(javaRoot, name)), 'java-package', JAVA_ROLES[name])
    }
  }

  // 注意不要把 src 的子目录（main/test）当成模块：它们是布局目录，不是模块
  for (const parent of ['packages', 'apps', 'lib', 'modules']) {
    const root = join(repo, parent)
    if (!(await isDir(root))) continue
    for (const name of await subdirs(root)) {
      push(name, repoRelative(repo, join(root, name)), 'module')
    }
  }

  for (const name of await subdirs(repo)) {
    push(name, name, 'dir')
  }

  return out.slice(0, limit)
}

/** Normalize user-entered scope entries: plain paths and `module:<name>` keys only. */
/**
 * 虚拟库路径前缀：`web/src/a.js` 在成员 label 已知时拆成 { repo:'web', path:'src/a.js' }。
 * 只认调用方给的 label，避免把普通目录名当成成员库。
 */
export function splitRepoPrefix(path, repoNames = []) {
  const value = String(path ?? '').replace(/\\/g, '/')
  for (const name of repoNames ?? []) {
    const key = String(name ?? '').trim()
    if (key && value.startsWith(`${key}/`) && value.length > key.length + 1) {
      return { repo: key, path: value.slice(key.length + 1) }
    }
  }
  return null
}

/**
 * 一个文件属于哪个“开发模块”：用于评估工程量、分组实施步骤。
 * - src/(main|test)/java/.../pipeline/<pkg>/... → <pkg>
 * - src/main/resources/db/... → db
 * - docs/** → docs
 * - 其他 → 第一段目录
 * 虚拟库路径（`<label>/<rel>`）会带上成员库前缀返回，例如 `web/src`。
 */
export function moduleOfPath(path, repoNames = []) {
  const split = splitRepoPrefix(path, repoNames)
  if (split) return `${split.repo}/${moduleOfPath(split.path)}`
  const value = String(path ?? '').replace(/\\/g, '/')
  const java = /src\/(?:main|test)\/java\/.+?\/pipeline\/([^/]+)\//.exec(value)
  if (java) return java[1]
  const resources = /src\/main\/resources\/([^/]+)\//.exec(value)
  if (resources) return resources[1]
  if (value.startsWith('docs/')) return 'docs'
  if (value.startsWith('tools/')) return 'tools'
  const first = value.split('/')[0]
  return first || 'root'
}

/** 代码 / 测试 / 文档 粗分类，决定实施步骤怎么排。 */
export function kindOfPath(path, repoNames = []) {
  const split = splitRepoPrefix(path, repoNames)
  const value = String(split ? split.path : path ?? '')
  if (/\/test\/|Test\.(java|ts|js)$|test\.(mjs|js|ts)$/i.test(value)) return 'test'
  if (value.startsWith('docs/') || /\.md$/i.test(value)) return 'docs'
  return 'code'
}

export function normalizeScope(entries) {
  const out = []
  const seen = new Set()
  for (const raw of Array.isArray(entries) ? entries : []) {
    let key = String(raw ?? '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/\/+$/, '')
    if (!key) continue
    if (key.startsWith('module:')) key = `module:${key.slice(7).trim().toLowerCase()}`
    if (!key || key === 'module:') continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

/** Overlapping scope keys between two flows; empty means they can run in parallel. */
export function scopeOverlap(left, right) {
  const a = normalizeScope(left)
  const b = normalizeScope(right)
  const overlap = new Set()
  for (const x of a) {
    for (const y of b) {
      if (x === y) {
        overlap.add(x)
        continue
      }
      const xModule = x.startsWith('module:')
      const yModule = y.startsWith('module:')
      if (xModule !== yModule) continue
      if (xModule) continue
      if (x.startsWith(y + '/') || y.startsWith(x + '/')) {
        overlap.add(x.length <= y.length ? x : y)
      }
    }
  }
  return [...overlap]
}
