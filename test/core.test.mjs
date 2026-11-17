import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildContext } from '../src/core/context.mjs'
import { detectEnvironment } from '../src/core/detect.mjs'
import { changesSince, gitInfo, startBaseline } from '../src/core/git.mjs'
import { missingForStart } from '../src/core/workflow.mjs'
import { scanCandidates } from '../src/core/scan.mjs'
import { defaultProject, getItem, listItems, loadProject, saveItem } from '../src/core/store.mjs'

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-test-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'README.md'), '# demo\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

test('project and item round-trip preserves updatedAt', async () => {
  const repo = await tempRepo()
  try {
    const { project } = await loadProject(repo, true)
    assert.equal(project.schemaVersion, 1)
    const saved = await saveItem(repo, { title: 'Demo item', status: 'developing', tasks: [{ text: 'a', done: true }] })
    assert.equal(saved.id, 'demo-item')
    const first = await getItem(repo, saved.id)
    assert.equal(first.updatedAt, saved.updatedAt)
    const listed = await listItems(repo)
    assert.equal(listed[0].updatedAt, saved.updatedAt)
    assert.equal(listed[0].tasks[0].done, true)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('context hash is stable and includes environment and next step', () => {
  const item = {
    id: 'x', title: 'X', status: 'developing', goal: 'do x', nonGoals: [], acceptance: ['ok'],
    tasks: [{ text: 'first', done: false }, { text: 'second', done: true }], scope: ['a.java'], risks: [],
  }
  const project = defaultProject('/tmp/repo', 'repo')
  project.context.commands = { gate: 'sh scripts/check.sh' }
  const input = {
    repoName: 'repo', project, item,
    profile: { member: '张三' },
    env: { os: 'macos', arch: 'arm64', shell: { name: 'zsh', path: '/bin/zsh' }, currentJdk: { major: 25, path: '/jdk' }, tools: { git: { available: true } } },
    gitInfo: { branch: 'main', head: 'abc', clean: true, changes: [] },
    changes: { evidenceComplete: true, changes: [], baseCommit: 'abc', headCommit: 'abc', commits: [] },
  }
  const a = buildContext(input)
  const b = buildContext(input)
  assert.equal(a.contextHash, b.contextHash)
  assert.match(a.prompt, /【开发项】X/)
  assert.match(a.prompt, /first/)
  assert.match(a.prompt, /张三/)
  assert.match(a.prompt, /sh scripts\/check.sh/)
  // 阶段边界要写进 Context Pack：开发只改代码，测试/门禁由工作站测试阶段执行
  assert.match(a.prompt, /【阶段边界】/)
  assert.match(a.prompt, /只改代码与测试代码/)
  assert.match(a.prompt, /【测试\/门禁（工作站执行，开发会话不要运行）】/)
})

test('context pack：前端仓库未装 frontend-ui 时显式提示补装，并进入 contextHash', () => {
  const item = {
    id: 'ui', title: 'UI', status: 'developing', goal: 'do ui', nonGoals: [], acceptance: ['ok'],
    tasks: [{ text: 't', done: false }], scope: ['src'], risks: [],
  }
  const project = defaultProject('/tmp/repo', 'repo')
  const base = {
    repoName: 'repo', project, item,
    profile: { member: '张三' },
    env: { os: 'macos', arch: 'arm64', shell: { name: 'zsh', path: '/bin/zsh' }, currentJdk: { major: 25, path: '/jdk' }, tools: {} },
    gitInfo: { branch: 'main', head: 'abc', clean: true, changes: [] },
    changes: { evidenceComplete: true, changes: [], baseCommit: 'abc', headCommit: 'abc', commits: [] },
    conventions: {
      installedSkills: [{ id: 'core-discipline', name: '通用开发纪律' }],
      constraints: [{ id: 'scope', title: '范围', rule: '只改 scope', skill: 'core-discipline' }],
    },
  }
  const nonFrontend = buildContext({ ...base, repoProfile: { frontend: false, frameworks: [] } })
  const missing = buildContext({ ...base, repoProfile: { frontend: true, frameworks: ['react'] } })
  assert.doesNotMatch(nonFrontend.prompt, /前端原型设计规范未安装/)
  assert.match(missing.prompt, /前端原型设计规范未安装/)
  assert.match(missing.prompt, /检测到前端框架（react）/)
  assert.match(missing.prompt, /devhub_skills/)
  assert.equal(nonFrontend.summary.missingFrontendSkill, false)
  assert.equal(missing.summary.missingFrontendSkill, true)
  assert.notEqual(nonFrontend.contextHash, missing.contextHash, '补装提示是语义差异，要进 contextHash')

  const installed = buildContext({
    ...base,
    repoProfile: { frontend: true, frameworks: ['react'] },
    conventions: {
      installedSkills: [{ id: 'frontend-ui', name: '前端原型设计规范' }],
      constraints: [{ id: 'ui-tokens', title: '品牌紫', rule: 'colorPrimary #6049e7', skill: 'frontend-ui' }],
    },
  })
  assert.doesNotMatch(installed.prompt, /前端原型设计规范未安装/)
  assert.match(installed.prompt, /品牌紫/)
  assert.equal(installed.summary.missingFrontendSkill, false)
})

test('git baseline diff exposes changed files and commits', async () => {
  const repo = await tempRepo()
  try {
    const base = await startBaseline(repo)
    await writeFile(join(repo, 'README.md'), '# demo changed\n', 'utf8')
    execFileSync('git', ['add', '.'], { cwd: repo })
    execFileSync('git', ['commit', '-qm', 'change'], { cwd: repo })
    const info = await gitInfo(repo)
    assert.equal(info.available, true)
    const changes = await changesSince(repo, base)
    assert.equal(changes.evidenceComplete, true)
    assert.deepEqual(changes.changes.map((c) => c.path), ['README.md'])
    assert.equal(changes.commits[0].subject, 'change')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('missing baseline reports incomplete evidence instead of faking a diff', async () => {
  const repo = await tempRepo()
  try {
    const changes = await changesSince(repo, { commit: 'does-not-exist' })
    assert.equal(changes.evidenceComplete, false)
    assert.match(changes.reason, /baseline/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('docs scan extracts headings with source locations', async () => {
  const repo = await tempRepo()
  try {
    await mkdir(join(repo, 'docs/design'), { recursive: true })
    await writeFile(join(repo, 'docs/design/plan.md'), '# Plan\n\n## Gerrit source\n\nSupport Gerrit.\n', 'utf8')
    const candidates = await scanCandidates(repo)
    assert.equal(candidates[0].title, 'Gerrit source')
    assert.equal(candidates[0].source.path, 'docs/design/plan.md')
    assert.equal(candidates[0].source.line, 3)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('environment detection finds OS and git', async () => {
  const repo = await tempRepo()
  try {
    const env = await detectEnvironment(repo)
    assert.ok(['macos', 'linux', 'windows', 'wsl'].includes(env.os))
    assert.equal(env.git.available, true)
    assert.ok(env.shell.name)
    assert.ok(Array.isArray(env.jdks))
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('workflow start gate lists missing prerequisites', () => {
  const item = { acceptance: [], workflow: { rootProblem: '', questions: [{ id: 'q1', question: 'x', answer: '' }], techDoc: {}, plan: { steps: [] } } }
  const missing = missingForStart(item)
  assert.ok(missing.some((value) => value.includes('根本问题')))
  assert.ok(missing.some((value) => value.includes('3 个')))
  assert.ok(missing.some((value) => value.includes('技术文档')))
  assert.ok(missing.some((value) => value.includes('开发计划')))
})
