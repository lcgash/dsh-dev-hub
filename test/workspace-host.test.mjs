import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

// 本机 profile 独立目录：测试之间 resetHome() 清空，避免互相影响。
// 虚拟库的本机存储跟着 DEVHUB_HOME 一起隔离（<home>/workspaces/<id>）。
const home = await mkdtemp(join(tmpdir(), 'devhub-ws-host-home-'))
process.env.DEVHUB_HOME = home

const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')
const { workspaceLocalDir } = await import('../src/core/store.mjs')

async function resetHome() {
  await rm(home, { recursive: true, force: true })
  await mkdir(home, { recursive: true })
}

async function tempRepo({ files = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-ws-host-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'README.md'), '# demo\n', 'utf8')
  for (const [rel, content] of Object.entries(files)) {
    const target = join(dir, rel)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
  }
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

function gitOut(dir, args) {
  return execFileSync('git', ['-C', dir, ...args]).toString().trim()
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

async function call(routes, path, { method = 'GET', body, queryParams } = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(queryParams ?? {})) params.set(key, String(value))
  const url = path + (params.size ? '?' + params.toString() : '')
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

async function cleanupRepos(...repos) {
  for (const repo of repos) await rm(repo, { recursive: true, force: true })
}

/** 两个 git 临时库 + 已建好的虚拟库（新建走本机目录，不初始化任何成员库）。 */
async function workspaceFixture(label = '前后端组合') {
  await resetHome()
  const repoA = await tempRepo({
    files: { 'src/source/AlertService.java': 'class AlertService {\n  // alert retry source\n}\n' },
  })
  const repoB = await tempRepo({
    files: { 'src/source/AlertView.ts': '// alert retry source\nexport const alertView = 1\n' },
  })
  const { ctx, routes } = fakeContext(repoA)
  apply(ctx)
  const created = await call(routes, API.workspaces, {
    method: 'POST',
    body: { name: label, repos: [repoA, repoB], member: '张三' },
  })
  assert.equal(created.status, 200, JSON.stringify(created.body).slice(0, 500))
  const memberRows = created.body.state?.workspace?.members ?? []
  return {
    repoA,
    repoB,
    routes,
    label,
    workspace: created.body.workspace,
    localPath: created.body.localPath,
    state: created.body.state,
    memberRows,
    names: memberRows.map((member) => member.name),
  }
}

const reconRequest = (routes, extra = {}) => call(routes, API.recon, {
  method: 'POST',
  body: { description: 'source alert retry', engine: 'local', reconAll: true, ...extra },
})

/** 创建流程并开工，返回 recon/create/start 三份结果，供后续断言复用。 */
async function startedWorkspaceFlow(label = '前后端组合') {
  const fixture = await workspaceFixture(label)
  const recon = await reconRequest(fixture.routes)
  assert.equal(recon.status, 200, JSON.stringify(recon.body).slice(0, 500))
  const created = await call(fixture.routes, API.wizard, {
    method: 'POST',
    body: {
      action: 'create',
      entry: 'chat',
      description: 'source alert retry',
      name: '前后端联动',
      id: 'wsflow',
      scope: recon.body.suggestedScope,
      recon: {
        files: recon.body.files,
        suggestedScope: recon.body.suggestedScope,
        tokens: recon.body.tokens,
        provenance: recon.body.provenance,
      },
    },
  })
  assert.equal(created.status, 200, JSON.stringify(created.body).slice(0, 500))
  const start = await call(fixture.routes, API.start, { method: 'POST', body: { id: 'wsflow' } })
  assert.equal(start.status, 200, JSON.stringify(start.body).slice(0, 500))
  return { ...fixture, recon: recon.body, created: created.body, start: start.body, itemId: created.body.item.id }
}

/** 成员库自建库以来不能出现/改动 `.dev-hub`：虚拟库一个字节都不写成员库。 */
async function assertNoRepoDevHub(...repos) {
  for (const repo of repos) {
    await assert.rejects(
      () => stat(join(repo, '.dev-hub')),
      `虚拟库不能写成员库 .dev-hub：${repo}`,
    )
  }
}

test('虚拟库：创建只建本机独立目录，成员库平权、不初始化任何成员库', async () => {
  const fixture = await workspaceFixture('平权组合')
  const { repoA, repoB, routes, workspace, localPath, state, memberRows, names } = fixture
  try {
    const realA = await realpath(repoA)
    const realB = await realpath(repoB)

    // 本机独立目录：台账/规范/上下文/证据都在这，state.repo 不再指向某个成员库
    const expectedPath = workspaceLocalDir(workspace)
    assert.equal(localPath, expectedPath)
    assert.equal(state.repo.path, expectedPath, 'state.repo 是虚拟库本机目录，不是成员库')
    assert.equal(state.repo.kind, 'virtual-workspace')
    assert.equal(state.needsSetup, false)
    assert.equal(state.profile.activeRepo, `workspace:${workspace.id}`, '激活目标必须还是虚拟库')
    assert.ok(state.profile.repos.includes(realA), '成员库要登记本机身份')
    assert.ok(state.profile.repos.includes(realB), '成员库要登记本机身份')
    assert.equal(state.profile.repos.some((path) => path.includes(`${join('workspaces')}`)), false, '本机虚拟库目录不能混进代码库列表')

    // 虚拟库没有主库：workspace / members 都不带 primary
    assert.equal('primary' in workspace, false)
    assert.equal('primary' in state.workspace, false)
    assert.equal(state.workspace.path, expectedPath)
    assert.deepEqual(state.workspace.repos, [realA, realB])
    assert.equal(memberRows.length, 2)
    assert.deepEqual(memberRows.map((member) => member.path), [realA, realB])
    for (const member of memberRows) {
      assert.equal('primary' in member, false, `成员库不能有主库标记：${member.name}`)
      assert.equal(member.initialized, false, '虚拟库不初始化任何成员库')
      assert.equal(member.isRepo, true)
      assert.ok(member.head)
      assert.ok(member.branch)
      assert.equal(member.member, '张三')
    }

    // 成员库的磁盘没有被虚拟库碰过
    await assertNoRepoDevHub(repoA, repoB)

    // 本机目录里能看到清单/项目/规范/子目录
    assert.ok((await stat(join(expectedPath, 'workspace.json'))).isFile())
    assert.ok((await stat(join(expectedPath, 'project.json'))).isFile())
    assert.ok((await stat(join(expectedPath, 'conventions.json'))).isFile())
    const manifest = JSON.parse(await readFile(join(expectedPath, 'workspace.json'), 'utf8'))
    assert.equal(manifest.kind, 'virtual-workspace')
    assert.equal(manifest.id, workspace.id)
    assert.deepEqual(manifest.repos, [realA, realB])
    const conventions = JSON.parse(await readFile(join(expectedPath, 'conventions.json'), 'utf8'))
    assert.ok(Array.isArray(conventions.constraints), '规范技能落在本机目录')

    const list = await call(routes, API.workspaces)
    assert.equal(list.status, 200)
    const listed = list.body.workspaces.find((entry) => entry.id === workspace.id)
    assert.ok(listed)
    assert.equal(listed.path, expectedPath)
    assert.equal('primary' in listed, false)
    assert.equal('primaryName' in listed, false)

    // 切到单库再切回来：workspace 仍可恢复（切单库会做单库自己的初始化，属既有行为）
    const single = await call(routes, API.switchRepo, { method: 'POST', body: { repoPath: repoB, name: '张三', detect: false } })
    assert.equal(single.status, 200, JSON.stringify(single.body).slice(0, 300))
    assert.equal(single.body.workspace, null)
    assert.equal(single.body.repo.kind, 'repo')
    assert.equal(single.body.repo.path, await realpath(repoB))
    const back = await call(routes, API.switchRepo, { method: 'POST', body: { workspaceId: workspace.id } })
    assert.equal(back.status, 200)
    assert.equal(back.body.workspace?.id, workspace.id)
    assert.equal(back.body.profile.activeRepo, `workspace:${workspace.id}`)
    assert.equal(back.body.repo.kind, 'virtual-workspace')
    assert.equal(back.body.repo.path, expectedPath)
    // 虚拟库自己的规范文件在切库后仍然从本机目录读（不受成员库影响）
    assert.equal(back.body.conventions?.constraints > 0, true)
    assert.ok(names.every((name) => typeof name === 'string' && name.length > 0))

    // 从本机移除虚拟库：回到“未选择代码库”，不自动跳进某个成员库；本机台账数据不删
    const removed = await call(routes, API.workspaces, { method: 'POST', body: { action: 'remove', id: workspace.id } })
    assert.equal(removed.status, 200, JSON.stringify(removed.body).slice(0, 300))
    assert.equal(removed.body.state.repo, null)
    assert.equal(removed.body.state.profile.activeRepo, null)
    assert.ok((await stat(join(expectedPath, 'items'))).isDirectory(), '移除虚拟库不删除本机台账数据')
  } finally {
    await cleanupRepos(repoA, repoB)
  }
})

test('虚拟库：recon/建流程/start/上下文全部落本机台账，成员库 .dev-hub 不新增', async () => {
  const fixture = await startedWorkspaceFlow('本机存储组合')
  const { repoA, repoB, routes, workspace, localPath, names, itemId } = fixture
  try {
    const ledgerPath = join(localPath, 'items', `${itemId}.json`)
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'))
    // 每个 git 成员库一个独立 worktree；台账只记成员名/分支，不写绝对路径
    const worktrees = fixture.start.workspaceWorktrees ?? []
    assert.equal(worktrees.length, 2, JSON.stringify(worktrees))
    assert.equal(ledger.workflow.worktrees.length, 2)
    assert.ok(ledger.workflow.worktrees.every((entry) => entry.branch && entry.name && !entry.path))
    for (const entry of worktrees) {
      assert.match(entry.branch, /^devhub\//)
      assert.notEqual(entry.path, await realpath(names[0] === entry.name ? repoA : repoB))
      assert.ok((await stat(join(entry.path, '.git'))).isFile())
    }
    assert.equal(ledger.workspace?.id, workspace.id, '本机台账要自带虚拟库归属')
    assert.deepEqual(ledger.repos, [await realpath(repoA), await realpath(repoB)])
    assert.equal(ledger.baseline.repos.length, 2, '每库 baseline 写在本机台账')
    assert.equal(ledger.baseline.commit, null, '虚拟库没有代表库：顶层 commit 为 null')
    assert.equal(ledger.baseline.branch, null, '虚拟库没有代表库：顶层 branch 为 null')
    for (const entry of ledger.baseline.repos) {
      assert.ok(entry.commit, `成员库 ${entry.name} 要有 baseline commit`)
      assert.ok(entry.branch)
      assert.equal(entry.isRepo, true)
      assert.equal('primary' in entry, false)
    }

    // 仓库台账里不能再出现这条流程
    await assert.rejects(() => stat(join(repoA, '.dev-hub/items', `${itemId}.json`)))
    await assert.rejects(() => stat(join(repoB, '.dev-hub/items', `${itemId}.json`)))
    await assertNoRepoDevHub(repoA, repoB)

    // 上下文包与证据也在本机目录留档
    const contextFile = join(localPath, 'context', `${itemId}.json`)
    const contextSaved = JSON.parse(await readFile(contextFile, 'utf8'))
    assert.equal(contextSaved.itemId, itemId)
    assert.ok(contextSaved.contextHash)
    assert.ok(contextSaved.prompt.includes('【虚拟库】'))
    assert.ok((await stat(join(localPath, 'context', `${itemId}.md`))).isFile())
    const evidence = JSON.parse(await readFile(join(localPath, 'evidence', `${itemId}.json`), 'utf8'))
    assert.equal(evidence.repos.length, 2)
    assert.equal(evidence.workspace.id, workspace.id)

    // 列表/详情都带归属，且不落成员库
    const items = await call(routes, API.items)
    const row = items.body.items.find((entry) => entry.id === itemId)
    assert.equal(row?.workspace?.id, workspace.id, JSON.stringify(items.body.items))
    const detail = await call(routes, API.item, { queryParams: { id: itemId } })
    assert.equal(detail.body.item.baseline.repos.length, 2)
    assert.ok(names.every((name) => detail.body.item.repos.length === 2))
  } finally {
    await cleanupRepos(repoA, repoB)
  }
})

test('虚拟库：建流程入口与单库分流——scope 必须带成员前缀，台账写本机目录', async () => {
  const fixture = await workspaceFixture('入口组合')
  const { repoA, repoB, routes, localPath, workspace } = fixture
  try {
    const wizard = await call(routes, API.wizard)
    assert.equal(wizard.status, 200, JSON.stringify(wizard.body).slice(0, 300))
    assert.equal(wizard.body.repo.kind, 'virtual-workspace')
    assert.equal(wizard.body.repo.path, localPath)
    assert.equal(wizard.body.workspace?.id, workspace.id)
    assert.ok(wizard.body.modules.length >= 2, JSON.stringify(wizard.body.modules))
    for (const module of wizard.body.modules) {
      assert.match(module.path, /^[^:]+:/, `虚拟库模块路径要带成员前缀：${module.path}`)
    }

    // 不带成员前缀的 scope：虚拟库入口直接拒绝（成员库平权，不默认落到第一个库）
    const noPrefix = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: 'source alert retry', id: 'bad-scope', scope: ['src'] },
    })
    assert.equal(noPrefix.status, 400)
    assert.match(noPrefix.body.error, /成员库前缀/)

    // 带前缀正常创建：台账只在本机目录
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        entry: 'chat',
        description: 'source alert retry',
        id: 'entry-flow',
        scope: [`${fixture.names[0]}:src`, `${fixture.names[1]}:src`],
      },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body).slice(0, 400))
    assert.equal(created.body.ledger.kind, 'virtual-workspace')
    assert.equal(created.body.ledger.path, localPath)
    assert.equal(created.body.workspace.id, workspace.id)
    assert.ok((await stat(join(localPath, 'items', 'entry-flow.json'))).isFile())
    assert.ok(created.body.item.acceptance.some((entry) => entry.includes('按成员库分别执行')))
    await assertNoRepoDevHub(repoA, repoB)
  } finally {
    await cleanupRepos(repoA, repoB)
  }
})

