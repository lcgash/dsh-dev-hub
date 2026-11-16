/**
 * dsh-dev-hub 浏览器半 —— 「开发报告」只读视图。
 *
 * 契约来自 docs/design/dev-report-2026-11.md 第 3、4、6 节；视觉按
 * prototype-ui-designer / Gitee 家族中后台规范：
 * - 品牌紫 #6049e7、四级灰阶、#f9fafd 底 + 白卡 + 双层柔影；
 * - 圆角 12 容器 / 8 控件 / 6 SM / 4 标签 / 999 胶囊，间距只用 8/12/16/24；
 * - 数字右对齐 + tnum，统计卡淡彩渐变底 + 圆角图标座，分节标题数字徽标；
 * - 状态用 radius4 的家族 Tag（文字语义色 + 8% 淡底），层次靠字重/灰阶/字号。
 *
 * 组件分两层：ReportView 负责取数与工具栏（loading/error/data 三态），
 * ReportSections/ReportBlock 是纯渲染组件，方便 SSR 冒烟测试。
 */
import { useEffect, useRef, useState } from 'react'
import { h } from './i18n.mjs'
import { API } from '../shared/api.mjs'
import {
  Button,
  Spinner,
  Tag,
  T,
  api,
  errorText,
  fmtTime,
  statusText,
  styles,
} from './common.mjs'

const miniButton = { height: 28, padding: '0 10px', fontSize: T.font.sm, borderRadius: T.rSm }

/** 结论 → 视觉：只给语义色，不做满屏彩色。 */
const VERDICT_STYLE = {
  passed: { label: '通过', tone: 'ok', color: T.ok, background: T.okSoft, border: T.ok },
  failed: { label: '未通过', tone: 'danger', color: T.danger, background: T.dangerSoft, border: T.danger },
  incomplete: { label: '未完成', tone: 'warn', color: T.warnText, background: T.warnSoft, border: T.warn },
  blocked: { label: '阻塞', tone: 'warn', color: T.warnText, background: T.warnSoft, border: T.warn },
}

/** block 里的 tone 只影响文字颜色，不改变结构。 */
const TONE_COLOR = {
  ok: T.ok,
  danger: T.danger,
  warn: T.warnText,
  info: T.info,
  accent: T.brand,
  neutral: T.text2,
}

const TABLE_TONES = new Set(['ok', 'danger', 'warn', 'info', 'neutral', 'accent'])

function toneColor(tone) {
  return TONE_COLOR[tone] ?? T.text2
}

function textOf(value) {
  return String(value ?? '').trim()
}

/** 数值展示：缺省不编 0，给「—」；有值保持原始数字可对齐。 */
function numberText(value) {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  return Number.isFinite(num) ? String(num) : String(value)
}

function valueText(value) {
  const text = textOf(value)
  return text || '—'
}

/** 家族信息卡：浅灰底 + 细边，不用整段彩色。 */
function HintText({ children }) {
  return h('div', {
    style: {
      border: `1px solid ${T.borderSoft}`,
      borderRadius: T.rBase,
      background: T.bg,
      padding: '8px 12px',
      color: T.text2,
      fontSize: T.font.sm,
      lineHeight: T.line,
    },
  }, children)
}

function EmptyHint({ text = '未填写' }) {
  return h('div', { style: { ...styles.sectionHint, padding: '6px 0' } }, text)
}

/* ------------------------------------------------------------------- icons */

/** 只用内联 SVG，不引图标库、不发外部请求。 */
function Icon({ kind, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    style: { display: 'block' },
  }
  if (kind === 'file') {
    return h('svg', common,
      h('path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' }),
      h('path', { d: 'M14 3v5h5' }),
      h('path', { d: 'M9 13h6M9 17h4' }),
    )
  }
  if (kind === 'test') {
    return h('svg', common,
      h('circle', { cx: 12, cy: 12, r: 9 }),
      h('path', { d: 'm8.5 12.2 2.4 2.4 4.8-5' }),
    )
  }
  if (kind === 'tasks') {
    return h('svg', common,
      h('rect', { x: 4, y: 4, width: 16, height: 16, rx: 3 }),
      h('path', { d: 'm8 9 1.6 1.6L12 8.2M8 15l1.6 1.6L12 14.2M14 9.5h4M14 15.5h4' }),
    )
  }
  if (kind === 'verdict') {
    return h('svg', common,
      h('path', { d: 'M12 3 4.5 6v5.2c0 4.6 3 8.1 7.5 9.8 4.5-1.7 7.5-5.2 7.5-9.8V6z' }),
      h('path', { d: 'm8.6 12.1 2.4 2.4 4.6-5' }),
    )
  }
  return h('svg', common,
    h('circle', { cx: 12, cy: 12, r: 9 }),
    h('path', { d: 'M12 10.5V17M12 7.2v.2' }),
  )
}

