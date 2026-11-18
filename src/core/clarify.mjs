/**
 * 需求澄清对话：用户第一句话往往很粗，需要几轮追问才能把"到底解决什么问题"问准。
 *
 * 这里只做纯逻辑：
 * 1. 生成给 dsh agent 的指令（带上仓库探测证据 + 已有对话 + 当前规格）；
 * 2. 定义 agent 必须返回的结构（reply / questions / spec / ready / missing）；
 * 3. 规范化结果，保证界面拿到的永远是稳定形状。
 *
 * 真正调 agent 在 Host（host/agent-run）；agent 不可用时由调用方退回规则化追问。
 */

export const MAX_ROUNDS = 4

export const CLARIFY_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    title: { type: 'string' },
    ready: { type: 'boolean' },
    missing: { type: 'array', items: { type: 'string' } },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          why: { type: 'string' },
          multiSelect: { type: 'boolean' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: { label: { type: 'string' }, description: { type: 'string' } },
              required: ['label'],
              additionalProperties: true,
            },
          },
        },
        required: ['question'],
        additionalProperties: true,
      },
    },
    spec: {
      type: 'object',
      properties: {
        problem: { type: 'string' },
        goals: { type: 'array', items: { type: 'string' } },
        // 客户原话之外的上下文：没有就留空，不要编造
        background: { type: 'string' },
        expected: { type: 'string' },
        nonGoals: { type: 'array', items: { type: 'string' } },
        acceptance: { type: 'array', items: { type: 'string' } },
        scope: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: true,
    },
  },
  required: ['reply'],
  additionalProperties: true,
}

function list(items, empty = '（空）') {
  return (items ?? []).map((item) => `- ${item}`).join('\n') || empty
}

function historyText(history) {
  return (history ?? [])
    .slice(-12)
    .map((turn) => `${turn.role === 'user' ? '用户' : '你'}：${String(turn.text ?? '').trim()}`)
    .join('\n') || '（这是第一轮）'
}

/**
 * 给 agent 的指令：目标是把"用户的一句话"问成"可执行的问题定义"。
 * @param {{
 *   description: string,
 *   history?: Array<{role:string,text:string}>,
 *   recon?: { files?: any[], tokens?: string[], suggestedScope?: string[] },
 *   spec?: object,
 *   round?: number,
 * }} input
 */
export function buildClarifyPrompt({ description, history, recon, spec, round = 1 }) {
  const files = (recon?.files ?? []).slice(0, 8)
  return [
    '你是「DevHub 开发工作站」的需求澄清助手。用户只给了一句粗描述，你要通过**几轮追问**把下面四件事问准：',
    '1) 真正要解决的问题（根因，不是方案）；2) 目标与非目标；3) 验收标准（可验证）；4) 改动范围（目录/模块）。',
    '',
    `【用户最初描述】${String(description ?? '').trim()}`,
    '',
    '【仓库探测证据】（只作为问问题的依据，不要替用户下结论）',
    `候选文件：\n${list(files.map((file) => `${file.path}${file.why ? `（${file.why}）` : ''}`))}`,
    `建议范围：${(recon?.suggestedScope ?? []).join('、') || '（未给出）'}`,
    '',
    '【当前已确认的规格】',
    `问题：${spec?.problem || '（未确认）'}`,
    `目标：${(spec?.goals ?? []).join('；') || '（未确认）'}`,
    `背景：${spec?.background || '（未确认）'}`,
    `期望行为：${spec?.expected || '（未确认）'}`,
    `非目标：${(spec?.nonGoals ?? []).join('；') || '（未确认）'}`,
    `验收：${(spec?.acceptance ?? []).join('；') || '（未确认）'}`,
    `范围：${(spec?.scope ?? []).join('、') || '（未确认）'}`,
    '',
    `【已经聊过的内容（第 ${round} 轮）】`,
    historyText(history),
    '',
    '规则：',
    '- 每轮**最多问 2 个**最关键的问题；能从上文推断的就不要问。',
    '- 每个问题给一句 `why`（为什么问），尽量给 2~4 个选项（用户可点），允许自由回答。',
    '- 如果一个问题的多个选项可以同时成立（例如“涉及哪些场景”），把 `multiSelect` 设为 true，并在问题里注明「可多选」；只能选一个时设为 false。',
    '- 当你已经能写出明确的问题/目标/非目标/验收/范围时，`ready=true`、`questions=[]`，并把 spec 填好。',
    `- 已经问了 ${round - 1} 轮；最多 ${MAX_ROUNDS} 轮，不要无休止追问。`,
    '- 不要编造验收标准；用户没提到的写进 missing，让界面提示。',
    '- `reply` 用中文一两句话，先复述你理解到的重点，再提问或收尾。',
    '- 顺便给这个需求起一个**流程标题**（10~20 字，动宾短语，能放进流程列表；不要句号、不要"需求"二字），放在 `title`。',
    '- 标题随理解更新：每轮都给出你认为最准确的 `title`；用户改了标题就以用户为准。',
    '- 只输出 JSON，不要 Markdown：',
    '{"reply":"...","title":"给源补失败告警","questions":[{"id":"q1","question":"涉及哪些场景？","why":"...","multiSelect":true,"options":[{"label":"...","description":"..."}]}],"ready":false,"missing":["..."],"spec":{"problem":"...","goals":["..."],"nonGoals":["..."],"acceptance":["..."],"scope":["..."]}}',
  ].join('\n')
}

