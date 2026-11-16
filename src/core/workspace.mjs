/**
 * 虚拟库（多代码库组合）的纯逻辑与证据聚合。
 *
 * 设计口径：
 * - 虚拟库只存在本机 profile.workspaces；台账/规范/上下文/证据写本机独立目录
 *   `~/.dev-hub/workspaces/<id>/`，不写任何成员库的 `.dev-hub/`。
 * - 成员库一视同仁：没有 primary/主库，聚合与 baseline 不按 repos[0] 优先。
 * - 每个成员库有一个稳定、短、可读的 **label**（目录名的 slug，重名时追加 -2/-3），
 *   跨库的 scope、recon 文件路径、变更文件都用 `<label>/<repo 相对路径>` 表示；
 *   scope 也接受 `<label>:<repo 相对路径>`（聊天探测返回的格式）。
 * - 这里不发起任何网络请求，只读本地 git；单库路径的行为保持原样。
 */
import { basename, resolve } from 'node:path'
import { changesSince, gitInfo } from './git.mjs'
import { moduleOfPath } from './modules.mjs'

/** 成员库 label 允许的字符：中文/字母/数字/._-；其余压成 `-`。 */
export function sanitizeLabel(value, fallback = 'repo') {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return cleaned || fallback
}

/** 从路径推导 label（只取最后一段目录名）。 */
export function repoLabel(path, used = new Set()) {
  const raw = String(path ?? '').replace(/[\\/]+$/, '')
  const base = sanitizeLabel(basename(raw), 'repo')
  let name = base
  let index = 2
  while (used.has(name)) name = `${base}-${index++}`
  used.add(name)
  return name
}

/**
 * 把成员库路径列表变成稳定的成员描述。
 * 只描述“有哪些库”，不区分主次（没有 primary）。
 * @param {string[]} repos
 * @returns {{path: string, name: string}[]}
 */
export function workspaceMembers(repos) {
  const used = new Set()
  return (Array.isArray(repos) ? repos : [])
    .map((path) => String(path ?? '').trim())
    .filter(Boolean)
    .map((path) => ({
      path,
      name: repoLabel(path, used),
    }))
}

function samePath(left, right) {
  try {
    return resolve(String(left)) === resolve(String(right))
  } catch {
    return String(left) === String(right)
  }
}

/**
 * 按路径 / label / 目录名找成员库。
 * @param {{path: string, name: string}[]} members
 * @param {string} ref
 */
export function memberByRef(members, ref) {
  const value = String(ref ?? '').trim()
  if (!value) return null
  const list = Array.isArray(members) ? members : []
  return list.find((member) => member.name === value)
    ?? list.find((member) => samePath(member.path, value))
    ?? list.find((member) => member.workRoot && samePath(member.workRoot, value))
    ?? list.find((member) => member.name.toLowerCase() === value.toLowerCase())
    ?? list.find((member) => repoLabel(member.path) === sanitizeLabel(value))
    ?? null
}

/**
 * 拆分 `<label>/<rel>` 或 `<label>:<rel>` 形式的跨库路径。
 * 只有前缀正好是成员 label 时才拆，避免把普通 `docs/README.md` 误判。
 * @returns {{member: object, path: string, name: string} | null}
 */
export function splitRepoScopedPath(value, members) {
  const raw = String(value ?? '').trim().replace(/\\/g, '/')
  if (!raw) return null
  const list = Array.isArray(members) ? members : []
  for (const member of list) {
    if (raw.startsWith(`${member.name}/`) && raw.length > member.name.length + 1) {
      return { member, name: member.name, path: raw.slice(member.name.length + 1) }
    }
    if (raw.startsWith(`${member.name}:`) && raw.length > member.name.length + 1) {
      return { member, name: member.name, path: raw.slice(member.name.length + 1) }
    }
    // 绝对路径 / 成员库完整路径
    const prefix = String(member.path).replace(/\\/g, '/').replace(/\/+$/, '')
    if (prefix && raw.startsWith(`${prefix}/`)) {
      return { member, name: member.name, path: raw.slice(prefix.length + 1) }
    }
  }
  return null
}