/* ------------------------------------------------------------------ blocks */

/** fields：两列 label/value，细虚线分隔；长文本折行。 */
function FieldsBlock({ block }) {
  const fields = Array.isArray(block?.fields) ? block.fields : []
  if (!fields.length) return h(EmptyHint, null)
  return h('div', { style: { display: 'flex', flexDirection: 'column' } },
    fields.map((field, index) => h('div', {
      key: `${index}-${textOf(field?.label)}`,
      style: {
        display: 'grid',
        gridTemplateColumns: 'minmax(108px, 172px) minmax(0, 1fr)',
        columnGap: T.gap.md,
        alignItems: 'baseline',
        padding: '7px 0',
        borderBottom: index === fields.length - 1 ? 'none' : `1px dashed ${T.borderSoft}`,
      },
    },
      h('span', { style: { color: T.text4, fontSize: T.font.sm } }, textOf(field?.label) || '—'),
      h('span', {
        style: {
          color: toneColor(field?.tone),
          fontSize: T.font.base,
          lineHeight: T.line,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        },
      }, valueText(field?.value)),
    )))
}

/** text：保留换行的纯文本；报告模型里的文本已经格式化好，渲染层只转义。 */
function TextBlock({ block }) {
  const text = textOf(block?.text)
  if (!text) return h(EmptyHint, null)
  return h('div', {
    style: { color: T.text2, fontSize: T.font.base, lineHeight: T.line, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  }, text)
}

/** list：条目默认中性灰，语义色只给"危险/通过"这类有含义的条目。 */
function ListBlock({ block }) {
  const items = Array.isArray(block?.items) ? block.items : []
  if (!items.length) return h(EmptyHint, null)
  return h('ul', { style: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 } },
    items.map((item, index) => h('li', {
      key: index,
      style: { display: 'flex', alignItems: 'baseline', gap: 8, color: T.text2, fontSize: T.font.base, lineHeight: T.line },
    },
      h('span', {
        style: {
          width: 5,
          height: 5,
          flex: '0 0 5px',
          borderRadius: 999,
          background: toneColor(item?.tone ?? 'neutral') === T.text2 ? T.text4 : toneColor(item?.tone ?? 'neutral'),
          marginTop: 8,
        },
      }),
      h('span', { style: { minWidth: 0, wordBreak: 'break-word' } },
        valueText(item?.text),
        item?.meta ? h('span', { style: { ...styles.sectionHint, marginLeft: 8 } }, `· ${item.meta}`) : null,
      ),
    )))
}

/** 一行表格：hover 才给浅底，保持静态画面干净。 */
function TableRow({ columns, row }) {
  const [hovered, setHovered] = useState(false)
  const tones = row?.tones && typeof row.tones === 'object' ? row.tones : {}
  return h('tr', {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    style: { background: hovered ? '#f5f5f8' : '#fff', transition: 'background .15s ease' },
  }, columns.map((column) => {
    const key = String(column?.key ?? column?.label ?? '')
    const right = column?.align === 'right'
    const tone = TABLE_TONES.has(tones[key]) ? tones[key] : null
    const raw = row?.[key]
    const empty = raw === null || raw === undefined || String(raw).trim() === ''
    return h('td', {
      key,
      style: {
        padding: '10px 12px',
        textAlign: right ? 'right' : 'left',
        fontVariantNumeric: right ? 'tabular-nums' : 'normal',
        whiteSpace: right ? 'nowrap' : 'normal',
        wordBreak: 'break-word',
        borderTop: `1px solid ${T.borderSoft}`,
        color: empty ? T.text4 : T.text2,
        fontSize: T.font.base,
        lineHeight: 1.7,
      },
    }, empty
      ? '—'
      : (tone ? h(Tag, { tone }, valueText(raw)) : valueText(raw)))
  }))
}

