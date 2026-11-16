import assert from 'node:assert/strict'
import test from 'node:test'

const { TEMPLATES, detectTemplate, checksOf } = await import('../src/core/templates.mjs')
const { buildPlan } = await import('../src/core/plan.mjs')
const { planHash } = await import('../src/core/provenance.mjs')

test('模板库：结构完整、id 唯一、必改触点与验收非空（generic 除外）', () => {
  const ids = new Set()
  for (const template of TEMPLATES) {
    assert.ok(template.id && template.name)
    assert.ok(!ids.has(template.id), `重复模板：${template.id}`)
    ids.add(template.id)
    assert.ok(Array.isArray(template.appliesTo) && template.appliesTo.length)
    if (template.id !== 'generic') {
      assert.ok(template.touchpoints.length >= 3, `${template.id} 触点太少`)
      assert.ok(template.checks.length >= 1)
      // bugfix/analysis 没有必读参考文档（靠复现或排查证据），其余模板要求有参考实现
      if (!['bugfix', 'analysis'].includes(template.id)) assert.ok(template.references.length >= 1)
    }
  }
})

test('detectTemplate：按关键词确定性命中；没命中回 generic', () => {
  assert.equal(detectTemplate('新增一个 Gerrit 源的 webhook', 'java').id, 'source-provider')
  assert.equal(detectTemplate('给 controller 加一个 v1 接口', 'java').id, 'api-v1')
  assert.equal(detectTemplate('修改 scheduler 的状态迁移', 'java').id, 'scheduler-change')
  assert.equal(detectTemplate('分析下这条调用链', 'java').id, 'analysis')
  assert.equal(detectTemplate('随便改点东西', 'java').id, 'generic')
  // 同描述多次结果一致
  assert.equal(detectTemplate('新增 SVN 源', 'java').id, detectTemplate('新增 SVN 源', 'java').id)
})

test('analysis 模板：只读触点与结论验收，不挂命令', () => {
  const template = TEMPLATES.find((entry) => entry.id === 'analysis')
  assert.ok(template)
  assert.match(template.touchpoints.join('\n'), /不改代码/)
  assert.match(template.touchpoints.join('\n'), /不产生提交/)
  assert.equal(template.checks[0].id, 'conclusion')
  assert.equal(template.checks[0].command, null)
  assert.match(template.checks[0].assertion, /未改动代码/)
})

test('checksOf：命令行来自模板，测试命令可被仓库命令覆盖', () => {
  const template = TEMPLATES.find((entry) => entry.id === 'source-provider')
  const checks = checksOf(template, { commands: { localTest: 'mvn -o clean test -DskipITs' } })
  assert.equal(checks.find((check) => check.id === 'tests').command, 'mvn -o clean test -DskipITs')
  assert.equal(checks.find((check) => check.id === 'gate').command, 'sh scripts/check.sh')
})

test('buildPlan：模板触点进计划、验收结构化、参考实现带过来', () => {
  const project = { context: { commands: { localTest: 'mvn -o clean test' } } }
  const plan = buildPlan({
    description: '新增一个 Gerrit 源的 webhook',
    recon: { files: [{ path: 'src/main/java/com/gitee/pipeline/source/A.java', score: 5, matches: [] }] },
    scope: ['src/main/java/com/gitee/pipeline/source'],
    project,
  })
  assert.equal(plan.template.id, 'source-provider')
  assert.ok(plan.template.touchpoints.length >= 8)
  assert.ok(plan.checks.length >= 2)
  assert.ok(plan.checks.every((check) => check.id && check.text))
  assert.ok(plan.references.some((reference) => reference.path.endsWith('SourcesProvider.java')))

  const generic = buildPlan({ description: '随便改点东西', recon: null, scope: ['a'], project })
  assert.equal(generic.template.id, 'generic')
  assert.deepEqual(generic.template.touchpoints, [])
})

test('planHash：模板触点或验收命令变化会影响指纹（规则变化可被发现）', () => {
  const base = { steps: ['a'], acceptance: [], modules: [], risks: [], estimate: { size: 'S', days: 1, confidence: 'high' } }
  const withTemplate = { ...base, template: { id: 'source-provider', touchpoints: ['t1'] }, checks: [{ id: 'gate', command: 'sh scripts/check.sh' }] }
  assert.notEqual(planHash(base), planHash(withTemplate))
  assert.notEqual(
    planHash(withTemplate),
    planHash({ ...withTemplate, checks: [{ id: 'gate', command: 'sh scripts/check.sh --full' }] }),
    '验收命令变化要改变指纹',
  )
})
