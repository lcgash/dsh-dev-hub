import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'devhub-sync-home-'))
process.env.DEVHUB_HOME = home

const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')
const { syncRepo } = await import('../src/core/git.mjs')

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args]).toString().trim()
}

function configure(dir) {
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'Test'])
}

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-sync-repo-'))
  git(dir, ['init', '-q'])
  configure(dir)
  await writeFile(join(dir, 'README.md'), '# demo\n', 'utf8')
  git(dir, ['add', '.'])
  git(dir, ['commit', '-qm', 'init'])
  return dir
}

function fakeContext(repo) {
  const routes = new Map()
  const ctx = {
    webServer: { register(route) { routes.set(route.path, route); return () => {} } },
    sessions: { get() { return { header: { cwd: repo } } } },
    get(name) {
      if (name === 'tools') return { register() { return () => {} } }
      if (name === 'systemPrompt') return null
      return undefined
    },
    effect(fn) { fn(); return () => {} },
  }
  return { ctx, routes }
}

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
  await routes.get(path).handler(req, res)
  return { status: res.status, body: JSON.parse(res.body) }
}

test('syncRepo：fetch + ff-only 合并远端新提交', async () => {
  const remote = await mkdtemp(join(tmpdir(), 'devhub-sync-remote-'))
  const repo = await tempRepo()
  const other = await mkdtemp(join(tmpdir(), 'devhub-sync-other-'))
  try {
    git(remote, ['init', '--bare', '-q'])
    git(repo, ['remote', 'add', 'origin', remote])
    git(repo, ['push', '-u', 'origin', 'HEAD'])
    git(other, ['clone', '-q', remote, '.'])
    configure(other)
    await writeFile(join(other, 'remote.txt'), 'remote change\n', 'utf8')
    git(other, ['add', '.'])
    git(other, ['commit', '-qm', 'remote change'])
    git(other, ['push', '-q', 'origin', 'HEAD'])
    const remoteHead = git(other, ['rev-parse', '--short', 'HEAD'])

    const result = await syncRepo(repo)
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(result.updated, true)
    assert.equal(result.after, remoteHead)
    assert.ok(result.upstream.includes('origin/'))
  } finally {
    for (const dir of [remote, repo, other]) await rm(dir, { recursive: true, force: true })
  }
})

test('sync 路由：开发前对主仓库执行 fetch/ff-only，返回逐库结果', async () => {
  const remote = await mkdtemp(join(tmpdir(), 'devhub-sync-route-remote-'))
  const repo = await tempRepo()
  const other = await mkdtemp(join(tmpdir(), 'devhub-sync-route-other-'))
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    git(remote, ['init', '--bare', '-q'])
    git(repo, ['remote', 'add', 'origin', remote])
    git(repo, ['push', '-u', 'origin', 'HEAD'])
    git(other, ['clone', '-q', remote, '.'])
    configure(other)
    await writeFile(join(other, 'next.txt'), 'next\n', 'utf8')
    git(other, ['add', '.'])
    git(other, ['commit', '-qm', 'next'])
    git(other, ['push', '-q', 'origin', 'HEAD'])

    const synced = await call(routes, API.sync, { method: 'POST', body: {} })
    assert.equal(synced.status, 200, JSON.stringify(synced.body))
    assert.equal(synced.body.ok, true, JSON.stringify(synced.body))
    assert.equal(synced.body.repos.length, 1)
    assert.equal(synced.body.repos[0].updated, true)
    assert.equal(synced.body.repos[0].after, git(other, ['rev-parse', '--short', 'HEAD']))
  } finally {
    for (const dir of [remote, repo, other]) await rm(dir, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})
