<p align="center">
  <img src="docs/assets/screenshots/workbench.png" alt="dsh-dev-hub 开发工作站" width="920" />
</p>

<h1 align="center">dsh-dev-hub</h1>

<p align="center">
  <strong>面向 DeepSeek Harness 的对话式开发流程工作站。</strong><br />
  从一句话需求，到有范围、有评审、有测试、有报告的一次完整交付。
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#工作方式">工作方式</a> ·
  <a href="#截图">截图</a> ·
  <a href="README.md">English</a> ·
  <a href="LICENSE">Apache-2.0</a>
</p>

---

`dsh-dev-hub` 是一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI 插件。它位于“模糊需求”和“开发会话”之间，把开发过程中容易被忽略、但决定交付质量的部分变成流程事实：

- 这次到底要改什么、**不改什么**？
- 哪些文件属于本流程，哪些改动其实是别人的？
- 有什么证据证明工作真的完成了？
- 测试和交付之前，是否必须经过独立评审？

插件不绑定具体代码库：可以面向单个 Git 仓库，也可以面向由多个仓库组成的**虚拟库**。

> 当前界面以中文为主。截图中的仓库、人名、数字均为虚构示例。

## 为什么需要它

代码可以由 Agent 快速写出来，真正昂贵的通常是代码之外的部分：

- 需求含糊，Agent 只能猜；
- 改动悄悄溢出到无关文件；
- 两条流程共用一个工作区，互相污染；
- “测试通过”只是聊天里的一句话，看不到命令、环境、时间和输出；
- 最终交接是一段聊天记录，而不是一份可复核的交付物。

`dsh-dev-hub` 把这些变成流程状态：**范围、证据、评审门禁、隔离工作区和报告**。

## 截图

### 开发工作站

![开发工作站](docs/assets/screenshots/workbench.png)

在同一个工作区视图里查看进行中的流程、任务进度、评审状态和并行开发。进行中的流程可以拥有独立 worktree 与分支，因此同一仓库的两条流程不会互相看到或覆盖对方的改动。

### 需求澄清

![需求澄清](docs/assets/screenshots/requirement-chat.png)

只需要说一句话。工作站先扫描仓库，给出候选文件和命中行，再只问那些真正影响实现或验收的问题。没有“规模/人天”输入框，也没有一长串表单项。

### 开发报告

![开发报告](docs/assets/screenshots/development-report.png)

每个完成的流程都可以生成一份只读报告：目标、改动范围、评审结论、测试、计划、时间线和证据边界。报告会自动排除 scope 外改动与 `.DS_Store` 等本地噪声，并明确写出排除口径。

[查看完整报告截图](docs/assets/screenshots/development-report-full.png)

## 功能

### 对话式需求入口

- 先扫描仓库，再提问；
- 候选文件带命中行，便于二次确认；
- 多轮澄清，每个问题都解释“为什么问”；
- 自动生成步骤、验收标准、风险与只读工程量自评；
- 用户确认计划后才创建流程。

### 仓库感知的上下文

- 支持 `src/main/java/...` 这样的目录范围，也支持 `module:checkout` 模块范围；
- Context Pack 包含目标、非目标、验收、任务状态、证据和本机环境；
- 每个仓库的规范保存在 `.dev-hub/conventions.json`；
- 支持多个代码库平权组成的**虚拟库**。

### Worktree 隔离

- 第一条进行中的流程可以使用主工作区；
- 当已有其他进行中的流程时，后续流程自动获得独立 worktree 与分支：
  - 分支：`devhub/<flow-id>`
  - 目录：`~/.dsh/dev-hub/worktrees/<repo-hash>/<flow-id>`
- 台账仍在主仓库；代码改动互相隔离。

### 测试验证前的独立评审

- 派发 1~3 位审核员，按不同视角独立复核：
  - 方向：是否解决约定好的问题；
  - 正确性：边界、失败路径与测试覆盖；
  - 风险：兼容性、数据、安全、回滚与可观测性。
- 评审是门禁：评审通过前，环境测试与提交保持锁定；
- 评审不通过会转成明确的纠偏项，而不是一句“看起来没问题”。

### 测试、提交与报告

- 通过 Host 执行本机自测与环境测试；
- 记录命令、输出、耗时、执行人和结果；
- 在流程内选择变更文件、提交并推送；
- 生成 Markdown/HTML 报告，固定包含：
  - 目标背景；
  - 改动范围与证据；
  - 独立评审；
  - 测试报告；
  - 计划与进度；
  - 过程记录；
  - 证据边界。

### 本地化

- 界面文案通过 DSH 的客户端 locale 服务注册为 `dev-hub` 命名空间；
- 插件提供 `zh` / `en` 字典和本地化的插件元数据，可在 **设置 → 通用 → 语言** 中切换；
- 工作台框架、导航、聊天操作、评审标签与报告控件会跟随当前语言；Host 生成的过程文案、仓库名与用户写的内容保持原语言；
- 新增界面文案应同时补到 `src/client/i18n.mjs` 的中英文字典。

