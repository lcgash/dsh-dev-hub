# 独立 Node Server 版实施计划（DevHub v0.1）

- 状态：进行中（M0 已验证，M1/M2 起步）
- 日期：2026-11-27
- 目标形态：`devhub` 本机 Node Server + 浏览器 UI
- 首个可用版本：只支持 Claude Code（Codex/Pi 保留代码路径，不在 v0.1 验收内）
- 兼容目标：现有 DSH 插件继续可用；仓库台账、Context Pack、worktree 不换格式

## 1. 结论与定位

DevHub 不再只做 DSH 插件。v0.1 先做“一个和 DSH 最初上线形态相同的本机 Node Server”：一条命令启动，浏览器打开开发工作站，直接面向本机已安装并登录 Claude Code 的用户。

v0.1 不需要 Electron，不需要云服务，不需要账号体系，也不需要把 Claude Code 打包进来。用户继续用自己的 Claude Code 登录态和 CLI，DevHub 负责流程、范围、Context Pack、独立评审、测试证据和交付报告。

产品边界：

- **DevHub 是产品**：流程与证据层。
- **DSH 是第一种宿主**：插件形态继续维护。
- **Claude Code / Codex / Pi 是引擎**：通过本机 CLI 接入。
- **独立 Node Server 是第二种宿主**：v0.1 的主交付形态。

## 2. 现状判断

| 层 | 现状 | 对独立版的含义 |
|---|---|---|
| `src/core` | 40 个文件、约 10,300 行，只依赖 Node 内置模块，无 DSH import | 可直接复用 |
| `src/shared` | 约 1,200 行协议/文案/常量 | 可直接复用 |
| `src/index.mjs` | 约 7,800 行、60 个 loopback 路由；只通过 `ctx.get()` 取十来个服务；唯一运行时 DSH import 是 `defineTool` | 需要宿主适配，不需要重写业务 |
| `src/client` | 约 16,000 行 React；3 个 `ctx.slots.inject`；API 全走 `/api/dev-hub/*` | 需要第二个浏览器构建与挂载入口 |
| Claude/Codex/Pi | 已走本机 CLI、bridge CLI、JSONL/日志；启动接口不依赖 DSH 会话 | 独立版主路径已经存在 |
| DSH 引擎 | 依赖 `ctx.agents/sessions/llm/subagents` 的进程内能力 | v0.1 明确不支持，显式灰掉 |
| 本机状态 | profile、worktree、附件、IDE/终端启动均由 DevHub 自己实现 | 可复用，但 profile 目录需要品牌解耦 |

关键结论：**不是从零做桌面应用，而是把现有 Host 从 Cordis 生命周期里解出来，再补一个独立浏览器壳。**

## 3. v0.1 用户路径

### 3.1 安装与启动

```bash
# 候选之一，发布前确认包名可用
npm install -g devhub-workstation

# 启动：默认随机端口、只监听 127.0.0.1、自动打开浏览器
devhub

# 无浏览器环境 / 远程端口转发
devhub serve --port 4318 --no-open

# 查看服务与能力
devhub doctor
```

兼容现有 bridge CLI：

```bash
devhub get --bridge ~/.devhub/claude-bridges/<flow>.json
devhub update --bridge ... --task "..." --done
```

`devhub` 无参数启动服务；`get/update` 保持现有 agent bridge 语义。两者共用一个 bin，不新增第二个全局命令。

### 3.2 首次使用

1. 选择代码库或本机虚拟库；
2. 检测 `git`、`node`、`claude`，显示能力而不是假装可用；
3. 一句话描述需求，扫描候选文件，确认范围；
4. 生成计划与 Context Pack 目录；
5. 启动 Claude Code 后台会话，绑定 bridge；
6. 开发中用 `devhub update` 回写任务/变更点；
7. 「继续推进」触发独立评审；
8. 本机自测、环境测试、提交、报告。

### 3.3 v0.1 明确不做

- Electron / 安装包 / 自动更新；
- 独立版支持 DSH 原生引擎；
- Codex/Pi 的 v0.1 验收（代码可保留，UI 标为实验）；
- 云同步、团队空间、账号、计费；
- 多人协作与远程托管；
- 移动端；
- 把 Claude Code 二进制或许可证打包进产品。

## 4. 目标架构

