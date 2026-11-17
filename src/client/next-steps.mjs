/**
 * 流程详情里的「下一步」建议：按事实算，不调模型、不猜。
 *
 * 输入：流程台账（阶段/任务/测试/风险/会话绑定）+ 会话实时状态。
 * 输出：一段状态摘要 + 最多 3 条可执行建议（每条带动作 id，由界面绑定到已有能力）。
 *
 * 为什么要它：进入一个流程时，人最想问的是"现在到哪了、接下来该干嘛"。
 * 把这些从台账里算出来，比让人自己翻页签找按钮更直接。
 */

import { REVIEW_STATUS_LABELS, STAGE_LABELS } from '../shared/workflow.mjs'
import { describeReview } from '../core/review.mjs'
import { DEV_STAGE_RULE } from '../shared/boundaries.mjs'

const STAGE_TEXT = {
  discovery: '需求澄清',
  techdoc: '技术文档',
  plan: '开发计划',
  develop: '开发中',
  review: '独立评审',
  verify: '测试验证',
  submit: '待提交',
  done: '已完成',
}

const TEST_TEXT = { not_run: '未运行', running: '运行中', passed: '已通过', failed: '未通过' }

/** 状态摘要：一行一个事实，给界面画 chips。 */
export function describeFlow(item, session) {
  const workflow = item?.workflow ?? {}
  const tests = workflow.tests ?? {}
  const review = describeReview(item)
  const tasks = item?.tasks ?? []
  const done = tasks.filter((task) => task.done).length
  // 风险：勾选过「已知晓」的不再算待处理；risks 保持"待处理数量"口径，供建议卡与 chip 直接用。
  const risks = (item?.risks ?? []).map(String).filter(Boolean)
  const acknowledged = new Set((item?.riskAcks ?? []).map(String))
  return {
    stage: workflow.stage ?? 'discovery',
    stageLabel: STAGE_TEXT[workflow.stage] ?? STAGE_LABELS[workflow.stage] ?? '需求澄清',
    stageReason: workflow.stageReason ?? '',
    status: item?.status ?? 'planned',
    intent: workflow.intent === 'analysis' ? 'analysis' : workflow.intent === 'bug' ? 'bug' : 'feature',
    tasks: { done, total: tasks.length },
    localTest: tests.local?.status ?? 'not_run',
    localTestSkipped: tests.local?.status === 'skipped' && !tests.local?.stale,
    localTestSkipReason: tests.local?.skipReason ?? '',
    localTestLabel: tests.local?.stale
      ? '已过期（需重跑）'
      : (TEST_TEXT[tests.local?.status] ?? '未运行'),
    localTestStale: Boolean(tests.local?.stale),
    environmentTest: tests.environment?.status ?? 'not_run',
    environmentTestSkipped: tests.environment?.status === 'skipped' && !tests.environment?.stale,
    environmentTestSkipReason: tests.environment?.skipReason ?? '',
    environmentTestLabel: tests.environment?.stale
      ? '已过期（需重跑）'
      : (TEST_TEXT[tests.environment?.status] ?? '未运行'),
    environmentTestStale: Boolean(tests.environment?.stale),
    // 测试通过后又检测到代码/诉求变化：阶段已回到开发中，旧测试结论不再作数
    rework: Boolean(workflow.rework?.at),
    reworkReason: workflow.rework?.reason ?? '',
    // 独立评审：结论、票数与纠偏意见（下一步建议据此排序，别让人跳过评审去跑环境测试）
    review: {
      status: review.status,
      verdict: review.verdict,
      round: review.round,
      maxRounds: review.maxRounds,
      exhausted: review.exhausted,
      total: review.total,
      passed: review.passed,
      failed: review.failed,
      errored: review.errored,
      pending: review.pending,
      allowed: review.allowed,
      label: REVIEW_STATUS_LABELS[review.status] ?? review.status,
      corrections: review.corrections,
      reworkAt: review.reworkAt ?? null,
    },
    risks: risks.filter((text) => !acknowledged.has(text)).length,
    risksTotal: risks.length,
    risksAcked: risks.filter((text) => acknowledged.has(text)).length,
    changePoints: (item?.changePoints ?? []).length,
    session: session
      ? {
          id: session.sessionId ?? null,
          bound: Boolean(session.sessionId),
          running: Boolean(session.running),
          alive: session.alive ?? null,
          turns: session.turns ?? 0,
          lastText: session.lastText ?? '',
          reason: session.reason ?? null,
        }
      : { id: null, bound: Boolean(item?.session?.id), running: false, alive: null, turns: 0 },
  }
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
export function suggestNextSteps(item, session) {
  const summary = describeFlow(item, session)
  const isAnalysis = summary.intent === 'analysis'
  const localTestValid = summary.localTest === 'passed' && !summary.localTestStale
  const environmentTestValid = summary.environmentTest === 'passed' && !summary.environmentTestStale
  // 人工跳过也算“这一步已处理”，但报告会显式标注；跳过不等于通过
  const localTestDone = localTestValid || summary.localTestSkipped
  const environmentTestDone = environmentTestValid || summary.environmentTestSkipped
  const steps = []
  const push = (action, title, hint) => steps.push({ action, title, hint })

  // 流程已结束：不再建议「继续推进」；详情页会展示完成态与报告入口
  if (summary.status === 'done' || summary.stage === 'done') return { summary, steps: [] }
  if (summary.status === 'blocked' || summary.risks > 0) {
    push(
      'edit-risks',
      summary.risks > 0
        ? `处理 ${summary.risks} 个风险/阻塞`
        : '流程被阻塞，先处理阻塞',
      summary.risks > 0
        ? `逐条勾选「已知晓」后这里的数量会减少（已确认 ${summary.risksAcked}/${summary.risksTotal}）`
        : `风险都已知晓（${summary.risksAcked}/${summary.risksTotal}）；把阻塞原因写清楚，或解除阻塞`,
    )
  }

  if (!summary.session.bound) {
    push(
      'launch',
      isAnalysis ? '开启分析会话' : '开启开发会话',
      isAnalysis
        ? '把规范与 Context Pack 交给会话，按「只读排查 → 结论」推进，不改代码'
        : '把规范与 Context Pack 交给会话，让它开始改代码',
    )
    if (summary.stage === 'plan' || summary.stage === 'discovery' || summary.stage === 'techdoc') {
      push('edit-plan', '先补全计划', '计划与验收齐了，开工门禁才会放行')
    }
  }
  // 会话已绑定：推进/评审/继续开发统一收口到右上角「继续推进」按钮
  // （会话在跑时按钮显示「正在开发…」并禁用），不再在「下一步」重复建议
  // “看看它现在在做什么 / 继续推进”——这些卡片既重复又容易误导。

  // 只有真正的下一步事实才给建议（评审纠偏、测试、提交、计划/风险）；
  // 会话正在跑时不提示测试：工具正在改代码，此时跑测试既抢资源又容易误判。
  const review = summary.review
  if (summary.session.bound && !summary.session.running) {
    if (review.status === 'failed') {
      if (review.exhausted) {
        push('review', '评审已达自动轮次上限，人工决定', `已自动进行 ${review.round}/${review.maxRounds} 轮评审；系统不再自动返工/复审，请到评审页选择人工通过、重置或手工重试`)
      } else if (review.reworkAt) {
        push('start-review', '重新评审', '纠偏意见已发回开发；完成修改后点它重新评审（测试仍由工作站测试验证阶段执行）')
      } else {
        push('rework', '提交纠偏意见，重新进入开发', `独立评审未通过：${review.failed} 位审核员给出 ${review.corrections.reduce((sum, entry) => sum + entry.findings.length, 0)} 条意见；把意见发回开发会话返工，修完先重新评审`)
      }
    } else if (review.status === 'error') {
      push('start-review', '重试评审', '有审核员未返回结论：点它重试派发（流程标记为待处理，不能当成通过）')
    } else if (review.status === 'pending') {
      push('review', '独立评审进行中', `第 ${review.round} 轮：${review.passed}/${review.total} 位已返回，等结论（不重复派发）`)
    } else if (isAnalysis) {
      // 分析流程没有「开发→评审→测试」的强顺序：本机自测只作为只读证据，由工作站执行
      if (!localTestDone) {
        push('local-test', '跑本机自测', `分析流程用本机自测作为只读证据（当前${summary.localTestLabel}）；通过即结束，不进入提交；也可以跳过（原因会进报告）`)
      }
    } else if (review.status === 'passed') {
      // 评审通过后才进入测试验证：测试统一由工作站按钮执行，不催开发会话自己跑
      if (!localTestDone) {
        push(
          'local-test',
          summary.localTestStale ? '重跑本机自测' : '跑本机自测',
          summary.localTestStale
            ? '测试通过后代码/诉求又有变化，旧结果已过期；重跑后才会继续验证'
            : '评审已通过：测试由工作站执行，通过后进入环境测试；也可以跳过（原因会写进报告）',
        )
      } else if (!environmentTestDone) {
        push(
          'env-test',
          summary.environmentTestStale ? '重跑环境测试' : '跑环境测试',
          summary.environmentTestStale
            ? '本机自测已重跑，之前的环境结果基于旧代码，需要重跑'
            : '评审已通过、本机自测已通过或已跳过；环境验证通过后阶段会进入「待提交」；也可以跳过（原因会写进报告）',
        )
      } else if (summary.stage !== 'done') {
        push('submit', '提交代码', '验证都过了（含人工跳过）：勾选变更文件、写提交信息')
      }
    } else if (review.status === 'idle' && summary.stage === 'review') {
      // 已进入评审阶段：直接开始评审，不能把流程卡在“等测试”上
      push('start-review', '继续推进即开始评审', '点它即自动开始独立评审（审核员按默认配置产生）；全部通过才进入测试验证')
    } else if (review.status === 'idle'
      && summary.stage === 'develop'
      && summary.tasks.total > 0
      && summary.tasks.done >= summary.tasks.total) {
      // 开发任务完成即评审（评审在测试验证之前）；不能等本机自测
      push('start-review', '开始独立评审', '开发任务已完成：点它自动派 1~3 位审核员复核改动与证据；评审通过后再跑本机/环境测试')
    }
  }

  if (summary.tasks.total && summary.tasks.done < summary.tasks.total) {
    push('edit-plan', `还有 ${summary.tasks.total - summary.tasks.done} 个任务未完成`, '把未完成任务发给会话，或先在「计划」里调整')
  }

  return { summary, steps: steps.slice(0, 3) }
}

/**
 * 「继续推进」的轻量开场：只把当前事实交给会话，不重发整包 Context Pack。
 * 会话里已有规范与上下文，再灌一遍既费 token 又会淹没之前聊过的决定。
 */
export function continuePrompt(summary) {
  const facts = [
    `阶段 ${summary.stageLabel}`,
    `任务 ${summary.tasks.done}/${summary.tasks.total}`,
    `本机自测 ${summary.localTestLabel}`,
    `环境测试 ${summary.environmentTestLabel}`,
  ].join(' · ')
  return `继续推进这个开发流程（${facts}）。先看一眼台账最新状态，接着做未完成的部分；改动前先说你打算怎么做，完成后回写任务与变更点。${DEV_STAGE_RULE}`
}

/** 给会话的开场问题：把状态摘要与用户诉求合成一句可发送的话。 */
export function composeAsk(summary, userText) {
  const text = String(userText ?? '').trim()
  const context = [
    `当前流程状态：${summary.stageLabel}${summary.stageReason ? `（${summary.stageReason}）` : ''}`,
    `任务 ${summary.tasks.done}/${summary.tasks.total}`,
    `本机自测 ${summary.localTestLabel}`,
    `环境测试 ${summary.environmentTestLabel}`,
  ].join(' · ')
  if (text) {
    return `${context}\n\n${text}\n\n（请按上面的现状推进；改动前先说明你打算怎么做，完成后回写任务与变更点。${DEV_STAGE_RULE}）`
  }
  return `${context}\n\n请评估当前进度：下一步应该做什么？如果有改进建议（风险、测试缺口、实现问题）请直接说，然后继续推进。`
}
