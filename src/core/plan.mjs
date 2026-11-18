import { estimateWork } from './estimate.mjs'
import { checksOf, detectTemplate, templateForIntent } from './templates.mjs'
import { detectIntent, normalizeIntent } from './intent.mjs'
import { kindOfPath, moduleOfPath } from './modules.mjs'
import { DEV_HANDOFF_STEP } from '../shared/boundaries.mjs'

/**
 * 工作站自己出详细开发计划：用户不写计划、不填人天。
 *
 * 计划由「确认过的目标文件 + 仓库命令 + 追问答案」推导：
 * 每个命中模块一条实施步骤（含要改的文件），再补测试、跑门禁、回写变更点。
 * 输出带 estimate（estimate.mjs 自评）与 risks，全部可解释。
 */

function groupByModule(files, repoNames = []) {
  const groups = new Map()
  for (const file of files ?? []) {
    const path = String(file?.path ?? '')
    if (!path) continue
    const moduleName = moduleOfPath(path, repoNames)
    const key = `${kindOfPath(path, repoNames)}:${moduleName}`
    const entry = groups.get(key) ?? { key, module: moduleName, kind: kindOfPath(path, repoNames), files: [] }
    entry.files.push(path)
    groups.set(key, entry)
  }
  const rank = { code: 0, test: 1, docs: 2 }
  // 保持 recon.files 的顺序（分数高的在前），只把代码排到测试/文档前面
  return [...groups.values()].sort((a, b) => (rank[a.kind] ?? 3) - (rank[b.kind] ?? 3))
}

function shortModule(path) {
  const parts = String(path ?? '').split('/').filter(Boolean)
  return parts.slice(-2).join('/') || path || '相关代码'
}

/**
 * @param {{
 *   description: string,
 *   recon?: object,
 *   scope?: string[],
 *   answers?: Record<string, any>,
 *   project?: object,
 *   conventions?: object,
 *   repoNames?: string[],
 *   intent?: 'bug'|'feature'|'refactor'|'analysis',
 * }} input
 */
