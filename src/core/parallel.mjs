import { normalizeScope, scopeOverlap } from './modules.mjs'

/** Statuses that mean "a flow is currently occupying its scope". */
export const ACTIVE_STATUSES = ['designing', 'developing', 'reviewing', 'verifying']

/** Every flow that is not finished yet — used when deciding whether new work may start. */
export function occupyingFlows(items) {
  return (items ?? []).filter((item) => item.status !== 'done').map(flowSummary)
}

/** Compact flow projection used by the project home and the parallel view. */
export function flowSummary(item) {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    stage: item.workflow?.stage ?? null,
    goal: item.goal ?? '',
    scope: normalizeScope(item.scope),
    scopeModules: (item.scopeModules ?? []).length ? item.scopeModules : [],
    updatedAt: item.updatedAt ?? null,
    baseline: item.baseline ?? null,
    worktree: item.workflow?.worktree ?? null,
  }
}

/** Flows that are still running (a second flow may start beside them). */
export function activeFlows(items) {
  return (items ?? []).filter((item) => ACTIVE_STATUSES.includes(item.status)).map(flowSummary)
}

/** Pairwise overlap report for every active flow. */
export function parallelOverview(items) {
  const active = activeFlows(items)
  const pairs = []
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const overlap = scopeOverlap(active[i].scope, active[j].scope)
      if (!overlap.length) continue
      pairs.push({
        a: active[i].id,
        b: active[j].id,
        overlap,
        reason: `两个流程都改了 ${overlap.join('、')}`,
      })
    }
  }
  const canParallel = active.length < 2 || pairs.length === 0
  const advice = !active.length
    ? '当前没有进行中的开发流程。'
    : active.length === 1
      ? `当前 1 个流程在开发中：${active[0].title}。`
      : pairs.length === 0
        ? `${active.length} 个流程并行安全：scope 互不重叠。所有 git 开发流程默认使用独立 git worktree（分支 devhub/<id>），变更/测试/提交互不影响；完成后合并回目标分支。`
        : `检测到 ${pairs.length} 处 scope 重叠：${pairs.map((pair) => `${pair.a} ↔ ${pair.b}（${pair.overlap.join('、')}）`).join('；')}。建议串行，或先把其中一个流程的 scope 拆开；相关流程默认使用独立 git worktree。`
  return { active, pairs, canParallel, advice }
}

/**
 * Check a scope that is about to start against the flows already on the board.
 * Every unfinished flow counts (a planned flow already claims its scope), so a
 * second flow over the same directory is flagged before any code is written.
 */
export function conflictsForScope(items, scope, { ignoreId } = {}) {
  const wanted = normalizeScope(scope)
  const conflicts = []
  for (const flow of occupyingFlows(items)) {
    if (ignoreId && flow.id === ignoreId) continue
    const overlap = scopeOverlap(wanted, flow.scope)
    if (overlap.length) conflicts.push({ id: flow.id, title: flow.title, status: flow.status, overlap })
  }
  return conflicts
}
