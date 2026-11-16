# 开发报告（每个流程一份，可点击查看）

- 状态：已实现（2026-11-12，Host + Client + 测试 + 文档）
- 日期：2026-11-12
- 范围：`src/core/report.mjs`、`src/core/report-render.mjs`、`src/index.mjs`、`src/client/report.mjs`、
  `src/client/index.mjs`、`src/client/home.mjs`、`src/shared/api.mjs`、测试与 README

## 1. 目标背景

每个开发流程（`.dev-hub/items/<id>.json`）推进到开发/测试/提交后，团队成员需要一份**不用翻台账、
点一下就能看**的结项报告。报告固定回答三件事：

1. **目标背景**：为什么做、做什么、不做什么、验收是什么；
2. **改动范围**：计划 scope、baseline、实际改了哪些文件（增删行）、提交/推送结果、变更点；
3. **测试报告**：本机自测/环境测试的状态、命令、耗时、输出尾部，成员库结果与验收项。

再补充计划进度、风险、过程记录和证据边界。报告是**只读视图**，数据全部来自台账 + 本机 git
事实；证据不完整时显式说明，不伪造 diff。

## 2. 非目标

- 不引入报告数据库、不调用模型、不发网络请求；
- 不改变现有台账字段语义；报告只读，编辑仍回原页面；
- 不自动提交报告文件；`save` 显式触发，写入 `.dev-hub/reports/`；
- 不把报告文件计入 `flowFileChanges`（`.dev-hub/` 已整体排除）。

## 3. HTTP 契约

新增 `API.report = '/api/dev-hub/report'`（只允许 loopback）。

```text
GET  /api/dev-hub/report?id=<itemId>                 -> { ok, report, markdown }
GET  /api/dev-hub/report?id=<itemId>&format=markdown -> text/markdown; charset=utf-8（裸文本）
GET  /api/dev-hub/report?id=<itemId>&format=html     -> text/html; charset=utf-8（整页报告）
GET  /api/dev-hub/report?id=<itemId>&save=1          -> { ok, report, markdown, saved }
POST /api/dev-hub/report  { id, action: 'save' }     -> { ok, report, markdown, saved }

saved = {
  dir, html, markdown,              // 绝对路径，用户可直接在 Finder/终端打开
  relative: { dir, html, markdown } // 仓库相对路径（兼容/排查用）
}
```

- `id` 由 `getItem` 读取；不存在返回 400 + 错误信息；
- `format=html` 必须能直接在浏览器新标签打开、可打印，不依赖外部 CSS/JS/字体；
- `save` 写 `.dev-hub/reports/<id>.html` 与 `<id>.md`，目录不存在时创建；失败如实返回 400；
- JSON 响应包含 `markdown` 供前端「复制 Markdown」，不重复塞整页 HTML；
- 报告生成不得因为「非 git 仓库 / 没有 baseline / 没跑测试 / 虚拟库成员失效」而失败，
  这些情况写进 `evidence`/`scope`/`test` 段并显式标注。

## 4. Report 模型（`buildReport` 纯函数）

```js
buildReport({ item, files = null, git = null, workspace = null, generatedAt = new Date().toISOString() })
```

`files` 与 `GET /api/dev-hub/files` 响应同形：`{ files[], totals, evidenceComplete, reason, repos[], excludedCount }`；
`git`：`{ isRepo, available?, branch?, head?, reason? }`；
`workspace`：`{ id, name, members: [{ name, path, primary, branch, head, isRepo }] }`。

```js
Report = {
  schemaVersion: 1,
  itemId, title, status, statusLabel,
  stage, stageLabel, stageReason,
  intent: 'feature' | 'bug',
  generatedAt,                      // ISO 字符串
  verdict: 'passed' | 'failed' | 'incomplete' | 'blocked',
  verdictLabel: '通过' | '未通过' | '未完成' | '阻塞',
  verdictReason: string,
  summary: {
    goal, rootProblem,
    changedFiles, added, removed,
    testsPassed, testsTotal,
    tasksDone, tasksTotal,
    baseline: { commit, branch, startedAt } | null,
    submission: { branch, commit, pushed, at, message } | null,
    workspace: { id, name } | null,
  },
  sections: Section[],
}

Section = { id, title, summary, blocks: Block[] }

Block =
  | { type: 'fields', title?, fields: [{ label, value, tone? }] }
  | { type: 'text',   title?, text }
  | { type: 'list',   title?, items: [{ text, tone?, meta? }] }
  | { type: 'table', title?, columns: [{ key, label, align? }],
      // 行可选带 tones（非列）：{ [key]: 'ok'|'danger'|'warn'|'info'|'neutral' }
      // 渲染层据此把状态单元格画成家族 Tag；Markdown 忽略
      rows: [Record<string, string|number> & { tones?: Record<string, string> }] }
  | { type: 'code',   title?, language?, text }
  | { type: 'tags',   title?, items: [{ label, tone? }] }
```

