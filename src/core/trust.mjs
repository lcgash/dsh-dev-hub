/**
 * 外部 CLI 的工作区信任：
 * - Claude Code 的普通 claude 命令没有 --trust-workspace（那是 self-hosted-runner 的参数），
 *   新 worktree 会停在 "Workspace not trusted"；信任状态存在 ~/.claude.json 的
 *   projects[path].hasTrustDialogAccepted。
 * - Codex 的交互终端读 ~/.codex/config.toml 的 [projects.'path'] trust_level；
 *   codex exec 可以用 --trust 持久化信任。
 * - Pi 用 --approve 显式信任本次运行的 project-local 文件。
 *
 * 本模块只做纯文本/对象变换，读盘与写盘由 Host 负责，避免 core 依赖本机路径。
 */

function projectRoots(roots) {
  return [...new Set((Array.isArray(roots) ? roots : [roots])
    .map((root) => String(root ?? '').trim())
    .filter(Boolean))]
}

/**
 * 给 Claude 全局配置补上工作区信任（保留已有 project 字段，不覆盖 allowedTools 等）。
 * @returns {{ config: object, changed: boolean }}
 */
export function withClaudeWorkspaceTrust(config, roots) {
  const base = config && typeof config === 'object' && !Array.isArray(config) ? config : {}
  const projects = base.projects && typeof base.projects === 'object' && !Array.isArray(base.projects)
    ? { ...base.projects }
    : {}
  let changed = false
  for (const root of projectRoots(roots)) {
    const current = projects[root] && typeof projects[root] === 'object' ? projects[root] : {}
    if (current.hasTrustDialogAccepted === true) continue
    projects[root] = {
      ...current,
      allowedTools: Array.isArray(current.allowedTools) ? current.allowedTools : [],
      hasTrustDialogAccepted: true,
    }
    changed = true
  }
  return { config: changed ? { ...base, projects } : base, changed }
}

function tomlPathKey(path) {
  // TOML basic string：JSON 的转义规则对反斜杠/引号与 TOML 基本字符串兼容
  return JSON.stringify(String(path))
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findProjectSection(text, root) {
  const key = tomlPathKey(root)
  const re = new RegExp(`^\\[projects\\.(?:'${escapeRegExp(root.replace(/'/g, "\\'"))}'|${escapeRegExp(key)})[ \\t]*\\][ \\t]*\\r?\\n`, 'm')
  const match = re.exec(text)
  if (!match) return null
  const start = match.index
  const headerEnd = start + match[0].length
  const next = text.slice(headerEnd).search(/^\[[^\]]+\][ \t]*\r?\n/m)
  const end = next < 0 ? text.length : headerEnd + next
  return { start, headerEnd, end, block: text.slice(start, end) }
}

/**
 * 给 Codex config.toml 补 [projects."<path>"] trust_level='trusted'。
 * 已存在同名 section 时只改 trust_level，不追加重复 section。
 * @returns {{ text: string, changed: boolean }}
 */
export function withCodexWorkspaceTrust(text, roots) {
  let next = String(text ?? '')
  let changed = false
  for (const root of projectRoots(roots)) {
    const section = findProjectSection(next, root)
    if (!section) {
      const prefix = next.length && !next.endsWith('\n') ? '\n' : ''
      next += `${prefix}[projects.${tomlPathKey(root)}]\ntrust_level = 'trusted'\n`
      changed = true
      continue
    }
    if (/^trust_level[ \t]*=[ \t]*'trusted'[ \t]*\r?\n/m.test(section.block)) continue
    const block = section.block.replace(/^trust_level[ \t]*=[^\r\n]*\r?\n/m, '')
    const separator = block.endsWith('\n') ? '' : '\n'
    next = `${next.slice(0, section.start)}${block}${separator}trust_level = 'trusted'\n${next.slice(section.end)}`
    changed = true
  }
  return { text: next, changed }
}
