import assert from 'node:assert/strict'
import test from 'node:test'

const { estimateWork, sizeForDays } = await import('../src/core/estimate.mjs')
const { deriveQuestions, answeredQuestions } = await import('../src/core/questions.mjs')
const { buildPlan, summarizePlan } = await import('../src/core/plan.mjs')

function reconFixture(overrides = {}) {
  return {
    description: '给 source 的 GitlabCodeProvider 补 webhook 重试',
    tokens: ['gitlabcodeprovider', 'webhook'],
    files: [
      {
        path: 'src/main/java/com/gitee/pipeline/source/GitlabCodeProvider.java',
        score: 20,
        matches: [{ line: 81, text: 'public class GitlabCodeProvider extends SourcesProvider {' }],
      },
      {
        path: 'src/test/java/com/gitee/pipeline/source/GitlabCodeProviderTest.java',
        score: 18,
        matches: [{ line: 53, text: 'class GitlabCodeProviderTest {' }],
      },
    ],
    modules: [{ name: 'source', path: 'src/main/java/com/gitee/pipeline/source', kind: 'java-package', hits: 2 }],
    suggestedScope: ['src/main/java/com/gitee/pipeline/source'],
    scanned: 1200,
    truncated: false,
    ...overrides,
  }
}

const project = {
  context: {
    commands: {
      compile: 'mvn -o clean compile',
      localTest: 'mvn -o clean test',
      gate: 'sh scripts/check.sh --full',
    },
  },
}

test('estimateWork：用户不填，工作站按命中与风险自评，并给出可核对的依据', () => {
  const estimate = estimateWork({ recon: reconFixture(), scope: ['src/main/java/com/gitee/pipeline/source'], commands: project.context.commands })
  assert.ok(['S', 'M', 'L', 'XL'].includes(estimate.size))
  assert.ok(estimate.days > 0)
  assert.ok(estimate.basis.length >= 3, '必须有“为什么是这个量级”的依据')
  assert.match(estimate.basis.join(' '), /2 个候选文件/)
  assert.match(estimate.basis.join(' '), /命中里已包含测试/)
  assert.equal(estimate.metrics.hasTests, true)

  // 同样的输入两次结果一致（可复算），但 computedAt 可以变
  const again = estimateWork({ recon: reconFixture(), scope: [], commands: project.context.commands })
  assert.equal(again.size, estimate.size)
  assert.equal(again.days, estimate.days)
})

test('estimateWork：命中越散/风险越高，评估越大', () => {
  const small = estimateWork({ recon: reconFixture(), commands: project.context.commands })
  const big = estimateWork({
    recon: reconFixture({
      files: [
        ...reconFixture().files,
        { path: 'src/main/resources/db/migration/V30__x.sql', score: 5, matches: [{ line: 1, text: 'CREATE TABLE x' }] },
        { path: 'src/main/java/com/gitee/pipeline/controller/PipelineController.java', score: 5, matches: [{ line: 2, text: '@GetMapping' }] },
        { path: 'src/main/java/com/gitee/pipeline/dao/XDao.java', score: 5, matches: [{ line: 2, text: 'select' }] },
      ],
      modules: [
        { name: 'source', path: 'src/main/java/com/gitee/pipeline/source', kind: 'java-package', hits: 2 },
        { name: 'controller', path: 'src/main/java/com/gitee/pipeline/controller', kind: 'java-package', hits: 1 },
        { name: 'dao', path: 'src/main/java/com/gitee/pipeline/dao', kind: 'java-package', hits: 1 },
      ],
    }),
    commands: project.context.commands,
  })
  assert.ok(big.days > small.days, '跨模块 + 库表/契约风险应比单模块大')
  assert.ok(big.risks.some((risk) => risk.kind === 'db'))
  assert.ok(big.risks.some((risk) => risk.kind === 'contract'))
})

test('estimateWork：没命中时给最小估算且置信度低', () => {
  const estimate = estimateWork({ recon: { files: [], modules: [] }, commands: {} })
  assert.equal(estimate.size, 'S')
  assert.equal(estimate.confidence, 'low')
  assert.match(estimate.basis.join(' '), /没有命中/)
})

test('sizeForDays：边界换算', () => {
  assert.equal(sizeForDays(0.5), 'S')
  assert.equal(sizeForDays(2), 'M')
  assert.equal(sizeForDays(5), 'L')
  assert.equal(sizeForDays(9), 'XL')
})