test('虚拟库：recon 逐成员前缀 + 创建流程记录归属 + 计划按成员库分组', async () => {
  const fixture = await workspaceFixture('扫描组合')
  const { repoA, repoB, routes, names } = fixture
  try {
    const recon = await reconRequest(routes)
    assert.equal(recon.status, 200, JSON.stringify(recon.body).slice(0, 500))
    assert.equal(recon.body.workspace?.id, fixture.workspace.id)
    assert.equal(recon.body.workspace.path, fixture.localPath)
    assert.equal('primary' in (recon.body.workspace ?? {}), false, '扫描结果不能有主库')
    assert.equal('primaryName' in (recon.body.workspace ?? {}), false)
    assert.deepEqual(recon.body.members.map((member) => member.name), names)
    assert.equal(recon.body.files.length >= 2, true, '两个成员库都要有候选文件')
    for (const file of recon.body.files) {
      assert.ok(names.includes(file.repoName), JSON.stringify(file))
      assert.ok(file.repo, JSON.stringify(file))
      assert.equal(typeof file.relPath, 'string')
      assert.equal(file.path, `${file.repoName}/${file.relPath}`)
      assert.ok(Array.isArray(file.matches))
    }
    assert.ok(recon.body.suggestedScope.length >= 2, JSON.stringify(recon.body.suggestedScope))
    for (const token of recon.body.suggestedScope) {
      assert.ok(token.includes(':'), `建议 scope 要带成员前缀：${token}`)
      assert.ok(names.includes(token.split(':')[0]), `未知成员前缀：${token}`)
    }
    assert.ok(recon.body.estimate?.size, '虚拟库 recon 也要有自评工程量')
    assert.equal(recon.body.provenance?.engine, 'local')

    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        entry: 'chat',
        description: 'source alert retry',
        name: '前后端联动',
        id: 'wsflow',
        scope: recon.body.suggestedScope,
        recon: { files: recon.body.files, suggestedScope: recon.body.suggestedScope, tokens: recon.body.tokens, provenance: recon.body.provenance },
      },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body).slice(0, 500))
    const item = created.body.item
    assert.equal(item.workspace?.id, fixture.workspace.id)
    assert.equal(item.workspace?.name, '扫描组合')
    assert.deepEqual(item.repos, [await realpath(repoA), await realpath(repoB)])
    assert.ok(item.scope.every((entry) => entry.includes(':')), JSON.stringify(item.scope))

    // 计划按成员库分组：前后端同名模块不能塌成一个
    const plan = await call(routes, API.plan, {
      method: 'POST',
      body: { description: 'source alert retry', scope: item.scope, recon: { files: recon.body.files, suggestedScope: recon.body.suggestedScope } },
    })
    assert.equal(plan.status, 200, JSON.stringify(plan.body).slice(0, 300))
    assert.ok(plan.body.modules.some((module) => module.startsWith(`${names[0]}/`)), JSON.stringify(plan.body.modules))
    assert.ok(plan.body.modules.some((module) => module.startsWith(`${names[1]}/`)), JSON.stringify(plan.body.modules))

    // 本机台账可见、成员库磁盘不新增
    await assertNoRepoDevHub(repoA, repoB)
    assert.ok((await stat(join(fixture.localPath, 'items', 'wsflow.json'))).isFile())
  } finally {
    await cleanupRepos(repoA, repoB)
  }
})

