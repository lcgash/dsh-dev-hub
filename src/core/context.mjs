import { createHash } from 'node:crypto'
import { groupChanges } from './git.mjs'
import { formatWorkflow } from './workflow.mjs'
import { describeReview } from './review.mjs'
import { attachmentLabel, attachmentPrompt, isImageAttachment, normalizeAttachments } from '../shared/attachment.mjs'
import { techDocSummary } from './techdoc.mjs'
import { STAGE_BOUNDARY_LINES } from '../shared/boundaries.mjs'

const STATUS_LABELS = {
  planned: '计划中',
  designing: '设计中',
  developing: '开发中',
  reviewing: '评审中',
  verifying: '验证中',
  done: '已完成',
  blocked: '阻塞',
}

function text(value, fallback = '（未填写）') {
  const v = String(value ?? '').trim()
  return v || fallback
}

function list(values, empty = '（无）') {
  return values?.length ? values.map((value) => `- ${value}`).join('\n') : `- ${empty}`
}

function taskLines(tasks) {
  if (!tasks?.length) return '（还没有拆任务）'
  return tasks.map((task) => `- [${task.done ? 'x' : ' '}] ${task.text}`).join('\n')
}

function envLines(profile, env, repoProfile = null) {
  if (!env) return '（尚未探测本机环境）'
  const lines = []
  lines.push(`- 开发者：${text(profile?.member, '未设置')}`)
  lines.push(`- 系统：${env.os ?? 'unknown'} ${env.arch ?? ''}`.trim())
  lines.push(`- Shell：${env.shell?.name ?? 'unknown'}（${env.shell?.path ?? '未探测'}）`)
  const tools = env.tools && typeof env.tools === 'object' ? env.tools : {}
  const version = (name) => tools[name]?.version ? ` ${tools[name].version}` : ''
  const isFrontend = Boolean(repoProfile?.frontend)
  const isNode = repoProfile?.language === 'node'
  if (isFrontend) {
    const stack = [...(repoProfile?.frameworks ?? []), ...(repoProfile?.frontendTooling ?? [])].join(' / ') || '前端工程'
    const frontendPm = (repoProfile?.frontendProjects ?? []).map((project) => project.packageManager).filter(Boolean).join(' / ')
      || repoProfile?.packageManager || 'npm'
    lines.push(`- 前端工程：${stack} · 包管理器 ${frontendPm}`)
  }
  if (repoProfile?.frontendProjects?.length) {
    lines.push(`- 前端子项目：${repoProfile.frontendProjects.map((project) => `${project.path}（${project.packageManager || 'npm'}${project.frameworks?.length ? ` · ${project.frameworks.join('/')}` : ''}）`).join('；')}`)
  }
  if (isFrontend || isNode || tools.node?.available) {
    lines.push(`- Node${version('node')}${tools.npm?.available ? ` · npm${version('npm')}` : ''}${tools.pnpm?.available ? ` · pnpm${version('pnpm')}` : ''}`)
  }
  if (env.currentJdk) {
    lines.push(`- 当前 JDK：${env.currentJdk.version ?? 'unknown'}（${env.currentJdk.path}）`)
  } else if (repoProfile?.language === 'java') {
    lines.push('- 当前 JDK：未找到')
  }
  if (env.jdks?.length > 1) {
    lines.push(`- 已发现 JDK：${env.jdks.map((jdk) => `${jdk.major ?? '?'} (${jdk.path})`).join('；')}`)
  }
  const available = Object.keys(tools).filter((name) => tools[name]?.available).sort()
  const missing = Object.keys(tools).filter((name) => !tools[name]?.available).sort()
  lines.push(`- 可用工具：${available.length ? available.join(', ') : '未探测到'}`)
  if (missing.length) lines.push(`- 不可用工具：${missing.join(', ')}`)
  if (env.git?.available === false) lines.push('- Git：不可用（变更点只能依赖人工记录）')
  return lines.join('\n')
}

