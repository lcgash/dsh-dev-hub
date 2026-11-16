/**
 * 重新开发回退：本机自测通过后代码/诉求又变了，流程必须回到「开发中」。
 *
 * 事故背景：第一次自测通过后阶段停在「测试验证」；用户改诉求、会话继续改代码，
 * 旧测试结果仍显示通过，阶段再也不回去。这里用测试时盖的代码指纹 + 验证基线哈希判定过期。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'devhub-rework-home-'))
process.env.DEVHUB_HOME = home

const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-rework-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'README.md'), '# demo\n', 'utf8')
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

async function call(routes, path, { method = 'GET', body, queryParams } = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(queryParams ?? {})) params.set(key, String(value))
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = params.size ? `${path}?${params.toString()}` : path
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

test('rework：自测通过后改代码/改诉求 → 阶段回到 develop；重跑自测后恢复', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '重新开发回退验证', id: 'rework-flow', scope: ['README.md'] },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body).slice(0, 300))
    // 让自测可重复、无副作用
    const commands = await call(routes, API.project, { method: 'POST', body: { commands: { localTest: 'true' } } })
    assert.equal(commands.status, 200)

    const passed = await call(routes, API.test, { method: 'POST', body: { id: 'rework-flow', phase: 'local' } })
    assert.equal(passed.status, 200, JSON.stringify(passed.body).slice(0, 300))
    assert.equal(passed.body.result.status, 'passed')
    assert.ok(passed.body.result.basisHash, '测试通过时要记录验证基线哈希')
    assert.ok(Array.isArray(passed.body.result.codeState) && passed.body.result.codeState.length, '测试通过时要记录代码指纹')

    // 代码又改了：下一次 /state 应判定过期并回到开发中
    await writeFile(join(repo, 'README.md'), '# demo\n\nchanged after test\n', 'utf8')
    const stale = await call(routes, API.state)
    const staleItem = (stale.body.items ?? []).find((item) => item.id === 'rework-flow')
    assert.ok(staleItem, '流程仍在列表里')
    assert.equal(staleItem.stage, 'develop', '测试通过后代码变化 → 回到开发中')
    assert.equal(staleItem.status, 'developing')
    const detail = await call(routes, API.item, { queryParams: { id: 'rework-flow' } })
    assert.equal(detail.body.item.workflow.stage, 'develop')
    assert.match(detail.body.item.workflow.stageReason, /重新|回到开发/)
    assert.ok(detail.body.item.workflow.rework?.at)
    assert.equal(detail.body.item.workflow.tests.local.stale, true, '旧本机自测结论标记为过期')
    assert.ok((detail.body.item.history ?? []).some((entry) => entry.type === 'rework'))

    // 过期后不能直接跑环境测试，必须先重跑本机自测
    const blocked = await call(routes, API.test, { method: 'POST', body: { id: 'rework-flow', phase: 'environment' } })
    assert.equal(blocked.status, 400)
    assert.match(blocked.body.error, /重跑本机自测/)

    // 重跑本机自测：清掉重新开发标记，阶段恢复（无评审 → 进入独立评审）
    const rerun = await call(routes, API.test, { method: 'POST', body: { id: 'rework-flow', phase: 'local' } })
    assert.equal(rerun.status, 200, JSON.stringify(rerun.body).slice(0, 300))
    assert.equal(rerun.body.item.workflow.rework, null)
    assert.equal(rerun.body.item.workflow.tests.local.stale, false)
    assert.equal(rerun.body.item.workflow.stage, 'review', '重跑自测后不再停在开发中')
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('rework：不改代码、只改诉求/计划也会让旧测试过期', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: '改诉求也回退', id: 'basis-flow', scope: ['README.md'] },
    })
    await call(routes, API.project, { method: 'POST', body: { commands: { localTest: 'true' } } })
    const passed = await call(routes, API.test, { method: 'POST', body: { id: 'basis-flow', phase: 'local' } })
    assert.equal(passed.status, 200)

    // 只改计划摘要（代表诉求/范围变化），代码指纹不变
    const changed = await call(routes, API.workflow, {
      method: 'POST',
      body: { id: 'basis-flow', workflow: { plan: { summary: '范围扩大：不再只改 README', steps: ['改 README', '补测试'] } } },
    })
    assert.equal(changed.status, 200, JSON.stringify(changed.body).slice(0, 300))

    const stale = await call(routes, API.state)
    const item = (stale.body.items ?? []).find((entry) => entry.id === 'basis-flow')
    assert.equal(item.stage, 'develop', '诉求/计划变化后旧测试过期，回到开发中')
    const detail = await call(routes, API.item, { queryParams: { id: 'basis-flow' } })
    assert.equal(detail.body.item.workflow.tests.local.stale, true)
    assert.ok(detail.body.item.workflow.rework?.at)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})
