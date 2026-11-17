import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'devhub-techdoc-home-'))
process.env.DEVHUB_HOME = home

const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-techdoc-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }), 'utf8')
  await mkdir(join(dir, 'src/client'), { recursive: true })
  await writeFile(join(dir, 'src/client/index.mjs'), 'export const x = 1\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

function fakeContext(repo) {
  const routes = new Map()
  const tools = new Map()
  const ctx = {
    webServer: { register(route) { routes.set(route.path, route); return () => {} } },
    sessions: { get(id) { return { header: { cwd: repo, id } } } },
    get(name) {
      if (name === 'tools') return { register(tool) { tools.set(tool.name, tool); return () => {} } }
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
  const url = path + (params.size ? `?${params.toString()}` : '')
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
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

async function setup() {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  apply(ctx)
  await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
  await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
  const created = await call(routes, API.wizard, {
    method: 'POST',
    body: {
      action: 'create',
      entry: 'chat',
      description: '给模板支持复制并保留归属',
      name: '模板复制',
      id: 'techdoc-flow',
      scope: ['src/client'],
    },
  })
  assert.equal(created.status, 200, JSON.stringify(created.body))
  return { repo, routes, item: created.body.item }
}

test('建流程默认技术文档：provider=飞书，路径默认 docs/design/{id}.md', async () => {
  const { repo, item } = await setup()
  try {
    assert.equal(item.workflow.techDoc.provider, 'feishu')
    assert.equal(item.workflow.techDoc.decision, 'create')
    assert.match(item.workflow.techDoc.title, /技术方案/)
    const project = JSON.parse(await readFile(join(repo, '.dev-hub/project.json'), 'utf8'))
    assert.equal(project.docs.provider, 'feishu')
    assert.equal(project.docs.local.path, 'docs/design/{id}.md')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('本地技术方案：生成到 docs/design/<id>.md；补充存台账并同步 user 段；重新生成不覆盖补充', async () => {
  const { repo, routes } = await setup()
  try {
    const local = await call(routes, API.techdoc, { method: 'POST', body: { action: 'local', id: 'techdoc-flow', title: '模板复制方案' } })
    assert.equal(local.status, 200, JSON.stringify(local.body))
    assert.equal(local.body.path, 'docs/design/techdoc-flow.md')
    let file = await readFile(join(repo, 'docs/design/techdoc-flow.md'), 'utf8')
    assert.match(file, /devhub:generated:begin/)
    assert.match(file, /devhub:user:begin/)
    let item = (await call(routes, API.item, { queryParams: { id: 'techdoc-flow' } })).body.item
    assert.equal(item.workflow.techDoc.provider, 'local')
    assert.equal(item.workflow.techDoc.localPath, 'docs/design/techdoc-flow.md')
    assert.equal(item.workflow.techDoc.supplement, '', '没有补充时不能把占位文案写进台账')
    assert.equal((file.match(/## 8\. 我的补充/g) ?? []).length, 1, '用户段标题只能出现一次')

    const supplement = '取舍：先只做同企业复制，跨企业后续再做。'
    const saved = await call(routes, API.techdoc, { method: 'POST', body: { action: 'supplement', id: 'techdoc-flow', supplement } })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    assert.equal(saved.body.synced, true)
    item = saved.body.item
    assert.equal(item.workflow.techDoc.supplement, supplement)
    file = await readFile(join(repo, 'docs/design/techdoc-flow.md'), 'utf8')
    assert.match(file, /同企业复制/)

    // 台账变化后重新生成：生成段更新，user 段原样保留
    const beforeUser = file.slice(file.indexOf('devhub:user:begin'))
    const regenerated = await call(routes, API.techdoc, { method: 'POST', body: { action: 'local', id: 'techdoc-flow' } })
    assert.equal(regenerated.status, 200, JSON.stringify(regenerated.body))
    file = await readFile(join(repo, 'docs/design/techdoc-flow.md'), 'utf8')
    assert.equal(file.slice(file.indexOf('devhub:user:begin')), beforeUser)
    assert.match(file, /同企业复制/)
    assert.equal((file.match(/## 8\. 我的补充/g) ?? []).length, 1, '重新生成不能重复用户段标题')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('本地文档被手工改过：默认返回冲突不覆盖；force 才覆盖生成段', async () => {
  const { repo, routes } = await setup()
  try {
    await call(routes, API.techdoc, { method: 'POST', body: { action: 'local', id: 'techdoc-flow' } })
    const path = join(repo, 'docs/design/techdoc-flow.md')
    const file = await readFile(path, 'utf8')
    await writeFile(path, file.replace('背景与目标', '我手改的方案标题'), 'utf8')
    const conflict = await call(routes, API.techdoc, { method: 'POST', body: { action: 'local', id: 'techdoc-flow' } })
    assert.equal(conflict.status, 200, JSON.stringify(conflict.body))
    assert.equal(conflict.body.conflict, true)
    assert.match(conflict.body.message, /默认不覆盖/)
    const unchanged = await readFile(path, 'utf8')
    assert.match(unchanged, /我手改的方案标题/)

    const forced = await call(routes, API.techdoc, { method: 'POST', body: { action: 'local', id: 'techdoc-flow', force: true } })
    assert.equal(forced.status, 200, JSON.stringify(forced.body))
    assert.equal(forced.body.conflict, undefined)
    const overwritten = await readFile(path, 'utf8')
    assert.doesNotMatch(overwritten, /我手改的方案标题/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('飞书不可用：按项目配置回退本地 md，并显式说明降级原因', async () => {
  const { repo, routes } = await setup()
  const oldPath = process.env.PATH
  try {
    process.env.PATH = '/nonexistent-devhub-path'
    const created = await call(routes, API.techdoc, { method: 'POST', body: { action: 'create', id: 'techdoc-flow' } })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    assert.equal(created.body.degraded, true)
    assert.match(created.body.reason, /lark-cli/)
    assert.equal(created.body.item.workflow.techDoc.provider, 'local')
    assert.match(created.body.item.workflow.techDoc.sync.note, /飞书创建失败/)
    assert.ok((await readFile(join(repo, 'docs/design/techdoc-flow.md'), 'utf8')).includes('背景与目标'))
  } finally {
    process.env.PATH = oldPath
    await rm(repo, { recursive: true, force: true })
  }
})

test('预览与 Context Pack：技术方案带位置/补充，不含 token', async () => {
  const { repo, routes } = await setup()
  try {
    await call(routes, API.techdoc, { method: 'POST', body: { action: 'local', id: 'techdoc-flow' } })
    await call(routes, API.techdoc, { method: 'POST', body: { action: 'supplement', id: 'techdoc-flow', supplement: '回滚：删掉复制出来的数据即可' } })
    const preview = await call(routes, API.techdoc, { method: 'POST', body: { action: 'preview', id: 'techdoc-flow' } })
    assert.equal(preview.status, 200)
    assert.match(preview.body.markdown, /回滚：删掉复制出来的数据即可/)

    const context = await call(routes, API.context, { method: 'POST', body: { id: 'techdoc-flow' } })
    const prompt = context.body.context.prompt
    assert.match(prompt, /【技术方案】/)
    assert.match(prompt, /docs\/design\/techdoc-flow\.md/)
    assert.match(prompt, /回滚：删掉复制出来的数据即可/)
    // 台账与 Context 都不存飞书认证 token（约束文案里的 token 提醒不算）
    const item = (await call(routes, API.item, { queryParams: { id: 'techdoc-flow' } })).body.item
    assert.equal(Object.keys(item.workflow.techDoc).some((key) => /token/i.test(key)), false)
    assert.doesNotMatch(prompt, /access_token|feishuToken|larkToken/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

async function fakeLarkBin() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-fake-lark-'))
  const bin = join(dir, 'lark-cli')
  await writeFile(bin, [
    '#!/bin/sh',
    'if [ "$1" = "auth" ]; then',
    '  echo \'{"identities":{"user":{"available":true,"message":"ok"}},"identity":"user"}\'',
    '  exit 0',
    'fi',
    'echo \'{"url":"https://example.feishu.cn/docx/fake-token","ok":true}\'',
    '',
  ].join('\n'), 'utf8')
  await chmod(bin, 0o755)
  return dir
}

test('飞书：用本机 lark-cli 创建/更新；台账只存 URL 不存 token', async () => {
  const { repo, routes } = await setup()
  const bin = await fakeLarkBin()
  const oldPath = process.env.PATH
  try {
    process.env.PATH = `${bin}:${oldPath}`
    const probe = await call(routes, API.techdoc, { method: 'POST', body: { action: 'probe' } })
    assert.equal(probe.body.authenticated, true)

    const created = await call(routes, API.techdoc, { method: 'POST', body: { action: 'create', id: 'techdoc-flow', title: '飞书方案' } })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    assert.equal(created.body.url, 'https://example.feishu.cn/docx/fake-token')
    let item = created.body.item
    assert.equal(item.workflow.techDoc.provider, 'feishu')
    assert.equal(item.workflow.techDoc.url, created.body.url)
    assert.equal(Object.keys(item.workflow.techDoc).some((key) => /token/i.test(key)), false, '台账不能存 token')

    await call(routes, API.techdoc, { method: 'POST', body: { action: 'supplement', id: 'techdoc-flow', supplement: '飞书补充' } })
    const updated = await call(routes, API.techdoc, { method: 'POST', body: { action: 'create', id: 'techdoc-flow', update: true } })
    assert.equal(updated.status, 200, JSON.stringify(updated.body))
    assert.equal(updated.body.updated, true)
    assert.equal(updated.body.url, created.body.url, '更新沿用同一个飞书文档，不新建')
    item = updated.body.item
    assert.equal(item.workflow.techDoc.supplement, '飞书补充')
    assert.ok(item.history.some((entry) => entry.message.includes('更新飞书技术文档')))
  } finally {
    process.env.PATH = oldPath
    await rm(repo, { recursive: true, force: true })
    await rm(bin, { recursive: true, force: true })
  }
})

test('测试跳过：原因入库、报告显式标注；环境测试跳过受评审门禁约束', async () => {
  const { repo, routes } = await setup()
  try {
    const skippedLocal = await call(routes, API.test, {
      method: 'POST',
      body: { id: 'techdoc-flow', phase: 'local', skip: true, reason: '本机缺少外部依赖，改用人工确认' },
    })
    assert.equal(skippedLocal.status, 200, JSON.stringify(skippedLocal.body))
    assert.equal(skippedLocal.body.skipped, true)
    let item = skippedLocal.body.item
    assert.equal(item.workflow.tests.local.status, 'skipped')
    assert.equal(item.workflow.tests.local.skipReason, '本机缺少外部依赖，改用人工确认')
    assert.equal(item.workflow.stage, 'review', '跳过本机自测后仍可继续评审')

    const report = await call(routes, API.report, { queryParams: { id: 'techdoc-flow' } })
    assert.equal(report.status, 200, JSON.stringify(report.body))
    assert.match(report.body.markdown, /已跳过/)
    assert.match(report.body.markdown, /本机缺少外部依赖/)

    // 评审未通过前，环境测试不允许跳过
    const blocked = await call(routes, API.test, {
      method: 'POST',
      body: { id: 'techdoc-flow', phase: 'environment', skip: true, reason: '不想跑' },
    })
    assert.equal(blocked.status, 400)
    assert.match(blocked.body.error, /评审/)

    // 人工标记评审通过后：环境测试可以跳过，流程进入待提交
    const current = (await call(routes, API.item, { queryParams: { id: 'techdoc-flow' } })).body.item
    current.workflow.review = {
      round: 1,
      reviewers: [{ id: 'reviewer-1', label: '审核员 1', role: 'direction', status: 'passed', verdict: 'pass', summary: 'ok' }],
    }
    await call(routes, API.items, { method: 'POST', body: current })
    const skippedEnv = await call(routes, API.test, {
      method: 'POST',
      body: { id: 'techdoc-flow', phase: 'environment', skip: true, reason: '本次只改文档，环境验证人工确认' },
    })
    assert.equal(skippedEnv.status, 200, JSON.stringify(skippedEnv.body))
    item = skippedEnv.body.item
    assert.equal(item.workflow.tests.environment.status, 'skipped')
    assert.equal(item.workflow.stage, 'submit')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})
