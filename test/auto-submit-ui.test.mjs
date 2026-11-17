import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('顶栏「提交并推送」是实际操作：自动取变更、生成提交信息、当前分支 push', async () => {
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  // advanceVerify 的 submit 阶段直接调用自动提交，而不是 setTab('test')
  assert.match(index, /submitCode\(\{ auto: true \}\)/)
  assert.match(index, /async function submitCode\(\{ pushOnly = false, auto = false \} = \{\}\)/)
  assert.match(index, /info\.suggestedPaths/)
  assert.match(index, /const prefix = draft\.workflow\?\.intent === 'bug' \? 'fix' : 'feat'/)
  assert.match(index, /没有检测到需要提交的变更/)
})

test('reviewAdvancePlan：验证都通过/跳过后按钮是「提交并推送」且带自动提交提示', async () => {
  const { reviewAdvancePlan } = await import('../src/core/review.mjs')
  const item = {
    id: 'x',
    title: 't',
    status: 'verifying',
    tasks: [{ text: 'a', done: true }],
    workflow: {
      stage: 'submit',
      intent: 'feature',
      plan: { summary: 'p', steps: ['a'], estimate: { size: 'S', days: 1 } },
      tests: { local: { status: 'passed' }, environment: { status: 'passed' } },
      review: { round: 1, reviewers: [{ id: 'reviewer-1', role: 'direction', status: 'passed', verdict: 'pass' }] },
    },
  }
  const advance = reviewAdvancePlan(item)
  assert.equal(advance.action, 'verify')
  assert.equal(advance.phase, 'submit')
  assert.equal(advance.label, '提交并推送')
  assert.match(advance.hint, /直接.*提交并推送/)
})
