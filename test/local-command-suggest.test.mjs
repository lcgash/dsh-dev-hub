/**
 * 「用一句话生成本机命令」的 Host 回归：
 *
 * 线上错误：Cannot read properties of undefined (reading 'id')
 * 根因：runAgentJson 把任务参数包在 startActivation spec 的 request 里，
 * 而 DSH 的 SubagentActivationSpec 是平铺的，鉴权时读 spec.parent.id 直接 TypeError。
 * 这个用例从路由层完整走一遍 suggest-local-command，避免只测到纯函数。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'devhub-local-cmd-home-'))
process.env.DEVHUB_HOME = home

const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-local-cmd-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'README.md'), '# demo\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

function fakeContext() {
  const routes = new Map()
  const state = { startSpec: null, createdId: null }
  const ctx = {
    webServer: { register(route) { routes.set(route.path, route); return () => {} } },
    sessions: { get() { return null }, list() { return [] } },
    get(name) {
      if (name === 'agents') {
        return {
          create: async (options) => {
            state.createdId = options.sessionId
            return { agent: { id: options.sessionId }, dispose: async () => {} }
          },
        }
      }
      if (name === 'subagents') {
        return {
          list: () => ['spawn'],
          getProvider: () => ({ capabilities: { agentPreset: true, outputSchema: true } }),
          startActivation: async (spec) => {
            // 与 DSH 实现一致：parent 必须在 spec 顶层，否则这里会抛 reading 'id'
            assert.equal(spec.parent.id, state.createdId)
            assert.equal(spec.request, undefined)
            state.startSpec = spec
            return {
              result: Promise.resolve({
                stopReason: 'completed',
                structured: {
                  command: '```sh\nkpipe-dev deploy --local\n```',
                  explanation: '用 kpipe-dev 把服务部署到本机环境',
                  caveats: ['需要先登录'],
                },
              }),
              dispose: async () => {},
            }
          },
        }
      }
      return undefined
    },
    effect(fn) { fn(); return () => {} },
  }
  return { ctx, routes, state }
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

test('suggest-local-command：通过子代理生成命令，不再因 spec.parent 缺失崩溃', async () => {
  const repo = await tempRepo()
  const { ctx, routes, state } = fakeContext()
  try {
    apply(ctx)
    const setup = await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    assert.equal(setup.status, 200, JSON.stringify(setup.body).slice(0, 300))

    const result = await call(routes, API.project, {
      method: 'POST',
      body: {
        action: 'suggest-local-command',
        phase: 'environmentTest',
        description: '本机用 kpipe-dev 把服务部署到本机环境，再 curl 健康检查',
      },
    })
    assert.equal(result.status, 200, JSON.stringify(result.body).slice(0, 500))
    assert.equal(result.body.command, 'kpipe-dev deploy --local', '多行代码块要收敛成一条命令')
    assert.equal(result.body.phase, 'environmentTest')
    assert.match(result.body.explanation, /kpipe-dev/)
    assert.deepEqual(result.body.caveats, ['需要先登录'])
    assert.ok(result.body.probe, '要带本机探测结果')
    // 子代理收到的 prompt 包含用户原话与阶段
    assert.match(state.startSpec.prompt[0].text, /kpipe-dev/)
    assert.match(state.startSpec.prompt[0].text, /环境测试/)
  } finally {
    const profile = await readFile(join(home, 'profile.json'), 'utf8').catch(() => '')
    assert.ok(profile || true)
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})