```text
bin/devhub.mjs                 命令入口：serve / open / get / update / doctor
src/standalone/server.mjs      独立 HTTP server、静态资源、启动参数、单实例
src/standalone/context.mjs     HostContext：sessions/agents/workspace/profile 的独立实现
src/standalone/engines/        Claude 驱动（复用现有 CLI/JSONL 能力）
src/host/app.mjs               createApp(host)：注册 60 个路由，返回 server 可用的 handler
src/host/routes/               按领域拆分的路由：flow / review / test / sessions / settings
src/adapters/dsh/              Cordis ctx -> HostContext；slots/tools/systemPrompt
src/adapters/standalone/       Node 进程 -> HostContext
src/client/standalone.mjs      浏览器挂载入口：createRoot + DevHubPage
src/client/dsh-entry.mjs       仅 DSH 的 slots 注册入口
src/client/app.mjs             DevHubPage 与页面壳（从 index.mjs 拆出）
```

核心接口不是照搬 Cordis，而是一个最小 `HostContext`：

```ts
interface HostContext {
  get(name: string): unknown
  sessions: SessionQuery
  agents: AgentQuery
  effect(fn: () => void | (() => void), label?: string): void
  webServer?: { register(route: Route): () => void }
}
```

v0.1 允许先做一个 **Cordis 兼容 shim** 来验证，不要求第一天就完成全部拆分：

- shim 提供 `get/sessions/agents/effect/webServer`；
- `apply(ctx)` 原样注册路由；
- `ctx.get('tools')`、`ctx.get('systemPrompt')` 返回 `null`，工具注册自动跳过；
- `defineTool` 从 portable path 移到 DSH adapter，避免独立版 import DSH 包。

shim 只用于 P0 验证和 v0.1 过渡。v0.1 发布前必须把路由注册从 `apply` 抽到 `createApp`，否则独立版会被 DSH 生命周期细节长期绑住。

## 5. 里程碑与工作包

估算按“熟悉本仓库的一名全职开发者”计算，单位为工程人日；包含测试，不含发布后支持。

| 里程碑 | 产出 | 估算 | 依赖 |
|---|---|---|---|
| M0 可行性 Spike | 独立 server 能启动、`/api/state` 可用、UI 能加载 | 2–3d | 无 |
| M1 宿主解耦 | `createApp` + DSH adapter + standalone context | 6–8d | M0 |
| M2 独立 UI | 第二个浏览器构建、页面挂载、首次使用 | 5–7d | M1 |
| M3 Claude 全链路 | 建流程→开发→bridge→评审→测试→报告 | 6–8d | M2 |
| M4 分发与安全 | `devhub` 命令、鉴权、迁移、npm pack、Windows | 4–6d | M3 |
| M5 稳定与发布 | 回归、文档、beta 发布 | 3–5d | M4 |

总计约 **26–37 人日**。乐观 4 周，保守 6–7 周。P0 如果证明 shim 不可行，M1 需要追加 3–5 天。

### M0：可行性 Spike（2–3d）

| ID | 任务 | 验收 |
|---|---|---|
| M0-1 | 新建 `src/standalone/shim.mjs`：假 `ctx`，收集 `webServer.register` 的路由 | 能调用现有 `apply(ctx)`，不修改业务代码 |
| M0-2 | 新建 `src/standalone/server.mjs`：`http.createServer` 按 exact path 分发；静态占位页 | `GET /api/dev-hub/state` 返回 200 或明确错误 |
| M0-3 | 去掉 portable path 对 `defineTool` 的硬 import；DSH 工具移到 adapter | 独立进程启动不要求安装 DSH 包 |
| M0-4 | 记录 Go/No-Go：路由复用率、客户端挂载阻塞点、需要新增的服务 | 形成一页结论，决定是否进入 M1 |

**Go 条件**：`/state`、`/items`、`/item` 能返回真实台账；客户端能在无 DSH 的浏览器环境渲染出首页。  
**No-Go 条件**：路由依赖 Cordis 事件/生命周期到无法用 shim 补齐，或客户端必须依赖 DSH renderer 才能挂载。

### M1：宿主解耦（6–8d）

