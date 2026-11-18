import assert from 'node:assert/strict'
import test from 'node:test'

const { detectIntent, INTENT_LABEL, normalizeIntent } = await import('../src/core/intent.mjs')
const { buildPlan } = await import('../src/core/plan.mjs')

test('缺省修复类关键词判为 bug，功能类判为 feature，都没命中时回退', () => {
  assert.equal(detectIntent('修复上传大文件时 500 报错'), 'bug')
  assert.equal(detectIntent('列表偶发卡住、数据重复'), 'bug')
  assert.equal(detectIntent('新增 Gerrit 源支持'), 'feature')
  assert.equal(detectIntent('把通知渠道接入飞书'), 'feature')
  assert.equal(detectIntent('随便弄一下'), 'feature')
})

test('重构类描述判为 refactor；不会被普通功能词淹没', () => {
  assert.equal(detectIntent('把 source 模块拆分并解耦'), 'refactor')
  assert.equal(detectIntent('重构上传链路，提取公共代码'), 'refactor')
  assert.equal(detectIntent('重命名并清理旧实现'), 'refactor')
  assert.equal(INTENT_LABEL.refactor, '代码重构')
})

test('分析类描述判为 analysis；bug/功能词同时出现时优先', () => {
  assert.equal(detectIntent('分析下这条调用链'), 'analysis')
  assert.equal(detectIntent('梳理一下上传链路的现状'), 'analysis')
  assert.equal(detectIntent('评估这段缓存逻辑的影响面'), 'analysis')
  // 同时出现分析词与 bug 词：仍按 bug（先复现/定位，不能绕开修复）
  assert.equal(detectIntent('分析一下这个 bug 为什么 500 报错'), 'bug')
  // 同时出现分析词与功能词：仍按 feature
  assert.equal(detectIntent('分析并新增一个导出功能'), 'feature')
  assert.equal(INTENT_LABEL.analysis, '分析')
})

test('normalizeIntent：只接受四态，非法值回退', () => {
  assert.equal(normalizeIntent('bug'), 'bug')
  assert.equal(normalizeIntent('feature'), 'feature')
  assert.equal(normalizeIntent('refactor'), 'refactor')
  assert.equal(normalizeIntent('analysis'), 'analysis')
  assert.equal(normalizeIntent('other'), null)
  assert.equal(normalizeIntent(undefined, 'feature'), 'feature')
})

test('bug 流程的计划先复现/定位，再改代码', () => {
  const plan = buildPlan({ description: '修复上传失败 500 报错', recon: null, scope: ['src'] })
  assert.equal(plan.intent, 'bug')
  assert.equal(plan.template.id, 'bugfix')
  assert.match(plan.steps[0], /复现/)
  assert.match(plan.steps[1], /定位根因/)
})

test('feature 流程不带复现步骤', () => {
  const plan = buildPlan({ description: '新增参数校验能力', recon: null, scope: ['src'] })
  assert.equal(plan.intent, 'feature')
  assert.doesNotMatch(plan.steps[0], /复现/)
})

test('bug/feature 描述里出现分析词时，不会被套上只读分析模板', () => {
  const bug = buildPlan({ description: '分析这条调用链里的报错', recon: null, scope: ['src'] })
  assert.equal(bug.intent, 'bug')
  assert.notEqual(bug.template.id, 'analysis')

  const feature = buildPlan({ description: '分析并新增导出功能', recon: null, scope: ['src'] })
  assert.equal(feature.intent, 'feature')
  assert.notEqual(feature.template.id, 'analysis')
})

test('显式 analysis 生成只读计划：不修改代码、不补测试、不跑门禁、不提交', () => {
  const plan = buildPlan({
    description: '修复上传失败 500 报错',
    intent: 'analysis',
    recon: { files: [{ path: 'src/core/upload.mjs', score: 5, matches: [] }] },
    scope: ['src/core'],
    project: { context: { commands: { localTest: 'npm test', gate: 'sh scripts/check.sh' } } },
  })
  assert.equal(plan.intent, 'analysis', '显式 analysis 不能被描述里的 bug 词改回')
  assert.equal(plan.template.id, 'analysis')
  const steps = plan.steps.join('\n')
  assert.match(steps, /只读排查/)
  assert.match(steps, /阅读 src 模块：upload\.mjs（只读，不改代码）/)
  assert.doesNotMatch(steps, /阅读并修改/)
  assert.doesNotMatch(steps, /补充单元测试|仓库门禁|同步契约/)
  assert.ok(plan.acceptance.some((text) => /不改代码、不建 worktree、不产生提交/.test(text)))
  assert.ok(plan.acceptance.some((text) => /分析结论已产出/.test(text)))
  assert.ok(plan.acceptance.some((text) => /本机自测通过（只读证据/.test(text)))
})

test('显式 refactor 生成行为不变的重构计划，使用重构模板', () => {
  const plan = buildPlan({ description: '重构上传链路', intent: 'refactor', recon: null, scope: ['src'] })
  assert.equal(plan.intent, 'refactor')
  assert.equal(plan.template.id, 'refactor')
  assert.match(plan.steps[0], /重构边界|行为/)
  assert.match(plan.steps[1], /保护网|测试/)
  assert.ok(plan.checks.some((check) => check.id === 'tests'))
})