test('虚拟库：编辑成员可移除/替换首个成员，已有流程 baseline 跟着收敛', async () => {
  const fixture = await startedWorkspaceFlow('编辑组合')
  const { repoA, repoB, routes, names, itemId, workspace, localPath } = fixture
  const repoC = await tempRepo({ files: { 'src/source/Extra.java': 'class Extra {}\n' } })
  try {
    const realA = await realpath(repoA)
    const realB = await realpath(repoB)
    const realC = await realpath(repoC)

    // 新增成员：本机身份 + 已有流程的 baseline 补一条当前 HEAD
    const added = await call(routes, API.workspaces, {
      method: 'POST',
      body: { action: 'update', id: workspace.id, name: '编辑组合-新', repos: [repoA, repoB, repoC] },
    })
    assert.equal(added.status, 200, JSON.stringify(added.body).slice(0, 400))
    assert.equal(added.body.workspace.name, '编辑组合-新')
    assert.equal(added.body.workspace.repos.length, 3)
    assert.deepEqual(added.body.added, [realC])
    const ledger1 = JSON.parse(await readFile(join(localPath, 'items', `${itemId}.json`), 'utf8'))
    assert.equal(ledger1.repos.length, 3)
    assert.ok(ledger1.baseline.repos.some((entry) => entry.path === realC), '新成员要补 baseline')
    const manifest1 = JSON.parse(await readFile(join(localPath, 'workspace.json'), 'utf8'))
    assert.equal(manifest1.name, '编辑组合-新')
    assert.deepEqual(manifest1.repos, [realA, realB, realC])

    // 移除一个非首位成员
    const removedB = await call(routes, API.workspaces, {
      method: 'POST',
      body: { action: 'update', id: workspace.id, repos: [repoA, repoC] },
    })
    assert.equal(removedB.status, 200, JSON.stringify(removedB.body).slice(0, 400))
    assert.deepEqual(removedB.body.removed, [realB])
    const ledger2 = JSON.parse(await readFile(join(localPath, 'items', `${itemId}.json`), 'utf8'))
    assert.deepEqual(ledger2.baseline.repos.map((entry) => entry.path).sort(), [realA, realC].sort())

    // 替换掉“原来的第一个成员”：以前会报「主库不能移除」，现在必须允许
    const replacedFirst = await call(routes, API.workspaces, {
      method: 'POST',
      body: { action: 'update', id: workspace.id, repos: [repoB, repoC] },
    })
    assert.equal(replacedFirst.status, 200, JSON.stringify(replacedFirst.body).slice(0, 400))
    assert.deepEqual(replacedFirst.body.removed, [realA])
    assert.deepEqual(replacedFirst.body.workspace.repos, [realB, realC], '成员顺序按用户给的来，不强制把旧首个放回去')
    const ledger3 = JSON.parse(await readFile(join(localPath, 'items', `${itemId}.json`), 'utf8'))
    assert.deepEqual(ledger3.repos, [realB, realC])
    assert.deepEqual(ledger3.baseline.repos.map((entry) => entry.path).sort(), [realB, realC].sort())
    assert.equal(ledger3.baseline.commit, null)
    await assertNoRepoDevHub(repoA, repoB, repoC)

    // 仍然要求 ≥2 个不同代码库
    const bad = await call(routes, API.workspaces, {
      method: 'POST',
      body: { action: 'update', id: workspace.id, repos: [repoB] },
    })
    assert.equal(bad.status, 400)
    assert.match(bad.body.error, /两个/)
    assert.ok(names.length === 2)
  } finally {
    await cleanupRepos(repoA, repoB, repoC)
  }
})

