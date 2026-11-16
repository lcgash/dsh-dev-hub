import assert from 'node:assert/strict'
import test from 'node:test'

const {
  REQUIREMENT_SCHEMA,
  REQUIREMENT_SOURCE_LABEL,
  buildRequirementPrompt,
  deriveRequirement,
  extractProse,
  isRawEcho,
  isWeakTitle,
  normalizeRequirementRecord,
  requirementStatusLabel,
  squashText,
  suggestFlowTitle,
} = await import('../src/shared/requirement.mjs')

const RAW = '流程和技能的时候其实都是在某个开发库或者工作区了，把这个信息放在头上面，不然不知道这个技能是在管理什么库的'

test('isRawEcho：只差空白/标点也算原样搬运；真正改写过的算不同', () => {
  assert.equal(isRawEcho(` ${RAW}。`, RAW), true)
  assert.equal(isRawEcho('在流程与技能页头部显示所属代码库或工作区', RAW), false)
  assert.equal(isRawEcho('', RAW), false, '空值不算回填')
  // 只截取原话一小段（<80%）不算回填，避免把正常引用误杀
  assert.equal(isRawEcho('不知道这个技能是在管理什么库的', RAW), false)
  assert.equal(squashText('A b，C。'), 'abc')
})

test('deriveRequirement：有澄清规格时，目标和根因来自澄清，原始需求原样保留', () => {
  const requirement = deriveRequirement({
    description: RAW,
    spec: {
      problem: '流程与技能页只显示「开发工作站」，看不到当前作用的代码库或工作区，用户无法判断自己在管理哪个库',
      goals: ['在流程页与技能页头部常驻展示当前代码库/工作区'],
      nonGoals: ['不改动流程数据模型'],
      acceptance: ['流程图头部能看到库名', '切换代码库后头部立即更新'],
      scope: ['src/client'],
    },
    title: '头部显示所属代码库',
  })
  assert.equal(requirement.source, 'clarify')
  assert.equal(requirement.needsReview, false, '澄清过且不是原话，才算规范化完成')
  assert.equal(requirement.raw, RAW, '原始需求必须一字不改保留')
  assert.equal(requirement.goal, '在流程页与技能页头部常驻展示当前代码库/工作区')
  assert.match(requirement.rootProblem, /看不到当前作用的代码库/)
  assert.deepEqual(requirement.nonGoals, ['不改动流程数据模型'])
  assert.equal(requirement.acceptance.length, 2)
  assert.deepEqual(requirement.scopeHints, ['src/client'])
})

test('deriveRequirement：没有澄清规格时给本地草稿，并明确标记待规范化', () => {
  const requirement = deriveRequirement({ description: RAW, spec: {}, title: 'x' })
  assert.equal(requirement.source, 'local')
  assert.equal(requirement.needsReview, true, '只有客户原话时不能假装规范化完成')
  assert.equal(requirement.raw, RAW)
  assert.equal(requirement.goal, RAW)
  assert.match(requirement.missing.join(' '), /原话/)
})

test('deriveRequirement：澄清 agent 把原话照抄回来 → 仍标记待规范化（不冒充已整理）', () => {
  const requirement = deriveRequirement({
    description: RAW,
    spec: { problem: RAW, goals: [RAW], acceptance: ['头部能看到库名'] },
  })
  assert.equal(requirement.source, 'clarify')
  assert.equal(requirement.needsReview, true, '照抄原话不算规范化')
})

test('normalizeRequirementRecord：非法来源/超长字段被收敛，来源白名单外回退 local', () => {
  const requirement = normalizeRequirementRecord({
    raw: 'x',
    goal: 'y'.repeat(3000),
    rootProblem: 'z'.repeat(3000),
    source: 'hacker',
    acceptance: Array.from({ length: 30 }, (_, index) => `a${index}`),
    nonGoals: ['', ' ', 'n'],
  }, { description: 'fallback' })
  assert.equal(requirement.source, 'local')
  assert.equal(requirement.goal.length, 2000)
  assert.ok(requirement.acceptance.length <= 12)
  assert.deepEqual(requirement.nonGoals, ['n'])
  assert.equal(requirement.raw, 'x', '显式 raw 优先于 description')
})

test('normalizeRequirementRecord：缺 raw 时用 description，空目标/根因回退原话并标记', () => {
  const requirement = normalizeRequirementRecord({}, { description: RAW })
  assert.equal(requirement.raw, RAW)
  assert.equal(requirement.goal, RAW)
  assert.equal(requirement.rootProblem, RAW)
  assert.equal(requirement.needsReview, true)
})

test('buildRequirementPrompt：带原话/澄清规格/追问答案/仓库证据，并要求改写而不是照抄', () => {
  const prompt = buildRequirementPrompt({
    description: RAW,
    title: '头部显示所属库',
    spec: { problem: '用户不知道当前库', goals: ['头部展示库名'] },
    answers: { scope: { selected: ['only:client'] } },
    recon: { files: [{ path: 'src/client/index.mjs', why: '页面头部' }] },
  })
  assert.match(prompt, /客户原始需求/)
  assert.match(prompt, new RegExp(RAW.slice(0, 10)))
  assert.match(prompt, /用户不知道当前库/)
  assert.match(prompt, /src\/client\/index\.mjs/)
  assert.match(prompt, /only:client/)
  assert.match(prompt, /不得与原始需求逐字相同/)
  assert.match(prompt, /只输出 JSON/)
  // 输出契约必须覆盖目标/根因/背景/期望/验收
  for (const field of ['goal', 'rootProblem', 'background', 'expected', 'acceptance']) {
    assert.ok(REQUIREMENT_SCHEMA.properties[field], `schema 缺少 ${field}`)
  }
  assert.deepEqual(REQUIREMENT_SCHEMA.required, ['goal', 'rootProblem'])
})

