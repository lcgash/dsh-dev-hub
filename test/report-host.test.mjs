import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'devhub-report-home-'))
process.env.DEVHUB_HOME = home

const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-report-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'README.md'), '# demo\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

function headOf(repo) {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo }).toString().trim()
}

function fakeContext(repo) {
  const routes = new Map()
  const tools = new Map()
  const ctx = {
    webServer: {
      register(route) { routes.set(route.path, route); return () => {} },
    },
    sessions: {
      get(id) { return { header: { cwd: repo, id } } },
    },
    get(name) {
      if (name === 'tools') return { register(tool) { tools.set(tool.name, tool); return () => {} } }
      if (name === 'systemPrompt') return null
      return undefined
    },
    effect(fn) { fn(); return () => {} },
  }
  return { ctx, routes, tools }
}

function fakeResponse() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {} },
    end(body) { this.body = String(body ?? '') },
  }
}

async function call(routes, path, { method = 'GET', body, raw = false } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = path
  req.socket = { remoteAddress: '127.0.0.1' }
  const res = fakeResponse()
  const route = routes.get(path.split('?')[0])
  assert.ok(route, `route missing: ${path}`)
  await route.handler(req, res)
  return { status: res.status, headers: res.headers, body: res.body, json: raw ? null : safeJson(res.body) }
}

function safeJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function sampleItem({ baseline, head }) {
  return {
    title: '报告路由 <script>alert(1)</script>',
    goal: '给每个流程生成报告 <script>alert(2)</script>，点一下就能看',
    description: '客户原话：流程结束要有报告',
    requirement: {
      raw: '客户原话：流程结束要有报告',
      goal: '每个流程一份可点击报告',
      rootProblem: '流程结束后没有统一结项视图',
      background: '交接时需要翻台账',
      expected: '报告包含目标/改动/测试',
      source: 'clarify',
      needsReview: false,
    },
    nonGoals: ['不做报告数据库'],
    acceptance: ['npm test 通过'],
    scope: ['src'],
    tasks: [
      { text: '实现报告', done: true },
      { text: '补测试', done: false },
    ],
    checks: [{ id: 'c1', text: '本机测试', command: 'npm test', status: 'passed', at: '2026-11-12T02:30:00.000Z' }],
    changePoints: [{ type: 'api', summary: '新增 /api/dev-hub/report' }],
    risks: ['报告表格可能很长'],
    history: [{ at: '2026-11-12T02:30:00.000Z', type: 'create', message: '创建流程' }],
    baseline: { startedAt: '2026-11-12T02:00:00.000Z', commit: baseline, branch: 'main' },
    workflow: {
      intent: 'feature',
      rootProblem: '流程结束后没有统一结项视图',
      plan: { summary: '实现报告', steps: ['core', 'host', 'client'], estimate: { size: 'M', days: 2, confidence: 'high' } },
      techDoc: { decision: 'none' },
      gitRepo: true,
      tests: {
        local: { status: 'passed', command: 'npm test', output: 'all tests pass', at: '2026-11-12T02:30:00.000Z', durationMs: 4200, by: '张三' },
        environment: { status: 'passed', command: 'npm run check', output: 'check ok', at: '2026-11-12T02:30:00.000Z', durationMs: 1200, by: '张三' },
      },
      submission: { status: 'pushed', branch: 'main', commit: head, pushed: true, at: '2026-11-12T02:30:00.000Z', message: 'feat: report' },
    },
  }
}