test('虚拟库：Context Pack 无主库表述、区分单库形态，成员 HEAD 变化换 contextHash', async () => {
  const fixture = await startedWorkspaceFlow('上下文组合')
  const { repoA, repoB, routes, names, itemId, localPath } = fixture
  const workRoots = Object.fromEntries((fixture.start.workspaceWorktrees ?? []).map((entry) => [entry.name, entry.path]))
  try {
    const first = await call(routes, API.context, { method: 'POST', body: { id: itemId } })
    const second = await call(routes, API.context, { method: 'POST', body: { id: itemId } })
    assert.equal(first.status, 200, JSON.stringify(first.body).slice(0, 300))
    assert.equal(first.body.context.contextHash, second.body.context.contextHash, '无变化时 contextHash 稳定')

    const prompt = first.body.context.prompt
    assert.match(prompt, /【虚拟库】上下文组合/)
    assert.match(prompt, /成员库平权/)
    assert.match(prompt, /本机台账/)
    assert.match(prompt, /【仓库事实】（虚拟库：以各成员库为准）/)
    assert.doesNotMatch(prompt, /主库/, '上下文包不能再出现主库文案')
    assert.doesNotMatch(prompt, /写入主库/, '上下文包不能再要求写主库')
    for (const member of fixture.memberRows) {
      assert.ok(prompt.includes(member.name), `prompt 缺少成员 ${member.name}`)
      assert.ok(prompt.includes(member.path), `prompt 缺少成员路径 ${member.path}`)
      if (member.head) assert.ok(prompt.includes(`HEAD ${member.head}`), `prompt 缺少 ${member.name} HEAD ${member.head}`)
    }
    assert.ok(prompt.includes(localPath), '上下文要说明本机台账位置')
    assert.ok(first.body.workspace, 'context 响应要带 workspace 事实')
    assert.equal('primary' in first.body.workspace, false)
    assert.equal(first.body.workspace.members.length, 2)
    assert.equal(first.body.context.summary.workspace.localPath, localPath)

    // 成员库 B 提交一次：HEAD 变化必须换哈希，并把该库变更写进上下文
    await writeFile(join(workRoots[names[1]], 'CHANGELOG.md'), '# changelog\n', 'utf8')
    gitOut(workRoots[names[1]], ['add', '.'])
    gitOut(workRoots[names[1]], ['commit', '-qm', 'api change'])
    const headB = gitOut(workRoots[names[1]], ['rev-parse', '--short', 'HEAD'])
    const after = await call(routes, API.context, { method: 'POST', body: { id: itemId } })
    assert.equal(after.status, 200)
    assert.notEqual(after.body.context.contextHash, first.body.context.contextHash, 'HEAD 变了 contextHash 必须变')
    assert.ok(after.body.context.prompt.includes(`HEAD ${headB}`))
    assert.ok(after.body.context.prompt.includes(`${names[1]}/CHANGELOG.md`), '成员库变更要带前缀进上下文')

    // 改动另一个成员库同样要换哈希（不能只看第一个库）
    await writeFile(join(workRoots[names[0]], 'CHANGELOG.md'), '# changelog a\n', 'utf8')
    gitOut(workRoots[names[0]], ['add', '.'])
    gitOut(workRoots[names[0]], ['commit', '-qm', 'web change'])
    const afterA = await call(routes, API.context, { method: 'POST', body: { id: itemId } })
    assert.notEqual(afterA.body.context.contextHash, after.body.context.contextHash)
    assert.ok(afterA.body.context.prompt.includes(`${names[0]}/CHANGELOG.md`))
    await assertNoRepoDevHub(repoA, repoB)
  } finally {
    await cleanupRepos(repoA, repoB)
  }
})