function changeLines(changes, grouped) {
  if (!changes) return '（未计算）'
  const lines = []
  if (changes.evidenceComplete === false && changes.reason) lines.push(`- 证据不完整：${changes.reason}`)
  lines.push(`- 基线 commit：${changes.baseCommit ?? '（无）'}`)
  lines.push(`- 当前 commit：${changes.headCommit ?? '（无）'}`)
  lines.push(`- 基线以来变更：${changes.changes?.length ?? 0} 个文件`)
  for (const [group, entries] of Object.entries(grouped ?? {})) {
    lines.push(`  - ${group}：${entries.map((entry) => entry.path).join(', ')}`)
  }
  if (changes.commits?.length) {
    lines.push('- 基线以来 commit：')
    for (const commit of changes.commits) lines.push(`  - ${commit.hash} ${commit.subject}`)
  }
  return lines.join('\n')
}

const TEST_COMMAND_KEYS = new Set(['test', 'localTest', 'environmentTest', 'gate'])

function commandLines(project) {
  const commands = project?.context?.commands && typeof project.context.commands === 'object'
    ? project.context.commands
    : {}
  const entries = Object.entries(commands)
    .filter(([name]) => !TEST_COMMAND_KEYS.has(name))
    .sort(([a], [b]) => a.localeCompare(b))
  return entries.length ? entries.map(([name, command]) => `- ${name}：${command}`).join('\n') : '- （未配置）'
}

/** 测试/门禁命令只作为“工作站执行”的门禁信息，避免开发会话拿去自己跑。 */
function gateLines(project) {
  const commands = project?.context?.commands && typeof project.context.commands === 'object'
    ? project.context.commands
    : {}
  const labels = { localTest: '本机自测', test: '测试', environmentTest: '环境测试', gate: '仓库门禁' }
  const rows = Object.entries(commands)
    .filter(([name, command]) => TEST_COMMAND_KEYS.has(name) && String(command ?? '').trim())
    .map(([name, command]) => `- ${labels[name] ?? name}：${command}（工作站「测试验证」阶段执行，开发会话不要运行）`)
  return rows.length ? rows.join('\n') : '- （未配置测试/门禁命令）'
}

/** 模板验收：逐条给命令或人工断言（提交前必须全部有结果）。 */
function checkLines(item) {
  const checks = item.checks ?? []
  if (!checks.length) return '（未配置：按仓库命令自行验收）'
  return checks.map((check) => {
    const how = check.command ? `命令：${check.command}` : check.assertion ? `断言：${check.assertion}` : '人工确认'
    return `- ${check.text}（${how}；当前 ${check.status ?? 'not_run'}）`
  }).join('\n')
}

/** 参考实现：告诉 Agent "照哪个类写"。 */
function referenceLines(item) {
  const references = item.references ?? []
  if (!references.length) return '（未指定；按仓库既有同类实现对齐）'
  return references.map((reference) => `- ${reference.path}${reference.why ? `（${reference.why}）` : ''}`).join('\n')
}

/** 二次确认过的探测结果：目标文件 + 命中行。 */
function reconLines(item) {
  const recon = item.recon
  if (!recon?.files?.length) return '（尚未做代码探测；可让工作站先扫一遍仓库再确认）'
  const lines = []
  if (recon.tokens?.length) lines.push(`- 检索词：${recon.tokens.join('、')}`)
  for (const file of recon.files) {
    lines.push(`- ${file.path}（命中 ${file.score}）`)
    for (const match of file.matches.slice(0, 3)) lines.push(`  - L${match.line}: ${match.text}`)
  }
  return lines.join('\n')
}

function nextActions(item) {
  const review = describeReview(item)
  // 评审不通过时，纠偏优先于「继续做任务」：否则开发会话会沿着被否掉的方向继续往前做
  if (review.status === 'failed') {
    const corrections = review.corrections.flatMap((entry) => entry.findings).slice(0, 3)
    return corrections.length ? corrections : ['按审核员意见纠偏后点「继续推进」重新评审']
  }
  if (review.status === 'error') return ['点「继续推进」重试异常审核员，或补齐证据后重新评审']
  if (review.status === 'pending') return ['等待审核员返回结论；不要跳过评审直接提交']
  const pending = (item.tasks ?? []).filter((task) => !task.done).slice(0, 3)
  const actions = pending.map((task) => task.text)
  if (!actions.length) {
    if (item.status === 'verifying') {
      // 测试由工作站执行：开发会话等结果/修失败，不再自己跑测试或改测试结论
      actions.push('测试由工作站「测试验证」阶段执行：先等结果；失败时按失败输出修代码，不要自行重跑或改写测试结论')
    } else if (item.status !== 'done') {
      actions.push('确认验收标准并拆分下一步任务；完成代码修改后回写变更点，测试/门禁由工作站后续阶段执行')
    }
  }
  return actions.length ? actions : ['确认是否标记完成；若已完成，补充最终变更点和交接说明']
}