| ID | 任务 | 验收 |
|---|---|---|
| M1-1 | 定义 `HostContext` 与 `HostCapabilities` 类型/文档 | 文档列出每个服务的必需/可选与降级行为 |
| M1-2 | 从 `apply` 抽出 `createApp(host)`；路由按 flow/review/test/sessions/settings 分文件 | DSH 插件行为不变；现有测试全过 |
| M1-3 | DSH adapter：把 Cordis ctx 包成 HostContext；只在此处 import `defineTool` | `src/host`/`src/standalone` 不出现 `@deepseek-ai/*` 运行时 import |
| M1-4 | standalone context：sessions（本机受管会话）、agents（CLI 进程）、sessionPersistence（JSONL/索引） | `/api/sessions`、`/api/session` 在无 DSH 下可用 |
| M1-5 | workspace/profile 适配：`workspaceRegistry`、`workspaceController`、`clientModules` 的独立实现或显式 null | UI 不因空服务白屏；错误可读 |
| M1-6 | 路由注册测试：同一组路由分别由 DSH adapter 与 standalone adapter 注册 | 路由数量/路径一致；无重复路径 |

**原则**：`createApp` 只依赖 HostContext，不 import React、Cordis、DSH tools；宿主差异全部在 adapter。

### M2：独立 UI（5–7d）

| ID | 任务 | 验收 |
|---|---|---|
| M2-1 | 拆 `src/client/app.mjs`，导出 `DevHubPage`；`src/client/dsh-entry.mjs` 只保留 slots | DSH 插件入口不变；页面可由 React 直接挂载 |
| M2-2 | 新增 `src/client/standalone.mjs` 与第二份 tsdown build（React 打进 bundle） | 产物不含 `__ModuleLoader__`，浏览器可直接加载 |
| M2-3 | 新增 `standalone/index.html` + 静态资源路由 | 无 DSH 环境下页面可打开，控制台无致命错误 |
| M2-4 | standalone `ctx` stub：locale 回退中文、`uiWorkspace/layout` 为 null、sessions 只读 | 聊天/会话页不抛异常，缺失能力有提示 |
| M2-5 | 引擎默认 Claude；DSH 选项在独立版隐藏/禁用；`/capabilities` 返回可用引擎 | 首屏默认 Claude；未安装 Claude 时明确提示安装/登录 |
| M2-6 | 浏览器 smoke：首页、切换项目、打开流程、设置页 | 手工 + 可选 Playwright；无白屏 |

**说明**：独立版不做 i18n 全量翻译，先中文原文 + 词典文件可选加载；`LocaleProvider` 无 `ctx.locale` 时已经回退中文。

### M3：Claude 全链路（6–8d）

| ID | 任务 | 验收 |
|---|---|---|
| M3-1 | `/capabilities` 汇总 `git/node/claude/codex/pi` 与权限模式 | UI 使用真实探测；不可用引擎不能选 |
| M3-2 | 独立 SessionManager：启动/恢复/停止 Claude 后台会话；状态、transcript、blocked 识别 | 与现有 `claude` 路由行为一致；无 DSH 会话依赖 |
| M3-3 | bridge 目录/ token / CLI 路径适配独立 home；`devhub get/update` 可用 | 会话内能回写任务/变更点；重启 server 后 bridge 仍有效 |
| M3-4 | Context Pack 目录 + 薄 prompt：Claude 启动消息指向 `00-INDEX.md` | 新会话首条消息包含入口/必读文件 |
| M3-5 | 评审：外部引擎路径优先；外部失败时**不**回退 DSH，直接标 error 并给出重试 | 评审不会永久 pending；错误原因可见 |
| M3-6 | 测试/提交/报告：standalone 下走同一 core 与路由 | 本机自测、环境测试、提交、报告都能完成 |
| M3-7 | E2E：临时 git 仓库 + fake `claude` CLI | 建流程→开发→bridge→评审→测试→报告 全链路脚本通过 |

**关键行为**：Claude blocked 时统一显示「等待授权/选择」，顶部按钮禁用；这与现有 DSH 插件修复后的口径一致，不能因为换宿主又分叉。

### M4：分发、安全、迁移（4–6d）

