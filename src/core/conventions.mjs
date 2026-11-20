import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { exists } from './paths.mjs'
import { dataDir, readJson, writeJsonAtomic, now, SCHEMA_VERSION } from './store.mjs'
import { catalogFor, constraintsOf, defaultSkillIds, findSkill } from './skills.mjs'

/** Repo-shared conventions file written on first development in a repository. */
export const CONVENTIONS_FILE = 'conventions.json'

/**
 * 规范文件的落盘路径：
 * - 单代码库：`<repo>/.dev-hub/conventions.json`（团队共享）
 * - 本机虚拟库：`~/.dev-hub/workspaces/<id>/conventions.json`（只在本人本机）
 *
 * 布局由 store 的 `dataDir` 统一分流，调用方不用关心是哪种。
 */
export function conventionsPath(repo) {
  return join(dataDir(repo), CONVENTIONS_FILE)
}

async function hasFile(repo, relative) {
  try {
    return (await stat(join(repo, relative))).isFile()
  } catch {
    return false
  }
}

/**
 * package.json 依赖命中这些包即视为「前端仓库」（只认框架，不认构建工具）：
 * SCA/SCM 用 React + Vite，Vite 本身不触发，React 命中才算。
 */
export const FRONTEND_FRAMEWORKS = [
  'react',
  'react-dom',
  'vue',
  '@angular/core',
  'svelte',
  '@sveltejs/kit',
  'solid-js',
  'preact',
  'next',
  'nuxt',
  'gatsby',
  '@remix-run/react',
  'astro',
  'ember-source',
  'lit',
  '@builder.io/qwik',
  'alpinejs',
  'stimulus',
]

/**
 * 纯构建工具/元框架：单独出现也说明这是前端工程（Vite/Parcel/Next 等），
 * 但它们不是 UI 框架，不能混进 frameworks 列表里。
 */
export const FRONTEND_TOOLING = [
  'vite',
  '@vitejs/plugin-react',
  '@vitejs/plugin-vue',
  '@vitejs/plugin-svelte',
  'parcel',
  'webpack-dev-server',
  'next',
  'nuxt',
  'astro',
  '@sveltejs/kit',
]

function packageDependencyNames(pkg) {
  const names = new Set()
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg?.[field]
    if (!deps || typeof deps !== 'object') continue
    for (const name of Object.keys(deps)) names.add(name)
  }
  return names
}

/**
 * 从一个 package.json 对象判断是否前端仓库（纯函数，便于单测）。
 * 命中 dependencies / devDependencies / peerDependencies / optionalDependencies 任意一处即算。
 */
export function detectFrontendFramework(pkg) {
  if (!pkg || typeof pkg !== 'object') return { frontend: false, frameworks: [] }
  const names = packageDependencyNames(pkg)
  const frameworks = FRONTEND_FRAMEWORKS.filter((name) => names.has(name))
  return { frontend: frameworks.length > 0, frameworks }
}

/** 构建工具/元框架探测：Vite 单独出现也算前端工程，但不冒充 UI 框架。 */
export function detectFrontendTooling(pkg) {
  if (!pkg || typeof pkg !== 'object') return []
  const names = packageDependencyNames(pkg)
  return FRONTEND_TOOLING.filter((name) => names.has(name))
}

/** 读取仓库 package.json；不存在返回 null，损坏时显式告警后按非前端处理（不阻断初始化）。 */
export async function readPackageJson(repo) {
  try {
    return JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
  } catch (error) {
    // package.json 存在但解析失败：前端探测降级为 false，但要让原因在宿主日志里看得见
    console.warn(`[dev-hub] 读取 ${join(repo, 'package.json')} 失败，跳过前端框架探测：${error?.message ?? error}`)
    return null
  }
}

/**
 * 包管理器探测：packageManager 字段优先，其次 lockfile；都没有时 npm。
 * 前端仓库不一定用 npm（pnpm/yarn/bun 都很常见），命令生成必须跟仓库一致。
 */
export async function detectPackageManager(repo, pkg = null) {
  const declared = String(pkg?.packageManager ?? '').split('@')[0].trim()
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(declared)) return declared
  if (await hasFile(repo, 'pnpm-lock.yaml')) return 'pnpm'
  if (await hasFile(repo, 'yarn.lock')) return 'yarn'
  if (await hasFile(repo, 'bun.lock') || await hasFile(repo, 'bun.lockb')) return 'bun'
  if (await hasFile(repo, 'package-lock.json')) return 'npm'
  return 'npm'
}

