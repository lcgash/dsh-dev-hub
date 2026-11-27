# 更新日志

**dsh-dev-hub** 面向用户的功能变化。日期使用作者本地时区。

## 0.2.0-beta.1 — 2026-11-27

### 新增

- **独立 Node Server 形态**：`devhub` / `devhub serve` / `devhub doctor`，不需要安装 DSH；
- 独立浏览器 UI：复用同一套 React 页面与流程内核，React 打进独立 bundle；
- 独立版面向本机 Claude Code：启动/恢复后台会话、blocked/running 状态、bridge CLI、外部评审、自测与报告；
- 独立版启动 token、Host/Origin 校验、附件 query token；
- `DEVHUB_HOME` 与旧 `~/.dsh/dev-hub` 复用规则；`devhub serve --home`；
- 单实例 `runtime.json`，重复启动复用已有实例；
- `npm pack` 后可在空环境安装，DSH peer 依赖标为 optional；
- Standalone E2E：临时 git 仓库 + fake Claude CLI 全链路；
- 独立版快速开始文档。

### 调整

- `createRoutes(ctx)` 从 DSH `apply` 抽出，DSH 插件与独立 server 共用同一组路由；
- `@deepseek-ai/dsh-tools` 改为可选导入，独立进程不要求 DSH 包；
- 独立宿主默认 Claude，DSH 引擎在独立版隐藏；不写回用户的 DSH profile。

### 边界

- 独立版 v0.1 只验收 Claude Code；Codex/Pi 代码路径保留但不在门禁内；
- 独立版不提供 DSH 原生引擎；
- 尚无 Electron 桌面壳、自动更新、签名安装包。