/**
 * 独立评审结论：开发会话要知道「评审过了没有、不过要改什么」，
 * 审核员会话也能从同一份台账看到上一轮结论（避免重复提同一条意见）。
 */
function reviewLines(item) {
  const review = describeReview(item)
  if (review.status === 'idle') return '（未评审：开发阶段完成后点「继续推进」即开始独立评审，自动派 1~3 位审核员复核改动与证据）'
  const lines = [
    `- 第 ${review.round} 轮：${review.total} 位审核员 · ${review.passed} 通过 / ${review.failed} 不通过 / ${review.errored} 异常 / ${review.pending} 待返回`,
    `- 结论：${review.verdict === 'pass' ? '通过（允许进入测试验证）' : review.verdict === 'fail' ? '未通过（退回开发纠偏）' : '待处理（异常或未返回，不能视为通过）'}`,
  ]
  for (const reviewer of review.reviewers) {
    const state = { passed: '通过', failed: '不通过', error: '异常/未返回', pending: '待返回' }[reviewer.status] ?? reviewer.status
    lines.push(`- ${reviewer.label}（${reviewer.role}）：${state}${reviewer.summary ? ` —— ${reviewer.summary}` : ''}${reviewer.error ? `（${reviewer.error}）` : ''}`)
    for (const finding of reviewer.findings) {
      lines.push(`  - [${finding.severity}] ${finding.summary}${finding.file ? `（${finding.file}）` : ''}`)
    }
  }
  for (const correction of review.corrections) {
    lines.push(`- 纠偏意见（${correction.reviewerLabel}）：`)
    for (const finding of correction.findings) lines.push(`  - ${finding}`)
  }
  return lines.join('\n')
}

/** Stable hash over the semantic context, excluding generation time. */
export function contextHash(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16)
}

/**
 * 多库项目（多代码库组合）：成员库、各自 baseline/HEAD 与基线以来变更。
 *
 * 没有主库：所有成员库平权，台账/规范/上下文/证据都写在本机独立目录，
 * 不落在任何一个成员库里。
 */
function workspaceLines(workspace) {
  if (!workspace) return ''
  const members = workspace.members ?? []
  const localPath = workspace.localPath || workspace.localDir || ''
  const lines = [
    `【多库项目】${workspace.name || '未命名'}（${members.length || workspace.repos?.length || 0} 个成员库，成员库平权）`,
    `- 本机台账：${localPath || '（未提供）'}（台账/规范/上下文/证据都写在这里，不写任何成员库）`,
  ]
  for (const member of members) {
    if (member.isRepo === false) {
      lines.push(`- ${member.name}（${member.path}）：不是 git 仓库；${member.reason ?? '没有提交环节'}`)
      continue
    }
    lines.push(`- ${member.name}（${member.path}）：分支 ${member.branch ?? '（未知）'}，HEAD ${member.head ?? '（未知）'}；基线以来 ${member.changes?.length ?? 0} 个文件`)
    if (member.baseCommit) lines.push(`  - 基线 commit：${member.baseCommit}`)
    if (member.workingFiles) lines.push(`  - 工作区未提交：${member.workingFiles} 个文件（diff 与提交前请先确认）`)
    if (member.evidenceComplete === false) lines.push(`  - 证据不完整：${member.reason ?? '该成员库的 baseline 不可用'}`)
    for (const change of (member.changes ?? []).slice(0, 8)) {
      lines.push(`  - ${change.path}（${change.type ?? 'changed'}）`)
    }
    if ((member.changes?.length ?? 0) > 8) lines.push(`  - …还有 ${member.changes.length - 8} 个文件`)
  }
  const totals = workspace.totals ?? {}
  lines.push(`- 合计：${totals.files ?? 0} 个文件改动，涉及 ${totals.changedMembers ?? 0}/${members.length} 个成员库`)
  lines.push('- 跨库约束：以各成员库自己的实际代码为准；接口/契约变更要同时说明双方仓库的落点，不编造未读取的成员库 diff。')
  lines.push('- 提交/测试按成员库分别执行；每个成员库的结果都写进多库项目本机台账，部分失败必须显式说明。')
  return lines.join('\n')
}

