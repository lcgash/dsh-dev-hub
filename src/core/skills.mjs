/**
 * 「通用 skills」= 本工作站自带的规范包（不是 DSH 的 skill 文件）。
 *
 * 一个 skill pack = 一组可执行/可核对的约束（constraint），按仓库语言适用：
 * - L0 通用纪律：所有仓库都装；
 * - L1 语言/领域包：java 分层、java 契约、java 数据库、java 门禁、node 模块边界；
 * - L1 前端包：前端原型设计规范（Gitee 家族化，源自 prototype-ui-designer skill）；
 * - 自定义：用户自己加的 constraint，归 `custom`。
 *
 * 安装 = 把包的 constraints 写进 <repo>/.dev-hub/conventions.json 并记一条 installedSkills；
 * 卸载 = 只移除该包带来的 constraints，不动别的包和用户自定义项。
 *
 * 包可以声明 `autoInstall`：只有仓库画像命中时（如 package.json 依赖命中前端框架）
 * 才进默认安装集合；其余仓库仍能在「技能」页手动安装，不会被静默强塞。
 */

/** 内置技能库（顺序即展示顺序）。 */
export const SKILL_CATALOG = [
  {
    id: 'core-discipline',
    name: '通用开发纪律',
    level: 'L0',
    appliesTo: ['java', 'node', 'generic'],
    description: '所有仓库都适用的四条底线：范围、证据、凭据、文本编码。',
    constraints: [
      {
        id: 'scope',
        title: '只改本流程 scope 内的文件',
        rule: '超出 scope 的改动先回开发计划更新范围，再动手。',
        check: { kind: 'checklist', value: 'scope' },
      },
      {
        id: 'evidence',
        title: '区分仓库事实与本机差异',
        rule: '结论里仓库事实（commit、文件、门禁输出）与本机环境差异必须分开写，不编造 baseline diff。',
        check: { kind: 'checklist', value: 'evidence' },
      },
      {
        id: 'secrets',
        title: '不读取、不提交凭据',
        rule: 'token、密码、私钥只在本机运行时获取，不写入仓库数据。',
        check: { kind: 'checklist', value: 'secrets' },
      },
      {
        id: 'utf8',
        title: '文本按 UTF-8 最坏输入设计',
        rule: '外部报文/长文本不要用 255/1024 承载；库表字符集按各库最宽设置。',
        check: { kind: 'checklist', value: 'utf8' },
      },
    ],
  },
  {
    id: 'java-layering',
    name: 'Java 分层与依赖',
    level: 'L1',
    appliesTo: ['java'],
    description: '包归属、依赖方向、事务边界、状态 CAS —— 架构门禁的核心几条。',
    constraints: [
      {
        id: 'layering',
        title: '依赖方向单向',
        rule: 'controller → service → dao；除 controller 外任何包不得依赖 controller；constant/utils 出边为 0。',
        check: { kind: 'imports', value: 'controller->service->dao' },
        doc: 'docs/code-guide/LAYERING.md',
        gate: 'PackageDependencyGuardTest',
      },
      {
        id: 'package',
        title: '类放对包、命名后缀与包路径单向绑定',
        rule: '先按「它是不是一种角色」判定顶层包；数据载体下沉 model/*。',
        check: { kind: 'files', value: 'top-level-packages' },
        doc: 'docs/code-guide/WHERE-TO-PUT-X.md',
      },
      {
        id: 'transaction',
        title: '事务内只做 DB 读写',
        rule: '远端 IO、抢锁、发消息一律移到事务外。',
        check: { kind: 'checklist', value: 'transaction' },
        gate: 'TransactionScopeGuardTest',
      },
      {
        id: 'cas',
        title: '状态迁移必须 CAS',
        rule: '先 eq 旧状态再 set，禁止无条件覆盖 process_status。',
        check: { kind: 'imports', value: 'process-status-cas' },
      },
    ],
  },
  {
    id: 'java-contract',
    name: 'Java 接口契约与文案',
    level: 'L1',
    appliesTo: ['java'],
    description: '对外接口走 /api/v1、Swagger 注解、请求用例，i18n 三语齐。',
    constraints: [
      {
        id: 'contract',
        title: '新增 HTTP 接口走 /api/v1 + Swagger + 请求用例',
        rule: '新增接口放 controller/v1/，同步 request-tests 用例并加 Swagger 注解。',
        check: { kind: 'files', value: 'controller/v1/**' },
        doc: 'docs/code-guide/WHERE-TO-PUT-X.md',
      },
      {
        id: 'i18n',
        title: '新增 i18n key 三语齐',
        rule: '缺键会静默把 key 吐给用户，新增 key 必须补齐所有语言。',
        check: { kind: 'files', value: 'resources/i18n/**' },
      },
      {
        id: 'errors',
        title: '错误走统一异常出口',
        rule: '不要新增 @ControllerAdvice；错误码/文案走 GlobalExceptionHandle 与 MessageHolder。',
        check: { kind: 'imports', value: 'global-exception-handle' },
        doc: 'docs/code-guide/HTTP-API-ERRORS.md',
      },
    ],
  },
  {
    id: 'java-db',
    name: 'Java 数据库契约',
    level: 'L1',
    appliesTo: ['java'],
    description: '表和字段是重契约：双基线、方言、迁移与回滚都要同步。',
    constraints: [
      {
        id: 'db',
        title: '表与字段是重契约',
        rule: '新增/删除/改类型前说明必要性与替代方案，同步 MySQL 与 DM 基线、PO/Mapper、迁移与测试。',
        check: { kind: 'checklist', value: 'db' },
        doc: 'docs/code-guide/skills/database-schema-change.md',
      },
      {
        id: 'dialect',
        title: 'SQL 双方言可执行',
        rule: 'MySQL 用 utf8mb4；DM 用 VARCHAR(n CHAR) 与 TEXT/CLOB，迁移脚本两份都要能跑。',
        check: { kind: 'files', value: 'db/migration+db/dm-migration' },
        doc: 'docs/code-guide/SQL-DIALECT.md',
      },
    ],
  },
  {
    id: 'java-gates',
    name: 'Java 门禁与测试',
    level: 'L1',
    appliesTo: ['java'],
    description: '改完跑门禁；门禁红了修代码；测试不吃完整 Spring 上下文。',
    constraints: [
      {
        id: 'gate',
        title: '改完必须跑门禁',
        rule: '提交前跑仓库门禁（如 sh scripts/check.sh）；门禁红了修代码，不改门禁。',
        check: { kind: 'gate', value: 'sh scripts/check.sh' },
        gate: 'scripts/check.sh',
      },
      {
        id: 'test-shape',
        title: '单测形状与仓库一致',
        rule: '纯单测用替身构造，不启完整上下文；断言错误契约用 messageKey/path/args。',
        check: { kind: 'checklist', value: 'test-shape' },
        doc: 'docs/code-guide/TESTING.md',
      },
    ],
  },
  {
    id: 'node-core',
    name: 'Node 模块边界',
    level: 'L1',
    appliesTo: ['node'],
    description: '可复用核心不依赖宿主；新增依赖要说明理由；改完跑测试。',
    constraints: [
      {
        id: 'module-boundary',
        title: '核心逻辑不依赖宿主',
        rule: '可被 CLI/CI 复用的模块不 import 宿主框架；宿主只做装配与路由。',
        check: { kind: 'imports', value: 'core-no-host' },
      },
      {
        id: 'deps',
        title: '新增依赖要说明理由',
        rule: '能不用依赖就不用；新增依赖在计划里写清体积、许可证与替代方案。',
        check: { kind: 'checklist', value: 'deps' },
      },
      {
        id: 'node-test',
        title: '改完跑测试',
        rule: '提交前跑仓库配置的测试命令；没有就在 project.json 里补一条。',
        check: { kind: 'gate', value: 'npm test' },
      },
    ],
  },
  {
    id: 'frontend-ui',
    name: '前端原型设计规范',
    level: 'L1',
    appliesTo: ['node', 'java'],
    // 只有 package.json 依赖命中前端框架的仓库才默认装；纯 Node 服务/CLI 仓库按需手动安装
    autoInstall: ['frontend'],
    description: 'Gitee 家族化中后台原型规范（SCA/SCM 现行，源自 prototype-ui-designer skill）：品牌紫 + colorLink、四级灰阶、圆角梯度、详情优先 Drawer、克制配色、mock 口径；前端仓库首次初始化默认安装。',
    constraints: [
      {
        id: 'ui-authority',
        title: '规范唯一来源：prototype-ui-designer',
        rule: '原型/页面一律按 prototype-ui-designer skill（SCA/SCM 现行原型）对齐；对齐既有工程时先读真实代码里的 token 与组件签名再动手，不凭印象猜“更好看的新想法”。',
        check: { kind: 'checklist', value: 'prototype-ui-designer' },
      },
      {
        id: 'ui-tokens',
        title: '品牌紫与链接色必须同源',
        rule: 'colorPrimary = #6049e7，且 colorLink 必须显式设为同一颜色（antd 链接默认蓝、不跟随 primary，这是家族第一号大坑）；选中态、进度条、图标座、强调数字统一用它。',
        check: { kind: 'checklist', value: 'theme-tokens' },
      },
      {
        id: 'ui-semantic',
        title: '四级灰阶与语义色不漂移',
        rule: '正文灰阶 #1e2a3d → #4d545e → #5a5b70 → #848c9f；成功 #00875a、错误 #FF5630/#de350d、警告 #ffab00、信息/进行中 #6049e7；同一语义全站一套值。',
        check: { kind: 'checklist', value: 'colors' },
      },
      {
        id: 'ui-radius',
        title: '圆角与卡片质感走固定档位',
        rule: '圆角：SM 控件 6、常规 8、卡片/抽屉/弹窗 12、Tag/Badge 4、胶囊 999；卡片双层柔影 0 0 2px rgba(9,25,64,.1), 0 2px 6px -2px rgba(9,25,64,.25)，冷调浅灰蓝 #f9fafd 托白卡。',
        check: { kind: 'checklist', value: 'radius-shadow' },
      },
      {
        id: 'ui-density',
        title: '留白节奏与对齐建立秩序',
        rule: 'padding/gap 走 8/12/16 档位、行高 1.8~2；数字右对齐并全局 tnum 等宽，控件同高、标签定宽成竖线；高级感来自敢留白，不是塞满。',
        check: { kind: 'checklist', value: 'aesthetics' },
      },
      {
        id: 'ui-hierarchy',
        title: '层次靠字重 + 灰阶 + 字号，不靠颜色',
        rule: '正文永远中性灰，彩色只作语义信号与高光点缀；满屏彩虹 = 不合格，去掉所有彩色仍立得住才算合格。',
        check: { kind: 'checklist', value: 'aesthetics' },
      },
      {
        id: 'ui-overlay',
        title: '详情优先 Drawer，弹窗宽度用档位',
        rule: '详情默认 Drawer 保留列表上下文，大表单用 Modal，沉浸式浏览才开新页面；弹窗宽度：480 轻确认 / 600 标准表单 / 720 复杂表单 / 680~760 详情抽屉 / 960 对比类宽抽屉。',
        check: { kind: 'checklist', value: 'drawer-modal' },
      },
      {
        id: 'ui-reuse',
        title: '1:1 复用优先于复制粘贴',
        rule: '同一对象在多场景出现时抽一个组件传参复用，差异只做参数化；绝不复制粘贴出两份会慢慢漂移的实现。',
        check: { kind: 'checklist', value: 'component-reuse' },
      },
      {
        id: 'ui-stack',
        title: '技术栈与图表基线',
        rule: '默认 React 19 + TypeScript + Vite + Ant Design v6 + @ant-design/icons + @ant-design/charts(G2) + HashRouter + dayjs(zh-cn)；仓库已有其他栈时保留其栈，但 token/圆角/间距/交互仍按本规范对齐。',
        check: { kind: 'checklist', value: 'stack-baseline' },
      },
      {
        id: 'ui-mock',
        title: 'mock 即文档',
        rule: '每段 mock 数据头部写口径注释（来源、与其他表的关联、真实实现是什么）；常量用大写蛇形，保证关系闭环与活状态机，让 demo 能自证逻辑。',
        check: { kind: 'checklist', value: 'mock-data' },
      },
      {
        id: 'ui-checklist',
        title: '交付前逐项过反模式清单',
        rule: '明确不做：只设 colorPrimary 不设 colorLink、双样式系统混用、.ant-* 全局 !important 覆写、详情一律跳新页丢筛选、弹窗宽度随手拍。',
        check: { kind: 'checklist', value: 'checklist' },
      },
    ],
  },
  {
    id: 'generic-quality',
    name: '通用工程质量',
    level: 'L0',
    appliesTo: ['java', 'node', 'generic'],
    description: '日志带 id、错误显式、变更点可追溯 —— 与语言无关的排查底线。',
    constraints: [
      {
        id: 'logging',
        title: '日志必须带 id',
        rule: '关键路径日志带 buildId/jobId/itemId 等业务 id，避免“线上无法定位是哪一条”。',
        check: { kind: 'checklist', value: 'logging' },
        doc: 'docs/code-guide/CODING-STANDARDS.md',
      },
      {
        id: 'fail-loud',
        title: '失败要显式',
        rule: '不吞异常、不静默降级；降级要可见（日志/界面提示），不假装成功。',
        check: { kind: 'checklist', value: 'fail-loud' },
      },
      {
        id: 'change-point',
        title: '变更点可追溯',
        rule: '跨模块改动写清输入输出契约、状态回传路径与可观测性补齐点。',
        check: { kind: 'checklist', value: 'change-point' },
      },
    ],
  },
]

