/** Shared wire surface between the Host and the browser half. */
export const API = {
  state: '/api/dev-hub/state',
  locales: '/api/dev-hub/locales',
  overview: '/api/dev-hub/overview',
  setup: '/api/dev-hub/setup',
  detect: '/api/dev-hub/detect',
  items: '/api/dev-hub/items',
  item: '/api/dev-hub/item',
  status: '/api/dev-hub/status',
  start: '/api/dev-hub/start',
  sync: '/api/dev-hub/sync',
  context: '/api/dev-hub/context',
  scan: '/api/dev-hub/scan',
  importCandidate: '/api/dev-hub/import',
  switchRepo: '/api/dev-hub/switch-repo',
  workflow: '/api/dev-hub/workflow',
  techdoc: '/api/dev-hub/techdoc',
  test: '/api/dev-hub/test',
  changes: '/api/dev-hub/changes',
  submit: '/api/dev-hub/submit',
  project: '/api/dev-hub/project',
  wizard: '/api/dev-hub/wizard',
  modules: '/api/dev-hub/modules',
  conventions: '/api/dev-hub/conventions',
  parallel: '/api/dev-hub/parallel',
  recon: '/api/dev-hub/recon',
  plan: '/api/dev-hub/plan',
  review: '/api/dev-hub/review',
  session: '/api/dev-hub/session',
  sessions: '/api/dev-hub/sessions',
  skills: '/api/dev-hub/skills',
  sessionLog: '/api/dev-hub/session-log',
  lookup: '/api/dev-hub/lookup',
  assist: '/api/dev-hub/assist',
  pending: '/api/dev-hub/pending',
  answer: '/api/dev-hub/answer',
  repro: '/api/dev-hub/repro',
  check: '/api/dev-hub/check',
  files: '/api/dev-hub/files',
  diff: '/api/dev-hub/diff',
  fileNote: '/api/dev-hub/file-note',
  deleteItem: '/api/dev-hub/item/delete',
  clarify: '/api/dev-hub/clarify',
  requirement: '/api/dev-hub/requirement',
  attach: '/api/dev-hub/attach',
  capabilities: '/api/dev-hub/capabilities',
  removeRepo: '/api/dev-hub/repo/remove',
  genFileNotes: '/api/dev-hub/file-notes/generate',
  workspaces: '/api/dev-hub/workspaces',
  dispatch: '/api/dev-hub/dispatch',
  report: '/api/dev-hub/report',
}