/** 只保留 package.json 里可执行的 scripts，避免把任意字段当命令。 */
function packageScripts(pkg) {
  const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {}
  const out = {}
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command === 'string' && command.trim()) out[name] = command.trim()
  }
  return out
}

/**
 * 单仓库里的前端子项目（Java 根 + web/、pnpm monorepo 的 apps/*、packages/*）：
 * 根 package.json 缺失或不是前端时，不能直接判定“这个仓库没有前端”。
 */
const FRONTEND_SUBPROJECT_DIRS = ['web', 'frontend', 'ui', 'client', 'admin', 'console']

export async function detectFrontendProjects(repo) {
  const candidates = [...FRONTEND_SUBPROJECT_DIRS]
  for (const parent of ['apps', 'packages']) {
    try {
      const entries = await readdir(join(repo, parent), { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) candidates.push(`${parent}/${entry.name}`)
      }
    } catch {
      // absent
    }
  }
  const projects = []
  for (const relative of [...new Set(candidates)].slice(0, 12)) {
    const dir = join(repo, relative)
    if (!(await hasFile(dir, 'package.json'))) continue
    const pkg = await readPackageJson(dir)
    if (!pkg) continue
    const framework = detectFrontendFramework(pkg)
    const tooling = detectFrontendTooling(pkg)
    if (!framework.frontend && !tooling.length) continue
    projects.push({
      path: relative,
      name: typeof pkg.name === 'string' && pkg.name.trim() ? pkg.name.trim() : relative.split('/').pop(),
      packageManager: await detectPackageManager(dir, pkg),
      frameworks: framework.frameworks,
      frontendTooling: tooling,
      scripts: packageScripts(pkg),
    })
  }
  return projects
}

/** Best-effort repository profile used to pick the default convention set. */
export async function detectRepoProfile(repo) {
  const [maven, gradle, node, checkScript, agents, codeGuide] = await Promise.all([
    hasFile(repo, 'pom.xml'),
    hasFile(repo, 'build.gradle') || hasFile(repo, 'build.gradle.kts'),
    hasFile(repo, 'package.json'),
    hasFile(repo, 'scripts/check.sh'),
    hasFile(repo, 'AGENTS.md'),
    exists(join(repo, 'docs', 'code-guide')),
  ])
  const java = maven || gradle || (await exists(join(repo, 'src', 'main', 'java')))
  const language = java ? 'java' : node ? 'node' : 'generic'
  const pkg = node ? await readPackageJson(repo) : null
  const frontend = node ? detectFrontendFramework(pkg) : { frontend: false, frameworks: [] }
  const frontendTooling = node ? detectFrontendTooling(pkg) : []
  const frontendProjects = await detectFrontendProjects(repo)
  const packageManager = node ? await detectPackageManager(repo, pkg) : (maven ? 'mvn' : null)
  const gates = []
  if (checkScript) gates.push('sh scripts/check.sh --full')
  return {
    language,
    frontend: frontend.frontend || frontendTooling.length > 0 || frontendProjects.length > 0,
    frameworks: [...new Set([...frontend.frameworks, ...frontendProjects.flatMap((project) => project.frameworks)])],
    frontendTooling: [...new Set([...frontendTooling, ...frontendProjects.flatMap((project) => project.frontendTooling)])],
    frontendProjects,
    build: maven ? 'maven' : gradle ? 'gradle' : node ? packageManager : null,
    packageManager,
    scripts: node ? packageScripts(pkg) : {},
    checkScript,
    agentsDoc: agents ? 'AGENTS.md' : null,
    codeGuide: codeGuide ? 'docs/code-guide' : null,
    gates,
  }
}

/**
 * 默认规范 = 安装一组默认技能包（L0 全语言 + 对应语言包；
 * 仓库是前端仓库时再加 frontend-ui，不命中前端框架的仓库不会被强塞），
 * constraints 每条带 `skill` 归属，便于技能页安装/卸载与分组。
 */
