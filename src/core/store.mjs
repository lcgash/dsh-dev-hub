import { realpathSync } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { canonical, exists, findRepoRoot, isUnder, safeId } from './paths.mjs'
import { DEFAULT_QUESTIONS, WORKFLOW_STAGES } from '../shared/workflow.mjs'
import { isWeakTitle, normalizeRequirementRecord } from '../shared/requirement.mjs'
import { normalizeAttachments } from '../shared/attachment.mjs'
import { SUPPLEMENT_MAX, normalizeDocsConfig } from './techdoc.mjs'
import { applyDerivedProgress } from './stage.mjs'
import { normalizeReview } from './review.mjs'
import { normalizeIntent } from './intent.mjs'
import { normalizeAutomation } from '../shared/automation.mjs'

/** Current schema version for both repo and local data. */
export const SCHEMA_VERSION = 1

/** Allowed item lifecycle states. */
export const STATUSES = ['planned', 'designing', 'developing', 'reviewing', 'verifying', 'done', 'blocked']

/** Local, non-committed profile directory. */
export const PROFILE_DIR = process.env.DEVHUB_HOME || join(homedir(), '.dsh', 'dev-hub')
export const PROFILE_PATH = join(PROFILE_DIR, 'profile.json')

/** Repo-local shared directory. */
export const REPO_DIR_NAME = '.dev-hub'

/**
 * 本机虚拟库根目录：默认 `~/.dev-hub/workspaces/`。
 *
 * 虚拟库（多代码库组合）不属于任何单个代码库，所以台账/规范/上下文/证据
 * 全部落在这一份本机目录里（`<root>/<id>/`），一个成员库都不写。
 *
 * 覆盖顺序：
 * 1. `DEVHUB_WORKSPACES_ROOT`（测试/多工作区隔离）；
 * 2. `DEVHUB_HOME`（profile 目录被显式改到别处时，虚拟库跟着一起隔离）；
 * 3. `~/.dev-hub/workspaces`（正常本机布局）。
 */
export function workspacesRoot() {
  const override = String(process.env.DEVHUB_WORKSPACES_ROOT ?? '').trim()
  if (override) return override
  const home = String(process.env.DEVHUB_HOME ?? '').trim()
  if (home) return join(home, 'workspaces')
  return join(homedir(), '.dev-hub', 'workspaces')
}

/** 一个虚拟库在本机独立目录里的根路径（不读盘、不建目录）。 */
export function workspaceLocalDir(workspaceOrId) {
  const id = typeof workspaceOrId === 'string' ? workspaceOrId : workspaceOrId?.id
  return join(workspacesRoot(), safeId(String(id ?? ''), 'workspace'))
}

function realpathSafe(path) {
  try {
    return realpathSync(path)
  } catch {
    return resolve(String(path))
  }
}

/**
 * 判断一个路径是不是本机虚拟库根目录。
 *
 * 台账/规范的落盘布局靠它分流：单代码库（`<repo>/.dev-hub`）与
 * 虚拟库（`<root>/`）互不混用。比较时同时看原始路径与真实路径，
 * 避免 macOS `/var` → `/private/var` 这类软链把虚拟库目录误判成普通仓库。
 */
export function isWorkspaceLocalRoot(root) {
  const value = String(root ?? '').trim()
  if (!value) return false
  try {
    const base = resolve(workspacesRoot())
    if (isUnder(resolve(value), base)) return true
    return isUnder(realpathSafe(value), realpathSafe(base))
  } catch {
    return false
  }
}

/**
 * 台账/规范/项目文件的落盘目录：
 * - 单代码库：`<repo>/.dev-hub`
 * - 本机虚拟库：`<root>` 本身（根目录就是虚拟库的本机台账）
 */
export function dataDir(root) {
  const value = resolve(String(root))
  return isWorkspaceLocalRoot(value) ? value : join(value, REPO_DIR_NAME)
}

function now() {
  return new Date().toISOString()
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temp = path + '.tmp-' + process.pid + '-' + Date.now()
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  await rename(temp, path)
}