/** table：表头 #eaedf1、行 hover #f5f5f8；数字右对齐 + tnum；状态列用家族 Tag。 */
function TableBlock({ block }) {
  const rows = Array.isArray(block?.rows) ? block.rows : []
  const declared = Array.isArray(block?.columns) ? block.columns : []
  const columns = declared.length
    ? declared
    : (rows[0] && typeof rows[0] === 'object'
      ? Object.keys(rows[0]).filter((key) => key !== 'tones').map((key) => ({ key, label: key }))
      : [])
  if (!columns.length) return h(EmptyHint, { text: '未填写' })
  return h('div', {
    style: {
      overflowX: 'auto',
      border: `1px solid ${T.borderSoft}`,
      borderRadius: T.rSm,
      background: T.surface,
    },
  },
    h('table', {
      style: { borderCollapse: 'collapse', width: '100%', fontSize: T.font.sm, lineHeight: 1.7 },
    },
      h('thead', null, h('tr', null, columns.map((column) => h('th', {
        key: String(column?.key ?? column?.label ?? ''),
        style: {
          padding: '10px 12px',
          textAlign: column?.align === 'right' ? 'right' : 'left',
          background: '#eaedf1',
          color: T.text4,
          fontWeight: 500,
          fontSize: T.font.sm,
          whiteSpace: 'nowrap',
          borderBottom: `1px solid ${T.border}`,
        },
      }, textOf(column?.label) || textOf(column?.key) || '—')))),
      h('tbody', null, rows.length
        ? rows.map((row, rowIndex) => h(TableRow, { key: rowIndex, columns, row }))
        : h('tr', null, h('td', {
          colSpan: Math.max(1, columns.length),
          style: { padding: '14px 12px', ...styles.sectionHint },
        }, '未填写'))),
    ),
  )
}

/** code：亮色等宽块，最大高度内滚动，不把整页撑爆。 */
function CodeBlock({ block }) {
  const text = String(block?.text ?? '')
  if (!text.trim()) return h(EmptyHint, null)
  return h('pre', {
    style: {
      ...styles.pre,
      margin: 0,
      maxHeight: 360,
      background: T.bg,
      border: `1px solid ${T.borderSoft}`,
      borderRadius: T.rBase,
      fontSize: 12,
      lineHeight: 1.7,
      color: T.text2,
    },
  }, text)
}

/** tags：短标签，颜色跟随模型给的 tone。 */
function TagsBlock({ block }) {
  const items = Array.isArray(block?.items) ? block.items : []
  if (!items.length) return h(EmptyHint, null)
  return h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
    items.map((item, index) => h(Tag, {
      key: index,
      tone: item?.tone ?? 'neutral',
    }, textOf(item?.label) || textOf(item?.text) || '—')))
}

/** 单个 block：标题（可选）+ 对应渲染；未知类型显示一句提示，不白屏。 */
export function ReportBlock({ block }) {
  if (!block || typeof block !== 'object') return null
  const body = block.type === 'fields'
    ? h(FieldsBlock, { block })
    : block.type === 'text'
      ? h(TextBlock, { block })
      : block.type === 'list'
        ? h(ListBlock, { block })
        : block.type === 'table'
          ? h(TableBlock, { block })
          : block.type === 'code'
            ? h(CodeBlock, { block })
            : block.type === 'tags'
              ? h(TagsBlock, { block })
              : h(EmptyHint, { text: `未支持的报告块：${textOf(block.type) || '未知'}` })
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
    block.title ? h('div', { style: { color: T.text2, fontSize: T.font.sm, fontWeight: 600 } }, block.title) : null,
    body,
  )
}

/**
 * 纯渲染：固定分节的只读报告。
 * 测试直接 renderToStaticMarkup 这个组件即可覆盖六种 block 与转义。
 */