export function buildDefaultConventions({ repo, name, profile, context }) {
  const language = profile?.language ?? 'generic'
  const frontend = Boolean(profile?.frontend)
  const frameworks = Array.isArray(profile?.frameworks) ? profile.frameworks : []
  const skillIds = defaultSkillIds(language, { frontend })
  const constraints = []
  for (const skillId of skillIds) {
    const pack = findSkill(skillId)
    for (const entry of constraintsOf(pack)) {
      if (!constraints.some((current) => current.id === entry.id)) constraints.push(entry)
    }
  }
  const commands = context?.commands ?? {}
  if (profile?.checkScript && !constraints.some((entry) => entry.id === 'gate')) {
    constraints.push({
      id: 'gate',
      title: '改完必须跑门禁',
      rule: '提交前跑仓库门禁；门禁红了修代码，不改门禁。',
      check: { kind: 'gate', value: 'sh scripts/check.sh' },
      skill: 'java-gates',
    })
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now(),
    generator: 'dsh-dev-hub',
    profile,
    project: {
      name: name || repo.split(/[/\\]/).filter(Boolean).pop() || 'repository',
      language,
      frontend,
      frameworks,
      build: profile?.build ?? null,
    },
    // 已安装的技能包（技能页安装/卸载只动这一层与对应 constraints）
    installedSkills: skillIds.map((id) => {
      const pack = findSkill(id)
      return { id, name: pack?.name ?? id, level: pack?.level ?? 'L1', installedAt: now() }
    }),
    constraints,
    commands,
    docs: context?.docs ?? [],
    workflow: {
      stages: ['discovery', 'techdoc', 'plan', 'develop', 'review', 'verify', 'submit', 'done'],
      requiredBeforeStart: ['rootProblem', 'threeAnsweredQuestions', 'techDocDecision', 'planSummary', 'planSteps', 'estimate', 'acceptance'],
      parallelPolicy: 'scope-overlap-serial',
    },
    updatedAt: now(),
  }
}

/** 把历史 conventions（无 installedSkills / 无 skill 归属）补齐成新结构。 */
export function normalizeConventions(raw) {
  if (!raw || typeof raw !== 'object') return null
  const constraints = (Array.isArray(raw.constraints) ? raw.constraints : []).map((entry) => ({
    ...entry,
    skill: entry.skill ?? 'custom',
  }))
  let installed = Array.isArray(raw.installedSkills) ? raw.installedSkills.filter((entry) => entry?.id) : null
  if (!installed) {
    // 老数据：按 constraint id 反推已安装的技能包，避免升级后“看起来一个都没装”
    installed = []
    for (const pack of catalogFor(raw.project?.language ?? 'generic')) {
      const ids = (pack.constraints ?? []).map((constraint) => constraint.id)
      if (ids.some((id) => constraints.some((entry) => entry.id === id))) {
        installed.push({ id: pack.id, name: pack.name, level: pack.level, installedAt: raw.generatedAt ?? now() })
      }
    }
  }
  // 老文件没有 skill 归属：按推导出的已安装包回填，避免所有约束都变成 custom
  const idToSkill = new Map()
  for (const entry of installed) {
    const pack = findSkill(entry.id)
    for (const constraint of pack?.constraints ?? []) idToSkill.set(constraint.id, entry.id)
  }
  const attributed = constraints.map((entry) => (
    entry.skill === 'custom' && idToSkill.has(entry.id) ? { ...entry, skill: idToSkill.get(entry.id) } : entry
  ))
  return { ...raw, constraints: attributed, installedSkills: installed, schemaVersion: SCHEMA_VERSION }
}

/** 安装一个技能包：追加约束（按 id 去重）并记一条 installedSkills。 */
export function installSkill(conventions, skillId) {
  const pack = findSkill(skillId)
  if (!pack) throw new Error(`未知技能：${skillId}`)
  const next = normalizeConventions(conventions) ?? { constraints: [], installedSkills: [] }
  if (next.installedSkills.some((entry) => entry.id === skillId)) {
    return { conventions: next, changed: false, reason: 'already-installed' }
  }
  const existing = new Set(next.constraints.map((entry) => entry.id))
  const added = constraintsOf(pack).filter((entry) => !existing.has(entry.id))
  next.constraints = [...next.constraints, ...added]
  next.installedSkills = [...next.installedSkills, { id: pack.id, name: pack.name, level: pack.level, installedAt: now() }]
  next.updatedAt = now()
  return { conventions: next, changed: true, added: added.length }
}

