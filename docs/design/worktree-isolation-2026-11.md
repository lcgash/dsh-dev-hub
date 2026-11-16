# 多流程独立工作区（git worktree）

- 状态：已实现（2026-11-12）
- 范围：`src/core/worktree.mjs`、`src/index.mjs`、`src/client/*`、测试与 README

## 1. 目标背景

同一代码库允许多个开发流程。此前所有流程共用一个工作区与 HEAD：

- 变更 = `baseline..HEAD + 当前工作区`，A 的未提交改动会出现在 B 的变更列表；
- A 的提交也会被 B 算进自己的变更；
- 测试/提交在同一目录执行，会互相影响；
- scope 只能判断路径归属，无法隔离工作区读写。

解决办法：所有 git 开发流程默认使用独立 git worktree + 分支；虚拟库按每个 git 成员库分别隔离。

## 2. 触发与位置

- 触发：`/start` 时所有 git 开发流程；只读分析流程不建 worktree；
- 虚拟库：每个 git 成员库一个 worktree（`<item-id>--<成员名>`），非 git 成员库退回原目录；
- 路径：`~/.dsh/dev-hub/worktrees/<repo-hash>/<item-id>`（本机推导，不写台账）；
- 分支：`devhub/<item-id>`，从主库当前 HEAD 或记录过的 baseCommit 创建；
- 单库台账只记 `workflow.worktree`，虚拟库记 `workflow.worktrees[]`（成员名/分支/基线），
  绝对路径都由本机推导，不落仓库；
- Node/Python 的 `node_modules` / `.venv` 从主库软链过来（存在才链）。

## 3. 语义

- baseline：从 worktree HEAD 记录；变更 = 该 worktree 的 `baseline..HEAD + 工作区`；
- `/files`、`/diff`、`/changes`、`/test`、`/submit`、`/report` 的单库 git 操作都走 worktree；
- 台账（`.dev-hub/`）仍写主库；worktree 分支不提交台账；
- 开发会话 cwd 使用 `workRoot`；Context Pack 增加【独立工作区】段；
- 提交推送 `devhub/<id>` 分支，合并回主分支由用户按正常 Git 流程完成；
- 删除流程清理本机 worktree 目录，不删分支/提交；
- 开发前同步：流程详情「⟳ 拉取代码」执行 `fetch + merge --ff-only`，worktree 从最新 HEAD 创建。

## 4. 兼容与边界

- 没有 worktree 元数据的旧流程继续用主工作区（不会一夜之间换目录）；
- 所有 git 开发流程默认隔离；旧的、没有 worktree 元数据的流程继续用主工作区；
- worktree 目录被手动删除时，相关 git 操作显式失败，不静默退回主工作区；
- Node 依赖通过软链复用；JVM 的 `target` 不共享，worktree 内需要重新构建；
- 多流程改同一文件时，合并阶段仍可能冲突，这是预期行为（隔离的是工作区，不是最终合并）。

## 5. 验收

- `test/worktree.test.mjs`：目录/分支创建、复用、隔离、非 git 报错、清理；
- `test/worktree-host.test.mjs`：所有 git 流程默认隔离、两流程文件互不可见、台账不写绝对路径；
- `test/workspace-host.test.mjs`：虚拟库每个成员库独立工作区，主工作区改动不混入；
- `test/sync.test.mjs`：开发前 fetch + ff-only 同步与逐库结果；
- 全量 `npm test`、`npm run build`、`npm run typecheck`。