/** Load the local profile; an absent/corrupt file starts empty. */
export async function loadProfile() {
  const raw = await readJson(PROFILE_PATH)
  if (!raw || typeof raw !== 'object') {
    return { schemaVersion: SCHEMA_VERSION, activeRepo: null, repos: {}, workspaces: [], itemWorkspaces: {} }
  }
  const workspaces = Array.isArray(raw.workspaces) ? raw.workspaces.filter((entry) => entry && entry.id && entry.name) : []
  let activeRepo = typeof raw.activeRepo === 'string' ? raw.activeRepo : null
  const repos = raw.repos && typeof raw.repos === 'object' ? { ...raw.repos } : {}
  let dirty = false

  // 迁移/兜底：虚拟库本机目录曾被误当成普通代码库（activeRepo=路径、repos 里多一张假卡）。
  // 只要这个路径能对应到一个已登记虚拟库，就还原成 workspace:<id>，并清掉假代码库登记。
  if (activeRepo && !activeRepo.startsWith('workspace:')) {
    const activePath = resolve(activeRepo)
    const matched = workspaces.find((workspace) => {
      try { return resolve(workspaceLocalDir(workspace)) === activePath } catch { return false }
    })
    if (matched) {
      activeRepo = `workspace:${matched.id}`
      dirty = true
    }
  }
  for (const key of Object.keys(repos)) {
    if (isWorkspaceLocalRoot(key)) {
      delete repos[key]
      dirty = true
    }
  }
  const profile = {
    schemaVersion: Number(raw.schemaVersion) || SCHEMA_VERSION,
    activeRepo,
    repos,
    // 虚拟库（多代码库组合）：本机保存，随 activeRepo 切换
    workspaces,
    // 流程 → 虚拟库的本机绑定：仓库台账里不写成员库路径，换人/换机后自然退回单库视图
    itemWorkspaces: raw.itemWorkspaces && typeof raw.itemWorkspaces === 'object' && !Array.isArray(raw.itemWorkspaces)
      ? raw.itemWorkspaces
      : {},
    // 自动化推进设置：本机偏好，不写仓库；缺省为完全自动化
    automation: normalizeAutomation(raw.automation),
  }
  // 迁移结果落盘一次，后续所有入口（state/setup/switchRepo）都看到干净 profile
  if (dirty) await writeJsonAtomic(PROFILE_PATH, profile)
  return profile
}

/** Persist the local profile. */
export async function saveProfile(profile) {
  await writeJsonAtomic(PROFILE_PATH, profile)
}

/** Get the local entry for a repo path (canonical key preferred). */
export function profileForRepo(profile, repoPath) {
  const key = resolve(repoPath)
  return profile.repos[key] ?? null
}

/**
 * Store one repo's identity/environment in the local profile.
 * `activate: false` 用于虚拟库：登记成员库身份，但不要把 activeRepo 从
 * `workspace:<id>` 切回某个成员库。
 */
export async function setProfileForRepo(profile, repoPath, entry, { activate = true } = {}) {
  const key = await canonical(repoPath)
  profile.repos[key] = { ...(profile.repos[key] ?? {}), ...entry, updatedAt: now() }
  if (activate) profile.activeRepo = key
  profile.schemaVersion = SCHEMA_VERSION
  return profile
}

/** Default project config for a newly initialized repo. */
export function defaultProject(repoPath, name) {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: name || repoPath.split(/[/\\]/).filter(Boolean).pop() || 'repository',
    createdAt: now(),
    context: {
      docs: ['AGENTS.md', 'docs/OPEN-ISSUES.md', 'docs/design'],
      commands: {},
    },
    // 技术文档默认：飞书（本机 lark-cli 登录，不存 token）；本地路径 docs/design/{id}.md
    docs: normalizeDocsConfig(),
  }
}

/** Load a repo project, creating the directory only when requested. */
export async function loadProject(repoPath, create = false) {
  const repo = await canonical(repoPath)
  const dir = dataDir(repo)
  const path = join(dir, 'project.json')
  let project = await readJson(path)
  if (!project && create) {
    project = defaultProject(repo, repo.split(/[/\\]/).filter(Boolean).pop())
    await mkdir(dir, { recursive: true })
    await writeJsonAtomic(path, project)
  }
  return project ? { repo, dir, project } : null
}

/** Persist a repo project. */
export async function saveProject(repoPath, project) {
  const repo = await canonical(repoPath)
  const path = join(dataDir(repo), 'project.json')
  await writeJsonAtomic(path, { ...project, schemaVersion: SCHEMA_VERSION })
}

function itemDir(repoPath) {
  return join(dataDir(repoPath), 'items')
}

/** Normalize one item read from disk or posted by the UI. */
function stageForStatus(status) {
  if (status === 'done') return 'done'
  if (status === 'reviewing') return 'review'
  if (status === 'verifying') return 'verify'
  if (status === 'developing') return 'develop'
  if (status === 'blocked') return 'develop'
  return 'discovery'
}

function questionList(raw) {
  const source = Array.isArray(raw) && raw.length ? raw : DEFAULT_QUESTIONS.map((question, index) => ({
    id: `q${index + 1}`,
    question,
    answer: '',
  }))
  return source.map((entry, index) => {
    const item = typeof entry === 'string' ? { question: entry } : (entry ?? {})
    return {
      id: safeId(item.id || `q${index + 1}`, `q${index + 1}`),
      question: String(item.question ?? '').trim(),
      answer: String(item.answer ?? '').trim(),
      answeredAt: item.answeredAt || null,
    }
  }).filter((entry) => entry.question)
}