/** 卸载一个技能包：只移除它带来的约束，不动其他包与自定义项。 */
export function uninstallSkill(conventions, skillId) {
  const next = normalizeConventions(conventions) ?? { constraints: [], installedSkills: [] }
  if (!next.installedSkills.some((entry) => entry.id === skillId)) {
    return { conventions: next, changed: false, reason: 'not-installed' }
  }
  const before = next.constraints.length
  next.constraints = next.constraints.filter((entry) => entry.skill !== skillId)
  next.installedSkills = next.installedSkills.filter((entry) => entry.id !== skillId)
  next.updatedAt = now()
  return { conventions: next, changed: true, removed: before - next.constraints.length }
}

function normalizeCheck(check) {
  const kind = ['gate', 'files', 'imports', 'checklist'].includes(check?.kind) ? check.kind : 'checklist'
  return { kind, value: String(check?.value ?? '').trim() || null }
}

/** 新增一条自定义约束。 */
export function addCustomConstraint(conventions, input) {
  const next = normalizeConventions(conventions) ?? { constraints: [], installedSkills: [] }
  const id = String(input?.id ?? '').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()
  if (!id) throw new Error('约束需要 id（字母/数字/-/_）')
  if (next.constraints.some((entry) => entry.id === id)) throw new Error(`约束 id 已存在：${id}`)
  const title = String(input?.title ?? '').trim()
  const rule = String(input?.rule ?? '').trim()
  if (!title || !rule) throw new Error('约束需要标题与规则内容')
  const entry = {
    id,
    title,
    rule,
    skill: 'custom',
    check: normalizeCheck(input?.check),
    doc: String(input?.doc ?? '').trim() || null,
    gate: String(input?.gate ?? '').trim() || null,
  }
  next.constraints = [...next.constraints, entry]
  next.updatedAt = now()
  return { conventions: next, constraint: entry }
}

/** 修改一条约束（自定义或内置都可改；内置改动会保留 skill 归属）。 */
export function updateConstraint(conventions, input) {
  const next = normalizeConventions(conventions) ?? { constraints: [], installedSkills: [] }
  const index = next.constraints.findIndex((entry) => entry.id === input?.id)
  if (index < 0) throw new Error(`约束不存在：${input?.id}`)
  const current = next.constraints[index]
  next.constraints[index] = {
    ...current,
    title: String(input.title ?? current.title).trim(),
    rule: String(input.rule ?? current.rule).trim(),
    check: input.check ? normalizeCheck(input.check) : current.check,
    doc: input.doc === undefined ? current.doc : (String(input.doc).trim() || null),
    gate: input.gate === undefined ? current.gate : (String(input.gate).trim() || null),
  }
  next.updatedAt = now()
  return { conventions: next, constraint: next.constraints[index] }
}

/** 删除一条约束：只允许删自定义的（内置的应通过卸载技能包移除，保持可追溯）。 */
export function removeConstraint(conventions, id) {
  const next = normalizeConventions(conventions) ?? { constraints: [], installedSkills: [] }
  const target = next.constraints.find((entry) => entry.id === id)
  if (!target) throw new Error(`约束不存在：${id}`)
  if (target.skill !== 'custom') throw new Error('内置约束请通过卸载对应技能包移除')
  next.constraints = next.constraints.filter((entry) => entry.id !== id)
  next.updatedAt = now()
  return { conventions: next }
}

/** 按当前已安装技能重建约束（保留自定义项），用于“重新生成默认”。 */
export function regenerateConventions(conventions) {
  const current = normalizeConventions(conventions)
  if (!current) throw new Error('还没有规范文件，无法重建')
  const custom = current.constraints.filter((entry) => entry.skill === 'custom')
  const constraints = []
  for (const installed of current.installedSkills) {
    const pack = findSkill(installed.id)
    if (!pack) continue
    for (const entry of constraintsOf(pack)) {
      if (!constraints.some((existing) => existing.id === entry.id)) constraints.push(entry)
    }
  }
  return { ...current, constraints: [...constraints, ...custom], generatedAt: now(), updatedAt: now() }
}

