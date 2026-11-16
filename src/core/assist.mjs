/**
 * 对话式补充：用户用一句话补齐/修正流程信息，而不是一项一项填表。
 *
 * 这里只做三件纯函数的事：
 * 1. 生成给 agent 的指令（附带当前台账的紧凑快照）；
 * 2. 定义 agent 必须返回的 JSON 契约；
 * 3. 把 agent 的 `updates` 安全地合并进 item（只允许白名单字段，去重、限长）。
 *
 * 真正的执行（起 agent）在 host 侧调用 agent-run；界面上的「编辑」仅用于回看时纠偏。
 */

export const ASSIST_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    updates: {
      type: 'object',
      properties: {
        goal: { type: 'string' },
        rootProblem: { type: 'string' },
        acceptanceAdd: { type: 'array', items: { type: 'string' } },
        nonGoalsAdd: { type: 'array', items: { type: 'string' } },
        tasksAdd: { type: 'array', items: { type: 'string' } },
        tasksCompleteMatch: { type: 'array', items: { type: 'string' } },
        risksAdd: { type: 'array', items: { type: 'string' } },
        changePointsAdd: { type: 'array', items: { type: 'string' } },
        planSummary: { type: 'string' },
        planSteps: { type: 'array', items: { type: 'string' } },
        techDocDecision: { type: 'string', enum: ['existing', 'create', 'none'] },
        techDocTitle: { type: 'string' },
        question: { type: 'string' },
      },
      additionalProperties: true,
    },
    ask: { type: 'string' },
  },
  required: ['reply'],
  additionalProperties: true,
}

function list(items, limit = 8) {
  return (items ?? []).slice(0, limit).map((entry) => `- ${entry}`).join('\n') || '（空）'
}

/** 给 agent 的指令：当前台账 + 用户这句话 + 输出契约。 */
export function buildAssistPrompt({ item, message, repoName }) {
  const workflow = item?.workflow ?? {}
  const tasks = (item?.tasks ?? []).map((task) => `- [${task.done ? 'x' : ' '}] ${task.text}`).join('\n') || '（空）'
  return [
    `你是「DevHub 开发工作站」的信息整理助手，仓库：${repoName || '当前仓库'}。`,
    '用户在补充/修正一条开发流程的信息。请把他的话整理进台账字段，并回一句简短确认。',
    '',
    '【当前流程】',
    `标题：${item?.title ?? ''}（${item?.id ?? ''}）`,
    `目标：${item?.goal || '（未填写）'}`,
    `非目标：${(item?.nonGoals ?? []).join('；') || '（空）'}`,
    `验收标准：${(item?.acceptance ?? []).join('；') || '（空）'}`,
    `根本问题：${workflow.rootProblem || '（未填写）'}`,
    `计划摘要：${workflow.plan?.summary || '（未填写）'}`,
    `计划步骤：\n${list(workflow.plan?.steps)}`,
    `任务：\n${tasks}`,
    `风险：\n${list(item?.risks)}`,
    `变更点：\n${list((item?.changePoints ?? []).map((point) => point.summary))}`,
    '',
    '【用户这句话】',
    String(message ?? '').trim(),
    '',
    '要求：',
    '1. 只写用户明确说了或明显可推断的内容；不要编造验收、风险、任务。',
    '   **只返回与这句话相关的字段**：用户没提到的（目标/计划/技术文档…）不要填、不要"顺手补默认值"。',
    '2. 增量字段用 *Add；已完成的任务用 tasksCompleteMatch 给出任务文本里的关键片段。',
    '3. 如果信息不足，把要问的问题放进 `ask`（一两个），不要瞎补。',
    '4. `reply` 用中文一句话说明你改了什么；没改就说明为什么。',
    '5. 只输出 JSON，不要 Markdown：',
    '{"reply":"...","updates":{"goal":"...","acceptanceAdd":["..."],"tasksAdd":["..."],"tasksCompleteMatch":["..."],"risksAdd":["..."],"planSummary":"...","planSteps":["..."],"techDocDecision":"none","question":"..."},"ask":"可选"}',
  ].join('\n')
}

function uniqueAppend(current, additions, maxItems = 30) {
  const seen = new Set((current ?? []).map((entry) => String(entry).trim()))
  const out = [...(current ?? [])]
  for (const raw of additions ?? []) {
    const value = String(raw ?? '').trim().slice(0, 500)
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
    if (out.length >= maxItems) break
  }
  return out
}

/**
 * 把 agent 的 updates 合并进 item（就地修改并返回变更列表）。
 * 只允许白名单字段；文本限长，列表去重。
 */
