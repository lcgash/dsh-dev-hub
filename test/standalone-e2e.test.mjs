import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import test from 'node:test'

const FAKE_CLAUDE = `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === 'agents') {
  console.log(JSON.stringify([{ id: 'deadbeef-cafe-4000-8000-000000000001', sessionId: 'deadbeef-cafe-4000-8000-000000000001', state: 'blocked', cwd: process.cwd(), name: 'Fake Claude' }]))
} else if (args[0] === '--bg') {
  console.log('backgrounded · deadbeef-cafe-4000-8000-000000000001')
} else if (args[0] === '-p') {
  console.log(JSON.stringify({ result: JSON.stringify({ verdict: 'pass', summary: 'fake review pass' }) }))
} else {
  console.log('fake claude ok')
}
`

test('standalone E2E：Claude 开工 → bridge 回写 → 评审 → 自测 → 报告', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devhub-e2e-'))
  const home = join(root, 'home')
  const repo = join(root, 'repo')
  const binDir = join(root, 'bin')
  await Promise.all([mkdir(home, { recursive: true }), mkdir(binDir, { recursive: true }), mkdir(repo, { recursive: true })])
  const isWin = process.platform === 'win32'
  const fakeClaude = join(binDir, isWin ? 'claude.cmd' : 'claude')
  if (isWin) {
    // Windows 的 claude 通常是 .cmd：runExecutable / which 都必须走 cmd.exe。
    await writeFile(join(binDir, 'claude.js'), FAKE_CLAUDE)
    await writeFile(fakeClaude, '@echo off\r\nnode "%~dp0claude.js" %*\r\n')
  } else {
    await writeFile(fakeClaude, FAKE_CLAUDE, { mode: 0o755 })
  }
  execFileSync('git', ['init', '-q'], { cwd: repo })
  execFileSync('git', ['config', 'user.email', 'e2e@example.com'], { cwd: repo })
  execFileSync('git', ['config', 'user.name', 'E2E'], { cwd: repo })
  await writeFile(join(repo, 'app.js'), 'const a = 1\n')
  execFileSync('git', ['add', '.'], { cwd: repo })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: repo })

  // HostContext 的 PROFILE_DIR 是模块级常量：必须在 import 前设置。
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  const previousHome = process.env.DEVHUB_HOME
  const previousPath = process.env[pathKey]
  process.env.DEVHUB_HOME = home
  process.env[pathKey] = `${binDir}${delimiter}${previousPath ?? ''}`
  const { startStandaloneServer } = await import('../src/standalone/server.mjs')
  const instance = await startStandaloneServer({ port: 0 })
  const auth = { 'content-type': 'application/json', 'x-devhub-token': instance.token }
  async function call(path, body = null, method = 'GET') {
    const response = await fetch(`${instance.url}${path}`, {
      method,
      headers: auth,
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await response.json()
    assert.equal(response.status, 200, JSON.stringify(json))
    assert.equal(json.ok, true, JSON.stringify(json))
    return json
  }

  try {
    await call('/api/dev-hub/setup', { repoPath: repo, name: 'e2e' }, 'POST')
    await call('/api/dev-hub/wizard', { action: 'bootstrap' }, 'POST')
    const created = await call('/api/dev-hub/wizard', {
      action: 'create', entry: 'chat', description: '给 e2e 加一个函数', name: 'e2e flow', id: 'e2e-flow', scope: ['app.js'],
    }, 'POST')
    assert.equal(created.item.id, 'e2e-flow')
    await call('/api/dev-hub/start', { id: 'e2e-flow' }, 'POST')
    const context = await call('/api/dev-hub/context', { id: 'e2e-flow' }, 'POST')
    assert.match(context.context.folder, /\.dev-hub[/\\]context[/\\]e2e-flow$/)
    assert.match(context.context.indexPath, /00-INDEX\.md$/)

    const launched = await call('/api/dev-hub/claude', { id: 'e2e-flow', action: 'launch', prompt: 'fake prompt' }, 'POST')
    assert.equal(launched.sessionId, 'deadbeef-cafe-4000-8000-000000000001')
    assert.equal(launched.item.session.engine, 'claude')

    const sessions = await call('/api/dev-hub/sessions')
    assert.equal(sessions.sessions[0].blocked, true)
    assert.equal(sessions.sessions[0].running, false)

    const bridgeDir = join(home, 'claude-bridges')
    const bridges = (await readdir(bridgeDir)).filter((name) => name.endsWith('.json'))
    assert.ok(bridges.length > 0)
    const bridge = join(bridgeDir, bridges.sort().at(-1))
        // 必须异步执行：测试进程同时是 server，spawnSync 会阻塞事件循环导致 CLI 请求永远等不到响应。
    const updated = await new Promise((resolve, reject) => {
      execFile(process.execPath, [join(process.cwd(), 'bin', 'devhub.mjs'), 'update', '--bridge', bridge,
        '--task', 'fake claude 写了函数', '--done', '--change-point', '新增 e2e 函数'], {
        cwd: repo,
        env: { ...process.env, DEVHUB_HOME: home, [pathKey]: `${binDir}${delimiter}${previousPath ?? ''}` },
        encoding: 'utf8',
      }, (error, stdout, stderr) => {
        if (error) reject(new Error(`${error.message}\n${stderr ?? ''}`))
        else resolve({ stdout, stderr })
      })
    })
    assert.match(updated.stdout, /fake claude 写了函数/)
    const afterUpdate = await call('/api/dev-hub/item?id=e2e-flow')
    assert.ok(afterUpdate.item.tasks.some((task) => task.text === 'fake claude 写了函数' && task.done))
    assert.ok(afterUpdate.item.changePoints.some((point) => point.summary === '新增 e2e 函数'))

    const review = await call('/api/dev-hub/review', { id: 'e2e-flow', action: 'dispatch', count: 1 }, 'POST')
    assert.equal(review.review.status, 'passed')
    assert.equal(review.review.reviewers[0].engine, 'claude')

    const local = await call('/api/dev-hub/test', {
      id: 'e2e-flow', phase: 'local', command: 'node -e "process.exit(0)"',
    }, 'POST')
    assert.equal(local.item.workflow.tests.local.status, 'passed')
    assert.equal(local.item.workflow.stage, 'verify')

    const report = await call('/api/dev-hub/report?id=e2e-flow')
    assert.equal(typeof report.markdown, 'string')
    assert.match(report.markdown, /e2e flow/)
  } finally {
    await instance.close()
    if (previousHome === undefined) delete process.env.DEVHUB_HOME
    else process.env.DEVHUB_HOME = previousHome
    if (previousPath === undefined) delete process.env[pathKey]
    else process.env[pathKey] = previousPath
    await rm(root, { recursive: true, force: true })
  }
})