test('虚拟库：files/changes/diff/test/submit 按库聚合，成员库 .dev-hub 全程不被写', async () => {
  const fixture = await startedWorkspaceFlow('变更组合')
  const { repoA, repoB, routes, names, itemId, localPath } = fixture
  const workRoots = Object.fromEntries((fixture.start.workspaceWorktrees ?? []).map((entry) => [entry.name, entry.path]))
  let remoteA = null
  try {
    await writeFile(join(workRoots[names[0]], 'README.md'), '# demo A changed\n', 'utf8')
    await writeFile(join(workRoots[names[1]], 'README.md'), '# demo B changed\n', 'utf8')
    // 主工作区的未提交改动不能混进任何成员库的变更
    await writeFile(join(repoA, 'main-only.txt'), 'main workspace\n', 'utf8')

    const files = await call(routes, API.files, { queryParams: { itemId } })
    assert.equal(files.status, 200, JSON.stringify(files.body).slice(0, 500))
    assert.ok(files.body.files.length >= 2, JSON.stringify(files.body.files))
    for (const file of files.body.files) {
      assert.ok(file.repo, JSON.stringify(file))
      assert.ok(file.repoName, JSON.stringify(file))
      assert.ok(names.includes(file.repoName), `未知 repoName：${file.repoName}`)
      assert.equal(file.key, `${file.repoName}/${file.path}`, JSON.stringify(file))
      assert.ok(file.displayPath, '聚合文件要有 displayPath')
      assert.equal(typeof file.inScope, 'boolean')
    }
    for (const row of files.body.repos) assert.equal('primary' in row, false, '证据行不能有主库标记')
    assert.ok(files.body.files.some((file) => file.repoName === names[0] && file.path === 'README.md'))
    assert.ok(files.body.files.some((file) => file.repoName === names[1] && file.path === 'README.md'))
    assert.equal(files.body.files.some((file) => file.path === 'main-only.txt'), false, '主工作区改动不能混进成员库变更')
    // 证据快照落本机目录
    const evidence = JSON.parse(await readFile(join(localPath, 'evidence', `${itemId}.json`), 'utf8'))
    assert.equal(evidence.repos.length, 2)

    const changes = await call(routes, API.changes, { queryParams: { id: itemId } })
    assert.equal(changes.status, 200, JSON.stringify(changes.body).slice(0, 500))
    assert.equal(changes.body.workspace.path, localPath)
    assert.equal('primary' in changes.body.workspace, false)
    assert.equal(changes.body.branch, null, '虚拟库没有代表库分支')
    assert.equal(changes.body.branches.length, 2)
    assert.ok(changes.body.suggestedPaths.includes(`${names[0]}/README.md`), JSON.stringify(changes.body.suggestedPaths))
    assert.ok(changes.body.suggestedPaths.includes(`${names[1]}/README.md`))
    assert.equal(changes.body.suggestedPaths.some((path) => path.includes('.dev-hub')), false, '不能把成员库 .dev-hub 塞进提交')

    const viaPath = await call(routes, API.diff, { queryParams: { itemId, path: 'README.md', repo: workRoots[names[1]] } })
    assert.equal(viaPath.status, 200, JSON.stringify(viaPath.body).slice(0, 300))
    assert.ok(viaPath.body.file.lines.some((line) => line.type === 'added'), 'diff 要能读到成员库的改动')
    assert.equal(viaPath.body.repoName, names[1])
    const viaLabel = await call(routes, API.diff, { queryParams: { itemId, path: `${names[1]}/README.md` } })
    assert.equal(viaLabel.status, 200, JSON.stringify(viaLabel.body).slice(0, 300))
    assert.ok(viaLabel.body.file.lines.length > 0)
    const noMember = await call(routes, API.diff, { queryParams: { itemId, path: 'README.md' } })
    assert.equal(noMember.status, 400, '没有成员前缀/参数时必须显式报错，不能默认落到第一个成员库')

    const tested = await call(routes, API.test, {
      method: 'POST',
      body: { id: itemId, phase: 'local', command: 'node -e "process.exit(0)"' },
    })
    assert.equal(tested.status, 200, JSON.stringify(tested.body).slice(0, 500))
    assert.equal(tested.body.ok, true)
    assert.equal(tested.body.result.repos.length, 2)
    assert.ok(tested.body.result.repos.every((row) => row.status === 'passed'), JSON.stringify(tested.body.result.repos))
    assert.equal(tested.body.item.workflow.tests.local.status, 'passed')
    assert.equal(tested.body.item.workflow.tests.local.repos.length, 2)

    // A 有可达远端；B 配了远端但不可达 → B 已提交但 push 失败，A 的提交不能被隐藏
    remoteA = await mkdtemp(join(tmpdir(), 'devhub-ws-remote-'))
    execFileSync('git', ['init', '--bare', '-q'], { cwd: remoteA })
    gitOut(repoA, ['remote', 'add', 'origin', remoteA])
    gitOut(repoB, ['remote', 'add', 'origin', join(tmpdir(), 'devhub-ws-remote-missing-does-not-exist')])

    const submitted = await call(routes, API.submit, {
      method: 'POST',
      body: {
        id: itemId,
        paths: [`${names[0]}/README.md`, `${names[1]}/README.md`],
        message: 'test: workspace changes',
      },
    })
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body).slice(0, 500))
    assert.equal(submitted.body.ok, false, '部分失败必须如实返回 ok:false')
    assert.equal(submitted.body.repos.length, 2)
    const pushed = submitted.body.repos.find((row) => row.name === names[0])
    const failed = submitted.body.repos.find((row) => row.name === names[1])
    assert.ok(pushed && failed, JSON.stringify(submitted.body.repos))
    assert.equal(pushed.pushed, true)
    assert.equal(pushed.status, 'pushed')
    assert.ok(pushed.commit)
    assert.equal(failed.pushed, false)
    assert.ok(failed.commit, 'push 失败也要保留已经成功的 commit')
    assert.ok(failed.error, '失败原因要显式返回')

    const persisted = JSON.parse(await readFile(join(localPath, 'items', `${itemId}.json`), 'utf8'))
    assert.equal(persisted.workflow.submission.repos.length, 2, '逐库提交结果写在本机台账')
    assert.equal(persisted.workflow.submission.repos.find((row) => row.name === names[0])?.pushed, true)
    assert.ok(persisted.workflow.submission.repos.find((row) => row.name === names[1])?.commit)

    assert.match(gitOut(workRoots[names[0]], ['log', '-1', '--pretty=%s']), /workspace changes/)
    assert.equal(gitOut(workRoots[names[1]], ['rev-parse', '--short', 'HEAD']), failed.commit)
    await assertNoRepoDevHub(repoA, repoB)
  } finally {
    if (remoteA) await rm(remoteA, { recursive: true, force: true })
    await cleanupRepos(repoA, repoB)
  }
})