export function applyAssistUpdates(item, updates, { message = '' } = {}) {
  const applied = []
  const value = updates && typeof updates === 'object' ? updates : {}
  // 用户没提到这类字段时，忽略 agent 的"顺手补默认值"（例如悄悄把技术文档设成 none）
  const text = String(message ?? '')
  const mentions = (...words) => words.some((word) => text.includes(word))

  if (typeof value.goal === 'string' && value.goal.trim() && mentions('目标', '目的')) {
    item.goal = value.goal.trim().slice(0, 2000)
    applied.push('目标')
  }
  if (typeof value.rootProblem === 'string' && value.rootProblem.trim() && mentions('根本问题', '根因', '问题')) {
    item.workflow ??= {}
    item.workflow.rootProblem = value.rootProblem.trim().slice(0, 2000)
    applied.push('根本问题')
  }
  if (Array.isArray(value.acceptanceAdd) && value.acceptanceAdd.length) {
    const before = (item.acceptance ?? []).length
    item.acceptance = uniqueAppend(item.acceptance, value.acceptanceAdd)
    if (item.acceptance.length > before) applied.push(`验收 +${item.acceptance.length - before}`)
  }
  if (Array.isArray(value.nonGoalsAdd) && value.nonGoalsAdd.length) {
    const before = (item.nonGoals ?? []).length
    item.nonGoals = uniqueAppend(item.nonGoals, value.nonGoalsAdd)
    if (item.nonGoals.length > before) applied.push(`非目标 +${item.nonGoals.length - before}`)
  }
  if (Array.isArray(value.tasksAdd) && value.tasksAdd.length) {
    const existing = new Set((item.tasks ?? []).map((task) => task.text))
    const additions = value.tasksAdd.map((text) => String(text ?? '').trim()).filter((text) => text && !existing.has(text))
    if (additions.length) {
      item.tasks = [...(item.tasks ?? []), ...additions.map((text) => ({ text, done: false }))]
      applied.push(`任务 +${additions.length}`)
    }
  }
  if (Array.isArray(value.tasksCompleteMatch) && value.tasksCompleteMatch.length && item.tasks?.length) {
    let done = 0
    for (const needle of value.tasksCompleteMatch) {
      const key = String(needle ?? '').trim()
      if (!key) continue
      const target = item.tasks.find((task) => !task.done && task.text.includes(key))
      if (target) { target.done = true; done += 1 }
    }
    if (done) applied.push(`完成 ${done} 个任务`)
  }
  if (Array.isArray(value.risksAdd) && value.risksAdd.length) {
    const before = (item.risks ?? []).length
    item.risks = uniqueAppend(item.risks, value.risksAdd, 20)
    if (item.risks.length > before) applied.push(`风险 +${item.risks.length - before}`)
  }
  if (Array.isArray(value.changePointsAdd) && value.changePointsAdd.length) {
    const existing = new Set((item.changePoints ?? []).map((point) => point.summary))
    const additions = value.changePointsAdd
      .map((summary) => String(summary ?? '').trim())
      .filter((summary) => summary && !existing.has(summary))
    if (additions.length) {
      item.changePoints = [...(item.changePoints ?? []), ...additions.map((summary) => ({ type: 'assist', summary }))]
      applied.push(`变更点 +${additions.length}`)
    }
  }
  if (typeof value.planSummary === 'string' && value.planSummary.trim() && mentions('计划', '步骤', '拆')) {
    item.workflow ??= {}
    item.workflow.plan = { ...(item.workflow.plan ?? {}), summary: value.planSummary.trim().slice(0, 2000) }
    applied.push('计划摘要')
  }
  if (Array.isArray(value.planSteps) && value.planSteps.length && mentions('计划', '步骤', '拆')) {
    item.workflow ??= {}
    item.workflow.plan = {
      ...(item.workflow.plan ?? {}),
      steps: uniqueAppend([], value.planSteps, 30),
    }
    applied.push('计划步骤')
  }
  if (['existing', 'create', 'none'].includes(value.techDocDecision) && mentions('文档', '技术方案', '技术文档')) {
    item.workflow ??= {}
    item.workflow.techDoc = {
      ...(item.workflow.techDoc ?? {}),
      decision: value.techDocDecision,
      ...(value.techDocTitle ? { title: String(value.techDocTitle).trim().slice(0, 200) } : {}),
    }
    applied.push('技术文档')
  }
  if (typeof value.question === 'string' && value.question.trim()) {
    item.workflow ??= {}
    item.workflow.questions = [
      ...(item.workflow.questions ?? []),
      { id: `q-${Date.now().toString(36)}`, question: value.question.trim().slice(0, 500), answer: '' },
    ]
    applied.push('待回答的问题')
  }
  return applied
}

/** 界面回看用：从 history 里取最近的对话式补充记录。 */
export function assistThread(history, limit = 10) {
  return (history ?? [])
    .filter((entry) => entry?.type === 'assist' || entry?.type === 'assist-reply')
    .slice(-limit)
}
