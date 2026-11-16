import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'devhub-home-'))
process.env.DEVHUB_HOME = home
const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'README.md'), '# demo\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

function fakeContext(repo, { withReviewAgents = false, reviewerOutput = null } = {}) {
  const routes = new Map()
  const tools = new Map()
  // 独立评审用：模拟 dsh 的 agents/subagents，让派发走真实的 runAgentJson 装配路径
  const reviewLabels = []
  const reviewerResult = (spec) => {
    if (typeof reviewerOutput === 'function') return reviewerOutput(spec)
    return {
      verdict: 'pass',
      summary: '通过：验收标准都有对应实现与测试',
      findings: [],
      direction: '',
      evidence: ['README.md'],
      confidence: 'high',
    }
  }
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
      if (!withReviewAgents) return undefined
      if (name === 'agents') {
        return {
          async create({ sessionId }) {
            return { agent: { id: sessionId }, async dispose() {} }
          },
        }
      }
      if (name === 'subagents') {
        return {
          list: () => ['spawn'],
          getProvider: () => ({ capabilities: { agentPreset: false } }),
          async startActivation(spec) {
            reviewLabels.push(spec.label)
            const output = reviewerResult(spec)
            if (output instanceof Error) throw output
            return { async dispose() {}, result: Promise.resolve({ stopReason: 'completed', structured: output }) }
          },
        }
      }
      return undefined
    },
    effect(fn) { fn(); return () => {} },
  }
  return { ctx, routes, tools, reviewLabels }
}

function fakeResponse() {
  const res = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {} },
    end(body) { this.body = String(body ?? '') },
  }
  return res
}

async function call(routes, path, { method = 'GET', body, sessionId, queryParams } = {}) {
  const params = new URLSearchParams()
  if (sessionId) params.set('sessionId', sessionId)
  for (const [key, value] of Object.entries(queryParams ?? {})) params.set(key, String(value))
  const suffix = params.size ? '?' + params.toString() : ''
  const url = path + suffix
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.socket = { remoteAddress: '127.0.0.1' }
  const res = fakeResponse()
  const route = routes.get(path)
  assert.ok(route, `route missing: ${path}`)
  await route.handler(req, res)
  return { status: res.status, body: JSON.parse(res.body) }
}

