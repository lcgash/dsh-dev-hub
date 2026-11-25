import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { SKILL_CATALOG, catalogFor, defaultSkillIds, findSkill, constraintsOf } = await import('../src/core/skills.mjs')
const {
  FRONTEND_FRAMEWORKS,
  buildDefaultConventions,
  detectFrontendFramework,
  detectRepoProfile,
  installSkill,
  uninstallSkill,
  addCustomConstraint,
  updateConstraint,
  removeConstraint,
  regenerateConventions,
  normalizeConventions,
  summarizeConventions,
} = await import('../src/core/conventions.mjs')

const javaProfile = { language: 'java', build: 'maven', checkScript: true }

test('技能库：每条约束都有 id/title/rule/check，且 id 全局唯一', () => {
  const ids = new Set()
  for (const pack of SKILL_CATALOG) {
    assert.ok(pack.id && pack.name && pack.level && pack.description)
    assert.ok(pack.constraints.length > 0)
    for (const constraint of pack.constraints) {
      assert.ok(constraint.id && constraint.title && constraint.rule, `${pack.id} 的约束缺字段`)
      assert.ok(constraint.check?.kind, `${pack.id}#${constraint.id} 缺 check.kind`)
      assert.ok(!ids.has(constraint.id), `约束 id 重复：${constraint.id}`)
      ids.add(constraint.id)
    }
  }
})

test('技能库：按语言过滤，L0 全语言可用', () => {
  const java = catalogFor('java').map((pack) => pack.id)
  assert.ok(java.includes('java-layering'))
  assert.ok(!java.includes('node-core'))
  const node = catalogFor('node').map((pack) => pack.id)
  assert.ok(node.includes('node-core'))
  assert.ok(!node.includes('java-layering'))
  assert.ok(catalogFor('generic').every((pack) => pack.appliesTo.includes('generic')))
  assert.ok(defaultSkillIds('java').includes('core-discipline'))
})

test('技能库：内置了前端原型规范包，约束带 ui- 前缀且覆盖硬规则', () => {
  const pack = findSkill('frontend-ui')
  assert.ok(pack, '前端原型包应内置在技能库里')
  assert.equal(pack.level, 'L1')
  assert.deepEqual(pack.autoInstall, ['frontend'], '只在命中前端框架的仓库默认安装')
  const ids = pack.constraints.map((constraint) => constraint.id)
  for (const required of ['ui-authority', 'ui-tokens', 'ui-semantic', 'ui-radius', 'ui-density', 'ui-hierarchy', 'ui-overlay', 'ui-shell', 'ui-progressive', 'ui-loading', 'ui-interaction', 'ui-charts', 'ui-reuse', 'ui-stack', 'ui-mock', 'ui-checklist']) {
    assert.ok(ids.includes(required), `前端原型包缺少约束：${required}`)
  }
  assert.ok(pack.constraints.every((constraint) => constraint.id.startsWith('ui-')), '统一用 ui- 前缀便于识别')
})

test('默认技能集合：只有前端仓库才自动装 frontend-ui', () => {
  assert.ok(!defaultSkillIds('node').includes('frontend-ui'), '纯 Node 服务/CLI 仓库不默认装')
  assert.ok(!defaultSkillIds('java').includes('frontend-ui'), '纯 Java 仓库不默认装')
  assert.ok(defaultSkillIds('node', { frontend: true }).includes('frontend-ui'), '前端仓库默认装')
  assert.ok(defaultSkillIds('java', { frontend: true }).includes('frontend-ui'), 'Java + 前端混合仓库也默认装')
  assert.ok(catalogFor('node').some((pack) => pack.id === 'frontend-ui'), 'node 仓库仍能在技能页手动安装')
  assert.ok(!catalogFor('generic').some((pack) => pack.id === 'frontend-ui'))
})

test('前端框架探测：package.json 依赖命中即算，构建工具不算', () => {
  assert.deepEqual(detectFrontendFramework({ dependencies: { react: '^19.0.0' } }), { frontend: true, frameworks: ['react'] })
  assert.deepEqual(detectFrontendFramework({ devDependencies: { vue: '^3.4.0' } }), { frontend: true, frameworks: ['vue'] })
  assert.equal(detectFrontendFramework({ peerDependencies: { react: '^18.2.0' } }).frontend, true)
  assert.equal(detectFrontendFramework({ optionalDependencies: { svelte: '^5' } }).frontend, true)
  assert.equal(
    detectFrontendFramework({ dependencies: { express: '^4.19.0' }, devDependencies: { vite: '^6.0.0' } }).frontend,
    false,
    '只有构建工具（vite）不算前端框架',
  )
  assert.deepEqual(detectFrontendFramework(null), { frontend: false, frameworks: [] })
  assert.deepEqual(detectFrontendFramework('oops'), { frontend: false, frameworks: [] })
  assert.ok(FRONTEND_FRAMEWORKS.includes('react') && FRONTEND_FRAMEWORKS.includes('@angular/core'))
})