| ID | 任务 | 验收 |
|---|---|---|
| M4-1 | `devhub` 子命令：默认 serve、`serve --port/--no-open/--home`、`doctor`、`get/update` | 帮助文本清晰；无参数不会误跑 bridge 用法 |
| M4-2 | 单实例：`~/.devhub/server.json` 记录 pid/port/token；重复启动打开已有实例 | 不会两个 server 抢同一端口/同一台账 |
| M4-3 | 本地鉴权：启动 token 注入 HTML；API 校验 token；Host/Origin 校验；静态路径穿越防护 | 非本机页面无法调用；DNS rebinding 不能读台账 |
| M4-4 | `DEVHUB_HOME`：默认规则（有 `~/.dsh/dev-hub` 则复用，否则 `~/.devhub`）；旧 profile 迁移 | 现有 DSH 用户的 worktree/profile 不丢 |
| M4-5 | npm 包边界：standalone 运行不需要 `@deepseek-ai/*`；DSH peer 标 optional 或拆包 | 干净环境 `npm pack` 安装后可直接启动 |
| M4-6 | `npm pack` + 临时 prefix 安装 smoke；`npx` 启动 | 无 monorepo、无 symlink 依赖也能跑 |
| M4-7 | Windows：路径含空格、`claude.cmd`、终端启动、`devhub.cmd` | Windows 手工 smoke 通过，不只跑 macOS |

