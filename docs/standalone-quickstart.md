# DevHub 独立 Node Server 快速开始（v0.1）

DevHub 有两种运行形态：

- **DSH 插件**：装进 DeepSeek Harness Web GUI；
- **独立 Node Server**：一条命令启动本机服务，浏览器打开开发工作站，不需要安装 DSH。

独立版面向本机已经安装并登录 Claude Code 的用户。DevHub 不打包 Claude Code、不保存你的 Claude 凭据，只调用本机 `claude` CLI。

## 1. 前置条件

- Node.js 22.19+ 或 24+
- Git
- Claude Code CLI 已安装并登录：

```bash
claude --version
claude
```

Windows 下确认 `where claude` 能找到命令；`.cmd` / `.bat` 由 DevHub 走 `cmd.exe` 启动。

## 2. 启动

在仓库目录外也可以运行：

```bash
# 方式 A：全局安装
npm install -g dsh-dev-hub
devhub

# 方式 B：不安装，直接从包运行（发布后）
npx dsh-dev-hub
```

默认行为：

- 只监听 `127.0.0.1`；
- 随机端口；
- 自动打开浏览器；
- 打印本次启动 URL。

无浏览器环境 / 远程端口转发：

```bash
devhub serve --port 4318 --no-open
```

检查本机能力：

```bash
devhub doctor
```

输出会列出 `node`、`git`、`claude`、`codex`、`pi` 的实际路径；没装就是「未检测到」，不会假装可用。

## 3. 第一次使用

1. 选择代码库或多库项目；
2. 初始化规范；
3. 用一句话描述要开发什么；
4. 确认范围，生成计划与 Context Pack；
5. Claude 首条消息只带 `00-INDEX.md` 入口，让会话自己读必读文件；
6. 开发中用 `devhub update --bridge ...` 回写任务/变更点；
7. 「继续推进」执行独立评审；
8. 测试、提交、报告。

## 4. 本机数据目录

默认规则：

- 如果已有 `~/.dsh/dev-hub`（历史 DSH 插件用户），独立版复用它，worktree/profile 不丢；
- 全新用户使用 `~/.devhub`；
- 可以用 `DEVHUB_HOME` 显式指定：

```bash
DEVHUB_HOME=/path/to/devhub-home devhub serve
```

仓库内的 `.dev-hub/` 台账、Context Pack、worktree 规则与 DSH 插件完全一致，不产生第二套数据格式。

## 5. v0.1 限制

- 独立版只验收 Claude Code；Codex/Pi 代码路径保留，但不在 v0.1 门禁内；
- 独立版不提供 DSH 原生引擎（没有 DSH 进程内 agent）；
- 还没有 Electron 桌面壳、自动更新、签名安装包；
- 本地 server 用启动 token + Host/Origin 校验保护；API 需要浏览器页面里的 token。

## 6. 常见问题

**浏览器提示 403 / 接口不可用**

独立 server 的 API 需要启动 token。请从 `devhub` 打印的 URL 打开页面，不要手工拼 API 地址。

**未检测到 claude**

先确认：

```bash
which claude    # macOS/Linux
where claude    # Windows
```

安装并登录后重启 `devhub`。

**首次打开独立工作区提示 `Workspace not trusted`**

Claude Code 不会在未受信任的目录里启动后台会话。按提示进入该 worktree：

```bash
cd <提示里的 worktree 路径>
claude
# 接受信任提示后退出
```

再回到 DevHub 点「继续推进」/重新开启开发会话。DevHub 会把这个错误翻译成带 worktree 路径的提示，但不代替你接受 Claude 的安全设置。

**端口被占用**

```bash
devhub serve --port 4318 --no-open
```

或让系统分配随机端口（默认 `--port 0`）。

**同时开着 DSH 插件和独立版**

独立版会读取 `~/.dsh/dev-hub/runtime.json` 做单实例检测；同一时间建议只用一个宿主写同一个仓库，避免并发覆盖台账。

## 7. 从源码运行

```bash
npm install
npm run build
node bin/devhub.mjs serve --no-open
```

DSH 插件形态仍然是：

```bash
dsh plugin --profile web add link:$(pwd)
```

两种形态共用同一套 `src/core`、`src/shared` 和 `src/client` 页面组件。
