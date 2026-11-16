import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'devhub-attach-home-'))
process.env.DEVHUB_HOME = home

const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-attach-repo-'))
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

function fakeContext(repo, { llm = undefined } = {}) {
  const routes = new Map()
  const tools = new Map()
  const ctx = {
    webServer: { register(route) { routes.set(route.path, route); return () => {} } },
    sessions: { get(id) { return { header: { cwd: repo, id } } } },
    get(name) {
      if (name === 'tools') return { register(tool) { tools.set(tool.name, tool); return () => {} } }
      if (name === 'systemPrompt') return null
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake-provider', model: 'fake-model' }) }
      if (name === 'llm') return llm
      return undefined
    },
    effect(fn) { fn(); return () => {} },
  }
  return { ctx, routes }
}

async function call(routes, path, { method = 'GET', body, queryParams } = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(queryParams ?? {})) params.set(key, String(value))
  const url = path + (params.size ? '?' + params.toString() : '')
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

test('能力探测：模型声明 image 才能粘贴图片；没有 llm 服务时明确说"不支持"而不是静默', async () => {
  const repo = await tempRepo()
  try {
    {
      const { ctx, routes } = fakeContext(repo, { llm: { resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }) } })
      apply(ctx)
      const caps = await call(routes, API.capabilities)
      assert.equal(caps.status, 200)
      assert.equal(caps.body.images.supported, true)
      assert.ok(caps.body.model)
    }
    {
      const { ctx, routes } = fakeContext(repo, { llm: { resolveModelInfo: async () => ({ inputModalities: ['text'] }) } })
      apply(ctx)
      const caps = await call(routes, API.capabilities)
      assert.equal(caps.body.images.supported, false)
      assert.match(caps.body.images.reason, /未声明图片/)
    }
    {
      const { ctx, routes } = fakeContext(repo)
      apply(ctx)
      const caps = await call(routes, API.capabilities)
      assert.equal(caps.body.images.supported, false)
      assert.match(caps.body.images.reason, /没有暴露模型能力查询|没有读到当前模型/)
    }
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('附件上传：图片落到本机附件目录并返回绝对路径；格式不支持时明确报错', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo, { llm: { resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }) } })
  try {
    apply(ctx)
    const uploaded = await call(routes, API.attach, {
      method: 'POST',
      body: { name: 'shot.png', mediaType: 'image/png', data: PNG_BASE64 },
    })
    assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body))
    const attachment = uploaded.body.attachment
    assert.equal(attachment.kind, 'image')
    assert.equal(attachment.mediaType, 'image/png')
    assert.ok(attachment.path.startsWith('/'))
    assert.ok(attachment.path.includes('devhub-attach-home-') || attachment.path.includes('.dsh'))
    await access(attachment.path)
    const bytes = await readFile(attachment.path)
    assert.ok(bytes.length > 0)
    assert.equal(uploaded.body.capabilities.images.supported, true)

    const svg = await call(routes, API.attach, {
      method: 'POST',
      body: { name: 'x.svg', mediaType: 'image/svg+xml', data: Buffer.from('<svg/>').toString('base64') },
    })
    assert.equal(svg.status, 400)
    assert.match(svg.body.error, /图片格式不支持/)

    const text = await call(routes, API.attach, {
      method: 'POST',
      body: { name: 'run.log', mediaType: 'text/plain', data: Buffer.from('line1\nline2').toString('base64') },
    })
    assert.equal(text.status, 200)
    assert.equal(text.body.attachment.kind, 'file')
    assert.match(text.body.attachment.path, /run\.log$/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('建流程带附件：附件入库，Context Pack 注入路径与 read_image 约束', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo, { llm: { resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }) } })
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
    const uploaded = await call(routes, API.attach, {
      method: 'POST',
      body: { name: 'paste.png', mediaType: 'image/png', data: PNG_BASE64 },
    })
    const attachment = uploaded.body.attachment

    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        entry: 'chat',
        description: '看这张截图，把这个页面缺失的库名补到头部',
        name: '头部补库名',
        id: 'attach-flow',
        scope: ['src/client'],
        attachments: [attachment],
      },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    const item = created.body.item
    assert.equal(item.attachments.length, 1)
    assert.equal(item.attachments[0].path, attachment.path)

    const context = await call(routes, API.context, { method: 'POST', body: { id: 'attach-flow' } })
    const prompt = context.body.context.prompt
    assert.match(prompt, /【用户提供的文件\/图片】/)
    assert.match(prompt, /read_image/)
    assert.match(prompt, new RegExp(attachment.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(prompt, /当前模型不支持图片/)

    const state = await call(routes, API.state)
    assert.equal(state.body.items.find((entry) => entry.id === 'attach-flow').attachmentCount, 1)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('附件预览：只读本机附件目录，返回正确 content-type；目录外路径不服务', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo, { llm: { resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }) } })
  try {
    apply(ctx)
    const uploaded = await call(routes, API.attach, {
      method: 'POST',
      body: { name: 'shot.png', mediaType: 'image/png', data: PNG_BASE64 },
    })
    const path = uploaded.body.attachment.path
    const route = routes.get(API.attachment)
    const get = async (target) => {
      const req = Readable.from([])
      req.method = 'GET'
      req.url = `${API.attachment}?path=${encodeURIComponent(target)}`
      req.socket = { remoteAddress: '127.0.0.1' }
      const res = { status: 0, headers: {}, body: Buffer.alloc(0), writeHead(status, headers) { this.status = status; this.headers = headers ?? {} }, end(value) { this.body = Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? '')) } }
      await route.handler(req, res)
      return res
    }
    const served = await get(path)
    assert.equal(served.status, 200)
    assert.equal(served.headers['content-type'], 'image/png')
    assert.deepEqual(served.body, await readFile(path))

    const denied = await get(join(repo, 'package.json'))
    assert.equal(denied.status, 404)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})