**包边界提醒**：当前 `package.json` 有 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools` peer。独立用户安装时不应被这些 peer 阻塞；v0.1 优先做 optional peer + portable entry，后续再评估拆成 `devhub` 与 `dsh-dev-hub` 两个包。

### M5：稳定与发布（3–5d）

| ID | 任务 | 验收 |
|---|---|---|
| M5-1 | 错误状态与日志：server 启动失败、端口占用、Claude 未安装、bridge 失效 | 每个错误有下一步动作，不白屏 |
| M5-2 | 全量回归：620+ 测试、typecheck、build、standalone 新测试 | 全绿 |
| M5-3 | README 独立版快速开始；DSH 插件说明保留 | 新用户 5 分钟内能启动 |
| M5-4 | CHANGELOG、版本号、beta 标签、npm publish dry-run | `0.2.0-beta.1` 可安装 |
| M5-5 | 发布后 3 条真实仓库试用记录 | 记录环境、成功/失败、阻塞点 |

## 5.1 M0 验证结果（2026-11-27）

- 独立 `http.createServer` 已能复用现有 60 个 Host 路由；`/api/dev-hub/state` 返回真实台账。
- `lib/standalone.js` 第二份浏览器构建成功（React 已打进 bundle，不含 DSH `__ModuleLoader__`）。
- headless Chrome 能渲染独立页首页，不是白屏。
- 独立进程通过 `globalThis.__DEVHUB_STANDALONE__` 让引擎回退 Claude；不写回 profile，DSH 插件仍按原选择执行。
- 现有 `apply(ctx)` 仍由 DSH 插件入口使用；M0 新增文件不改变 DSH 路由行为。

结论：**Go**。M1 需要把 `apply` 里的路由/工具注册拆成 `createApp` + DSH adapter，正式移除独立运行对 Cordis shim 的依赖。

## 5.2 M1 起步进度（2026-11-27）

- `createRoutes(ctx)` 已从 `apply` 抽出；DSH 插件仍通过 `apply` 注册同一组 60 个路由。
- 独立 server 直接调用 `createRoutes`，不再依赖 `ctx.effect`/`ctx.webServer` 生命周期。
- `devhub` 命令已支持默认启动、`devhub serve --port --no-open`、`devhub doctor`；bridge CLI 的 `get/update` 保持。
- DSH `defineTool` 改为可选导入；独立进程不安装 `@deepseek-ai/*` 也能加载 Host 模块。
- 独立首页已用 headless Chrome 验证，不再是占位页。
- 剩余：正式 DSH adapter、独立 sessions/agents、Claude 全链路、鉴权与 npm 包安装验收。

## 5.3 当前进度（2026-11-27 17:10）

- `devhub` / `devhub serve` / `devhub doctor` 可用；`npm pack` + 临时 prefix 安装 + 空 HOME 启动已验证。
- `createRoutes(ctx)` 已抽出；独立 server 直接使用，DSH 插件仍由 `apply(ctx)` 注册同一组路由。
- 独立浏览器构建（`lib/standalone.js`，React 打包）已能加载首页；headless Chrome 已渲染真实流程。
- 独立宿主通过 `globalThis.__DEVHUB_STANDALONE__` 回退 Claude；`/settings` 返回 `dshAvailable:false`，UI 隐藏 DSH 引擎。
- 启动 token 鉴权、Host/Origin 校验、附件 query token 已接入；无 token 的 `/api/dev-hub/*` 返回 403（bridge CLI 除外）。
- `peerDependenciesMeta` 已把 DSH/React 标 optional；空环境安装不拉 DSH 包。
- 仍需：独立 sessions/agents 的完整管理页、Claude 全链路真实回归、评审失败不依赖 DSH fallback、Windows 冒烟、官方 README/发布。

## 5.4 M3 全链路结果（2026-11-27）

- 新增 `test/standalone-e2e.test.mjs`：临时 git 仓库 + fake `claude` CLI，跑通
  setup → bootstrap → 建流程 → start（worktree）→ Context Pack → Claude launch
  → blocked/running 会话状态 → bridge CLI 回写 → 外部评审 pass → 本机自测 → 报告。
- 独立宿主会话列表会把 Claude CLI 的 blocked/running 投影到流程 `sessionStates`；不再依赖 DSH session/agent。
- 独立评审失败不再尝试 DSH fallback；直接标 error，允许重试。
- `/capabilities` 在独立宿主返回引擎可用性与权限模式；没有 Claude 时图片能力显式不支持。
- 单实例：启动时读 `runtime.json`，已有健康实例则复用它；退出清理 runtime。
- `DEVHUB_HOME` 规则已接入：有历史 `~/.dsh/dev-hub` 就复用，否则独立版使用 `~/.devhub`。
- `npm pack` + 临时 prefix 安装 + 空 HOME 启动仍通过。

## 5.5 M4 进度（2026-11-27）

- `devhub serve --home DIR` 已支持；`DEVHUB_HOME` 在 import Host 前生效。
- `runtime.json` 单实例已带测试：第二个进程复用健康实例，不再抢同一端口。
- 独立 server 的 runtime 路径可注入，测试不会污染用户本机 `~/.dsh/dev-hub`。
- `close()` 会关闭 keep-alive 连接，E2E 不会因为 undici 连接池挂住。
- 仍缺：Windows 实机冒烟、单实例跨宿主（DSH 插件 + 独立版同时写台账）写锁、发布版本号与 npm dry-run。

## 5.6 发布前加固（2026-11-27）

- 版本升到 `0.2.0-beta.1`，中英文 CHANGELOG 记录独立版能力与边界。
- `npm pack` 产物 `dsh-dev-hub-0.2.0-beta.1.tgz` 在临时 prefix 与空 HOME 安装/启动通过。
- 新增 `.github/workflows/standalone-ci.yml`：Ubuntu/macOS/Windows × Node 22/24，跑 build + standalone server + fake Claude E2E。
- E2E 测试已做 Windows 形态：fake `claude.cmd` + `claude.js`、`path.delimiter`、`where`/`cmd.exe` 路径。
- 真实 Claude CLI 的一次性 `-p` 调用可用；但 DevHub 全链路真实会话仍需手工跑一条（不能拿 fake 结果冒充）。
- CI 尚未在 GitHub 上实际跑过；Windows 证据要等 CI 结果，不能先写成“已通过”。

## 5.7 真实 Claude 验证（2026-11-27）

- 使用临时 HOME/repo 启动独立版，真实 `claude --bg` 成功生成后台会话；Claude 状态投影为 `blocked`，需要用户在终端处理权限，符合设计。
- 首次在新 worktree 启动会报 `Workspace not trusted`：这是 Claude 的安全门槛，DevHub 不能替用户接受。已把错误翻译成带 worktree 路径的下一步，并写入快速开始。
- 真实会话已 `claude stop` 清理；未把“真实 Claude 全链路”写成已通过。剩余手工验收：在受信任 worktree 中接受权限后跑完开发/评审/测试/报告。
- CI 已加入 Ubuntu/macOS/Windows × Node 22/24；本轮没有 GitHub Actions 运行结果，Windows 仍标待验证。

## 6. 数据与兼容契约

- 仓库台账继续是 `.dev-hub/items/*.json`，不新增第二套存储。
- Context Pack 继续是 `.dev-hub/context/<flow-id>/`，文件集合不变。
- 所有 git 流程继续默认独立 worktree；路径由 home 推导，不写进仓库台账。
- 本机 profile 仍保存 repos/workspaces/commands/attachments；v0.1 不强制迁移，按 `DEVHUB_HOME` 规则选择。
- 独立版与 DSH 插件可以读同一仓库台账；但可能同时运行，必须有仓库级写锁或单实例提示。
- 旧流程没有 worktree 元数据时继续使用主工作区，不能因为换宿主改变语义。
- DSH 专属字段（如 `workflow.review` 中的 DSH sessionId）在独立版按外部会话字段解释，不伪造 DSH 会话。

## 7. 验收标准（v0.1 Definition of Done）

在**没有安装 DSH**、但已安装 Node 22/24、git、Claude Code 并登录的机器上：

1. `npm pack` 产物能在临时 prefix 安装，`devhub` 一条命令启动；
2. 浏览器自动打开，能选仓库、初始化规范、创建流程；
3. 能生成 Context Pack 目录，Claude 首条消息指向 `00-INDEX.md`；
4. Claude 会话能启动、恢复、显示 running/blocked/transcript；
5. `devhub update` 能回写任务/变更点，刷新页面能看到；
6. 「继续推进」能派发 1–3 位评审员并落结论；失败能纠偏，异常能重试；
7. 本机自测、环境测试、提交、报告全链路可完成；
8. DSH 插件现有 620+ 测试、typecheck、build 全过；
9. Windows 路径空格 + `claude.cmd` 冒烟通过；
10. 独立版进程退出后无残留端口/子进程；重复启动不会起第二个 server。

## 8. 测试策略

- **现有回归**：`npm test`、`npm run typecheck`、`npm run build` 全部保留。
- **服务器**：端口 0 启动、静态资源、鉴权、路径穿越、优雅退出、端口占用、单实例。
- **路由契约**：同一路径在 DSH adapter / standalone adapter 下返回同构 JSON。
- **引擎**：fake `claude` CLI 覆盖 running/blocked/失败/超时；真实 Claude 手工 E2E 作为发布前门禁。
- **流程**：临时 git 仓库跑 create→start→context→update→review→test→report。
- **构建**：断言 standalone bundle 不含 `@deepseek-ai` 与 `__ModuleLoader__`。
- **Windows**：至少一条 PATH/空格路径/`.cmd` 启动测试；不能只以 macOS 为准。

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| shim 看似能跑，但路由依赖 Cordis 生命周期 | 后期返工 | M0 必须做 Go/No-Go；M1 抽 `createApp`，不长期保留 shim |
| 独立版与插件同时写台账 | 数据覆盖 | 仓库级锁 + 单实例；写入前版本校验 |
| Claude CLI 版本差异/权限模式 | 会话卡住 | 能力探测 + blocked 状态 + 明确打开终端提示 |
| 外部评审失败后没有 DSH 兜底 | 评审永久 pending | 直接标 error，提供重试；禁止依赖 DSH fallback |
| npm peer 依赖阻塞安装 | 用户装不上 | optional peers / 独立包；`npm pack` 干净环境 smoke |
| 第二份 UI 构建与 DSH bundle 分叉 | UI 行为不一致 | 共用 `DevHubPage`，只分入口；UI 源码单一来源 |
| Windows 终端/命令差异 | 功能不可用 | `cmd /c`、引号、路径测试；发布前 Windows 冒烟 |
| 品牌路径迁移破坏旧 worktree | 老流程打不开 | 默认复用 legacy home；迁移只复制不删除，失败可回退 |
| 一人维护两套发行 | 节奏被拖垮 | v0.1 只支持 Claude；Codex/Pi/DSH 引擎后置 |

## 10. 后续版本（不在 v0.1）

- **v0.2**：Codex/Pi 独立引擎验收；DSH 插件与独立版共用 profile；Windows 安装文档。
- **v0.3**：Electron 壳、托盘、自动更新、签名/公证。
- **v0.4**：DSH 作为外部 sidecar 嵌回独立版（可选）。
- **长期**：MCP server 形态，让 Claude Code/其他 agent 直接在会话里调用 DevHub 工具。

## 11. 第一周执行顺序

1. **第 1 天**：建 `src/standalone/shim.mjs`，让现有 `apply(ctx)` 在 Node server 里注册路由；打通 `/api/state`。
2. **第 2 天**：去掉 portable path 的 `defineTool` 硬依赖；静态占位页；记录 Go/No-Go。
3. **第 3 天**：拆 `createApp` 雏形，先搬 `/state`、`/items`、`/item` 三条路由，验证 adapter 思路。
4. **第 4 天**：第二份 client build + `DevHubPage` 挂载，浏览器能看到首页。
5. **第 5 天**：接 Claude 启动与 bridge，跑通“一句话建流程 → 启动 Claude → `devhub update` 回写”；做第一次演示。

第一周结束的判断标准：**没有 DSH 的浏览器里能建一条流程，并把 Context Pack 交给 Claude Code。** 这条链路通了，后面主要是补全和发行工程；通不了，就先解决隐藏的宿主耦合，不进入 M2。
