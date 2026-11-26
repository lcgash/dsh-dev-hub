/**
 * deriveAttention 的判定顺序：这里是 attention 误报的唯一回归防线。
 *
 * 事故背景：绑定开发会话后（会话还在跑、任务没做完）曾无条件提示"可以跑本机自测"。
 * 下面按 task 要求的判定顺序逐条钉住，任何顺序调整都必须同步改这些用例。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveAttention } from '../src/core/attention.mjs'

function item(extra = {}) {
  return {
    id: 'x',
    title: 't',
    status: 'developing',
    tasks: [],
    workflow: { stage: 'develop', tests: {} },
    ...extra,
  }
}

function bound(extra = {}) {
  return item({ session: { id: 'session-1' }, ...extra })
}

test('done / blocked：完成不提示，阻塞优先于一切会话事实', () => {
  assert.equal(deriveAttention(item({ status: 'done', workflow: { stage: 'done', tests: {} } })), null)
  assert.deepEqual(
    deriveAttention(item({ status: 'blocked' }), { running: true, pendingQuestions: 3 }),
    { kind: 'blocked', label: '被阻塞', tone: 'danger' },
  )
})

test('会话在等你回答 / 等你授权：优先于 running 与测试提示', () => {
  const developing = bound({ tasks: [{ text: 'a', done: false }] })
  assert.deepEqual(
    deriveAttention(developing, { running: true, pendingQuestions: 1 }),
    { kind: 'question', label: '会话在等你回答', tone: 'warn' },
  )
  assert.deepEqual(
    deriveAttention(developing, { running: true, pendingApprovals: 1 }),
    { kind: 'approval', label: '等待你授权', tone: 'warn' },
  )
})

test('running：正在开发不打扰（即使会话已绑定、测试还没跑）', () => {
  assert.equal(deriveAttention(bound({ tasks: [] }), { running: true }), null)
  assert.equal(deriveAttention(bound({ tasks: [{ text: 'a', done: true }] }), { running: true }), null)
})

test('未绑定会话：先提示"还没开发会话"（早于本机自测失败）', () => {
  assert.deepEqual(
    deriveAttention(item({ workflow: { stage: 'develop', tests: {} } })),
    { kind: 'no-session', label: '还没开发会话', tone: 'neutral' },
  )
  assert.equal(
    deriveAttention(item({ workflow: { stage: 'develop', tests: { local: { status: 'failed' } } } })).kind,
    'no-session',
    '没绑定会话时不该先报测试失败',
  )
})

test('本机自测失败：已绑定会话时提示失败', () => {
  assert.deepEqual(
    deriveAttention(bound({ workflow: { stage: 'verify', tests: { local: { status: 'failed' } } } })),
    { kind: 'test-failed', label: '本机自测失败', tone: 'danger' },
  )
})

test('开发中不误报：任务没做完 / 没有任务 / 不在 develop 阶段都返回 null', () => {
  const idle = { running: false }
  // 开发会话空闲，但任务只做了一半
  assert.equal(
    deriveAttention(bound({ tasks: [{ text: 'a', done: true }, { text: 'b', done: false }] }), idle),
    null,
  )
  // 绑定会话后没有任何任务（旧逻辑在这里误报 ready-test）
  assert.equal(deriveAttention(bound({ tasks: [] }), idle), null)
  // 任务全做完，但阶段还在计划：也不能提示跑测试
  assert.equal(
    deriveAttention(bound({ workflow: { stage: 'plan', tests: {} }, tasks: [{ text: 'a', done: true }] }), idle),
    null,
  )
})

test('开发完成先评审：任务全部完成 + develop + 会话空闲 → ready-review（不是先跑测试）', () => {
  const ready = bound({ tasks: [{ text: 'a', done: true }, { text: 'b', done: true }] })
  assert.deepEqual(
    deriveAttention(ready, { running: false }),
    { kind: 'ready-review', label: '开发已完成：点「继续推进」开始评审', tone: 'accent' },
  )
  // 不传 facts 时默认 running=false，结论一致
  assert.equal(deriveAttention(ready).kind, 'ready-review')

  // 分析流程只读：任务完成即结束，不再提示跑测试/评审
  const analysis = bound({
    workflow: { stage: 'develop', intent: 'analysis', tests: {} },
    tasks: [{ text: 'a', done: true }],
  })
  assert.equal(deriveAttention(analysis), null)

  // 评审已通过、还没跑本机自测：此时才提示本机自测
  const reviewed = bound({
    workflow: { stage: 'verify', review: { reviewers: [{ status: 'passed', verdict: 'pass' }] }, tests: {} },
    tasks: [{ text: 'a', done: true }],
  })
  assert.deepEqual(deriveAttention(reviewed), { kind: 'ready-test', label: '可以跑本机自测', tone: 'accent' })
})

test('ready-review / ready-env / ready-submit：评审 → 环境测试 → 提交按阶段递进', () => {
  const localPassed = bound({ workflow: { stage: 'verify', tests: { local: { status: 'passed' } } } })
  assert.deepEqual(
    deriveAttention(localPassed),
    { kind: 'ready-review', label: '继续推进即开始评审', tone: 'accent' },
  )

  const reviewPassed = bound({
    workflow: { stage: 'verify', tests: { local: { status: 'passed' } }, review: { reviewers: [{ status: 'passed', verdict: 'pass' }] } },
  })
  assert.deepEqual(
    deriveAttention(reviewPassed),
    { kind: 'ready-env', label: '可以跑环境测试', tone: 'accent' },
  )

  const envPassed = bound({
    workflow: {
      stage: 'submit',
      tests: { local: { status: 'passed' }, environment: { status: 'passed' } },
      review: { reviewers: [{ status: 'passed', verdict: 'pass' }] },
    },
  })
  assert.deepEqual(
    deriveAttention(envPassed),
    { kind: 'ready-submit', label: '可以提交代码', tone: 'accent' },
  )

  // 环境通过且阶段已完成：不再需要处理
  assert.equal(
    deriveAttention(bound({
      workflow: {
        stage: 'done',
        tests: { local: { status: 'passed' }, environment: { status: 'passed' } },
        review: { reviewers: [{ status: 'passed', verdict: 'pass' }] },
      },
    })),
    null,
  )
})

test('纯函数：不修改 item，也不依赖调用顺序', () => {
  const source = bound({ tasks: [{ text: 'a', done: false }] })
  const snapshot = JSON.parse(JSON.stringify(source))
  deriveAttention(source, { running: true, pendingQuestions: 1 })
  assert.deepEqual(source, snapshot)
  assert.equal(source.attention, undefined)
})