export function ReportSections({ sections }) {
  const list = Array.isArray(sections) ? sections : []
  if (!list.length) return h(HintText, null, '报告还没有分节内容。')
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
    list.map((section, index) => {
      const blocks = Array.isArray(section?.blocks) ? section.blocks : []
      return h('section', {
        key: section?.id ?? index,
        style: {
          ...styles.card,
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: T.gap.sm,
        },
      },
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            paddingBottom: 12,
            borderBottom: `1px solid ${T.borderSoft}`,
          },
        },
          h('span', {
            style: {
              width: 28,
              height: 28,
              flex: '0 0 28px',
              borderRadius: T.rBase,
              background: T.brandSoft,
              color: T.brand,
              fontSize: T.font.sm,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontVariantNumeric: 'tabular-nums',
            },
          }, index + 1),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
            h('h3', { style: { margin: 0, fontSize: T.font.lg, fontWeight: 600, color: T.text } }, section?.title ?? '未命名分节'),
            section?.summary ? h('span', { style: { fontSize: T.font.sm, color: T.text3, lineHeight: T.line } }, section.summary) : null,
          ),
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
          blocks.length
            ? blocks.map((block, blockIndex) => h(ReportBlock, { key: blockIndex, block }))
            : h(EmptyHint, null),
        ),
      )
    }),
  )
}

/* ------------------------------------------------------------- clipboard */

/** 剪贴板：优先 navigator.clipboard；非安全上下文退化到 execCommand，失败如实抛错。 */
async function writeClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }
  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    area.style.opacity = '0'
    document.body?.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body?.removeChild(area)
    return ok
  }
  return false
}

/* ------------------------------------------------------------------- view */

/** 统计卡：淡彩渐变底 + 圆角图标座 + 26px/700/tnum 数值（家族招牌）。 */
function StatCard({ label, value, hint, color, tint, icon }) {
  return h('div', {
    style: {
      flex: '1 1 180px',
      minWidth: 156,
      padding: '14px 18px',
      borderRadius: T.rLg,
      border: `1px solid ${T.borderSoft}`,
      background: `linear-gradient(135deg, ${tint} 0%, ${T.surface} 100%)`,
      boxShadow: T.shadowCard,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: T.gap.xs,
    },
  },
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
      h('span', { style: { fontSize: T.font.sm, color: T.text4 } }, label),
      h('span', {
        style: {
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.25,
          color,
          fontVariantNumeric: 'tabular-nums',
        },
      }, value),
      hint ? h('span', { style: { fontSize: T.font.xs, color: T.text4, lineHeight: 1.5 } }, hint) : null,
    ),
    h('span', {
      style: {
        width: 36,
        height: 36,
        flex: '0 0 36px',
        borderRadius: 9,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `${color}15`,
        color,
      },
    }, h(Icon, { kind: icon, size: 18 })),
  )
}

/** PageContainer 式页头：标题 + 副信息 + 状态 Tag + extra 操作位。 */
function ReportHeader({ report, itemId, loading, toolbar, onRefresh }) {
  const verdict = VERDICT_STYLE[report.verdict] ?? VERDICT_STYLE.incomplete
  return h('div', {
    style: {
      ...styles.card,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: T.gap.sm,
      flexWrap: 'wrap',
    },
  },
    h('span', {
      style: {
        width: 36,
        height: 36,
        flex: '0 0 36px',
        borderRadius: 9,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: T.brandSoft,
        color: T.brand,
      },
    }, h(Icon, { kind: 'file', size: 20 })),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 1 360px' } },
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
        h('h2', {
          style: { margin: 0, fontSize: T.font.lg, fontWeight: 600, color: T.text, lineHeight: 1.4, wordBreak: 'break-word' },
        }, textOf(report.title) || '开发报告'),
        h('span', { style: { color: T.text4, fontSize: T.font.sm } }, '— 开发报告'),
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
        h('span', { style: { ...styles.mono, color: T.text4 } }, report.itemId ?? itemId ?? '—'),
        h(Tag, { tone: verdict.tone }, report.verdictLabel ?? verdict.label),
        h(Tag, { tone: 'neutral' }, report.statusLabel ?? statusText(report.status)),
        h(Tag, { tone: 'neutral' }, report.stageLabel ?? report.stage ?? '阶段未知'),
        h('span', { style: styles.sectionHint }, `生成于 ${report.generatedAtLabel ?? fmtTime(report.generatedAt)}`),
      ),
      report.summary?.goal
        ? h('div', { style: { fontSize: T.font.sm, color: T.text3, lineHeight: T.line, marginTop: 2 } }, `目标：${report.summary.goal}`)
        : null,
    ),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap' } },
      h(Button, { style: miniButton, disabled: loading, onClick: onRefresh, children: loading ? '刷新中…' : '刷新' }),
      ...toolbar,
    ),
  )
}

