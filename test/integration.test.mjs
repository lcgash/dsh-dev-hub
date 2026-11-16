import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { createElement as h } from 'react'

const home = await mkdtemp(join(tmpdir(), 'devhub-int-home-'))
process.env.DEVHUB_HOME = home

const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')
const { HomeView } = await import('../src/client/home.mjs')
const { NewFlowWizard } = await import('../src/client/wizard.mjs')

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-int-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'pom.xml'), '<project/>\n', 'utf8')
  await mkdir(join(dir, 'src/main/java/com/gitee/pipeline/source'), { recursive: true })
  await writeFile(join(dir, 'src/main/java/com/gitee/pipeline/source/Source.java'), 'class Source {}\n', 'utf8')
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

async function call(routes, path, { method = 'GET', body } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = path
  req.socket = { remoteAddress: '127.0.0.1' }
  const res = {
    status: 0,
    body: '',
    writeHead(status) { this.status = status },
    end(value) { this.body = String(value ?? '') },
  }
  await routes.get(path).handler(req, res)
  return { status: res.status, body: JSON.parse(res.body) }
}

/** The two halves must agree on the wire shape: Host payload -> Client render. */
test('integration: Host 返回的 state/items/parallel 能直接驱动 Client 首页渲染', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', description: 'source 补 webhook', id: 'source-webhook', scope: ['src/main/java/com/gitee/pipeline/source'] },
    })
    // 进行中由「绑定开发会话」这一事实推导，不再手改 status
    await call(routes, API.session, { method: 'POST', body: { action: 'bind', id: 'source-webhook', sessionId: 'session-x' } })

    const state = await call(routes, API.state)
    const items = await call(routes, API.items)
    const parallel = await call(routes, API.parallel)

    assert.equal(state.body.firstRun, false)
    assert.ok(state.body.conventions.constraints > 0)
    assert.equal(items.body.items[0].scope[0], 'src/main/java/com/gitee/pipeline/source')

    const page = renderToStaticMarkup(h(HomeView, {
      state: state.body,
      items: items.body.items,
      parallel: parallel.body,
      onOpenItem() {}, onRefresh() {}, onSwitchRepo() {}, onAddRepo() {},
      onScan() {}, onNewFlow() {}, onQuickCreate() {},
    }))
    assert.match(page, /source 补 webhook/)
    assert.match(page, /开发中/)
    assert.match(page, /并行开发/)
    assert.match(page, /source/)
    assert.match(page, /张三/)

    const wizard = renderToStaticMarkup(h(NewFlowWizard, { repo: state.body.repo, onClose() {}, onCreated() {} }))
    assert.match(wizard, /新建开发流程/)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})