test('report route：JSON/Markdown/HTML/save 与 400 边界', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    const baseline = headOf(repo)
    const body = sampleItem({ baseline, head: baseline })
    body.id = 'dev-report'
    const created = await call(routes, API.items, { method: 'POST', body })
    assert.equal(created.status, 200)
    assert.equal(created.json.item.id, 'dev-report')
    assert.equal(created.json.item.status, 'done')

    // baseline 之后新增一个未跟踪文件：报告要把它算进改动范围
    await mkdir(join(repo, 'src'), { recursive: true })
    await writeFile(join(repo, 'src/report-check.mjs'), 'export const report = true\n', 'utf8')
    await writeFile(join(repo, '.DS_Store'), 'noise\n', 'utf8')

    const json = await call(routes, `${API.report}?id=dev-report`)
    assert.equal(json.status, 200)
    assert.equal(json.json.ok, true)
    assert.match(json.json.markdown, /## 1\. 目标背景/)
    const report = json.json.report
    assert.equal(report.itemId, 'dev-report')
    assert.equal(report.verdict, 'passed')
    assert.equal(report.summary.submission.commit, baseline)
    assert.equal(report.summary.changedFiles, 1)
    assert.ok(report.sections.some((section) => section.id === 'scope'))
    const scopeBlock = report.sections.find((section) => section.id === 'scope').blocks.find((block) => block.type === 'table')
    assert.ok(scopeBlock.rows.some((row) => row.path === 'src/report-check.mjs'))
    assert.equal(scopeBlock.rows.some((row) => /DS_Store/.test(row.path)), false)
    assert.match(report.sections.find((section) => section.id === 'scope').blocks.find((block) => block.type === 'text' && block.title === '报告口径').text, /已排除 0 个 scope 外改动、1 个/)
    assert.ok(report.sections.find((section) => section.id === 'test').blocks.some((block) => block.type === 'code' && block.text.includes('all tests pass')))

    const markdown = await call(routes, `${API.report}?id=dev-report&format=markdown`, { raw: true })
    assert.equal(markdown.status, 200)
    assert.match(markdown.headers['content-type'], /text\/markdown/)
    assert.match(markdown.body, /# 报告路由/)

    const html = await call(routes, `${API.report}?id=dev-report&format=html`, { raw: true })
    assert.equal(html.status, 200)
    assert.match(html.headers['content-type'], /text\/html/)
    assert.match(html.body, /^<!doctype html>/)
    assert.match(html.body, /目标背景/)
    assert.match(html.body, /测试报告/)
    // 标题/目标里的脚本必须被转义，不能直接形成标签
    assert.equal(html.body.includes('<script>alert(1)</script>'), false)
    assert.equal(html.body.includes('<script>alert(2)</script>'), false)
    assert.match(html.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)

    const saved = await call(routes, `${API.report}?id=dev-report&save=1`)
    assert.equal(saved.status, 200)
    // 绝对路径：macOS 的 /var 会 canonical 成 /private/var，只断言绝对 + 结尾，避免平台差异
    assert.ok(saved.json.saved.html.startsWith('/'))
    assert.ok(saved.json.saved.html.endsWith('/.dev-hub/reports/dev-report.html'))
    assert.ok(saved.json.saved.markdown.endsWith('/.dev-hub/reports/dev-report.md'))
    assert.equal(saved.json.saved.relative.html, '.dev-hub/reports/dev-report.html')
    assert.equal(saved.json.saved.relative.markdown, '.dev-hub/reports/dev-report.md')
    const htmlFile = await readFile(saved.json.saved.html, 'utf8')
    const mdFile = await readFile(saved.json.saved.markdown, 'utf8')
    assert.match(htmlFile, /^<!doctype html>/)
    assert.match(mdFile, /## 1\. 目标背景/)
    assert.ok((await stat(saved.json.saved.dir)).isDirectory())

    const posted = await call(routes, API.report, { method: 'POST', body: { id: 'dev-report', action: 'save' } })
    assert.equal(posted.status, 200)
    assert.ok(posted.json.saved.html.endsWith('.html'))

    const missing = await call(routes, `${API.report}?id=`, { raw: true })
    assert.equal(missing.status, 400)
    assert.match(JSON.parse(missing.body).error, /缺少 id/)

    const unknown = await call(routes, `${API.report}?id=nope`, { raw: true })
    assert.equal(unknown.status, 400)
    assert.match(JSON.parse(unknown.body).error, /不存在/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})