test('requirementStatusLabel：来源与"待规范化"一眼可见', () => {
  assert.equal(requirementStatusLabel({ source: 'clarify', needsReview: false }), REQUIREMENT_SOURCE_LABEL.clarify)
  assert.match(requirementStatusLabel({ source: 'local', needsReview: true }), /待规范化/)
  assert.equal(requirementStatusLabel(null), '未规范化')
})

const CODE_RAW = '@JsonSubTypes({\n        @JsonSubTypes.Type(GiteeCodeSourceBuildRequest.class),\n        @JsonSubTypes.Type(GiteeGoSourceBuildRequest.class)\n})\n补充一下PipelineBuildSourceRequest的 subtype，同时评估一下，是不是更改成自定义的序列化解释器会不会更好，现在是自动推断'
const CODE_RAW_2 = '@TableField(typeHandler = Jackson3TypeHandler.class)\n    private BuildTriggerStruct data;\n这个里面有一个触发类型，把他提取出来，分散到这个表字段上面'

test('isWeakTitle：代码/注解/文件名/原话不算标题，动宾短语才算', () => {
  assert.equal(isWeakTitle('', CODE_RAW), true)
  assert.equal(isWeakTitle('@JsonSubTypes({', CODE_RAW), true, '注解行不能当标题')
  assert.equal(isWeakTitle('@TableField(typeHandler = Jackson3TypeHa', CODE_RAW_2), true)
  assert.equal(isWeakTitle('jsonsubtypes-jsonsubtypes-type', CODE_RAW), true, '纯标识符不能当标题')
  assert.equal(isWeakTitle('src/client/index.mjs', CODE_RAW), true, '文件名不能当标题')
  assert.equal(isWeakTitle(CODE_RAW.slice(0, 20), CODE_RAW), true, '代码片段不能当标题')
  const longEcho = '这是一段很长的客户原话，说明现在的问题和期望，但整段直接当标题显然不合适'
  assert.equal(isWeakTitle(longEcho, longEcho), true, '长段原话不能当标题')
  assert.equal(isWeakTitle('source 补 webhook', 'source 补 webhook'), false, '短句本身就是个可用标题')
  assert.equal(isWeakTitle('补齐源构建请求的多态反序列化子类型', CODE_RAW), false)
  assert.equal(isWeakTitle('api v1 的 swagger 注解完善', CODE_RAW), false)
})

test('suggestFlowTitle：优先澄清标题，其次规范化目标，最后按注解/类名兜底', () => {
  assert.equal(
    suggestFlowTitle({ description: CODE_RAW, spec: { title: '补齐源构建请求的多态反序列化子类型' } }),
    '补齐源构建请求的多态反序列化子类型',
  )
  const fromGoal = suggestFlowTitle({ description: CODE_RAW, goal: '评估 DEDUCTION 与自定义反序列化器的取舍，补齐源构建请求的子类型' })
  assert.match(fromGoal, /^评估 DEDUCTION 与自定义反序列化器的取舍/)
  assert.ok(fromGoal.length <= 40)
  const fallback = suggestFlowTitle({ description: CODE_RAW })
  assert.ok(fallback && !isWeakTitle(fallback, CODE_RAW), `兜底标题也必须可用：${fallback}`)
  assert.notEqual(fallback, CODE_RAW.split('\n')[0], '不能拿第一行代码当标题')
  const fallback2 = suggestFlowTitle({ description: CODE_RAW_2 })
  assert.ok(fallback2 && !isWeakTitle(fallback2, CODE_RAW_2))
  assert.match(fallback2, /TableField|触发|BuildTrigger/, `兜底标题应围绕主题：${fallback2}`)
})

test('deriveRequirement：标题一起生成，不再沿用用户输入的第一行', () => {
  const requirement = deriveRequirement({ description: CODE_RAW, spec: {} })
  assert.ok(requirement.title, '必须生成标题')
  assert.notEqual(requirement.title, '@JsonSubTypes({')
  assert.equal(isWeakTitle(requirement.title, CODE_RAW), false)
  // 澄清规格里给了标题时直接采用
  const withSpec = deriveRequirement({ description: CODE_RAW, spec: { problem: '子类型缺失', goals: ['补齐子类型'], title: '补齐源构建请求的子类型' } })
  assert.equal(withSpec.title, '补齐源构建请求的子类型')
})

test('extractProse：跳过注解/声明行，只留人话', () => {
  const prose = extractProse(CODE_RAW)
  assert.doesNotMatch(prose, /@JsonSubTypes/)
  assert.match(prose, /补充一下PipelineBuildSourceRequest/)
})