function normalizeTechDoc(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const sync = value.sync && typeof value.sync === 'object' ? value.sync : {}
  return {
    // provider：飞书 / 本地 md / 外部链接 / 暂不需要。旧数据只看 decision。
    provider: ['feishu', 'local', 'link', 'none'].includes(value.provider) ? value.provider : null,
    decision: ['existing', 'create', 'none'].includes(value.decision) ? value.decision : null,
    exists: Boolean(value.exists),
    title: String(value.title ?? '').trim(),
    url: String(value.url ?? '').trim(),
    localPath: String(value.localPath ?? '').trim(),
    // 用户补充（Markdown）存台账：重新生成文档不会覆盖
    supplement: String(value.supplement ?? '').trim().slice(0, SUPPLEMENT_MAX),
    supplementUpdatedAt: value.supplementUpdatedAt || null,
    generatedAt: value.generatedAt || null,
    generatedHash: String(value.generatedHash ?? '').trim(),
    sync: {
      status: ['fresh', 'stale', 'external-modified', 'not-synced', 'conflict'].includes(sync.status) ? sync.status : null,
      checkedAt: sync.checkedAt || null,
      note: String(sync.note ?? '').trim().slice(0, 400),
    },
    createdBy: String(value.createdBy ?? '').trim(),
    createdAt: value.createdAt || null,
  }
}

function normalizePlan(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const template = value.template && typeof value.template === 'object' ? value.template : {}
  const estimate = value.estimate && typeof value.estimate === 'object' ? value.estimate : {}
  return {
    summary: String(value.summary ?? '').trim(),
    // 计划所属流程类型：分析流程的只读步骤与 bug/feature 的计划可区分（旧数据为 null）
    intent: normalizeIntent(value.intent) ?? null,
    steps: Array.isArray(value.steps) ? value.steps.map(String).filter(Boolean) : [],
    estimate: {
      size: ['S', 'M', 'L', 'XL'].includes(estimate.size) ? estimate.size : null,
      days: estimate.days === null || estimate.days === undefined || estimate.days === '' ? null : Number(estimate.days),
      confidence: ['low', 'medium', 'high'].includes(estimate.confidence) ? estimate.confidence : 'medium',
      notes: String(estimate.notes ?? '').trim(),
    },
    template: {
      id: String(template.id ?? '').trim() || null,
      name: String(template.name ?? '').trim() || null,
      touchpoints: Array.isArray(template.touchpoints) ? template.touchpoints.map(String).filter(Boolean).slice(0, 12) : [],
    },
    approvedAt: value.approvedAt || null,
  }
}

function normalizeTest(raw, { keepLocalWorkspace = true } = {}) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return {
    status: ['not_run', 'running', 'passed', 'failed', 'skipped'].includes(value.status) ? value.status : 'not_run',
    // 人工跳过：报告里必须能看出“跳过了、为什么跳过、谁跳的”
    skipReason: String(value.skipReason ?? '').trim().slice(0, 500),
    skippedBy: String(value.skippedBy ?? '').trim(),
    command: String(value.command ?? '').trim(),
    // 这条结果用的是哪来的命令：本机覆盖 / 项目命令 / 显式传入（没有就留空）
    commandSource: ['local', 'project', 'explicit'].includes(value.commandSource) ? value.commandSource : null,
    output: String(value.output ?? ''),
    at: value.at || null,
    durationMs: Number.isFinite(Number(value.durationMs)) ? Number(value.durationMs) : null,
    by: String(value.by ?? '').trim(),
    // 结论是否被之后的代码/诉求变化作废（历史结果仍保留，stage 不再把它当通过）
    stale: Boolean(value.stale),
    // 测试通过时这一版的「诉求 + 计划 + 范围 + 验收」哈希；诉求/计划一改就过期
    basisHash: String(value.basisHash ?? '').trim(),
    // 测试通过时的代码指纹（每个成员库的 HEAD + 已跟踪文件改动哈希）；之后的改动会让结果过期
    codeState: Array.isArray(value.codeState)
      ? value.codeState.map((entry) => ({
          name: String(entry?.name ?? ''),
          head: String(entry?.head ?? ''),
          dirty: String(entry?.dirty ?? ''),
        })).slice(0, 8)
      : [],
    // 虚拟库：每个成员库各跑一次，保留各自的结果（单库时为空）
    ...(Array.isArray(value.repos) && value.repos.length
      ? {
          repos: value.repos.map((entry) => ({
            ...(keepLocalWorkspace ? { path: String(entry?.path ?? '') } : {}),
            name: String(entry?.name ?? ''),
            skipped: Boolean(entry?.skipped),
            status: ['not_run', 'running', 'passed', 'failed'].includes(entry?.status) ? entry.status : 'not_run',
            command: String(entry?.command ?? '').trim(),
            output: String(entry?.output ?? '').slice(-120000),
            durationMs: Number.isFinite(Number(entry?.durationMs)) ? Number(entry.durationMs) : null,
          })).slice(0, 8),
        }
      : {}),
  }
}

