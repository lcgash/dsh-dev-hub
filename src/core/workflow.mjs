import { STAGE_LABELS } from '../shared/workflow.mjs'
import { describeReview, formatReviewLine } from './review.mjs'

/** Append one immutable timeline entry to an item (in memory). */
export function appendHistory(item, type, message) {
  item.history ??= []
  item.history.push({ at: new Date().toISOString(), type, message })
  if (item.history.length > 200) item.history = item.history.slice(-200)
  return item
}

/**
 * 聊天式入口创建的流程（workflow.entry === 'chat'）不要求填澄清问题与技术文档：
 * 用户已经用一句话说明要做什么、并在探测卡片上确认了范围与文件。
 * 但根因、计划、验收仍然必须有 —— 只是由系统按描述与仓库命令自动带入。
 */
export function missingForChatStart(item) {
  const missing = []
  const workflow = item.workflow ?? {}
  if (!String(workflow.rootProblem ?? '').trim()) missing.push('还没写清要做什么（根因/目标）')
  if (!workflow.plan?.summary) missing.push('开发计划摘要为空')
  if (!item.acceptance?.length) missing.push('验收标准为空')
  if (!item.scope?.length) missing.push('还没有确认要改的目录或模块')
  return missing
}

/** Human-readable missing prerequisites for starting development. */
export function missingForStart(item) {
  if (item.workflow?.entry === 'chat') return missingForChatStart(item)
  const missing = []
  const workflow = item.workflow ?? {}
  if (!workflow.rootProblem) missing.push('根本问题/根因还没确认')
  const answered = (workflow.questions ?? []).filter((question) => question.answer).length
  if (answered < 3) missing.push(`至少回答 3 个澄清问题（当前 ${answered} 个）`)
  const techDoc = workflow.techDoc ?? {}
  if (!techDoc.decision) missing.push('还没有选择技术文档方案')
  if (techDoc.decision === 'existing' && !techDoc.url && !techDoc.localPath) missing.push('技术文档 URL 或本地路径为空')
  if (techDoc.decision === 'create' && !techDoc.title) missing.push('待创建技术文档还没有标题')
  // 工程量由工作站自评，不要求用户填；计划摘要与步骤由工作站生成
  if (!workflow.plan?.summary) missing.push('还没有开发计划摘要（工作站会自己生成）')
  if (!workflow.plan?.steps?.length) missing.push('开发计划还没有步骤（工作站会自己生成）')
  if (!item.acceptance?.length) missing.push('验收标准为空')
  return missing
}

/** Format the workflow block used by the Context Pack. */
export function formatWorkflow(item) {
  const workflow = item.workflow ?? {}
  const lines = []
  lines.push(`- 阶段：${STAGE_LABELS[workflow.stage] ?? workflow.stage ?? '未知'}`)
  lines.push(`- 根本问题：${workflow.rootProblem || '（未确认）'}`)
  const questions = workflow.questions ?? []
  lines.push(`- 澄清问题：${questions.filter((q) => q.answer).length}/${questions.length} 已回答`)
  for (const question of questions) {
    if (!question.answer) lines.push(`  - 未回答：${question.question}`)
  }
  const techDoc = workflow.techDoc ?? {}
  lines.push(`- 技术文档：${techDoc.decision === 'existing' ? (techDoc.url || techDoc.localPath || '已确认') : techDoc.decision === 'create' ? `开发中创建（${techDoc.title || '未命名'}）` : '暂不创建'}`)
  const plan = workflow.plan ?? {}
  lines.push(`- 开发计划：${plan.summary || '（未填写）'}`)
  if (plan.steps?.length) lines.push(...plan.steps.map((step) => `  - ${step}`))
  const estimate = plan.estimate ?? {}
  lines.push(`- 工程量：${estimate.size || '?'} / ${estimate.days ?? '?'} 人日 / 置信度 ${estimate.confidence || '?'}`)
  lines.push(`- 本机自测：${statusLabel(workflow.tests?.local?.status)}`)
  lines.push(`- 环境测试：${statusLabel(workflow.tests?.environment?.status)}`)
  lines.push(`- 独立评审：${formatReviewLine(item)}`)
  if (workflow.submission) lines.push(`- 提交：${workflow.submission.commit || '未提交'}${workflow.submission.pushed ? '（已推送）' : ''}`)
  return lines.join('\n')
}

function statusLabel(status) {
  return { not_run: '未运行', running: '运行中', passed: '通过', failed: '失败' }[status] ?? status ?? '未运行'
}

/** Generate a Markdown design document from the current discovery/plan. */
export function buildDesignDoc(item, repoName) {
  const workflow = item.workflow ?? {}
  const lines = [
    `# ${item.title}`,
    '',
    `- 项目：${repoName}`,
    `- 开发项：${item.id}`,
    `- 状态：${item.status}`,
    `- 目标：${item.goal || '（未填写）'}`,
    '',
    '## 根本问题',
    '',
    workflow.rootProblem || '（待确认）',
    '',
    '## 需求澄清',
    '',
  ]
  for (const question of workflow.questions ?? []) {
    lines.push(`### ${question.question}`, '', question.answer || '（待回答）', '')
  }
  lines.push('## 非目标', '', ...(item.nonGoals?.length ? item.nonGoals.map((v) => `- ${v}`) : ['- （未填写）']), '')
  lines.push('## 验收标准', '', ...(item.acceptance?.length ? item.acceptance.map((v) => `- ${v}`) : ['- （未填写）']), '')
  lines.push('## 开发计划', '', workflow.plan?.summary || '（未填写）', '')
  for (const step of workflow.plan?.steps ?? []) lines.push(`- [ ] ${step}`)
  const estimate = workflow.plan?.estimate ?? {}
  lines.push('', `## 工程量评估`, '', `- 规模：${estimate.size || '?'}`, `- 人日：${estimate.days ?? '?'}`, `- 置信度：${estimate.confidence || '?'}`, '')
  lines.push('## 独立评审', '')
  const review = describeReview(item)
  if (review.status === 'idle') {
    lines.push('- 未评审（开发阶段完成后点「继续推进」即开始独立评审，自动派 1~3 位审核员复核改动与证据）', '')
  } else {
    lines.push(`- 结论：${review.verdict === 'pass' ? '通过' : review.verdict === 'fail' ? '未通过' : '待处理'}（第 ${review.round} 轮，${review.passed}/${review.total} 位通过）`, '')
    for (const reviewer of review.reviewers) {
      lines.push(`### ${reviewer.label}`, '', `- 结论：${reviewer.status === 'passed' ? '通过' : reviewer.status === 'failed' ? '未通过' : reviewer.status === 'error' ? '异常/未返回' : '待返回'}`, '')
      if (reviewer.summary) lines.push(reviewer.summary, '')
      for (const finding of reviewer.findings) {
        lines.push(`- [${finding.severity}] ${finding.summary}${finding.file ? `（${finding.file}）` : ''}${finding.detail ? `：${finding.detail}` : ''}`)
      }
      if (reviewer.findings.length) lines.push('')
    }
    for (const correction of review.corrections) {
      lines.push(`- 纠偏意见（${correction.reviewerLabel}）：${correction.findings.join('；')}`)
    }
    if (review.corrections.length) lines.push('')
  }
  lines.push('## 风险', '', ...(item.risks?.length ? item.risks.map((v) => `- ${v}`) : ['- （未填写）']), '')
  lines.push('## 变更点', '', ...(item.changePoints?.length ? item.changePoints.map((p) => `- ${p.summary}`) : ['- （开发中补充）']), '')
  return lines.join('\n')
}