test('默认规范：前端仓库额外装 frontend-ui，并把前端画像写进 conventions', () => {
  const frontendProfile = { language: 'node', build: 'npm', frontend: true, frameworks: ['react'] }
  const conventions = buildDefaultConventions({ repo: '/r', name: 'web', profile: frontendProfile })
  assert.ok(conventions.installedSkills.some((entry) => entry.id === 'frontend-ui'))
  assert.ok(conventions.constraints.some((entry) => entry.skill === 'frontend-ui' && entry.id === 'ui-tokens'))
  assert.equal(conventions.project.frontend, true)
  assert.deepEqual(conventions.project.frameworks, ['react'])
  const summary = summarizeConventions(conventions)
  assert.equal(summary.frontend, true)
  assert.deepEqual(summary.frameworks, ['react'])

  const backend = buildDefaultConventions({
    repo: '/r2',
    name: 'cli',
    profile: { language: 'node', build: 'npm', frontend: false, frameworks: [] },
  })
  assert.ok(!backend.installedSkills.some((entry) => entry.id === 'frontend-ui'))
  assert.equal(backend.project.frontend, false)
})

test('detectRepoProfile：package.json 命中前端框架才置 frontend=true', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'dev-hub-skills-'))
  try {
    await writeFile(join(repo, 'package.json'), JSON.stringify({
      name: 'web',
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }), 'utf8')
    const profile = await detectRepoProfile(repo)
    assert.equal(profile.language, 'node')
    assert.equal(profile.build, 'npm')
    assert.equal(profile.frontend, true)
    assert.deepEqual(profile.frameworks, ['react', 'react-dom'])
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('detectRepoProfile：无前端框架依赖不置 frontend；package.json 损坏只告警不阻断', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const repo = await mkdtemp(join(tmpdir(), 'dev-hub-skills-'))
  try {
    const empty = await detectRepoProfile(repo)
    assert.equal(empty.language, 'generic')
    assert.equal(empty.frontend, false)
    assert.deepEqual(empty.frameworks, [])

    await writeFile(join(repo, 'package.json'), JSON.stringify({ dependencies: { express: '^4.19.0' } }), 'utf8')
    const backend = await detectRepoProfile(repo)
    assert.equal(backend.language, 'node')
    assert.equal(backend.frontend, false)

    await writeFile(join(repo, 'package.json'), '{ not valid json', 'utf8')
    const broken = await detectRepoProfile(repo)
    assert.equal(broken.language, 'node')
    assert.equal(broken.frontend, false, '解析失败按非前端处理')
    assert.equal(warn.mock.callCount(), 1, '解析失败要显式告警，不能静默降级')
    const conventions = buildDefaultConventions({ repo, name: 'broken', profile: broken })
    assert.ok(!conventions.installedSkills.some((entry) => entry.id === 'frontend-ui'))
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('默认规范：装的是默认技能集合，每条约束都带 skill 归属', () => {
  const conventions = buildDefaultConventions({ repo: '/r', name: 'demo', profile: javaProfile, context: { commands: { localTest: 'mvn test' } } })
  assert.deepEqual(conventions.installedSkills.map((entry) => entry.id), defaultSkillIds('java'))
  assert.ok(conventions.constraints.every((entry) => entry.skill))
  assert.ok(conventions.constraints.some((entry) => entry.skill === 'java-db' && entry.id === 'db'))
  assert.ok(summarizeConventions(conventions).skills.length === conventions.installedSkills.length)
})

test('安装/卸载：只动该包带来的约束，不影响其他包与自定义项', () => {
  let conventions = buildDefaultConventions({ repo: '/r', name: 'demo', profile: javaProfile })
  const removed = uninstallSkill(conventions, 'java-db')
  assert.ok(removed.changed)
  assert.ok(removed.removed >= 2)
  assert.ok(!removed.conventions.constraints.some((entry) => entry.skill === 'java-db'))
  assert.ok(!removed.conventions.installedSkills.some((entry) => entry.id === 'java-db'))
  // 别的包还在
  assert.ok(removed.conventions.constraints.some((entry) => entry.skill === 'java-layering'))

  conventions = addCustomConstraint(removed.conventions, { id: 'mine', title: '我的规则', rule: '必须 X' }).conventions
  const reinstalled = installSkill(conventions, 'java-db')
  assert.ok(reinstalled.changed)
  assert.equal(reinstalled.added, 2)
  assert.ok(reinstalled.conventions.constraints.some((entry) => entry.id === 'mine'), '自定义项不能被安装动作清掉')

  // 重复安装是幂等的
  const again = installSkill(reinstalled.conventions, 'java-db')
  assert.equal(again.changed, false)
  assert.equal(again.reason, 'already-installed')
  // 卸载未安装的也是幂等的
  const never = uninstallSkill(again.conventions, 'node-core')
  assert.equal(never.changed, false)
})

test('自定义约束：新增/修改/删除，内置的只能通过卸载技能包移除', () => {
  const base = buildDefaultConventions({ repo: '/r', name: 'demo', profile: javaProfile })
  const added = addCustomConstraint(base, {
    id: 'my-rule',
    title: '自定义规则',
    rule: '必须做 X',
    check: { kind: 'gate', value: 'npm test' },
    doc: 'docs/x.md',
  })
  assert.equal(added.constraint.skill, 'custom')
  assert.equal(added.constraint.check.kind, 'gate')

  assert.throws(() => addCustomConstraint(added.conventions, { id: 'my-rule', title: 'x', rule: 'y' }), /已存在/)
  assert.throws(() => addCustomConstraint(added.conventions, { id: 'no-title', rule: 'y' }), /标题与规则/)

  const updated = updateConstraint(added.conventions, { id: 'my-rule', title: '改过', rule: '必须做 Y' })
  assert.equal(updated.constraint.title, '改过')
  assert.equal(updated.constraint.check.kind, 'gate', '没传 check 时保留原值')

  const removed = removeConstraint(updated.conventions, 'my-rule')
  assert.ok(!removed.conventions.constraints.some((entry) => entry.id === 'my-rule'))
  assert.throws(() => removeConstraint(base, 'layering'), /卸载对应技能包/)
})

test('regenerate：按已安装集合重建，保留自定义项', () => {
  let conventions = buildDefaultConventions({ repo: '/r', name: 'demo', profile: javaProfile })
  conventions = uninstallSkill(conventions, 'java-contract').conventions
  conventions = addCustomConstraint(conventions, { id: 'mine', title: 't', rule: 'r' }).conventions
  const regenerated = regenerateConventions(conventions)
  assert.ok(!regenerated.constraints.some((entry) => entry.skill === 'java-contract'))
  assert.ok(regenerated.constraints.some((entry) => entry.id === 'mine'))
  assert.ok(regenerated.constraints.some((entry) => entry.skill === 'java-layering'))
})

test('normalizeConventions：老文件（无 installedSkills / 无 skill）能平滑升级', () => {
  const legacy = {
    schemaVersion: 1,
    project: { language: 'java' },
    constraints: [
      { id: 'layering', title: '依赖方向', rule: '单向' },
      { id: 'gate', title: '门禁', rule: '跑门禁' },
      { id: 'my-old', title: '旧自定义', rule: 'x' },
    ],
  }
  const normalized = normalizeConventions(legacy)
  assert.equal(normalized.constraints.find((entry) => entry.id === 'layering').skill, 'java-layering')
  assert.equal(normalized.constraints.find((entry) => entry.id === 'my-old').skill, 'custom')
  assert.ok(normalized.installedSkills.some((entry) => entry.id === 'java-layering'))
})

test('内置工程判断：需求 grill、影响面、代码负担三项约束', () => {
  const pack = findSkill('engineering-judgment')
  assert.ok(pack)
  assert.equal(pack.level, 'L0')
  const ids = pack.constraints.map((entry) => entry.id)
  assert.deepEqual(ids.sort(), ['code-burden', 'impact-map', 'requirement-grill'])
})

test('可选前端体验审查：借鉴 Impeccable/UI UX，不默认安装', () => {
  const pack = findSkill('frontend-experience')
  assert.ok(pack)
  assert.equal(pack.level, 'L1')
  assert.equal(pack.autoInstall, undefined, '可选包不应自动安装')
  assert.deepEqual(pack.constraints.map((entry) => entry.id).sort(), ['ux-accessibility', 'ux-context', 'ux-rendered', 'ux-resilience', 'ux-restraint'])
  assert.ok(!defaultSkillIds('node', { frontend: true }).includes('frontend-experience'))
})

test('开发规则内置 Windows 兼容约束', () => {
  const pack = findSkill('generic-quality')
  const rule = pack.constraints.find((entry) => entry.id === 'windows-compat')
  assert.ok(rule, '缺少 windows-compat 约束')
  assert.match(rule.rule, /path\.join/)
  assert.match(rule.rule, /where|which/)
  assert.match(rule.rule, /\.cmd|\.bat/)
  assert.match(rule.rule, /Ctrl/)
})