/**
 * 某仓库语言下可用的技能包（L0 全语言 + 对应语言包）。
 * 带 `autoInstall` 的前端包也会出现在 node/java 仓库的技能页里，但只有前端仓库默认安装。
 */
export function catalogFor(language = 'generic') {
  const lang = ['java', 'node'].includes(language) ? language : 'generic'
  return SKILL_CATALOG.filter((pack) => pack.appliesTo.includes('generic') || pack.appliesTo.includes(lang))
}

/**
 * 默认安装集合：所有 L0 + 语言对应的 L1。
 * 带 `autoInstall` 的包只在画像命中时默认安装（如前端仓库装 frontend-ui），
 * 其他仓库仍可在「技能」页手动安装；不传 options 时保持历史行为。
 */
export function defaultSkillIds(language = 'generic', options = {}) {
  const lang = ['java', 'node'].includes(language) ? language : 'generic'
  const frontend = Boolean(options.frontend)
  return SKILL_CATALOG
    .filter((pack) => pack.appliesTo.includes(lang) || pack.appliesTo.includes('generic'))
    .filter((pack) => {
      const triggers = Array.isArray(pack.autoInstall) ? pack.autoInstall : []
      if (!triggers.length) return true
      return triggers.includes('frontend') ? frontend : false
    })
    .map((pack) => pack.id)
}

export function findSkill(id) {
  return SKILL_CATALOG.find((pack) => pack.id === id) ?? null
}

/** 把包内约束加上 skill 归属，供安装/卸载与分组展示使用。 */
export function constraintsOf(pack) {
  return (pack?.constraints ?? []).map((constraint) => ({ ...constraint, skill: pack.id }))
}