test('host setup, item ledger, context and start route', async () => {
  const repo = await tempRepo()
  const { ctx, routes, tools, reviewLabels } = fakeContext(repo, { withReviewAgents: true })
  try {
    apply(ctx)
    const before = await call(routes, API.state, { sessionId: 's1' })
    assert.equal(before.body.needsSetup, true)
    assert.equal(before.body.suggestedRepoPath, repo)

    const setup = await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    assert.equal(setup.status, 200)
    assert.equal(setup.body.needsSetup, false)
    assert.equal(setup.body.profile.member, '张三')
    assert.ok(setup.body.env.os)

    const created = await call(routes, API.items, {
      method: 'POST',
      body: { title: 'Gerrit source', goal: 'support gerrit', acceptance: ['gate passes'], tasks: [{ text: 'provider', done: true }], workflow: {
        rootProblem: 'legacy source cannot be reused',
        questions: [
          { id: 'q1', question: 'root?', answer: 'legacy' },
          { id: 'q2', question: 'who?', answer: 'pipeline team' },
          { id: 'q3', question: 'scope?', answer: 'gerrit only' },
        ],
        techDoc: { decision: 'none' },
        plan: { summary: 'write provider', steps: ['provider', 'tests'], estimate: { size: 'M', days: 2, confidence: 'medium' } },
      } },
    })
    assert.equal(created.body.item.id, 'gerrit-source')

    const start = await call(routes, API.start, { method: 'POST', body: { id: 'gerrit-source' } })
    assert.equal(start.status, 200)
    assert.match(start.body.context.prompt, /Gerrit source/)
    assert.match(start.body.context.prompt, /张三/)
    assert.ok(start.body.context.contextHash)
    assert.ok(start.body.item.baseline.commit)

    const raw = JSON.parse(await readFile(join(repo, '.dev-hub/items/gerrit-source.json'), 'utf8'))
    assert.equal(raw.status, 'developing')

    const contextTool = tools.get('devhub_context')
    assert.ok(contextTool)
    const toolResult = await contextTool.execute({ id: 'gerrit-source' }, { agent: { session: { header: { cwd: repo } } } })
    assert.match(toolResult.prompt, /support gerrit/)

    const doc = await call(routes, API.techdoc, { method: 'POST', body: { action: 'local', id: 'gerrit-source' } })
    assert.equal(doc.status, 200)
    assert.match(doc.body.item.workflow.techDoc.localPath, /\.dev-hub\/design\/gerrit-source\.md$/)

    const localTest = await call(routes, API.test, {
      method: 'POST', body: { id: 'gerrit-source', phase: 'local', command: 'node -e "process.exit(0)"' },
    })
    assert.equal(localTest.body.item.workflow.tests.local.status, 'passed')
    // 自测通过只进入独立评审：评审是测试验证的门禁
    assert.equal(localTest.body.item.workflow.stage, 'review')

    // 没有评审结论时环境测试被挡住，并说明原因（不静默放行）
    const blockedEnv = await call(routes, API.test, {
      method: 'POST', body: { id: 'gerrit-source', phase: 'environment', command: 'node -e "process.exit(0)"' },
    })
    assert.equal(blockedEnv.status, 400)
    assert.match(blockedEnv.body.error, /独立评审/)

    // 派发 2 位审核员（模拟 dsh 会话）：各有独立 id 与会话，全部通过后进入测试验证
    const review = await call(routes, API.review, { method: 'POST', body: { id: 'gerrit-source', action: 'dispatch', count: 2 } })
    assert.equal(review.status, 200)
    assert.equal(review.body.review.status, 'passed')
    assert.equal(review.body.review.total, 2)
    assert.deepEqual(review.body.review.reviewers.map((entry) => entry.id), ['reviewer-1', 'reviewer-2'])
    assert.ok(review.body.review.reviewers.every((entry) => entry.sessionId), '每位审核员都要留审核会话 id')
    assert.equal(reviewLabels.length, 2)
    assert.equal(review.body.item.workflow.stage, 'verify')

    // 台账可读回评审结论（不是只存在内存里）
    const reread = await call(routes, API.item, { queryParams: { id: 'gerrit-source' } })
    assert.equal(reread.body.item.workflow.review.status, 'passed')
    assert.equal(reread.body.item.workflow.review.reviewers.length, 2)
    const reviewTool = tools.get('devhub_review')
    assert.ok(reviewTool, '应提供 devhub_review 工具')
    const toolReview = await reviewTool.execute({ id: 'gerrit-source', action: 'status' }, { agent: { session: { header: { cwd: repo } } } })
    assert.equal(toolReview.review.status, 'passed')

    const envTest = await call(routes, API.test, {
      method: 'POST', body: { id: 'gerrit-source', phase: 'environment', command: 'node -e "process.exit(0)"' },
    })
    assert.equal(envTest.body.item.workflow.tests.environment.status, 'passed')

    // 开发流程在独立 worktree：改动必须写在工作区里，主工作区的未提交改动不算
    const workRoot = start.body.workRoot
    assert.ok(workRoot && workRoot !== repo, 'git 开发流程应有独立工作区')
    await writeFile(join(workRoot, 'README.md'), '# demo changed\n', 'utf8')
    const changes = await call(routes, API.changes, { queryParams: { id: 'gerrit-source' } })
    assert.ok(changes.body.changes.some((change) => change.path === 'README.md'))

    // 没有 remote 时不能假装完成：明确报错
    const noRemote = await call(routes, API.submit, {
      method: 'POST', body: { id: 'gerrit-source', paths: ['README.md'], message: 'x' },
    })
    assert.equal(noRemote.status, 400)
    assert.match(noRemote.body.error, /没有配置 git remote/)

    // 配置一个真实的 bare 远端，走"新建分支 + push"
    const remote = await mkdtemp(join(tmpdir(), 'devhub-remote-'))
    execFileSync('git', ['init', '--bare', '-q'], { cwd: remote })
    execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: repo })
    const submit = await call(routes, API.submit, {
      method: 'POST',
      body: {
        // 台账在主工作区，独立工作区只提交代码；台账跨人交接走仓库自己的流程
        id: 'gerrit-source', paths: ['README.md'],
        message: 'test: submit gerrit source', branchMode: 'new', branchName: 'feature/gerrit-source',
      },
    })
    assert.equal(submit.status, 200, JSON.stringify(submit.body).slice(0, 300))
    assert.equal(submit.body.pushed, true)
    assert.equal(submit.body.branch, 'feature/gerrit-source')
    assert.equal(submit.body.item.workflow.stage, 'done')
    assert.ok(submit.body.commit)
    // 远端真的收到了这个分支（含 .dev-hub 台账）
    const lsRemote = execFileSync('git', ['ls-remote', '--heads', remote, 'feature/gerrit-source'], { cwd: repo }).toString()
    assert.match(lsRemote, /feature\/gerrit-source/)
    const remoteShow = execFileSync('git', ['--git-dir', remote, 'show', 'feature/gerrit-source:README.md'], { cwd: repo }).toString()
    assert.match(remoteShow, /demo changed/)
    await rm(remote, { recursive: true, force: true })
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('风险勾选：riskAcks 通过 API.items 落盘，删掉风险后孤儿勾选自动清掉', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    const created = await call(routes, API.items, {
      method: 'POST',
      body: {
        title: '风险勾选流程',
        goal: '勾选即已知晓',
        acceptance: ['可保存'],
        risks: ['依赖外部系统', '缺少回滚方案'],
        riskAcks: ['依赖外部系统'],
        workflow: {
          rootProblem: '风险没人确认',
          techDoc: { decision: 'none' },
          plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1 } },
        },
      },
    })
    const id = created.body.item.id

    const plain = await call(routes, API.item, { queryParams: { id } })
    assert.deepEqual(plain.body.item.riskAcks, ['依赖外部系统'])
    const raw = JSON.parse(await readFile(join(repo, `.dev-hub/items/${id}.json`), 'utf8'))
    assert.deepEqual(raw.riskAcks, ['依赖外部系统'], 'riskAcks 必须写进仓库台账')

    // 删掉一条风险再保存：对应勾选自动清掉，不留下孤儿状态
    const saved = await call(routes, API.items, {
      method: 'POST',
      body: { ...plain.body.item, risks: ['缺少回滚方案'] },
    })
    assert.deepEqual(saved.body.item.risks, ['缺少回滚方案'])
    assert.deepEqual(saved.body.item.riskAcks, [])
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('本机命令：只写本机 profile、不碰 project.json；测试优先用本机覆盖', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    const created = await call(routes, API.items, {
      method: 'POST',
      body: {
        title: '本机命令流程',
        goal: '本机部署方式复用',
        acceptance: ['能跑'],
        workflow: {
          rootProblem: '每人本机环境不同',
          techDoc: { decision: 'none' },
          plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1 } },
        },
      },
    })
    const id = created.body.item.id

    // 项目命令（共享）先落 project.json
    await call(routes, API.project, { method: 'POST', body: { commands: { localTest: 'false', environmentTest: 'false' } } })
    // 本机命令（只在本机）覆盖 localTest
    const saved = await call(routes, API.project, { method: 'POST', body: { localCommands: { localTest: 'true' } } })
    assert.deepEqual(saved.body.localCommands, { localTest: 'true' })
    assert.equal(saved.body.project.context.commands.localTest, 'false', '本机命令不能改写项目命令')

    const projectRaw = JSON.parse(await readFile(join(repo, '.dev-hub/project.json'), 'utf8'))
    assert.equal(projectRaw.context.commands.localTest, 'false')
    assert.equal(projectRaw.context.commands.localCommands, undefined, 'project.json 不得出现本机命令')

    const profileRaw = JSON.parse(await readFile(join(home, 'profile.json'), 'utf8'))
    const entry = Object.values(profileRaw.repos ?? {}).find((row) => row.localCommands)
    assert.deepEqual(entry?.localCommands, { localTest: 'true' }, '本机命令要写进本机 profile')

    const st = await call(routes, API.state)
    assert.deepEqual(st.body.localCommands, { localTest: 'true' })

    // 跑本机自测：应该用本机覆盖的 true，而不是项目命令 false
    const run = await call(routes, API.test, { method: 'POST', body: { id, phase: 'local' } })
    assert.equal(run.status, 200, JSON.stringify(run.body).slice(0, 300))
    assert.equal(run.body.item.workflow.tests.local.command, '（本机命令，见本机 profile）')
    assert.equal(run.body.commandSource, 'local')
    assert.equal(run.body.result.status, 'passed')
    assert.equal(run.body.item.workflow.tests.local.commandSource, 'local')
    // 台账（会提交）里不能出现本机命令原文
    const itemRaw = JSON.parse(await readFile(join(repo, `.dev-hub/items/${id}.json`), 'utf8'))
    assert.equal(itemRaw.workflow.tests.local.command, '（本机命令，见本机 profile）')
    assert.equal(itemRaw.workflow.tests.local.commandSource, 'local')
    assert.doesNotMatch(JSON.stringify(itemRaw.workflow.tests), /\"command\":\"true\"/)

    // 清空本机命令：回到项目命令
    const cleared = await call(routes, API.project, { method: 'POST', body: { localCommands: {} } })
    assert.deepEqual(cleared.body.localCommands, {})
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('devhub_update 自动绑定调用它的会话，避免「有进展但显示未开会话」', async () => {
  const repo = await tempRepo()
  const { ctx, routes, tools } = fakeContext(repo)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
    const created = await call(routes, API.items, {
      method: 'POST',
      body: {
        title: '自动绑定流程',
        goal: '有进展就要有会话',
        acceptance: ['能更新'],
        workflow: {
          rootProblem: '台账被直接写入',
          techDoc: { decision: 'none' },
          plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1 } },
        },
      },
    })
    const id = created.body.item.id
    const update = tools.get('devhub_update')
    assert.ok(update, '应注册 devhub_update 工具')

    await update.execute(
      { id, taskText: '写测试', taskDone: true },
      { agent: { session: { header: { cwd: repo, id: 'session-auto-bind' } } } },
    )
    const plain = await call(routes, API.item, { queryParams: { id } })
    assert.equal(plain.body.item.session.id, 'session-auto-bind')
    assert.match(JSON.stringify(plain.body.item.history), /自动绑定更新流程的开发会话/)

    // 已绑定时不被后续更新的其他会话改绑
    await update.execute(
      { id, taskText: '写测试', taskDone: true },
      { agent: { session: { header: { cwd: repo, id: 'session-other' } } } },
    )
    const again = await call(routes, API.item, { queryParams: { id } })
    assert.equal(again.body.item.session.id, 'session-auto-bind')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('host rejects non-loopback requests', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    const req = Readable.from([])
    req.method = 'GET'
    req.url = API.state
    req.socket = { remoteAddress: '10.0.0.8' }
    const res = fakeResponse()
    await routes.get(API.state).handler(req, res)
    assert.equal(res.status, 403)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('recon 显式 repoPath：切库后旧聊天不会拿 activeRepo 去扫错库', async () => {
  const repoA = await tempRepo()
  const repoB = await tempRepo()
  const { ctx, routes } = fakeContext(repoA)
  try {
    apply(ctx)
    await call(routes, API.setup, { method: 'POST', body: { repoPath: repoA, name: '张三' } })
    // 登记 B 后切回 A：模拟用户在开发站切换代码库
    await call(routes, API.switchRepo, { method: 'POST', body: { repoPath: repoB, name: '张三', detect: false } })
    await call(routes, API.switchRepo, { method: 'POST', body: { repoPath: repoA, name: '张三', detect: false } })
    await mkdir(join(repoB, 'src'), { recursive: true })
    await writeFile(join(repoB, 'src/needle-report.mjs'), 'export const needleReport = true\n', 'utf8')

    const pinned = await call(routes, API.recon, {
      method: 'POST',
      body: { description: 'needle report 需要改一下', repoPath: repoB, engine: 'local' },
    })
    assert.equal(pinned.status, 200)
    assert.equal(await realpath(pinned.body.repoPath), await realpath(repoB))
    assert.ok((pinned.body.files ?? []).some((file) => file.path === 'src/needle-report.mjs'))
    // activeRepo 仍是 A；证明扫描用了请求里显式指定的 B
    const state = await call(routes, API.state)
    assert.ok(state.body.repo.path.endsWith(repoA.split('/').pop()))

    const denied = await call(routes, API.recon, {
      method: 'POST',
      body: { description: 'needle report 需要改一下', repoPath: join(repoB, 'not-registered'), engine: 'local' },
    })
    assert.equal(denied.status, 400)
    assert.match(denied.body.error, /未登记/)
  } finally {
    await rm(repoA, { recursive: true, force: true })
    await rm(repoB, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

async function createFlowForReview(repo, routes) {
  await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
  await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
  await call(routes, API.wizard, {
    method: 'POST',
    body: { action: 'create', entry: 'chat', description: '给流程加独立评审', id: 'review-gate', scope: ['src'] },
  })
  await call(routes, API.session, { method: 'POST', body: { action: 'bind', id: 'review-gate', sessionId: 's-review' } })
  const local = await call(routes, API.test, {
    method: 'POST', body: { id: 'review-gate', phase: 'local', command: 'node -e "process.exit(0)"' },
  })
  assert.equal(local.body.item.workflow.stage, 'review')
}

test('独立评审：不通过退回开发并附纠偏意见；异常显式待处理；人工结论可追溯', async () => {
  // 场景 A：一位审核员不通过 → 流程回到开发，纠偏意见可追溯
  const repoA = await tempRepo()
  const a = fakeContext(repoA, {
    withReviewAgents: true,
    reviewerOutput: (spec) => (String(spec.label).includes('reviewer-1')
      ? {
          verdict: 'fail',
          summary: '方向偏了：只处理了 happy path',
          findings: [{ severity: 'major', summary: '少了回滚路径', detail: '提交失败时没有补偿动作', file: 'README.md' }],
          confidence: 'high',
        }
      : { verdict: 'pass', summary: '实现正确', findings: [], confidence: 'high' }),
  })
  try {
    apply(a.ctx)
    await createFlowForReview(repoA, a.routes)

    const failed = await call(a.routes, API.review, { method: 'POST', body: { id: 'review-gate', action: 'dispatch', count: 2 } })
    assert.equal(failed.status, 200)
    assert.equal(failed.body.ok, false, '评审不通过不是路由错误，但也不能返回 ok=true')
    assert.equal(failed.body.review.status, 'failed')
    assert.equal(failed.body.item.workflow.stage, 'develop', '评审不通过必须退回开发')
    const corrections = failed.body.review.corrections
    assert.equal(corrections.length, 1)
    assert.match(corrections[0].findings[0], /少了回滚路径/)
    const reread = await call(a.routes, API.item, { queryParams: { id: 'review-gate' } })
    assert.equal(reread.body.item.workflow.review.status, 'failed')
    assert.equal(reread.body.item.workflow.review.reviewers[0].verdict, 'fail')

    // 人工记录（审核员会话不可用时的兜底）：显式标 source=manual，不伪装成自动评审
    // 评审是软门禁：显式 override 才能忽略拒绝并继续交付，原 findings 必须保留
    const overridden = await call(a.routes, API.review, {
      method: 'POST',
      body: { id: 'review-gate', action: 'override', summary: '确认忽略本轮拒绝' },
    })
    assert.equal(overridden.status, 200)
    assert.equal(overridden.body.review.status, 'passed')
    assert.equal(overridden.body.item.workflow.stage, 'verify')
    const overriddenReviewer = overridden.body.review.reviewers.find((entry) => entry.id === 'reviewer-1')
    assert.equal(overriddenReviewer.source, 'manual')
    assert.ok(overriddenReviewer.findings.some((finding) => /少了回滚路径/.test(finding.summary)), '人工通过不能抹掉原始审核意见')

    // 清空本轮：回到等待评审，历史轮次仍可追溯
    const reset = await call(a.routes, API.review, { method: 'POST', body: { id: 'review-gate', action: 'reset' } })
    assert.equal(reset.body.review.status, 'idle')
    assert.equal(reset.body.item.workflow.stage, 'review')
    assert.ok(reset.body.review.history.length >= 1)
  } finally {
    await rm(repoA, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('独立评审：已有 pending 评审时再派发保持幂等，不重复起审核员、不开启新轮次', async () => {
  const repo = await tempRepo()
  const a = fakeContext(repo, { withReviewAgents: true })
  try {
    apply(a.ctx)
    await createFlowForReview(repo, a.routes)
    // 先跑一轮（审核员立即返回）：确认审核员会话只起过一次的基线
    const first = await call(a.routes, API.review, { method: 'POST', body: { id: 'review-gate', action: 'dispatch' } })
    assert.equal(first.status, 200)
    assert.equal(first.body.review.status, 'passed')
    assert.equal(first.body.review.total, 2, '未指定数量时按默认配置派 2 位审核员')
    const callsAfterFirst = a.reviewLabels.length

    // 把台账置为「评审中」（模拟另一处已派发 / 页面刷新前的 pending 状态）
    const read = await call(a.routes, API.item, { queryParams: { id: 'review-gate' } })
    const pendingItem = read.body.item
    pendingItem.workflow.review = {
      status: 'pending',
      round: 2,
      reviewers: [
        { id: 'reviewer-1', label: '审核员 1（方向）', role: 'direction', status: 'pending' },
        { id: 'reviewer-2', label: '审核员 2（正确性）', role: 'correctness', status: 'pending' },
      ],
      history: pendingItem.workflow.review.history ?? [],
    }
    await call(a.routes, API.items, { method: 'POST', body: pendingItem })

    // 再派发：幂等返回 pending，不再起审核员
    const again = await call(a.routes, API.review, { method: 'POST', body: { id: 'review-gate', action: 'dispatch' } })
    assert.equal(again.status, 200)
    assert.equal(again.body.review.status, 'pending')
    assert.equal(again.body.item.workflow.review.round, 2, 'pending 时不应开启新轮次')
    assert.equal(a.reviewLabels.length, callsAfterFirst, 'pending 时不应再起审核员会话')
    assert.equal(again.body.review.reviewers.filter((entry) => entry.status === 'pending').length, 2)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('独立评审：审核员会话异常时标记待处理，绝不当成通过', async () => {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo, {
    withReviewAgents: true,
    reviewerOutput: (spec) => (String(spec.label).includes('reviewer-2')
      ? new Error('provider down')
      : { verdict: 'pass', summary: '通过', findings: [] }),
  })
  try {
    apply(ctx)
    await createFlowForReview(repo, routes)
    const dispatched = await call(routes, API.review, { method: 'POST', body: { id: 'review-gate', action: 'dispatch', count: 2 } })
    assert.equal(dispatched.status, 200)
    assert.equal(dispatched.body.ok, false)
    assert.equal(dispatched.body.review.status, 'error')
    assert.equal(dispatched.body.item.workflow.stage, 'review')
    const errored = dispatched.body.review.reviewers.find((entry) => entry.id === 'reviewer-2')
    assert.match(errored.error, /provider down/)
    // 环境测试仍被挡住：异常不是通过
    const env = await call(routes, API.test, {
      method: 'POST', body: { id: 'review-gate', phase: 'environment', command: 'node -e "process.exit(0)"' },
    })
    assert.equal(env.status, 400)
    assert.match(env.body.error, /待处理/)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})
