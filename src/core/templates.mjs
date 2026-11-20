/**
 * 需求模板（把仓库既有 recipe 变成标准输入）。
 *
 * 为什么：同一类需求（新增源 / 新增 v1 接口 / 改 scheduler）在仓库里本来就有固定的
 * "必改触点 + 验收命令"。只靠 LLM 扫文件，每次都从头摸索；把 recipe 做成模板后，
 * 计划里的步骤与验收是**确定性**的，recon 只负责填具体文件。
 *
 * 纯数据 + 纯函数：按描述关键词选中一个模板，输出必改触点、验收检查与参考实现。
 */

export const TEMPLATES = [
  {
    id: 'source-provider',
    name: '新增/调整一个源（SourceProvider）',
    appliesTo: ['java'],
    keywords: ['源', 'source', 'provider', 'webhook', '触发', 'gitlab', 'gerrit', 'svn', 'jfrog', 'gitee'],
    touchpoints: [
      'constant/SourcesType：新增源类型枚举（含 display/校验）',
      'source/<Xxx>Provider：继承 SourcesProvider，实现 7 个抽象方法',
      'source/codec/<Xxx>SourceYamlCodec：YAML 读写 + 注册到 SourceYamlCodecs',
      'model/struct/<Xxx>SourceSettingStruct：setting 子类型',
      'model/source/<Xxx>SourceStruct：source 子类型',
      'model/struct/<Xxx>TriggerRulesStruct：触发规则子类型',
      'pipeline.support.sources 清单：配置里声明新源',
      '冒烟测试：SourceYamlCodecSmokeTest 覆盖新源的序列化/反序列化',
      '对应单测：Provider 的 parseSource / webhook / resourceId 行为',
    ],
    checks: [
      { id: 'compile', text: '编译通过', command: 'mvn -o clean compile' },
      { id: 'tests', text: '新增源相关单测通过', command: 'mvn -o clean test' },
      { id: 'gate', text: '仓库架构门禁通过', command: 'sh scripts/check.sh' },
    ],
    references: [
      { path: 'src/main/java/com/gitee/pipeline/source/base/SourcesProvider.java', why: '扩展点契约（7 个抽象方法）' },
      { path: 'src/main/java/com/gitee/pipeline/source/GitlabCodeProvider.java', why: '一个完整源的参考实现' },
      { path: 'src/main/java/com/gitee/pipeline/source/codec/SourceYamlCodecs.java', why: 'codec 注册表（必须成对注册）' },
    ],
  },
  {
    id: 'api-v1',
    name: '新增/修改一个 v1 HTTP 接口',
    appliesTo: ['java'],
    keywords: ['接口', 'api', 'controller', '端点', 'endpoint', '/api/v1', 'swagger', 'rest'],
    touchpoints: [
      'controller/v1/<Xxx>Controller：新接口放 v1，路径 kebab-case',
      'Swagger 注解：@Operation/@Parameter，废弃接口加 @Deprecated + 说明',
      'service + impl：编排在 service，事务边界在 manager',
      'request-tests/requests/<controller>/cases.json：补请求用例',
      'i18n：新增错误/提示 key 三语齐',
      '错误出口：统一走 GlobalExceptionHandle，不新增 @ControllerAdvice',
    ],
    checks: [
      { id: 'compile', text: '编译通过', command: 'mvn -o clean compile' },
      { id: 'tests', text: '接口相关单测通过', command: 'mvn -o clean test' },
      { id: 'requests', text: 'request-tests 用例已补', command: null, assertion: 'cases.json 含新端点' },
    ],
    references: [
      { path: 'docs/code-guide/WHERE-TO-PUT-X.md', why: '接口放置与命名规范（§2.1/§6.2）' },
      { path: 'docs/code-guide/HTTP-API-ERRORS.md', why: '错误映射与响应信封' },
    ],
  },
  {
    id: 'scheduler-change',
    name: '改调度/状态机（Scheduler）',
    appliesTo: ['java'],
    keywords: ['调度', 'scheduler', '状态机', 'process_status', 'processStatus', 'cas', '扫描', '汇聚'],
    touchpoints: [
      'scheduler/*Scheduler：process() 内不手动改 process_status、不手动触发父级',
      '状态迁移用 CAS（eq 旧状态 + set），禁止无条件 updateById',
      '终态 endTime 由子类写（complete() 只写 IGNORED）',
      '汇聚规则：全终态 SUCCESS / 有 CANCELLED 则 CANCELLED / 有 FAILED 优先 FAILED',
      '指标：stuck/耗时指标加进 config/PipelineMetrics',
    ],
    checks: [
      { id: 'tests', text: '调度相关单测通过', command: 'mvn -o clean test' },
      { id: 'gate', text: '架构门禁（事务/状态机）通过', command: 'sh scripts/check.sh' },
    ],
    references: [
      { path: 'README.md', why: '调度设计摘要（扫描器/状态轴/汇聚）' },
      { path: 'docs/code-guide/LAYERING.md', why: 'scheduler 与 manager/service 的边界' },
    ],
  },
  {
    id: 'frontend-angular',
    name: 'Angular 页面/组件/服务改动',
    appliesTo: ['node'],
    keywords: ['angular', '@angular', 'ngmodule', 'rxjs', 'observable', 'signal', 'standalone', '依赖注入', 'angular 组件', 'angular 服务'],
    touchpoints: [
      '先确认是 standalone component 还是 NgModule 声明，避免只在 declarations 或 imports 一处注册',
      '变更检测与状态：OnPush/signals 下确认输入输出、订阅生命周期（takeUntilDestroyed/async pipe），不留下泄漏',
      '依赖注入与路由：service 的 providedIn 范围、路由参数/守卫、懒加载模块同步调整',
      '表单：ReactiveForms 的控件/校验/错误提示与模板一致，提交失败路径可恢复',
      '样式按既有 design token/主题变量，不在组件里硬编码品牌色',
      '补测试：TestBed/组件测试覆盖新增状态与失败路径；必要时补 e2e',
    ],
    checks: [
      { id: 'tests', text: 'Angular 组件/服务测试通过', command: null, assertion: 'TestBed/组件测试覆盖新增状态与失败路径' },
      { id: 'build', text: '构建/类型检查通过', command: null, assertion: 'ng build / typecheck 通过' },
      { id: 'gate', text: '仓库门禁通过（lint/check）', command: null, assertion: '仓库配置的 lint/check 通过' },
      { id: 'ui-evidence', text: '关键页面有截图/E2E 证据', command: null, assertion: '流程附件/报告含前后截图，或 e2e 通过记录' },
    ],
    references: [
      { path: 'package.json', why: '确认 Angular 版本、包管理器与 scripts' },
      { path: 'src', why: '先读现有组件/服务/路由结构，复用既有写法' },
    ],
  },
  {
    id: 'frontend-svelte',
    name: 'Svelte/SvelteKit 页面/组件改动',
    appliesTo: ['node'],
    keywords: ['svelte', 'sveltekit', 'runes', '$state', '$derived', '$effect', 'store', '+page', 'form action', 'ssr'],
    touchpoints: [
      '先确认 Svelte 版本与写法：runes（$state/$derived/$effect）还是老 store，不能混用两套响应式',
      'SvelteKit：load/form action 的服务端与客户端边界，敏感逻辑不能漏到浏览器',
      '状态与副作用：effect 清理、订阅取消、SSR 首屏与 hydration 一致性',
      '可访问性与交互：键盘/焦点、表单错误提示、窄屏布局',
      '样式走组件作用域/既有 token，不硬编码主题色',
      '补测试：组件测试或 e2e 覆盖新增状态、表单失败与导航',
    ],
    checks: [
      { id: 'tests', text: 'Svelte 组件/交互测试通过', command: null, assertion: '组件测试或 e2e 覆盖新增状态与失败路径' },
      { id: 'build', text: '构建/类型检查通过', command: null, assertion: 'svelte-check / build 通过' },
      { id: 'gate', text: '仓库门禁通过（lint/check）', command: null, assertion: '仓库配置的 lint/check 通过' },
      { id: 'ui-evidence', text: '关键页面有截图/E2E 证据', command: null, assertion: '流程附件/报告含前后截图，或 e2e 通过记录' },
    ],
    references: [
      { path: 'package.json', why: '确认 Svelte/SvelteKit 版本、包管理器与 scripts' },
      { path: 'src/routes', why: '先读现有路由/页面结构与 load 写法' },
    ],
  },
  {
    id: 'frontend-ui',
    name: '前端页面/组件/交互改动',
    appliesTo: ['node'],
    keywords: ['页面', '页', '组件', '弹窗', '抽屉', '表单', '交互', '样式', '布局', '响应式', '前端', 'react', 'vue', 'vite', '按钮', '列表', '路由', '状态', '空态', '加载态', 'loading', '错误', 'error', '无障碍', 'a11y', 'page', 'component', 'modal', 'drawer', 'form', 'style', 'layout', 'responsive', 'button', 'list', 'route', 'state', 'empty'],
    touchpoints: [
      '先定位页面/路由入口与真正复用的组件，确认改动落在页面容器还是共享组件',
      '覆盖状态：loading / empty / error / disabled / 权限不足，不只做 happy path',
      '样式走既有 design token 与组件 API，不硬编码颜色/圆角/间距，不新造一套视觉',
      '交互与响应式：键盘可达、焦点可见、窄屏不溢出；必要时同步文案三语',
      '数据层：新增/修改 API 字段时同步类型定义与调用方，不把后端契约改成前端方便的形状',
      '补测试：组件/交互单测或现有 e2e 用例覆盖新增状态与失败路径',
    ],
    checks: [
      { id: 'tests', text: '前端单测/组件测试通过', command: null, assertion: '有对应测试覆盖新增状态与失败路径' },
      { id: 'build', text: '构建/类型检查通过', command: null, assertion: 'npm/pnpm/yarn build 与 typecheck 通过' },
      { id: 'gate', text: '仓库门禁通过（lint/check）', command: null, assertion: '仓库配置的 lint/typecheck/gate 通过' },
      { id: 'ui-evidence', text: '关键页面有截图/E2E 证据', command: null, assertion: '流程附件/报告含前后截图，或 e2e 通过记录' },
    ],
    references: [
      { path: 'package.json', why: '确认包管理器、scripts 与既有依赖/框架版本' },
      { path: 'src', why: '先读现有页面/组件/样式结构，复用既有 token 与组件 API' },
    ],
  },
  {
    id: 'analysis',
    name: '只读分析/排查',
    appliesTo: ['java', 'node', 'generic'],
    keywords: ['分析', '梳理', '盘点', '调研', '评估', '诊断', '解释', '调用链', '只读'],
    touchpoints: [
      '只读排查：先读代码/配置/日志，沿调用链找到真正相关的分支，不改代码',
      '收集证据：把关键文件、行号、日志片段与复现条件记进流程',
      '给出结论：根因/影响面/现状判断，写清证据能支持到什么程度',
      '补丁建议（可选）：说明改哪里、怎么改，但不在本流程落地',
      '不做提交：分析流程不建 worktree、不改代码、不产生提交',
    ],
    checks: [
      { id: 'conclusion', text: '分析结论已产出', command: null, assertion: '报告里有结论、证据、影响面与“未改动代码”的说明' },
    ],
    references: [],
  },
  {
    id: 'refactor',
    name: '代码重构/结构调整',
    appliesTo: ['java', 'node', 'generic'],
    keywords: ['重构', 'refactor', '重写', '拆分', '解耦', '提取', '抽取', '重命名', '整理代码', '清理代码', '模块化', '去重', '简化'],
    touchpoints: [
      '先确认边界：这次重构要保持哪些对外行为/接口不变，写进流程',
      '补保护网：先用现有测试或补回归测试固定当前行为；测试不通过不开始大改',
      '小步拆分：按职责提取/移动代码，每一步保持编译与测试通过',
      '同步调用方：更新依赖方、导出/注册表与文档，删除旧入口前确认没有残留引用',
      '不顺手改需求：重构不改业务语义；发现必须改行为时回到需求澄清确认',
    ],
    checks: [
      { id: 'tests', text: '重构前后本机测试通过', command: null, assertion: '现有测试或补的回归测试通过' },
      { id: 'gate', text: '仓库门禁通过', command: null, assertion: '仓库配置的 lint/check 通过' },
    ],
    references: [
      { path: 'README.md', why: '先读项目结构与运行方式，确认重构边界' },
      { path: 'docs/code-guide/LAYERING.md', why: '按仓库分层规范调整职责，避免把依赖方向改反' },
    ],
  },
  {
    id: 'bugfix',
    name: '定位/修复缺陷',
    appliesTo: ['java', 'node', 'generic'],
    keywords: ['bug', '修复', '报错', '异常', '崩溃', '失败', '不生效', '回归', '排查', '定位', '500', '404', '超时', '卡住'],
    touchpoints: [
      '先复现：拿到最小可复现输入/条件（日志、请求、数据），写进流程',
      '定位根因：沿调用链找到真正出错的分支（不要先改现象）',
      '最小修复：只改根因处，避免顺手重构/扩大范围',
      '补回归测试：覆盖这次复现用例（同样的输入不能再错）',
      '写清影响面：还有哪些调用方/场景会走到这段代码',
    ],
    checks: [
      { id: 'repro', text: '复现用例有记录', command: null, assertion: '流程里有复现步骤或失败日志' },
      { id: 'tests', text: '本机测试通过（含回归用例）', command: null, assertion: '回归用例覆盖这次复现输入' },
      { id: 'gate', text: '仓库门禁通过', command: null, assertion: '仓库配置的 lint/check 通过' },
    ],
    references: [],
  },
  {
    id: 'generic',
    name: '通用改动',
    appliesTo: ['java', 'node', 'generic'],
    keywords: [],
    touchpoints: [],
    checks: [
      { id: 'tests', text: '本机测试通过', command: null },
    ],
    references: [],
  },
]

