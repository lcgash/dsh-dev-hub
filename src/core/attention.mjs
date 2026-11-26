/**
 * 流程的「需要你处理」信号：纯函数，只从事实推导。
 *
 * 事实来源分两类：
 * - 台账里已有的事实：status / stage / 测试状态 / 是否绑定开发会话 / 任务是否完成；
 * - 调用方读到的会话事实：是否在跑、有几条待答问题、几条待授权。
 *
 * 关键约束：开发会话还在跑时不能提示"可以跑本机自测"，任务没做完也不提示；
 * 只有"已绑定会话 + 开发阶段 + 任务全部完成 + 会话空闲"才是真的可以测试。
 *
 * 本模块不得 import 任何 host/框架模块（核心模块边界），便于单测与复用。
 */

import { describeReview } from './review.mjs'

/**
 * 独立评审也是事实：评审未通过先提示纠偏；评审未开始先提示「继续推进即开始评审」，再谈环境测试。
 * @param {object} item 开发项（台账原始记录）
 * @param {{ running?: boolean, pendingQuestions?: number, pendingApprovals?: number }} [facts]
 * @returns {{ kind: string, label: string, tone: 'danger'|'warn'|'neutral'|'accent' } | null}
 */
export function deriveAttention(item, { running = false, pendingQuestions = 0, pendingApprovals = 0 } = {}) {
  const tests = item?.workflow?.tests ?? {}
  const local = tests.local?.status ?? 'not_run'
  const env = tests.environment?.status ?? 'not_run'
  const stage = item?.workflow?.stage ?? 'discovery'
  const status = item?.status ?? 'planned'
  const sessionId = item?.session?.id

  if (status === 'done') return null
  if (status === 'blocked') return { kind: 'blocked', label: '被阻塞', tone: 'danger' }
  if (pendingQuestions > 0) return { kind: 'question', label: '会话在等你回答', tone: 'warn' }
  if (pendingApprovals > 0) return { kind: 'approval', label: '等待你授权', tone: 'warn' }
  // 会话在跑就是"正在开发"：不打扰，等它自己结束再提示下一步
  if (running === true) return null
  // 目标是客户原话（没经过规范化）时先处理需求：否则后面做得越多，返工越大
  if (item?.requirement?.needsReview) return { kind: 'requirement', label: '需求还没规范化', tone: 'warn' }
  if (!sessionId) return { kind: 'no-session', label: '还没开发会话', tone: 'neutral' }
  const review = describeReview(item)
  if (review.status === 'failed') return { kind: 'review-failed', label: '独立评审未通过，需要纠偏', tone: 'danger' }
  if (review.status === 'error') return { kind: 'review-error', label: '评审异常待处理', tone: 'warn' }
  // 评审进行中是「正在跑」，不是用户待处理；放进抽屉的「进行中」分组即可，
  // 否则首页「进行中」和抽屉「需要你处理」会同时显示同一条评审。
  if (review.status === 'pending') return null
  if (local === 'failed') return { kind: 'test-failed', label: '本机自测失败', tone: 'danger' }
  // 本机自测人工跳过：下一步是环境测试（或也跳过），不能反过来提示“跑本机自测”
  if (stage === 'verify' && review.status === 'passed'
    && tests.local?.status === 'skipped' && !tests.local?.stale
    && !(tests.environment?.status === 'passed' || tests.environment?.status === 'skipped')) {
    return { kind: 'ready-env', label: '本机自测已跳过：可以跑环境测试', tone: 'accent' }
  }
  // 分析流程只读：任务完成即结束，不需要评审/测试动作
  const intent = item?.workflow?.intent
  if (intent === 'analysis') {
    const tasks = Array.isArray(item?.tasks) ? item.tasks : []
    if (tasks.length > 0 && tasks.every((task) => Boolean(task?.done))) return null
  }
  // 开发完成先评审（评审在测试验证之前）；分析流程例外
  if (review.status === 'idle' && stage === 'develop' && intent !== 'analysis') {
    const tasks = Array.isArray(item?.tasks) ? item.tasks : []
    const allDone = tasks.length > 0 && tasks.every((task) => Boolean(task?.done))
    if (allDone) return { kind: 'ready-review', label: '开发已完成：点「继续推进」开始评审', tone: 'accent' }
  }
  if (local !== 'passed') {
    // 只有开发任务全部完成、会话也空闲了，才真的可以跑本机自测；
    // 计划/开发中的流程不提示测试（否则用户每步都看到"可以跑本机自测"）。
    const tasks = Array.isArray(item?.tasks) ? item.tasks : []
    const allDone = tasks.length > 0 && tasks.every((task) => Boolean(task?.done))
    // 评审通过后（verify）也要提示跑本机自测；开发阶段则要求任务全部完成，避免半路误报
    if ((stage === 'develop' && allDone) || (stage === 'verify' && review.status === 'passed')) {
      return { kind: 'ready-test', label: '可以跑本机自测', tone: 'accent' }
    }
    return null
  }
  if (review.status === 'idle') return { kind: 'ready-review', label: '继续推进即开始评审', tone: 'accent' }
  if (env !== 'passed') return { kind: 'ready-env', label: '可以跑环境测试', tone: 'accent' }
  if (stage !== 'done') return { kind: 'ready-submit', label: '可以提交代码', tone: 'accent' }
  return null
}