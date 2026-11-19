/**
 * dsh-dev-hub Host half.
 *
 * Owns the repo-local `.dev-hub` ledger, the local `~/.dsh/dev-hub/profile.json`
 * profile, environment detection, git evidence and the Context Pack builder.
 * The browser half only talks to the loopback /api/dev-hub/* routes.
 */
import { exec, execFile } from 'node:child_process'
import { access, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { API, STATUS_ORDER } from './shared/api.mjs'
import { WIZARD_STEPS } from './shared/wizard.mjs'
import { DEV_HANDOFF_STEP } from './shared/boundaries.mjs'
import { deriveAttention } from './core/attention.mjs'
import { buildContext } from './core/context.mjs'
import { detectEnvironment } from './core/detect.mjs'
import { changesSince, git, gitInfo, hasCommit, isGitRepo, startBaseline, syncRepo } from './core/git.mjs'
import { canonical, exists, findRepoRoot, isUnder, repoRelative, safeId } from './core/paths.mjs'
import { scanCandidates } from './core/scan.mjs'
import { appendHistory, missingForChatStart, missingForStart } from './core/workflow.mjs'
import {
  DEFAULT_DOCS_CONFIG,
  SUPPLEMENT_MAX,
  applySupplementToFile,
  buildTechDocMarkdown,
  expandDocPath,
  hashText,
  mergeLocalDoc,
  normalizeDocsConfig,
  renderLocalDoc,
} from './core/techdoc.mjs'
import { run, which } from './core/detect.mjs'
import {
  buildDefaultConventions,
  conventionsPath,
  detectRepoProfile,
  loadConventions,
  mergeRepoProfiles,
  saveConventions,
  summarizeConventions,
} from './core/conventions.mjs'
import { normalizeScope, suggestModules } from './core/modules.mjs'
import { extractTokens, reconRepo } from './core/recon.mjs'
import { ensureRepoIndex, queryRepoIndex } from './core/repo-index.mjs'
import { candidateHintPrompt, scanWithDshAgent, scanWithLlm } from './host/agent-scan.mjs'
import { runAgentJson, runLlmJson } from './host/agent-run.mjs'
import { answerPendingQuestion, readPendingApprovals, readPendingQuestions } from './host/pending-questions.mjs'
import { ASSIST_SCHEMA, applyAssistUpdates, buildAssistPrompt } from './core/assist.mjs'
import { sessionState, sessionStates } from './host/session-state.mjs'
import { sessionLog, sessionTimeline, sessionTranscript } from './host/session-log.mjs'
import { buildSessionCatalog } from './host/session-catalog.mjs'
import { loadLocaleBundle } from './host/locales.mjs'
import { addCustomConstraint, installSkill, regenerateConventions, removeConstraint, uninstallSkill, updateConstraint } from './core/conventions.mjs'
import { PROMPT_VERSION, hashOf, inputHash, normalizeAnswers, planHash, pluginVersion, recordProvenance, specHash } from './core/provenance.mjs'
import { reproPlan } from './core/repro.mjs'
import { detectIntent, normalizeIntent } from './core/intent.mjs'
import { normalizeAutomation } from './shared/automation.mjs'
import { DISPATCH_SCHEMA, buildDispatchPrompt, fallbackDispatch, normalizeDispatch } from './core/dispatch.mjs'
import { CLARIFY_SCHEMA, MAX_ROUNDS, buildClarifyPrompt, normalizeClarify } from './core/clarify.mjs'
import {
  ATTACHMENT_MAX_BYTES,
  attachmentPrompt,
  isSupportedImageType,
  normalizeAttachments,
} from './shared/attachment.mjs'
import {
  REQUIREMENT_SCHEMA,
  buildRequirementPrompt,
  deriveRequirement,
  isRawEcho,
  isWeakTitle,
  normalizeRequirementRecord,
  suggestFlowTitle,
} from './shared/requirement.mjs'
import { fileDiff, flowFileChanges } from './core/diff.mjs'
import { ensureFlowWorktree, removeFlowWorktree, worktreeExists, worktreeOf, worktreePathFor, worktreeRoot } from './core/worktree.mjs'
import { FILE_NOTE_SCHEMA, applyAgentNotes, buildFileNotePrompt, filesNeedingNotes } from './core/file-note-agent.mjs'
import { fileNoteOf } from './core/file-notes.mjs'
import { catalogFor, findSkill } from './core/skills.mjs'
import { moduleOfPath } from './core/modules.mjs'
import { deriveQuestions } from './core/questions.mjs'
import { estimateWork } from './core/estimate.mjs'
import { buildPlan } from './core/plan.mjs'
import { buildReport } from './core/report.mjs'
import {
  REVIEW_SCHEMA,
  applyReviewerOutput,
  describeReview,
  invalidateReview,
  normalizeReviewerVerdict,
  reviewGate,
  reviewerPrompt,
  staleReviewerFailures,
  startReviewRound,
} from './core/review.mjs'
import { sessionActiveAfter, verificationBasisHash } from './core/verification.mjs'
import { renderReportHtml, renderReportMarkdown } from './core/report-render.mjs'
import { LOCAL_COMMAND_SCHEMA, buildLocalCommandPrompt, normalizeLocalCommand } from './core/local-commands.mjs'

import { conflictsForScope, parallelOverview } from './core/parallel.mjs'
import { appendRepoMemory, forgetRepoMemory, loadRepoMemory, saveRepoMemory, searchRepoMemory, selectMemoryForContext } from './core/memory.mjs'
import { draftFromDescription, wizardSteps } from './core/wizard.mjs'
import {
  clearItemWorkspace,
  dataDir,
  deleteItem,
  getItem,
  getItemWorkspace,
  isWorkspaceLocalRoot,
  listItems,
  loadProfile,
  loadProject,
  PROFILE_DIR,
  newItem,
  profileForRepo,
  saveItem,
  saveProfile,
  saveProject,
  createWorkspace,
  findWorkspace,
  listWorkspaces,
  removeWorkspace,
  renameWorkspace,
  resolveWorkspaceRepos,
  setItemWorkspace,
  updateWorkspace,
  setProfileForRepo,
  summarizeItem,
  workspaceLocalDir,
  workspacesRoot,
} from './core/store.mjs'
import {
  ensureWorkspaceLocalDir,
  removeWorkspaceItemArtifacts,
  syncWorkspaceManifest,
  writeWorkspaceContext,
  writeWorkspaceEvidence,
} from './core/local-workspace.mjs'
import {
  baselineForMember,
  collectWorkspaceEvidence,
  memberByRef,
  scopeMatchesFile,
  splitRepoScopedPath,
  workspaceBaseline,
  workspaceChanges,
  workspaceMembers,
} from './core/workspace.mjs'

export const name = 'dev-hub'
export const inject = ['webServer', 'sessions', 'subagents']

const MAX_BODY = 1024 * 1024
const execAsync = promisify(exec)

function isLoopback(req) {
  const remote = req.socket.remoteAddress
  if (!remote) return false
  const address = remote.startsWith('::ffff:') ? remote.slice(7) : remote
  return address === '127.0.0.1' || address === '::1'
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

async function readBody(req, { limit = MAX_BODY } = {}) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk
    size += buffer.length
    if (size > limit) throw new Error(`请求体过大（上限 ${Math.round(limit / 1024 / 1024)}MB）`)
    chunks.push(buffer)
  }
  if (!chunks.length) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function query(url, name) {
  const value = new URL(url, 'http://127.0.0.1').searchParams.get(name)
  return value ?? undefined
}

function repoName(repo) {
  return repo.split(/[/\\]/).filter(Boolean).pop() || 'repository'
}

function defaultCommands(repo) {
  const commands = {}
  const has = async (name) => exists(join(repo, name))
  return (async () => {
    if (await has('pom.xml')) {
      commands.compile = 'mvn -o clean compile'
      commands.test = 'mvn -o clean test'
      commands.localTest = 'mvn -o clean test'
    }
    if (await has('scripts/check.sh')) commands.gate = 'sh scripts/check.sh --full'
    if (await has('package.json')) {
      commands.install = 'npm install'
      commands.build = 'npm run build'
      commands.localTest = 'npm test'
    }
    return commands
  })()
}

/**
 * 初始化/切换代码库。
 * @param {object} input
 * @param {string} input.repoPath
 * @param {string} input.name
 * @param {string} [input.sessionCwd]
 * @param {boolean} [input.detect] 是否重新探测本机环境（默认 true；卡片切换走缓存，避免每次几秒）
 */
async function initializeRepo({ repoPath, name, sessionCwd, detect = true }) {
  const input = String(repoPath || sessionCwd || process.cwd()).trim()
  if (!input) throw new Error('需要代码库路径')
  if (!String(name ?? '').trim()) throw new Error('需要填写你的名字/成员标识')
  let repo = await findRepoRoot(input)
  repo = await canonical(repo ?? input)
  if (isWorkspaceLocalRoot(repo)) {
    const profile = await loadProfile()
    const workspace = listWorkspaces(profile).find((entry) => {
      try { return resolve(workspaceLocalDir(entry)) === resolve(repo) } catch { return false }
    })
    if (workspace) throw new Error(`「${workspace.name}」是虚拟库，本机目录不能当代码库初始化；请从开发站切到该虚拟库`)
    throw new Error('这是本机虚拟库目录，不能作为代码库初始化')
  }
  if (!(await exists(repo))) throw new Error(`代码库路径不存在：${repo}`)
  const info = await stat(repo)
  if (!info.isDirectory()) throw new Error(`代码库路径不是目录：${repo}`)

  const loaded = await loadProject(repo, true)
  const project = loaded.project
  if (!project.context) project.context = {}
  if (!project.context.commands || Object.keys(project.context.commands).length === 0) {
    project.context.commands = await defaultCommands(repo)
    await saveProject(repo, project)
  }
  if (!project.name) {
    project.name = repoName(repo)
    await saveProject(repo, project)
  }
  // 环境探测要跑一堆命令（JDK/Maven/Docker…），切换代码库时复用缓存，只有显式要求或首次才重新探测
  let profile = await loadProfile()
  const existing = profileForRepo(profile, repo)
  const env = (!detect && existing?.environment)
    ? existing.environment
    : await detectEnvironment(repo)
  await setProfileForRepo(profile, repo, { member: String(name || existing?.member || '未命名开发者').trim(), environment: env })
  await saveProfile(profile)
  profile = await loadProfile()

  // 没用工作站开发过的代码库（没有 conventions.json）：直接装好内置技能，
  // 这样"新增代码库"之后规范就是标准态，不必等第一次建流程才初始化。
  let skills = null
  const existingConventions = await loadConventions(repo)
  if (!existingConventions) {
    try {
      const repoProfile = await detectRepoProfile(repo)
      const initialized = await saveConventions(repo, buildDefaultConventions({
        repo,
        name: project.name || repoName(repo),
        profile: repoProfile,
        context: project.context,
      }))
      skills = {
        initialized: true,
        installedSkills: (initialized.installedSkills ?? []).map((entry) => entry.id),
        constraints: (initialized.constraints ?? []).length,
      }
    } catch (error) {
      // 初始化失败不阻断"新增代码库"：把原因带回界面，首次建流程时还能再试
      skills = { initialized: false, error: String(error?.message ?? error) }
    }
  } else {
    skills = {
      initialized: false,
      alreadyHad: true,
      installedSkills: (existingConventions.installedSkills ?? []).map((entry) => entry.id),
      constraints: (existingConventions.constraints ?? []).length,
    }
  }

  return { repo, project, env, profile, skills }
}

/**
 * 流程的"需要你处理"信号：只从事实推导（会话待答、阶段、测试状态、是否绑定会话）。
 * 返回 null 表示不需要你动手（会话在跑或已完成）。
 *
 * 薄壳：只负责读会话侧的 pending 数量与 live 状态，判定规则全在 core/attention.mjs。
 */
function attentionOf(ctx, item, running) {
  const sessionId = item.session?.id
  const pending = sessionId ? readPendingQuestions(ctx, sessionId) : null
  const approvals = sessionId ? readPendingApprovals(ctx, sessionId) : null
  return deriveAttention(item, {
    running: running === true,
    pendingQuestions: (pending?.pending ?? []).length,
    pendingApprovals: (approvals?.approvals ?? []).length,
  })
}

/**
 * 列表投影 + 会话事实：state 与 GET /items 共用同一份结果。
 * 只调一次 sessionStates（扫会话事件不便宜），再按 itemId 建 Map；
 * attention 每项只算一次，attentionCount 直接复用同一份结果。
 */
function itemViews(ctx, items) {
  const live = sessionStates(ctx, items)
  const byItem = new Map(live.sessions.map((row) => [row.itemId, row]))
  const rows = items.map((item) => {
    const running = byItem.get(item.id)?.running === true
    return { ...summarizeItem(item), running, attention: attentionOf(ctx, item, running) }
  })
  return {
    items: rows,
    attentionCount: rows.filter((row) => Boolean(row.attention)).length,
    sessionStates: live.sessions,
  }
}

/**
 * 建流程前的需求规范化：客户原话 ≠ 开发目标。
 * 1) 澄清 agent 已经总结过（spec.problem/goals）→ 直接用，不再重复调模型；
 * 2) 只有原话 → 让 agent 整理成目标/根因/背景/验收；
 * 3) agent 不可用 → 本地草稿，明确标记 needsReview，界面把它当"待规范化"而不是已定义的目标。
 */
async function normalizeRequirementForCreate(ctx, repo, { description, spec, answers, title, attachments = [] }) {
  const derived = deriveRequirement({ description, spec, answers, title })
  if (!derived.needsReview) return { requirement: derived, engine: 'clarify', elapsedMs: 0 }
  try {
    const result = await runAgentJson(ctx, {
      cwd: repo,
      prompt: [buildRequirementPrompt({ description, spec, answers, title }), attachmentPrompt(attachments)]
        .filter(Boolean)
        .join('\n'),
      schema: REQUIREMENT_SCHEMA,
      label: 'devhub-requirement',
      timeoutMs: 90000,
    })
    const requirement = normalizeRequirementRecord(
      { ...result.value, raw: description, source: 'agent' },
      { description, title },
    )
    return { requirement, engine: 'dsh', elapsedMs: result.elapsedMs }
  } catch (error) {
    return {
      // 降级不假装成功：记录原因，界面要提示"这还是草稿"
      requirement: { ...derived, degraded: true, reason: String(error?.message ?? error) },
      engine: 'local',
      elapsedMs: 0,
    }
  }
}

/**
 * 把规范化结果写回已有流程：目标/根因只认规范化后的表述，原话留在 description。
 * 标题一并整理：原标题还是原始输入/代码片段时，用生成结果替换（regenerateTitle 可强制）。
 */
function applyRequirementToItem(item, requirement, { regenerateTitle = false } = {}) {
  item.requirement = { ...requirement, normalizedAt: new Date().toISOString() }
  item.goal = requirement.goal
  item.workflow ??= {}
  item.workflow.rootProblem = requirement.rootProblem
  if (regenerateTitle || isWeakTitle(item.title, item.description)) {
    const generated = String(requirement.title ?? '').trim()
      || suggestFlowTitle({
        description: item.description,
        goal: requirement.goal,
        intent: item.workflow?.intent,
        fallback: item.title,
      })
    if (generated && !isWeakTitle(generated, item.description)) item.title = generated.slice(0, 40)
  }
  if (requirement.nonGoals.length) {
    item.nonGoals = [...new Set([...(item.nonGoals ?? []), ...requirement.nonGoals])].slice(0, 12)
  }
  if (requirement.acceptance.length) {
    item.acceptance = [...new Set([...requirement.acceptance, ...(item.acceptance ?? [])])].slice(0, 12)
  }
  const plan = item.workflow.plan ?? {}
  if (!plan.summary || isRawEcho(plan.summary, item.description)) {
    item.workflow.plan = { ...plan, summary: requirement.goal }
  }
  return item
}

/**
 * 只重新生成标题：不改目标/根因/验收。先让 agent 按已有目标概括，失败再用确定性兜底。
 * 用于详情页「自动生成标题」和旧流程整理（用户输入是代码/注解时尤其需要）。
 */
async function regenerateItemTitle(ctx, repo, item) {
  const requirement = item.requirement && typeof item.requirement === 'object' ? item.requirement : {}
  const spec = {
    problem: requirement.rootProblem || item.workflow?.rootProblem || '',
    goals: requirement.goal ? [requirement.goal] : (item.goal ? [item.goal] : []),
    background: requirement.background || '',
    expected: requirement.expected || '',
    nonGoals: requirement.nonGoals ?? item.nonGoals ?? [],
    acceptance: requirement.acceptance ?? item.acceptance ?? [],
    scope: item.scope ?? [],
  }
  try {
    const result = await runAgentJson(ctx, {
      cwd: repo,
      prompt: [
        buildRequirementPrompt({
          description: item.description || item.goal,
          spec,
          title: item.title,
        }),
        attachmentPrompt(item.attachments),
      ].filter(Boolean).join('\n'),
      schema: REQUIREMENT_SCHEMA,
      label: 'devhub-title',
      timeoutMs: 60000,
    })
    const record = normalizeRequirementRecord(
      { ...result.value, raw: item.description || item.goal, source: 'agent' },
      { description: item.description },
    )
    if (record.title) return { title: record.title, engine: 'dsh', elapsedMs: result.elapsedMs }
  } catch {
    // 降级到确定性标题：不伪造成功，engine 会告诉界面是本地生成
  }
  return {
    title: suggestFlowTitle({
      description: item.description || item.goal,
      spec,
      goal: item.goal,
      intent: item.workflow?.intent,
      fallback: item.title,
    }),
    engine: 'local',
    elapsedMs: 0,
  }
}

/**
 * 当前子代理模型是否支持图片输入（界面据此提前提示；不支持的模型不接收图片）。
 * 优先问 llm 服务；拿不到能力信息按"不支持"处理，并给出可读原因。
 */
async function attachmentCapabilities(ctx) {
  const selection = ctx.get('agentDefaultModel')?.currentSelection?.() ?? null
  const model = selection?.provider && selection?.model
    ? { provider: String(selection.provider), model: String(selection.model) }
    : null
  if (!model) {
    return { model: null, images: { supported: false, reason: '没有读到当前模型，无法判断图片能力' }, files: { supported: true } }
  }
  const llm = ctx.get('llm')
  if (!llm?.resolveModelInfo) {
    return { model, images: { supported: false, reason: '当前 DSH 版本没有暴露模型能力查询，图片按不支持处理' }, files: { supported: true } }
  }
  try {
    const info = await llm.resolveModelInfo(model.provider, model.model)
    const modalities = Array.isArray(info?.inputModalities) ? info.inputModalities.map(String) : null
    if (!modalities) {
      return { model, images: { supported: false, reason: '当前模型没有声明图片输入能力' }, files: { supported: true } }
    }
    const supported = modalities.includes('image')
    return {
      model,
      images: {
        supported,
        reason: supported ? null : `当前模型未声明图片输入能力（${modalities.join('、') || '未知'}）`,
        modalities,
      },
      files: { supported: true },
    }
  } catch (error) {
    return {
      model,
      images: { supported: false, reason: `查询模型能力失败：${String(error?.message ?? error)}` },
      files: { supported: true },
    }
  }
}

function attachmentDir() {
  return join(PROFILE_DIR, 'attachments')
}

function safeAttachmentName(name, mediaType) {
  const raw = String(name ?? '').trim() || 'attachment'
  const base = raw.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'attachment'
  if (/\.[a-z0-9]{1,8}$/i.test(base)) return base
  const ext = String(mediaType ?? '').split('/')[1]?.replace(/[^a-z0-9]/gi, '') ?? ''
  return ext ? `${base}.${ext}` : base
}

/** 向导的建议名：用需求规范化里的标题逻辑，避免把代码/注解第一行当流程名。 */
function wizardSuggestion(description) {
  const draft = draftFromDescription(description)
  const name = suggestFlowTitle({ description, fallback: draft.name })
  return { ...draft, name: name || draft.name }
}

/**
 * 请求里显式带的代码库：只允许本机已登记/当前激活的库，避免扫描任意路径。
 * 虚拟库激活时允许传本机台账目录（聊天页会把 state.repo.path 带回来）。
 */
async function requestedRepo(profile, requested) {
  const value = String(requested ?? '').trim()
  if (!value) return null
  if (isWorkspaceLocalRoot(value)) {
    const active = activeWorkspace(profile)
    if (active && workspaceLocalDir(active.workspace) === resolve(value)) return resolve(value)
    throw new Error(`本机虚拟库目录未激活：${value}；请先切到这个虚拟库`)
  }
  const repo = await canonical(value)
  const known = new Set(Object.keys(profile.repos ?? {}).map((path) => path))
  if (known.has(repo)) return repo
  if (String(profile.activeRepo ?? '') === repo) return repo
  throw new Error(`代码库未登记：${value}；请先在开发站选择/新增这个代码库`)
}

/**
 * 当前激活目标的**台账根**。
 * - 单代码库：仓库绝对路径（台账在 `<repo>/.dev-hub`）
 * - 虚拟库：本机独立目录 `~/.dev-hub/workspaces/<id>/`（不落任何成员库）
 */
async function activeRepo(profile) {
  const active = profile.activeRepo
  if (!active) return null
  if (String(active).startsWith('workspace:')) {
    const workspace = findWorkspace(profile, String(active).slice('workspace:'.length))
    if (!workspace?.repos?.length) return null
    // 本机目录按需创建：虚拟库的台账/规范/上下文/证据全在这里
    await ensureWorkspaceLocalDir(workspace)
    return workspaceLocalDir(workspace)
  }
  if (await exists(active)) return active
  return null
}

/**
 * 当前激活的是否虚拟库；返回 {workspace, repos, localRoot}。
 * 没有 primary：成员库平权，`localRoot` 才是虚拟库自己的落盘位置。
 */
function activeWorkspace(profile) {
  const active = String(profile.activeRepo ?? '')
  let workspace = active.startsWith('workspace:') ? findWorkspace(profile, active.slice('workspace:'.length)) : null
  // 兼容旧/损坏 profile：activeRepo 直接指向虚拟库本机目录时，也按虚拟库激活处理
  if (!workspace && active) {
    workspace = listWorkspaces(profile).find((entry) => {
      try { return resolve(workspaceLocalDir(entry)) === resolve(active) } catch { return false }
    }) ?? null
  }
  if (!workspace?.repos?.length) return null
  const localRoot = workspaceLocalDir(workspace)
  const member = workspaceMember(profile, workspace)
  return { workspace: { ...workspace, member }, repos: workspace.repos, localRoot, localPath: localRoot }
}

/** 虚拟库的成员标识：新数据在 workspace.member；旧数据/误迁移时从成员库本机登记里补。 */
function workspaceMember(profile, workspace) {
  if (!workspace) return null
  if (workspace.member) return workspace.member
  for (const path of workspace.repos ?? []) {
    const member = profileForRepo(profile, path)?.member
    if (member) return member
  }
  return null
}

/**
 * 台账根对应的本机身份（成员标识/环境缓存/本机命令）。
 * 虚拟库的身份记在 workspace 自身，不塞进 profile.repos（否则会被当成一张代码库卡）。
 */
function ledgerEntry(profile, root) {
  if (!root) return null
  if (isWorkspaceLocalRoot(root)) {
    const workspace = listWorkspaces(profile).find((entry) => workspaceLocalDir(entry) === root) ?? null
    if (!workspace) return null
    return {
      member: workspaceMember(profile, workspace),
      environment: workspace.environment ?? null,
      localCommands: workspace.localCommands ?? {},
      workspace,
    }
  }
  return profileForRepo(profile, root)
}

/** 台账里登记的成员标识：虚拟库用 workspace.member，单库用 profile.repos。 */
function memberOfLedger(profile, root) {
  return ledgerEntry(profile, root)?.member ?? null
}

/**
 * 台账相对路径的基准：单库仍以仓库根为基准（`.dev-hub/...`），
 * 虚拟库以本机目录为基准（`items/...`、`conventions.json`、`reports/...`）。
 */
function ledgerRelativeBase(root) {
  return isWorkspaceLocalRoot(root) ? dataDir(root) : root
}

/**
 * 虚拟库的模块建议：逐成员库给目录/模块建议，路径统一 `<label>:<rel>`。
 * 成员库平权：不挑第一个成员库当代表，也不把同名模块合并。
 */
async function workspaceModuleSuggestions(active) {
  const modules = []
  for (const member of workspaceMembers(active.repos)) {
    const list = await suggestModules(member.path)
    for (const module of list) {
      modules.push({
        ...module,
        name: `${member.name}/${module.name}`,
        path: `${member.name}:${module.path}`,
        repo: member.path,
        repoName: member.name,
      })
    }
  }
  return modules.slice(0, 60)
}

/** 台账根的展示名：虚拟库用名字，单库用目录名。 */
function ledgerName(profile, root) {
  const entry = ledgerEntry(profile, root)
  if (entry?.workspace) return entry.workspace.name
  return repoName(root)
}

/**
 * 台账根的仓库画像：
 * - 单库：直接探测该仓库
 * - 虚拟库：逐个成员库探测后取并集（成员库平权，不拿第一个当代表）
 */
async function ledgerRepoProfile(profile, root) {
  const active = activeWorkspace(profile)
  if (isWorkspaceLocalRoot(root) && active) {
    const profiles = await Promise.all(
      active.repos.map((path) => detectRepoProfile(path).catch(() => null)),
    )
    return mergeRepoProfiles(profiles)
  }
  return detectRepoProfile(root)
}

/** 流程在本机的虚拟库绑定 + 当前 workspace 实体（删库后 workspace 为 null）。 */
function localWorkspaceFor(profile, repoPath, itemId) {
  const binding = repoPath ? getItemWorkspace(profile, repoPath, itemId) : null
  const workspace = binding?.workspaceId ? findWorkspace(profile, binding.workspaceId) : null
  return { binding, workspace }
}

/** 把本机绑定投影到 API 响应 / 界面上（绝不再落盘到仓库台账）。 */
function hydrateItemLocal(profile, repoPath, item) {
  if (!item?.id) return item
  // 本机虚拟库台账：归属/成员/每库 baseline 本来就在台账里，不需要再从 profile 补
  if (isWorkspaceLocalRoot(repoPath)) return item
  const { binding, workspace } = localWorkspaceFor(profile, repoPath, item.id)
  if (workspace?.repos?.length) {
    return {
      ...item,
      workspace: { id: workspace.id, name: workspace.name },
      repos: [...workspace.repos],
      // 接口响应带每库 baseline 方便界面/诊断；落盘台账里没有（本机 profile 保存）
      ...(binding?.baseline?.length && item.baseline
        ? { baseline: { ...item.baseline, repos: binding.baseline } }
        : {}),
    }
  }
  // 兼容旧数据：绑定还没迁移时，台账里可能暂时还有 workspace/repos
  if (!binding && (item.workspace?.id || (Array.isArray(item.repos) && item.repos.length > 1))) return item
  // 独立工作区绝对路径只在本机响应里补，不落仓库台账
  if (item.workflow?.worktree?.branch) {
    return { ...item, worktreePath: worktreePathFor(repoPath, item.id) }
  }
  return item
}

function baselineForLocal(profile, repoPath, item) {
  const binding = repoPath ? getItemWorkspace(profile, repoPath, item?.id) : null
  const baseline = item?.baseline && typeof item.baseline === 'object' ? { ...item.baseline } : null
  if (binding?.baseline?.length) {
    return { ...(baseline ?? {}), repos: binding.baseline }
  }
  return baseline
}

async function uniqueWorkspaceName(profile, preferred) {
  const base = String(preferred ?? '').trim() || '本机虚拟库'
  if (!listWorkspaces(profile).some((entry) => entry.name === base)) return base
  let index = 2
  while (listWorkspaces(profile).some((entry) => entry.name === `${base}（本机 ${index}）`)) index += 1
  return `${base}（本机 ${index}）`
}

/**
 * 旧台账迁移：以前把虚拟库成员绝对路径写进了 `.dev-hub/items/<id>.json`。
 * 读到这类流程时，在本机 profile 建立 binding（能恢复的顺手恢复成本机虚拟库），
 * 然后把台账里的本机字段剥掉。迁移只发生一次，换人 clone 后不会再出现。
 */
async function ensureItemWorkspaceBinding(profile, repoPath, item) {
  if (!item?.id) return { item, changed: false }
  // 本机虚拟库台账：不存在“把仓库台账里的本机字段迁到 profile”的问题，直接跳过
  if (isWorkspaceLocalRoot(repoPath)) return { item, changed: false }
  if (getItemWorkspace(profile, repoPath, item.id)) return { item, changed: false }
  const legacyWorkspace = item.workspace && typeof item.workspace === 'object' ? item.workspace : null
  const legacyRepos = Array.isArray(item.repos) ? item.repos.filter(Boolean) : []
  if (!legacyWorkspace?.id && legacyRepos.length < 2) return { item, changed: false }

  let workspace = legacyWorkspace?.id ? findWorkspace(profile, legacyWorkspace.id) : null
  // 同一旧虚拟库的多条流程：优先复用名字与成员集合一致的本机虚拟库，避免每条流程各建一个
  if (!workspace && legacyWorkspace?.name && legacyRepos.length >= 2) {
    workspace = listWorkspaces(profile).find((entry) => entry.name === legacyWorkspace.name
      && entry.repos?.length === legacyRepos.length
      && legacyRepos.every((path) => entry.repos.includes(path))) ?? null
  }
  if (!workspace && legacyRepos.length >= 2) {
    try {
      workspace = await createWorkspace(profile, {
        name: await uniqueWorkspaceName(profile, legacyWorkspace?.name),
        repos: legacyRepos,
      })
    } catch {
      workspace = null
    }
  }
  setItemWorkspace(profile, repoPath, item.id, {
    workspaceId: workspace?.id ?? legacyWorkspace?.id ?? null,
    workspaceName: workspace?.name ?? legacyWorkspace?.name ?? null,
    baseline: Array.isArray(item.baseline?.repos) ? item.baseline.repos : [],
    migratedFromLedger: true,
  })
  // saveItem 会剥掉台账里的 repos/workspace/baseline.repos
  const saved = await saveItem(repoPath, item)
  return { item: saved, changed: true, restoredWorkspace: Boolean(workspace) }
}

/**
 * 在本机虚拟库台账里新建的流程：直接把归属写进台账（本机数据，不需要再存 profile）。
 */
function stampWorkspaceItem(item, active) {
  if (!active) return item
  return {
    ...item,
    workspace: { id: active.workspace.id, name: active.workspace.name },
    repos: [...active.repos],
  }
}

/** 读取流程的统一入口：迁移旧字段 + 从本机 profile 补回虚拟库信息。 */
async function readItemLocal(profile, repoPath, id) {
  const item = await getItem(repoPath, id)
  if (!item) return null
  const ensured = await ensureItemWorkspaceBinding(profile, repoPath, item)
  if (ensured.changed) await saveProfile(profile)
  return hydrateItemLocal(profile, repoPath, ensured.item)
}

/**
 * 解析「这次操作/这个流程」对应的虚拟库。区别两种情况：
 * - 带 item：本机虚拟库台账（item 自带 workspace/repos/baseline）；旧仓库台账的
 *   profile 绑定仅作兼容兜底，换人/换机没有绑定时就是普通单库流程；
 * - 不带 item（state/recon/新建流程）：跟随本机 activeRepo。
 *
 * 返回值没有 primary：成员库平权，落盘位置用 `localRoot`。
 * @returns {{workspace: object, repos: string[], localRoot: string, members: object[], binding: object|null, baseline: object|null} | null}
 */
function workspaceTarget(profile, item = null, repoPath = null) {
  if (item) {
    const local = isWorkspaceLocalRoot(repoPath)
    const { binding, workspace } = local
      ? { binding: null, workspace: null }
      : localWorkspaceFor(profile, repoPath, item.id)
    const workspaceId = workspace?.id ?? binding?.workspaceId ?? item.workspace?.id ?? null
    const resolved = workspace ?? (workspaceId ? findWorkspace(profile, workspaceId) : null)
    const repos = (resolved?.repos?.length ? resolved.repos : (Array.isArray(item.repos) ? item.repos : [])).filter(Boolean)
    if (repos.length < 2) return null
    const targetWorkspace = resolved ?? {
      id: workspaceId ?? `item:${item.id}`,
      name: binding?.workspaceName ?? item.workspace?.name ?? '虚拟库',
    }
    const members = workspaceMembers(repos).map((member) => {
      const worktree = item ? worktreeForMember(member, item) : null
      return { ...member, worktree, workRoot: worktree?.path ?? member.path }
    })
    return {
      workspace: targetWorkspace,
      repos,
      localRoot: workspaceLocalDir(targetWorkspace),
      localPath: workspaceLocalDir(targetWorkspace),
      members,
      binding,
      baseline: local ? (item.baseline ?? null) : baselineForLocal(profile, repoPath, item),
    }
  }
  const active = activeWorkspace(profile)
  if (!active) return null
  return { ...active, members: workspaceMembers(active.repos), binding: null, baseline: null }
}

/**
 * 一个虚拟库的成员事实（存在性/初始化/Git 摘要），列表和激活态共用。
 * 成员库平权：不标 primary，也不按第一个排序；各自 `.dev-hub` 是否存在只作事实展示。
 */
async function workspaceMemberRows(profile, repos) {
  const rows = []
  for (const member of workspaceMembers(repos)) {
    const loaded = await loadProject(member.path)
    const entry = profileForRepo(profile, member.path)
    const existsOnDisk = await exists(member.path)
    const repo = existsOnDisk ? await isGitRepo(member.path) : false
    const branch = repo ? (await git(member.path, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim() || null : null
    const head = repo ? (await git(member.path, ['rev-parse', '--short', 'HEAD'])).stdout.trim() || null : null
    rows.push({
      path: member.path,
      name: member.name,
      exists: existsOnDisk,
      initialized: Boolean(loaded),
      isRepo: repo,
      branch,
      head,
      member: entry?.member ?? null,
    })
  }
  return rows
}

async function workspaceState(profile, target) {
  if (!target) return null
  const localRoot = target.localRoot ?? workspaceLocalDir(target.workspace)
  return {
    id: target.workspace.id,
    name: target.workspace.name,
    repos: target.repos,
    // 虚拟库自己的落盘位置（本机独立目录），不是某个成员库
    path: localRoot,
    localPath: localRoot,
    member: target.workspace.member ?? null,
    members: await workspaceMemberRows(profile, target.repos),
  }
}

/**
 * 虚拟库成员变化后同步它自己的台账（本机独立目录）与旧仓库台账绑定。
 *
 * 成员库平权：不维护“主库”，只按新成员集合收敛；
 * 被移除成员的 baseline 删掉，新成员按当前 HEAD 补一条（不把历史改动算进来）。
 */
async function syncWorkspaceFlows(profile, workspace, { added = [], memberNames = [] } = {}) {
  const localRoot = workspaceLocalDir(workspace)
  const convergeBaseline = async (rows) => {
    let changed = false
    const kept = rows.filter((entry) => workspace.repos.includes(entry.path))
    if (kept.length !== rows.length) changed = true
    for (const path of added) {
      if (kept.some((entry) => entry.path === path)) continue
      const info = await gitInfo(path)
      if (!info.available) continue
      const member = memberNames.find((entry) => entry.path === path)
      kept.push({
        path,
        name: member?.name ?? repoName(path),
        commit: info.head,
        branch: info.branch,
        isRepo: true,
        startedAt: new Date().toISOString(),
      })
      changed = true
    }
    return { rows: kept, changed }
  }
  // 1) 本机虚拟库台账（新布局）
  for (const item of await listItems(localRoot)) {
    let changed = false
    if (Array.isArray(item.repos) && item.repos.join('\u0000') !== workspace.repos.join('\u0000')) {
      item.repos = [...workspace.repos]
      changed = true
    }
    if (item.workspace?.id === workspace.id && item.workspace.name !== workspace.name) {
      item.workspace = { id: workspace.id, name: workspace.name }
      changed = true
    }
    if (Array.isArray(item.baseline?.repos) && item.baseline.repos.length) {
      const next = await convergeBaseline(item.baseline.repos)
      if (next.changed) {
        item.baseline.repos = next.rows
        changed = true
      }
    }
    if (changed) await saveItem(localRoot, item)
  }
  // 2) 旧仓库台账（虚拟库信息还绑在 profile.itemWorkspaces）：只更新本机绑定
  for (const binding of Object.values(profile.itemWorkspaces ?? {})) {
    if (binding?.workspaceId !== workspace.id) continue
    if (Array.isArray(binding.baseline) && binding.baseline.length) {
      const next = await convergeBaseline(binding.baseline)
      if (next.changed) binding.baseline = next.rows
    }
    binding.workspaceName = workspace.name
    binding.updatedAt = new Date().toISOString()
  }
}

/**
 * 创建一个虚拟库：只建本机独立存储，**不初始化任何成员库**。
 *
 * - 台账/规范/上下文/证据：`~/.dev-hub/workspaces/<id>/`
 * - 环境探测与首次规范都在虚拟库本机目录完成，不挑某个成员库当代表
 * - 成员库只登记本机身份（不写它们的 `.dev-hub`），并且一视同仁
 */
async function initializeWorkspace({ name, repos, member }) {
  let profile = await loadProfile()
  const workspace = await createWorkspace(profile, { name, repos })
  await saveProfile(profile)
  const fallbackMember = Object.values(profile.repos ?? {}).map((entry) => entry?.member).find(Boolean)
    ?? '未命名开发者'
  const memberName = String(member ?? '').trim() || fallbackMember
  const localRoot = workspaceLocalDir(workspace)
  // 本机独立目录：先落清单/项目文件，后面台账/规范/上下文/证据都写这里
  const paths = await ensureWorkspaceLocalDir(workspace)
  // 环境探测用本机目录（不借用某个成员库的身份）：探测的是这台机器，不是“主库”
  const env = await detectEnvironment(localRoot)
  for (const path of workspace.repos) {
    await setProfileForRepo(profile, path, {
      member: memberName,
      environment: profileForRepo(profile, path)?.environment ?? env,
      workspaceMember: workspace.id,
    }, { activate: false })
  }
  workspace.member = memberName
  workspace.environment = env
  workspace.updatedAt = new Date().toISOString()
  // 规范技能：成员库画像取并集（平权），写虚拟库本机目录，成员库不共享也不落盘
  const memberProfiles = await Promise.all(
    workspace.repos.map((path) => detectRepoProfile(path).catch(() => null)),
  )
  const repoProfile = mergeRepoProfiles(memberProfiles)
  const project = await loadProject(localRoot)
  const conventions = await saveConventions(localRoot, buildDefaultConventions({
    repo: localRoot,
    name: workspace.name,
    profile: repoProfile,
    context: project?.project?.context ?? {},
  }))
  await syncWorkspaceManifest(workspace)
  profile.activeRepo = `workspace:${workspace.id}`
  await saveProfile(profile)
  return {
    workspace,
    localRoot,
    paths,
    skills: {
      initialized: true,
      installedSkills: (conventions.installedSkills ?? []).map((entry) => entry.id),
      constraints: (conventions.constraints ?? []).length,
    },
    profile: await loadProfile(),
  }
}

/**
 * 记录开工 baseline。
 * - 单库：`item.baseline = { startedAt, commit, branch }`（行为不变）
 * - 虚拟库：每个成员库一条 baseline（成员库平权），顶层 commit/branch 为 null；
 *   本机台账直接保存 `baseline.repos`，旧仓库台账则把每库 baseline 留在本机 profile。
 */
async function recordBaselineLocal(profile, repoPath, item, workRoot = repoPath) {
  if (item.baseline) return item
  const target = workspaceTarget(profile, item, repoPath)
  if (!target) {
    item.baseline = await startBaseline(workRoot)
    return item
  }
  const base = await workspaceBaseline(target.members)
  item.baseline = {
    startedAt: base.startedAt,
    // 虚拟库没有“代表库”：顶层不放任何一个成员库的 commit/branch
    commit: null,
    branch: null,
    repos: base.repos,
  }
  if (!isWorkspaceLocalRoot(repoPath)) {
    // 旧仓库台账（虚拟库数据落在某成员库）：每库 baseline 只留本机 profile，不写进仓库
    item.baseline = { startedAt: base.startedAt, commit: null, branch: null }
    setItemWorkspace(profile, repoPath, item.id, {
      ...(target.binding ?? {}),
      workspaceId: target.workspace.id,
      workspaceName: target.workspace.name,
      baseline: base.repos,
    })
    await saveProfile(profile)
  } else {
    setItemWorkspace(profile, repoPath, item.id, {
      workspaceId: target.workspace.id,
      workspaceName: target.workspace.name,
    })
    await saveProfile(profile)
  }
  return item
}

/**
 * 跨库提交：把选中文件按成员库分组，逐个库 add/commit/push。
 * 任何一步失败都写进结果并返回，不隐藏已成功的库。
 */
async function submitWorkspace({ target, ledgerRepo, item, paths, message, branchMode, branchName, pushOnly }) {
  const groups = new Map()
  for (const raw of Array.isArray(paths) ? paths : []) {
    const value = String(raw ?? '').trim()
    if (!value) continue
    const split = splitRepoScopedPath(value, target.members)
    const rel = relativePathSafe(split?.path ?? value)
    let member = split?.member ?? null
    if (!member) {
      // 没带成员前缀：按“哪个成员库真的含这个文件”定位。多个库同名文件必须显式带前缀，
      // 不能默认落到第一个成员库（成员库平权）。
      const hits = []
      for (const candidate of target.members) {
        if (await exists(join(candidate.path, rel))) hits.push(candidate)
      }
      if (hits.length > 1) {
        throw new Error(`文件 ${value} 在多个成员库都存在（${hits.map((entry) => entry.name).join('、')}），请带成员前缀再提交`)
      }
      if (!hits.length) throw new Error(`文件 ${value} 不在任何成员库：请带成员前缀（<成员库>/<相对路径>）`)
      member = hits[0]
    }
    const list = groups.get(member.path) ?? { member, paths: [] }
    if (!list.paths.includes(rel)) list.paths.push(rel)
    groups.set(member.path, list)
  }
  if (!pushOnly && !groups.size) throw new Error('请选择要提交的文件')

  // 预检：所有目标库必须是 git、有 remote、新分支名不能已存在（全部检查完再动手）
  const targets = pushOnly
    ? target.members.filter((member) => (item.workflow.submission?.repos ?? []).some((entry) => entry.name === member.name || entry.path === member.path))
    : [...groups.values()].map((group) => group.member)
  if (!targets.length) throw new Error('没有可提交/推送的成员库')
  const preflight = []
  for (const member of targets) {
    const root = member.workRoot ?? member.path
    if (!(await isGitRepo(root))) throw new Error(`成员库 ${member.name} 不是 git 仓库，无法提交`)
    const remotes = await git(root, ['remote'])
    const remoteList = remotes.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (!remoteList.length) throw new Error(`成员库 ${member.name} 没有配置 git remote，无法 push`)
    const remote = remoteList.includes('origin') ? 'origin' : remoteList[0]
    if (!pushOnly && branchMode === 'new') {
      const existsBranch = await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`])
      if (existsBranch.ok) throw new Error(`成员库 ${member.name} 已存在分支 ${branchName}（换一个名字，或改用当前分支）`)
    }
    const baseline = baselineForMember(target.baseline ?? item.baseline, member)
    const previous = (item.workflow.submission?.repos ?? []).find((entry) => entry.path === member.path || entry.name === member.name)
    const targetBranch = branchMode === 'new' && !pushOnly
      ? branchName
      : await targetBranchForRepo(member.path, pushOnly ? (previous?.branch || baseline?.branch) : baseline?.branch)
    preflight.push({ member, remote, root, targetBranch, isWorktree: Boolean(member.workRoot && member.workRoot !== member.path) })
  }

  const results = []
  for (const { member, remote, root, targetBranch, isWorktree } of preflight) {
    const group = groups.get(member.path)
    const row = {
      path: member.path,
      workRoot: root,
      name: member.name,
      branch: targetBranch || (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim(),
      ...(isWorktree ? { worktreeBranch: (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim() } : {}),
      commit: '',
      pushed: false,
      status: 'failed',
      error: '',
      pushOutput: '',
    }
    try {
      if (!pushOnly && branchMode === 'new') {
        const create = await git(root, ['checkout', '-b', branchName])
        if (!create.ok) throw new Error(`创建分支失败：${(create.stderr || create.stdout).slice(-1000)}`)
        row.branch = branchName
      }
      row.commit = pushOnly
        ? ((item.workflow.submission?.repos ?? []).find((entry) => entry.path === member.path || entry.name === member.name)?.commit
          || (await git(root, ['rev-parse', '--short', 'HEAD'])).stdout.trim())
        : (await git(root, ['rev-parse', '--short', 'HEAD'])).stdout.trim()
      if (!pushOnly) {
        const add = await git(root, ['add', '--', ...(group?.paths ?? [])])
        if (!add.ok) throw new Error(`git add 失败：${(add.stderr || add.stdout).slice(-1000)}`)
        const commit = await git(root, ['commit', '-m', message])
        if (!commit.ok) throw new Error(`git commit 失败：${(commit.stderr || commit.stdout).slice(-1000)}`)
        row.commit = (await git(root, ['rev-parse', '--short', 'HEAD'])).stdout.trim()
        row.status = 'committed'
      }
      let push
      if (isWorktree && branchMode !== 'new') {
        push = await pushWorktreeToTarget(root, { remote, targetBranch: row.branch })
      } else {
        const hasUpstream = (await git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).ok
        const pushArgs = hasUpstream && branchMode !== 'new' && !pushOnly
          ? ['push', remote]
          : ['push', '-u', remote, row.branch]
        push = await git(root, pushArgs, { timeout: 120000 })
      }
      row.pushed = push.ok
      row.status = push.ok ? 'pushed' : 'push-failed'
      row.pushOutput = (push.stdout || push.stderr).slice(-4000)
      // 自动 rebase 后 HEAD 变了：以实际 HEAD 记录提交
      row.commit = (await git(root, ['rev-parse', '--short', 'HEAD'])).stdout.trim() || row.commit
      if (!push.ok) row.error = `push 失败：${row.pushOutput.slice(-500)}`
    } catch (error) {
      row.error = String(error?.message ?? error)
      row.status = 'failed'
    }
    results.push(row)
  }

  const failed = results.filter((row) => row.status === 'failed' || row.status === 'push-failed')
  const pushed = failed.length === 0
  item.workflow.submission = {
    status: pushed ? 'pushed' : (results.some((row) => row.commit) ? 'committed' : 'failed'),
    branch: results.map((row) => row.branch).filter(Boolean).join(' / '),
    commit: results.map((row) => `${row.name}@${row.commit || '—'}`).join(' + '),
    pushed,
    at: new Date().toISOString(),
    message,
    repos: results,
  }
  const saved = await saveItem(ledgerRepo, appendHistory(item, 'submit',
    pushed
      ? `多库提交：${results.map((row) => `${row.name}@${row.commit}`).join('、')}，全部推送`
      : `多库提交部分失败：${failed.map((row) => `${row.name}（${row.error || row.status}）`).join('、')}`))
  return { saved, results, failed, pushed }
}

async function detectAndSave(repo) {
  const env = await detectEnvironment(repo)
  const profile = await loadProfile()
  const entry = profileForRepo(profile, repo) ?? {}
  await setProfileForRepo(profile, repo, { ...entry, environment: env })
  await saveProfile(profile)
  return env
}

/** 目标分支：baseline 记录的是开工分支；旧台账可能误记成 devhub/<flow>，回退到主仓库当前分支。 */
async function targetBranchForRepo(repo, branch) {
  const value = String(branch ?? '').trim()
  if (value && !value.startsWith('devhub/')) return value
  const current = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
  return current && current !== 'HEAD' ? current : (value || '')
}

/**
 * 把 worktree 里的提交直接推到目标分支，而不是 devhub/<flow>。
 * - 目标分支在远端前进时先 fetch + rebase，尽量让用户不用手工合并；
 * - rebase 冲突则 abort 并保留 worktree，要求人工处理；
 * - 不更新本地主工作区的目标分支（避免覆盖用户正在编辑的工作区），远端已更新。
 */
async function pushWorktreeToTarget(root, { remote, targetBranch }) {
  if (!targetBranch) throw new Error('缺少目标分支：请重新开工或指定分支')
  // 先同步远端目标分支；fetch 失败不阻断首次创建分支的 push
  const fetched = await git(root, ['fetch', remote, targetBranch], { timeout: 120000 })
  if (fetched.ok) {
    const remoteRef = `refs/remotes/${remote}/${targetBranch}`
    const exists = await git(root, ['rev-parse', '--verify', '--quiet', remoteRef])
    if (exists.ok) {
      const ancestor = await git(root, ['merge-base', '--is-ancestor', remoteRef, 'HEAD'])
      if (!ancestor.ok) {
        const rebased = await git(root, ['rebase', remoteRef], { timeout: 120000 })
        if (!rebased.ok) {
          await git(root, ['rebase', '--abort'])
          throw new Error(`目标分支 ${targetBranch} 已有新提交，自动 rebase 发生冲突；请在独立工作区解决后重试`)
        }
      }
    }
  }
  return git(root, ['push', remote, `HEAD:refs/heads/${targetBranch}`], { timeout: 120000 })
}

/** 台账里的 worktree 元数据 + 本机推导出的绝对路径。 */
function worktreeFor(repo, item) {
  const meta = worktreeOf(item)
  return meta ? { ...meta, path: worktreePathFor(repo, item.id) } : null
}

/** 虚拟库成员的工作区 item id / 元数据；绝对路径仍只在本机推导。 */
function memberWorktreeItemId(itemId, memberName) {
  return `${itemId}--${String(memberName ?? '').replace(/[^\p{L}\p{N}._-]+/gu, '-')}`
}

function worktreeForMember(member, item) {
  const meta = (Array.isArray(item?.workflow?.worktrees) ? item.workflow.worktrees : [])
    .find((entry) => entry?.name === member?.name)
  if (!meta?.branch) return null
  return {
    ...meta,
    path: worktreePathFor(member.path, memberWorktreeItemId(item.id, member.name)),
  }
}

/** 本流程实际执行 git/测试/提交的目录：有独立工作区就用它，没有就退回仓库（旧流程兼容）。 */
async function workRootOf(repo, item) {
  const worktree = worktreeFor(repo, item)
  if (!worktree) return repo
  if (!(await worktreeExists(worktree.path))) {
    throw new Error(`独立工作区不存在：${worktree.path}（分支 ${worktree.branch}）；请重新开始开发或清理该流程的工作区`)
  }
  return worktree.path
}

/** 检测重新开发时统一提示：说清为什么回到开发中、下一步做什么。 */
const REWORK_REASON = '检测到本机自测通过后代码/诉求又有变化：已回到开发中，请重跑本机自测'

/** 这条流程的代码落在哪些目录（虚拟库按成员库；单库优先独立工作区）。 */
async function codeStateTargets(profile, repoPath, item) {
  const target = workspaceTarget(profile, item, repoPath)
  if (target?.members?.length) {
    return target.members.map((member) => ({ name: member.name, path: member.workRoot ?? member.path }))
  }
  try {
    return [{ name: repoName(repoPath), path: await workRootOf(repoPath, item) }]
  } catch {
    return [{ name: repoName(repoPath), path: repoPath }]
  }
}

/**
 * 代码指纹：每个目录的 HEAD + 已跟踪文件改动哈希。
 * 只算已跟踪文件（--untracked-files=no）：构建产物/日志/临时文件不当作"重新开发"。
 */
async function codeStateFor(profile, repoPath, item) {
  const rows = []
  for (const target of await codeStateTargets(profile, repoPath, item)) {
    if (!(await exists(target.path))) {
      rows.push({ name: target.name, head: 'missing', dirty: '' })
      continue
    }
    const head = await git(target.path, ['rev-parse', 'HEAD'])
    const status = await git(target.path, ['status', '--porcelain=v1', '--untracked-files=no'])
    rows.push({
      name: target.name,
      head: head.ok ? head.stdout.trim() : '',
      dirty: status.ok ? hashOf(status.stdout) : '',
    })
  }
  return rows
}

function sameCodeState(left, right) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? [])
}

/**
 * 测试完成时给结果盖上"验证基线"：诉求/计划哈希 + 代码指纹。
 * 之后的改动据此判定过期；重跑本机自测会覆盖旧指纹并清掉 rework。
 */
async function stampVerification(profile, repo, item, phase, result) {
  result.basisHash = verificationBasisHash(item)
  result.codeState = await codeStateFor(profile, repo, item)
  result.stale = false
  if (phase === 'local') {
    item.workflow.rework = null
    // 本机自测重跑后，之前的环境测试结论也基于旧代码，需要重跑
    if (item.workflow.tests.environment?.status === 'passed') item.workflow.tests.environment.stale = true
  }
  return result
}

/**
 * 验证结论是否过期：测试通过时记下的代码指纹 / 诉求计划哈希与现在不一致，
 * 说明测试之后又发生了开发；把流程标记为重新开发（阶段由 stage.mjs 推回 develop）。
 *
 * 旧台账没有指纹时，用"测试通过后绑定的会话是否又有活动"做一次保守兜底；
 * 新跑一次本机自测就会写入指纹，之后都按指纹精确判断。
 */
async function applyReworkFacts(ctx, profile, repoPath, items) {
  const out = []
  for (const item of items) {
    try {
      const tests = item.workflow?.tests ?? {}
      const local = tests.local ?? {}
      const submitted = Boolean(String(item.workflow?.submission?.commit ?? '').trim())
      if (local.status !== 'passed' || submitted || item.workflow?.rework?.at) {
        out.push(item)
        continue
      }
      const hasCodeState = Array.isArray(local.codeState) && local.codeState.length > 0
      const hasBasis = Boolean(local.basisHash)
      let changed = false
      if (hasCodeState) {
        if (!sameCodeState(await codeStateFor(profile, repoPath, item), local.codeState)) changed = true
      }
      if (!changed && hasBasis) {
        if (verificationBasisHash(item) !== local.basisHash) changed = true
      }
      if (!changed && !hasCodeState && !hasBasis) {
        const live = item.session?.id ? sessionState(ctx, item.session.id) : null
        if (live?.lastEventAt && sessionActiveAfter(live.lastEventAt, local.at)) {
          changed = true
        }
      }
      if (!changed) {
        out.push(item)
        continue
      }
      const at = new Date().toISOString()
      item.workflow.rework = { at, reason: REWORK_REASON }
      if (item.workflow.tests.local) item.workflow.tests.local.stale = true
      if (item.workflow.tests.environment?.status === 'passed') item.workflow.tests.environment.stale = true
      if (item.workflow.review) {
        item.workflow.review = invalidateReview(item.workflow.review, {
          at,
          reason: '代码/诉求在本轮评审通过后有变化，评审结论作废，需要重新评审',
        })
      }
      out.push(await saveItem(repoPath, appendHistory(item, 'rework', REWORK_REASON)))
    } catch {
      // 指纹读取失败不阻断列表；保留原项，下次轮询再试
      out.push(item)
    }
  }
  return out
}

/** 同一仓库是否已有别的开发中/验证中流程：只有并行时才需要把新流程放进独立工作区。 */
/**
 * 生成一份 Context Pack（并给虚拟库留档上下文/证据）。
 *
 * 单库与虚拟库的上下文形态不同：
 * - 单库：仓库分支/HEAD/基线 diff；
 * - 虚拟库：成员库平权的事实（无主库），台账/证据写本机独立目录。
 */
const MEMORY_DIR = join(PROFILE_DIR, 'memory')
const INDEX_DIR = join(PROFILE_DIR, 'index')
// 每个仓库/进程只热身一次：选中代码库后在后台建索引，第一次需求扫描就不用等全量 walk
const warmedIndexes = new Set()
function warmRepoIndex(repo) {
  const path = String(repo ?? '').trim()
  if (!path || warmedIndexes.has(path)) return
  warmedIndexes.add(path)
  ensureRepoIndex(path, { indexDir: INDEX_DIR }).catch(() => { /* 索引失败不打扰用户，扫描会回退全量 */ })
}

async function buildFor(repo, item, profile, { workRoot = null } = {}) {
  const loaded = await loadProject(repo)
  if (!loaded) throw new Error('开发目标尚未初始化，请先完成 DevHub 初始化')
  const target = workspaceTarget(profile, item, repo)
  const localLedger = isWorkspaceLocalRoot(repo)
  const entry = ledgerEntry(profile, repo)
  const env = target
    ? (target.workspace.environment ?? entry?.environment ?? await detectEnvironment(repo))
    : (entry?.environment ?? await detectEnvironment(repo))
  const conventions = await loadConventions(repo)
  const repoProfile = target
    ? mergeRepoProfiles(await Promise.all(target.members.map((member) => detectRepoProfile(member.path).catch(() => null))))
    : await detectRepoProfile(repo)
  const worktree = target ? null : worktreeFor(repo, item)
  const root = workRoot ?? (worktree ? await workRootOf(repo, item) : repo)
  // 虚拟库不在本机目录里读 git：仓库事实按成员库聚合（没有“代表库”）
  const info = target ? null : await gitInfo(root)
  let changes
  let workspace = null
  if (target) {
    const evidence = await collectWorkspaceEvidence(target.members, target.baseline ?? item.baseline)
    changes = workspaceChanges(evidence)
    workspace = {
      id: target.workspace.id,
      name: target.workspace.name,
      repos: target.repos,
      localPath: target.localRoot,
      members: evidence.members,
      totals: evidence.totals,
      evidenceComplete: evidence.evidenceComplete,
      reason: changes.reason,
    }
  } else {
    changes = item.baseline?.commit
      ? await changesSince(root, item.baseline)
      : {
          evidenceComplete: false,
          reason: item.baseline
            ? '这个仓库的 baseline 还没有 commit；点击“开始开发”后才会计算变更'
            : '该开发项还没有 baseline commit；点击“开始开发”后才会计算变更',
          changes: info?.changes ?? [],
          commits: [],
          baseCommit: null,
          headCommit: info?.head ?? null,
          stat: info?.shortStat ?? null,
        }
  }
  const memoryEntries = await loadRepoMemory(MEMORY_DIR, repo).catch(() => [])
  const context = buildContext({
    repoName: target ? target.workspace.name : (loaded.project.name || repoName(repo)),
    project: loaded.project,
    item,
    profile: target
      ? { member: target.workspace.member ?? entry?.member ?? '未设置', environment: env }
      : entry,
    env,
    gitInfo: info,
    changes,
    conventions,
    repoProfile,
    workspace,
    worktree: worktree ? { ...worktree, path: root } : null,
    memory: selectMemoryForContext(memoryEntries),
  })
  // 虚拟库：上下文包与证据都留档到本机独立目录（单库保持原行为，不新增落盘）
  if (target) {
    try {
      await writeWorkspaceContext(target.workspace, item.id, context)
      await writeWorkspaceEvidence(target.workspace, item.id, {
        members: workspace.members,
        changes: changes.changes,
        totals: changes.totals,
        evidenceComplete: workspace.evidenceComplete,
      })
    } catch (error) {
      // 留档失败不阻断上下文生成，但必须可见（不能假装写出了文件）
      context.artifactError = String(error?.message ?? error)
    }
  }
  return {
    context,
    item,
    project: loaded.project,
    git: info,
    changes,
    workRoot: root,
    ...(localLedger ? { ledger: { kind: 'virtual-workspace', path: target?.localRoot ?? repo } } : {}),
    ...(worktree ? { worktree: { ...worktree, path: root } } : {}),
    ...(workspace ? { workspace } : {}),
  }
}


function findUrl(value) {
  if (!value || typeof value !== 'object') return null
  for (const key of ['url', 'document_url', 'doc_url', 'documentUrl', 'docUrl']) {
    if (typeof value[key] === 'string' && value[key].startsWith('http')) return value[key]
  }
  for (const child of Object.values(value)) {
    const found = findUrl(child)
    if (found) return found
  }
  return null
}

async function runConfiguredCommand(repo, command) {
  const started = Date.now()
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: repo,
      timeout: 30 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
      windowsHide: true,
    })
    return { status: 'passed', output: `${stdout ?? ''}${stderr ? '\n' + stderr : ''}`.trim().slice(-120000), durationMs: Date.now() - started }
  } catch (error) {
    const output = `${error?.stdout ?? ''}${error?.stderr ?? ''}`.trim() || String(error?.message ?? error)
    return { status: 'failed', output: output.slice(-120000), durationMs: Date.now() - started }
  }
}

function commandFor(item, project, phase) {
  const workflow = item.workflow ?? {}
  const configured = workflow.tests?.[phase]?.command
  if (configured) return configured
  const commands = project?.context?.commands ?? {}
  if (phase === 'local') return commands.localTest || commands.test || commands.gate || ''
  return commands.environmentTest || ''
}

/**
 * 「探测」本机命令能否真的跑起来：只看第一个 token，不执行命令。
 * - 绝对/相对路径：检查文件是否存在（脚本一般用 sh/bash 触发，不强制可执行位）；
 * - 普通命令名：用 which 找可执行文件；
 * - 含 shell 语法（管道/变量/引号）：不做天真的拆分，标记为未探测。
 */
async function probeLocalCommand(repo, command) {
  const token = String(command ?? '').trim().split(/\s+/)[0] ?? ''
  if (!token) return { ok: false, kind: 'empty', reason: '命令为空' }
  if (/[|&;<>()$`"'*?]/.test(token)) return { ok: true, kind: 'shell', reason: '包含 shell 语法，未探测可执行文件' }
  if (token.startsWith('/') || token.startsWith('./') || token.startsWith('../')) {
    const path = token.startsWith('/') ? token : join(repo, token)
    return (await exists(path))
      ? { ok: true, kind: 'file', token, path }
      : { ok: false, kind: 'file', token, reason: `找不到文件：${token}` }
  }
  const path = await which(token)
  return path
    ? { ok: true, kind: 'bin', token, path }
    : { ok: false, kind: 'bin', token, reason: `本机没找到可执行文件：${token}` }
}

async function createLarkDoc(repo, item, title, markdown) {
  const lark = await which('lark-cli')
  if (!lark) throw new Error('本机没有找到 lark-cli，请先安装并完成登录')
  const content = String(markdown ?? '') || buildTechDocMarkdown(item, { repoName: repoName(repo) })
  const temp = join(tmpdir(), `dev-hub-${item.id}-${Date.now()}.md`)
  await writeFile(temp, content, 'utf8')
  const result = await run(lark, [
    'docs', '+create',
    '--title', title,
    '--doc-format', 'markdown',
    '--content', `@${temp}`,
  ], { timeout: 120000 })
  if (!result.ok) throw new Error(`lark-cli 创建文档失败：${(result.stderr || result.stdout).slice(-2000)}`)
  let parsed = null
  try { parsed = JSON.parse(result.stdout) } catch { /* fall through */ }
  const url = findUrl(parsed)
  if (!url) throw new Error(`lark-cli 创建成功但没有返回文档 URL：${result.stdout.slice(0, 2000)}`)
  return { url, output: result.stdout.slice(0, 2000) }
}

/**
 * 生成本地技术文档：合并 generated/user 段，不覆盖用户补充；冲突时不写盘。
 * 默认路径 docs/design/{id}.md（仓库可见），也可由项目/流程覆盖。
 */
async function writeLocalTechDoc({ repo, item, title, pathTemplate, force = false }) {
  const techDoc = item.workflow?.techDoc ?? {}
  const template = String(pathTemplate ?? '').trim() || DEFAULT_DOCS_CONFIG.local.path
  const relPath = expandDocPath(template, { id: item.id, title: item.title, repoName: repoName(repo) })
  const absPath = join(repo, relPath)
  let existing = null
  try { existing = await readFile(absPath, 'utf8') } catch { /* 不存在就新建 */ }
  const generatedAt = new Date().toISOString()
  const merged = mergeLocalDoc(existing, item, {
    repoName: repoName(repo),
    supplement: techDoc.supplement ?? '',
    generatedHash: techDoc.generatedHash,
    force,
    generatedAt,
  })
  if (merged.conflict) {
    return { conflict: true, status: merged.status, message: merged.message, relPath, existing: existing ?? '', nextGenerated: merged.nextGenerated, supplement: merged.supplement }
  }
  await mkdir(dirname(absPath), { recursive: true })
  await writeFile(absPath, merged.content, 'utf8')
  const generated = buildTechDocMarkdown(item, { repoName: repoName(repo), generatedAt })
  return {
    conflict: false,
    status: merged.status,
    relPath,
    absPath,
    supplement: merged.supplement,
    generatedHash: hashText(generated),
    generatedAt,
  }
}

/** 更新已有飞书文档正文（整篇 overwrite；保留台账里的用户补充，会一起写入）。 */
async function updateLarkDoc(repo, item, url, markdown) {
  const lark = await which('lark-cli')
  if (!lark) throw new Error('本机没有找到 lark-cli，请先安装并完成登录')
  if (!url) throw new Error('缺少飞书文档 URL')
  const temp = join(tmpdir(), `dev-hub-${item.id}-${Date.now()}.md`)
  await writeFile(temp, String(markdown ?? ''), 'utf8')
  try {
    const result = await run(lark, [
      'docs', '+update',
      '--doc', url,
      '--command', 'overwrite',
      '--doc-format', 'markdown',
      '--content', `@${temp}`,
    ], { timeout: 120000 })
    if (!result.ok) throw new Error(`lark-cli 更新文档失败：${(result.stderr || result.stdout).slice(-2000)}`)
    return { url, output: result.stdout.slice(0, 2000) }
  } finally {
    try { await unlink(temp) } catch { /* ignore */ }
  }
}

function relativePathSafe(path) {
  const value = String(path ?? '').replace(/\\/g, '/').trim()
  const segments = value.split('/')
  if (!value || value.startsWith('/') || segments.includes('..') || segments[0] === '.git') {
    throw new Error(`不允许提交的路径：${path}`)
  }
  return value
}

/** 读取某仓库的流程，并完成"旧台账迁移 + 本机虚拟库补全"。 */
async function localItems(profile, repoPath) {
  const items = await listItems(repoPath)
  let profileChanged = false
  const out = []
  for (const item of items) {
    const ensured = await ensureItemWorkspaceBinding(profile, repoPath, item)
    if (ensured.changed) profileChanged = true
    out.push(hydrateItemLocal(profile, repoPath, ensured.item))
  }
  if (profileChanged) await saveProfile(profile)
  return out
}

/** 读 Workspace 快照：优先 controller baseline（带 archived/pinned），失败回退 registry。 */
async function workspaceRegistrySnapshot(ctx) {
  const controller = ctx.get('workspaceController')
  if (controller?.follow) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 2500)
    try {
      const iterator = controller.follow(ac.signal)[Symbol.asyncIterator]()
      const first = await iterator.next()
      try { await iterator.return?.() } catch { /* ignore */ }
      if (first?.value?.type === 'baseline' && first.value.value) return first.value.value
    } catch {
      /* fall through */
    } finally {
      clearTimeout(timer)
      try { ac.abort() } catch { /* ignore */ }
    }
  }
  const registry = ctx.get('workspaceRegistry')
  const workspaces = registry?.list?.() ?? []
  return {
    items: workspaces.map((workspace) => ({
      workspaceId: workspace.id,
      path: workspace.path,
      title: workspace.title,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      sessionIds: workspace.sessionIds ?? [],
    })),
    archivedSessionIds: [],
    pinnedSessionIds: [],
  }
}

/**
 * 每个 DevHub 项目自动拥有一个 DSH Workspace：
 * - 单库：workspace 路径 = 仓库根目录（扫描/澄清等 cwd 在仓库里的会话自动归组）；
 * - 虚拟库：workspace 路径 = 虚拟库本机台账目录。
 * DSH 的 Workspace 成员按 canonical cwd 精确匹配，所以这里只 attach cwd 等于该路径的会话；
 * worktree 里的开发/评审会话按 DSH 规则仍在 worktree 自己的 Workspace，工作站会话页会按项目归类。
 */
async function ensureProjectWorkspace(ctx, { name, path, snapshots = null } = {}) {
  const registry = ctx.get('workspaceRegistry')
  if (!registry?.create || !path) return null
  try {
    const workspace = await registry.create(path, `DevHub · ${name || repoName(path)}`)
    let attached = 0
    let list = snapshots
    if (list === null) {
      try { list = await ctx.get('sessionPersistence')?.list?.() ?? [] } catch { list = [] }
    }
    const wanted = resolve(String(path))
    for (const snapshot of list ?? []) {
      const header = snapshot?.header ?? snapshot
      if (!header?.id || !header.cwd) continue
      if (resolve(String(header.cwd)) !== wanted) continue
      try {
        await workspace.attachSession(header.id)
        attached += 1
      } catch { /* 已归档/已移除/路径不可解析：不阻断项目 Workspace */ }
    }
    return {
      id: workspace.id,
      title: workspace.title,
      path: workspace.path,
      attached,
      sessionCount: Array.isArray(workspace.sessionIds) ? workspace.sessionIds.length : null,
    }
  } catch (error) {
    return { path, name, error: String(error?.message ?? error) }
  }
}

/** 本机所有 DevHub 项目（单库 + 虚拟库）的 DSH Workspace 投影。 */
async function projectWorkspacesFor(ctx, profile, snapshots) {
  const entries = []
  for (const repoPath of Object.keys(profile.repos ?? {})) {
    if (isWorkspaceLocalRoot(repoPath)) continue
    const loaded = await loadProject(repoPath).catch(() => null)
    entries.push(await ensureProjectWorkspace(ctx, {
      name: loaded?.project?.name || repoName(repoPath),
      path: repoPath,
      snapshots,
    }))
  }
  for (const workspace of listWorkspaces(profile)) {
    try { await ensureWorkspaceLocalDir(workspace) } catch { /* 目录创建失败时下面显式返回错误 */ }
    entries.push(await ensureProjectWorkspace(ctx, {
      name: workspace.name,
      path: workspaceLocalDir(workspace),
      snapshots,
    }))
  }
  return entries.filter(Boolean)
}

/** 扫描本机所有台账（仓库 + 虚拟库本机目录），给会话分类提供流程归属。 */
async function collectSessionCatalogItems(profile) {
  const roots = new Set(Object.keys(profile.repos ?? {}))
  for (const workspace of listWorkspaces(profile)) roots.add(workspaceLocalDir(workspace))
  const entries = []
  for (const root of roots) {
    const items = await listItems(root).catch(() => [])
    const workspace = isWorkspaceLocalRoot(root)
      ? listWorkspaces(profile).find((entry) => workspaceLocalDir(entry) === root) ?? null
      : null
    const name = workspace?.name ?? repoName(root)
    for (const item of items) entries.push({ item, repoPath: root, repoName: name, workspaceName: workspace?.name ?? null })
  }
  return {
    entries,
    roots: [
      ...roots,
      worktreeRoot(),
      workspacesRoot(),
    ],
  }
}

/** 项目 → 需求 → 会话（开发/评审/澄清/扫描）的层级投影。 */
function buildProjectHierarchy({ catalog, entries, projectWorkspaces }) {
  const workspacesByPath = new Map((projectWorkspaces ?? []).filter((entry) => entry?.path).map((entry) => [resolve(entry.path), entry]))
  const projects = new Map()
  const flows = new Map()
  const projectOf = (path, fallbackName) => {
    const projectPath = resolve(path)
    if (!projects.has(projectPath)) {
      const registered = workspacesByPath.get(projectPath) ?? null
      projects.set(projectPath, {
        id: registered?.id ?? null,
        title: registered?.title ?? `DevHub · ${fallbackName || repoName(projectPath)}`,
        path: projectPath,
        requirements: [],
        counts: { requirements: 0, sessions: 0 },
      })
    }
    return projects.get(projectPath)
  }
  for (const entry of entries) {
    const project = projectOf(entry.repoPath, entry.workspaceName || entry.repoName)
    const item = entry.item
    const flow = {
      id: item.id,
      title: item.title ?? item.id,
      status: item.status ?? null,
      stage: item.workflow?.stage ?? null,
      intent: item.workflow?.intent ?? null,
      updatedAt: item.updatedAt ?? null,
      repoName: entry.repoName,
      repoPath: entry.repoPath,
      workspaceName: entry.workspaceName ?? null,
      sessions: { development: [], review: [], clarify: [], scan: [], internal: [] },
      counts: { total: 0, development: 0, review: 0, clarify: 0, scan: 0, internal: 0 },
    }
    flows.set(item.id, flow)
    project.requirements.push(flow)
  }
  // 只保留「关联到需求」的会话：工作站自己不关心的 DSH 会话和未关联历史会话不进入层级
  for (const session of catalog.sessions) {
    if (!session.flow?.id || !flows.has(session.flow.id)) continue
    const flow = flows.get(session.flow.id)
    const bucket = ['development', 'review', 'clarify', 'scan', 'internal'].includes(session.category)
      ? session.category
      : 'internal'
    flow.sessions[bucket].push(session)
  }
  for (const project of projects.values()) {
    for (const flow of project.requirements) {
      flow.counts = {
        development: flow.sessions.development.length,
        review: flow.sessions.review.length,
        clarify: flow.sessions.clarify.length,
        scan: flow.sessions.scan.length,
        internal: flow.sessions.internal.length,
      }
      flow.counts.total = Object.values(flow.counts).reduce((sum, value) => sum + value, 0)
    }
    project.requirements.sort((left, right) => Number(right.updatedAt ? Date.parse(right.updatedAt) : 0) - Number(left.updatedAt ? Date.parse(left.updatedAt) : 0))
    project.counts = {
      requirements: project.requirements.length,
      sessions: project.requirements.reduce((sum, flow) => sum + flow.counts.total, 0),
    }
  }
  return [...projects.values()].sort((left, right) => right.counts.sessions - left.counts.sessions || left.title.localeCompare(right.title))
}

/** 会话管理页的数据：持久化快照 + 实时状态 + 流程/工作区归属。 */
async function managedSessionsFor(ctx, profile) {
  const persistence = ctx.get('sessionPersistence')
  const liveSessions = ctx.get('sessions')?.list?.() ?? []
  let snapshots = []
  try {
    snapshots = await persistence?.list?.() ?? []
  } catch {
    snapshots = []
  }
  const known = new Set(snapshots.map((entry) => String(entry?.header?.id ?? '')))
  for (const session of liveSessions) {
    const header = session?.header
    if (!header?.id || known.has(String(header.id))) continue
    snapshots.push({ header, eventCount: session.seq ?? null })
    known.add(String(header.id))
  }
  const liveStates = new Map()
  const liveMap = new Map()
  for (const session of liveSessions) {
    const id = String(session?.id ?? '')
    if (!id) continue
    liveMap.set(id, session)
    liveStates.set(id, sessionState(ctx, id))
  }
  const workspace = await workspaceRegistrySnapshot(ctx)
  const { entries, roots } = await collectSessionCatalogItems(profile)
  const projectWorkspaces = await projectWorkspacesFor(ctx, profile, snapshots)
  const rawCatalog = buildSessionCatalog({
    snapshots,
    liveStates,
    liveSessions: liveMap,
    items: entries,
    workspaces: workspace.items ?? [],
    archived: workspace.archivedSessionIds ?? [],
    pinned: workspace.pinnedSessionIds ?? [],
    roots,
  })
  // 工作站只管理自己创建的会话：外部 DSH 会话（未绑定/其他）不进这个页面
  const catalog = {
    ...rawCatalog,
    sessions: rawCatalog.sessions.filter((session) => session.category !== 'unbound' && session.category !== 'other'),
  }
  catalog.categories = rawCatalog.categories
    .filter((category) => category.id !== 'unbound' && category.id !== 'other')
    .map((category) => ({ ...category, sessions: catalog.sessions.filter((session) => session.category === category.id) }))
  catalog.counts = Object.fromEntries(catalog.categories.map((category) => [category.id, category.sessions.length]))
  return {
    projectWorkspaces,
    ...catalog,
    // 项目 → 需求 → 开发/评审/澄清/扫描 的层级视图
    projects: buildProjectHierarchy({ catalog, entries, projectWorkspaces }),
    workspaces: (workspace.items ?? []).map((entry) => ({
      id: entry.workspaceId ?? entry.id ?? null,
      title: entry.title ?? '',
      path: entry.path ?? null,
      sessionCount: (entry.sessionIds ?? []).length,
    })),
  }
}

/** 会话管理动作：归档/取消归档/置顶/取消置顶/显示到 Workspace。 */
async function applyManagedSessionAction(ctx, body) {
  const action = String(body.action ?? '').trim()
  const ids = (Array.isArray(body.sessionIds) ? body.sessionIds : [body.sessionId])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean)
  if (!ids.length) throw new Error('缺少 sessionId')
  const registry = ctx.get('workspaceRegistry')
  const controller = ctx.get('workspaceController')
  const persistence = ctx.get('sessionPersistence')
  const sessions = ctx.get('sessions')
  const results = []
  for (const id of ids) {
    if (action === 'archive') {
      if (registry?.archiveSession) await registry.archiveSession(id, { stopActivity: true })
      else if (controller?.archiveSession) await controller.archiveSession({ sessionId: id, stopActivity: true })
      else throw new Error('当前 DSH 不支持归档会话')
      results.push({ id, archived: true })
    } else if (action === 'unarchive') {
      if (registry?.unarchiveSession) await registry.unarchiveSession(id)
      else if (controller?.unarchiveSession) await controller.unarchiveSession({ sessionId: id })
      else throw new Error('当前 DSH 不支持取消归档')
      results.push({ id, archived: false })
    } else if (action === 'pin') {
      if (registry?.pinSession) await registry.pinSession(id)
      else if (controller?.pinSession) await controller.pinSession({ sessionId: id })
      else throw new Error('当前 DSH 不支持置顶会话')
      results.push({ id, pinned: true })
    } else if (action === 'unpin') {
      if (registry?.unpinSession) await registry.unpinSession(id)
      else if (controller?.unpinSession) await controller.unpinSession({ sessionId: id })
      else throw new Error('当前 DSH 不支持取消置顶')
      results.push({ id, pinned: false })
    } else if (action === 'reveal') {
      if (!registry?.create) throw new Error('当前 DSH 不支持创建 Workspace')
      let snapshot = null
      try { snapshot = await persistence?.stat?.(id) } catch { snapshot = null }
      const header = snapshot?.header ?? sessions?.get?.(id)?.header
      if (!header?.cwd) throw new Error('这个会话没有可用的工作目录，无法放进 Workspace')
      const title = String(body.title ?? '').trim() || `DevHub · ${repoName(header.cwd)}`
      const workspace = await registry.create(header.cwd, title)
      await workspace.attachSession?.(id)
      // 「放入 Workspace」的目标是让它在 DSH 侧可见；已归档的先取消归档
      try { await registry.unarchiveSession?.(id) } catch { /* 已是可见状态 */ }
      results.push({ id, workspace: { id: workspace.id, title: workspace.title, path: workspace.path } })
    } else {
      throw new Error(`未知会话动作：${action || '(空)'}`)
    }
  }
  return { action, results }
}

async function stateFor(repo, profile, ctx) {
  const localLedger = Boolean(repo) && isWorkspaceLocalRoot(repo)
  const loaded = repo ? await loadProject(repo) : null
  let items = loaded ? await listItems(repo) : []
  const entry = repo ? ledgerEntry(profile, repo) : null
  const conventions = loaded ? await loadConventions(repo) : null
  // 旧仓库台账迁移只在单库台账上做；本机虚拟库台账没有“本机字段写进仓库”的问题
  if (repo && !localLedger) items = await localItems(profile, repo)
  // 测试通过后又有代码/诉求变化 → 标记重新开发（阶段回到 develop）
  if (repo) items = await applyReworkFacts(ctx, profile, repo, items)
  // 审核会话异常结束/超时：轮询 state 时也逐位核对，避免评审永远停在「待返回」
  if (repo) {
    const reconciled = []
    for (const item of items) reconciled.push(await reconcileStaleReview(ctx, repo, item))
    items = reconciled
  }
  let active = activeWorkspace(profile)
  if (!active && localLedger) {
    const matched = listWorkspaces(profile).find((entry) => {
      try { return resolve(workspaceLocalDir(entry)) === resolve(repo) } catch { return false }
    })
    if (matched) active = { workspace: matched, repos: matched.repos, localRoot: repo, localPath: repo }
  }
  const workspace = localLedger && active
    ? await workspaceState(profile, { ...active, members: workspaceMembers(active.repos) })
    : null
  // 启动/切库后后台预热：索引建好后，第一次描述扫描直接用候选，不再全仓 walk+read
  if (repo) warmRepoIndex(repo)
  for (const member of (active?.repos ?? []).slice(0, 4)) warmRepoIndex(member)
  const views = itemViews(ctx, items)
  const memberName = localLedger
    ? (workspaceMember(profile, active?.workspace) ?? entry?.member ?? null)
    : (entry?.member ?? null)
  return {
    ok: true,
    needsSetup: !loaded || !memberName,
    suggestedRepoPath: repo ?? null,
    // 单库：真实代码库；虚拟库：{ path: 本机台账目录, kind: 'virtual-workspace' }
    repo: loaded
      ? {
          path: repo,
          name: localLedger ? (active?.workspace.name ?? loaded.project.name) : (loaded.project.name || repoName(repo)),
          kind: localLedger ? 'virtual-workspace' : 'repo',
        }
      : null,
    workspace,
    workspaces: await Promise.all(listWorkspaces(profile).map(async (entryWorkspace) => ({
      ...entryWorkspace,
      path: workspaceLocalDir(entryWorkspace),
      localPath: workspaceLocalDir(entryWorkspace),
      members: await workspaceMemberRows(profile, entryWorkspace.repos ?? []),
    }))),
    project: loaded?.project ?? null,
    // 本机命令（只存在 ~/.dsh/dev-hub/profile.json）：按当前目标保存，不随项目提交
    localCommands: localLedger ? (active?.workspace.localCommands ?? {}) : (entry?.localCommands ?? {}),
    git: repo && !localLedger
      ? {
          isRepo: await isGitRepo(repo),
          ...(await (async () => {
            const branch = await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])
            const head = await git(repo, ['rev-parse', '--short', 'HEAD'])
            return { branch: branch.ok ? branch.stdout.trim() : null, head: head.ok ? head.stdout.trim() : null }
          })()),
        }
      : null,
    firstRun: Boolean(loaded) && !conventions,
    conventions: summarizeConventions(conventions),
    parallel: parallelOverview(items),
    profile: {
      member: memberName,
      activeRepo: profile.activeRepo ?? null,
      // 本机虚拟库不是代码库：不混进代码库列表/卡片
      repos: Object.keys(profile.repos ?? {}).filter((path) => !isWorkspaceLocalRoot(path)),
      // 代码库卡片：带上"路径是否还在"，失效的卡片在界面上要能看出来并移除
      repoCards: await Promise.all(Object.keys(profile.repos ?? {}).filter((path) => !isWorkspaceLocalRoot(path)).map(async (path) => {
        const existsNow = await exists(path)
        let loadedRepo = null
        if (existsNow) {
          try { loadedRepo = await loadProject(path) } catch { loadedRepo = null }
        }
        const gitRepo = existsNow ? await isGitRepo(path) : false
        const branch = gitRepo ? (await git(path, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim() || null : null
        const head = gitRepo ? (await git(path, ['rev-parse', '--short', 'HEAD'])).stdout.trim() || null : null
        return {
          path,
          name: loadedRepo?.project?.name || repoName(path),
          exists: existsNow,
          initialized: Boolean(loadedRepo),
          isRepo: gitRepo,
          branch,
          head,
          member: profileForRepo(profile, path)?.member ?? null,
          // 一张卡可能同时属于多个虚拟库；卡片 footer 用来解释"这个库还参与了什么"
          workspaces: listWorkspaces(profile)
            .filter((entryWorkspace) => (entryWorkspace.repos ?? []).includes(path))
            .map((entryWorkspace) => entryWorkspace.name),
        }
      })),
    },
    env: localLedger ? (active?.workspace.environment ?? null) : (entry?.environment ?? null),
    items: views.items,
    // 角标/抽屉用：需要你处理的流程数（与 items 同一份推导，不再重复算）
    attentionCount: views.attentionCount,
    sessionStates: views.sessionStates,
    activeTarget: workspace ? `workspace:${workspace.id}` : (repo ?? null),
  }
}

/**
 * 全目标流程概览：把本机所有代码库/虚拟库里的流程汇到一处，供「进行中」抽屉跨目标切换。
 *
 * 归属规则：
 * - 流程有本机虚拟库绑定（item.workspace）→ 归到 `workspace:<id>`；
 * - 否则归到它所在的代码库 `repo:<path>`。
 * 同一个虚拟库的流程只落虚拟库自己的台账，这里仍按绑定归类，不会在成员库下面重复出现。
 * 只读；running/attention 用与 /state 相同的 itemViews 推导。
 */
async function overviewFor(profile, ctx) {
  const activeRaw = String(profile.activeRepo ?? '')
  const groups = new Map()
  const entries = []
  for (const repoPath of Object.keys(profile.repos ?? {})) {
    if (!(await exists(repoPath))) continue
    const loaded = await loadProject(repoPath)
    if (!loaded) continue
    // 与 /state 一样先做旧台账迁移 + 本机虚拟库补全，保证归属判定一致
    const items = await localItems(profile, repoPath)
    if (!items.length) continue
    const repoLabel = loaded.project?.name || repoName(repoPath)
    for (const item of items) {
      const workspace = item.workspace?.id ? findWorkspace(profile, item.workspace.id) : null
      const key = workspace ? `workspace:${workspace.id}` : `repo:${repoPath}`
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          kind: workspace ? 'workspace' : 'repo',
          name: workspace?.name ?? repoLabel,
          path: repoPath,
          workspaceId: workspace?.id ?? null,
          member: profileForRepo(profile, repoPath)?.member ?? null,
          current: activeRaw === (workspace ? `workspace:${workspace.id}` : repoPath),
          inProgress: 0,
          done: 0,
          running: 0,
          attention: 0,
        })
      }
      entries.push({ item, group: groups.get(key) })
    }
  }

  // 虚拟库的流程在本机独立目录里（不属于任何成员库），单独按 workspace 分组
  for (const workspace of listWorkspaces(profile)) {
    const localRoot = workspaceLocalDir(workspace)
    await ensureWorkspaceLocalDir(workspace)
    const loaded = await loadProject(localRoot)
    if (!loaded) continue
    const items = await listItems(localRoot)
    if (!items.length) continue
    const key = `workspace:${workspace.id}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        kind: 'workspace',
        name: workspace.name,
        path: localRoot,
        workspaceId: workspace.id,
        member: workspace.member ?? null,
        current: activeRaw === key,
        inProgress: 0,
        done: 0,
        running: 0,
        attention: 0,
      })
    }
    for (const item of items) entries.push({ item, group: groups.get(key) })
  }

  // 会话状态按 sessionId 对齐：跨仓库的 item.id 可能重名，不能按 itemId 建 Map
  const liveBySession = new Map(
    sessionStates(ctx, entries.map((entry) => entry.item)).sessions.map((row) => [row.sessionId, row]),
  )
  const statusOrder = { blocked: 0, verifying: 1, developing: 2, designing: 3, planned: 4, done: 9 }
  const items = entries.map((entry) => {
    const group = entry.group
    const item = entry.item
    const running = item.session?.id ? liveBySession.get(item.session.id)?.running === true : false
    const attention = attentionOf(ctx, item, running)
    if (item.status === 'done') group.done += 1
    else group.inProgress += 1
    if (running) group.running += 1
    if (attention) group.attention += 1
    return {
      ...summarizeItem(item),
      running,
      attention,
      repoPath: group.path,
      target: {
        key: group.key,
        kind: group.kind,
        name: group.name,
        path: group.path,
        workspaceId: group.workspaceId,
        member: group.member,
        current: group.current,
      },
    }
  })
  // 需要处理的排前面，再按「在跑」和阶段排；抽屉里不需要用户再自己找
  items.sort((a, b) => {
    if (Boolean(a.attention) !== Boolean(b.attention)) return a.attention ? -1 : 1
    if (Boolean(a.running) !== Boolean(b.running)) return a.running ? -1 : 1
    const byStatus = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
    if (byStatus) return byStatus
    return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))
  })
  const groupRows = [...groups.values()].sort((a, b) => {
    // 当前目标置顶；其余按进行中数量、名称排
    if (a.current !== b.current) return a.current ? -1 : 1
    if (a.inProgress !== b.inProgress) return b.inProgress - a.inProgress
    return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN')
  })
  return {
    ok: true,
    activeTarget: activeRaw || null,
    targetCount: groupRows.length,
    inProgressCount: items.filter((item) => item.status !== 'done').length,
    attentionCount: items.filter((item) => Boolean(item.attention)).length,
    runningCount: items.filter((item) => item.running).length,
    doneCount: items.filter((item) => item.status === 'done').length,
    groups: groupRows,
    items,
  }
}

async function repoForExec(exec) {
  const profile = await loadProfile()
  const current = await activeRepo(profile)
  if (current) return current
  const cwd = exec?.agent?.session?.header?.cwd
  if (cwd) return await findRepoRoot(cwd) ?? await canonical(cwd)
  throw new Error('DevHub 尚未初始化：请先在设置页选择代码库')
}

/**
 * 需求扫描：优先用本机仓库索引筛候选文件，只读候选拿命中行；索引不可用/无命中时回退全量扫描。
 * 索引首次构建会读一遍仓库，之后 TTL 内只做 stat 增量 + 少量候选读取。
 */
async function reconWithIndex(repo, description, options = {}) {
  try {
    const index = await ensureRepoIndex(repo, { indexDir: INDEX_DIR })
    const candidates = queryRepoIndex(index, description, { limit: Math.max(80, Number(options.limit) || 12) })
    if (candidates.length) {
      const lexical = await reconRepo(repo, description, {
        ...options,
        fileList: candidates.map((entry) => join(repo, entry.path)),
        scannedTotal: index.files.length,
      })
      if (lexical.files?.length) return lexical
    }
  } catch {
    // 索引构建/读取失败不能让扫描失败：回退到原来的全量关键词扫描
  }
  return reconRepo(repo, description, options)
}

function textResult(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
}

function toolOutput(properties = {}) {
  return {
    schema: {
      type: 'object',
      additionalProperties: true,
      properties,
    },
    render: (_args, value) => textResult(value),
  }
}

function registerTools(ctx) {
  const tools = ctx.get('tools')
  if (!tools) return
  ctx.effect(() => {
    tools.register(defineTool({
      name: 'devhub_list',
      description: '列出当前代码库中的开发项、状态和任务进度。',
      parameters: {},
      output: toolOutput({ items: { type: 'array', items: { type: 'object', additionalProperties: true } } }),
      async execute() {
        const repo = await repoForExec()
        const profile = await loadProfile()
        const active = activeWorkspace(profile)
        const items = await localItems(profile, repo)
        return {
          repo: ledgerName(profile, repo),
          ...(active ? {
            workspace: {
              id: active.workspace.id,
              name: active.workspace.name,
              repos: active.repos,
              localPath: active.localRoot,
            },
          } : {}),
          items: items.map(summarizeItem),
        }
      },
    }))

    tools.register(defineTool({
      name: 'devhub_get',
      description: '读取一个开发项的完整内容（目标、任务、验收、变更点）。',
      parameters: { id: { type: 'string', required: true, description: '开发项 id' } },
      output: toolOutput({ item: { type: 'object', additionalProperties: true } }),
      async execute(args) {
        const repo = await repoForExec()
        const profile = await loadProfile()
        const item = await readItemLocal(profile, repo, args.id)
        if (!item) throw new Error(`开发项不存在：${args.id}`)
        return { item }
      },
    }))

    tools.register(defineTool({
      name: 'devhub_context',
      description: '生成开发项的 Context Pack，用于开始开发或交接。',
      parameters: { id: { type: 'string', required: true, description: '开发项 id' } },
      output: toolOutput({ prompt: { type: 'string' }, contextHash: { type: 'string' } }),
      async execute(args) {
        const repo = await repoForExec()
        const profile = await loadProfile()
        const item = await readItemLocal(profile, repo, args.id)
        if (!item) throw new Error(`开发项不存在：${args.id}`)
        const built = await buildFor(repo, item, profile)
        return { prompt: built.context.prompt, contextHash: built.context.contextHash }
      },
    }))

    tools.register(defineTool({
      name: 'devhub_update',
      description: '更新开发项任务/风险/变更点/计划/根因。阶段与状态由事实自动推导（开发完成→独立评审，评审通过→测试验证，本机自测/环境测试通过→待提交，提交后→完成），只有 blocked 可人工标记。只写台账：单代码库写 .dev-hub，虚拟库写本机 ~/.dev-hub/workspaces/<id>/。流程还没有绑定会话时，会自动绑定调用它的开发会话。独立评审由「继续推进」自动开始（devhub_review 的 dispatch 复用同一 runReviewRound）。',
      parameters: {
        id: { type: 'string', required: true, description: '开发项 id' },
        status: { type: 'string', enum: STATUS_ORDER, description: '新状态' },
        stage: { type: 'string', enum: ['discovery', 'techdoc', 'plan', 'develop', 'review', 'verify', 'submit', 'done'], description: '工作流阶段（由事实自动推导，手工传入会被覆盖）' },
        rootProblem: { type: 'string', description: '根因/根本问题' },
        planSummary: { type: 'string', description: '开发计划摘要' },
        estimateSize: { type: 'string', enum: ['S', 'M', 'L', 'XL'], description: '工程量规模' },
        estimateDays: { type: 'number', description: '工程量人日' },
        taskText: { type: 'string', description: '要更新/追加的任务文本' },
        taskDone: { type: 'boolean', description: '任务是否完成' },
        changePoint: { type: 'string', description: '新增一个语义变更点' },
        risk: { type: 'string', description: '新增一个风险/阻塞' },
      },
      output: toolOutput({ item: { type: 'object', additionalProperties: true } }),
      async execute(args, exec) {
        const repo = await repoForExec(exec)
        const profile = await loadProfile()
        const item = await readItemLocal(profile, repo, args.id)
        if (!item) throw new Error(`开发项不存在：${args.id}`)
        // 谁更新流程，就把流程绑定到那个开发会话：否则会出现"台账已有进展、头部还显示开启开发会话"的错位
        const sessionId = String(exec?.agent?.session?.header?.id ?? '').trim()
        if (sessionId && !item.session?.id) {
          const at = new Date().toISOString()
          item.session = { id: sessionId, boundAt: at, updatedAt: at }
          appendHistory(item, 'session', `自动绑定更新流程的开发会话：${sessionId}`)
        }
        if (args.status && STATUS_ORDER.includes(args.status)) item.status = args.status
        if (args.stage) item.workflow.stage = args.stage
        if (args.rootProblem) item.workflow.rootProblem = args.rootProblem
        if (args.planSummary) item.workflow.plan.summary = args.planSummary
        if (args.estimateSize) item.workflow.plan.estimate.size = args.estimateSize
        if (typeof args.estimateDays === 'number') item.workflow.plan.estimate.days = args.estimateDays
        if (args.taskText) {
          const existing = item.tasks.find((task) => task.text === args.taskText)
          if (existing) existing.done = Boolean(args.taskDone)
          else item.tasks.push({ text: args.taskText, done: Boolean(args.taskDone) })
        }
        if (args.changePoint) item.changePoints.push({ type: 'manual', summary: args.changePoint })
        if (args.risk) item.risks.push(args.risk)
        const saved = await saveItem(repo, appendHistory(item, 'update', 'Agent 更新开发项'))
        return { item: saved }
      },
    }))

    tools.register(defineTool({
      name: 'devhub_review',
      description: '独立评审：派发 1~3 位 dsh 审核员会话复核本流程的改动与证据（只读），全部通过才允许进入测试验证；不通过退回开发并附纠偏意见，异常/未返回显式标记待处理。正常入口是「继续推进」自动开始评审；dispatch 用于重试/显式派发，已有 pending 评审时幂等不重复派发；action=status 只读当前结论。',
      parameters: {
        id: { type: 'string', required: true, description: '开发项 id' },
        action: { type: 'string', enum: ['status', 'dispatch', 'rework', 'record', 'override', 'reset'], description: '默认 status；dispatch 开始/重试一轮审核员评审；rework 记录纠偏意见已发回开发；record 记录单个审核员人工结论；override 确认忽略本轮拒绝；reset 清空本轮' },
        count: { type: 'number', description: 'dispatch 时派几位审核员（1~3，默认 2）' },
        reviewerId: { type: 'string', description: 'record 时的审核员 id，例如 reviewer-1' },
        verdict: { type: 'string', enum: ['pass', 'fail'], description: 'record 时的人工结论' },
        summary: { type: 'string', description: 'record 时的结论摘要' },
        findings: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'record 时的问题清单 [{severity,summary,detail,file}]' },
        direction: { type: 'string', description: 'record 时的方向建议' },
      },
      output: toolOutput({ review: { type: 'object', additionalProperties: true }, item: { type: 'object', additionalProperties: true } }),
      async execute(args, exec) {
        const repo = await repoForExec(exec)
        const profile = await loadProfile()
        const item = await readItemLocal(profile, repo, args.id)
        if (!item) throw new Error(`开发项不存在：${args.id}`)
        const action = String(args.action ?? 'status')
        let saved = item
        if (action === 'dispatch') {
          if (item.status === 'done') throw new Error('流程已完成：不需要再评审')
          saved = await runReviewRound({ ctx, repo, item, profile, count: args.count })
        } else if (action === 'rework') {
          const view = describeReview(item)
          if (view.status !== 'failed' && view.status !== 'error') throw new Error('当前评审不需要返工')
          item.workflow.review = { ...item.workflow.review, reworkAt: new Date().toISOString() }
          saved = await saveItem(repo, appendHistory(item, 'review', '评审纠偏意见已发回开发会话返工；本轮不再允许人工通过'))
        } else if (action === 'record') {
          recordReviewOutcome(item, args)
          saved = await saveItem(repo, appendHistory(item, 'review', `人工记录审核结论：${args.reviewerId} → ${args.verdict}`))
        } else if (action === 'override') {
          overrideReviewRejections(item, args)
          saved = await saveItem(repo, appendHistory(item, 'review', '人工确认忽略本轮评审拒绝（原意见保留）'))
        } else if (action === 'reset') {
          resetReviewRound(item)
          saved = await saveItem(repo, appendHistory(item, 'review', '清空本轮独立评审（历史轮次保留）'))
        } else if (action !== 'status') {
          throw new Error(`未知评审动作：${action}`)
        }
        return { review: describeReview(saved), item: saved }
      },
    }))

    tools.register(defineTool({
      name: 'devhub_memory',
      description: '本机项目记忆：write / search / list / forget。记录跨流程可复用的决策、约定与踩坑，只写本机 profile，不写仓库台账、不提交。开工前可先 search 一下。',
      parameters: {
        action: { type: 'string', enum: ['write', 'search', 'list', 'forget'], description: '默认 list' },
        text: { type: 'string', description: 'write 时的记忆正文（一句到几句）' },
        kind: { type: 'string', enum: ['decision', 'convention', 'pitfall', 'fact', 'note'], description: '默认 note' },
        tags: { type: 'array', items: { type: 'string' }, description: '检索标签（模块/文件名/主题）' },
        pinned: { type: 'boolean', description: '置顶：每次 Context Pack 都会带上' },
        query: { type: 'string', description: 'search 的关键词或问题' },
        id: { type: 'string', description: 'forget 的记忆 id' },
        limit: { type: 'number', description: '最多返回条数（1~50，默认 8）' },
      },
      output: toolOutput({
        ok: { type: 'boolean' },
        entry: { type: 'object', additionalProperties: true },
        entries: { type: 'array', items: { type: 'object', additionalProperties: true } },
        removed: { type: 'number' },
        duplicate: { type: 'boolean' },
      }),
      async execute(args, exec) {
        const repo = await repoForExec(exec)
        const profile = await loadProfile()
        const action = String(args.action ?? 'list')
        const limit = Number.isFinite(Number(args.limit)) ? Math.max(1, Math.min(50, Number(args.limit))) : 8
        let entries = await loadRepoMemory(MEMORY_DIR, repo)
        if (action === 'write') {
          const text = String(args.text ?? '').trim()
          if (!text) throw new Error('缺少记忆正文 text')
          const result = appendRepoMemory(entries, {
            text,
            kind: args.kind,
            tags: args.tags,
            pinned: Boolean(args.pinned),
            by: profileForRepo(profile, repo)?.member ?? '',
          })
          await saveRepoMemory(MEMORY_DIR, repo, result.entries)
          return { ok: true, entry: result.entry, duplicate: result.duplicate }
        }
        if (action === 'search') {
          return { ok: true, entries: searchRepoMemory(entries, String(args.query ?? ''), { limit }) }
        }
        if (action === 'forget') {
          const id = String(args.id ?? '').trim()
          if (!id) throw new Error('缺少记忆 id')
          const result = forgetRepoMemory(entries, id)
          await saveRepoMemory(MEMORY_DIR, repo, result.entries)
          return { ok: true, removed: result.removed }
        }
        if (action === 'list') {
          return { ok: true, entries: searchRepoMemory(entries, '', { limit }) }
        }
        throw new Error(`未知记忆动作：${action}`)
      },
    }))

    tools.register(defineTool({
      name: 'devhub_parallel',
      description: '读取当前代码库的并行开发状态：进行中的流程、两两 scope 重叠与建议。',
      parameters: {},
      output: toolOutput({
        active: { type: 'array', items: { type: 'object', additionalProperties: true } },
        pairs: { type: 'array', items: { type: 'object', additionalProperties: true } },
        canParallel: { type: 'boolean' },
        advice: { type: 'string' },
      }),
      async execute() {
        const repo = await repoForExec()
        const profile = await loadProfile()
        const active = activeWorkspace(profile)
        const items = await localItems(profile, repo)
        return {
          repo: ledgerName(profile, repo),
          ...(active ? { workspace: { id: active.workspace.id, name: active.workspace.name, repos: active.repos, localPath: active.localRoot } } : {}),
          ...parallelOverview(items),
        }
      },
    }))

    tools.register(defineTool({
      name: 'devhub_conventions',
      description: '读取当前开发目标的规范约束（单库 .dev-hub/conventions.json；虚拟库 ~/.dev-hub/workspaces/<id>/conventions.json）；action=bootstrap 时按默认规范首次生成。',
      parameters: {
        action: { type: 'string', enum: ['read', 'bootstrap'], description: 'read（默认）或 bootstrap' },
      },
      output: toolOutput({
        firstRun: { type: 'boolean' },
        conventions: { type: 'object', additionalProperties: true },
        summary: { type: 'object', additionalProperties: true },
      }),
      async execute(args) {
        const repo = await repoForExec()
        if (args.action === 'bootstrap') {
          const profile = await loadProfile()
          const loaded = await loadProject(repo)
          const repoProfile = await ledgerRepoProfile(profile, repo)
          const saved = await saveConventions(repo, buildDefaultConventions({
            repo,
            name: loaded?.project?.name ?? repoName(repo),
            profile: repoProfile,
            context: loaded?.project?.context,
          }))
          return { firstRun: false, conventions: saved, summary: summarizeConventions(saved) }
        }
        const conventions = await loadConventions(repo)
        return { firstRun: !conventions, conventions, summary: summarizeConventions(conventions) }
      },
    }))

    tools.register(defineTool({
      name: 'devhub_skills',
      description: '查看/调整当前开发目标的通用 skills（规范包）：列出内置技能与已安装项，或安装/卸载某个技能，或增删自定义约束。只写规范文件（单库 .dev-hub/conventions.json；虚拟库本机目录）。',
      parameters: {
        action: { type: 'string', enum: ['list', 'install', 'uninstall', 'addConstraint', 'removeConstraint'], description: '默认 list' },
        skillId: { type: 'string', description: '安装/卸载的技能 id' },
        constraint: { type: 'object', additionalProperties: true, description: 'addConstraint 时的约束：{id,title,rule,check:{kind,value},doc,gate}' },
        id: { type: 'string', description: 'removeConstraint 时的自定义约束 id' },
      },
      output: toolOutput({ skills: { type: 'object', additionalProperties: true } }),
      async execute(args) {
        const repo = await repoForExec()
        const profile = await loadProfile()
        const repoProfile = await ledgerRepoProfile(profile, repo)
        const loaded = await loadProject(repo)
        let conventions = await loadConventions(repo)
        if (!conventions) {
          conventions = await saveConventions(repo, buildDefaultConventions({
            repo,
            name: loaded?.project?.name ?? repoName(repo),
            profile: repoProfile,
            context: loaded?.project?.context,
          }))
        }
        const action = String(args.action ?? 'list')
        if (action === 'install') {
          conventions = await saveConventions(repo, installSkill(conventions, String(args.skillId ?? '')).conventions)
        } else if (action === 'uninstall') {
          conventions = await saveConventions(repo, uninstallSkill(conventions, String(args.skillId ?? '')).conventions)
        } else if (action === 'addConstraint') {
          conventions = await saveConventions(repo, addCustomConstraint(conventions, args.constraint ?? {}).conventions)
        } else if (action === 'removeConstraint') {
          conventions = await saveConventions(repo, removeConstraint(conventions, String(args.id ?? '')).conventions)
        } else if (action !== 'list') {
          throw new Error(`未知技能动作：${action}`)
        }
        const installed = new Set((conventions.installedSkills ?? []).map((entry) => entry.id))
        return {
          skills: {
            installed: (conventions.installedSkills ?? []).map((entry) => entry.id),
            frontend: Boolean(repoProfile.frontend),
            frameworks: repoProfile.frameworks ?? [],
            catalog: catalogFor(repoProfile.language).map((pack) => ({
              id: pack.id,
              name: pack.name,
              level: pack.level,
              autoInstall: pack.autoInstall ?? [],
              installed: installed.has(pack.id),
            })),
            constraints: (conventions.constraints ?? []).map((entry) => ({ id: entry.id, skill: entry.skill, title: entry.title })),
          },
        }
      },
    }))

    tools.register(defineTool({
      name: 'devhub_env',
      description: '读取当前开发者的本机环境、JDK 和工具能力。',
      parameters: {},
      output: toolOutput({ environment: { type: 'object', additionalProperties: true } }),
      async execute() {
        const repo = await repoForExec()
        const profile = await loadProfile()
        const entry = ledgerEntry(profile, repo)
        const env = entry?.environment ?? await detectAndSave(repo)
        return { environment: env }
      },
    }))
    return () => {}
  }, 'dev-hub: tools')
}

function registerSystemPrompt(ctx) {
  const systemPrompt = ctx.get('systemPrompt')
  if (!systemPrompt) return
  ctx.effect(() => systemPrompt.section({
    name: 'plugin:dev-hub',
    order: 210,
    text: 'DEVHUB: 本机已安装 dsh-dev-hub。开发前可用 devhub_list / devhub_get 读取开发项，'
      + '用 devhub_context 生成上下文包；开发中可用 devhub_parallel 判断多个流程能否并行，'
      + 'devhub_conventions 读取仓库规范约束；开发后用 devhub_update 更新任务/状态/变更点；'
      + '开发任务完成后点「继续推进」即自动开始独立评审（核心走 devhub_review 的 dispatch/runReviewRound，pending 时不重复派发）；评审通过才进入测试验证，本机/环境测试由工作站执行。'
      + 'EVIDENCE 必须区分仓库事实与本机差异；不要编造 baseline diff。',
  }), 'dev-hub: system prompt')
}

/**
 * 流程变更文件证据：/files 与 /report 共用同一份口径。
 * 返回与 GET /api/dev-hub/files 相同的结构（单库或虚拟库逐成员聚合）。
 */
async function collectItemFiles({ repo, item, profile }) {
  const target = workspaceTarget(profile, item, repo)
  if (!target) {
    const workRoot = await workRootOf(repo, item)
    if (!(await isGitRepo(workRoot))) {
      return {
        ok: true, evidenceComplete: false, reason: '不是 git 仓库：无法统计 git 变更',
        files: [], totals: { files: 0, added: 0, removed: 0, binary: 0 }, excludedCount: 0,
      }
    }
    const summary = await flowFileChanges(workRoot, item.baseline ?? null)
    const scope = item.scope ?? []
    const inScope = (path) => scope.length === 0 || scope.some((entry) => path === entry || path.startsWith(entry.replace(/\/$/, '') + '/'))
    return {
      ...summary,
      workRoot,
      ...(worktreeFor(repo, item) ? { worktree: worktreeFor(repo, item) } : {}),
      files: summary.files.map((file) => {
        const annotated = { ...file, key: file.path, displayPath: file.path, inScope: inScope(file.path) }
        const { note, source } = fileNoteOf(annotated, item)
        return { ...annotated, note, noteSource: source }
      }),
    }
  }
  // 虚拟库：逐成员库统计，文件带 repo/repoName/key，diff 时按成员库读取
  const scope = item.scope ?? []
  const files = []
  const repos = []
  let excludedCount = 0
  let evidenceComplete = true
  let reason = null
  for (const [index, member] of target.members.entries()) {
    const root = member.workRoot ?? member.path
    if (!(await exists(root))) {
      evidenceComplete = false
      reason ??= `${member.name}：成员库工作区不存在（${root}）`
      repos.push({ path: member.path, workRoot: root, name: member.name, exists: false, evidenceComplete: false, reason: '路径不存在', changedFiles: 0 })
      continue
    }
    if (!(await isGitRepo(root))) {
      repos.push({ path: member.path, workRoot: root, name: member.name, exists: true, isRepo: false, evidenceComplete: false, reason: '不是 git 仓库', changedFiles: 0 })
      continue
    }
    const base = baselineForMember(target.baseline ?? item.baseline, member)
    const summary = await flowFileChanges(root, base ?? null)
    excludedCount += summary.excludedCount ?? 0
    if (summary.evidenceComplete === false) {
      evidenceComplete = false
      reason ??= `${member.name}：${summary.reason ?? '证据不完整'}`
    }
    const changed = []
    for (const file of summary.files ?? []) {
      const key = `${member.name}/${file.path}`
      const annotated = {
        ...file,
        key,
        displayPath: key,
        repo: root,
        workRoot: root,
        repoName: member.name,
        inScope: scopeMatchesFile(scope, { ...file, repoName: member.name }, target.members),
      }
      const { note, source } = fileNoteOf(annotated, item)
      const row = { ...annotated, note, noteSource: source }
      changed.push(row)
      files.push(row)
    }
    repos.push({
      path: member.path,
      workRoot: root,
      name: member.name,
      exists: true,
      isRepo: true,
      branch: (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim() || null,
      head: (await git(root, ['rev-parse', '--short', 'HEAD'])).stdout.trim() || null,
      baseCommit: base?.commit ?? null,
      evidenceComplete: summary.evidenceComplete !== false,
      reason: summary.reason ?? null,
      changedFiles: changed.length,
    })
  }
  const result = {
    ok: true,
    evidenceComplete,
    reason,
    workspace: {
      id: target.workspace.id,
      name: target.workspace.name,
      path: target.localRoot,
      localPath: target.localRoot,
      members: target.members.map((member) => member.name),
    },
    repos,
    files,
    totals: {
      files: files.length,
      added: files.reduce((sum, file) => sum + (file.binary ? 0 : file.added ?? 0), 0),
      removed: files.reduce((sum, file) => sum + (file.binary ? 0 : file.removed ?? 0), 0),
      binary: files.filter((file) => file.binary).length,
    },
    excludedCount,
  }
  // 虚拟库：证据快照留档到本机独立目录（成员库 .dev-hub 一个字节都不写）
  await writeWorkspaceEvidence(target.workspace, item.id, {
    members: repos,
    changes: files.map((file) => ({ path: file.key, repo: file.repo, repoName: file.repoName, type: file.status })),
    totals: { files: files.length },
    evidenceComplete,
  })
  return result
}

/** 报告用的 git 事实：单库读 branch/HEAD；虚拟库以成员库证据为准，不伪造某个成员库的 diff。 */
async function gitEvidenceOf(repo, item, profile) {
  const target = workspaceTarget(profile, item, repo)
  if (target) {
    return { isRepo: true, available: true, branch: null, head: null, reason: null }
  }
  const worktree = worktreeFor(repo, item)
  const workRoot = worktree ? await workRootOf(repo, item) : repo
  if (!(await isGitRepo(workRoot))) {
    return { isRepo: false, available: false, branch: null, head: null, reason: '不是 git 仓库' }
  }
  const info = await gitInfo(workRoot)
  return {
    isRepo: true,
    available: info.available,
    branch: info.branch,
    head: info.head,
    reason: null,
    workRoot,
    ...(worktree ? { worktree } : {}),
  }
}

/* --------------------------------------------------------- 独立评审 */

/**
 * 审核员看到的证据：改动范围 + 自测结果 + 开发报告 + 规范约束。
 * 一次算好，所有审核员共用同一份快照；审核员自己再读代码核对，Host 不替它推理。
 */
async function reviewEvidenceOf({ repo, item, profile }) {
  const files = await collectItemFiles({ repo, item, profile })
  const git = await gitEvidenceOf(repo, item, profile)
  const target = workspaceTarget(profile, item, repo)
  const workspace = target
    ? {
        name: target.workspace.name,
        members: target.members.map((member) => ({ name: member.name, path: member.workRoot ?? member.path })),
      }
    : null
  const report = buildReport({ item, files, git, workspace })
  const conventions = await loadConventions(repo)
  const constraints = (conventions?.constraints ?? [])
    .map((entry) => `[${entry.id}] ${entry.title}：${entry.rule}`)
    .filter(Boolean)
  const cwd = target ? target.localRoot : await workRootOf(repo, item)
  return {
    files,
    git,
    workspace,
    report,
    constraints,
    cwd,
    repoName: target ? target.workspace.name : ledgerName(profile, repo),
    basis: {
      files: files?.totals?.files ?? 0,
      added: files?.totals?.added ?? 0,
      removed: files?.totals?.removed ?? 0,
      head: git?.head ?? '',
      localTest: item.workflow?.tests?.local?.status ?? 'not_run',
      at: new Date().toISOString(),
    },
  }
}

function reviewHistoryMessage(view) {
  if (view.status === 'passed') return `独立评审通过（第 ${view.round} 轮，${view.passed}/${view.total} 位审核员通过），允许进入测试验证`
  if (view.status === 'failed') {
    const first = view.corrections?.[0]
    return `独立评审未通过（第 ${view.round} 轮）：退回开发纠偏${first ? `；${first.reviewerLabel}：${first.summary || first.findings[0] || ''}` : ''}`
  }
  if (view.status === 'error') return `独立评审待处理（第 ${view.round} 轮）：${view.errored + view.pending} 位审核员未返回结论，流程不会进入测试验证`
  return `独立评审进行中（第 ${view.round} 轮）`
}

/**
 * 派发一轮评审：先落盘 pending（异常中断也能看到"待处理"），再并发跑 1~3 个审核员会话，
 * 逐个把结论并入台账。单个审核员失败不会中断其他审核员，但整体状态一定不是通过。
 *
 * 幂等约定：已有 pending 评审时直接返回当前台账，不再起新轮次——「继续推进」连点、
 * 或多开一个页面重复触发，都不会重复消耗审核员。
 */

/**
 * 评审协程不是持久任务：DSH 重启/浏览器断开/子代理异常退出时，台账可能永远停在 pending。
 * 这里逐位核对 pending 审核员：会话死了就标异常，会话活着但超时才标超时；
 * 不会因为“还有一位审核员活着”就把另一位已结束的审核员一直挂在待返回。
 */
async function reconcileStaleReview(ctx, repo, item) {
  const view = describeReview(item)
  if (!['pending', 'error'].includes(view.status)) return item
  const agents = ctx.get('agents')
  const sessions = ctx.get('sessions')
  const failures = staleReviewerFailures(item.workflow?.review, {
    // 新评审有外层 root（parentSessionId），它才是协程句柄；
    // 旧台账只有 child sessionId，用 sessions 兜底避免把还挂着的会话误判成死亡。
    isLive: (reviewer) => reviewer.parentSessionId
      ? Boolean(agents?.get?.(reviewer.parentSessionId))
      : (Boolean(agents?.get?.(reviewer.sessionId)) || Boolean(sessions?.get?.(reviewer.sessionId))),
  })
  if (!failures.length) return item
  for (const failure of failures) {
    item.workflow.review = applyReviewerOutput(item.workflow.review, failure.reviewerId, { error: failure.reason })
  }
  appendHistory(item, 'review', '审核会话异常结束/超时，已标记为待处理；可重试评审')
  return saveItem(repo, item)
}

async function runReviewRound({ ctx, repo, item, profile, count }) {
  item = await reconcileStaleReview(ctx, repo, item)
  const before = describeReview(item)
  // pending 幂等；error 但还有审核员在返回时也不能开新一轮，否则会把活着的审核员结果丢掉
  if (before.status === 'pending' || (before.status === 'error' && before.pending > 0)) return item
  const evidence = await reviewEvidenceOf({ repo, item, profile })
  const started = startReviewRound(item.workflow.review, { count, basis: evidence.basis })
  item.workflow.review = started
  appendHistory(item, 'review', `继续推进：自动开始独立评审（第 ${started.round} 轮 · ${started.reviewers.length} 位审核员：${started.reviewers.map((reviewer) => reviewer.role).join(' / ')}）`)
  let saved = await saveItem(repo, item)

  const outcomes = await Promise.allSettled(started.reviewers.map(async (reviewer, index) => {
    const prompt = reviewerPrompt({
      item: saved,
      reviewer,
      repoName: evidence.repoName,
      repoPath: evidence.cwd,
      files: evidence.files,
      report: evidence.report,
      workspace: evidence.workspace,
      constraints: evidence.constraints,
      total: started.reviewers.length,
    })
    const runOnce = (attempt = 1) => runAgentJson(ctx, {
      cwd: evidence.cwd,
      prompt,
      schema: REVIEW_SCHEMA,
      label: `devhub-${reviewer.id}${attempt > 1 ? '-retry' : ''}`,
      // 大改动的审核员要读多个文件/调用方；150s 很容易在读完前被 abort。
      // 允许用环境变量覆盖，默认给 5 分钟。
      timeoutMs: Number(process.env.DEVHUB_REVIEW_TIMEOUT_MS) || 300000,
      onStarted: async ({ sessionId, parentSessionId }) => {
        // 先落 sessionId/parentSessionId：UI 立刻能看到“审核会话已启动”，
        // 失联时也能用 parentSessionId 判断协程是不是真的还在。
        // 写回前确认还是本轮：超时重试/重置后，旧协程的启动回调不能覆盖新轮次。
        const latest = await readItemLocal(profile, repo, item.id)
        if (!latest || latest.workflow?.review?.dispatchedAt !== started.dispatchedAt) return
        const current = latest.workflow?.review
        if (!current || !Array.isArray(current.reviewers)) return
        latest.workflow.review = {
          ...current,
          reviewers: current.reviewers.map((entry, position) => (position === index
            ? { ...entry, sessionId, parentSessionId, dispatchedAt: new Date().toISOString() }
            : entry)),
        }
        saved = latest
        await saveItem(repo, saved)
      },
    })
    let result
    try {
      result = await runOnce()
    } catch (error) {
      // subagent 偶尔会在启动/收尾阶段被 abort；同一轮自动重试一次，
      // 避免整轮评审直接变成“审核员异常”，让用户只能手工重试。
      if (!/aborted|未正常完成|超时|中断|不是可解析的 JSON|没有输出|没有可用输出|无输出|空输出|会话.*异常结束/i.test(String(error?.message ?? error))) throw error
      await new Promise((resolve) => setTimeout(resolve, 800))
      try {
        result = await runOnce(2)
      } catch (retryError) {
        throw new Error(`${String(error?.message ?? error)}；自动重试仍失败：${String(retryError?.message ?? retryError)}`)
      }
    }
    const normalized = normalizeReviewerVerdict(result.value)
    if (!normalized.verdict) {
      return {
        error: `审核员未返回明确结论${normalized.summary ? `：${normalized.summary}` : ''}`,
        summary: normalized.summary,
        sessionId: result.sessionId,
        provider: result.provider,
        elapsedMs: result.elapsedMs,
      }
    }
    return {
      ...normalized,
      sessionId: result.sessionId,
      provider: result.provider,
      elapsedMs: result.elapsedMs,
    }
  }))

  // 旧协程收尾时可能已经超时重试/重置：只把结果并回“仍属于本轮”的最新台账，
  // 不能拿启动时的 saved 覆盖掉新轮次或用户刚做的修改。
  saved = await readItemLocal(profile, repo, item.id)
  const latestReview = saved?.workflow?.review
  if (!saved || !latestReview
    || latestReview.dispatchedAt !== started.dispatchedAt
    || Number(latestReview.round) !== Number(started.round)) {
    return saved ?? item
  }
  let review = latestReview
  for (const [index, settled] of outcomes.entries()) {
    const reviewer = started.reviewers[index]
    if (settled.status === 'fulfilled') {
      review = applyReviewerOutput(review, reviewer.id, settled.value)
    } else {
      const reason = settled.reason?.message ? String(settled.reason.message) : String(settled.reason ?? '审核员会话异常')
      review = applyReviewerOutput(review, reviewer.id, { error: `审核员会话异常：${reason}` })
    }
  }
  saved.workflow.review = review
  const view = describeReview(saved)
  appendHistory(saved, 'review', reviewHistoryMessage(view))
  return saveItem(repo, saved)
}

/** 人工记录审核结论：只在审核员会话不可用时使用，台账显式标 source=manual。 */
function recordReviewOutcome(item, body = {}) {
  if (!item.workflow?.review?.reviewers?.length) throw new Error('还没有开始评审：先点「继续推进」自动开始评审')
  const reviewerId = String(body.reviewerId ?? '').trim()
  if (!reviewerId) throw new Error('缺少 reviewerId')
  const verdict = body.verdict === 'pass' || body.verdict === 'fail' ? body.verdict : null
  if (!verdict) throw new Error('人工结论必须是 pass 或 fail')
  const existing = (item.workflow.review.reviewers ?? []).find((entry) => entry.id === reviewerId)
  item.workflow.review = applyReviewerOutput(item.workflow.review, reviewerId, {
    verdict,
    summary: String(body.summary ?? '').trim() || '人工记录的审核结论',
    // 人工通过不改写原始证据：没显式传 findings 时保留审核员原来的意见，方便追溯
    findings: Array.isArray(body.findings) ? body.findings : (existing?.findings ?? []),
    direction: String(body.direction ?? existing?.direction ?? '').trim(),
    source: 'manual',
    error: '',
  })
}

/** 人工确认忽略拒绝：把本轮所有 failed/error 审核员标成人工通过；pending 不允许跳过。 */
function overrideReviewRejections(item, body = {}) {
  const view = describeReview(item)
  if (view.status !== 'failed' && view.status !== 'error') throw new Error('当前评审没有可忽略的拒绝')
  if (view.reworkAt && !view.exhausted) throw new Error('纠偏意见已发回开发返工：本轮不再允许人工通过，请完成修改后重新评审')
  if (view.pending > 0) throw new Error('还有审核员未返回结论：先等结论或重置本轮，不能忽略')
  const targets = (view.reviewers ?? []).filter((reviewer) => reviewer.status === 'failed' || reviewer.status === 'error')
  if (!targets.length) throw new Error('当前评审没有 failed/error 审核员')
  const summary = String(body.summary ?? '').trim() || '人工确认忽略本轮评审拒绝，保留原意见并继续交付'
  for (const reviewer of targets) {
    item.workflow.review = applyReviewerOutput(item.workflow.review, reviewer.id, {
      verdict: 'pass',
      summary,
      findings: reviewer.findings ?? [],
      direction: reviewer.direction ?? '',
      source: 'manual',
      error: '',
    })
  }
  return item
}

/** 清空本轮：历史轮次留在台账里，可追溯；当前回到「继续推进即开始评审」。 */
function resetReviewRound(item) {
  const current = item.workflow?.review
  if (!current) throw new Error('还没有评审记录')
  const history = [...(current.history ?? [])]
  if (current.reviewers?.length) {
    history.push({
      round: current.round,
      decidedAt: current.decidedAt,
      status: current.status,
      reviewers: current.reviewers.map((reviewer) => ({
        id: reviewer.id,
        label: reviewer.label,
        role: reviewer.role,
        status: reviewer.status,
        verdict: reviewer.verdict,
        summary: reviewer.summary,
        findings: reviewer.findings,
        source: reviewer.source,
      })),
    })
  }
  item.workflow.review = {
    ...current,
    status: 'idle',
    dispatchedAt: null,
    decidedAt: null,
    reviewers: [],
    history: history.slice(-5),
  }
}

/**
 * 虚拟库专用建流程实现（与单代码库向导分流）。
 *
 * 和单库实现的关键差别：
 * - 台账写虚拟库本机独立目录（`~/.dev-hub/workspaces/<id>/items/`），不写任何成员库；
 * - scope 必须是 `<成员库>/<路径>` 或 `<成员库>:<路径>`：成员库平权，不允许“默认第一个库”；
 * - 计划/工程量按合并后的成员库画像计算，提交/测试仍按成员库分别执行。
 */
async function createWorkspaceFlow({ profile, repo, body, conventions, loaded }) {
  const active = activeWorkspace(profile)
  if (!active) throw new Error('虚拟库未激活：单代码库流程请走单库入口')
  const localRoot = active.localRoot
  const members = workspaceMembers(active.repos)
  const description = String(body.description ?? '').trim()
  if (!description) throw new Error('先写一句要开发什么')
  const attachments = normalizeAttachments(body.attachments)
  const draft = draftFromDescription(description)
  let title = String(body.name ?? '').trim() || draft.name || '未命名流程'
  const id = safeId(String(body.id ?? '').trim() || draft.id || title)
  if (await readItemLocal(profile, localRoot, id)) throw new Error(`开发流程已存在：${id}`)

  const scope = normalizeScope(body.scope)
  if (!scope.length) throw new Error('虚拟库流程至少要选一个成员库目录/模块')
  const invalidScope = scope.filter((token) => !splitRepoScopedPath(token, members))
  if (invalidScope.length) {
    throw new Error(`虚拟库的 scope 必须带成员库前缀（<成员库>:<路径>）：${invalidScope.join('、')}`)
  }

  const items = await listItems(localRoot)
  const conflicts = conflictsForScope(items, scope)
  const parallel = conflicts.length
    ? {
        conflicts,
        canParallel: false,
        advice: `与进行中的 ${conflicts.map((entry) => `${entry.id}（${entry.overlap.join('、')}）`).join('；')} scope 重叠，建议串行或先拆分 scope。`,
      }
    : { conflicts: [], canParallel: true, advice: '与当前进行中的流程不冲突，可以并行开发。' }

  const answers = normalizeAnswers(body.answers ?? {})
  // 显式传入的 intent（含 analysis）必须保留，不能被 detectIntent 降级回 bug/feature
  const intent = normalizeIntent(body.intent) ?? detectIntent(description)
  const isAnalysis = intent === 'analysis'
  const repoNames = members.map((member) => member.name)
  const canonicalPlan = buildPlan({
    description,
    recon: body.recon ?? null,
    scope,
    answers,
    project: loaded?.project,
    conventions,
    repoNames,
    intent,
  })
  const requirement = deriveRequirement({ description, spec: body.spec, answers, title })
  const explicitGoal = String(body.goal ?? '').trim()
  const explicitRoot = String(body.rootProblem ?? '').trim()
  if (explicitGoal && !isRawEcho(explicitGoal, description)) requirement.goal = explicitGoal
  if (explicitRoot && !isRawEcho(explicitRoot, description)) requirement.rootProblem = explicitRoot
  if (isWeakTitle(title, description)) {
    const better = [
      String(body.title ?? '').trim(),
      String(body.spec?.title ?? '').trim(),
      String(requirement.title ?? '').trim(),
      suggestFlowTitle({ description, spec: body.spec, goal: requirement.goal, intent, fallback: draft.name }),
    ].find((value) => value && !isWeakTitle(value, description))
    if (better) title = better.slice(0, 40)
  }

  const estimate = estimateWork({ recon: body.recon, scope, commands: loaded?.project?.context?.commands ?? {}, repoNames })
  const acceptance = [...new Set([
    ...requirement.acceptance,
    ...(Array.isArray(body.acceptance) ? body.acceptance : []),
    '本机自测通过（按成员库分别执行）',
    '改动文件不越出已确认的 scope',
    `只改已确认的成员库：${repoNames.join('、')}`,
    ...(isAnalysis ? canonicalPlan.acceptance.filter((entry) => /只读|分析结论/.test(entry)) : []),
  ].map((entry) => String(entry ?? '').trim()).filter(Boolean))].slice(0, 12)

  const item = await saveItem(localRoot, appendHistory(stampWorkspaceItem({
    id,
    title,
    goal: requirement.goal,
    description,
    ...(attachments.length ? { attachments } : {}),
    requirement: { ...requirement, normalizedAt: new Date().toISOString() },
    nonGoals: requirement.nonGoals,
    answers,
    acceptance,
    scope,
    scopeModules: scope.filter((entry) => entry.includes('module:')),
    recon: body.recon && typeof body.recon === 'object'
      ? { ...body.recon, confirmedAt: new Date().toISOString() }
      : null,
    provenance: {
      pluginVersion: pluginVersion(),
      recon: body.recon?.provenance ? { ...body.recon.provenance, at: new Date().toISOString() } : null,
      plan: {
        hash: planHash(canonicalPlan),
        confirmedHash: null,
        inputHash: inputHash({ description, answers, scope, conventions }),
        specHash: specHash({ description, answers, scope }),
        pluginVersion: pluginVersion(),
        at: new Date().toISOString(),
      },
    },
    status: 'planned',
    checks: canonicalPlan ? canonicalPlan.checks : [],
    references: canonicalPlan ? canonicalPlan.references : [],
    workflow: {
      stage: 'discovery',
      intent,
      // 成员库是 git 仓库：提交/推送按成员库分别执行
      gitRepo: members.length > 0,
      entry: body.entry === 'chat' ? 'chat' : undefined,
      rootProblem: requirement.rootProblem,
      plan: {
        ...(canonicalPlan?.template ? { template: canonicalPlan.template } : {}),
        ...(canonicalPlan?.intent ? { intent: canonicalPlan.intent } : {}),
        summary: requirement.goal,
        // 分析流程只读：用工作站生成的只读步骤，不能落成“修改成员库代码”
        steps: isAnalysis
          ? canonicalPlan.steps
          : ['分别确认各成员库要改的文件与范围', '按 Context Pack 修改成员库代码与测试代码', DEV_HANDOFF_STEP],
        estimate: estimate?.size
          ? { size: estimate.size, days: estimate.days, confidence: estimate.confidence, notes: '工作站自评（estimateWork，成员库合并画像）' }
          : { size: 'S', days: 0.5, confidence: 'low', notes: '没有探测结果，按最小改动估算' },
      },
      questions: Array.isArray(body.questions) && body.questions.length ? body.questions : undefined,
    },
  }, active), 'create', `虚拟库入口创建开发流程（${active.workspace.name}；${members.length} 个成员库）`))

  return {
    ok: true,
    item,
    firstRun: false,
    parallel,
    ledger: { kind: 'virtual-workspace', path: localRoot },
    workspace: {
      id: active.workspace.id,
      name: active.workspace.name,
      path: localRoot,
      localPath: localRoot,
      members: repoNames,
    },
    steps: wizardSteps({ firstRun: false, description, name: title, id, scope }),
  }
}

/**
 * 把报告写到台账根下的 reports/：
 * 单库 `<repo>/.dev-hub/reports/`，虚拟库 `~/.dev-hub/workspaces/<id>/reports/`。
 * 返回的 relative 以台账根为基准（虚拟库就是它自己的本机目录）。
 */
async function writeReportFiles(repo, id, markdown, html) {
  const ledgerRoot = dataDir(repo)
  const relBase = ledgerRelativeBase(repo)
  const dir = join(ledgerRoot, 'reports')
  await mkdir(dir, { recursive: true })
  const base = safeId(id)
  const markdownPath = join(dir, `${base}.md`)
  const htmlPath = join(dir, `${base}.html`)
  await writeFile(markdownPath, markdown, 'utf8')
  await writeFile(htmlPath, html, 'utf8')
  // 保存后给浏览器绝对路径：用户在 Finder/终端里直接能打开；台账相对路径另放 relative 供展示/排查。
  return {
    dir,
    markdown: markdownPath,
    html: htmlPath,
    relative: {
      dir: repoRelative(relBase, dir),
      markdown: repoRelative(relBase, markdownPath),
      html: repoRelative(relBase, htmlPath),
    },
  }
}

function sendText(res, status, contentType, body) {
  res.writeHead(status, {
    'content-type': contentType,
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
  })
  res.end(body)
}

export function apply(ctx) {
  const routes = [
    // 多语言词典：运行时读取 locale/*.json 下发给浏览器；新增语言 = 新增文件。
    {
      kind: 'exact',
      path: API.locales,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET only' })
        try {
          const bundle = await loadLocaleBundle()
          // 不返回本机绝对路径；errors 只带文件名与原因，便于定位坏词典。
          sendJson(res, 200, { ok: bundle.ok, locales: bundle.locales, errors: bundle.errors })
        } catch (error) {
          // 详细原因（可能含本机候选目录）只进日志；浏览器侧只拿固定文案。
          try { console.warn('[dev-hub] locale bundle load failed:', error) } catch { /* ignore */ }
          sendJson(res, 500, { ok: false, error: '语言词典加载失败，请查看 Host 日志' })
        }
      },
    },
    {
      kind: 'exact',
      path: API.state,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          const sessionId = query(req.url, 'sessionId')
          let session = sessionId ? ctx.sessions.get(sessionId) : undefined
          if (!session?.header?.cwd) {
            // 没有 sessionId（main 面板是 root-scoped）时退回最近一个活跃会话，
            // 这样首次向导能把当前工作区的仓库路径预填出来。
            const live = ctx.sessions.list?.() ?? []
            session = live[live.length - 1] ?? session
          }
          const cwd = session?.header?.cwd
          const suggested = repo ?? (cwd ? await findRepoRoot(cwd) ?? await canonical(cwd) : null)
          const state = await stateFor(repo ?? suggested, profile, ctx)
          if (!repo && suggested) state.needsSetup = true
          state.suggestedRepoPath = suggested
          sendJson(res, 200, state)
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.overview,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET only' })
        try {
          const profile = await loadProfile()
          sendJson(res, 200, await overviewFor(profile, ctx))
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.setup,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const body = await readBody(req)
          const session = body.sessionId ? ctx.sessions.get(String(body.sessionId)) : undefined
          const before = await loadProfile()
          const previousWorkspace = String(before.activeRepo ?? '').startsWith('workspace:')
            ? before.activeRepo.slice('workspace:'.length)
            : null
          // 旧界面/误操作可能把虚拟库本机目录提交成“代码库初始化”：直接切回虚拟库，不建假库
          const requestedRoot = String(body.repoPath ?? '').trim()
          if (requestedRoot && isWorkspaceLocalRoot(requestedRoot)) {
            const matched = listWorkspaces(before).find((entry) => {
              try { return resolve(workspaceLocalDir(entry)) === resolve(requestedRoot) } catch { return false }
            }) ?? null
            if (!matched) throw new Error('这是本机虚拟库目录，不能作为代码库初始化')
            before.activeRepo = `workspace:${matched.id}`
            await ensureWorkspaceLocalDir(matched)
            await saveProfile(before)
            return sendJson(res, 200, await stateFor(workspaceLocalDir(matched), await loadProfile(), ctx))
          }
          const result = await initializeRepo({
            repoPath: body.repoPath,
            name: body.name,
            sessionCwd: session?.header?.cwd,
          })
          let profile = await loadProfile()
          // 从虚拟库切到某个成员库做首次初始化时，初始化完成后要回到虚拟库，而不是停在单库。
          if (previousWorkspace) {
            const retained = findWorkspace(profile, previousWorkspace)
            if (retained?.repos?.some((path) => path === result.repo)) {
              profile.activeRepo = `workspace:${retained.id}`
              await saveProfile(profile)
              profile = await loadProfile()
            }
          }
          // 项目自动拥有一个 DSH Workspace（扫描/澄清等 cwd 在项目目录里的会话会自动归组）
          await ensureProjectWorkspace(ctx, {
            name: result.project?.name || repoName(result.repo),
            path: result.repo,
          }).catch(() => null)
          const state = await stateFor(result.repo, profile, ctx)
          sendJson(res, 200, { ...state, skills: result.skills ?? null })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.detect,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const env = await detectAndSave(repo)
          sendJson(res, 200, { ok: true, env })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.items,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          if (req.method === 'GET') {
            const items = await localItems(profile, repo)
            // 与 /state 同源：摘要带 running/attention，避免前端 loadItems 覆盖后信号丢失
            return sendJson(res, 200, { ok: true, items: itemViews(ctx, items).items })
          }
          if (req.method === 'POST') {
            const body = await readBody(req)
            // 更新已有流程必须提交完整 item；拒绝 {id} 之类的部分写入，
            // 避免把 workflow/tasks/review 覆盖成新建默认值（台账不可恢复）。
            if (body?.id) {
              const existing = await getItem(repo, body.id)
              if (existing && (!body.title || !body.workflow || !Array.isArray(body.tasks))) {
                throw new Error('更新流程必须提交完整 item（含 title/workflow/tasks）；已拒绝部分更新')
              }
            }
            const active = activeWorkspace(profile)
            // 新建流程继承当前自动化设置；已有流程由 /settings 统一回写。
            body.workflow = { ...(body.workflow ?? {}), reviewEnabled: profile.automation?.reviewEnabled !== false }
            let draft = newItem(body.title || '未命名开发项', body)
            // 虚拟库：归属直接写进本机台账，不挑任何成员库
            if (isWorkspaceLocalRoot(repo)) draft = stampWorkspaceItem(draft, active)
            const item = await saveItem(repo, draft)
            if (active && !isWorkspaceLocalRoot(repo)) {
              setItemWorkspace(profile, repo, item.id, {
                workspaceId: active.workspace.id,
                workspaceName: active.workspace.name,
                baseline: [],
              })
              await saveProfile(profile)
            }
            return sendJson(res, 200, { ok: true, item: hydrateItemLocal(profile, repo, item) })
          }
          sendJson(res, 405, { ok: false, error: 'GET/POST only' })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.item,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET only' })
          const item = await readItemLocal(profile, repo, query(req.url, 'id'))
          if (!item) return sendJson(res, 404, { ok: false, error: '开发项不存在' })
          // 审核会话异常结束/超时：详情轮询时标成待处理，而不是一直显示「等待审核员返回」
          const reconciled = await reconcileStaleReview(ctx, repo, item)
          // 详情刷新/重新打开时也做一次过期检测，保证阶段及时回到开发中
          const [fresh] = await applyReworkFacts(ctx, profile, repo, [reconciled])
          sendJson(res, 200, { ok: true, item: fresh ?? reconciled })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.status,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          if (body.status) item.status = body.status
          if (Array.isArray(body.tasks)) item.tasks = body.tasks
          if (Array.isArray(body.risks)) item.risks = body.risks
          if (Array.isArray(body.changePoints)) item.changePoints = body.changePoints
          const saved = await saveItem(repo, item)
          sendJson(res, 200, { ok: true, item: saved })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 开发前同步：fetch + merge --ff-only（不 rebase/reset）；单库一个、虚拟库每个成员库一个
    {
      kind: 'exact',
      path: API.sync,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const item = body.id ? await readItemLocal(profile, repo, body.id) : null
          if (body.id && !item) throw new Error(`开发项不存在：${body.id}`)
          const target = item ? workspaceTarget(profile, item, repo) : workspaceTarget(profile)
          const jobs = target?.members?.length
            ? target.members.map((member) => ({ name: member.name, path: member.path }))
            : [{ name: repoName(repo), path: repo }]
          const repos = []
          for (const job of jobs) {
            if (!(await exists(job.path)) || !(await isGitRepo(job.path))) {
              repos.push({ ...job, ok: false, updated: false, error: '不是 git 仓库或路径不存在', branch: null, before: null, after: null, output: '' })
              continue
            }
            const result = await syncRepo(job.path)
            repos.push({ ...job, ...result })
          }
          sendJson(res, 200, {
            ok: repos.every((row) => row.ok),
            itemId: item?.id ?? null,
            target: target ? 'workspace' : 'repo',
            repos,
            updated: repos.some((row) => row.updated),
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.start,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          let item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          const missing = missingForStart(item)
          if (missing.length) throw new Error('开始开发前还缺少：' + missing.join('；'))
          let target = workspaceTarget(profile, item, repo)
          const isAnalysis = item.workflow?.intent === 'analysis'
          let worktree = null
          let workspaceWorktrees = []
          // 开工 baseline 必须在主工作区/成员库本身上取：workRoot 是 devhub/<flow>，
          // 从它取 branch 会让提交误推到 worktree 分支。这里先记下真正的目标分支。
          const baselineBefore = !item.baseline
            ? (target ? await workspaceBaseline(target.members) : await startBaseline(repo))
            : null
          // 单库和虚拟库的每个 git 成员库都使用独立 worktree：主工作区可能有人的未提交改动、
          // 构建产物或其他流程的提交，变更捕获/测试/提交都会被污染。分析流程只读不建。
          if (!isAnalysis && item.workflow?.gitRepo !== false) {
            if (target) {
              let createdAny = false
              for (const member of target.members) {
                if (!(await exists(member.path)) || !(await isGitRepo(member.path))) continue
                const memberTree = await ensureFlowWorktree(member.path, {
                  id: memberWorktreeItemId(item.id, member.name),
                })
                workspaceWorktrees.push({
                  name: member.name,
                  branch: memberTree.branch,
                  baseCommit: memberTree.baseCommit,
                  createdAt: memberTree.createdAt,
                })
                if (memberTree.created) createdAny = true
              }
              if (workspaceWorktrees.length) {
                item.workflow.worktrees = workspaceWorktrees
                if (!item.baseline && baselineBefore) item.baseline = baselineBefore
                // 重新解析 target，让 members 带上 workRoot 再记 baseline
                target = workspaceTarget(profile, item, repo)
              }
            } else {
              worktree = await ensureFlowWorktree(repo, item)
              item.workflow.worktree = {
                branch: worktree.branch,
                baseCommit: worktree.baseCommit,
                createdAt: worktree.createdAt,
              }
              // 新工作区从当前 HEAD 开出：baseline 用主仓库的原始 branch/commit，
              // 不能把它记成 devhub/<flow>，否则提交会推错分支。
              if (!item.baseline && baselineBefore) item.baseline = baselineBefore
            }
          }
          const workRoot = target
            ? (target.members.find((member) => member.worktree)?.workRoot ?? target.localRoot)
            : (worktree?.path ?? repo)
          item = await recordBaselineLocal(profile, repo, item, workRoot)
          item.workflow.stage = 'develop'
          if (item.status === 'planned' || item.status === 'designing') item.status = 'developing'
          const startNote = isAnalysis
            ? '开始只读分析，记录 baseline（不建独立工作区、不改代码）'
            : worktree
              ? `开始开发：独立工作区 ${worktree.path}（分支 ${worktree.branch}）${worktree.created ? '，已创建' : '，复用'}`
              : workspaceWorktrees.length
                ? `开始开发：${workspaceWorktrees.length} 个成员库使用独立工作区（${workspaceWorktrees.map((entry) => `${entry.name}@${entry.branch}`).join('、')}）`
                : '开始开发，记录 baseline'
          item = await saveItem(repo, appendHistory(item, 'start', startNote))
          const built = await buildFor(repo, item, profile, { workRoot })
          sendJson(res, 200, {
            ok: true,
            ...built,
            workRoot,
            ...(worktree ? { worktree: { ...worktree } } : {}),
            ...(workspaceWorktrees.length
              ? {
                  workspaceWorktrees: target?.members
                    .filter((member) => member.worktree)
                    .map((member) => ({ name: member.name, path: member.workRoot, branch: member.worktree.branch })),
                }
              : {}),
            item: hydrateItemLocal(profile, repo, built.item),
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.context,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          const built = await buildFor(repo, item, profile)
          sendJson(res, 200, { ok: true, ...built })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.scan,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const active = activeWorkspace(profile)
          if (isWorkspaceLocalRoot(repo) && active) {
            // 虚拟库：逐成员库扫文档标题，来源路径带成员前缀；只读，不写任何 .dev-hub
            const candidates = []
            for (const member of workspaceMembers(active.repos)) {
              const list = await scanCandidates(member.path)
              for (const candidate of list) {
                candidates.push({
                  ...candidate,
                  id: `${member.name}-${candidate.id}`,
                  title: `${member.name}：${candidate.title}`,
                  source: candidate.source
                    ? { ...candidate.source, path: `${member.name}/${candidate.source.path}`, repo: member.path, repoName: member.name }
                    : candidate.source,
                })
              }
            }
            return sendJson(res, 200, { ok: true, candidates: candidates.slice(0, 60), workspace: { id: active.workspace.id, name: active.workspace.name } })
          }
          const candidates = await scanCandidates(repo)
          sendJson(res, 200, { ok: true, candidates })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.importCandidate,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const candidate = body.candidate ?? body
          const active = activeWorkspace(profile)
          let draft = {
            title: candidate.title,
            goal: candidate.summary || '',
            source: candidate.source,
            status: 'planned',
          }
          if (isWorkspaceLocalRoot(repo)) draft = stampWorkspaceItem(draft, active)
          const item = await saveItem(repo, draft)
          if (active && !isWorkspaceLocalRoot(repo)) {
            setItemWorkspace(profile, repo, item.id, {
              workspaceId: active.workspace.id,
              workspaceName: active.workspace.name,
              baseline: [],
            })
            await saveProfile(profile)
          }
          sendJson(res, 200, { ok: true, item: hydrateItemLocal(profile, repo, item) })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.project,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const loaded = await loadProject(repo)
          if (!loaded) throw new Error('代码库尚未初始化')

          // 动作：用一句话把「本机实际怎么做」探测成一条可复用命令（由 dsh agent 生成，不自动执行）
          if (body.action === 'suggest-local-command') {
            const phase = ['localTest', 'environmentTest', 'gate'].includes(body.phase) ? body.phase : 'localTest'
            const description = String(body.description ?? '').trim()
            if (!description) throw new Error('先用一句话描述你本机怎么做（例如：本机用 kpipe-dev 把服务部署到本机环境）')
            const entry = ledgerEntry(profile, repo)
            const defaults = await defaultCommands(repo)
            const result = await runAgentJson(ctx, {
              cwd: repo,
              prompt: buildLocalCommandPrompt({
                description,
                phase,
                repoName: repoName(repo),
                projectCommands: { ...defaults, ...(loaded.project.context?.commands ?? {}) },
                env: entry?.environment ?? null,
              }),
              schema: LOCAL_COMMAND_SCHEMA,
              label: 'devhub-local-command',
              timeoutMs: 90000,
            })
            const command = normalizeLocalCommand(result.value?.command)
            if (!command) throw new Error('没有生成可用命令，换个说法再试')
            const probe = await probeLocalCommand(repo, command)
            return sendJson(res, 200, {
              ok: true,
              phase,
              command,
              explanation: String(result.value?.explanation ?? '').trim(),
              caveats: (Array.isArray(result.value?.caveats) ? result.value.caveats : []).map(String).filter(Boolean).slice(0, 6),
              alternatives: (Array.isArray(result.value?.alternatives) ? result.value.alternatives : []).map(String).filter(Boolean).slice(0, 4),
              probe,
              elapsedMs: result.elapsedMs,
            })
          }

          // 项目共享命令（提交到 .dev-hub/project.json，团队共用）
          if (body.commands && typeof body.commands === 'object' && !Array.isArray(body.commands)) {
            const current = loaded.project.context?.commands ?? {}
            const commands = { ...current }
            for (const key of ['compile', 'test', 'gate', 'localTest', 'environmentTest', 'install', 'build']) {
              if (typeof body.commands[key] === 'string') commands[key] = body.commands[key].trim()
            }
            loaded.project.context = { ...(loaded.project.context ?? {}), commands }
            await saveProject(repo, loaded.project)
          }

          // 本机命令（只写本机 profile / 虚拟库本机记录，绝不进仓库台账）
          let localCommands = ledgerEntry(profile, repo)?.localCommands ?? {}
          if (body.localCommands && typeof body.localCommands === 'object' && !Array.isArray(body.localCommands)) {
            const next = {}
            for (const key of ['localTest', 'environmentTest', 'gate']) {
              if (typeof body.localCommands[key] === 'string' && body.localCommands[key].trim()) {
                next[key] = body.localCommands[key].trim()
              }
            }
            if (isWorkspaceLocalRoot(repo)) {
              // 虚拟库：本机命令记在虚拟库自身，不生成“本机目录=代码库”的卡片
              const active = activeWorkspace(profile)
              const workspace = active ? findWorkspace(profile, active.workspace.id) : null
              if (!workspace) throw new Error('虚拟库不存在：无法保存本机命令')
              workspace.localCommands = next
              workspace.updatedAt = new Date().toISOString()
            } else {
              await setProfileForRepo(profile, repo, { localCommands: next }, { activate: false })
            }
            await saveProfile(profile)
            localCommands = next
          }

          sendJson(res, 200, { ok: true, project: loaded.project, localCommands })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.workflow,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          const beforeStage = item.workflow.stage
          if (body.workflow && typeof body.workflow === 'object') {
            item.workflow = { ...item.workflow, ...body.workflow }
          }
          if (body.stage) item.workflow.stage = body.stage
          const saved = await saveItem(repo, appendHistory(item, 'workflow', body.message || `更新工作流：${item.workflow.stage}`))
          if (beforeStage !== saved.workflow.stage) {
            const withHistory = appendHistory(saved, 'stage', `阶段：${beforeStage} → ${saved.workflow.stage}`)
            await saveItem(repo, withHistory)
            return sendJson(res, 200, { ok: true, item: withHistory })
          }
          sendJson(res, 200, { ok: true, item: saved })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.techdoc,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const body = await readBody(req)
          const action = String(body.action ?? 'probe')
          if (action === 'probe') {
            const lark = await which('lark-cli')
            if (!lark) return sendJson(res, 200, { ok: true, available: false, authenticated: false, message: '未找到 lark-cli' })
            const auth = await run(lark, ['auth', 'status'], { timeout: 10000 })
            let parsed = null
            try { parsed = JSON.parse(auth.stdout) } catch { /* ignore */ }
            return sendJson(res, 200, {
              ok: true,
              available: true,
              authenticated: Boolean(parsed?.identities?.user?.available || parsed?.identity),
              identity: parsed?.identity ?? null,
              message: parsed?.identities?.user?.message ?? (auth.ok ? 'lark-cli 可用' : auth.stderr.slice(-500)),
            })
          }
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          const loaded = await loadProject(repo)
          const docsConfig = normalizeDocsConfig(loaded?.project?.docs)
          const techDoc = item.workflow?.techDoc ?? {}
          const title = String(
            body.title
            ?? techDoc.title
            ?? (docsConfig.feishu.titleTemplate || '{title} 技术方案').replaceAll('{title}', item.title),
          ).trim()
          const applyLocalDoc = (result, note = '') => ({
            ...techDoc,
            provider: 'local',
            decision: 'existing',
            exists: true,
            title,
            url: '',
            localPath: result.relPath,
            supplement: result.supplement,
            supplementUpdatedAt: new Date().toISOString(),
            generatedAt: result.generatedAt,
            generatedHash: result.generatedHash,
            sync: { status: 'fresh', checkedAt: new Date().toISOString(), note },
            createdBy: 'local',
            createdAt: techDoc.createdAt || new Date().toISOString(),
          })

          // 预览：本地文件优先，否则按当前台账渲染（不写盘）
          if (action === 'preview') {
            const template = String(body.path ?? '').trim() || techDoc.localPath || docsConfig.local.path
            let relPath = ''
            try { relPath = expandDocPath(template, { id: item.id, title: item.title, repoName: repoName(repo) }) } catch { relPath = '' }
            let existing = null
            if (relPath) {
              try { existing = await readFile(join(repo, relPath), 'utf8') } catch { /* 没生成过 */ }
            }
            const markdown = existing || renderLocalDoc(item, { repoName: repoName(repo), supplement: techDoc.supplement ?? '' })
            return sendJson(res, 200, {
              ok: true,
              markdown,
              provider: techDoc.provider ?? docsConfig.provider,
              title,
              path: relPath || techDoc.localPath || '',
              url: techDoc.url ?? '',
            })
          }

          // 用户补充：存台账；本地文件存在时只替换 user 段，不动 generated 段
          if (action === 'supplement') {
            const supplement = String(body.supplement ?? '').trim().slice(0, SUPPLEMENT_MAX)
            item.workflow.techDoc = {
              ...techDoc,
              provider: techDoc.provider ?? docsConfig.provider,
              supplement,
              supplementUpdatedAt: new Date().toISOString(),
            }
            let synced = false
            const template = techDoc.localPath || docsConfig.local.path
            try {
              const relPath = expandDocPath(template, { id: item.id, title: item.title, repoName: repoName(repo) })
              const absPath = join(repo, relPath)
              const existing = await readFile(absPath, 'utf8')
              const next = applySupplementToFile(existing, supplement)
              if (next) { await writeFile(absPath, next, 'utf8'); synced = true }
            } catch { /* 文件不存在/路径非法：只存台账 */ }
            const saved = await saveItem(repo, appendHistory(item, 'techdoc', `更新技术方案补充（${supplement.length} 字）`))
            return sendJson(res, 200, { ok: true, item: saved, synced })
          }

          if (action === 'local') {
            const pathTemplate = String(body.path ?? '').trim() || techDoc.localPath || docsConfig.local.path
            const result = await writeLocalTechDoc({ repo, item, title, pathTemplate, force: body.force === true })
            if (result.conflict) {
              return sendJson(res, 200, {
                ok: true,
                conflict: true,
                status: result.status,
                message: result.message,
                path: result.relPath,
                supplement: result.supplement,
              })
            }
            item.workflow.techDoc = applyLocalDoc(result)
            const saved = await saveItem(repo, appendHistory(item, 'techdoc', `生成本地技术方案：${result.relPath}`))
            return sendJson(res, 200, { ok: true, item: saved, path: result.relPath, status: result.status })
          }

          if (action === 'create') {
            const supplement = String(techDoc.supplement ?? '').trim()
            const markdown = [
              buildTechDocMarkdown(item, { repoName: repoName(repo) }),
              supplement ? `## 8. 我的补充\n\n${supplement}` : '',
            ].filter(Boolean).join('\n')
            // 已有飞书文档：更新正文（整篇 overwrite，含台账里的我的补充），不新建
            if (body.update === true && techDoc.url) {
              const updated = await updateLarkDoc(repo, item, techDoc.url, markdown)
              item.workflow.techDoc = {
                ...techDoc,
                provider: 'feishu',
                decision: 'existing',
                exists: true,
                title,
                url: updated.url,
                localPath: '',
                generatedAt: new Date().toISOString(),
                generatedHash: hashText(markdown),
                sync: { status: 'fresh', checkedAt: new Date().toISOString(), note: '' },
                createdBy: 'lark-cli',
                createdAt: techDoc.createdAt || new Date().toISOString(),
              }
              const saved = await saveItem(repo, appendHistory(item, 'techdoc', `更新飞书技术文档：${updated.url}`))
              return sendJson(res, 200, { ok: true, item: saved, url: updated.url, updated: true })
            }
            try {
              const created = await createLarkDoc(repo, item, title, markdown)
              item.workflow.techDoc = {
                ...techDoc,
                provider: 'feishu',
                decision: 'existing',
                exists: true,
                title,
                url: created.url,
                localPath: '',
                generatedAt: new Date().toISOString(),
                generatedHash: hashText(markdown),
                sync: { status: 'fresh', checkedAt: new Date().toISOString(), note: '' },
                createdBy: 'lark-cli',
                createdAt: techDoc.createdAt || new Date().toISOString(),
              }
              const saved = await saveItem(repo, appendHistory(item, 'techdoc', `lark-cli 创建技术文档：${created.url}`))
              return sendJson(res, 200, { ok: true, item: saved, url: created.url })
            } catch (error) {
              // 飞书不可用：按项目配置回退本地 md，并显式说明降级原因（不假装飞书成功）
              if (docsConfig.fallback !== 'local') throw error
              const pathTemplate = String(body.path ?? '').trim() || techDoc.localPath || docsConfig.local.path
              const result = await writeLocalTechDoc({ repo, item, title, pathTemplate, force: body.force === true })
              if (result.conflict) {
                return sendJson(res, 200, {
                  ok: true,
                  conflict: true,
                  degraded: true,
                  reason: String(error?.message ?? error),
                  status: result.status,
                  message: result.message,
                  path: result.relPath,
                  supplement: result.supplement,
                })
              }
              item.workflow.techDoc = applyLocalDoc(result, `飞书创建失败，已回退本地：${String(error?.message ?? error).slice(0, 300)}`)
              const saved = await saveItem(repo, appendHistory(item, 'techdoc',
                `飞书创建失败（${String(error?.message ?? error).slice(0, 160)}），已回退生成本地技术方案：${result.relPath}`))
              return sendJson(res, 200, {
                ok: true,
                degraded: true,
                reason: String(error?.message ?? error),
                item: saved,
                path: result.relPath,
              })
            }
          }
          throw new Error(`未知技术文档动作：${action}`)
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 独立评审：继续推进自动开始评审（dispatch 幂等）/ 读结论 / 人工记录 / 清空本轮
    {
      kind: 'exact',
      path: API.review,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          if (req.method === 'GET') {
            const found = await readItemLocal(profile, repo, query(req.url, 'id'))
            if (!found) throw new Error('开发项不存在')
            const item = await reconcileStaleReview(ctx, repo, found)
            return sendJson(res, 200, { ok: true, item, review: describeReview(item) })
          }
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'GET/POST only' })
          const body = await readBody(req)
          let item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          item = await reconcileStaleReview(ctx, repo, item)
          const action = String(body.action ?? 'dispatch')
          let saved
          if (action === 'dispatch') {
            if (item.status === 'done') throw new Error('流程已完成：不需要再评审')
            saved = await runReviewRound({ ctx, repo, item, profile, count: body.count })
          } else if (action === 'rework') {
            const view = describeReview(item)
            if (view.status !== 'failed' && view.status !== 'error') throw new Error('当前评审不需要返工')
            item.workflow.review = { ...item.workflow.review, reworkAt: new Date().toISOString() }
            saved = await saveItem(repo, appendHistory(item, 'review', '评审纠偏意见已发回开发会话返工；本轮不再允许人工通过'))
          } else if (action === 'record') {
            recordReviewOutcome(item, body)
            saved = await saveItem(repo, appendHistory(item, 'review', `人工记录审核结论：${body.reviewerId} → ${body.verdict}`))
          } else if (action === 'override') {
            const ignored = (describeReview(item).reviewers ?? []).filter((reviewer) => reviewer.status === 'failed' || reviewer.status === 'error')
            overrideReviewRejections(item, body)
            saved = await saveItem(repo, appendHistory(item, 'review', `人工确认忽略本轮评审拒绝（${ignored.length} 位审核员标记为人工通过，原意见保留）`))
          } else if (action === 'reset') {
            resetReviewRound(item)
            saved = await saveItem(repo, appendHistory(item, 'review', '清空本轮独立评审（历史轮次保留）'))
          } else {
            throw new Error(`未知评审动作：${action}`)
          }
          const view = describeReview(saved)
          sendJson(res, 200, { ok: action !== 'dispatch' || view.status === 'passed', item: saved, review: view })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.test,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const phase = body.phase === 'environment' ? 'environment' : 'local'
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          // 人工跳过测试：记录原因/人/时间，报告显式标注；不会被当成“通过”
          if (body.skip === true) {
            if (phase === 'environment') {
              const gate = reviewGate(item)
              if (!gate.allowed) throw new Error(`${gate.reason}；环境测试需要独立评审通过后才能跳过`)
            }
            const reason = String(body.reason ?? '').trim().slice(0, 500) || '人工跳过（未填写原因）'
            const member = ledgerEntry(profile, repo)?.member ?? ''
            const at = new Date().toISOString()
            item.workflow.tests[phase] = {
              status: 'skipped',
              command: '',
              commandSource: null,
              output: `人工跳过：${reason}`,
              at,
              durationMs: null,
              by: member,
              skipReason: reason,
              skippedBy: member,
              stale: false,
              basisHash: '',
              codeState: [],
            }
            const saved = await saveItem(repo, appendHistory(item, 'test',
              `${phase === 'local' ? '本机自测' : '环境测试'}已人工跳过：${reason}`))
            return sendJson(res, 200, { ok: true, skipped: true, phase, item: saved, result: saved.workflow.tests[phase] })
          }
          const localTest = item.workflow.tests.local ?? {}
          if (phase === 'environment'
            && ((!['passed', 'skipped'].includes(localTest.status)) || localTest.stale || item.workflow.rework?.at)) {
            throw new Error('必须先在当前代码/诉求上通过或明确跳过本机自测，才能做环境测试（测试通过后又有改动，请重跑本机自测）')
          }
          if (phase === 'environment') {
            // 评审是测试验证的门禁：没评审/评审未通过/评审异常都不能进环境测试
            const gate = reviewGate(item)
            if (!gate.allowed) throw new Error(`${gate.reason}；环境测试需要独立评审通过后才能执行`)
          }
          const target = workspaceTarget(profile, item, repo)
          if (target) {
            // 虚拟库：每个成员库各跑自己的命令（没配置就跳过并说明，不拿别的库的命令硬套）
            const explicit = String(body.command ?? '').trim()
            const rows = []
            for (const member of target.members) {
              const root = member.workRoot ?? member.path
              if (!(await exists(root))) {
                rows.push({ path: member.path, workRoot: root, name: member.name, skipped: true, status: 'not_run', command: '', output: '成员库工作区不存在', durationMs: null })
                continue
              }
              const memberProject = (await loadProject(member.path))?.project
              const memberCommands = memberProject?.context?.commands ?? {}
              // 本机命令优先：只影响这台电脑，不随仓库提交
              const memberLocal = profileForRepo(profile, member.path)?.localCommands ?? {}
              const localCommand = String(phase === 'local'
                ? (memberLocal.localTest || memberLocal.gate || '')
                : (memberLocal.environmentTest ?? '')).trim()
              let command = localCommand || (phase === 'local'
                ? (memberCommands.localTest || memberCommands.test || memberCommands.gate || '')
                : (memberCommands.environmentTest || ''))
              if (!command && phase === 'local') {
                const defaults = await defaultCommands(root)
                command = defaults.localTest || defaults.test || defaults.gate || ''
              }
              if (!command) command = explicit
              if (!command) {
                rows.push({ path: member.path, workRoot: root, name: member.name, skipped: true, status: 'not_run', command: '', output: '没有配置可运行命令，已跳过', durationMs: null })
                continue
              }
              const result = await runConfiguredCommand(root, command)
              // 台账会随代码提交：本机命令原文不进台账，只记来源
              rows.push({ path: member.path, workRoot: root, name: member.name, skipped: false, command: localCommand ? '（本机命令）' : command, commandSource: localCommand ? 'local' : 'project', status: result.status, output: result.output, durationMs: result.durationMs })
            }
            const ran = rows.filter((row) => !row.skipped)
            if (!ran.length) throw new Error(`没有成员库配置${phase === 'local' ? '本机自测' : '环境测试'}命令，无法执行`)
            const failed = ran.filter((row) => row.status !== 'passed')
            const status = failed.length ? 'failed' : 'passed'
            const output = rows.map((row) => `[${row.name}] ${row.skipped ? '跳过' : row.status}\n${row.output ?? ''}`).join('\n\n').slice(-120000)
            const result = {
              status,
              command: rows.filter((row) => row.command).map((row) => `${row.name}: ${row.command}`).join(' ; '),
              output,
              at: new Date().toISOString(),
              durationMs: rows.reduce((sum, row) => sum + (row.durationMs ?? 0), 0),
              by: ledgerEntry(profile, repo)?.member ?? '',
              repos: rows,
            }
            await stampVerification(profile, repo, item, phase, result)
            item.workflow.tests[phase] = result
            if (phase === 'local' && status === 'passed') item.workflow.stage = 'verify'
            const saved = await saveItem(repo, appendHistory(item, 'test',
              `${phase === 'local' ? '本机自测' : '环境测试'}（${target.members.length} 库）：${status}`))
            return sendJson(res, 200, { ok: status === 'passed', item: saved, phase, result })
          }
          const project = (await loadProject(repo))?.project
          // 本机命令优先：同一台电脑上可覆盖项目共享命令（例如本机专用的部署命令），不提交到仓库
          const localCommands = ledgerEntry(profile, repo)?.localCommands ?? {}
          const localCommand = String(phase === 'local'
            ? (localCommands.localTest || localCommands.gate || '')
            : (localCommands.environmentTest ?? '')).trim()
          const explicit = String(body.command ?? '').trim()
          const command = String(explicit || localCommand || commandFor(item, project, phase)).trim()
          const commandSource = explicit ? 'explicit' : localCommand ? 'local' : 'project'
          if (!command) throw new Error(phase === 'local' ? '未配置本机自测命令（可在「本机环境与项目命令 → 本机命令」或 .dev-hub/project.json 配置）' : '未配置环境测试命令（可在「本机环境与项目命令 → 本机命令」或 .dev-hub/project.json 配置）')
          // 台账会随代码提交：本机命令原文只留在这台电脑（profile），台账里只记"用了本机命令"
          const ledgerCommand = commandSource === 'local' ? '（本机命令，见本机 profile）' : command
          item.workflow.tests[phase] = { status: 'running', command: ledgerCommand, commandSource, output: '', at: new Date().toISOString(), durationMs: null, by: ledgerEntry(profile, repo)?.member ?? '' }
          await saveItem(repo, item)
          const runRoot = await workRootOf(repo, item)
          const raw = await runConfiguredCommand(runRoot, command)
          // 测试完成后立刻盖验证基线：之后代码/诉求再变就能判定旧结论过期
          const result = await stampVerification(profile, repo, item, phase, {
            ...raw,
            command: ledgerCommand,
            commandSource,
            at: new Date().toISOString(),
            by: ledgerEntry(profile, repo)?.member ?? '',
          })
          item.workflow.tests[phase] = result
          if (phase === 'local' && result.status === 'passed') item.workflow.stage = 'verify'
          const sourceLabel = commandSource === 'local' ? '（本机命令）' : ''
          const saved = await saveItem(repo, appendHistory(item, 'test', `${phase === 'local' ? '本机自测' : '环境测试'}${sourceLabel}：${result.status}`))
          sendJson(res, 200, { ok: result.status === 'passed', item: saved, phase, result, commandSource })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.changes,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const item = await readItemLocal(profile, repo, query(req.url, 'id'))
          if (!item) throw new Error('开发项不存在')
          const target = workspaceTarget(profile, item, repo)
          if (target) {
            const suggested = new Set()
            const repoRows = []
            const changes = []
            for (const member of target.members) {
              const root = member.workRoot ?? member.path
              if (!(await exists(root)) || !(await isGitRepo(root))) {
                repoRows.push({ path: member.path, workRoot: root, name: member.name, isRepo: false, branch: null, head: null, changedFiles: 0 })
                continue
              }
              const info = await gitInfo(root)
              const base = baselineForMember(target.baseline, member)
              const baseline = base?.commit ? await changesSince(root, base) : null
              for (const change of baseline?.changes ?? []) suggested.add(`${member.name}/${change.path}`)
              for (const change of info.changes ?? []) suggested.add(`${member.name}/${change.path}`)
              for (const change of info.changes ?? []) {
                changes.push({ ...change, path: `${member.name}/${change.path}`, repoPath: change.path, repo: root, repoName: member.name })
              }
              repoRows.push({
                path: member.path,
                workRoot: root,
                name: member.name,
                isRepo: true,
                branch: info.branch,
                head: info.head,
                changedFiles: (baseline?.changes ?? []).length,
              })
            }
            // 虚拟库台账在本机独立目录：不随任何成员库提交，也不往成员库 .dev-hub 里塞文件
            return sendJson(res, 200, {
              ok: true,
              git: true,
              workspace: {
                id: target.workspace.id,
                name: target.workspace.name,
                path: target.localRoot,
                localPath: target.localRoot,
              },
              // 没有“代表库分支”：按成员库分别给出
              branch: null,
              branches: repoRows.map((row) => row.branch).filter(Boolean),
              changes,
              repos: repoRows,
              suggestedPaths: [...suggested].sort(),
            })
          }
          const workRoot = await workRootOf(repo, item)
          const worktree = worktreeFor(repo, item)
          if (!(await isGitRepo(workRoot))) {
            return sendJson(res, 200, {
              ok: true,
              git: false,
              branch: null,
              changes: [],
              suggestedPaths: [],
              reason: '不是 git 仓库：无法列出/提交 git 变更（测试通过即完成）',
            })
          }
          const info = await gitInfo(workRoot)
          const baseline = item.baseline ? await changesSince(workRoot, item.baseline) : null
          const suggested = new Set(item.scope ?? [])
          for (const change of baseline?.changes ?? []) suggested.add(change.path)
          // 工作区里未提交/未跟踪的改动也要能被勾选提交（之前只列了 baseline 以来的提交）
          for (const change of info.changes ?? []) suggested.add(change.path)
          // 台账要跟代码一起提交（跨人交接）：先放这条流程，再尽量带上整个 .dev-hub
          // 独立工作区里 .dev-hub 是分支上的旧副本，台账仍写仓库主工作区，不在这个分支提交台账
          if (!worktree) {
            suggested.add(`.dev-hub/items/${item.id}.json`)
            for (const ledgerPath of ['.dev-hub/project.json', '.dev-hub/conventions.json']) {
              try {
                await access(join(repo, ledgerPath))
                suggested.add(ledgerPath)
              } catch { /* 不存在就跳过 */ }
            }
          }
          sendJson(res, 200, {
            ok: true,
            branch: info.branch,
            targetBranch: await targetBranchForRepo(repo, item.baseline?.branch),
            changes: info.changes,
            suggestedPaths: [...suggested].sort(),
            workRoot,
            ...(worktree ? { worktree } : {}),
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.submit,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          if (item.workflow?.intent === 'analysis') {
            throw new Error('分析流程是只读排查：不产生提交，结论产出即结束')
          }
          if (item.workflow.gitRepo === false) {
            throw new Error('这个代码库不是 git 仓库：没有提交/推送环节，跑完本机与环境测试即视为完成')
          }
          const localTest = item.workflow.tests.local
          if (!localTest || !['passed', 'skipped'].includes(localTest.status)) {
            throw new Error('必须先通过本机自测（或在「测试与提交」明确跳过），才能提交')
          }
          const blockedChecks = (item.checks ?? []).filter((check) => check.command && check.status !== 'passed')
          if (blockedChecks.length) {
            throw new Error(`还有验收项没通过：${blockedChecks.map((check) => check.text).join('、')}（可在「计划」页逐条运行）`)
          }
          // 虚拟库：按成员库分组提交，本机台账记录每个库的结果
          const target = workspaceTarget(profile, item, repo)
          if (target) {
            const message = String(body.message ?? '').trim()
            const branchMode = body.branchMode === 'new' ? 'new' : 'current'
            const branchName = String(body.branchName ?? '').trim()
            const pushOnly = Boolean(body.pushOnly)
            if (!pushOnly && !message) throw new Error('请填写提交信息')
            if (!pushOnly && !(Array.isArray(body.paths) ? body.paths : []).length) throw new Error('请选择要提交的文件')
            if (branchMode === 'new' && !pushOnly && !/^[A-Za-z0-9._/-]{1,80}$/.test(branchName)) {
              throw new Error('新分支名不合法：只允许字母/数字/._-/，长度 1~80')
            }
            const outcome = await submitWorkspace({
              target,
              ledgerRepo: repo,
              item,
              paths: body.paths ?? [],
              message,
              branchMode,
              branchName,
              pushOnly,
            })
            const submission = outcome.saved.workflow.submission ?? {}
            if (!outcome.pushed) {
              return sendJson(res, 200, {
                ok: false,
                error: `多库提交部分失败：${outcome.failed.map((row) => `${row.name}（${row.error || row.status}）`).join('；')}`,
                item: outcome.saved,
                commit: submission.commit,
                branch: submission.branch,
                pushed: false,
                repos: outcome.results,
              })
            }
            return sendJson(res, 200, {
              ok: true,
              item: outcome.saved,
              commit: submission.commit,
              branch: submission.branch,
              pushed: true,
              repos: outcome.results,
            })
          }
          const workRoot = await workRootOf(repo, item)
          const worktree = worktreeFor(repo, item)
          const paths = [...new Set((Array.isArray(body.paths) ? body.paths : []).map(relativePathSafe))]
          if (!paths.length && !body.pushOnly) throw new Error('请选择要提交的文件')
          const message = String(body.message ?? '').trim()
          const branchMode = body.branchMode === 'new' ? 'new' : 'current'
          const branchName = String(body.branchName ?? '').trim()
          const pushOnly = Boolean(body.pushOnly)
          if (!pushOnly && !message) throw new Error('请填写提交信息')
          if (branchMode === 'new' && !/^[A-Za-z0-9._/-]{1,80}$/.test(branchName)) {
            throw new Error('新分支名不合法：只允许字母/数字/._-/，长度 1~80')
          }

          // 先确认有远端：没有 remote 就没法 push，别让用户以为提交完就结束了
          const remotes = await git(workRoot, ['remote'])
          const remoteList = remotes.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
          if (!remoteList.length) throw new Error('这个仓库没有配置 git remote，无法 push；请先 git remote add origin <url>')
          const remote = remoteList.includes('origin') ? 'origin' : remoteList[0]
          const currentBranch = (await git(workRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
          const baselineBranch = await targetBranchForRepo(repo, item.baseline?.branch)
          const submittedBranch = await targetBranchForRepo(repo, item.workflow.submission?.branch)
          // 工作流的目标是开工时所在的分支（baseline），不是 worktree 的 devhub/<flow>。
          // 用户显式选择「新分支」时才推新分支。
          const targetBranch = branchMode === 'new' && !pushOnly
            ? branchName
            : (pushOnly ? (submittedBranch || baselineBranch) : baselineBranch) || currentBranch

          let branch = targetBranch
          if (!pushOnly && branchMode === 'new') {
            const exists = await git(workRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`])
            if (exists.ok) throw new Error(`分支已存在：${branchName}（换一个名字，或改用当前分支）`)
            const create = await git(workRoot, ['checkout', '-b', branchName])
            if (!create.ok) throw new Error(`创建分支失败：${(create.stderr || create.stdout).slice(-2000)}`)
            branch = branchName
          }

          let commitHash = (await git(workRoot, ['rev-parse', '--short', 'HEAD'])).stdout.trim()
          if (!pushOnly) {
            const add = await git(workRoot, ['add', '--', ...paths])
            if (!add.ok) throw new Error(`git add 失败：${(add.stderr || add.stdout).slice(-2000)}`)
            const commit = await git(workRoot, ['commit', '-m', message])
            if (!commit.ok) throw new Error(`git commit 失败：${(commit.stderr || commit.stdout).slice(-2000)}`)
            commitHash = (await git(workRoot, ['rev-parse', '--short', 'HEAD'])).stdout.trim()
          }

          // worktree 的 current 模式：把 HEAD 推到开工分支（必要时 rebase 远端新提交）。
          // 非 worktree / 新分支模式：沿用原 push 语义。
          let push
          if (worktree && branchMode !== 'new') {
            push = await pushWorktreeToTarget(workRoot, { remote, targetBranch })
          } else {
            const hasUpstream = (await git(workRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).ok
            const pushArgs = hasUpstream && branchMode !== 'new' && !pushOnly
              ? ['push', remote]
              : ['push', '-u', remote, branch]
            push = await git(workRoot, pushArgs, { timeout: 120000 })
          }
          const pushed = push.ok
          // rebase 到远端目标分支后 HEAD 会变：台账记录实际推送的提交，而不是 rebase 前的
          commitHash = (await git(workRoot, ['rev-parse', '--short', 'HEAD'])).stdout.trim() || commitHash
          const pushOutput = (push.stdout || push.stderr).slice(-4000)
          item.workflow.submission = {
            status: pushed ? 'pushed' : 'committed',
            branch,
            ...(worktree ? { worktreeBranch: worktree.branch } : {}),
            commit: commitHash,
            pushed,
            pushOutput,
            branchMode: pushOnly ? 'retry' : branchMode,
            at: new Date().toISOString(),
            message,
          }
          const saved = await saveItem(repo, appendHistory(item, 'submit',
            pushed ? `提交 ${commitHash} 并推送到 ${remote}/${branch}` : `提交 ${commitHash}，但推送失败`))
          if (!pushed) {
            return sendJson(res, 200, {
              ok: false,
              error: `已提交 ${commitHash}，但 push 失败：${pushOutput.slice(-500)}`,
              item: saved,
              commit: commitHash,
              branch,
              pushed: false,
              pushOutput,
              workRoot,
              ...(worktree ? { worktree } : {}),
            })
          }
          sendJson(res, 200, {
            ok: true,
            item: saved,
            commit: commitHash,
            branch,
            pushed,
            pushOutput,
            workRoot,
            ...(worktree ? { worktree } : {}),
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.switchRepo,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const body = await readBody(req)
          if (body.workspaceId) {
            const current = await loadProfile()
            const workspace = findWorkspace(current, String(body.workspaceId))
            if (!workspace) throw new Error(`虚拟库不存在：${body.workspaceId}`)
            const missing = []
            for (const path of workspace.repos ?? []) {
              if (!(await exists(path))) missing.push(path)
            }
            // 虚拟库不依赖“某个成员库先存在”：还有成员库路径有效就能切过来，
            // 失效成员在 state.members/警告里显式标出
            if (missing.length && missing.length === (workspace.repos ?? []).length) {
              throw new Error(`虚拟库「${workspace.name}」的成员库路径都不存在：${missing.join('、')}；请恢复目录或移除该虚拟库`)
            }
            current.activeRepo = `workspace:${workspace.id}`
            await saveProfile(current)
            await ensureWorkspaceLocalDir(workspace)
            const nextProfile = await loadProfile()
            const state = await stateFor(workspaceLocalDir(workspace), nextProfile, ctx)
            if (missing.length) {
              return sendJson(res, 200, {
                ...state,
                warnings: [`${missing.length} 个成员库路径已失效：${missing.join('、')}`],
              })
            }
            return sendJson(res, 200, state)
          }
          // 旧界面把虚拟库本机目录当代码库路径发过来：切回虚拟库，不建假库
          if (body.repoPath && isWorkspaceLocalRoot(body.repoPath)) {
            const current = await loadProfile()
            const matched = listWorkspaces(current).find((entry) => {
              try { return resolve(workspaceLocalDir(entry)) === resolve(body.repoPath) } catch { return false }
            }) ?? null
            if (!matched) throw new Error('这是本机虚拟库目录；请从虚拟库列表切换，不能当代码库打开')
            current.activeRepo = `workspace:${matched.id}`
            await saveProfile(current)
            await ensureWorkspaceLocalDir(matched)
            return sendJson(res, 200, await stateFor(workspaceLocalDir(matched), await loadProfile(), ctx))
          }
          const result = await initializeRepo({
            repoPath: body.repoPath,
            name: body.name,
            detect: body.detect !== false,
          })
          const profile = result.profile ?? await loadProfile()
          sendJson(res, 200, await stateFor(result.repo, profile, ctx))
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // ---------------------------------------------------------------- recon
    // 用户只说“我要做什么”：默认**真的调一次 dsh**（子代理读仓库），失败才回退本地关键词扫描。
    // 本地扫描是确定性的降级手段，不是主路径。
    {
      kind: 'exact',
      path: API.recon,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          // 聊天页显式带上“我正在看的代码库”：切库后旧聊天/旧组件不能拿 activeRepo 继续扫
          const explicitRepo = await requestedRepo(profile, body.repoPath)
          const scanRepo = explicitRepo ?? repo
          const description = String(body.description ?? '').trim()
          const attachments = normalizeAttachments(body.attachments)
          if (description.length < 4 && !attachments.length) throw new Error('描述太短：至少写一句“要开发什么”')
          // 虚拟库：逐成员库扫描（成员库平权，文件/范围带成员库前缀）。
          // 这里必须先分流：虚拟库的台账目录不是代码库，不等价于“某个代表库”。
          const activeWs = activeWorkspace(profile)
          if (activeWs && body.reconAll !== false) {
            const memberList = workspaceMembers(activeWs.repos)
            const mergedFiles = []
            const mergedScope = []
            const memberRows = []
            let scanned = 0
            let truncated = false
            for (const member of memberList) {
              try {
                const lexical = await reconWithIndex(member.path, description, { limit: 4 })
                scanned += Number(lexical.scanned) || 0
                truncated = truncated || Boolean(lexical.truncated)
                const files = (lexical.files ?? []).map((file) => ({
                  ...file,
                  path: `${member.name}/${file.path}`,
                  relPath: file.path,
                  repo: member.path,
                  repoName: member.name,
                }))
                mergedFiles.push(...files)
                for (const token of lexical.suggestedScope ?? []) mergedScope.push(`${member.name}:${token}`)
                memberRows.push({ repo: member.path, name: member.name, files: files.length, scanned: Number(lexical.scanned) || 0 })
              } catch (error) {
                memberRows.push({ repo: member.path, name: member.name, files: 0, error: String(error?.message ?? error) })
              }
            }
            const scope = [...new Set(mergedScope)].slice(0, 12)
            const files = mergedFiles.slice(0, 16)
            const repoNames = memberList.map((member) => member.name)
            const workspaceProject = (await loadProject(activeWs.localRoot))?.project ?? null
            const estimate = estimateWork({ recon: { files }, scope, commands: workspaceProject?.context?.commands ?? {}, repoNames })
            const model = (() => {
              const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
              return selection?.provider && selection?.model ? { provider: selection.provider, model: selection.model } : null
            })()
            return sendJson(res, 200, {
              ok: true,
              engine: 'local',
              engineLabel: '虚拟库多库扫描',
              workspace: {
                id: activeWs.workspace.id,
                name: activeWs.workspace.name,
                path: activeWs.localRoot,
                localPath: activeWs.localRoot,
                // 没有主库：只给完整成员列表，不指定“代表库”
                repos: [...activeWs.repos],
              },
              members: memberRows,
              files,
              scanned,
              truncated,
              questions: deriveQuestions({ description, recon: { files }, scope, answers: body.answers ?? {} }),
              estimate,
              suggestedScope: scope,
              draft: draftFromDescription(description),
              notes: `虚拟库「${activeWs.workspace.name}」：扫描 ${memberRows.length} 个成员库，各取前 4 个候选文件`,
              provenance: {
                engine: 'local',
                promptVersion: PROMPT_VERSION.scan,
                pluginVersion: pluginVersion(),
                model,
                specHash: specHash({ description, answers: body.answers ?? {}, scope }),
                outputHash: hashOf(files.map((file) => file.path).sort()),
              },
            })
          }
          const loaded = await loadProject(scanRepo)
          const conventions = await loadConventions(scanRepo)
          const project = loaded?.project
          const repoProfile = await detectRepoProfile(scanRepo)

          // 本地关键词扫描先跑一次：既用于补齐命中行，也是 dsh 不可用时的兜底候选集
          const lexical = await reconWithIndex(scanRepo, description)
          const mergeScan = (scan) => {
            const byPath = new Map(lexical.files.map((file) => [file.path, file]))
            const files = scan.files.map((entry) => {
              const hit = byPath.get(entry.path)
              return {
                path: entry.path,
                score: hit?.score ?? Math.round((entry.confidence === 'high' ? 30 : entry.confidence === 'medium' ? 20 : 10)),
                matches: hit?.matches ?? [],
                why: entry.why,
                confidence: entry.confidence,
                source: 'agent',
                exists: entry.exists !== false,
              }
            })
            // 扫描器只报少量高置信文件；本地关键词命中的其余文件不能丢（大改动会真实命中很多文件）
            const seen = new Set(files.map((file) => file.path))
            const keywordOnly = lexical.files
              .filter((file) => !seen.has(file.path))
              .map((file) => ({
                ...file,
                why: file.why ?? '本地关键词命中（未由扫描器确认）',
                confidence: file.confidence ?? 'medium',
                source: 'keyword',
                exists: true,
              }))
            const union = [...files, ...keywordOnly].slice(0, 120)
            const modules = [...new Set(union.map((file) => moduleOfPath(file.path)))]
              .filter(Boolean)
              .map((name) => ({ name, path: '', kind: 'agent', hits: union.filter((file) => moduleOfPath(file.path) === name).length }))
            const scope = scan.scope.length ? scan.scope : lexical.suggestedScope
            return {
              description,
              tokens: lexical.effectiveTokens ?? lexical.tokens,
              files: union,
              modules,
              suggestedScope: scope,
              scanned: lexical.scanned,
              truncated: lexical.truncated,
              matchedTotal: Math.max(Number(lexical.matchedTotal) || 0, union.length),
              truncatedFiles: Math.max(0, (Number(lexical.matchedTotal) || union.length) - union.length),
            }
          }
          let result = lexical
          let engine = 'local'
          let scanNotes = body.engine === 'local' ? '按本地关键词匹配（未调用 dsh）' : ''
          let elapsedMs = 0
          let scanSessionId = null
          if (body.engine !== 'local') {
            try {
              const scan = await scanWithDshAgent(ctx, {
                repo: scanRepo,
                repoName: loaded?.project?.name || repoName(scanRepo),
                description,
                limit: 24,
                // 先给候选：子代理验证/收敛比从零全仓探索快得多
                extraPrompt: [candidateHintPrompt(lexical), attachmentPrompt(attachments)].filter(Boolean).join('\n\n'),
              })
              engine = 'dsh'
              scanNotes = scan.notes || ''
              elapsedMs = scan.elapsedMs
              scanSessionId = scan.sessionId ?? null
              result = mergeScan(scan)
            } catch (error) {
              const dshError = String(error?.message ?? error)
              // 主路径不可用：先用默认模型基于本地候选做语义筛选（不依赖子代理 provider）
              try {
                const startedAt = Date.now()
                const scan = await scanWithLlm(ctx, {
                  repo: scanRepo,
                  repoName: loaded?.project?.name || repoName(scanRepo),
                  description,
                  candidates: lexical,
                  limit: 24,
                })
                engine = 'dsh-llm'
                elapsedMs = Date.now() - startedAt
                scanNotes = `子代理不可用，已用默认模型基于本地候选筛选：${dshError}`
                result = scan.files.length ? mergeScan(scan) : lexical
              } catch (llmError) {
                // 最后才退回纯本地关键词：明确说明两层降级原因，不假装成功
                engine = 'local'
                scanNotes = `dsh 扫描不可用，已回退本地关键词匹配：${dshError}；模型筛选也不可用：${String(llmError?.message ?? llmError)}`
              }
            }
          }

          // 工作站自己追问与自评，用户不需要填工程量
          const questions = deriveQuestions({ description, recon: result, project, conventions })
          const resultRepo = {
            repoPath: scanRepo,
            repoName: loaded?.project?.name || repoName(scanRepo),
          }
          const estimate = estimateWork({
            recon: result,
            scope: result.suggestedScope,
            commands: project?.context?.commands ?? {},
          })
          const model = (() => {
            const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
            return selection?.provider && selection?.model ? { provider: selection.provider, model: selection.model } : null
          })()
          const provenance = {
            engine,
            promptVersion: PROMPT_VERSION.scan,
            pluginVersion: pluginVersion(),
            model,
            specHash: specHash({ description, answers: body.answers ?? {}, scope: result.suggestedScope }),
            outputHash: hashOf(result.files?.map((file) => file.path).sort() ?? []),
          }
          sendJson(res, 200, {
            ok: true,
            ...result,
            ...resultRepo,
            engine,
            provenance,
            engineLabel: engine === 'dsh' ? 'DSH 扫描' : engine === 'dsh-llm' ? 'DSH 模型筛选' : '本地关键词兜底',
            scanNotes,
            scanSessionId,
            elapsedMs,
            repoProfile: repoProfile.language,
            questions,
            estimate,
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 工作站自己出计划：步骤/验收/风险/工程量都由这里算，用户不填
    {
      kind: 'exact',
      path: API.plan,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const description = String(body.description ?? '').trim()
          if (!description) throw new Error('缺少描述')
          const loaded = await loadProject(repo)
          const conventions = await loadConventions(repo)
          const target = workspaceTarget(profile)
          const repoNames = target?.members.map((member) => member.name) ?? []
          const recon = body.recon && typeof body.recon === 'object'
            ? body.recon
            : await reconRepo(repo, description)
          const plan = buildPlan({
            description,
            recon,
            scope: normalizeScope(body.scope ?? recon.suggestedScope),
            answers: body.answers && typeof body.answers === 'object' ? body.answers : {},
            project: loaded?.project,
            conventions,
            repoNames,
            // 显式传 analysis（手动切换/脚本建流程）时，计划也必须是只读分析，不能按描述降级回 bug
            intent: normalizeIntent(body.intent) ?? undefined,
          })
          // 澄清过的规格优先：计划摘要用规范化后的目标，不把客户原话当摘要
          if (body.spec && typeof body.spec === 'object') {
            const normalized = deriveRequirement({ description, spec: body.spec })
            if (normalized.goal && !normalized.needsReview) plan.summary = normalized.goal
          }
          const questions = deriveQuestions({
            description,
            recon,
            project: loaded?.project,
            conventions,
          })
          const answerSet = normalizeAnswers(body.answers ?? {})
          const provenance = {
            planHash: planHash(plan),
            inputHash: inputHash({
              description,
              answers: answerSet,
              scope: plan.modules?.length ? plan.modules : normalizeScope(body.scope ?? []),
              conventions,
            }),
            specHash: specHash({ description, answers: answerSet, scope: plan.modules ?? [] }),
            pluginVersion: pluginVersion(),
            promptVersion: PROMPT_VERSION.assist,
          }
          sendJson(res, 200, { ok: true, ...plan, planHash: provenance.planHash, inputHash: provenance.inputHash, provenance, questions })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 多轮需求澄清：用户一句话 → agent 追问 → 逐步问出问题/目标/验收/范围
    {
      kind: 'exact',
      path: API.clarify,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const description = String(body.description ?? '').trim()
          if (description.length < 2) throw new Error('先写一句要做什么')
          const round = Math.max(1, Math.min(MAX_ROUNDS, Number(body.round) || 1))
          const history = Array.isArray(body.history) ? body.history.slice(-12).map((turn) => ({ role: turn.role === 'user' ? 'user' : 'assistant', text: String(turn.text ?? '').slice(0, 2000) })) : []
          const recon = body.recon && typeof body.recon === 'object'
            ? { files: (body.recon.files ?? []).slice(0, 8), suggestedScope: body.recon.suggestedScope ?? body.recon.scope ?? [] }
            : null
          const spec = body.spec && typeof body.spec === 'object' ? body.spec : {}
          const attachments = normalizeAttachments(body.attachments)

          // 贴进来的日志/代码可能非常长：限制送进模型的上下文，避免还没问问题就先撑爆输出。
          // 完整 description 仍保留给本地降级与标题生成。
          const promptDescription = description.slice(0, 6000)
          const promptHistory = history.slice(-8).map((turn) => ({ role: turn.role, text: turn.text.slice(0, 1200) }))
          const clarifyPrompt = [attachmentPrompt(attachments), buildClarifyPrompt({ description: promptDescription, history: promptHistory, recon, spec, round })]
            .filter(Boolean)
            .join('\n')
          const compactClarifyPrompt = [attachmentPrompt(attachments), buildClarifyPrompt({ description: promptDescription.slice(0, 3000), history: promptHistory.slice(-4), recon, spec, round })]
            .filter(Boolean)
            .join('\n')
          const shortError = (error) => String(error?.message ?? error).replace(/\s+/g, ' ').slice(0, 600)
          try {
            const result = await runAgentJson(ctx, {
              cwd: repo,
              prompt: clarifyPrompt,
              schema: CLARIFY_SCHEMA,
              label: 'devhub-clarify',
              timeoutMs: 90000,
            })
            const normalized = normalizeClarify(result.value, { round })
            sendJson(res, 200, {
              ok: true,
              engine: 'dsh',
              elapsedMs: result.elapsedMs,
              sessionId: result.sessionId ?? null,
              ...normalized,
            })
            return
          } catch (error) {
            // 子代理不可用：先用默认模型按同一份澄清 prompt 兜底，避免直接退化成规则
            try {
              const startedAt = Date.now()
              // 兜底用更短的上下文与更大的输出预算；JSON 截断时 runLlmJson 也会尝试修复。
              const llmResult = await runLlmJson(ctx, { prompt: compactClarifyPrompt, maxTokens: 2600, timeoutMs: 60000 })
              const normalized = normalizeClarify(llmResult.value, { round })
              sendJson(res, 200, {
                ok: true,
                engine: 'dsh-llm',
                elapsedMs: Date.now() - startedAt,
                ...normalized,
              })
              return
            } catch (llmError) {
              // 最后一层：规则化追问；/clarify 的局部降级继续走下面
              const reason = `工作站澄清未完成：${shortError(error)}；模型澄清兜底也不可用：${shortError(llmError)}`
              var fallbackReason = reason
            }
            // 降级：用规则化追问，不让创建流程卡死；明确告诉界面这是本地规则
            const fallback = deriveQuestions({ description, recon, scope: recon?.suggestedScope ?? [], answers: {} })
            const questions = (fallback ?? []).slice(0, 2).map((question) => ({
              id: question.id,
              question: question.question,
              why: question.why ?? null,
              multiSelect: false,
              options: (question.options ?? []).map((option) => ({ label: String(option.label ?? option.value ?? option), description: option.description ?? null })),
            }))
            sendJson(res, 200, {
              ok: true,
              engine: 'local',
              degraded: true,
              reason: typeof fallbackReason === 'string' && fallbackReason ? fallbackReason : String(error?.message ?? error),
              round,
              // 降级时也给一个可用标题（否则流程会退化成用整句描述当标题）
              title: String(draftFromDescription(description).name ?? '').slice(0, 40),
              reply: questions.length ? '（工作站暂不可用，先用本地规则问两个关键问题）' : '（工作站暂不可用；可以直接确认后生成计划）',
              questions,
              ready: questions.length === 0,
              missing: [],
              spec,
            })
          }
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 需求规范化：把客户原话整理成可执行的目标/根因（旧流程也能一键补规范化）
    {
      kind: 'exact',
      path: API.requirement,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          // 批量整理弱标题（列表级动作）：按已有目标/主题生成，不重复调模型，立刻生效
          if (body.action === 'retitleWeak') {
            const changed = []
            for (const entry of await listItems(repo)) {
              if (!isWeakTitle(entry.title, entry.description)) continue
              const generated = String(entry.requirement?.title ?? '').trim()
              const title = generated && !isWeakTitle(generated, entry.description)
                ? generated
                : suggestFlowTitle({
                  description: entry.description,
                  goal: entry.goal,
                  intent: entry.workflow?.intent,
                  fallback: entry.title,
                })
              if (!title || isWeakTitle(title, entry.description)) continue
              const from = entry.title
              entry.title = title.slice(0, 40)
              await saveItem(repo, appendHistory(entry, 'requirement', `标题：${from} → ${entry.title}`))
              changed.push({ id: entry.id, from, to: entry.title })
            }
            return sendJson(res, 200, { ok: true, changed })
          }
          const item = body.id ? await readItemLocal(profile, repo, body.id) : null
          if (body.id && !item) throw new Error(`开发项不存在：${body.id}`)
          const description = String(body.description ?? item?.description ?? item?.goal ?? '').trim()
          if (!description) throw new Error('缺少原始需求（description）')
          const title = String(body.title ?? item?.title ?? '').trim()
          // 只重新生成标题：不动目标/根因/验收（旧流程的标题常是用户贴的代码/注解）
          if (body.regenerateTitle === true && item) {
            const before = item.title
            const regen = await regenerateItemTitle(ctx, repo, item)
            if (regen.title && !isWeakTitle(regen.title, item.description)) item.title = regen.title.slice(0, 40)
            const changed = item.title !== before
            const saved = await saveItem(repo, appendHistory(item, 'requirement',
              changed ? `标题：${before} → ${item.title}` : '标题没有变：没生成比原话更合适的标题（可手工改）'))
            return sendJson(res, 200, {
              ok: true,
              engine: regen.engine,
              elapsedMs: regen.elapsedMs,
              changed,
              title: saved.title,
              item: saved,
            })
          }
          let requirement
          let engine
          let elapsedMs = 0
          if (body.requirement && typeof body.requirement === 'object') {
            // 客户端已经确认过的结果：只做形状收敛，不再重复调模型
            requirement = normalizeRequirementRecord(body.requirement, { description, title })
            engine = requirement.source === 'agent' || requirement.source === 'clarify' ? 'dsh' : 'manual'
          } else {
            const normalized = await normalizeRequirementForCreate(ctx, repo, {
              description,
              spec: body.spec,
              answers: body.answers,
              title,
            })
            requirement = normalized.requirement
            engine = normalized.engine
            elapsedMs = normalized.elapsedMs
          }
          if (!item) return sendJson(res, 200, { ok: true, engine, elapsedMs, requirement })
          const titleBefore = item.title
          applyRequirementToItem(item, requirement)
          const titleNote = item.title !== titleBefore ? `；标题：${titleBefore} → ${item.title}` : ''
          const saved = await saveItem(repo, appendHistory(item, 'requirement',
            (requirement.needsReview
              ? `需求还没规范化（${requirement.degraded ? '工作站不可用时只能给本地草稿' : '目标/根因仍像客户原话'}）`
              : `需求已规范化：来源 ${requirement.source}${elapsedMs ? `，用时 ${elapsedMs}ms` : ''}`) + titleNote))
          sendJson(res, 200, {
            ok: true,
            engine,
            elapsedMs,
            ...(requirement.degraded ? { degraded: true, reason: requirement.reason ?? '' } : {}),
            requirement: saved.requirement,
            item: saved,
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 能力探测：当前模型是否支持图片输入（聊天框据此提示/禁用图片）
    {
      kind: 'exact',
      path: API.capabilities,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          sendJson(res, 200, { ok: true, ...(await attachmentCapabilities(ctx)) })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 附件上传：粘贴的截图/文件先落到本机附件目录，再把路径注入提示词（read_image / read）
    // 附件预览：只服务本机附件目录内的文件（浏览器不能直接读 file:// 绝对路径）
    {
      kind: 'exact',
      path: API.attachment,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET only' })
        try {
          const target = resolve(String(query(req.url, 'path') ?? '').trim())
          const dir = attachmentDir()
          if (!target || !isUnder(target, dir)) throw new Error('附件路径不在本机附件目录内')
          const info = await stat(target)
          if (!info.isFile()) throw new Error('不是文件')
          const ext = target.split('.').pop()?.toLowerCase() ?? ''
          const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' }[ext] ?? 'application/octet-stream'
          const data = await readFile(target)
          res.writeHead(200, {
            'content-type': type,
            'content-length': String(data.length),
            'cache-control': 'private, max-age=3600',
          })
          res.end(data)
        } catch (error) {
          sendJson(res, 404, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.attach,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const body = await readBody(req, { limit: ATTACHMENT_MAX_BYTES * 2 })
          const data = String(body.data ?? '')
          if (!data) throw new Error('缺少文件内容')
          const buffer = Buffer.from(data, 'base64')
          if (!buffer.length) throw new Error('文件内容为空')
          if (buffer.length > ATTACHMENT_MAX_BYTES) {
            throw new Error(`文件太大：${Math.round(buffer.length / 1024 / 1024)}MB（上限 ${Math.round(ATTACHMENT_MAX_BYTES / 1024 / 1024)}MB）`)
          }
          const mediaType = String(body.mediaType ?? '').trim().toLowerCase() || 'application/octet-stream'
          const isImage = /^image\//.test(mediaType)
          if (isImage && !isSupportedImageType(mediaType)) {
            throw new Error(`图片格式不支持：${mediaType}（支持 png / jpeg / webp / gif）`)
          }
          const dir = attachmentDir()
          await mkdir(dir, { recursive: true })
          const id = `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
          const name = safeAttachmentName(body.name, mediaType)
          const path = join(dir, `${id}-${name}`)
          await writeFile(path, buffer)
          return sendJson(res, 200, {
            ok: true,
            attachment: { id, name, path, mediaType, size: buffer.length, kind: isImage ? 'image' : 'file' },
            capabilities: await attachmentCapabilities(ctx),
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 忘掉一个代码库卡片（只删本机 profile 登记，不动磁盘）
    {
      kind: 'exact',
      path: API.removeRepo,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const body = await readBody(req)
          const input = String(body.repoPath ?? '').trim()
          if (!input) throw new Error('缺少 repoPath')
          const profile = await loadProfile()
          const key = await canonical(input).catch(() => input)
          // 失效目录的 realpath 可能拿不到（/private 前缀差异），再用 basename 兜一层
          const base = input.split(/[/\\]/).filter(Boolean).pop() ?? input
          const target = Object.keys(profile.repos ?? {}).find((entry) => entry === key
            || entry === input
            || (base && entry.split(/[/\\]/).filter(Boolean).pop() === base))
          if (!target) throw new Error(`这个代码库不在列表里：${input}`)
          delete profile.repos[target]
          if (profile.activeRepo === target || profile.activeRepo === input) {
            const next = Object.keys(profile.repos ?? {}).sort()[0] ?? null
            profile.activeRepo = next
          }
          await saveProfile(profile)
          const nextProfile = await loadProfile()
          const nextRepo = await activeRepo(nextProfile)
          sendJson(res, 200, {
            ok: true,
            removed: target,
            state: nextRepo ? await stateFor(nextRepo, nextProfile, ctx) : {
              ok: true,
              needsSetup: true,
              repo: null,
              items: [],
              profile: { repos: Object.keys(nextProfile.repos ?? {}), activeRepo: null, member: null, repoCards: [] },
            },
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 统一入口：一句话由 dsh 分诊（补台账 / 发开发会话 / 两者）
    {
      kind: 'exact',
      path: API.dispatch,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const message = String(body.message ?? '').trim()
          if (message.length < 2) throw new Error('说一句话再提交（至少两个字）')
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          const sessionId = item.session?.id ?? null
          const live = sessionId ? sessionState(ctx, sessionId) : null
          const loaded = await loadProject(repo)
          const hasSession = Boolean(sessionId)

          let decision
          let engine = 'dsh'
          try {
            const result = await runAgentJson(ctx, {
              cwd: repo,
              prompt: buildDispatchPrompt({
                item,
                message,
                session: live ? { running: live.running, turns: live.turns } : null,
              }),
              schema: DISPATCH_SCHEMA,
              label: 'devhub-dispatch',
              timeoutMs: 90000,
            })
            decision = normalizeDispatch(result.value, { hasSession })
            engine = 'dsh'
          } catch (error) {
            decision = normalizeDispatch(fallbackDispatch(message, { hasSession }), { hasSession })
            engine = 'local'
            decision.reply += `（自动分诊不可用：${String(error?.message ?? error)}）`
          }

          const applied = decision.action === 'ledger' || decision.action === 'both'
            ? applyAssistUpdates(item, decision.updates, { message })
            : []
          let saved = item
          if (applied.length || decision.action !== 'none') {
            saved = await saveItem(repo, appendHistory(item, 'dispatch',
              `${decision.action}：${message.slice(0, 120)}${applied.length ? `（${applied.join('、')}）` : ''}`))
          }
          sendJson(res, 200, {
            ok: true,
            engine,
            action: decision.action,
            reply: decision.reply,
            sessionMessage: decision.sessionMessage,
            applied,
            item: saved,
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 诊断：client 半是否被 web 收录（排查"插件像被卸载"）
    {
      kind: 'exact',
      path: '/api/dev-hub/debug-client',
      handler: async (req, res) => {
        try {
          const modules = ctx.get('clientModules')
          const graph = modules?.graph?.() ?? null
          const entries = graph?.entries ?? graph ?? null
          sendJson(res, 200, {
            ok: true,
            hasClientModules: Boolean(modules),
            ourPath: modules?.clientPath?.('dsh-dev-hub') ?? null,
            graphKeys: entries ? Object.keys(entries).slice(0, 20) : null,
            inGraph: Boolean(entries && (entries['dsh-dev-hub'] ?? entries.some?.((entry) => entry.id === 'dsh-dev-hub'))),
          })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 虚拟库：把多个代码库当成一个开发目标
    {
      kind: 'exact',
      path: API.workspaces,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          if (req.method === 'GET') {
            return sendJson(res, 200, {
              ok: true,
              workspaces: listWorkspaces(profile).map((entry) => ({
                ...entry,
                // 虚拟库自己的本机目录（台账/规范/上下文/证据），没有主库
                path: workspaceLocalDir(entry),
                localPath: workspaceLocalDir(entry),
              })),
            })
          }
          const body = await readBody(req)
          const previousActive = profile.activeRepo ?? null
          if (body.action === 'remove') {
            const removed = removeWorkspace(profile, body.id)
            // 删掉当前激活的虚拟库后回到“未选择代码库”，不自动跳进某个成员库
            // （成员库平权：不能因为它在列表里排第一就变成默认目标）
            if (String(profile.activeRepo ?? '').startsWith('workspace:') && !activeWorkspace(profile)) {
              profile.activeRepo = null
            }
            await saveProfile(profile)
            const repo = await activeRepo(profile)
            return sendJson(res, 200, { ok: true, removed, state: await stateFor(repo, profile, ctx) })
          }
          if (body.action === 'update') {
            const workspace = findWorkspace(profile, body.id)
            if (!workspace) throw new Error(`虚拟库不存在：${body.id}`)
            const previousRepos = [...(workspace.repos ?? [])]
            // 成员库平权：允许移除/替换任意成员（包括原来的第一个），只要求仍是 ≥2 个不同代码库
            const nextRepos = Array.isArray(body.repos) && body.repos.length
              ? await resolveWorkspaceRepos(body.repos)
              : previousRepos
            const added = nextRepos.filter((path) => !previousRepos.includes(path))
            const removed = previousRepos.filter((path) => !nextRepos.includes(path))
            // 新成员登记本机身份/环境缓存，代码库卡片与状态里才看得到它
            const memberName = workspace.member
              ?? Object.values(profile.repos ?? {}).map((entry) => entry?.member).find(Boolean)
              ?? '未命名开发者'
            const memberEnv = workspace.environment ?? null
            for (const path of added) {
              await setProfileForRepo(profile, path, {
                member: memberName,
                environment: profileForRepo(profile, path)?.environment ?? memberEnv,
                workspaceMember: workspace.id,
              }, { activate: false })
            }
            const updated = updateWorkspace(profile, workspace.id, {
              name: body.name ?? workspace.name,
              repos: nextRepos,
            })
            // 本机清单 + 已有流程的成员/baseline 一起收敛（虚拟库自己的台账，不碰成员库）
            await syncWorkspaceManifest(updated)
            await syncWorkspaceFlows(profile, updated, { added, memberNames: workspaceMembers(nextRepos) })
            await saveProfile(profile)
            const repo = await activeRepo(profile)
            return sendJson(res, 200, {
              ok: true,
              workspace: updated,
              added,
              removed,
              state: await stateFor(repo, profile, ctx),
            })
          }
          if (body.action === 'rename') {
            const workspace = renameWorkspace(profile, body.id, body.name)
            await saveProfile(profile)
            const repo = await activeRepo(profile)
            return sendJson(res, 200, { ok: true, workspace, state: await stateFor(repo, profile, ctx) })
          }
          let created = null
          try {
            created = await initializeWorkspace({ name: body.name, repos: body.repos, member: body.member })
          } catch (error) {
            // 初始化失败不能留下半个虚拟库：把刚登记的条目回滚掉
            const broken = await loadProfile()
            if (created?.workspace?.id) removeWorkspace(broken, created.workspace.id)
            else {
              const match = listWorkspaces(broken).find((entry) => entry.name === String(body.name ?? '').trim())
              if (match) removeWorkspace(broken, match.id)
            }
            if (!activeWorkspace(broken)) {
              const previousWorkspace = String(previousActive ?? '').startsWith('workspace:')
                ? findWorkspace(broken, String(previousActive).slice('workspace:'.length))
                : null
              broken.activeRepo = previousWorkspace
                ? previousActive
                : (previousActive && await exists(previousActive) ? previousActive : null)
            }
            await saveProfile(broken)
            throw error
          }
          sendJson(res, 200, {
            ok: true,
            workspace: created.workspace,
            // 本机独立存储位置：台账/规范/上下文/证据都写这里
            localPath: created.localRoot,
            skills: created.skills ?? null,
            state: await stateFor(created.localRoot, created.profile, ctx),
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 删除一个开发流程（台账级删除；代码与会话不动）
    {
      kind: 'exact',
      path: API.deleteItem,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const id = String(body.id ?? '').trim()
          if (!id) throw new Error('缺少流程 id')
          const existing = await getItem(repo, id)
          if (!existing) throw new Error(`开发流程不存在：${id}`)
          // 删台账不动代码/会话；独立工作区只清理本机目录（分支保留，提交还在）。
          // 还绑定着会话时先不删目录，避免把正在运行的开发会话 cwd 拆掉。
          if (!existing.session?.id) {
            const deleteTarget = workspaceTarget(profile, existing, repo)
            if (deleteTarget) {
              for (const member of deleteTarget.members) {
                if (!member.worktree) continue
                await removeFlowWorktree(member.path, {
                  id: memberWorktreeItemId(existing.id, member.name),
                }).catch(() => {})
              }
            } else if (existing.workflow?.worktree?.branch) {
              await removeFlowWorktree(repo, existing).catch(() => {})
            }
          }
          const deleted = await deleteItem(repo, id)
          if (!deleted) throw new Error(`开发流程不存在：${id}`)
          if (clearItemWorkspace(profile, repo, id)) await saveProfile(profile)
          if (isWorkspaceLocalRoot(repo)) {
            // 虚拟库：上下文/证据留档一起清掉（台账已由 deleteItem 处理）
            const active = activeWorkspace(profile)
            if (active) await removeWorkspaceItemArtifacts(active.workspace, id)
          }
          sendJson(res, 200, { ok: true, deleted: true, id })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 自动补「修改意义」：开发/查看变更时由 agent 生成，不需要用户逐条填
    {
      kind: 'exact',
      path: API.genFileNotes,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          const target = workspaceTarget(profile, item, repo)
          let summary
          if (target) {
            // 虚拟库：逐个成员库收集变更，说明 key 用 `<成员库>/<路径>`，避免同名文件串台
            summary = { files: [], excludedCount: 0 }
            for (const [index, member] of target.members.entries()) {
              const root = member.workRoot ?? member.path
              if (!(await exists(root)) || !(await isGitRepo(root))) continue
              const base = baselineForMember(target.baseline, member)
              const memberSummary = await flowFileChanges(root, base ?? null)
              summary.excludedCount += memberSummary.excludedCount ?? 0
              for (const file of memberSummary.files ?? []) {
                summary.files.push({
                  ...file,
                  key: `${member.name}/${file.path}`,
                  displayPath: `${member.name}/${file.path}`,
                  repo: root,
                  workRoot: root,
                  repoName: member.name,
                  repoPath: file.path,
                  path: `${member.name}/${file.path}`,
                })
              }
            }
          } else {
            summary = await flowFileChanges(await workRootOf(repo, item), item.baseline ?? null)
          }
          const limit = Math.max(1, Math.min(8, Number(body.limit) || 8))
          const targets = filesNeedingNotes(summary.files, item, limit)
          if (!targets.length) return sendJson(res, 200, { ok: true, generated: [], skipped: summary.files.length, engine: 'none' })

          // 每个文件取小段 diff 摘录，控制 token
          const excerpts = {}
          for (const file of targets) {
            try {
              const diffRepo = file.repo ?? (target ? repo : await workRootOf(repo, item))
              const diffPath = file.repoPath ?? file.path
              const diffBase = target
                ? baselineForMember(target.baseline, memberByRef(target.members, diffRepo))
                : item.baseline ?? null
              const diff = await fileDiff(diffRepo, { path: diffPath, baseline: diffBase ?? null, maxLines: 60 })
              excerpts[file.path] = (diff.lines ?? []).map((line) => line.text).join('\n').slice(0, 3000)
            } catch {
              excerpts[file.path] = ''
            }
          }

          let result
          try {
            result = await runAgentJson(ctx, {
              cwd: repo,
              prompt: buildFileNotePrompt({ item, files: targets, excerpts }),
              schema: FILE_NOTE_SCHEMA,
              label: 'devhub-file-notes',
              timeoutMs: 90000,
            })
          } catch (error) {
            return sendJson(res, 200, {
              ok: false,
              generated: [],
              skipped: summary.files.length,
              engine: 'dsh',
              error: `自动补说明暂不可用：${String(error?.message ?? error)}`,
            })
          }

          const applied = applyAgentNotes(item, targets, result.value?.notes)
          const saved = applied.length ? await saveItem(repo, item) : item
          sendJson(res, 200, { ok: true, generated: applied, skipped: summary.files.length, engine: 'dsh', elapsedMs: result.elapsedMs, item: saved })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 给某个变更文件补「修改意义」（人工/对话补充，覆盖默认解释）
    {
      kind: 'exact',
      path: API.fileNote,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          const path = String(body.path ?? '').trim()
          if (!path || path.includes('..')) throw new Error('非法的文件路径')
          const note = String(body.note ?? '').trim().slice(0, 500)
          item.fileNotes ??= {}
          if (!note) delete item.fileNotes[path]
          else item.fileNotes[path] = { note, source: body.source === 'assist' ? 'assist' : 'human', at: new Date().toISOString() }
          const saved = await saveItem(repo, appendHistory(item, 'note', note ? `补充文件说明：${path}` : `清除文件说明：${path}`))
          sendJson(res, 200, { ok: true, item: saved, note: note || null, source: note ? (body.source === 'assist' ? 'assist' : 'human') : null })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 流程变更预览：改了哪些文件（已提交 + 工作区），以及单个文件的 diff
    {
      kind: 'exact',
      path: API.files,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const item = await readItemLocal(profile, repo, query(req.url, 'itemId'))
          if (!item) throw new Error('开发项不存在')
          sendJson(res, 200, await collectItemFiles({ repo, item, profile }))
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 每个流程一份可点击查看的开发报告：目标背景 / 改动范围 / 测试报告（+ 计划、过程、证据）
    {
      kind: 'exact',
      path: API.report,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          let id = ''
          let format = ''
          let shouldSave = false
          if (req.method === 'GET') {
            id = query(req.url, 'id')
            format = String(query(req.url, 'format') ?? '').toLowerCase()
            const save = String(query(req.url, 'save') ?? '').toLowerCase()
            shouldSave = save === '1' || save === 'true'
          } else if (req.method === 'POST') {
            const body = await readBody(req)
            id = String(body.id ?? '')
            format = String(body.format ?? '').toLowerCase()
            shouldSave = body.action === 'save' || body.save === true
          } else {
            return sendJson(res, 405, { ok: false, error: 'GET/POST only' })
          }
          if (!String(id).trim()) throw new Error('缺少 id')
          const item = await readItemLocal(profile, repo, id)
          if (!item) throw new Error(`开发项不存在：${id}`)
          const files = await collectItemFiles({ repo, item, profile })
          const git = await gitEvidenceOf(repo, item, profile)
          const target = workspaceTarget(profile, item, repo)
          const workspace = target
            ? {
                id: target.workspace.id,
                name: target.workspace.name,
                path: target.localRoot,
                localPath: target.localRoot,
                members: target.members.map((member) => ({ name: member.name, path: member.workRoot ?? member.path })),
              }
            : null
          const report = buildReport({ item, files, git, workspace })
          const markdown = renderReportMarkdown(report)
          const html = renderReportHtml(report)
          if (format === 'markdown') return sendText(res, 200, 'text/markdown; charset=utf-8', markdown)
          if (format === 'html') return sendText(res, 200, 'text/html; charset=utf-8', html)
          let saved = null
          if (shouldSave) saved = await writeReportFiles(repo, item.id, markdown, html)
          sendJson(res, 200, { ok: true, report, markdown, ...(saved ? { saved } : {}) })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.diff,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const item = await readItemLocal(profile, repo, query(req.url, 'itemId'))
          if (!item) throw new Error('开发项不存在')
          const path = query(req.url, 'path')
          if (!path) throw new Error('缺少 path')
          const target = workspaceTarget(profile, item, repo)
          if (!target) {
            const workRoot = await workRootOf(repo, item)
            const worktree = worktreeFor(repo, item)
            const file = await fileDiff(workRoot, { path, baseline: item.baseline ?? null })
            return sendJson(res, 200, {
              ok: true,
              file,
              workRoot,
              ...(worktree ? { worktree } : {}),
            })
          }
          const split = splitRepoScopedPath(path, target.members)
          const member = split?.member ?? memberByRef(target.members, query(req.url, 'repo') ?? '')
          // 成员库平权：没有“默认第一个成员库”，无法定位就显式报错
          if (!member) throw new Error('无法确定 diff 属于哪个成员库：请带成员前缀（<成员库>/<路径>）或 repo 参数')
          const rel = split?.path ?? path
          const base = baselineForMember(target.baseline, member)
          const root = member.workRoot ?? member.path
          const file = await fileDiff(root, { path: rel, baseline: base ?? null })
          sendJson(res, 200, { ok: true, file, repo: root, workRoot: root, repoName: member.name, path: rel })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 运行模板验收项（只跑台账里登记的命令，不接受任意命令）
    {
      kind: 'exact',
      path: API.check,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          const check = (item.checks ?? []).find((entry) => entry.id === body.checkId)
          if (!check) throw new Error(`验收项不存在：${body.checkId}`)
          if (!check.command) throw new Error('这条验收没有配置命令，请人工确认后标注')
          const target = workspaceTarget(profile, item, repo)
          let result
          if (target) {
            // 虚拟库：验收命令按成员库分别执行（成员库平权，不挑代表库）；没配/不是 git 的显式跳过
            const rows = []
            for (const member of target.members) {
              const root = member.workRoot ?? member.path
              if (!(await exists(root))) {
                rows.push({ path: member.path, workRoot: root, name: member.name, skipped: true, status: 'not_run', output: '成员库工作区不存在', durationMs: null })
                continue
              }
              const single = await runConfiguredCommand(root, check.command)
              rows.push({ path: member.path, workRoot: root, name: member.name, skipped: false, status: single.status, output: single.output, durationMs: single.durationMs })
            }
            const ran = rows.filter((row) => !row.skipped)
            const status = ran.length && ran.every((row) => row.status === 'passed') ? 'passed' : 'failed'
            result = {
              status,
              command: check.command,
              output: rows.map((row) => `[${row.name}] ${row.skipped ? '跳过' : row.status}\n${row.output ?? ''}`).join('\n\n').slice(-120000),
              durationMs: rows.reduce((sum, row) => sum + (row.durationMs ?? 0), 0),
              repos: rows,
            }
          } else {
            result = await runConfiguredCommand(await workRootOf(repo, item), check.command)
          }
          item.checks = (item.checks ?? []).map((entry) => entry.id === check.id
            ? { ...entry, status: result.status === 'passed' ? 'passed' : 'failed', at: new Date().toISOString(), output: result.output }
            : entry)
          const saved = await saveItem(repo, appendHistory(item, 'check', `验收「${check.text}」：${result.status}`))
          sendJson(res, 200, { ok: result.status === 'passed', item: saved, result })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 计划回放：用记录下来的输入重算并对比指纹（判断"是输入变了还是计划过期"）
    {
      kind: 'exact',
      path: API.repro,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          const loaded = await loadProject(repo)
          const conventions = await loadConventions(repo)
          const result = reproPlan(item, { project: loaded?.project, conventions })
          let saved = null
          if (body.save) {
            recordProvenance(item, 'plan', {
              hash: result.current.hash,
              inputHash: result.current.inputHash,
              specHash: result.current.specHash,
              pluginVersion: pluginVersion(),
            })
            saved = await saveItem(repo, appendHistory(item, 'repro', '重算计划并记录指纹'))
          }
          sendJson(res, 200, { ok: true, ...result, item: saved })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 待答问题：开发会话卡在 ask_user_question 时，工作站就地作答（不用跳会话页）
    {
      kind: 'exact',
      path: API.pending,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const item = await readItemLocal(profile, repo, query(req.url, 'itemId'))
          if (!item) throw new Error('开发项不存在')
          const sessionId = item.session?.id ?? null
          if (!sessionId) return sendJson(res, 200, { ok: true, pending: [], reason: '未绑定会话' })
          const approvals = readPendingApprovals(ctx, sessionId)
          sendJson(res, 200, { ok: true, ...readPendingQuestions(ctx, sessionId), approvals: approvals.approvals ?? [] })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.answer,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          const sessionId = item.session?.id
          if (!sessionId) throw new Error('该流程还没有绑定开发会话')
          const answers = Array.isArray(body.answers) ? body.answers : []
          if (!answers.length) throw new Error('缺少答案')
          const result = await answerPendingQuestion(ctx, sessionId, String(body.callId ?? ''), answers)
          const after = readPendingQuestions(ctx, sessionId)
          const saved = await saveItem(repo, appendHistory(item, 'answer', `在工作站回答会话提问：${String(body.callId ?? '')}`))
          sendJson(res, 200, { ok: true, accepted: result.accepted, pending: after.pending, reason: after.reason, item: saved })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 对话式补充：用户说一句话，agent 把它整理进台账（目标/验收/任务/风险/计划…）
    {
      kind: 'exact',
      path: API.assist,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const message = String(body.message ?? '').trim()
          if (message.length < 2) throw new Error('说一句话再提交（至少两个字）')
          const loaded = await loadProject(repo)
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)

          let result
          try {
            result = await runAgentJson(ctx, {
              cwd: repo,
              prompt: buildAssistPrompt({
                item,
                message,
                repoName: loaded?.project?.name || repoName(repo),
              }),
              schema: ASSIST_SCHEMA,
              label: 'devhub-assist',
              timeoutMs: 120000,
            })
          } catch (error) {
            throw new Error(`对话式补充暂不可用（${String(error?.message ?? error)}）；可以先手动编辑，稍后再试`)
          }

          const value = result.value ?? {}
          const applied = applyAssistUpdates(item, value.updates, { message })
          const reply = String(value.reply ?? '').trim() || (applied.length ? `已更新：${applied.join('、')}` : '这次没有需要改动的内容。')
          const next = applied.length
            ? appendHistory(item, 'assist', `对话补充：${message.slice(0, 200)}`)
            : appendHistory(item, 'assist-reply', `对话（无变更）：${message.slice(0, 200)}`)
          const saved = await saveItem(repo, appendHistory(next, 'assist-reply', reply))
          sendJson(res, 200, {
            ok: true,
            engine: 'dsh',
            elapsedMs: result.elapsedMs,
            reply,
            ask: String(value.ask ?? '').trim() || null,
            applied,
            item: saved,
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 跨代码库反查：某个会话属于哪个仓库的哪个流程（会话页显示"你在哪个开发站"）
    {
      kind: 'exact',
      path: API.lookup,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const sessionId = String(query(req.url, 'sessionId') ?? '').trim()
          if (!sessionId) throw new Error('缺少 sessionId')
          const profile = await loadProfile()
          const matches = []
          for (const repoPath of Object.keys(profile.repos ?? {})) {
            if (!(await exists(repoPath))) continue
            const loaded = await loadProject(repoPath)
            if (!loaded) continue
            const items = await listItems(repoPath)
            for (const item of items) {
              if (item.session?.id !== sessionId) continue
              matches.push({
                repo: { path: repoPath, name: loaded.project.name || repoName(repoPath) },
                item: { id: item.id, title: item.title, status: item.status, stage: item.workflow?.stage ?? null },
              })
            }
          }
          // 虚拟库的流程在本机独立目录：同样支持反查（target.kind 让界面知道这是虚拟库）
          for (const workspace of listWorkspaces(profile)) {
            const localRoot = workspaceLocalDir(workspace)
            await ensureWorkspaceLocalDir(workspace)
            const loaded = await loadProject(localRoot)
            if (!loaded) continue
            for (const item of await listItems(localRoot)) {
              if (item.session?.id !== sessionId) continue
              matches.push({
                repo: { path: localRoot, name: workspace.name, kind: 'virtual-workspace' },
                workspace: { id: workspace.id, name: workspace.name, path: localRoot },
                item: { id: item.id, title: item.title, status: item.status, stage: item.workflow?.stage ?? null },
              })
            }
          }
          sendJson(res, 200, { ok: true, sessionId, matches })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 会话管理页展开对话：不要求属于当前活动仓库，活会话/历史会话都能读
    {
      kind: 'exact',
      path: API.sessionTranscript,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const sessionId = String(query(req.url, 'sessionId') ?? '').trim()
          if (!sessionId) throw new Error('缺少 sessionId')
          const limitRaw = Number(query(req.url, 'limit'))
          const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 80
          sendJson(res, 200, { ok: true, ...(await sessionTranscript(ctx, sessionId, { limit })) })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 内嵌会话内容：工作站直接读最近对话，不用跳到会话页
    {
      kind: 'exact',
      path: API.sessionLog,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const item = await readItemLocal(profile, repo, query(req.url, 'itemId'))
          if (!item) throw new Error('开发项不存在')
          const limitRaw = Number(query(req.url, 'limit'))
          const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 30
          // 审核员等子会话不属于 item.session：允许显式指定 sessionId 读取它的只读动态。
          const sessionId = String(query(req.url, 'sessionId') ?? '').trim() || item.session?.id
          sendJson(res, 200, {
            ok: true,
            itemId: item.id,
            state: sessionId ? sessionState(ctx, sessionId) : null,
            ...sessionLog(ctx, sessionId, { limit }),
            // 时间线：带工具调用（"正在做什么"），界面用它渲染可读的会话动态
            items: sessionId ? (sessionTimeline(ctx, sessionId, { limit: Math.max(limit, 40) }).items ?? []) : [],
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // ---------------------------------------------------------------- skills
    // 通用 skills（本工作站自带的规范包）：安装/卸载/自定义约束，直接写 .dev-hub/conventions.json
    // 自动化设置：默认完全自动化；只控制工作站推进（评审/本机自测/环境测试），
    // 提交与推送仍由人确认。
    {
      kind: 'exact',
      path: API.settings,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repoPathForSettings = await activeRepo(profile)
          if (req.method === 'GET') {
            return sendJson(res, 200, { ok: true, automation: normalizeAutomation(profile.automation) })
          }
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'GET/POST only' })
          const body = await readBody(req)
          profile.automation = normalizeAutomation(body?.automation ?? body)
          await saveProfile(profile)
          // 开关要立刻影响已有流程，而不是只影响下一条新建流程。
          // 只改 workflow.reviewEnabled，不碰评审历史/测试结论。
          const enabled = profile.automation.reviewEnabled !== false
          const paths = new Set([
            repoPathForSettings,
            ...Object.keys(profile.repos ?? {}),
            ...(profile.workspaces ?? []).map((entry) => workspaceLocalDir(entry)),
          ].filter(Boolean))
          for (const path of paths) {
            let items = []
            try { items = await listItems(path) } catch { continue }
            for (const item of items) {
              if (!item?.workflow) continue
              if (item.workflow.reviewEnabled === enabled) continue
              item.workflow.reviewEnabled = enabled
              await saveItem(path, item).catch(() => {})
            }
          }
          return sendJson(res, 200, { ok: true, automation: profile.automation })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.skills,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const repoProfile = await ledgerRepoProfile(profile, repo)
          const loaded = await loadProject(repo)
          let conventions = await loadConventions(repo)

          const view = () => {
            const installedIds = new Set((conventions?.installedSkills ?? []).map((entry) => entry.id))
            return {
              profile: repoProfile.language,
              frontend: Boolean(repoProfile.frontend),
              frameworks: repoProfile.frameworks ?? [],
              installed: (conventions?.installedSkills ?? []).map((entry) => ({
                ...entry,
                constraints: (conventions.constraints ?? []).filter((constraint) => constraint.skill === entry.id).length,
              })),
              catalog: catalogFor(repoProfile.language).map((pack) => ({
                id: pack.id,
                name: pack.name,
                level: pack.level,
                description: pack.description,
                appliesTo: pack.appliesTo,
                autoInstall: pack.autoInstall ?? [],
                constraints: (pack.constraints ?? []).length,
                installed: installedIds.has(pack.id),
              })),
              constraints: (conventions?.constraints ?? []).map((entry) => ({
                ...entry,
                builtin: entry.skill !== 'custom',
              })),
              commands: Object.keys(conventions?.commands ?? {}),
              path: repoRelative(ledgerRelativeBase(repo), conventionsPath(repo)),
            }
          }

          if (req.method === 'GET') {
            if (!conventions) {
              return sendJson(res, 200, { ok: true, firstRun: true, ...view() })
            }
            return sendJson(res, 200, { ok: true, firstRun: false, ...view() })
          }
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'GET/POST only' })

          const body = await readBody(req)
          const action = String(body.action ?? '')
          // 没有 conventions 时，先按默认技能集合生成（安装动作也可直接触发）
          if (!conventions) {
            conventions = buildDefaultConventions({
              repo,
              name: loaded?.project?.name ?? repoName(repo),
              profile: repoProfile,
              context: loaded?.project?.context,
            })
          }

          if (action === 'install') {
            const result = installSkill(conventions, String(body.skillId ?? ''))
            conventions = await saveConventions(repo, result.conventions)
            return sendJson(res, 200, { ok: true, changed: result.changed, conventions, ...view() })
          }
          if (action === 'uninstall') {
            const result = uninstallSkill(conventions, String(body.skillId ?? ''))
            conventions = await saveConventions(repo, result.conventions)
            return sendJson(res, 200, { ok: true, changed: result.changed, conventions, ...view() })
          }
          if (action === 'regenerate') {
            conventions = await saveConventions(repo, regenerateConventions(conventions))
            return sendJson(res, 200, { ok: true, conventions, ...view() })
          }
          if (action === 'addConstraint') {
            const result = addCustomConstraint(conventions, body.constraint ?? {})
            conventions = await saveConventions(repo, result.conventions)
            return sendJson(res, 200, { ok: true, constraints: view().constraints, conventions })
          }
          if (action === 'updateConstraint') {
            const result = updateConstraint(conventions, body.constraint ?? {})
            conventions = await saveConventions(repo, result.conventions)
            return sendJson(res, 200, { ok: true, constraints: view().constraints, conventions })
          }
          if (action === 'removeConstraint') {
            const result = removeConstraint(conventions, String(body.id ?? ''))
            conventions = await saveConventions(repo, result.conventions)
            return sendJson(res, 200, { ok: true, constraints: view().constraints, conventions })
          }
          throw new Error(`未知技能动作：${action || '(空)'}`)
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 诊断用：列出当前进程里活着的 agent / session id，便于手动绑定排查
    {
      kind: 'exact',
      path: '/api/dev-hub/agents',
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const agents = ctx.get('agents')
          const sessions = ctx.get('sessions')
          const subagents = ctx.get('subagents')
          const agentIds = (agents?.list?.() ?? []).map((agent) => agent.id)
          const sessionIds = (sessions?.list?.() ?? []).map((session) => session.id)
          sendJson(res, 200, {
            ok: true,
            agentIds,
            sessionIds,
            subagentProviders: typeof subagents?.list === 'function' ? subagents.list() : null,
            hasSubagentService: Boolean(subagents),
            hasGetProvider: typeof subagents?.getProvider === 'function',
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // ---------------------------------------------------------------- session
    // 流程 ↔ 开发会话的绑定与状态：工作站要能追踪"这条流程的会话现在在干什么"。
    {
      kind: 'exact',
      path: API.session,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const body = await readBody(req)
          const item = await readItemLocal(profile, repo, body.id)
          if (!item) throw new Error(`开发项不存在：${body.id}`)
          const action = String(body.action ?? 'bind')
          if (action === 'bind') {
            const sessionId = String(body.sessionId ?? '').trim()
            if (!sessionId) throw new Error('缺少 sessionId')
            const now = new Date().toISOString()
            // 换绑到另一个会话时，旧会话进历史：不丢“之前聊到哪”，也能一键继续
            if (item.session?.id && item.session.id !== sessionId) {
              const previous = sessionState(ctx, item.session.id)
              item.sessionHistory = [
                ...(item.sessionHistory ?? []),
                {
                  id: item.session.id,
                  boundAt: item.session.boundAt ?? null,
                  unboundAt: now,
                  turns: previous?.turns ?? null,
                },
              ].slice(-20)
            }
            item.session = { id: sessionId, boundAt: now, updatedAt: now }
            const saved = await saveItem(repo, appendHistory(item, 'session', `绑定开发会话：${sessionId}`))
            return sendJson(res, 200, { ok: true, item: saved, session: sessionState(ctx, sessionId) })
          }
          if (action === 'unbind') {
            const previous = item.session?.id ?? null
            item.session = null
            const saved = await saveItem(repo, appendHistory(item, 'session', `解绑开发会话：${previous ?? '（无）'}`))
            return sendJson(res, 200, { ok: true, item: saved })
          }
          throw new Error(`未知会话动作：${action}`)
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.sessions,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const items = await listItems(repo)
          sendJson(res, 200, { ok: true, ...sessionStates(ctx, items) })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // 会话管理：开发/评审/扫描/澄清等会话分类、归档、置顶、在 Workspace 中显示
    {
      kind: 'exact',
      path: API.managedSessions,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          if (req.method === 'GET') {
            return sendJson(res, 200, { ok: true, ...(await managedSessionsFor(ctx, profile)) })
          }
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'GET/POST only' })
          const body = await readBody(req)
          const result = await applyManagedSessionAction(ctx, body)
          return sendJson(res, 200, {
            ok: true,
            ...result,
            catalog: await managedSessionsFor(ctx, profile),
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    // ---------------------------------------------------------------- wizard
    // 进入开发站的入口：问要开发什么 → 生成名字 → 选目录/模块 → 首次先落规范。
    {
      kind: 'exact',
      path: API.modules,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          // 虚拟库：逐成员库给模块建议，路径统一 `<label>:<rel>`，成员库平权
          const active = activeWorkspace(profile)
          if (isWorkspaceLocalRoot(repo) && active) {
            const modules = await workspaceModuleSuggestions(active)
            const repoProfile = await ledgerRepoProfile(profile, repo)
            return sendJson(res, 200, {
              ok: true,
              modules,
              profile: 'virtual',
              language: repoProfile.language,
              frameworks: repoProfile.frameworks,
            })
          }
          const modules = await suggestModules(repo)
          const repoProfile = await detectRepoProfile(repo)
          sendJson(res, 200, { ok: true, modules, profile: repoProfile.language })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.conventions,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const loaded = await loadProject(repo)
          const repoProfile = await ledgerRepoProfile(profile, repo)
          const build = () => buildDefaultConventions({
            repo,
            name: loaded?.project?.name ?? repoName(repo),
            profile: repoProfile,
            context: loaded?.project?.context,
          })

          if (req.method === 'GET') {
            const conventions = await loadConventions(repo)
            return sendJson(res, 200, {
              ok: true,
              firstRun: !conventions,
              path: repoRelative(ledgerRelativeBase(repo), conventionsPath(repo)),
              conventions,
              summary: summarizeConventions(conventions),
            })
          }
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'GET/POST only' })

          const body = await readBody(req)
          const action = String(body.action ?? '')
          if (action === 'regenerate' || action === 'bootstrap') {
            const saved = await saveConventions(repo, build())
            return sendJson(res, 200, { ok: true, conventions: saved, summary: summarizeConventions(saved) })
          }
          if (action === 'update') {
            const patch = body.conventions && typeof body.conventions === 'object' ? body.conventions : {}
            const current = await loadConventions(repo) ?? build()
            const saved = await saveConventions(repo, { ...current, ...patch })
            return sendJson(res, 200, { ok: true, conventions: saved, summary: summarizeConventions(saved) })
          }
          throw new Error(`未知规范动作：${action || '(空)'}`)
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.parallel,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const items = await listItems(repo)
          const overview = parallelOverview(items)
          const flows = items.map((item) => ({
            id: item.id,
            title: item.title,
            status: item.status,
            stage: item.workflow?.stage ?? null,
            scope: item.scope ?? [],
            scopeModules: item.scopeModules ?? [],
            updatedAt: item.updatedAt,
          }))
          sendJson(res, 200, { ok: true, ...overview, flows })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.wizard,
      handler: async (req, res) => {
        if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
        try {
          const profile = await loadProfile()
          const repo = await activeRepo(profile)
          if (!repo) throw new Error('尚未选择代码库')
          const loaded = await loadProject(repo)
          if (!loaded) throw new Error('代码库尚未初始化')
          const items = await listItems(repo)
          const conventions = await loadConventions(repo)
          const firstRun = !conventions
          const overview = parallelOverview(items)

          if (req.method === 'GET') {
            const description = query(req.url, 'description') ?? ''
            const activeTarget = activeWorkspace(profile)
            // 虚拟库与单库的入口形态不同：模块建议逐成员库给（带前缀），没有“代表库”
            const modules = activeTarget
              ? await workspaceModuleSuggestions(activeTarget)
              : await suggestModules(repo)
            return sendJson(res, 200, {
              ok: true,
              repo: {
                path: repo,
                name: activeTarget ? activeTarget.workspace.name : (loaded.project.name || repoName(repo)),
                kind: activeTarget ? 'virtual-workspace' : 'repo',
              },
              ...(activeTarget
                ? {
                    workspace: {
                      id: activeTarget.workspace.id,
                      name: activeTarget.workspace.name,
                      path: activeTarget.localRoot,
                      localPath: activeTarget.localRoot,
                      members: workspaceMembers(activeTarget.repos).map((member) => member.name),
                    },
                  }
                : {}),
              firstRun,
              conventions: summarizeConventions(conventions),
              steps: WIZARD_STEPS.map((step) => ({ id: step.id, label: step.label, hint: step.hint })),
              suggested: wizardSuggestion(description),
              modules,
              active: overview.active,
              parallel: overview,
            })
          }
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'GET/POST only' })

          const body = await readBody(req)
          const action = String(body.action ?? '')

          if (action === 'describe') {
            return sendJson(res, 200, { ok: true, suggested: wizardSuggestion(body.description) })
          }

          if (action === 'bootstrap') {
            // 虚拟库的规范写本机目录，画像取成员库并集（不挑代表库）
            const activeTarget = activeWorkspace(profile)
            const repoProfile = activeTarget ? await ledgerRepoProfile(profile, repo) : await detectRepoProfile(repo)
            const saved = await saveConventions(repo, buildDefaultConventions({
              repo,
              name: activeTarget ? activeTarget.workspace.name : loaded.project.name,
              profile: repoProfile,
              context: loaded.project.context,
            }))
            return sendJson(res, 200, { ok: true, conventions: saved, summary: summarizeConventions(saved) })
          }

          if (action === 'create') {
            if (firstRun) throw new Error('首次开发需要先初始化仓库规范（action: bootstrap）')
            // 入口分流：虚拟库激活时走虚拟库自己的实现（本机台账 + 成员库前缀 scope），
            // 不再复用单代码库的向导实现。
            if (activeWorkspace(profile)) {
              return sendJson(res, 200, await createWorkspaceFlow({ profile, repo, body, conventions, loaded }))
            }
            const description = String(body.description ?? '').trim()
            const attachments = normalizeAttachments(body.attachments)
            const draft = draftFromDescription(body.description)
            const givenTitle = String(body.name ?? '').trim()
            let title = givenTitle || draft.name || '未命名流程'
            const id = safeId(String(body.id ?? '').trim() || draft.id || title)
            if (await readItemLocal(profile, repo, id)) throw new Error(`开发流程已存在：${id}`)
            const scope = normalizeScope(body.scope)
            if (!scope.length) throw new Error('至少选择一个代码目录或模块，用于并行冲突判定')
            const conflicts = conflictsForScope(items, scope)
            const parallel = conflicts.length
              ? {
                  conflicts,
                  canParallel: false,
                  advice: `与进行中的 ${conflicts.map((entry) => `${entry.id}（${entry.overlap.join('、')}）`).join('；')} scope 重叠，建议串行或先拆分 scope。`,
                }
              : { conflicts: [], canParallel: true, advice: '与当前进行中的流程不冲突，可以并行开发。' }
            // 结构化答案与"规则重算的计划"：指纹/模板/验收/参考都以它为准（卡片的微调另记 confirmedHash）
            const answers = normalizeAnswers(body.answers ?? {})
            // 显式传入的 intent（含 analysis）必须保留，不能被 detectIntent 降级回 bug/feature
            const intent = normalizeIntent(body.intent) ?? detectIntent(description)
            const isAnalysis = intent === 'analysis'
            const profileNow = await loadProfile()
            const workspaceNow = activeWorkspace(profileNow)
            // 虚拟库的本机台账目录不是 git 仓库：提交/推送按成员库分别执行，流程本身仍是 git 流程
            const gitRepo = workspaceNow ? true : await isGitRepo(repo)
            const repoNames = workspaceNow ? workspaceMembers(workspaceNow.repos).map((member) => member.name) : []
            const canonicalPlan = buildPlan({
              description,
              recon: body.recon ?? null,
              scope,
              answers,
              project: loaded?.project,
              conventions,
              repoNames,
              intent,
            })

            // 需求规范化：客户原话不能直接当目标。优先用澄清 agent 给出的规格；
            // 没有规格时让 agent 整理一次；agent 不可用则退回本地草稿（显式标记待规范化）。
            const explicitGoal = String(body.goal ?? '').trim()
            const explicitRoot = String(body.rootProblem ?? '').trim()
            let requirement
            if (explicitGoal && explicitRoot && !isRawEcho(explicitGoal, description) && !isRawEcho(explicitRoot, description)) {
              requirement = normalizeRequirementRecord({
                raw: description,
                goal: explicitGoal,
                rootProblem: explicitRoot,
                source: 'manual',
                needsReview: false,
              }, { description, title })
            } else {
              const normalized = await normalizeRequirementForCreate(ctx, repo, {
                description,
                spec: body.spec,
                answers,
                title,
                attachments,
              })
              requirement = normalized.requirement
              // 用户明确改过、且不是原话回填的字段优先
              if (explicitGoal && !isRawEcho(explicitGoal, description)) requirement.goal = explicitGoal
              if (explicitRoot && !isRawEcho(explicitRoot, description)) requirement.rootProblem = explicitRoot
            }

            // 标题也交给工作站概括：用户输入往往是代码/注解（如 `@JsonSubTypes({`），
            // 第一行原样当标题既看不懂也不稳定。优先级：澄清标题 → 需求规范化标题 → 兜底生成。
            if (isWeakTitle(title, description)) {
              const candidates = [
                String(body.title ?? '').trim(),
                String(body.spec?.title ?? '').trim(),
                String(requirement.title ?? '').trim(),
                suggestFlowTitle({
                  description,
                  spec: body.spec,
                  goal: requirement.goal,
                  intent,
                  fallback: draft.name,
                }),
              ]
              const better = candidates.find((value) => value && !isWeakTitle(value, description))
              if (better) title = better.slice(0, 40)
            }

            // 技术文档默认值来自项目配置：默认飞书（本机 lark-cli 登录，不存 token）。
            // 聊天式入口默认“开发中创建”，表单入口只预选 provider（决策仍要用户确认）。
            const docsConfig = normalizeDocsConfig(loaded?.project?.docs)
            const chatEntry = body.entry === 'chat'
            const techDocDefaults = {
              provider: docsConfig.provider,
              decision: chatEntry ? (docsConfig.provider === 'none' ? 'none' : 'create') : null,
              exists: false,
              title: docsConfig.provider === 'none'
                ? ''
                : (docsConfig.feishu.titleTemplate || '{title} 技术方案').replaceAll('{title}', title),
              url: '',
              localPath: '',
              supplement: '',
              supplementUpdatedAt: null,
              generatedAt: null,
              generatedHash: '',
              sync: { status: null, checkedAt: null, note: '' },
              createdBy: 'workstation',
              createdAt: null,
            }

            // 聊天式入口：用户只给一句话，其余按“可核对的默认值”带入，之后可在流程页修改
            const goal = requirement.goal
            const rootProblem = requirement.rootProblem
            const requirementNote = requirement.source === 'manual'
              ? '手工填写'
              : requirement.needsReview ? '本地草稿，待规范化' : '工作站规范化'
            const commands = loaded.project.context?.commands ?? {}
            const localTest = commands.localTest || commands.test || commands.gate || ''
            const givenPlan = body.plan && typeof body.plan === 'object' ? body.plan : null
            const defaults = chatEntry
              ? {
                  techDoc: techDocDefaults,
                  plan: {
                    ...(canonicalPlan?.template ? { template: canonicalPlan.template } : {}),
                    ...(canonicalPlan?.intent ? { intent: canonicalPlan.intent } : {}),
                    summary: goal,
                    // 分析流程只读：用工作站生成的只读步骤，不能落成“修改代码”
                    steps: isAnalysis
                      ? canonicalPlan.steps
                      : ['确认识别到的目标文件与改动范围', '按 Context Pack 修改代码与测试代码', DEV_HANDOFF_STEP],
                    // 工程量必须来自工作站自评（estimateWork），不接受用户手填
                    estimate: estimateWork({ recon: body.recon, scope, commands, repoNames }).size
                      ? {
                          size: estimateWork({ recon: body.recon, scope, commands, repoNames }).size,
                          days: estimateWork({ recon: body.recon, scope, commands, repoNames }).days,
                          confidence: estimateWork({ recon: body.recon, scope, commands, repoNames }).confidence,
                          notes: '工作站自评（estimateWork）',
                        }
                      : { size: 'S', days: 0.5, confidence: 'low', notes: '没有探测结果，按最小改动估算' },
                  },
                }
              : {}
            const baseAcceptance = isAnalysis
              ? canonicalPlan.acceptance
              : Array.isArray(givenPlan?.acceptance) && givenPlan.acceptance.length
                ? givenPlan.acceptance
                : Array.isArray(body.acceptance) && body.acceptance.length
                  ? body.acceptance
                  : (chatEntry
                      ? [
                          localTest ? `本机自测通过：${localTest}` : '本机自测通过',
                          '改动文件不越出已确认的 scope',
                          commands.gate ? `仓库门禁通过：${commands.gate}` : '没有配置门禁时，至少编译/单测通过',
                        ]
                      : [])
            // 澄清里确认过的验收排在最前面：不能因为"默认验收"把需求自己的验收挤掉
            const acceptance = [...new Set([...requirement.acceptance, ...baseAcceptance]
              .map((entry) => String(entry ?? '').trim())
              .filter(Boolean))].slice(0, 12)
            const draftItem = stampWorkspaceItem({
              id,
              title,
              goal,
              description,
              ...(attachments.length ? { attachments } : {}),
              // 需求规范化结果：目标/根因/背景/验收与"是否还是客户原话"都留痕
              requirement: { ...requirement, normalizedAt: new Date().toISOString() },
              nonGoals: requirement.nonGoals,
              answers,
              acceptance,
              scope,
              scopeModules: scope.filter((entry) => entry.startsWith('module:')),
              // 用户二次确认过的探测结果：带进 Context Pack，开发会话据此直接看文件与命中行
              recon: body.recon && typeof body.recon === 'object'
                ? { ...body.recon, confirmedAt: new Date().toISOString() }
                : null,
              // 可复现性：记录这次建流程用的输入/规则/模型与计划指纹
              provenance: (() => {
                const conventionsNow = conventions
                const answerSet = normalizeAnswers(body.answers ?? {})
                const canonical = canonicalPlan
                const provenance = {
                  pluginVersion: pluginVersion(),
                  recon: body.recon?.provenance
                    ? { ...body.recon.provenance, at: new Date().toISOString() }
                    : null,
                  plan: {
                    hash: planHash(canonical),
                    confirmedHash: givenPlan?.steps?.length
                      ? planHash({ ...givenPlan, modules: givenPlan.modules ?? scope })
                      : null,
                    inputHash: inputHash({
                      description,
                      answers: answerSet,
                      scope,
                      conventions: conventionsNow,
                    }),
                    specHash: specHash({ description, answers: answerSet, scope }),
                    pluginVersion: pluginVersion(),
                    at: new Date().toISOString(),
                  },
                }
                return provenance
              })(),
              status: 'planned',
              // 模板验收与参考实现：来自"规则重算"的计划，保证与 repro 一致
              checks: canonicalPlan ? canonicalPlan.checks : [],
              references: canonicalPlan ? canonicalPlan.references : [],
              workflow: {
                stage: 'discovery',
                // 技术文档默认形式（provider/决策）；正文在技术文档卡片里生成
                techDoc: techDocDefaults,
                // 流程类型：bug（先复现/定位）或 feature（先对齐范围）
                intent,
                gitRepo,
                // 需求关联：澄清/扫描子代理会话（评审/开发另有字段）
                ...(body.clarifySessionId ? { clarifySessions: [String(body.clarifySessionId)] } : {}),
                ...(body.scanSessionId || body.recon?.scanSessionId
                  ? { scanSessions: [String(body.scanSessionId || body.recon?.scanSessionId)].filter(Boolean) }
                  : {}),
                entry: chatEntry ? 'chat' : undefined,
                rootProblem,
                ...defaults,
                ...(givenPlan
                  ? {
                      plan: {
                        ...(defaults.plan ?? {}),
                        ...(canonicalPlan?.template ? { template: canonicalPlan.template } : {}),
                        ...(canonicalPlan?.intent ? { intent: canonicalPlan.intent } : {}),
                        // 计划摘要也用规范化后的目标；客户原话回填不算摘要
                        ...(givenPlan.summary && !isRawEcho(givenPlan.summary, description)
                          ? { summary: givenPlan.summary }
                          : { summary: goal }),
                        // 分析流程只读：即使用户传入的计划是“改代码”的，也以工作站生成的只读步骤为准
                        ...(isAnalysis
                          ? { steps: canonicalPlan.steps }
                          : (Array.isArray(givenPlan.steps) ? { steps: givenPlan.steps } : {})),
                        ...(givenPlan.estimate
                          ? { estimate: { ...givenPlan.estimate, notes: givenPlan.estimate.notes || '工作站自评（estimateWork）' } }
                          : {}),
                      },
                    }
                  : {}),
                // 工作站追问过的分叉点，回答一并存证
                questions: Array.isArray(body.questions) && body.questions.length
                  ? body.questions
                  : undefined,
              },
            }, isWorkspaceLocalRoot(repo) ? workspaceNow : null)
            const item = await saveItem(repo, appendHistory(draftItem, 'create',
              `${chatEntry ? '聊天式入口' : '向导'}创建开发流程（需求：${requirementNote}）${conflicts.length
                ? `；与 ${conflicts.map((entry) => entry.id).join('、')} 的 scope 重叠`
                : ''}`))
            // 旧仓库台账（虚拟库信息还写在某成员库）的归属只记本机 profile；
            // 本机虚拟库台账已经把归属写在台账里，不需要 profile 绑定。
            if (workspaceNow && !isWorkspaceLocalRoot(repo)) {
              setItemWorkspace(profileNow, repo, item.id, {
                workspaceId: workspaceNow.workspace.id,
                workspaceName: workspaceNow.workspace.name,
                baseline: [],
              })
              await saveProfile(profileNow)
            }
            return sendJson(res, 200, {
              ok: true,
              item: hydrateItemLocal(profileNow, repo, item),
              firstRun: false,
              parallel,
              steps: wizardSteps({ firstRun: false, description: body.description, name: title, id, scope }),
            })
          }

          if (action === 'start') {
            let item = await readItemLocal(profile, repo, body.id)
            if (!item) throw new Error(`开发项不存在：${body.id}`)
            const missing = missingForStart(item)
            if (missing.length) throw new Error('开始开发前还缺少：' + missing.join('；'))
            let startTarget = workspaceTarget(profile, item, repo)
            const startAnalysis = item.workflow?.intent === 'analysis'
            let startWorktree = null
            let startWorkspaceWorktrees = []
            if (!startAnalysis && item.workflow?.gitRepo !== false) {
              if (startTarget) {
                let createdAny = false
                for (const member of startTarget.members) {
                  if (!(await exists(member.path)) || !(await isGitRepo(member.path))) continue
                  const memberTree = await ensureFlowWorktree(member.path, {
                    id: memberWorktreeItemId(item.id, member.name),
                  })
                  startWorkspaceWorktrees.push({
                    name: member.name,
                    branch: memberTree.branch,
                    baseCommit: memberTree.baseCommit,
                    createdAt: memberTree.createdAt,
                  })
                  if (memberTree.created) createdAny = true
                }
                if (startWorkspaceWorktrees.length) {
                  item.workflow.worktrees = startWorkspaceWorktrees
                  if (createdAny) item.baseline = null
                  startTarget = workspaceTarget(profile, item, repo)
                }
              } else {
                startWorktree = await ensureFlowWorktree(repo, item)
                item.workflow.worktree = {
                  branch: startWorktree.branch,
                  baseCommit: startWorktree.baseCommit,
                  createdAt: startWorktree.createdAt,
                }
                if (startWorktree.created) item.baseline = null
              }
            }
            const startRoot = startTarget
              ? (startTarget.members.find((member) => member.worktree)?.workRoot ?? startTarget.localRoot)
              : (startWorktree?.path ?? repo)
            item = await recordBaselineLocal(profile, repo, item, startRoot)
            item.workflow.stage = 'develop'
            if (item.status === 'planned' || item.status === 'designing') item.status = 'developing'
            item = await saveItem(repo, appendHistory(item, 'start',
              startWorktree
                ? `开始开发：独立工作区 ${startWorktree.path}（分支 ${startWorktree.branch}）`
                : startWorkspaceWorktrees.length
                  ? `开始开发：${startWorkspaceWorktrees.length} 个成员库使用独立工作区`
                  : '开始开发，记录 baseline'))
            const built = await buildFor(repo, item, profile, { workRoot: startRoot })
            return sendJson(res, 200, {
              ok: true,
              ...built,
              workRoot: startRoot,
              ...(startWorktree ? { worktree: { ...startWorktree } } : {}),
              item: hydrateItemLocal(profile, repo, built.item),
            })
          }

          throw new Error(`未知向导动作：${action || '(空)'}`)
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    },
  ]

  ctx.effect(() => {
    const disposers = routes.map((route) => ctx.webServer.register(route))
    return () => { for (const dispose of disposers.splice(0)) dispose() }
  }, 'dev-hub: routes')

  registerSystemPrompt(ctx)
  registerTools(ctx)
}

export default { name, inject, apply }