### 本机优先

- 开发者身份、本机环境探测结果保存在 `~/.dsh/dev-hub/profile.json`；
- worktree 不写进仓库；
- 报告和台账都是普通文件，不依赖专有服务；
- 只有扫描、澄清、评审等需要模型时，才通过用户配置的 DSH 模型路由发起请求。

## 工作方式

```mermaid
flowchart LR
  U[用户：一句话] --> C[对话 / 需求入口]
  C --> S[仓库扫描]
  S --> Q[澄清问题]
  Q --> P[计划 + 验收标准]
  P --> F[创建流程]
  F --> W[隔离 worktree / 分支]
  W --> D[开发会话]
  D --> R[独立评审]
  R -->|通过| T[本机 + 环境测试]
  R -->|不通过| D
  T --> G[Git 提交 + 推送]
  G --> RP[开发报告]
```

浏览器半是挂载在 DSH Web GUI slots 上的 React UI；Host 半是 Cordis 插件，注册 loopback `/api/dev-hub/*` 路由和 DSH 工具。核心逻辑集中在 `src/core/`，刻意不依赖 Host 框架，便于用纯函数方式测试。

```text
src/
  core/      流程状态、范围、上下文、评审、报告、worktree
  host/      DSH agent、会话状态、待答问题
  client/    React 工作站、聊天页、报告视图
  shared/    两端共用的 API 与流程契约
```

## 快速开始

### 环境要求

- DeepSeek Harness Desktop 或 Web GUI，0.2.x
- Node.js `^22.19.0` 或 `>=24.0.0`
- Git
- 一个配置了可用模型路由的 DSH profile

### 从源码安装

```bash
git clone <your-repo-url> dsh-dev-hub
cd dsh-dev-hub
npm install
npm run build

# 把 <profile> 换成你使用的 DSH profile（例如 web 或 desktop）
dsh plugin --profile <profile> add link:"$(pwd)"
```

Host 代码安装或更新后需要重启 DSH；Client 代码在 `dsh web` 或 DSH 开发 watcher 运行时可以热更新。

打开 DSH Web GUI，在左侧面板列表选择 **开发工作站**。

### 第一次使用

1. 选择一个代码库，或从两个以上代码库创建虚拟库；
2. 填写本机显示名（只保存在本机）；
3. 让工作站探测本机环境；
4. 用一句话描述要做什么；
5. 确认扫描文件、回答澄清问题、批准计划；
6. 让开发会话实现，进行独立评审、跑测试、提交，最后查看报告。

## 数据布局

| 数据 | 位置 | 是否共享 |
| --- | --- | --- |
| 仓库流程台账、规范、报告 | `<repo>/.dev-hub/` | 团队希望共享的部分可提交 |
| 本机身份与环境缓存 | `~/.dsh/dev-hub/profile.json` | 否 |
| 虚拟库台账 | `~/.dev-hub/workspaces/<workspace-id>/` | 否 |
| Worktree | `~/.dsh/dev-hub/worktrees/<repo-hash>/<flow-id>` | 否 |
| 本机生成的报告 | `<repo>/.dev-hub/reports/` 或虚拟库 `reports/` | 可选 |

虚拟库是本机对已有代码库的组合，不会把代码复制到隐藏目录，也不会往任何成员库写私有台账。

## 开发

```bash
npm run build       # 构建 Host + Client
npm run typecheck   # TypeScript 检查
npm test            # node:test 测试
```

仓库刻意保持较小、依赖较少。`src/core/` 不应引入 DSH Host 依赖，保证不启动 Harness 也能测试核心逻辑。

## 安全与隐私

- Host 路由只监听 loopback；
- 插件不会把源码上传到第三方服务；模型请求走用户配置的 DSH 路由；
- 测试/门禁命令来自仓库或项目配置，由 Host 执行；在不可信仓库上运行前请先检查命令；
- 如果台账里有客户名、内部 URL 或本机路径，不要把 `.dev-hub/` 提交到公开仓库。

## 当前限制

- 英文覆盖集中在工作台/聊天/报告的主要界面；部分 Host 动态文案仍保持原文语言。
- 虚拟库是本机组合，不是远程仓库服务；
- Worktree 隔离适用于 Git 仓库，不适用于虚拟库本机台账；
- 测试和评审质量仍取决于配置的模型与仓库自身的命令。

## 贡献

欢迎提交 Issue 和 Pull Request。请保持改动范围清晰、为核心行为补测试，并在 PR 里写一段简短证据说明（改了什么、怎么验证的）。

## 许可证

Apache-2.0，见 [LICENSE](LICENSE)。