function normalizeWorkflow(raw, status, { keepLocalWorkspace = true } = {}) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const stage = WORKFLOW_STAGES.some((entry) => entry.id === value.stage) ? value.stage : stageForStatus(status)
  const tests = value.tests && typeof value.tests === 'object' ? value.tests : {}
  return {
    stage,
    // 创建入口：chat = 聊天式（一句话 + 探测确认），门禁按 chat 分支校验
    entry: ['chat', 'form'].includes(value.entry) ? value.entry : null,
    // 是否 git 仓库：非 git 时没有提交/推送环节（测试通过即完成）；旧数据缺省按 git 处理
    gitRepo: value.gitRepo === false ? false : true,
    // 流程类型：bug（定位/修复）、feature（开发需求）或 analysis（只读分析）；缺省按 feature
    intent: normalizeIntent(value.intent) ?? 'feature',
    // 虚拟库流程：归属与成员库（前后端联动）；普通流程为空
    ...(Array.isArray(value.repos) && value.repos.length
      ? { repos: value.repos.map(String).filter(Boolean).slice(0, 8) }
      : {}),
    ...(value.workspace && typeof value.workspace === 'object' && value.workspace.id
      ? { workspace: { id: String(value.workspace.id), name: String(value.workspace.name ?? '') } }
      : {}),
    // 独立工作区只记分支/基线 commit；绝对路径在本机推导，不写进仓库台账
    ...(value.worktree && typeof value.worktree === 'object' && value.worktree.branch
      ? {
          worktree: {
            branch: String(value.worktree.branch),
            baseCommit: String(value.worktree.baseCommit ?? '') || null,
            createdAt: value.worktree.createdAt || null,
          },
        }
      : {}),
    // 虚拟库：每个成员库一个独立 worktree（只记成员名/分支/基线）
    ...(Array.isArray(value.worktrees) && value.worktrees.length
      ? {
          worktrees: value.worktrees
            .map((entry) => ({
              name: String(entry?.name ?? '').trim(),
              branch: String(entry?.branch ?? '').trim(),
              baseCommit: String(entry?.baseCommit ?? '') || null,
              createdAt: entry?.createdAt || null,
            }))
            .filter((entry) => entry.name && entry.branch)
            .slice(0, 8),
        }
      : {}),
    // 需求关联的内部会话：澄清/扫描子代理 id（可跨机重新打开；不是本机路径）
    ...(Array.isArray(value.clarifySessions) && value.clarifySessions.length
      ? { clarifySessions: value.clarifySessions.map(String).filter(Boolean).slice(0, 8) }
      : {}),
    ...(Array.isArray(value.scanSessions) && value.scanSessions.length
      ? { scanSessions: value.scanSessions.map(String).filter(Boolean).slice(0, 8) }
      : {}),
    rootProblem: String(value.rootProblem ?? '').trim(),
    discoveryNotes: String(value.discoveryNotes ?? '').trim(),
    questions: questionList(value.questions),
    techDoc: normalizeTechDoc(value.techDoc),
    plan: normalizePlan(value.plan),
    tests: {
      local: normalizeTest(tests.local, { keepLocalWorkspace }),
      environment: normalizeTest(tests.environment, { keepLocalWorkspace }),
    },
    // 独立评审：审核员名单、各自结论与依据（没有评审历史时为 null，旧流程不受影响）
    review: normalizeReview(value.review),
    // 重新开发：测试/评审通过后又出现了新改动，阶段回到「开发中」；重跑本机自测后清空
    rework: value.rework && value.rework.at
      ? {
          at: value.rework.at,
          reason: String(value.rework.reason ?? '').trim().slice(0, 400),
        }
      : null,
    submission: value.submission && typeof value.submission === 'object'
      ? {
          status: String(value.submission.status ?? ''),
          branch: String(value.submission.branch ?? ''),
          commit: String(value.submission.commit ?? ''),
          pushed: Boolean(value.submission.pushed),
          at: value.submission.at || null,
          message: String(value.submission.message ?? ''),
          // 虚拟库：每个成员库的提交/推送结果（部分失败要保留，不能只留顶层状态）
          ...(Array.isArray(value.submission.repos) && value.submission.repos.length
            ? {
                repos: value.submission.repos.map((entry) => ({
                  ...(keepLocalWorkspace ? { path: String(entry?.path ?? '') } : {}),
                  name: String(entry?.name ?? ''),
                  branch: String(entry?.branch ?? ''),
                  commit: String(entry?.commit ?? ''),
                  pushed: Boolean(entry?.pushed),
                  status: String(entry?.status ?? ''),
                  error: String(entry?.error ?? ''),
                  pushOutput: String(entry?.pushOutput ?? '').slice(-4000),
                })).slice(0, 8),
              }
            : {}),
        }
      : null,
    updatedAt: value.updatedAt || now(),
  }
}

