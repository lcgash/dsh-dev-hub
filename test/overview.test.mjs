/**
 * 跨项目/多库项目的流程总览（「进行中」抽屉的数据源）。
 *
 * 事故背景：抽屉只看当前目标，用户在多个工作区都有进行中的流程时，
 * 切一次库才能看到另一边的流程，容易漏掉待处理项。这里钉住：
 * - /overview 汇总所有本机项目 + 多库项目；
 * - 每个 item 带 target（kind/path/workspaceId），前端据此切换；
 * - 多库项目流程归 workspace:<id>，不重复出现在成员库下面；
 * - current 标记随 activeRepo 变化。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'devhub-overview-home-'))
process.env.DEVHUB_HOME = home

const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')

async function tempRepo(name) {
  const dir = await mkdtemp(join(tmpdir(), `devhub-overview-${name}-`))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'README.md'), `# ${name}\n`, 'utf8')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

function fakeContext(repo) {
  const routes = new Map()
  const ctx = {
    webServer: { register(route) { routes.set(route.path, route); return () => {} } },
    sessions: { get(id) { return { header: { cwd: repo, id } } } },
    get(name) {
      if (name === 'tools') return { register() { return () => {} } }
      if (name === 'systemPrompt') return null
      return undefined
    },
    effect(fn) { fn(); return () => {} },
  }
  return { ctx, routes }
}

async function call(routes, path, { method = 'GET', body } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = path
  req.socket = { remoteAddress: '127.0.0.1' }
  const res = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {} },
    end(value) { this.body = String(value ?? '') },
  }
  const route = routes.get(path)
  assert.ok(route, `route missing: ${path}`)
  await route.handler(req, res)
  return { status: res.status, body: JSON.parse(res.body) }
}

async function createFlow(routes, id, scope = ['README.md']) {
  const created = await call(routes, API.wizard, {
    method: 'POST',
    body: { action: 'create', entry: 'chat', description: `${id} 的流程`, id, scope },
  })
  assert.equal(created.status, 200, JSON.stringify(created.body).slice(0, 300))
  return created.body.item
}

test('overview：汇总所有项目与多库项目的流程，并给出可切换的 target', async () => {
  const repoA = await tempRepo('a')
  const repoB = await tempRepo('b')
  const realA = await realpath(repoA)
  const realB = await realpath(repoB)
  const { ctx, routes } = fakeContext(repoA)
  try {
    apply(ctx)
    // 项目 A：setup + 一条流程
    const setupA = await call(routes, API.setup, { method: 'POST', body: { repoPath: realA, name: '张三' } })
    assert.equal(setupA.status, 200)
    await createFlow(routes, 'flow-a')
    // 切到项目 B：setup + 一条流程（当前目标变成 B）
    const setupB = await call(routes, API.setup, { method: 'POST', body: { repoPath: realB, name: '张三' } })
    assert.equal(setupB.status, 200)
    await createFlow(routes, 'flow-b')

    const first = await call(routes, API.overview)
    assert.equal(first.status, 200)
    const over = first.body
    assert.equal(over.activeTarget, realB)
    assert.equal(over.targetCount, 2, '两个项目各算一个目标')
    assert.ok(over.inProgressCount >= 2)
    const ids = over.items.map((item) => item.id)
    assert.ok(ids.includes('flow-a') && ids.includes('flow-b'), '跨库流程都要出现')
    const itemA = over.items.find((item) => item.id === 'flow-a')
    const itemB = over.items.find((item) => item.id === 'flow-b')
    assert.equal(itemA.target.kind, 'repo')
    assert.equal(itemA.target.path, realA)
    assert.equal(itemA.target.current, false)
    assert.equal(itemB.target.path, realB)
    assert.equal(itemB.target.current, true)
    const groupA = over.groups.find((group) => group.key === `repo:${realA}`)
    const groupB = over.groups.find((group) => group.key === `repo:${realB}`)
    assert.ok(groupA && groupB)
    assert.equal(groupB.current, true)
    assert.equal(groupA.current, false)
    assert.equal(groupA.kind, 'repo')
    assert.ok(groupA.inProgress >= 1)

    // 建多库项目 [A,B]：流程 C 落多库项目本机台账（不落任何成员库），归到 workspace 目标，不重复出现在 repoA 下面
    const created = await call(routes, API.workspaces, {
      method: 'POST',
      body: { name: '前后端组合', repos: [realA, realB] },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body).slice(0, 500))
    const workspaceId = created.body.workspace.id
    assert.equal(created.body.state.activeTarget, `workspace:${workspaceId}`)
    // 多库项目入口要求 scope 带成员库前缀（成员库平权）
    const memberNames = (created.body.state.workspace.members ?? []).map((member) => member.name)
    await createFlow(routes, 'flow-c', memberNames.map((name) => `${name}:README.md`))

    const second = await call(routes, API.overview)
    const secondBody = second.body
    assert.equal(secondBody.activeTarget, `workspace:${workspaceId}`)
    const itemC = secondBody.items.find((item) => item.id === 'flow-c')
    assert.equal(itemC.target.kind, 'workspace')
    assert.equal(itemC.target.workspaceId, workspaceId)
    assert.equal(itemC.target.current, true)
    const wsGroup = secondBody.groups.find((group) => group.key === `workspace:${workspaceId}`)
    assert.ok(wsGroup, '多库项目流程要归到 workspace 目标')
    assert.equal(wsGroup.kind, 'workspace')
    assert.equal(wsGroup.current, true)
    assert.ok(wsGroup.inProgress >= 1)
    assert.ok(wsGroup.path.includes('workspaces'), `多库项目目标路径应是本机独立目录：${wsGroup.path}`)
    assert.equal(itemC.target.path, wsGroup.path)
    // 成员库没有被多库项目流程污染（流程台账只在本机多库项目目录）
    await assert.rejects(() => stat(join(realA, '.dev-hub/items/flow-c.json')))
    await assert.rejects(() => stat(join(realB, '.dev-hub/items/flow-c.json')))
    const repoAItems = secondBody.items.filter((item) => item.target.key === `repo:${realA}`).map((item) => item.id)
    assert.deepEqual(repoAItems, ['flow-a'], '多库项目流程不能重复算到主库')
    // 头部计数来自全量 items
    assert.equal(secondBody.inProgressCount, secondBody.items.filter((item) => item.status !== 'done').length)
    assert.ok(secondBody.attentionCount >= 0)

    // 切回项目 A：current 标记立刻跟着变
    const switched = await call(routes, API.switchRepo, { method: 'POST', body: { repoPath: realA, name: '张三', detect: false } })
    assert.equal(switched.status, 200, JSON.stringify(switched.body).slice(0, 300))
    const third = await call(routes, API.overview)
    assert.equal(third.body.activeTarget, realA)
    assert.equal(third.body.groups.find((group) => group.key === `repo:${realA}`).current, true)
    assert.equal(third.body.groups.find((group) => group.key === `workspace:${workspaceId}`).current, false)
    assert.equal(third.body.items.find((item) => item.id === 'flow-c').target.current, false)
  } finally {
    await rm(repoA, { recursive: true, force: true })
    await rm(repoB, { recursive: true, force: true })
  }
})