/** 规范化 agent 返回，保证界面拿到稳定形状。 */
export function normalizeClarify(raw, { round = 1 } = {}) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const questions = (Array.isArray(value.questions) ? value.questions : [])
    .map((question, index) => ({
      id: String(question?.id ?? `q${round}-${index + 1}`),
      question: String(question?.question ?? '').trim(),
      why: String(question?.why ?? '').trim() || null,
      // 模型偶尔只写「可多选」不置 flag；问题文本里明确写了就按多选处理，避免界面只允许单选
      multiSelect: Boolean(question?.multiSelect) || /(?:可多选|多选)/.test(String(question?.question ?? '')),
      options: (Array.isArray(question?.options) ? question.options : [])
        .map((option) => ({ label: String(option?.label ?? '').trim(), description: String(option?.description ?? '').trim() || null }))
        .filter((option) => option.label)
        .slice(0, 6),
    }))
    .filter((question) => question.question)
    .slice(0, 3)

  const specRaw = value.spec && typeof value.spec === 'object' ? value.spec : {}
  const spec = {
    problem: String(specRaw.problem ?? '').trim(),
    goals: (specRaw.goals ?? []).map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8),
    background: String(specRaw.background ?? '').trim(),
    expected: String(specRaw.expected ?? '').trim(),
    nonGoals: (specRaw.nonGoals ?? []).map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8),
    acceptance: (specRaw.acceptance ?? []).map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12),
    scope: (specRaw.scope ?? []).map(String).map((item) => item.trim()).filter(Boolean).slice(0, 10),
  }

  const ready = Boolean(value.ready) && Boolean(spec.problem) && spec.acceptance.length > 0 && questions.length === 0
  const title = String(value.title ?? '').replace(/\s+/g, ' ').trim().replace(/[。.]$/, '').slice(0, 40)
  return {
    round,
    title,
    reply: String(value.reply ?? '').trim() || (ready ? '需求已经足够清楚，可以生成计划了。' : '再确认几个问题，就能生成计划。'),
    questions: ready ? [] : questions,
    ready,
    missing: (value.missing ?? []).map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8),
    spec,
  }
}

/** 把「问题 id → 答案」拼成可读文本，供下一轮 agent 与最终 answers 使用。 */
export function answerSummary(questions, answers) {
  const rows = []
  for (const question of questions ?? []) {
    const answer = answers?.[question.id]
    if (!answer) continue
    const text = typeof answer === 'string' ? answer : [answer.selected?.join('、'), answer.custom].filter(Boolean).join('；')
    if (text) rows.push(`- ${question.question} → ${text}`)
  }
  return rows.join('\n')
}

/** 把对话轮次压成 agent 可读的历史（含用户回答）。 */
export function toHistory(turns) {
  return (turns ?? []).map((turn) => ({ role: turn.role, text: turn.text }))
}