export function sanitizeItem(raw, fallbackId, { keepLocalWorkspace = true } = {}) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const id = safeId(value.id || fallbackId || value.title, 'item')
  const status = STATUSES.includes(value.status) ? value.status : 'planned'
  const tasks = Array.isArray(value.tasks)
    ? value.tasks.map((task) => ({
        text: String(task?.text ?? '').trim(),
        done: Boolean(task?.done),
      })).filter((task) => task.text)
    : []
  const risks = Array.isArray(value.risks) ? value.risks.map(String).filter(Boolean) : []
  // 风险已知晓：以风险文本为稳定 key；风险行被删掉后，对应勾选自动失效（不留下孤儿记录）。
  const riskAcks = Array.isArray(value.riskAcks)
    ? [...new Set(value.riskAcks.map(String))].filter((text) => risks.includes(text))
    : []
  const item = {
    schemaVersion: SCHEMA_VERSION,
    id,
    title: String(value.title ?? id).trim() || id,
    status,
    goal: String(value.goal ?? '').trim(),
    // 虚拟库流程：成员库与归属（仅本机读取/API 响应用；saveItem 落盘时会剥掉，
    // 不把某台电脑的绝对路径写进仓库台账）
    ...(keepLocalWorkspace && Array.isArray(value.repos) && value.repos.length
      ? { repos: value.repos.map(String).filter(Boolean).slice(0, 8) }
      : {}),
    ...(keepLocalWorkspace && value.workspace && typeof value.workspace === 'object' && value.workspace.id
      ? { workspace: { id: String(value.workspace.id), name: String(value.workspace.name ?? '') } }
      : {}),
    // 原始需求描述与结构化答案：repro（重算计划）必须能拿到"当时的输入"
    description: String(value.description ?? '').trim(),
    // 用户随需求提供的截图/文件：只存本机路径与元信息（二进制在本机附件目录）
    attachments: normalizeAttachments(value.attachments),
    answers: value.answers && typeof value.answers === 'object' && !Array.isArray(value.answers)
      ? Object.fromEntries(Object.entries(value.answers).map(([key, answer]) => [String(key), answer]).slice(0, 40))
      : {},
    // 可复现性：谁（模型/版本）用什么输入算出了什么（哈希）
    provenance: value.provenance && typeof value.provenance === 'object'
      ? {
          pluginVersion: String(value.provenance.pluginVersion ?? ''),
          updatedAt: value.provenance.updatedAt ?? null,
          recon: value.provenance.recon ?? null,
          assist: value.provenance.assist ?? null,
          plan: value.provenance.plan ?? null,
        }
      : null,
    nonGoals: Array.isArray(value.nonGoals) ? value.nonGoals.map(String).filter(Boolean) : [],
    acceptance: Array.isArray(value.acceptance) ? value.acceptance.map(String).filter(Boolean) : [],
    tasks,
    workflow: normalizeWorkflow(value.workflow, status, { keepLocalWorkspace }),
    history: Array.isArray(value.history)
      ? value.history.map((entry) => ({
          at: entry?.at || now(),
          type: String(entry?.type ?? 'update'),
          message: String(entry?.message ?? ''),
        })).filter((entry) => entry.message).slice(-200)
      : [],
    scope: Array.isArray(value.scope) ? value.scope.map(String).filter(Boolean) : [],
    // 模板验收：每条带命令或人工断言，提交前逐条跑/勾
    checks: Array.isArray(value.checks)
      ? value.checks.map((check) => ({
          id: String(check?.id ?? '').trim(),
          text: String(check?.text ?? '').trim(),
          command: String(check?.command ?? '').trim() || null,
          assertion: String(check?.assertion ?? '').trim() || null,
          status: ['not_run', 'passed', 'failed'].includes(check?.status) ? check.status : 'not_run',
          at: check?.at ?? null,
          output: String(check?.output ?? '').slice(-4000) || '',
        })).filter((check) => check.id && check.text)
      : [],
    // 每个变更文件的「修改意义」：人工/对话补充的说明（优先于默认解释）
    fileNotes: value.fileNotes && typeof value.fileNotes === 'object' && !Array.isArray(value.fileNotes)
      ? Object.fromEntries(Object.entries(value.fileNotes)
        .map(([path, entry]) => [String(path), {
          note: String(entry?.note ?? '').trim().slice(0, 500),
          source: ['human', 'assist', 'agent'].includes(entry?.source) ? entry.source : 'human',
          // agent 生成说明的版本签名：文件增删行变化后要重新生成
          ...(entry?.sig ? { sig: String(entry.sig).slice(0, 300) } : {}),
          at: entry?.at ?? null,
        }])
        .filter(([, entry]) => entry.note)
        .slice(0, 200))
      : {},
    // 参考实现锚点：告诉 Agent"照哪个类写"
    references: Array.isArray(value.references)
      ? value.references.map((reference) => ({
          path: String(reference?.path ?? '').trim(),
          why: String(reference?.why ?? '').trim() || null,
        })).filter((reference) => reference.path).slice(0, 10)
      : [],
    scopeModules: Array.isArray(value.scopeModules) ? value.scopeModules.map(String).filter(Boolean) : [],
    // 二次确认后的代码探测结果：开发会话据此知道“要改哪些文件、命中在哪一行”。
    recon: value.recon && typeof value.recon === 'object'
      ? {
          at: value.recon.at || null,
          description: String(value.recon.description ?? ''),
          tokens: Array.isArray(value.recon.tokens) ? value.recon.tokens.map(String).filter(Boolean).slice(0, 60) : [],
          files: Array.isArray(value.recon.files)
            ? value.recon.files.map((file) => ({
                path: String(file?.path ?? ''),
                score: Number(file?.score) || 0,
                matches: Array.isArray(file?.matches)
                  ? file.matches.map((match) => ({
                      line: Number(match?.line) || 0,
                      text: String(match?.text ?? '').slice(0, 400),
                    })).filter((match) => match.line > 0)
                  : [],
              })).filter((file) => file.path).slice(0, 40)
            : [],
          confirmedAt: value.recon.confirmedAt || null,
        }
      : null,
    risks,
    riskAcks,
    changePoints: Array.isArray(value.changePoints)
      ? value.changePoints.map((point) => ({
          type: String(point?.type ?? 'change'),
          summary: String(point?.summary ?? '').trim(),
        })).filter((point) => point.summary)
      : [],
    // 关联的 DSH 开发会话：工作站据此追踪运行状态、跳回会话、把会话活动映射回流程
    session: value.session && typeof value.session === 'object' && String(value.session.id ?? '').trim()
      ? {
          id: String(value.session.id).trim(),
          boundAt: value.session.boundAt || now(),
          updatedAt: value.session.updatedAt || null,
        }
      : null,
    // 之前用过的开发会话：换绑时不丢，界面可「继续之前的沟通」
    sessionHistory: Array.isArray(value.sessionHistory)
      ? value.sessionHistory
          .map((entry) => ({
            id: String(entry?.id ?? '').trim(),
            boundAt: entry?.boundAt || null,
            unboundAt: entry?.unboundAt || null,
            turns: Number.isFinite(Number(entry?.turns)) ? Number(entry.turns) : null,
          }))
          .filter((entry) => entry.id)
          .slice(-20)
      : [],
    baseline: value.baseline && typeof value.baseline === 'object'
      ? {
          startedAt: value.baseline.startedAt ?? null,
          commit: value.baseline.commit ?? null,
          branch: value.baseline.branch ?? null,
          // 虚拟库：每个成员库各自的 baseline（仅本机读取；落盘时移到 profile.itemWorkspaces）
          ...(keepLocalWorkspace && Array.isArray(value.baseline.repos) && value.baseline.repos.length
            ? {
                repos: value.baseline.repos.map((entry) => ({
                  path: String(entry?.path ?? ''),
                  name: String(entry?.name ?? ''),
                  commit: entry?.commit ?? null,
                  branch: entry?.branch ?? null,
                  isRepo: entry?.isRepo !== false,
                  startedAt: entry?.startedAt || null,
                })).filter((entry) => entry.path).slice(0, 8),
              }
            : {}),
        }
      : null,
    source: value.source && typeof value.source === 'object'
      ? { path: String(value.source.path ?? ''), line: Number(value.source.line) || null }
      : null,
    createdAt: value.createdAt || now(),
    updatedAt: value.updatedAt || now(),
  }
  // 需求规范化：原始需求（description）原样保留，目标/根因用规范化结果；
  // 没被工作站整理过的（目标=原话）显式标记 needsReview，界面不能把它当成"已定义的目标"。
  const requirement = normalizeRequirementRecord(value.requirement, { description: item.description, title: item.title })
  const previous = value.requirement && typeof value.requirement === 'object' ? value.requirement : null
  if (previous) {
    // 人在流程页里改过目标/根因：以人工为准（不再要求规范化），并保存这次改动
    if (item.goal && String(previous.goal ?? '') !== item.goal) {
      requirement.goal = item.goal
      requirement.source = 'manual'
      requirement.needsReview = false
    }
    if (item.workflow.rootProblem && String(previous.rootProblem ?? '') !== item.workflow.rootProblem) {
      requirement.rootProblem = item.workflow.rootProblem
      requirement.source = 'manual'
      requirement.needsReview = false
    }
  }
  item.requirement = requirement
  // 阶段与状态不接受手工点选：每次落盘都按事实重新推导（blocked 除外）
  applyDerivedProgress(item)
  return item
}