/**
 * Recon contract (Host <-> browser).
 *
 * POST API.recon { description } -> ReconResult
 *
 * 用户只说“我要做什么”，Host 自己先扫一遍仓库，把“可能要改哪个文件、
 * 命中在第几行”带回来给用户二次确认。
 *
 * ReconResult:
 * {
 *   ok: true,
 *   description: string,
 *   tokens: string[],                       // 从描述里抽出的检索词
 *   files: [{ path, score, matches: [{ line, text }] }],
 *   modules: [{ name, path, hits }],        // 命中的目录/模块
 *   suggestedScope: string[],               // 建议的 scope（目录路径或 module:<name>）
 *   scanned: number,                        // 扫过的文件数
 *   truncated: boolean,                     // 是否因上限截断
 *   effectiveTokens: string[],              // 去噪后真正用于检索的词
 *   questions: AskQuestion[],               // 工作站要追问的分叉点（没有就不问）
 *   estimate: Estimate,                     // 工作站自评的工程量（用户不用填）
 *   engine: 'dsh' | 'local',                // 扫描引擎：默认真的调一次 dsh 子代理
 *   engineLabel: string,                    // 给界面直接显示的中文名
 *   scanNotes: string,                      // 降级原因 / 扫描备注
 *   elapsedMs: number                       // dsh 扫描耗时
 * }
 *
 * files 项在 dsh 引擎下额外带 `why`（为什么相关）与 `confidence`（high/medium/low）。
 *
 * POST API.session { action:'bind'|'unbind', id, sessionId } -> { ok, item }
 *   把「开发流程」与「DSH 开发会话」绑定；工作站据此追踪会话状态、跳回会话。
 *
 * GET  API.sessions -> { ok, now, sessions: SessionState[] }
 *
 * GET  API.skills -> { ok, profile, installed: InstalledSkill[], catalog: CatalogSkill[], constraints: ConstraintView[] }
 * POST API.skills { action, ... } -> { ok, conventions, catalog?, constraints? }
 *   action: 'install' { skillId } | 'uninstall' { skillId } | 'regenerate'
 *         | 'addConstraint' { constraint } | 'updateConstraint' { constraint } | 'removeConstraint' { id }
 *
 * CatalogSkill: { id, name, level, description, appliesTo, installed, constraints: number }
 * ConstraintView: { id, title, rule, skill, check, doc, gate, builtin }
 *
 * GET  API.sessionLog?itemId=<id>&limit=30 ->
 *   { ok, sessionId, alive, messages: [{ role, roleLabel, text }], total, truncated, reason }
 *   工作站在流程详情里内嵌展示会话最近对话，不用跳到会话页。
 *
 * GET  API.lookup?sessionId=<id> -> { ok, matches: [{ repo: { path, name }, item: { id, title, status, stage } }] }
 *   跨代码库反查：这个会话属于哪个仓库的哪个开发流程（会话页据此显示"你在哪个开发站"）。
 *
 * POST API.assist { id, message } -> { ok, reply, applied: string[], item, elapsedMs, engine }
 *   对话式补充：把用户这句话整理进流程台账（目标/验收/任务/风险/计划…），并回一句确认。
 *   agent 不可用时返回 400（不伪造变更）；编辑按钮只用于回看纠偏。
 *
 * GET  API.pending?itemId=<id> -> { ok, pending: [{ callId, questions: AskQuestion[], askedAt }], reason }
 *   开发会话卡在 ask_user_question 时，工作站把待答问题捞出来就地作答。
 * POST API.answer { itemId, callId, answers: [{ id, selected: string[], custom? }] } -> { ok, accepted, pending }
 *
 * POST API.repro { id, save?: boolean } -> ReproResult
 *   用台账里已记录的输入重算计划并与指纹对比：
 *   { recorded, inputChanged, planChanged, same, stored, current, inputs, plan, message }
 *   save=true 时把当前指纹写回台账（用于旧流程补记录 / 确认重算结果）。
 *
 * POST API.check { id, checkId } -> { ok, item, result }
 *   运行模板验收项里配置的命令（只允许运行台账里登记的 check 命令），把状态/输出写回。
 *
 * GET  API.files?itemId=<id> -> { ok, evidenceComplete, reason, baseCommit, headCommit, files[], totals }
 *   files[]: { path, status: added|modified|deleted|renamed, origin: committed|working|both,
 *              added, removed, binary, group }
 * POST API.dispatch { id, message } -> { ok, action: ledger|session|both|none, reply, sessionMessage, applied[], item, engine }
 *   用户在「下一步」只说一句话，由 dsh 判断：补台账 / 发开发会话 / 两者都做 / 都不用。
 *
 * POST API.review { id, action:'dispatch'|'record'|'reset', count?, reviewerId?, verdict?, summary?, findings?, direction? }
 *   -> { ok, item, review: ReviewView }
 *   独立评审：正常入口是「继续推进」自动开始评审（前端复用同一个 dispatch 动作）；
 *   dispatch 开始/重试一轮评审（count 缺省沿用上一轮或默认配置，已有 pending 时幂等不重复派发），
 *   审核员会话读同一份证据并各自给结论；
 *   record 用于审核员会话不可用时的显式人工结论（source=manual，不伪装成自动评审）；
 *   reset 清空本轮评审（回到「继续推进即开始评审」）。
 *   ReviewView: { status:'idle'|'pending'|'passed'|'failed'|'error', round, reviewers:[{
 *     id:'reviewer-1', label, role:'direction'|'correctness'|'risk', status,
 *     verdict:'pass'|'fail'|null, summary, findings[], direction, evidence[], sessionId,
 *     error, elapsedMs, dispatchedAt, finishedAt }], corrections[], gateReason, allowed }
 *   判定口径：全部审核员通过才 allowed；任一不通过 → 流程回到开发并附纠偏意见；
 *   任一异常/未返回 → status=error（待处理），绝不当成通过。
 *
 * GET/POST API.workspaces -> { ok, workspaces[] } / { ok, workspace, localPath, state }
 *   虚拟库：把多个代码库组合成一个开发目标（前后端联动）；本机 profile 只存分组登记。
 *   虚拟库自己的数据（台账/规范/上下文/证据）写本机独立目录
 *   `~/.dev-hub/workspaces/<id>/`，**不写任何成员库**；成员库平权，没有主库。
 *   workspace = { id, name, repos: [path], path, localPath, createdAt, member? }
 *   POST body: { name, repos: [path], member? } | { action:'remove', id } | { action:'rename', id, name }
 *          | { action:'update', id, name?, repos? }
 *   update：改名/增删成员；任意成员（含原来的第一个）都可移除/替换，仍要求 ≥2 个不同代码库；
 *   新增成员会登记本机身份与当前 HEAD baseline。创建时只建本机目录，不初始化成员库。
 *   `activeRepo` 保持 `workspace:<id>`。
 *
 * GET API.state（虚拟库激活时）
 *   repo = { path: 本机虚拟库目录, name: 虚拟库名, kind: 'virtual-workspace' }
 *   workspace = {
 *     id, name, repos: [path], path, localPath, member,
 *     members: [{ path, name, exists, initialized, isRepo, branch, head, member }]
 *   }
 *   成员 name 是稳定短标签（目录名，重名追加 -2）；跨库 scope/文件路径统一用
 *   `<name>/<repo 相对路径>`，scope 也接受 `<name>:<repo 相对路径>`。
 *
 * POST API.recon（虚拟库激活时）
 *   逐成员库扫描，返回 members: [{ repo, name, files, scanned, error? }]；
 *   files[] 额外带 repo/repoName/relPath，path 为 `<name>/<rel>`；
 *   suggestedScope 为 `<name>:<scope>`；仍返回 questions/estimate/provenance。
 *
 * POST API.sync { id? } -> 开发前同步：对当前目标（单库或虚拟库每个成员库）执行
 *   git fetch + merge --ff-only。返回 repos: [{ name, path, branch, before, after,
 *   updated, ok, upstream, error, output }]；不自动 rebase/reset，分叉/脏工作区失败可见。
 *
 * POST API.start（虚拟库流程）
 *   台账写本机独立目录；item.baseline = { startedAt, commit: null, branch: null, repos: [...] }。
 *   `commit`/`branch` 顶层为 null：虚拟库没有代表库，逐成员库事实只在 `baseline.repos`。
 *
 * GET API.files?itemId=<id>（虚拟库流程）
 *   files[]: { key:'<name>/<rel>', displayPath, repo, repoName, path:<rel>,
 *              status, origin, added, removed, binary, inScope, note, noteSource }
 *   repos: [{ path, name, isRepo, branch, head, baseCommit, evidenceComplete, reason, changedFiles }]
 *   diff 必须带成员库（路径或 label）：GET API.diff?itemId&path=<rel>&repo=<path|label>。
 *
 * GET API.changes?itemId=<id>（虚拟库流程）
 *   { workspace, branch: null, branches[], changes[]（path 已带成员前缀）, repos[],
 *     suggestedPaths:['<name>/<rel>'] }
 *
 * POST API.test（虚拟库流程）
 *   result = { status, command, output, durationMs, repos: [{ path, name, skipped, status, command, output, durationMs }] }
 *   每个成员库跑自己的 `.dev-hub/project.json` 命令；没配置的成员库 skipped，不拿别的库命令硬套。
 *
 * POST API.submit（虚拟库流程）
 *   请求 paths 使用 `<name>/<rel>`；按成员库分组 add/commit/push。
 *   返回 { ok, item, commit, branch, pushed, repos: [{ path, name, branch, commit, pushed, status, error, pushOutput }] }
 *   部分失败必须 ok:false 且保留已成功库的 commit；结果写入 item.workflow.submission.repos。
 *
 * POST API.genFileNotes { id, limit? } -> { ok, generated: string[], skipped: number, engine }
 *   自动为变更文件补「修改意义」：没有人工说明、且文件版本变化的才生成（agent 写一句话）。
 *
 * POST API.removeRepo { repoPath } -> { ok, removed, state }
 *   从工作站忘掉一个代码库卡片（只删本机 profile 里的登记，不动磁盘文件）。
 *
 * POST API.clarify { description, history: [{role,text}], recon, spec, round } ->
 *   { ok, engine, reply, questions[{id,question,why,multiSelect,options[]}], ready, missing[], spec, round }
 *   多轮需求澄清：agent 追问 1~2 个关键问题；ready=true 时给出可执行的问题定义。
 *   agent 不可用时退化为规则化追问（engine=local），不中断创建流程。
 *
 * POST API.deleteItem { id } -> { ok, deleted, id }
 *   删除一个开发流程（只删 .dev-hub/items/<id>.json；不回滚代码、不删 DSH 会话）。
 *
 * POST API.fileNote { id, path, note } -> { ok, item, note, source }
 *   给某个变更文件补一句「修改意义」（人工/对话补充，优先于默认解释）。
 *
 * GET  API.diff?itemId=<id>&path=<相对路径> ->
 *   { ok, file: { path, mode, binary, truncated, added, removed, message?,
 *                 lines: [{ type: 'added'|'removed'|'context'|'hunk'|'meta', text }] } }
 *   以 baseline 为基准；没有 baseline 退化为工作区 diff，并在 files 的 reason 里说明。
 *
 * SessionState:
 * {
 *   itemId, itemTitle, status, boundAt,
 *   sessionId, alive, loaded, running, turns,
 *   lastEventAt, idleSeconds, lastStage, lastTool, lastText, error, reason
 * }
 *
 * AskQuestion:
 * { id, question, why, kind: 'choice' | 'text', options?: [{ id, label, value }] }
 *
 * Estimate:
 * { size: 'S'|'M'|'L'|'XL', days: number, confidence: 'low'|'medium'|'high',
 *   basis: string[], risks: [{kind,label,sample}], metrics: {...} }
 *
 * POST API.plan { description, recon, scope, answers } -> WorkPlan
 *
 * WorkPlan:
 * { ok: true, summary, steps: string[], acceptance: string[], risks: string[],
 *   estimate: Estimate, modules: string[], generatedAt }
 *
 * 设计：用户只给一句话 + 回答工作站自己的追问；规模/人天/步骤/验收全部由 Host 计算，
 * 不出现“请填写工程量”这类字段。
 */