test('deriveQuestions：只问真影响做法的事，最多 4 个，每个都带 why', () => {
  const questions = deriveQuestions({ description: '加个功能', recon: reconFixture(), project })
  assert.ok(questions.length <= 4)
  assert.ok(questions.every((question) => question.why), '每个追问都要说明为什么问')
  assert.ok(questions.every((question) => ['choice', 'text'].includes(question.kind)))

  // 命中分散到 3 个模块 -> 问范围；没有测试命中 -> 问要不要补测试
  const scattered = deriveQuestions({
    description: '给 source 的 GitlabCodeProvider 补 webhook 重试',
    recon: reconFixture({
      files: [{ path: 'src/main/java/com/gitee/pipeline/source/A.java', score: 2, matches: [] }],
      modules: [
        { name: 'source', path: 'src/main/java/com/gitee/pipeline/source', kind: 'java-package', hits: 1 },
        { name: 'controller', path: 'src/main/java/com/gitee/pipeline/controller', kind: 'java-package', hits: 1 },
        { name: 'dao', path: 'src/main/java/com/gitee/pipeline/dao', kind: 'java-package', hits: 1 },
      ],
    }),
    project,
  })
  assert.ok(scattered.some((question) => question.id === 'scope-narrow'))
  assert.ok(scattered.some((question) => question.id === 'tests'))
})

test('deriveQuestions：命中为空时先问范围，短描述再问预期行为', () => {
  const questions = deriveQuestions({ description: '改一下', recon: { files: [], modules: [], suggestedScope: [] }, project })
  assert.equal(questions[0].id, 'scope-fallback')
  assert.ok(questions.some((question) => question.id === 'expectation'))
})

test('answeredQuestions：只保留真正回答过的，并带时间', () => {
  const questions = deriveQuestions({ description: '加个功能', recon: reconFixture(), project })
  const answers = { [questions[0].id]: '只改 source' }
  const recorded = answeredQuestions(questions, answers)
  assert.equal(recorded.length, 1)
  assert.equal(recorded[0].question, questions[0].question)
  assert.ok(recorded[0].answeredAt)
  assert.deepEqual(answeredQuestions(questions, {}), [])
})

test('buildPlan：计划由工作站生成（步骤/验收/风险/自评），用户只给一句话', () => {
  const recon = reconFixture()
  const plan = buildPlan({ description: '给 source 的 GitlabCodeProvider 补 webhook 重试', recon, scope: recon.suggestedScope, project })

  assert.match(plan.summary, /GitlabCodeProvider/)
  assert.ok(plan.steps.length >= 3)
  assert.ok(plan.steps.some((step) => step.includes('source 模块')), '按模块出实施步骤')
  // 测试/门禁属于「测试验证」阶段：不能写进开发步骤，否则开发会话会把测试也做一遍
  assert.ok(!plan.steps.some((step) => step.includes('mvn -o clean test')), '测试命令不进开发步骤')
  assert.ok(!plan.steps.some((step) => step.includes('sh scripts/check.sh --full')), '门禁命令不进开发步骤')
  assert.ok(plan.steps.some((step) => step.includes('回写任务进度与变更点')), '开发交接只回写过程事实')
  assert.ok(plan.acceptance.some((item) => item.includes('本机自测通过')))
  assert.ok(plan.acceptance.some((item) => item.includes('工作站')), '验收标准要说明由工作站执行测试/门禁')
  assert.ok(plan.estimate.days > 0)
  assert.ok(plan.modules.includes('source'))
  assert.equal(summarizePlan(plan).includes('人日'), true)
})

test('buildPlan：追问答案影响计划（缩小范围 / 不补测试 / 不同步契约）', () => {
  const recon = reconFixture({
    files: [
      { path: 'src/main/java/com/gitee/pipeline/source/A.java', score: 9, matches: [{ line: 3, text: 'x' }] },
      { path: 'src/main/java/com/gitee/pipeline/controller/B.java', score: 8, matches: [{ line: 4, text: 'y' }] },
      { path: 'src/main/resources/db/migration/V9__z.sql', score: 7, matches: [{ line: 5, text: 'z' }] },
    ],
  })
  const narrowed = buildPlan({
    description: 'x',
    recon,
    scope: ['src/main/java/com/gitee/pipeline/source'],
    project,
    answers: { 'scope-narrow': { mode: 'only', module: 'source' }, tests: 'no-tests', 'risk-contract': 'internal-only' },
  })
  assert.deepEqual(narrowed.modules, ['source'], '只改 source 就只出 source 步骤')
  assert.ok(!narrowed.steps.some((step) => step.includes('契约')), '确认只改内部实现就不带契约步骤')
  assert.ok(narrowed.steps.some((step) => step.includes('暂不补测试')))
  assert.ok(!narrowed.acceptance.some((item) => item.includes('契约')))

  const full = buildPlan({ description: 'x', recon, scope: [], project, answers: {} })
  assert.ok(full.modules.length > 1, '不追问时按全部命中出计划')
  assert.ok(full.steps.some((step) => step.includes('契约')), '有库表/契约命中时默认带上同步步骤')
})

test('计划固化确认范围与文件，供切页/刷新后的计划卡回看', () => {
  const plan = buildPlan({
    description: '给 source 加配置者',
    recon: { files: [{ path: 'src/a.mjs', score: 2, matches: [] }, { path: 'src/b.mjs', score: 1, matches: [] }] },
    scope: ['src'],
  })
  assert.deepEqual(plan.scope, ['src'])
  assert.deepEqual(plan.files.sort(), ['src/a.mjs', 'src/b.mjs'])
})