/** List items, sorted by updatedAt descending. */
export async function listItems(repoPath) {
  const dir = itemDir(repoPath)
  if (!(await exists(dir))) return []
  const { readdir } = await import('node:fs/promises')
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json'))
  const items = []
  for (const file of files) {
    const raw = await readJson(join(dir, file))
    if (raw) items.push(sanitizeItem(raw, file.slice(0, -5)))
  }
  return items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

/** Read one item by id. */
export async function getItem(repoPath, id) {
  const raw = await readJson(join(itemDir(repoPath), safeId(id) + '.json'))
  return raw ? sanitizeItem(raw, id) : null
}

/** Create or replace one item. */
export async function saveItem(repoPath, raw) {
  const item = sanitizeItem(raw)
  if (!item.title || !item.id) throw new Error('开发项需要 title')
  item.updatedAt = now()
  // 本机虚拟库台账本身就是本机独立数据：成员路径/每库 baseline/归属都保留，
  // 换机器本来就不共享它。单仓库台账则必须剥掉本机专属信息（跨人 clone 不携带）。
  const localLedger = isWorkspaceLocalRoot(repoPath)
  const persisted = localLedger ? item : sanitizeItem(item, undefined, { keepLocalWorkspace: false })
  if (!localLedger && persisted.workflow) {
    delete persisted.workflow.repos
    delete persisted.workflow.workspace
    delete persisted.workflow.workspaceId
    delete persisted.workflow.workspaceName
  }
  if (!localLedger && persisted.baseline) delete persisted.baseline.repos
  persisted.updatedAt = item.updatedAt
  await writeJsonAtomic(join(itemDir(repoPath), persisted.id + '.json'), persisted)
  return item
}

/**
 * Delete one item. 删除前先复制一份到 `.dev-hub/.trash/`（按时间戳），
 * 误删时还能捞回来；返回 true/false 表示原本是否存在。
 */
export async function deleteItem(repoPath, id) {
  const { unlink, mkdir, copyFile } = await import('node:fs/promises')
  const source = join(itemDir(repoPath), safeId(id) + '.json')
  if (!(await exists(source))) return false
  try {
    const trash = join(dataDir(repoPath), '.trash')
    await mkdir(trash, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await copyFile(source, join(trash, `${safeId(id)}-${stamp}.json`))
  } catch {
    // 备份失败也要继续删除（否则用户以为删了其实没删）；但日志可查
  }
  try {
    await unlink(source)
    return true
  } catch {
    return false
  }
}

/** Build an empty item with a stable id. */
export function newItem(title, extra = {}) {
  return sanitizeItem({ ...extra, title, id: extra.id || safeId(title) })
}

/** Short projection used by list screens. */
export function summarizeItem(item) {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    goal: item.goal,
    taskCount: item.tasks.length,
    doneCount: item.tasks.filter((task) => task.done).length,
    stage: item.workflow?.stage,
    intent: normalizeIntent(item.workflow?.intent) ?? 'feature',
    rootProblemReady: Boolean(item.workflow?.rootProblem),
    // 需求规范化状态：列表页据此把"目标还是客户原话"的流程标出来
    requirementNeedsReview: Boolean(item.requirement?.needsReview),
    requirementSource: item.requirement?.source ?? null,
    // 标题还是用户输入/代码片段：列表标出来，详情页可一键自动生成
    titleNeedsWork: isWeakTitle(item.title, item.description),
    attachmentCount: (item.attachments ?? []).length,
    answeredQuestions: (item.workflow?.questions ?? []).filter((question) => question.answer).length,
    testState: item.workflow?.tests?.local?.status ?? 'not_run',
    // 列表要能说清"任务做完了但流程还没完"：环境测试是任务完成后的下一道关
    environmentTestState: item.workflow?.tests?.environment?.status ?? 'not_run',
    // 独立评审：列表要能显示"停在评审"以及通过票数，而不是笼统的"验证中"
    reviewState: item.workflow?.review?.status ?? 'idle',
    reviewPassed: (item.workflow?.review?.reviewers ?? []).filter((reviewer) => reviewer.status === 'passed').length,
    reviewTotal: (item.workflow?.review?.reviewers ?? []).length,
    // 非 git 仓库没有「提交」阶段，列表的阶段进度要按实际阶段数画
    gitRepo: item.workflow?.gitRepo !== false,
    scope: item.scope ?? [],
    scopeModules: item.scopeModules ?? [],
    session: item.session ?? null,
    planHash: item.provenance?.plan?.hash ?? null,
    inputHash: item.provenance?.plan?.inputHash ?? null,
    sessionHistory: item.sessionHistory ?? [],
    workspace: item.workspace ?? null,
    repos: item.repos ?? [],
    worktree: item.workflow?.worktree ?? null,
    repoCount: (item.repos ?? []).length,
    updatedAt: item.updatedAt,
    baseline: item.baseline,
  }
}

export { writeJsonAtomic, readJson, now }


/* ------------------------------------------------------------ 虚拟库（多代码库组合） */

/**
 * 虚拟库：把多个代码库当成一个"开发目标"一起看（前后端联动）。
 * 存在本机 profile.workspaces 里：`{ id, name, repos: [repoPath], createdAt }`。
 * 该代码库组合本身不写磁盘代码，只影响扫描范围、变更聚合与流程归属。
 */
export function listWorkspaces(profile) {
  return Array.isArray(profile?.workspaces) ? profile.workspaces : []
}

export function findWorkspace(profile, id) {
  const key = String(id ?? '').trim()
  if (!key) return null
  return listWorkspaces(profile).find((entry) => entry.id === key || entry.name === key) ?? null
}

/** 校验并归一虚拟库成员：必须存在、是目录、归一 git 根，至少两个不同库。 */
export async function resolveWorkspaceRepos(repos) {
  const list = (Array.isArray(repos) ? repos : []).map((entry) => String(entry ?? '').trim()).filter(Boolean)
  if (list.length < 2) throw new Error('虚拟库至少包含两个代码库')
  const { canonical } = await import('./paths.mjs')
  const canonicalRepos = []
  for (const repo of list) {
    const input = await canonical(repo).catch(() => repo)
    const info = await stat(input).catch(() => null)
    if (!info) throw new Error(`成员库路径不存在：${repo}`)
    if (!info.isDirectory()) throw new Error(`成员库路径不是目录：${repo}`)
    // 和单库 setup 保持一致：填到 git 子目录时归一到仓库根，避免"初始化了根目录、
    // 虚拟库却记着子目录"导致状态里缺 .dev-hub；同一仓库的多个子目录会被去重。
    const root = await findRepoRoot(input) ?? input
    const path = await canonical(root)
    if (!canonicalRepos.includes(path)) canonicalRepos.push(path)
  }
  if (canonicalRepos.length < 2) throw new Error('虚拟库至少包含两个不同的代码库')
  return canonicalRepos
}

export async function createWorkspace(profile, { name, repos } = {}) {
  const title = String(name ?? '').trim()
  if (!title) throw new Error('虚拟库需要名字')
  const canonicalRepos = await resolveWorkspaceRepos(repos)
  profile.workspaces ??= []
  if (profile.workspaces.some((entry) => entry.name === title)) throw new Error(`虚拟库已存在：${title}`)
  const workspace = {
    id: `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: title,
    repos: canonicalRepos,
    createdAt: now(),
    updatedAt: now(),
  }
  profile.workspaces.push(workspace)
  return workspace
}

/**
 * 更新虚拟库名字/成员（成员库平权：任意成员都可移除/替换）。
 * 成员路径必须已归一；空 repos 不修改。
 */
export function updateWorkspace(profile, id, { name, repos } = {}) {
  const workspace = findWorkspace(profile, id)
  if (!workspace) throw new Error(`虚拟库不存在：${id}`)
  const title = String(name ?? '').trim()
  if (title) {
    if (listWorkspaces(profile).some((entry) => entry.id !== workspace.id && entry.name === title)) {
      throw new Error(`虚拟库已存在：${title}`)
    }
    workspace.name = title
  }
  if (Array.isArray(repos) && repos.length) workspace.repos = repos.map(String)
  workspace.updatedAt = now()
  return workspace
}

/** 重命名虚拟库（只改本机登记名，不动成员库/台账）。 */
export function renameWorkspace(profile, id, name) {
  const key = String(id ?? '').trim()
  const title = String(name ?? '').trim()
  if (!title) throw new Error('虚拟库需要名字')
  const workspace = findWorkspace(profile, key)
  if (!workspace) throw new Error(`虚拟库不存在：${key}`)
  if (listWorkspaces(profile).some((entry) => entry.id !== workspace.id && entry.name === title)) {
    throw new Error(`虚拟库已存在：${title}`)
  }
  workspace.name = title
  workspace.updatedAt = now()
  return workspace
}

export function removeWorkspace(profile, id) {
  const key = String(id ?? '').trim()
  const before = listWorkspaces(profile).length
  const removed = listWorkspaces(profile).filter((entry) => entry.id === key || entry.name === key)
  profile.workspaces = listWorkspaces(profile).filter((entry) => entry.id !== key && entry.name !== key)
  // 删虚拟库 = 本机不再把相关流程当多库；绑定也一起清掉（流程台账本身不动）
  if (removed.length && profile.itemWorkspaces) {
    for (const [bindingKey, entry] of Object.entries(profile.itemWorkspaces)) {
      if (removed.some((workspace) => entry?.workspaceId === workspace.id || entry?.workspaceName === workspace.name)) {
        delete profile.itemWorkspaces[bindingKey]
      }
    }
  }
  return profile.workspaces.length !== before
}

/* ------------------------------------------------------------ 流程 → 虚拟库的本机绑定 */

/**
 * 流程和虚拟库的绑定只存在本机 profile，不写仓库台账：
 * profile.itemWorkspaces[`<repo>#<itemId>`] = {
 *   itemId, repo, workspaceId, workspaceName, boundAt,
 *   baseline: [{ name, path, commit, branch, isRepo, startedAt }]
 * }
 * 这样换人/换电脑后，同一个流程文件不会带着某台机器的绝对路径。
 */
export function itemWorkspaceKey(repoPath, itemId) {
  return `${resolve(String(repoPath))}#${safeId(String(itemId ?? ''))}`
}

export function getItemWorkspace(profile, repoPath, itemId) {
  const key = itemWorkspaceKey(repoPath, itemId)
  const entry = profile?.itemWorkspaces?.[key]
  return entry && typeof entry === 'object' ? entry : null
}

export function setItemWorkspace(profile, repoPath, itemId, entry = {}) {
  profile.itemWorkspaces ??= {}
  const key = itemWorkspaceKey(repoPath, itemId)
  profile.itemWorkspaces[key] = {
    ...(profile.itemWorkspaces[key] ?? {}),
    ...entry,
    itemId: safeId(String(itemId ?? '')),
    repo: resolve(String(repoPath)),
    boundAt: entry.boundAt || now(),
    updatedAt: now(),
  }
  profile.schemaVersion = SCHEMA_VERSION
  return profile.itemWorkspaces[key]
}

export function clearItemWorkspace(profile, repoPath, itemId) {
  const key = itemWorkspaceKey(repoPath, itemId)
  if (!profile?.itemWorkspaces?.[key]) return false
  delete profile.itemWorkspaces[key]
  return true
}
