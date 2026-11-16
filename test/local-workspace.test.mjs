/**
 * 虚拟库本机独立存储 + 规范/技能的本机路径读写接口。
 *
 * 这些用例直接打 core 层：不经过 Host，验证「虚拟库数据不落成员库 .dev-hub」的底层契约。
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

// 先隔离本机目录，再 import（workspacesRoot 每次调用都读环境变量，这里仍然先设好）
const home = await mkdtemp(join(tmpdir(), 'devhub-local-ws-home-'))
process.env.DEVHUB_HOME = home

const store = await import('../src/core/store.mjs')
const local = await import('../src/core/local-workspace.mjs')
const conventions = await import('../src/core/conventions.mjs')

test('local-workspace: 本机根目录跟着 DEVHUB_HOME 隔离，纯路径判断能识别软链', async () => {
  assert.equal(store.workspacesRoot(), join(home, 'workspaces'))
  // 没有任何覆盖时，默认就是验收要求的 ~/.dev-hub/workspaces
  const savedHome = process.env.DEVHUB_HOME
  const savedRoot = process.env.DEVHUB_WORKSPACES_ROOT
  delete process.env.DEVHUB_HOME
  delete process.env.DEVHUB_WORKSPACES_ROOT
  try {
    assert.equal(store.workspacesRoot(), join(homedir(), '.dev-hub', 'workspaces'))
  } finally {
    process.env.DEVHUB_HOME = savedHome
    if (savedRoot === undefined) delete process.env.DEVHUB_WORKSPACES_ROOT
    else process.env.DEVHUB_WORKSPACES_ROOT = savedRoot
  }
  const workspace = { id: 'ws-1', name: '前后端', repos: ['/tmp/a', '/tmp/b'] }
  const dir = store.workspaceLocalDir(workspace)
  assert.equal(dir, join(home, 'workspaces', 'ws-1'))
  assert.equal(store.workspaceLocalDir('ws-2'), join(home, 'workspaces', 'ws-2'))

  // macOS tmpdir 是 /var → /private/var 的软链：真实路径也必须识别为虚拟库目录
  await mkdir(dir, { recursive: true })
  const realDir = await realpath(dir)
  assert.equal(store.isWorkspaceLocalRoot(dir), true)
  assert.equal(store.isWorkspaceLocalRoot(realDir), true)
  assert.equal(store.isWorkspaceLocalRoot('/tmp/some-repo'), false)
  assert.equal(store.dataDir(dir), dir, '虚拟库的台账目录就是它自己的本机目录（不额外套 .dev-hub）')
  assert.equal(store.dataDir(realDir), realDir, '真实路径同样识别为虚拟库目录')
  assert.equal(store.dataDir('/tmp/some-repo'), '/tmp/some-repo/.dev-hub', '单库仍用仓库 .dev-hub')
})

test('local-workspace: 目录布局/清单/上下文/证据都能落盘读回，且不碰成员库', async () => {
  const workspace = { id: 'ws-layout', name: '布局组合', repos: ['/tmp/member-a', '/tmp/member-b'], createdAt: '2026-01-01T00:00:00.000Z' }
  const paths = await local.ensureWorkspaceLocalDir(workspace)
  assert.equal(paths.root, store.workspaceLocalDir(workspace))
  for (const path of [paths.items, paths.context, paths.evidence]) {
    assert.ok((await stat(path)).isDirectory(), `${path} 应该是目录`)
  }
  const manifest = JSON.parse(await readFile(paths.manifest, 'utf8'))
  assert.equal(manifest.kind, 'virtual-workspace')
  assert.deepEqual(manifest.repos, workspace.repos)
  const project = JSON.parse(await readFile(paths.project, 'utf8'))
  assert.equal(project.name, '布局组合')

  // 改名/换成员同步清单
  const renamed = { ...workspace, name: '布局组合-新', repos: ['/tmp/member-b', '/tmp/member-c'] }
  await local.syncWorkspaceManifest(renamed)
  const after = await local.readWorkspaceManifest(renamed)
  assert.equal(after.name, '布局组合-新')
  assert.deepEqual(after.repos, ['/tmp/member-b', '/tmp/member-c'])

  // 上下文留档：JSON + Markdown
  const written = await local.writeWorkspaceContext(renamed, 'flow-1', {
    generatedAt: '2026-01-02T00:00:00.000Z',
    contextHash: 'hash-1',
    prompt: '# 上下文\n【虚拟库】布局组合',
    summary: { itemId: 'flow-1' },
  })
  const savedContext = await local.readWorkspaceContext(renamed, 'flow-1')
  assert.equal(savedContext.contextHash, 'hash-1')
  assert.match(savedContext.prompt, /【虚拟库】/)
  assert.equal(await readFile(written.markdown, 'utf8'), '# 上下文\n【虚拟库】布局组合')

  // 证据留档
  await local.writeWorkspaceEvidence(renamed, 'flow-1', {
    evidenceComplete: false,
    members: [
      { path: '/tmp/member-b', name: 'member-b', branch: 'main', head: 'abc', baseCommit: 'base', changedFiles: 2 },
      { path: '/tmp/member-c', name: 'member-c', isRepo: false, evidenceComplete: false, reason: '不是 git 仓库' },
    ],
    changes: [{ path: 'member-b/src/a.js', repo: '/tmp/member-b', repoName: 'member-b', type: 'modified' }],
  })
  const evidence = await local.readWorkspaceEvidence(renamed, 'flow-1')
  assert.equal(evidence.evidenceComplete, false)
  assert.equal(evidence.repos.length, 2)
  assert.equal(evidence.repos[0].changedFiles, 2)
  assert.equal(evidence.changes[0].path, 'member-b/src/a.js')

  const contexts = await local.listWorkspaceArtifacts(renamed, 'context')
  assert.equal(contexts.length, 1)
  const removed = await local.removeWorkspaceItemArtifacts(renamed, 'flow-1')
  assert.equal(removed, 3, '上下文 json/md + 证据 json 都要清掉')
  assert.equal(await local.readWorkspaceContext(renamed, 'flow-1'), null)
  assert.equal(await local.readWorkspaceEvidence(renamed, 'flow-1'), null)

  // 整个过程不写任何成员库目录（它们甚至根本不存在）
  await assert.rejects(() => stat('/tmp/member-b/.dev-hub'))
  await assert.rejects(() => stat('/tmp/member-c/.dev-hub'))
})

test('local-workspace: 台账分流——本机目录保留归属/每库 baseline，仓库台账剥掉', async () => {
  const workspace = { id: 'ws-ledger', name: '台账组合', repos: ['/tmp/a', '/tmp/b'] }
  const localRoot = (await local.ensureWorkspaceLocalDir(workspace)).root
  const repo = await mkdtemp(join(tmpdir(), 'devhub-local-repo-'))
  try {
    const raw = {
      id: 'flow-1',
      title: '跨库流程',
      workspace: { id: workspace.id, name: workspace.name },
      repos: ['/tmp/a', '/tmp/b'],
      baseline: {
        startedAt: '2026-01-01T00:00:00.000Z',
        commit: null,
        branch: null,
        repos: [
          { path: '/tmp/a', name: 'a', commit: 'sha-a', branch: 'main', isRepo: true },
          { path: '/tmp/b', name: 'b', commit: 'sha-b', branch: 'dev', isRepo: true },
        ],
      },
    }
    const savedLocal = await store.saveItem(localRoot, raw)
    assert.equal(savedLocal.workspace.id, workspace.id)
    const persistedLocal = JSON.parse(await readFile(join(localRoot, 'items', 'flow-1.json'), 'utf8'))
    assert.equal(persistedLocal.workspace.id, workspace.id, '本机台账自带归属')
    assert.equal(persistedLocal.repos.length, 2)
    assert.equal(persistedLocal.baseline.repos.length, 2)
    assert.equal(persistedLocal.baseline.commit, null)

    // 同一个 item 落到普通仓库台账：本机字段必须被剥掉
    await store.saveItem(repo, raw)
    const persistedRepo = JSON.parse(await readFile(join(repo, '.dev-hub', 'items', 'flow-1.json'), 'utf8'))
    assert.equal(persistedRepo.workspace, undefined)
    assert.equal(persistedRepo.repos, undefined)
    assert.equal(persistedRepo.baseline.repos, undefined)

    // 列表/读取按台账根隔离
    assert.equal((await store.listItems(localRoot)).length, 1)
    assert.equal((await store.listItems(repo)).length, 1)
    assert.equal((await store.getItem(localRoot, 'flow-1')).workspace.id, workspace.id)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('conventions: 支持显式本机路径读写，虚拟库规范落在本机目录', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'devhub-local-conv-repo-'))
  const workspace = { id: 'ws-conv', name: '规范组合', repos: [repo] }
  const localRoot = (await local.ensureWorkspaceLocalDir(workspace)).root
  try {
    // 单库仍是 <repo>/.dev-hub/conventions.json
    assert.equal(conventions.conventionsPath(repo), join(repo, '.dev-hub', 'conventions.json'))
    // 虚拟库是本机目录下的 conventions.json
    assert.equal(conventions.conventionsPath(localRoot), join(localRoot, 'conventions.json'))

    const pack = conventions.buildDefaultConventions({
      repo: localRoot,
      name: '规范组合',
      profile: { language: 'node', frontend: true, frameworks: ['react'], build: 'npm' },
      context: {},
    })
    const saved = await conventions.saveConventions(localRoot, pack)
    assert.ok(saved.constraints.length > 0)
    assert.ok((await stat(join(localRoot, 'conventions.json'))).isFile())
    const loaded = await conventions.loadConventions(localRoot)
    assert.equal(loaded.project.name, '规范组合')
    assert.ok(loaded.installedSkills.length > 0)
    assert.equal(await conventions.isFirstRun(repo), true, '成员库没有规范文件')

    // 显式路径接口（本机路径读写）：读一份、写到另一份
    const explicit = join(localRoot, 'conventions-copy.json')
    await conventions.saveConventionsToFile(explicit, loaded)
    const copy = await conventions.loadConventionsFromFile(explicit)
    assert.equal(copy.project.name, '规范组合')
    await assert.rejects(() => stat(join(repo, '.dev-hub')), '虚拟库规范不落成员库')

    // 合并成员库画像：取并集，不取第一个
    const merged = conventions.mergeRepoProfiles([
      { language: 'node', frontend: true, frameworks: ['react'], build: 'npm', gates: ['npm test'] },
      { language: 'java', frontend: false, frameworks: [], build: 'maven', gates: ['sh scripts/check.sh --full'] },
      null,
    ])
    assert.equal(merged.language, 'java', '有 java 成员库就按 java，和顺序无关')
    assert.equal(merged.frontend, true)
    assert.deepEqual(merged.frameworks, ['react'])
    assert.deepEqual(merged.gates, ['npm test', 'sh scripts/check.sh --full'].sort())
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})
