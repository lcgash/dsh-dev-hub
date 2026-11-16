window.__ModuleLoader__.load({
	id: "dsh-dev-hub",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/i18n.mjs
		/**
		* 开发站的客户端本地化桥。
		*
		* 现有界面已经大量使用中文静态文案；这里不重写每个组件，而是把 React 元素工厂
		* 接到 DSH 的 locale 字典上：字符串子节点与常见可读属性命中词典时翻译，未命中时
		* 保留原文。这样语言切换由 DSH 设置页统一驱动，新增文案也能逐步补进字典。
		*/
		const LOCALE_NAMESPACE = "dev-hub";
		/** 以中文原文为 key 的英文词典；key 集合就是当前已覆盖的界面文案。 */
		const en = {
			"开发工作站": "Development Workstation",
			"开发流程台账 · 会话状态 · 并行开发 · 独立评审 · 测试与提交": "Flow ledger · session state · parallel work · review & delivery",
			"新建开发流程 · 说一句要做什么 · 工作站扫仓库、追问、自评计划": "New flow · describe intent · scan, clarify, plan",
			"专注流程：": "Focused flow: ",
			"流程": "Flows",
			"新建流程": "New flow",
			"技能": "Skills",
			"回流程": "← Back to flows",
			"进行中": "In progress",
			"待处理": "Needs attention",
			"开发中": "Developing",
			"刷新": "Refresh",
			"新对话": "New chat",
			"历史": "History",
			"回首页": "Home",
			"回到开发站首页（流程列表）": "Back to workbench home (flow list)",
			"回到开发站首页": "Back to workbench home",
			"更多（低频操作）": "More (less common)",
			"预览报告": "Preview report",
			"继续推进": "Continue",
			"开启开发会话": "Open development session",
			"正在继续开发会话…": "Continuing development session…",
			"正在开启开发会话…": "Opening development session…",
			"正在开发…": "Developing…",
			"开发进度": "Progress",
			"任务": "Tasks",
			"本机自测": "Local tests",
			"环境测试": "Environment tests",
			"验收": "Acceptance",
			"变更文件": "Changed files",
			"已完成": "Done",
			"评审中": "In review",
			"独立评审": "Independent review",
			"测试验证": "Verification",
			"待提交": "Ready to submit",
			"提交代码": "Submit",
			"开发计划": "Plan",
			"需求澄清": "Requirement",
			"技术文档": "Tech doc",
			"保存并探测环境": "Save and detect environment",
			"添加并探测环境": "Add and detect environment",
			"探测中…": "Detecting…",
			"代码库路径": "Repository path",
			"你的名字/成员标识": "Your name / member id",
			"选择目录": "Choose directory",
			"例如：张三": "For example: Alex",
			"新增代码库": "Add repository",
			"初始化 DevHub": "Initialize DevHub",
			"新增开发目标": "Add development target",
			"新建虚拟库": "New virtual workspace",
			"开发流程": "Development flows",
			"还没有开发流程": "No development flows yet",
			"成员": "Member",
			"扫描文档": "Scan documents",
			"用一段话描述你要做什么：工作站会扫仓库、追问、自评计划，再确认范围。": "Describe what you want to do: the workstation scans, clarifies, estimates and asks you to confirm the scope.",
			"可以并行": "Parallel work",
			"正在读取…": "Reading…",
			"展开/收起": "Expand / collapse",
			"当前没有进行中的流程。": "No active flows right now.",
			"开发目标": "Development targets",
			"当前开发目标": "Current development target",
			"代码库": "Repository",
			"虚拟库": "Virtual workspace",
			"当前": "Current",
			"点击切换": "Click to switch",
			"流程进度": "Flow progress",
			"报告": "Report",
			"计划": "Plan",
			"概览": "Overview",
			"测试与提交": "Tests & submit",
			"独立工作区": "Isolated worktree",
			"工作区": "Workspace",
			"关联会话": "Session",
			"解绑会话": "Unbind session",
			"下一步": "Next step",
			"发送": "Send",
			"提交回答": "Submit answer",
			"跳过（按默认推进）": "Skip (use defaults)",
			"去会话处理": "Open session",
			"重新描述": "Describe again",
			"再调整范围": "Adjust scope",
			"继续，生成计划": "Continue to plan",
			"确认开工": "Confirm and start",
			"生成计划": "Generate plan",
			"正在生成计划…": "Generating plan…",
			"正在扫描…": "Scanning…",
			"扫描中…": "Scanning…",
			"正在扫描仓库…": "Scanning repository…",
			"新建开发流程": "New development flow",
			"澄清中": "Clarifying",
			"需求澄清 · 第": "Clarification · round ",
			"扫描仓库": "Scan repository",
			"命中": "matched",
			"候选": "candidates",
			"确认": "Confirm",
			"取消": "Cancel",
			"关闭": "Close",
			"保存到本机": "Save locally",
			"打开完整报告": "Open full report",
			"报告预览": "Report preview",
			"开发报告预览": "Development report preview",
			"加载中…": "Loading…",
			"目标背景": "Goals & background",
			"改动范围": "Change scope",
			"测试报告": "Test report",
			"计划与进度": "Plan & progress",
			"过程记录": "Timeline",
			"证据与边界": "Evidence & boundaries",
			"报告口径": "Report scope",
			"文件": "File",
			"状态": "Status",
			"增删": "Changes",
			"范围": "Scope",
			"修改意义": "Meaning",
			"新增": "Added",
			"修改": "Modified",
			"删除": "Deleted",
			"重命名": "Renamed",
			"通过": "Passed",
			"失败": "Failed",
			"未运行": "Not run",
			"运行中": "Running",
			"完整": "Complete",
			"不完整": "Incomplete",
			"还没有提交记录": "No submission yet",
			"变更统计": "Change stats",
			"提交结果": "Submission",
			"计划范围": "Planned scope",
			"证据完整性": "Evidence completeness",
			"排除的台账文件": "Excluded ledger files",
			"审核员": "Reviewers",
			"结论": "Verdict",
			"方向": "Direction",
			"正确性": "Correctness",
			"风险": "Risk",
			"通过（允许进入测试验证）": "Passed (ready for verification)",
			"评审通过": "Review passed",
			"评审未通过": "Review failed",
			"待派发评审": "Review not dispatched",
			"待派发独立评审": "Independent review not dispatched",
			"评审通过 · 待环境测试": "Review passed · awaiting environment tests",
			"等待独立评审": "Waiting for independent review",
			"报告已归档": "Report archived",
			"任务完成": "Tasks done",
			"并行开发": "Parallel work",
			"评审门禁": "Review gate",
			"上下文包": "Context packs",
			"本机优先": "Local-first",
			"个流程": "flows",
			"个成员库": "repos",
			"个任务": "tasks",
			"个审核员": "reviewers",
			"个开发目标": "development targets",
			"需要你处理": "need attention",
			"全部开发目标": "All development targets",
			"有进展，但没有绑定开发会话": "Progress exists, but no session is bound",
			"开发会话动态（默认收起，避免挤占进度）": "Session activity (collapsed by default)",
			"展开": "Expand",
			"收起": "Collapse",
			"删除流程": "Delete flow",
			"生成上下文": "Generate context",
			"同步最新上下文": "Sync latest context",
			"让工作站规范化": "Normalize with workstation",
			"流程未结束": "Flow not complete",
			"先确认文件/范围与追问，再让工作站生成计划。": "Confirm files/scope and questions before generating a plan.",
			"计划已生成：确认后按计划开工，或点「再调整范围」改完重算。": "Plan ready: confirm to start, or adjust scope and regenerate.",
			"Enter 发送 · Shift+Enter 换行": "Enter to send · Shift+Enter for a new line",
			"用一句话补充或纠偏，例如：验收再加一条失败可回滚；顺便把「跑门禁」标成已完成": "Add a sentence to clarify, e.g. add rollback to acceptance and mark the gate as done",
			"直接说就行：工作站会判断这句话是补台账、发开发会话，还是两者都做。": "Just say it: the workstation decides whether to update the ledger, the session, or both.",
			"当前流程": "Current flow",
			"扫描范围": "Scan scope",
			"候选人": "Candidates",
			"小提示": "Tip",
			"新建 · 还没建流程台账": "New · no flow ledger yet",
			"澄清不会直接改代码；确认计划后才创建流程并开启开发会话。": "Clarification does not change code; the flow is created only after you approve the plan.",
			"切到其他页面再回来，进度和扫描结果会从本机对话记录恢复。": "Switch pages and come back; progress and scan results are restored from the local chat log.",
			"为什么问": "Why we ask",
			"补充说明（可选）": "Additional notes (optional)",
			"继续补充（再问一轮）": "Ask another round",
			"直接生成计划": "Generate plan",
			"这一轮已经提交，可以继续补充，或直接生成计划。": "This round is submitted. Ask another round or generate the plan.",
			"答案已提交": "Answer submitted",
			"已提交": "Submitted",
			"已降级": "Degraded",
			"本地规则": "Local rules",
			"DSH 模型": "DSH model",
			"DSH 对话": "DSH chat",
			"DSH 扫描": "DSH scan",
			"本地关键词兜底": "Local keyword fallback",
			"命中里没有测试文件。这次要不要一起补单测？": "No test files in the matches. Add unit tests in this flow?",
			"先不补，后面单独做": "Skip for now; do it separately",
			"一起补单测（推荐）": "Add unit tests (recommended)",
			"澄清降级为本地规则": "Clarification fell back to local rules",
			"需求通常很粗：先用 dsh 走一轮澄清（后续可多轮），问准“到底解决什么问题”": "Requirements are usually rough: clarify first, then plan."
		};
		/** 中文词典：中文 key 原样返回，保证 fallback 不丢文案。 */
		const zh = Object.fromEntries(Object.keys(en).map((key) => [key, key]));
		let activeT = (key) => key;
		let activeLocale = "zh";
		function translateText(value) {
			if (typeof value !== "string" || value.length === 0) return value;
			if (activeLocale === "zh") return value;
			let translated = value;
			try {
				translated = activeT(value);
			} catch {
				translated = value;
			}
			if (translated !== value) return translated;
			const status = (text) => ({
				"通过": "passed",
				"失败": "failed",
				"未运行": "not run",
				"运行中": "running"
			})[text] ?? text;
			const rules = [
				[/^成员 (.+)$/, (_m, name) => `Member ${name}`],
				[/^开发目标（(\d+)）$/, (_m, n) => `Development targets (${n})`],
				[/^开发流程（(\d+)）$/, (_m, n) => `Development flows (${n})`],
				[/^任务 (\d+)\/(\d+)$/, (_m, done, total) => `Tasks ${done}/${total}`],
				[/^任务 (\d+)\/(\d+) · (\d+)%$/, (_m, done, total, pct) => `Tasks ${done}/${total} · ${pct}%`],
				[/^验收 (\d+)\/(\d+)$/, (_m, done, total) => `Acceptance ${done}/${total}`],
				[/^(\d+) 个流程$/, (_m, n) => `${n} flows`],
				[/^(\d+) 个开发目标$/, (_m, n) => `${n} development targets`],
				[/^(\d+) 个成员库$/, (_m, n) => `${n} repositories`],
				[/^本机自测 (.+)$/, (_m, value) => `Local tests ${status(value)}`],
				[/^环境测试 (.+)$/, (_m, value) => `Environment tests ${status(value)}`],
				[/^(\d+) 个任务$/, (_m, n) => `${n} tasks`],
				[/^(\d+) 个审核员$/, (_m, n) => `${n} reviewers`],
				[/^(\d+) 个流程需要你处理$/, (_m, n) => `${n} flows need attention`]
			];
			for (const [pattern, replacer] of rules) if (pattern.test(value)) return value.replace(pattern, replacer);
			return value;
		}
		function localizeNode(node) {
			if (Array.isArray(node)) return node.map(localizeNode);
			return translateText(node);
		}
		function localizeProps(props) {
			if (!props || typeof props !== "object") return props;
			const next = { ...props };
			for (const key of [
				"title",
				"placeholder",
				"aria-label",
				"alt"
			]) if (typeof next[key] === "string") next[key] = translateText(next[key]);
			if (typeof next.label === "string") next.label = translateText(next.label);
			return next;
		}
		/** 本地化元素工厂：替换组件里的 React createElement，让静态文案命中词典时翻译。 */
		function h(type, props, ...children) {
			const localizedChildren = children.map(localizeNode);
			return (0, react.createElement)(type, localizeProps(props), ...localizedChildren);
		}
		/**
		* 语言切换时重新渲染子树：现有组件不逐个订阅 locale，父级重渲染即可让所有
		* 静态文案重新经过 h 工厂；不换 key，避免丢失当前页签/流程状态。
		*/
		function LocaleProvider({ ctx, children }) {
			const [, setRevision] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				try {
					const subscribe = ctx?.locale?.subscribe;
					if (typeof subscribe !== "function") return void 0;
					return subscribe(() => setRevision((value) => value + 1));
				} catch {
					return;
				}
			}, [ctx]);
			let locale = "zh";
			try {
				locale = ctx?.locale?.getLocale?.().active ?? "zh";
				activeLocale = locale;
				activeT = typeof ctx?.locale?.bind === "function" ? ctx.locale.bind(LOCALE_NAMESPACE) : (key) => key;
			} catch {
				activeLocale = "zh";
				activeT = (key) => key;
			}
			const child = Array.isArray(children) ? children[0] : children;
			if (!child) return null;
			return (0, react.cloneElement)(child);
		}
		//#endregion
		//#region src/shared/api.mjs
		/** Shared wire surface between the Host and the browser half. */
		const API = {
			state: "/api/dev-hub/state",
			overview: "/api/dev-hub/overview",
			setup: "/api/dev-hub/setup",
			detect: "/api/dev-hub/detect",
			items: "/api/dev-hub/items",
			item: "/api/dev-hub/item",
			status: "/api/dev-hub/status",
			start: "/api/dev-hub/start",
			sync: "/api/dev-hub/sync",
			context: "/api/dev-hub/context",
			scan: "/api/dev-hub/scan",
			importCandidate: "/api/dev-hub/import",
			switchRepo: "/api/dev-hub/switch-repo",
			workflow: "/api/dev-hub/workflow",
			techdoc: "/api/dev-hub/techdoc",
			test: "/api/dev-hub/test",
			changes: "/api/dev-hub/changes",
			submit: "/api/dev-hub/submit",
			project: "/api/dev-hub/project",
			wizard: "/api/dev-hub/wizard",
			modules: "/api/dev-hub/modules",
			conventions: "/api/dev-hub/conventions",
			parallel: "/api/dev-hub/parallel",
			recon: "/api/dev-hub/recon",
			plan: "/api/dev-hub/plan",
			review: "/api/dev-hub/review",
			session: "/api/dev-hub/session",
			sessions: "/api/dev-hub/sessions",
			skills: "/api/dev-hub/skills",
			sessionLog: "/api/dev-hub/session-log",
			lookup: "/api/dev-hub/lookup",
			assist: "/api/dev-hub/assist",
			pending: "/api/dev-hub/pending",
			answer: "/api/dev-hub/answer",
			repro: "/api/dev-hub/repro",
			check: "/api/dev-hub/check",
			files: "/api/dev-hub/files",
			diff: "/api/dev-hub/diff",
			fileNote: "/api/dev-hub/file-note",
			deleteItem: "/api/dev-hub/item/delete",
			clarify: "/api/dev-hub/clarify",
			requirement: "/api/dev-hub/requirement",
			attach: "/api/dev-hub/attach",
			capabilities: "/api/dev-hub/capabilities",
			removeRepo: "/api/dev-hub/repo/remove",
			genFileNotes: "/api/dev-hub/file-notes/generate",
			workspaces: "/api/dev-hub/workspaces",
			dispatch: "/api/dev-hub/dispatch",
			report: "/api/dev-hub/report"
		};
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
		const STATUS_LABELS = {
			planned: "计划中",
			designing: "设计中",
			developing: "开发中",
			reviewing: "评审中",
			verifying: "验证中",
			done: "已完成",
			blocked: "阻塞"
		};
		//#endregion
		//#region src/shared/workflow.mjs
		/** Workflow stages shared by Host and browser. */
		const WORKFLOW_STAGES = [
			{
				id: "discovery",
				label: "需求澄清",
				hint: "多问询，确定根本问题"
			},
			{
				id: "techdoc",
				label: "技术文档",
				hint: "已有文档，或用 lark-cli 创建"
			},
			{
				id: "plan",
				label: "开发计划",
				hint: "列步骤，评估工程量"
			},
			{
				id: "develop",
				label: "开发中",
				hint: "实时更新进度与细节"
			},
			{
				id: "review",
				label: "独立评审",
				hint: "继续推进即开始评审，通过才放行"
			},
			{
				id: "verify",
				label: "测试验证",
				hint: "评审通过后跑本机自测与环境测试"
			},
			{
				id: "submit",
				label: "提交代码",
				hint: "选择文件，提交并推送"
			},
			{
				id: "done",
				label: "已完成",
				hint: "归档并交接"
			}
		];
		const STAGE_LABELS = Object.fromEntries(WORKFLOW_STAGES.map((stage) => [stage.id, stage.label]));
		/**
		* 审核视角：同一份证据换不同角度审，避免 3 个审核员给出同一段结论。
		* 顺序即默认派发顺序（1 位 → 方向；2 位 → 方向 + 正确性；3 位 → 再加风险）。
		*/
		const REVIEWER_ROLES = [
			{
				id: "direction",
				label: "方向",
				focus: "实现方向是否符合目标与验收标准；有没有偏离需求、过度设计或做小了"
			},
			{
				id: "correctness",
				label: "正确性",
				focus: "实现是否正确，边界/异常/失败路径是否处理，测试是否覆盖到新增行为"
			},
			{
				id: "risk",
				label: "风险",
				focus: "兼容性、数据与迁移、性能、权限、回滚与可观测性等隐患，以及是否留下未说明的缺口"
			}
		];
		const REVIEW_ROLE_BY_ID = Object.fromEntries(REVIEWER_ROLES.map((role) => [role.id, role]));
		/** 评审结论只有两种；待处理/异常由状态表达，不混进 verdict。 */
		const REVIEW_VERDICTS = ["pass", "fail"];
		const REVIEW_STATUS_LABELS = {
			idle: "未评审",
			pending: "评审中",
			passed: "评审通过",
			failed: "评审未通过",
			error: "评审异常待处理"
		};
		const REVIEW_STATUS_TONES = {
			idle: "neutral",
			pending: "info",
			passed: "ok",
			failed: "danger",
			error: "warn"
		};
		//#endregion
		//#region src/core/review.mjs
		/**
		* 独立评审：阶段模型与纯逻辑（不读盘、不调模型、不 import 宿主）。
		*
		* 为什么要有这一层：
		* 开发完成后直接进测试验证，测试只能回答「跑不跑得通」，回答不了「方向对不对、
		* 边界取舍合不合理、有没有留下隐患」。评审把这件事交给 1~3 个独立审核员会话：
		* 他们拿同一份证据（目标/验收/scope/改动/测试/报告）分别给出结论，宿主按结论决定
		* 放行进入测试验证，还是退回开发并附上具体纠偏意见。
		*
		* 判定口径（本模块固化）：
		* - 全部审核员通过才算通过（单一审核员即可判定自己的结论，但整条流程不看多数票）；
		* - 任一审核员不通过 → 流程回到开发，带着该审核员的纠偏意见；
		* - 任一审核员异常/未返回结论 → 状态是「待处理」，绝不当成通过；
		* - 评审不替代测试：通过只是允许进入测试验证，测试门禁仍照旧。
		*
		* 「继续推进」的入口语义也在这里固化（reviewAdvancePlan）：
		* 开发阶段完成后点「继续推进」就自动开始评审，不需要到独立评审页手工派发；
		* 已有 pending 评审时不重复派发（幂等）；派发失败或评审 failed/error 时按钮保持可点，
		* 再点即重试派发并展示上次失败原因；评审 running 时按钮禁用并显示「评审中」。
		*
		* 数据落在 item.workflow.review（见 normalizeReview），阶段由 stage.mjs 按事实推导。
		*/
		const REVIEWER_STATUSES = [
			"pending",
			"passed",
			"failed",
			"error"
		];
		const SEVERITIES = [
			"blocker",
			"major",
			"minor"
		];
		const CONFIDENCE = [
			"high",
			"medium",
			"low"
		];
		const MAX_FINDINGS = 12;
		function str(value, max = 2e3) {
			return String(value ?? "").trim().slice(0, max);
		}
		function strList(value, max = 10, itemMax = 400) {
			return (Array.isArray(value) ? value : []).map((entry) => str(entry, itemMax)).filter(Boolean).slice(0, max);
		}
		function normalizeFindings(raw) {
			return (Array.isArray(raw) ? raw : []).map((finding) => ({
				severity: SEVERITIES.includes(finding?.severity) ? finding.severity : "major",
				summary: str(finding?.summary ?? finding?.title, 400),
				detail: str(finding?.detail, 1200),
				file: str(finding?.file, 400)
			})).filter((finding) => finding.summary).slice(0, MAX_FINDINGS);
		}
		function normalizeReviewer(raw, index) {
			const role = REVIEW_ROLE_BY_ID[raw?.role] ? raw.role : REVIEWER_ROLES[index % REVIEWER_ROLES.length].id;
			return {
				id: str(raw?.id, 40) || `reviewer-${index + 1}`,
				label: str(raw?.label, 80) || `审核员 ${index + 1}`,
				role,
				status: REVIEWER_STATUSES.includes(raw?.status) ? raw.status : "pending",
				verdict: REVIEW_VERDICTS.includes(raw?.verdict) ? raw.verdict : null,
				summary: str(raw?.summary, 2e3),
				findings: normalizeFindings(raw?.findings),
				direction: str(raw?.direction, 1200),
				evidence: strList(raw?.evidence, 8, 400),
				confidence: CONFIDENCE.includes(raw?.confidence) ? raw.confidence : null,
				source: raw?.source === "manual" ? "manual" : "agent",
				sessionId: str(raw?.sessionId, 120),
				provider: str(raw?.provider, 40),
				elapsedMs: Number.isFinite(Number(raw?.elapsedMs)) ? Number(raw.elapsedMs) : null,
				error: str(raw?.error, 1200),
				dispatchedAt: raw?.dispatchedAt || null,
				finishedAt: raw?.finishedAt || null
			};
		}
		function normalizeBasis(raw) {
			if (!raw || typeof raw !== "object") return null;
			return {
				files: Number.isFinite(Number(raw.files)) ? Number(raw.files) : 0,
				added: Number.isFinite(Number(raw.added)) ? Number(raw.added) : 0,
				removed: Number.isFinite(Number(raw.removed)) ? Number(raw.removed) : 0,
				head: str(raw.head, 80),
				localTest: str(raw.localTest, 40) || "not_run",
				at: raw.at || null
			};
		}
		function normalizeHistoryRound(raw) {
			return {
				round: Number.isFinite(Number(raw?.round)) ? Number(raw.round) : 0,
				decidedAt: raw?.decidedAt || null,
				status: [
					"passed",
					"failed",
					"error",
					"pending",
					"idle"
				].includes(raw?.status) ? raw.status : "idle",
				reviewers: (Array.isArray(raw?.reviewers) ? raw.reviewers : []).map((reviewer, index) => {
					const normalized = normalizeReviewer(reviewer, index);
					return {
						id: normalized.id,
						label: normalized.label,
						role: normalized.role,
						status: normalized.status,
						verdict: normalized.verdict,
						summary: normalized.summary,
						findings: normalized.findings,
						source: normalized.source
					};
				}).slice(0, 3)
			};
		}
		/** 台账归一化：review 为空时返回 null（旧流程不受影响）。 */
		function normalizeReview(raw) {
			if (!raw || typeof raw !== "object") return null;
			const reviewers = (Array.isArray(raw.reviewers) ? raw.reviewers : []).map(normalizeReviewer).slice(0, 3);
			if (!reviewers.length && !raw.history?.length) return null;
			return {
				status: deriveReviewStatus(reviewers),
				round: Number.isFinite(Number(raw.round)) && Number(raw.round) > 0 ? Number(raw.round) : 1,
				dispatchedAt: raw.dispatchedAt || null,
				decidedAt: raw.decidedAt || null,
				basis: normalizeBasis(raw.basis),
				invalidatedAt: raw.invalidatedAt || null,
				invalidatedReason: str(raw.invalidatedReason, 400),
				reviewers,
				history: (Array.isArray(raw.history) ? raw.history : []).map(normalizeHistoryRound).filter((entry) => entry.round > 0).slice(-5)
			};
		}
		/** 结论聚合：不通过 > 异常 > 进行中 > 通过；没有审核员就是未评审。 */
		function deriveReviewStatus(reviewers) {
			const list = Array.isArray(reviewers) ? reviewers : [];
			if (!list.length) return "idle";
			if (list.some((reviewer) => reviewer.status === "failed")) return "failed";
			if (list.some((reviewer) => reviewer.status === "error")) return "error";
			if (list.some((reviewer) => reviewer.status === "pending")) return "pending";
			if (list.every((reviewer) => reviewer.status === "passed")) return "passed";
			return "error";
		}
		/** 退回开发时带上的纠偏意见：按审核员分组，blocker/major 优先。 */
		function correctionsOf(review) {
			const current = normalizeReview(review);
			if (!current) return [];
			const severityRank = {
				blocker: 0,
				major: 1,
				minor: 2
			};
			return current.reviewers.filter((reviewer) => reviewer.status === "failed").map((reviewer) => {
				const findings = [...reviewer.findings].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
				const lines = findings.filter((finding) => finding.severity !== "minor" || !findings.some((entry) => entry.severity !== "minor")).slice(0, 6).map((finding) => `${finding.summary}${finding.file ? `（${finding.file}）` : ""}${finding.detail ? `：${finding.detail}` : ""}`);
				return {
					reviewerId: reviewer.id,
					reviewerLabel: reviewer.label,
					role: reviewer.role,
					summary: reviewer.summary,
					direction: reviewer.direction,
					findings: lines.length ? lines : [reviewer.summary || "审核员未给出具体意见"]
				};
			});
		}
		/**
		* 评审门禁：唯一的放行判断。stage.mjs 只消费这里的事实，不再自己判断。
		* @returns {{ allowed: boolean, status: string, stage: 'develop'|'review'|'verify', reason: string, corrections: object[] }}
		*/
		function reviewGate(item) {
			const review = normalizeReview(item?.workflow?.review);
			const status = review?.status ?? "idle";
			const corrections = correctionsOf(review);
			if (status === "passed") return {
				allowed: true,
				status,
				stage: "verify",
				reason: "评审通过，允许进入测试验证",
				corrections: []
			};
			if (status === "failed") return {
				allowed: false,
				status,
				stage: "develop",
				reason: `评审未通过，退回开发纠偏（${corrections.length} 位审核员给出意见）`,
				corrections
			};
			if (status === "error") return {
				allowed: false,
				status,
				stage: "review",
				reason: `评审异常待处理：${(review?.reviewers ?? []).filter((reviewer) => reviewer.status === "error").map((reviewer) => reviewer.label).join("、") || "有审核员"}未返回结论，不能视为通过`,
				corrections: []
			};
			if (status === "pending") return {
				allowed: false,
				status,
				stage: "review",
				reason: "独立评审进行中",
				corrections: []
			};
			return {
				allowed: false,
				status,
				stage: "review",
				reason: "继续推进即开始独立评审：自动派 1~3 位审核员复核改动与证据",
				corrections: []
			};
		}
		/** 界面/报告用的一次性快照（不产生副作用）。 */
		function describeReview(item) {
			const review = normalizeReview(item?.workflow?.review);
			const gate = reviewGate(item);
			const reviewers = review?.reviewers ?? [];
			const passed = reviewers.filter((reviewer) => reviewer.status === "passed").length;
			const failed = reviewers.filter((reviewer) => reviewer.status === "failed").length;
			const pending = reviewers.filter((reviewer) => reviewer.status === "pending").length;
			const errored = reviewers.filter((reviewer) => reviewer.status === "error").length;
			return {
				status: review?.status ?? "idle",
				verdict: review?.status === "passed" ? "pass" : review?.status === "failed" ? "fail" : null,
				round: review?.round ?? 0,
				dispatchedAt: review?.dispatchedAt ?? null,
				decidedAt: review?.decidedAt ?? null,
				basis: review?.basis ?? null,
				total: reviewers.length,
				passed,
				failed,
				pending,
				errored,
				finished: reviewers.length - pending,
				allowed: gate.allowed,
				gateReason: gate.reason,
				corrections: gate.corrections,
				reviewers,
				history: review?.history ?? []
			};
		}
		/**
		* 上次评审失败/异常的原因：给「继续推进」按钮旁的内联提示用。
		* @param {ReturnType<typeof describeReview>} view
		*/
		function reviewFailureHint(view) {
			if (view.status === "error") {
				const errored = (view.reviewers ?? []).filter((reviewer) => reviewer.status === "error");
				const first = errored.find((reviewer) => reviewer.error) ?? errored[0];
				if (first?.error) return `${first.label}：${first.error}`;
				return `${view.errored || errored.length} 位审核员没有返回结论`;
			}
			const correction = (view.corrections ?? [])[0];
			const finding = correction?.findings?.[0];
			return correction?.summary || finding || "审核员给出纠偏意见";
		}
		/**
		* 「继续推进」在评审这一步该做什么：唯一判定，Host/前端/下一步建议共用。
		*
		* - action=dispatch：开发阶段完成（stage=review 且评审 idle）→ 自动创建评审轮；
		* - action=wait：已有 pending 评审 → 幂等不重复派发，按钮禁用并显示「评审中」；
		* - action=retry：上次派发失败或评审 failed/error → 按钮保持可点，再点即重试派发；
		* - action=continue：不在评审这一步 → 仍按原来的「继续推进开发会话」走。
		*
		* 返回值不含副作用，纯函数；label/disabled/hint 直接给按钮用。
		* @returns {{ action: 'dispatch'|'wait'|'retry'|'continue', status: string, label: string,
		*   disabled: boolean, hint: string }}
		*/
		function reviewAdvancePlan(item) {
			const view = describeReview(item);
			const stage = item?.workflow?.stage ?? "discovery";
			if (view.status === "pending") return {
				action: "wait",
				status: view.status,
				label: "评审中",
				disabled: true,
				hint: `独立评审进行中（${view.passed}/${view.total} 位已返回）：等审核员结论，不重复派发`
			};
			if (view.status === "failed") return {
				action: "retry",
				status: view.status,
				label: "继续推进",
				disabled: false,
				hint: `上次评审未通过：${reviewFailureHint(view)}（再点「继续推进」重试评审）`
			};
			if (view.status === "error") return {
				action: "retry",
				status: view.status,
				label: "继续推进",
				disabled: false,
				hint: `上次评审异常：${reviewFailureHint(view)}（再点「继续推进」重试评审）`
			};
			if (view.status === "idle" && stage === "review") return {
				action: "dispatch",
				status: view.status,
				label: "继续推进",
				disabled: false,
				hint: "继续推进即开始独立评审：自动派 1~3 位审核员复核改动与证据"
			};
			return {
				action: "continue",
				status: view.status,
				label: "继续推进",
				disabled: false,
				hint: ""
			};
		}
		//#endregion
		//#region src/shared/requirement.mjs
		/**
		* 需求规范化：客户原话 ≠ 可执行的开发目标。
		*
		* 工作站必须在建流程前把「客户/用户原始需求」整理成结构化、可执行、可验收的描述：
		*   - goal：做什么 + 为什么（动宾，一两句，不含实现细节）
		*   - rootProblem：现状问题与根因（不允许直接写解决方案）
		*   - background / expected：触发场景与期望的行为变化
		*   - nonGoals / acceptance / scopeHints：边界、可验证验收、范围提示
		*
		* 原始需求（raw）一字不改地保留，只用于追溯与重放，**不能直接当成目标/根因**。
		* 这里的函数都是纯函数，Host 与浏览器半共用；真正调模型由 Host 负责（agent-run）。
		*/
		/** 需求的来源：界面据此说明"目标是怎么来的"。 */
		const REQUIREMENT_SOURCE_LABEL = {
			clarify: "澄清规范化",
			agent: "工作站规范化",
			manual: "手工填写",
			local: "本地草稿（待规范化）"
		};
		const MAX_TEXT$1 = 2e3;
		function text$1(value, max = MAX_TEXT$1) {
			return String(value ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, max);
		}
		/** 归一化到"只比语义"的形态：去空白与标点、大小写。 */
		function squashText(value) {
			return String(value ?? "").toLowerCase().replace(/\s+/g, "").replace(/[，。！？；、,.!?;:："'“”‘’（）()\[\]【】<>《》\-—_~·]/g, "");
		}
		/**
		* 原样回填检测：目标/根因是不是把客户原话（或其中一大段）直接抄了一遍。
		* 抄句子本身不能算"总结与规范化"，界面必须继续提示。
		*/
		function isRawEcho(value, raw) {
			const a = squashText(value);
			const b = squashText(raw);
			if (!a || !b) return false;
			if (a === b) return true;
			const [short, long] = a.length <= b.length ? [a, b] : [b, a];
			return short.length >= 12 && long.includes(short) && short.length / long.length >= .8;
		}
		/**
		* 标题是否"还不够像标题"：空、原话搬运、代码片段/注解/文件名/纯标识符。
		* 标题要能概括"这次做什么"，不能拿用户输入的第一行（尤其代码/注解）直接当标题。
		*/
		function isWeakTitle(title, description = "") {
			const value = text$1(title, 200);
			if (!value || value.length < 2) return true;
			if (value.includes("\n")) return true;
			if (description && isRawEcho(value, description) && value.length > 24) return true;
			if (/[@{};=<>`+*|\\]|=>/.test(value)) return true;
			if (!/[\u4e00-\u9fff]/.test(value) && /[()]/.test(value)) return true;
			if (/[\w.-]+\.(java|kt|ts|tsx|js|jsx|mjs|cjs|vue|svelte|go|py|rb|rs|sql|yml|yaml|xml|json|md)\b/i.test(value)) return true;
			if (!/[\u4e00-\u9fff]/.test(value) && /^[A-Za-z_$][\w$.-]*$/.test(value)) return true;
			return false;
		}
		/** 界面用的一句话状态（来源 + 是否已规范化）。 */
		function requirementStatusLabel(record) {
			if (!record || typeof record !== "object") return "未规范化";
			const source = REQUIREMENT_SOURCE_LABEL[record.source] ?? "未规范化";
			return record.needsReview ? `${source} · 待规范化` : source;
		}
		const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
		function text(value, max = 300) {
			return String(value ?? "").trim().slice(0, max);
		}
		function baseName(path) {
			return String(path ?? "").split(/[/\\]/).filter(Boolean).pop() ?? "";
		}
		/** 把任意来源的附件列表收敛成稳定形状；非法/越界路径直接丢弃。 */
		function normalizeAttachments(raw, { limit = 8 } = {}) {
			const list = Array.isArray(raw) ? raw : [];
			const seen = /* @__PURE__ */ new Set();
			const out = [];
			for (const entry of list) {
				if (!entry || typeof entry !== "object") continue;
				const path = text(entry.path, 1e3);
				if (!path || path.includes("..")) continue;
				if (!path.startsWith("/")) continue;
				if (seen.has(path)) continue;
				seen.add(path);
				const mediaType = text(entry.mediaType, 100) || "application/octet-stream";
				const name = text(entry.name, 200) || baseName(path);
				out.push({
					id: text(entry.id, 80) || `att-${out.length + 1}`,
					name,
					path,
					mediaType,
					size: Number.isFinite(Number(entry.size)) ? Number(entry.size) : null,
					kind: entry.kind === "image" || /^image\//i.test(mediaType) ? "image" : "file"
				});
				if (out.length >= limit) break;
			}
			return out;
		}
		function isImageAttachment(attachment) {
			return attachment?.kind === "image" || /^image\//i.test(String(attachment?.mediaType ?? ""));
		}
		/** 人类可读大小（1024 进制，一位小数）。 */
		function formatBytes(size) {
			const value = Number(size);
			if (!Number.isFinite(value) || value <= 0) return "";
			if (value < 1024) return `${value} B`;
			if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
			return `${(value / 1024 / 1024).toFixed(1)} MB`;
		}
		/** 附件在界面上的简短标签：文件名 + 大小。 */
		function attachmentLabel(attachment) {
			const name = text(attachment?.name, 120) || baseName(attachment?.path) || "附件";
			const size = formatBytes(attachment?.size);
			return size ? `${name} · ${size}` : name;
		}
		//#endregion
		//#region src/client/common.mjs
		/**
		* dsh-dev-hub 浏览器半 —— 设计令牌与共享原子。
		*
		* 视觉规范来自 Gitee 家族中后台（sca/scm 原型）：
		* - 单一品牌紫 #6049e7；语义色固定四套，不漂移；
		* - 四级灰阶搭骨架，颜色只作语义信号；
		* - 圆角梯度 SM6 / 常规8 / 容器12 / 标签4 / 胶囊999；
		* - 卡片双层柔影 + 淡彩底；留白走 8/12/16/24 档；等宽数字 tnum。
		*
		* 与 DSH 外壳的关系：**表面与文字优先用 DSH 主题变量**（跟随亮/暗主题），
		* 家族色只用于本工作站自己的强调与语义（按钮、状态、选中态）。
		*/
		const DS = {
			bgBase: "var(--dsw-alias-bg-base, #f9fafd)",
			bgLayer1: "var(--dsw-alias-bg-layer-1, #ffffff)",
			bgLayer2: "var(--dsw-alias-bg-layer-2, #f5f6fa)",
			border1: "var(--dsw-alias-border-l1, #e9eaec)",
			border2: "var(--dsw-alias-border-l2, #ecedf0)",
			label1: "var(--dsw-alias-label-primary, #1e2a3d)",
			label2: "var(--dsw-alias-label-secondary, #4d545e)"
		};
		const T = {
			brand: "#6049e7",
			brandHover: "#7d68ea",
			brandActive: "#4a35c4",
			brandSoft: "#f0edff",
			brandBorder: "#d8d0fb",
			ok: "#00875a",
			okSoft: "#e2ffee",
			danger: "#de350d",
			dangerSoft: "#ffebe5",
			warn: "#ca8a04",
			warnText: "#b65c00",
			warnSoft: "#fff8e6",
			info: "#0c62ff",
			infoSoft: "#eaf1ff",
			text: DS.label1,
			text2: DS.label2,
			text3: "var(--dsw-alias-label-tertiary, #5a5b70)",
			text4: "var(--dsw-alias-label-caption, #848c9f)",
			bg: DS.bgBase,
			surface: DS.bgLayer1,
			surface2: DS.bgLayer2,
			border: DS.border1,
			borderSoft: DS.border2,
			rSm: 6,
			rBase: 8,
			rLg: 12,
			rTag: 4,
			rPill: 999,
			shadowCard: "0 0 2px rgba(9,25,64,.1), 0 2px 6px -2px rgba(9,25,64,.25)",
			shadowHover: "0 0 2px rgba(9,25,64,.12), 0 6px 16px -4px rgba(9,25,64,.22)",
			shadowModal: "0 18px 50px rgba(9,25,64,.18)",
			gap: {
				xs: 8,
				sm: 12,
				md: 16,
				lg: 24
			},
			font: {
				xs: 11,
				sm: 12,
				base: 13,
				md: 14,
				lg: 16,
				stat: 22
			},
			line: 1.8,
			mono: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, monospace",
			transition: "all .18s ease"
		};
		/** 兼容旧代码：所有既有引用 C.xxx 继续可用，取值改为家族令牌。 */
		const C = {
			border: `1px solid ${T.border}`,
			soft: T.surface2,
			text: T.text,
			muted: T.text3,
			accent: T.brand,
			accentSoft: T.brandSoft,
			danger: T.danger,
			dangerBg: T.dangerSoft,
			dangerBorder: `1px solid ${T.danger}`,
			warn: T.warnText,
			warnBg: T.warnSoft,
			warnBorder: `1px solid ${T.warn}`,
			ok: T.ok,
			okBg: T.okSoft,
			okBorder: `1px solid ${T.ok}`,
			card: T.surface
		};
		const styles = {
			wrap: {
				padding: T.gap.md,
				color: T.text,
				fontSize: T.font.base,
				lineHeight: T.line
			},
			page: {
				display: "flex",
				flexDirection: "column",
				height: "100%",
				minHeight: 0,
				background: T.bg,
				color: T.text,
				fontSize: T.font.base,
				lineHeight: T.line
			},
			pageHeader: {
				display: "flex",
				alignItems: "center",
				gap: T.gap.sm,
				flexWrap: "wrap",
				padding: "12px 24px",
				borderBottom: `1px solid ${T.borderSoft}`,
				background: T.surface,
				flex: "0 0 auto"
			},
			pageTitle: {
				fontSize: T.font.lg,
				fontWeight: 600,
				color: T.text,
				letterSpacing: .2
			},
			pageSubtitle: {
				fontSize: T.font.sm,
				color: T.text4
			},
			pageBody: {
				flex: "1 1 auto",
				minHeight: 0,
				overflow: "auto",
				padding: "16px 24px 24px"
			},
			row: {
				display: "flex",
				gap: T.gap.xs,
				alignItems: "center",
				flexWrap: "wrap"
			},
			col: {
				display: "flex",
				flexDirection: "column",
				gap: T.gap.xs
			},
			spread: {
				display: "flex",
				gap: T.gap.xs,
				alignItems: "center",
				justifyContent: "space-between"
			},
			divider: {
				borderTop: `1px solid ${T.borderSoft}`,
				margin: "16px 0"
			},
			spacer: { flex: "1 1 auto" },
			card: {
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rLg,
				background: T.surface,
				padding: T.gap.md,
				boxShadow: T.shadowCard
			},
			cardFlat: {
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rLg,
				background: T.surface,
				padding: T.gap.md
			},
			cardHoverable: {
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rLg,
				background: T.surface,
				padding: T.gap.md,
				boxShadow: T.shadowCard,
				cursor: "pointer",
				transition: T.transition
			},
			sectionTitle: {
				fontSize: T.font.md,
				fontWeight: 600,
				color: T.text
			},
			sectionHint: {
				fontSize: T.font.sm,
				color: T.text4
			},
			input: {
				width: "100%",
				boxSizing: "border-box",
				height: 32,
				padding: "0 10px",
				border: `1px solid ${T.border}`,
				borderRadius: T.rSm,
				background: T.surface,
				color: T.text,
				fontSize: T.font.base,
				fontFamily: "inherit",
				outline: "none",
				transition: T.transition
			},
			textarea: {
				width: "100%",
				boxSizing: "border-box",
				minHeight: 64,
				padding: "8px 10px",
				border: `1px solid ${T.border}`,
				borderRadius: T.rSm,
				background: T.surface,
				color: T.text,
				fontSize: T.font.base,
				fontFamily: "inherit",
				lineHeight: T.line,
				resize: "vertical",
				outline: "none"
			},
			button: {
				height: 32,
				padding: "0 12px",
				border: `1px solid ${T.border}`,
				borderRadius: T.rSm,
				background: T.surface,
				color: T.text2,
				fontSize: T.font.base,
				fontFamily: "inherit",
				cursor: "pointer",
				transition: T.transition,
				whiteSpace: "nowrap"
			},
			primary: {
				height: 32,
				padding: "0 14px",
				border: `1px solid ${T.brand}`,
				borderRadius: T.rSm,
				background: T.brand,
				color: "#fff",
				fontSize: T.font.base,
				fontWeight: 500,
				fontFamily: "inherit",
				cursor: "pointer",
				transition: T.transition,
				whiteSpace: "nowrap"
			},
			item: {
				padding: "10px 12px",
				borderBottom: `1px solid ${T.borderSoft}`,
				cursor: "pointer",
				transition: T.transition
			},
			itemActive: {
				padding: "10px 12px",
				borderBottom: `1px solid ${T.borderSoft}`,
				cursor: "pointer",
				background: T.brandSoft
			},
			cardGrid: {
				display: "grid",
				gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
				gap: T.gap.sm,
				marginTop: T.gap.sm
			},
			flowCard: {
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rLg,
				background: T.surface,
				padding: T.gap.sm,
				cursor: "pointer",
				boxShadow: T.shadowCard,
				transition: T.transition
			},
			flowCardActive: {
				border: `1px solid ${T.brandBorder}`,
				borderRadius: T.rLg,
				background: T.surface,
				padding: T.gap.sm,
				cursor: "pointer",
				boxShadow: T.shadowCard,
				outline: `2px solid ${T.brandSoft}`
			},
			dangerCard: {
				borderLeft: `3px solid ${T.danger}`,
				borderRadius: T.rBase,
				background: T.dangerSoft,
				color: T.danger,
				padding: "10px 12px",
				marginTop: T.gap.xs,
				fontSize: T.font.sm
			},
			warnCard: {
				borderLeft: `3px solid ${T.warn}`,
				borderRadius: T.rBase,
				background: T.warnSoft,
				color: T.warnText,
				padding: "10px 12px",
				marginTop: T.gap.xs,
				fontSize: T.font.sm
			},
			okCard: {
				borderLeft: `3px solid ${T.ok}`,
				borderRadius: T.rBase,
				background: T.okSoft,
				color: T.ok,
				padding: "10px 12px",
				marginTop: T.gap.xs,
				fontSize: T.font.sm
			},
			infoCard: {
				borderLeft: `3px solid ${T.brand}`,
				borderRadius: T.rBase,
				background: "color-mix(in srgb, #6049e7 12%, var(--dsw-alias-bg-layer-1, #ffffff))",
				color: T.text2,
				padding: "10px 12px",
				marginTop: T.gap.xs,
				fontSize: T.font.sm
			},
			pill: {
				display: "inline-flex",
				alignItems: "center",
				padding: "0 8px",
				height: 20,
				borderRadius: T.rTag,
				background: T.surface2,
				color: T.text4,
				fontSize: T.font.xs,
				lineHeight: "20px",
				whiteSpace: "nowrap"
			},
			pillAccent: {
				display: "inline-flex",
				alignItems: "center",
				padding: "0 8px",
				height: 20,
				borderRadius: T.rTag,
				background: T.brandSoft,
				color: T.brand,
				fontSize: T.font.xs,
				lineHeight: "20px",
				whiteSpace: "nowrap"
			},
			chip: {
				display: "inline-flex",
				alignItems: "center",
				height: 28,
				padding: "0 10px",
				border: `1px solid ${T.border}`,
				borderRadius: T.rPill,
				background: T.surface,
				color: T.text3,
				fontSize: T.font.sm,
				cursor: "pointer",
				transition: T.transition,
				whiteSpace: "nowrap"
			},
			chipOn: {
				display: "inline-flex",
				alignItems: "center",
				height: 28,
				padding: "0 10px",
				border: `1px solid ${T.brandBorder}`,
				borderRadius: T.rPill,
				background: T.brandSoft,
				color: T.brand,
				fontSize: T.font.sm,
				fontWeight: 500,
				cursor: "pointer",
				transition: T.transition,
				whiteSpace: "nowrap"
			},
			stepBar: {
				display: "flex",
				gap: T.gap.xs,
				flexWrap: "wrap",
				marginBottom: T.gap.sm
			},
			stepItem: {
				padding: "0 10px",
				height: 24,
				lineHeight: "24px",
				borderRadius: T.rPill,
				background: T.surface2,
				color: T.text4,
				fontSize: T.font.xs
			},
			stepItemActive: {
				padding: "0 10px",
				height: 24,
				lineHeight: "24px",
				borderRadius: T.rPill,
				background: T.brand,
				color: "#fff",
				fontSize: T.font.xs
			},
			stepItemDone: {
				padding: "0 10px",
				height: 24,
				lineHeight: "24px",
				borderRadius: T.rPill,
				background: T.okSoft,
				color: T.ok,
				fontSize: T.font.xs
			},
			label: {
				display: "block",
				margin: "12px 0 6px",
				color: T.text3,
				fontSize: T.font.sm,
				fontWeight: 500
			},
			smallMuted: {
				color: T.text4,
				fontSize: T.font.sm
			},
			smallDanger: {
				color: T.danger,
				fontSize: T.font.sm
			},
			mono: {
				fontFamily: T.mono,
				fontSize: T.font.sm,
				fontVariantNumeric: "tabular-nums"
			},
			num: { fontVariantNumeric: "tabular-nums" },
			pre: {
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
				background: T.surface2,
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rSm,
				padding: 12,
				maxHeight: 280,
				overflow: "auto",
				fontSize: T.font.sm,
				fontFamily: T.mono,
				lineHeight: 1.7
			},
			progressOuter: {
				height: 6,
				borderRadius: T.rPill,
				background: T.surface2,
				overflow: "hidden",
				marginTop: 6
			},
			progressInner: {
				height: 6,
				background: T.brand,
				transition: "width .8s cubic-bezier(.22,1,.36,1)"
			},
			modal: {
				position: "fixed",
				inset: 0,
				zIndex: 1e4,
				background: "rgba(15,23,42,.38)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: T.gap.md
			},
			modalCard: {
				width: "min(760px, 96vw)",
				maxHeight: "86vh",
				overflow: "auto",
				background: T.surface,
				color: T.text,
				borderRadius: T.rLg,
				border: `1px solid ${T.borderSoft}`,
				padding: T.gap.lg,
				boxShadow: T.shadowModal
			}
		};
		/** 统一的 JSON 请求封装：非 2xx 或 ok:false 一律抛错，调用方只需 try/catch。 */
		async function api(url, options = {}) {
			let response;
			try {
				response = await fetch(url, {
					...options,
					headers: {
						"content-type": "application/json",
						...options.headers ?? {}
					}
				});
			} catch (err) {
				throw new Error(`连不上工作站（${String(err?.message ?? err)}）：DSH 可能刚重启，稍后重试或刷新页面`);
			}
			const body = await response.json().catch(() => ({}));
			if (!response.ok || body?.ok === false) {
				const fallback = response.status === 404 ? "工作站接口不可用（HTTP 404）：DSH 可能正在重启或插件未加载，稍后重试" : response.status === 401 || response.status === 403 ? `没有权限调用工作站接口（HTTP ${response.status}）：请在本机打开的页面里重试` : `HTTP ${response.status}`;
				throw new Error(body?.error || fallback);
			}
			return body;
		}
		function splitLines(value) {
			return String(value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
		}
		function joinLines(values) {
			return Array.isArray(values) ? values.join("\n") : "";
		}
		function errorText(err) {
			return String(err?.message ?? err);
		}
		function Button({ primary, children, style, ...rest }) {
			const merged = {
				...primary ? styles.primary : styles.button,
				...style ?? {}
			};
			if (rest.disabled) {
				merged.opacity = .5;
				merged.cursor = "not-allowed";
			}
			return h("button", {
				type: "button",
				style: merged,
				...rest
			}, children);
		}
		/**
		* 表单内的主按钮。`Button` 固定 `type="button"`（不会触发表单提交），
		* 表单里必须用这个，否则点「保存」毫无反应。
		*/
		function SubmitButton({ children, ...rest }) {
			return h("button", {
				type: "submit",
				style: styles.primary,
				...rest
			}, children);
		}
		/** 状态中文兜底：共享枚举缺项时不把英文枚举直接暴露给用户。 */
		const STATUS_TEXT = {
			planned: "计划中",
			designing: "设计中",
			developing: "开发中",
			reviewing: "评审中",
			verifying: "验证中",
			done: "已完成",
			blocked: "阻塞"
		};
		/** 语义色 + 淡底：同一个状态全站一套值。 */
		const TONE = {
			accent: {
				color: T.brand,
				bg: T.brandSoft
			},
			ok: {
				color: T.ok,
				bg: T.okSoft
			},
			danger: {
				color: T.danger,
				bg: T.dangerSoft
			},
			warn: {
				color: T.warnText,
				bg: T.warnSoft
			},
			info: {
				color: T.info,
				bg: T.infoSoft
			},
			neutral: {
				color: T.text4,
				bg: T.surface2
			}
		};
		const STATUS_TONE = {
			planned: "neutral",
			designing: "accent",
			developing: "accent",
			reviewing: "info",
			verifying: "info",
			done: "ok",
			blocked: "danger"
		};
		function statusText(status) {
			return STATUS_LABELS[status] ?? STATUS_TEXT[status] ?? status;
		}
		function StatusPill({ status }) {
			return h(Tag, { tone: STATUS_TONE[status] ?? "neutral" }, statusText(status));
		}
		function Pill({ tone, children }) {
			return h(Tag, { tone: tone === "warn" ? "warn" : tone ?? "neutral" }, children);
		}
		/** 家族式 Tag：文字=语义主色，底色=同色 8%，圆角 4，无边框。 */
		function Tag({ tone = "neutral", children, style, onClick, title }) {
			const palette = TONE[tone] ?? TONE.neutral;
			return h("span", {
				...onClick ? {
					role: "button",
					tabIndex: 0
				} : {},
				...title ? { title } : {},
				...onClick ? {
					onClick,
					onKeyDown: (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onClick(event);
						}
					}
				} : {},
				style: {
					display: "inline-flex",
					alignItems: "center",
					height: 20,
					padding: "0 8px",
					borderRadius: T.rTag,
					background: palette.bg,
					color: palette.color,
					fontSize: T.font.xs,
					fontWeight: 500,
					lineHeight: "20px",
					whiteSpace: "nowrap",
					...onClick ? { cursor: "pointer" } : {},
					...style ?? {}
				}
			}, children);
		}
		/**
		* 纯 CSS 旋转指示器：表示「这件事还在跑」，不引入动画库、不新增依赖。
		*
		* 为什么要有它：开发会话在后台跑时，页面如果只有一个静态「开发中」标签，
		* 用户很难意识到进程还活着。转圈是最便宜、最不会误读的“仍在工作”信号。
		* 颜色取 TONE 的语义主色，轨道用同色 8% 淡底；keyframes 叫 devhub-hub-spin，
		* 和 chat.mjs 里打字气泡的 devhub-spin 分开，避免同名动画互相覆盖。
		*
		* 服务端渲染（没有 document）时不注入 style，只输出带 animation 的 span；
		* 浏览器首次渲染时注入一次，之后所有 Spinner 复用同一段 CSS。
		*/
		let spinnerStyleInjected = false;
		function ensureSpinnerStyle() {
			if (spinnerStyleInjected || typeof document === "undefined") return;
			spinnerStyleInjected = true;
			const style = document.createElement("style");
			style.id = "devhub-hub-spinner";
			style.textContent = "@keyframes devhub-hub-spin{to{transform:rotate(360deg)}}";
			document.head?.appendChild(style);
		}
		function Spinner({ size = 12, tone = "accent", title, style }) {
			ensureSpinnerStyle();
			const palette = TONE[tone] ?? TONE.accent;
			return h("span", {
				...title ? {
					title,
					role: "img",
					"aria-label": title
				} : { "aria-hidden": true },
				style: {
					display: "inline-block",
					width: size,
					height: size,
					flex: `0 0 ${size}px`,
					boxSizing: "border-box",
					border: `${Math.max(1.5, Math.round(size / 6))}px solid ${palette.bg}`,
					borderTopColor: palette.color,
					borderRadius: "50%",
					animation: "devhub-hub-spin .7s linear infinite",
					verticalAlign: "middle",
					...style ?? {}
				}
			});
		}
		/** 品牌紫/深色底上的白色转圈：ArrowSteps 当前节点与主按钮里用。 */
		const spinnerOnBrand = {
			borderColor: "rgba(255,255,255,.45)",
			borderTopColor: "#fff"
		};
		/** 圆角图标座：主色 8% 淡底 + 同色图形。 */
		function IconSeat({ children, tone = "accent", size = 32 }) {
			const palette = TONE[tone] ?? TONE.accent;
			return h("span", { style: {
				width: size,
				height: size,
				flex: `0 0 ${size}px`,
				borderRadius: size * .3,
				background: palette.bg,
				color: palette.color,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				fontSize: size * .5
			} }, children);
		}
		/** 统计值：标签在上、数值在下，数值等宽不跳动。 */
		function Stat({ label, value, hint }) {
			return h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 2,
				minWidth: 72
			} }, h("span", { style: {
				fontSize: T.font.sm,
				color: T.text4
			} }, label), h("span", { style: {
				fontSize: T.font.stat,
				fontWeight: 600,
				color: T.text,
				lineHeight: 1.2,
				fontVariantNumeric: "tabular-nums"
			} }, value), hint ? h("span", { style: {
				fontSize: T.font.xs,
				color: T.text4
			} }, hint) : null);
		}
		/**
		* 当前「开发目标」徽标：流程页 / 技能页的头部都靠它回答“现在管的是哪个库”。
		*
		* 虚拟库（多代码库组合）没有主库：台账/规范/上下文/证据都在本机独立目录
		* `~/.dev-hub/workspaces/<id>/`，成员库只是一个平权的组合。
		*
		* 只做展示、不取数：调用方把 `/state` 返回的 repo / workspace 传进来即可。
		* 点击（可选）= 回「流程」页切换目标，避免用户在这里找不到切换入口。
		*/
		function RepoScopeBadge({ repo = null, workspace = null, onClick = null, style = null }) {
			const repos = workspace?.repos ?? [];
			const localPath = workspace?.path ?? workspace?.localPath ?? repo?.path ?? "";
			const clickable = typeof onClick === "function";
			const truncate = {
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			};
			const title = workspace ? `虚拟库「${workspace.name ?? "未命名"}」· ${repos.length} 个成员库\n本机台账 ${localPath || "—"}\n台账/规范/上下文/证据都写在本机，不写任何成员库` : repo ? `当前代码库：${repo.name ?? "未命名"}\n${repo.path ?? "—"}` : "还没有选择代码库：到「流程」页选择或新增";
			return h("div", {
				...clickable ? {
					role: "button",
					tabIndex: 0
				} : {},
				title,
				...clickable ? {
					onClick,
					onKeyDown: (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onClick(event);
						}
					}
				} : {},
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
					height: 28,
					padding: "0 12px",
					maxWidth: "100%",
					minWidth: 0,
					border: `1px solid ${T.borderSoft}`,
					borderRadius: T.rPill,
					background: T.surface2,
					color: T.text2,
					fontSize: T.font.sm,
					...clickable ? { cursor: "pointer" } : {},
					...style ?? {}
				}
			}, workspace ? [
				h(Tag, {
					key: "kind",
					tone: "accent"
				}, "虚拟库"),
				h("span", {
					key: "name",
					style: {
						fontWeight: 600,
						color: T.text,
						maxWidth: 180,
						flex: "0 1 auto",
						...truncate
					}
				}, workspace.name ?? "未命名"),
				h(Tag, {
					key: "count",
					tone: "neutral"
				}, `${repos.length} 库`),
				h("span", {
					key: "local",
					style: {
						...styles.mono,
						color: T.text4,
						maxWidth: 220,
						minWidth: 0,
						...truncate
					}
				}, "本机台账")
			] : repo ? [
				h(Tag, {
					key: "kind",
					tone: "neutral"
				}, "代码库"),
				h("span", {
					key: "name",
					style: {
						fontWeight: 600,
						color: T.text,
						maxWidth: 180,
						flex: "0 0 auto",
						...truncate
					}
				}, repo.name ?? repo.path ?? "未命名"),
				h("span", {
					key: "dot",
					style: {
						color: T.text4,
						flex: "0 0 auto"
					}
				}, "·"),
				h("span", {
					key: "path",
					style: {
						...styles.mono,
						color: T.text4,
						minWidth: 0,
						flex: "1 1 auto",
						...truncate
					}
				}, shortRepoPath(repo.path, repo.name))
			] : [h(Tag, {
				key: "kind",
				tone: "warn"
			}, "未选择代码库")]);
		}
		/** 头部只展示定位用的目录尾部：`…/父目录/仓库名`（仓库名已单独显示时只留父目录），全路径仍放在 tooltip。 */
		function shortRepoPath(path, name = "") {
			const parts = String(path ?? "").split(/[/\\]/).filter(Boolean);
			if (parts.length <= 2) return String(path ?? "");
			const [parent, base] = parts.slice(-2);
			return name && base === name ? `…/${parent}` : `…/${parent}/${base}`;
		}
		/** 分段控件（页签）。 */
		function Segmented({ options, value, onChange }) {
			return h("div", { style: {
				display: "inline-flex",
				padding: 2,
				gap: 2,
				background: T.surface2,
				borderRadius: T.rBase,
				border: `1px solid ${T.borderSoft}`
			} }, options.map((option) => h("button", {
				key: option.value,
				type: "button",
				onClick: () => onChange?.(option.value),
				style: {
					height: 26,
					padding: "0 12px",
					border: "none",
					borderRadius: T.rSm,
					background: option.value === value ? T.surface : "transparent",
					color: option.value === value ? T.text : T.text4,
					fontSize: T.font.sm,
					fontWeight: option.value === value ? 600 : 400,
					cursor: "pointer",
					fontFamily: "inherit",
					boxShadow: option.value === value ? "0 1px 2px rgba(9,25,64,.12)" : "none",
					transition: T.transition
				}
			}, option.label)));
		}
		/** 空状态：图标座 + 主句 + 提示。 */
		function EmptyState({ icon = "✎", title, hint, action }) {
			return h("div", { style: {
				padding: "32px 16px",
				textAlign: "center"
			} }, h("div", { style: {
				display: "flex",
				justifyContent: "center",
				marginBottom: T.gap.sm
			} }, h(IconSeat, { size: 44 }, icon)), h("div", { style: {
				fontSize: T.font.md,
				fontWeight: 600,
				color: T.text
			} }, title), hint ? h("div", { style: {
				marginTop: 6,
				fontSize: T.font.sm,
				color: T.text4
			} }, hint) : null, action ? h("div", { style: { marginTop: T.gap.md } }, action) : null);
		}
		function fmtTime(value) {
			if (!value) return "—";
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return String(value);
			const pad = (n) => String(n).padStart(2, "0");
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}
		/** 路径最后一段目录名（虚拟库成员库 label 的兜底口径）。 */
		function repoBaseName(path) {
			const value = String(path ?? "").replace(/[\\/]+$/, "");
			if (!value) return "";
			return value.split(/[\\/]/).filter(Boolean).pop() ?? "";
		}
		/**
		* scope 词条：`module:xxx` 表示模块名，`<成员库>:<仓库内路径>` 表示虚拟库里的成员库范围，
		* 其余按裸路径展示。
		*
		* 虚拟库的跨库 scope 用 `web:src/x` 存（Host 扫描返回的格式），界面上显示成
		* `web · src/x`，比冒号更像"某个库里的某个路径"，也不会和 `module:` 混在一起。
		* scope 路径都是仓库相对路径，因此不把单字母前缀（Windows 盘符）当特例。
		*/
		function scopeTokenLabel(token) {
			const value = String(token ?? "");
			if (value.startsWith("module:")) return `模块 ${value.slice(7)}`;
			const at = value.indexOf(":");
			if (at > 0 && at < value.length - 1) return `${value.slice(0, at)} · ${value.slice(at + 1)}`;
			return value;
		}
		function moduleToken(module) {
			if (String(module?.kind ?? "") === "module") return `module:${module?.name ?? ""}`;
			return String(module?.path || module?.name || "");
		}
		function uniqueTokens(values) {
			const seen = /* @__PURE__ */ new Set();
			const out = [];
			for (const raw of values ?? []) {
				const token = String(raw ?? "").trim();
				if (!token || seen.has(token)) continue;
				seen.add(token);
				out.push(token);
			}
			return out;
		}
		//#endregion
		//#region src/shared/slug.mjs
		/**
		* 共享的命名/检索词工具：Host 与浏览器半都要用，所以不能依赖 node:fs。
		* （core/wizard.mjs 与 core/recon.mjs 直接复用这里的实现。）
		*/
		const MAX_NAME = 40;
		const MAX_GOAL = 2e3;
		/** Slug suitable for an item id（允许中文，但优先英文）。 */
		function safeSlug(input, fallback = "item") {
			return String(input ?? "").trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || fallback;
		}
		/** First sentence of the description, used as the default flow name. */
		function suggestName(description) {
			const text = String(description ?? "").trim();
			if (!text) return "";
			const line = text.split(/\r?\n/).map((value) => value.trim()).find(Boolean) ?? "";
			return (line.split(/[。！？!?；;]/).map((value) => value.trim()).find(Boolean) ?? line).slice(0, MAX_NAME);
		}
		function timestampId(date) {
			const pad = (value) => String(value).padStart(2, "0");
			return `flow-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
		}
		/**
		* 把“我要做什么”这句话变成流程名称与 id。
		* 英文词优先做 id（id 会变成文件名）；纯中文描述回退成时间戳 id。
		*/
		function draftFromDescription(description, { date = /* @__PURE__ */ new Date() } = {}) {
			const text = String(description ?? "").trim().slice(0, MAX_GOAL);
			const name = suggestName(text);
			const ascii = (text.toLowerCase().match(/[a-z][a-z0-9]*/g) ?? []).filter((word) => word.length > 1).slice(0, 6).join("-");
			return {
				name,
				id: ascii.length >= 3 ? safeSlug(ascii).slice(0, 60) : timestampId(date),
				goal: text
			};
		}
		//#endregion
		//#region src/client/chat-flow.mjs
		const PHASE = {
			idle: "idle",
			analyzing: "analyzing",
			confirm: "confirm",
			planning: "planning",
			plan: "plan",
			creating: "creating",
			done: "done"
		};
		let messageSeq = 0;
		/** 构造一条对话消息（id 单调递增，React 列表 key 用）。 */
		function message(role, kind, payload = {}) {
			messageSeq += 1;
			return {
				id: `m${messageSeq}`,
				at: (/* @__PURE__ */ new Date()).toISOString(),
				role,
				kind,
				...payload
			};
		}
		function userMessage(text, attachments = []) {
			const list = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
			return message("user", "text", {
				text: String(text ?? "").trim(),
				...list.length ? { attachments: list } : {}
			});
		}
		function stationMessage(text, extra = {}) {
			return message("workstation", "text", {
				text: String(text ?? "").trim(),
				...extra
			});
		}
		/** 探测结果的对话卡片（用户要在这一步二次确认）。 */
		function reconMessage(recon, draft) {
			return message("workstation", "recon", {
				recon,
				draft
			});
		}
		/**
		* 工作站追问卡片。questions 原样来自 recon.questions：
		* `[{ id, question, why, kind: 'choice'|'text', options?: [{ id, label, value }] }]`
		*/
		/**
		* 需求澄清卡片：一轮追问（agent 产出的问题）+ 当前规格。
		* `{ round, reply, questions, spec, ready, missing, engine }`
		*/
		function clarifyMessage(payload) {
			return message("workstation", "clarify", {
				round: payload.round ?? 1,
				reply: payload.reply ?? "",
				questions: Array.isArray(payload.questions) ? payload.questions : [],
				spec: payload.spec ?? {},
				ready: Boolean(payload.ready),
				missing: Array.isArray(payload.missing) ? payload.missing : [],
				engine: payload.engine ?? "dsh",
				degraded: Boolean(payload.degraded)
			});
		}
		/**
		* 计划卡片。plan 原样来自 Host 的 /api/dev-hub/plan：
		* `{ summary, steps, acceptance, risks, estimate, modules }`
		*/
		function planMessage(plan, extra = {}) {
			return message("workstation", "plan", {
				plan,
				...extra
			});
		}
		/** 一句话概括探测结果，先给用户一个结论，再展开细节。 */
		function summarizeRecon(recon) {
			if (!recon) return "没探测到相关内容。";
			const files = recon.files?.length ?? 0;
			if (!files) return recon.truncated ? `扫描了 ${recon.scanned} 个文件（已截断），没找到明确相关的位置。可以把要做什么写得更具体，或直接手动指定目录。` : `扫描了 ${recon.scanned} 个文件，没找到明确相关的位置。可以补充关键词，或直接指定目录。`;
			const modules = (recon.modules ?? []).map((entry) => entry.name).filter(Boolean).slice(0, 4);
			return [`扫了 ${recon.scanned} 个文件，命中 ${files} 个候选${modules.length ? `，集中在 ${modules.join("、")}` : ""}。`, "下面是可能要改的文件与命中行，确认后我再建流程并开启开发会话。"].join("");
		}
		/** 探测：只调一个接口，失败向上抛，由界面渲染成工作站消息。 */
		async function probeCode(deps, description, { attachments = [], repoPath = null } = {}) {
			const text = String(description ?? "").trim();
			const list = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
			if (text.length < 4 && !list.length) throw new Error("再多写一点：至少一句话说明要做什么");
			return {
				description: text,
				recon: await deps.recon(text, {
					attachments: list,
					repoPath
				}),
				draft: draftFromDescription(text),
				attachments: list
			};
		}
		/** 置信度的中文说法（低/中/高），未知值不把英文枚举直接抛给用户。 */
		const CONFIDENCE_TEXT = {
			low: "低",
			medium: "中",
			high: "高"
		};
		function confidenceText(confidence) {
			return CONFIDENCE_TEXT[confidence] ?? "未知";
		}
		/** 计划的一句话摘要，用于计划卡片前面的工作站消息。 */
		function summarizePlan(plan) {
			if (!plan) return "";
			const steps = Array.isArray(plan.steps) ? plan.steps.length : 0;
			const estimate = plan.estimate ?? {};
			const days = Number(estimate.days);
			return `工作站出了计划：${steps} 步 · ${estimate.size ? `规模 ${estimate.size}` : "规模未知"} / ${Number.isFinite(days) ? `${days} 人日` : "人日未知"}（工作站自评，可调整范围后重算）`;
		}
		/**
		* 把追问整理成可写进台账的澄清记录：`[{ id, question, answer, answeredAt }]`。
		* 答案可能是字符串（选择题的 value）或对象（如 `{ mode:'only', module:'source' }`），
		* 对象按 JSON 存证 —— 与 Host 的 core/questions.answeredQuestions 保持同一形状。
		*
		* 也接受“已经是答复记录”的入参（含 answer 字段），方便调用方二次透传；没有答案的问题直接跳过。
		*/
		function answeredQuestions(questions, answers) {
			const out = [];
			(Array.isArray(questions) ? questions : []).forEach((question, index) => {
				if (!question || typeof question !== "object") return;
				const id = String(question.id ?? question.key ?? `q${index + 1}`).trim() || `q${index + 1}`;
				const raw = question.answer !== void 0 && question.answer !== null ? question.answer : answers?.[id] ?? answers?.[question.id];
				if (raw === void 0 || raw === null) return;
				const answer = typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
				if (!answer) return;
				out.push({
					id,
					question: String(question.question ?? question.text ?? "").trim(),
					answer,
					answeredAt: question.answeredAt || (/* @__PURE__ */ new Date()).toISOString()
				});
			});
			return out;
		}
		/**
		* 生成计划：工作站自己出步骤/验收/风险/工程量（用户不填规模与人天）。
		* deps.plan(payload) -> WorkPlan；失败向上抛，由界面渲染成中文工作站消息。
		*/
		async function generatePlan(deps, input = {}) {
			const description = String(input.description ?? "").trim();
			if (description.length < 4) throw new Error("再多写一点：至少一句话说明要做什么");
			if (typeof deps?.plan !== "function") throw new Error("当前版本缺少计划接口，请升级工作站插件后再试");
			const scope = Array.isArray(input.scope) ? input.scope.filter(Boolean) : [];
			if (!scope.length) throw new Error("至少要保留一个目录或模块，否则并行冲突没法判定");
			const answers = input.answers && typeof input.answers === "object" ? input.answers : {};
			const spec = input.spec && typeof input.spec === "object" ? input.spec : null;
			const plan = await deps.plan({
				description,
				recon: {
					tokens: Array.isArray(input.recon?.tokens) ? input.recon.tokens : [],
					files: Array.isArray(input.recon?.files) ? input.recon.files : []
				},
				scope,
				answers,
				...spec ? { spec } : {}
			});
			if (!plan || typeof plan !== "object") throw new Error("工作站没有返回开发计划");
			if (!Array.isArray(plan.steps) || !plan.steps.length) throw new Error("工作站返回的计划没有步骤，先别开工；补充描述或调整范围后重试");
			return plan;
		}
		/**
		* 把计划整理成 Host 建流程时接受的 `plan` 形状（summary/steps/acceptance/estimate）。
		* 没有可用字段时返回 null —— 老调用方不带计划，建流程保持旧行为。
		*/
		function planPayloadOf(plan = {}) {
			const payload = {};
			if (plan.summary) payload.summary = String(plan.summary);
			if (Array.isArray(plan.steps) && plan.steps.length) payload.steps = plan.steps;
			if (Array.isArray(plan.acceptance) && plan.acceptance.length) payload.acceptance = plan.acceptance;
			if (plan.estimate && typeof plan.estimate === "object") payload.estimate = plan.estimate;
			return Object.keys(payload).length ? payload : null;
		}
		/**
		* 二次确认之后：首次落规范 -> 建流程（带确认过的文件与范围、计划、追问答案）-> 记 baseline -> 开启开发会话。
		* 返回新增的工作站消息与结果，调用方负责把它们追加到对话里。
		*
		* plan 新增字段（都可选，不传就完全按旧行为）：
		*   summary / steps / acceptance / estimate  —— 工作站自评计划
		*   questions（原始追问定义，或已答复记录）/ answers（{ [questionId]: value }）
		*/
		async function confirmAndStart(deps, plan) {
			const messages = [];
			const description = String(plan.description ?? "").trim();
			const draft = plan.draft ?? draftFromDescription(description);
			const name = String(plan.title ?? "").trim() || String(plan.name ?? "").trim() || draft.name || "未命名流程";
			const id = String(plan.id ?? "").trim() || draft.id;
			const scope = Array.isArray(plan.scope) ? plan.scope.filter(Boolean) : [];
			if (!scope.length) throw new Error("至少要保留一个目录或模块，否则并行冲突没法判定");
			const planPayload = planPayloadOf(plan);
			const answered = answeredQuestions(plan.questions, plan.answers);
			if (plan.firstRun) {
				const boot = await deps.bootstrap();
				const count = boot?.summary?.constraints ?? boot?.conventions?.constraints?.length;
				messages.push(stationMessage(`这个仓库是首次开发，已按默认规范生成 .dev-hub/conventions.json${count ? `（${count} 条约束）` : ""}。`));
			}
			const created = await deps.create({
				description,
				name,
				...plan.title ? { title: String(plan.title) } : {},
				id,
				...plan.goal ? { goal: String(plan.goal) } : {},
				...plan.rootProblem ? { rootProblem: String(plan.rootProblem) } : {},
				...plan.spec && typeof plan.spec === "object" ? { spec: plan.spec } : {},
				entry: "chat",
				...Array.isArray(plan.attachments) && plan.attachments.length ? { attachments: plan.attachments } : {},
				answers: plan.answers ?? {},
				scope,
				recon: {
					at: (/* @__PURE__ */ new Date()).toISOString(),
					description,
					tokens: plan.recon?.tokens ?? [],
					files: plan.recon?.files ?? []
				},
				...planPayload ? { plan: planPayload } : {},
				...answered.length ? { questions: answered } : {}
			});
			const item = created?.item ?? null;
			if (!item?.id) throw new Error("Host 没有返回流程 id，创建可能没成功");
			messages.push(stationMessage(`已建立开发流程「${item.title ?? name}」（${item.id}）${created?.parallel?.canParallel === false ? "；注意：与进行中的流程 scope 有重叠，建议串行。" : ""}`));
			if (plan.syncBeforeStart !== false && typeof deps.sync === "function") try {
				const synced = await deps.sync(item.id);
				const updated = (Array.isArray(synced?.repos) ? synced.repos : []).filter((row) => row?.updated);
				messages.push(stationMessage(updated.length ? `开工前已同步 ${updated.length} 个仓库：${updated.map((row) => `${row.name} ${row.before ?? "?"} → ${row.after ?? "?"}`).join("、")}` : "开工前检查：当前代码已是最新。"));
			} catch (error) {
				messages.push(stationMessage(`开工前同步失败：${String(error?.message ?? error)}；继续按当前 HEAD 开工（可稍后在详情页重试「拉取代码」）。`, { tone: "warn" }));
			}
			const started = await deps.start(item.id);
			messages.push(stationMessage("已记录 baseline，并按规范 + 目标文件生成了 Context Pack。"));
			if (started?.worktree) messages.push(stationMessage(`已创建独立工作区：${started.worktree.path}（分支 ${started.worktree.branch}）；本流程的改动、测试与提交都在这里。`));
			else if (Array.isArray(started?.workspaceWorktrees) && started.workspaceWorktrees.length) messages.push(stationMessage(`已为 ${started.workspaceWorktrees.length} 个成员库创建独立工作区：${started.workspaceWorktrees.map((entry) => `${entry.name}@${entry.branch}`).join("、")}。`));
			const launched = await deps.launch({
				cwd: started?.workRoot ?? plan.cwd,
				prompt: deps.prompt(started?.context?.prompt, started?.item ?? item)
			});
			messages.push(stationMessage(launched?.sent ? `已开启开发会话 ${launched.sessionId}：约束、目标文件与命中行已发给它，开发在那个会话里继续。` : "已开启新会话并把上下文放进输入框（当前版本不支持自动发送），确认后按发送即可开始。"));
			return {
				messages,
				item,
				sessionId: launched?.sessionId ?? null,
				sent: Boolean(launched?.sent)
			};
		}
		//#endregion
		//#region src/client/session.mjs
		/**
		* 工作站 → DSH 会话：把 Context Pack 交给一个新会话，并切过去。
		* 单独成文件，避免 chat/index 之间互相 import 形成环。
		*/
		/**
		* 工作站 → DSH 会话：新建一个会话，把 Context Pack 作为首条消息入队，
		* 然后切到那个会话。规范与约束就是这样“由工作站告知”的。
		* 优先走会话控制器（真会话 + 真发送）；不支持时退化为带草稿的新会话。
		*/
		/**
		* 工作站创建/接管的开发会话默认用「完全权限」：
		* 开发过程需要写仓库外的 ~/.dsh（本机命令、工作区、附件），否则每次越界都会卡在授权，
		* 而这类授权只能在会话页确认。会话里随时可以切回更窄的模式。
		*/
		const DEFAULT_SESSION_PERMISSION = "danger-full-access";
		/** 把会话的 sandbox 模式写进会话事件（DSH 的 setSandboxMode 等价写法，旧版本不支持则跳过）。 */
		function applySessionPermission(session, mode = DEFAULT_SESSION_PERMISSION) {
			try {
				if (mode && typeof session?.append === "function") session.append("sandbox/mode", { mode });
				return true;
			} catch {
				return false;
			}
		}
		async function launchDevSession(ctx, { cwd, prompt, continueSessionId, open = true, permissionMode = DEFAULT_SESSION_PERMISSION } = {}) {
			const sessions = ctx?.get?.("sessions");
			const uiWorkspace = ctx?.get?.("uiWorkspace");
			let failure = null;
			if (continueSessionId && sessions?.retain) try {
				const reference = sessions.retain(String(continueSessionId), { source: "controllerOperation" });
				try {
					const binding = await reference.ready;
					applySessionPermission(binding.session, permissionMode);
					const result = await binding.session.prompt([{
						type: "text",
						text: prompt
					}], "queue");
					if (result && result.ok === false) throw new Error(result.error?.message ?? "会话拒绝了这条开发上下文");
				} finally {
					reference.release();
				}
				if (open) uiWorkspace?.openSession?.(continueSessionId);
				return {
					sessionId: String(continueSessionId),
					sent: true,
					continued: true
				};
			} catch (error) {
				failure = error;
			}
			if (sessions?.create) try {
				const sessionId = await sessions.create(cwd ? { cwd } : void 0);
				const reference = sessions.retain(sessionId, { source: "controllerOperation" });
				try {
					const binding = await reference.ready;
					applySessionPermission(binding.session, permissionMode);
					const result = await binding.session.prompt([{
						type: "text",
						text: prompt
					}], "queue");
					if (result && result.ok === false) throw new Error(result.error?.message ?? "会话拒绝了这条开发上下文");
				} finally {
					reference.release();
				}
				if (open) uiWorkspace?.openSession?.(sessionId);
				return {
					sessionId,
					sent: true,
					continued: false,
					...failure ? { continueFailed: String(failure?.message ?? failure) } : {}
				};
			} catch (error) {
				failure = error;
			}
			if (uiWorkspace?.startSession) {
				uiWorkspace.startSession(void 0, {
					prompt,
					whenDraftExists: "replace"
				});
				return {
					sessionId: null,
					sent: false,
					continued: false
				};
			}
			throw failure ?? /* @__PURE__ */ new Error("当前 DSH 版本不支持从插件开启会话");
		}
		/**
		* 往已有开发会话发一条消息（工作站内嵌对话框、推进建议都用它）。
		* @returns {Promise<{sent: boolean, reason?: string}>}
		*/
		async function sendToSession(ctx, sessionId, text) {
			const id = String(sessionId ?? "").trim();
			const value = String(text ?? "").trim();
			if (!id || !value) return {
				sent: false,
				reason: "缺少会话或内容"
			};
			const sessions = ctx?.get?.("sessions");
			if (!sessions?.retain) return {
				sent: false,
				reason: "当前 DSH 不支持从工作站发送消息"
			};
			const reference = sessions.retain(id, { source: "controllerOperation" });
			try {
				const result = await (await reference.ready).session.prompt([{
					type: "text",
					text: value
				}], "queue");
				if (result && result.ok === false) throw new Error(result.error?.message ?? "会话拒绝了这条消息");
				return { sent: true };
			} finally {
				reference.release();
			}
		}
		/** 给开发会话的首条消息：说明来源，并把它钉在 Context Pack 的规范上。 */
		function launchPrompt(pack, item) {
			const title = item?.title ?? item?.id ?? "未命名流程";
			const id = item?.id ?? "";
			return [
				`你是由 DevHub 开发工作站启动的开发会话。开发流程：${title}${id ? `（${id}）` : ""}。`,
				"请严格按下方的 Context Pack 开发，其中【项目约束】是本次开发的硬规则；与仓库门禁冲突时以门禁为准。",
				"开工前先调用 devhub_get 读取该流程的最新状态；开发中用 devhub_update 回写任务、阶段与变更点；不要编造 baseline diff。",
				"",
				"===== Context Pack =====",
				"",
				String(pack ?? "")
			].join("\n");
		}
		//#endregion
		//#region src/client/chat-store.mjs
		/**
		* 工作站对话的本地留存（按代码库分区，支持多段历史对话）。
		*
		* 结构（每个代码库一份）：
		* ```
		* {
		*   version: 2,
		*   activeId: 'c-...',
		*   conversations: [{ id, title, createdAt, updatedAt, messages, phase, input,
		*                     answers, selectedFiles, scopeList, pending, pendingPlan }]
		* }
		* ```
		*
		* 为什么：
		* - 切走面板/页签再回来，DevHubChat 会被卸载 —— 对话要能恢复；
		* - 一个仓库往往不止一件事，需要「历史对话」可进入，而不是只有最后一段；
		* - 全放内存会在刷新后丢，全放 localStorage 又怕塞爆，所以内存 + localStorage 双写并限流。
		*
		* 这不是 DSH 会话记录：真正的开发会话在 DSH 里；这里只保留工作站的对话与待确认内容。
		*/
		const MEMORY$1 = /* @__PURE__ */ new Map();
		const STORAGE_PREFIX = "dev-hub:chats:";
		const LEGACY_PREFIX = "dev-hub:chat:";
		const MAX_CONVERSATIONS = 10;
		const MAX_TEXT = 4e3;
		const MAX_TITLE = 40;
		function storage$1() {
			try {
				if (typeof window === "undefined" || !window.localStorage) return null;
				return window.localStorage;
			} catch {
				return null;
			}
		}
		/**
		* 对话归属键：仓库 + 作用域。
		* - scope = 'new'：新建流程时的工作对话；
		* - scope = <flowId>：某个已建流程的开发对话（会话页/详情页继续用它）。
		*/
		function chatKey(repoPath, scope = "new") {
			return `${String(repoPath ?? "").trim() || "unknown-repo"}::${String(scope ?? "").trim() || "new"}`;
		}
		function newId() {
			return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
		}
		function clampMessage(message) {
			if (!message || typeof message !== "object") return null;
			const copy = { ...message };
			if (typeof copy.text === "string" && copy.text.length > MAX_TEXT) copy.text = `${copy.text.slice(0, MAX_TEXT)}…`;
			if (copy.recon && typeof copy.recon === "object") copy.recon = {
				...copy.recon,
				files: (copy.recon.files ?? []).slice(0, 20).map((file) => ({
					path: file?.path,
					why: file?.why,
					confidence: file?.confidence,
					score: file?.score,
					matches: (file?.matches ?? []).slice(0, 5)
				})),
				questions: (copy.recon.questions ?? []).slice(0, 6)
			};
			if (copy.plan && typeof copy.plan === "object") copy.plan = {
				...copy.plan,
				steps: (copy.plan.steps ?? []).slice(0, 30),
				acceptance: (copy.plan.acceptance ?? []).slice(0, 20),
				risks: (copy.plan.risks ?? []).slice(0, 20)
			};
			return copy;
		}
		/** 从消息里取一个能看懂的小标题（优先第一条用户消息）。 */
		function titleOf(messages) {
			const firstUser = (messages ?? []).find((message) => message?.role === "user" && message?.text);
			const fallback = (messages ?? []).find((message) => message?.text);
			const text = String(firstUser?.text ?? fallback?.text ?? "").replace(/\s+/g, " ").trim();
			return text ? text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE)}…` : text : "新对话";
		}
		function emptyConversation(title = "新对话") {
			const now = (/* @__PURE__ */ new Date()).toISOString();
			return {
				id: newId(),
				title,
				createdAt: now,
				updatedAt: now,
				messages: [],
				phase: "idle",
				input: "",
				answers: {},
				selectedFiles: [],
				scopeList: [],
				pending: null,
				pendingPlan: null
			};
		}
		function normalizeConversation(raw) {
			if (!raw || typeof raw !== "object") return null;
			return {
				id: String(raw.id ?? newId()),
				title: String(raw.title ?? "新对话").slice(0, MAX_TITLE),
				createdAt: raw.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
				updatedAt: raw.updatedAt ?? raw.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
				messages: Array.isArray(raw.messages) ? raw.messages.slice(-80).map(clampMessage).filter(Boolean) : [],
				phase: raw.phase ?? "idle",
				input: typeof raw.input === "string" ? raw.input.slice(0, MAX_TEXT) : "",
				answers: raw.answers && typeof raw.answers === "object" ? raw.answers : {},
				selectedFiles: Array.isArray(raw.selectedFiles) ? raw.selectedFiles : [],
				scopeList: Array.isArray(raw.scopeList) ? raw.scopeList : [],
				pending: raw.pending ?? null,
				pendingPlan: raw.pendingPlan ?? null,
				attachments: normalizeAttachments(raw.attachments),
				clarify: raw.clarify && typeof raw.clarify === "object" ? raw.clarify : null,
				job: raw.job && typeof raw.job === "object" ? raw.job : null,
				clarifyOrigin: typeof raw.clarifyOrigin === "string" ? raw.clarifyOrigin.slice(0, MAX_TEXT) : "",
				clarifyTitle: typeof raw.clarifyTitle === "string" ? raw.clarifyTitle.slice(0, MAX_TITLE) : "",
				titleTouched: raw.titleTouched === true
			};
		}
		function normalizeStore(raw) {
			if (raw && Array.isArray(raw.conversations) && raw.conversations.length) {
				const conversations = raw.conversations.slice(0, MAX_CONVERSATIONS).map(normalizeConversation).filter(Boolean);
				return {
					version: 2,
					activeId: conversations.some((entry) => entry.id === raw.activeId) ? raw.activeId : conversations[0].id,
					conversations
				};
			}
			if (raw && Array.isArray(raw.messages)) {
				const conversation = normalizeConversation({
					...raw,
					id: newId(),
					title: titleOf(raw.messages)
				});
				return {
					version: 2,
					activeId: conversation.id,
					conversations: [conversation]
				};
			}
			return null;
		}
		/** 读取某代码库的对话集合（内存优先，其次 localStorage；老 key 自动迁移）。 */
		function loadStore(repoPath, scope = "new") {
			const key = chatKey(repoPath, scope);
			if (MEMORY$1.has(key)) return MEMORY$1.get(key);
			const store = storage$1();
			if (!store) return null;
			try {
				let raw = store.getItem(STORAGE_PREFIX + key);
				let legacy = null;
				if (!raw) {
					const legacyCandidates = [LEGACY_PREFIX + key];
					if (scope === "new") legacyCandidates.push(LEGACY_PREFIX + (String(repoPath ?? "").trim() || "unknown-repo"));
					legacy = legacyCandidates.map((candidate) => store.getItem(candidate)).find(Boolean) ?? null;
					raw = legacy;
					if (!legacy) return null;
				}
				const normalized = normalizeStore(JSON.parse(raw));
				if (!normalized) return null;
				MEMORY$1.set(key, normalized);
				if (legacy) {
					try {
						store.removeItem(LEGACY_PREFIX + key);
						if (scope === "new") store.removeItem(LEGACY_PREFIX + (String(repoPath ?? "").trim() || "unknown-repo"));
					} catch {}
					saveStore(repoPath, normalized, scope);
				}
				return normalized;
			} catch {
				return null;
			}
		}
		/** 写回对话集合（内存总是写；localStorage 失败静默降级）。 */
		function saveStore(repoPath, store, scope = "new") {
			const key = chatKey(repoPath, scope);
			const safe = {
				version: 2,
				activeId: store.activeId,
				conversations: (store.conversations ?? []).slice(0, MAX_CONVERSATIONS).map((conversation) => ({
					...conversation,
					messages: (conversation.messages ?? []).slice(-80).map(clampMessage).filter(Boolean),
					input: typeof conversation.input === "string" ? conversation.input.slice(0, MAX_TEXT) : ""
				}))
			};
			MEMORY$1.set(key, safe);
			const backing = storage$1();
			if (!backing) return safe;
			try {
				backing.setItem(STORAGE_PREFIX + key, JSON.stringify(safe));
			} catch {}
			return safe;
		}
		/** 历史对话摘要列表（最新的在前）。 */
		function listChats(repoPath, scope = "new") {
			const store = loadStore(repoPath, scope);
			if (!store) return [];
			return [...store.conversations].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map((conversation) => ({
				id: conversation.id,
				title: conversation.title,
				updatedAt: conversation.updatedAt,
				messageCount: conversation.messages.length
			}));
		}
		/** 读当前活跃对话；没有就造一个空的（不落盘，等首次保存）。 */
		function getActiveChat(repoPath, scope = "new") {
			const store = loadStore(repoPath, scope);
			if (!store) {
				const conversation = emptyConversation();
				return {
					id: conversation.id,
					conversation
				};
			}
			const active = store.conversations.find((entry) => entry.id === store.activeId) ?? store.conversations[0];
			return {
				id: active.id,
				conversation: active
			};
		}
		/**
		* 只写指定的那段对话（**不依赖也不修改 activeId**）。
		*
		* 为什么要按 id 写：扫描/澄清这类请求会在用户切走之后才返回。如果一律写
		* `store.activeId`，结果就会落进"用户后来打开的另一段对话"，表现为两个流程的
		* 消息串在一起。按 id 写能保证：谁发起的任务，结果只回到发起它的那段对话。
		*/
		function saveChat(repoPath, conversationId, snapshot, scope = "new") {
			const id = String(conversationId ?? "").trim();
			if (!id) return null;
			let store = loadStore(repoPath, scope);
			if (!store) store = {
				version: 2,
				activeId: id,
				conversations: []
			};
			const index = store.conversations.findIndex((entry) => entry.id === id);
			const current = index >= 0 ? store.conversations[index] : emptyConversation();
			const messages = (snapshot?.messages ?? current.messages ?? []).slice(-80);
			const next = normalizeConversation({
				...current,
				...snapshot,
				id,
				messages,
				title: titleOf(messages) === "新对话" ? current.title || "新对话" : titleOf(messages),
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			});
			if (index >= 0) store.conversations[index] = next;
			else store.conversations.unshift(next);
			store.conversations = store.conversations.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, MAX_CONVERSATIONS);
			if (!store.conversations.some((entry) => entry.id === store.activeId)) store.activeId = store.conversations[0]?.id ?? id;
			return saveStore(repoPath, store, scope);
		}
		/** 当前活跃对话 id（没有留存时返回 null；不会像 getActiveChat 那样造新对话）。 */
		function getActiveConversationId(repoPath, scope = "new") {
			return loadStore(repoPath, scope)?.activeId ?? null;
		}
		/** 读某段对话（按 id，不看 activeId）；不存在返回 null。 */
		function getConversation(repoPath, conversationId, scope = "new") {
			const id = String(conversationId ?? "").trim();
			if (!id) return null;
			return loadStore(repoPath, scope)?.conversations?.find((entry) => entry.id === id) ?? null;
		}
		/**
		* 清掉某段对话的"进行中任务"。
		*
		* 任务真正跑完（哪怕组件已经卸载）后必须清掉，否则下次挂载会把它当成
		* "上次被切走的扫描"再跑一遍——截图里两条重复的「已自动重新扫描」就是这么来的。
		*/
		function clearConversationJob(repoPath, conversationId, scope = "new") {
			const id = String(conversationId ?? "").trim();
			if (!id) return false;
			if (!(loadStore(repoPath, scope)?.conversations?.find((entry) => entry.id === id))?.job) return false;
			return Boolean(saveChat(repoPath, id, { job: null }, scope));
		}
		/** 新建一段对话并切过去。 */
		function startNewChat(repoPath, title = "新对话", scope = "new") {
			let store = loadStore(repoPath, scope) ?? {
				version: 2,
				activeId: null,
				conversations: []
			};
			const conversation = emptyConversation(title);
			store.conversations = store.conversations.filter((entry) => (entry.messages?.length ?? 0) > 0 || entry.job || entry.pending || entry.pendingPlan);
			store.conversations = [conversation, ...store.conversations].slice(0, MAX_CONVERSATIONS);
			store.activeId = conversation.id;
			saveStore(repoPath, store, scope);
			return conversation;
		}
		/** 切到某段历史对话。 */
		function selectChat(repoPath, id, scope = "new") {
			const store = loadStore(repoPath, scope);
			if (!store) return null;
			const target = store.conversations.find((entry) => entry.id === id);
			if (!target) return null;
			store.activeId = target.id;
			saveStore(repoPath, store, scope);
			return target;
		}
		//#endregion
		//#region src/client/chat.mjs
		/**
		* dsh-dev-hub 浏览器半 —— 聊天式开发入口。
		*
		* 目标形态：工作站首页是一个聊天页。用户只说「我要做什么」，
		* 工作站自己扫一遍仓库（API.recon），把候选文件与命中行摆出来；
		* **工作站不懂的地方自己追问**（最多 4 问、可跳过），再自己出一份
		* 带步骤/验收/风险的计划与工程量自评（API.plan）；用户确认计划后才建流程
		* （API.wizard create）并开启开发会话。
		*
		* 用户永远不填“规模/人天”：estimate 只来自 Host 的自评结果，界面只读展示。
		* 也不再走「描述 → 命名 → 选范围 → 初始化 → 开始」的多步表单向导（那个仍在「流程」页）。
		*
		* 业务逻辑一律复用 chat-flow.mjs（纯逻辑、已单测）与 session.mjs：
		*   probeCode / generatePlan / confirmAndStart / summarizeRecon / summarizePlan /
		*   estimateSummary / questionsMessage / planMessage / userMessage / stationMessage / reconMessage
		* 本文件只负责 React 渲染与把 api()/launchDevSession 注入成 deps，不重写业务规则。
		*
		* 失败一律落成一条 tone:'danger' 的工作站消息（中文原因），不静默。
		*/
		const MAX_CLARIFY_ROUNDS = 4;
		/**
		* 同一页面里，一段对话的同类任务同一时刻只允许一个在跑。
		*
		* 事故场景：扫描还没回来用户就切走/开了新流程，旧组件卸载后请求仍在飞；
		* 新挂载的实例读到"进行中的 job"又跑一遍 → 同一段对话出现两次探测结果。
		* 这里用进程内登记表兜住，跨页面刷新仍由台账里的 job 负责续跑。
		*/
		const ACTIVE_RUNS = /* @__PURE__ */ new Set();
		function runKey(repoPath, scope, conversationId, kind) {
			return `${repoPath ?? "unknown"}::${scope ?? "new"}::${conversationId ?? "unknown"}::${kind}`;
		}
		/** 某段对话是否已有同类任务在跑（导出给回归测试用）。 */
		function isConversationRunning(repoPath, scope, conversationId, kind = "recon") {
			return ACTIVE_RUNS.has(runKey(repoPath, scope, conversationId, kind));
		}
		function beginRun(key) {
			if (ACTIVE_RUNS.has(key)) return false;
			ACTIVE_RUNS.add(key);
			return true;
		}
		function endRun(key) {
			ACTIVE_RUNS.delete(key);
		}
		/** 聊天布局的局部样式：撑满工作站大页面，消息区滚动，输入区固定在底部。 */
		const S = {
			root: {
				...styles.page,
				height: "auto",
				flex: "1 1 auto",
				minHeight: 0
			},
			body: {
				flex: "1 1 auto",
				minHeight: 0,
				overflowY: "auto",
				overflowX: "hidden",
				padding: "20px 24px 8px",
				display: "flex",
				flexDirection: "column",
				gap: 18,
				alignItems: "center"
			},
			canvas: {
				width: "100%",
				maxWidth: 780,
				display: "flex",
				flexDirection: "column",
				gap: 18
			},
			row: {
				display: "flex",
				flex: "1 1 auto",
				minHeight: 0,
				minWidth: 0
			},
			chatCol: {
				display: "flex",
				flexDirection: "column",
				flex: "1 1 auto",
				minWidth: 0,
				minHeight: 0
			},
			footer: {
				flex: "0 0 auto",
				background: "transparent",
				padding: "4px 24px 14px",
				display: "flex",
				flexDirection: "column",
				gap: 8,
				alignItems: "center"
			},
			composer: {
				width: "100%",
				maxWidth: 780,
				boxSizing: "border-box",
				border: `1px solid ${T.borderSoft}`,
				borderRadius: 14,
				background: T.surface,
				boxShadow: T.shadowCard,
				padding: "12px 14px 8px",
				display: "flex",
				flexDirection: "column",
				gap: 8
			},
			side: {
				width: 320,
				flex: "0 0 320px",
				borderLeft: `1px solid ${T.borderSoft}`,
				background: T.surface,
				padding: "14px 14px 10px",
				overflowY: "auto",
				display: "flex",
				flexDirection: "column",
				gap: 10
			},
			userRow: {
				display: "flex",
				justifyContent: "flex-end",
				width: "100%"
			},
			userBubble: {
				maxWidth: "78%",
				overflowWrap: "anywhere",
				background: "color-mix(in srgb, #6049e7 22%, var(--dsw-alias-bg-layer-1, #ffffff))",
				border: "1px solid color-mix(in srgb, #6049e7 30%, var(--dsw-alias-border-l1, #e9eaec))",
				color: T.text,
				borderRadius: "12px 12px 4px 12px",
				padding: "10px 14px",
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
				lineHeight: T.line
			},
			stationRow: {
				display: "flex",
				justifyContent: "flex-start",
				alignItems: "flex-start",
				gap: 10,
				width: "100%"
			},
			stationBody: {
				display: "flex",
				flexDirection: "column",
				gap: 8,
				minWidth: 0,
				flex: "0 1 auto",
				maxWidth: "100%"
			},
			stationName: {
				fontSize: T.font.xs,
				color: T.text4,
				marginBottom: 2
			},
			stationCard: {
				maxWidth: "100%",
				overflowWrap: "anywhere",
				border: `1px solid ${T.borderSoft}`,
				background: T.surface,
				borderRadius: "4px 12px 12px 12px",
				padding: "10px 14px",
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
				lineHeight: T.line,
				boxShadow: T.shadowCard
			},
			stationDanger: {
				maxWidth: "100%",
				border: `1px solid ${T.dangerSoft}`,
				borderLeft: `3px solid ${T.danger}`,
				background: T.dangerSoft,
				color: T.danger,
				borderRadius: T.rBase,
				padding: "10px 14px",
				whiteSpace: "pre-wrap",
				wordBreak: "break-word"
			},
			reconCard: {
				width: "100%",
				boxSizing: "border-box",
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rLg,
				background: T.surface,
				padding: 16,
				boxShadow: T.shadowCard
			},
			questionsCard: {
				width: "100%",
				boxSizing: "border-box",
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rLg,
				background: T.surface,
				padding: 16,
				boxShadow: T.shadowCard,
				overflowWrap: "anywhere",
				wordBreak: "break-word",
				minWidth: 0
			},
			planCard: {
				width: "100%",
				boxSizing: "border-box",
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rLg,
				background: T.surface,
				padding: 16,
				boxShadow: T.shadowCard,
				overflowWrap: "anywhere",
				wordBreak: "break-word",
				minWidth: 0
			},
			fileRow: {
				display: "flex",
				gap: 8,
				alignItems: "flex-start",
				padding: "10px 0",
				borderTop: `1px solid ${T.borderSoft}`,
				cursor: "pointer"
			},
			match: {
				fontFamily: T.mono,
				fontSize: T.font.xs,
				color: T.text4,
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
				fontVariantNumeric: "tabular-nums"
			},
			questionBlock: {
				padding: "12px 0",
				borderTop: `1px solid ${T.borderSoft}`
			},
			riskBox: {
				borderLeft: `3px solid ${T.warn}`,
				background: "color-mix(in srgb, #ca8a04 14%, var(--dsw-alias-bg-layer-1, #ffffff))",
				color: "var(--dsw-alias-label-primary, #1e2a3d)",
				borderRadius: T.rBase,
				padding: "8px 12px",
				marginTop: 8,
				fontSize: T.font.sm
			},
			list: {
				margin: "6px 0 0",
				paddingLeft: 20,
				color: T.text2,
				lineHeight: T.line
			},
			riskList: {
				margin: "6px 0 0",
				paddingLeft: 20,
				color: "inherit",
				lineHeight: T.line
			},
			stepList: {
				margin: "6px 0 0",
				paddingLeft: 20,
				color: T.text,
				lineHeight: T.line
			}
		};
		/** 探测结果里可用的范围建议：suggestedScope + 命中模块（去重）。 */
		function scopeSuggestions(recon) {
			const suggested = Array.isArray(recon?.suggestedScope) ? recon.suggestedScope : [];
			const fromModules = (recon?.modules ?? []).map(moduleToken).filter(Boolean);
			return uniqueTokens([...suggested, ...fromModules]);
		}
		/** 候选文件属于哪个成员库（虚拟库扫描带 repoName；单库为空）。 */
		function reconFileRepo(file) {
			return String(file?.repoName ?? (file?.repo ? repoBaseName(file.repo) : "") ?? "");
		}
		/**
		* 候选文件按成员库分组：虚拟库的探测结果会混着前后端文件，
		* 按库分组 + 组内按路径排序，比一锅平铺好扫。单库（没有 repoName）只有一组。
		*/
		function groupReconFiles(files) {
			const map = /* @__PURE__ */ new Map();
			for (const file of Array.isArray(files) ? files : []) {
				const repo = reconFileRepo(file);
				if (!map.has(repo)) map.set(repo, []);
				map.get(repo).push(file);
			}
			for (const list of map.values()) list.sort((a, b) => String(a?.path ?? "").localeCompare(String(b?.path ?? "")));
			return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
		}
		/** 探测结果里的成员库扫描摘要（workspace recon 才有 members）。 */
		function reconMembers(recon) {
			return (Array.isArray(recon?.members) ? recon.members : []).filter(Boolean);
		}
		function matchLines(matches) {
			return (Array.isArray(matches) ? matches : []).filter((entry) => entry && entry.line !== void 0 && entry.line !== null);
		}
		/** 追问答案是否算“已答”（空字符串/空值/空格都不算）。 */
		function hasAnswer(value) {
			return value !== void 0 && value !== null && String(value).trim() !== "";
		}
		/** 值相等：选项的 value 可能是对象（如 `{ mode:'only', module:'source' }`）。 */
		function sameValue(a, b) {
			if (a === b) return true;
			if (a === void 0 || a === null || b === void 0 || b === null) return false;
			if (typeof a === "object" || typeof b === "object") try {
				return JSON.stringify(a) === JSON.stringify(b);
			} catch {
				return false;
			}
			return false;
		}
		/**
		* 一条工作站消息：探测卡片 / 追问卡片 / 计划卡片走专用渲染，其余是文本气泡（tone:'danger' 时红底）。
		*/
		function MessageRow({ msg, live, questionsLive, planLive, selectedFiles, scopeList, answers, busy, hasQuestions, onToggleFile, onToggleScope, onAddScope, onRemoveScope, onReDescribe, onAnswer, onGeneratePlan, onStartPlan, onAdjustScope, syncBeforeStart = true, onSyncBeforeStartChange, clarifyBusy = false, onClarifyPick, onClarifySubmit, onClarifyContinue, clarifyTitle, onClarifyTitleChange }) {
			if (msg?.role === "user") return h("div", { style: S.userRow }, h("span", {
				className: "devhub-msg-time",
				style: {
					...styles.smallMuted,
					alignSelf: "flex-end",
					marginRight: 6,
					marginBottom: 2,
					fontSize: 11
				}
			}, fmtTime(msg.at)), h("div", { style: S.userBubble }, msg.text || null, (msg.attachments ?? []).length ? h("div", { style: {
				display: "flex",
				gap: 6,
				flexWrap: "wrap",
				marginTop: msg.text ? 6 : 0
			} }, msg.attachments.map((entry) => h("span", {
				key: entry.id ?? entry.path,
				title: entry.path,
				style: {
					...styles.pill,
					fontSize: T.font.xs,
					display: "inline-flex",
					alignItems: "center",
					gap: 4,
					maxWidth: "100%",
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				}
			}, `${isImageAttachment(entry) ? "🖼" : "📄"} ${entry.name ?? attachmentLabel(entry)}`))) : null));
			const seat = h(IconSeat, { size: 28 }, "◈");
			const wrapStation = (content) => h("div", { style: S.stationRow }, seat, h("div", { style: S.stationBody }, h("div", { style: S.stationName }, "开发工作站"), content));
			const wrapCard = (content) => h("div", { style: {
				width: "100%",
				display: "flex",
				flexDirection: "column",
				gap: 6
			} }, h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 8
			} }, seat, h("div", { style: S.stationName }, "开发工作站")), content);
			if (msg?.kind === "recon") return wrapCard(h(ReconCard, {
				recon: msg.recon,
				draft: msg.draft,
				live,
				confirmedFiles: msg.confirmedFiles,
				confirmedScope: msg.confirmedScope,
				selectedFiles,
				scopeList,
				busy,
				showPlanButton: live && !hasQuestions,
				onToggleFile,
				onToggleScope,
				onAddScope,
				onRemoveScope,
				onGeneratePlan,
				onReDescribe
			}));
			if (msg?.kind === "questions") return wrapCard(h(QuestionsCard, {
				questions: msg.questions,
				answers: msg.answers ?? answers,
				live: questionsLive,
				busy,
				onAnswer,
				onGeneratePlan
			}));
			if (msg?.kind === "clarify") return wrapCard(h(ClarifyCard, {
				card: msg,
				answers,
				busy: busy || clarifyBusy,
				title: clarifyTitle,
				onTitleChange: onClarifyTitleChange,
				onPick: onClarifyPick,
				onSubmit: () => onClarifySubmit?.(msg),
				onGeneratePlan,
				onContinue: () => onClarifyContinue?.(msg)
			}));
			if (msg?.kind === "plan") return wrapCard(h(PlanCard, {
				plan: msg.plan,
				live: planLive,
				busy,
				syncBeforeStart,
				onSyncBeforeStartChange,
				onStartPlan,
				onAdjustScope
			}));
			return wrapStation(msg?.tone === "danger" ? h("div", { style: S.stationDanger }, msg?.text ?? "") : h("div", { style: {
				color: T.text,
				fontSize: T.font.base,
				lineHeight: 1.7,
				whiteSpace: "pre-wrap",
				overflowWrap: "anywhere"
			} }, msg?.text ?? ""));
		}
		/**
		* 二次确认的核心卡片：
		* 结论行 + 逐文件勾选（默认全选，取消的不进上下文）+ 范围勾选（默认 suggestedScope，可加/删）。
		* 用户只在这里确认“要改哪些文件 / 哪些范围”，不填任何工程量。
		*/
		function ReconCard({ recon, draft, live, confirmedFiles, confirmedScope, selectedFiles, scopeList, busy, showPlanButton, onToggleFile, onToggleScope, onAddScope, onRemoveScope, onGeneratePlan, onReDescribe }) {
			const [scopeDraft, setScopeDraft] = (0, react.useState)("");
			const files = Array.isArray(recon?.files) ? recon.files : [];
			const modules = (recon?.modules ?? []).map((entry) => entry?.name).filter(Boolean).slice(0, 4);
			const suggestions = scopeSuggestions(recon);
			const members = reconMembers(recon);
			const groups = groupReconFiles(files);
			const multiRepo = groups.length > 1 || groups.some(([repo]) => Boolean(repo));
			const activeFiles = live ? selectedFiles : Array.isArray(confirmedFiles) ? confirmedFiles : selectedFiles;
			const activeScope = live ? scopeList : Array.isArray(confirmedScope) ? confirmedScope : scopeList;
			const selectedCount = files.filter((file) => activeFiles.includes(String(file?.path ?? ""))).length;
			const conclusion = [
				recon?.repoName ? `扫描仓库 ${recon.repoName}` : "",
				`扫描 ${Number(recon?.scanned ?? 0)} 个文件，命中 ${files.length} 个候选`,
				modules.length ? `集中在 ${modules.join("、")}` : "",
				members.length ? `覆盖 ${members.length} 个成员库` : ""
			].filter(Boolean).join("，") + "。";
			/** 一个候选文件：标题行 + 相关度 + 命中行；live 时可勾选，历史卡片只回看。 */
			function renderFileRow(file, index) {
				const path = String(file?.path ?? `候选文件 ${index + 1}`);
				const repo = reconFileRepo(file);
				const matches = matchLines(file?.matches);
				const namePart = repo && !path.startsWith(`${repo}/`) ? `${repo}/${path}` : path;
				return live ? h("label", {
					key: `${repo}:${path}`,
					style: S.fileRow
				}, h("input", {
					type: "checkbox",
					checked: activeFiles.includes(path),
					onChange: () => onToggleFile(path)
				}), h("div", { style: {
					minWidth: 0,
					flex: "1 1 auto"
				} }, h("div", { style: styles.row }, repo ? h(Pill, { tone: "accent" }, repo) : null, h("span", { style: {
					fontWeight: 600,
					wordBreak: "break-all"
				} }, namePart), file?.confidence ? h(Pill, { tone: file.confidence === "high" ? "ok" : file.confidence === "low" ? "warn" : "neutral" }, `相关度 ${file.confidence}`) : null), file?.why ? h("div", { style: {
					...styles.smallMuted,
					marginTop: 2
				} }, file.why) : null, matches.length ? h("div", { style: {
					...styles.smallMuted,
					marginTop: 2
				} }, `命中 ${matches.length} 处`) : null, matches.slice(0, 3).map((match) => h("div", {
					key: `${path}:${match.line}`,
					style: S.match
				}, `L${match.line}: ${match.text ?? ""}`)), matches.length > 3 ? h("div", { style: styles.smallMuted }, `…还有 ${matches.length - 3} 处（开发会话里看完整 Context Pack）`) : null)) : h("div", {
					key: `${repo}:${path}`,
					style: {
						...S.fileRow,
						cursor: "default"
					}
				}, h("span", { style: styles.smallMuted }, activeFiles.includes(path) ? "✓" : "•"), h("div", { style: { minWidth: 0 } }, h("div", { style: {
					fontWeight: 600,
					wordBreak: "break-all"
				} }, repo ? h(Pill, {
					tone: "accent",
					style: { marginRight: 6 }
				}, repo) : null, namePart), file?.why ? h("div", { style: {
					...styles.smallMuted,
					marginTop: 2
				} }, file.why) : null, matches.length ? h("div", { style: styles.smallMuted }, `命中 ${matches.length} 处`) : null, matches.slice(0, 3).map((match) => h("div", {
					key: `${path}:${match.line}`,
					style: S.match
				}, `L${match.line}: ${match.text ?? ""}`))));
			}
			function addScope() {
				const token = String(scopeDraft ?? "").trim();
				if (!token) return;
				onAddScope(token);
				setScopeDraft("");
			}
			return h("div", { style: S.reconCard }, h("div", { style: styles.row }, h(IconSeat, { size: 28 }, "⌕"), h("strong", { style: styles.sectionTitle }, "探测结果"), h(Pill, { tone: live ? "accent" : "ok" }, live ? "待确认" : "已确认"), recon?.engine ? h(Pill, { tone: recon.engine === "dsh" || recon.engine === "dsh-llm" ? "accent" : "warn" }, recon.engineLabel || (recon.engine === "dsh" || recon.engine === "dsh-llm" ? "DSH 扫描" : "本地关键词兜底")) : null, recon?.elapsedMs ? h("span", { style: styles.smallMuted }, `${(recon.elapsedMs / 1e3).toFixed(1)}s`) : null, h(Pill, { tone: selectedCount === files.length ? "ok" : "warn" }, `已选 ${selectedCount}/${files.length} 个文件`), recon?.truncated ? h(Pill, { tone: "warn" }, "已达扫描上限") : null, h("div", { style: styles.spacer }), h(Stat, {
				label: "候选文件",
				value: files.length
			}), h(Stat, {
				label: "命中模块",
				value: modules.length
			})), h("div", { style: {
				...styles.smallMuted,
				marginTop: 4
			} }, conclusion), members.length ? h("div", { style: { marginTop: 8 } }, h("div", { style: styles.label }, `成员库扫描（${members.length}）`), members.map((member, index) => h("div", {
				key: member.repo ?? member.name ?? index,
				style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					flexWrap: "wrap",
					padding: "2px 0",
					fontSize: T.font.xs
				}
			}, h(Pill, { tone: member.error ? "warn" : "ok" }, member.error ? "失败" : `${Number(member.files) || 0} 候选`), h("span", { style: {
				fontWeight: 600,
				color: T.text2
			} }, member.name ?? repoBaseName(member.repo) ?? "成员库"), member.repo ? h("span", {
				style: {
					...styles.mono,
					color: T.text4,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
					maxWidth: 320
				},
				title: member.repo
			}, member.repo) : null, member.error ? h("span", { style: styles.smallDanger }, member.error) : null))) : null, recon?.scanNotes && recon?.engine !== "dsh" ? h("div", { style: {
				...styles.warnCard,
				marginTop: 8
			} }, recon.scanNotes) : null, recon?.scanNotes && (recon?.engine === "dsh" || recon?.engine === "dsh-llm") && recon?.scanNotes ? h("div", { style: {
				...styles.smallMuted,
				marginTop: 4
			} }, `扫描说明：${recon.scanNotes}`) : null, recon?.truncated ? h("div", { style: styles.smallMuted }, "结果可能不全：扫描达到上限，可把要做什么写得更具体。") : null, files.length ? h("div", { style: { marginTop: 8 } }, h("div", { style: styles.label }, live ? "可能改动的文件（勾选进入开发上下文；默认全选）" : "当时确认的候选文件"), groups.map(([repo, groupFiles]) => h("div", {
				key: repo || "__single__",
				style: multiRepo && repo ? {
					marginTop: 4,
					borderTop: `1px solid ${T.borderSoft}`,
					paddingTop: 4
				} : null
			}, multiRepo && repo ? h("div", { style: {
				...styles.smallMuted,
				fontWeight: 600,
				color: T.text2,
				paddingLeft: 2
			} }, `${repo}（${groupFiles.length}）`) : null, groupFiles.map(renderFileRow)))) : h("div", { style: {
				...styles.smallMuted,
				marginTop: 8
			} }, "没有命中候选文件。可以直接按目录/模块建流程，或点「重新描述」补充关键词。"), live ? h("div", { style: { marginTop: 10 } }, h("div", { style: styles.label }, "开发范围 scope（用于并行冲突判定；裸路径 = 目录，module:xxx = 模块名）"), suggestions.length ? h("div", { style: styles.row }, suggestions.map((token) => {
				const on = scopeList.includes(token);
				return h("span", {
					key: token,
					style: on ? styles.chipOn : styles.chip,
					title: "点击勾选/取消",
					onClick: () => onToggleScope(token)
				}, `${on ? "✓ " : ""}${scopeTokenLabel(token)}`);
			})) : h("div", { style: styles.smallMuted }, "Host 没给出建议范围，请手填一个目录或 module:名称。"), scopeList.length ? h("div", { style: {
				...styles.row,
				marginTop: 6
			} }, scopeList.map((token) => h("span", {
				key: token,
				style: styles.pill
			}, `${scopeTokenLabel(token)} `, h("span", {
				style: {
					cursor: "pointer",
					fontWeight: 700
				},
				title: "移除",
				onClick: () => onRemoveScope(token)
			}, "×")))) : h("div", { style: {
				...styles.smallMuted,
				marginTop: 6
			} }, "尚未选择任何范围；至少要保留一个目录或模块才能创建流程。"), h("div", { style: {
				...styles.row,
				marginTop: 6
			} }, h("input", {
				style: {
					...styles.input,
					flex: "1 1 220px"
				},
				value: scopeDraft,
				placeholder: "例如 src/main/java/com/example/app/scheduler 或 module:order-service",
				onChange: (event) => setScopeDraft(event.target.value),
				onKeyDown: (event) => {
					if (event.key !== "Enter" || event.shiftKey) return;
					event.preventDefault();
					addScope();
				}
			}), h(Button, {
				disabled: !String(scopeDraft).trim(),
				onClick: addScope,
				children: "添加范围"
			})), h("div", { style: {
				...styles.row,
				marginTop: 10
			} }, showPlanButton ? h(Button, {
				primary: true,
				disabled: busy || !scopeList.length,
				onClick: onGeneratePlan,
				children: busy ? "正在生成计划…" : "继续，生成计划"
			}) : h("span", { style: styles.smallMuted }, "先在下方回答工作站的问题（可以跳过），再点「继续，生成计划」。"), h(Button, {
				disabled: busy,
				onClick: onReDescribe,
				children: "重新描述"
			}))) : h("div", { style: {
				marginTop: 6,
				...styles.smallMuted
			} }, activeScope.length ? `当时确认的开发范围：${activeScope.map(scopeTokenLabel).join("、")}` : "当时没有确认开发范围。"));
		}
		/**
		* 「需求澄清」卡片：一句话描述往往太粗，这里由 dsh 追问 1~2 个关键问题，
		* 答完继续下一轮，直到能写出明确的问题/目标/非目标/验收/范围（或到轮次上限）。
		*/
		function ClarifyCard({ card, answers, busy, title, onTitleChange, onPick, onSubmit, onGeneratePlan, onContinue }) {
			const resolved = Boolean(card?.resolved);
			const questions = Array.isArray(card?.questions) ? card.questions : [];
			const spec = card?.spec ?? {};
			const specRows = [
				["要解决的问题", spec.problem],
				["目标", (spec.goals ?? []).join("；")],
				["非目标", (spec.nonGoals ?? []).join("；")],
				["验收", (spec.acceptance ?? []).join("；")],
				["范围", (spec.scope ?? []).join("、")]
			].filter(([, value]) => value);
			const ready = Boolean(card?.ready);
			/** 已提交的那一轮：只回看问题与当时的选择，不再渲染任何输入框。 */
			if (resolved) {
				const rows = questions.map((question, index) => {
					const id = String(question?.id ?? `q${index + 1}`);
					const saved = card?.answers?.[id];
					const answerText = [saved?.selected?.length ? saved.selected.join("、") : "", String(saved?.custom ?? "").trim()].filter(Boolean).join("；");
					return {
						id,
						question: String(question?.question ?? ""),
						answer: answerText
					};
				}).filter((row) => row.question);
				return h("div", { style: S.questionsCard }, h("div", { style: styles.row }, h(IconSeat, { size: 28 }, "◈"), h("strong", null, `需求澄清 · 第 ${card?.round ?? 1} 轮`), h(Pill, { tone: "ok" }, "已提交"), card?.engine === "dsh" || card?.engine === "dsh-llm" ? h(Pill, { tone: "accent" }, card.engine === "dsh-llm" ? "DSH 模型" : "DSH 对话") : null), title ? h("div", { style: {
					display: "flex",
					gap: 8,
					alignItems: "baseline",
					marginTop: 8
				} }, h("span", { style: {
					color: T.text4,
					fontSize: T.font.xs,
					flex: "0 0 76px"
				} }, "流程标题"), h("span", { style: {
					color: T.text,
					fontSize: T.font.sm,
					fontWeight: 600
				} }, title)) : null, rows.length ? h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 6,
					marginTop: 8
				} }, rows.map((row) => h("div", {
					key: row.id,
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 2,
						minWidth: 0
					}
				}, h("span", { style: {
					color: T.text4,
					fontSize: T.font.xs,
					lineHeight: 1.6,
					whiteSpace: "normal",
					overflowWrap: "anywhere"
				} }, row.question), h("span", { style: {
					color: T.text,
					fontSize: T.font.sm,
					fontWeight: 500,
					lineHeight: 1.7,
					whiteSpace: "normal",
					overflowWrap: "anywhere"
				} }, row.answer || "（未答）")))) : null, specRows.length ? h("div", { style: {
					marginTop: 8,
					padding: "8px 10px",
					background: T.surface2,
					borderRadius: T.rBase,
					display: "flex",
					flexDirection: "column",
					gap: 4
				} }, specRows.map(([label, value]) => h("div", {
					key: label,
					style: {
						display: "flex",
						gap: 8,
						alignItems: "baseline"
					}
				}, h("span", { style: {
					color: T.text4,
					fontSize: T.font.xs,
					flex: "0 0 76px"
				} }, label), h("span", { style: {
					color: T.text2,
					fontSize: T.font.sm,
					flex: "1 1 auto",
					lineHeight: 1.6
				} }, value)))) : null, h("div", { style: {
					...styles.row,
					marginTop: 10
				} }, onContinue ? h(Button, {
					disabled: busy,
					onClick: onContinue,
					children: busy ? "澄清中…" : "继续补充（再问一轮）"
				}) : null, onGeneratePlan ? h(Button, {
					disabled: busy,
					onClick: onGeneratePlan,
					children: "直接生成计划"
				}) : null), h("div", { style: {
					...styles.smallMuted,
					marginTop: 8
				} }, "这一轮已经提交，可以继续补充，或直接生成计划。"));
			}
			return h("div", { style: S.questionsCard }, h("div", { style: styles.row }, h(IconSeat, { size: 28 }, "◈"), h("strong", null, `需求澄清 · 第 ${card?.round ?? 1} 轮`), h(Pill, { tone: card?.engine === "dsh" || card?.engine === "dsh-llm" ? "accent" : "neutral" }, card?.engine === "dsh" ? "DSH 对话" : card?.engine === "dsh-llm" ? "DSH 模型" : "本地规则"), card?.degraded ? h(Pill, { tone: "warn" }, "已降级") : null), card?.reply ? h("div", { style: {
				marginTop: 6,
				color: T.text2,
				fontSize: T.font.base,
				whiteSpace: "pre-wrap",
				lineHeight: 1.7
			} }, card.reply) : null, h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				marginTop: 10
			} }, h("span", { style: {
				color: T.text4,
				fontSize: T.font.xs,
				flex: "0 0 76px"
			} }, "流程标题"), h("input", {
				style: {
					...styles.input,
					height: 30,
					maxWidth: 420,
					fontSize: T.font.sm
				},
				placeholder: "agent 会顺带给一个标题，可改",
				value: title ?? "",
				onChange: (event) => onTitleChange?.(event.target.value),
				disabled: busy
			})), specRows.length ? h("div", { style: {
				marginTop: 10,
				padding: "10px 12px",
				background: T.surface2,
				borderRadius: T.rBase,
				display: "flex",
				flexDirection: "column",
				gap: 6
			} }, specRows.map(([label, value]) => h("div", {
				key: label,
				style: {
					display: "flex",
					gap: 8,
					alignItems: "baseline"
				}
			}, h("span", { style: {
				color: T.text4,
				fontSize: T.font.xs,
				flex: "0 0 76px"
			} }, label), h("span", { style: {
				color: T.text2,
				fontSize: T.font.sm,
				flex: "1 1 auto",
				lineHeight: 1.6
			} }, value)))) : null, (card?.missing ?? []).length ? h("div", { style: {
				...styles.smallMuted,
				marginTop: 8
			} }, `还缺：${card.missing.join("、")}`) : null, h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 14,
				marginTop: 12
			} }, questions.map((question, index) => {
				const id = String(question?.id ?? `q${index + 1}`);
				const answer = answers?.[id] && typeof answers[id] === "object" ? answers[id] : {
					selected: [],
					custom: ""
				};
				const options = Array.isArray(question?.options) ? question.options : [];
				return h("div", {
					key: id,
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 6
					}
				}, h("div", { style: {
					fontWeight: 600,
					fontSize: T.font.base,
					color: T.text,
					lineHeight: 1.6
				} }, String(question?.question ?? "")), question?.why ? h("div", { style: {
					...styles.smallMuted,
					lineHeight: 1.6
				} }, `为什么问：${question.why}`) : null, options.length ? h("div", { style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 6
				} }, options.map((option, optionIndex) => {
					const on = (answer.selected ?? []).includes(option.label);
					return h("span", {
						key: `${optionIndex}-${option.label}`,
						title: option.description ?? "",
						style: {
							...on ? styles.chipOn : styles.chip,
							cursor: busy ? "default" : "pointer"
						},
						onClick: busy ? void 0 : () => onPick(id, { selected: question.multiSelect ? on ? answer.selected.filter((item) => item !== option.label) : [...answer.selected, option.label] : on ? [] : [option.label] })
					}, `${on ? "✓ " : ""}${option.label}`);
				})) : null, h("input", {
					style: {
						...styles.input,
						marginTop: 2,
						maxWidth: 560,
						height: 32,
						fontSize: T.font.sm
					},
					disabled: busy,
					placeholder: options.length ? "补充说明（可选）" : "写下你的回答",
					value: answer.custom ?? "",
					onChange: (event) => onPick(id, { custom: event.target.value }),
					onKeyDown: (event) => {
						if (event.key !== "Enter" || busy) return;
						if (event.nativeEvent?.isComposing) return;
						event.preventDefault();
						onSubmit();
					}
				}));
			})), h("div", { style: {
				...styles.row,
				marginTop: 14
			} }, h(Button, {
				primary: true,
				disabled: busy,
				onClick: onSubmit,
				children: busy ? "澄清中…" : ready ? "再问一轮（可选）" : "回答并继续"
			}), ready ? h(Button, {
				disabled: busy,
				onClick: onGeneratePlan,
				children: "需求清楚了，生成计划"
			}) : null), h("div", { style: {
				...styles.smallMuted,
				marginTop: 8
			} }, ready ? "已经能写出问题定义：点「生成计划」继续（或再问一轮补细节）。" : "问题会一轮轮收敛；也可以直接点「生成计划」，我会按当前信息开工。"));
		}
		/**
		* 「工作站想确认几件事」卡片：每问一行问题 + 一行灰色 why；
		* 选择题渲染成可点 chip（单选、选中高亮），文本题给一个输入框（Enter 提交该题）。
		* 顶部明确“可以跳过”，底部只有「继续，生成计划」——跳过就是不答，按 Host 默认做法推进。
		*/
		function QuestionsCard({ questions, answers, live, busy, onAnswer, onGeneratePlan }) {
			const list = (Array.isArray(questions) ? questions : []).filter(Boolean);
			const answeredCount = list.filter((question, index) => hasAnswer(answers?.[String(question?.id ?? `q${index + 1}`)])).length;
			return h("div", { style: S.questionsCard }, h("div", { style: styles.row }, h(IconSeat, { size: 28 }, "?"), h("strong", null, "工作站想确认几件事"), h(Pill, { tone: "accent" }, `已答 ${answeredCount}/${list.length}`), h(Pill, null, `最多 4 问`)), h("div", { style: {
				...styles.smallMuted,
				marginTop: 4
			} }, "可以跳过，我按默认做法推进；答了会影响计划里的步骤、范围与验收。"), list.map((question, index) => {
				const id = String(question?.id ?? `q${index + 1}`);
				const options = Array.isArray(question?.options) ? question.options.filter(Boolean) : [];
				const kind = question?.kind === "choice" ? "choice" : question?.kind === "text" ? "text" : options.length ? "choice" : "text";
				const answer = answers?.[id];
				return h("div", {
					key: id,
					style: S.questionBlock
				}, h("div", { style: { fontWeight: 600 } }, String(question?.question ?? "（没有问题描述）")), question?.why ? h("div", { style: {
					...styles.smallMuted,
					marginTop: 2
				} }, String(question.why)) : null, kind === "choice" ? h("div", { style: {
					...styles.row,
					marginTop: 6
				} }, options.map((option, optionIndex) => {
					const value = option?.value ?? option?.id ?? option?.label;
					const on = sameValue(answer, value);
					const checkable = live && !busy;
					return h("span", {
						key: String(option?.id ?? optionIndex),
						style: {
							...on ? styles.chipOn : styles.chip,
							cursor: checkable ? "pointer" : "default"
						},
						title: checkable ? "点击选择（再点一次取消）" : void 0,
						onClick: checkable ? () => onAnswer(id, on ? null : value) : void 0
					}, `${on ? "✓ " : ""}${String(option?.label ?? value ?? "")}`);
				})) : h("input", {
					style: {
						...styles.input,
						marginTop: 6
					},
					value: answer === void 0 || answer === null || typeof answer === "object" ? "" : String(answer),
					disabled: !live || busy,
					placeholder: live ? "写下你的回答，Enter 提交（留空 = 跳过）" : "当时没有回答，按默认做法推进",
					onChange: (event) => onAnswer(id, event.target.value),
					onKeyDown: (event) => {
						if (event.key !== "Enter") return;
						event.preventDefault();
						event.currentTarget?.blur?.();
					}
				}));
			}), live ? h("div", { style: {
				...styles.row,
				marginTop: 10
			} }, h(Button, {
				primary: true,
				disabled: busy,
				onClick: onGeneratePlan,
				children: busy ? "正在生成计划…" : "继续，生成计划"
			}), h("span", { style: styles.smallMuted }, answeredCount ? `已答 ${answeredCount} 题，剩下按默认做法推进。` : "没有回答也可以继续。")) : null);
		}
		/**
		* 计划卡片：工作站自评结论（规模/人天/置信度）+ 依据 + 步骤 + 风险 + 验收。
		* 工程量只读展示，没有任何输入框 —— 用户不填规模与人天。
		*/
		function PlanCard({ plan, live, busy, syncBeforeStart = true, onSyncBeforeStartChange, onStartPlan, onAdjustScope }) {
			const estimate = plan?.estimate ?? {};
			const steps = Array.isArray(plan?.steps) ? plan.steps : [];
			const acceptance = Array.isArray(plan?.acceptance) ? plan.acceptance : [];
			const risks = Array.isArray(plan?.risks) ? plan.risks : [];
			const basis = Array.isArray(estimate?.basis) ? estimate.basis : [];
			const modules = Array.isArray(plan?.modules) ? plan.modules.filter(Boolean) : [];
			return h("div", { style: S.planCard }, h("div", { style: styles.row }, h(IconSeat, { size: 28 }, "▤"), h("strong", { style: styles.sectionTitle }, "开发计划"), h(Pill, { tone: "accent" }, "工作站自评"), h(Pill, null, `${steps.length} 步`)), plan?.name ? h("div", { style: {
				marginTop: 6,
				fontSize: T.font.sm,
				color: T.text2
			} }, h("span", { style: { color: T.text4 } }, "流程标题："), h("span", { style: {
				fontWeight: 600,
				color: T.text
			} }, plan.name)) : null, h("div", { style: {
				display: "grid",
				gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
				gap: 12,
				marginTop: 12,
				padding: "12px 16px",
				background: T.surface2,
				borderRadius: T.rBase
			} }, h(Stat, {
				label: "规模",
				value: estimate.size ?? "—"
			}), h(Stat, {
				label: "人日",
				value: estimate.days ?? "—"
			}), h(Stat, {
				label: "置信度",
				value: confidenceText(estimate.confidence)
			})), plan?.summary ? h("div", { style: {
				...styles.smallMuted,
				marginTop: 4
			} }, String(plan.summary)) : null, basis.length ? h("div", { style: { marginTop: 6 } }, h("div", { style: styles.label }, "为什么是这个量级（自评依据）"), h("ul", { style: S.list }, basis.map((item, index) => h("li", {
				key: index,
				style: styles.smallMuted
			}, String(item))))) : null, steps.length ? h("div", { style: { marginTop: 6 } }, h("div", { style: styles.label }, "计划步骤"), h("ol", { style: S.stepList }, steps.map((step, index) => h("li", {
				key: index,
				style: { marginBottom: 2 }
			}, String(step))))) : h("div", { style: {
				...styles.smallMuted,
				marginTop: 6
			} }, "工作站没有返回计划步骤，建议补充描述后重新生成。"), risks.length ? h("div", { style: S.riskBox }, h("div", { style: { fontWeight: 600 } }, "风险与注意"), h("ul", { style: S.riskList }, risks.map((risk, index) => h("li", { key: index }, String(risk))))) : h("div", { style: {
				...styles.smallMuted,
				marginTop: 6
			} }, "工作站暂时没有识别到特别风险。"), acceptance.length ? h("div", { style: { marginTop: 6 } }, h("div", { style: styles.label }, "验收标准"), h("ul", { style: S.list }, acceptance.map((item, index) => h("li", { key: index }, `✓ ${String(item)}`)))) : h("div", { style: {
				...styles.smallMuted,
				marginTop: 6
			} }, "工作站没有返回验收标准。"), modules.length ? h("div", { style: {
				...styles.row,
				marginTop: 8
			} }, h("span", { style: styles.smallMuted }, "涉及模块："), modules.map((name) => h("span", {
				key: name,
				style: styles.pill
			}, String(name)))) : null, live ? h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 8,
				marginTop: 10
			} }, h("label", { style: {
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				fontSize: T.font.sm,
				color: T.text2,
				cursor: "pointer"
			} }, h("input", {
				type: "checkbox",
				checked: syncBeforeStart,
				disabled: busy,
				onChange: (event) => onSyncBeforeStartChange?.(event.target.checked)
			}), "开工前拉取最新代码（git fetch + merge --ff-only）"), h("div", { style: styles.row }, h(Button, {
				primary: true,
				disabled: busy,
				onClick: onStartPlan,
				children: busy ? "正在开工…" : "按这个计划开工"
			}), h(Button, {
				disabled: busy,
				onClick: onAdjustScope,
				children: "再调整范围"
			}))) : null);
		}
		/** 首次确认后要注入 chat-flow 的 Host 调用集合（组件里不重写任何业务规则）。 */
		function makeDeps(ctx) {
			return {
				recon: (description, options = {}) => api(API.recon, {
					method: "POST",
					body: JSON.stringify({
						description,
						...Array.isArray(options.attachments) && options.attachments.length ? { attachments: options.attachments } : {},
						...options.repoPath ? { repoPath: options.repoPath } : {}
					})
				}),
				attach: (payload) => api(API.attach, {
					method: "POST",
					body: JSON.stringify(payload)
				}),
				plan: (payload) => api(API.plan, {
					method: "POST",
					body: JSON.stringify(payload)
				}),
				bootstrap: () => api(API.wizard, {
					method: "POST",
					body: JSON.stringify({ action: "bootstrap" })
				}),
				create: (payload) => api(API.wizard, {
					method: "POST",
					body: JSON.stringify({
						action: "create",
						...payload
					})
				}),
				start: (id) => api(API.start, {
					method: "POST",
					body: JSON.stringify({ id })
				}),
				sync: (id) => api(API.sync, {
					method: "POST",
					body: JSON.stringify({ id })
				}),
				launch: ({ cwd, prompt }) => launchDevSession(ctx, {
					cwd,
					prompt,
					open: false
				}),
				prompt: launchPrompt
			};
		}
		/**
		* 聊天式开发入口：
		* 说一句要做什么 → 工作站扫仓库并追问 → 用户确认文件/范围 + 回答/跳过追问
		* → 工作站出计划（步骤/验收/风险/工程量自评）→ 用户确认 → 建流程并开启开发会话。
		*/
		/**
		* @param {object} props
		* @param {string|null} [props.scopeId] 作用域：某个流程 id = 专注该流程的开发对话；null/空 = 新建流程
		* @param {string} [props.scopeTitle] 作用域显示名（流程标题）
		*/
		let spinInjected = false;
		function ensureSpinKeyframes() {
			if (spinInjected || typeof document === "undefined") return;
			spinInjected = true;
			const style = document.createElement("style");
			style.textContent = [
				"@keyframes devhub-spin { to { transform: rotate(360deg) } }",
				"@keyframes devhub-typing { 0%, 80%, 100% { opacity: .25; transform: translateY(0) } 40% { opacity: 1; transform: translateY(-2px) } }",
				".devhub-typing-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: devhub-typing 1.2s infinite ease-in-out }",
				".devhub-typing-dot:nth-child(2) { animation-delay: .15s }",
				".devhub-typing-dot:nth-child(3) { animation-delay: .3s }",
				".devhub-msg-time { opacity: 0; transition: opacity .15s ease }",
				".devhub-msg:hover .devhub-msg-time { opacity: 1 }"
			].join("\n");
			document.head.appendChild(style);
		}
		function DevHubChat({ ctx, onFlowsChanged, onRequireSetup, onFlowStarted, scopeId = null, scopeTitle = "" }) {
			const [state, setState] = (0, react.useState)(null);
			const [stateError, setStateError] = (0, react.useState)("");
			const [loadingState, setLoadingState] = (0, react.useState)(true);
			const [messages, setMessages] = (0, react.useState)([]);
			const [input, setInput] = (0, react.useState)("");
			const [phase, setPhase] = (0, react.useState)(PHASE.idle);
			const [pending, setPending] = (0, react.useState)(null);
			const [pendingPlan, setPendingPlan] = (0, react.useState)(null);
			const [answers, setAnswers] = (0, react.useState)({});
			const [clarify, setClarify] = (0, react.useState)(null);
			const [clarifyBusy, setClarifyBusy] = (0, react.useState)(false);
			const [syncBeforeStart, setSyncBeforeStart] = (0, react.useState)(true);
			const [progress, setProgress] = (0, react.useState)(null);
			const [job, setJob] = (0, react.useState)(null);
			const resumeTriedRef = (0, react.useRef)(false);
			const [attachments, setAttachments] = (0, react.useState)([]);
			const [attachBusy, setAttachBusy] = (0, react.useState)(false);
			const [attachError, setAttachError] = (0, react.useState)("");
			const [capabilities, setCapabilities] = (0, react.useState)(null);
			const attachInputRef = (0, react.useRef)(null);
			const activeChatIdRef = (0, react.useRef)(null);
			const runTokenRef = (0, react.useRef)(0);
			ensureSpinKeyframes();
			const [clarifyOrigin, setClarifyOrigin] = (0, react.useState)("");
			const [sideOpen, setSideOpen] = (0, react.useState)(true);
			const [rescanBusy, setRescanBusy] = (0, react.useState)(false);
			const [rescanNote, setRescanNote] = (0, react.useState)("");
			const [clarifyTitle, setClarifyTitle] = (0, react.useState)("");
			const [titleTouched, setTitleTouched] = (0, react.useState)(false);
			const clarifyInFlightRef = (0, react.useRef)(false);
			const [selectedFiles, setSelectedFiles] = (0, react.useState)([]);
			const [scopeList, setScopeList] = (0, react.useState)([]);
			const endRef = (0, react.useRef)(null);
			const bodyRef = (0, react.useRef)(null);
			const stickRef = (0, react.useRef)(true);
			const inputRef = (0, react.useRef)(null);
			const busy = clarifyBusy || phase === PHASE.analyzing || phase === PHASE.planning || phase === PHASE.creating;
			const setupRequired = Boolean(state && (state.needsSetup || !state.repo));
			const locked = busy || phase === PHASE.confirm || phase === PHASE.plan || setupRequired || loadingState || Boolean(stateError);
			async function loadState() {
				setLoadingState(true);
				setStateError("");
				try {
					const body = await api(API.state);
					setState(body);
				} catch (err) {
					setStateError(errorText(err));
				} finally {
					setLoadingState(false);
				}
			}
			const restoredRef = (0, react.useRef)(null);
			const [chats, setChats] = (0, react.useState)([]);
			const [activeChatId, setActiveChatId] = (0, react.useState)(null);
			const [historyOpen, setHistoryOpen] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				loadState();
			}, []);
			(0, react.useEffect)(() => {
				let alive = true;
				api(API.capabilities).then((body) => {
					if (alive) setCapabilities(body);
				}).catch((err) => {
					if (alive) setCapabilities({
						images: {
							supported: false,
							reason: errorText(err)
						},
						files: { supported: true }
					});
				});
				return () => {
					alive = false;
				};
			}, []);
			function applyConversation(conversation) {
				const restored = Array.isArray(conversation?.messages) ? conversation.messages : [];
				resumeTriedRef.current = false;
				setProgress(null);
				const hasPlan = restored.some((msg) => msg.kind === "plan");
				const deduped = [];
				const seenClarify = /* @__PURE__ */ new Map();
				for (const msg of restored) {
					if (msg.kind === "clarify") {
						const prev = seenClarify.get(msg.round);
						if (prev) deduped[prev.index] = {
							...deduped[prev.index],
							resolved: true
						};
						seenClarify.set(msg.round, { index: deduped.length });
						deduped.push(msg);
						continue;
					}
					const last = deduped[deduped.length - 1];
					if (last && msg.role === "assistant" && last.role === "assistant" && String(last.text ?? "") === String(msg.text ?? "")) continue;
					deduped.push(msg);
				}
				const normalized = hasPlan ? deduped.map((msg) => [
					"recon",
					"questions",
					"clarify"
				].includes(msg.kind) ? {
					...msg,
					resolved: true
				} : msg) : deduped;
				setMessages(normalized);
				setInput(conversation?.input ?? "");
				setAnswers(conversation?.answers ?? {});
				setSelectedFiles(conversation?.selectedFiles ?? []);
				setScopeList(conversation?.scopeList ?? []);
				setAttachments(normalizeAttachments(conversation?.attachments));
				setAttachError("");
				setPending(conversation?.pending ?? null);
				setPendingPlan(conversation?.pendingPlan ?? null);
				setJob(conversation?.job ?? null);
				const restoredClarify = conversation?.clarify ?? null;
				setClarify(restoredClarify);
				const restoredOrigin = conversation?.clarifyOrigin || (normalized.filter((msg) => msg.role === "user" && String(msg.text ?? "").trim())[0]?.text ?? "");
				setClarifyOrigin(restoredOrigin);
				setClarifyTitle(String(conversation?.clarifyTitle || conversation?.clarify?.title || ""));
				setTitleTouched(Boolean(conversation?.titleTouched));
				if (!restoredClarify) {
					const lastCard = [...normalized].reverse().find((msg) => msg.kind === "clarify");
					if (lastCard && restoredOrigin) setClarify({
						description: restoredOrigin,
						history: [{
							role: "user",
							text: restoredOrigin
						}],
						round: lastCard.round ?? 1,
						reply: lastCard.reply ?? "",
						questions: [],
						spec: lastCard.spec ?? {},
						ready: Boolean(lastCard.ready),
						missing: [],
						engine: lastCard.engine ?? "dsh"
					});
				}
				const pending = conversation?.pending ?? null;
				const pendingPlan = conversation?.pendingPlan ?? null;
				const pendingCard = pending?.messageId ? normalized.find((msg) => msg.id === pending.messageId) : null;
				const questionsCard = pending?.questionsId ? normalized.find((msg) => msg.id === pending.questionsId) : null;
				const lastClarify = [...normalized].reverse().find((msg) => msg.kind === "clarify");
				const clarifyActionable = Boolean(lastClarify && !lastClarify.resolved);
				const pendingActionable = Boolean(pending && (pendingCard && !pendingCard.resolved || questionsCard && !questionsCard.resolved || clarifyActionable));
				const planCard = pendingPlan?.id ? normalized.find((msg) => msg.id === pendingPlan.id) : null;
				const planActionable = Boolean(pendingPlan && planCard && !planCard.resolved);
				const safePhase = conversation?.phase === PHASE.plan && planActionable ? PHASE.plan : conversation?.phase === PHASE.confirm && pendingActionable ? PHASE.confirm : PHASE.idle;
				setPhase(safePhase);
			}
			const scope = String(scopeId ?? "").trim() || "new";
			(0, react.useEffect)(() => {
				if (!progress) return;
				const timer = setInterval(() => {
					setProgress((current) => current ? {
						...current,
						seconds: Math.round((Date.now() - current.startedAt) / 1e3)
					} : current);
				}, 1e3);
				return () => clearInterval(timer);
			}, [progress?.startedAt]);
			(0, react.useEffect)(() => {
				if (!job || progress) return;
				const startedAt = Number(job.at) || Date.now();
				const kindLabel = job.kind === "clarify" ? `需求澄清（第 ${Number(job.round) || 1} 轮）` : job.kind === "plan" ? "生成开发计划" : "扫描仓库";
				setProgress({
					label: `${kindLabel}：已恢复任务，正在等待工作站继续…`,
					startedAt,
					seconds: Math.max(0, Math.round((Date.now() - startedAt) / 1e3))
				});
			}, [job, progress]);
			(0, react.useEffect)(() => {
				const repoPath = state?.repo?.path;
				if (!repoPath) return;
				const key = `${repoPath}::${scope}`;
				if (restoredRef.current === key) return;
				restoredRef.current = key;
				const active = getActiveChat(repoPath, scope);
				activeChatIdRef.current = active.id;
				setActiveChatId(active.id);
				setChats(listChats(repoPath, scope));
				applyConversation(active.conversation);
			}, [state?.repo?.path, scope]);
			(0, react.useEffect)(() => {
				activeChatIdRef.current = activeChatId;
			}, [activeChatId]);
			(0, react.useEffect)(() => {
				const repoPath = state?.repo?.path;
				if (!repoPath || !activeChatId) return;
				if (restoredRef.current !== `${repoPath}::${scope}`) return;
				saveChat(repoPath, activeChatId, {
					messages,
					input,
					phase,
					pending,
					pendingPlan,
					answers,
					selectedFiles,
					scopeList,
					attachments,
					clarify,
					clarifyOrigin,
					clarifyTitle,
					titleTouched,
					job
				}, scope);
				setChats(listChats(repoPath, scope));
			}, [
				state?.repo?.path,
				scope,
				activeChatId,
				messages,
				input,
				phase,
				pending,
				pendingPlan,
				answers,
				selectedFiles,
				scopeList,
				attachments,
				clarify,
				clarifyOrigin,
				clarifyTitle,
				titleTouched,
				job
			]);
			/** 打开某段历史对话（先保存当前，再切换）。 */
			function openChat(id) {
				const repoPath = state?.repo?.path;
				if (!repoPath || id === activeChatId) {
					setHistoryOpen(false);
					return;
				}
				saveChat(repoPath, activeChatId, {
					messages,
					input,
					phase,
					pending,
					pendingPlan,
					answers,
					selectedFiles,
					scopeList,
					attachments,
					clarify,
					clarifyOrigin,
					clarifyTitle,
					titleTouched,
					job
				}, scope);
				const target = selectChat(repoPath, id, scope);
				if (!target) return;
				activeChatIdRef.current = target.id;
				setActiveChatId(target.id);
				applyConversation(target);
				setChats(listChats(repoPath, scope));
				setHistoryOpen(false);
			}
			/** 显式开一段新对话（旧的保留在历史里）。 */
			function beginNewChat() {
				const repoPath = state?.repo?.path;
				if (!repoPath || busy) return;
				saveChat(repoPath, activeChatId, {
					messages,
					input,
					phase,
					pending,
					pendingPlan,
					answers,
					selectedFiles,
					scopeList,
					attachments,
					clarify,
					clarifyOrigin,
					clarifyTitle,
					titleTouched,
					job
				}, scope);
				const conversation = startNewChat(repoPath, "新对话", scope);
				activeChatIdRef.current = conversation.id;
				setActiveChatId(conversation.id);
				applyConversation(conversation);
				setChats(listChats(repoPath, scope));
				setHistoryOpen(false);
				inputRef.current?.focus?.();
			}
			(0, react.useEffect)(() => {
				if (resumeTriedRef.current || !state?.repo?.path || !job) return;
				if (loadingState) return;
				resumeTriedRef.current = true;
				const resumeKind = job.kind === "clarify" ? "clarify" : "recon";
				if (job.kind !== "plan" && isConversationRunning(state.repo.path, scope, activeChatIdRef.current, resumeKind)) {
					setProgress({
						label: "当前扫描/澄清还在处理，结束后会自动继续…",
						startedAt: Date.now()
					});
					const repoPath = state.repo.path;
					let ticks = 0;
					const timer = setInterval(() => {
						ticks += 1;
						const origin = getConversation(repoPath, activeChatIdRef.current, scope);
						if (!origin) return;
						const stillRunning = isConversationRunning(repoPath, scope, activeChatIdRef.current, resumeKind);
						if (stillRunning && ticks < 100) return;
						clearInterval(timer);
						applyConversation(origin);
						setChats(listChats(repoPath, scope));
						if (stillRunning) {
							endRun(runKey(repoPath, scope, activeChatIdRef.current, resumeKind));
							clearConversationJob(repoPath, activeChatIdRef.current, scope);
							setJob(null);
							setProgress(null);
							push(stationMessage("上一轮请求超过 2 分钟没有收尾，已停止等待；如果结果没出来，请重新发一句。", { tone: "warn" }));
						} else {
							setJob(origin.job ?? null);
							setProgress(null);
						}
					}, 1200);
					return () => {
						clearInterval(timer);
						setProgress(null);
					};
				}
				const age = Date.now() - Number(job.at ?? 0);
				if (job.kind === "clarify") {
					const lastClarify = [...messages].reverse().find((msg) => msg.kind === "clarify");
					if (lastClarify && Number(lastClarify.round ?? 0) >= Number(job.round ?? 0)) {
						setJob(null);
						setProgress(null);
						return;
					}
					if (Number(job.resumeCount ?? 0) >= 1) {
						push(stationMessage("上次的澄清可能已经完成；如需继续，点最新一轮的「继续补充（再问一轮）」。"));
						setJob(null);
						setProgress(null);
						return;
					}
					setJob({
						...job,
						resumeCount: Number(job.resumeCount ?? 0) + 1
					});
				}
				if (age > 900 * 1e3) {
					push(stationMessage("上次的扫描/澄清已中断超过 15 分钟，直接重新发一句即可。", { tone: "danger" }));
					setJob(null);
					setProgress(null);
					return;
				}
				if (job.kind === "recon") {
					push(stationMessage("刚才的扫描被切走了，已自动重新扫描…"));
					analyze(job.description, {
						echo: false,
						extraAttachments: job.attachments
					});
				} else if (job.kind === "clarify") {
					push(stationMessage("刚才的澄清被切走了，已自动接着问…"));
					runClarify(job);
				} else if (job.kind === "plan") {
					push(stationMessage("刚才生成计划时你切走了：确认范围后点「继续，生成计划」重试。"));
					setPhase(PHASE.confirm);
					setJob(null);
					setProgress(null);
				}
			}, [
				state?.repo?.path,
				job,
				loadingState
			]);
			(0, react.useEffect)(() => {
				if (!stickRef.current) return;
				endRef.current?.scrollIntoView?.({
					block: "end",
					behavior: "smooth"
				});
			}, [
				messages,
				phase,
				progress?.seconds
			]);
			function onBodyScroll() {
				const node = bodyRef.current;
				if (!node) return;
				stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
			}
			function push(...items) {
				setMessages((current) => [...current, ...items]);
			}
			/** File/Blob → base64（分块拼，避免 8MB 图片触发调用栈上限）。 */
			function bytesToBase64(buffer) {
				const bytes = new Uint8Array(buffer);
				let binary = "";
				const chunk = 32768;
				for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
				return btoa(binary);
			}
			/**
			* 粘贴/拖入/选择文件：先传到 Host 落盘，再把附件元信息挂到本条消息。
			* 图片要求当前模型支持图片输入；不支持就明确提示（不静默丢弃）。
			*/
			async function addFiles(fileList) {
				const files = Array.from(fileList ?? []).filter(Boolean);
				if (!files.length || attachBusy) return;
				if (locked) return;
				setAttachError("");
				setAttachBusy(true);
				try {
					for (const file of files) {
						const isImage = /^image\//.test(String(file.type ?? ""));
						if (isImage && capabilities && capabilities.images?.supported === false) {
							setAttachError(`当前模型不支持图片输入：${capabilities.images.reason ?? "模型未声明图片能力"}。可以改用文件引用或文字描述。`);
							continue;
						}
						if (Number(file.size) > 8388608) {
							setAttachError(`文件太大：${file.name ?? "附件"}（上限 ${Math.round(ATTACHMENT_MAX_BYTES / 1024 / 1024)}MB）`);
							continue;
						}
						if (attachments.length >= 8) {
							setAttachError("一条需求最多带 8 个附件");
							break;
						}
						const data = bytesToBase64(await file.arrayBuffer());
						const body = await api(API.attach, {
							method: "POST",
							body: JSON.stringify({
								name: file.name || (isImage ? "粘贴的图片" : "附件"),
								mediaType: file.type || "application/octet-stream",
								data
							})
						});
						if (body.capabilities) setCapabilities(body.capabilities);
						if (body.attachment) setAttachments((current) => normalizeAttachments([...current, body.attachment]));
					}
				} catch (err) {
					setAttachError(`附件上传失败：${errorText(err)}`);
				} finally {
					setAttachBusy(false);
				}
			}
			function onPasteFiles(event) {
				const files = Array.from(event.clipboardData?.files ?? []);
				if (!files.length) return;
				event.preventDefault();
				addFiles(files);
			}
			function onDropFiles(event) {
				const files = Array.from(event.dataTransfer?.files ?? []);
				if (!files.length) return;
				event.preventDefault();
				addFiles(files);
			}
			function removeAttachment(id) {
				setAttachments((current) => current.filter((entry) => entry.id !== id));
				setAttachError("");
			}
			/** 是否支持图片输入（能力未探测到时按"允许尝试"处理，上传后会再校准）。 */
			const imageInputSupported = capabilities?.images?.supported !== false;
			/**
			* 任务归属：发起时记住是**哪段对话**，结果回来时校验。
			* 不匹配说明用户已经切到别的对话（或又开了新流程）——只清任务，不写当前界面，
			* 否则就会把 A 流程的扫描/澄清结果输出到 B 流程的对话里。
			*/
			function startRun(conversationId) {
				runTokenRef.current += 1;
				return {
					token: runTokenRef.current,
					conversationId
				};
			}
			function runIsCurrent(run) {
				if (!run || run.token !== runTokenRef.current || run.conversationId !== activeChatIdRef.current) return false;
				const repoPath = state?.repo?.path;
				if (repoPath && run.conversationId) {
					const activeId = getActiveConversationId(repoPath, scope);
					if (activeId && activeId !== run.conversationId) return false;
				}
				return true;
			}
			/** 收尾：即使组件已卸载也要清掉发起它的那段对话的 job（否则下次挂载会重复续跑）。 */
			function finishRun(run, key) {
				endRun(key);
				const repoPath = state?.repo?.path;
				if (repoPath && run?.conversationId) clearConversationJob(repoPath, run.conversationId, scope);
				if (runIsCurrent(run)) setJob(null);
			}
			/**
			* 扫描结果晚到、用户已经切走：写回**发起它的那段对话**。
			* 这样既不丢结果，也不会像以前那样把消息追加到用户后来打开的那段对话里。
			*/
			function persistReconToOrigin(run, probed) {
				const repoPath = state?.repo?.path;
				if (!repoPath || !run?.conversationId) return;
				const origin = getConversation(repoPath, run.conversationId, scope);
				if (!origin) return;
				const recon = probed?.recon ?? {};
				const card = reconMessage(recon, probed?.draft);
				const files = Array.isArray(recon.files) ? recon.files : [];
				saveChat(repoPath, run.conversationId, {
					messages: [
						...origin.messages ?? [],
						stationMessage(summarizeRecon(recon)),
						card
					],
					pending: {
						...probed,
						messageId: card.id
					},
					pendingPlan: null,
					answers: {},
					selectedFiles: files.map((file) => String(file?.path ?? "")).filter(Boolean),
					scopeList: uniqueTokens(Array.isArray(recon.suggestedScope) ? recon.suggestedScope : []),
					phase: PHASE.confirm,
					job: null
				}, scope);
			}
			/** 澄清结果晚到、用户已经切走：同样写回原对话（卡片还能继续答）。 */
			function persistClarifyToOrigin(run, payload, { description, history }) {
				const repoPath = state?.repo?.path;
				if (!repoPath || !run?.conversationId) return;
				const origin = getConversation(repoPath, run.conversationId, scope);
				if (!origin) return;
				const card = clarifyMessage(payload);
				saveChat(repoPath, run.conversationId, {
					messages: [
						...origin.messages ?? [],
						stationMessage(payload.degraded ? `（澄清降级为本地规则：${payload.reason ?? "工作站不可用"}）` : payload.reply),
						card
					],
					...origin.pending ? { pending: {
						...origin.pending,
						questionsId: card.id
					} } : {},
					clarify: {
						...origin.clarify ?? {},
						description,
						history,
						...payload
					},
					job: null
				}, scope);
			}
			/** 清空当前这轮交互（保留对话历史）。 */
			function resetFlow() {
				setPending(null);
				setPendingPlan(null);
				setAnswers({});
				setSelectedFiles([]);
				setScopeList([]);
				setAttachments([]);
				setAttachError("");
				setPhase(PHASE.idle);
			}
			/** 用户勾选后真正要带进上下文/计划的文件。 */
			function confirmedFiles() {
				return (pending?.recon?.files ?? []).filter((file) => selectedFiles.includes(String(file?.path ?? "")));
			}
			/** 扫描 + 第一轮澄清：send() 与"恢复续跑"共用（echo=false 时不重复插入用户气泡）。 */
			async function analyze(text, { echo = true, extraAttachments = null } = {}) {
				const usedAttachments = normalizeAttachments(extraAttachments ?? attachments);
				const repoPath = state?.repo?.path;
				const conversationId = activeChatIdRef.current;
				const key = runKey(repoPath, scope, conversationId, "recon");
				if (!beginRun(key)) {
					push(stationMessage("上一次扫描还没结束：等它回来再发，或点「新对话」另开一段。", { tone: "warn" }));
					return;
				}
				const run = startRun(conversationId);
				setPhase(PHASE.analyzing);
				if (echo) push(userMessage(text, usedAttachments));
				setJob({
					kind: "recon",
					description: text,
					attachments: usedAttachments,
					at: Date.now()
				});
				setProgress({
					label: "扫描仓库：让 dsh 找可能要改的文件",
					startedAt: Date.now(),
					seconds: 0
				});
				try {
					const probed = await probeCode(makeDeps(ctx), text, {
						attachments: usedAttachments,
						repoPath: state?.repo?.path
					});
					if (!runIsCurrent(run)) {
						persistReconToOrigin(run, probed);
						return;
					}
					const recon = probed.recon ?? {};
					const card = reconMessage(recon, probed.draft);
					const files = Array.isArray(recon.files) ? recon.files : [];
					setPending({
						...probed,
						messageId: card.id
					});
					setPendingPlan(null);
					setAnswers({});
					setSelectedFiles(files.map((file) => String(file?.path ?? "")).filter(Boolean));
					setScopeList(uniqueTokens(Array.isArray(recon.suggestedScope) ? recon.suggestedScope : []));
					push(stationMessage(summarizeRecon(recon)), card);
					setPhase(PHASE.confirm);
					setClarifyOrigin(text);
					await runClarify({
						description: text,
						round: 1,
						history: [{
							role: "user",
							text
						}],
						recon,
						spec: {},
						attachments: usedAttachments
					});
				} catch (err) {
					if (runIsCurrent(run)) {
						push(stationMessage(`探测失败：${errorText(err)}（可重试）`, { tone: "danger" }));
						setPhase(PHASE.idle);
					}
				} finally {
					if (runIsCurrent(run)) setProgress(null);
					finishRun(run, key);
				}
			}
			async function send() {
				const text = input.trim();
				if (locked) return;
				if (!text) {
					setAttachError(attachments.length ? "附件已就绪：再补一句要做什么（Enter 发送）" : "");
					return;
				}
				setInput("");
				stickRef.current = true;
				await analyze(text);
			}
			const currentTitle = () => clarifyTitle || clarify?.title || "";
			/** 调一次澄清：把「用户这句话 + 已有问答」交给 dsh，拿回 reply/questions/spec/title。 */
			async function runClarify({ description, round, history, recon, spec, attachments: chosenAttachments = null }) {
				if (clarifyInFlightRef.current) return null;
				const usedAttachments = normalizeAttachments(chosenAttachments ?? attachments);
				const repoPath = state?.repo?.path;
				const conversationId = activeChatIdRef.current;
				const key = runKey(repoPath, scope, conversationId, "clarify");
				if (!beginRun(key)) return null;
				clarifyInFlightRef.current = true;
				const run = startRun(conversationId);
				setClarifyBusy(true);
				setJob({
					kind: "clarify",
					description,
					round,
					history,
					recon,
					spec,
					attachments: usedAttachments,
					at: Date.now()
				});
				setProgress({
					label: `需求澄清（第 ${round} 轮）：dsh 正在结合仓库证据整理问题`,
					startedAt: Date.now(),
					seconds: 0
				});
				try {
					const body = await api(API.clarify, {
						method: "POST",
						body: JSON.stringify({
							description,
							round,
							history,
							recon,
							spec,
							attachments: usedAttachments
						})
					});
					const payload = {
						round: body.round ?? round,
						title: titleTouched ? currentTitle() : body.title ?? "",
						reply: body.reply ?? "",
						questions: body.questions ?? [],
						spec: body.spec ?? spec ?? {},
						ready: Boolean(body.ready),
						missing: body.missing ?? [],
						engine: body.engine ?? "dsh",
						degraded: Boolean(body.degraded)
					};
					if (!runIsCurrent(run)) {
						persistClarifyToOrigin(run, payload, {
							description,
							history
						});
						return null;
					}
					if (!titleTouched && body.title) setClarifyTitle(String(body.title));
					setClarify((current) => ({
						...current ?? {},
						description,
						history,
						...payload
					}));
					const card = clarifyMessage(payload);
					setPending((current) => current ? {
						...current,
						questionsId: card.id
					} : current);
					push(stationMessage(payload.degraded ? `（澄清降级为本地规则：${body.reason ?? "工作站不可用"}）` : payload.reply), card);
					return payload;
				} catch (err) {
					if (runIsCurrent(run)) push(stationMessage(`澄清失败：${errorText(err)}`, { tone: "danger" }));
					return null;
				} finally {
					clarifyInFlightRef.current = false;
					if (runIsCurrent(run)) {
						setClarifyBusy(false);
						setProgress(null);
					}
					finishRun(run, key);
				}
			}
			/** 按最新讨论重扫：把澄清历史里的用户回答拼进描述，再让 dsh 找一次文件。 */
			async function rescan() {
				if (rescanBusy) return;
				const repoPath = state?.repo?.path;
				const conversationId = activeChatIdRef.current;
				const runKeyRescan = runKey(repoPath, scope, conversationId, "rescan");
				if (!beginRun(runKeyRescan)) return;
				const run = startRun(conversationId);
				const base = String(clarify?.description || clarifyOrigin || pending?.description || "").trim();
				if (base.length < 2) {
					setRescanNote("原始描述丢了，先重新说一句需求");
					return;
				}
				const extra = (clarify?.history ?? []).filter((turn) => turn.role === "user").map((turn) => turn.text).filter((text) => text && text !== base).slice(-6).join("\n");
				const enriched = extra ? `${base}\n\n补充说明：\n${extra}` : base;
				setRescanBusy(true);
				setRescanNote("正在按最新讨论重新扫描…");
				try {
					const probed = await probeCode(makeDeps(ctx), enriched, { repoPath: state?.repo?.path });
					if (!runIsCurrent(run)) return;
					const recon = probed.recon ?? {};
					const files = Array.isArray(recon.files) ? recon.files : [];
					setPending((current) => current ? {
						...current,
						recon: {
							...current.recon ?? {},
							...recon
						},
						description: enriched
					} : current);
					setSelectedFiles(files.map((file) => String(file?.path ?? "")).filter(Boolean));
					setScopeList(uniqueTokens(Array.isArray(recon.suggestedScope) ? recon.suggestedScope : []));
					setRescanNote(`已按最新讨论重扫：命中 ${files.length} 个文件${files.length ? "" : "（可能是描述还不够具体）"}`);
				} catch (err) {
					if (runIsCurrent(run)) setRescanNote(`重扫失败：${errorText(err)}`);
				} finally {
					if (runIsCurrent(run)) setRescanBusy(false);
					finishRun(run, runKeyRescan);
				}
			}
			/** 提交这一轮答案：把回答拼成一句话继续问；ready 或到轮次上限就收口。 */
			/** 找到这次对话最初那句话（恢复后 clarify 上下文丢失时的兜底）。 */
			function originDescription() {
				const first = (messages ?? []).find((msg) => msg.role === "user" && String(msg.text ?? "").trim());
				return String(first?.text ?? "").trim();
			}
			/** 已提交的澄清卡：继续问下一轮（带上已有 spec 与历史）。 */
			async function continueClarify(card) {
				if (clarifyBusy) return;
				const description = String(clarify?.description || clarifyOrigin || pending?.description || originDescription()).trim();
				if (description.length < 2) {
					push(stationMessage("原始描述丢了（可能刷新过页面）。请在下面重新说一句「要做什么」。", { tone: "danger" }));
					return;
				}
				const history = clarify?.history?.length ? clarify.history : [{
					role: "user",
					text: description
				}];
				await runClarify({
					description,
					round: (card?.round ?? 1) + 1,
					history,
					recon: pending?.recon,
					spec: card?.spec ?? clarify?.spec ?? {}
				});
			}
			async function submitClarify(card) {
				if (clarifyBusy || card?.resolved) return;
				const answered = (card?.questions ?? []).map((question) => {
					const value = answers[question.id];
					const text = typeof value === "string" ? value : [value?.selected?.join("、"), value?.custom].filter(Boolean).join("；");
					return text ? `${question.question} → ${text}` : null;
				}).filter(Boolean);
				const reply = answered.length ? answered.join("\n") : "（这轮没有问题可答）";
				const description = String(clarify?.description || clarifyOrigin || pending?.description || pending?.draft?.raw || originDescription()).trim();
				if (description.length < 2) {
					push(stationMessage("这次对话的原始描述丢了（可能刷新过页面）。请在下面重新说一句「要做什么」，我接着问。", { tone: "danger" }));
					setPhase(PHASE.idle);
					return;
				}
				setMessages((current) => current.map((msg) => msg.id === card?.id ? {
					...msg,
					resolved: true,
					answers: { ...answers }
				} : msg));
				push(userMessage(reply));
				const history = [
					...clarify?.history ?? [],
					{
						role: "assistant",
						text: card?.reply ?? ""
					},
					{
						role: "user",
						text: reply
					}
				];
				const nextRound = (card?.round ?? 1) + 1;
				await runClarify({
					description,
					round: card?.ready || nextRound > MAX_CLARIFY_ROUNDS ? MAX_CLARIFY_ROUNDS : nextRound,
					history,
					recon: pending?.recon,
					spec: card?.spec ?? clarify?.spec ?? {}
				});
			}
			/** 澄清卡片的选择/自由回答（按问题 id 合并成 {selected, custom}）。 */
			function setClarifyAnswer(id, patch) {
				setAnswers((current) => {
					const prev = current[id] && typeof current[id] === "object" ? current[id] : {
						selected: [],
						custom: ""
					};
					return {
						...current,
						[id]: {
							...prev,
							...patch
						}
					};
				});
			}
			function toggleFile(path) {
				setSelectedFiles((current) => current.includes(path) ? current.filter((entry) => entry !== path) : [...current, path]);
			}
			function toggleScope(token) {
				setScopeList((current) => current.includes(token) ? current.filter((entry) => entry !== token) : [...current, token]);
			}
			function addScope(token) {
				setScopeList((current) => uniqueTokens([...current, token]));
			}
			function removeScope(token) {
				setScopeList((current) => current.filter((entry) => entry !== token));
			}
			/** 追问答案：选择题存原始 value（可能是对象），再点一次传入 null 表示取消。 */
			function setAnswer(id, value) {
				const key = String(id ?? "").trim();
				if (!key) return;
				setAnswers((current) => {
					const next = { ...current };
					if (value === void 0 || value === null || typeof value === "string" && !value.trim()) delete next[key];
					else next[key] = value;
					return next;
				});
			}
			function reDescribe() {
				resetFlow();
				inputRef.current?.focus?.();
			}
			/** 由工作站生成计划：用户不填任何工程量，数字全部来自 Host 自评。 */
			async function continueToPlan() {
				if (!pending || busy) return;
				const repoPath = state?.repo?.path;
				const conversationId = activeChatIdRef.current;
				const activeId = repoPath ? getActiveConversationId(repoPath, scope) : null;
				if (activeId && conversationId && activeId !== conversationId) return;
				const key = runKey(repoPath, scope, conversationId, "plan");
				if (!beginRun(key)) return;
				const run = startRun(conversationId);
				const files = confirmedFiles();
				setPhase(PHASE.planning);
				setJob({
					kind: "plan",
					description: pending.description,
					scope: [...scopeList],
					files,
					answers: { ...answers },
					tokens: pending.recon?.tokens ?? [],
					at: Date.now()
				});
				try {
					const plan = await generatePlan(makeDeps(ctx), {
						description: pending.description,
						scope: scopeList,
						recon: {
							tokens: pending.recon?.tokens ?? [],
							files
						},
						answers,
						spec: clarify?.spec ?? {}
					});
					if (!runIsCurrent(run)) return;
					const snapshot = { ...answers };
					setMessages((current) => current.map((item) => {
						if (item.id === pending.messageId) return {
							...item,
							resolved: true,
							confirmedFiles: files,
							confirmedScope: [...scopeList]
						};
						if (pending.questionsId && item.id === pending.questionsId) return {
							...item,
							resolved: true,
							answers: snapshot
						};
						return item;
					}));
					if (currentTitle()) plan.name = currentTitle();
					const card = planMessage(plan);
					setPendingPlan({
						id: card.id,
						plan
					});
					push(stationMessage(summarizePlan(plan)), card);
					setPhase(PHASE.plan);
				} catch (err) {
					if (runIsCurrent(run)) {
						push(stationMessage(`生成计划失败：${errorText(err)}（可补充描述或调整范围后重试）`, { tone: "danger" }));
						setPhase(PHASE.confirm);
					}
				} finally {
					finishRun(run, key);
				}
			}
			/** 计划已确认：带计划与追问答案建流程，并开启开发会话。 */
			async function startPlanned() {
				if (!pending || !pendingPlan || busy) return;
				const repoPath = state?.repo?.path;
				const conversationId = activeChatIdRef.current;
				const activeId = repoPath ? getActiveConversationId(repoPath, scope) : null;
				if (activeId && conversationId && activeId !== conversationId) return;
				const key = runKey(repoPath, scope, conversationId, "create");
				if (!beginRun(key)) return;
				const run = startRun(conversationId);
				const planData = pendingPlan.plan ?? {};
				const files = confirmedFiles();
				setPhase(PHASE.creating);
				try {
					const result = await confirmAndStart(makeDeps(ctx), {
						description: pending.description,
						draft: pending.draft,
						scope: scopeList,
						recon: {
							tokens: pending.recon?.tokens ?? [],
							files
						},
						firstRun: Boolean(state?.firstRun),
						cwd: state?.repo?.path,
						summary: planData.summary,
						steps: planData.steps,
						acceptance: planData.acceptance,
						estimate: planData.estimate,
						attachments: normalizeAttachments(pending.attachments ?? attachments),
						title: planData.name || currentTitle(),
						answers,
						spec: clarify?.spec ?? {},
						questions: Array.isArray(pending.recon?.questions) ? pending.recon.questions : [],
						syncBeforeStart
					});
					if (!runIsCurrent(run)) {
						onFlowsChanged?.();
						return;
					}
					push(...result.messages ?? []);
					if (result.item?.requirement?.needsReview) push(stationMessage("提醒：这次没拿到工作站总结后的需求（目标/根因还是客户原话，已标记待规范化）。到「流程」详情页点「让工作站规范化」再开工，效果更稳。", { tone: "warn" }));
					if (result.sessionId && result.item?.id) try {
						await api(API.session, {
							method: "POST",
							body: JSON.stringify({
								action: "bind",
								id: result.item.id,
								sessionId: result.sessionId
							})
						});
						if (runIsCurrent(run)) push(stationMessage("已把这个会话关联到本流程。"));
					} catch (error) {
						if (runIsCurrent(run)) push(stationMessage(`流程已建好，但会话关联失败：${errorText(error)}。可在「流程」详情里手动重试。`, { tone: "danger" }));
					}
					if (runIsCurrent(run)) {
						resetFlow();
						if (result.item?.id) onFlowStarted?.(result.item.id);
					}
					onFlowsChanged?.();
				} catch (err) {
					if (runIsCurrent(run)) {
						push(stationMessage(`创建失败：${errorText(err)}。若流程已经建立，请到「流程」页继续；也可以改一下描述重新探测。`, { tone: "danger" }));
						resetFlow();
					}
					onFlowsChanged?.();
				} finally {
					finishRun(run, key);
				}
			}
			/** 回到范围确认：改完文件/范围或追问答案后重新生成计划。 */
			function adjustScope() {
				if (busy) return;
				setPhase(PHASE.confirm);
				push(stationMessage("已回到范围确认：改完文件/范围或追问答案后，重新点「继续，生成计划」。"));
			}
			function onKeyDown(event) {
				if (event.key !== "Enter" || event.shiftKey) return;
				if (event.nativeEvent?.isComposing) return;
				event.preventDefault();
				send();
			}
			const scopeLabel = scope === "new" ? "新建开发流程" : scopeTitle || scope;
			clarifyBusy || phase === PHASE.analyzing || phase === PHASE.planning || phase === PHASE.creating || phase === PHASE.confirm || PHASE.plan;
			const sendLabel = clarifyBusy ? "澄清中…" : phase === PHASE.analyzing ? "正在扫描…" : phase === PHASE.planning ? "正在生成计划…" : phase === PHASE.creating ? "正在创建…" : "发送";
			/** 相邻且内容完全相同的用户消息只显示一条（历史遗留的重复提交气泡）。 */
			function visibleMessages() {
				return messages.filter((msg, index) => {
					if (msg?.role !== "user") return true;
					const prev = messages[index - 1];
					return !(prev?.role === "user" && String(prev.text ?? "") === String(msg.text ?? ""));
				});
			}
			function renderBody() {
				if (loadingState && !state && !stateError) return h("div", { style: { padding: "16px 18px" } }, h("div", { style: styles.smallMuted }, "正在读取工作站状态…"));
				if (stateError) return h("div", { style: { padding: "16px 18px" } }, h("div", { style: styles.dangerCard }, h("div", { style: { fontWeight: 600 } }, "读取工作站状态失败"), h("div", null, stateError)), h("div", { style: {
					...styles.row,
					marginTop: 10
				} }, h(Button, {
					onClick: loadState,
					children: "重试"
				})));
				if (setupRequired) return h("div", { style: { padding: "16px 18px" } }, h("div", { style: styles.warnCard }, h("div", { style: { fontWeight: 600 } }, "请先在“流程”页完成代码库初始化"), h("div", { style: { marginTop: 4 } }, "工作站需要一个代码库路径才能扫仓库、建流程和开启开发会话。")), h("div", { style: {
					...styles.row,
					marginTop: 10
				} }, h(Button, {
					primary: true,
					onClick: () => onRequireSetup?.(),
					children: "去“流程”页初始化"
				})));
				return h("div", {
					style: S.body,
					ref: bodyRef,
					onScroll: onBodyScroll
				}, h("div", { style: S.canvas }, messages.length ? visibleMessages().map((msg) => h(MessageRow, {
					key: msg.id,
					msg,
					live: Boolean(pending && pending.messageId === msg.id && phase === PHASE.confirm && !msg.resolved),
					questionsLive: Boolean(pending && pending.questionsId === msg.id && (phase === PHASE.confirm || phase === PHASE.planning)),
					planLive: Boolean(pendingPlan && pendingPlan.id === msg.id && (phase === PHASE.plan || phase === PHASE.creating)),
					selectedFiles,
					scopeList,
					answers,
					busy,
					hasQuestions: Boolean(pending?.questionsId),
					onToggleFile: toggleFile,
					onToggleScope: toggleScope,
					onAddScope: addScope,
					onRemoveScope: removeScope,
					onReDescribe: reDescribe,
					onAnswer: setAnswer,
					onGeneratePlan: continueToPlan,
					onStartPlan: startPlanned,
					onAdjustScope: adjustScope,
					syncBeforeStart,
					onSyncBeforeStartChange: setSyncBeforeStart,
					clarifyBusy,
					clarifyTitle,
					onClarifyTitleChange: (value) => {
						setTitleTouched(true);
						setClarifyTitle(value);
					},
					onClarifyPick: setClarifyAnswer,
					onClarifySubmit: submitClarify,
					onClarifyContinue: continueClarify
				})) : h("div", null, h(EmptyState, {
					icon: "◈",
					title: "说说你要做什么",
					hint: "我会自己扫一遍仓库，列出可能要改的文件与命中行；不懂的地方会问你几个问题（可以跳过）。"
				}), h("div", { style: {
					...styles.card,
					marginTop: 12
				} }, h("div", { style: styles.sectionTitle }, "我会怎么推进"), h("div", { style: {
					marginTop: 8,
					color: T.text3,
					fontSize: T.font.sm,
					lineHeight: T.line
				} }, "1. 扫描仓库，给出候选文件与命中行；2. 不懂的地方向你追问；3. 自己出计划（规模/人天/步骤/验收，附依据）；4. 你确认后建流程并开启开发会话。"), h("div", { style: {
					marginTop: 8,
					color: T.text4,
					fontSize: T.font.sm
				} }, "例如：把关卡状态回传从同步改成异步，解决连接池被远端 IO 占满的问题。"))), progress ? h("div", { style: {
					...S.stationRow,
					marginTop: 2
				} }, h(IconSeat, { size: 28 }, "◈"), h("div", { style: S.stationBody }, h("div", { style: S.stationName }, "开发工作站"), h("div", { style: {
					...S.stationCard,
					display: "flex",
					alignItems: "center",
					gap: 10
				} }, h("span", { style: {
					display: "inline-flex",
					gap: 3,
					color: T.brand
				} }, h("span", { className: "devhub-typing-dot" }), h("span", { className: "devhub-typing-dot" }), h("span", { className: "devhub-typing-dot" })), h("span", { style: {
					color: T.text2,
					fontSize: T.font.sm
				} }, progress.label), h("span", { style: {
					...styles.mono,
					color: T.text4,
					fontSize: T.font.xs
				} }, `${progress.seconds}s`)))) : null, h("div", { ref: endRef })));
			}
			/** 右侧详情：候选文件、计划、已澄清规格；随讨论更新。 */
			function renderSide() {
				const recon = pending?.recon ?? null;
				const files = Array.isArray(recon?.files) ? recon.files : [];
				const members = reconMembers(recon);
				const shownGroups = groupReconFiles(files.slice(0, 12));
				const plan = pendingPlan?.plan ?? null;
				const spec = clarify?.spec ?? {};
				const box = {
					display: "flex",
					flexDirection: "column",
					gap: 6,
					paddingBottom: 10,
					borderBottom: `1px solid ${T.borderSoft}`
				};
				return h("div", { style: { ...S.side } }, h("div", { style: { ...styles.row } }, h("span", { style: styles.sectionTitle }, "本次详情"), h("div", { style: styles.spacer }), h("span", {
					style: {
						...styles.smallMuted,
						cursor: "pointer"
					},
					onClick: () => setSideOpen(false)
				}, "收起 ▸")), rescanNote ? h("div", { style: {
					...styles.smallMuted,
					color: T.brand
				} }, rescanNote) : null, members.length ? h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 1
				} }, members.map((member, index) => h("div", {
					key: member.repo ?? member.name ?? index,
					style: {
						display: "flex",
						alignItems: "center",
						gap: 6,
						fontSize: T.font.xs,
						color: member.error ? T.danger : T.text4
					}
				}, h(Pill, { tone: member.error ? "warn" : "ok" }, member.error ? "失败" : `${Number(member.files) || 0} 候选`), h("span", { style: {
					fontWeight: 500,
					color: T.text2
				} }, member.name ?? repoBaseName(member.repo) ?? "成员库"), member.error ? h("span", { style: { ...styles.smallDanger } }, member.error) : null))) : null, h("div", { style: box }, h("div", { style: styles.row }, h("span", { style: styles.sectionTitle }, `候选文件 ${files.length ? `(${files.length})` : ""}`), h("div", { style: styles.spacer }), h(Button, {
					style: {
						height: 24,
						padding: "0 8px"
					},
					disabled: rescanBusy,
					onClick: rescan,
					children: rescanBusy ? "扫描中…" : "重新扫描"
				})), files.length ? shownGroups.map(([repo, list]) => h("div", {
					key: repo || "__single__",
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 1,
						marginTop: repo ? 3 : 0
					}
				}, repo ? h("span", { style: {
					...styles.smallMuted,
					fontWeight: 600,
					color: T.text2
				} }, `${repo}（${list.length}）`) : null, list.map((file) => h("div", {
					key: `${repo}:${file.path}`,
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 1
					}
				}, h("span", { style: {
					...styles.mono,
					fontSize: T.font.xs,
					color: T.text2,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				} }, String(file?.displayPath ?? file?.path ?? "")), file.why ? h("span", { style: {
					fontSize: 11,
					color: T.text4
				} }, file.why) : null)))) : h("div", { style: styles.sectionHint }, "还没有候选文件：先发一句需求，或点「重新扫描」")), plan ? h("div", { style: box }, h("span", { style: styles.sectionTitle }, "计划"), h("span", { style: { ...styles.smallMuted } }, `${(plan.steps ?? []).length} 步 · ${plan.estimate?.size ?? "?"} / ${plan.estimate?.days ?? "?"} 人日`), (plan.steps ?? []).slice(0, 8).map((step, index) => h("div", {
					key: `${index}-${step}`,
					style: {
						fontSize: T.font.xs,
						color: T.text3,
						lineHeight: 1.5
					}
				}, `${index + 1}. ${step}`))) : null, spec?.problem || (spec?.acceptance ?? []).length ? h("div", { style: {
					...box,
					borderBottom: "none",
					paddingBottom: 0
				} }, h("span", { style: styles.sectionTitle }, "已澄清"), spec.problem ? h("div", { style: {
					fontSize: T.font.xs,
					color: T.text3,
					lineHeight: 1.5
				} }, `问题：${spec.problem}`) : null, (spec.acceptance ?? []).length ? h("div", { style: {
					fontSize: T.font.xs,
					color: T.text3,
					lineHeight: 1.5
				} }, `验收：${spec.acceptance.join("；")}`) : null) : null);
			}
			return h("div", { style: S.root }, h("div", { style: S.row }, h("div", { style: S.chatCol }, renderBody(), setupRequired || stateError || loadingState && !state ? null : h("div", { style: S.footer }, h("div", { style: S.composer }, phase === PHASE.confirm && pending ? h("div", { style: {
				display: "flex",
				gap: 6,
				flexWrap: "wrap",
				marginBottom: 6
			} }, h(Button, {
				primary: true,
				disabled: busy,
				onClick: continueToPlan,
				children: "继续，生成计划"
			}), h(Button, {
				disabled: busy,
				onClick: reDescribe,
				children: "重新描述"
			})) : phase === PHASE.plan && pendingPlan ? h("div", { style: {
				display: "flex",
				gap: 6,
				flexWrap: "wrap",
				marginBottom: 6
			} }, h(Button, {
				primary: true,
				disabled: busy,
				onClick: startPlanned,
				children: "确认开工"
			}), h(Button, {
				disabled: busy,
				onClick: adjustScope,
				children: "再调整范围"
			})) : null, attachments.length || attachError || capabilities && capabilities.images?.supported === false ? h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 4,
				marginBottom: 6
			} }, attachments.length ? h("div", { style: {
				display: "flex",
				gap: 6,
				flexWrap: "wrap"
			} }, attachments.map((entry) => h("span", {
				key: entry.id,
				title: entry.path,
				style: {
					...styles.pill,
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
					maxWidth: "100%",
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				}
			}, `${isImageAttachment(entry) ? "🖼" : "📄"} ${attachmentLabel(entry)}`, h("span", {
				style: {
					cursor: "pointer",
					color: T.text4,
					flex: "0 0 auto"
				},
				onClick: () => removeAttachment(entry.id),
				title: "移除"
			}, "×")))) : null, attachments.length ? h("div", { style: styles.sectionHint }, "发送后工作站会把路径交给 dsh：图片用 read_image 读取；模型不支持图片时会明确提示。") : null, attachBusy ? h("span", { style: styles.sectionHint }, "附件上传中…") : null, attachError ? h("div", { style: styles.smallDanger }, attachError) : null, capabilities && capabilities.images?.supported === false ? h("div", { style: styles.sectionHint }, `当前模型不支持图片输入（${capabilities.images.reason ?? "模型未声明图片能力"}）；日志/代码等文件仍可粘贴或引用。`) : null) : null, h("textarea", {
				ref: inputRef,
				onPaste: onPasteFiles,
				onDragOver: (event) => {
					if (Array.from(event.dataTransfer?.files ?? []).length) event.preventDefault();
				},
				onDrop: onDropFiles,
				style: {
					...styles.textarea,
					minHeight: 56,
					maxHeight: 200,
					border: "none",
					boxShadow: "none",
					background: "transparent",
					padding: "0 2px",
					fontSize: T.font.base,
					lineHeight: 1.6,
					resize: "none"
				},
				placeholder: clarifyBusy ? "澄清进行中…（完成后会直接出下一轮问题或规格）" : phase === PHASE.confirm ? "请先确认上面的文件/范围与追问，再点「继续，生成计划」" : phase === PHASE.plan ? "计划已生成：请确认开工，或点「再调整范围」" : phase === PHASE.planning ? "正在生成计划…" : "说一句你要做什么（Enter 发送，Shift+Enter 换行）",
				value: input,
				disabled: locked,
				onChange: (event) => setInput(event.target.value),
				onKeyDown
			}), h("div", { style: {
				...styles.row,
				justifyContent: "space-between",
				alignItems: "flex-end"
			} }, h("span", { style: {
				display: "inline-flex",
				alignItems: "center",
				gap: 8,
				minWidth: 0
			} }, h("span", { style: {
				...styles.smallMuted,
				fontSize: 11,
				color: T.text4,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			} }, `${state?.repo?.name ?? ""} · ${scope === "new" ? "新建开发流程" : scopeLabel}`), sideOpen ? null : h("span", {
				style: {
					fontSize: 11,
					color: T.brand,
					cursor: "pointer"
				},
				onClick: () => setSideOpen(true)
			}, "详情 ▸")), h("div", { style: styles.row }, h("input", {
				ref: attachInputRef,
				type: "file",
				multiple: true,
				style: { display: "none" },
				onChange: (event) => {
					addFiles(event.target.files);
					event.target.value = "";
				}
			}), h(Button, {
				disabled: locked || attachBusy,
				title: imageInputSupported ? "粘贴截图，或选择日志/代码文件作为需求输入" : "当前模型不支持图片；可引用日志/代码文件",
				onClick: () => attachInputRef.current?.click(),
				children: attachBusy ? "上传中…" : "引用文件/图片"
			}), chats.length ? h("div", { style: { position: "relative" } }, h(Button, {
				onClick: () => setHistoryOpen((value) => !value),
				disabled: busy,
				children: "历史对话 ▾"
			}), historyOpen ? h("div", { style: {
				position: "absolute",
				bottom: 34,
				right: 0,
				zIndex: 10001,
				width: 320,
				maxHeight: 300,
				overflow: "auto",
				padding: 8,
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rLg,
				background: T.surface,
				boxShadow: T.shadowModal
			} }, h("div", { style: {
				...styles.sectionHint,
				padding: "4px 6px"
			} }, `${state?.repo?.name ?? "当前仓库"} · ${chats.length} 段对话`), chats.map((chat) => h("button", {
				key: chat.id,
				type: "button",
				onClick: () => openChat(chat.id),
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 2,
					width: "100%",
					textAlign: "left",
					padding: "8px 8px",
					border: "none",
					borderRadius: T.rSm,
					background: chat.id === activeChatId ? T.brandSoft : "transparent",
					color: chat.id === activeChatId ? T.brand : T.text2,
					cursor: "pointer",
					fontFamily: "inherit",
					fontSize: T.font.sm
				}
			}, h("span", { style: {
				fontWeight: chat.id === activeChatId ? 600 : 500,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			} }, chat.title), h("span", { style: {
				fontSize: T.font.xs,
				color: T.text4
			} }, `${chat.messageCount} 条 · ${fmtTime(chat.updatedAt)}`)))) : null) : null, h(Button, {
				onClick: beginNewChat,
				disabled: busy,
				children: "新对话"
			}), h(Button, {
				primary: true,
				disabled: locked || !input.trim(),
				onClick: send,
				children: sendLabel
			})))))), sideOpen ? renderSide() : null));
		}
		//#endregion
		//#region src/client/home.mjs
		/**
		* dsh-dev-hub 浏览器半 —— 开发站首页。
		*
		* 取舍（用户反馈「流程那部分还是有点重、复杂」）：
		* - 不再用卡片网格平铺流程，改成**一条一行**的列表：标题/状态/阶段/流程进度/scope 摘要/更新时间
		*   都压在同一行里，行高 ≥52、整行可点、hover 只给浅底，扫一眼就能比较；
		* - 并行开发默认折叠成一行摘要（「N 个进行中 · 无冲突」），展开才看 active / pairs / advice；
		*   有冲突时用家族规范的 warn 左 3px 边线块提示，不抢列表的注意力；
		* - 顶部项目条只放项目身份与全局动作，`刷新`/`快速新建`这类列表级动作留在列表头。
		*
		* 数据形状保持与既有 Host 契约一致：
		* GET API.items / GET API.state 的 items 摘要（title/status/stage/进度/scope/updatedAt/session），
		* GET API.parallel 的 active / pairs / canParallel / advice；
		* 会话状态由 Panel 每 5 秒 GET API.sessions 后按 itemId 建 Map 下发（本文件只做展示，不请求）。
		* 点击一行由 index.mjs 打开详情。
		*/
		/** 次要动作统一缩一号，避免顶部一排按钮比内容还抢眼。 */
		const miniButton$1 = {
			height: 28,
			padding: "0 10px",
			fontSize: T.font.sm
		};
		/** 代码库卡与「新增开发目标」卡统一高度，让同一行网格对齐、不再一高一矮。 */
		const GRID_CARD_MIN_HEIGHT = 120;
		function stageText(stage) {
			if (!stage) return "未开始";
			return STAGE_LABELS[stage] ?? stage;
		}
		/**
		* 「开发任务完成 ≠ 流程完成」：按阶段与测试事实算流程还差哪一步。
		* 列表用它解释"任务 9/9 但还在验证中"的落差，避免满格绿色进度条被当成已完成。
		* @returns {string|null} null 表示流程已完成
		*/
		function pendingFlowStep(item) {
			if (!item) return null;
			if (item.status === "done" || item.stage === "done") return null;
			if (item.status === "blocked") return "流程被阻塞";
			const stage = item.stage ?? "discovery";
			const local = item.testState ?? "not_run";
			const env = item.environmentTestState ?? "not_run";
			const review = item.reviewState ?? "idle";
			const isAnalysis = item.intent === "analysis";
			if (stage === "discovery" || stage === "techdoc" || stage === "plan") return "还没进入开发";
			if (stage === "develop") {
				if (review === "failed") return "评审未通过，待纠偏";
				return isAnalysis ? "只读分析中，未出结论" : "开发中，未验证";
			}
			if (stage === "review") {
				if (review === "failed") return "评审未通过，待纠偏";
				if (review === "error") return "评审异常待处理";
				if (review === "pending") return "独立评审进行中";
				return local !== "passed" ? "还差本机自测" : "继续推进即开始评审";
			}
			if (stage === "verify") {
				if (isAnalysis) return local !== "passed" ? "还差本机自测" : "结论待回写";
				return local !== "passed" ? "还差本机自测" : env !== "passed" ? "还差环境测试" : "待提交";
			}
			if (stage === "submit") return isAnalysis ? "分析流程不进入提交" : "待提交";
			return null;
		}
		/**
		* 列表行的「报告」快捷入口：整行点击是进详情，这里只在新标签打开完整报告。
		* 报告页签在详情里也能看，但列表入口省掉“先进详情再找页签”的一步。
		*/
		function reportHtmlUrl(itemId) {
			return `${API.report}?id=${encodeURIComponent(itemId)}&format=html`;
		}
		function openReportHtml(itemId) {
			if (typeof window === "undefined" || typeof window.open !== "function") return;
			try {
				window.open(reportHtmlUrl(itemId), "_blank", "noopener");
			} catch {}
		}
		/**
		* 会话状态 → 家族色 Tag。
		* Host 的 sessionState 在会话不在当前进程时返回 alive:false；还没读到状态时
		* 用 alive:null 表示「读取中」，不把未知状态伪装成运行中或已结束。
		*/
		function sessionBadgeState(session) {
			if (!session || session.alive === null || session.alive === void 0) return {
				tone: "neutral",
				label: "状态读取中"
			};
			if (session.running) return {
				tone: "ok",
				label: "会话运行中"
			};
			if (session.alive) return {
				tone: "neutral",
				label: "会话空闲"
			};
			return {
				tone: "warn",
				label: "会话已结束"
			};
		}
		/** 列表/详情共用的会话状态 Tag，避免两处各写一套颜色。运行中必须带转圈，不能只是静态标签。 */
		function SessionBadge({ session }) {
			const badge = sessionBadgeState(session);
			const running = Boolean(session?.running);
			return h(Tag, {
				tone: badge.tone,
				style: running ? {
					gap: 5,
					paddingLeft: 6
				} : void 0
			}, running ? h(Spinner, {
				key: "spin",
				size: 9,
				tone: "ok",
				title: "开发会话正在运行"
			}) : null, badge.label);
		}
		/** 最近活动：优先用 Host 的 idleSeconds（秒），没有就按 lastEventAt 现算；只显示相对时间。 */
		function sessionActivity(session) {
			if (!session) return "—";
			let idle = Number(session.idleSeconds);
			if (!Number.isFinite(idle) && session.lastEventAt) idle = Math.max(0, Math.round((Date.now() - Number(session.lastEventAt)) / 1e3));
			if (!Number.isFinite(idle)) return "暂无活动";
			if (idle < 60) return "刚刚";
			if (idle < 3600) return `${Math.floor(idle / 60)} 分钟前`;
			return `${Math.floor(idle / 3600)} 小时前`;
		}
		const SESSION_STAGE_TEXT = {
			idle: "等待中",
			turn: "本轮对话",
			step: "思考步骤",
			tool: "调用工具",
			assistant: "输出回答",
			ended: "已结束"
		};
		function sessionStageText(stage) {
			if (!stage) return "";
			return SESSION_STAGE_TEXT[stage] ?? stage;
		}
		/** 列表里按 itemId 取会话状态；已绑定但 /sessions 还没回来时给一个 pending 占位。 */
		function sessionForItem(sessionStates, item) {
			const live = sessionStates?.get?.(item?.id);
			if (live) return live;
			if (!item?.session?.id) return null;
			return {
				sessionId: item.session.id,
				boundAt: item.session.boundAt ?? null,
				alive: null,
				pending: true
			};
		}
		/** scope + scopeModules 合并去重；列表里只展示 2 个，其余折成 +N。 */
		function scopeTokens(item) {
			return [...new Set([...item?.scope ?? [], ...item?.scopeModules ?? []].map(String).filter(Boolean))];
		}
		function ScopeChips({ tokens }) {
			if (!tokens.length) return h("span", { style: styles.sectionHint }, "未标注 scope");
			return h("span", { style: {
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				flexWrap: "wrap"
			} }, tokens.slice(0, 2).map((token) => h(Tag, { key: token }, scopeTokenLabel(token))), tokens.length > 2 ? h(Tag, { tone: "neutral" }, `+${tokens.length - 2}`) : null);
		}
		/** 一个已有代码库＝一张卡：选中用品牌紫边 + 淡底 + 对勾，点一下就切换。 */
		/**
		* 末尾的虚线卡：把「新增代码库」和「新建虚拟库」合并成一个入口，避免同屏两个
		* 含义相近的按钮让用户分不清该点哪个。两个动作仍各自保留明确文案。
		*/
		function AddTargetCard({ busy, onAddRepo, onAddWorkspace }) {
			return h("div", { style: {
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				gap: 8,
				minWidth: 0,
				minHeight: GRID_CARD_MIN_HEIGHT,
				boxSizing: "border-box",
				padding: "10px 12px",
				border: `1px dashed ${T.border}`,
				borderRadius: T.rLg,
				background: "transparent",
				color: T.text4,
				transition: T.transition
			} }, h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 10,
				minWidth: 0
			} }, h(IconSeat, {
				size: 26,
				tone: "neutral"
			}, "+"), h("span", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 2,
				minWidth: 0
			} }, h("span", { style: {
				fontSize: T.font.base,
				fontWeight: 500,
				color: T.text2
			} }, "新增开发目标"), h("span", { style: {
				fontSize: T.font.xs,
				color: T.text4
			} }, "单个代码库，或前后端多库组合"))), h("div", { style: {
				display: "flex",
				gap: 6,
				width: "100%"
			} }, h(Button, {
				style: {
					...miniButton$1,
					flex: "1 1 0",
					minWidth: 0,
					padding: "0 6px"
				},
				disabled: Boolean(busy),
				onClick: onAddRepo,
				children: "+ 新增代码库"
			}), h(Button, {
				style: {
					...miniButton$1,
					flex: "1 1 0",
					minWidth: 0,
					padding: "0 6px"
				},
				disabled: Boolean(busy),
				onClick: onAddWorkspace,
				children: "▣ 新建虚拟库"
			})));
		}
		function RepoCard({ path, name: givenName, exists = true, active, busy, isRepo, branch, head, initialized, workspaces, onSelect, onRemove }) {
			const name = givenName || String(path ?? "").split("/").filter(Boolean).pop() || path;
			const [hovered, setHovered] = (0, react.useState)(false);
			const workspaceNames = (Array.isArray(workspaces) ? workspaces : []).filter(Boolean);
			const gitText = !exists ? "路径不存在，不能切换" : busy ? "正在切换…" : isRepo === false ? "非 git 仓库" : branch ? `${branch}${head ? `@${head}` : ""}` : "本地代码库";
			const hint = !exists ? "已失效" : active ? "当前开发目标" : initialized === false ? "尚未初始化 .dev-hub" : "点击切换";
			return h("div", {
				style: {
					position: "relative",
					minWidth: 0
				},
				onMouseEnter: () => setHovered(true),
				onMouseLeave: () => setHovered(false)
			}, h("button", {
				type: "button",
				title: [
					!exists ? `路径已不存在：${path}（可点右上角 × 移除）` : active ? `当前代码库：${path}` : busy ? "正在切换…" : `切换到 ${path}`,
					branch ? `分支 ${branch}${head ? `@${head}` : ""}` : exists && isRepo === false ? "不是 git 仓库" : "",
					workspaceNames.length ? `虚拟库：${workspaceNames.join("、")}` : ""
				].filter(Boolean).join("\n"),
				disabled: Boolean(busy) || !exists,
				"aria-pressed": active,
				onClick: () => onSelect?.(path),
				style: {
					display: "flex",
					flexDirection: "column",
					alignItems: "stretch",
					justifyContent: "space-between",
					gap: 8,
					width: "100%",
					minWidth: 0,
					minHeight: GRID_CARD_MIN_HEIGHT,
					boxSizing: "border-box",
					padding: "10px 12px",
					textAlign: "left",
					border: `1px solid ${!exists ? T.danger : active ? T.brandBorder : T.borderSoft}`,
					borderRadius: T.rLg,
					background: !exists ? T.dangerSoft : active ? T.brandSoft : T.surface,
					boxShadow: active ? `0 0 0 2px rgba(96,73,231,.10)` : T.shadowCard,
					cursor: !exists ? "not-allowed" : busy ? "progress" : active ? "default" : "pointer",
					opacity: busy ? .75 : 1,
					fontFamily: "inherit",
					transition: T.transition
				}
			}, h("div", { style: {
				display: "flex",
				alignItems: "flex-start",
				gap: 10,
				minWidth: 0
			} }, h(IconSeat, {
				size: 26,
				tone: active ? "accent" : "neutral"
			}, !exists ? "!" : active ? "✓" : "◈"), h("span", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 3,
				minWidth: 0,
				flex: "1 1 auto"
			} }, h("span", { style: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				minWidth: 0
			} }, h("span", { style: {
				fontSize: T.font.base,
				fontWeight: active ? 600 : 500,
				color: !exists ? T.danger : active ? T.brand : T.text,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				minWidth: 0
			} }, name), !exists ? h(Tag, { tone: "danger" }, "路径不存在") : active ? h(Tag, { tone: "accent" }, "当前") : busy ? h(Tag, { tone: "neutral" }, "切换中…") : null), h("span", {
				title: path,
				style: {
					...styles.mono,
					fontSize: T.font.xs,
					lineHeight: 1.45,
					color: T.text4,
					display: "-webkit-box",
					WebkitLineClamp: 2,
					WebkitBoxOrient: "vertical",
					overflow: "hidden",
					wordBreak: "break-all",
					whiteSpace: "normal"
				}
			}, path))), h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				minWidth: 0,
				paddingTop: 6,
				borderTop: `1px solid ${exists ? T.borderSoft : T.danger}`
			} }, h("span", {
				title: branch ? `分支 ${branch}${head ? ` @ ${head}` : ""}` : "",
				style: {
					...styles.mono,
					fontSize: T.font.xs,
					color: !exists ? T.danger : T.text4,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
					flex: "1 1 auto",
					minWidth: 0
				}
			}, gitText), h("span", { style: {
				fontSize: T.font.xs,
				color: active ? T.brand : T.text4,
				whiteSpace: "nowrap",
				flex: "0 0 auto"
			} }, hint))), hovered && !busy ? h("button", {
				type: "button",
				title: "从列表移除这个代码库（不动磁盘文件）",
				onClick: (event) => {
					event.stopPropagation();
					onRemove?.(path);
				},
				style: {
					position: "absolute",
					top: -6,
					right: -6,
					width: 18,
					height: 18,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					border: `1px solid ${T.danger}`,
					borderRadius: 999,
					background: T.surface,
					color: T.danger,
					fontSize: 11,
					lineHeight: 1,
					cursor: "pointer",
					boxShadow: T.shadowCard,
					fontFamily: "inherit"
				}
			}, "×") : null);
		}
		/**
		* 成员库展示数据：优先用 Host 的 `workspace.members`（带 exists / branch / head /
		* initialized），旧响应只有 `repos` 路径时按目录名兜底，不把信息藏起来。
		* 没有主库：成员库平权，顺序只影响展示，不代表归属。
		*/
		function workspaceMembersView(workspace) {
			const repos = Array.isArray(workspace?.repos) ? workspace.repos : [];
			const detail = Array.isArray(workspace?.members) ? workspace.members : [];
			if (detail.length) return detail.map((member, index) => {
				const path = String(member?.path ?? member?.repo ?? "");
				return {
					path,
					name: member?.name || repoBaseName(path) || `成员库 ${index + 1}`,
					exists: member?.exists !== false,
					isRepo: member?.isRepo,
					initialized: member?.initialized,
					branch: member?.branch || null,
					head: member?.head || null
				};
			});
			return repos.map((entry) => {
				const path = String(entry ?? "");
				return {
					path,
					name: repoBaseName(path),
					exists: true,
					isRepo: void 0,
					initialized: void 0,
					branch: null,
					head: null
				};
			});
		}
		/** 一张虚拟库卡：和代码库卡同高同结构，用 ▣ 图标区分；hover 右上角 × 只从本机移除。 */
		function WorkspaceCard({ workspace, active, busy, onSelect, onEdit, onRemove }) {
			const [hovered, setHovered] = (0, react.useState)(false);
			const members = workspaceMembersView(workspace);
			const missing = members.filter((member) => !member.exists);
			const memberNames = members.map((member) => member.name).join(" · ");
			const memberTitle = members.map((member) => {
				const git = member.branch ? `${member.branch}${member.head ? `@${String(member.head).slice(0, 7)}` : ""}` : "";
				return [
					member.name,
					"成员库",
					git,
					member.path,
					member.exists === false ? "路径不存在" : ""
				].filter(Boolean).join(" · ");
			}).join("\n");
			const hint = !members.length ? "未登记成员库" : active ? "当前开发目标" : "点击切换";
			return h("div", {
				style: {
					position: "relative",
					minWidth: 0
				},
				onMouseEnter: () => setHovered(true),
				onMouseLeave: () => setHovered(false)
			}, h("button", {
				type: "button",
				"aria-pressed": active,
				disabled: Boolean(busy),
				title: [
					`切换到虚拟库「${workspace?.name ?? "未命名"}」：${members.length} 个成员库`,
					memberTitle,
					missing.length ? `${missing.length} 个成员库路径不存在` : ""
				].filter(Boolean).join("\n"),
				onClick: () => onSelect?.(workspace.id),
				style: {
					display: "flex",
					flexDirection: "column",
					alignItems: "stretch",
					justifyContent: "space-between",
					gap: 8,
					width: "100%",
					minWidth: 0,
					minHeight: GRID_CARD_MIN_HEIGHT,
					boxSizing: "border-box",
					padding: "10px 12px",
					textAlign: "left",
					border: `1px solid ${active ? T.brandBorder : T.borderSoft}`,
					borderRadius: T.rLg,
					background: active ? T.brandSoft : T.surface2,
					boxShadow: active ? `0 0 0 2px rgba(96,73,231,.10)` : T.shadowCard,
					cursor: busy ? "progress" : active ? "default" : "pointer",
					fontFamily: "inherit",
					transition: T.transition
				}
			}, h("div", { style: {
				display: "flex",
				alignItems: "flex-start",
				gap: 10,
				minWidth: 0
			} }, h(IconSeat, {
				size: 26,
				tone: "accent"
			}, "▣"), h("span", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 3,
				minWidth: 0,
				flex: "1 1 auto"
			} }, h("span", { style: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				minWidth: 0
			} }, h("span", { style: {
				fontSize: T.font.base,
				fontWeight: active ? 600 : 500,
				color: active ? T.brand : T.text,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				minWidth: 0
			} }, workspace?.name ?? "未命名虚拟库"), active ? h(Tag, { tone: "accent" }, "当前") : null, missing.length ? h(Tag, { tone: "danger" }, "缺失") : null), h("span", { style: {
				display: "flex",
				alignItems: "center",
				gap: 4,
				fontSize: T.font.xs,
				color: T.text4,
				minWidth: 0
			} }, h("span", null, "多代码库组合"), h("span", { style: { color: T.border } }, "·"), h("span", null, `${members.length} 个成员库`)))), h("span", {
				title: memberTitle,
				style: {
					...styles.mono,
					fontSize: T.font.xs,
					lineHeight: 1.45,
					color: missing.length ? T.danger : T.text3,
					display: "-webkit-box",
					WebkitLineClamp: 2,
					WebkitBoxOrient: "vertical",
					overflow: "hidden",
					wordBreak: "break-all",
					whiteSpace: "normal"
				}
			}, `成员库：${memberNames || "未登记"}`), h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				minWidth: 0,
				paddingTop: 6,
				borderTop: `1px solid ${missing.length ? T.danger : T.borderSoft}`
			} }, h("span", { style: {
				fontSize: T.font.xs,
				color: missing.length ? T.danger : T.text4,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				flex: "1 1 auto",
				minWidth: 0
			} }, missing.length ? `成员库（${members.length}）· ${missing.length} 个成员库路径不存在` : `成员库（${members.length}）· 本机台账`), h("span", { style: {
				fontSize: T.font.xs,
				color: active ? T.brand : T.text4,
				whiteSpace: "nowrap",
				flex: "0 0 auto"
			} }, hint))), hovered && !busy ? h("div", { style: {
				position: "absolute",
				top: -6,
				right: -6,
				display: "flex",
				gap: 4
			} }, h("button", {
				type: "button",
				title: "编辑这个虚拟库：改名、增删成员库（成员库平权，任意成员都可移除/替换）",
				onClick: (event) => {
					event.stopPropagation();
					onEdit?.(workspace);
				},
				style: {
					width: 18,
					height: 18,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					border: `1px solid ${T.brandBorder}`,
					borderRadius: 999,
					background: T.surface,
					color: T.brand,
					fontSize: 10,
					lineHeight: 1,
					cursor: "pointer",
					boxShadow: T.shadowCard,
					fontFamily: "inherit"
				}
			}, "✎"), h("button", {
				type: "button",
				title: "从本机移除这个虚拟库（不动成员库代码与流程台账）",
				onClick: (event) => {
					event.stopPropagation();
					onRemove?.(workspace);
				},
				style: {
					width: 18,
					height: 18,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					border: `1px solid ${T.danger}`,
					borderRadius: 999,
					background: T.surface,
					color: T.danger,
					fontSize: 11,
					lineHeight: 1,
					cursor: "pointer",
					boxShadow: T.shadowCard,
					fontFamily: "inherit"
				}
			}, "×")) : null);
		}
		/** 顶部项目条：当前库 + 成员 + 全局动作；下方是虚拟库/代码库卡片，点卡片即切换。 */
		function ProjectBar({ repo, member, repos, workspaces, activeWorkspace, switchingRepo, onRefresh, onSelectRepo, onAddRepo, onScan, onNewFlow, onRemoveRepo, onSelectWorkspace, onEditWorkspace, onRemoveWorkspace, onNewWorkspace }) {
			const members = workspaceMembersView(activeWorkspace);
			const memberCount = activeWorkspace ? members.length : 0;
			const localPath = activeWorkspace?.path ?? activeWorkspace?.localPath ?? null;
			const activeWorkspaceId = activeWorkspace?.id ?? null;
			const workspaceViews = [...workspaces ?? []].map((workspace) => workspace.id === activeWorkspaceId ? {
				...workspace,
				...activeWorkspace
			} : workspace).sort((left, right) => Number(right.id === activeWorkspaceId) - Number(left.id === activeWorkspaceId));
			if (activeWorkspace && !workspaceViews.some((workspace) => workspace.id === activeWorkspace.id)) workspaceViews.unshift(activeWorkspace);
			return h("div", { style: {
				...styles.cardFlat,
				display: "flex",
				flexDirection: "column",
				gap: T.gap.xs
			} }, h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: T.gap.sm,
				flexWrap: "wrap"
			} }, h(IconSeat, { size: 34 }, "◈"), h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 2,
				minWidth: 0,
				flex: "1 1 240px"
			} }, h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				flexWrap: "wrap",
				minWidth: 0
			} }, h("span", {
				style: {
					fontSize: T.font.md,
					fontWeight: 600,
					color: T.text,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				},
				title: activeWorkspace ? `虚拟库「${activeWorkspace.name ?? "未命名"}」：${memberCount} 个成员库平权；台账/规范/上下文/证据写本机 ${localPath ?? "—"}` : repo?.path ?? ""
			}, activeWorkspace ? `虚拟库 · ${activeWorkspace.name ?? "未命名"}` : repo?.name ?? "未选择代码库"), activeWorkspace ? h(Tag, { tone: "accent" }, `${memberCount} 库`) : null, activeWorkspace ? h(Tag, {
				tone: "neutral",
				title: `台账/规范/上下文/证据都在本机独立目录：${localPath ?? "—"}（不写任何成员库）`
			}, "本机台账") : null), h("span", { style: {
				...styles.mono,
				color: T.text4,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			} }, activeWorkspace ? localPath ?? "—" : repo?.path ?? "—")), h(Tag, { tone: "accent" }, `成员 ${member ?? "未命名"}`), h("div", { style: styles.spacer }), h(Button, {
				style: miniButton$1,
				onClick: onScan,
				children: "扫描文档"
			}), h(Button, {
				style: miniButton$1,
				onClick: onRefresh,
				children: "刷新"
			}), h(Button, {
				primary: true,
				onClick: onNewFlow,
				children: "新建流程"
			})), workspaceViews.length || (repos ?? []).length ? h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 4,
				marginTop: 2
			} }, h("span", { style: {
				...styles.sectionHint,
				paddingLeft: 2
			} }, `开发目标（${workspaceViews.length + (repos ?? []).length}）· ▣ 虚拟库 / ◈ 代码库，点卡片切换，末尾新增`), h("div", { style: {
				display: "grid",
				gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
				gap: T.gap.xs
			} }, [
				...workspaceViews.map((workspace) => h(WorkspaceCard, {
					key: workspace.id,
					workspace,
					active: activeWorkspace?.id === workspace.id,
					busy: Boolean(switchingRepo),
					onSelect: onSelectWorkspace,
					onEdit: onEditWorkspace,
					onRemove: onRemoveWorkspace
				})),
				...(repos ?? []).map((entry) => h(RepoCard, {
					key: typeof entry === "string" ? entry : entry.path,
					path: typeof entry === "string" ? entry : entry.path,
					name: typeof entry === "string" ? void 0 : entry.name,
					exists: typeof entry === "string" ? true : entry.exists !== false,
					isRepo: typeof entry === "string" ? void 0 : entry.isRepo,
					branch: typeof entry === "string" ? null : entry.branch,
					head: typeof entry === "string" ? null : entry.head,
					initialized: typeof entry === "string" ? void 0 : entry.initialized,
					workspaces: typeof entry === "string" ? [] : entry.workspaces,
					active: !activeWorkspace && (typeof entry === "string" ? entry : entry.path) === repo?.path,
					busy: (typeof entry === "string" ? entry : entry.path) === switchingRepo,
					onSelect: onSelectRepo,
					onRemove: onRemoveRepo
				})),
				h(AddTargetCard, {
					key: "__add__",
					busy: Boolean(switchingRepo),
					onAddRepo,
					onAddWorkspace: onNewWorkspace
				})
			])) : null);
		}
		/**
		* 一条流程 = 一行。整行可点、hover 浅底、hover 不位移；
		* 进度列固定宽度让多行的数字对齐（tnum），列表直接看流程走到哪一步，而不是任务勾选数。
		*/
		function FlowRow({ item, session, selected, last, onClick, onOpenReport }) {
			const [hovered, setHovered] = (0, react.useState)(false);
			const tokens = scopeTokens(item);
			const flowDone = item?.status === "done" || item?.stage === "done";
			const pending = pendingFlowStep(item);
			const stages = item?.gitRepo === false || item?.intent === "analysis" ? WORKFLOW_STAGES.filter((entry) => entry.id !== "submit") : WORKFLOW_STAGES;
			const stageIndex = stages.findIndex((entry) => entry.id === item?.stage);
			const currentStep = flowDone ? stages.length : stageIndex >= 0 ? stageIndex + 1 : 0;
			const running = Boolean(session?.running ?? item?.running);
			const stageLabel = stageText(item?.stage);
			const showStageTag = stageLabel !== (STATUS_LABELS[item?.status] ?? item?.status ?? "");
			return h("div", {
				role: "button",
				tabIndex: 0,
				title: "点击查看该开发流程详情",
				onClick,
				onMouseEnter: () => setHovered(true),
				onMouseLeave: () => setHovered(false),
				onKeyDown: (event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onClick?.();
					}
				},
				style: {
					display: "flex",
					alignItems: "center",
					gap: T.gap.sm,
					flexWrap: "wrap",
					minHeight: 52,
					padding: "10px 16px 10px 13px",
					borderLeft: `3px solid ${selected ? T.brand : "transparent"}`,
					borderBottom: last ? "none" : `1px solid ${T.borderSoft}`,
					background: selected ? T.brandSoft : hovered ? T.surface2 : "transparent",
					cursor: "pointer",
					transition: T.transition
				}
			}, h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 4,
				minWidth: 200,
				flex: "1 1 280px"
			} }, h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				flexWrap: "wrap"
			} }, h("span", { style: {
				fontWeight: 600,
				fontSize: T.font.base,
				color: T.text
			} }, item?.title || item?.id || "未命名开发流程"), running ? h("span", {
				key: "running",
				title: "开发会话正在工作",
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: 5,
					fontSize: T.font.xs,
					fontWeight: 600,
					color: T.brand
				}
			}, h(Spinner, {
				size: 10,
				tone: "accent"
			}), "正在开发…") : null, h(StatusPill, { status: item?.status }), showStageTag ? h(Tag, { tone: "neutral" }, stageLabel) : null, item?.intent === "bug" ? h(Tag, { tone: "warn" }, "bug") : item?.intent === "analysis" ? h(Tag, {
				tone: "accent",
				title: "只读分析：结论产出即结束，不进入提交"
			}, "分析") : null, item?.titleNeedsWork ? h(Tag, {
				tone: "warn",
				title: "标题像原始输入或代码片段，进详情可自动生成"
			}, "标题待整理") : null, (item?.repos ?? []).length > 1 ? h(Tag, { tone: "neutral" }, "多库") : null, item?.worktree?.branch ? h(Tag, {
				tone: "accent",
				title: `独立工作区：${item.worktree.branch}`
			}, "独立工作区") : null, item?.attention ? h(Tag, { tone: item.attention.tone ?? "warn" }, item.attention.label) : null), h(ScopeChips, { tokens })), h("div", { style: {
				flex: "0 0 176px",
				minWidth: 132
			} }, h("div", { style: {
				display: "flex",
				alignItems: "baseline",
				justifyContent: "space-between",
				gap: 8,
				fontSize: T.font.xs,
				color: T.text4
			} }, h("span", null, "流程进度"), h("span", {
				style: {
					...styles.num,
					color: T.text2,
					fontWeight: 600
				},
				title: "当前阶段 / 总阶段数"
			}, `${currentStep}/${stages.length}`)), h("div", { style: {
				display: "flex",
				gap: 2,
				marginTop: 4
			} }, stages.map((entry, index) => h("span", {
				key: entry.id,
				title: `${entry.label}${index + 1 < currentStep ? "（已完成）" : index + 1 === currentStep ? "（当前）" : "（未开始）"}`,
				style: {
					flex: "1 1 0",
					height: 4,
					borderRadius: 2,
					background: flowDone ? T.ok : index + 1 < currentStep ? T.brand : index + 1 === currentStep ? T.brandBorder : T.surface2
				}
			}))), h("div", {
				style: {
					marginTop: 3,
					fontSize: T.font.xs,
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
					color: flowDone ? T.ok : pending ? T.warnText : T.text4
				},
				title: flowDone ? "流程已完成" : `当前：${stageText(item?.stage)}；还没完成：${pending ?? "还差测试/提交"}`
			}, flowDone ? "流程已完成" : pending ?? "流程未完成")), h(Button, {
				style: {
					height: 24,
					padding: "0 8px",
					fontSize: T.font.xs
				},
				title: "在新标签打开开发报告（目标背景 / 改动范围 / 测试报告）",
				onClick: (event) => {
					event.stopPropagation();
					(onOpenReport ?? openReportHtml)(item?.id);
				},
				onKeyDown: (event) => event.stopPropagation(),
				children: "报告"
			}), session ? h("div", { style: {
				flex: "0 0 auto",
				display: "flex",
				alignItems: "center",
				gap: 6,
				flexWrap: "wrap"
			} }, h(SessionBadge, { session }), h("span", {
				style: {
					...styles.num,
					fontSize: T.font.xs,
					color: T.text4
				},
				title: "最近活动"
			}, sessionActivity(session))) : null, h("div", { style: {
				...styles.sectionHint,
				flex: "0 0 auto",
				minWidth: 118,
				textAlign: "right"
			} }, fmtTime(item?.updatedAt)));
		}
		function FlowList({ items, selectedId, sessionStates, onOpenItem, onRefresh, onNewFlow, onOpenReport, onFixTitles, fixingTitles = false }) {
			const weakTitleCount = items.filter((entry) => entry?.titleNeedsWork).length;
			return h("div", { style: {
				...styles.cardFlat,
				padding: 0,
				overflow: "hidden"
			} }, h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: T.gap.xs,
				flexWrap: "wrap",
				padding: "10px 16px"
			} }, h("span", { style: styles.sectionTitle }, "开发流程"), h(Tag, { tone: "neutral" }, String(items.length)), h("div", { style: styles.spacer }), weakTitleCount && onFixTitles ? h(Button, {
				style: miniButton$1,
				disabled: fixingTitles,
				title: `${weakTitleCount} 个流程的标题像原始输入/代码片段`,
				onClick: onFixTitles,
				children: fixingTitles ? "整理中…" : `整理标题 ${weakTitleCount}`
			}) : null, h(Button, {
				style: miniButton$1,
				onClick: onRefresh,
				children: "刷新"
			})), h("div", { style: { borderTop: `1px solid ${T.borderSoft}` } }, items.length ? items.map((item, index) => h(FlowRow, {
				key: item.id,
				item,
				session: sessionForItem(sessionStates, item),
				selected: item.id === selectedId,
				last: index === items.length - 1,
				onClick: () => onOpenItem?.(item.id),
				onOpenReport
			})) : h(EmptyState, {
				icon: "✎",
				title: "还没有开发流程",
				hint: "用一段话描述你要做什么：工作站会扫仓库、追问、自评计划，再确认范围。",
				action: h(Button, {
					primary: true,
					onClick: onNewFlow,
					children: "新建开发流程"
				})
			})));
		}
		function PairRow({ pair }) {
			const overlap = pair?.overlap ?? [];
			if (!(overlap.length > 0)) return h("div", { style: {
				...styles.sectionHint,
				padding: "3px 0"
			} }, `${pair?.a ?? "?"} ↔ ${pair?.b ?? "?"} · 无范围重叠`);
			return h("div", { style: styles.warnCard }, h("div", { style: { fontWeight: 600 } }, `${pair?.a ?? "?"} ↔ ${pair?.b ?? "?"}`), h("div", { style: { marginTop: 2 } }, `重叠范围：${overlap.map(scopeTokenLabel).join("、")}`), pair?.reason ? h("div", { style: { marginTop: 2 } }, `原因：${pair.reason}`) : null);
		}
		function parallelSummary(parallel) {
			if (!parallel) return "正在读取…";
			const active = parallel.active ?? [];
			const pairs = (parallel.pairs ?? []).filter((pair) => (pair.overlap ?? []).length);
			if (parallel.canParallel === false || pairs.length) return `${active.length} 个进行中 · ${pairs.length} 处范围重叠`;
			return active.length ? `${active.length} 个进行中 · 无冲突` : "当前没有进行中的流程";
		}
		/**
		* 并行开发区：默认折叠。用原生 <details> 而不是 state，
		* 少一层重渲染；冲突时整个折叠块沿用 warn 边线（收起状态也看得到）。
		*/
		function ParallelSection({ parallel, error }) {
			const active = parallel?.active ?? [];
			const pairs = (parallel?.pairs ?? []).filter((pair) => (pair.overlap ?? []).length);
			const conflict = !error && (parallel?.canParallel === false || pairs.length > 0);
			return h("details", { style: conflict ? {
				...styles.warnCard,
				marginTop: 0,
				padding: "10px 12px"
			} : {
				...styles.cardFlat,
				marginTop: 0,
				padding: "10px 12px"
			} }, h("summary", { style: {
				cursor: "pointer",
				display: "flex",
				alignItems: "center",
				gap: 8,
				flexWrap: "wrap",
				listStyle: "none"
			} }, h("span", { style: {
				fontWeight: 600,
				color: conflict ? T.warnText : T.text
			} }, "并行开发"), error ? h(Tag, { tone: "neutral" }, "暂不可用") : h(Tag, { tone: conflict ? "warn" : "ok" }, conflict ? "存在冲突，建议串行" : "可以并行"), h("span", { style: {
				...styles.sectionHint,
				color: conflict ? T.warnText : T.text4
			} }, error ? `并行状态暂不可用：${error}` : parallelSummary(parallel)), h("div", { style: styles.spacer }), h("span", { style: {
				fontSize: T.font.sm,
				color: conflict ? T.warnText : T.brand
			} }, "展开/收起")), h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: T.gap.xs,
				marginTop: T.gap.xs
			} }, active.length ? active.map((flow) => h("div", {
				key: flow?.id ?? flow?.title,
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap",
					padding: "3px 0"
				}
			}, h("span", { style: {
				fontWeight: 600,
				fontSize: T.font.base,
				color: T.text
			} }, flow?.title ?? flow?.id ?? "未命名"), h("span", { style: {
				...styles.mono,
				color: T.text4
			} }, flow?.id ?? "?"), h(StatusPill, { status: flow?.status }), h(Tag, { tone: "neutral" }, stageText(flow?.stage)), scopeTokens(flow).length ? h("span", { style: styles.sectionHint }, scopeTokens(flow).slice(0, 3).map(scopeTokenLabel).join("、")) : null)) : h("div", { style: styles.sectionHint }, "当前没有进行中的流程。"), pairs.length ? h("div", null, h("div", { style: {
				...styles.sectionHint,
				marginBottom: 2
			} }, "两两范围比对"), pairs.map((pair, index) => h(PairRow, {
				key: `${pair?.a ?? index}-${pair?.b ?? ""}`,
				pair
			}))) : null, parallel?.advice ? h("div", { style: {
				...styles.sectionHint,
				color: conflict ? T.warnText : T.text4
			} }, `建议：${parallel.advice}`) : null, parallel?.canParallel === false ? h("div", { style: {
				fontSize: T.font.sm,
				fontWeight: 600,
				color: T.warnText
			} }, "建议改为串行：冲突范围内的改动互相影响，串行执行更安全。") : null));
		}
		function HomeView(props) {
			const { state, items, selectedId, parallel, parallelError, sessionStates, onOpenItem, onRefresh, onFixTitles, fixingTitles = false, onSelectRepo, switchingRepo, onAddRepo, onScan, onNewFlow, onOpenReport, onRemoveRepo, onSelectWorkspace, onEditWorkspace, onRemoveWorkspace, onNewWorkspace } = props;
			const repo = state?.repo ?? null;
			const list = items ?? state?.items ?? [];
			return h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: T.gap.sm
			} }, h(ProjectBar, {
				repo,
				member: state?.profile?.member,
				repos: state?.profile?.repoCards ?? state?.profile?.repos,
				onRefresh,
				onSelectRepo,
				switchingRepo,
				onAddRepo,
				onScan,
				onNewFlow,
				onRemoveRepo,
				workspaces: state?.workspaces,
				activeWorkspace: state?.workspace,
				onSelectWorkspace,
				onEditWorkspace,
				onRemoveWorkspace,
				onNewWorkspace
			}), h(FlowList, {
				items: list,
				selectedId,
				sessionStates,
				onOpenItem,
				onRefresh,
				onNewFlow,
				onOpenReport,
				onFixTitles,
				fixingTitles
			}), h(ParallelSection, {
				parallel,
				error: parallelError
			}));
		}
		//#endregion
		//#region src/client/session-entry.mjs
		/**
		* 会话页的 DevHub 快捷入口。
		*
		* 会话里正在干活时，最需要两件事：
		* 1. 知道"这个会话属于哪个开发流程"；
		* 2. 一键切到别的流程会话 / 回到工作站。
		*
		* 所以这里只读 Host 的 state + sessions（不新增接口），下拉里给出进行中的流程，
		* 点流程直接 openSession 切换；没有会话的流程则回工作站开。
		*/
		const STAGE_TEXT$1 = {
			discovery: "需求澄清",
			techdoc: "技术文档",
			plan: "开发计划",
			develop: "开发中",
			review: "独立评审",
			verify: "测试验证",
			submit: "待提交",
			done: "已完成"
		};
		function relativeTime(state, now) {
			if (!state) return "";
			if (state.idleSeconds !== null && state.idleSeconds !== void 0) {
				const seconds = Number(state.idleSeconds);
				if (seconds < 60) return "刚刚";
				if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`;
				if (seconds < 86400) return `${Math.round(seconds / 3600)} 小时前`;
				return `${Math.round(seconds / 86400)} 天前`;
			}
			return state.lastEventAt ? fmtTime(state.lastEventAt) : "";
		}
		function sessionTone(state) {
			if (!state) return "neutral";
			if (state.running) return "ok";
			if (state.alive) return "neutral";
			return "warn";
		}
		function sessionLabel(state) {
			if (!state) return "未读取到状态";
			if (state.running) return "运行中";
			if (state.alive) return "空闲";
			return "已结束";
		}
		/** 会话页头部的快捷入口：当前流程 + 流程切换下拉。 */
		function DevHubSessionQuick({ sessionId, ctx }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [items, setItems] = (0, react.useState)([]);
			const [state, setState] = (0, react.useState)(null);
			const [states, setStates] = (0, react.useState)({});
			const [error, setError] = (0, react.useState)("");
			const [repo, setRepo] = (0, react.useState)(null);
			const [repos, setRepos] = (0, react.useState)([]);
			const [activeRepoPath, setActiveRepoPath] = (0, react.useState)(null);
			const [match, setMatch] = (0, react.useState)(null);
			const [switching, setSwitching] = (0, react.useState)(null);
			async function load() {
				setError("");
				try {
					const [state, sessions] = await Promise.all([api(API.state), api(API.sessions)]);
					setState(state);
					setItems(state.items ?? []);
					setRepo(state.repo ?? null);
					setRepos(state.profile?.repos ?? []);
					setActiveRepoPath(state.repo?.path ?? null);
					const map = {};
					for (const row of sessions.sessions ?? []) map[row.itemId] = row;
					setStates(map);
					if (sessionId) try {
						const lookup = await api(`${API.lookup}?sessionId=${encodeURIComponent(sessionId)}`);
						setMatch((lookup.matches ?? [])[0] ?? null);
					} catch {
						setMatch(null);
					}
					else setMatch(null);
				} catch (err) {
					setError(errorText(err));
				}
			}
			/** 在会话页切到另一个开发站的代码库（不用回工作站）。 */
			async function switchRepo(repoPath) {
				if (!repoPath || repoPath === activeRepoPath) return;
				const name = state?.profile?.member;
				setSwitching(repoPath);
				setError("");
				try {
					const next = await api(API.switchRepo, {
						method: "POST",
						body: JSON.stringify({
							repoPath,
							name,
							detect: false
						})
					});
					setActiveRepoPath(next.repo?.path ?? repoPath);
					await load();
				} catch (err) {
					setError(errorText(err));
				} finally {
					setSwitching(null);
				}
			}
			(0, react.useEffect)(() => {
				load();
			}, [sessionId]);
			const current = match ? {
				...match.item,
				repo: match.repo
			} : items.find((item) => item.session?.id === sessionId) ?? null;
			const active = items.filter((item) => item.status !== "done");
			const sorted = [...active.filter((item) => item.id !== current?.id), ...active.filter((item) => item.id === current?.id)];
			function openSession(id) {
				setOpen(false);
				const ui = ctx?.get?.("uiWorkspace");
				if (!ui?.openSession) {
					setError("当前 DSH 不支持切换会话");
					return;
				}
				try {
					ui.openSession(id);
				} catch (err) {
					setError(errorText(err));
				}
			}
			function openStation() {
				setOpen(false);
				const layout = ctx?.get?.("layout");
				if (!layout?.selectPanel) {
					setError("当前 DSH 不支持切换面板");
					return;
				}
				layout.selectPanel("dev-hub");
			}
			return h("span", { style: {
				position: "relative",
				display: "inline-flex",
				alignItems: "center"
			} }, h("button", {
				type: "button",
				title: current ? `本会话属于开发流程「${current.title}」` : "这个会话还没有关联开发流程",
				onClick: () => {
					setOpen((value) => !value);
					if (!open) load();
				},
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
					height: 26,
					padding: "0 10px",
					border: `1px solid ${current ? T.brandBorder : T.border}`,
					borderRadius: T.rPill,
					background: current ? T.brandSoft : T.surface,
					color: current ? T.brand : T.text3,
					fontSize: T.font.sm,
					cursor: "pointer",
					fontFamily: "inherit"
				}
			}, h(IconSeat, {
				size: 18,
				tone: current ? "accent" : "neutral"
			}, "◈"), (() => {
				const repoName = current?.repo?.name ?? repo?.name;
				const label = current ? `${repoName ? `${repoName} · ` : ""}${current.title}` : repoName ? `${repoName} · 开发工作站` : "开发工作站";
				return label.length > 26 ? `${label.slice(0, 26)}…` : label;
			})(), h("span", { style: {
				fontSize: 10,
				opacity: .7
			} }, "▾")), open ? h("div", { style: {
				position: "absolute",
				top: 32,
				right: 0,
				zIndex: 10001,
				width: 360,
				maxHeight: 420,
				overflow: "auto",
				padding: 10,
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rLg,
				background: T.surface,
				boxShadow: T.shadowModal
			} }, h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 2,
				marginBottom: 8
			} }, h("div", { style: styles.row }, h("span", { style: styles.sectionTitle }, current ? `本会话 · ${current.repo?.name ?? repo?.name ?? ""}` : "开发站"), h("div", { style: styles.spacer }), h(Button, {
				style: {
					height: 24,
					padding: "0 8px"
				},
				onClick: openStation,
				children: "打开工作站"
			})), current ? h("div", { style: {
				...styles.sectionHint,
				fontFamily: T.mono
			} }, `${current.repo?.path ?? ""} · ${current.id}`) : h("div", { style: styles.sectionHint }, repo?.path ? `${repo.path}（本会话尚未关联流程）` : "未选择代码库")), repos.length > 1 ? h("div", { style: {
				display: "flex",
				flexWrap: "wrap",
				gap: 6,
				marginBottom: 8
			} }, h("span", { style: {
				...styles.sectionHint,
				width: "100%"
			} }, "切换开发站（代码库）："), repos.map((path) => h("button", {
				key: path,
				type: "button",
				disabled: Boolean(switching),
				onClick: () => switchRepo(path),
				style: {
					height: 26,
					padding: "0 10px",
					border: `1px solid ${path === activeRepoPath ? T.brandBorder : T.border}`,
					borderRadius: T.rPill,
					background: path === activeRepoPath ? T.brandSoft : T.surface,
					color: path === activeRepoPath ? T.brand : T.text3,
					fontSize: T.font.xs,
					cursor: switching ? "progress" : "pointer",
					fontFamily: "inherit",
					maxWidth: "100%",
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				}
			}, path.split("/").filter(Boolean).pop() ?? path))) : null, error ? h("div", { style: styles.smallDanger }, error) : null, sorted.length ? sorted.map((item) => {
				const state = states[item.id];
				const bound = Boolean(item.session?.id);
				const isCurrent = item.id === current?.id;
				return h("div", {
					key: item.id,
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "8px 6px",
						borderTop: `1px solid ${T.borderSoft}`
					}
				}, h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2,
					minWidth: 0,
					flex: "1 1 auto"
				} }, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					minWidth: 0
				} }, h("span", { style: {
					fontSize: T.font.sm,
					fontWeight: isCurrent ? 600 : 500,
					color: isCurrent ? T.brand : T.text,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				} }, item.title), isCurrent ? h(Tag, { tone: "accent" }, "当前") : null), h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					color: T.text4,
					fontSize: T.font.xs
				} }, h("span", null, STAGE_TEXT$1[item.stage] ?? item.stage ?? "—"), bound ? h(Tag, { tone: sessionTone(state) }, sessionLabel(state)) : h(Tag, { tone: "neutral" }, "未开会话"), bound && relativeTime(state) ? h("span", null, relativeTime(state)) : null)), bound && !isCurrent ? h(Button, {
					style: {
						height: 24,
						padding: "0 8px"
					},
					onClick: () => openSession(item.session.id),
					children: "进入"
				}) : null, !bound ? h(Button, {
					style: {
						height: 24,
						padding: "0 8px"
					},
					onClick: openStation,
					children: "去开启"
				}) : null);
			}) : h("div", { style: {
				...styles.sectionHint,
				padding: "8px 6px"
			} }, "还没有进行中的开发流程"), h("div", { style: {
				borderTop: `1px solid ${T.borderSoft}`,
				marginTop: 4,
				paddingTop: 8
			} }, h("span", { style: styles.sectionHint }, "提示：流程阶段随工作自动推进；会话状态每 5 秒刷新一次。"), error ? null : null)) : null);
		}
		//#endregion
		//#region src/client/session-log.mjs
		/**
		* 内嵌的会话内容面板：在流程详情里直接看最近对话、直接发一句话，
		* 不用跳到会话页（"跳转"会丢掉流程上下文，也打断了工作站的产出）。
		*
		* 数据：GET /api/dev-hub/session-log（Host 只读投影）。
		* 发送：客户端会话控制器 `sessions.retain(id).binding.session.prompt(...)`。
		*/
		T.brandSoft, T.brand, T.surface2, T.text2, T.warnSoft, T.warnText;
		const TOOL_STATUS = {
			running: {
				dot: T.brand,
				label: "执行中"
			},
			ok: {
				dot: T.ok,
				label: ""
			},
			error: {
				dot: T.danger,
				label: "失败"
			}
		};
		/** 连续工具调用折成一组：默认只显示"执行了 N 个操作"，点开再看每条命令。 */
		function ToolGroup({ items }) {
			const [open, setOpen] = (0, react.useState)(false);
			const failed = items.filter((item) => item.status === "error").length;
			const running = items.filter((item) => item.status === "running").length;
			const tone = failed ? T.danger : running ? T.brand : T.ok;
			return h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 2,
				marginTop: 4
			} }, h("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					fontSize: T.font.xs,
					color: T.text3,
					cursor: "pointer"
				},
				onClick: () => setOpen((value) => !value)
			}, h("span", { style: {
				width: 6,
				height: 6,
				borderRadius: 999,
				background: tone,
				flex: "0 0 auto"
			} }), h("span", null, `执行了 ${items.length} 个操作`), failed ? h("span", { style: { color: T.danger } }, `${failed} 个失败`) : null, running ? h("span", { style: { color: T.brand } }, `${running} 个进行中`) : null, h("span", { style: { color: T.brand } }, open ? "收起" : "展开")), open ? h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 1,
				paddingLeft: 14,
				marginTop: 2
			} }, items.map((item, index) => h("div", {
				key: `${index}-${item.name}`,
				style: {
					display: "flex",
					gap: 6,
					alignItems: "baseline",
					minWidth: 0,
					fontSize: T.font.xs,
					color: T.text4
				}
			}, h("span", { style: {
				...styles.mono,
				color: T.text3,
				flex: "0 0 auto"
			} }, item.name), h("span", {
				style: {
					...styles.mono,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
					minWidth: 0,
					flex: "1 1 auto"
				},
				title: item.brief ?? ""
			}, item.brief || "（无参数）"), item.status === "error" ? h("span", { style: {
				color: T.danger,
				flex: "0 0 auto"
			} }, "失败") : null))) : null);
		}
		/** 一条会话时间线：用户/助手文本 + 工具调用（工具是"在做什么"的关键）。 */
		function TimelineRow({ item }) {
			const [expanded, setExpanded] = (0, react.useState)(false);
			if (item.kind === "tool") {
				const status = TOOL_STATUS[item.status] ?? TOOL_STATUS.ok;
				return h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "2px 0",
					fontSize: T.font.xs,
					color: T.text3,
					minWidth: 0
				} }, h("span", { style: {
					width: 6,
					height: 6,
					borderRadius: 999,
					background: status.dot,
					flex: "0 0 auto"
				} }), h("span", { style: {
					...styles.mono,
					color: T.text2,
					fontWeight: 500
				} }, item.name), item.brief ? h("span", {
					style: {
						...styles.mono,
						color: T.text4,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						minWidth: 0,
						flex: "1 1 auto"
					},
					title: item.brief
				}, item.brief) : null, status.label ? h("span", { style: { color: status.dot } }, status.label) : null);
			}
			const isUser = item.kind === "user";
			const long = String(item.text ?? "").length > 320;
			return h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 2,
				marginTop: 6
			} }, h("span", { style: {
				fontSize: T.font.xs,
				color: T.text4
			} }, isUser ? "你" : "助手"), h("div", { style: {
				whiteSpace: "pre-wrap",
				overflowWrap: "anywhere",
				fontSize: T.font.sm,
				lineHeight: 1.7,
				color: isUser ? T.brand : T.text2,
				background: isUser ? T.brandSoft : "transparent",
				borderRadius: isUser ? T.rBase : 0,
				padding: isUser ? "6px 10px" : 0,
				maxHeight: long && !expanded ? 160 : void 0,
				overflow: "hidden"
			} }, expanded ? item.text : String(item.text ?? "").slice(0, long ? 320 : 1200)), long ? h("span", {
				style: {
					fontSize: T.font.xs,
					color: T.brand,
					cursor: "pointer"
				},
				onClick: () => setExpanded((value) => !value)
			}, expanded ? "收起" : "展开全文") : null);
		}
		/**
		* @param {{ ctx: any, sessionId: string|null, alive?: boolean, onError?: (message: string) => void }} props
		*/
		function SessionLogPanel({ ctx, itemId, sessionId, alive, onError }) {
			const [log, setLog] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			async function load({ silent = false } = {}) {
				if (!sessionId) {
					setLog(null);
					return;
				}
				if (!silent) setLoading(true);
				setError("");
				try {
					const body = await api(`${API.sessionLog}?itemId=${encodeURIComponent(String(itemId ?? ""))}&limit=80`);
					setLog(body);
				} catch (err) {
					setError(errorText(err));
				} finally {
					if (!silent) setLoading(false);
				}
			}
			(0, react.useEffect)(() => {
				if (!sessionId) {
					setLog(null);
					return;
				}
				let stop = false;
				const run = async () => {
					if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
					if (stop) return;
					await load({ silent: Boolean(log) });
				};
				load();
				const timer = setInterval(run, 8e3);
				return () => {
					stop = true;
					clearInterval(timer);
				};
			}, [sessionId, itemId]);
			if (!sessionId) return h("div", { style: styles.sectionHint }, "还没有关联开发会话。");
			const rawItems = log?.items ?? [];
			const items = [];
			let toolBuffer = [];
			for (const item of rawItems) {
				if (item?.kind === "tool") {
					toolBuffer.push(item);
					continue;
				}
				if (toolBuffer.length) {
					items.push({
						kind: "toolGroup",
						items: toolBuffer
					});
					toolBuffer = [];
				}
				items.push(item);
			}
			if (toolBuffer.length) items.push({
				kind: "toolGroup",
				items: toolBuffer
			});
			const rows = log?.messages ?? [];
			return h("div", { style: { marginTop: T.gap.xs } }, h("div", { style: {
				...styles.row,
				marginBottom: 6
			} }, h("span", { style: styles.sectionTitle }, "开发会话动态"), h("span", { style: styles.sectionHint }, loading ? "加载中…" : log?.truncated ? `共 ${log?.total ?? 0} 条，展示最近 ${rows.length} 条` : `共 ${rows.length} 条`), h("div", { style: styles.spacer }), h(Button, {
				style: {
					height: 24,
					padding: "0 8px"
				},
				onClick: () => load(),
				disabled: loading,
				children: "刷新"
			})), error ? h("div", { style: styles.dangerCard }, error) : null, !alive && log?.reason ? h("div", { style: styles.warnCard }, log.reason) : null, items.length ? (() => {
				const head = items.slice(0, Math.max(0, items.length - 6));
				const tail = items.slice(-6);
				return h("div", { style: {
					maxHeight: 300,
					overflow: "auto",
					paddingRight: 4
				} }, head.length ? h("details", null, h("summary", { style: {
					cursor: "pointer",
					fontSize: T.font.xs,
					color: T.text4,
					padding: "2px 0"
				} }, `更早的 ${head.length} 条（展开）`), head.map((item, index) => item.kind === "toolGroup" ? h("div", { key: `hg${index}` }, h(ToolGroup, { items: item.items })) : h(TimelineRow, {
					key: `h${index}-${item.kind}`,
					item
				}))) : null, tail.map((item, index) => item.kind === "toolGroup" ? h("div", { key: `tg${index}` }, h(ToolGroup, { items: item.items })) : h(TimelineRow, {
					key: `t${index}-${item.kind}`,
					item
				})));
			})() : h("div", { style: styles.sectionHint }, log?.reason ? "没有可展示的消息（会话可能尚未开始或已被清理）" : "（还没有消息）"));
		}
		//#endregion
		//#region src/client/error-boundary.mjs
		/**
		* 渲染兜底：任何工作站子组件抛错，都显示一张可读的错误卡，
		* 而不是让整个 Web GUI 白屏（白屏时用户拿不到任何信息）。
		*/
		var DevHubBoundary = class extends react.Component {
			constructor(props) {
				super(props);
				this.state = { error: null };
			}
			static getDerivedStateFromError(error) {
				return { error };
			}
			componentDidCatch(error, info) {
				if (typeof console !== "undefined") console.error("[dev-hub] 渲染出错：", error, info);
			}
			render() {
				const { error } = this.state;
				if (!error) return this.props.children;
				return h("div", { style: {
					...styles.card,
					margin: T.gap.md
				} }, h("div", { style: {
					...styles.sectionTitle,
					color: T.danger
				} }, "开发工作站渲染出错"), h("div", { style: {
					marginTop: T.gap.xs,
					fontFamily: T.mono,
					fontSize: T.font.sm,
					color: T.text2,
					whiteSpace: "pre-wrap",
					wordBreak: "break-word"
				} }, String(error?.message ?? error)), h("div", { style: {
					...styles.sectionHint,
					marginTop: T.gap.xs
				} }, "界面没有白屏，但这一段没法渲染。请刷新页面重试；如果反复出现，把上面的错误信息发给维护者（控制台有完整堆栈）。"));
			}
		};
		//#endregion
		//#region src/client/ui-state.mjs
		/**
		* 工作站"界面状态"留存：切走再回来，回到上次所在的页面。
		*
		* 只存与"页面"有关的东西（页签、当前打开哪条流程、列表滚动位置），
		* 不存业务数据（业务数据在 .dev-hub 台账、对话内容在 chat-store）。
		*
		* 内存 + localStorage：同页面内切换立即恢复；刷新/重启后也能恢复。
		*/
		const MEMORY = /* @__PURE__ */ new Map();
		const TAB_KEY = "dev-hub:ui:tab";
		const PANEL_PREFIX = "dev-hub:ui:panel:";
		function storage() {
			try {
				if (typeof window === "undefined" || !window.localStorage) return null;
				return window.localStorage;
			} catch {
				return null;
			}
		}
		function panelKey(repoPath) {
			const repo = String(repoPath ?? "").trim() || "unknown-repo";
			return PANEL_PREFIX + repo;
		}
		function read(key) {
			if (MEMORY.has(key)) return MEMORY.get(key);
			const store = storage();
			if (!store) return null;
			try {
				const raw = store.getItem(key);
				if (!raw) return null;
				const value = JSON.parse(raw);
				MEMORY.set(key, value);
				return value;
			} catch {
				return null;
			}
		}
		function write(key, value) {
			MEMORY.set(key, value);
			const store = storage();
			if (!store) return;
			try {
				store.setItem(key, JSON.stringify(value));
			} catch {}
		}
		/** 上次所在的页签（flows / chat / skills）。 */
		function loadLastTab() {
			const value = read(TAB_KEY);
			const tab = typeof value === "string" ? value : value?.tab;
			return [
				"flows",
				"chat",
				"skills"
			].includes(tab) ? tab : null;
		}
		function saveLastTab(tab) {
			if (![
				"flows",
				"chat",
				"skills"
			].includes(tab)) return;
			write(TAB_KEY, tab);
		}
		/**
		* 某代码库上次的详情页状态。
		* @returns {{ selectedId: string|null, scrollTop: number }}
		*/
		function loadPanelState(repoPath) {
			const value = read(panelKey(repoPath));
			return {
				selectedId: typeof value?.selectedId === "string" ? value.selectedId : null,
				scrollTop: Number.isFinite(Number(value?.scrollTop)) ? Number(value.scrollTop) : 0,
				savedAt: value?.savedAt ?? null
			};
		}
		function savePanelState(repoPath, { selectedId = null, scrollTop = 0 } = {}) {
			write(panelKey(repoPath), {
				selectedId: selectedId ?? null,
				scrollTop: Number(scrollTop) || 0,
				savedAt: (/* @__PURE__ */ new Date()).toISOString()
			});
		}
		//#endregion
		//#region src/client/skills.mjs
		/**
		* dsh-dev-hub 浏览器半 —— 「技能」页。
		*
		* 这里管理的是**工作站自带的通用 skills（规范包）**，不是 DSH 的 skill 文件：
		* - 安装 = 把技能包里的约束写进 <repo>/.dev-hub/conventions.json；
		* - 卸载 = 只移除该包带来的约束，不动其它包与自定义项；
		* - 自定义约束独立于技能包，可增删改；
		* - 「重新生成默认」按已安装集合重建，自定义项保留。
		*
		* 数据全部来自 GET/POST API.skills；本组件不碰 core/shared/host。
		* 取舍：所有写操作成功后统一再 GET 一次（Host 对 add/update/remove 只回约束数组），
		* 保证「已安装 / 技能库 / 约束明细」三块永远同源、不会出现半更新。
		*/
		/** 次要动作统一缩一号，和流程页保持一致。 */
		const mini = {
			height: 24,
			padding: "0 8px",
			fontSize: T.font.sm
		};
		const miniBig = {
			height: 28,
			padding: "0 10px",
			fontSize: T.font.sm
		};
		const CHECK_KINDS = [
			{
				value: "checklist",
				label: "清单核对"
			},
			{
				value: "files",
				label: "文件范围"
			},
			{
				value: "imports",
				label: "依赖方向"
			},
			{
				value: "gate",
				label: "门禁命令"
			}
		];
		const CHECK_LABELS = Object.fromEntries(CHECK_KINDS.map((entry) => [entry.value, entry.label]));
		function checkLabel(kind) {
			return CHECK_LABELS[kind] ?? kind ?? "清单核对";
		}
		function levelTone(level) {
			if (level === "L0") return "ok";
			if (level === "L1") return "accent";
			return "neutral";
		}
		/** 前端框架标签：检测到多个时按检测顺序展示。 */
		function frameworkLabel(view) {
			return (view?.frameworks ?? []).join(" / ") || "前端";
		}
		function emptyForm() {
			return {
				id: "",
				title: "",
				rule: "",
				kind: "checklist",
				value: "",
				doc: "",
				gate: ""
			};
		}
		/** 约束按技能分组：内置按技能库顺序，自定义固定放最后。 */
		function groupConstraints(constraints, view) {
			const bySkill = /* @__PURE__ */ new Map();
			for (const constraint of constraints ?? []) {
				const skill = constraint.skill || "custom";
				if (!bySkill.has(skill)) bySkill.set(skill, []);
				bySkill.get(skill).push(constraint);
			}
			const nameOf = (id) => (view?.installed ?? []).find((entry) => entry.id === id)?.name ?? (view?.catalog ?? []).find((entry) => entry.id === id)?.name ?? id;
			const levelOf = (id) => (view?.installed ?? []).find((entry) => entry.id === id)?.level ?? (view?.catalog ?? []).find((entry) => entry.id === id)?.level ?? "";
			const order = new Map((view?.catalog ?? []).map((pack, index) => [pack.id, index]));
			return [...bySkill.entries()].map(([skill, items]) => ({
				skill,
				custom: skill === "custom",
				name: skill === "custom" ? "自定义" : nameOf(skill),
				level: skill === "custom" ? "" : levelOf(skill),
				items
			})).sort((a, b) => {
				if (a.custom !== b.custom) return a.custom ? 1 : -1;
				return (order.get(a.skill) ?? 999) - (order.get(b.skill) ?? 999);
			});
		}
		/**
		* @param {{
		*   initialView?: object | null,
		*   initialRepo?: { name?: string, path?: string } | null,
		*   initialWorkspace?: { name?: string, repos?: string[], path?: string } | null,
		* }} [props]
		*   initialView/initialRepo/initialWorkspace 只用于 SSR 冒烟与后续嵌入；DevHubPage 不传，组件自己 GET。
		*/
		function SkillsPanel({ initialView = null, initialRepo = null, initialWorkspace = null } = {}) {
			const [repo, setRepo] = (0, react.useState)(initialRepo);
			const [workspace, setWorkspace] = (0, react.useState)(initialWorkspace);
			const [view, setView] = (0, react.useState)(initialView);
			const [loading, setLoading] = (0, react.useState)(!initialView);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [formOpen, setFormOpen] = (0, react.useState)(false);
			const [editingId, setEditingId] = (0, react.useState)(null);
			const [form, setForm] = (0, react.useState)(emptyForm);
			/** silent=true 用于「刷新」按钮：不把整页切成 loading，只更新数据。 */
			async function loadAll({ silent = false } = {}) {
				if (!silent) setLoading(true);
				setError("");
				try {
					const state = await api(API.state);
					setRepo(state.repo ?? null);
					setWorkspace(state.workspace ?? null);
					if (!state.repo) {
						setView(null);
						return;
					}
					setView(await api(API.skills));
				} catch (err) {
					setError(errorText(err));
				} finally {
					if (!silent) setLoading(false);
				}
			}
			(0, react.useEffect)(() => {
				if (initialView) {
					setLoading(false);
					return;
				}
				loadAll();
			}, []);
			async function refreshSkills() {
				const next = await api(API.skills);
				setView(next);
				return next;
			}
			/** 所有写操作的统一出口：POST → 重新 GET（三块数据同源）→ notice。 */
			async function runPost(payload, successText) {
				setBusy(true);
				setError("");
				setNotice("");
				try {
					const body = await api(API.skills, {
						method: "POST",
						body: JSON.stringify(payload)
					});
					await refreshSkills();
					setNotice(typeof successText === "function" ? successText(body) : successText);
					return body;
				} catch (err) {
					setError(errorText(err));
					return null;
				} finally {
					setBusy(false);
				}
			}
			async function install(pack) {
				const added = Number(pack?.constraints ?? 0);
				await runPost({
					action: "install",
					skillId: pack.id
				}, (body) => body?.changed === false ? view?.firstRun ? `已生成默认规范（${pack.name} 属于推荐集合，其余推荐技能包也一并写入）` : `${pack.name} 已在安装列表中` : `已安装 ${pack.name}（+${added} 条约束）`);
			}
			async function uninstall(skill) {
				if (!window.confirm(`卸载「${skill.name}」？\n\n只移除该技能带来的约束，不改自定义项。`)) return;
				const removed = Number(skill?.constraints ?? 0);
				await runPost({
					action: "uninstall",
					skillId: skill.id
				}, (body) => body?.changed === false ? `${skill.name} 未安装` : `已卸载 ${skill.name}（-${removed} 条约束）`);
			}
			async function regenerate() {
				if (!window.confirm("按当前已安装技能重建约束？\n\n自定义约束会保留；内置约束的手工改动会被覆盖。")) return;
				await runPost({ action: "regenerate" }, "已按当前安装集合重建默认规范");
			}
			/** 首次没有 conventions.json：Host 对首个写动作会自动按默认集合落盘，这里按推荐技能显式走一遍。 */
			async function installRecommended() {
				setBusy(true);
				setError("");
				setNotice("");
				try {
					await api(API.skills, {
						method: "POST",
						body: JSON.stringify({
							action: "install",
							skillId: "core-discipline"
						})
					});
					await api(API.skills, {
						method: "POST",
						body: JSON.stringify({
							action: "install",
							skillId: "generic-quality"
						})
					});
					const next = await refreshSkills();
					setNotice(`已生成推荐规范：L0 纪律 + 当前语言（${next?.profile ?? "generic"}）对应的 L1 技能包${next?.frontend ? ` + 前端原型设计规范（${frameworkLabel(next)}）` : ""}（共 ${next?.installed?.length ?? 0} 个）。`);
				} catch (err) {
					setError(errorText(err));
				} finally {
					setBusy(false);
				}
			}
			async function removeConstraint(constraint) {
				if (!window.confirm(`删除自定义约束「${constraint.title}」？`)) return;
				await runPost({
					action: "removeConstraint",
					id: constraint.id
				}, `已删除约束「${constraint.title}」`);
			}
			function openAdd() {
				setEditingId(null);
				setForm(emptyForm());
				setFormOpen(true);
				setError("");
				setNotice("");
			}
			function openEdit(constraint) {
				setEditingId(constraint.id);
				setForm({
					id: constraint.id,
					title: constraint.title ?? "",
					rule: constraint.rule ?? "",
					kind: constraint.check?.kind ?? "checklist",
					value: constraint.check?.value ?? "",
					doc: constraint.doc ?? "",
					gate: constraint.gate ?? ""
				});
				setFormOpen(true);
				setError("");
				setNotice("");
			}
			function closeForm() {
				setFormOpen(false);
				setEditingId(null);
				setForm(emptyForm());
			}
			function setField(key, value) {
				setForm((current) => ({
					...current,
					[key]: value
				}));
			}
			async function submitForm() {
				const payload = {
					id: form.id.trim(),
					title: form.title.trim(),
					rule: form.rule.trim(),
					check: {
						kind: form.kind,
						value: form.value.trim()
					},
					doc: form.doc.trim(),
					gate: form.gate.trim()
				};
				if (!editingId && !payload.id) {
					setError("请填写约束 id（字母/数字/-/_）");
					return;
				}
				if (!payload.title || !payload.rule) {
					setError("请填写约束标题与规则内容");
					return;
				}
				if (editingId) {
					if (await runPost({
						action: "updateConstraint",
						constraint: {
							...payload,
							id: editingId
						}
					}, `已更新约束「${payload.title || editingId}」`)) closeForm();
				} else if (await runPost({
					action: "addConstraint",
					constraint: payload
				}, `已新增自定义约束「${payload.title || payload.id}」`)) closeForm();
			}
			function field(label, node, hint) {
				return h("label", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 4,
					minWidth: 0
				} }, h("span", { style: {
					fontSize: T.font.sm,
					fontWeight: 500,
					color: T.text3
				} }, label), node, hint ? h("span", { style: {
					fontSize: T.font.xs,
					color: T.text4
				} }, hint) : null);
			}
			function levelTag(level) {
				return level ? h(Tag, { tone: levelTone(level) }, level) : null;
			}
			function renderTopBar() {
				const workspaceRepos = workspace?.repos ?? [];
				return h("div", { style: {
					...styles.cardFlat,
					display: "flex",
					alignItems: "center",
					gap: T.gap.sm,
					flexWrap: "wrap"
				} }, h(IconSeat, { size: 32 }, "◈"), h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2,
					minWidth: 0,
					flex: "1 1 280px"
				} }, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					flexWrap: "wrap",
					minWidth: 0
				} }, h("span", {
					style: {
						fontSize: T.font.md,
						fontWeight: 600,
						color: T.text,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					title: workspace ? `虚拟库「${workspace.name ?? "未命名"}」：${workspaceRepos.length} 个代码库；规范技能只写入本机 ${workspace.path ?? workspace.localPath ?? "—"}` : repo?.path ?? ""
				}, workspace ? `虚拟库 · ${workspace.name ?? "未命名"}` : repo ? `代码库 · ${repo.name ?? repo.path ?? "未命名"}` : "未选择代码库"), workspace ? h(Tag, { tone: "accent" }, `${workspaceRepos.length} 库`) : null, workspace ? h(Tag, {
					tone: "neutral",
					title: "虚拟库本机独立目录（不是任何成员库）"
				}, "本机规范") : null), workspace ? h("span", { style: styles.sectionHint }, `虚拟库的成员库不共享规范：技能与约束只写入虚拟库本机目录 ${workspace.path ?? workspace.localPath ?? "—"}`) : null, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap"
				} }, h("span", { style: styles.sectionHint }, "规范文件"), h("span", { style: {
					...styles.mono,
					color: T.text4,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				} }, view?.path ?? ".dev-hub/conventions.json"), view?.profile ? h(Tag, { tone: "neutral" }, view.frontend ? `${view.profile} · ${frameworkLabel(view)}` : `${view.profile} 仓库`) : null)), h("div", { style: styles.spacer }), h(Button, {
					style: miniBig,
					disabled: busy || loading || !view,
					onClick: regenerate,
					children: "重新生成默认"
				}), h(Button, {
					style: miniBig,
					disabled: busy || loading,
					onClick: () => loadAll({ silent: true }),
					children: "刷新"
				}));
			}
			function renderStats() {
				const installed = view?.installed ?? [];
				const constraints = view?.constraints ?? [];
				const custom = constraints.filter((constraint) => constraint.skill === "custom").length;
				return h("div", { style: {
					...styles.cardFlat,
					display: "flex",
					gap: T.gap.lg,
					flexWrap: "wrap"
				} }, h(Stat, {
					label: "已安装技能",
					value: installed.length,
					hint: "L0 + 语言/前端包"
				}), h(Stat, {
					label: "约束总数",
					value: constraints.length,
					hint: "内置 + 自定义"
				}), h(Stat, {
					label: "自定义约束",
					value: custom,
					hint: "仅本仓库"
				}));
			}
			/**
			* 已有规范文件的前端仓库：内置包不会被自动改写，但要把「可以补装」这件事显式说出来，
			* 否则前端仓库（尤其换人/升级后）根本发现不了这个包。
			*/
			function recommendedPacks() {
				if (!view?.frontend || view.firstRun) return [];
				return (view.catalog ?? []).filter((pack) => (pack.autoInstall ?? []).includes("frontend") && !pack.installed);
			}
			function renderRecommendation() {
				const packs = recommendedPacks();
				if (!packs.length) return null;
				return h("div", { style: styles.infoCard }, h("div", { style: styles.spread }, h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2,
					minWidth: 0
				} }, h("span", { style: {
					fontWeight: 600,
					fontSize: T.font.base,
					color: T.text
				} }, `检测到前端框架（${frameworkLabel(view)}），建议补装前端原型规范`), h("span", { style: styles.sectionHint }, "已有规范文件不会被自动改写；补装只追加该技能包的约束，之后可随时卸载。")), h("div", { style: styles.row }, packs.map((pack) => h(Button, {
					key: pack.id,
					primary: true,
					disabled: busy,
					onClick: () => install(pack),
					children: busy ? "安装中…" : `安装 ${pack.name}`
				})))));
			}
			function renderEmpty() {
				const language = view?.profile ?? "generic";
				const hint = view?.frontend ? `首次生成会装入 L0 通用纪律 + 当前语言（${language}）的 L1 技能包；检测到前端框架（${frameworkLabel(view)}）后会再加上「前端原型设计规范」，写入 ${view?.path ?? ".dev-hub/conventions.json"}。` : `首次生成会装入 L0 通用纪律 + 当前语言（${language}）对应的 L1 技能包，写入 ${view?.path ?? ".dev-hub/conventions.json"}。`;
				return h("div", { style: styles.cardFlat }, h(EmptyState, {
					icon: "◈",
					title: "仓库还没有生成规范文件",
					hint,
					action: h(Button, {
						primary: true,
						disabled: busy,
						onClick: installRecommended,
						children: busy ? "生成中…" : "安装推荐技能"
					})
				}));
			}
			function renderInstalled() {
				const installed = view?.installed ?? [];
				return h("div", { style: {
					...styles.cardFlat,
					padding: 0,
					overflow: "hidden"
				} }, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: T.gap.xs,
					flexWrap: "wrap",
					padding: "10px 14px"
				} }, h("span", { style: styles.sectionTitle }, "已安装"), h(Tag, { tone: "neutral" }, String(installed.length)), h("div", { style: styles.spacer }), h("span", { style: styles.sectionHint }, "卸载只移除该技能带来的约束，不改自定义项")), h("div", { style: { borderTop: `1px solid ${T.borderSoft}` } }, installed.length ? installed.map((skill) => h("div", {
					key: skill.id,
					style: {
						display: "flex",
						alignItems: "center",
						gap: T.gap.xs,
						flexWrap: "wrap",
						padding: "10px 14px",
						borderBottom: `1px solid ${T.borderSoft}`
					}
				}, h("span", { style: {
					fontWeight: 600,
					fontSize: T.font.base,
					color: T.text
				} }, skill.name ?? skill.id), levelTag(skill.level), h("span", { style: {
					...styles.num,
					fontSize: T.font.xs,
					color: T.text4
				} }, `${Number(skill.constraints ?? 0)} 条约束`), skill.installedAt ? h("span", { style: styles.sectionHint }, `安装于 ${fmtTime(skill.installedAt)}`) : null, h("div", { style: styles.spacer }), h(Button, {
					style: mini,
					disabled: busy,
					onClick: () => uninstall(skill),
					children: "卸载"
				}))) : h("div", { style: { padding: "12px 14px" } }, h("span", { style: styles.sectionHint }, "还没有安装任何技能包。"))));
			}
			function renderCatalog() {
				const catalog = view?.catalog ?? [];
				return h("div", { style: {
					...styles.cardFlat,
					padding: 0,
					overflow: "hidden"
				} }, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: T.gap.xs,
					flexWrap: "wrap",
					padding: "10px 14px"
				} }, h("span", { style: styles.sectionTitle }, "内置技能库"), h(Tag, { tone: "neutral" }, String(catalog.length)), h("div", { style: styles.spacer }), h("span", { style: styles.sectionHint }, "按仓库语言给出可用技能包；前端包按 package.json 框架依赖自动判定，已安装的也列出便于对照")), h("div", { style: { borderTop: `1px solid ${T.borderSoft}` } }, catalog.length ? catalog.map((pack) => h("div", {
					key: pack.id,
					style: {
						display: "flex",
						alignItems: "center",
						gap: T.gap.sm,
						flexWrap: "wrap",
						padding: "10px 14px",
						borderBottom: `1px solid ${T.borderSoft}`
					}
				}, h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2,
					flex: "1 1 320px",
					minWidth: 0
				} }, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap"
				} }, h("span", { style: {
					fontWeight: 600,
					fontSize: T.font.base,
					color: T.text
				} }, pack.name ?? pack.id), levelTag(pack.level), h("span", { style: {
					...styles.num,
					fontSize: T.font.xs,
					color: T.text4
				} }, `${Number(pack.constraints ?? 0)} 条约束`), (pack.appliesTo ?? []).length ? h("span", { style: styles.sectionHint }, `适用 ${(pack.appliesTo ?? []).join(" / ")}`) : null, (pack.autoInstall ?? []).includes("frontend") && !pack.installed ? h(Tag, { tone: view?.frontend ? "accent" : "neutral" }, view?.frontend ? "推荐安装" : "前端仓库默认装") : null), pack.description ? h("span", { style: {
					...styles.sectionHint,
					lineHeight: T.line
				} }, pack.description) : null), h(Button, {
					style: mini,
					primary: !pack.installed,
					disabled: busy || pack.installed,
					onClick: () => install(pack),
					children: pack.installed ? "已安装" : "安装"
				}))) : h("div", { style: { padding: "12px 14px" } }, h("span", { style: styles.sectionHint }, "当前语言没有可用的技能包。"))));
			}
			function renderConstraint(constraint) {
				return h("div", {
					key: constraint.id,
					style: {
						padding: "10px 14px",
						borderBottom: `1px solid ${T.borderSoft}`
					}
				}, h("div", { style: styles.spread }, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap",
					minWidth: 0
				} }, h("span", { style: {
					fontWeight: 600,
					fontSize: T.font.base,
					color: T.text
				} }, constraint.title ?? constraint.id), h(Tag, { tone: "neutral" }, checkLabel(constraint.check?.kind)), h("span", { style: {
					...styles.mono,
					fontSize: T.font.xs,
					color: T.text4
				} }, constraint.id)), h("div", { style: styles.row }, constraint.builtin ? null : h(Button, {
					style: mini,
					disabled: busy,
					onClick: () => openEdit(constraint),
					children: "编辑"
				}), constraint.builtin ? null : h(Button, {
					style: mini,
					disabled: busy,
					onClick: () => removeConstraint(constraint),
					children: "删除"
				}))), h("div", { style: {
					marginTop: 4,
					fontSize: T.font.sm,
					lineHeight: T.line,
					color: T.text2,
					whiteSpace: "pre-wrap",
					wordBreak: "break-word"
				} }, constraint.rule ?? ""), constraint.doc || constraint.gate ? h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 12,
					flexWrap: "wrap",
					marginTop: 4
				} }, constraint.doc ? h("span", { style: {
					...styles.mono,
					fontSize: T.font.xs,
					color: T.text4
				} }, `doc: ${constraint.doc}`) : null, constraint.gate ? h("span", { style: {
					...styles.mono,
					fontSize: T.font.xs,
					color: T.text4
				} }, `gate: ${constraint.gate}`) : null) : null);
			}
			function renderConstraints() {
				const constraints = view?.constraints ?? [];
				const groups = groupConstraints(constraints, view);
				return h("div", { style: {
					...styles.cardFlat,
					padding: 0,
					overflow: "hidden"
				} }, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: T.gap.xs,
					flexWrap: "wrap",
					padding: "10px 14px"
				} }, h("span", { style: styles.sectionTitle }, "约束明细"), h(Tag, { tone: "neutral" }, String(constraints.length)), h("div", { style: styles.spacer }), h("span", { style: styles.sectionHint }, "内置项随技能包安装/卸载；自定义项可编辑/删除")), h("div", { style: { borderTop: `1px solid ${T.borderSoft}` } }, groups.length ? groups.map((group) => h("div", { key: group.skill }, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap",
					padding: "8px 14px",
					background: T.surface2
				} }, h("span", { style: {
					fontWeight: 600,
					fontSize: T.font.sm,
					color: T.text2
				} }, group.name), group.custom ? null : levelTag(group.level), h("span", { style: {
					...styles.num,
					fontSize: T.font.xs,
					color: T.text4
				} }, `${group.items.length} 条`), h("span", { style: styles.sectionHint }, group.custom ? "仅本仓库" : "内置技能包")), group.items.map((constraint) => renderConstraint(constraint)))) : h("div", { style: { padding: "12px 14px" } }, h("span", { style: styles.sectionHint }, "还没有约束；安装技能包或新增自定义约束。"))));
			}
			function renderForm() {
				return h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: T.gap.sm,
					marginTop: T.gap.xs
				} }, h("div", { style: {
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
					gap: T.gap.sm
				} }, field("约束 id", h("input", {
					style: styles.input,
					value: form.id,
					disabled: Boolean(editingId),
					placeholder: "例如：team-rule（字母/数字/-/_）",
					onChange: (event) => setField("id", event.target.value)
				}), editingId ? "编辑时不可改 id" : "自定义约束的唯一标识"), field("标题", h("input", {
					style: styles.input,
					value: form.title,
					placeholder: "例如：团队评审必须双人",
					onChange: (event) => setField("title", event.target.value)
				}))), field("规则内容", h("textarea", {
					style: {
						...styles.textarea,
						minHeight: 64
					},
					value: form.rule,
					placeholder: "写清「什么情况算违反、应该怎么做」",
					onChange: (event) => setField("rule", event.target.value)
				})), h("div", { style: {
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
					gap: T.gap.sm
				} }, field("核对方式", h("select", {
					style: styles.input,
					value: form.kind,
					onChange: (event) => setField("kind", event.target.value)
				}, CHECK_KINDS.map((kind) => h("option", {
					key: kind.value,
					value: kind.value
				}, kind.label)))), field("核对参数", h("input", {
					style: styles.input,
					value: form.value,
					placeholder: "例如：src/** 或 package-check",
					onChange: (event) => setField("value", event.target.value)
				}), "可留空")), h("div", { style: {
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
					gap: T.gap.sm
				} }, field("文档路径 doc", h("input", {
					style: styles.input,
					value: form.doc,
					placeholder: "docs/code-guide/…（可留空）",
					onChange: (event) => setField("doc", event.target.value)
				})), field("门禁命令 gate", h("input", {
					style: styles.input,
					value: form.gate,
					placeholder: "sh scripts/check.sh（可留空）",
					onChange: (event) => setField("gate", event.target.value)
				}))), h("div", { style: styles.row }, h(Button, {
					primary: true,
					disabled: busy,
					onClick: submitForm,
					children: busy ? "保存中…" : editingId ? "保存约束" : "新增约束"
				}), h(Button, {
					style: mini,
					disabled: busy,
					onClick: closeForm,
					children: "取消"
				})));
			}
			function renderFormCard() {
				return h("div", { style: styles.cardFlat }, h("div", { style: styles.spread }, h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2
				} }, h("div", { style: styles.sectionTitle }, editingId ? `编辑约束 · ${editingId}` : "自定义约束"), h("div", { style: styles.sectionHint }, "自定义项独立于技能包，卸载技能或重建默认都不会删除它")), formOpen ? null : h(Button, {
					style: mini,
					disabled: busy,
					onClick: openAdd,
					children: "新增自定义约束"
				})), formOpen ? renderForm() : null);
			}
			if (loading) return h("div", { style: {
				...styles.sectionHint,
				padding: "8px 0"
			} }, "正在读取技能与规范…");
			if (!repo) return h("div", { style: styles.cardFlat }, h(EmptyState, {
				icon: "◈",
				title: "还没有选择代码库",
				hint: "请先到「流程」页完成代码库初始化，再回来管理技能与约束。"
			}));
			return h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: T.gap.sm
			} }, renderTopBar(), error ? h("div", { style: styles.dangerCard }, error) : null, notice ? h("div", { style: styles.infoCard }, notice) : null, renderRecommendation(), renderStats(), view?.firstRun ? renderEmpty() : renderInstalled(), renderCatalog(), view?.firstRun ? null : renderConstraints(), view?.firstRun ? null : renderFormCard());
		}
		//#endregion
		//#region src/client/report.mjs
		/**
		* dsh-dev-hub 浏览器半 —— 「开发报告」只读视图。
		*
		* 契约来自 docs/design/dev-report-2026-11.md 第 3、4、6 节；视觉按
		* prototype-ui-designer / Gitee 家族中后台规范：
		* - 品牌紫 #6049e7、四级灰阶、#f9fafd 底 + 白卡 + 双层柔影；
		* - 圆角 12 容器 / 8 控件 / 6 SM / 4 标签 / 999 胶囊，间距只用 8/12/16/24；
		* - 数字右对齐 + tnum，统计卡淡彩渐变底 + 圆角图标座，分节标题数字徽标；
		* - 状态用 radius4 的家族 Tag（文字语义色 + 8% 淡底），层次靠字重/灰阶/字号。
		*
		* 组件分两层：ReportView 负责取数与工具栏（loading/error/data 三态），
		* ReportSections/ReportBlock 是纯渲染组件，方便 SSR 冒烟测试。
		*/
		const miniButton = {
			height: 28,
			padding: "0 10px",
			fontSize: T.font.sm,
			borderRadius: T.rSm
		};
		/** 结论 → 视觉：只给语义色，不做满屏彩色。 */
		const VERDICT_STYLE = {
			passed: {
				label: "通过",
				tone: "ok",
				color: T.ok,
				background: T.okSoft,
				border: T.ok
			},
			failed: {
				label: "未通过",
				tone: "danger",
				color: T.danger,
				background: T.dangerSoft,
				border: T.danger
			},
			incomplete: {
				label: "未完成",
				tone: "warn",
				color: T.warnText,
				background: T.warnSoft,
				border: T.warn
			},
			blocked: {
				label: "阻塞",
				tone: "warn",
				color: T.warnText,
				background: T.warnSoft,
				border: T.warn
			}
		};
		/** block 里的 tone 只影响文字颜色，不改变结构。 */
		const TONE_COLOR = {
			ok: T.ok,
			danger: T.danger,
			warn: T.warnText,
			info: T.info,
			accent: T.brand,
			neutral: T.text2
		};
		const TABLE_TONES = /* @__PURE__ */ new Set([
			"ok",
			"danger",
			"warn",
			"info",
			"neutral",
			"accent"
		]);
		function toneColor(tone) {
			return TONE_COLOR[tone] ?? T.text2;
		}
		function textOf(value) {
			return String(value ?? "").trim();
		}
		/** 数值展示：缺省不编 0，给「—」；有值保持原始数字可对齐。 */
		function numberText(value) {
			if (value === null || value === void 0 || value === "") return "—";
			const num = Number(value);
			return Number.isFinite(num) ? String(num) : String(value);
		}
		function valueText(value) {
			return textOf(value) || "—";
		}
		/** 家族信息卡：浅灰底 + 细边，不用整段彩色。 */
		function HintText({ children }) {
			return h("div", { style: {
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rBase,
				background: T.bg,
				padding: "8px 12px",
				color: T.text2,
				fontSize: T.font.sm,
				lineHeight: T.line
			} }, children);
		}
		function EmptyHint({ text = "未填写" }) {
			return h("div", { style: {
				...styles.sectionHint,
				padding: "6px 0"
			} }, text);
		}
		/** 只用内联 SVG，不引图标库、不发外部请求。 */
		function Icon({ kind, size = 18 }) {
			const common = {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.8,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				style: { display: "block" }
			};
			if (kind === "file") return h("svg", common, h("path", { d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" }), h("path", { d: "M14 3v5h5" }), h("path", { d: "M9 13h6M9 17h4" }));
			if (kind === "test") return h("svg", common, h("circle", {
				cx: 12,
				cy: 12,
				r: 9
			}), h("path", { d: "m8.5 12.2 2.4 2.4 4.8-5" }));
			if (kind === "tasks") return h("svg", common, h("rect", {
				x: 4,
				y: 4,
				width: 16,
				height: 16,
				rx: 3
			}), h("path", { d: "m8 9 1.6 1.6L12 8.2M8 15l1.6 1.6L12 14.2M14 9.5h4M14 15.5h4" }));
			if (kind === "verdict") return h("svg", common, h("path", { d: "M12 3 4.5 6v5.2c0 4.6 3 8.1 7.5 9.8 4.5-1.7 7.5-5.2 7.5-9.8V6z" }), h("path", { d: "m8.6 12.1 2.4 2.4 4.6-5" }));
			return h("svg", common, h("circle", {
				cx: 12,
				cy: 12,
				r: 9
			}), h("path", { d: "M12 10.5V17M12 7.2v.2" }));
		}
		/** fields：两列 label/value，细虚线分隔；长文本折行。 */
		function FieldsBlock({ block }) {
			const fields = Array.isArray(block?.fields) ? block.fields : [];
			if (!fields.length) return h(EmptyHint, null);
			return h("div", { style: {
				display: "flex",
				flexDirection: "column"
			} }, fields.map((field, index) => h("div", {
				key: `${index}-${textOf(field?.label)}`,
				style: {
					display: "grid",
					gridTemplateColumns: "minmax(108px, 172px) minmax(0, 1fr)",
					columnGap: T.gap.md,
					alignItems: "baseline",
					padding: "7px 0",
					borderBottom: index === fields.length - 1 ? "none" : `1px dashed ${T.borderSoft}`
				}
			}, h("span", { style: {
				color: T.text4,
				fontSize: T.font.sm
			} }, textOf(field?.label) || "—"), h("span", { style: {
				color: toneColor(field?.tone),
				fontSize: T.font.base,
				lineHeight: T.line,
				whiteSpace: "pre-wrap",
				wordBreak: "break-word"
			} }, valueText(field?.value)))));
		}
		/** text：保留换行的纯文本；报告模型里的文本已经格式化好，渲染层只转义。 */
		function TextBlock({ block }) {
			const text = textOf(block?.text);
			if (!text) return h(EmptyHint, null);
			return h("div", { style: {
				color: T.text2,
				fontSize: T.font.base,
				lineHeight: T.line,
				whiteSpace: "pre-wrap",
				wordBreak: "break-word"
			} }, text);
		}
		/** list：条目默认中性灰，语义色只给"危险/通过"这类有含义的条目。 */
		function ListBlock({ block }) {
			const items = Array.isArray(block?.items) ? block.items : [];
			if (!items.length) return h(EmptyHint, null);
			return h("ul", { style: {
				margin: 0,
				padding: 0,
				listStyle: "none",
				display: "flex",
				flexDirection: "column",
				gap: 4
			} }, items.map((item, index) => h("li", {
				key: index,
				style: {
					display: "flex",
					alignItems: "baseline",
					gap: 8,
					color: T.text2,
					fontSize: T.font.base,
					lineHeight: T.line
				}
			}, h("span", { style: {
				width: 5,
				height: 5,
				flex: "0 0 5px",
				borderRadius: 999,
				background: toneColor(item?.tone ?? "neutral") === T.text2 ? T.text4 : toneColor(item?.tone ?? "neutral"),
				marginTop: 8
			} }), h("span", { style: {
				minWidth: 0,
				wordBreak: "break-word"
			} }, valueText(item?.text), item?.meta ? h("span", { style: {
				...styles.sectionHint,
				marginLeft: 8
			} }, `· ${item.meta}`) : null))));
		}
		/** 一行表格：hover 才给浅底，保持静态画面干净。 */
		function TableRow({ columns, row }) {
			const [hovered, setHovered] = (0, react.useState)(false);
			const tones = row?.tones && typeof row.tones === "object" ? row.tones : {};
			return h("tr", {
				onMouseEnter: () => setHovered(true),
				onMouseLeave: () => setHovered(false),
				style: {
					background: hovered ? "#f5f5f8" : "#fff",
					transition: "background .15s ease"
				}
			}, columns.map((column) => {
				const key = String(column?.key ?? column?.label ?? "");
				const right = column?.align === "right";
				const tone = TABLE_TONES.has(tones[key]) ? tones[key] : null;
				const raw = row?.[key];
				const empty = raw === null || raw === void 0 || String(raw).trim() === "";
				return h("td", {
					key,
					style: {
						padding: "10px 12px",
						textAlign: right ? "right" : "left",
						fontVariantNumeric: right ? "tabular-nums" : "normal",
						whiteSpace: right ? "nowrap" : "normal",
						wordBreak: "break-word",
						borderTop: `1px solid ${T.borderSoft}`,
						color: empty ? T.text4 : T.text2,
						fontSize: T.font.base,
						lineHeight: 1.7
					}
				}, empty ? "—" : tone ? h(Tag, { tone }, valueText(raw)) : valueText(raw));
			}));
		}
		/** table：表头 #eaedf1、行 hover #f5f5f8；数字右对齐 + tnum；状态列用家族 Tag。 */
		function TableBlock({ block }) {
			const rows = Array.isArray(block?.rows) ? block.rows : [];
			const declared = Array.isArray(block?.columns) ? block.columns : [];
			const columns = declared.length ? declared : rows[0] && typeof rows[0] === "object" ? Object.keys(rows[0]).filter((key) => key !== "tones").map((key) => ({
				key,
				label: key
			})) : [];
			if (!columns.length) return h(EmptyHint, { text: "未填写" });
			return h("div", { style: {
				overflowX: "auto",
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rSm,
				background: T.surface
			} }, h("table", { style: {
				borderCollapse: "collapse",
				width: "100%",
				fontSize: T.font.sm,
				lineHeight: 1.7
			} }, h("thead", null, h("tr", null, columns.map((column) => h("th", {
				key: String(column?.key ?? column?.label ?? ""),
				style: {
					padding: "10px 12px",
					textAlign: column?.align === "right" ? "right" : "left",
					background: "#eaedf1",
					color: T.text4,
					fontWeight: 500,
					fontSize: T.font.sm,
					whiteSpace: "nowrap",
					borderBottom: `1px solid ${T.border}`
				}
			}, textOf(column?.label) || textOf(column?.key) || "—")))), h("tbody", null, rows.length ? rows.map((row, rowIndex) => h(TableRow, {
				key: rowIndex,
				columns,
				row
			})) : h("tr", null, h("td", {
				colSpan: Math.max(1, columns.length),
				style: {
					padding: "14px 12px",
					...styles.sectionHint
				}
			}, "未填写")))));
		}
		/** code：亮色等宽块，最大高度内滚动，不把整页撑爆。 */
		function CodeBlock({ block }) {
			const text = String(block?.text ?? "");
			if (!text.trim()) return h(EmptyHint, null);
			return h("pre", { style: {
				...styles.pre,
				margin: 0,
				maxHeight: 360,
				background: T.bg,
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rBase,
				fontSize: 12,
				lineHeight: 1.7,
				color: T.text2
			} }, text);
		}
		/** tags：短标签，颜色跟随模型给的 tone。 */
		function TagsBlock({ block }) {
			const items = Array.isArray(block?.items) ? block.items : [];
			if (!items.length) return h(EmptyHint, null);
			return h("div", { style: {
				display: "flex",
				gap: 6,
				flexWrap: "wrap"
			} }, items.map((item, index) => h(Tag, {
				key: index,
				tone: item?.tone ?? "neutral"
			}, textOf(item?.label) || textOf(item?.text) || "—")));
		}
		/** 单个 block：标题（可选）+ 对应渲染；未知类型显示一句提示，不白屏。 */
		function ReportBlock({ block }) {
			if (!block || typeof block !== "object") return null;
			const body = block.type === "fields" ? h(FieldsBlock, { block }) : block.type === "text" ? h(TextBlock, { block }) : block.type === "list" ? h(ListBlock, { block }) : block.type === "table" ? h(TableBlock, { block }) : block.type === "code" ? h(CodeBlock, { block }) : block.type === "tags" ? h(TagsBlock, { block }) : h(EmptyHint, { text: `未支持的报告块：${textOf(block.type) || "未知"}` });
			return h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 6
			} }, block.title ? h("div", { style: {
				color: T.text2,
				fontSize: T.font.sm,
				fontWeight: 600
			} }, block.title) : null, body);
		}
		/**
		* 纯渲染：固定分节的只读报告。
		* 测试直接 renderToStaticMarkup 这个组件即可覆盖六种 block 与转义。
		*/
		function ReportSections({ sections }) {
			const list = Array.isArray(sections) ? sections : [];
			if (!list.length) return h(HintText, null, "报告还没有分节内容。");
			return h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: T.gap.sm
			} }, list.map((section, index) => {
				const blocks = Array.isArray(section?.blocks) ? section.blocks : [];
				return h("section", {
					key: section?.id ?? index,
					style: {
						...styles.card,
						padding: "16px 20px",
						display: "flex",
						flexDirection: "column",
						gap: T.gap.sm
					}
				}, h("div", { style: {
					display: "flex",
					alignItems: "flex-start",
					gap: 10,
					paddingBottom: 12,
					borderBottom: `1px solid ${T.borderSoft}`
				} }, h("span", { style: {
					width: 28,
					height: 28,
					flex: "0 0 28px",
					borderRadius: T.rBase,
					background: T.brandSoft,
					color: T.brand,
					fontSize: T.font.sm,
					fontWeight: 600,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					fontVariantNumeric: "tabular-nums"
				} }, index + 1), h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2,
					minWidth: 0
				} }, h("h3", { style: {
					margin: 0,
					fontSize: T.font.lg,
					fontWeight: 600,
					color: T.text
				} }, section?.title ?? "未命名分节"), section?.summary ? h("span", { style: {
					fontSize: T.font.sm,
					color: T.text3,
					lineHeight: T.line
				} }, section.summary) : null)), h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: T.gap.sm
				} }, blocks.length ? blocks.map((block, blockIndex) => h(ReportBlock, {
					key: blockIndex,
					block
				})) : h(EmptyHint, null)));
			}));
		}
		/** 剪贴板：优先 navigator.clipboard；非安全上下文退化到 execCommand，失败如实抛错。 */
		async function writeClipboard(text) {
			if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				return true;
			}
			if (typeof document !== "undefined" && typeof document.execCommand === "function") {
				const area = document.createElement("textarea");
				area.value = text;
				area.setAttribute("readonly", "");
				area.style.position = "fixed";
				area.style.left = "-9999px";
				area.style.opacity = "0";
				document.body?.appendChild(area);
				area.select();
				const ok = document.execCommand("copy");
				document.body?.removeChild(area);
				return ok;
			}
			return false;
		}
		/** 统计卡：淡彩渐变底 + 圆角图标座 + 26px/700/tnum 数值（家族招牌）。 */
		function StatCard({ label, value, hint, color, tint, icon }) {
			return h("div", { style: {
				flex: "1 1 180px",
				minWidth: 156,
				padding: "14px 18px",
				borderRadius: T.rLg,
				border: `1px solid ${T.borderSoft}`,
				background: `linear-gradient(135deg, ${tint} 0%, ${T.surface} 100%)`,
				boxShadow: T.shadowCard,
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "space-between",
				gap: T.gap.xs
			} }, h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 2,
				minWidth: 0
			} }, h("span", { style: {
				fontSize: T.font.sm,
				color: T.text4
			} }, label), h("span", { style: {
				fontSize: 26,
				fontWeight: 700,
				lineHeight: 1.25,
				color,
				fontVariantNumeric: "tabular-nums"
			} }, value), hint ? h("span", { style: {
				fontSize: T.font.xs,
				color: T.text4,
				lineHeight: 1.5
			} }, hint) : null), h("span", { style: {
				width: 36,
				height: 36,
				flex: "0 0 36px",
				borderRadius: 9,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				background: `${color}15`,
				color
			} }, h(Icon, {
				kind: icon,
				size: 18
			})));
		}
		/** PageContainer 式页头：标题 + 副信息 + 状态 Tag + extra 操作位。 */
		function ReportHeader({ report, itemId, loading, toolbar, onRefresh }) {
			const verdict = VERDICT_STYLE[report.verdict] ?? VERDICT_STYLE.incomplete;
			return h("div", { style: {
				...styles.card,
				padding: "16px 20px",
				display: "flex",
				alignItems: "flex-start",
				gap: T.gap.sm,
				flexWrap: "wrap"
			} }, h("span", { style: {
				width: 36,
				height: 36,
				flex: "0 0 36px",
				borderRadius: 9,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				background: T.brandSoft,
				color: T.brand
			} }, h(Icon, {
				kind: "file",
				size: 20
			})), h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 4,
				minWidth: 0,
				flex: "1 1 360px"
			} }, h("div", { style: {
				display: "flex",
				alignItems: "baseline",
				gap: 8,
				flexWrap: "wrap"
			} }, h("h2", { style: {
				margin: 0,
				fontSize: T.font.lg,
				fontWeight: 600,
				color: T.text,
				lineHeight: 1.4,
				wordBreak: "break-word"
			} }, textOf(report.title) || "开发报告"), h("span", { style: {
				color: T.text4,
				fontSize: T.font.sm
			} }, "— 开发报告")), h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				flexWrap: "wrap"
			} }, h("span", { style: {
				...styles.mono,
				color: T.text4
			} }, report.itemId ?? itemId ?? "—"), h(Tag, { tone: verdict.tone }, report.verdictLabel ?? verdict.label), h(Tag, { tone: "neutral" }, report.statusLabel ?? statusText(report.status)), h(Tag, { tone: "neutral" }, report.stageLabel ?? report.stage ?? "阶段未知"), h("span", { style: styles.sectionHint }, `生成于 ${report.generatedAtLabel ?? fmtTime(report.generatedAt)}`)), report.summary?.goal ? h("div", { style: {
				fontSize: T.font.sm,
				color: T.text3,
				lineHeight: T.line,
				marginTop: 2
			} }, `目标：${report.summary.goal}`) : null), h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: T.gap.xs,
				flexWrap: "wrap"
			} }, h(Button, {
				style: miniButton,
				disabled: loading,
				onClick: onRefresh,
				children: loading ? "刷新中…" : "刷新"
			}), ...toolbar));
		}
		/**
		* 流程详情的「报告」页签：进入即取数，工具栏支持刷新/打开完整报告/保存/复制 Markdown。
		* 只有这个组件挂载时才发报告请求，所以别的页签轮询不会顺带请求报告。
		*/
		function ReportView({ itemId, onNotice, onError }) {
			const [data, setData] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [saved, setSaved] = (0, react.useState)(null);
			const [saveBusy, setSaveBusy] = (0, react.useState)(false);
			const [copyBusy, setCopyBusy] = (0, react.useState)(false);
			const [helpOpen, setHelpOpen] = (0, react.useState)(true);
			const requestSeq = (0, react.useRef)(0);
			const report = data?.report ?? null;
			async function load() {
				if (!itemId) {
					setLoading(false);
					setError("缺少流程 id，无法生成报告");
					return;
				}
				const seq = ++requestSeq.current;
				setLoading(true);
				setError("");
				setNotice("");
				try {
					const body = await api(`${API.report}?id=${encodeURIComponent(itemId)}`);
					if (seq !== requestSeq.current) return;
					setData({
						report: body.report ?? null,
						markdown: body.markdown ?? ""
					});
					setSaved(null);
				} catch (err) {
					if (seq !== requestSeq.current) return;
					const message = errorText(err);
					setError(message);
					onError?.(message);
				} finally {
					if (seq === requestSeq.current) setLoading(false);
				}
			}
			(0, react.useEffect)(() => {
				load();
			}, [itemId]);
			/** 新标签打开 Host 渲染好的整页 HTML；被拦截/不可用时如实提示，不假装成功。 */
			function openFullReport() {
				const url = `${API.report}?id=${encodeURIComponent(itemId)}&format=html`;
				try {
					if (typeof window === "undefined" || typeof window.open !== "function") throw new Error("当前环境不支持打开新标签页");
					if (window.open(url, "_blank", "noopener") === null) setNotice("已尝试在新标签页打开完整报告；如果没有看到新标签，请允许本站弹窗，或先「保存到本机」。");
				} catch (err) {
					setNotice(`打不开完整报告：${errorText(err)}；可以改用「保存到本机」。`);
				}
			}
			async function copyMarkdown() {
				if (copyBusy) return;
				const markdown = data?.markdown ?? "";
				if (!markdown) {
					setNotice("当前报告没有可复制的 Markdown。");
					return;
				}
				setCopyBusy(true);
				setNotice("");
				try {
					if (!await writeClipboard(markdown)) throw new Error("浏览器没有提供剪贴板权限");
					setNotice("已复制 Markdown 到剪贴板");
					onNotice?.("已复制 Markdown");
				} catch (err) {
					setNotice(`复制 Markdown 失败：${errorText(err)}；可以打开完整报告后手动复制。`);
					onError?.("复制 Markdown 失败");
				} finally {
					setCopyBusy(false);
				}
			}
			async function saveReport() {
				if (saveBusy) return;
				setSaveBusy(true);
				setNotice("");
				try {
					const body = await api(API.report, {
						method: "POST",
						body: JSON.stringify({
							id: itemId,
							action: "save"
						})
					});
					if (body.report) setData({
						report: body.report,
						markdown: body.markdown ?? data?.markdown ?? ""
					});
					const nextSaved = body.saved ?? null;
					setSaved(nextSaved);
					const paths = [nextSaved?.html, nextSaved?.markdown].filter(Boolean);
					setNotice(paths.length ? `已保存到本机：${paths.join(" · ")}` : "报告已保存。");
					onNotice?.(paths.length ? `已保存到本机：${paths[0]}` : "报告已保存");
				} catch (err) {
					setNotice(`保存到本机失败：${errorText(err)}`);
					onError?.("保存到本机失败");
				} finally {
					setSaveBusy(false);
				}
			}
			if (loading && !report) return h("div", { style: {
				...styles.card,
				display: "flex",
				alignItems: "center",
				gap: T.gap.xs,
				color: T.text2
			} }, h(Spinner, {
				size: 14,
				tone: "accent",
				title: "正在生成开发报告"
			}), h("span", null, "正在生成开发报告…"));
			const errorCard = error ? h("div", { style: styles.dangerCard }, h("div", { style: { fontWeight: 600 } }, "报告加载失败"), h("div", { style: {
				marginTop: 4,
				whiteSpace: "pre-wrap"
			} }, error), h("div", { style: { marginTop: 8 } }, h(Button, {
				style: miniButton,
				onClick: load,
				children: "重试"
			}))) : null;
			if (!report) return h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: T.gap.sm
			} }, errorCard, notice ? h("div", { style: styles.infoCard }, notice) : null, error ? null : h(HintText, null, "没有拿到报告内容，可以点「刷新」重试。"), h(Button, {
				style: miniButton,
				onClick: load,
				children: "刷新"
			}));
			const verdict = VERDICT_STYLE[report.verdict] ?? VERDICT_STYLE.incomplete;
			const summary = report.summary ?? {};
			const isAnalysis = report.intent === "analysis";
			const intentText = report.intent === "bug" ? "bug" : isAnalysis ? "分析" : "feature";
			const baseline = summary.baseline ?? null;
			const submission = summary.submission ?? null;
			const testTone = summary.testsTotal > 0 && summary.testsPassed >= summary.testsTotal ? {
				color: T.ok,
				tint: T.okSoft
			} : summary.testsPassed > 0 ? {
				color: T.warnText,
				tint: T.warnSoft
			} : {
				color: T.text4,
				tint: T.surface2
			};
			const taskTone = summary.tasksTotal > 0 && summary.tasksDone >= summary.tasksTotal ? {
				color: T.ok,
				tint: T.okSoft
			} : {
				color: T.brand,
				tint: T.brandSoft
			};
			const toolbar = [
				h(Button, {
					key: "open",
					style: miniButton,
					onClick: openFullReport,
					children: "打开完整报告"
				}),
				h(Button, {
					key: "save",
					style: miniButton,
					disabled: saveBusy,
					onClick: saveReport,
					children: saveBusy ? "保存中…" : "保存到本机"
				}),
				h(Button, {
					key: "copy",
					style: miniButton,
					disabled: copyBusy,
					onClick: copyMarkdown,
					children: copyBusy ? "复制中…" : "复制 Markdown"
				})
			];
			const banner = h("div", { style: {
				borderLeft: `3px solid ${verdict.border}`,
				borderRadius: T.rBase,
				background: verdict.background,
				color: verdict.color,
				padding: "12px 14px",
				display: "flex",
				flexDirection: "column",
				gap: 6
			} }, h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				flexWrap: "wrap"
			} }, h("span", { style: {
				fontSize: T.font.md,
				fontWeight: 600
			} }, `结论：${report.verdictLabel ?? verdict.label}`), h("span", { style: {
				fontSize: T.font.sm,
				lineHeight: T.line,
				fontWeight: 400
			} }, report.verdictReason || "报告没有给出结论原因。")), h("div", { style: {
				display: "flex",
				gap: 6,
				flexWrap: "wrap",
				alignItems: "center"
			} }, h(Tag, { tone: isAnalysis ? "accent" : "neutral" }, intentText), baseline?.commit ? h(Tag, { tone: "neutral" }, `baseline ${String(baseline.commit).slice(0, 8)}${baseline.branch ? ` @ ${baseline.branch}` : ""}`) : h(Tag, { tone: "warn" }, "未记录 baseline"), submission ? h(Tag, { tone: submission.pushed ? "ok" : "warn" }, submission.commit ? `已提交 ${String(submission.commit).slice(0, 8)}${submission.branch ? ` @ ${submission.branch}` : ""}` : `提交 ${submission.branch ?? "—"}`) : null, summary.workspace?.name ? h(Tag, { tone: "accent" }, `虚拟库 ${summary.workspace.name}`) : null));
			const stats = h("div", { style: {
				display: "flex",
				gap: T.gap.sm,
				flexWrap: "wrap"
			} }, isAnalysis ? h(StatCard, {
				label: "分析产出",
				value: "结论",
				hint: "只读排查 · 含证据与补丁建议",
				color: T.brand,
				tint: T.brandSoft,
				icon: "file"
			}) : h(StatCard, {
				label: "变更文件",
				value: numberText(summary.changedFiles),
				hint: `+${numberText(summary.added)} / -${numberText(summary.removed)}`,
				color: T.brand,
				tint: T.brandSoft,
				icon: "file"
			}), h(StatCard, {
				label: "测试通过",
				value: `${numberText(summary.testsPassed)}/${numberText(summary.testsTotal)}`,
				hint: "本机自测 · 环境测试",
				color: testTone.color,
				tint: testTone.tint,
				icon: "test"
			}), h(StatCard, {
				label: "任务完成",
				value: `${numberText(summary.tasksDone)}/${numberText(summary.tasksTotal)}`,
				hint: "后台台账实时回写",
				color: taskTone.color,
				tint: taskTone.tint,
				icon: "tasks"
			}), h(StatCard, {
				label: "结论",
				value: report.verdictLabel ?? verdict.label,
				hint: `${report.statusLabel ?? statusText(report.status)} · ${report.stageLabel ?? report.stage ?? "—"}`,
				color: verdict.color,
				tint: verdict.background,
				icon: "verdict"
			}));
			const help = helpOpen ? h("div", { style: {
				display: "flex",
				alignItems: "flex-start",
				gap: 8,
				padding: "10px 12px",
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rBase,
				background: T.bg,
				color: T.text2,
				fontSize: T.font.sm,
				lineHeight: T.line
			} }, h("span", { style: {
				color: T.brand,
				display: "inline-flex",
				marginTop: 2
			} }, h(Icon, {
				kind: "info",
				size: 16
			})), h("span", { style: {
				flex: "1 1 auto",
				minWidth: 0
			} }, "报告由 .dev-hub 台账与本机 git 事实生成，不调用模型、不发网络请求；没有 baseline 或不是 git 仓库时会显式标注「证据不完整」，不伪造 diff。"), h("span", {
				role: "button",
				title: "收起说明",
				onClick: () => setHelpOpen(false),
				style: {
					color: T.text4,
					cursor: "pointer",
					lineHeight: 1,
					padding: "0 2px"
				}
			}, "×")) : null;
			return h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: T.gap.sm
			} }, errorCard, notice ? h("div", { style: styles.infoCard }, notice) : null, saved ? h("div", { style: styles.okCard }, h("div", { style: { fontWeight: 600 } }, "报告已保存到本机"), h("div", { style: {
				...styles.mono,
				marginTop: 4,
				wordBreak: "break-all"
			} }, `HTML：${saved.html ?? "—"}`), h("div", { style: {
				...styles.mono,
				marginTop: 2,
				wordBreak: "break-all"
			} }, `Markdown：${saved.markdown ?? "—"}`), saved.relative?.dir ? h("div", { style: {
				...styles.sectionHint,
				marginTop: 4
			} }, `仓库相对位置：${saved.relative.dir}`) : null) : null, h(ReportHeader, {
				report,
				itemId,
				loading,
				toolbar,
				onRefresh: load
			}), help, banner, report.verdict === "incomplete" ? h("div", { style: styles.warnCard }, "流程还没完成，报告会随台账更新。现在看到的是阶段性结果，不代表已通过验收。") : null, report.verdict === "blocked" ? h("div", { style: styles.warnCard }, "流程被标记为阻塞；报告只反映当前事实，解除阻塞后再刷新。") : null, stats, h(ReportSections, { sections: report.sections }), h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "4px 2px 8px",
				fontSize: T.font.xs,
				color: T.text4
			} }, h("span", null, "由 dsh-dev-hub 生成 · 只读视图"), h("div", { style: styles.spacer }), h("span", { style: styles.num }, `报告生成于 ${report.generatedAtLabel ?? fmtTime(report.generatedAt)}`)));
		}
		/** 文件类型规则：顺序即优先级；第一个命中的规则生效。 */
		const KEY_FILE_RULES = [
			{
				kind: "数据库模型",
				weight: 100,
				re: /(^|\/)(migrations?|db|database|schema|models?|entities|entity|dao|mappers?|repository|repositories|sql)(\/|$|\.)|\.sql$|(^|\/)V\d+__/i
			},
			{
				kind: "接口/契约",
				weight: 70,
				re: /(controller|apis?|routes?|router|handlers?|dto|vo|openapi|swagger)/i
			},
			{
				kind: "配置",
				weight: 55,
				re: /(application\.(ya?ml|properties)|bootstrap\.(ya?ml|properties)|pom\.xml|build\.gradle|package\.json|dockerfile|\.env)/i
			}
		];
		function keyFileKind(file) {
			const path = String(file?.path ?? file?.displayPath ?? "");
			if (!path) return null;
			return KEY_FILE_RULES.find((rule) => rule.re.test(path)) ?? null;
		}
		/**
		* 从变更文件里挑出关键改动（最多 limit 个）。
		* - 二进制文件没有可读 diff，跳过；
		* - 没有类型命中的文件也能入选（按改动行数排），保证“1~5 个”里不空着；
		* - scope 外文件降权，但仍可入选。
		* @returns {Array<{ file: object, kind: string, score: number }>}
		*/
		function pickKeyFiles(files, limit = 5) {
			return (Array.isArray(files) ? files : []).filter((file) => file && !file.binary).filter((file) => {
				return Number(file.added ?? 0) + Number(file.removed ?? 0) > 0 || file.status === "added" || file.status === "deleted" || file.status === "renamed";
			}).map((file) => {
				const rule = keyFileKind(file);
				const changed = Math.min(400, Number(file.added ?? 0) + Number(file.removed ?? 0));
				const scopePenalty = file.inScope === false ? 20 : 0;
				return {
					file,
					kind: rule?.kind ?? "其他改动",
					score: (rule?.weight ?? 10) + changed / 10 - scopePenalty
				};
			}).sort((left, right) => right.score - left.score).slice(0, Math.max(0, limit));
		}
		/** 截取 diff 前 maxLines 行；返回剩余行数，界面据此提示“还有多少行”。 */
		function excerptLines(lines, maxLines = 40) {
			const list = Array.isArray(lines) ? lines : [];
			if (list.length <= maxLines) return {
				lines: list,
				truncated: false,
				hidden: 0
			};
			return {
				lines: list.slice(0, maxLines),
				truncated: true,
				hidden: list.length - maxLines
			};
		}
		//#endregion
		//#region src/client/next-steps.mjs
		/**
		* 流程详情里的「下一步」建议：按事实算，不调模型、不猜。
		*
		* 输入：流程台账（阶段/任务/测试/风险/会话绑定）+ 会话实时状态。
		* 输出：一段状态摘要 + 最多 3 条可执行建议（每条带动作 id，由界面绑定到已有能力）。
		*
		* 为什么要它：进入一个流程时，人最想问的是"现在到哪了、接下来该干嘛"。
		* 把这些从台账里算出来，比让人自己翻页签找按钮更直接。
		*/
		const STAGE_TEXT = {
			discovery: "需求澄清",
			techdoc: "技术文档",
			plan: "开发计划",
			develop: "开发中",
			review: "独立评审",
			verify: "测试验证",
			submit: "待提交",
			done: "已完成"
		};
		const TEST_TEXT = {
			not_run: "未运行",
			running: "运行中",
			passed: "已通过",
			failed: "未通过"
		};
		/** 状态摘要：一行一个事实，给界面画 chips。 */
		function describeFlow(item, session) {
			const workflow = item?.workflow ?? {};
			const tests = workflow.tests ?? {};
			const review = describeReview(item);
			const tasks = item?.tasks ?? [];
			const done = tasks.filter((task) => task.done).length;
			const risks = (item?.risks ?? []).map(String).filter(Boolean);
			const acknowledged = new Set((item?.riskAcks ?? []).map(String));
			return {
				stage: workflow.stage ?? "discovery",
				stageLabel: STAGE_TEXT[workflow.stage] ?? STAGE_LABELS[workflow.stage] ?? "需求澄清",
				stageReason: workflow.stageReason ?? "",
				status: item?.status ?? "planned",
				intent: workflow.intent === "analysis" ? "analysis" : workflow.intent === "bug" ? "bug" : "feature",
				tasks: {
					done,
					total: tasks.length
				},
				localTest: tests.local?.status ?? "not_run",
				localTestLabel: tests.local?.stale ? "已过期（需重跑）" : TEST_TEXT[tests.local?.status] ?? "未运行",
				localTestStale: Boolean(tests.local?.stale),
				environmentTest: tests.environment?.status ?? "not_run",
				environmentTestLabel: tests.environment?.stale ? "已过期（需重跑）" : TEST_TEXT[tests.environment?.status] ?? "未运行",
				environmentTestStale: Boolean(tests.environment?.stale),
				rework: Boolean(workflow.rework?.at),
				reworkReason: workflow.rework?.reason ?? "",
				review: {
					status: review.status,
					verdict: review.verdict,
					round: review.round,
					total: review.total,
					passed: review.passed,
					failed: review.failed,
					errored: review.errored,
					pending: review.pending,
					allowed: review.allowed,
					label: REVIEW_STATUS_LABELS[review.status] ?? review.status,
					corrections: review.corrections
				},
				risks: risks.filter((text) => !acknowledged.has(text)).length,
				risksTotal: risks.length,
				risksAcked: risks.filter((text) => acknowledged.has(text)).length,
				changePoints: (item?.changePoints ?? []).length,
				session: session ? {
					id: session.sessionId ?? null,
					bound: Boolean(session.sessionId),
					running: Boolean(session.running),
					alive: session.alive ?? null,
					turns: session.turns ?? 0,
					lastText: session.lastText ?? "",
					reason: session.reason ?? null
				} : {
					id: null,
					bound: Boolean(item?.session?.id),
					running: false,
					alive: null,
					turns: 0
				}
			};
		}
		/**
		* 下一步建议（最多 3 条）。action 由界面映射到已有按钮：
		* - 'launch'：开启开发会话（已有会话时顶部按钮走轻量 continue，不重发 Context Pack）
		* - 'ask-session'：把建议内容发到已绑定的会话（payload 是给会话的话）
		* - 'start-review'：继续推进即开始评审（复用 Host dispatch，pending 时幂等不重复派发）
		* - 'review'：打开独立评审页签（只读看进度/结论与纠偏意见）
		* - 'local-test' / 'env-test' / 'submit'：已有测试与提交能力
		* - 'edit-plan' / 'edit-risks'：跳到对应页签（风险区直接滚到勾选列表，勾选＝已知晓）
		* - 'bind-session'：去开一个开发会话
		*/
		function suggestNextSteps(item, session) {
			const summary = describeFlow(item, session);
			const isAnalysis = summary.intent === "analysis";
			const localTestValid = summary.localTest === "passed" && !summary.localTestStale;
			const environmentTestValid = summary.environmentTest === "passed" && !summary.environmentTestStale;
			const steps = [];
			const push = (action, title, hint) => steps.push({
				action,
				title,
				hint
			});
			if (summary.status === "done" || summary.stage === "done") return {
				summary,
				steps: []
			};
			if (summary.status === "blocked" || summary.risks > 0) push("edit-risks", summary.risks > 0 ? `处理 ${summary.risks} 个风险/阻塞` : "流程被阻塞，先处理阻塞", summary.risks > 0 ? `逐条勾选「已知晓」后这里的数量会减少（已确认 ${summary.risksAcked}/${summary.risksTotal}）` : `风险都已知晓（${summary.risksAcked}/${summary.risksTotal}）；把阻塞原因写清楚，或解除阻塞`);
			if (!summary.session.bound) {
				push("launch", isAnalysis ? "开启分析会话" : "开启开发会话", isAnalysis ? "把规范与 Context Pack 交给会话，按「只读排查 → 结论」推进，不改代码" : "把规范与 Context Pack 交给会话，让它开始改代码");
				if (summary.stage === "plan" || summary.stage === "discovery" || summary.stage === "techdoc") push("edit-plan", "先补全计划", "计划与验收齐了，开工门禁才会放行");
			} else if (summary.session.running) push("ask-session", "看看它现在在做什么", "会话正在跑：让它先汇报进度，再决定要不要改方向");
			else if (summary.stage === "review" && summary.review.status === "idle") {} else push("ask-session", "继续推进", "会话空闲：把下一个任务或改进点直接发给它");
			const review = summary.review;
			if (summary.session.bound && !summary.session.running) {
				if (review.status === "failed") push("review", "按审核意见纠偏后重新评审", `独立评审未通过：${review.failed} 位审核员给出 ${review.corrections.reduce((sum, entry) => sum + entry.findings.length, 0)} 条意见；改完点顶栏「继续推进」重试评审`);
				else if (review.status === "error") push("start-review", "重试评审", "有审核员未返回结论：点它重试派发（流程标记为待处理，不能当成通过）");
				else if (review.status === "pending") push("review", "独立评审进行中", `第 ${review.round} 轮：${review.passed}/${review.total} 位已返回，等结论（不重复派发）`);
				else if (!localTestValid) push("local-test", summary.localTestStale ? "重跑本机自测" : "跑本机自测", summary.localTestStale ? "测试通过后代码/诉求又有变化，旧结果已过期；重跑后才会进入评审" : isAnalysis ? `分析流程用本机自测作为只读证据（当前${summary.localTestLabel}）；通过即结束，不进入提交` : `本机自测当前${summary.localTestLabel}，跑通后才能点「继续推进」开始评审`);
				else if (isAnalysis) {} else if (review.status === "idle") push("start-review", "继续推进即开始评审", "点它即自动开始独立评审（审核员按默认配置产生）；全部通过才进入测试验证");
				else if (!environmentTestValid) push("env-test", summary.environmentTestStale ? "重跑环境测试" : "跑环境测试", summary.environmentTestStale ? "本机自测已重跑，之前的环境结果基于旧代码，需要重跑" : "评审已通过、本机自测已通过；环境验证通过后阶段会进入「待提交」");
				else if (summary.stage !== "done") push("submit", "提交代码", "验证都过了：勾选变更文件、写提交信息");
			}
			if (summary.tasks.total && summary.tasks.done < summary.tasks.total) push("edit-plan", `还有 ${summary.tasks.total - summary.tasks.done} 个任务未完成`, "把未完成任务发给会话，或先在「计划」里调整");
			return {
				summary,
				steps: steps.slice(0, 3)
			};
		}
		/**
		* 「继续推进」的轻量开场：只把当前事实交给会话，不重发整包 Context Pack。
		* 会话里已有规范与上下文，再灌一遍既费 token 又会淹没之前聊过的决定。
		*/
		function continuePrompt(summary) {
			return `继续推进这个开发流程（${[
				`阶段 ${summary.stageLabel}`,
				`任务 ${summary.tasks.done}/${summary.tasks.total}`,
				`本机自测 ${summary.localTestLabel}`,
				`环境测试 ${summary.environmentTestLabel}`
			].join(" · ")}）。先看一眼台账最新状态，接着做未完成的部分；改动前先说你打算怎么做，完成后回写任务与测试结果。`;
		}
		/** 给会话的开场问题：把状态摘要与用户诉求合成一句可发送的话。 */
		function composeAsk(summary, userText) {
			const text = String(userText ?? "").trim();
			const context = [
				`当前流程状态：${summary.stageLabel}${summary.stageReason ? `（${summary.stageReason}）` : ""}`,
				`任务 ${summary.tasks.done}/${summary.tasks.total}`,
				`本机自测 ${summary.localTestLabel}`,
				`环境测试 ${summary.environmentTestLabel}`
			].join(" · ");
			if (text) return `${context}\n\n${text}\n\n（请按上面的现状推进；改动前先说明你打算怎么做，完成后回写任务与测试结果。）`;
			return `${context}\n\n请评估当前进度：下一步应该做什么？如果有改进建议（风险、测试缺口、实现问题）请直接说，然后继续推进。`;
		}
		//#endregion
		//#region src/client/index.mjs
		/**
		* dsh-dev-hub browser half.
		*
		* 入口是左上角面板列表里的一个图标（sidebar.panellist#dev-hub），点击后由
		* main#dev-hub 渲染整块「开发工作站」大页面：首次向导、开发站首页（项目切换、
		* 流程列表、并行检查）、流程详情、环境探测、测试与提交都在这一页里。
		* All data goes through the host's /api/dev-hub/* routes.
		*
		* 文件分工：common.mjs（样式/请求/原子组件）、home.mjs（开发站首页列表与并行区）、
		* chat.mjs（新建流程的对话式入口，含扫描/追问/计划）；本文件保留前端壳、
		* 流程台账与详情、环境探测、测试与提交等既有功能。
		*/
		const INTENT_LABEL = {
			bug: "定位/修复 bug",
			feature: "开发需求功能",
			analysis: "分析"
		};
		const INTENT_ORDER = [
			"bug",
			"feature",
			"analysis"
		];
		/** 流程类型只认三态；旧数据/缺省按 feature 展示。 */
		function intentOf(value) {
			return INTENT_ORDER.includes(value) ? value : "feature";
		}
		/** 点一下切换到下一类：bug → feature → analysis → bug。 */
		function nextIntentOf(value) {
			const current = intentOf(value);
			return INTENT_ORDER[(INTENT_ORDER.indexOf(current) + 1) % INTENT_ORDER.length];
		}
		function Modal({ title, onClose, children, width }) {
			return h("div", {
				style: styles.modal,
				onClick: (event) => {
					if (event.target === event.currentTarget) onClose?.();
				}
			}, h("div", { style: {
				...styles.modalCard,
				...width ? { width } : {}
			} }, h("div", { style: {
				...styles.row,
				marginBottom: T.gap.md
			} }, h("h3", { style: { margin: 0 } }, title), h("div", { style: { flex: 1 } }), h(Button, {
				onClick: onClose,
				children: "关闭"
			})), children));
		}
		/**
		* 顶栏「更多」菜单：低频操作收进 ⋯，不再和主操作抢一排按钮。
		* 点击外部/Esc 关闭；菜单项用按钮而不是链接，键盘可达。
		*/
		function HeaderMenu({ items = [], title = "更多（低频操作）" }) {
			const [open, setOpen] = (0, react.useState)(false);
			const rootRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (!open) return void 0;
				const onDocClick = (event) => {
					if (!rootRef.current?.contains(event.target)) setOpen(false);
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("mousedown", onDocClick);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("mousedown", onDocClick);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open]);
			return h("div", {
				ref: rootRef,
				style: { position: "relative" }
			}, h(Button, {
				style: {
					height: 32,
					padding: "0 12px",
					fontSize: 18,
					lineHeight: 1
				},
				title,
				"aria-haspopup": "menu",
				"aria-expanded": open,
				onClick: () => setOpen((value) => !value),
				children: "⋯"
			}), open ? h("div", {
				role: "menu",
				style: {
					position: "absolute",
					top: 38,
					right: 0,
					zIndex: 1002,
					minWidth: 210,
					padding: 4,
					border: `1px solid ${T.borderSoft}`,
					borderRadius: T.rBase,
					background: T.surface,
					boxShadow: T.shadowModal
				}
			}, items.map((item, index) => h("button", {
				key: `${index}-${item.label}`,
				role: "menuitem",
				type: "button",
				disabled: Boolean(item.disabled),
				onClick: () => {
					if (item.disabled) return;
					setOpen(false);
					item.onClick?.();
				},
				onMouseEnter: (event) => {
					event.currentTarget.style.background = T.surface2;
				},
				onMouseLeave: (event) => {
					event.currentTarget.style.background = "transparent";
				},
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 2,
					width: "100%",
					padding: "8px 10px",
					border: "none",
					borderRadius: T.rSm,
					background: "transparent",
					textAlign: "left",
					cursor: item.disabled ? "not-allowed" : "pointer",
					opacity: item.disabled ? .5 : 1,
					color: T.text2,
					fontSize: T.font.sm
				}
			}, h("span", { style: {
				fontWeight: 500,
				color: T.text
			} }, item.label), item.hint ? h("span", { style: {
				fontSize: T.font.xs,
				color: T.text4,
				lineHeight: 1.5
			} }, item.hint) : null))) : null);
		}
		function SetupForm({ state, onDone, mode = "setup", onPickDirectory }) {
			const adding = mode === "add";
			const [repoPath, setRepoPath] = (0, react.useState)(adding ? "" : state?.suggestedRepoPath ?? state?.repo?.path ?? "");
			const [name, setName] = (0, react.useState)(state?.profile?.member ?? "");
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			async function submit(event) {
				event.preventDefault();
				setBusy(true);
				setError("");
				try {
					onDone(await api(API.setup, {
						method: "POST",
						body: JSON.stringify({
							repoPath,
							name
						})
					}));
				} catch (err) {
					setError(errorText(err));
				} finally {
					setBusy(false);
				}
			}
			async function pickDirectory() {
				if (!onPickDirectory) return;
				try {
					const chosen = await onPickDirectory();
					if (chosen) setRepoPath(chosen);
				} catch (err) {
					setError(errorText(err));
				}
			}
			return h("div", { style: styles.card }, h("h3", { style: { margin: "0 0 6px" } }, adding ? "新增代码库" : "初始化 DevHub"), h("p", { style: {
				color: C.muted,
				marginTop: 0
			} }, adding ? "填一个已有代码库的路径（或选择目录）；它会加入代码库卡片，环境自动探测一次后缓存。" : "只需要填代码库路径和你的名字；系统、Shell、JDK、Maven、Git 和可用工具会自动探测。"), h("form", { onSubmit: submit }, h("label", { style: styles.label }, "代码库路径"), h("div", { style: {
				display: "flex",
				gap: T.gap.xs
			} }, h("input", {
				style: {
					...styles.input,
					flex: "1 1 auto"
				},
				value: repoPath,
				placeholder: "/path/to/repository",
				onChange: (event) => setRepoPath(event.target.value)
			}), onPickDirectory ? h(Button, {
				onClick: pickDirectory,
				disabled: busy,
				children: "选择目录"
			}) : null), h("label", { style: styles.label }, "你的名字/成员标识"), h("input", {
				style: styles.input,
				value: name,
				placeholder: "例如：张三",
				onChange: (event) => setName(event.target.value)
			}), h("div", { style: {
				...styles.row,
				marginTop: 12
			} }, h(SubmitButton, {
				disabled: busy,
				children: busy ? "探测中…" : adding ? "添加并探测环境" : "保存并探测环境"
			})), error ? h("p", { style: { color: C.danger } }, error) : null));
		}
		function EnvironmentCard({ env, onDetect }) {
			if (!env) return h("div", { style: styles.card }, "尚未探测本机环境。", h(Button, {
				onClick: onDetect,
				children: "探测环境"
			}));
			const tools = env.tools ?? {};
			const available = Object.keys(tools).filter((name) => tools[name]?.available).sort();
			return h("div", { style: styles.card }, h("div", { style: styles.row }, h("strong", null, "本机环境"), h("span", { style: styles.pill }, `${env.os} ${env.arch}`), env.currentJdk ? h("span", { style: styles.pill }, `JDK ${env.currentJdk.major ?? "?"}`) : null, h(Button, {
				onClick: onDetect,
				children: "重新探测"
			})), h("div", { style: {
				color: C.muted,
				marginTop: 8
			} }, `Shell: ${env.shell?.name ?? "unknown"} · Git: ${env.git?.version ?? "unavailable"}`), env.jdks?.length ? h("div", { style: { marginTop: 8 } }, h("div", { style: styles.label }, "已发现 JDK"), env.jdks.map((jdk) => h("div", {
				key: jdk.path,
				style: { fontSize: 12 }
			}, `${jdk.major ?? "?"} · ${jdk.version ?? ""} · ${jdk.path}`))) : null, h("div", { style: { marginTop: 8 } }, h("div", { style: styles.label }, "可用工具"), available.length ? available.map((name) => h("span", {
				key: name,
				style: {
					...styles.pill,
					marginRight: 4,
					marginBottom: 4
				}
			}, name)) : "无"), env.missing?.length ? h("div", { style: {
				marginTop: 8,
				color: C.muted
			} }, `不可用：${env.missing.join(", ")}`) : null);
		}
		const LOCAL_COMMAND_SLOTS = [
			{
				id: "localTest",
				label: "本机自测命令（localTest）",
				hint: "跑通后流程进入「验证中」"
			},
			{
				id: "environmentTest",
				label: "环境测试命令（environmentTest）",
				hint: "跑通后流程进入「待提交」"
			},
			{
				id: "gate",
				label: "门禁命令（gate）",
				hint: "提交前的检查脚本"
			}
		];
		/**
		* 测试命令分两层：
		* - 项目命令（.dev-hub/project.json）：团队共享，提交到仓库；
		* - 本机命令（~/.dsh/dev-hub/profile.json）：只在这台电脑生效，留空即沿用项目命令，
		*   不提交——每个人本机可能不同（例如本机用 kpipe-dev 做环境部署）。
		* 还支持用一句话描述本机做法，由 dsh agent 结合仓库脚本与已装工具整理成一条命令，人工确认后再保存。
		*/
		function ProjectCommands({ project, localCommands = {}, onSaved }) {
			const commands = project?.context?.commands ?? {};
			const [shared, setShared] = (0, react.useState)({
				localTest: commands.localTest ?? "",
				environmentTest: commands.environmentTest ?? "",
				gate: commands.gate ?? ""
			});
			const [local, setLocal] = (0, react.useState)({
				localTest: localCommands.localTest ?? "",
				environmentTest: localCommands.environmentTest ?? "",
				gate: localCommands.gate ?? ""
			});
			const [busy, setBusy] = (0, react.useState)(false);
			const [message, setMessage] = (0, react.useState)("");
			const [slot, setSlot] = (0, react.useState)("environmentTest");
			const [description, setDescription] = (0, react.useState)("");
			const [generating, setGenerating] = (0, react.useState)(false);
			const [genError, setGenError] = (0, react.useState)("");
			const [suggestion, setSuggestion] = (0, react.useState)(null);
			async function saveShared() {
				setBusy(true);
				setMessage("");
				try {
					const body = await api(API.project, {
						method: "POST",
						body: JSON.stringify({ commands: shared })
					});
					onSaved?.(body.project, body.localCommands ?? local);
					setMessage("已保存项目命令（会随代码库提交，团队共用）");
				} catch (err) {
					setMessage(errorText(err));
				} finally {
					setBusy(false);
				}
			}
			async function saveLocal() {
				setBusy(true);
				setMessage("");
				try {
					const body = await api(API.project, {
						method: "POST",
						body: JSON.stringify({ localCommands: local })
					});
					onSaved?.(body.project, body.localCommands ?? {});
					setMessage("已保存本机命令（只在这台电脑生效，不会提交）");
				} catch (err) {
					setMessage(errorText(err));
				} finally {
					setBusy(false);
				}
			}
			async function generate() {
				if (!description.trim()) {
					setGenError("先用一句话描述你本机怎么做");
					return;
				}
				setGenerating(true);
				setGenError("");
				setSuggestion(null);
				try {
					const body = await api(API.project, {
						method: "POST",
						body: JSON.stringify({
							action: "suggest-local-command",
							phase: slot,
							description
						})
					});
					setSuggestion(body);
				} catch (err) {
					setGenError(errorText(err));
				} finally {
					setGenerating(false);
				}
			}
			const slotLabel = LOCAL_COMMAND_SLOTS.find((entry) => entry.id === slot)?.label ?? slot;
			return h("div", { style: {
				...styles.card,
				marginTop: 12
			} }, h("strong", null, "测试命令"), h("div", { style: {
				color: C.muted,
				fontSize: 12,
				marginTop: 4
			} }, "分两层：项目命令提交到仓库、团队共用；本机命令只存在这台电脑（~/.dsh/dev-hub/profile.json），不提交，也不会影响别人。"), h("div", { style: { marginTop: 10 } }, h("div", { style: styles.sectionTitle }, "项目命令（提交到 .dev-hub/project.json）"), LOCAL_COMMAND_SLOTS.map((entry) => h("div", { key: `shared-${entry.id}` }, h("label", { style: styles.label }, entry.label), h("input", {
				style: styles.input,
				value: shared[entry.id] ?? "",
				placeholder: entry.id === "localTest" ? "例如：mvn -o clean test" : entry.id === "environmentTest" ? "例如：sh scripts/sit.sh" : "例如：sh scripts/check.sh --full",
				onChange: (event) => setShared((current) => ({
					...current,
					[entry.id]: event.target.value
				}))
			}))), h("div", { style: {
				...styles.row,
				marginTop: 8
			} }, h(Button, {
				primary: true,
				disabled: busy,
				onClick: saveShared,
				children: busy ? "保存中…" : "保存项目命令"
			}))), h("div", { style: {
				marginTop: 14,
				paddingTop: 10,
				borderTop: `1px solid ${T.borderSoft}`
			} }, h("div", { style: styles.row }, h("span", { style: styles.sectionTitle }, "本机命令（只在这台电脑生效，不提交）"), h("div", { style: styles.spacer }), h(Tag, { tone: "neutral" }, "本机")), h("div", { style: {
				...styles.sectionHint,
				marginTop: 2
			} }, "留空＝沿用项目命令；填了就在这台电脑上覆盖对应按钮的执行命令。"), LOCAL_COMMAND_SLOTS.map((entry) => h("div", { key: `local-${entry.id}` }, h("label", { style: styles.label }, entry.label), h("input", {
				style: styles.input,
				value: local[entry.id] ?? "",
				placeholder: shared[entry.id] ? `留空则用项目命令：${shared[entry.id]}` : "留空则用项目命令；也可以在这里写本机专用命令",
				onChange: (event) => setLocal((current) => ({
					...current,
					[entry.id]: event.target.value
				}))
			}))), h("div", { style: {
				...styles.row,
				marginTop: 8
			} }, h(Button, {
				primary: true,
				disabled: busy,
				onClick: saveLocal,
				children: busy ? "保存中…" : "保存本机命令"
			}), h("span", { style: styles.sectionHint }, "只写入 ~/.dsh/dev-hub/profile.json"))), h("div", { style: {
				marginTop: 14,
				paddingTop: 10,
				borderTop: `1px solid ${T.borderSoft}`
			} }, h("div", { style: styles.sectionTitle }, "用一句话生成本机命令"), h("div", { style: {
				...styles.sectionHint,
				marginTop: 2
			} }, "描述你本机实际怎么跑（例如：本机用 kpipe-dev 把服务部署到本机环境，再 curl 健康检查）。dsh 会先看仓库脚本和本机已装工具，整理成一条命令交给你确认，不会自动执行。"), h("div", { style: {
				...styles.row,
				marginTop: 6
			} }, h("select", {
				style: {
					...styles.input,
					width: 200
				},
				value: slot,
				onChange: (event) => setSlot(event.target.value)
			}, LOCAL_COMMAND_SLOTS.map((entry) => h("option", {
				key: entry.id,
				value: entry.id
			}, entry.label.replace(/（.*?）/g, "")))), h(Button, {
				disabled: generating,
				onClick: generate,
				children: generating ? "探测中…" : "让 DSH 生成命令"
			})), h("textarea", {
				style: {
					...styles.textarea,
					minHeight: 52,
					marginTop: 6
				},
				value: description,
				placeholder: "例如：本机直接跑 kpipe-dev deploy --local，然后 curl http://127.0.0.1:8080/health 确认起没起来",
				onChange: (event) => setDescription(event.target.value)
			}), genError ? h("div", { style: {
				...styles.dangerCard,
				marginTop: 6
			} }, genError) : null, suggestion ? h("div", { style: {
				...styles.cardFlat,
				marginTop: 8
			} }, h("div", { style: styles.row }, h("strong", null, `建议的${slotLabel}`), h("div", { style: styles.spacer }), suggestion.probe?.ok ? h(Tag, { tone: "ok" }, suggestion.probe.kind === "bin" ? "本机已找到" : "路径存在") : h(Tag, { tone: "warn" }, "未探测到可执行文件")), h("pre", { style: styles.pre }, suggestion.command), suggestion.explanation ? h("div", { style: {
				...styles.sectionHint,
				marginTop: 2
			} }, suggestion.explanation) : null, !suggestion.probe?.ok && suggestion.probe?.reason ? h("div", { style: {
				color: C.danger,
				fontSize: 12,
				marginTop: 2
			} }, suggestion.probe.reason) : null, suggestion.caveats?.length ? h("div", { style: {
				...styles.sectionHint,
				marginTop: 2
			} }, `注意：${suggestion.caveats.join("；")}`) : null, h("div", { style: {
				...styles.row,
				marginTop: 6
			} }, h(Button, {
				primary: true,
				onClick: () => {
					setLocal((current) => ({
						...current,
						[slot]: suggestion.command
					}));
					setMessage(`已把建议命令填入「${slotLabel}」，确认后点「保存本机命令」`);
				},
				children: "填入本机命令"
			}))) : null), message ? h("p", { style: {
				color: C.muted,
				marginBottom: 0
			} }, message) : null);
		}
		/**
		* 流程详情：从「一整页长表单」改成「分段 + 渐进披露」。
		*
		* 取舍：
		* - 默认全部只读，点「编辑」才出现对应输入框；保存后回到只读，减少“满屏输入框”的重量；
		* - 概览 / 计划 / 测试与提交 三个页签，低频项（标题、状态、历史、删除）收进「更多」；
		* - 自评工程量只读展示（规模/人日/置信度 + 依据），不提供任何输入框；
		* - 能力不删：阶段流转、Context Pack（低频入口收进「更多」）、追问/根因、计划、任务、技术文档、
		*   本机/环境测试、变更文件勾选、提交与 push 全部保留。
		*/
		/**
		* 流程指向条：箭头（chevron）串联的阶段进度，**只读**。
		* 阶段由事实推导（本机自测→验证、环境验证→待提交、提交→完成），不允许手工点选，
		* 否则会出现"人点一下、工具又改一下"的来回反复。
		*/
		function ArrowSteps({ stages, stageIndex, activeDetail, activePartial = false, activeLoading = false }) {
			const clipFor = (first) => first ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)" : "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)";
			return h("div", { style: {
				display: "flex",
				alignItems: "stretch",
				width: "100%",
				overflowX: "auto",
				paddingBottom: 2
			} }, (stages ?? []).map((entry, index) => {
				const first = index === 0;
				const active = index === stageIndex;
				const done = stageIndex >= 0 && index < stageIndex;
				const bg = active ? T.brand : done ? T.brandSoft : T.surface2;
				const color = active ? "#fff" : done ? T.brand : T.text4;
				const clip = clipFor(first);
				return h("span", {
					key: entry.id,
					title: `${entry.hint}${active ? "（当前阶段）" : done ? "（已完成）" : ""}`,
					style: {
						flex: "1 1 0",
						minWidth: 112,
						display: "flex",
						padding: 2,
						marginLeft: first ? 0 : -10,
						clipPath: clip,
						background: T.surface
					}
				}, h("span", { style: {
					flex: "1 1 auto",
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 6,
					height: 32,
					minWidth: 0,
					clipPath: clip,
					background: bg,
					color,
					fontSize: T.font.sm,
					fontWeight: active ? 600 : 500,
					padding: first ? "0 12px" : "0 14px 0 20px",
					whiteSpace: "nowrap"
				} }, active && activeLoading ? h(Spinner, {
					key: "active-spin",
					size: 10,
					tone: "accent",
					title: "正在开发…",
					style: spinnerOnBrand
				}) : h("span", {
					key: "dot",
					style: {
						width: 6,
						height: 6,
						flex: "0 0 6px",
						borderRadius: 999,
						background: active ? "#fff" : done ? T.brand : T.text4
					}
				}, ""), entry.label, done ? h("span", { style: {
					fontSize: 11,
					opacity: .9
				} }, "✓") : null, active && activePartial ? h("span", { style: {
					fontSize: 11,
					opacity: .9
				} }, "◐") : null, active && activeDetail ? h("span", { style: {
					fontSize: 10,
					opacity: .9,
					marginLeft: 4
				} }, activeDetail) : null));
			}));
		}
		/**
		* POST 一个「失败也带结果」的接口（测试 / 提交在多成员库里部分失败）。
		*
		* `api()` 遇到 `ok:false` 直接抛错，会把 body 里的逐库结果一起丢掉——那样界面只能显示
		* 一句"失败"，看不到哪个库提交成功、哪个库推送失败。所以这两条路径保留 body：
		* HTTP 非 2xx 仍然抛错（参数/权限错误），200 + ok:false 交给调用方逐库渲染。
		*/
		async function postAllowingFailure(url, payload) {
			const response = await fetch(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload ?? {})
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
			return body;
		}
		/**
		* 流程归属的虚拟库徽标：流程建在虚拟库里时，标题旁要能看出「这次跨了几个库」。
		*
		* 台账里的 `item.workspace` 可能只有 `{id,name}`（归属快照），成员名按 `item.repos`
		* 的目录名兜底；两者都没有时（单库流程）不渲染，保持旧界面不变。
		*/
		function WorkspaceBadge({ workspace, repos }) {
			const paths = (Array.isArray(repos) ? repos : []).map((entry) => String((typeof entry === "string" ? entry : entry?.path ?? entry?.repo) ?? "")).filter(Boolean);
			const members = Array.isArray(workspace?.members) && workspace.members.length ? workspace.members.map((member) => ({
				path: String(member?.path ?? ""),
				name: member?.name || repoBaseName(member?.path) || ""
			})) : paths.map((path) => ({
				path,
				name: repoBaseName(path)
			}));
			if (!workspace && members.length < 2) return null;
			const names = members.map((member) => member.name).filter(Boolean);
			return h(Tag, {
				key: "workspace",
				tone: "accent",
				title: [
					`虚拟库${workspace?.name ? `「${workspace.name}」` : ""}：${members.length} 个成员库`,
					names.length ? `成员库：${names.join("、")}（成员库平权）` : "",
					"台账/规范/上下文/证据写在本机独立目录，不写任何成员库"
				].filter(Boolean).join("\n")
			}, `虚拟库${workspace?.name ? ` ${workspace.name}` : ""} · ${members.length} 库`);
		}
		/** 提交/测试结果里的成员库名：优先 Host 的 name，旧数据按路径兜底。 */
		function repoDisplayName(entry) {
			return entry?.name || entry?.repoName || repoBaseName(entry?.repo ?? entry?.path) || "成员库";
		}
		/**
		* 变更文件在界面上的唯一 key：虚拟库用 Host 的 `file.key`（`<成员库>/<路径>`），
		* 旧单库响应没有 key，回退 `path`，渲染与选中行为完全不变。
		*/
		function fileKeyOf(file) {
			return String(file?.key ?? (file?.repoName && file?.path ? `${file.repoName}/${file.path}` : file?.path ?? ""));
		}
		/** diff 行高亮：关键改动预览与完整 diff 共用同一套配色。 */
		function diffLineStyle(type) {
			if (type === "added") return {
				background: T.okSoft,
				color: T.ok
			};
			if (type === "removed") return {
				background: T.dangerSoft,
				color: T.danger
			};
			if (type === "hunk") return {
				background: T.surface2,
				color: T.text4
			};
			if (type === "meta") return { color: T.text4 };
			return { color: T.text2 };
		}
		/** 文件显示路径：优先 Host 的 displayPath（`web/src/x.js`），旧数据就是 path。 */
		function fileDisplayOf(file) {
			return String(file?.displayPath ?? file?.path ?? fileKeyOf(file));
		}
		/** 文件属于哪个成员库：优先 repoName，旧数据没有就返回空（单库界面不显示标签）。 */
		function fileRepoOf(file) {
			return String(file?.repoName ?? (file?.repo ? repoBaseName(file.repo) : ""));
		}
		function ItemEditor({ item, ctx, pendingQuestions = [], pendingApprovals = [], onPendingRefresh, onBack, onSaved, onContext, onLaunch, session, onOpenSession, onUnbindSession, onDeleted, onEditingChange }) {
			const [draft, setDraft] = (0, react.useState)(item);
			const [busy, setBusy] = (0, react.useState)(false);
			const [launchBusy, setLaunchBusy] = (0, react.useState)(null);
			const [requirementBusy, setRequirementBusy] = (0, react.useState)(false);
			const [titleBusy, setTitleBusy] = (0, react.useState)(false);
			const [syncBusy, setSyncBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [lark, setLark] = (0, react.useState)(null);
			const [changes, setChanges] = (0, react.useState)(null);
			const [selectedPaths, setSelectedPaths] = (0, react.useState)([]);
			const [commitMessage, setCommitMessage] = (0, react.useState)("");
			const [submitResult, setSubmitResult] = (0, react.useState)("");
			const [submitData, setSubmitData] = (0, react.useState)(null);
			const [branchMode, setBranchMode] = (0, react.useState)("current");
			const [branchName, setBranchName] = (0, react.useState)("");
			const [tab, setTab] = (0, react.useState)("overview");
			const [reportPreviewOpen, setReportPreviewOpen] = (0, react.useState)(false);
			const [sessionLogOpen, setSessionLogOpen] = (0, react.useState)(false);
			const [editKey, setEditKey] = (0, react.useState)(null);
			const [snapshot, setSnapshot] = (0, react.useState)(null);
			const [noteEdit, setNoteEdit] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				onEditingChange?.(Boolean(editKey) || Boolean(noteEdit));
			}, [
				editKey,
				noteEdit,
				onEditingChange
			]);
			const [askText, setAskText] = (0, react.useState)("");
			const [askBusy, setAskBusy] = (0, react.useState)(false);
			const [assistBusy, setAssistBusy] = (0, react.useState)(false);
			const [assistLog, setAssistLog] = (0, react.useState)([]);
			const [answerPick, setAnswerPick] = (0, react.useState)({});
			const [answerCustom, setAnswerCustom] = (0, react.useState)({});
			const [answerBusy, setAnswerBusy] = (0, react.useState)(false);
			const [answerFeedback, setAnswerFeedback] = (0, react.useState)(null);
			const [planCheck, setPlanCheck] = (0, react.useState)(null);
			const [reviewBusy, setReviewBusy] = (0, react.useState)(false);
			const [reviewerProgress, setReviewerProgress] = (0, react.useState)({});
			const [advanceError, setAdvanceError] = (0, react.useState)("");
			const [filesInfo, setFilesInfo] = (0, react.useState)(null);
			const [filesLoading, setFilesLoading] = (0, react.useState)(false);
			const [filesAutoAt, setFilesAutoAt] = (0, react.useState)(null);
			const filesInFlightRef = (0, react.useRef)(false);
			const filesLoadedForRef = (0, react.useRef)("");
			const [onlyScope, setOnlyScope] = (0, react.useState)(true);
			const [diffFile, setDiffFile] = (0, react.useState)(null);
			const [diffLabel, setDiffLabel] = (0, react.useState)("");
			const [diffData, setDiffData] = (0, react.useState)(null);
			const [diffLoading, setDiffLoading] = (0, react.useState)(false);
			const [keyDiffs, setKeyDiffs] = (0, react.useState)({});
			const keyDiffsRef = (0, react.useRef)({ fingerprint: "" });
			const [notesBusy, setNotesBusy] = (0, react.useState)(false);
			const notesTriedRef = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (tab !== "overview" || !item?.id) return void 0;
				loadFiles();
				const timer = setInterval(() => {
					if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
					loadFiles({ silent: true });
				}, 8e3);
				const onVisible = () => {
					if (typeof document === "undefined" || document.visibilityState !== "hidden") loadFiles({ silent: true });
				};
				if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
				return () => {
					clearInterval(timer);
					if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
				};
			}, [tab, item?.id]);
			(0, react.useEffect)(() => {
				const id = item?.id;
				if (!id || filesLoadedForRef.current !== id) return void 0;
				const all = filesInfo?.files ?? [];
				const picks = pickKeyFiles(onlyScope ? all.filter((file) => file.inScope !== false) : all, 5);
				const fingerprint = picks.map(({ file }) => `${fileKeyOf(file)}:${file.added}:${file.removed}:${file.status}`).join("|");
				if (fingerprint === keyDiffsRef.current.fingerprint) return void 0;
				keyDiffsRef.current.fingerprint = fingerprint;
				if (!picks.length) {
					setKeyDiffs({});
					return;
				}
				let cancelled = false;
				setKeyDiffs(Object.fromEntries(picks.map(({ file }) => [fileKeyOf(file), { loading: true }])));
				for (const { file } of picks) {
					const key = fileKeyOf(file);
					const params = new URLSearchParams({
						itemId: id,
						path: String(file?.path ?? key)
					});
					if (file?.repo) params.set("repo", file.repo);
					else if (file?.repoName) params.set("repo", file.repoName);
					api(`${API.diff}?${params.toString()}`).then((body) => {
						if (!cancelled) setKeyDiffs((current) => ({
							...current,
							[key]: {
								loading: false,
								file: body.file
							}
						}));
					}).catch((err) => {
						if (!cancelled) setKeyDiffs((current) => ({
							...current,
							[key]: {
								loading: false,
								error: errorText(err)
							}
						}));
					});
				}
				return () => {
					cancelled = true;
				};
			}, [
				filesInfo,
				onlyScope,
				item?.id
			]);
			(0, react.useEffect)(() => {
				setDraft(item);
				if (item?.id) api(API.repro, {
					method: "POST",
					body: JSON.stringify({ id: item.id })
				}).then((body) => setPlanCheck(body)).catch(() => setPlanCheck(null));
				const recent = (item?.history ?? []).filter((entry) => entry?.type === "assist" || entry?.type === "assist-reply").slice(-6);
				setAssistLog(recent.map((entry) => ({
					role: entry.type === "assist" ? "user" : "assistant",
					text: entry.message
				})));
			}, [item]);
			if (!draft) return null;
			const workflow = draft.workflow ?? {};
			const tests = workflow.tests ?? {};
			const techDoc = workflow.techDoc ?? {};
			const plan = workflow.plan ?? {};
			const estimate = plan.estimate ?? {};
			const stage = workflow.stage ?? "discovery";
			const reviewView = describeReview(draft);
			const reviewStartedAt = reviewView.dispatchedAt ? new Date(reviewView.dispatchedAt).getTime() : NaN;
			const reviewElapsed = reviewView.status === "pending" && Number.isFinite(reviewStartedAt) ? Math.max(0, Math.round((Date.now() - reviewStartedAt) / 1e3)) : null;
			const advance = reviewAdvancePlan(draft);
			const advanceHint = advanceError || (advance.action === "retry" ? advance.hint : "");
			const stageIndex = WORKFLOW_STAGES.findIndex((entry) => entry.id === stage);
			const stageLabelText = STAGE_LABELS[stage] ?? stage;
			const showStageTag = stageLabelText !== (STATUS_LABELS[draft.status] ?? draft.status);
			const sessionRunning = Boolean(draft.session?.id) && Boolean(session?.running);
			const questions = workflow.questions ?? [];
			const answered = questions.filter((question) => String(question.answer ?? "").trim()).length;
			const tasks = draft.tasks ?? [];
			const doneCount = tasks.filter((task) => task.done).length;
			const taskPct = tasks.length ? Math.round(doneCount / tasks.length * 100) : 0;
			const riskList = (draft.risks ?? []).map(String).filter(Boolean);
			const riskAckSet = new Set((draft.riskAcks ?? []).map(String));
			const riskAckedCount = riskList.filter((text) => riskAckSet.has(text)).length;
			const baseline = draft.baseline ?? null;
			const requirement = draft.requirement ?? null;
			const update = (key, value) => setDraft((current) => ({
				...current,
				[key]: value
			}));
			const updateWorkflow = (patch) => setDraft((current) => ({
				...current,
				workflow: {
					...current.workflow ?? {},
					...patch
				}
			}));
			async function persistDraft(next = draft) {
				const body = await api(API.items, {
					method: "POST",
					body: JSON.stringify(next)
				});
				setDraft(body.item);
				onSaved(body.item);
				return body.item;
			}
			/**
			* 统一保存入口：写回台账 → 退出编辑态 → 给出轻提示。
			* 返回是否成功，调用方据此决定要不要关闭编辑区。
			*/
			async function commit(next, message) {
				setBusy(true);
				setError("");
				setNotice("");
				try {
					await persistDraft(next);
					setNotice(message);
					setEditKey(null);
					setSnapshot(null);
					return true;
				} catch (err) {
					setError(errorText(err));
					return false;
				} finally {
					setBusy(false);
				}
			}
			function beginEdit(key) {
				setSnapshot(draft);
				setEditKey(key);
				setError("");
				setNotice("");
			}
			function cancelEdit() {
				if (snapshot) setDraft(snapshot);
				setEditKey(null);
				setSnapshot(null);
			}
			const isEditing = (key) => editKey === key;
			const mini = {
				height: 24,
				padding: "0 8px",
				fontSize: T.font.sm
			};
			const sectionBox = {
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rBase,
				background: T.surface,
				padding: T.gap.sm
			};
			/** 分段标题：默认在右侧给一个「编辑」，进入编辑态后由底部的保存/取消接管。 */
			function sectionHead(title, hint, key) {
				return h("div", { style: styles.spread }, h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2
				} }, h("div", { style: styles.sectionTitle }, title), hint ? h("div", { style: styles.sectionHint }, hint) : null), key && !isEditing(key) ? h(Button, {
					style: mini,
					onClick: () => beginEdit(key),
					children: "编辑"
				}) : null);
			}
			function editFooter(message) {
				return h("div", { style: {
					...styles.row,
					marginTop: T.gap.xs
				} }, h(Button, {
					primary: true,
					disabled: busy,
					onClick: () => commit(draft, message),
					children: busy ? "保存中…" : "保存"
				}), h(Button, {
					disabled: busy,
					onClick: cancelEdit,
					children: "取消"
				}));
			}
			function readText(value, placeholder = "还没有填写") {
				const text = String(value ?? "").trim();
				return text ? h("div", { style: {
					whiteSpace: "pre-wrap",
					color: T.text2,
					fontSize: T.font.base,
					lineHeight: T.line
				} }, text) : h("div", { style: styles.sectionHint }, placeholder);
			}
			function readList(values, placeholder = "还没有填写") {
				const list = (values ?? []).map((entry) => String(entry ?? "").trim()).filter(Boolean);
				return list.length ? h("ul", { style: {
					margin: 0,
					paddingLeft: 18,
					color: T.text2,
					fontSize: T.font.base,
					lineHeight: T.line
				} }, list.map((entry, index) => h("li", {
					key: `${index}-${entry}`,
					style: { marginBottom: 2 }
				}, entry))) : h("div", { style: styles.sectionHint }, placeholder);
			}
			/** scope + scopeModules 合并去重：只读 chip 与编辑框共用一份口径。 */
			function scopeTokensOf(value) {
				return [...new Set([...value?.scope ?? [], ...value?.scopeModules ?? []].map(String).filter(Boolean))];
			}
			function tokenChips(tokens, limit = 8) {
				const list = tokens ?? [];
				if (!list.length) return h("span", { style: styles.sectionHint }, "未标注 scope");
				return h("div", { style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 6
				} }, list.slice(0, limit).map((token) => h(Tag, { key: token }, scopeTokenLabel(token))), list.length > limit ? h(Tag, { tone: "neutral" }, `+${list.length - limit}`) : null);
			}
			async function probeLark() {
				setLark(null);
				setError("");
				try {
					setLark(await api(API.techdoc, {
						method: "POST",
						body: JSON.stringify({ action: "probe" })
					}));
				} catch (err) {
					setError(errorText(err));
				}
			}
			async function createTechDoc(action) {
				setBusy(true);
				setError("");
				setNotice("");
				try {
					await persistDraft();
					const body = await api(API.techdoc, {
						method: "POST",
						body: JSON.stringify({
							action,
							id: draft.id,
							title: techDoc.title || `${draft.title} 技术方案`
						})
					});
					setDraft(body.item);
					onSaved(body.item);
					setNotice(action === "create" ? `已创建：${body.url}` : `已生成：${body.path}`);
					setEditKey(null);
					setSnapshot(null);
				} catch (err) {
					setError(errorText(err));
				} finally {
					setBusy(false);
				}
			}
			/** 让工作站把客户原话整理成目标/根因/验收（旧流程也能一键补规范化）。 */
			async function normalizeRequirement() {
				if (requirementBusy) return;
				setRequirementBusy(true);
				setError("");
				setNotice("");
				try {
					const body = await api(API.requirement, {
						method: "POST",
						body: JSON.stringify({ id: draft.id })
					});
					if (body.item) {
						setDraft(body.item);
						onSaved(body.item);
					}
					setNotice(body.degraded ? `工作站暂时不可用：只生成了本地草稿（${body.reason || "agent 不可用"}），目标和根因仍需人工确认` : "已把客户原话整理成目标/根因" + (body.requirement?.acceptance?.length ? "，并补了验收标准" : ""));
				} catch (err) {
					setError(`需求规范化失败：${errorText(err)}`);
				} finally {
					setRequirementBusy(false);
				}
			}
			/** 只重新生成标题：不动目标/根因（旧流程标题常是用户贴的代码/注解）。 */
			async function regenerateTitle() {
				if (titleBusy) return;
				setTitleBusy(true);
				setError("");
				setNotice("");
				try {
					const body = await api(API.requirement, {
						method: "POST",
						body: JSON.stringify({
							id: draft.id,
							regenerateTitle: true
						})
					});
					if (body.item) {
						setDraft(body.item);
						onSaved(body.item);
					}
					if (body.changed === false) setNotice("没生成比原话更合适的标题：可以直接手动改一个");
					else setNotice(`标题已生成：${body.title ?? body.item?.title ?? ""}${body.engine === "local" ? "（工作站不可用，按目标兜底生成）" : ""}`);
				} catch (err) {
					setError(`生成标题失败：${errorText(err)}`);
				} finally {
					setTitleBusy(false);
				}
			}
			/**
			* 统一的会话启动包装：无论成功、失败还是抛错，finally 复位 launchBusy，
			* 避免按钮永远停在「正在开启开发会话…」。
			*/
			async function runLaunch(mode, action) {
				if (launchBusy) return void 0;
				setLaunchBusy(mode);
				setError("");
				setNotice("");
				try {
					return await action();
				} finally {
					setLaunchBusy(null);
				}
			}
			/**
			* 轻量「继续推进」：会话里已有规范与上下文，只发一句按最新台账继续的短消息。
			* 不重发整包 Context Pack（那会淹没之前的决定），也不弹确认框。
			*
			* 评审阶段不一样：开发阶段完成（stage=review 且评审 idle）时，「继续推进」就是开始评审——
			* 自动创建评审轮（复用 Host 的 dispatch/runReviewRound），不再让人到独立评审页手工派发；
			* 已有 pending 评审时不重复派发；failed/error 时再点即重试（见 startReview）。
			*/
			async function continueDev() {
				if (busy) return;
				const advance = reviewAdvancePlan(draft);
				if (advance.action === "dispatch" || advance.action === "retry") {
					await startReview();
					return;
				}
				if (advance.action === "wait") return;
				const boundId = draft.session?.id;
				if (!boundId) {
					onLaunch?.(draft.id);
					return;
				}
				if (session?.running) {
					setNotice("开发会话正在工作，等当前这步结束再继续推进");
					return;
				}
				setBusy(true);
				setError("");
				setNotice("");
				setAdvanceError("");
				try {
					const result = await sendToSession(ctx, boundId, continuePrompt(describeFlow(draft, session)));
					if (!result.sent) throw new Error(result.reason ?? "发送失败");
					setAdvanceError("");
					setNotice(`已让开发会话继续推进（${boundId}）；进度与结果看下方「关联会话」。`);
				} catch (err) {
					setError(`${errorText(err)}（会话可能已归档；需要从零开始时用「更多 → 换一条开发会话」）`);
				} finally {
					setBusy(false);
				}
			}
			/**
			* 逐库测试结果：虚拟库里一个成员库失败，整体就是失败；但要说清哪几个库失败。
			* 旧响应没有 result.repos 时什么都不额外渲染，单库界面保持原样。
			*/
			function repoTestRows(result) {
				const rows = Array.isArray(result?.repos) ? result.repos : [];
				if (!rows.length) return null;
				const failed = rows.filter((entry) => entry?.status && entry.status !== "passed");
				return h("div", { style: {
					marginTop: 6,
					display: "flex",
					flexDirection: "column",
					gap: 2
				} }, h("div", { style: {
					...styles.sectionHint,
					display: "flex",
					alignItems: "center",
					gap: 6,
					flexWrap: "wrap"
				} }, `成员库结果（${rows.length}）`, failed.length ? h(Tag, { tone: "danger" }, `${failed.length} 个失败：${failed.map(repoDisplayName).join("、")}`) : h(Tag, { tone: "ok" }, "全部通过")), rows.map((repo, index) => {
					const status = repo?.status ?? (repo?.skipped ? "skipped" : "unknown");
					const tone = status === "passed" ? "ok" : status === "failed" ? "danger" : "neutral";
					return h("div", {
						key: repo?.path ?? repo?.name ?? index,
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							flexWrap: "wrap",
							padding: "4px 0",
							borderTop: index ? `1px solid ${T.borderSoft}` : "none"
						}
					}, h(Tag, { tone }, status === "skipped" ? "跳过" : TEST_TEXT[status] ?? status), h("span", { style: {
						fontWeight: 600,
						color: T.text2
					} }, repoDisplayName(repo)), repo?.branch ? h("span", { style: styles.sectionHint }, repo.branch) : null, repo?.durationMs ? h("span", { style: {
						...styles.num,
						fontSize: T.font.xs,
						color: T.text4
					} }, `${Math.round(repo.durationMs / 1e3)}s`) : null, repo?.skipped ? h("span", { style: styles.sectionHint }, "已跳过（不需要在这个库跑）") : null, repo?.error ? h("span", { style: styles.smallDanger }, repo.error) : null, repo?.output ? h("details", { style: { flex: "1 1 100%" } }, h("summary", { style: {
						cursor: "pointer",
						fontSize: T.font.sm,
						color: status === "failed" ? T.danger : T.brand
					} }, status === "failed" ? "查看失败输出" : "查看输出"), h("pre", { style: {
						...styles.pre,
						marginTop: 4,
						maxHeight: 200
					} }, String(repo.output).slice(-2e3))) : null);
				}));
			}
			async function runTest(phase) {
				const command = tests[phase]?.command || (phase === "local" ? "项目配置的 localTest" : "项目配置的 environmentTest");
				if (!window.confirm(`执行${phase === "local" ? "本机自测" : "环境测试"}？\n\n${command}`)) return;
				setBusy(true);
				setError("");
				setNotice("");
				try {
					await persistDraft();
					const body = await postAllowingFailure(API.test, {
						id: draft.id,
						phase
					});
					if (body.item) {
						setDraft(body.item);
						onSaved(body.item);
					}
					const label = phase === "local" ? "本机自测" : "环境测试";
					const rows = Array.isArray(body.result?.repos) ? body.result.repos : [];
					const failed = rows.filter((entry) => entry?.status && entry.status !== "passed");
					const suffix = rows.length ? `（${rows.length - failed.length}/${rows.length} 个成员库通过）` : "";
					if (body.ok === false) setError(`${label}未通过：${body.error ?? (failed.length ? failed.map(repoDisplayName).join("、") : body.result?.status ?? "失败")}${suffix}`);
					else setNotice(`${label}：${body.result?.status ?? "通过"}${suffix}`);
				} catch (err) {
					setError(errorText(err));
				} finally {
					setBusy(false);
				}
			}
			/** 开发前同步：fetch + ff-only 合并；不自动 rebase/reset，冲突/分叉明确报错。 */
			async function syncCode() {
				if (!window.confirm("拉取最新代码？\n\n会对当前流程涉及的仓库执行 git fetch + merge --ff-only。\n有本地未提交改动或分支分叉时不会强推/回滚，失败原因会显示在页面上。")) return;
				setSyncBusy(true);
				setError("");
				setNotice("");
				try {
					const body = await postAllowingFailure(API.sync, { id: draft.id });
					const rows = Array.isArray(body.repos) ? body.repos : [];
					const failed = rows.filter((row) => row?.ok === false);
					const detail = rows.map((row) => {
						const name = repoDisplayName(row);
						if (row?.ok === false) return `${name}：失败（${row.error || "未知原因"}）`;
						return `${name}：${row?.updated ? `已更新 ${row.before ?? "?"} → ${row.after ?? "?"}` : "已是最新"}`;
					}).join("；");
					if (body.ok === false || failed.length) setError(`部分仓库同步失败：${detail}`);
					else setNotice(`已同步代码：${detail}`);
				} catch (err) {
					setError(errorText(err));
				} finally {
					setSyncBusy(false);
				}
			}
			(0, react.useEffect)(() => {
				if (!(draft?.workflow?.review?.status === "pending" || reviewBusy) || !draft?.id) return void 0;
				let stop = false;
				const load = async () => {
					if (stop) return;
					try {
						const body = await api(`${API.review}?id=${encodeURIComponent(draft.id)}`);
						if (stop || !body.item) return;
						setDraft(body.item);
						onSaved?.(body.item);
					} catch {}
				};
				const timer = setInterval(load, 3e3);
				load();
				return () => {
					stop = true;
					clearInterval(timer);
				};
			}, [
				draft?.id,
				draft?.workflow?.review?.status,
				reviewBusy
			]);
			const reviewerSessionsKey = (draft?.workflow?.review?.reviewers ?? []).map((reviewer) => reviewer.sessionId ?? "").join(",");
			(0, react.useEffect)(() => {
				const active = reviewBusy || draft?.workflow?.review?.status === "pending";
				const reviewers = (draft?.workflow?.review?.reviewers ?? []).filter((reviewer) => reviewer.sessionId);
				if (!active || !draft?.id || !reviewers.length) {
					setReviewerProgress({});
					return;
				}
				let stop = false;
				const load = async () => {
					const next = {};
					await Promise.all(reviewers.map(async (reviewer) => {
						try {
							const body = await api(`${API.sessionLog}?itemId=${encodeURIComponent(draft.id)}&sessionId=${encodeURIComponent(reviewer.sessionId)}&limit=16`);
							if (!stop) next[reviewer.id] = {
								alive: body.alive,
								items: body.items ?? [],
								reason: body.reason ?? null
							};
						} catch (err) {
							if (!stop) next[reviewer.id] = {
								alive: null,
								items: [],
								reason: errorText(err)
							};
						}
					}));
					if (!stop) setReviewerProgress(next);
				};
				load();
				const timer = setInterval(load, 3e3);
				return () => {
					stop = true;
					clearInterval(timer);
				};
			}, [
				draft?.id,
				draft?.workflow?.review?.status,
				reviewBusy,
				reviewerSessionsKey
			]);
			/**
			* 「继续推进」在评审这一步＝开始评审：复用 Host 现有 dispatch/runReviewRound。
			*
			* - 已有 pending 评审：不重复派发（幂等，直接提示等审核员返回）；
			* - 派发失败或评审 failed/error：按钮保持可点，再点即重试派发，并把上次失败原因内联在按钮旁；
			* - 审核员数量沿用现有默认配置（上一轮人数或默认值），不再提供人数选择入口。
			*/
			async function startReview() {
				const current = describeReview(draft);
				if (current.status === "pending") {
					setNotice("独立评审进行中：等审核员返回结论，不重复派发");
					return;
				}
				if (reviewBusy || busy) return;
				setReviewBusy(true);
				setError("");
				setNotice("");
				setAdvanceError("");
				try {
					const count = current.total || void 0;
					const body = await postAllowingFailure(API.review, {
						id: draft.id,
						action: "dispatch",
						count
					});
					if (body.item) {
						setDraft(body.item);
						onSaved(body.item);
					}
					const view = body.review ?? describeReview(body.item ?? draft);
					if (view.status === "passed") {
						setAdvanceError("");
						setNotice(`独立评审通过：${view.passed}/${view.total} 位审核员通过，可以进入测试验证`);
					} else if (view.status === "failed") setAdvanceError(`上次评审未通过：${reviewFailureHint(view)}（再点「继续推进」重试评审）`);
					else if (view.status === "error") setAdvanceError(`上次评审异常：${reviewFailureHint(view)}（再点「继续推进」重试评审）`);
					else setNotice(`独立评审进行中：${view.passed}/${view.total} 位已返回，等审核员结论`);
				} catch (err) {
					setAdvanceError(`自动开始评审失败：${errorText(err)}（再点「继续推进」重试）`);
				} finally {
					setReviewBusy(false);
				}
			}
			/** 评审卡在 pending（常见于 DSH 重启/请求中断）：允许用户显式重置本轮后重试。 */
			async function resetReview() {
				if (reviewBusy || busy) return;
				if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm("重置本轮独立评审？当前 pending 的审核员会话会停止；历史轮次仍保留。")) return;
				setReviewBusy(true);
				setError("");
				setNotice("");
				setAdvanceError("");
				try {
					const body = await postAllowingFailure(API.review, {
						id: draft.id,
						action: "reset"
					});
					if (!body.ok && body.error) throw new Error(body.error);
					if (body.item) {
						setDraft(body.item);
						onSaved?.(body.item);
					}
					setNotice("已重置本轮评审；点「继续推进」可重新派发");
				} catch (err) {
					setError(`重置评审失败：${errorText(err)}`);
				} finally {
					setReviewBusy(false);
				}
			}
			async function loadChanges() {
				setBusy(true);
				setError("");
				try {
					const body = await api(`${API.changes}?id=${encodeURIComponent(draft.id)}`);
					setChanges(body);
					setSelectedPaths(body.suggestedPaths ?? []);
					setCommitMessage((current) => current || `${draft.title}: update`);
				} catch (err) {
					setError(errorText(err));
				} finally {
					setBusy(false);
				}
			}
			/** 上次提交有没有"已 commit 但没 push"：单库看 submission.pushed，多库看 repos[].pushed。 */
			function submissionNeedsRetry() {
				const submission = draft.workflow?.submission ?? null;
				if (!submission) return false;
				if (submission.pushed === false) return true;
				return Array.isArray(submission.repos) && submission.repos.some((entry) => entry && entry.commit && entry.pushed === false);
			}
			/** 按成员库分组变更文件：单库（没有 repoName/repo）只返回一组，界面仍然平铺。 */
			function changesByRepo() {
				const map = /* @__PURE__ */ new Map();
				for (const change of changes?.changes ?? []) {
					const repo = change?.repoName || (change?.repo ? repoBaseName(change.repo) : "");
					if (!map.has(repo)) map.set(repo, []);
					map.get(repo).push(change);
				}
				return [...map.entries()];
			}
			async function submitCode({ pushOnly = false } = {}) {
				if (!pushOnly && !selectedPaths.length) {
					setError("请选择要提交的文件");
					return;
				}
				if (!pushOnly && !commitMessage.trim()) {
					setError("请填写提交信息");
					return;
				}
				if (branchMode === "new" && !pushOnly && !branchName.trim()) {
					setError("请填写新分支名");
					return;
				}
				const target = branchMode === "new" && !pushOnly ? `新分支 ${branchName.trim()}` : `当前分支（${changes?.branch ?? "当前"}）`;
				const groups = changesByRepo().filter(([, list]) => list.some((change) => selectedPaths.includes(change.path)));
				const pathLines = groups.length > 1 ? groups.map(([repo, list]) => `【${repo || "成员库"}】\n${list.filter((change) => selectedPaths.includes(change.path)).map((change) => change.path).join("\n")}`).join("\n\n") : selectedPaths.join("\n");
				if (!window.confirm(pushOnly ? "上次提交没推送成功：现在重试 git push？" : `确认提交 ${selectedPaths.length} 个文件到「${target}」，并立即 git push？\n\n${pathLines}`)) return;
				setBusy(true);
				setError("");
				setNotice("");
				try {
					const body = await postAllowingFailure(API.submit, {
						id: draft.id,
						paths: selectedPaths,
						message: commitMessage,
						branchMode,
						branchName: branchName.trim(),
						pushOnly
					});
					if (body.item) {
						setDraft(body.item);
						onSaved(body.item);
					}
					const repoResults = Array.isArray(body.repos) ? body.repos : Array.isArray(body.item?.workflow?.submission?.repos) ? body.item.workflow.submission.repos : [];
					const failed = repoResults.filter((entry) => entry?.error || entry?.pushed === false);
					setSubmitData({
						at: Date.now(),
						ok: body.ok !== false,
						repos: repoResults,
						failed: failed.length,
						branch: body.branch ?? "",
						commit: body.commit ?? "",
						pushed: body.pushed !== false,
						error: body.error ?? "",
						pushOutput: body.pushOutput ?? ""
					});
					if (body.ok === false) {
						const lines = repoResults.length ? repoResults.map((entry) => `${repoDisplayName(entry)}：${entry?.error ? `失败（${entry.error}）` : entry?.pushed === false ? "已提交，推送失败" : "已提交并推送"}`) : [];
						setSubmitResult([
							body.error ?? "提交或推送失败",
							body.commit ? `已提交：${body.commit}（${body.branch ?? ""}）` : "",
							lines.join("\n")
						].filter(Boolean).join("\n\n"));
						setError(body.error ?? "git push 失败");
						return;
					}
					setSubmitResult(`已提交并推送到 ${body.branch}：${body.commit}${body.pushOutput ? "\n" + body.pushOutput : ""}`);
					setChanges(null);
					const submitNotice = repoResults.length ? `已提交并推送 ${repoResults.length} 个成员库（${repoResults.map(repoDisplayName).join("、")}）` : `已提交并推送到 ${body.branch}`;
					const worktreeBranch = draft.workflow?.worktree?.branch;
					setNotice(worktreeBranch ? `${submitNotice}；独立工作区分支 ${body.branch || worktreeBranch} 已推送，合并回目标分支后再清理工作区` : submitNotice);
				} catch (err) {
					setError(errorText(err));
				} finally {
					setBusy(false);
				}
			}
			/** 任务勾选直接落盘：勾一下就生效，不用再点一次保存。 */
			async function toggleTask(index) {
				const nextTasks = tasks.map((task, i) => i === index ? {
					...task,
					done: !task.done
				} : task);
				const next = {
					...draft,
					tasks: nextTasks
				};
				setDraft(next);
				await commit(next, "已更新任务进度");
			}
			/**
			* 风险勾选＝同意并知晓：立即落盘，不用再点保存。
			* 未勾选的数量会同步到上方「下一步」的「处理 N 个风险/阻塞」。
			*/
			async function toggleRiskAck(text) {
				const current = Array.isArray(draft.riskAcks) ? draft.riskAcks : [];
				const nextAcks = current.includes(text) ? current.filter((entry) => entry !== text) : [...current, text];
				const next = {
					...draft,
					riskAcks: nextAcks
				};
				setDraft(next);
				await commit(next, nextAcks.includes(text) ? `已标记已知晓：${text}` : "已取消知晓，重新计入待处理风险");
			}
			const setQuestions = (list) => updateWorkflow({ questions: list });
			const setQuestion = (id, key, value) => setQuestions(questions.map((question) => question.id === id ? {
				...question,
				[key]: value
			} : question));
			const addQuestion = () => {
				setQuestions([...questions, {
					id: `q${Date.now()}`,
					question: "",
					answer: ""
				}]);
			};
			const togglePath = (path) => setSelectedPaths((current) => current.includes(path) ? current.filter((p) => p !== path) : [...current, path]);
			const techDocText = (decision) => ({
				existing: "已有技术文档",
				create: "开发中创建",
				none: "暂不需要"
			})[decision] ?? "未选择";
			const TEST_TEXT = {
				not_run: "未运行",
				running: "运行中",
				passed: "通过",
				failed: "失败"
			};
			const testTone = (status) => status === "passed" ? "ok" : status === "failed" ? "danger" : status === "running" ? "info" : "neutral";
			function renderOverview() {
				return h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: T.gap.sm
				} }, [
					"develop",
					"review",
					"verify",
					"submit",
					"done"
				].includes(stage) ? renderReviewSummary() : null, renderChanges(), h("div", { style: sectionBox }, h("div", { style: styles.row }, sectionHead("目标", "工作站规范化后的表述：做什么 + 为什么", "goal"), requirement ? h(Tag, { tone: requirement.needsReview ? "warn" : "ok" }, requirementStatusLabel(requirement)) : null), requirement?.needsReview ? h("div", { style: {
					...styles.warnCard,
					display: "flex",
					alignItems: "center",
					gap: T.gap.xs,
					flexWrap: "wrap"
				} }, h("span", null, "目标现在还是客户原话，没经过规范化：先整理成「做什么 + 为什么」，再开发更稳。"), h(Button, {
					style: mini,
					disabled: requirementBusy,
					onClick: normalizeRequirement,
					children: requirementBusy ? "规范化中…" : "让工作站规范化"
				})) : null, requirement?.degraded ? h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, `规范化降级：${requirement.reason || "工作站不可用，只能给本地草稿"}`) : null, isEditing("goal") ? h("div", null, h("textarea", {
					style: {
						...styles.textarea,
						marginTop: T.gap.xs
					},
					value: draft.goal ?? "",
					onChange: (event) => update("goal", event.target.value)
				}), editFooter("已保存目标")) : readText(draft.goal, "还没有写目标")), requirement?.raw ? h("details", { style: sectionBox }, h("summary", { style: {
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					gap: T.gap.xs,
					flexWrap: "wrap"
				} }, h("span", { style: styles.sectionTitle }, "原始需求"), h(Tag, { tone: "neutral" }, "客户原话 · 仅追溯")), h("div", { style: {
					marginTop: T.gap.xs,
					color: T.text2,
					whiteSpace: "pre-wrap",
					lineHeight: T.line
				} }, requirement.raw), h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, "保存原样，不会拿它直接当目标；改目标/根因也不会改这里。")) : null, normalizeAttachments(draft.attachments).length ? h("div", { style: sectionBox }, h("div", { style: styles.sectionTitle }, "引用文件 / 截图"), h("div", { style: {
					...styles.sectionHint,
					marginTop: 2
				} }, "随需求提供；开发会话按路径用 read_image / read 读取（图片要求模型支持图片输入）。"), h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 4,
					marginTop: 6
				} }, normalizeAttachments(draft.attachments).map((entry) => h("div", {
					key: entry.id ?? entry.path,
					style: {
						display: "flex",
						gap: 6,
						alignItems: "baseline",
						flexWrap: "wrap"
					}
				}, h(Tag, { tone: isImageAttachment(entry) ? "info" : "neutral" }, isImageAttachment(entry) ? "图片" : "文件"), h("span", { style: {
					fontWeight: 500,
					color: T.text2
				} }, attachmentLabel(entry)), h("span", { style: {
					...styles.mono,
					fontSize: T.font.xs,
					color: T.text4,
					overflowWrap: "anywhere"
				} }, entry.path))))) : null, h("div", { style: sectionBox }, sectionHead("非目标", "明确这次不做什么", "nonGoals"), isEditing("nonGoals") ? h("div", null, h("textarea", {
					style: {
						...styles.textarea,
						marginTop: T.gap.xs
					},
					value: joinLines(draft.nonGoals),
					onChange: (event) => update("nonGoals", splitLines(event.target.value))
				}), editFooter("已保存非目标")) : readList(draft.nonGoals, "还没有写非目标")), h("div", { style: sectionBox }, sectionHead("验收标准", "做到什么算完成", "acceptance"), isEditing("acceptance") ? h("div", null, h("textarea", {
					style: {
						...styles.textarea,
						marginTop: T.gap.xs
					},
					value: joinLines(draft.acceptance),
					onChange: (event) => update("acceptance", splitLines(event.target.value))
				}), editFooter("已保存验收标准")) : readList(draft.acceptance, "还没有验收标准")), h("div", { style: sectionBox }, sectionHead("改动范围", "scope 同时用于并行冲突判定", "scope"), isEditing("scope") ? h("div", null, h("textarea", {
					style: {
						...styles.textarea,
						marginTop: T.gap.xs
					},
					placeholder: "关键文件/范围（一行一个；module:xxx 表示模块）",
					value: joinLines(scopeTokensOf(draft)),
					onChange: (event) => update("scope", splitLines(event.target.value))
				}), editFooter("已保存改动范围")) : h("div", { style: { marginTop: T.gap.xs } }, tokenChips(scopeTokensOf(draft)))), h("div", { style: sectionBox }, h("div", { style: styles.row }, sectionHead("需求澄清 · 根因", "禁止直接写解决方案", "rootProblem"), requirement?.needsReview ? h(Tag, { tone: "warn" }, "还没整理成根因") : requirement ? h(Tag, { tone: "ok" }, requirementStatusLabel(requirement)) : null), requirement?.needsReview ? h("div", { style: {
					...styles.sectionHint,
					marginTop: T.gap.xs
				} }, "下面是客户原话，不是根因：补上「现状是什么、为什么会这样」，再改代码。") : null, isEditing("rootProblem") ? h("div", null, h("textarea", {
					style: {
						...styles.textarea,
						marginTop: T.gap.xs
					},
					placeholder: "根本问题 / 根因（必填，禁止直接写解决方案）",
					value: workflow.rootProblem ?? "",
					onChange: (event) => updateWorkflow({ rootProblem: event.target.value })
				}), editFooter("已保存根因")) : readText(workflow.rootProblem, "还没有写根本问题")), h("details", { style: sectionBox }, h("summary", { style: {
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					gap: T.gap.xs,
					flexWrap: "wrap"
				} }, h("span", { style: styles.sectionTitle }, "追问与回答"), h(Tag, { tone: questions.length && answered >= questions.length ? "ok" : "neutral" }, `${answered}/${questions.length} 已回答`), h("div", { style: styles.spacer }), isEditing("questions") ? null : h(Button, {
					style: mini,
					onClick: () => beginEdit("questions"),
					children: "编辑回答"
				})), isEditing("questions") ? h("div", { style: { marginTop: T.gap.xs } }, questions.map((question) => h("div", {
					key: question.id,
					style: { marginTop: T.gap.xs }
				}, h("input", {
					style: {
						...styles.input,
						height: 28,
						marginBottom: 4
					},
					placeholder: "问题（例如：这次只改 source 还是全部改？）",
					value: question.question ?? "",
					onChange: (event) => setQuestion(question.id, "question", event.target.value)
				}), h("textarea", {
					style: {
						...styles.textarea,
						minHeight: 44,
						marginTop: 4
					},
					placeholder: "回答；不确定就继续追问",
					value: question.answer ?? "",
					onChange: (event) => setQuestion(question.id, "answer", event.target.value)
				}))), h("div", { style: {
					...styles.row,
					marginTop: T.gap.xs
				} }, h(Button, {
					style: mini,
					onClick: addQuestion,
					children: "新增问题"
				})), editFooter("已保存追问回答")) : h("div", { style: {
					marginTop: T.gap.xs,
					display: "flex",
					flexDirection: "column",
					gap: T.gap.xs
				} }, questions.length ? questions.map((question) => h("div", { key: question.id }, h("div", { style: { color: T.text2 } }, question.question), h("div", { style: question.answer ? styles.smallMuted : styles.sectionHint }, question.answer || "未回答"))) : h("div", { style: styles.sectionHint }, "还没有追问"))), h("div", {
					style: sectionBox,
					id: "devhub-risks"
				}, sectionHead("风险 / 阻塞", "一行一个；勾选＝同意并知晓，未勾选计入「待处理风险」", "risks"), isEditing("risks") ? h("div", null, h("textarea", {
					style: {
						...styles.textarea,
						marginTop: T.gap.xs
					},
					value: joinLines(draft.risks),
					onChange: (event) => update("risks", splitLines(event.target.value))
				}), h("div", { style: {
					...styles.sectionHint,
					marginTop: 2
				} }, "已勾选「已知晓」的行如果被删除，对应勾选会自动清掉，不会留下孤儿状态。"), editFooter("已保存风险")) : riskList.length ? h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2,
					marginTop: T.gap.xs
				} }, riskList.map((text, index) => {
					const acked = riskAckSet.has(text);
					return h("label", {
						key: `${index}-${text}`,
						title: acked ? "已同意并知晓；取消勾选会重新计入待处理风险" : "勾选表示你已同意并知晓该风险",
						style: {
							display: "flex",
							alignItems: "flex-start",
							gap: 8,
							minHeight: 28,
							padding: "2px 0",
							fontSize: T.font.base,
							color: acked ? T.text4 : T.text2,
							cursor: busy ? "default" : "pointer"
						}
					}, h("input", {
						type: "checkbox",
						checked: acked,
						disabled: busy,
						style: { marginTop: 4 },
						onChange: () => toggleRiskAck(text)
					}), h("span", { style: {
						flex: "1 1 auto",
						textDecoration: acked ? "line-through" : "none",
						overflowWrap: "anywhere"
					} }, text), h(Tag, { tone: acked ? "ok" : "warn" }, acked ? "已知晓" : "待处理"));
				}), h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, `已知晓 ${riskAckedCount}/${riskList.length}，待处理 ${riskList.length - riskAckedCount}；上方「下一步」会同步这个数量。`)) : h("div", { style: styles.sectionHint }, "当前没有登记风险")), h("div", { style: sectionBox }, sectionHead("变更点", "语义变更点，一行一个", "changePoints"), isEditing("changePoints") ? h("div", null, h("textarea", {
					style: {
						...styles.textarea,
						marginTop: T.gap.xs
					},
					placeholder: "一行一个变更点",
					value: joinLines((draft.changePoints ?? []).map((point) => point.summary)),
					onChange: (event) => update("changePoints", splitLines(event.target.value).map((line) => ({
						type: "manual",
						summary: line
					})))
				}), editFooter("已保存变更点")) : readList((draft.changePoints ?? []).map((point) => point.summary), "还没有变更点")));
			}
			/** 运行一条模板验收（命令来自台账，Host 只跑登记过的命令）。 */
			async function runCheck(checkId) {
				setBusy(true);
				setError("");
				setNotice("");
				try {
					const body = await api(API.check, {
						method: "POST",
						body: JSON.stringify({
							id: draft.id,
							checkId
						})
					});
					if (body.item) {
						setDraft(body.item);
						onSaved?.(body.item);
					}
					setNotice(body.ok ? `验收通过：${checkId}` : `验收未通过：${checkId}`);
					api(API.repro, {
						method: "POST",
						body: JSON.stringify({ id: draft.id })
					}).then(setPlanCheck).catch(() => {});
				} catch (err) {
					setError(errorText(err));
				} finally {
					setBusy(false);
				}
			}
			function renderPlan() {
				const size = estimate.size ?? "待评估";
				const days = estimate.days === null || estimate.days === void 0 || estimate.days === "" ? "—" : estimate.days;
				const confidence = {
					low: "低",
					medium: "中",
					high: "高"
				}[estimate.confidence] ?? "待评估";
				const basis = Array.isArray(estimate.basis) && estimate.basis.length ? estimate.basis : estimate.notes ? [estimate.notes] : [];
				const template = workflow.plan?.template ?? null;
				const checks = draft.checks ?? [];
				const references = draft.references ?? [];
				return h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: T.gap.sm
				} }, planCheck ? h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: T.gap.xs,
					flexWrap: "wrap",
					padding: "8px 12px",
					borderRadius: T.rBase,
					background: planCheck.same ? T.okSoft : planCheck.inputChanged ? T.warnSoft : T.dangerSoft,
					color: planCheck.same ? T.ok : planCheck.inputChanged ? T.warnText : T.danger,
					fontSize: T.font.sm
				} }, h("span", { style: { fontWeight: 600 } }, planCheck.same ? "计划与输入一致" : "计划需要校验"), h("span", { style: { opacity: .85 } }, planCheck.message), h("div", { style: styles.spacer }), h("span", { style: {
					...styles.mono,
					fontSize: T.font.xs
				} }, `指纹 ${planCheck.current?.hash ?? "—"}`), planCheck.same ? null : h(Button, {
					style: mini,
					disabled: busy,
					onClick: async () => {
						try {
							const body = await api(API.repro, {
								method: "POST",
								body: JSON.stringify({
									id: draft.id,
									save: true
								})
							});
							setPlanCheck(body);
							if (body.item) {
								setDraft(body.item);
								onSaved?.(body.item);
							}
							setNotice("已按当前输入重算计划并记录指纹");
						} catch (err) {
							setError(errorText(err));
						}
					},
					children: planCheck.recorded ? "重算并记录" : "补记录指纹"
				})) : null, template ? h("div", { style: sectionBox }, sectionHead(`需求模板：${template.name ?? template.id}`, "按需求类型带出的必改触点；不是建议，是清单", "plan"), (template.touchpoints ?? []).length ? h("ol", { style: {
					margin: "8px 0 0",
					paddingLeft: 18,
					color: T.text2,
					fontSize: T.font.sm,
					lineHeight: T.line
				} }, (template.touchpoints ?? []).map((point, index) => h("li", { key: `${index}-${point}` }, point))) : h("div", { style: {
					...styles.sectionHint,
					marginTop: 6
				} }, "通用改动：没有预置触点")) : null, h("div", { style: sectionBox }, sectionHead("验收检查", "提交前每条都要有结果（命令逐条运行，断言人工确认）", "plan"), checks.length ? h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 6,
					marginTop: T.gap.xs
				} }, checks.map((check) => h("div", {
					key: check.id,
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						flexWrap: "wrap",
						padding: "8px 10px",
						border: `1px solid ${T.borderSoft}`,
						borderRadius: T.rBase
					}
				}, h(Tag, { tone: check.status === "passed" ? "ok" : check.status === "failed" ? "danger" : "neutral" }, check.status === "passed" ? "通过" : check.status === "failed" ? "失败" : "未运行"), h("span", { style: {
					fontSize: T.font.sm,
					color: T.text,
					fontWeight: 500
				} }, check.text), check.command ? h("span", { style: {
					...styles.mono,
					color: T.text4,
					fontSize: T.font.xs
				} }, check.command) : h("span", { style: styles.sectionHint }, check.assertion ?? "人工确认"), h("div", { style: styles.spacer }), check.command ? h(Button, {
					style: mini,
					disabled: busy,
					onClick: () => runCheck(check.id),
					children: "运行"
				}) : null))) : h("div", { style: {
					...styles.sectionHint,
					marginTop: 6
				} }, "这个流程没有模板验收项（旧流程可「重算并记录」生成）")), references.length ? h("div", { style: sectionBox }, sectionHead("参考实现", "照这些类/文档的结构写，别自创分层", "plan"), references.map((reference) => h("div", {
					key: reference.path,
					style: { marginTop: 6 }
				}, h("span", { style: {
					...styles.mono,
					fontSize: T.font.xs,
					color: T.text2
				} }, reference.path), reference.why ? h("span", { style: {
					...styles.sectionHint,
					marginLeft: 8
				} }, reference.why) : null))) : null, h("div", {
					style: sectionBox,
					id: "devhub-plan"
				}, sectionHead("计划摘要", "工作站按仓库探测自评；这里只做确认或微调", "plan"), isEditing("plan") ? h("div", null, h("textarea", {
					style: {
						...styles.textarea,
						marginTop: T.gap.xs
					},
					placeholder: "计划摘要（工作站已生成）",
					value: plan.summary ?? "",
					onChange: (event) => updateWorkflow({ plan: {
						...plan,
						summary: event.target.value
					} })
				}), h("div", { style: {
					...styles.sectionHint,
					marginTop: 6
				} }, "计划步骤（一行一个）"), h("textarea", {
					style: {
						...styles.textarea,
						marginTop: 4
					},
					placeholder: "计划步骤（工作站已生成，一行一个）",
					value: joinLines(plan.steps),
					onChange: (event) => updateWorkflow({ plan: {
						...plan,
						steps: splitLines(event.target.value)
					} })
				}), editFooter("已保存计划")) : h("div", null, readText(plan.summary, "工作站还没有生成计划摘要"), (plan.steps ?? []).length ? h("ol", { style: {
					margin: "8px 0 0",
					paddingLeft: 18,
					color: T.text2,
					fontSize: T.font.base,
					lineHeight: T.line
				} }, (plan.steps ?? []).map((step, index) => h("li", {
					key: `${index}-${step}`,
					style: { marginBottom: 2 }
				}, step))) : null)), h("div", { style: sectionBox }, h("div", { style: styles.spread }, h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2
				} }, h("div", { style: styles.sectionTitle }, "自评工程量"), h("div", { style: styles.sectionHint }, "工作站按探测结果估算，不需要你填写")), h(Tag, { tone: "accent" }, "只读")), h("div", { style: {
					display: "flex",
					gap: T.gap.md,
					flexWrap: "wrap",
					alignItems: "flex-start",
					marginTop: T.gap.xs
				} }, h(Stat, {
					label: "规模",
					value: size,
					hint: "S / M / L / XL"
				}), h(Stat, {
					label: "人日",
					value: days,
					hint: "预估工作量"
				}), h(Stat, {
					label: "置信度",
					value: confidence,
					hint: "自评"
				})), basis.length ? h("div", { style: { marginTop: T.gap.xs } }, h("div", { style: styles.sectionHint }, "依据"), h("ul", { style: {
					margin: "2px 0 0",
					paddingLeft: 18,
					color: T.text2,
					fontSize: T.font.sm,
					lineHeight: T.line
				} }, basis.map((entry, index) => h("li", {
					key: `${index}-${entry}`,
					style: { marginBottom: 2 }
				}, String(entry))))) : h("div", { style: {
					...styles.sectionHint,
					marginTop: T.gap.xs
				} }, "还没有更多依据：先补全探测结果与改动范围。")), h("div", { style: sectionBox }, h("div", { style: styles.spread }, h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2
				} }, h("div", { style: styles.sectionTitle }, "开发任务"), h("div", { style: styles.sectionHint }, "勾选只代表开发任务完成；流程是否结束还要看测试与提交")), h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: T.gap.xs
				} }, h("span", { style: {
					...styles.num,
					fontSize: T.font.sm,
					color: T.text4
				} }, `${doneCount}/${tasks.length}`), isEditing("tasks") ? null : h(Button, {
					style: mini,
					onClick: () => beginEdit("tasks"),
					children: "批量编辑"
				}))), h("div", { style: styles.progressOuter }, h("div", { style: {
					...styles.progressInner,
					width: `${taskPct}%`,
					background: draft.status === "done" ? T.ok : T.brand
				} })), h("div", { style: {
					...styles.sectionHint,
					marginTop: 2,
					color: draft.status === "done" ? T.ok : tasks.length && doneCount >= tasks.length ? T.warnText : T.text4
				} }, draft.status === "done" ? "开发任务与流程都已完成" : `开发任务${tasks.length && doneCount >= tasks.length ? "已完成" : "进行中"}，流程未结束：${pendingFlowStep({
					status: draft.status,
					stage,
					testState: tests.local?.status,
					environmentTestState: tests.environment?.status
				}) ?? "还差测试/提交"}`), isEditing("tasks") ? h("div", null, h("textarea", {
					style: {
						...styles.textarea,
						marginTop: T.gap.xs
					},
					placeholder: "任务（一行一个；前缀 [x] 表示完成）",
					value: tasks.map((task) => `${task.done ? "[x]" : "[ ]"} ${task.text}`).join("\n"),
					onChange: (event) => update("tasks", splitLines(event.target.value).map((line) => ({
						done: /^\[x\]\s*/i.test(line),
						text: line.replace(/^\[[ x]\]\s*/i, "")
					})))
				}), editFooter("已更新任务")) : tasks.length ? h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2,
					marginTop: T.gap.xs
				} }, tasks.map((task, index) => h("label", {
					key: `${index}-${task.text}`,
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 28,
						fontSize: T.font.base,
						color: task.done ? T.text4 : T.text2,
						cursor: "pointer"
					}
				}, h("input", {
					type: "checkbox",
					checked: Boolean(task.done),
					onChange: () => toggleTask(index)
				}), h("span", { style: { textDecoration: task.done ? "line-through" : "none" } }, task.text)))) : h("div", { style: {
					...styles.sectionHint,
					marginTop: T.gap.xs
				} }, "还没有任务；「批量编辑」可以一次粘贴")), h("div", { style: sectionBox }, sectionHead("技术文档", "有就填链接；没有可让 lark-cli 创建", "techDoc"), isEditing("techDoc") ? h("div", null, h("select", {
					style: {
						...styles.input,
						marginTop: T.gap.xs
					},
					value: techDoc.decision ?? "",
					onChange: (event) => updateWorkflow({ techDoc: {
						...techDoc,
						decision: event.target.value || null
					} })
				}, h("option", { value: "" }, "请选择"), h("option", { value: "existing" }, "已有技术文档"), h("option", { value: "create" }, "没有，开发中创建"), h("option", { value: "none" }, "暂不需要")), techDoc.decision === "existing" ? h("div", null, h("input", {
					style: {
						...styles.input,
						marginTop: 6
					},
					placeholder: "文档标题",
					value: techDoc.title ?? "",
					onChange: (event) => updateWorkflow({ techDoc: {
						...techDoc,
						title: event.target.value
					} })
				}), h("input", {
					style: {
						...styles.input,
						marginTop: 6
					},
					placeholder: "文档 URL 或本地路径",
					value: techDoc.url || techDoc.localPath || "",
					onChange: (event) => updateWorkflow({ techDoc: {
						...techDoc,
						url: event.target.value
					} })
				})) : null, techDoc.decision === "create" ? h("div", null, h("input", {
					style: {
						...styles.input,
						marginTop: 6
					},
					placeholder: "待创建文档标题",
					value: techDoc.title ?? "",
					onChange: (event) => updateWorkflow({ techDoc: {
						...techDoc,
						title: event.target.value
					} })
				}), h("div", { style: {
					...styles.row,
					marginTop: 6
				} }, h(Button, {
					style: mini,
					onClick: probeLark,
					children: "检测 lark-cli"
				}), h(Button, {
					style: mini,
					onClick: () => createTechDoc("create"),
					disabled: busy,
					children: "用 lark-cli 创建"
				}), h(Button, {
					style: mini,
					onClick: () => createTechDoc("local"),
					disabled: busy,
					children: "生成本地文档"
				})), lark ? h("div", { style: {
					fontSize: T.font.sm,
					marginTop: 4,
					color: lark.available ? T.text4 : T.danger
				} }, `${lark.available ? "available" : "unavailable"} · ${lark.message ?? ""}`) : null) : null, editFooter("已保存技术文档")) : h("div", { style: {
					marginTop: T.gap.xs,
					display: "flex",
					flexDirection: "column",
					gap: 4
				} }, h("div", { style: {
					display: "flex",
					gap: 6,
					flexWrap: "wrap",
					alignItems: "center"
				} }, h(Tag, { tone: techDoc.decision === "none" ? "neutral" : techDoc.decision ? "accent" : "warn" }, techDocText(techDoc.decision)), techDoc.title ? h(Tag, { tone: "neutral" }, techDoc.title) : null), techDoc.url || techDoc.localPath ? h("span", { style: {
					...styles.mono,
					color: T.text4,
					wordBreak: "break-all"
				} }, techDoc.url || techDoc.localPath) : null, techDoc.createdBy ? h("span", { style: styles.sectionHint }, `来源：${techDoc.createdBy}`) : null)));
			}
			function testBlock(phase, title, hint) {
				const result = tests[phase] ?? {};
				const status = result.status ?? "not_run";
				const stale = Boolean(result.stale);
				const command = result.command || (phase === "local" ? "未配置（使用项目 localTest）" : "未配置（使用项目 environmentTest）");
				return h("div", { style: sectionBox }, h("div", { style: styles.spread }, h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2
				} }, h("div", { style: styles.sectionTitle }, title), h("div", { style: styles.sectionHint }, hint)), h(Tag, { tone: stale ? "warn" : testTone(status) }, stale ? "已过期，需重跑" : TEST_TEXT[status] ?? status)), h("div", { style: {
					...styles.row,
					marginTop: T.gap.xs
				} }, h("span", { style: styles.sectionHint }, "命令"), h("span", { style: {
					...styles.mono,
					color: T.text2
				} }, command), h("div", { style: styles.spacer }), h(Button, {
					style: mini,
					disabled: busy || phase === "environment" && (tests.local?.status !== "passed" || tests.local?.stale || reviewView.status !== "passed"),
					onClick: () => runTest(phase),
					children: phase === "local" ? "运行本机自测" : "运行环境测试"
				})), result.at ? h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, `最近一次：${fmtTime(result.at)}${result.durationMs ? ` · ${Math.round(result.durationMs / 1e3)}s` : ""}`) : null, result.output ? h("details", {
					style: { marginTop: 6 },
					open: status === "failed" || status === "running"
				}, h("summary", { style: {
					cursor: "pointer",
					fontSize: T.font.sm,
					color: T.brand
				} }, status === "failed" ? "查看失败输出" : "查看输出"), h("pre", { style: {
					...styles.pre,
					marginTop: 6
				} }, String(result.output).slice(-4e3))) : null, repoTestRows(result));
			}
			async function loadFiles({ silent = false } = {}) {
				if (silent && filesInFlightRef.current) return;
				filesInFlightRef.current = true;
				if (!silent) setFilesLoading(true);
				try {
					const body = await api(`${API.files}?itemId=${encodeURIComponent(draft.id)}`);
					setFilesInfo(body);
					filesLoadedForRef.current = draft.id;
					setFilesAutoAt(Date.now());
					if ((body.files ?? []).some((file) => file.noteSource === "auto") && !notesTriedRef.current) {
						notesTriedRef.current = true;
						setNotesBusy(true);
						api(API.genFileNotes, {
							method: "POST",
							body: JSON.stringify({ id: draft.id })
						}).then(async (result) => {
							if (result?.item) {
								setDraft(result.item);
								onSaved?.(result.item);
							}
							if (result?.generated?.length) {
								const refreshed = await api(`${API.files}?itemId=${encodeURIComponent(draft.id)}`);
								setFilesInfo(refreshed);
							}
						}).catch(() => {}).finally(() => setNotesBusy(false));
					}
				} catch (err) {
					if (!silent) setError(errorText(err));
				} finally {
					filesInFlightRef.current = false;
					if (!silent) setFilesLoading(false);
				}
			}
			/**
			* 把一个 scope 外文件所在的目录纳入本流程 scope。
			* scope 是开工前确认的边界，不随 git 改动自动扩大；这里给用户一个显式纠正入口。
			*/
			async function adoptFileScope(file) {
				const path = String(file?.path ?? "").replace(/\\/g, "/");
				if (!path) return;
				const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : path;
				if (!dir) return;
				const token = file?.repoName ? `${file.repoName}:${dir}` : dir;
				const nextScope = [.../* @__PURE__ */ new Set([...draft.scope ?? [], token])];
				if (await commit({
					...draft,
					scope: nextScope
				}, `已把 ${token} 纳入本流程 scope`)) await loadFiles();
			}
			/**
			* 打开一个文件的 diff。
			* 虚拟库里同一个仓库相对路径可能在多个成员库都存在，因此必须把 `repo` 一起带上，
			* 让 Host 去正确的成员库读；单库旧响应没有 repo 字段，URL 与以前完全一致。
			*/
			async function openDiff(file) {
				const key = fileKeyOf(file);
				setDiffFile(key);
				setDiffLabel(fileDisplayOf(file));
				setDiffLoading(true);
				setDiffData(null);
				try {
					const params = new URLSearchParams({
						itemId: draft.id,
						path: String(file?.path ?? key)
					});
					if (file?.repo) params.set("repo", file.repo);
					else if (file?.repoName) params.set("repo", file.repoName);
					const body = await api(`${API.diff}?${params.toString()}`);
					setDiffData(body.file);
				} catch (err) {
					setError(errorText(err));
				} finally {
					setDiffLoading(false);
				}
			}
			/**
			* 关键改动预览（默认展开）：最多 5 个，数据库模型/迁移、接口契约、配置优先，
			* 其余按改动行数排序；每块只截前 36 行，点“完整 diff”看全文。
			*/
			function renderKeyPreviews(visible) {
				const picks = pickKeyFiles(visible, 5);
				if (!picks.length) return h("div", { style: {
					...styles.sectionHint,
					padding: 10
				} }, visible.length ? "这些文件没有可展开的文本 diff（二进制或纯重命名）；点左侧文件查看" : onlyScope ? "scope 内没有改动；取消勾选可看全部" : "这个流程还没有文件改动");
				return h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 8
				} }, h("div", { style: {
					...styles.row,
					marginBottom: 2
				} }, h("span", { style: styles.sectionTitle }, "关键改动"), h("span", { style: styles.sectionHint }, `默认展开 ${picks.length} 个：数据库模型 / 接口契约 / 配置优先`)), picks.map(({ file, kind }) => {
					const key = fileKeyOf(file);
					const entry = keyDiffs[key] ?? {};
					const diff = entry.file;
					const { lines, truncated, hidden } = excerptLines(diff?.lines, 36);
					return h("div", {
						key,
						style: {
							border: `1px solid ${T.borderSoft}`,
							borderRadius: T.rBase,
							overflow: "hidden"
						}
					}, h("div", { style: {
						display: "grid",
						gridTemplateColumns: "88px 52px minmax(0, 1fr) 78px 64px",
						alignItems: "center",
						columnGap: 8,
						padding: "6px 10px",
						background: T.surface2
					} }, h(Tag, { tone: kind === "数据库模型" ? "accent" : "neutral" }, kind), h(Tag, { tone: file.status === "added" ? "ok" : file.status === "deleted" ? "danger" : "neutral" }, file.status === "added" ? "新增" : file.status === "deleted" ? "删除" : file.status === "renamed" ? "重命名" : "修改"), h("div", { style: {
						display: "flex",
						alignItems: "center",
						gap: 6,
						minWidth: 0
					} }, fileRepoOf(file) ? h(Tag, {
						tone: "accent",
						style: { flex: "0 0 auto" }
					}, fileRepoOf(file)) : null, file.inScope === false ? h(Tag, {
						tone: "warn",
						style: { flex: "0 0 auto" }
					}, "scope 外") : null, h("span", {
						style: {
							...styles.mono,
							fontSize: T.font.xs,
							color: T.text2,
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						title: fileDisplayOf(file)
					}, fileDisplayOf(file))), h("span", { style: {
						...styles.mono,
						fontSize: T.font.xs,
						color: T.text4,
						textAlign: "right",
						whiteSpace: "nowrap"
					} }, `+${file.added ?? 0} / -${file.removed ?? 0}`), h("span", {
						role: "button",
						style: {
							fontSize: T.font.xs,
							color: T.brand,
							cursor: "pointer",
							textAlign: "right",
							whiteSpace: "nowrap"
						},
						title: "查看这个文件的完整 diff",
						onClick: () => openDiff(file)
					}, "完整 diff")), entry.loading ? h("div", { style: {
						...styles.sectionHint,
						padding: 8
					} }, "正在读取 diff…") : entry.error ? h("div", { style: {
						...styles.dangerCard,
						margin: 8
					} }, entry.error) : diff?.binary ? h("div", { style: {
						...styles.sectionHint,
						padding: 8
					} }, "二进制文件，不显示内容") : h("pre", { style: {
						margin: 0,
						maxHeight: 180,
						overflow: "auto",
						padding: "6px 0",
						fontFamily: T.mono,
						fontSize: 12,
						lineHeight: 1.6
					} }, lines.map((line, index) => h("div", {
						key: `${index}-${line.text.slice(0, 12)}`,
						style: {
							...diffLineStyle(line.type),
							padding: "0 10px",
							whiteSpace: "pre-wrap",
							wordBreak: "break-all"
						}
					}, line.text || " "))), truncated ? h("div", { style: {
						...styles.sectionHint,
						padding: "4px 10px",
						borderTop: `1px solid ${T.borderSoft}`
					} }, `只展示前 ${lines.length} 行；点「完整 diff」查看剩余 ${hidden} 行`) : null);
				}));
			}
			/** 变更页签：左边文件清单（状态/来源/增删行），右边默认关键改动、点文件后看完整 diff。 */
			function renderChanges() {
				const files = filesInfo?.files ?? [];
				const visible = onlyScope ? files.filter((file) => file.inScope !== false) : files;
				const totals = filesInfo?.totals ?? {
					files: 0,
					added: 0,
					removed: 0
				};
				const diffLines = diffData?.lines ?? [];
				const kindCounts = visible.reduce((acc, file) => {
					const kind = keyFileKind(file)?.kind ?? "其他改动";
					acc[kind] = (acc[kind] ?? 0) + 1;
					return acc;
				}, {});
				const outScopeCount = visible.filter((file) => file.inScope === false).length;
				return h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: T.gap.sm
				} }, h("div", { style: sectionBox }, h("div", { style: styles.spread }, h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2
				} }, h("div", { style: styles.sectionTitle }, "这个流程改了哪些文件"), h("div", { style: styles.sectionHint }, filesLoading ? "正在读取 git 变更…" : (() => {
					const shownAdded = visible.reduce((sum, file) => sum + (file.binary ? 0 : file.added), 0);
					const shownRemoved = visible.reduce((sum, file) => sum + (file.binary ? 0 : file.removed), 0);
					const suffix = visible.length === totals.files ? "" : `（共 ${totals.files} 个，含 scope 外）`;
					return `${visible.length} 个文件 · +${shownAdded} / -${shownRemoved}${suffix}`;
				})())), h("div", { style: styles.row }, h("label", { style: {
					...styles.sectionHint,
					display: "inline-flex",
					alignItems: "center",
					gap: 4,
					cursor: "pointer"
				} }, h("input", {
					type: "checkbox",
					checked: onlyScope,
					onChange: (event) => setOnlyScope(event.target.checked)
				}), "只看 scope 内"), h("span", { style: {
					...styles.sectionHint,
					whiteSpace: "nowrap"
				} }, filesAutoAt ? `自动刷新 · ${fmtTime(filesAutoAt)}` : "每 8 秒自动刷新"), h(Button, {
					style: mini,
					disabled: filesLoading,
					onClick: () => loadFiles(),
					children: "刷新"
				}))), filesInfo?.evidenceComplete === false ? h("div", { style: styles.warnCard }, filesInfo.reason ?? "证据不完整：只显示工作区改动") : null, (filesInfo?.excludedCount ?? 0) > 0 ? h("div", { style: { ...styles.sectionHint } }, `已排除 ${filesInfo.excludedCount} 个工作站台账文件（.dev-hub/）`) : null, h("div", { style: { ...styles.sectionHint } }, "统计口径：baseline 以来的提交 + 当前工作区；默认只显示 scope 内，取消勾选可看全部。scope 是开工确认时的边界，不会随改动自动扩大；scope 外文件如果属于本次需求，点「纳入 scope」即可。"), filesInfo ? h("div", { style: {
					display: "flex",
					gap: T.gap.sm,
					marginTop: T.gap.xs,
					alignItems: "stretch"
				} }, h("div", { style: {
					flex: "1 1 42%",
					minWidth: 0,
					display: "flex",
					flexDirection: "column",
					gap: 8
				} }, h("div", { style: {
					flex: "1 1 auto",
					minHeight: 0,
					overflowY: "auto",
					border: `1px solid ${T.borderSoft}`,
					borderRadius: T.rBase
				} }, visible.length ? visible.map((file) => {
					const key = fileKeyOf(file);
					const display = fileDisplayOf(file);
					const repoName = fileRepoOf(file);
					const editing = noteEdit?.key === key;
					const saveNote = async () => {
						if (!editing) return;
						try {
							const body = await api(API.fileNote, {
								method: "POST",
								body: JSON.stringify({
									id: draft.id,
									path: file.path,
									repo: file.repo,
									note: noteEdit.text
								})
							});
							if (body.item) {
								setDraft(body.item);
								onSaved?.(body.item);
							}
							setNoteEdit(null);
							await loadFiles();
						} catch (err) {
							setError(errorText(err));
						}
					};
					return h("div", {
						key,
						style: { borderBottom: `1px solid ${T.borderSoft}` }
					}, h("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 2,
							width: "100%",
							padding: "8px 10px",
							background: diffFile === key ? T.brandSoft : T.surface,
							cursor: "pointer"
						},
						onClick: () => openDiff(file)
					}, h("div", { style: {
						display: "flex",
						alignItems: "center",
						gap: 6,
						minWidth: 0
					} }, repoName ? h(Tag, {
						tone: "accent",
						title: `成员库：${file.repo ?? repoName}`
					}, repoName) : null, h(Tag, { tone: file.status === "added" ? "ok" : file.status === "deleted" ? "danger" : "neutral" }, file.status === "added" ? "新增" : file.status === "deleted" ? "删除" : file.status === "renamed" ? "重命名" : "修改"), file.origin === "both" ? h(Tag, { tone: "accent" }, "提交+未提交") : null, file.inScope === false ? h(Tag, {
						tone: "warn",
						title: "不在开工确认的 scope 内：scope 只按确认时的目录/模块判定；如属于本次需求，点右侧「纳入 scope」"
					}, "scope 外") : null, file.inScope === false ? h(Button, {
						style: {
							height: 22,
							padding: "0 6px",
							fontSize: T.font.xs
						},
						disabled: busy,
						onClick: (event) => {
							event.stopPropagation();
							adoptFileScope(file);
						},
						children: "纳入 scope"
					}) : null, h("span", {
						style: {
							...styles.mono,
							fontSize: T.font.xs,
							color: T.text2,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						title: display
					}, display)), h("div", { style: {
						display: "flex",
						alignItems: "center",
						gap: 6,
						flexWrap: "wrap"
					} }, h("span", { style: {
						fontSize: T.font.xs,
						color: T.text4
					} }, file.binary ? "二进制" : `+${file.added ?? 0} / -${file.removed ?? 0}`), h("span", {
						style: {
							fontSize: T.font.xs,
							color: file.noteSource === "auto" ? T.text4 : T.text2,
							flex: "1 1 120px",
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						title: file.note ?? ""
					}, file.noteSource === "auto" ? notesBusy ? "正在由 agent 补充说明…" : file.note ?? "" : file.note), file.noteSource === "agent" ? h(Tag, { tone: "neutral" }, "agent") : null, h("span", {
						style: {
							fontSize: T.font.xs,
							color: T.brand,
							cursor: "pointer",
							flex: "0 0 auto"
						},
						title: "人工纠偏（默认由 agent 自动补充）",
						onClick: (event) => {
							event.stopPropagation();
							setNoteEdit({
								key,
								path: file.path,
								repo: file.repo,
								text: file.noteSource === "auto" ? "" : file.note ?? ""
							});
						}
					}, file.noteSource === "human" ? "改说明" : "纠偏"))), editing ? h("div", { style: {
						display: "flex",
						gap: 6,
						alignItems: "center",
						padding: "6px 10px",
						background: T.surface2
					} }, h("input", {
						style: {
							...styles.input,
							height: 26,
							flex: "1 1 auto"
						},
						autoFocus: true,
						placeholder: "一句话说明这个文件改了什么、为什么改",
						value: noteEdit.text,
						onChange: (event) => setNoteEdit({
							key,
							path: file.path,
							repo: file.repo,
							text: event.target.value
						}),
						onClick: (event) => event.stopPropagation(),
						onKeyDown: (event) => {
							if (event.key === "Escape") {
								setNoteEdit(null);
								return;
							}
							if (event.key !== "Enter" || event.shiftKey) return;
							event.preventDefault();
							saveNote();
						}
					}), h(Button, {
						style: mini,
						onClick: (event) => {
							event.stopPropagation();
							saveNote();
						},
						children: "保存"
					}), h(Button, {
						style: mini,
						onClick: (event) => {
							event.stopPropagation();
							setNoteEdit(null);
						},
						children: "取消"
					})) : null);
				}) : h("div", { style: {
					...styles.sectionHint,
					padding: 10
				} }, onlyScope ? "scope 内没有改动；取消勾选可看全部" : "这个流程还没有文件改动")), h("div", { style: {
					marginTop: "auto",
					padding: "8px 10px",
					background: T.surface2,
					borderRadius: T.rBase,
					display: "flex",
					flexWrap: "wrap",
					gap: 6,
					alignItems: "center"
				} }, h("span", { style: styles.sectionHint }, `共 ${visible.length} 个文件`), Object.entries(kindCounts).map(([kind, count]) => h(Tag, {
					key: kind,
					tone: kind === "数据库模型" ? "accent" : "neutral"
				}, `${kind} ${count}`)), outScopeCount ? h(Tag, { tone: "warn" }, `scope 外 ${outScopeCount}`) : null, h("span", { style: {
					...styles.sectionHint,
					flex: "1 1 auto",
					textAlign: "right"
				} }, "右侧默认展开关键改动"))), h("div", { style: {
					flex: "1 1 58%",
					minWidth: 0
				} }, !diffFile ? renderKeyPreviews(visible) : diffLoading ? h("div", { style: {
					...styles.sectionHint,
					padding: 10
				} }, "正在读取 diff…") : h("div", null, h("div", { style: {
					...styles.row,
					marginBottom: 6
				} }, h("span", {
					role: "button",
					style: {
						fontSize: T.font.xs,
						color: T.brand,
						cursor: "pointer",
						flex: "0 0 auto"
					},
					onClick: () => setDiffFile(null)
				}, "← 关键改动"), fileRepoOf(diffData) ? h(Tag, { tone: "accent" }, fileRepoOf(diffData)) : null, h("span", { style: {
					...styles.mono,
					fontSize: T.font.xs,
					color: T.text2,
					overflow: "hidden",
					textOverflow: "ellipsis"
				} }, fileDisplayOf(diffData) || diffLabel || diffFile), diffData?.truncated ? h(Tag, { tone: "warn" }, "已截断") : null, diffData?.mode === "untracked" ? h(Tag, { tone: "neutral" }, "未跟踪文件") : null, diffData?.mode === "worktree" ? h(Tag, { tone: "warn" }, "仅工作区（无 baseline）") : null, h("div", { style: styles.spacer }), diffData && !diffData.binary ? h("span", { style: {
					...styles.mono,
					fontSize: T.font.xs,
					color: T.text4
				} }, `+${diffData.added} / -${diffData.removed}`) : null), diffData?.message ? h("div", { style: styles.sectionHint }, diffData.message) : null, diffData?.binary ? h("div", { style: styles.sectionHint }, "二进制文件，不显示内容") : h("pre", { style: {
					margin: 0,
					maxHeight: 420,
					overflow: "auto",
					padding: "8px 0",
					border: `1px solid ${T.borderSoft}`,
					borderRadius: T.rBase,
					background: T.surface,
					fontFamily: T.mono,
					fontSize: 12,
					lineHeight: 1.6
				} }, diffLines.map((line, index) => h("div", {
					key: `${index}-${line.text.slice(0, 12)}`,
					style: {
						...diffLineStyle(line.type),
						padding: "0 10px",
						whiteSpace: "pre-wrap",
						wordBreak: "break-all"
					}
				}, line.text || " ")))))) : h("div", { style: styles.sectionHint }, "还没有加载")));
			}
			function reviewerRoleLabel(role) {
				return REVIEWER_ROLES.find((entry) => entry.id === role)?.label ?? role ?? "审核";
			}
			function reviewerStatusText(reviewer) {
				if (reviewer.status === "error") return "异常/未返回";
				if (reviewer.verdict === "pass") return "通过";
				if (reviewer.verdict === "fail") return "未通过";
				return "待返回";
			}
			function reviewerStatusTone(reviewer) {
				if (reviewer.status === "passed") return "ok";
				if (reviewer.status === "failed") return "danger";
				if (reviewer.status === "error") return "warn";
				return "neutral";
			}
			const severityTone = (severity) => severity === "blocker" ? "danger" : severity === "major" ? "warn" : "neutral";
			/** 概览页的评审摘要：结论一眼可见，按钮跳到评审页。 */
			function renderReviewSummary() {
				const view = describeReview(draft);
				const tone = REVIEW_STATUS_TONES[view.status] ?? "neutral";
				return h("div", { style: sectionBox }, h("div", { style: styles.row }, h("span", { style: styles.sectionTitle }, "独立评审"), h(Tag, { tone }, `${REVIEW_STATUS_LABELS[view.status] ?? view.status}${view.total ? ` · ${view.passed}/${view.total}` : ""}`), h("div", { style: styles.spacer }), h(Button, {
					style: mini,
					onClick: () => setTab("review"),
					children: "查看评审"
				})), h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, view.status === "failed" && view.corrections.length ? `${view.gateReason}：${view.corrections.flatMap((entry) => entry.findings).slice(0, 2).join("；")}` : view.gateReason));
			}
			/** 审核员卡片里的“实时动态”：最新回复 + 正在执行的工具，不要求用户跳会话。 */
			function renderReviewerProgress(reviewer) {
				if (!reviewer?.sessionId) return null;
				const progress = reviewerProgress[reviewer.id];
				if (!progress) return null;
				const items = (progress.items ?? []).filter((item) => item && (item.kind === "assistant" || item.kind === "tool"));
				const lastAssistant = [...items].reverse().find((item) => item.kind === "assistant");
				const runningTool = [...items].reverse().find((item) => item.kind === "tool" && item.status === "running");
				const statusText = progress.reason ? `读取审核会话失败：${progress.reason}` : progress.alive === false ? "审核会话已结束；如果结论没有回写，可重置本轮后重试" : runningTool ? `正在执行：${runningTool.name || "tool"}${runningTool.brief ? ` · ${runningTool.brief}` : ""}` : lastAssistant ? "已收到审核员的最新输出" : "审核会话已启动，等待第一条输出…";
				return h("div", { style: {
					...styles.infoCard,
					marginTop: 6
				} }, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					marginBottom: 4
				} }, h(Spinner, {
					size: 10,
					tone: "accent"
				}), h("span", { style: {
					fontSize: T.font.xs,
					fontWeight: 600,
					color: T.brand
				} }, "审核会话动态"), h("span", { style: {
					...styles.sectionHint,
					minWidth: 0,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				} }, statusText)), lastAssistant?.text ? h("div", { style: {
					fontSize: T.font.xs,
					color: T.text2,
					lineHeight: 1.6,
					whiteSpace: "pre-wrap",
					maxHeight: 92,
					overflow: "hidden"
				} }, `${String(lastAssistant.text).slice(0, 320)}${String(lastAssistant.text).length > 320 ? "…" : ""}`) : null);
			}
			function renderReviewerCard(reviewer) {
				return h("div", {
					key: reviewer.id,
					style: sectionBox
				}, h("div", { style: styles.row }, h("span", { style: styles.sectionTitle }, reviewer.label), h(Tag, { tone: "neutral" }, `视角：${reviewerRoleLabel(reviewer.role)}`), h("div", { style: styles.spacer }), h(Tag, { tone: reviewerStatusTone(reviewer) }, reviewerStatusText(reviewer)), reviewer.confidence ? h(Tag, { tone: "neutral" }, `置信度 ${reviewer.confidence}`) : null), reviewer.error ? h("div", { style: {
					...styles.dangerCard,
					marginTop: T.gap.xs
				} }, `审核员会话异常：${reviewer.error}`) : null, !reviewer.error && reviewer.status === "pending" ? renderReviewerProgress(reviewer) : null, reviewer.summary ? h("div", { style: {
					whiteSpace: "pre-wrap",
					color: T.text2,
					fontSize: T.font.base,
					lineHeight: T.line,
					marginTop: 6
				} }, reviewer.summary) : !reviewer.error && reviewer.status === "pending" ? h("div", { style: styles.sectionHint }, "等待审核员返回结论…") : null, reviewer.direction ? h("div", { style: {
					...styles.infoCard,
					marginTop: 6
				} }, `方向建议：${reviewer.direction}`) : null, reviewer.findings.length ? h("ul", { style: {
					margin: "8px 0 0",
					paddingLeft: 0,
					listStyle: "none",
					display: "flex",
					flexDirection: "column",
					gap: 4
				} }, reviewer.findings.map((finding, index) => h("li", {
					key: `${reviewer.id}-${index}`,
					style: {
						display: "flex",
						gap: 6,
						alignItems: "flex-start",
						fontSize: T.font.sm,
						color: T.text2
					}
				}, h(Tag, { tone: severityTone(finding.severity) }, finding.severity), h("span", null, finding.summary, finding.file ? h("span", { style: {
					...styles.mono,
					color: T.text4,
					marginLeft: 6
				} }, finding.file) : null, finding.detail ? h("div", { style: {
					color: T.text3,
					marginTop: 2
				} }, finding.detail) : null)))) : null, h("div", { style: {
					...styles.sectionHint,
					marginTop: 6,
					display: "flex",
					gap: 10,
					flexWrap: "wrap"
				} }, reviewer.source === "manual" ? "结论来源：人工记录" : reviewer.sessionId ? reviewer.status === "pending" ? h("span", null, "审核会话：", h("span", {
					role: "button",
					title: "打开审核员子会话（运行中可查看它的实际读代码过程）",
					style: {
						color: T.brand,
						cursor: "pointer"
					},
					onClick: () => onOpenSession?.(reviewer.sessionId)
				}, reviewer.sessionId)) : `审核会话：${reviewer.sessionId}（已结束）` : "审核会话：—", reviewer.elapsedMs ? `耗时 ${Math.round(reviewer.elapsedMs / 1e3)}s` : null, reviewer.finishedAt ? `返回于 ${fmtTime(reviewer.finishedAt)}` : null));
			}
			function renderReview() {
				const view = describeReview(draft);
				const tone = REVIEW_STATUS_TONES[view.status] ?? "neutral";
				const border = view.status === "passed" ? T.ok : view.status === "failed" ? T.danger : view.status === "error" ? T.warnText : T.brand;
				return h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: T.gap.sm
				} }, h("div", { style: {
					...sectionBox,
					borderLeft: `3px solid ${border}`
				} }, h("div", { style: styles.row }, h("span", { style: styles.sectionTitle }, "独立评审"), h(Tag, { tone }, REVIEW_STATUS_LABELS[view.status] ?? view.status), view.round ? h(Tag, { tone: "neutral" }, `第 ${view.round} 轮`) : null, h("div", { style: styles.spacer }), view.status === "pending" ? h(Button, {
					style: mini,
					disabled: reviewBusy,
					onClick: resetReview,
					children: "重置本轮"
				}) : null, view.total ? h("span", { style: styles.sectionHint }, `${view.passed} 通过 / ${view.failed} 不通过 / ${view.errored} 异常 / ${view.pending} 待返回${reviewElapsed !== null ? ` · 已用时 ${reviewElapsed}s` : ""}`) : null), h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, "本页只读：不再提供手工派发入口。「继续推进」即开始评审——自动起 1~3 位只读审核员会话，他们自己读目标/验收/scope/改动/自测结果/开发报告，各自给结论。全部通过才允许进入测试验证；不通过退回开发并附纠偏意见；审核员异常或未返回时标记为待处理，绝不当成通过。"), h("div", { style: {
					...styles.row,
					marginTop: T.gap.xs,
					flexWrap: "wrap"
				} }, h("span", { style: styles.sectionHint }, advance.action === "wait" ? `评审进行中：${view.passed}/${view.total} 位已返回，等审核员结论（不重复派发）` : advance.action === "dispatch" ? "开发阶段已完成：点顶栏「继续推进」即自动开始本轮评审" : advance.action === "retry" ? advance.hint : "评审已结束：可以按结论继续推进流程"), h("div", { style: styles.spacer }), h(Button, {
					style: mini,
					onClick: () => setTab("report"),
					children: "查看开发报告"
				})), running ? h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, "开发会话还在改代码：等它停下来再继续推进，否则审的是半成品。") : null, view.basis ? h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, `评审依据：${view.basis.files} 个文件 +${view.basis.added}/-${view.basis.removed} · 本机自测${TEST_TEXT[view.basis.localTest] ?? view.basis.localTest}${view.basis.head ? ` · ${String(view.basis.head).slice(0, 12)}` : ""}`) : null), view.status === "failed" && view.corrections.length ? h("div", { style: {
					...sectionBox,
					borderLeft: `3px solid ${T.danger}`
				} }, h("div", { style: styles.sectionTitle }, "退回开发的纠偏意见"), h("div", { style: styles.sectionHint }, "流程已回到「开发中」：按下面的意见改完，再点「继续推进」重试评审（历史轮次会留在台账里）。"), view.corrections.map((correction) => h("div", {
					key: correction.reviewerId,
					style: { marginTop: T.gap.xs }
				}, h("div", { style: {
					fontWeight: 600,
					color: T.text2,
					fontSize: T.font.sm
				} }, `${correction.reviewerLabel}：${correction.summary || ""}`), h("ul", { style: {
					margin: "4px 0 0",
					paddingLeft: 18,
					color: T.text2,
					fontSize: T.font.sm,
					lineHeight: T.line
				} }, correction.findings.map((finding, index) => h("li", { key: `${correction.reviewerId}-${index}` }, finding)))))) : null, view.total ? h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: T.gap.sm
				} }, view.reviewers.map(renderReviewerCard)) : h("div", { style: sectionBox }, h("div", { style: styles.sectionTitle }, "还没有开始评审"), h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, "开发阶段完成、本机自测通过后，点顶栏「继续推进」即自动开始评审（审核员按默认配置产生）。审核员只读，不会改代码；他们给的结论会写进台账与开发报告。")), view.history.length ? h("details", { style: sectionBox }, h("summary", { style: {
					cursor: "pointer",
					fontSize: T.font.sm,
					fontWeight: 600
				} }, `历史轮次（${view.history.length}）`), view.history.map((round) => h("div", {
					key: round.round,
					style: {
						marginTop: T.gap.xs,
						fontSize: T.font.sm
					}
				}, h("div", { style: {
					fontWeight: 600,
					color: T.text2
				} }, `第 ${round.round} 轮 · ${REVIEW_STATUS_LABELS[round.status] ?? round.status} · ${round.decidedAt ? fmtTime(round.decidedAt) : "—"}`), ...(round.reviewers ?? []).map((reviewer) => h("div", {
					key: reviewer.id,
					style: {
						color: T.text3,
						marginTop: 2
					}
				}, `${reviewer.label}：${reviewer.verdict === "pass" ? "通过" : reviewer.verdict === "fail" ? "不通过" : "未返回"}${reviewer.summary ? ` —— ${reviewer.summary}` : ""}`))))) : null);
			}
			function renderTestAndSubmit() {
				const list = changes?.changes ?? [];
				const localStatus = tests.local?.status ?? "not_run";
				const envStatus = tests.environment?.status ?? "not_run";
				const localValid = localStatus === "passed" && !tests.local?.stale;
				const envValid = envStatus === "passed" && !tests.environment?.stale;
				const isAnalysis = draft.workflow?.intent === "analysis";
				const isGitRepo = draft.workflow?.gitRepo !== false && !isAnalysis;
				const reviewAllowed = reviewView.status === "passed";
				const step = isAnalysis ? !localValid ? {
					label: "跑本机自测",
					hint: "分析流程只读：跑通本机自测作为结论证据，通过后流程直接完成（不跑环境测试、不提交）",
					action: () => runTest("local"),
					command: tests.local?.command
				} : {
					label: "已完成",
					hint: "分析流程只读：结论产出即结束，不建 worktree、不产生提交",
					action: () => {},
					command: null
				} : !localValid ? {
					label: "重跑本机自测",
					hint: tests.local?.stale ? "测试通过后代码/诉求又有变化：旧结果已过期，重跑后才会进入评审" : "跑通后进入「独立评审」；评审通过才允许跑环境测试",
					action: () => runTest("local"),
					command: tests.local?.command
				} : !reviewAllowed ? {
					label: reviewView.status === "failed" ? "重新开始评审" : reviewView.status === "error" ? "重试评审" : reviewView.status === "idle" ? "继续推进即开始评审" : "查看评审状态",
					hint: reviewView.status === "failed" ? "评审未通过：流程已退回开发，按纠偏意见改完再点它重试评审" : reviewView.status === "error" ? "评审异常待处理：有审核员未返回结论，点它重试派发（不重复已返回的结论）" : reviewView.status === "idle" ? "本机自测已通过：点它即自动开始评审（审核员按默认配置产生），评审通过后才能跑环境测试" : "评审进行中：等审核员返回结论，不要跳过评审直接跑环境测试",
					action: () => {
						if (reviewView.status === "pending") {
							setTab("review");
							return;
						}
						startReview();
					},
					command: null
				} : !envValid ? {
					label: "跑环境测试",
					hint: isGitRepo ? "环境验证通过后阶段会进入「待提交」" : "环境验证通过后，这个流程自动完成（非 git 仓库没有提交环节）",
					action: () => runTest("environment"),
					command: tests.environment?.command
				} : isGitRepo ? {
					label: "提交代码",
					hint: "测试都过了：选分支、提交并推送",
					action: () => {
						(typeof document !== "undefined" ? document.getElementById("devhub-submit") : null)?.scrollIntoView?.({
							behavior: "smooth",
							block: "start"
						});
					},
					command: null
				} : {
					label: "已完成",
					hint: "非 git 仓库：测试通过即完成，无需提交/推送",
					action: () => {},
					command: null
				};
				return h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: T.gap.sm
				} }, h("div", { style: {
					...sectionBox,
					borderLeft: `3px solid ${T.brand}`
				} }, h("div", { style: styles.row }, h("span", { style: styles.sectionTitle }, "推进到验证"), h(Tag, { tone: "accent" }, STAGE_LABELS[stage] ?? stage), h("div", { style: styles.spacer }), h(Button, {
					primary: true,
					disabled: busy,
					onClick: step.action,
					children: busy ? "执行中…" : step.label
				})), h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, step.hint), h("div", { style: {
					display: "flex",
					gap: 10,
					alignItems: "center",
					flexWrap: "wrap",
					marginTop: 6
				} }, h("span", { style: { ...styles.smallMuted } }, `本机自测 ${TEST_TEXT[localStatus] ?? localStatus}`), h("span", { style: { color: T.text4 } }, "→"), isAnalysis ? h("span", { style: { ...styles.smallMuted } }, "结论（只读，不跑环境测试/不提交）") : h("span", { style: { ...styles.smallMuted } }, `环境测试 ${TEST_TEXT[envStatus] ?? envStatus}`), h("span", { style: { color: T.text4 } }, "→"), h("span", { style: { ...styles.smallMuted } }, isAnalysis ? "已完成" : "提交"), step.command ? h("span", { style: {
					...styles.mono,
					fontSize: T.font.xs,
					color: T.text4
				} }, step.command) : null)), testBlock("local", "本机自测", isAnalysis ? "分析流程用本机自测作为只读证据；通过即结束，不修改代码" : "先在本机跑通，再进独立评审"), isAnalysis ? null : testBlock("environment", "环境测试", "本机自测 + 独立评审通过后才可执行"), isGitRepo ? h("div", {
					style: sectionBox,
					id: "devhub-submit"
				}, h("div", { style: styles.spread }, h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 2
				} }, h("div", { style: styles.sectionTitle }, "提交代码"), h("div", { style: styles.sectionHint }, "只提交你勾选的文件，不会 git add -A")), h(Button, {
					style: mini,
					disabled: busy,
					onClick: loadChanges,
					children: changes ? "重新加载变更文件" : "加载变更文件"
				})), h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 6,
					marginTop: T.gap.xs
				} }, h("div", { style: styles.sectionHint }, "推送目标"), h("label", { style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					fontSize: T.font.sm,
					cursor: "pointer"
				} }, h("input", {
					type: "radio",
					name: "branchMode",
					checked: branchMode === "current",
					onChange: () => setBranchMode("current")
				}), `基于当前分支推送（${changes?.branch ?? "当前分支"}）`), h("label", { style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					fontSize: T.font.sm,
					cursor: "pointer"
				} }, h("input", {
					type: "radio",
					name: "branchMode",
					checked: branchMode === "new",
					onChange: () => setBranchMode("new")
				}), "新建分支后推送"), branchMode === "new" ? h("input", {
					style: {
						...styles.input,
						height: 30,
						maxWidth: 360
					},
					placeholder: "新分支名，例如 feature/gerrit-source",
					value: branchName,
					onChange: (event) => setBranchName(event.target.value)
				}) : null, h("div", { style: styles.sectionHint }, "提交后会立即执行 git push（新分支自动建立 upstream）；台账 .dev-hub 会跟代码一起提交。")), h("input", {
					style: {
						...styles.input,
						marginTop: T.gap.xs
					},
					placeholder: "提交信息",
					value: commitMessage,
					onChange: (event) => setCommitMessage(event.target.value)
				}), changes ? h("div", { style: { marginTop: T.gap.xs } }, list.length ? (() => {
					const groups = changesByRepo();
					const multi = groups.length > 1 || groups.some(([repo]) => Boolean(repo));
					const row = (change) => h("label", {
						key: change.key ?? `${change.repoName ?? change.repo ?? ""}/${change.path}`,
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: "3px 0",
							fontSize: T.font.sm,
							cursor: "pointer"
						}
					}, h("input", {
						type: "checkbox",
						checked: selectedPaths.includes(change.path),
						onChange: () => togglePath(change.path)
					}), multi && (change.repoName || change.repo) ? h(Tag, { tone: "accent" }, change.repoName ?? repoBaseName(change.repo)) : null, h("span", { style: {
						...styles.mono,
						color: T.text2
					} }, change.path), change.type ? h(Tag, { tone: "neutral" }, change.type) : null);
					if (!multi) return list.map(row);
					return groups.map(([repo, rows]) => h("div", {
						key: repo || "__members__",
						style: { marginTop: 4 }
					}, h("div", { style: {
						...styles.sectionHint,
						paddingLeft: 2,
						fontWeight: 600,
						color: T.text2
					} }, `${repo || "成员库"}（${rows.length}）`), rows.map(row)));
				})() : h("div", { style: styles.sectionHint }, "没有未提交的变更。"), h("div", { style: {
					...styles.row,
					marginTop: T.gap.xs
				} }, h(Button, {
					primary: true,
					disabled: busy,
					onClick: () => submitCode(),
					children: busy ? "提交并推送中…" : "提交并推送"
				}), submissionNeedsRetry() ? h(Button, {
					disabled: busy,
					onClick: () => submitCode({ pushOnly: true }),
					children: "重试推送"
				}) : null, h("span", { style: styles.sectionHint }, `${selectedPaths.length} 个文件已选`))) : null, submitData && submitData.repos.length ? h("div", { style: {
					marginTop: T.gap.xs,
					display: "flex",
					flexDirection: "column",
					gap: 6
				} }, h("div", { style: submitData.ok ? styles.okCard : styles.dangerCard }, submitData.ok ? `已提交并推送 ${submitData.repos.length} 个成员库` : `部分成员库失败：${submitData.failed}/${submitData.repos.length} 个未成功（已提交成功的库不会回滚，可修好后重试推送）`), h("div", { style: {
					border: `1px solid ${T.borderSoft}`,
					borderRadius: T.rBase,
					background: T.surface
				} }, submitData.repos.map((repo, index) => h("div", {
					key: repo.path ?? repo.name ?? index,
					style: {
						padding: "6px 10px",
						borderTop: index ? `1px solid ${T.borderSoft}` : "none",
						display: "flex",
						flexDirection: "column",
						gap: 3
					}
				}, h("div", { style: styles.row }, h(Tag, { tone: repo.error ? "danger" : repo.pushed === false ? "warn" : "ok" }, repo.error ? "失败" : repo.pushed === false ? "未推送" : "已推送"), h("span", { style: {
					fontWeight: 600,
					color: T.text2
				} }, repoDisplayName(repo)), repo.branch ? h("span", { style: {
					...styles.mono,
					fontSize: T.font.xs,
					color: T.text4
				} }, repo.branch) : null, repo.commit ? h("span", { style: {
					...styles.mono,
					fontSize: T.font.xs,
					color: T.text4
				} }, String(repo.commit).slice(0, 8)) : null), repo.error ? h("div", { style: styles.smallDanger }, repo.error) : null, repo.pushOutput ? h("details", { style: { marginTop: 2 } }, h("summary", { style: {
					cursor: "pointer",
					fontSize: T.font.sm,
					color: T.brand
				} }, "查看推送输出"), h("pre", { style: {
					...styles.pre,
					marginTop: 4,
					maxHeight: 160
				} }, String(repo.pushOutput).slice(-2e3))) : null)))) : submitResult ? h("pre", { style: {
					...styles.pre,
					marginTop: T.gap.xs
				} }, submitResult) : null) : h("div", { style: sectionBox }, h("div", { style: styles.sectionTitle }, "不需要提交"), h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, "这个代码库不是 git 仓库：没有提交与推送环节。本机自测 + 环境测试都通过后，流程会自动完成。")));
			}
			function renderMore() {
				return h("details", { style: {
					...styles.cardFlat,
					padding: "10px 12px"
				} }, h("summary", { style: {
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					gap: T.gap.xs,
					flexWrap: "wrap"
				} }, h("span", { style: styles.sectionTitle }, "更多"), h("span", { style: styles.sectionHint }, "标题、历史与删除（低频）")), h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: T.gap.sm,
					marginTop: T.gap.sm
				} }, draft.session?.id ? h("div", { style: sectionBox }, h("div", { style: styles.sectionTitle }, "换一条开发会话"), h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, "默认沿用当前会话（上下文不丢）。只有当前会话不可用、或确实想从零开始时，才需要新建。"), h("div", { style: {
					...styles.row,
					marginTop: 6
				} }, h(Button, {
					style: mini,
					disabled: busy || Boolean(launchBusy),
					onClick: () => runLaunch("fresh", () => onLaunch?.(draft.id, { fresh: true })),
					children: launchBusy === "fresh" ? [h(Spinner, {
						key: "spin",
						size: 10,
						tone: "accent"
					}), "正在开启开发会话…"] : "新建开发会话"
				}))) : null, draft.session?.id ? h("div", { style: sectionBox }, h("div", { style: styles.sectionTitle }, "同步最新上下文（低频）"), h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, "「继续推进」只发一句短消息，不重发 Context Pack；只有计划/约束大改后，才需要把最新一包重新发回会话。"), h("div", { style: {
					...styles.row,
					marginTop: 6
				} }, h(Button, {
					style: mini,
					disabled: busy,
					onClick: () => onLaunch?.(draft.id, { resync: true }),
					children: "重发最新上下文"
				}))) : null, h("div", { style: sectionBox }, sectionHead("标题", "工作站按目标概括；也可以自己改", "title"), isEditing("title") ? h("div", null, h("input", {
					style: {
						...styles.input,
						marginTop: T.gap.xs
					},
					value: draft.title ?? "",
					onChange: (event) => update("title", event.target.value)
				}), editFooter("已保存标题")) : h("div", { style: {
					...styles.row,
					marginTop: T.gap.xs
				} }, h("span", { style: {
					fontWeight: 600,
					color: T.text
				} }, draft.title || draft.id), isWeakTitle(draft.title, draft.description) ? h(Tag, { tone: "warn" }, "标题待整理") : null, h(StatusPill, { status: draft.status }), showStageTag ? h(Tag, { tone: "neutral" }, stageLabelText) : null, h("span", { style: styles.sectionHint }, draft.workflow?.stageReason ? `· ${draft.workflow.stageReason}` : "")), isEditing("title") ? null : h("div", { style: {
					...styles.row,
					marginTop: T.gap.xs,
					flexWrap: "wrap"
				} }, isWeakTitle(draft.title, draft.description) ? h("span", { style: styles.sectionHint }, "当前标题像原始输入/代码片段：点右边按目标自动概括一个。") : null, h("div", { style: { flex: "1 1 auto" } }), h(Button, {
					style: mini,
					disabled: titleBusy || busy,
					onClick: regenerateTitle,
					children: titleBusy ? "生成中…" : "自动生成标题"
				}))), h("div", { style: sectionBox }, h("div", { style: styles.sectionTitle }, "历史"), (draft.history ?? []).length ? h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 4,
					marginTop: T.gap.xs
				} }, [...draft.history ?? []].slice(-20).reverse().map((entry, index) => h("div", {
					key: `${entry.at}-${index}`,
					style: {
						display: "flex",
						gap: 8,
						alignItems: "baseline",
						fontSize: T.font.sm
					}
				}, h("span", { style: {
					...styles.mono,
					color: T.text4,
					flex: "0 0 auto"
				} }, fmtTime(entry.at)), h("span", { style: { color: T.text2 } }, entry.message)))) : h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, "还没有历史记录")), h("div", { style: sectionBox }, h("div", { style: styles.sectionTitle }, "删除流程"), h("div", { style: {
					...styles.sectionHint,
					marginTop: 4
				} }, "只删除这条流程的台账（目标/计划/验收/历史/会话绑定）；**不会**回滚已改代码，也**不会**删除 DSH 开发会话。"), h("div", { style: {
					...styles.row,
					marginTop: T.gap.xs
				} }, h(Button, {
					style: {
						border: `1px solid ${T.danger}`,
						background: T.dangerSoft,
						color: T.danger,
						fontWeight: 500
					},
					disabled: busy,
					onClick: async () => {
						if (!(typeof window !== "undefined" && window.confirm(`删除流程「${draft.title || draft.id}」？\n\n只删台账；代码不回滚、DSH 会话不删除。这个操作不可撤销。`))) return;
						setBusy(true);
						setError("");
						try {
							await api(API.deleteItem, {
								method: "POST",
								body: JSON.stringify({ id: draft.id })
							});
							onDeleted?.(draft.id);
						} catch (err) {
							setError(errorText(err));
						} finally {
							setBusy(false);
						}
					},
					children: "删除这个流程"
				})))));
			}
			/**
			* 进入流程后先给一段"对话"：当前状态摘要 + 最多 3 条按事实算出的建议，
			* 再加一个输入框（推进什么 / 有什么改进建议）。
			* 建议动作全部映射到已有能力，不新增隐藏逻辑。
			*/
			function renderNextStep() {
				const summary = describeFlow(draft, session);
				const { steps } = suggestNextSteps(draft, session);
				const boundId = draft.session?.id ?? null;
				const pendingStep = pendingFlowStep({
					status: summary.status,
					stage: summary.stage,
					testState: summary.localTest,
					environmentTestState: summary.environmentTest
				});
				const tasksAllDone = summary.tasks.total > 0 && summary.tasks.done >= summary.tasks.total;
				if (summary.status === "done" || summary.stage === "done") return h("div", { style: {
					...styles.cardFlat,
					display: "flex",
					flexDirection: "column",
					gap: T.gap.sm
				} }, h("div", { style: styles.row }, h(IconSeat, {
					size: 26,
					tone: "ok"
				}, "✓"), h("span", { style: styles.sectionTitle }, "流程已完成"), h(Tag, { tone: "ok" }, "已完成")), h("div", { style: styles.sectionHint }, "目标、改动范围、测试结果与提交记录都已归档；需要回看时打开开发报告或变更文件。"), h("div", { style: styles.row }, h(Button, {
					primary: true,
					onClick: () => setReportPreviewOpen(true),
					children: "预览开发报告"
				}), h(Button, {
					onClick: () => setTab("overview"),
					children: "查看变更文件"
				}), h(Button, {
					onClick: () => setTab("test"),
					children: "查看测试与提交"
				})));
				/** 打开建议对应的区块：切页签 + 进编辑态 + 滚到可见位置（避免"点了没反应"）。 */
				function scrollToId(id, block = "center") {
					if (typeof document === "undefined") return;
					setTimeout(() => {
						try {
							document.getElementById(id)?.scrollIntoView({
								behavior: "smooth",
								block
							});
						} catch {}
					}, 0);
				}
				async function runStep(action) {
					setError("");
					setNotice("");
					if (action === "launch") {
						onLaunch?.(draft.id);
						return;
					}
					if (action === "start-review") {
						await startReview();
						return;
					}
					if (action === "review") {
						setTab("review");
						return;
					}
					if (action === "local-test") {
						runTest("local");
						return;
					}
					if (action === "env-test") {
						runTest("environment");
						return;
					}
					if (action === "submit") {
						setTab("test");
						return;
					}
					if (action === "edit-plan") {
						setTab("plan");
						beginEdit("plan");
						scrollToId("devhub-plan", "start");
						return;
					}
					if (action === "edit-risks") {
						setTab("overview");
						setEditKey(null);
						setSnapshot(null);
						scrollToId("devhub-risks", "center");
						return;
					}
					if (action === "ask-session") {
						askSession();
						return;
					}
				}
				/**
				* 统一入口：用户只说一句话，由工作站（dsh）判断去补台账还是发开发会话，
				* 不再让用户区分「补充信息 / 推进开发」。
				*/
				async function sendUnified() {
					const message = askText.trim();
					if (!message || busy || assistBusy) return;
					setAssistBusy(true);
					setError("");
					setNotice("");
					setAssistLog((current) => [...current, {
						role: "user",
						text: message
					}]);
					try {
						const body = await api(API.dispatch, {
							method: "POST",
							body: JSON.stringify({
								id: draft.id,
								message
							})
						});
						if (body.item) {
							setDraft(body.item);
							onSaved?.(body.item);
						}
						let sentToSession = false;
						const targetSession = draft.session?.id;
						if ((body.action === "session" || body.action === "both") && targetSession) {
							const sent = await sendToSession(ctx, targetSession, body.sessionMessage || message);
							sentToSession = Boolean(sent?.sent);
						}
						const parts = [body.reply];
						if (body.applied?.length) parts.push(`已更新台账：${body.applied.join("、")}`);
						if (sentToSession) parts.push("已发到开发会话");
						if (body.action === "session" && !targetSession) parts.push("但还没绑定开发会话");
						parts.push(`（判定：${{
							ledger: "补台账",
							session: "推进开发",
							both: "台账+开发",
							none: "无需处理"
						}[body.action] ?? body.action}${body.engine === "local" ? " · 本地规则降级" : ""}）`);
						setAssistLog((current) => [...current, {
							role: "assistant",
							text: parts.filter(Boolean).join("；")
						}]);
						setAskText("");
						setNotice(parts.join("；"));
					} catch (err) {
						setAssistLog((current) => [...current, {
							role: "assistant",
							text: `处理失败：${errorText(err)}`
						}]);
						setError(errorText(err));
					} finally {
						setAssistBusy(false);
					}
				}
				async function askSession() {
					if (askBusy) return;
					setAskBusy(true);
					setError("");
					setNotice("");
					try {
						const message = composeAsk(summary, askText);
						let target = boundId;
						if (!target) {
							const launched = await onLaunch?.(draft.id);
							if (launched?.error) throw new Error(launched.error);
							target = launched?.sessionId ?? null;
						}
						if (!target) throw new Error("还没有可用的开发会话：请先开启开发会话");
						const result = await sendToSession(ctx, target, message);
						if (!result.sent) throw new Error(result.reason ?? "发送失败");
						setAskText("");
						setNotice("已发到开发会话：它会按当前状态推进/给建议，进度显示在下方「会话内容」。");
					} catch (err) {
						setError(errorText(err));
					} finally {
						setAskBusy(false);
					}
				}
				const pending = (pendingQuestions ?? []).filter((entry) => (entry.questions ?? []).length);
				const approvals = (pendingApprovals ?? []).filter((entry) => entry?.title);
				function toggleAnswer(questionId, label, multi) {
					setAnswerPick((current) => {
						const chosen = current[questionId] ?? [];
						if (multi) return {
							...current,
							[questionId]: chosen.includes(label) ? chosen.filter((item) => item !== label) : [...chosen, label]
						};
						return {
							...current,
							[questionId]: chosen.includes(label) ? [] : [label]
						};
					});
				}
				async function submitAnswer(callId, questions, { skip = false } = {}) {
					if (answerBusy) return;
					setAnswerBusy(true);
					setError("");
					setAnswerFeedback({
						callId,
						tone: "ok",
						text: "正在提交回答…"
					});
					try {
						const answers = (questions ?? []).map((question) => ({
							id: question.id,
							selected: skip ? [] : answerPick[question.id] ?? [],
							...skip ? {} : answerCustom[question.id] ? { custom: answerCustom[question.id] } : {}
						}));
						const body = await api(API.answer, {
							method: "POST",
							body: JSON.stringify({
								id: draft.id,
								callId,
								answers
							})
						});
						setAnswerPick({});
						setAnswerCustom({});
						setNotice(body.accepted ? "已把答案发回开发会话，它会继续推进。" : "答案已提交，但会话当前没在等待（可能已超时）；下方会显示剩余待答问题。");
						setAnswerFeedback({
							callId,
							tone: body.accepted ? "ok" : "warn",
							text: body.accepted ? "已提交，会话会继续推进。" : "已提交，但会话可能已不再等待（已超时）。"
						});
						onPendingRefresh?.();
					} catch (err) {
						const text = errorText(err);
						setError(text);
						setAnswerFeedback({
							callId,
							tone: "danger",
							text: `提交失败：${text}`
						});
					} finally {
						setAnswerBusy(false);
					}
				}
				return h("div", { style: {
					...styles.cardFlat,
					display: "flex",
					flexDirection: "column",
					gap: T.gap.xs
				} }, approvals.length ? h("div", {
					key: "approvals",
					style: styles.warnCard
				}, h("div", { style: {
					...styles.row,
					marginBottom: 4
				} }, h("span", { style: { fontWeight: 600 } }, "会话在等待授权 / 审批"), h(Tag, { tone: "warn" }, "已暂停"), h("div", { style: styles.spacer }), h(Button, {
					style: mini,
					onClick: () => onOpenSession?.(draft.session?.id),
					children: "去会话处理"
				})), approvals.map((approval) => h("div", {
					key: approval.id,
					style: {
						marginTop: 4,
						fontSize: T.font.sm,
						color: T.text2
					}
				}, h("div", { style: { fontWeight: 500 } }, approval.title), approval.detail ? h("div", { style: {
					...styles.sectionHint,
					marginTop: 2
				} }, approval.detail) : null)), h("div", { style: {
					...styles.sectionHint,
					marginTop: 6
				} }, "授权/登录类请求只能在会话里确认（DSH 没给插件放行的接口）；点「去会话处理」直接到那一步。")) : null, pending.map((entry) => {
					const needsSession = entry.answerable === false || entry.state === "open";
					return h("div", {
						key: entry.callId,
						style: styles.warnCard
					}, h("div", { style: {
						...styles.row,
						marginBottom: 6
					} }, h("span", { style: { fontWeight: 600 } }, needsSession ? "会话正在前台等你选择" : "开发会话在等你回答"), h(Tag, { tone: "warn" }, needsSession ? "需在会话处理" : "已暂停"), h("div", { style: styles.spacer }), needsSession ? h(Button, {
						style: mini,
						onClick: () => onOpenSession?.(draft.session?.id),
						children: "去会话处理"
					}) : h("span", { style: styles.sectionHint }, "不答就会一直等；也可以「跳过」让它按默认推进")), needsSession ? h("div", { style: {
						...styles.sectionHint,
						marginBottom: 4
					} }, "这个选择正在会话前台等待，只能在开发会话里点选；工作站不能代答，下面的选项仅用于查看。") : null, (entry.questions ?? []).map((question) => h("div", {
						key: question.id,
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 4,
							marginTop: 6
						}
					}, h("div", { style: {
						fontSize: T.font.sm,
						fontWeight: 600,
						color: T.text
					} }, question.header ? `${question.header}：` : "", question.question), question.detail ? h("div", { style: {
						fontSize: T.font.xs,
						color: T.text4
					} }, question.detail) : null, h("div", { style: styles.row }, (question.options ?? []).map((option) => {
						const chosen = (answerPick[question.id] ?? []).includes(option.label);
						return h("span", {
							key: option.label,
							title: option.description ?? "",
							style: {
								...chosen ? styles.chipOn : styles.chip,
								cursor: needsSession ? "default" : "pointer"
							},
							onClick: () => {
								if (!needsSession) toggleAnswer(question.id, option.label, question.multiSelect);
							}
						}, `${chosen ? "✓ " : ""}${option.label}`);
					})), h("input", {
						style: {
							...styles.input,
							marginTop: 2
						},
						placeholder: "也可以直接写你的答案（可留空）",
						value: answerCustom[question.id] ?? "",
						disabled: needsSession,
						onChange: (event) => setAnswerCustom((current) => ({
							...current,
							[question.id]: event.target.value
						}))
					}))), h("div", { style: {
						...styles.row,
						marginTop: 8
					} }, needsSession ? h(Button, {
						primary: true,
						onClick: () => onOpenSession?.(draft.session?.id),
						children: "去会话处理"
					}) : h(Button, {
						primary: true,
						disabled: answerBusy,
						onClick: () => submitAnswer(entry.callId, entry.questions),
						children: answerBusy ? "提交中…" : "提交回答"
					}), needsSession ? null : h(Button, {
						disabled: answerBusy,
						onClick: () => submitAnswer(entry.callId, entry.questions, { skip: true }),
						children: "跳过（按默认推进）"
					}), answerFeedback?.callId === entry.callId ? h("span", { style: {
						fontSize: T.font.xs,
						color: answerFeedback.tone === "danger" ? T.danger : answerFeedback.tone === "ok" ? T.ok : T.warnText,
						maxWidth: 520,
						overflowWrap: "anywhere"
					} }, answerFeedback.text) : null));
				}), h("div", { style: styles.row }, h(IconSeat, { size: 26 }, "✎"), h("span", { style: styles.sectionTitle }, "下一步"), h("span", { style: styles.sectionHint }, "按当前状态给你建议；也可以直接说你想推进什么")), h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap"
				} }, h(Tag, { tone: "accent" }, summary.stageLabel), h(Tag, { tone: "neutral" }, `开发任务 ${summary.tasks.done}/${summary.tasks.total}`), tasksAllDone && pendingStep ? h(Tag, {
					tone: "warn",
					title: "开发任务完成不等于流程完成：还要过测试与提交"
				}, `流程未结束 · ${pendingStep}`) : null, h(Tag, { tone: summary.localTestStale ? "warn" : summary.localTest === "passed" ? "ok" : summary.localTest === "failed" ? "danger" : "neutral" }, `本机自测 ${summary.localTestLabel}`), h(Tag, { tone: summary.environmentTestStale ? "warn" : summary.environmentTest === "passed" ? "ok" : summary.environmentTest === "failed" ? "danger" : "neutral" }, `环境测试 ${summary.environmentTestLabel}`), summary.risks ? h(Tag, { tone: "warn" }, `${summary.risks} 个风险待处理`) : summary.risksTotal ? h(Tag, { tone: "ok" }, `风险 ${summary.risksAcked}/${summary.risksTotal} 已知晓`) : null, boundId ? h(Tag, { tone: summary.session.running ? "accent" : "neutral" }, summary.session.running ? "会话运行中" : "会话空闲") : h(Tag, { tone: "neutral" }, "未开会话"), summary.stageReason ? h("span", { style: styles.sectionHint }, summary.stageReason) : null), steps.length ? h("div", { style: {
					...styles.row,
					marginTop: 2
				} }, steps.map((step) => h("button", {
					key: step.action + step.title,
					type: "button",
					disabled: busy || askBusy,
					title: step.hint,
					onClick: () => runStep(step.action),
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 2,
						alignItems: "flex-start",
						padding: "8px 12px",
						border: `1px solid ${T.borderSoft}`,
						borderRadius: T.rBase,
						background: T.surface,
						color: T.text2,
						cursor: busy || askBusy ? "not-allowed" : "pointer",
						fontFamily: "inherit",
						textAlign: "left",
						transition: T.transition
					}
				}, h("span", { style: {
					fontSize: T.font.sm,
					fontWeight: 600,
					color: T.text
				} }, step.title), h("span", { style: {
					fontSize: T.font.xs,
					color: T.text4
				} }, step.hint)))) : null, assistLog.length ? h("div", { style: {
					display: "flex",
					flexDirection: "column",
					gap: 6,
					marginTop: 4,
					maxHeight: 220,
					overflow: "auto"
				} }, assistLog.map((entry, index) => h("div", {
					key: `${index}-${entry.role}`,
					style: entry.role === "user" ? {
						alignSelf: "flex-end",
						maxWidth: "86%",
						padding: "6px 10px",
						borderRadius: "10px 10px 2px 10px",
						background: T.brandSoft,
						color: T.text,
						fontSize: T.font.sm
					} : {
						alignSelf: "flex-start",
						maxWidth: "86%",
						padding: "6px 10px",
						borderRadius: "2px 10px 10px 10px",
						background: T.surface2,
						color: T.text2,
						fontSize: T.font.sm
					}
				}, entry.text))) : null, h("div", { style: {
					display: "flex",
					gap: T.gap.xs,
					marginTop: 4
				} }, h("textarea", {
					style: {
						...styles.textarea,
						minHeight: 44,
						maxHeight: 120,
						flex: "1 1 auto"
					},
					value: askText,
					placeholder: "用一句话补充或纠偏，例如：验收再加一条失败可回滚；顺便把「跑门禁」标成已完成",
					onChange: (event) => setAskText(event.target.value),
					onKeyDown: (event) => {
						if (event.key !== "Enter" || event.shiftKey) return;
						if (event.nativeEvent?.isComposing) return;
						event.preventDefault();
						sendUnified();
					}
				}), h(Button, {
					primary: true,
					disabled: busy || assistBusy,
					onClick: sendUnified,
					children: assistBusy ? "处理中…" : "发送"
				})), h("div", { style: { ...styles.sectionHint } }, "直接说就行：工作站会判断这句话是补台账、发开发会话，还是两者都做。"));
			}
			/**
			* 顶部卡里的「关联会话」区：绑定后显示 Host 推导的运行中/空闲/已结束、轮次、
			* 最近活动、当前工具/阶段与最后一句；没绑定只给一句引导，不堆控件。
			* `session` 来自 Panel 轮询出来的会话 Map（列表与详情共用同一份）。
			*/
			/** 首屏进度摘要：任务完成度 + 测试/验收/变更事实 + 还差哪一步。 */
			function renderProgress() {
				const checks = draft.checks ?? [];
				const checksPassed = checks.filter((check) => check.status === "passed").length;
				const pendingTasks = tasks.filter((task) => !task.done);
				const pendingStep = pendingFlowStep({
					status: draft.status,
					stage,
					testState: tests.local?.status,
					environmentTestState: tests.environment?.status
				});
				const testTone = (test) => test?.status === "passed" ? "ok" : test?.status === "failed" ? "danger" : test?.status === "running" ? "info" : "neutral";
				const testLabel = (test) => TEST_TEXT[test?.status] ?? "未运行";
				const totals = filesInfo?.totals ?? null;
				const progressColor = draft.status === "done" ? T.ok : T.brand;
				return h("div", { style: {
					borderTop: `1px solid ${T.borderSoft}`,
					paddingTop: T.gap.xs,
					display: "flex",
					flexDirection: "column",
					gap: 6
				} }, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap"
				} }, h("span", { style: styles.sectionTitle }, "开发进度"), h(Tag, { tone: draft.status === "done" ? "ok" : draft.status === "blocked" ? "danger" : "accent" }, STAGE_LABELS[stage] ?? stage), h("span", { style: {
					...styles.num,
					fontSize: T.font.sm,
					color: T.text2,
					fontWeight: 600
				} }, tasks.length ? `任务 ${doneCount}/${tasks.length} · ${taskPct}%` : "任务清单为空"), h(Tag, { tone: tests.local?.stale ? "warn" : testTone(tests.local) }, `本机自测 ${tests.local?.stale ? "已过期" : testLabel(tests.local)}`), h(Tag, { tone: tests.environment?.stale ? "warn" : testTone(tests.environment) }, `环境测试 ${tests.environment?.stale ? "已过期" : testLabel(tests.environment)}`), checks.length ? h(Tag, { tone: checksPassed === checks.length ? "ok" : "warn" }, `验收 ${checksPassed}/${checks.length}`) : null, totals ? h("span", { style: styles.sectionHint }, `变更 ${totals.files ?? 0} 文件 · +${totals.added ?? 0} / -${totals.removed ?? 0}`) : h("span", { style: styles.sectionHint }, "正在读取变更…")), h("div", { style: {
					...styles.progressOuter,
					height: 8
				} }, h("div", { style: {
					...styles.progressInner,
					height: 8,
					width: `${taskPct}%`,
					background: progressColor
				} })), h("div", { style: {
					fontSize: T.font.sm,
					color: pendingStep ? draft.status === "blocked" ? T.danger : T.warnText : T.ok,
					lineHeight: 1.7
				} }, pendingStep ? `${pendingStep}${pendingTasks.length ? `；${pendingTasks.length} 个任务未完成（${pendingTasks.slice(0, 2).map((task) => task.text).join("、")}${pendingTasks.length > 2 ? " 等" : ""}）` : ""}` : "开发、验证与提交都已完成"));
			}
			function renderSession() {
				const boundId = draft.session?.id ?? null;
				const live = session ?? (boundId ? {
					sessionId: boundId,
					boundAt: draft.session?.boundAt ?? null,
					alive: null,
					pending: true
				} : null);
				const stageText = live?.lastStage ? sessionStageText(live.lastStage) : "";
				const workEvidence = Boolean(draft.baseline?.commit || draft.workflow?.tests?.local?.status && draft.workflow.tests.local.status !== "not_run" || draft.workflow?.tests?.environment?.status && draft.workflow.tests.environment.status !== "not_run" || (draft.history ?? []).some((entry) => [
					"start",
					"test",
					"submit",
					"implement",
					"verify",
					"ux"
				].includes(entry?.type)));
				return h("div", { style: {
					borderTop: `1px solid ${T.borderSoft}`,
					paddingTop: T.gap.xs,
					display: "flex",
					flexDirection: "column",
					gap: 4
				} }, h("div", { style: styles.spread }, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap"
				} }, h("span", { style: styles.sectionTitle }, "关联会话"), boundId ? h(SessionBadge, { session: live }) : null, boundId && Number(live?.turns) > 0 ? h("span", { style: styles.sectionHint }, `第 ${live.turns} 轮`) : null, boundId ? h("span", { style: {
					...styles.num,
					fontSize: T.font.xs,
					color: T.text4
				} }, `最近活动 ${sessionActivity(live)}`) : null, live?.lastTool ? h(Tag, { tone: "neutral" }, `工具 ${live.lastTool}`) : null, stageText ? h("span", { style: styles.sectionHint }, `当前：${stageText}`) : null), boundId ? h("span", {
					style: {
						...styles.smallMuted,
						color: T.text4,
						cursor: "pointer",
						alignSelf: "center"
					},
					title: "只断开追踪，不删流程、不动历史",
					onClick: () => onUnbindSession?.(draft.id)
				}, "解绑会话") : null), boundId && live?.lastText ? h("div", {
					style: {
						...styles.sectionHint,
						color: T.text3,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis"
					},
					title: live.lastText
				}, live.lastText) : null, boundId && live?.error ? h("div", { style: styles.dangerCard }, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap"
				} }, h("span", { style: { fontWeight: 600 } }, "开发会话本轮失败"), h("span", { style: styles.sectionHint }, "只代表最近一轮；新一轮开始后会自动清掉"), h("div", { style: styles.spacer }), onOpenSession ? h(Button, {
					style: {
						height: 24,
						padding: "0 8px",
						fontSize: T.font.xs
					},
					onClick: () => onOpenSession(boundId),
					children: "去会话处理"
				}) : null), h("div", { style: {
					...styles.smallMuted,
					marginTop: 4,
					whiteSpace: "pre-wrap",
					overflowWrap: "anywhere"
				} }, live.error)) : null, boundId && live?.alive === false && live?.reason ? h("div", { style: styles.sectionHint }, `说明：${live.reason}`) : null, !boundId ? draft.status === "done" || stage === "done" ? h("div", { style: styles.sectionHint }, "流程已完成；无需再绑定开发会话，需要回看时展开上方「开发会话动态」。") : workEvidence ? h("div", { style: styles.warnCard }, h("div", { style: {
					fontWeight: 600,
					marginBottom: 2
				} }, "台账有进展，但没有绑定开发会话"), "当前阶段/测试记录来自 Agent 直接写入台账（没有走工作站绑定），所以右上角仍是「开启开发会话」。", "点「开启开发会话」会新开一个会话并绑定，之前的台账与历史都不会丢。") : h("div", { style: styles.sectionHint }, "尚未绑定开发会话：点右上角「开启开发会话」，成功后会自动绑定；绑定后这里能看到轮次、最近活动并一键跳回会话。") : null, h("div", { style: { marginTop: 2 } }, h("div", { style: styles.spread }, h("span", { style: styles.sectionHint }, "开发会话动态（默认收起，避免挤占进度）"), h("span", {
					role: "button",
					style: {
						...styles.smallMuted,
						color: T.brand,
						cursor: "pointer"
					},
					onClick: () => setSessionLogOpen((value) => !value)
				}, sessionLogOpen ? "收起" : "展开")), sessionLogOpen ? h(SessionLogPanel, {
					ctx,
					itemId: draft.id,
					sessionId: boundId,
					alive: live?.alive,
					onError: (message) => setError(message)
				}) : null));
			}
			const running = Boolean(session?.running ?? draft.running);
			const tabOptions = [
				{
					value: "overview",
					label: "概览"
				},
				{
					value: "plan",
					label: "计划"
				},
				{
					value: "review",
					label: "独立评审"
				},
				{
					value: "test",
					label: "测试与提交"
				},
				{
					value: "report",
					label: "报告"
				}
			];
			return h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: T.gap.sm
			} }, h("div", { style: {
				...styles.cardFlat,
				display: "flex",
				flexDirection: "column",
				gap: T.gap.xs
			} }, h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: T.gap.xs,
				flexWrap: "wrap"
			} }, h("span", { style: {
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				minWidth: 0
			} }, h("span", {
				role: "button",
				title: "回到开发站首页（流程列表）",
				onClick: onBack,
				style: {
					fontSize: T.font.sm,
					color: T.brand,
					cursor: "pointer",
					flex: "0 0 auto"
				}
			}, "hub"), h("span", { style: {
				color: T.text4,
				flex: "0 0 auto"
			} }, "/")), h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 2,
				minWidth: 0,
				flex: "1 1 280px"
			} }, h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				flexWrap: "wrap"
			} }, h("span", { style: styles.pageTitle }, draft.title || draft.id), h(StatusPill, { status: draft.status }), running ? h(Tag, {
				tone: "accent",
				title: "开发会话正在工作",
				style: {
					gap: 6,
					paddingLeft: 6
				}
			}, h(Spinner, {
				key: "spin",
				size: 10,
				tone: "accent"
			}), "正在开发…") : null, showStageTag ? h(Tag, { tone: "neutral" }, stageLabelText) : null, draft.workflow?.worktree?.branch ? h(Tag, {
				tone: "accent",
				title: `独立工作区：${draft.worktreePath ?? draft.workflow.worktree.branch}`
			}, "独立工作区") : null, h(WorkspaceBadge, {
				workspace: draft.workspace,
				repos: draft.repos
			}), h(Tag, {
				tone: workflow.intent === "bug" ? "warn" : workflow.intent === "analysis" ? "accent" : "neutral",
				title: "点击切换流程类型（bug 先复现/定位；feature 先对齐范围；analysis 只读分析、不进入提交）",
				style: { cursor: "pointer" },
				onClick: () => {
					const nextIntent = nextIntentOf(workflow.intent);
					const hint = nextIntent === "bug" ? "bug 模板会要求先复现与定位根因。" : nextIntent === "analysis" ? "分析流程只读：不建 worktree、不产生提交，只产出结论与补丁建议。" : "feature 先对齐范围与验收，再改代码。";
					if (!window.confirm(`把流程类型改成「${INTENT_LABEL[nextIntent]}」？\n\n${hint}`)) return;
					commit({
						...draft,
						workflow: {
							...workflow,
							intent: nextIntent
						}
					}, "已更新流程类型");
				}
			}, INTENT_LABEL[intentOf(workflow.intent)])), h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 10,
				flexWrap: "wrap"
			} }, h("span", { style: {
				...styles.mono,
				color: T.text4
			} }, draft.id), h("span", { style: styles.sectionHint }, `更新于 ${fmtTime(draft.updatedAt)}`), baseline?.commit ? h("span", { style: styles.sectionHint }, `baseline ${String(baseline.commit).slice(0, 8)}${baseline.branch ? ` @ ${baseline.branch}` : ""}`) : null, draft.workflow?.worktree?.branch ? h("span", {
				style: styles.sectionHint,
				title: draft.worktreePath ?? ""
			}, `工作区 ${draft.workflow.worktree.branch}`) : null)), h("div", { style: styles.spacer }), h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: T.gap.sm,
				flexWrap: "wrap",
				flex: "0 0 auto"
			} }, draft.status === "done" || stage === "done" ? null : h(Button, {
				primary: true,
				style: {
					height: 32,
					padding: "0 14px",
					fontSize: T.font.base,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 6,
					minWidth: 104,
					flex: "0 0 auto"
				},
				disabled: busy || Boolean(launchBusy) || sessionRunning || reviewBusy || advance.disabled,
				title: sessionRunning ? "开发会话正在工作：等当前这步结束再继续推进" : advanceHint || void 0,
				onClick: () => {
					if (advance.action === "dispatch" || advance.action === "retry") {
						if (draft.session?.id) runLaunch("continue", continueDev);
						else runLaunch("review", startReview);
						return;
					}
					if (advance.action === "wait") return;
					if (draft.session?.id) runLaunch("continue", continueDev);
					else runLaunch("open", () => onLaunch?.(draft.id));
				},
				children: reviewBusy || launchBusy === "review" ? [h(Spinner, {
					key: "spin",
					size: 10,
					tone: "accent",
					style: spinnerOnBrand
				}), "评审中…"] : advance.action === "wait" ? [h(Spinner, {
					key: "spin",
					size: 10,
					tone: "accent",
					style: spinnerOnBrand
				}), "评审中"] : launchBusy === "continue" ? [h(Spinner, {
					key: "spin",
					size: 10,
					tone: "accent",
					style: spinnerOnBrand
				}), "正在继续开发会话…"] : launchBusy === "open" ? [h(Spinner, {
					key: "spin",
					size: 10,
					tone: "accent",
					style: spinnerOnBrand
				}), "正在开启开发会话…"] : sessionRunning ? [h(Spinner, {
					key: "spin",
					size: 10,
					tone: "accent",
					style: spinnerOnBrand
				}), "正在开发…"] : !draft.session?.id && advance.action === "continue" ? "开启开发会话" : "继续推进"
			}), advanceHint ? h("span", {
				key: "advance-hint",
				role: "status",
				style: {
					maxWidth: 360,
					fontSize: T.font.xs,
					lineHeight: 1.5,
					color: T.danger
				}
			}, advanceHint) : null, !draft.session?.id && draft.status !== "done" && stage !== "done" && draft.workflow?.gitRepo !== false ? h(Button, {
				style: {
					height: 32,
					padding: "0 10px",
					fontSize: T.font.sm
				},
				disabled: busy || Boolean(launchBusy) || syncBusy,
				title: "开发前拉取最新代码：git fetch + merge --ff-only（不自动 rebase/reset）",
				onClick: syncCode,
				children: syncBusy ? [h(Spinner, {
					key: "spin",
					size: 10,
					tone: "accent"
				}), "同步中…"] : "⟳ 拉取代码"
			}) : null, h(Button, {
				style: {
					height: 32,
					padding: "0 12px",
					fontSize: T.font.base
				},
				onClick: () => setReportPreviewOpen(true),
				children: "预览报告"
			}), h(HeaderMenu, { items: [{
				label: "生成上下文",
				hint: "低频：只预览 Context Pack，不发给开发会话",
				disabled: busy,
				onClick: () => onContext?.(draft)
			}] }))), renderProgress(), renderSession()), h("div", { style: {
				...styles.cardFlat,
				padding: "10px 12px"
			} }, h("div", { style: {
				...styles.row,
				marginBottom: 8
			} }, h("span", { style: styles.sectionTitle }, "流程"), h("div", { style: styles.spacer }), h("span", { style: styles.sectionHint }, draft.workflow?.intent === "analysis" ? "分析流程只读：只读排查 → 结论；不跑环境测试、不进入提交" : "阶段随工作自动推进：本机自测通过后点「继续推进」即开始独立评审；评审通过 → 测试验证；环境验证通过 → 待提交；提交后 → 完成")), h(ArrowSteps, {
				stages: draft.workflow?.gitRepo === false || draft.workflow?.intent === "analysis" ? WORKFLOW_STAGES.filter((entry) => entry.id !== "submit") : WORKFLOW_STAGES,
				stageIndex,
				activePartial: stage === "verify" && tests.local?.status === "passed" && !tests.local?.stale && tests.environment?.status !== "passed",
				activeLoading: stage === "develop" && running || stage === "review" && (reviewBusy || reviewView.status === "pending"),
				activeDetail: (() => {
					if (stage === "develop" && running) return "正在开发…";
					if (stage === "review") {
						if (reviewBusy) return "评审中…";
						if (reviewView.status === "pending") return `评审中 ${reviewView.passed}/${reviewView.total}`;
						if (reviewView.status === "failed") return "评审未通过，待纠偏";
						if (reviewView.status === "error") return "评审异常待处理";
						if (reviewView.status === "passed") return `评审 ✓ ${reviewView.passed}/${reviewView.total}`;
						return "继续推进即开始评审";
					}
					const local = tests.local?.status === "passed" && !tests.local?.stale;
					const env = tests.environment?.status === "passed" && !tests.environment?.stale;
					if (stage === "verify") return local ? `本机 ✓${env ? " · 环境 ✓" : " · 环境未跑"}` : "本机未跑";
					if (stage === "submit") return "待推送";
					return "";
				})()
			}), workflow.rework?.at ? h("div", { style: {
				...styles.warnCard,
				marginTop: T.gap.xs
			} }, h("strong", null, "已回到开发中：测试通过后代码/诉求又有变化"), h("div", { style: { marginTop: 2 } }, workflow.rework.reason || "旧测试结论已过期，请在当前改动上重跑本机自测。")) : null, stage === "develop" && running ? h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				marginTop: T.gap.xs,
				padding: "8px 10px",
				borderLeft: `3px solid ${T.brand}`,
				borderRadius: T.rBase,
				background: T.brandSoft,
				color: T.text2,
				fontSize: T.font.sm
			} }, h(Spinner, {
				size: 12,
				tone: "accent",
				title: "开发会话正在工作"
			}), h("span", null, "开发中：开发会话正在工作，完成后到「测试与提交」跑本机自测")) : null, stage === "review" ? h("div", { style: {
				...styles.sectionHint,
				marginTop: 2
			} }, reviewView.status === "failed" ? `独立评审未通过：${reviewView.corrections.length} 位审核员给出纠偏意见（改完点「继续推进」重试评审）。` : reviewView.status === "error" ? "评审异常待处理：有审核员没有返回结论，流程不会进入测试验证；点「继续推进」重试派发。" : reviewView.status === "pending" ? "独立评审进行中：等审核员返回结论，不要跳过评审直接跑环境测试。" : "继续推进即开始评审：自动派 1~3 位审核员复核改动与证据，全部通过后才进入测试验证。") : null, stage === "verify" ? h("div", { style: {
				...styles.sectionHint,
				marginTop: 2
			} }, tests.local?.status === "passed" && !tests.local?.stale ? tests.environment?.status === "passed" && !tests.environment?.stale ? "测试验证完成：本机与环境都通过，接下来去「测试与提交」提交并推送。" : "测试验证还没完成：本机自测已通过，还需要跑「环境测试」才会进入「待提交」。" : "测试验证还没完成：先在「测试与提交」里跑本机自测。") : null), renderNextStep(), error ? h("div", { style: styles.dangerCard }, error) : null, notice ? h("div", { style: styles.infoCard }, notice) : null, h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: T.gap.sm,
				flexWrap: "wrap",
				marginTop: T.gap.xs
			} }, h(Segmented, {
				options: tabOptions,
				value: tab,
				onChange: setTab
			}), h("div", { style: styles.spacer }), h("span", { style: styles.sectionHint }, "默认只读；点「编辑」才展开输入框")), tab === "overview" ? renderOverview() : tab === "plan" ? renderPlan() : tab === "review" ? renderReview() : tab === "report" ? h(ReportView, { itemId: draft.id }) : renderTestAndSubmit(), renderMore(), reportPreviewOpen ? h(Modal, {
				title: "开发报告预览",
				width: "min(1120px, 96vw)",
				onClose: () => setReportPreviewOpen(false)
			}, h(ReportView, { itemId: draft.id })) : null);
		}
		function Panel({ ctx, onOpenChat, openFlowId = null, openFlowNonce = 0, homeNonce = 0, onScopeChanged = null }) {
			const [state, setState] = (0, react.useState)(null);
			const [wsOpen, setWsOpen] = (0, react.useState)(false);
			const [wsEditId, setWsEditId] = (0, react.useState)(null);
			const [wsName, setWsName] = (0, react.useState)("");
			const [wsPaths, setWsPaths] = (0, react.useState)("");
			const [wsPicked, setWsPicked] = (0, react.useState)([]);
			const [wsError, setWsError] = (0, react.useState)("");
			const [selected, setSelected] = (0, react.useState)(null);
			const [detailEditing, setDetailEditing] = (0, react.useState)(false);
			const detailJsonRef = (0, react.useRef)("");
			(0, react.useEffect)(() => {
				if (openFlowId) setSelected(openFlowId);
			}, [openFlowId, openFlowNonce]);
			const homeNonceRef = (0, react.useRef)(homeNonce);
			(0, react.useEffect)(() => {
				if (homeNonce === homeNonceRef.current) return;
				homeNonceRef.current = homeNonce;
				setSelected(null);
			}, [homeNonce]);
			const restoredPanelRef = (0, react.useRef)("");
			const scrollRef = (0, react.useRef)(0);
			const [context, setContext] = (0, react.useState)(null);
			const [candidates, setCandidates] = (0, react.useState)([]);
			const [parallel, setParallel] = (0, react.useState)(null);
			const [parallelError, setParallelError] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [fixingTitles, setFixingTitles] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [setupOpen, setSetupOpen] = (0, react.useState)(false);
			const [reportPreviewId, setReportPreviewId] = (0, react.useState)(null);
			const [setupMode, setSetupMode] = (0, react.useState)("setup");
			const [sessionStates, setSessionStates] = (0, react.useState)(/* @__PURE__ */ new Map());
			const [pendingQuestions, setPendingQuestions] = (0, react.useState)([]);
			const [pendingApprovals, setPendingApprovals] = (0, react.useState)([]);
			const [switchingRepo, setSwitchingRepo] = (0, react.useState)(null);
			const switchSeq = (0, react.useRef)(0);
			const switchTargetRef = (0, react.useRef)(null);
			function sessionMapFrom(rows) {
				return new Map((rows ?? []).filter((row) => row?.itemId).map((row) => [row.itemId, row]));
			}
			/** GET /pending：拉当前流程的待答问题；没有会话/不在进程内时返回空 + 原因。 */
			async function loadPending(itemId) {
				const id = itemId ?? selected;
				if (!id) {
					setPendingQuestions([]);
					setPendingApprovals([]);
					return;
				}
				try {
					const body = await api(`${API.pending}?itemId=${encodeURIComponent(id)}`);
					setPendingQuestions(Array.isArray(body.pending) ? body.pending : []);
					setPendingApprovals(Array.isArray(body.approvals) ? body.approvals : []);
				} catch {
					setPendingQuestions([]);
					setPendingApprovals([]);
				}
			}
			/** GET /sessions：轮询入口；失败时保留上一次的会话状态（不让整页报错），只记一条调试日志。 */
			async function loadSessions() {
				try {
					const body = await api(API.sessions);
					setSessionStates(sessionMapFrom(body.sessions));
					if (selected) loadPending(selected);
				} catch (err) {
					if (typeof console !== "undefined") console.warn("[dev-hub] 会话状态刷新失败：", errorText(err));
				}
			}
			async function loadParallel() {
				setParallelError("");
				try {
					const body = await api(API.parallel);
					setParallel(body);
				} catch (err) {
					setParallel(null);
					setParallelError(errorText(err));
				}
			}
			async function loadItems() {
				try {
					const items = (await api(API.items)).items ?? [];
					setState((current) => current ? {
						...current,
						items
					} : current);
					return items;
				} catch (err) {
					setError(errorText(err));
					return null;
				}
			}
			/** 批量整理弱标题：按已有目标生成，不调模型；失败要显式提示。 */
			async function fixWeakTitles() {
				if (fixingTitles) return;
				setFixingTitles(true);
				setError("");
				setNotice("");
				try {
					const body = await api(API.requirement, {
						method: "POST",
						body: JSON.stringify({ action: "retitleWeak" })
					});
					const changed = Array.isArray(body.changed) ? body.changed : [];
					setNotice(changed.length ? `已整理 ${changed.length} 个流程标题：${changed.map((entry) => entry.to).join("；")}` : "没有需要整理的标题");
					await reload();
				} catch (err) {
					setError(`整理标题失败：${errorText(err)}`);
				} finally {
					setFixingTitles(false);
				}
			}
			async function reload() {
				setBusy(true);
				setError("");
				try {
					const next = await api(API.state);
					setState((current) => {
						const merged = { ...next };
						const sameRepo = Boolean(current?.repo?.path) && current.repo.path === next?.repo?.path;
						const stillExists = (next.items ?? []).some((item) => item.id === selected);
						if (sameRepo && selected && stillExists && current?.selectedItem?.id === selected) merged.selectedItem = current.selectedItem;
						return merged;
					});
					const repoPath = next?.repo?.path;
					if (repoPath && restoredPanelRef.current !== repoPath) {
						restoredPanelRef.current = repoPath;
						const saved = loadPanelState(repoPath);
						if (!openFlowId && saved.selectedId && (next.items ?? []).some((item) => item.id === saved.selectedId)) setSelected(saved.selectedId);
						scrollRef.current = saved.scrollTop || 0;
					}
					if (Array.isArray(next.sessionStates)) setSessionStates(sessionMapFrom(next.sessionStates));
					if (next.needsSetup || !next.repo) return;
					await Promise.all([loadItems(), loadParallel()]);
				} catch (err) {
					setError(errorText(err));
				} finally {
					setBusy(false);
				}
			}
			(0, react.useEffect)(() => {
				reload();
			}, []);
			(0, react.useEffect)(() => {
				if (!state?.repo) return void 0;
				const timer = setInterval(() => {
					if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
					loadSessions();
				}, 5e3);
				return () => clearInterval(timer);
			}, [state?.repo?.path]);
			(0, react.useEffect)(() => {
				const repoPath = state?.repo?.path;
				if (!repoPath) return;
				savePanelState(repoPath, {
					selectedId: selected,
					scrollTop: scrollRef.current
				});
			}, [selected, state?.repo?.path]);
			(0, react.useEffect)(() => {
				if (!selected) {
					setState((current) => current ? {
						...current,
						selectedItem: null
					} : current);
					return;
				}
				if (!state?.repo) return;
				api(`${API.item}?id=${encodeURIComponent(selected)}`).then((body) => {
					detailJsonRef.current = JSON.stringify(body.item);
					setSelectedItem(body.item);
				}).catch((err) => setError(errorText(err)));
				loadPending(selected);
			}, [
				selected,
				state?.repo?.path,
				openFlowNonce
			]);
			(0, react.useEffect)(() => {
				if (!selected || !state?.repo || detailEditing) return void 0;
				const timer = setInterval(async () => {
					if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
					try {
						const body = await api(`${API.item}?id=${encodeURIComponent(selected)}`);
						const json = JSON.stringify(body.item);
						if (json === detailJsonRef.current) return;
						detailJsonRef.current = json;
						setSelectedItem(body.item);
					} catch {}
				}, 8e3);
				return () => clearInterval(timer);
			}, [
				selected,
				state?.repo?.path,
				detailEditing
			]);
			function setSelectedItem(item) {
				setState((current) => current ? {
					...current,
					selectedItem: item
				} : current);
			}
			async function detect() {
				try {
					const body = await api(API.detect, {
						method: "POST",
						body: "{}"
					});
					setState((current) => current ? {
						...current,
						env: body.env
					} : current);
				} catch (err) {
					setError(errorText(err));
				}
			}
			async function makeContext(item) {
				try {
					const body = await api(API.context, {
						method: "POST",
						body: JSON.stringify({ id: item.id })
					});
					setContext(body);
				} catch (err) {
					setError(errorText(err));
				}
			}
			async function copy() {
				if (!context?.prompt) return;
				try {
					await navigator.clipboard.writeText(context.prompt);
				} catch {
					setError("复制失败，请手动选择文本");
				}
			}
			async function scan() {
				try {
					const body = await api(API.scan);
					setCandidates(body.candidates ?? []);
				} catch (err) {
					setError(errorText(err));
				}
			}
			async function importCandidate(candidate) {
				try {
					await api(API.importCandidate, {
						method: "POST",
						body: JSON.stringify({ candidate })
					});
					setCandidates((current) => current.filter((item) => item.id !== candidate.id));
					await reload();
				} catch (err) {
					setError(errorText(err));
				}
			}
			/**
			* 点代码库卡片切换。
			* - 请求序号防连点竞态：只认最后一次响应（避免切回来还是别的库）；
			* - 切换前清空旧库的详情/会话状态/并行数据，避免串味；
			* - detect:false 复用本机环境缓存（新库首次由「新增代码库」探测）。
			*/
			async function selectRepo(repoPath) {
				const target = String(repoPath ?? "").trim();
				const alreadySingle = !state?.workspace && target === state?.repo?.path;
				if (!target || alreadySingle) return;
				const name = state?.profile?.member;
				if (!name) {
					setError("还没有成员标识，请先完成初始化");
					return;
				}
				const targetKey = `repo:${target}`;
				if (switchTargetRef.current === targetKey) return;
				switchTargetRef.current = targetKey;
				switchSeq.current += 1;
				const seq = switchSeq.current;
				setSwitchingRepo(target);
				setError("");
				setNotice("");
				setContext(null);
				setCandidates([]);
				setParallel(null);
				setSessionStates(/* @__PURE__ */ new Map());
				try {
					const next = await api(API.switchRepo, {
						method: "POST",
						body: JSON.stringify({
							repoPath: target,
							name,
							detect: false
						})
					});
					if (seq !== switchSeq.current) return;
					setState(next);
					onScopeChanged?.();
					setSessionStates(sessionMapFrom(next.sessionStates));
					setParallel(next.parallel ?? null);
					const targetRepo = next?.repo?.path;
					if (targetRepo) {
						restoredPanelRef.current = targetRepo;
						const saved = loadPanelState(targetRepo);
						setSelected(saved.selectedId && (next.items ?? []).some((item) => item.id === saved.selectedId) ? saved.selectedId : null);
					}
				} catch (err) {
					if (seq === switchSeq.current) setError(errorText(err));
				} finally {
					if (seq === switchSeq.current) {
						setSwitchingRepo(null);
						switchTargetRef.current = null;
					}
				}
			}
			/** 台账返回的 item 统一回写：详情与列表摘要一起更新（含 session 绑定信息）。 */
			function mergeSavedItem(saved) {
				if (!saved?.id) return;
				setState((current) => current ? {
					...current,
					selectedItem: saved,
					items: (current.items ?? []).map((item) => item.id === saved.id ? {
						...item,
						title: saved.title,
						status: saved.status,
						stage: saved.workflow?.stage ?? item.stage,
						updatedAt: saved.updatedAt ?? item.updatedAt,
						scope: saved.scope ?? item.scope,
						doneCount: (saved.tasks ?? []).filter((task) => task.done).length,
						taskCount: (saved.tasks ?? []).length,
						session: saved.session ?? null
					} : item)
				} : current);
			}
			/** 打开已绑定的 DSH 会话；壳的 openSession 不存在/报错时明确提示，不假装成功。 */
			async function openSession(sessionId) {
				const id = String(sessionId ?? "").trim();
				if (!id) {
					setError("该流程还没有绑定开发会话");
					return;
				}
				const workspace = ctx?.get?.("uiWorkspace");
				if (!workspace || typeof workspace.openSession !== "function") {
					setError("当前环境没有可用的会话工作区，无法跳转开发会话");
					return;
				}
				try {
					await workspace.openSession(id);
				} catch (err) {
					setError(`打开开发会话失败：${errorText(err)}`);
				}
			}
			/** 绑定：详情页「开启开发会话」成功、或聊天页开工后都用它把 sessionId 写回台账。 */
			async function bindSession(itemId, sessionId) {
				try {
					const body = await api(API.session, {
						method: "POST",
						body: JSON.stringify({
							action: "bind",
							id: itemId,
							sessionId
						})
					});
					if (body?.item) {
						mergeSavedItem(body.item);
						setSessionStates((current) => {
							const next = new Map(current);
							const base = {
								itemId,
								itemTitle: body.item.title ?? itemId,
								status: body.item.status ?? "",
								boundAt: body.item.session?.boundAt ?? null
							};
							next.set(itemId, body.session ? {
								...base,
								...body.session
							} : {
								...base,
								sessionId,
								alive: null
							});
							return next;
						});
					}
					await loadSessions();
					return body;
				} catch (err) {
					throw new Error(`开发会话已开启，但绑定到流程失败：${errorText(err)}`);
				}
			}
			/** 解绑：只断开追踪，不删流程、不动历史；确认后执行。 */
			async function unbindSession(itemId) {
				if (!window.confirm("解绑当前开发会话？流程内容与历史不受影响，只是不再追踪该会话。")) return;
				setBusy(true);
				setError("");
				setNotice("");
				try {
					const body = await api(API.session, {
						method: "POST",
						body: JSON.stringify({
							action: "unbind",
							id: itemId
						})
					});
					if (body?.item) mergeSavedItem(body.item);
					setSessionStates((current) => {
						const next = new Map(current);
						next.delete(itemId);
						return next;
					});
					setNotice("已解绑开发会话");
				} catch (err) {
					setError(errorText(err));
				} finally {
					setBusy(false);
				}
			}
			/** 工作站开启开发会话：记录 baseline → 生成 Context Pack → 新建会话并发送 → 绑定 → 切过去。 */
			/**
			* 开启开发会话：已有绑定会话时默认「继续之前的沟通」（发回同一会话，历史/决定还在）；
			* 传 { fresh: true } 则强制新建。
			*/
			async function launchDev(id, { fresh = false, resync = false } = {}) {
				const item = state?.selectedItem;
				const title = item?.title ?? id;
				if (!state?.repo?.path) {
					setError("尚未选择代码库");
					return;
				}
				const previous = item?.session?.id;
				const continueExisting = Boolean(previous) && !fresh;
				if (!resync && !window.confirm(continueExisting ? `把「${title}」的最新 Context Pack 重发到 ${previous}？（之前聊过的内容、决定与工具结果都还在）\n\n日常推进用「继续推进」就够了；要开新的，请在「更多 → 换一条开发会话」里新建。` : `开启新的开发会话？\n\n将新建一个 DSH 会话，并把「${title}」的约束与 Context Pack 作为首条消息发送。`)) return;
				setBusy(true);
				setError("");
				setNotice("");
				try {
					const started = resync ? await api(API.context, {
						method: "POST",
						body: JSON.stringify({ id })
					}) : await api(API.start, {
						method: "POST",
						body: JSON.stringify({ id })
					});
					setState((current) => current ? {
						...current,
						selectedItem: started.item
					} : current);
					const result = await launchDevSession(ctx, {
						cwd: started.workRoot ?? state.repo.path,
						prompt: launchPrompt(started.context?.prompt, started.item ?? item),
						continueSessionId: continueExisting ? previous : null,
						open: false
					});
					let bindError = "";
					if (result.sessionId) try {
						await bindSession(id, result.sessionId);
					} catch (err) {
						bindError = errorText(err);
					}
					const bound = Boolean(result.sessionId) && !bindError;
					setNotice(bound ? result.sent ? result.continued ? resync ? `已把最新上下文重发给开发会话 ${result.sessionId}。` : `已继续之前的开发会话 ${result.sessionId}。` : `${result.continueFailed ? `原会话已不可用（${result.continueFailed}），` : ""}已开启开发会话 ${result.sessionId} 并绑定到本流程。` : `已绑定开发会话 ${result.sessionId}（当前版本不支持自动发送，确认后按发送即可开始）。` : result.sent ? `已开启开发会话 ${result.sessionId}：约束与 Context Pack 已发送，开发在该会话里继续。` : "已开启新会话并把上下文放进输入框（当前版本不支持自动发送），确认后按发送即可开始。");
					await reload();
					if (bindError) setError(bindError);
					return {
						sessionId: result.sessionId ?? null,
						sent: Boolean(result.sent),
						continued: Boolean(result.continued),
						bindError
					};
				} catch (err) {
					setError(errorText(err));
					return {
						sessionId: null,
						sent: false,
						error: errorText(err)
					};
				} finally {
					setBusy(false);
				}
			}
			/** 切到某个虚拟库（多成员库组合）。 */
			async function selectWorkspace(workspaceId) {
				const target = String(workspaceId ?? "").trim();
				if (!target) return;
				if (state?.workspace?.id === target) return;
				const targetKey = `workspace:${target}`;
				if (switchTargetRef.current === targetKey) return;
				switchTargetRef.current = targetKey;
				switchSeq.current += 1;
				const seq = switchSeq.current;
				setSwitchingRepo(targetKey);
				setError("");
				setNotice("");
				setContext(null);
				setCandidates([]);
				setParallel(null);
				setSessionStates(/* @__PURE__ */ new Map());
				try {
					const body = await api(API.switchRepo, {
						method: "POST",
						body: JSON.stringify({ workspaceId: target })
					});
					if (seq !== switchSeq.current) return;
					const next = { ...body.state ?? body };
					if (!next.workspace && body.workspace) next.workspace = body.workspace;
					setState(next);
					onScopeChanged?.();
					setSessionStates(sessionMapFrom(body.sessionStates));
					setSelected(null);
					const members = workspaceMembersView(body.workspace);
					setNotice(`已切到虚拟库「${body.workspace?.name ?? target}」（${members.length} 个成员库；台账在本机 ${body.workspace?.path ?? "—"}）`);
				} catch (err) {
					if (seq === switchSeq.current) setError(errorText(err));
				} finally {
					if (seq === switchSeq.current) {
						setSwitchingRepo(null);
						switchTargetRef.current = null;
					}
				}
			}
			function toggleWorkspaceRepo(path) {
				setWsPicked((current) => current.includes(path) ? current.filter((entry) => entry !== path) : [...current, path]);
			}
			/** 新建虚拟库的输入汇总：勾选的已登记代码库 + 文本框里的额外路径（去重）。 */
			function workspaceDraftRepos() {
				const extra = wsPaths.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
				return [.../* @__PURE__ */ new Set([...wsPicked, ...extra])];
			}
			/** 打开新建虚拟库弹窗。 */
			function openCreateWorkspace() {
				setWsEditId(null);
				setWsName("");
				setWsPaths("");
				setWsPicked([]);
				setWsError("");
				setError("");
				setNotice("");
				setWsOpen(true);
			}
			/** 打开编辑虚拟库弹窗：预填名字与现有成员。 */
			function openEditWorkspace(workspace) {
				setWsEditId(workspace?.id ?? null);
				setWsName(workspace?.name ?? "");
				setWsPicked([...workspace?.repos ?? []]);
				setWsPaths("");
				setWsError("");
				setError("");
				setNotice("");
				setWsOpen(true);
			}
			function closeWorkspaceModal() {
				setWsOpen(false);
				setWsEditId(null);
				setWsError("");
			}
			/** 新建/编辑虚拟库：名字 + 勾选/填写 ≥2 个代码库；成员库平权，任意成员都可移除/替换。 */
			async function saveWorkspaceNow() {
				const editing = Boolean(wsEditId);
				const name = wsName.trim();
				const repos = workspaceDraftRepos();
				if (!name) {
					setWsError("虚拟库需要名字");
					return;
				}
				if (repos.length < 2) {
					setWsError("虚拟库至少需要两个不同的代码库：勾选已登记的库，或在下面每行填一个路径");
					return;
				}
				setBusy(true);
				setWsError("");
				setError("");
				try {
					const body = await api(API.workspaces, {
						method: "POST",
						body: JSON.stringify(editing ? {
							action: "update",
							id: wsEditId,
							name,
							repos
						} : {
							name,
							repos
						})
					});
					closeWorkspaceModal();
					setWsName("");
					setWsPaths("");
					setWsPicked([]);
					const next = body.state ?? null;
					if (next) {
						setState(next);
						setSessionStates(sessionMapFrom(next.sessionStates));
					} else await reload();
					onScopeChanged?.();
					setSelected(null);
					const members = workspaceMembersView(body.workspace ?? next?.workspace);
					if (editing) {
						const added = body.added ?? [];
						const removed = body.removed ?? [];
						setNotice(`已更新虚拟库「${body.workspace?.name ?? name}」（${members.length} 个成员库${added.length ? `；新增 ${added.map(repoBaseName).join("、")}` : ""}${removed.length ? `；移除 ${removed.map(repoBaseName).join("、")}` : ""}）`);
					} else setNotice(`已创建并切到虚拟库「${body.workspace?.name ?? name}」（${members.length} 个成员库；台账在本机 ${body.localPath ?? body.workspace?.path ?? "—"}）`);
				} catch (err) {
					setWsError(errorText(err));
				} finally {
					setBusy(false);
				}
			}
			/**
			* 移除虚拟库：只删本机 profile 里的分组登记，不动任何成员库的代码与 .dev-hub 台账。
			* 当前激活时 Host 会清掉/回退 activeRepo，这里按返回的 state 刷新（没有 state 就重取）。
			*/
			async function removeWorkspace(workspace) {
				const name = workspace?.name ?? workspace?.id ?? "未命名";
				if (!(typeof window !== "undefined" && window.confirm(`从本机移除虚拟库「${name}」？\n\n只删本机的分组登记，不会删除或修改任何成员库的代码与 .dev-hub；成员库本身仍保留在代码库列表里。\n\n虚拟库自己的台账/规范/上下文/证据仍留在本机 ~/.dev-hub/workspaces/${workspace?.id ?? "<id>"}/（不删数据）。`))) return;
				setError("");
				setNotice("");
				try {
					const body = await api(API.workspaces, {
						method: "POST",
						body: JSON.stringify({
							action: "remove",
							id: workspace?.id
						})
					});
					onScopeChanged?.();
					if (body?.state) {
						setState(body.state);
						setSessionStates(sessionMapFrom(body.state.sessionStates));
					} else await reload();
					setSelected(null);
					setNotice(`已移除虚拟库「${name}」（成员库代码与 .dev-hub 未动；本机台账仍保留）`);
				} catch (err) {
					setError(errorText(err));
				}
			}
			async function removeRepo(repoPath) {
				const name = repoPath.split("/").filter(Boolean).pop() || repoPath;
				if (!(typeof window !== "undefined" && window.confirm(`从列表移除代码库「${name}」？\n\n只删本机列表登记，不会删除磁盘上的代码/流程台账；以后还能重新添加。`))) return;
				setError("");
				try {
					const body = await api(API.removeRepo, {
						method: "POST",
						body: JSON.stringify({ repoPath })
					});
					setSelected(null);
					setNotice(`已从列表移除 ${name}（磁盘文件未动）`);
					if (body?.state) {
						setState(body.state);
						onScopeChanged?.();
						setSessionStates(sessionMapFrom(body.state.sessionStates));
					} else await reload();
				} catch (err) {
					setError(errorText(err));
				}
			}
			function onSetupDone(next) {
				setSetupOpen(false);
				setState(next);
				onScopeChanged?.();
				const skills = next?.skills;
				if (skills?.initialized) setNotice(`已装好内置技能 ${skills.installedSkills?.length ?? 0} 个（约束 ${skills.constraints ?? 0} 条），可以直接新建流程。`);
				else if (skills?.initialized === false && skills?.error) setError(`内置技能初始化失败：${skills.error}（首次建流程时会再试）`);
				else if (skills?.alreadyHad) setNotice(`沿用这个代码库已有的规范：${skills.installedSkills?.length ?? 0} 个技能 / ${skills.constraints ?? 0} 条约束。`);
				setSessionStates(sessionMapFrom(next?.sessionStates));
				setSelected(next?.items?.[0]?.id ?? null);
				setContext(null);
				setCandidates([]);
				setParallel(null);
				loadParallel();
			}
			if (state === null) return h("div", { style: styles.wrap }, busy ? "加载 DevHub…" : "DevHub 尚未加载");
			if (state.needsSetup || !state.repo) return h("div", { style: styles.wrap }, h(SetupForm, {
				state,
				onDone: (next) => {
					setState(next);
					onScopeChanged?.();
				}
			}));
			const items = state.items ?? [];
			const detail = state.selectedItem ?? null;
			const editingRepos = (wsEditId ? (state.workspaces ?? []).find((entry) => entry.id === wsEditId) ?? null : null)?.repos ?? (wsEditId ? wsPicked : []);
			const repoChoices = (state.profile?.repoCards ?? []).filter((card) => card && card.path && (card.exists !== false || editingRepos.includes(card.path)));
			const wsDraftRepos = workspaceDraftRepos();
			const envAndCommands = h("details", { style: {
				...styles.cardFlat,
				padding: "10px 12px"
			} }, h("summary", { style: {
				cursor: "pointer",
				display: "flex",
				alignItems: "center",
				gap: T.gap.xs,
				flexWrap: "wrap"
			} }, h("span", { style: styles.sectionTitle }, "本机环境与项目命令"), h("span", { style: styles.sectionHint }, "低频；需要探测环境或修改测试命令时展开")), h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: T.gap.sm,
				marginTop: T.gap.sm
			} }, h(EnvironmentCard, {
				env: state.env,
				onDetect: detect
			}), h(ProjectCommands, {
				project: state.project,
				localCommands: state.localCommands ?? {},
				onSaved: (project, nextLocal) => setState((current) => current ? {
					...current,
					project,
					localCommands: nextLocal ?? current.localCommands
				} : current)
			})));
			return h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: T.gap.sm
			} }, error ? h("div", { style: styles.dangerCard }, error) : null, notice ? h("div", { style: styles.infoCard }, notice) : null, context ? h("div", { style: { ...styles.cardFlat } }, h("div", { style: {
				...styles.row,
				flexWrap: "wrap"
			} }, h("strong", null, "Context Pack"), h("span", { style: styles.pill }, context.context.contextHash), h("div", { style: styles.spacer }), h(Button, {
				primary: true,
				disabled: busy,
				onClick: () => launchDev(context.item?.id),
				children: "在工作站开启开发会话"
			}), h(Button, {
				style: {
					height: 28,
					padding: "0 10px",
					fontSize: T.font.sm
				},
				onClick: copy,
				children: "复制"
			}), h(Button, {
				style: {
					height: 28,
					padding: "0 10px",
					fontSize: T.font.sm
				},
				onClick: () => setContext(null),
				children: "关闭"
			})), h("pre", { style: styles.pre }, context.context.prompt)) : null, selected ? detail ? h(ItemEditor, {
				item: detail,
				ctx,
				pendingQuestions,
				pendingApprovals,
				onPendingRefresh: () => loadPending(detail?.id),
				onBack: () => setSelected(null),
				onSaved: mergeSavedItem,
				session: detail?.session?.id ? sessionStates.get(detail.id) ?? {
					sessionId: detail.session.id,
					boundAt: detail.session.boundAt ?? null,
					alive: null,
					pending: true
				} : null,
				onOpenSession: openSession,
				onUnbindSession: unbindSession,
				onEditingChange: setDetailEditing,
				onDeleted: async (id) => {
					setSelected(null);
					setNotice(`已删除流程 ${id}（代码与会话未动）`);
					await reload();
				},
				onContext: makeContext,
				onLaunch: launchDev
			}) : h("div", { style: styles.cardFlat }, h("div", { style: styles.row }, h(Button, {
				onClick: () => setSelected(null),
				children: "← 返回列表"
			}), h("span", { style: styles.sectionHint }, "正在加载流程详情…"))) : h(HomeView, {
				state,
				items,
				selectedId: selected,
				parallel,
				parallelError,
				sessionStates,
				onOpenItem: (id) => setSelected(id),
				onOpenReport: (id) => setReportPreviewId(id),
				onRefresh: reload,
				onFixTitles: fixWeakTitles,
				fixingTitles,
				onSelectRepo: selectRepo,
				switchingRepo,
				onAddRepo: () => {
					setSetupMode("add");
					setSetupOpen(true);
				},
				onRemoveRepo: removeRepo,
				onSelectWorkspace: selectWorkspace,
				onRemoveWorkspace: removeWorkspace,
				onNewWorkspace: openCreateWorkspace,
				onEditWorkspace: openEditWorkspace,
				onScan: scan,
				onNewFlow: () => onOpenChat?.(null, null, { fresh: true })
			}), candidates.length ? h("div", { style: styles.cardFlat }, h("div", { style: styles.row }, h("strong", null, "从文档扫描到的候选"), h("div", { style: styles.spacer }), h(Button, {
				onClick: () => setCandidates([]),
				children: "收起"
			})), candidates.map((candidate) => h("div", {
				key: candidate.id,
				style: {
					...styles.item,
					display: "flex",
					justifyContent: "space-between",
					gap: 8
				}
			}, h("div", null, h("div", null, candidate.title), h("div", { style: {
				...styles.mono,
				color: T.text4
			} }, `${candidate.source.path}:${candidate.source.line}`)), h(Button, {
				onClick: () => importCandidate(candidate),
				children: "导入"
			})))) : null, envAndCommands, wsOpen ? h(Modal, {
				title: wsEditId ? "编辑虚拟库（成员库）" : "新建虚拟库（多代码库组合）",
				onClose: closeWorkspaceModal
			}, h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 8
			} }, h("div", { style: styles.sectionHint }, wsEditId ? "调整成员库或改名。成员库平权：任意成员（包括第一个）都可以移除或替换；新增成员从当前 HEAD 开始计算变更。" : "把前后端等多个代码库当成一个开发目标：扫描、计划、变更会一起看；台账/规范/上下文/证据都写在本机独立目录，不写任何成员库。"), h("label", { style: styles.label }, "虚拟库名字"), h("input", {
				style: styles.input,
				placeholder: "例如「用户中心 前后端」",
				value: wsName,
				onChange: (event) => setWsName(event.target.value)
			}), h("label", { style: styles.label }, wsEditId ? "成员库（勾选调整；成员库平权）" : "已登记的代码库（勾选加入，仅列出路径存在的）"), repoChoices.length ? h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 2,
				maxHeight: 200,
				overflow: "auto",
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rBase,
				padding: "6px 10px"
			} }, repoChoices.map((card) => {
				const git = card.branch ? `${card.branch}${card.head ? `@${String(card.head).slice(0, 7)}` : ""}` : "";
				return h("label", {
					key: card.path,
					title: card.path,
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "4px 0",
						fontSize: T.font.sm,
						cursor: "pointer",
						minWidth: 0
					}
				}, h("input", {
					type: "checkbox",
					checked: wsPicked.includes(card.path),
					onChange: () => toggleWorkspaceRepo(card.path)
				}), h("span", { style: {
					fontWeight: 500,
					color: card.exists === false ? T.danger : T.text2,
					flex: "0 0 auto"
				} }, card.name || repoBaseName(card.path)), card.exists === false ? h(Tag, { tone: "danger" }, "路径不存在") : null, h("span", { style: {
					...styles.mono,
					color: T.text4,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
					flex: "1 1 auto",
					minWidth: 0
				} }, git ? `${git} · ${card.path}` : card.path));
			})) : h("div", { style: styles.sectionHint }, "还没有已登记的代码库；直接在下面填路径（每行一个，都是平权成员库）。"), h("label", { style: styles.label }, wsEditId ? "新增成员库路径（每行一个，可留空）" : "其它代码库路径（每行一个，可只填这里）"), h("textarea", {
				style: {
					...styles.textarea,
					minHeight: 90
				},
				placeholder: "代码库路径，每行一个，例如：\n/Users/you/backend\n/Users/you/frontend",
				value: wsPaths,
				onChange: (event) => setWsPaths(event.target.value)
			}), h("div", { style: styles.row }, h(Tag, { tone: wsDraftRepos.length >= 2 ? "ok" : "warn" }, `已选 ${wsDraftRepos.length} 个代码库`), h("span", { style: styles.sectionHint }, wsEditId ? "取消勾选 = 移除成员（任意成员都可移除）" : "至少 2 个；成员库平权")), wsError ? h("div", { style: styles.dangerCard }, wsError) : null, h("div", { style: styles.row }, h(SubmitButton, {
				disabled: busy,
				onClick: saveWorkspaceNow,
				children: busy ? wsEditId ? "保存中…" : "创建中…" : wsEditId ? "保存修改" : "创建并切换"
			}), h(Button, {
				onClick: closeWorkspaceModal,
				children: "取消"
			})))) : null, setupOpen ? h(Modal, {
				title: setupMode === "add" ? "新增代码库" : "初始化 DevHub",
				onClose: () => setSetupOpen(false)
			}, h(SetupForm, {
				state,
				mode: setupMode,
				onDone: onSetupDone,
				onPickDirectory: async () => {
					const ui = ctx?.get?.("uiWorkspace");
					if (!ui?.pickDirectory) throw new Error("当前 DSH 不支持目录选择，请手动输入路径");
					return ui.pickDirectory();
				}
			})) : null, reportPreviewId ? h(Modal, {
				title: "开发报告预览",
				width: "min(1120px, 96vw)",
				onClose: () => setReportPreviewId(null)
			}, h(ReportView, { itemId: reportPreviewId })) : null);
		}
		/**
		* 左上角面板图标（sidebar.panellist）。owner 提供 size/active，
		* 文案由 sidebar 从列表元数据取，图标只用 currentColor 继承主题。
		*/
		function DevHubIcon({ size = 18, active = false }) {
			const edge = Number(size) || 18;
			const [count, setCount] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				let stop = false;
				const tick = async () => {
					if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
					try {
						const body = await api(API.state);
						if (!stop) setCount(Number(body?.attentionCount) || 0);
					} catch {}
				};
				tick();
				const timer = setInterval(tick, 15e3);
				return () => {
					stop = true;
					clearInterval(timer);
				};
			}, []);
			return h("span", { style: {
				position: "relative",
				display: "inline-flex",
				width: edge,
				height: edge
			} }, h("svg", {
				width: edge,
				height: edge,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: active ? 2.1 : 1.7,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				style: { display: "block" }
			}, h("rect", {
				x: 3,
				y: 4,
				width: 18,
				height: 12,
				rx: 2
			}), h("path", { d: "M12 16v4" }), h("path", { d: "M8.5 20h7" }), h("path", { d: "M7 11.5l2.6-2.6L12 11.4l2.2-3 2.8 3.1" })), count > 0 ? h("span", {
				style: {
					position: "absolute",
					top: -5,
					right: -6,
					minWidth: 13,
					height: 13,
					padding: "0 3px",
					borderRadius: 999,
					background: T.danger,
					color: "#fff",
					fontSize: 9,
					lineHeight: "13px",
					textAlign: "center",
					fontWeight: 600,
					boxSizing: "border-box",
					boxShadow: "0 0 0 2px var(--dsw-alias-bg-layer-1, #fff)"
				},
				title: `${count} 个流程需要你处理`
			}, count > 99 ? "99+" : String(count)) : null);
		}
		/**
		* main 面板里的开发工作站大页面：整块高度、内部滚动。
		* 默认是「对话」页：说一句要做什么 → 工作站扫仓库 → 二次确认 → 建流程并开启开发会话；
		* 「流程」页仍是原来的台账/详情/环境/测试提交那一套（Panel）。
		*/
		/**
		* 流程是否正在开发：优先用 Host 在 item 上补的 running（/state 与 /items 同源），
		* 旧响应没有该字段时回退 state.sessionStates（可能是数组，也可能是 Map）里的实时状态。
		* 右上角计数与抽屉共用这一份口径，避免两处判断不一致。
		*/
		function isItemRunning(state, item) {
			if (typeof item?.running === "boolean") return item.running;
			const states = state?.sessionStates;
			if (Array.isArray(states)) {
				const live = states.find((row) => row?.itemId === item?.id);
				return Boolean(live?.running);
			}
			if (states && typeof states.get === "function") return Boolean(states.get(item?.id)?.running);
			return false;
		}
		/** 右上角「进行中」抽屉：需要你处理 / 进行中 / 已完成，点条目直接进详情。 */
		/** 当前激活目标（代码库 / 虚拟库）在抽屉里的统一描述；overview 还没回来时兜底。 */
		function drawerTargetOf(state) {
			const workspace = state?.workspace ?? null;
			const repo = state?.repo ?? null;
			if (workspace?.id) return {
				key: `workspace:${workspace.id}`,
				kind: "workspace",
				name: workspace.name ?? "虚拟库",
				path: repo?.path ?? null,
				workspaceId: workspace.id,
				member: state?.profile?.member ?? null,
				current: true
			};
			if (repo?.path) return {
				key: `repo:${repo.path}`,
				kind: "repo",
				name: repo.name ?? repo.path,
				path: repo.path,
				workspaceId: null,
				member: state?.profile?.member ?? null,
				current: true
			};
			return null;
		}
		function FlowDrawer({ overview, fallbackState, onPick, onClose, switchingTarget = null, error = "" }) {
			const hasOverview = Array.isArray(overview?.items);
			const fallbackTarget = drawerTargetOf(fallbackState);
			const items = hasOverview ? overview.items : (fallbackState?.items ?? []).map((item) => ({
				...item,
				running: Boolean(item.running),
				target: fallbackTarget
			}));
			const targetCount = overview?.targetCount ?? (fallbackTarget ? 1 : 0);
			const inProgress = overview?.inProgressCount ?? items.filter((item) => item.status !== "done").length;
			const groups = [
				{
					key: "attention",
					title: "需要你处理",
					list: items.filter((item) => item.attention)
				},
				{
					key: "running",
					title: "进行中",
					list: items.filter((item) => !item.attention && item.status !== "done")
				},
				{
					key: "done",
					title: "已完成",
					list: items.filter((item) => item.status === "done")
				}
			].filter((group) => group.list.length);
			return h("div", { style: {
				position: "absolute",
				top: 34,
				right: 0,
				zIndex: 10002,
				width: 400,
				maxHeight: "60vh",
				overflow: "auto",
				padding: 10,
				border: `1px solid ${T.borderSoft}`,
				borderRadius: T.rLg,
				background: T.surface,
				boxShadow: T.shadowModal
			} }, h("div", { style: {
				...styles.row,
				marginBottom: 4,
				alignItems: "flex-start"
			} }, h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 1,
				minWidth: 0
			} }, h("span", { style: styles.sectionTitle }, "全部开发目标"), h("span", { style: styles.sectionHint }, `${targetCount} 个目标 · ${inProgress} 个进行中${switchingTarget ? " · 正在切换…" : ""}`)), h("div", { style: styles.spacer }), h("span", {
				style: {
					...styles.smallMuted,
					cursor: "pointer"
				},
				onClick: onClose
			}, "关闭")), error ? h("div", { style: {
				...styles.smallDanger,
				marginBottom: 4
			} }, error) : null, groups.length ? groups.map((group) => h("div", {
				key: group.key,
				style: { marginTop: 6 }
			}, h("div", { style: {
				...styles.sectionHint,
				padding: "2px 4px"
			} }, `${group.title}（${group.list.length}）`), group.list.map((item) => {
				const running = item.running === true;
				const target = item.target ?? null;
				const switching = Boolean(switchingTarget && target?.key === switchingTarget);
				return h("div", {
					key: `${target?.key ?? ""}:${item.id}`,
					role: "button",
					title: target ? `切到「${target.name}」并打开这个流程` : "打开流程详情",
					onClick: () => {
						if (!switchingTarget) onPick?.(item);
					},
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 2,
						padding: "8px 8px",
						borderRadius: T.rBase,
						cursor: switchingTarget ? "progress" : "pointer",
						opacity: switchingTarget && !switching ? .55 : 1,
						borderTop: `1px solid ${T.borderSoft}`
					}
				}, h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					minWidth: 0
				} }, h("span", { style: {
					fontSize: T.font.sm,
					fontWeight: 500,
					color: T.text,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
					flex: "1 1 auto"
				} }, item.title), switching ? h("span", { style: {
					display: "inline-flex",
					alignItems: "center",
					gap: 4,
					fontSize: T.font.xs,
					color: T.brand,
					flex: "0 0 auto"
				} }, h(Spinner, {
					size: 9,
					tone: "accent"
				}), "切换中…") : running ? h("span", { style: {
					display: "inline-flex",
					alignItems: "center",
					gap: 4,
					fontSize: T.font.xs,
					fontWeight: 600,
					color: T.brand,
					flex: "0 0 auto"
				} }, h(Spinner, {
					size: 9,
					tone: "accent"
				}), "开发中…") : null, item.attention ? h(Tag, { tone: item.attention.tone ?? "warn" }, item.attention.label) : null), h("div", { style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					fontSize: T.font.xs,
					color: T.text4,
					minWidth: 0
				} }, h("span", null, STAGE_LABELS[item.stage] ?? item.stage ?? "—"), h(StatusPill, { status: item.status }), h("span", null, `${item.doneCount ?? 0}/${item.taskCount ?? 0} 任务`), h("div", { style: styles.spacer }), target ? h(Tag, {
					tone: target.current ? "accent" : "neutral",
					title: target.path ?? "",
					style: {
						flex: "0 0 auto",
						maxWidth: 170,
						overflow: "hidden",
						textOverflow: "ellipsis"
					}
				}, `${target.name}${target.current ? " · 当前" : ""}`) : null));
			}))) : h("div", { style: styles.sectionHint }, "还没有开发流程"));
		}
		/** 小房子图标：头部「回开发站首页」按钮用。 */
		function HomeGlyph({ size = 15 }) {
			return h("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.9,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true
			}, h("path", { d: "M3.8 11.2 12 4.4l8.2 6.8" }), h("path", { d: "M6.1 9.8v9.8h11.8V9.8" }), h("path", { d: "M9.9 19.6v-4.8h4.2v4.8" }));
		}
		/** 「进行中」抽屉点一条流程时，/switch-repo 请求体的唯一构造点（方便单测）。 */
		function switchBodyForTarget(target, member = null) {
			if (target?.kind === "workspace") return { workspaceId: target.workspaceId };
			return {
				repoPath: target?.path ?? null,
				name: target?.member ?? member ?? null,
				detect: false
			};
		}
		function DevHubPage({ ctx }) {
			const [tab, setTabState] = (0, react.useState)(() => loadLastTab() ?? "flows");
			const setTab = (next) => {
				setTabState(next);
				saveLastTab(next);
			};
			const [chatScope, setChatScope] = (0, react.useState)(null);
			const [chatNonce, setChatNonce] = (0, react.useState)(0);
			const [flowsNonce, setFlowsNonce] = (0, react.useState)(0);
			const [scopeNonce, setScopeNonce] = (0, react.useState)(0);
			const [flowHint, setFlowHint] = (0, react.useState)(null);
			const [flowList, setFlowList] = (0, react.useState)(null);
			const flowStateSeqRef = (0, react.useRef)(0);
			const [overview, setOverview] = (0, react.useState)(null);
			const [overviewError, setOverviewError] = (0, react.useState)("");
			const [switchingTarget, setSwitchingTarget] = (0, react.useState)(null);
			const [drawerOpen, setDrawerOpen] = (0, react.useState)(false);
			const [homeHover, setHomeHover] = (0, react.useState)(false);
			const [openFlow, setOpenFlow] = (0, react.useState)(null);
			const [homeNonce, setHomeNonce] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				let stop = false;
				const load = async () => {
					if (stop) return;
					if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
					const seq = flowStateSeqRef.current + 1;
					flowStateSeqRef.current = seq;
					try {
						const body = await api(API.state);
						if (!stop && seq === flowStateSeqRef.current) setFlowList(body);
					} catch {}
				};
				load();
				const timer = setInterval(load, 1e4);
				const onVisible = () => {
					if (document.visibilityState === "visible") load();
				};
				if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
				return () => {
					stop = true;
					clearInterval(timer);
					if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
				};
			}, [
				flowsNonce,
				scopeNonce,
				tab
			]);
			(0, react.useEffect)(() => {
				let stop = false;
				const load = async () => {
					if (stop) return;
					if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
					try {
						const body = await api(API.overview);
						if (!stop) {
							setOverview(body);
							setOverviewError("");
						}
					} catch (err) {
						const message = errorText(err);
						if (!stop) setOverviewError(/HTTP 404|not found/i.test(message) ? "" : `跨目标流程读取失败：${message}`);
					}
				};
				load();
				const timer = setInterval(load, 1e4);
				const onVisible = () => {
					if (document.visibilityState === "visible") load();
				};
				if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
				return () => {
					stop = true;
					clearInterval(timer);
					if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
				};
			}, [
				flowsNonce,
				scopeNonce,
				tab
			]);
			/**
			* 抽屉里点一条流程：如果它属于别的代码库/虚拟库，先切目标再打开详情。
			* 切目标走 /switch-repo（与面板里点代码库卡片同一套 Host 逻辑），
			* 成功后重挂 Panel（flowsNonce）让 /state 用新目标重载，并把 openFlow 带过去。
			*/
			async function openAcrossTarget(item) {
				if (!item?.id || switchingTarget) return;
				const target = item.target ?? null;
				setOverviewError("");
				if (!target || target.current) {
					setDrawerOpen(false);
					setTab("flows");
					setOpenFlow({
						id: item.id,
						nonce: Date.now()
					});
					return;
				}
				setSwitchingTarget(target.key);
				try {
					const body = await api(API.switchRepo, {
						method: "POST",
						body: JSON.stringify(switchBodyForTarget(target, flowList?.profile?.member))
					});
					setFlowList(body);
					setOverview(null);
					setScopeNonce((value) => value + 1);
					setFlowsNonce((value) => value + 1);
					setDrawerOpen(false);
					setTab("flows");
					setOpenFlow({
						id: item.id,
						nonce: Date.now()
					});
				} catch (err) {
					setOverviewError(`切到「${target.name}」失败：${errorText(err)}`);
				} finally {
					setSwitchingTarget(null);
				}
			}
			/**
			* 进聊天页。
			* fresh=true 用于「新建流程」入口：先落一段新对话再进聊天，
			* 这样第二个新流程不会接着上一段流程的对话继续写（否则两段消息会串在一起）。
			*/
			function openChat(scope = null, hint = null, { fresh = false } = {}) {
				const repoPath = flowList?.repo?.path;
				if (fresh && repoPath) {
					startNewChat(repoPath, "新对话", "new");
					setChatNonce((value) => value + 1);
				}
				setChatScope(scope);
				setFlowHint(hint);
				setTab("chat");
			}
			const flowItems = flowList?.items ?? [];
			const inProgressCount = overview?.inProgressCount ?? flowItems.filter((item) => item.status !== "done").length;
			const attentionCount = overview?.attentionCount ?? flowList?.attentionCount ?? 0;
			const runningCount = overview?.runningCount ?? flowItems.filter((item) => isItemRunning(flowList, item)).length;
			const targetCount = overview?.targetCount ?? (flowList?.repo ? 1 : 0);
			return h("div", { style: styles.page }, h("div", { style: {
				...styles.pageHeader,
				display: "grid",
				gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)"
			} }, h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 10,
				minWidth: 0,
				overflow: "hidden"
			} }, h(IconSeat, { size: 30 }, "◈"), h("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: 2,
				minWidth: 0
			} }, h("div", { style: styles.pageTitle }, "开发工作站"), h("div", { style: {
				...styles.pageSubtitle,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			} }, tab === "flows" ? "开发流程台账 · 会话状态 · 并行开发 · 测试与提交" : tab === "skills" ? "通用技能包 · 安装/卸载 · 自定义约束 · 重建默认规范" : chatScope ? `专注流程：${flowHint?.title ?? chatScope} · 一句话追问、看扫仓库与计划` : "新建开发流程 · 说一句要做什么 · 工作站扫仓库、追问、自评计划"))), h("div", { style: {
				display: "flex",
				justifyContent: "center",
				minWidth: 0,
				maxWidth: 560,
				padding: "0 8px"
			} }, flowList ? h(RepoScopeBadge, {
				repo: flowList.repo ?? null,
				workspace: flowList.workspace ?? null,
				onClick: () => {
					setTab("flows");
					setOpenFlow(null);
					setHomeNonce((value) => value + 1);
				}
			}) : null), h("div", { style: {
				display: "flex",
				alignItems: "center",
				justifyContent: "flex-end",
				gap: T.gap.xs,
				minWidth: 0,
				flexWrap: "wrap"
			} }, tab === "chat" ? h(Button, {
				style: {
					height: 26,
					padding: "0 10px"
				},
				onClick: () => setTab("flows"),
				children: "← 回流程"
			}) : null, h("div", { style: { position: "relative" } }, h(Button, {
				style: {
					height: 28,
					padding: "0 12px",
					borderColor: attentionCount > 0 ? T.brandBorder : void 0
				},
				title: `${targetCount} 个开发目标 · ${inProgressCount} 个进行中${attentionCount > 0 ? ` · ${attentionCount} 个需要你处理` : ""}`,
				onClick: () => setDrawerOpen((value) => !value),
				children: [runningCount > 0 ? h(Spinner, {
					key: "spin",
					size: 10,
					tone: "accent",
					style: { marginRight: 6 }
				}) : null, `进行中 ${inProgressCount}${attentionCount > 0 ? ` · ${attentionCount} 待处理` : ""}${runningCount > 0 ? ` · ${runningCount} 开发中` : ""} ▾`]
			}), drawerOpen ? h(FlowDrawer, {
				overview,
				fallbackState: flowList,
				onPick: openAcrossTarget,
				switchingTarget,
				error: overviewError,
				onClose: () => setDrawerOpen(false)
			}) : null), h("button", {
				type: "button",
				title: "回到开发站首页（流程列表）",
				"aria-label": "回到开发站首页",
				onMouseEnter: () => setHomeHover(true),
				onMouseLeave: () => setHomeHover(false),
				onFocus: () => setHomeHover(true),
				onBlur: () => setHomeHover(false),
				onClick: () => {
					setTab("flows");
					setOpenFlow(null);
					setHomeNonce((value) => value + 1);
				},
				style: {
					width: 28,
					height: 28,
					padding: 0,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					border: `1px solid ${homeHover ? T.brand : T.brandBorder}`,
					borderRadius: T.rBase,
					background: homeHover ? T.brand : T.brandSoft,
					color: homeHover ? "#fff" : T.brand,
					cursor: "pointer",
					fontFamily: "inherit",
					transition: T.transition,
					flex: "0 0 auto"
				}
			}, h(HomeGlyph, { size: 15 })), h(Segmented, {
				value: tab,
				onChange: (next) => {
					if (next === tab) return;
					if (next === "chat") {
						openChat(null, null, { fresh: true });
						return;
					}
					setTab(next);
				},
				options: [
					{
						value: "flows",
						label: "流程"
					},
					{
						value: "chat",
						label: "新建流程"
					},
					{
						value: "skills",
						label: "技能"
					}
				]
			}))), tab === "chat" ? h(DevHubChat, {
				ctx,
				key: `${flowList?.repo?.path ?? "none"}:${chatScope ?? "new"}:${chatNonce}`,
				scopeId: chatScope,
				scopeTitle: flowHint?.title ?? "",
				onFlowsChanged: () => setFlowsNonce((current) => current + 1),
				onRequireSetup: () => setTab("flows"),
				onFlowStarted: (id) => {
					setTab("flows");
					setOpenFlow({
						id,
						nonce: Date.now()
					});
				}
			}) : tab === "skills" ? h("div", { style: styles.pageBody }, h(SkillsPanel)) : h("div", { style: styles.pageBody }, h(Panel, {
				ctx,
				key: flowsNonce,
				onOpenChat: openChat,
				openFlowId: openFlow?.id ?? null,
				openFlowNonce: openFlow?.nonce ?? 0,
				homeNonce,
				onScopeChanged: () => setScopeNonce((value) => value + 1)
			})));
		}
		const inject = ["slots", "locale"];
		function apply(ctx) {
			if (typeof ctx.locale?.register === "function") ctx.effect(() => {
				try {
					return ctx.locale.register(LOCALE_NAMESPACE, {
						zh,
						en
					});
				} catch (error) {
					try {
						console.warn("[dev-hub] locale registration failed:", error);
					} catch {}
					return () => {};
				}
			}, "dev-hub: locale dictionaries");
			let translate = (key) => key;
			try {
				if (typeof ctx.locale?.bind === "function") translate = ctx.locale.bind(LOCALE_NAMESPACE);
			} catch {}
			ctx.slots.inject("sidebar.panellist", () => {
				const dispose = ctx.slots.register({
					name: "sidebar.panellist",
					id: "dev-hub",
					order: 20,
					label: () => translate("开发工作站")
				}, DevHubIcon);
				return () => dispose();
			});
			ctx.slots.inject("conversation.session.header.actions", () => {
				const dispose = ctx.slots.register({
					name: "conversation.session.header.actions",
					id: "dev-hub-session",
					order: 15,
					label: () => translate("开发流程")
				}, (props) => h(DevHubBoundary, null, h(LocaleProvider, { ctx }, h(DevHubSessionQuick, {
					sessionId: props?.sessionId,
					ctx
				}))));
				return () => dispose();
			});
			ctx.slots.inject("main", () => {
				const dispose = ctx.slots.register({
					name: "main",
					key: "dev-hub"
				}, (props) => h(DevHubBoundary, null, h(LocaleProvider, { ctx }, h(DevHubPage, {
					...props,
					ctx
				}))));
				return () => dispose();
			});
		}
		//#endregion
		exports.FlowDrawer = FlowDrawer;
		exports.ItemEditor = ItemEditor;
		exports.ProjectCommands = ProjectCommands;
		exports.apply = apply;
		exports.inject = inject;
		exports.launchDevSession = launchDevSession;
		exports.launchPrompt = launchPrompt;
		exports.switchBodyForTarget = switchBodyForTarget;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map