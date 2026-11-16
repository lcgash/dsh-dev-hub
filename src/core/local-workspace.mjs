/**
 * 虚拟库的本机独立存储。
 *
 * 目录（虚拟库**不写任何成员库**的 `.dev-hub`）：
 * ```
 * ~/.dev-hub/workspaces/<workspace-id>/
 *   workspace.json       虚拟库清单（名字/成员/创建时间；本机事实）
 *   project.json         虚拟库自己的项目画像（Context Pack 的「可用命令」来源）
 *   conventions.json     规范与技能（虚拟库专属，成员库不共享）
 *   items/<item-id>.json 流程台账
 *   context/<item-id>.json / .md   Context Pack（生成时留档，可追溯）
 *   evidence/<item-id>.json        成员库 git 证据快照
 *   reports/             开发报告（由 host 写入）
 * ```
 *
 * 单代码库继续用 `<repo>/.dev-hub/`：两套布局由 `isWorkspaceLocalRoot` 分流，
 * 入口/视图/台账互不复用。
 */
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { exists, safeId } from './paths.mjs'
import {
  SCHEMA_VERSION,
  dataDir,
  isWorkspaceLocalRoot,
  now,
  readJson,
  workspaceLocalDir,
  writeJsonAtomic,
} from './store.mjs'

/** 虚拟库本机目录的固定布局（全部绝对路径，不读盘）。 */
export function workspaceLocalPaths(workspaceOrId) {
  const root = workspaceLocalDir(workspaceOrId)
  return {
    root,
    manifest: join(root, 'workspace.json'),
    project: join(root, 'project.json'),
    conventions: join(root, 'conventions.json'),
    items: join(root, 'items'),
    context: join(root, 'context'),
    evidence: join(root, 'evidence'),
    reports: join(root, 'reports'),
  }
}

/** 台账/规范/上下文/证据都落在同一个本机根目录里。 */
export function workspaceLedgerRoot(workspaceOrId) {
  return dataDir(workspaceLocalDir(workspaceOrId))
}

function defaultWorkspaceProject(workspace) {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: workspace?.name || '虚拟库',
    kind: 'virtual-workspace',
    createdAt: now(),
    context: {
      // 虚拟库没有“仓库内文档”这个概念：成员库各自的文档在成员库里，不在这里复制
      docs: [],
      commands: {},
    },
  }
}

/**
 * 确保虚拟库本机目录存在并写入清单/项目文件。
 * 已存在的文件不覆盖（避免重名重建时抹掉台账）。
 */
export async function ensureWorkspaceLocalDir(workspace) {
  if (!workspace?.id) throw new Error('虚拟库需要 id')
  const paths = workspaceLocalPaths(workspace)
  await Promise.all([
    mkdir(paths.items, { recursive: true }),
    mkdir(paths.context, { recursive: true }),
    mkdir(paths.evidence, { recursive: true }),
  ])
  if (!(await exists(paths.manifest))) {
    await writeJsonAtomic(paths.manifest, {
      schemaVersion: SCHEMA_VERSION,
      kind: 'virtual-workspace',
      id: workspace.id,
      name: workspace.name ?? '',
      repos: Array.isArray(workspace.repos) ? [...workspace.repos] : [],
      createdAt: workspace.createdAt || now(),
      updatedAt: now(),
    })
  }
  if (!(await exists(paths.project))) {
    await writeJsonAtomic(paths.project, defaultWorkspaceProject(workspace))
  }
  return paths
}

/** 读虚拟库本机清单；不存在返回 null。 */
export async function readWorkspaceManifest(workspace) {
  const raw = await readJson(workspaceLocalPaths(workspace).manifest)
  return raw && typeof raw === 'object' ? raw : null
}

/** 虚拟库改名/换成员时同步本机清单（不碰任何成员库）。 */
export async function syncWorkspaceManifest(workspace) {
  if (!workspace?.id) return null
  const paths = await ensureWorkspaceLocalDir(workspace)
  const current = await readJson(paths.manifest) ?? {}
  const next = {
    ...current,
    schemaVersion: SCHEMA_VERSION,
    kind: 'virtual-workspace',
    id: workspace.id,
    name: workspace.name ?? current.name ?? '',
    repos: Array.isArray(workspace.repos) ? [...workspace.repos] : (current.repos ?? []),
    createdAt: current.createdAt || workspace.createdAt || now(),
    updatedAt: now(),
  }
  await writeJsonAtomic(paths.manifest, next)
  return next
}

