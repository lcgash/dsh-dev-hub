/**
 * Host 侧词典加载器：在运行时读取包内 locale/*.json，一次返回全部语言。
 *
 * 新增语言只需往 locale/ 放一个词典文件，无需改客户端代码或重新构建
 * lib/client.js；浏览器每次加载页面通过 GET /api/dev-hub/locales 取最新内容。
 * 单个文件损坏不拖垮其余语言：问题进入 errors，由客户端显式打日志。
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  finalizeLocaleBundle,
  localeIdOfFile,
  normalizeLocaleDictionary,
} from '../shared/locale.mjs'

/**
 * 从模块 file URL 推导可能存放 locale/ 的目录。
 * 源码运行时是 src/host，构建后是 lib/，两种布局都要能命中。
 * @param {string} [moduleUrl] - 当前模块 URL
 * @returns {string[]} 候选目录（按优先级）
 */
export function localeDirCandidates(moduleUrl = import.meta.url) {
  const here = dirname(fileURLToPath(moduleUrl))
  return [
    join(here, 'locale'),
    join(here, '..', 'locale'),
    join(here, '..', '..', 'locale'),
  ]
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * 读取并校验一个词典目录。
 * @param {object} [options]
 * @param {string} [options.dir] - 显式目录（测试夹具用）；缺省按模块路径探测
 * @param {string} [options.moduleUrl] - 覆盖模块 URL（测试/嵌入用）
 * @returns {Promise<{ok:boolean,dir:string,locales:Array,errors:Array}>}
 */
export async function loadLocaleBundle({ dir, moduleUrl } = {}) {
  const candidates = dir ? [dir] : localeDirCandidates(moduleUrl)
  let resolved = null
  for (const candidate of candidates) {
    if (await isDirectory(candidate)) {
      resolved = candidate
      break
    }
  }
  if (!resolved) {
    throw new Error(`找不到 locale 词典目录（已尝试：${candidates.join('、')}）`)
  }

  const files = (await readdir(resolved))
    .filter((file) => file.toLowerCase().endsWith('.json'))
    .sort()
  const errors = []
  const locales = []
  for (const file of files) {
    const id = localeIdOfFile(file)
    if (!id) {
      errors.push({ code: 'invalid-file-name', message: `locale/${file}: 文件名不是合法语言 id`, file })
      continue
    }
    try {
      const raw = await readFile(join(resolved, file), 'utf8')
      locales.push(normalizeLocaleDictionary({ id, raw, source: file }))
    } catch (error) {
      errors.push({ code: 'invalid-dictionary', message: String(error?.message ?? error), file })
    }
  }

  // Host 不知道浏览器侧实际注册了哪些语言（DSH 版本可能内置 ja/fr 等）：
  // 允许暂不认识的回退目标，交给客户端按真实 catalog 再校验。
  const bundle = finalizeLocaleBundle(locales, { errors, allowUnknownFallback: true })
  return {
    ok: bundle.errors.length === 0,
    dir: resolved,
    locales: bundle.locales,
    errors: bundle.errors,
  }
}