/**
 * Wizard contract (Host <-> browser).
 *
 * GET  API.wizard  -> WizardState
 * POST API.wizard  { action: 'describe' | 'create' | 'bootstrap' | 'start', ... }
 *
 * WizardState (GET, `?sessionId=` optional):
 * {
 *   ok: true,
 *   repo: { path, name } | null,
 *   firstRun: boolean,              // true = 仓库还没有 .dev-hub/conventions.json
 *   conventions: ConventionsSummary | null,
 *   steps: [{ id, label, done }],   // describe / name / scope / bootstrap / start
 *   suggested: { name, id, goal },  // 由描述生成的默认名称（可改）
 *   modules: ModuleSuggestion[],    // 供“代码目录与模块”勾选
 *   active: FlowSummary[]           // 正在开发中的流程，用于并行冲突提示
 * }
 *
 * POST bodies:
 *   { action: 'describe', description }                       -> { ok, suggested }
 *   { action: 'create', description, name, id, scope, goal }  -> { ok, item, firstRun, parallel }
 *   { action: 'bootstrap' }                                   -> { ok, conventions }
 *   { action: 'start', id }                                   -> { ok, item, context }
 *
 * ModuleSuggestion:
 * { name, path, kind: 'java-package' | 'dir' | 'module', role?: string, suggested?: boolean }
 *
 * FlowSummary:
 * { id, title, status, stage, scope: string[], scopeModules: string[], updatedAt,
 *   running: boolean,                        // 关联的开发会话当前是否在跑（未绑定会话时为 false）
 *   attention: { kind, label, tone } | null  // 需要你处理的信号；null = 不用你动手（会话在跑/已完成）
 * }
 * GET API.state / GET API.items 共用同一份摘要（items 也带 running 与 attention）。
 *
 * GET API.overview -> {
 *   ok: true,
 *   activeTarget: string | null,   // 当前激活目标：repo 绝对路径 或 workspace:<id>
 *   targetCount: number,           // 有流程的开发目标数（代码库 + 虚拟库）
 *   inProgressCount, attentionCount, runningCount, doneCount,
 *   groups: [{ key, kind: 'repo'|'workspace', name, path, workspaceId, member,
 *              current: boolean, inProgress, done, running, attention }],
 *   items: [{ ...FlowSummary, repoPath,
 *             target: { key, kind, name, path, workspaceId, member, current } }]
 * }
 *   跨代码库/虚拟库汇总所有流程，供「进行中」抽屉跨目标切换。
 *   点击 item 后客户端用 target.kind 决定 switch-repo 的 body：
 *   repo -> { repoPath, name }；workspace -> { workspaceId }。
 *   只读接口：不改 activeRepo、不做旧台账迁移以外的写操作。
 *
 * GET  API.parallel -> { ok, active: FlowSummary[], pairs: [{ a, b, overlap: string[], reason }],
 *                        canParallel: boolean, advice: string }
 * GET  API.modules  -> { ok, modules: ModuleSuggestion[], profile: string }
 * GET  API.conventions -> { ok, firstRun, path, conventions }
 * POST API.conventions { action: 'regenerate' | 'update', conventions? } -> { ok, conventions }
 */

export const STATUS_LABELS = {
  planned: '计划中',
  designing: '设计中',
  developing: '开发中',
  reviewing: '评审中',
  verifying: '验证中',
  done: '已完成',
  blocked: '阻塞',
}

export const STATUS_ORDER = ['planned', 'designing', 'developing', 'reviewing', 'verifying', 'blocked', 'done']