test('虚拟库：规范技能/本机命令/扫库都走本机目录，成员库 .dev-hub 不新增', async () => {
  const fixture = await startedWorkspaceFlow('规范组合')
  const { repoA, repoB, routes, localPath } = fixture
  try {
    const skills = await call(routes, API.skills)
    assert.equal(skills.status, 200, JSON.stringify(skills.body).slice(0, 300))
    assert.equal(skills.body.path, 'conventions.json', '虚拟库规范路径是它自己的本机目录')
    assert.ok((await stat(join(localPath, 'conventions.json'))).isFile())

    const installed = await call(routes, API.skills, {
      method: 'POST',
      body: { action: 'install', skillId: 'frontend-ui' },
    })
    assert.equal(installed.status, 200, JSON.stringify(installed.body).slice(0, 300))
    assert.ok(installed.body.conventions.installedSkills.some((entry) => entry.id === 'frontend-ui'))
    const localConventions = JSON.parse(await readFile(join(localPath, 'conventions.json'), 'utf8'))
    assert.ok(localConventions.installedSkills.some((entry) => entry.id === 'frontend-ui'))

    const project = await call(routes, API.project, {
      method: 'POST',
      body: { localCommands: { localTest: 'node -e "process.exit(0)"' } },
    })
    assert.equal(project.status, 200, JSON.stringify(project.body).slice(0, 300))
    assert.equal(project.body.localCommands.localTest, 'node -e "process.exit(0)"')
    const state = await call(routes, API.state)
    assert.equal(state.body.localCommands.localTest, 'node -e "process.exit(0)"', '虚拟库本机命令记在虚拟库自身')

    const scanned = await call(routes, API.scan)
    assert.equal(scanned.status, 200, JSON.stringify(scanned.body).slice(0, 300))
    assert.ok(Array.isArray(scanned.body.candidates))

    await assertNoRepoDevHub(repoA, repoB)
  } finally {
    await cleanupRepos(repoA, repoB)
  }
})

