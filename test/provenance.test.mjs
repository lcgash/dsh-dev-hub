import assert from 'node:assert/strict'
import test from 'node:test'

const {
  PROMPT_VERSION, stableStringify, hashOf, normalizeAnswers, specHash,
  conventionsHash, inputHash, planHash, recordProvenance, pluginVersion,
} = await import('../src/core/provenance.mjs')
const { reproPlan, planInputsFromItem } = await import('../src/core/repro.mjs')
const { PLAN_RULES_VERSION, buildPlan } = await import('../src/core/plan.mjs')

test('稳定哈希：键顺序/答案顺序不影响结果，内容变化会变', () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }))
  assert.equal(hashOf({ a: 1, b: [1, 2] }), hashOf({ b: [1, 2], a: 1 }))
  assert.notEqual(hashOf({ a: 1 }), hashOf({ a: 2 }))

  const one = normalizeAnswers({ tests: { selected: ['b', 'a'] }, scope: 'only source' })
  const two = normalizeAnswers({ scope: { selected: [], custom: 'only source' }, tests: { selected: ['a', 'b'] } })
  assert.deepEqual(one, two, '答案规范化后应一致')
})

test('specHash/inputHash：描述或答案变了要变；规范变了 inputHash 变但 specHash 不变', () => {
  const base = { description: '给 A 加 B', answers: { q1: { selected: ['x'] } }, scope: ['src/a'] }
  const s1 = specHash(base)
  assert.equal(s1, specHash({ ...base, answers: { q1: { selected: ['x'] } } }))
  assert.notEqual(s1, specHash({ ...base, description: '给 A 加 C' }))
  assert.notEqual(s1, specHash({ ...base, answers: { q1: { selected: ['y'] } } }))

  const conventions = { installedSkills: [{ id: 'core-discipline' }], constraints: [{ id: 'scope' }, { id: 'gate' }] }
  const i1 = inputHash({ ...base, conventions })
  assert.equal(s1, specHash(base), 'specHash 不含规范')
  assert.notEqual(i1, inputHash({ ...base, conventions: { ...conventions, constraints: [{ id: 'scope' }] } }))
  assert.equal(conventionsHash({ constraints: [{ id: 'b' }, { id: 'a' }] }), conventionsHash({ constraints: [{ id: 'a' }, { id: 'b' }] }))
})

test('planHash：语义相同则同哈希，步骤或工程量变了会变', () => {
  const plan = { steps: ['a', 'b'], acceptance: ['x'], modules: ['m'], risks: [], estimate: { size: 'M', days: 2, confidence: 'medium' } }
  assert.equal(planHash(plan), planHash({ ...plan, generatedAt: 'later' }), '生成时间不参与')
  assert.notEqual(planHash(plan), planHash({ ...plan, steps: ['a'] }))
  assert.notEqual(planHash(plan), planHash({ ...plan, estimate: { ...plan.estimate, days: 3 } }))
})

test('recordProvenance：按类型累积，不覆盖其他段', () => {
  const item = {}
  recordProvenance(item, 'recon', { engine: 'dsh', outputHash: 'h1' })
  recordProvenance(item, 'plan', { hash: 'p1' })
  assert.equal(item.provenance.recon.outputHash, 'h1')
  assert.equal(item.provenance.plan.hash, 'p1')
  assert.ok(item.provenance.pluginVersion)
  assert.equal(item.provenance.pluginVersion, pluginVersion())
  assert.equal(PROMPT_VERSION.scan >= 1, true)
})

const project = { context: { commands: { localTest: 'mvn -o clean test', gate: 'sh scripts/check.sh' } } }
const conventions = { installedSkills: [{ id: 'core-discipline' }], constraints: [{ id: 'scope' }] }
const recon = { files: [{ path: 'src/a/A.java', score: 9, matches: [{ line: 1, text: 'class A' }] }], tokens: ['a'] }
const answers = { 'scope-narrow': { selected: ['only:a'] } }

function flowItem(extra = {}) {
  const plan = buildPlan({ description: '给 A 加 B', recon, scope: ['src/a'], answers, project, conventions })
  return {
    id: 'f1',
    description: '给 A 加 B',
    answers,
    scope: ['src/a'],
    recon: { files: recon.files, tokens: recon.tokens },
    provenance: {
      pluginVersion: pluginVersion(),
      plan: {
        hash: planHash(plan),
        inputHash: inputHash({ description: '给 A 加 B', answers, scope: ['src/a'], conventions }),
        specHash: specHash({ description: '给 A 加 B', answers, scope: ['src/a'] }),
        pluginVersion: pluginVersion(),
        planVersion: PLAN_RULES_VERSION,
      },
    },
    ...extra,
  }
}

test('reproPlan：同输入 ⇒ same，计划哈希一致', () => {
  const item = flowItem()
  const result = reproPlan(item, { project, conventions })
  assert.equal(result.recorded, true)
  assert.equal(result.same, true)
  assert.equal(result.inputChanged, false)
  assert.equal(result.planChanged, false)
  assert.match(result.message, /一致/)
  assert.deepEqual(planInputsFromItem(item).scope, ['src/a'])
})

test('reproPlan：答案变了 → inputChanged；规范变了 → 也 inputChanged', () => {
  const item = flowItem()
  const changedAnswers = { ...item, answers: { 'scope-narrow': { selected: ['only:b'] } } }
  const a = reproPlan(changedAnswers, { project, conventions })
  assert.equal(a.inputChanged, true)
  assert.equal(a.same, false)
  assert.match(a.message, /输入已变化/)

  const changedConventions = { installedSkills: [{ id: 'core-discipline' }], constraints: [{ id: 'scope' }, { id: 'gate' }] }
  const b = reproPlan(item, { project, conventions: changedConventions })
  assert.equal(b.inputChanged, true, '技能包变了也算输入变化（规则是输入的一部分）')
})

test('reproPlan：输入没变但计划哈希不同 → planChanged（手改计划或版本变了）', () => {
  const item = flowItem()
  item.provenance.plan.hash = 'deadbeefdeadbeef'
  const result = reproPlan(item, { project, conventions })
  assert.equal(result.inputChanged, false)
  assert.equal(result.planChanged, true)
  assert.equal(result.attention, true)
  assert.match(result.message, /不一致/)
})

test('reproPlan：旧流程没有指纹 → recorded=false，给出补记录提示', () => {
  const item = flowItem({ provenance: null })
  const result = reproPlan(item, { project, conventions })
  assert.equal(result.recorded, false)
  assert.equal(result.same, false)
  assert.match(result.message, /还没有记录计划指纹/)
})

test('reproPlan：旧流程没有计划规则版本 → 计划变化不报警，提示重算对齐', () => {
  const item = flowItem()
  delete item.provenance.plan.planVersion
  item.provenance.plan.hash = 'deadbeefdeadbeef'
  const result = reproPlan(item, { project, conventions })
  assert.equal(result.legacyVersion, true)
  assert.equal(result.attention, false)
  assert.match(result.message, /重算/)
})
