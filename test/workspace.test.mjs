import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { buildContext } from '../src/core/context.mjs'
import { buildPlan } from '../src/core/plan.mjs'
import {
  baselineForMember,
  collectWorkspaceEvidence,
  memberByRef,
  repoLabel,
  scopeMatchesFile,
  splitRepoScopedPath,
  workspaceBaseline,
  workspaceMembers,
} from '../src/core/workspace.mjs'
import {
  createWorkspace,
  defaultProject,
  getItemWorkspace,
  removeWorkspace,
  renameWorkspace,
  sanitizeItem,
  setItemWorkspace,
  setProfileForRepo,
} from '../src/core/store.mjs'

async function tempRepo({ files = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-ws-repo-'))
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

function gitIn(dir, args) {
  return execFileSync('git', ['-C', dir, ...args]).toString().trim()
}

function envFixture() {
  return {
    os: 'macos',
    arch: 'arm64',
    shell: { name: 'zsh', path: '/bin/zsh' },
    currentJdk: null,
    tools: { git: { available: true } },
  }
}

function itemFixture(overrides = {}) {
  return {
    id: 'ws-flow',
    title: '前后端联动',
    status: 'developing',
    goal: '把两个库一起改',
    nonGoals: [],
    acceptance: ['自测通过'],
    tasks: [{ text: '改接口', done: false }],
    scope: ['web:src', 'api:src'],
    risks: [],
    ...overrides,
  }
}

test('workspace: repoLabel 按目录名生成短标签，同名去重', () => {
  const used = new Set()
  const first = repoLabel('/tmp/projects/gitee-pipeline', used)
  const second = repoLabel('/tmp/other/gitee-pipeline', used)
  assert.equal(first, 'gitee-pipeline')
  assert.notEqual(second, first, '同名目录必须得到不同标签')
  assert.ok(second.startsWith(first), `去重标签应保留原名前缀：${second}`)
  assert.ok(used.has(first) && used.has(second), '用过的标签要登记进 used')
})

test('workspace: workspaceMembers 成员带唯一 label，成员库平权（没有主库标记）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devhub-ws-members-'))
  try {
    const left = join(root, 'frontend', 'service')
    const right = join(root, 'backend', 'service')
    await mkdir(left, { recursive: true })
    await mkdir(right, { recursive: true })
    const members = workspaceMembers([left, right])
    assert.equal(members.length, 2)
    assert.equal(members[0].path, left)
    assert.equal(members[1].path, right)
    assert.equal(members[0].name, 'service')
    assert.notEqual(members[0].name, members[1].name, '同名成员库必须去重')
    assert.equal('primary' in members[0], false, '成员库没有 primary/主库概念')
    assert.equal('primary' in members[1], false, '成员库没有 primary/主库概念')

    const single = workspaceMembers([left])
    assert.equal(single.length, 1)
    assert.equal(single[0].name, 'service')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('workspace: memberByRef 支持路径与 label 查找', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devhub-ws-ref-'))
  try {
    const left = join(root, 'web')
    const right = join(root, 'api')
    await mkdir(left, { recursive: true })
    await mkdir(right, { recursive: true })
    const members = workspaceMembers([left, right])

    assert.equal(memberByRef(members, left)?.name, 'web')
    assert.equal(memberByRef(members, 'api')?.path, right)
    assert.equal(memberByRef(members, 'API')?.path, right, 'label 大小写不敏感')
    assert.equal(memberByRef(members, '/does/not/exist'), null)
    assert.equal(memberByRef(members, ''), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('workspace: splitRepoScopedPath 只拆成员 label 前缀', () => {
  const members = workspaceMembers(['/tmp/projects/web', '/tmp/projects/api'])
  const colon = splitRepoScopedPath('web:src/a.js', members)
  assert.equal(colon?.name, 'web')
  assert.equal(colon?.member?.path, '/tmp/projects/web')
  assert.equal(colon?.path, 'src/a.js')

  const slash = splitRepoScopedPath('api/src/b.ts', members)
  assert.equal(slash?.name, 'api')
  assert.equal(slash?.path, 'src/b.ts')

  // 普通目录不是成员库，不能被误拆
  assert.equal(splitRepoScopedPath('docs/README.md', members), null)
  assert.equal(splitRepoScopedPath('', members), null)
})

test('workspace: scopeMatchesFile 支持 label:path 与跨库 module scope', () => {
  const members = workspaceMembers(['/tmp/projects/web', '/tmp/projects/api'])
  // 变更文件在成员库内是「repo 相对路径 + repoName」，scope 才带成员前缀
  const webFile = { path: 'src/a.js', repoName: 'web', repo: '/tmp/projects/web' }
  const apiFile = { path: 'src/b.ts', repoName: 'api', repo: '/tmp/projects/api' }

  assert.equal(scopeMatchesFile(['web:src'], webFile, members), true)
  assert.equal(scopeMatchesFile(['web/src'], webFile, members), true)
  assert.equal(scopeMatchesFile(['api:src'], webFile, members), false, '别的成员库前缀不匹配')
  assert.equal(scopeMatchesFile(['web:other'], webFile, members), false)
  assert.equal(scopeMatchesFile(['src'], webFile, members), true, '跨库同名目录 scope 对任一成员生效')
  assert.equal(scopeMatchesFile(['module:source'], webFile, members), false)
  assert.equal(scopeMatchesFile([], webFile, members), true, '空 scope 不限制')

  const javaFile = { path: 'src/main/java/com/gitee/pipeline/source/A.java', repoName: 'api' }
  assert.equal(scopeMatchesFile(['module:source'], javaFile, members), true)
  assert.equal(scopeMatchesFile(['module:controller'], javaFile, members), false)
  assert.equal(scopeMatchesFile(['api:src'], apiFile, members), true)
})

test('workspace: baselineForMember 只按成员库匹配，不拿顶层 commit 冒充第一个成员库', () => {
  const members = workspaceMembers(['/tmp/projects/web', '/tmp/projects/api'])
  const baseline = {
    startedAt: '2026-01-01T00:00:00.000Z',
    commit: 'top-web',
    branch: 'main',
    repos: [
      { path: '/tmp/projects/web', name: 'web', commit: 'web-sha', branch: 'main' },
      { path: '/tmp/projects/api', name: 'api', commit: 'api-sha', branch: 'main' },
    ],
  }
  assert.equal(baselineForMember(baseline, members[0]).commit, 'web-sha')
  assert.equal(baselineForMember(baseline, members[1]).commit, 'api-sha')
  // 陌生成员库：不能拿别的库的 baseline 顶替
  assert.equal(baselineForMember(baseline, { path: '/tmp/projects/nope', name: 'nope' }), null)

  // 只有顶层 commit（旧数据/无每库 baseline）：任何成员库都不伪造 baseline
  const legacy = { startedAt: 't', commit: 'old-sha', branch: 'main' }
  assert.equal(baselineForMember(legacy, members[0]), null)
  assert.equal(baselineForMember(legacy, members[1]), null)
  assert.equal(baselineForMember(null, members[0]), null)
})

test('workspace: workspaceBaseline 与 collectWorkspaceEvidence 按成员库聚合变更', async () => {
  const repoA = await tempRepo({ files: { 'src/source/Alert.java': 'class Alert {}\n' } })
  const repoB = await tempRepo({ files: { 'src/source/Alert.ts': 'export const alert = 1\n' } })
  try {
    const members = workspaceMembers([repoA, repoB])
    const baseline = await workspaceBaseline(members)
    assert.equal(baseline.repos.length, 2)
    // 没有代表库：顶层 commit/branch 固定为 null，消费方必须按成员库读
    assert.equal(baseline.commit, null)
    assert.equal(baseline.branch, null)
    for (const entry of baseline.repos) {
      assert.ok(entry.commit, 'git 成员库要有 baseline commit')
      assert.ok(entry.branch)
      assert.equal(entry.isRepo, true)
      assert.equal(entry.startedAt, baseline.startedAt)
      assert.equal('primary' in entry, false, '成员库 baseline 不带 primary')
    }

    // 只在 A 里改并提交
    await writeFile(join(repoA, 'README.md'), '# demo changed in A\n', 'utf8')
    gitIn(repoA, ['add', '.'])
    gitIn(repoA, ['commit', '-qm', 'change in web'])

    const evidence = await collectWorkspaceEvidence(members, baseline)
    assert.equal(evidence.members.length, 2)
    assert.equal(evidence.evidenceComplete, true)
    const [memberA, memberB] = evidence.members
    assert.equal(memberA.isRepo, true)
    assert.equal(memberA.head, gitIn(repoA, ['rev-parse', '--short', 'HEAD']))
    assert.equal(memberA.baseCommit, baseline.repos[0].commit)
    assert.equal(memberA.changes.length, 1)
    assert.equal(memberB.changes.length, 0, '没改的成员库不能编造变更')

    const change = memberA.changes[0]
    assert.equal(change.path, `${members[0].name}/README.md`)
    assert.equal(change.repoPath, 'README.md')
    assert.equal(change.repo, repoA)
    assert.equal(change.repoName, members[0].name)
    assert.equal(evidence.changes.length, 1)
    assert.deepEqual(evidence.totals, { files: 1, members: 2, changedMembers: 1 })
  } finally {
    await rm(repoA, { recursive: true, force: true })
    await rm(repoB, { recursive: true, force: true })
  }
})

test('workspace: 非 git 成员库显式标注，不伪造 diff', async () => {
  const repo = await tempRepo()
  const plain = await mkdtemp(join(tmpdir(), 'devhub-ws-plain-'))
  try {
    await writeFile(join(plain, 'README.md'), '# plain dir\n', 'utf8')
    const members = workspaceMembers([repo, plain])
    const baseline = await workspaceBaseline(members)
    assert.equal(baseline.repos[0].isRepo, true)
    assert.equal(baseline.repos[1].isRepo, false)
    assert.equal(baseline.repos[1].commit, null)

    const evidence = await collectWorkspaceEvidence(members, baseline)
    assert.equal(evidence.members[1].isRepo, false)
    assert.match(evidence.members[1].reason, /不是 git 仓库/)
    assert.deepEqual(evidence.members[1].changes, [])
    assert.equal(evidence.evidenceComplete, false, '有非 git 成员时整体证据不完整')
    assert.equal(evidence.totals.members, 2)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(plain, { recursive: true, force: true })
  }
})

test('workspace: createWorkspace 校验存在/目录/至少两个不同库/唯一名字；rename/remove 生效', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devhub-ws-store-'))
  try {
    const repoA = join(root, 'web')
    const repoB = join(root, 'api')
    await mkdir(repoA, { recursive: true })
    await mkdir(repoB, { recursive: true })
    const profile = { schemaVersion: 1, activeRepo: null, repos: {}, workspaces: [] }

    await assert.rejects(() => createWorkspace(profile, { name: '组合', repos: [repoA] }), /两个/)
    await assert.rejects(
      () => createWorkspace(profile, { name: '组合', repos: [repoA, join(root, 'missing')] }),
      /不存在/,
    )
    await assert.rejects(
      () => createWorkspace(profile, { name: '组合', repos: [repoA, repoA] }),
      /两个不同的/,
    )
    const filePath = join(root, 'not-a-dir.txt')
    await writeFile(filePath, 'x', 'utf8')
    await assert.rejects(() => createWorkspace(profile, { name: '组合', repos: [repoA, filePath] }), /不是目录/)

    const workspace = await createWorkspace(profile, { name: '组合', repos: [repoA, repoB] })
    assert.ok(workspace.id.startsWith('ws-'))
    assert.equal(workspace.name, '组合')
    assert.equal(workspace.repos.length, 2)
    assert.equal(profile.workspaces.length, 1)
    await assert.rejects(() => createWorkspace(profile, { name: '组合', repos: [repoA, repoB] }), /已存在/)

    const renamed = renameWorkspace(profile, workspace.id, '新组合')
    assert.equal(renamed.name, '新组合')
    assert.ok(profile.workspaces.some((entry) => entry.id === workspace.id && entry.name === '新组合'))
    assert.throws(() => renameWorkspace(profile, workspace.id, ''), /名字/)

    const second = await createWorkspace(profile, { name: '第二组合', repos: [repoA, repoB] })
    assert.throws(() => renameWorkspace(profile, second.id, '新组合'), /已存在/)

    assert.equal(removeWorkspace(profile, workspace.id), true)
    assert.equal(removeWorkspace(profile, workspace.id), false)
    assert.equal(profile.workspaces.length, 1)
    assert.equal(profile.workspaces[0].id, second.id)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})


test('workspace: 成员填 git 子目录时归一到仓库根，同一仓库的多个子目录去重', async () => {
  const repoA = await tempRepo()
  const repoB = await tempRepo()
  const nested = join(repoA, 'packages', 'web')
  await mkdir(nested, { recursive: true })
  try {
    const profile = { schemaVersion: 1, activeRepo: null, repos: {}, workspaces: [] }
    const workspace = await createWorkspace(profile, { name: '子目录组合', repos: [nested, repoB] })
    assert.equal(workspace.repos[0], await realpath(repoA), '成员应归一到 git 仓库根')
    assert.equal(workspace.repos[1], await realpath(repoB))

    const docs = join(repoA, 'docs')
    await mkdir(docs, { recursive: true })
    const duplicate = { schemaVersion: 1, activeRepo: null, repos: {}, workspaces: [] }
    await assert.rejects(
      () => createWorkspace(duplicate, { name: '同仓库子目录', repos: [nested, docs] }),
      /两个不同/,
      '同一仓库的多个子目录不能凑成两个成员库',
    )
  } finally {
    await rm(repoA, { recursive: true, force: true })
    await rm(repoB, { recursive: true, force: true })
  }
})

test('workspace: 落盘 sanitize 剥掉虚拟库成员路径、workspace 归属与每库结果里的本机 path', () => {
  const raw = {
    id: 'ledger-safe',
    title: '可提交台账',
    repos: ['/Users/alice/web', '/Users/alice/api'],
    workspace: { id: 'ws-1', name: '前后端' },
    baseline: {
      startedAt: 'x',
      commit: 'abc',
      branch: 'main',
      repos: [
        { path: '/Users/alice/web', name: 'web', commit: 'abc', branch: 'main' },
        { path: '/Users/alice/api', name: 'api', commit: 'def', branch: 'main' },
      ],
    },
    workflow: {
      gitRepo: true,
      tests: { local: { status: 'passed', repos: [{ path: '/Users/alice/web', name: 'web', status: 'passed' }] } },
      submission: { commit: 'abc', repos: [{ path: '/Users/alice/web', name: 'web', commit: 'abc', pushed: true }] },
    },
  }
  const readable = sanitizeItem(raw, 'ledger-safe')
  assert.equal(readable.workspace?.name, '前后端')
  assert.equal(readable.repos.length, 2)
  assert.equal(readable.baseline.repos.length, 2)

  const persisted = sanitizeItem(raw, 'ledger-safe', { keepLocalWorkspace: false })
  assert.equal(persisted.workspace, undefined)
  assert.equal(persisted.repos, undefined)
  assert.equal(persisted.baseline.repos, undefined)
  assert.equal(persisted.workflow.tests.local.repos[0].path, undefined)
  assert.equal(persisted.workflow.submission.repos[0].path, undefined)
  assert.equal(persisted.workflow.tests.local.repos[0].name, 'web')
  assert.equal(persisted.workflow.submission.repos[0].commit, 'abc')
  assert.ok(!JSON.stringify(persisted).includes('/Users/alice'))
})

test('workspace: removeWorkspace 清理本机流程绑定', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'devhub-ws-binding-'))
  const other = await mkdtemp(join(tmpdir(), 'devhub-ws-binding-2-'))
  try {
    const profile = { schemaVersion: 1, activeRepo: null, repos: {}, workspaces: [], itemWorkspaces: {} }
    const workspace = await createWorkspace(profile, { name: '待删除组合', repos: [repo, other] })
    setItemWorkspace(profile, repo, 'flow-1', { workspaceId: workspace.id, workspaceName: workspace.name })
    assert.ok(getItemWorkspace(profile, repo, 'flow-1'))
    removeWorkspace(profile, workspace.id)
    assert.equal(getItemWorkspace(profile, repo, 'flow-1'), null)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(other, { recursive: true, force: true })
  }
})

test('workspace: setProfileForRepo(activate:false) 不把 activeRepo 从虚拟库切回成员库', async () => {
  const repo = await tempRepo()
  try {
    const profile = { schemaVersion: 1, activeRepo: 'workspace:ws-1', repos: {}, workspaces: [] }
    await setProfileForRepo(profile, repo, { member: '张三' }, { activate: false })
    assert.equal(profile.activeRepo, 'workspace:ws-1')
    const [key] = Object.keys(profile.repos)
    assert.ok(key)
    assert.equal(profile.repos[key].member, '张三')

    // 默认行为保持单库：登记后激活该库
    await setProfileForRepo(profile, repo, { member: '张三' })
    assert.equal(profile.activeRepo, key)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('workspace: sanitizeItem 保留 baseline.repos、tests.repos 与 submission.repos', () => {
  const item = sanitizeItem({
    title: '多库联动',
    baseline: {
      startedAt: '2026-01-01T00:00:00.000Z',
      commit: 'web-sha',
      branch: 'main',
      repos: [
        { path: '/tmp/web', name: 'web', commit: 'web-sha', branch: 'main', isRepo: true, startedAt: '2026-01-01T00:00:00.000Z', primary: true },
        { path: '/tmp/api', name: 'api', commit: 'api-sha', branch: 'dev', isRepo: true, startedAt: '2026-01-01T00:00:00.000Z' },
      ],
    },
    workflow: {
      tests: {
        local: { status: 'passed', repos: [{ path: '/tmp/web', name: 'web', status: 'passed', command: 'npm test' }, { path: '/tmp/api', name: 'api', status: 'failed' }] },
        environment: { status: 'not_run', repos: [{ path: '/tmp/api', name: 'api', status: 'not_run' }] },
      },
      submission: {
        status: 'partial',
        repos: [
          { path: '/tmp/web', name: 'web', branch: 'main', commit: 'web-new', pushed: true, status: 'pushed' },
          { path: '/tmp/api', name: 'api', error: '没有 remote', status: 'failed' },
        ],
      },
    },
  })
  assert.equal(item.baseline.repos.length, 2)
  assert.equal(item.baseline.repos[0].commit, 'web-sha')
  assert.equal('primary' in item.baseline.repos[0], false, '不再保留主库标记')
  assert.equal(item.baseline.repos[1].branch, 'dev')
  assert.equal(item.workflow.tests.local.repos.length, 2)
  assert.equal(item.workflow.tests.local.repos[0].status, 'passed')
  assert.equal(item.workflow.tests.local.repos[1].status, 'failed')
  assert.equal(item.workflow.tests.environment.repos.length, 1)
  assert.equal(item.workflow.submission.repos.length, 2)
  assert.equal(item.workflow.submission.repos[0].pushed, true)
  assert.equal(item.workflow.submission.repos[1].error, '没有 remote')
})

test('workspace: Context Pack 含【虚拟库】成员事实，成员 HEAD 变化会换 contextHash', async () => {
  const repoA = await tempRepo()
  const repoB = await tempRepo()
  try {
    const members = workspaceMembers([repoA, repoB])
    const baseline = await workspaceBaseline(members)
    // 让 B 的基线以来有一条变更，验证 per-repo changes 写进 prompt
    await writeFile(join(repoB, 'CHANGELOG.md'), '# changes\n', 'utf8')
    gitIn(repoB, ['add', '.'])
    gitIn(repoB, ['commit', '-qm', 'change in api'])
    const evidence = await collectWorkspaceEvidence(members, baseline)
    const workspace = {
      id: 'ws-test',
      name: '前后端组合',
      primaryName: members[0].name,
      members: evidence.members,
      totals: evidence.totals,
    }
    const base = {
      repoName: members[0].name,
      project: defaultProject(repoA, members[0].name),
      item: itemFixture(),
      profile: { member: '张三' },
      env: envFixture(),
      gitInfo: { branch: 'main', head: 'web-head', clean: true, changes: [] },
      changes: { evidenceComplete: true, changes: [], commits: [], baseCommit: 'web-head', headCommit: 'web-head' },
      workspace,
    }

    const first = buildContext(base)
    assert.match(first.prompt, /【虚拟库】前后端组合/)
    for (const member of members) {
      assert.ok(first.prompt.includes(member.name), `prompt 缺少成员 ${member.name}`)
      assert.ok(first.prompt.includes(member.path), `prompt 缺少成员路径 ${member.path}`)
    }
    assert.match(first.prompt, /HEAD [0-9a-f]+/)
    assert.ok(first.prompt.includes(`${members[1].name}/CHANGELOG.md`), '各库变更要带前缀进上下文')
    assert.ok(first.summary.workspace, 'summary 应带 workspace 摘要')
    assert.equal(first.summary.workspace.members, 2)

    const second = buildContext(base)
    assert.equal(first.contextHash, second.contextHash, '同样的成员事实 contextHash 必须稳定')

    const movedMembers = evidence.members.map((member, index) => (index === 1 ? { ...member, head: 'fffffff' } : member))
    const moved = buildContext({
      ...base,
      workspace: { ...workspace, members: movedMembers },
    })
    assert.notEqual(first.contextHash, moved.contextHash, '成员库 HEAD 变了，contextHash 必须变化')

    const movedBaseline = buildContext({
      ...base,
      workspace: {
        ...workspace,
        members: evidence.members.map((member, index) => (index === 0 ? { ...member, baseCommit: 'other-base' } : member)),
      },
    })
    assert.notEqual(first.contextHash, movedBaseline.contextHash, '成员库 baseline 变了，contextHash 必须变化')

    // 单库上下文保持旧输出
    const single = buildContext({ ...base, workspace: null })
    assert.doesNotMatch(single.prompt, /【虚拟库】/)
    assert.notEqual(single.contextHash, first.contextHash)
  } finally {
    await rm(repoA, { recursive: true, force: true })
    await rm(repoB, { recursive: true, force: true })
  }
})

test('workspace: buildPlan 按成员库分组，不让同名模块塌成一个', () => {
  const plan = buildPlan({
    description: '前后端一起改 source 告警',
    repoNames: ['web', 'api'],
    scope: ['web:src', 'api:src'],
    recon: {
      files: [
        { path: 'api/src/main/java/com/gitee/pipeline/source/Alert.java' },
        { path: 'web/src/main/java/com/gitee/pipeline/source/Alert.java' },
      ],
    },
    project: defaultProject('/tmp/repo', 'repo'),
  })
  assert.ok(plan.modules.includes('api/source'), `modules=${JSON.stringify(plan.modules)}`)
  assert.ok(plan.modules.includes('web/source'), `modules=${JSON.stringify(plan.modules)}`)
  assert.ok(plan.steps.some((step) => step.includes('api/source')), JSON.stringify(plan.steps))
  assert.ok(plan.steps.some((step) => step.includes('web/source')), JSON.stringify(plan.steps))
})