const CONTEXT_FILE_GROUPS = [
  { name: '10-CONTRACT.md', title: '硬约束与阶段边界', headings: ['阶段边界', '独立评审', '测试/门禁（工作站执行，开发会话不要运行）'] },
  { name: '20-TASK.md', title: '本次任务', headings: ['目标', '客户原始需求', '非目标', '验收标准', '技术方案', '工作流', '任务进度'] },
  { name: '30-SCOPE.md', title: '范围与证据', headings: ['关键文件', '用户提供的文件/图片', '目标文件与摘录', '验收检查', '参考实现'] },
  { name: '40-FACTS.md', title: '仓库与本机事实', headings: ['仓库事实', '多库项目', '本机环境'] },
  { name: '50-RULES.md', title: '项目规范与命令', headings: ['项目约束', '项目记忆', '可用命令', '下一步'] },
]

/** 把现有 Context Pack 按标题切成可复用的事实文件；不改动原 prompt。 */
export function splitContextSections(prompt) {
  const blocks = []
  let current = null
  for (const line of String(prompt ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const match = /^【(.+)】([^\n]*)$/.exec(line.trim())
    if (match) {
      current = { title: match[1].trim(), lines: match[2] ? [match[2]] : [] }
      blocks.push(current)
      continue
    }
    if (current) current.lines.push(line)
    else if (line.trim()) blocks.unshift({ title: '概览', lines: [line] })
  }
  return blocks.map((block) => ({
    title: block.title,
    body: block.lines.join('\n').trim(),
  })).filter((block) => block.body || block.title)
}

/**
 * 生成上下文目录文件（纯数据，不写盘）。
 * 稳定规则和本次任务分开，后续只改一个文件，不必重发整条长 prompt。
 */
export function buildContextArtifact({ context, item } = {}) {
  const prompt = String(context?.prompt ?? '')
  const sections = splitContextSections(prompt)
  const groups = CONTEXT_FILE_GROUPS.map((group) => {
    const matched = sections.filter((section) => group.headings.includes(section.title))
    const content = matched.map((section) => `## 【${section.title}】\n\n${section.body}`).join('\n\n')
    return { name: group.name, content: content.trim() }
  }).filter((file) => file.content)
  const unmatched = sections.filter((section) => !CONTEXT_FILE_GROUPS.some((group) => group.headings.includes(section.title)))
  if (unmatched.length) {
    const tail = groups.find((file) => file.name === '30-SCOPE.md') ?? { name: '30-SCOPE.md', content: '' }
    tail.content = [tail.content, ...unmatched.map((section) => `## 【${section.title}】\n\n${section.body}`)].filter(Boolean).join('\n\n')
    if (!groups.includes(tail)) groups.push(tail)
  }
  const files = groups.map((file) => ({
    name: file.name,
    content: `# ${file.name.replace(/^[0-9]+-/, '').replace('.md', '')}\n\n${file.content}\n`,
  }))
  const mustRead = ['10-CONTRACT.md', '20-TASK.md', '50-RULES.md']
  const optional = files.map((file) => file.name).filter((name) => !mustRead.includes(name))
  const index = [
    `# DevHub Context Pack · ${item?.id ?? context?.summary?.itemId ?? ''}`,
    '',
    `- 流程：${item?.title ?? context?.summary?.title ?? '未命名'}`,
    `- 当前状态：${item?.status ?? context?.summary?.status ?? '未知'}${item?.workflow?.stage ? ` · ${item.workflow.stage}` : ''}`,
    `- contextHash：${context?.contextHash ?? '—'}`,
    `- generatedAt：${context?.generatedAt ?? '—'}`,
    '',
    '## 先读',
    '',
    ...mustRead.map((name) => `- ✅ ${name}`),
    '',
    '## 按需',
    '',
    ...optional.map((name) => `- ${name}`),
    '',
    '## 目录说明',
    '',
    '- 10-CONTRACT：阶段边界、评审与测试门禁；即使没读其他文件也必须遵守。',
    '- 20-TASK：目标、验收、计划、scope；开工前必读。',
    '- 30-SCOPE：关键文件、候选命中、验收检查与参考实现。',
    '- 40-FACTS：仓库 commit/变更、本机环境。',
    '- 50-RULES：项目约束与命令；开工前必读。',
    '',
    '## 硬提醒',
    '',
    '- 这些文件是本次流程的事实来源；prompt 只是入口，不要只凭首条消息开工。',
    '- 文件内容变化时以最新 contextHash 为准。',
    '',
  ].join('\n')
  return {
    index,
    files: [...files, { name: '00-INDEX.md', content: index }],
    mustRead,
    optional,
  }
}

/**
 * Build the Context Pack. All values are supplied by the host so this
 * function stays pure and testable; no filesystem or git access here.
 * `repoProfile` 是仓库画像（language/frontend/frameworks），用于提示
 * 「前端仓库还没装 frontend-ui」——否则 Agent 不打开技能页就发现不了。
 * `workspace` 是多库项目成员事实（可选）；单库时保持旧输出。
 */
export function buildContext({ repoName, project, item, profile, env, gitInfo, changes, conventions, repoProfile, workspace = null, worktree = null, memory = [] }) {
  const grouped = groupChanges(changes?.changes ?? [])
  const constraints = []
  // Repo-shared conventions first: they are the rules this repository actually enforces.
  const skillNames = new Map((conventions?.installedSkills ?? []).map((entry) => [entry.id, entry.name]))
  for (const entry of conventions?.constraints ?? []) {
    const suffix = [
      entry.doc ? `文档：${entry.doc}` : null,
      entry.gate ? `门禁：${entry.gate}` : null,
    ].filter(Boolean).join('；')
    const origin = entry.skill === 'custom'
      ? '自定义'
      : (skillNames.get(entry.skill) ?? entry.skill ?? '通用')
    constraints.push(`[${entry.id}]（${origin}）${entry.title}：${entry.rule}${suffix ? `（${suffix}）` : ''}`)
  }
  if (!constraints.length) {
    constraints.push(
      '以仓库内的 AGENTS.md 和门禁命令为准；冲突时以门禁为准。',
      '只修改本开发项 scope 内的文件；跨模块改动先更新计划。',
      '不读取、不提交 token/密码/私钥。',
    )
  }
  // 前端仓库但没装前端原型包：必须显式说出来，否则约束不会生效而没人知道。
  const installedSkillIds = new Set((conventions?.installedSkills ?? []).map((entry) => entry.id))
  const missingFrontendSkill = Boolean(repoProfile?.frontend) && !installedSkillIds.has('frontend-ui')
  if (missingFrontendSkill) {
    const frameworks = (repoProfile?.frameworks ?? []).join(' / ') || '前端框架'
    constraints.push(
      `[frontend-ui]（前端原型设计规范未安装）检测到前端框架（${frameworks}）：本仓库的 conventions 还没安装 frontend-ui，`
      + '页面风格约束不会自动生效；开工前建议安装（devhub_skills { action: \'install\', skillId: \'frontend-ui\' }），'
      + '或在技能页点「安装 前端原型设计规范」补装。',
    )
  }
  if (project?.context?.constraints?.length) constraints.unshift(...project.context.constraints)
  const next = nextActions(item)
  const workspaceBlock = workspaceLines(workspace)
  const head = [
    `【开发项】${item.title}（${item.id}）`,
    `【当前状态】${STATUS_LABELS[item.status] ?? item.status}`,
    ...(workspace
      ? [`【项目】多库项目「${workspace.name || '未命名'}」· ${(workspace.members ?? []).length} 个成员库（成员库平权，本机存储）`]
      : []),
    ...(worktree
      ? [
          `【独立工作区】${worktree.path}（分支 ${worktree.branch}）`,
          '- 本流程的代码改动、测试与提交都在这个独立工作区完成；台账位置按开发目标区分（单库 <repo>/.dev-hub，多库项目本机独立目录）。',
          '- 不要在主工作区改本流程的文件，否则会和其他流程的改动互相污染。',
        ]
      : []),
    '',
    '【目标】',
    text(item.goal),
    '',
    // 原始需求单独留档：开发会话要能追溯客户原话，但不能拿它当目标
    ...(item.requirement?.raw && item.requirement.raw !== item.goal
      ? ['【客户原始需求】（原话，仅追溯；以【目标】为准）', item.requirement.raw, '']
      : []),
    '【非目标】',
    list(item.nonGoals),
    '',
    '【验收标准】',
    list(item.acceptance),
    '',
    ...(() => {
      const doc = techDocSummary(item)
      if (!doc.location && !doc.hasSupplement) return []
      return [
        '【技术方案】',
        `- 形式：${doc.label}`,
        ...(doc.title ? [`- 标题：${doc.title}`] : []),
        ...(doc.location ? [`- 位置：${doc.location}`] : []),
        ...(doc.provider === 'local' && doc.location ? ['- 开发前先读这份本地方案，实现与方案不一致时在变更点/报告里说明。'] : []),
        ...(doc.hasSupplement ? [`- 我的补充摘要：${doc.supplementExcerpt}`] : []),
        '',
      ]
    })(),
    '【工作流】',
    formatWorkflow(item),
    '',
    '【阶段边界】',
    ...STAGE_BOUNDARY_LINES.map((line) => `- ${line}`),
    '',
    '【独立评审】',
    reviewLines(item),
    '',
    '【任务进度】',
    taskLines(item.tasks),
    '',
    '【关键文件】',
    list(item.scope?.length ? item.scope : changes?.changes?.map((change) => change.path)),
    '',
    // 用户随需求提供的截图/文件：路径交给开发会话用 read_image / read 读取
    ...(() => {
      const attachments = normalizeAttachments(item.attachments)
      if (!attachments.length) return []
      return [
        '【用户提供的文件/图片】',
        ...attachments.map((entry) => `- ${isImageAttachment(entry) ? '图片' : '文件'}：${entry.path}（${attachmentLabel(entry)}）`),
        attachmentPrompt(attachments).split('\n').filter((line) => line && !line.startsWith('【')).join('\n'),
        '',
      ]
    })(),
    '【目标文件与摘录】',
    reconLines(item),
    '',
    '【验收检查】',
    checkLines(item),
    '',
    '【参考实现】',
    referenceLines(item),
    '',
    // 多库项目不伪造“某个代表库”的分支/commit：仓库事实按成员库给（详见【多库项目】段）
    ...(workspace
      ? [
          '【仓库事实】（多库项目：以各成员库为准）',
          `- 多库项目：${workspace.name || '未命名'}（${(workspace.members ?? []).length} 个成员库，成员库平权）`,
          ...(workspace.localPath || workspace.localDir ? [`- 本机台账：${workspace.localPath || workspace.localDir}`] : []),
          `- 证据完整性：${workspace.evidenceComplete === false ? `不完整（${workspace.reason ?? '部分成员库证据不可用'}）` : '完整'}`,
          `- 基线以来变更：${workspace.totals?.files ?? changes?.changes?.length ?? 0} 个文件（按成员库前缀聚合）`,
        ]
      : [
          '【仓库事实】',
          `- 仓库：${repoName}`,
          `- 当前分支：${gitInfo?.branch ?? '（非 Git 仓库或不可用）'}`,
          `- 当前 commit：${gitInfo?.head ?? '（未知）'}`,
          `- 工作区未提交：${gitInfo?.clean === true ? '无' : (gitInfo?.changes?.length ?? 0) + ' 个文件'}`,
          changeLines(changes, grouped),
        ]),
    ...(workspaceBlock ? ['', workspaceBlock] : []),
    '',
    '【本机环境】',
    envLines(profile, env, repoProfile),
    '',
    '【项目约束】',
    list(constraints),
    '',
    ...(Array.isArray(memory) && memory.length
      ? [
          '【项目记忆】（本机、跨流程；开工前先扫一眼，有冲突以当前验收/门禁为准）',
          ...memory.map((entry) => `- [${entry.kind ?? 'note'}] ${entry.text}${entry.tags?.length ? `（${entry.tags.join('、')}）` : ''}`),
          '',
        ]
      : []),
    '【可用命令】',
    commandLines(project),
    '',
    '【测试/门禁（工作站执行，开发会话不要运行）】',
    gateLines(project),
    '',
    '【下一步】',
    list(next),
  ].join('\n')
  const stable = {
    repoName,
    item: {
      id: item.id,
      title: item.title,
      status: item.status,
      goal: item.goal,
      attachments: normalizeAttachments(item.attachments).map((entry) => ({
        name: entry.name,
        mediaType: entry.mediaType,
        size: entry.size,
        kind: entry.kind,
      })),
      requirementRaw: item.requirement?.raw ?? null,
      requirementSource: item.requirement?.source ?? null,
      nonGoals: item.nonGoals,
      acceptance: item.acceptance,
      tasks: item.tasks,
      scope: item.scope,
      risks: item.risks,
      template: item.workflow?.plan?.template?.id ?? null,
      checks: (item.checks ?? []).map((check) => check.id),
      references: (item.references ?? []).map((reference) => reference.path),
      workflow: {
        stage: item.workflow?.stage,
        rootProblem: item.workflow?.rootProblem,
        questions: (item.workflow?.questions ?? []).map((q) => ({ q: q.question, a: q.answer })),
        techDoc: item.workflow?.techDoc,
        plan: item.workflow?.plan,
        tests: item.workflow?.tests,
      },
    },
    project: project?.context ?? {},
    env: {
      os: env?.os,
      arch: env?.arch,
      shell: env?.shell?.name,
      jdk: env?.currentJdk?.major,
      available: Object.keys(env?.tools ?? {}).filter((name) => env.tools[name]?.available).sort(),
    },
    changes: {
      base: changes?.baseCommit ?? null,
      head: changes?.headCommit ?? null,
      files: (changes?.changes ?? []).map((change) => change.path).sort(),
      commits: (changes?.commits ?? []).map((commit) => commit.hash),
    },
    conventions: (conventions?.constraints ?? []).map((entry) => entry.id),
    // 只有「该装没装」时才进哈希：避免给所有仓库的 contextHash 制造无意义变化
    ...(missingFrontendSkill
      ? { frontendSkill: { frameworks: repoProfile?.frameworks ?? [] } }
      : {}),
    recon: {
      tokens: item.recon?.tokens ?? [],
      files: (item.recon?.files ?? []).map((file) => ({ path: file.path, line: file.matches?.[0]?.line ?? null })),
    },
    // 独立工作区分支/路径进哈希：工作区换了，上下文必须换
    ...(worktree
      ? { worktree: { branch: worktree.branch ?? null, path: worktree.path ?? null } }
      : {}),
    // 多库项目成员事实进哈希：成员库 HEAD/baseline 变了，上下文就必须换哈希。
    // 不含 primary/primaryName：没有主库，成员库顺序/首库不影响语义哈希。
    ...(workspace
      ? {
          workspace: {
            id: workspace.id ?? null,
            name: workspace.name ?? null,
            members: (workspace.members ?? []).map((member) => ({
              name: member.name,
              path: member.path,
              branch: member.branch ?? null,
              head: member.head ?? null,
              base: member.baseCommit ?? null,
              files: (member.changes ?? []).map((change) => change.path).sort(),
            })),
          },
        }
      : {}),
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    contextHash: contextHash(stable),
    prompt: head,
    summary: {
      itemId: item.id,
      title: item.title,
      status: item.status,
      done: (item.tasks ?? []).filter((task) => task.done).length,
      total: (item.tasks ?? []).length,
      next,
      evidenceComplete: workspace
        ? (workspace.evidenceComplete !== false && changes?.evidenceComplete !== false)
        : changes?.evidenceComplete !== false,
      missingFrontendSkill,
      ...(workspace
        ? {
            workspace: {
              id: workspace.id ?? null,
              name: workspace.name ?? null,
              localPath: workspace.localPath ?? workspace.localDir ?? null,
              members: (workspace.members ?? []).length,
            },
          }
        : {}),
    },
  }
}
