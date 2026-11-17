import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'devhub-sessions-home-'))
process.env.DEVHUB_HOME = home
const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')
const { loadProfile, saveProfile, saveItem } = await import('../src/core/store.mjs')

function fakeResponse() {
  return {
    status: 0,
    body: '',
    writeHead(status) { this.status = status },
    end(body) { this.body = String(body ?? '') },
  }
}

async function call(routes, path, { method = 'GET', body } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = path
  req.socket = { remoteAddress: '127.0.0.1' }
  const res = fakeResponse()
  await routes.get(path.split('?')[0]).handler(req, res)
  return { status: res.status, body: JSON.parse(res.body) }
}

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-sessions-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'README.md'), '# demo\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

function header(id, cwd, extra = {}) {
  return { version: 4, id, createdAt: 1_700_000_000_000, isSeeded: false, cwd, ...extra }
}

test('会话管理：按开发/评审/扫描/澄清分类，支持归档/置顶/放入 Workspace', async () => {
  const repo = await tempRepo()
  const routes = new Map()
  const snapshots = [
    { header: header('session-dev', repo), eventCount: 10, sizeBytes: 2048 },
    { header: header('devhub-reviewer-1', repo), eventCount: 2 },
    { header: header('session-review', repo, { parentSession: 'devhub-reviewer-1', origin: 'subagent', delegationDepth: 1 }), eventCount: 6 },
    { header: header('devhub-scan-1', repo), eventCount: 1 },
    { header: header('session-scan', repo, { parentSession: 'devhub-scan-1', origin: 'subagent', delegationDepth: 1 }), eventCount: 4 },
    { header: header('devhub-clarify-1', repo), eventCount: 3 },
    { header: header('session-other', '/tmp/other'), eventCount: 1 },
  ]
  const devSession = {
    id: 'session-dev',
    header: header('session-dev', repo),
    seq: 10,
    snapshotEvents: () => [
      { type: 'user/message', data: { message: { content: [{ type: 'text', text: '给登录加失败重试' }] } } },
      { type: 'turn/start', data: { turn: 1 } },
    ],
  }
  const archived = new Set()
  const pinned = new Set()
  const attached = new Set(['session-dev'])
  const registry = {
    list: () => [{
      id: 'ws-1', path: repo, title: 'demo', sessionIds: [...attached], createdAt: 'x', updatedAt: 'y',
    }],
    archiveSession: async (id) => { archived.add(id) },
    unarchiveSession: async (id) => { archived.delete(id) },
    pinSession: async (id) => { pinned.add(id) },
    unpinSession: async (id) => { pinned.delete(id) },
    create: async (path, title) => ({
      id: 'ws-2', path, title, sessionIds: [],
      attachSession: async (id) => { attached.add(id) },
    }),
  }
  const controller = {
    follow: async function* () {
      yield {
        type: 'baseline',
        value: {
          items: [{ workspaceId: 'ws-1', path: repo, title: 'demo', sessionIds: [...attached], createdAt: 'x', updatedAt: 'y' }],
          archivedSessionIds: [...archived],
          pinnedSessionIds: [...pinned],
        },
      }
    },
  }
  const ctx = {
    webServer: { register(route) { routes.set(route.path, route); return () => {} } },
    sessions: { get: (id) => (id === 'session-dev' ? devSession : undefined), list: () => [devSession] },
    agents: { get: () => undefined },
    sessionPersistence: {
      list: async () => snapshots,
      stat: async (id) => snapshots.find((s) => s.header.id === id),
      open: async () => ({
        eventCount: 2,
        read: async () => ({
          events: [
            { type: 'user/message', time: 1, data: { message: { content: [{ type: 'text', text: '给登录加失败重试' }] } } },
            { type: 'assistant/message', time: 2, data: { message: { content: [{ type: 'text', text: '已经补上重试和退避。' }] } } },
          ],
        }),
        close: async () => {},
      }),
    },
    workspaceRegistry: registry,
    get(name) {
      if (name === 'webServer') return this.webServer
      if (name === 'sessions') return this.sessions
      if (name === 'agents') return this.agents
      if (name === 'sessionPersistence') return this.sessionPersistence
      if (name === 'workspaceRegistry') return this.workspaceRegistry
      if (name === 'workspaceController') return controller
      if (name === 'tools') return { register() { return () => {} } }
      if (name === 'systemPrompt') return null
      return undefined
    },
    effect(fn) { return fn() },
  }
  try {
    // 让会话管理扫描到一条绑定流程
    const profile = await loadProfile()
    profile.repos = { [repo]: { member: '测试', environment: null, updatedAt: new Date().toISOString() } }
    await saveProfile(profile)
    await saveItem(repo, {
      id: 'flow-dev', title: '登录失败重试', status: 'developing',
      session: { id: 'session-dev' },
      workflow: {
        review: { reviewers: [{ id: 'reviewer-1', label: '安全审核员', status: 'passed', verdict: 'pass', sessionId: 'session-review' }] },
        clarifySessions: ['devhub-clarify-1'],
        scanSessions: ['session-scan'],
      },
    })
    apply(ctx)
    // 重新应用后使用带 workspace 的 registry（apply 不依赖这些服务）
    const catalog = await call(routes, API.managedSessions)
    assert.equal(catalog.status, 200, JSON.stringify(catalog.body).slice(0, 300))
    const byId = new Map(catalog.body.sessions.map((row) => [row.id, row]))
    assert.equal(byId.get('session-dev').category, 'development')
    assert.equal(byId.get('session-dev').title, '登录失败重试')
    assert.equal(byId.get('session-dev').workspace?.id, 'ws-1')
    assert.equal(byId.get('session-review').category, 'review')
    assert.equal(byId.has('devhub-reviewer-1'), false, '内部 root 有子会话时隐藏')
    assert.equal(byId.get('session-scan').category, 'scan')
    assert.equal(byId.has('devhub-scan-1'), false)
    assert.equal(byId.get('devhub-clarify-1').category, 'clarify')
    assert.equal(byId.has('session-other'), false, '外部 DSH 会话不进入工作站管理页')
    assert.equal((catalog.body.categories ?? []).some((entry) => entry.id === 'other' || entry.id === 'unbound'), false)
    // 项目自动拥有一个 DSH Workspace（扫描/澄清等同 cwd 会话会 attach）
    assert.ok(Array.isArray(catalog.body.projectWorkspaces) && catalog.body.projectWorkspaces.length >= 1)
    assert.equal(catalog.body.projectWorkspaces[0].path, repo)
    // 项目 → 需求 → 开发/评审/澄清/扫描
    const project = (catalog.body.projects ?? []).find((entry) => entry.path === repo)
    assert.ok(project, JSON.stringify(catalog.body.projects))
    const flow = project.requirements.find((entry) => entry.id === 'flow-dev')
    assert.ok(flow, JSON.stringify(project.requirements))
    assert.equal(flow.counts.development, 1)
    assert.equal(flow.counts.review, 1)
    assert.equal(flow.counts.clarify, 1)
    assert.equal(flow.counts.scan, 1)
    assert.equal(flow.sessions.development[0].id, 'session-dev')
    assert.equal(flow.sessions.review[0].id, 'session-review')

    // 归档 + 置顶
    const archivedRes = await call(routes, API.managedSessions, { method: 'POST', body: { action: 'archive', sessionId: 'devhub-clarify-1' } })
    assert.equal(archivedRes.status, 200, JSON.stringify(archivedRes.body).slice(0, 300))
    assert.equal(archivedRes.body.catalog.sessions.find((row) => row.id === 'devhub-clarify-1').archived, true)
    const pinnedRes = await call(routes, API.managedSessions, { method: 'POST', body: { action: 'pin', sessionId: 'session-dev' } })
    assert.equal(pinnedRes.body.catalog.sessions.find((row) => row.id === 'session-dev').pinned, true)

    // 历史会话也能展开对话（从 sessionPersistence 读）
    const transcript = await call(routes, `${API.sessionTranscript}?sessionId=devhub-clarify-1&limit=10`)
    assert.equal(transcript.status, 200, JSON.stringify(transcript.body).slice(0, 300))
    assert.equal(transcript.body.persisted, true)
    assert.equal(transcript.body.messages.length, 2)
    assert.match(transcript.body.messages[1].text, /补上重试/)
    // reveal 仍保留给其他入口使用（页面不再展示“放入 Workspace”按钮）
    const revealed = await call(routes, API.managedSessions, { method: 'POST', body: { action: 'reveal', sessionId: 'devhub-clarify-1', title: '澄清任务' } })
    assert.equal(revealed.status, 200, JSON.stringify(revealed.body).slice(0, 300))
    assert.equal(revealed.body.results[0].workspace.title, '澄清任务')
    assert.ok(attached.has('devhub-clarify-1'))
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})
