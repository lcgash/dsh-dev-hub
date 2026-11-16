/**
 * 统一入口：用户在「下一步」里说一句话，工作站自己判断这句话该怎么用。
 *
 * 两条去路（不再让用户选按钮）：
 * - 补充台账：目标/验收/任务/风险/计划等（走 applyAssistUpdates）；
 * - 推进开发：把话发到这条流程绑定的开发会话里。
 *
 * 判定由 dsh agent 做（带流程现状）；agent 不可用时用关键词兜底，并在回复里说明。
 */

import { ASSIST_SCHEMA } from './assist.mjs'

export const DISPATCH_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['ledger', 'session', 'both', 'none'] },
    reply: { type: 'string' },
    sessionMessage: { type: 'string' },
    updates: ASSIST_SCHEMA.properties.updates,
  },
  required: ['action', 'reply'],
  additionalProperties: true,
}

const SESSION_HINTS = ['继续', '推进', '接着做', '开始做', '跑测试', '跑一下', '执行', '修复', '改代码', '实现', '开工', '干吧', '重试', '优化一下', '检查一下']
const LEDGER_HINTS = ['验收', '目标', '非目标', '风险', '范围', '任务', '非功能', '补充', '记录', '改成', '增加一条']

export function buildDispatchPrompt({ item, message, session }) {
  const workflow = item?.workflow ?? {}
  const tasks = (item?.tasks ?? []).map((task) => `- [${task.done ? 'x' : ' '}] ${task.text}`).join('\n') || '（空）'
  return [
    '你是「DevHub 开发工作站」的分诊助手。用户会在流程里说一句话，你要判断它应该：',
    '1) 补充流程台账（目标/验收/任务/风险/计划/范围等）；',
    '2) 发给开发会话让它继续干活；',
    '3) 两者都要；',
    '4) 两者都不需要（只是询问/闲聊）。',
    '',
    '【流程现状】',
    `- 标题：${item?.title ?? ''}（${item?.id ?? ''}）`,
    `- 阶段：${workflow.stage ?? 'discovery'}｜状态：${item?.status ?? 'planned'}`,
    `- 目标：${item?.goal || '（未填写）'}`,
    `- 验收：${(item?.acceptance ?? []).join('；') || '（空）'}`,
    `- 任务：\n${tasks}`,
    `- 风险：${(item?.risks ?? []).join('；') || '（空）'}`,
    `- 开发会话：${session ? `已绑定（${session.running ? '运行中' : '空闲'}，第 ${session.turns ?? 0} 轮）` : '未绑定'}`,
    '',
    `【用户这句话】${String(message ?? '').trim()}`,
    '',
    '判定规则：',
    '- 只是"补充/修改信息"（比如加验收、记风险、标任务完成）→ action=ledger，并填 updates；',
    '- 明确要求去做/继续/跑测试/改代码/排查 → action=session，并给出要发给会话的 sessionMessage（可直接用原话，或补一句上下文）；',
    '- 既要改台账又要开工（例如"验收加一条失败回滚，然后接着做"）→ action=both；',
    '- 没绑会话时不能选 session/both，改选 ledger 并在 reply 里说明需要先开启会话。',
    '- updates 只写用户明确提到的字段，不要编造。',
    '- reply 用中文一句话说明你打算怎么处理（会被直接展示给用户）。',
    '- 只输出 JSON：',
    '{"action":"ledger","reply":"...","sessionMessage":"可选","updates":{"acceptanceAdd":["..."]}}',
  ].join('\n')
}

/** agent 不可用时的确定性兜底：按关键词分诊，不冒充分析成功。 */
export function fallbackDispatch(message, { hasSession = false } = {}) {
  const text = String(message ?? '')
  const asksSession = SESSION_HINTS.some((word) => text.includes(word))
  const asksLedger = LEDGER_HINTS.some((word) => text.includes(word))
  if (asksSession) {
    return {
      action: hasSession ? 'session' : 'ledger',
      reply: hasSession ? '（工作站暂不可用，按关键词把这句话发给开发会话）' : '（工作站暂不可用；这句话像是要开工，但还没有开发会话，先当作补充记录）',
      sessionMessage: hasSession ? text : undefined,
    }
  }
  if (asksLedger) return { action: 'ledger', reply: '（工作站暂不可用，按关键词把这句话记进台账）' }
  return { action: asksLedger ? 'ledger' : 'none', reply: '（工作站暂不可用，没判断出要做什么；可以再具体一点）' }
}

export function normalizeDispatch(raw, { hasSession = true } = {}) {
  const value = raw && typeof raw === 'object' ? raw : {}
  let action = ['ledger', 'session', 'both', 'none'].includes(value.action) ? value.action : 'none'
  if (!hasSession && (action === 'session' || action === 'both')) action = 'ledger'
  return {
    action,
    reply: String(value.reply ?? '').trim() || '已处理。',
    sessionMessage: String(value.sessionMessage ?? '').trim() || null,
    updates: value.updates && typeof value.updates === 'object' ? value.updates : {},
  }
}
