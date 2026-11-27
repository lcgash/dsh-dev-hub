import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const run = promisify(execFile)
const BIN = new URL('../bin/devhub.mjs', import.meta.url).pathname

async function startBridgeServer() {
  const requests = []
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      requests.push({ url: req.url, token: req.headers['x-devhub-token'], body: raw ? JSON.parse(raw) : null })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, item: { id: 'flow-1', title: '桥测试' } }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return { server, requests, url: `http://127.0.0.1:${port}` }
}

test('bridge CLI：DevHub 换端口后从 runtime.json 重试并回写 bridge 地址', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devhub-bridge-cli-'))
  const profile = join(root, 'profile')
  const bridgePath = join(profile, 'claude-bridges', 'flow.json')
  const runtimePath = join(profile, 'runtime.json')
  const { server, requests, url } = await startBridgeServer()
  try {
    await mkdir(join(profile, 'claude-bridges'), { recursive: true })
    await writeFile(bridgePath, JSON.stringify({ url: 'http://127.0.0.1:1', token: 'tok-1', itemId: 'flow-1' }), 'utf8')
    await writeFile(runtimePath, JSON.stringify({ url, updatedAt: new Date().toISOString() }), 'utf8')
    const result = await run(process.execPath, [BIN, 'get', '--bridge', bridgePath], { env: { ...process.env, DEVHUB_HOME: profile } })
    assert.match(result.stdout, /flow-1/)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].token, 'tok-1')
    assert.deepEqual(requests[0].body, { token: 'tok-1', action: 'get', args: {} })
    const rewritten = JSON.parse(await readFile(bridgePath, 'utf8'))
    assert.equal(rewritten.url, url, '成功重试后应回写 bridge 文件里的新地址')

    // 没有 runtime.json 时给出可执行提示，不要求重开会话
    await writeFile(bridgePath, JSON.stringify({ url: 'http://127.0.0.1:1', token: 'tok-1', itemId: 'flow-1' }), 'utf8')
    await rm(runtimePath, { force: true })
    await assert.rejects(
      run(process.execPath, [BIN, 'get', '--bridge', bridgePath], { env: { ...process.env, DEVHUB_HOME: profile } }),
      (error) => {
        assert.match(String(error.stderr ?? ''), /不需要重开本会话/)
        return true
      },
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
})
