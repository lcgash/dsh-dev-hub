import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

// 本机 profile 独立目录（需求规范化要读写台账，不能污染真实 ~/.dsh/dev-hub）
const home = await mkdtemp(join(tmpdir(), 'devhub-req-home-'))
process.env.DEVHUB_HOME = home

const { apply } = await import('../src/index.mjs')
const { API } = await import('../src/shared/api.mjs')
const { isRawEcho, isWeakTitle } = await import('../src/shared/requirement.mjs')

const RAW = '流程和技能的时候其实都是在某个开发库或者工作区了，把这个信息放在头上面，不然不知道这个技能是在管理什么库的'
const SPEC = {
  title: '补齐源构建请求的多态反序列化子类型',
  problem: '流程页与技能页只显示「开发工作站」，看不到当前作用的代码库或工作区，用户无法判断自己在管理哪个库',
  goals: ['在流程页与技能页头部常驻展示当前代码库/工作区'],
  background: '用户同时维护多个仓库，进工作站后不知道当前作用域',
  expected: '切换代码库或工作区后头部立即显示对应名称',
  nonGoals: ['不改动流程数据模型'],
  acceptance: ['流程图头部能看到库名', '切换代码库后头部立即更新'],
  scope: ['src/client'],
}

async function tempRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-req-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2), 'utf8')
  await mkdir(join(dir, 'src/client'), { recursive: true })
  await writeFile(join(dir, 'src/client/index.mjs'), 'export const x = 1\n', 'utf8')
  await writeFile(join(dir, 'README.md'), '# demo\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

function fakeContext(repo) {
  const routes = new Map()
  const tools = new Map()
  const ctx = {
    webServer: { register(route) { routes.set(route.path, route); return () => {} } },
    sessions: { get(id) { return { header: { cwd: repo, id } } } },
    get(name) {
      if (name === 'tools') return { register(tool) { tools.set(tool.name, tool); return () => {} } }
      if (name === 'systemPrompt') return null
      return undefined
    },
    effect(fn) { fn(); return () => {} },
  }
  return { ctx, routes, tools }
}

async function call(routes, path, { method = 'GET', body, queryParams } = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(queryParams ?? {})) params.set(key, String(value))
  const url = path + (params.size ? '?' + params.toString() : '')
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.socket = { remoteAddress: '127.0.0.1' }
  const res = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {} },
    end(value) { this.body = String(value ?? '') },
  }
  const route = routes.get(path)
  assert.ok(route, `route missing: ${path}`)
  await route.handler(req, res)
  return { status: res.status, body: JSON.parse(res.body) }
}

async function setupRepo() {
  const repo = await tempRepo()
  const { ctx, routes } = fakeContext(repo)
  apply(ctx)
  await call(routes, API.setup, { method: 'POST', body: { repoPath: repo, name: '张三' } })
  await call(routes, API.wizard, { method: 'POST', body: { action: 'bootstrap' } })
  return { repo, ctx, routes }
}

