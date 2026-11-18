/**
 * 开发报告渲染层（纯函数）。
 *
 * 把 buildReport 产出的结构化 Report 渲染成：
 * - GFM Markdown（复制、保存 .md、接口 format=markdown）；
 * - 可独立打开的完整 HTML 文档（接口 format=html、保存 .html）。
 *
 * HTML 视觉按 Gitee 家族（SCA/SCM 现行规范）中后台样式生成：
 * 品牌紫 #6049e7、四级灰阶、#f9fafd 底 + 白卡、双层柔影、圆角梯度、
 * 四张渐变统计卡 + 圆角图标座、PageContainer 式页头、StatusBadge 语义 Tag。
 *
 * 约束：不读写文件、不联网、不调用模型、不引入外部 CSS/JS/字体/图片；
 * 所有用户文本只做转义，不再二次解释。渲染层容忍 report 缺字段
 * （sections 不存在、blocks 为空、字段值 undefined），统一降级为
 * 「未填写 / 未运行」，不抛异常。
 */

const VERDICT_LABELS = {
  passed: '通过',
  failed: '未通过',
  incomplete: '未完成',
  blocked: '阻塞',
}

const VERDICT_TONES = {
  passed: 'ok',
  failed: 'danger',
  incomplete: 'warn',
  blocked: 'blocked',
}

/** 表格行 / block 允许的语义色（row.tones 只会认这五种） */
const TONES = new Set(['ok', 'danger', 'warn', 'info', 'neutral'])
/** 内部可安全落到 class 的色名（多 brand/blocked 两档给页头 Tag） */
const TAG_TONES = new Set(['ok', 'danger', 'warn', 'blocked', 'info', 'neutral', 'brand'])
const ALIGNS = new Set(['left', 'right', 'center'])

const MONO_FONT = `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`
const ICON_MARKUP = {
  file: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M10 13h5"/><path d="M10 17h5"/></svg>`,
  diff: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v8"/><path d="M8 8h8"/><path d="M8 17h8"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>`,
  task: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="m4 6 1.5 1.5L7.5 5"/><path d="m4 12 1.5 1.5L7.5 11"/><path d="m4 18 1.5 1.5L7.5 17"/></svg>`,
  info: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>`,
}

function text(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return String(value)
}

function display(value, fallback = '未填写') {
  const raw = text(value)
  return raw.trim() ? raw : fallback
}