function pathUnder(scopePath, filePath) {
  const left = String(scopePath ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
  const right = String(filePath ?? '').replace(/\\/g, '/')
  if (!left) return false
  return right === left || right.startsWith(`${left}/`)
}

/**
 * 判断一个变更文件是否落在流程 scope 内（虚拟库感知）。
 *
 * 支持：
 * - scope `web:src` / `web/src` 对 `web/src/a.js`
 * - scope `src` 对任意成员库里的 `src/a.js`（跨库同名目录）
 * - scope `module:source` 对任意成员库中模块名为 source 的文件
 *
 * @param {string[]} scope
 * @param {{path?: string, repo?: string, repoName?: string}} file
 * @param {{path: string, name: string}[]} [members]
 */
export function scopeMatchesFile(scope, file, members = []) {
  const tokens = Array.isArray(scope) ? scope.filter(Boolean) : []
  if (!tokens.length) return true
  const rel = String(file?.path ?? '').replace(/\\/g, '/')
  if (!rel) return false
  const member = file?.repoName
    ? memberByRef(members, file.repoName)
    : file?.repo ? memberByRef(members, file.repo) : null
  const moduleName = moduleOfPath(rel)
  for (const token of tokens) {
    const split = splitRepoScopedPath(token, members)
    const scopePath = split ? split.path : String(token)
    if (split && member && split.member.name !== member.name) continue
    if (scopePath.startsWith('module:')) {
      if (moduleName === scopePath.slice('module:'.length)) return true
      continue
    }
    if (pathUnder(scopePath, rel)) return true
    if (!split && member && pathUnder(scopePath, `${member.name}/${rel}`)) return true
  }
  return false
}

/**
 * 取成员库自己的 baseline。
 *
 * 只按成员库路径/label 精确匹配：没有 `baseline.repos` 的老数据不会再把顶层
 * commit/branch 借给“第一个成员库”——成员库平权，不伪造任何成员库的 baseline。
 */
export function baselineForMember(baseline, member) {
  if (!baseline) return null
  const list = Array.isArray(baseline.repos) ? baseline.repos : []
  return list.find((entry) => entry && (samePath(entry.path, member?.path) || entry.name === member?.name)) ?? null
}

function emptyChanges(info, reason) {
  return {
    evidenceComplete: false,
    reason,
    changes: info?.changes ?? [],
    commits: [],
    stat: info?.shortStat ?? null,
    baseCommit: null,
    headCommit: info?.head ?? null,
  }
}

/**
 * 为每个成员库收集 git 事实与 baseline 以来的变更。
 * 单个成员库失败（不是 git、路径失效）不会让整组失败，但会显式标注原因。
 *
 * @param {{path: string, name: string}[]} members
 * @param {object | null} baseline
 */
export async function collectWorkspaceEvidence(members, baseline) {
  const list = Array.isArray(members) ? members : []
  const rows = []
  for (const member of list) {
    const memberRoot = member.workRoot ?? member.path
    let info = null
    try {
      info = await gitInfo(memberRoot)
    } catch (error) {
      rows.push({
        path: member.path,
        workRoot: memberRoot,
        name: member.name,
        isRepo: false,
        branch: null,
        head: null,
        baseCommit: null,
        evidenceComplete: false,
        reason: `读取 git 失败：${String(error?.message ?? error)}`,
        changes: [],
        commits: [],
        changedFiles: 0,
        workingFiles: 0,
      })
      continue
    }
    if (!info.available) {
      rows.push({
        path: member.path,
        workRoot: memberRoot,
        name: member.name,
        isRepo: false,
        branch: null,
        head: null,
        baseCommit: null,
        evidenceComplete: false,
        reason: '不是 git 仓库：无法统计基线以来变更',
        changes: [],
        commits: [],
        changedFiles: 0,
        workingFiles: 0,
      })
      continue
    }
    const base = baselineForMember(baseline, member)
    let result
    try {
      result = base?.commit
        ? await changesSince(memberRoot, base)
        : emptyChanges(info, base
          ? '这个成员库的 baseline 没有 commit'
          : '这个成员库还没有记录 baseline')
    } catch (error) {
      result = emptyChanges(info, `读取变更失败：${String(error?.message ?? error)}`)
    }
    const changes = (result.changes ?? []).map((change) => ({
      ...change,
      path: `${member.name}/${change.path}`,
      repoPath: change.path,
      repo: memberRoot,
      repoName: member.name,
    }))
    rows.push({
      path: member.path,
      workRoot: memberRoot,
      name: member.name,
      isRepo: true,
      branch: info.branch,
      head: info.head,
      baseCommit: result.baseCommit ?? null,
      evidenceComplete: result.evidenceComplete !== false,
      reason: result.reason ?? null,
      changes,
      commits: result.commits ?? [],
      changedFiles: changes.length,
      workingFiles: (info.changes ?? []).length,
    })
  }
  const changes = rows.flatMap((row) => row.changes)
  return {
    members: rows,
    changes,
    totals: {
      files: changes.length,
      members: rows.length,
      changedMembers: rows.filter((row) => row.changedFiles > 0).length,
    },
    evidenceComplete: rows.every((row) => row.evidenceComplete !== false),
  }
}

/**
 * 为虚拟库记录一组 baseline（每个成员库一个 commit/branch）。
 *
 * 顶层 `commit`/`branch` 固定为 null：虚拟库没有“代表库”，
 * 消费方必须按成员库读取（`baseline.repos`）。
 */
export async function workspaceBaseline(members) {
  const list = Array.isArray(members) ? members : []
  const startedAt = new Date().toISOString()
  const repos = []
  for (const member of list) {
    let info = null
    try {
      info = await gitInfo(member.workRoot ?? member.path)
    } catch {
      info = null
    }
    repos.push({
      path: member.path,
      name: member.name,
      commit: info?.head ?? null,
      branch: info?.branch ?? null,
      isRepo: Boolean(info?.available),
      startedAt,
    })
  }
  return {
    startedAt,
    // 没有主库：不在顶层放某个成员库的 commit/branch
    commit: null,
    branch: null,
    repos,
  }
}

/**
 * 把成员库证据聚合成一份跨库变更事实（供 Context Pack / 报告使用）。
 * 顶层 baseCommit/headCommit 为 null：逐成员库的事实只在 members 里。
 */
export function workspaceChanges(evidence) {
  const members = evidence?.members ?? []
  const changes = (evidence?.changes ?? []).map((change) => ({ ...change }))
  return {
    evidenceComplete: evidence?.evidenceComplete !== false,
    reason: members.find((member) => member.evidenceComplete === false)?.reason ?? null,
    members,
    changes,
    commits: members.flatMap((member) => (member.commits ?? []).map((commit) => ({
      ...commit,
      repo: member.path,
      repoName: member.name,
    }))),
    totals: evidence?.totals ?? { files: changes.length, members: members.length, changedMembers: 0 },
    baseCommit: null,
    headCommit: null,
  }
}

/** 变更文件统一的可点击/可 diff key。 */
export function fileKey(file) {
  const name = file?.repoName
  const path = String(file?.path ?? '').replace(/\\/g, '/')
  if (!name) return path
  return path.startsWith(`${name}/`) ? path : `${name}/${path}`
}