/**
 * 流程详情的「报告」页签：进入即取数，工具栏支持刷新/打开完整报告/保存/复制 Markdown。
 * 只有这个组件挂载时才发报告请求，所以别的页签轮询不会顺带请求报告。
 */
export function ReportView({ itemId, onNotice, onError }) {
  const [data, setData] = useState(null) // { report, markdown }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saved, setSaved] = useState(null) // { dir, html, markdown }
  const [saveBusy, setSaveBusy] = useState(false)
  const [copyBusy, setCopyBusy] = useState(false)
  const [helpOpen, setHelpOpen] = useState(true)
  const requestSeq = useRef(0)
  const report = data?.report ?? null

  async function load() {
    if (!itemId) {
      setLoading(false)
      setError('缺少流程 id，无法生成报告')
      return
    }
    const seq = ++requestSeq.current
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const body = await api(`${API.report}?id=${encodeURIComponent(itemId)}`)
      if (seq !== requestSeq.current) return
      setData({ report: body.report ?? null, markdown: body.markdown ?? '' })
      setSaved(null)
    } catch (err) {
      if (seq !== requestSeq.current) return
      const message = errorText(err)
      setError(message)
      onError?.(message)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [itemId])

  /** 新标签打开 Host 渲染好的整页 HTML；被拦截/不可用时如实提示，不假装成功。 */
  function openFullReport() {
    const url = `${API.report}?id=${encodeURIComponent(itemId)}&format=html`
    try {
      if (typeof window === 'undefined' || typeof window.open !== 'function') {
        throw new Error('当前环境不支持打开新标签页')
      }
      // noopener 下部分浏览器会返回 null（并不代表被拦截），所以只给中性提示。
      const opened = window.open(url, '_blank', 'noopener')
      if (opened === null) {
        setNotice('已尝试在新标签页打开完整报告；如果没有看到新标签，请允许本站弹窗，或先「保存到本机」。')
      }
    } catch (err) {
      setNotice(`打不开完整报告：${errorText(err)}；可以改用「保存到本机」。`)
    }
  }

  async function copyMarkdown() {
    if (copyBusy) return
    const markdown = data?.markdown ?? ''
    if (!markdown) {
      setNotice('当前报告没有可复制的 Markdown。')
      return
    }
    setCopyBusy(true)
    setNotice('')
    try {
      const copied = await writeClipboard(markdown)
      if (!copied) throw new Error('浏览器没有提供剪贴板权限')
      setNotice('已复制 Markdown 到剪贴板')
      onNotice?.('已复制 Markdown')
    } catch (err) {
      setNotice(`复制 Markdown 失败：${errorText(err)}；可以打开完整报告后手动复制。`)
      onError?.('复制 Markdown 失败')
    } finally {
      setCopyBusy(false)
    }
  }

  async function saveReport() {
    if (saveBusy) return
    setSaveBusy(true)
    setNotice('')
    try {
      const body = await api(API.report, {
        method: 'POST',
        body: JSON.stringify({ id: itemId, action: 'save' }),
      })
      if (body.report) {
        setData({ report: body.report, markdown: body.markdown ?? data?.markdown ?? '' })
      }
      const nextSaved = body.saved ?? null
      setSaved(nextSaved)
      const paths = [nextSaved?.html, nextSaved?.markdown].filter(Boolean)
      // 直接展示绝对路径：相对路径在 Finder/终端里找不到
      setNotice(paths.length ? `已保存到本机：${paths.join(' · ')}` : '报告已保存。')
      onNotice?.(paths.length ? `已保存到本机：${paths[0]}` : '报告已保存')
    } catch (err) {
      setNotice(`保存到本机失败：${errorText(err)}`)
      onError?.('保存到本机失败')
    } finally {
      setSaveBusy(false)
    }
  }

  if (loading && !report) {
    return h('div', {
      style: { ...styles.card, display: 'flex', alignItems: 'center', gap: T.gap.xs, color: T.text2 },
    },
      h(Spinner, { size: 14, tone: 'accent', title: '正在生成开发报告' }),
      h('span', null, '正在生成开发报告…'),
    )
  }

  const errorCard = error
    ? h('div', { style: styles.dangerCard },
      h('div', { style: { fontWeight: 600 } }, '报告加载失败'),
      h('div', { style: { marginTop: 4, whiteSpace: 'pre-wrap' } }, error),
      h('div', { style: { marginTop: 8 } },
        h(Button, { style: miniButton, onClick: load, children: '重试' })),
    )
    : null

  if (!report) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
      errorCard,
      notice ? h('div', { style: styles.infoCard }, notice) : null,
      error ? null : h(HintText, null, '没有拿到报告内容，可以点「刷新」重试。'),
      h(Button, { style: miniButton, onClick: load, children: '刷新' }),
    )
  }

  const verdict = VERDICT_STYLE[report.verdict] ?? VERDICT_STYLE.incomplete
  const summary = report.summary ?? {}
  const isAnalysis = report.intent === 'analysis'
  const intentText = report.intent === 'bug' ? 'bug' : isAnalysis ? '分析' : 'feature'
  const baseline = summary.baseline ?? null
  const submission = summary.submission ?? null
  const testTone = summary.testsTotal > 0 && summary.testsPassed >= summary.testsTotal
    ? { color: T.ok, tint: T.okSoft }
    : (summary.testsPassed > 0 ? { color: T.warnText, tint: T.warnSoft } : { color: T.text4, tint: T.surface2 })
  const taskTone = summary.tasksTotal > 0 && summary.tasksDone >= summary.tasksTotal
    ? { color: T.ok, tint: T.okSoft }
    : { color: T.brand, tint: T.brandSoft }

  const toolbar = [
    h(Button, { key: 'open', style: miniButton, onClick: openFullReport, children: '打开完整报告' }),
    h(Button, { key: 'save', style: miniButton, disabled: saveBusy, onClick: saveReport, children: saveBusy ? '保存中…' : '保存到本机' }),
    h(Button, { key: 'copy', style: miniButton, disabled: copyBusy, onClick: copyMarkdown, children: copyBusy ? '复制中…' : '复制 Markdown' }),
  ]

  const banner = h('div', {
    style: {
      borderLeft: `3px solid ${verdict.border}`,
      borderRadius: T.rBase,
      background: verdict.background,
      color: verdict.color,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
      h('span', { style: { fontSize: T.font.md, fontWeight: 600 } }, `结论：${report.verdictLabel ?? verdict.label}`),
      h('span', { style: { fontSize: T.font.sm, lineHeight: T.line, fontWeight: 400 } }, report.verdictReason || '报告没有给出结论原因。'),
    ),
    h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
      h(Tag, { tone: isAnalysis ? 'accent' : 'neutral' }, intentText),
      baseline?.commit
        ? h(Tag, { tone: 'neutral' }, `baseline ${String(baseline.commit).slice(0, 8)}${baseline.branch ? ` @ ${baseline.branch}` : ''}`)
        : h(Tag, { tone: 'warn' }, '未记录 baseline'),
      submission
        ? h(Tag, { tone: submission.pushed ? 'ok' : 'warn' },
          submission.commit
            ? `已提交 ${String(submission.commit).slice(0, 8)}${submission.branch ? ` @ ${submission.branch}` : ''}`
            : `提交 ${submission.branch ?? '—'}`)
        : null,
      summary.workspace?.name ? h(Tag, { tone: 'accent' }, `虚拟库 ${summary.workspace.name}`) : null,
    ),
  )

  const stats = h('div', { style: { display: 'flex', gap: T.gap.sm, flexWrap: 'wrap' } },
    isAnalysis
      ? h(StatCard, {
        label: '分析产出',
        value: '结论',
        hint: '只读排查 · 含证据与补丁建议',
        color: T.brand,
        tint: T.brandSoft,
        icon: 'file',
      })
      : h(StatCard, {
        label: '变更文件',
        value: numberText(summary.changedFiles),
        hint: `+${numberText(summary.added)} / -${numberText(summary.removed)}`,
        color: T.brand,
        tint: T.brandSoft,
        icon: 'file',
      }),
    h(StatCard, {
      label: '测试通过',
      value: `${numberText(summary.testsPassed)}/${numberText(summary.testsTotal)}`,
      hint: '本机自测 · 环境测试',
      color: testTone.color,
      tint: testTone.tint,
      icon: 'test',
    }),
    h(StatCard, {
      label: '任务完成',
      value: `${numberText(summary.tasksDone)}/${numberText(summary.tasksTotal)}`,
      hint: '后台台账实时回写',
      color: taskTone.color,
      tint: taskTone.tint,
      icon: 'tasks',
    }),
    h(StatCard, {
      label: '结论',
      value: report.verdictLabel ?? verdict.label,
      hint: `${report.statusLabel ?? statusText(report.status)} · ${report.stageLabel ?? report.stage ?? '—'}`,
      color: verdict.color,
      tint: verdict.background,
      icon: 'verdict',
    }),
  )

  const help = helpOpen
    ? h('div', {
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '10px 12px',
        border: `1px solid ${T.borderSoft}`,
        borderRadius: T.rBase,
        background: T.bg,
        color: T.text2,
        fontSize: T.font.sm,
        lineHeight: T.line,
      },
    },
      h('span', { style: { color: T.brand, display: 'inline-flex', marginTop: 2 } }, h(Icon, { kind: 'info', size: 16 })),
      h('span', { style: { flex: '1 1 auto', minWidth: 0 } },
        '报告由 .dev-hub 台账与本机 git 事实生成，不调用模型、不发网络请求；没有 baseline 或不是 git 仓库时会显式标注「证据不完整」，不伪造 diff。'),
      h('span', {
        role: 'button',
        title: '收起说明',
        onClick: () => setHelpOpen(false),
        style: { color: T.text4, cursor: 'pointer', lineHeight: 1, padding: '0 2px' },
      }, '×'),
    )
    : null

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
    errorCard,
    notice ? h('div', { style: styles.infoCard }, notice) : null,
    saved
      ? h('div', { style: styles.okCard },
        h('div', { style: { fontWeight: 600 } }, '报告已保存到本机'),
        h('div', { style: { ...styles.mono, marginTop: 4, wordBreak: 'break-all' } }, `HTML：${saved.html ?? '—'}`),
        h('div', { style: { ...styles.mono, marginTop: 2, wordBreak: 'break-all' } }, `Markdown：${saved.markdown ?? '—'}`),
        saved.relative?.dir
          ? h('div', { style: { ...styles.sectionHint, marginTop: 4 } }, `仓库相对位置：${saved.relative.dir}`)
          : null,
      )
      : null,
    h(ReportHeader, { report, itemId, loading, toolbar, onRefresh: load }),
    help,
    banner,
    report.verdict === 'incomplete'
      ? h('div', { style: styles.warnCard }, '流程还没完成，报告会随台账更新。现在看到的是阶段性结果，不代表已通过验收。')
      : null,
    report.verdict === 'blocked'
      ? h('div', { style: styles.warnCard }, '流程被标记为阻塞；报告只反映当前事实，解除阻塞后再刷新。')
      : null,
    stats,
    h(ReportSections, { sections: report.sections }),
    h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 2px 8px',
        fontSize: T.font.xs,
        color: T.text4,
      },
    },
      h('span', null, '由 dsh-dev-hub 生成 · 只读视图'),
      h('div', { style: styles.spacer }),
      h('span', { style: styles.num }, `报告生成于 ${report.generatedAtLabel ?? fmtTime(report.generatedAt)}`),
    ),
  )
}