/** 写一份 Context Pack 留档（JSON + Markdown），返回写入路径。 */
export async function writeWorkspaceContext(workspace, itemId, context) {
  const paths = await ensureWorkspaceLocalDir(workspace)
  const id = safeId(String(itemId ?? context?.summary?.itemId ?? 'context'))
  const jsonPath = join(paths.context, `${id}.json`)
  const mdPath = join(paths.context, `${id}.md`)
  await writeJsonAtomic(jsonPath, {
    schemaVersion: SCHEMA_VERSION,
    itemId: id,
    workspace: { id: workspace.id, name: workspace.name ?? '' },
    generatedAt: context?.generatedAt ?? now(),
    contextHash: context?.contextHash ?? null,
    prompt: context?.prompt ?? '',
    summary: context?.summary ?? null,
  })
  await writeFile(mdPath, String(context?.prompt ?? ''), 'utf8')
  return { json: jsonPath, markdown: mdPath }
}

/** 读一份已留档的 Context Pack；不存在返回 null。 */
export async function readWorkspaceContext(workspace, itemId) {
  const paths = workspaceLocalPaths(workspace)
  return readJson(join(paths.context, `${safeId(String(itemId ?? ''))}.json`))
}

/** 写一份成员库证据快照（逐库 git 事实 + 变更），返回路径。 */
export async function writeWorkspaceEvidence(workspace, itemId, evidence) {
  const paths = await ensureWorkspaceLocalDir(workspace)
  const id = safeId(String(itemId ?? 'evidence'))
  const path = join(paths.evidence, `${id}.json`)
  await writeJsonAtomic(path, {
    schemaVersion: SCHEMA_VERSION,
    itemId: id,
    workspace: { id: workspace.id, name: workspace.name ?? '' },
    generatedAt: now(),
    evidenceComplete: evidence?.evidenceComplete !== false,
    totals: evidence?.totals ?? null,
    repos: (evidence?.members ?? []).map((member) => ({
      path: member.path,
      name: member.name,
      isRepo: member.isRepo !== false,
      branch: member.branch ?? null,
      head: member.head ?? null,
      baseCommit: member.baseCommit ?? null,
      evidenceComplete: member.evidenceComplete !== false,
      reason: member.reason ?? null,
      changedFiles: member.changedFiles ?? (member.changes ?? []).length,
    })),
    changes: (evidence?.changes ?? []).map((change) => ({
      path: change.path,
      type: change.type ?? null,
      repo: change.repo ?? null,
      repoName: change.repoName ?? null,
    })),
  })
  return path
}

/** 读一份证据快照；不存在返回 null。 */
export async function readWorkspaceEvidence(workspace, itemId) {
  return readJson(join(workspaceLocalPaths(workspace).evidence, `${safeId(String(itemId ?? ''))}.json`))
}

/** 列出已留档的 Context Pack / 证据（诊断与验收使用）。 */
export async function listWorkspaceArtifacts(workspace, kind) {
  const paths = workspaceLocalPaths(workspace)
  const dir = kind === 'evidence' ? paths.evidence : kind === 'context' ? paths.context : paths.items
  try {
    const files = await readdir(dir)
    return files.filter((file) => file.endsWith('.json')).map((file) => join(dir, file)).sort()
  } catch {
    return []
  }
}

/** 删除流程时清掉它在本机虚拟库目录里的上下文/证据留档（台账由 store 负责）。 */
export async function removeWorkspaceItemArtifacts(workspace, itemId) {
  const id = safeId(String(itemId ?? ''))
  const paths = workspaceLocalPaths(workspace)
  const targets = [
    join(paths.context, `${id}.json`),
    join(paths.context, `${id}.md`),
    join(paths.evidence, `${id}.json`),
  ]
  let removed = 0
  for (const path of targets) {
    try {
      await unlink(path)
      removed += 1
    } catch {
      // 不存在就跳过：删除流程不该因为没生成过上下文而失败
    }
  }
  return removed
}

/** 路径是否属于本机虚拟库存储（host 侧做布局分流时复用）。 */
export function isVirtualWorkspacePath(path) {
  return isWorkspaceLocalRoot(path)
}