export function buildPlan({ description, recon, scope = [], answers = {}, project, conventions, template, language, repoNames = [], intent: intentInput } = {}) {
  const text = String(description ?? '').trim()
  // 创建入口显式传入的 intent 优先：用户在界面上手动切到「分析」时，不能被 detectIntent 改回去
  const intent = normalizeIntent(intentInput) ?? detectIntent(text)
  const isAnalysis = intent === 'analysis'
  const pickedTemplate = template ?? templateForIntent(intent) ?? (() => {
    const detected = detectTemplate(text, language ?? conventions?.project?.language ?? project?.language ?? 'java')
    // bug/feature 流程不能因为描述里出现“分析/调用链”等词就套上只读分析模板（既有二分类语义不变）
    return !isAnalysis && detected?.id === 'analysis'
      ? detectTemplate(text, language ?? conventions?.project?.language ?? project?.language ?? 'java', { excludeIds: ['analysis'] })
      : detected
  })()
  const commandsForTemplate = project?.context?.commands ?? {}
  const files = recon?.files ?? []
  const commands = project?.context?.commands ?? {}
  const gate = commands.gate || conventions?.commands?.gate || ''
  const localTest = commands.localTest || commands.test || ''

  // 追问答案影响计划：只改某个模块、要不要补测试、是否同步契约
  const narrow = Object.values(answers ?? {}).find((answer) => answer && typeof answer === 'object' && answer.mode === 'only')
  const withTests = answers?.tests !== 'no-tests'
  const acceptanceChoice = answers?.acceptance

  const scopedFiles = narrow
    ? files.filter((file) => moduleOfPath(file.path, repoNames) === narrow.module)
    : files
  const groups = groupByModule(scopedFiles, repoNames)
  // 契约风险按“确认后真正要动的文件”判断：只改 source 时就不该带出库表步骤
  const riskyInScope = scopedFiles.some((file) => /(^|\/)db\/|\.sql$|controller\/|i18n|messages.*\.properties$/i.test(String(file.path)))
  const syncContract = answers?.['risk-contract'] === 'sync-all'
    ? true
    : answers?.['risk-contract'] === 'internal-only' ? false : riskyInScope

  const steps = []
  // bug 流程先复现/定位，再谈修改
  if (intent === 'bug') {
    steps.push('先复现问题：拿到最小输入/日志，确认失败现象可以稳定重现')
    steps.push('定位根因：沿调用链找到真正出错的分支并记录证据（不要只改现象）')
  }
  // 重构流程：先确认行为不变的边界，再小步改；不要顺手改需求
  if (intent === 'refactor') {
    steps.push('先确认重构边界：明确哪些对外行为/接口必须保持不变，并记进流程')
    steps.push('补保护网：用现有测试或补回归测试固定当前行为，测试未通过不开始大改')
  }
  // 分析流程只读：先读代码/日志，不做任何修改
  if (isAnalysis) {
    steps.push('只读排查：先读代码/日志，沿调用链找到真正相关的分支（不改代码）')
  }
  const codeGroups = groups.filter((group) => group.kind === 'code')
  const testGroups = groups.filter((group) => group.kind === 'test')
  const docGroups = groups.filter((group) => group.kind === 'docs')
  for (const group of codeGroups) {
    const names = group.files.slice(0, 3).map((path) => path.split('/').pop()).join('、')
    const suffix = group.files.length > 3 ? ` 等 ${group.files.length} 个文件` : ''
    steps.push(isAnalysis
      ? `阅读 ${group.module} 模块：${names}${suffix}（只读，不改代码）`
      : `阅读并修改 ${group.module} 模块：${names}${suffix}`)
  }
  for (const group of testGroups) {
    const names = group.files.slice(0, 2).map((path) => path.split('/').pop()).join('、')
    if (isAnalysis) {
      steps.push(`阅读相关测试：${names}${group.files.length > 2 ? ' 等' : ''}（只读，确认现有行为）`)
    } else {
      steps.push(`更新对应测试：${names}${group.files.length > 2 ? ' 等' : ''}（只改测试代码；执行测试由工作站验证阶段统一做）`)
    }
  }
  if (docGroups.length && !isAnalysis) {
    steps.push(`同步文档：${docGroups.flatMap((group) => group.files).slice(0, 3).map((path) => path.split('/').pop()).join('、')}`)
  }
  if (!steps.length) {
    steps.push(isAnalysis
      ? '先确认要分析的代码/调用链入口（当前没有命中的候选文件）'
      : '先定位要改的代码位置（当前没有命中的候选文件）')
  }
  // 模板的"必改触点"是指定动作，不是建议：放在步骤最前面，避免只改到 recon 命中的文件
  const touchpoints = (pickedTemplate?.touchpoints ?? []).slice(0, 10)
  // 命中里已经有测试文件就不再单列“补测试”，避免计划重复；分析流程不改代码，也不补测试
  if (withTests && !testGroups.length && !isAnalysis) steps.push('补充单元测试，覆盖新增分支')
  // 分析流程不落地代码：不补测试、不同步契约、不跑仓库门禁
  if (!withTests && !isAnalysis) steps.push('暂不补测试（已确认后续单独处理）')
  if (syncContract && !isAnalysis) steps.push('同步契约/库表/文案变更（含基线、迁移、三语 key）')
  // 本机自测/门禁属于「测试验证」阶段，由工作站执行；不写进开发任务，避免同一件事在开发/测试重复做
  if (isAnalysis) {
    steps.push('输出结论：根因/影响面/证据 + 补丁建议（建议不落地，不产生提交）')
    steps.push('把分析结论、证据与剩余风险回写到开发流程')
  } else {
    steps.push(DEV_HANDOFF_STEP)
  }

  const estimate = estimateWork({ recon: { ...recon, files: scopedFiles }, scope, commands, repoNames })

  const acceptance = []
  if (localTest) acceptance.push(isAnalysis ? `本机自测通过（只读证据；工作站「测试验证」阶段执行）：${localTest}` : `本机自测通过（工作站「测试验证」阶段执行）：${localTest}`)
  if (gate && !isAnalysis) acceptance.push(`仓库门禁通过（工作站「测试验证」阶段执行）：${gate}`)
  acceptance.push('改动文件不越出已确认的 scope')
  if (isAnalysis) {
    acceptance.push('分析结论已产出（含证据与影响面）')
    acceptance.push('分析流程只读：不改代码、不建 worktree、不产生提交')
  }
  if (withTests && !isAnalysis) acceptance.push('新增/修改的行为有对应测试覆盖')
  if (syncContract && !isAnalysis) acceptance.push('契约/库表/文案变更已同步基线、迁移与三语 key')
  if (acceptanceChoice === 'gate' && gate) acceptance.unshift(`验收以门禁为准（工作站「测试验证」阶段执行）：${gate}`)

  const risks = []
  for (const risk of estimate.risks ?? []) risks.push(`${risk.label}（${risk.sample}）`)
  // 客户端可能只回传 tokens/files；模块分布由文件路径自己推，别依赖 recon.modules
  const moduleSet = new Set((recon?.modules ?? []).map((entry) => entry?.name).filter(Boolean))
  for (const file of scopedFiles) moduleSet.add(moduleOfPath(file.path, repoNames))
  if (moduleSet.size >= 3) risks.push('命中分散在多个模块，存在跨模块依赖风险')
  if (!files.length) risks.push('没有命中候选文件，范围可能需要人工指定')
  if (recon?.truncated) risks.push('仓库扫描被截断，可能漏掉了部分相关文件')

  return {
    summary: text,
    steps,
    acceptance,
    risks,
    estimate,
    modules: [...new Set(groups.map((group) => group.module))],
    intent,
    template: {
      id: pickedTemplate?.id ?? 'generic',
      name: pickedTemplate?.name ?? '通用改动',
      touchpoints,
    },
    checks: checksOf(pickedTemplate, { commands: commandsForTemplate }),
    references: (pickedTemplate?.references ?? []).slice(0, 6),
    answered: Object.keys(answers ?? {}),
    generatedAt: new Date().toISOString(),
    generatedBy: 'dev-hub/plan',
  }
}

/** 计划的一句话摘要，用于对话卡片标题。 */
export function summarizePlan(plan) {
  if (!plan) return ''
  return `${plan.steps.length} 步 · ${plan.estimate.size} / ${plan.estimate.days} 人日（工作站自评）`
}