/**
 * 读一个显式路径上的规范文件（本机路径读写接口）。
 * 虚拟库的规范就在本机目录里，和仓库内的规范用同一份结构。
 */
export async function loadConventionsFromFile(path) {
  const raw = await readJson(path)
  if (!raw || typeof raw !== 'object') return null
  return normalizeConventions({ ...raw, schemaVersion: Number(raw.schemaVersion) || SCHEMA_VERSION })
}

/** 写一个显式路径上的规范文件（本机路径读写接口）。 */
export async function saveConventionsToFile(path, conventions) {
  const value = { ...conventions, schemaVersion: SCHEMA_VERSION, updatedAt: now() }
  await writeJsonAtomic(path, value)
  return value
}

/** Read the conventions file for a ledger root (repo or local workspace dir). */
export async function loadConventions(repo) {
  return loadConventionsFromFile(conventionsPath(repo))
}

/** Persist the conventions file for a ledger root (repo or local workspace dir). */
export async function saveConventions(repo, conventions) {
  return saveConventionsToFile(conventionsPath(repo), conventions)
}

/** True when this ledger root has never generated its convention pack. */
export async function isFirstRun(repo) {
  return !(await exists(conventionsPath(repo)))
}

/**
 * 合并多个成员库的画像（虚拟库用）：成员库平权，取并集而不是看“第一个”。
 * 语言：有 java 就 java，其次 node，否则 generic；前端/框架取并集；门禁与文档取并集。
 */
export function mergeRepoProfiles(profiles) {
  const list = (Array.isArray(profiles) ? profiles : []).filter((entry) => entry && typeof entry === 'object')
  const languages = new Set(list.map((entry) => entry.language).filter(Boolean))
  const language = languages.has('java') ? 'java' : languages.has('node') ? 'node' : 'generic'
  const frameworks = [...new Set(list.flatMap((entry) => entry.frameworks ?? []))].sort()
  const frontendTooling = [...new Set(list.flatMap((entry) => entry.frontendTooling ?? []))].sort()
  const frontendProjects = list.flatMap((entry) => entry.frontendProjects ?? [])
  const gates = [...new Set(list.flatMap((entry) => entry.gates ?? []))].sort()
  return {
    language,
    frontend: list.some((entry) => entry.frontend === true),
    frameworks,
    frontendTooling,
    frontendProjects,
    build: list.find((entry) => entry.build)?.build ?? null,
    packageManager: list.find((entry) => entry.packageManager)?.packageManager ?? null,
    checkScript: list.some((entry) => entry.checkScript === true),
    agentsDoc: list.some((entry) => entry.agentsDoc) ? 'AGENTS.md' : null,
    codeGuide: list.some((entry) => entry.codeGuide) ? 'docs/code-guide' : null,
    gates,
    // 虚拟库：画像来自多个成员库，记录下来便于排查（不参与规则判定）
    mergedFrom: list.length,
  }
}

/** Small projection for the UI and the Context Pack. */
export function summarizeConventions(conventions) {
  if (!conventions) return null
  return {
    generatedAt: conventions.generatedAt ?? null,
    language: conventions.project?.language ?? 'generic',
    frontend: Boolean(conventions.project?.frontend),
    frameworks: Array.isArray(conventions.project?.frameworks) ? conventions.project.frameworks : [],
    frontendProjects: (conventions.profile?.frontendProjects ?? []).map((project) => ({
      path: project.path,
      name: project.name ?? null,
      packageManager: project.packageManager ?? null,
      frameworks: project.frameworks ?? [],
    })),
    build: conventions.project?.build ?? null,
    constraints: (conventions.constraints ?? []).length,
    constraintsById: (conventions.constraints ?? []).map((entry) => entry.id),
    skills: (conventions.installedSkills ?? []).map((entry) => entry.id),
    customConstraints: (conventions.constraints ?? []).filter((entry) => entry.skill === 'custom').length,
    commands: Object.keys(conventions.commands ?? {}),
    docs: conventions.docs ?? [],
    parallelPolicy: conventions.workflow?.parallelPolicy ?? null,
  }
}

/** Read a conventions file from an explicit path (used by tests). */
export async function readConventionsFile(path) {
  const raw = JSON.parse(await readFile(path, 'utf8'))
  return raw && typeof raw === 'object' ? raw : null
}