test('虚拟库：删除流程只清本机台账与留档，不动成员库', async () => {
  const fixture = await startedWorkspaceFlow('删除组合')
  const { repoA, repoB, routes, itemId, localPath } = fixture
  try {
    assert.ok((await stat(join(localPath, 'context', `${itemId}.json`))).isFile())
    const deleted = await call(routes, API.deleteItem, { method: 'POST', body: { id: itemId } })
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body).slice(0, 300))
    await assert.rejects(() => stat(join(localPath, 'items', `${itemId}.json`)))
    await assert.rejects(() => stat(join(localPath, 'context', `${itemId}.json`)))
    await assertNoRepoDevHub(repoA, repoB)
  } finally {
    await cleanupRepos(repoA, repoB)
  }
})

test('单库回归：普通流程上下文没有【虚拟库】，baseline 不写 repos，台账仍在仓库 .dev-hub', async () => {
  await resetHome()
  const repo = await tempRepo({ files: { 'src/source/Alert.java': 'class Alert {}\n' } })
  const { ctx, routes } = fakeContext(repo)
  try {
    apply(ctx)
    const setup = await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '李四' } })
    assert.equal(setup.status, 200)
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: 'source alert retry', id: 'single-flow', scope: ['src'] },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body).slice(0, 300))
    assert.equal(created.body.item.workspace ?? null, null)
    assert.equal((created.body.item.repos ?? []).length, 0)

    const start = await call(routes, API.start, { method: 'POST', body: { id: 'single-flow' } })
    assert.equal(start.status, 200, JSON.stringify(start.body).slice(0, 300))
    assert.equal(start.body.item.baseline.repos, undefined, '单库 baseline 保持旧结构')
    assert.doesNotMatch(start.body.context.prompt, /【虚拟库】/)
    assert.equal(start.body.workspace, undefined)

    const recon = await call(routes, API.recon, { method: 'POST', body: { description: 'source alert retry', engine: 'local' } })
    assert.equal(recon.status, 200)
    assert.equal(recon.body.workspace, undefined)
    assert.ok(recon.body.files.some((file) => file.path === 'src/source/Alert.java'))

    // 单库台账位置不变：仍然写仓库 .dev-hub
    const ledger = JSON.parse(await readFile(join(repo, '.dev-hub/items/single-flow.json'), 'utf8'))
    assert.equal(ledger.id, 'single-flow')
    const state = await call(routes, API.state)
    assert.equal(state.body.repo.kind, 'repo')
    assert.equal(state.body.repo.path, await realpath(repo))
  } finally {
    await cleanupRepos(repo)
  }
})

