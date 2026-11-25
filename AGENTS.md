# dsh-dev-hub 开发规则

## 产品边界

- 这是给团队使用的 DSH Web GUI 插件；同事可能在 Windows、macOS、Linux 上运行。
- 任何改动都必须至少考虑 Windows 路径、命令和终端启动方式，不能只以 macOS 为准。

## Windows 兼容硬规则

- 文件系统路径统一用 `path.join` / `path.resolve`；不要假设 `/` 分隔符、盘符或 Unix 家目录。
- 路径同时要区分“仓库内相对路径”和“磁盘绝对路径”；提交路径必须拒绝 `C:\`、`\\`、`..` 和 `.git`。
- 命令探测用 `which`（Unix）/`where`（Windows）；不要假设 `sh`、`bash`、单引号、`chmod`、`/tmp`。
- 启动 `.cmd` / `.bat` 必须经 `cmd /c` 或等价 shell，并对含空格/特殊字符的参数安全处理。
- 打开终端/IDE/Claude Code：macOS 用 `open`/`osascript`，Windows 用 `start`/`cmd`，Linux 用对应终端。
- 文本统一 UTF-8；处理 CRLF、文件名大小写、Windows 保留字符。
- 界面快捷键不能只显示 `⌘`，要提供 `Ctrl` 等价操作。
- 改到路径/进程/文件系统时，测试至少覆盖 Windows 形态；不能只跑 macOS 测试。

## 提交前

```bash
npm run typecheck
npm test
npm run build
```

本仓库的 `.dev-hub/conventions.json` 也显式包含 `windows-first` 约束；新流程创建时会被 Context Pack 带上。
