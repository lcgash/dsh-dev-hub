import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'devhub-wt-host-home-'))
process.env.DEVHUB_HOME = home

const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-wt-host-repo-'))
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

async function call(routes, path, { method = 'GET', body } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = path
  req.socket = { remoteAddress: '127.0.0.1' }
  const res = {
    status: 0, headers: {}, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {} },
    end(value) { this.body = String(value ?? '') },
  }
  await routes.get(path.split('?')[0]).handler(req, res)
  return { status: res.status, json: JSON.parse(res.body) }
}

function flowBody(id, title) {
  return {
    id,
    title,
    goal: `${title} 的目标`,
    acceptance: ['本机自测通过'],
    scope: ['src'],
    workflow: {
      entry: 'chat',
      intent: 'feature',
      gitRepo: true,
      rootProblem: `${title} 的根因`,
      questions: [
        { id: 'q1', question: '根因？', answer: 'a' },
        { id: 'q2', question: '谁受影响？', answer: 'b' },
        { id: 'q3', question: '边界？', answer: 'c' },
      ],
      techDoc: { decision: 'none' },
      plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1, confidence: 'high' } },
    },
  }
}

test('worktree host：所有 git 开发流程默认独立工作区，变更互不可见且不污染主工作区', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.items, { method: 'POST', body: flowBody('flow-a', '流程 A') })
    await call(routes, API.items, { method: 'POST', body: flowBody('flow-b', '流程 B') })

    const first = await call(routes, API.start, { method: 'POST', body: { id: 'flow-a' } })
    assert.equal(first.status, 200)
    assert.ok(first.json.worktree?.path, '第一个流程也要独立工作区')
    assert.equal(first.json.worktree.branch, 'devhub/flow-a')
    assert.notEqual(first.json.workRoot, repo)
    assert.match(first.json.context.prompt, /【独立工作区】/)

    const second = await call(routes, API.start, { method: 'POST', body: { id: 'flow-b' } })
    assert.equal(second.status, 200)
    assert.ok(second.json.worktree?.path)
    assert.equal(second.json.worktree.branch, 'devhub/flow-b')
    assert.notEqual(second.json.workRoot, repo)
    assert.match(second.json.context.prompt, /【独立工作区】/)
    assert.match(second.json.context.prompt, /devhub\/flow-b/)

    // 主工作区里的未提交改动不属于任何流程
    await writeFile(join(repo, 'main-only.txt'), 'main workspace change\n', 'utf8')
    // 两个流程各自在自己的 worktree 改文件，互不可见
    await writeFile(join(first.json.workRoot, 'flow-a-only.txt'), 'flow a change\n', 'utf8')
    await writeFile(join(second.json.workRoot, 'flow-b-only.txt'), 'flow b change\n', 'utf8')
    const filesA = await call(routes, `${API.files}?itemId=flow-a`)
    const filesB = await call(routes, `${API.files}?itemId=flow-b`)
    const pathsA = (filesA.json.files ?? []).map((file) => file.path)
    const pathsB = (filesB.json.files ?? []).map((file) => file.path)
    assert.ok(pathsA.includes('flow-a-only.txt'))
    assert.equal(pathsA.includes('flow-b-only.txt'), false)
    assert.equal(pathsA.includes('main-only.txt'), false, '主工作区改动不能被流程捕获')
    assert.ok(pathsB.includes('flow-b-only.txt'))
    assert.equal(pathsB.includes('flow-a-only.txt'), false)
    assert.equal(pathsB.includes('main-only.txt'), false, '主工作区改动不能被流程捕获')
    assert.equal(filesB.json.workRoot, second.json.workRoot)
    // changes / diff 也必须在 worktree，而不是主工作区
    const changesB = await call(routes, `${API.changes}?id=flow-b`)
    assert.equal(changesB.json.branch, 'devhub/flow-b')
    assert.ok(changesB.json.suggestedPaths.includes('flow-b-only.txt'))
    assert.equal(changesB.json.suggestedPaths.some((path) => path.startsWith('.dev-hub')), false)
    const diffB = await call(routes, `${API.diff}?itemId=flow-b&path=flow-b-only.txt`)
    assert.ok(diffB.json.file.lines.some((line) => line.text.includes('flow b change')))
    const diffA = await call(routes, `${API.diff}?itemId=flow-a&path=flow-a-only.txt`)
    assert.ok(diffA.json.file.lines.some((line) => line.text.includes('flow a change')))

    // 台账里只存分支，不写绝对路径；/item 在本机补路径
    const raw = JSON.parse(await readFile(join(repo, '.dev-hub/items/flow-b.json'), 'utf8'))
    assert.equal(raw.workflow.worktree.branch, 'devhub/flow-b')
    assert.equal(raw.workflow.worktree.path, undefined)
    const detail = await call(routes, `${API.item}?id=flow-b`)
    assert.equal(detail.json.item.worktreePath, second.json.worktree.path)
    const state = await call(routes, API.state)
    const summary = (state.json.items ?? []).find((entry) => entry.id === 'flow-b')
    assert.equal(summary.worktree.branch, 'devhub/flow-b')
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('worktree 提交：默认推送到开工分支，而不是 devhub/*，无需用户手工合并', async () => {
  const repo = await tempRepo()
  const remote = await mkdtemp(join(tmpdir(), 'devhub-wt-remote-'))
  try {
    execFileSync('git', ['init', '--bare', '-q', remote])
    execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: repo })
    const branch = execFileSync('git', ['branch', '--show-current'], { cwd: repo }).toString().trim()
    execFileSync('git', ['push', '-q', '-u', 'origin', branch], { cwd: repo })

    const { ctx, routes } = fakeContext(repo)
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    await call(routes, API.items, { method: 'POST', body: flowBody('flow-push', '流程推送') })
    const started = await call(routes, API.start, { method: 'POST', body: { id: 'flow-push' } })
    assert.equal(started.status, 200, JSON.stringify(started.json).slice(0, 300))
    assert.equal(started.json.worktree.branch, 'devhub/flow-push')
    assert.equal(started.json.item.baseline.branch, branch, 'baseline 必须记开工分支，不能记 devhub 分支')
    const workRoot = started.json.workRoot
    await writeFile(join(workRoot, 'pushed.txt'), 'from worktree\n', 'utf8')

    const local = await call(routes, API.test, { method: 'POST', body: { id: 'flow-push', phase: 'local', command: 'true' } })
    assert.equal(local.json.result.status, 'passed')
    const submitted = await call(routes, API.submit, {
      method: 'POST',
      body: { id: 'flow-push', paths: ['pushed.txt'], message: 'feat: worktree push', branchMode: 'current' },
    })
    assert.equal(submitted.status, 200, JSON.stringify(submitted.json).slice(0, 500))
    assert.equal(submitted.json.ok, true, JSON.stringify(submitted.json).slice(0, 500))
    assert.equal(submitted.json.branch, branch, '台账应显示目标分支，而不是 devhub/flow-push')

    const remoteHead = execFileSync('git', ['--git-dir', remote, 'rev-parse', `refs/heads/${branch}`]).toString().trim()
    const worktreeHead = execFileSync('git', ['-C', workRoot, 'rev-parse', 'HEAD']).toString().trim()
    assert.equal(remoteHead, worktreeHead, '远端目标分支必须包含 worktree 的提交')
    assert.ok(String(submitted.json.commit).length > 0)
    assert.equal(submitted.json.item.workflow.submission.branch, branch)
    assert.throws(() => execFileSync('git', ['--git-dir', remote, 'show-ref', '--verify', 'refs/heads/devhub/flow-push'], { stdio: 'ignore' }), '不能把 devhub 分支当成结果推上去')
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(remote, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})