test('虚拟库本机目录被误登记为代码库：state/setup/switch 自动还原，不再弹初始化', async () => {
  const fixture = await workspaceFixture('误登记修复')
  try {
    const profilePath = join(home, 'profile.json')
    const profile = JSON.parse(await readFile(profilePath, 'utf8'))
    // 复现线上坏 profile：activeRepo 指向虚拟库本机目录，repos 里多一张假代码库卡，
    // 且 workspace 丢了 member（旧数据），state 曾因此误判 needsSetup。
    profile.activeRepo = fixture.localPath
    profile.repos[fixture.localPath] = { member: 's', environment: {} }
    for (const workspace of profile.workspaces ?? []) {
      if (workspace.id === fixture.workspace.id) delete workspace.member
    }
    await writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf8')

    const state = await call(fixture.routes, API.state)
    assert.equal(state.status, 200, JSON.stringify(state.body).slice(0, 300))
    assert.equal(state.body.needsSetup, false, '虚拟库已有台账，不应弹初始化')
    assert.equal(state.body.repo.kind, 'virtual-workspace')
    assert.equal(state.body.workspace?.id, fixture.workspace.id)
    assert.equal(state.body.profile.member, '张三', 'workspace.member 丢了也要从成员库身份补回来')

    const repaired = JSON.parse(await readFile(profilePath, 'utf8'))
    assert.equal(repaired.activeRepo, `workspace:${fixture.workspace.id}`)
    assert.equal(repaired.repos[fixture.localPath], undefined, '假代码库卡要清掉')

    // 旧界面把本机目录提交给 setup / switchRepo：应切回虚拟库，而不是初始化它
    const setup = await call(fixture.routes, API.setup, { method: 'POST', body: { repoPath: fixture.localPath, name: 's' } })
    assert.equal(setup.status, 200, JSON.stringify(setup.body).slice(0, 300))
    assert.equal(setup.body.repo.kind, 'virtual-workspace')
    assert.equal(setup.body.workspace?.id, fixture.workspace.id)

    const switched = await call(fixture.routes, API.switchRepo, { method: 'POST', body: { repoPath: fixture.localPath } })
    assert.equal(switched.status, 200, JSON.stringify(switched.body).slice(0, 300))
    assert.equal(switched.body.repo.kind, 'virtual-workspace')
    assert.equal(switched.body.workspace?.id, fixture.workspace.id)
  } finally {
    await cleanupRepos(fixture.repoA, fixture.repoB)
  }
})