function escapeHtml(value) {
  return text(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

function toneOf(value) {
  return TONES.has(value) ? value : 'neutral'
}

function tagTone(value) {
  return TAG_TONES.has(value) ? value : 'neutral'
}

function alignAttr(align) {
  return ALIGNS.has(align) ? ` style="text-align:${align}"` : ''
}

function tagHtml(label, tone) {
  return `<span class="tag tag-${tagTone(tone)}">${escapeHtml(label)}</span>`
}

function verdictLabel(report) {
  return display(report.verdictLabel || VERDICT_LABELS[report.verdict], '未填写')
}

function verdictTone(report) {
  if (report.verdictLabel === '阻塞' || report.verdict === 'blocked') return 'blocked'
  return VERDICT_TONES[report.verdict] ?? 'neutral'
}

function numberText(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? String(num) : null
}

function metricText(done, total) {
  const left = numberText(done)
  const right = numberText(total)
  if (left === null && right === null) return '未填写'
  return `${left ?? '—'} / ${right ?? '—'}`
}

function normalizeReport(report) {
  return report && typeof report === 'object' ? report : {}
}

function normalizeSections(report) {
  return Array.isArray(report.sections) ? report.sections.filter((section) => section && typeof section === 'object') : []
}

function normalizeBlocks(section) {
  return Array.isArray(section.blocks) ? section.blocks.filter((block) => block && typeof block === 'object') : []
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function generatedAtText(report) {
  // 契约补充：generatedAtLabel 优先于 generatedAt。
  return display(report.generatedAtLabel || report.generatedAt)
}

/* ---------------------------------- Markdown --------------------------------- */

function mdCell(value) {
  return text(value)
    .replace(/\r\n|\r|\n/g, '<br>')
    .replace(/\|/g, '\\|')
}

function mdInlineCode(value) {
  const raw = display(value, '')
  if (!raw) return ''
  const fence = raw.includes('`') ? '``' : '`'
  const pad = raw.startsWith('`') || raw.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${raw}${pad}${fence}`
}

function mdFence(code) {
  const runs = text(code).match(/`{3,}/g) ?? []
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 2)
  return '`'.repeat(longest + 1)
}

function renderFieldsMarkdown(block) {
  const fields = normalizeArray(block.fields)
  if (!fields.length) return ['_未填写_']
  return fields.map((field) => `- **${display(field.label)}**：${display(field.value)}`)
}

function renderListMarkdown(block) {
  const items = normalizeArray(block.items)
  if (!items.length) return ['_未填写_']
  return items.map((item) => {
    const meta = text(item.meta).trim()
    return `- ${display(item.text, '')}${meta ? `（${meta}）` : ''}`
  })
}

function renderTextMarkdown(block) {
  const body = text(block.text)
  return body.trim() ? [body] : ['_未填写_']
}

function renderTableMarkdown(block) {
  const columns = normalizeArray(block.columns)
  const rows = normalizeArray(block.rows)
  if (!columns.length && !rows.length) return ['_未填写_']
  const effectiveColumns = columns.length
    ? columns
    : Object.keys(rows[0])
        .filter((key) => key !== 'tones')
        .map((key) => ({ key, label: key }))
  const header = `| ${effectiveColumns.map((column) => mdCell(display(column.label, column.key))).join(' | ')} |`
  const divider = `| ${effectiveColumns
    .map((column) => (column.align === 'right' ? '---:' : column.align === 'center' ? ':---:' : '---'))
    .join(' | ')} |`
  if (!rows.length) return [header, divider, '| _未填写_ |']
  const body = rows.map((row) => {
    const cells = effectiveColumns.map((column) => mdCell(row[column.key]))
    return `| ${cells.join(' | ')} |`
  })
  return [header, divider, ...body]
}

function renderCodeMarkdown(block) {
  const code = text(block.code ?? block.text)
  if (!code.trim()) return ['_未填写_']
  const fence = mdFence(code)
  const language = text(block.language).trim()
  return [`${fence}${language}`, code, fence]
}

function renderTagsMarkdown(block) {
  const items = normalizeArray(block.items)
  if (!items.length) return ['_未填写_']
  return [items.map((item) => mdInlineCode(display(item.label, ''))).join(' ')]
}

function renderBlockMarkdown(block) {
  const lines = []
  const title = text(block.title).trim()
  if (title) lines.push(`### ${title}`, '')
  switch (block.type) {
    case 'fields':
      lines.push(...renderFieldsMarkdown(block))
      break
    case 'list':
      lines.push(...renderListMarkdown(block))
      break
    case 'text':
      lines.push(...renderTextMarkdown(block))
      break
    case 'table':
      lines.push(...renderTableMarkdown(block))
      break
    case 'code':
      lines.push(...renderCodeMarkdown(block))
      break
    case 'tags':
      lines.push(...renderTagsMarkdown(block))
      break
    default:
      // 未知 block 不抛错：有文本就按文本渲染，否则显示未填写。
      if (text(block.text).trim()) lines.push(...renderTextMarkdown(block))
      else lines.push('_未填写_')
      break
  }
  return lines
}

/**
 * @param {object} report buildReport 的返回值
 * @returns {string} GFM Markdown
 */
export function renderReportMarkdown(report) {
  const data = normalizeReport(report)
  const sections = normalizeSections(data)
  const title = display(data.title, '未命名流程')

  const intent = intentLabel(data.intent)
  const meta = [
    `流程 id：${mdInlineCode(display(data.itemId, '')) || '_未填写_'}`,
    `状态：${display(data.statusLabel || data.status)}`,
    `阶段：${display(data.stageLabel || data.stage)}`,
    ...(intent ? [`流程类型：${intent}`] : []),
    `结论：${verdictLabel(data)}`,
    `生成时间：${generatedAtText(data)}`,
  ]

  const lines = [`# ${title} · 开发报告`, '', meta.join(' · '), '']

  if (!sections.length) {
    lines.push('_未填写_', '')
    return lines.join('\n').trimEnd() + '\n'
  }

  sections.forEach((section, index) => {
    lines.push(`## ${index + 1}. ${display(section.title || section.id)}`, '')
    const summary = text(section.summary).trim()
    if (summary) lines.push(summary, '')
    const blocks = normalizeBlocks(section)
    if (!blocks.length) {
      lines.push('_未填写_', '')
      return
    }
    for (const block of blocks) {
      lines.push(...renderBlockMarkdown(block), '')
    }
  })

  return lines.join('\n').trimEnd() + '\n'
}

/* ---------------------------------- HTML: style ---------------------------------- */

const STYLE = `:root {
  --brand: #6049e7;
  --brand-hover: #7d68ea;
  --brand-active: #4a35c4;
  --text-1: #1e2a3d;
  --text-2: #4d545e;
  --text-3: #5a5b70;
  --text-4: #848c9f;
  --success: #00875a;
  --danger: #de350d;
  --warning: #ca8a04;
  --warning-deep: #b65c00;
  --info: #0c62ff;
  --bg: #f9fafd;
  --card: #ffffff;
  --border: #e9eaec;
  --border-2: #ecedf0;
  --shadow: 0 0 2px rgba(9,25,64,.1), 0 2px 6px -2px rgba(9,25,64,.25);
  --radius-lg: 12px;
  --radius: 8px;
  --radius-sm: 6px;
  --radius-tag: 4px;
  --radius-pill: 999px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  background: #f9fafd;
  color: var(--text-1);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.8;
  font-feature-settings: "tnum";
  -webkit-font-smoothing: antialiased;
}
a { color: #6049e7; text-decoration: none; }
a:hover { color: #7d68ea; }
code, pre, .mono, .num { font-family: ${MONO_FONT}; }
.mono, .num, .stat-value { font-variant-numeric: tabular-nums; }
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 24px;
  background: rgba(249,250,253,.94);
  border-bottom: 1px solid var(--border-2);
}
.brand-mark {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  background: linear-gradient(135deg, var(--brand), var(--brand-hover));
}
.brand-name { font-size: 14px; font-weight: 600; color: var(--text-1); }
.pill {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--brand);
  background: rgba(96,73,231,.08);
}
.topbar-spacer { flex: 1; }
.topbar-hint { font-size: 12px; color: var(--text-4); }
.page { max-width: 1120px; margin: 0 auto; padding: 24px; }
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 16px;
}
.page-head-main { min-width: 0; }
.page-title-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.page-title-row h1 { font-size: 20px; font-weight: 600; line-height: 1.5; color: var(--text-1); }
.title-suffix { font-size: 13px; font-weight: 400; color: var(--text-4); }
.page-sub { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 8px; font-size: 13px; color: var(--text-4); }
.page-sub code { font-size: 12px; color: var(--text-3); background: var(--bg); border: 1px solid var(--border-2); border-radius: 4px; padding: 0 8px; }
.page-head-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex: 0 0 auto; }
.head-tags { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.tag-group { display: inline-flex; align-items: center; gap: 8px; }
.tag-key { font-size: 12px; color: var(--text-4); }
.head-time { font-size: 12px; color: var(--text-4); white-space: nowrap; }
.head-reason { max-width: 360px; font-size: 13px; line-height: 1.8; color: var(--text-4); text-align: right; }
.help-alert {
  margin-bottom: 16px;
  background: #f9fafd;
  border: 1px solid #ecedf0;
  border-radius: 8px;
}
.help-alert summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  list-style: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
}
.help-alert summary::-webkit-details-marker { display: none; }
.help-alert summary:focus-visible { outline: 2px solid rgba(96,73,231,.4); outline-offset: 2px; }
.help-icon { display: inline-flex; color: var(--brand); }
.help-toggle { margin-left: auto; font-size: 12px; font-weight: 400; color: var(--text-4); }
.help-toggle::before { content: "展开"; }
.help-alert[open] .help-toggle::before { content: "收起"; }
.help-body { padding: 12px 16px; border-top: 1px solid #ecedf0; font-size: 13px; line-height: 1.8; color: var(--text-2); }
.help-body strong { font-weight: 600; color: var(--text-1); }
.stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
.stat-card {
  border: 1px solid #ffffff;
  border-radius: 12px;
  box-shadow: 0 0 2px rgba(9,25,64,.1), 0 2px 6px -2px rgba(9,25,64,.25);
  padding: 16px;
}
.stat-violet { background: linear-gradient(135deg, #f0edff 0%, #ffffff 100%); }
.stat-blue { background: linear-gradient(135deg, #e6edff 0%, #ffffff 100%); }
.stat-green { background: linear-gradient(135deg, #e2ffee 0%, #ffffff 100%); }
.stat-amber { background: linear-gradient(135deg, #fff8e6 0%, #ffffff 100%); }
.stat-body { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.stat-copy { min-width: 0; }
.stat-label { font-size: 12px; line-height: 1.8; color: var(--text-4); }
.stat-value { display: block; margin-top: 8px; font-size: 26px; font-weight: 700; line-height: 1.2; font-variant-numeric: tabular-nums; }
.stat-violet .stat-value { color: var(--brand); }
.stat-blue .stat-value { color: var(--info); }
.stat-green .stat-value { color: var(--success); }
.stat-amber .stat-value { color: var(--warning); }
.stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.stat-violet .stat-icon { color: var(--brand); background: rgba(96,73,231,.08); }
.stat-blue .stat-icon { color: var(--info); background: rgba(12,98,255,.08); }
.stat-green .stat-icon { color: var(--success); background: rgba(0,135,90,.08); }
.stat-amber .stat-icon { color: var(--warning); background: rgba(202,138,4,.08); }
.report-sections { display: flex; flex-direction: column; gap: 16px; }
.card {
  background: #ffffff;
  border: 1px solid #ffffff;
  border-radius: 12px;
  box-shadow: 0 0 2px rgba(9,25,64,.1), 0 2px 6px -2px rgba(9,25,64,.25);
  padding: 16px 24px;
}
.card-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
.section-index {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(96,73,231,.08);
  color: var(--brand);
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.card-heading { min-width: 0; }
.card-heading h2 { font-size: 16px; font-weight: 600; line-height: 1.5; color: var(--text-1); }
.section-summary { margin-top: 8px; font-size: 13px; line-height: 1.8; color: var(--text-4); }
.block-title { margin: 16px 0 8px; font-size: 13px; font-weight: 600; line-height: 1.8; color: var(--text-1); }
.fields { list-style: none; }
.field { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border-2); font-size: 13px; line-height: 1.8; }
.field:last-child { border-bottom: none; }
.field-label { flex: 0 0 120px; color: var(--text-4); }
.field-value { flex: 1 1 auto; min-width: 0; color: var(--text-1); overflow-wrap: anywhere; }
.field-value.tone-ok { color: var(--success); }
.field-value.tone-danger { color: var(--danger); }
.field-value.tone-warn { color: var(--warning); }
.field-value.tone-info { color: var(--info); }
.field-value.tone-neutral { color: var(--text-2); }
.bullet-list { list-style: none; }
.bullet-list li { display: flex; align-items: flex-start; gap: 8px; padding: 8px 0; font-size: 13px; line-height: 1.8; color: var(--text-2); }
.bullet-dot { width: 6px; height: 6px; flex: 0 0 auto; margin-top: .75em; border-radius: 999px; background: var(--text-4); }
.bullet-dot.tone-ok { background: var(--success); }
.bullet-dot.tone-danger { background: var(--danger); }
.bullet-dot.tone-warn { background: var(--warning); }
.bullet-dot.tone-info { background: var(--info); }
.bullet-dot.tone-neutral { background: var(--text-4); }
.item-text { min-width: 0; overflow-wrap: anywhere; }
.item-meta { margin-left: 8px; font-size: 12px; color: var(--text-4); }
.block-text { font-size: 13px; line-height: 1.8; color: var(--text-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.empty { font-size: 13px; line-height: 1.8; color: var(--text-4); font-style: normal; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; }
.tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
}
.tag-ok { color: var(--success); background: #e2ffee; }
.tag-danger { color: var(--danger); background: #ffebe5; }
.tag-warn { color: var(--warning); background: #fff8e6; }
.tag-blocked { color: var(--warning-deep); background: #fff7e6; }
.tag-info { color: var(--info); background: #eaf1ff; }
.tag-neutral { color: var(--text-4); background: #f4f4f5; }
.tag-brand { color: var(--brand); background: #f0edff; }
.table-wrap { overflow-x: auto; margin: 8px 0; border: 1px solid #e9eaec; border-radius: 8px; }
table { width: 100%; border-collapse: collapse; min-width: 480px; font-size: 13px; line-height: 1.8; }
thead { background: #eaedf1; }
th {
  padding: 12px;
  background: #eaedf1;
  border-bottom: 1px solid #e9eaec;
  color: var(--text-4);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}
td { padding: 12px; border-bottom: 1px solid #e9eaec; color: var(--text-2); vertical-align: top; overflow-wrap: anywhere; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: #f5f5f8; }
th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
th.center, td.center { text-align: center; }
td .tag { margin: 0; }
pre.code {
  margin: 8px 0;
  padding: 12px 16px;
  max-height: 360px;
  overflow: auto;
  background: #f9fafd;
  border: 1px solid #ecedf0;
  border-radius: 8px;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre;
}
.empty-card { padding: 24px; }
@media (max-width: 900px) {
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .page-head { flex-direction: column; }
  .page-head-side { align-items: flex-start; }
  .head-tags { justify-content: flex-start; }
  .head-reason { text-align: left; }
}
@media (max-width: 560px) {
  .page { padding: 16px; }
  .stats-grid { grid-template-columns: minmax(0, 1fr); }
  .card { padding: 16px; }
}
@media print {
  @page { margin: 12mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { background: #fff !important; }
  .topbar, .help-alert { display: none !important; }
  .page { max-width: none; margin: 0; padding: 0; }
  .page-head, .stat-card, .card {
    box-shadow: none;
    border: 1px solid var(--border);
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .card-head, .block-title, h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
  .table-wrap, pre.code { overflow: visible; max-height: none; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}`

/* ---------------------------------- HTML: blocks --------------------------------- */

function emptyHtml(label = '未填写') {
  return `<p class="empty">${escapeHtml(label)}</p>`
}

function renderFieldsHtml(block) {
  const fields = normalizeArray(block.fields)
  if (!fields.length) return emptyHtml()
  const items = fields.map((field) => {
    const tone = TONES.has(field.tone) ? ` tone-${field.tone}` : ''
    return `<li class="field"><span class="field-label">${escapeHtml(display(field.label))}</span><span class="field-value${tone}">${escapeHtml(
      display(field.value),
    )}</span></li>`
  })
  return `<ul class="fields">${items.join('')}</ul>`
}

function renderListHtml(block) {
  const items = normalizeArray(block.items)
  if (!items.length) return emptyHtml()
  return `<ul class="bullet-list">${items
    .map((item) => {
      const tone = toneOf(item.tone)
      const meta = text(item.meta).trim()
      return `<li><span class="bullet-dot tone-${tone}"></span><span class="item-text">${escapeHtml(
        display(item.text, ''),
      )}</span>${meta ? `<span class="item-meta">${escapeHtml(meta)}</span>` : ''}</li>`
    })
    .join('')}</ul>`
}

function renderTextHtml(block) {
  const body = text(block.text)
  return body.trim() ? `<p class="block-text">${escapeHtml(body)}</p>` : emptyHtml()
}

function isNumericColumn(column, rows) {
  if (column.align === 'right') return true
  if (column.align === 'left' || column.align === 'center') return false
  if (!rows.length) return false
  return rows.every((row) => numberText(row[column.key]) !== null)
}

function cellAlignClass(column, rows) {
  if (isNumericColumn(column, rows)) return ' class="num"'
  if (column.align === 'center') return ' class="center"'
  return ''
}

function renderTableHtml(block) {
  const columns = normalizeArray(block.columns)
  const rows = normalizeArray(block.rows)
  if (!columns.length && !rows.length) return emptyHtml()
  const effectiveColumns = columns.length
    ? columns
    : Object.keys(rows[0])
        .filter((key) => key !== 'tones')
        .map((key) => ({ key, label: key }))
  if (!effectiveColumns.length) return emptyHtml()

  const head = effectiveColumns
    .map(
      (column) =>
        `<th${cellAlignClass(column, rows)}>${escapeHtml(display(column.label, column.key))}</th>`,
    )
    .join('')

  const body = rows
    .map((row) => {
      const tones = row.tones && typeof row.tones === 'object' && !Array.isArray(row.tones) ? row.tones : {}
      const cells = effectiveColumns
        .map((column) => {
          const rawValue = row[column.key]
          const tone = tones[column.key]
          const align = cellAlignClass(column, rows)
          if (TONES.has(tone)) {
            const label = text(rawValue).trim() ? text(rawValue) : '未填写'
            const tag = label === '未填写' ? `<span class="empty">未填写</span>` : tagHtml(label, tone)
            return `<td${align}>${tag}</td>`
          }
          const raw = text(rawValue)
          const cell = raw.trim() ? escapeHtml(raw) : '<span class="empty">未填写</span>'
          return `<td${align}>${cell}</td>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  const tbody = body || `<tr><td colspan="${effectiveColumns.length}"><span class="empty">未填写</span></td></tr>`
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${tbody}</tbody></table></div>`
}

function renderCodeHtml(block) {
  const code = text(block.code ?? block.text)
  return code.trim() ? `<pre class="code"><code>${escapeHtml(code)}</code></pre>` : emptyHtml('未运行')
}

function renderTagsHtml(block) {
  const items = normalizeArray(block.items)
  if (!items.length) return emptyHtml()
  return `<div class="tags">${items
    .map((item) => tagHtml(display(item.label, ''), toneOf(item.tone)))
    .join('')}</div>`
}

function renderBlockHtml(block) {
  const title = text(block.title).trim()
  const heading = title ? `<h3 class="block-title">${escapeHtml(title)}</h3>` : ''
  switch (block.type) {
    case 'fields':
      return heading + renderFieldsHtml(block)
    case 'list':
      return heading + renderListHtml(block)
    case 'text':
      return heading + renderTextHtml(block)
    case 'table':
      return heading + renderTableHtml(block)
    case 'code':
      return heading + renderCodeHtml(block)
    case 'tags':
      return heading + renderTagsHtml(block)
    default:
      return heading + (text(block.text).trim() ? renderTextHtml(block) : emptyHtml())
  }
}

function renderSectionHtml(section, index) {
  const blocks = normalizeBlocks(section)
  const summary = text(section.summary).trim()
  const body = blocks.length ? blocks.map((block) => renderBlockHtml(block)).join('') : emptyHtml()
  return `<section class="card" id="section-${index + 1}">
<header class="card-head">
<span class="section-index">${index + 1}</span>
<div class="card-heading">
<h2>${escapeHtml(display(section.title || section.id))}</h2>
${summary ? `<p class="section-summary">${escapeHtml(summary)}</p>` : ''}
</div>
</header>
${body}
</section>`
}

/* ---------------------------------- HTML: page ---------------------------------- */

function intentLabel(intent) {
  if (intent === 'feature') return '功能需求'
  if (intent === 'bug') return '缺陷修复'
  if (intent === 'refactor') return '代码重构'
  if (intent === 'analysis') return '只读分析'
  return ''
}

function flowTone(raw) {
  const value = text(raw).toLowerCase()
  if (!value) return 'neutral'
  if (/(block|fail|reject|error|阻塞|失败|驳回|异常)/.test(value)) return 'danger'
  if (/(done|complete|success|passed|submit|完成|通过|已提交)/.test(value)) return 'ok'
  if (/(pending|wait|warn|待|告警)/.test(value)) return 'warn'
  if (/(verif|test|review|验证|测试|评审)/.test(value)) return 'info'
  if (/(develop|execut|running|开发|执行|进行)/.test(value)) return 'brand'
  if (/(plan|design|discovery|techdoc|计划|设计|调研|方案)/.test(value)) return 'neutral'
  return 'info'
}

function statCard({ modifier, label, value, icon }) {
  return `<article class="stat-card ${modifier}">
<div class="stat-body">
<div class="stat-copy">
<div class="stat-label">${escapeHtml(label)}</div>
<span class="stat-value">${escapeHtml(value)}</span>
</div>
<span class="stat-icon">${icon}</span>
</div>
</article>`
}

function renderStatsHtml(summary, { analysis = false } = {}) {
  const changed = numberText(summary.changedFiles) ?? '未填写'
  const added = numberText(summary.added)
  const removed = numberText(summary.removed)
  const diff = added === null && removed === null ? '未填写' : `+${added ?? '—'} / -${removed ?? '—'}`
  const tests = metricText(summary.testsPassed, summary.testsTotal)
  const tasks = metricText(summary.tasksDone, summary.tasksTotal)
  // 分析流程的产出是结论：不把变更文件/增删行放在统计位，避免读成一次代码提交
  const headStats = analysis
    ? `${statCard({ modifier: 'stat-violet', label: '分析产出', value: '结论', icon: ICON_MARKUP.file })}
${statCard({ modifier: 'stat-blue', label: '代码改动', value: '无', icon: ICON_MARKUP.diff })}`
    : `${statCard({ modifier: 'stat-violet', label: '变更文件', value: changed, icon: ICON_MARKUP.file })}
${statCard({ modifier: 'stat-blue', label: '增删行', value: diff, icon: ICON_MARKUP.diff })}`
  return `<section class="stats-grid" aria-label="报告统计">
${headStats}
${statCard({ modifier: 'stat-green', label: '测试通过', value: tests, icon: ICON_MARKUP.check })}
${statCard({ modifier: 'stat-amber', label: '任务完成', value: tasks, icon: ICON_MARKUP.task })}
</section>`
}

function renderHelpHtml() {
  return `<details class="help-alert" open>
<summary>
<span class="help-icon">${ICON_MARKUP.info}</span>
<span>报告说明</span>
<span class="help-toggle"></span>
</summary>
<div class="help-body">
<p><strong>本报告是只读视图。</strong>数据来自开发台账与本机 git 事实；证据不完整时会显式标注，不伪造 baseline diff。</p>
<p>展开查看目标背景、分析结论/改动范围、测试报告、计划进度与证据边界；报告随台账更新，不会自动提交文件。</p>
</div>
</details>`
}

/**
 * @param {object} report buildReport 的返回值
 * @returns {string} 完整独立 HTML 文档（内联样式，无外部资源）
 */
export function renderReportHtml(report) {
  const data = normalizeReport(report)
  const sections = normalizeSections(data)
  const summary = data.summary && typeof data.summary === 'object' ? data.summary : {}
  const title = display(data.title, '未命名流程')
  const status = display(data.statusLabel || data.status)
  const stage = display(data.stageLabel || data.stage)
  const generatedAt = generatedAtText(data)
  const intent = intentLabel(data.intent)
  const verdictReason = text(data.verdictReason).trim()

  const subItems = [`流程 id <code>${escapeHtml(display(data.itemId))}</code>`]
  if (intent) subItems.push(escapeHtml(intent))
  subItems.push(`${sections.length} 个章节`)

  const headTags = [
    `<span class="tag-group"><span class="tag-key">状态</span>${tagHtml(status, flowTone(data.status || data.statusLabel))}</span>`,
    `<span class="tag-group"><span class="tag-key">阶段</span>${tagHtml(stage, flowTone(data.stage || data.stageLabel))}</span>`,
    `<span class="tag-group"><span class="tag-key">结论</span>${tagHtml(verdictLabel(data), verdictTone(data))}</span>`,
  ].join('')

  const body = sections.length
    ? sections.map((section, index) => renderSectionHtml(section, index)).join('\n')
    : `<section class="card empty-card">${emptyHtml()}</section>`

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · 开发报告</title>
<style>${STYLE}</style>
</head>
<body>
<header class="topbar">
<span class="brand-mark">报</span>
<span class="brand-name">开发报告</span>
<span class="pill">只读视图</span>
<span class="topbar-spacer"></span>
<span class="topbar-hint">数据来自开发台账与本机 git 事实</span>
</header>
<main class="page">
<header class="page-head">
<div class="page-head-main">
<div class="page-title-row">
<h1>${escapeHtml(title)}</h1>
<span class="title-suffix">— 开发报告</span>
</div>
<div class="page-sub">${subItems.map((item) => `<span>${item}</span>`).join('')}</div>
</div>
<div class="page-head-side">
<div class="head-tags">${headTags}</div>
${verdictReason ? `<div class="head-reason">${escapeHtml(verdictReason)}</div>` : ''}
<div class="head-time">生成时间 ${escapeHtml(generatedAt)}</div>
</div>
</header>
${renderHelpHtml()}
${renderStatsHtml(summary, { analysis: data.intent === 'analysis' })}
<div class="report-sections">
${body}
</div>
</main>
</body>
</html>
`
}