/** 显式指定 intent 时用哪个模板：只有 analysis 需要绕过关键词（用户可在界面上手动切换类型）。 */
export function templateForIntent(intent) {
  if (intent === 'analysis') return TEMPLATES.find((template) => template.id === 'analysis') ?? null
  if (intent === 'refactor') return TEMPLATES.find((template) => template.id === 'refactor') ?? null
  return null
}

/** 按描述关键词命中模板（确定性：分数高者优先，平手取 generic）。excludeIds 用于按流程类型排除不合适的模板。 */
export function detectTemplate(description, language = 'java', { excludeIds = [] } = {}) {
  const text = String(description ?? '').toLowerCase()
  const applicable = TEMPLATES.filter((template) => (template.appliesTo.includes(language) || template.appliesTo.includes('generic')) && !excludeIds.includes(template.id))
  let best = null
  let bestScore = 0
  for (const template of applicable) {
    if (template.id === 'generic') continue
    let score = 0
    for (const keyword of template.keywords) {
      if (keyword && text.includes(keyword.toLowerCase())) score += 1
    }
    if (score > bestScore) { best = template; bestScore = score }
  }
  return best ?? TEMPLATES.find((template) => template.id === 'generic')
}

/** 模板的验收项 → 结构化检查（命令来自模板，未配置命令的保留人工断言）。 */
export function checksOf(template, { commands = {} } = {}) {
  const source = template?.checks ?? []
  const testCommand = commands.localTest || commands.test || ''
  const gateCommand = commands.gate || ''
  const buildCommand = commands.build || commands.compile || ''
  return source.map((check) => {
    let command = check.command ?? null
    // 模板只描述“要验什么”，具体命令跟仓库走（Java/Maven、前端 npm/pnpm/yarn 都能用）
    if (check.id === 'tests' || check.id === 'test') command = testCommand || command
    else if (check.id === 'gate') command = gateCommand || command
    else if (check.id === 'build' || check.id === 'compile') command = buildCommand || command
    // 老模板里写死的 mvn 命令不能带到前端仓库
    if (command && /mvn\b/i.test(command) && !['tests', 'test'].includes(check.id)) {
      command = check.id === 'gate' ? (gateCommand || null) : (buildCommand || null)
    }
    return {
      id: check.id,
      text: check.text,
      command,
      assertion: check.assertion ?? null,
    }
  })
}
