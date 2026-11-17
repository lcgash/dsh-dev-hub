import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSessionCatalog, SESSION_CATEGORIES } from '../src/host/session-catalog.mjs'

const repo = '/work/demo'
const workspaceRoot = '/Users/me/.dev-hub/workspaces/ws-1'

function header(id, extra = {}) {
  return { version: 4, id, createdAt: 1000, isSeeded: false, cwd: repo, ...extra }
}

function snapshot(id, extra = {}, meta = {}) {
  return { header: header(id, extra), eventCount: 3, ...meta }
}

test('session-catalog：开发/评审/扫描/澄清/内部/未绑定/其他分类', () => {
  const snapshots = [
    snapshot('session-dev', { parentSession: undefined }, { eventCount: 12 }),
    snapshot('session-review', { parentSession: 'devhub-reviewer-a', origin: 'subagent', delegationDepth: 1 }),
    snapshot('devhub-reviewer-a', { origin: undefined }),
    snapshot('devhub-scan-a', {}),
    snapshot('session-scan-child', { parentSession: 'devhub-scan-a', origin: 'subagent', delegationDepth: 1 }),
    snapshot('devhub-clarify-a', {}),
    snapshot('devhub-assist-a', {}),
    snapshot('session-unbound', {}),
    snapshot('session-other', { cwd: '/tmp/elsewhere' }),
  ]
  const items = [{
    item: {
      id: 'flow-1',
      title: '打开登录入口',
      session: { id: 'session-dev' },
      workflow: { review: { reviewers: [{ id: 'reviewer-1', label: '安全审核员', status: 'passed', verdict: 'pass', sessionId: 'session-review' }] } },
    },
    repoPath: repo,
    repoName: 'demo',
  }]
  const workspace = { workspaceId: 'ws-1', title: 'demo', path: repo, sessionIds: ['session-dev', 'session-review'] }
  const liveStates = new Map([['session-dev', { running: true, turns: 3, lastText: '正在改代码' }]])
  const liveSessions = new Map([['session-dev', { snapshotEvents: () => [{ type: 'user/message', data: { message: { content: [{ type: 'text', text: '给登录页加重试' }] } } }] }]])
  const catalog = buildSessionCatalog({
    snapshots,
    liveStates,
    liveSessions,
    items,
    workspaces: [workspace],
    roots: [repo, workspaceRoot],
    archived: ['session-other'],
    pinned: ['session-dev'],
  })

  const byId = new Map(catalog.sessions.map((row) => [row.id, row]))
  assert.equal(byId.get('session-dev').category, 'development')
  assert.equal(byId.get('session-dev').title, '打开登录入口')
  assert.equal(byId.get('session-dev').running, true)
  assert.equal(byId.get('session-dev').pinned, true)
  assert.equal(byId.get('session-dev').visible, true)

  assert.equal(byId.get('session-review').category, 'review')
  assert.equal(byId.get('session-review').reviewer?.label, '安全审核员')
  assert.match(byId.get('session-review').title, /评审 · 打开登录入口/)

  // 有子代理的内部 root 外壳被隐藏，只保留真正干活的 child
  assert.equal(byId.has('devhub-scan-a'), false)
  assert.equal(byId.get('session-scan-child').category, 'scan')
  assert.match(byId.get('session-scan-child').title, /扫描 · demo/)

  assert.equal(byId.get('devhub-clarify-a').category, 'clarify')
  assert.equal(byId.get('devhub-assist-a').category, 'internal')
  assert.equal(byId.get('session-unbound').category, 'unbound')
  assert.equal(byId.get('session-other').category, 'other')
  assert.equal(byId.get('session-other').archived, true)

  assert.deepEqual(SESSION_CATEGORIES.map((entry) => entry.id), ['development', 'review', 'scan', 'clarify', 'internal', 'unbound', 'other'])
  assert.deepEqual(catalog.categories.map((entry) => entry.id), SESSION_CATEGORIES.map((entry) => entry.id))
  assert.equal(catalog.counts.development, 1)
  assert.equal(catalog.counts.review, 1)
  assert.equal(catalog.counts.scan, 1)
  assert.equal(catalog.counts.clarify, 1)
})
