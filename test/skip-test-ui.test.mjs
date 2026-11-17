import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('测试跳过：测试卡片有跳过入口、原因入库，并明确会进报告', async () => {
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /skip: true/)
  assert.match(index, /skipReason/)
  assert.match(index, /确认跳过/)
  assert.match(index, /跳过原因（会写进开发报告；建议写清楚为什么）/)
  assert.match(index, /报告会标注/)
  assert.match(index, /status === 'skipped' \? '重新运行'/)
})

test('跳过测试：阶段/报告/下一步都按"跳过不等于通过"处理', async () => {
  const { deriveStage } = await import('../src/core/stage.mjs')
  const { buildReport } = await import('../src/core/report.mjs')
  const base = {
    id: 'skip-ui',
    title: '跳过测试',
    status: 'done',
    acceptance: ['ok'],
    tasks: [{ text: 'a', done: true }],
    workflow: {
      stage: 'done',
      intent: 'feature',
      plan: { summary: 'p', steps: ['a'], estimate: { size: 'S', days: 1 } },
      tests: { local: { status: 'skipped', skipReason: '依赖不可用' }, environment: { status: 'skipped', skipReason: '只改文档' } },
      review: { round: 1, reviewers: [{ id: 'reviewer-1', role: 'direction', status: 'passed', verdict: 'pass', summary: 'ok' }] },
      submission: { status: 'pushed', branch: 'main', commit: 'abc1234', pushed: true, at: '2026-11-17T00:00:00.000Z', message: 'done' },
    },
  }
  assert.equal(deriveStage(base).stage, 'done')
  const report = buildReport({ item: base, files: null, git: { isRepo: false, reason: 'x' }, generatedAt: '2026-11-17T00:00:00.000Z' })
  assert.match(report.verdictReason, /测试人工跳过/)
})
