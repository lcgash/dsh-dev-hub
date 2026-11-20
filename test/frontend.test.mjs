/**
 * 前端适用性：模块边界、测试文件识别、包管理器/脚本命令、前端模板与计划。
 * 这些用例防止开发站退化成“只认 Maven/Java”的后端工具。
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const { moduleOfPath, kindOfPath } = await import('../src/core/modules.mjs')
const { estimateWork } = await import('../src/core/estimate.mjs')
const { detectRepoProfile } = await import('../src/core/conventions.mjs')
const { detectTemplate, checksOf } = await import('../src/core/templates.mjs')
const { buildPlan } = await import('../src/core/plan.mjs')
const { deriveQuestions } = await import('../src/core/questions.mjs')

test('前端模块边界：features/components/pages/hooks 与 monorepo 都能分开', () => {
  assert.equal(moduleOfPath('src/features/auth/Login.tsx'), 'features/auth')
  assert.equal(moduleOfPath('src/components/Button/index.tsx'), 'components/Button')
  assert.equal(moduleOfPath('src/pages/Home/index.tsx'), 'pages/Home')
  assert.equal(moduleOfPath('src/hooks/useAuth.ts'), 'hooks')
  assert.equal(moduleOfPath('src/App.tsx'), 'src')
  assert.equal(moduleOfPath('packages/web/src/pages/Home.tsx'), 'packages/web/pages')
  assert.equal(moduleOfPath('packages/web/src/index.ts'), 'packages/web/src')
  assert.equal(moduleOfPath('web/src/pages/Home.tsx'), 'web/pages')
  assert.equal(moduleOfPath('web/src/features/auth/Login.tsx'), 'web/features/auth')
  assert.equal(moduleOfPath('app/dashboard/page.tsx'), 'app/dashboard')
  // 测试目录不另立模块，回到被测模块
  assert.equal(moduleOfPath('src/features/auth/__tests__/auth.test.ts'), 'features/auth')
})

test('前端测试文件：*.test.tsx / *.spec.ts / __tests__ / e2e 都识别为 test', () => {
  assert.equal(kindOfPath('src/pages/Home.test.tsx'), 'test')
  assert.equal(kindOfPath('src/components/Button.spec.ts'), 'test')
  assert.equal(kindOfPath('src/pages/__tests__/Home.tsx'), 'test')
  assert.equal(kindOfPath('e2e/login.spec.ts'), 'test')
  assert.equal(kindOfPath('src/pages/Home.tsx'), 'code')
})

test('前端仓库画像：pnpm + React + package scripts 都进 profile', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'devhub-fe-profile-'))
  try {
    await mkdir(join(repo, 'src'), { recursive: true })
    await writeFile(join(repo, 'package.json'), JSON.stringify({
      name: 'web',
      packageManager: 'pnpm@9.1.0',
      scripts: { build: 'vite build', test: 'vitest run', lint: 'eslint .', typecheck: 'tsc --noEmit' },
      dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
    }), 'utf8')
    await writeFile(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf8')
    const profile = await detectRepoProfile(repo)
    assert.equal(profile.language, 'node')
    assert.equal(profile.frontend, true)
    assert.deepEqual(profile.frameworks, ['react', 'react-dom'])
    assert.equal(profile.packageManager, 'pnpm')
    assert.equal(profile.build, 'pnpm')
    assert.equal(profile.scripts.test, 'vitest run')
    assert.equal(profile.scripts.build, 'vite build')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('前端估算：.test.tsx 算测试、package.json 算依赖风险', () => {
  const recon = {
    files: [
      { path: 'src/pages/Home.tsx', matches: [{ line: 3, text: 'export' }] },
      { path: 'src/pages/Home.test.tsx', matches: [{ line: 1, text: 'test' }] },
      { path: 'package.json', matches: [{ line: 2, text: 'react' }] },
    ],
  }
  const estimate = estimateWork({ recon, scope: ['src/pages'], commands: { gate: 'pnpm run lint' } })
  assert.equal(estimate.metrics.hasTests, true, '.test.tsx 要算测试命中')
  assert.ok(estimate.risks.some((risk) => risk.kind === 'deps'), 'package.json 要算依赖/公共契约风险')
  assert.match(estimate.basis.join(' '), /依赖\/公共契约/)
})

test('前端模板：命中页面/组件/交互，验收命令跟仓库走', () => {
  const template = detectTemplate('优化设置页弹窗的样式、交互和 loading 状态', 'node')
  assert.equal(template.id, 'frontend-ui')
  const checks = checksOf(template, {
    commands: { localTest: 'pnpm test', force: null, build: 'pnpm run build', gate: 'pnpm run lint && pnpm run typecheck' },
  })
  const byId = Object.fromEntries(checks.map((check) => [check.id, check]))
  assert.equal(byId.tests.command, 'pnpm test')
  assert.equal(byId.build.command, 'pnpm run build')
  assert.equal(byId.gate.command, 'pnpm run lint && pnpm run typecheck')
})

test('前端计划：状态覆盖进入步骤，验收/风险按前端措辞', () => {
  const commands = { localTest: 'pnpm test', build: 'pnpm run build', gate: 'pnpm run lint && pnpm run typecheck' }
  const project = { context: { commands } }
  const conventions = { project: { language: 'node', frontend: true } }
  const plan = buildPlan({
    description: '给登录页加 loading 和错误提示',
    language: 'node',
    recon: {
      files: [
        { path: 'src/pages/Login.tsx', matches: [{ line: 1, text: 'export' }] },
        { path: 'package.json', matches: [{ line: 1, text: 'react' }] },
      ],
      modules: [{ name: 'pages' }],
    },
    scope: ['src/pages'],
    answers: { 'ui-states': 'all-states', 'risk-contract': 'sync-all' },
    project,
    conventions,
  })
  assert.equal(plan.template.id, 'frontend-ui')
  assert.ok(plan.steps.some((step) => /loading \/ empty \/ error/.test(step)))
  assert.ok(plan.steps.some((step) => /package\.json/.test(step)))
  assert.ok(plan.acceptance.some((entry) => /pnpm test/.test(entry)))
  assert.ok(plan.acceptance.some((entry) => /package\.json/.test(entry)))
  assert.ok(plan.risks.some((risk) => /依赖\/公共契约/.test(risk)))
})

test('前端追问：会问 UI 状态覆盖范围，风险问题按依赖/样式措辞', () => {
  const questions = deriveQuestions({
    description: '优化设置页的弹窗样式和交互',
    recon: {
      files: [
        { path: 'src/pages/Settings.tsx' },
        { path: 'package.json' },
      ],
      modules: [{ name: 'pages' }],
    },
    project: { context: { commands: { localTest: 'pnpm test' } } },
    conventions: { project: { frontend: true, language: 'node' } },
  })
  assert.ok(questions.some((question) => question.id === 'ui-states'))
  const risk = questions.find((question) => question.id === 'risk-contract')
  assert.ok(risk)
  assert.match(risk.question, /依赖\/公共契约/)
  assert.ok(!/库表/.test(risk.question), 'package.json 风险不能写成库表')
})


test('纯 Vite/TS 前端：框架依赖为空也算前端工程，但 Vite 不混进 frameworks', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'devhub-fe-vite-'))
  try {
    await mkdir(join(repo, 'src'), { recursive: true })
    await writeFile(join(repo, 'package.json'), JSON.stringify({
      name: 'vite-app',
      scripts: { build: 'vite build', test: 'vitest run', lint: 'eslint .' },
      devDependencies: { vite: '^6.0.0', typescript: '^5.6.0' },
    }), 'utf8')
    const profile = await detectRepoProfile(repo)
    assert.equal(profile.language, 'node')
    assert.equal(profile.frontend, true, '只有 Vite 也要识别为前端工程')
    assert.deepEqual(profile.frameworks, [])
    assert.deepEqual(profile.frontendTooling, ['vite'])
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('Java 根 + web/ 前端子项目：命令合并前端 test/gate/e2e，不忽略 web', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'devhub-fe-mono-'))
  try {
    await mkdir(join(repo, 'web/src'), { recursive: true })
    await writeFile(join(repo, 'pom.xml'), '<project/>\n', 'utf8')
    await mkdir(join(repo, 'scripts'), { recursive: true })
    await writeFile(join(repo, 'scripts/check.sh'), '#!/bin/sh\nexit 0\n', 'utf8')
    await writeFile(join(repo, 'web/package.json'), JSON.stringify({
      name: 'web',
      scripts: {
        build: 'vite build',
        test: 'vitest run',
        lint: 'eslint .',
        typecheck: 'tsc --noEmit',
        'test:e2e': 'playwright test',
      },
      dependencies: { react: '^18.2.0' },
    }), 'utf8')
    await writeFile(join(repo, 'web/pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf8')
    const profile = await detectRepoProfile(repo)
    assert.equal(profile.language, 'java')
    assert.equal(profile.frontend, true)
    assert.equal(profile.frontendProjects.length, 1)
    assert.equal(profile.frontendProjects[0].path, 'web')
    assert.equal(profile.frontendProjects[0].packageManager, 'pnpm')
    assert.deepEqual(profile.frontendProjects[0].frameworks, ['react'])
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('Angular/Svelte 有专门模板与框架检查点', () => {
  const angular = detectTemplate('优化 Angular 列表组件的 change detection 和 observable 订阅', 'node')
  assert.equal(angular.id, 'frontend-angular')
  assert.match(angular.touchpoints.join('\n'), /standalone|signals|订阅/)
  const svelte = detectTemplate('改 SvelteKit 的 +page load 和 form action', 'node')
  assert.equal(svelte.id, 'frontend-svelte')
  assert.match(svelte.touchpoints.join('\n'), /runes|load|form action/)
})