test('建流程：澄清规格落成目标/根因/验收，客户原话只留在原始需求里', async () => {
  const { repo, routes } = await setupRepo()
  try {
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        entry: 'chat',
        description: RAW,
        name: '头部显示所属库',
        id: 'head-scope',
        scope: ['src/client'],
        spec: SPEC,
        answers: { tests: 'add-tests' },
      },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    const item = created.body.item

    assert.equal(item.description, RAW, '原始需求必须原样保存在 description')
    assert.equal(item.goal, SPEC.goals[0], '目标用规范化后的表述，不是客户原话')
    assert.equal(item.workflow.rootProblem, SPEC.problem, '根因来自澄清，不是客户原话')
    assert.equal(item.requirement.source, 'clarify')
    assert.equal(item.requirement.needsReview, false)
    assert.equal(item.requirement.raw, RAW)
    assert.match(item.requirement.background, /多个仓库/)
    assert.ok(!isRawEcho(item.goal, RAW))
    assert.ok(!isRawEcho(item.workflow.rootProblem, RAW))

    // 计划摘要与验收都跟着规范化结果走（不能把原话当摘要、不能丢掉澄清验收）
    assert.equal(item.workflow.plan.summary, SPEC.goals[0])
    assert.equal(item.acceptance[0], SPEC.acceptance[0], '澄清验收排在最前面')
    assert.ok(item.acceptance.some((entry) => /本机自测/.test(entry)), '默认验收仍然保留')
    assert.deepEqual(item.nonGoals, SPEC.nonGoals)

    // 已规范化 → 不会再被"需求待规范化"占住注意力
    const state = await call(routes, API.state)
    const row = state.body.items.find((entry) => entry.id === 'head-scope')
    assert.notEqual(row.attention?.kind, 'requirement')
    assert.equal(row.requirementNeedsReview, false)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('建流程：没有澄清规格时只给本地草稿，显式标记待规范化并让列表提示', async () => {
  const { repo, routes } = await setupRepo()
  try {
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: RAW, id: 'no-clarify', scope: ['src/client'] },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    const item = created.body.item
    assert.equal(item.requirement.source, 'local')
    assert.equal(item.requirement.needsReview, true, '没有 agent 时不能假装规范化完成')
    assert.equal(item.requirement.degraded, true)
    assert.match(item.requirement.reason, /agent/i)
    assert.equal(item.requirement.raw, RAW)
    // 草稿仍然保留原话，但界面必须知道"这是原话，不是目标"
    assert.equal(item.goal, RAW)

    const state = await call(routes, API.state)
    const row = state.body.items.find((entry) => entry.id === 'no-clarify')
    assert.equal(row.attention.kind, 'requirement')
    assert.equal(row.attention.label, '需求还没规范化')

    // 详情页的「让工作站规范化」：工作站在时就重新整理（这里 agent 不可用 → 仍标记待规范化，不写假目标）
    const normalize = await call(routes, API.requirement, { method: 'POST', body: { id: 'no-clarify' } })
    assert.equal(normalize.status, 200, JSON.stringify(normalize.body))
    assert.equal(normalize.body.degraded, true)
    assert.equal(normalize.body.item.requirement.needsReview, true)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('需求规范化接口：旧流程可用澄清规格/人工填写补规范化，并留 history', async () => {
  const { repo, routes } = await setupRepo()
  try {
    // 先造一个"目标就是客户原话"的旧流程（模拟工作站不可用时创建）
    await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: RAW, id: 'legacy-flow', scope: ['src/client'] },
    })

    // 1) 带澄清规格补规范化
    const normalized = await call(routes, API.requirement, {
      method: 'POST',
      body: { id: 'legacy-flow', spec: SPEC },
    })
    assert.equal(normalized.status, 200, JSON.stringify(normalized.body))
    const item = normalized.body.item
    assert.equal(item.goal, SPEC.goals[0])
    assert.equal(item.workflow.rootProblem, SPEC.problem)
    assert.equal(item.requirement.source, 'clarify')
    assert.equal(item.requirement.needsReview, false)
    assert.equal(item.description, RAW, '规范化不会改写原始需求')
    assert.equal(item.workflow.plan.summary, SPEC.goals[0], '计划摘要同步成规范化目标')
    assert.ok(item.history.some((entry) => entry.type === 'requirement'), '规范化动作要留痕')

    // 2) 人工确认过的结果（source: manual）直接落库，不再调模型
    const manual = await call(routes, API.requirement, {
      method: 'POST',
      body: {
        id: 'legacy-flow',
        requirement: {
          raw: RAW,
          goal: '手工确认的目标：头部常驻显示当前库',
          rootProblem: '当前头部只有「开发工作站」，看不到作用域',
          source: 'manual',
        },
      },
    })
    assert.equal(manual.status, 200, JSON.stringify(manual.body))
    assert.equal(manual.body.engine, 'manual')
    assert.equal(manual.body.item.goal, '手工确认的目标：头部常驻显示当前库')
    assert.equal(manual.body.item.requirement.needsReview, false)

    // 3) 人工在详情页改目标后保存：来源记为 manual，原始需求不被覆盖
    const current = (await call(routes, API.item, { queryParams: { id: 'legacy-flow' } })).body.item
    current.goal = '人工再次改写：头部显示库'
    const saved = await call(routes, API.items, { method: 'POST', body: current })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    assert.equal(saved.body.item.goal, '人工再次改写：头部显示库')
    assert.equal(saved.body.item.requirement.source, 'manual')
    assert.equal(saved.body.item.requirement.needsReview, false)
    assert.equal(saved.body.item.requirement.raw, RAW)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('计划接口：带澄清规格时摘要用规范化目标，不把原话当计划摘要', async () => {
  const { repo, routes } = await setupRepo()
  try {
    const plan = await call(routes, API.plan, {
      method: 'POST',
      body: {
        description: RAW,
        scope: ['src/client'],
        recon: { tokens: ['client'], files: [{ path: 'src/client/index.mjs', score: 3, matches: [] }] },
        answers: {},
        spec: SPEC,
      },
    })
    assert.equal(plan.status, 200, JSON.stringify(plan.body))
    assert.equal(plan.body.summary, SPEC.goals[0])
    assert.ok(Array.isArray(plan.body.steps) && plan.body.steps.length)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

const CODE_RAW = '@JsonSubTypes({\n        @JsonSubTypes.Type(GiteeCodeSourceBuildRequest.class),\n        @JsonSubTypes.Type(GiteeGoSourceBuildRequest.class)\n})\n补充一下PipelineBuildSourceRequest的 subtype，同时评估一下，是不是更改成自定义的序列化解释器会不会更好，现在是自动推断'
const CODE_RAW_2 = '@TableField(typeHandler = Jackson3TypeHandler.class)\n    private BuildTriggerStruct data;\n这个里面有一个触发类型，把他提取出来，分散到这个表字段上面'

test('建流程：用户输入是代码片段时，标题自动概括，不再拿第一行当标题', async () => {
  const { repo, routes } = await setupRepo()
  try {
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        entry: 'chat',
        description: CODE_RAW,
        // 模拟向导/旧客户端：把描述第一行原样当名字传进来
        name: '@JsonSubTypes({',
        id: 'title-code-1',
        scope: ['src/client'],
        spec: SPEC,
      },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    const item = created.body.item
    assert.notEqual(item.title, '@JsonSubTypes({')
    assert.equal(item.title, SPEC.title, '澄清阶段给出的标题优先')
    assert.equal(isWeakTitle(item.title, CODE_RAW), false)
    assert.equal(item.description, CODE_RAW, '原始需求不变')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('建流程：没有澄清标题时按目标/主题兜底生成标题（agent 不可用也不留代码当标题）', async () => {
  const { repo, routes } = await setupRepo()
  try {
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: {
        action: 'create',
        entry: 'chat',
        description: CODE_RAW_2,
        name: '@TableField(typeHandler = Jackson3TypeHa',
        id: 'title-code-2',
        scope: ['src/client'],
      },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    const item = created.body.item
    assert.notEqual(item.title, '@TableField(typeHandler = Jackson3TypeHa')
    assert.equal(isWeakTitle(item.title, CODE_RAW_2), false, `标题必须可读：${item.title}`)
    assert.ok(item.title.length <= 40)
    assert.equal(item.description, CODE_RAW_2)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('重新生成标题：只改标题，不动目标/根因；列表的标题待整理标记随之消失', async () => {
  const { repo, routes } = await setupRepo()
  try {
    const created = await call(routes, API.wizard, {
      method: 'POST',
      body: { action: 'create', entry: 'chat', description: CODE_RAW_2, name: '@TableField(typeHandler = Jackson3TypeHa', id: 'retitle-check', scope: ['src/client'] },
    })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    const before = created.body.item
    assert.equal(before.titleNeedsWork ?? isWeakTitle(before.title, before.description), isWeakTitle(before.title, before.description))

    // 先把标题改回"弱标题"，模拟旧流程（不重新建流程）
    const raw = (await call(routes, API.item, { queryParams: { id: 'retitle-check' } })).body.item
    raw.title = '@TableField(typeHandler = Jackson3TypeHa'
    await call(routes, API.items, { method: 'POST', body: raw })
    const stateBefore = await call(routes, API.state)
    assert.equal(stateBefore.body.items.find((entry) => entry.id === 'retitle-check').titleNeedsWork, true)

    const regen = await call(routes, API.requirement, {
      method: 'POST',
      body: { id: 'retitle-check', regenerateTitle: true },
    })
    assert.equal(regen.status, 200, JSON.stringify(regen.body))
    assert.equal(regen.body.changed, true)
    const after = regen.body.item
    assert.equal(isWeakTitle(after.title, after.description), false, `标题必须可读：${after.title}`)
    assert.equal(after.goal, before.goal, '重新生成标题不能改目标')
    assert.equal(after.workflow.rootProblem, before.workflow.rootProblem, '也不能改根因')
    assert.equal(after.description, before.description)

    const stateAfter = await call(routes, API.state)
    assert.equal(stateAfter.body.items.find((entry) => entry.id === 'retitle-check').titleNeedsWork, false)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('批量整理标题：一次把弱标题按已有目标改成可读标题，好标题不动', async () => {
  const { repo, routes } = await setupRepo()
  try {
    // 造 3 个旧流程：两个弱标题（代码片段/长原话），一个好标题
    const seeds = [
      { id: 'weak-a', description: CODE_RAW, goal: '评估 DEDUCTION 与自定义反序列化器的取舍，补齐源构建请求的子类型', title: '@JsonSubTypes({' },
      { id: 'weak-b', description: CODE_RAW_2, goal: '把 build_triggers 的触发类型拆成独立表字段', title: '@TableField(typeHandler = Jackson3TypeHa' },
      { id: 'good-c', description: '给 source 的 Sample 补 webhook 重试', goal: '给 Sample 加 webhook 重试', title: '补 webhook 重试' },
    ]
    for (const seed of seeds) {
      await call(routes, API.wizard, {
        method: 'POST',
        body: { action: 'create', entry: 'chat', description: seed.description, name: seed.title, id: seed.id, scope: ['src/client'] },
      })
      const current = (await call(routes, API.item, { queryParams: { id: seed.id } })).body.item
      current.title = seed.title
      current.goal = seed.goal
      await call(routes, API.items, { method: 'POST', body: current })
    }

    const stateBefore = await call(routes, API.state)
    assert.equal(stateBefore.body.items.filter((entry) => entry.titleNeedsWork).length, 2)

    const result = await call(routes, API.requirement, { method: 'POST', body: { action: 'retitleWeak' } })
    assert.equal(result.status, 200, JSON.stringify(result.body))
    const changed = result.body.changed ?? []
    assert.equal(changed.length, 2, '只整理弱标题，好标题不动')
    assert.deepEqual(changed.map((entry) => entry.id).sort(), ['weak-a', 'weak-b'])
    for (const entry of changed) {
      assert.equal(isWeakTitle(entry.to, seeds.find((seed) => seed.id === entry.id).description), false, `标题仍不可读：${entry.to}`)
    }
    const stateAfter = await call(routes, API.state)
    assert.equal(stateAfter.body.items.filter((entry) => entry.titleNeedsWork).length, 0)
    assert.equal(stateAfter.body.items.find((entry) => entry.id === 'good-c').title, '补 webhook 重试', '好标题不能被改')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})