约定：

- 所有 `value` / `text` / `item.text` 都是**已格式化好的纯文本**，渲染层只做转义，不再二次解释；
- `tone` 取值 `ok | danger | warn | info | neutral`，只作颜色提示；
- 空数据也要保留 section/block，渲染层统一显示「未填写 / 未运行」，不要省略到什么都看不到；
- `sections` 顺序固定：`goal` 目标背景、`scope` 改动范围、`test` 测试报告、`plan` 计划与进度、
  `timeline` 过程记录、`evidence` 证据与边界；
- 结论推导：阻塞 → 阻塞；失败测试/失败验收/推送失败 → 未通过；阶段 `done` → 通过；否则未完成。

## 5. 渲染层（`src/core/report-render.mjs`）

- `renderReportMarkdown(report)`：GFM Markdown，固定 `## 1. 目标背景` …；字段用 `- **label**：value`，
  表格转义 `|` 与换行；空列表写 `_未填写_`；
- `renderReportHtml(report)`：完整 HTML 文档（`<!doctype html>`、`lang="zh-CN"`、内联 `<style>`），
  顶部标题/流程 id/状态/阶段/结论/生成时间，按 section + block 渲染；长文件表与测试输出放在表格/`<pre>`；
- 所有用户文本做 HTML 转义（`& < > " '`），Markdown 表格单元格转义 `|`；
- 打印友好（`@media print` 隐藏工具栏、避免卡片跨页），不引用外部资源。

## 5.1 视觉规范（prototype-ui-designer / Gitee 家族）

报告是"给用户看的页面"，不是调试输出，视觉必须按 `prototype-ui-designer` skill（SCA/SCM 现行规范）：

- **token**：品牌紫 `#6049e7`（链接同色）；正文四级灰阶 `#1e2a3d / #4d545e / #5a5b70 / #848c9f`；
  成功 `#00875a`、危险 `#de350d`、警告 `#ca8a04`、信息 `#0c62ff`；底色 `#f9fafd`、白卡；
  圆角 12 容器 / 8 控件 / 6 SM / 4 标签 / 999 胶囊；
- **质感**：白卡 + 双层柔影 `0 0 2px rgba(9,25,64,.1), 0 2px 6px -2px rgba(9,25,64,.25)`，
  统计卡淡彩渐变底 + 36px 圆角图标座；分节标题用 28px 圆角数字徽标；
- **排版**：间距只用 8/12/16/24，行高 1.8，全局 `tnum`；数字右对齐、标签定宽，层次靠字重/灰阶/字号，
  不靠颜色堆叠；全页高饱和只留品牌紫与语义状态；
- **表格**：表头 `#eaedf1` + `#848c9f` 12px/500；单元格 13px、行 hover `#f5f5f8`；
  状态列用 radius4 / 12px/500 / 文字语义色 + 8% 淡底的 Tag；
- **页头**：PageContainer 式标题 + 右侧操作/Tag + 生成时间；帮助说明用浅灰 Alert，不用整段彩色；
- **打印**：`@media print` 隐藏帮助与粘性栏，卡片避免跨页，表头重复，保留底色。

## 6. 前端

- 流程详情新增「报告」页签（`ItemEditor`）：进入即 `GET API.report`，按 section/block 只读渲染；
  工具栏：刷新、打开完整报告（`format=html` 新标签）、保存到本机（POST save）、复制 Markdown；
- 流程详情顶栏常驻「预览报告」：任何时候都可打开弹窗预览，弹窗内直接保存到本机（不要求先跑测试/提交）；
- 顶栏只保留主操作（从左到右、同高 32）：继续推进 / 预览报告 / ⋯ 更多；「生成上下文」收进「⋯ 更多」，
  不再提供单独的「记录 baseline」按钮（baseline 由开启开发会话自动记录）；
- 流程列表每行提供「报告」快捷入口（不打开详情也能直接看）：点击在站内弹窗预览，不依赖 `window.open`（桌面壳/弹窗拦截也能看）；弹窗内可保存到本机/打开完整报告/复制 Markdown；
- 报告未完成时顶部提示「流程还没完成，报告随台账更新」，不做成假成功；
- 视觉沿用 `common.mjs` 的 `T` / `Tag` / `Button` / `styles`，不新增依赖。

## 7. 验收

- `test/report.test.mjs`：模型分段/结论/空数据/虚拟库/非 git 仓库；
- `test/report-render.test.mjs`：Markdown/HTML 结构、转义、空数据、打印友好；
- `test/report-host.test.mjs`：路由 JSON/HTML/Markdown/save、404/400、HTML 转义；
- `test/client.test.mjs`：报告页签接线、列表入口、SSR 冒烟；
- `npm run build` 通过；`npm test` 全绿；README 更新接口与使用说明。
