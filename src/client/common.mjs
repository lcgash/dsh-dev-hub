/**
 * dsh-dev-hub 浏览器半 —— 设计令牌与共享原子。
 *
 * 视觉规范来自 Gitee 家族中后台（sca/scm 原型）：
 * - 单一品牌紫 #6049e7；语义色固定四套，不漂移；
 * - 四级灰阶搭骨架，颜色只作语义信号；
 * - 圆角梯度 SM6 / 常规8 / 容器12 / 标签4 / 胶囊999；
 * - 卡片双层柔影 + 淡彩底；留白走 8/12/16/24 档；等宽数字 tnum。
 *
 * 与 DSH 外壳的关系：**表面与文字优先用 DSH 主题变量**（跟随亮/暗主题），
 * 家族色只用于本工作站自己的强调与语义（按钮、状态、选中态）。
 */
import {  } from 'react'
import { h } from './i18n.mjs'
import { STATUS_LABELS } from '../shared/api.mjs'

/* ------------------------------------------------------------------ tokens */

const DS = {
  bgBase: 'var(--dsw-alias-bg-base, #f9fafd)',
  bgLayer1: 'var(--dsw-alias-bg-layer-1, #ffffff)',
  bgLayer2: 'var(--dsw-alias-bg-layer-2, #f5f6fa)',
  border1: 'var(--dsw-alias-border-l1, #e9eaec)',
  border2: 'var(--dsw-alias-border-l2, #ecedf0)',
  label1: 'var(--dsw-alias-label-primary, #1e2a3d)',
  label2: 'var(--dsw-alias-label-secondary, #4d545e)',
}

export const T = {
  // 品牌紫（家族标准值，唯一高饱和色）
  brand: '#6049e7',
  brandHover: '#7d68ea',
  brandActive: '#4a35c4',
  brandSoft: '#f0edff',
  brandBorder: '#d8d0fb',
  // 语义色：文字色 + 8% 淡底成对
  ok: '#00875a',
  okSoft: '#e2ffee',
  danger: '#de350d',
  dangerSoft: '#ffebe5',
  // 警告用家族标准 #ffab00；正文仍用更深的 warnText 保证对比度
  warn: '#ffab00',
  warnText: '#b65c00',
  warnSoft: '#fff8e6',
  // 信息/进行中归到品牌紫，避免又引入一套蓝色
  info: '#6049e7',
  infoSoft: '#f0edff',
  // 四级灰阶 + 表面
  text: DS.label1,
  text2: DS.label2,
  // 深色主题必须跟随外壳：硬编码深灰会在暗色卡片上看不清
  text3: 'var(--dsw-alias-label-tertiary, #5a5b70)',
  text4: 'var(--dsw-alias-label-caption, #848c9f)',
  bg: DS.bgBase,
  surface: DS.bgLayer1,
  surface2: DS.bgLayer2,
  border: DS.border1,
  borderSoft: DS.border2,
  // 圆角梯度
  rSm: 6,
  rBase: 8,
  rLg: 12,
  rTag: 4,
  rPill: 999,
  // 阴影
  shadowCard: '0 0 2px rgba(9,25,64,.1), 0 2px 6px -2px rgba(9,25,64,.25)',
  shadowHover: '0 0 2px rgba(9,25,64,.12), 0 6px 16px -4px rgba(9,25,64,.22)',
  shadowModal: '0 18px 50px rgba(9,25,64,.18)',
  // 间距 / 字号 / 字体
  gap: { xs: 8, sm: 12, md: 16, lg: 24 },
  font: {
    xs: 11,
    sm: 12,
    base: 13,
    md: 14,
    lg: 16,
    stat: 22,
  },
  line: 1.8,
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  transition: 'all .18s ease',
}

/** 兼容旧代码：所有既有引用 C.xxx 继续可用，取值改为家族令牌。 */
export const C = {
  border: `1px solid ${T.border}`,
  soft: T.surface2,
  text: T.text,
  muted: T.text3,
  accent: T.brand,
  accentSoft: T.brandSoft,
  danger: T.danger,
  dangerBg: T.dangerSoft,
  dangerBorder: `1px solid ${T.danger}`,
  warn: T.warnText,
  warnBg: T.warnSoft,
  warnBorder: `1px solid ${T.warn}`,
  ok: T.ok,
  okBg: T.okSoft,
  okBorder: `1px solid ${T.ok}`,
  card: T.surface,
}

/* ----------------------------------------------------------------- styles */

export const styles = {
  wrap: { padding: T.gap.md, color: T.text, fontSize: T.font.base, lineHeight: T.line },

  // 「开发工作站」大页面：填满 main 面板，自身滚动。
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    background: T.bg,
    color: T.text,
    fontSize: T.font.base,
    lineHeight: T.line,
  },
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: T.gap.sm,
    flexWrap: 'wrap',
    minHeight: 48,
    padding: '8px 24px',
    borderBottom: `1px solid ${T.borderSoft}`,
    background: T.surface,
    flex: '0 0 auto',
  },
  pageTitle: { fontSize: T.font.lg, fontWeight: 600, color: T.text, letterSpacing: 0.2 },
  pageSubtitle: { fontSize: T.font.sm, color: T.text4 },
  pageBody: { flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '16px 24px 24px' },

  row: { display: 'flex', gap: T.gap.xs, alignItems: 'center', flexWrap: 'wrap' },
  col: { display: 'flex', flexDirection: 'column', gap: T.gap.xs },
  spread: { display: 'flex', gap: T.gap.xs, alignItems: 'center', justifyContent: 'space-between' },
  divider: { borderTop: `1px solid ${T.borderSoft}`, margin: '16px 0' },
  spacer: { flex: '1 1 auto' },

  /* 容器：12 圆角 + 双层柔影 + 白底 */
  card: {
    border: `1px solid ${T.borderSoft}`,
    borderRadius: T.rLg,
    background: T.surface,
    padding: T.gap.md,
    boxShadow: T.shadowCard,
  },
  cardFlat: {
    border: `1px solid ${T.borderSoft}`,
    borderRadius: T.rLg,
    background: T.surface,
    padding: T.gap.md,
  },
  cardHoverable: {
    border: `1px solid ${T.borderSoft}`,
    borderRadius: T.rLg,
    background: T.surface,
    padding: T.gap.md,
    boxShadow: T.shadowCard,
    cursor: 'pointer',
    transition: T.transition,
  },
  sectionTitle: { fontSize: T.font.md, fontWeight: 600, color: T.text },
  sectionHint: { fontSize: T.font.sm, color: T.text4 },

  /* 表单控件：同高 32、6 圆角 */
  input: {
    width: '100%',
    boxSizing: 'border-box',
    height: 32,
    padding: '0 10px',
    border: `1px solid ${T.border}`,
    borderRadius: T.rSm,
    background: T.surface,
    color: T.text,
    fontSize: T.font.base,
    fontFamily: 'inherit',
    outline: 'none',
    transition: T.transition,
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 64,
    padding: '8px 10px',
    border: `1px solid ${T.border}`,
    borderRadius: T.rSm,
    background: T.surface,
    color: T.text,
    fontSize: T.font.base,
    fontFamily: 'inherit',
    lineHeight: T.line,
    resize: 'vertical',
    outline: 'none',
  },

  /* 按钮：主按钮品牌紫；次按钮白底描边；同高 32 */
  button: {
    height: 32,
    padding: '0 12px',
    border: `1px solid ${T.border}`,
    borderRadius: T.rSm,
    background: T.surface,
    color: T.text2,
    fontSize: T.font.base,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: T.transition,
    whiteSpace: 'nowrap',
  },
  primary: {
    height: 32,
    padding: '0 14px',
    border: `1px solid ${T.brand}`,
    borderRadius: T.rSm,
    background: T.brand,
    color: '#fff',
    fontSize: T.font.base,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: T.transition,
    whiteSpace: 'nowrap',
  },

  /* 列表 / 卡片项 */
  item: {
    padding: '10px 12px',
    borderBottom: `1px solid ${T.borderSoft}`,
    cursor: 'pointer',
    transition: T.transition,
  },
  itemActive: {
    padding: '10px 12px',
    borderBottom: `1px solid ${T.borderSoft}`,
    cursor: 'pointer',
    background: T.brandSoft,
  },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: T.gap.sm, marginTop: T.gap.sm },
  flowCard: {
    border: `1px solid ${T.borderSoft}`,
    borderRadius: T.rLg,
    background: T.surface,
    padding: T.gap.sm,
    cursor: 'pointer',
    boxShadow: T.shadowCard,
    transition: T.transition,
  },
  flowCardActive: {
    border: `1px solid ${T.brandBorder}`,
    borderRadius: T.rLg,
    background: T.surface,
    padding: T.gap.sm,
    cursor: 'pointer',
    boxShadow: T.shadowCard,
    outline: `2px solid ${T.brandSoft}`,
  },

  /* 提示块：左 3px 语义边线 + 淡底（家族"左边线定性"） */
  dangerCard: {
    borderLeft: `3px solid ${T.danger}`,
    borderRadius: T.rBase,
    background: T.dangerSoft,
    color: T.danger,
    padding: '10px 12px',
    marginTop: T.gap.xs,
    fontSize: T.font.sm,
  },
  warnCard: {
    borderLeft: `3px solid ${T.warn}`,
    borderRadius: T.rBase,
    background: T.warnSoft,
    color: T.warnText,
    padding: '10px 12px',
    marginTop: T.gap.xs,
    fontSize: T.font.sm,
  },
  okCard: {
    borderLeft: `3px solid ${T.ok}`,
    borderRadius: T.rBase,
    background: T.okSoft,
    color: T.ok,
    padding: '10px 12px',
    marginTop: T.gap.xs,
    fontSize: T.font.sm,
  },
  infoCard: {
    borderLeft: `3px solid ${T.brand}`,
    borderRadius: T.rBase,
    // 信息卡跟随主题：浅色下是淡紫，深色下是深紫；不要用亮底 + 主题浅字导致看不清
    background: 'color-mix(in srgb, #6049e7 12%, var(--dsw-alias-bg-layer-1, #ffffff))',
    color: T.text2,
    padding: '10px 12px',
    marginTop: T.gap.xs,
    fontSize: T.font.sm,
  },

  /* 标签 / 胶囊 */
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 8px',
    height: 20,
    borderRadius: T.rTag,
    background: T.surface2,
    color: T.text4,
    fontSize: T.font.xs,
    lineHeight: '20px',
    whiteSpace: 'nowrap',
  },
  pillAccent: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 8px',
    height: 20,
    borderRadius: T.rTag,
    background: T.brandSoft,
    color: T.brand,
    fontSize: T.font.xs,
    lineHeight: '20px',
    whiteSpace: 'nowrap',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 28,
    padding: '0 10px',
    border: `1px solid ${T.border}`,
    borderRadius: T.rPill,
    background: T.surface,
    color: T.text3,
    fontSize: T.font.sm,
    cursor: 'pointer',
    transition: T.transition,
    whiteSpace: 'nowrap',
  },
  chipOn: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 28,
    padding: '0 10px',
    border: `1px solid ${T.brandBorder}`,
    borderRadius: T.rPill,
    background: T.brandSoft,
    color: T.brand,
    fontSize: T.font.sm,
    fontWeight: 500,
    cursor: 'pointer',
    transition: T.transition,
    whiteSpace: 'nowrap',
  },

  /* 步骤条 */
  stepBar: { display: 'flex', gap: T.gap.xs, flexWrap: 'wrap', marginBottom: T.gap.sm },
  stepItem: { padding: '0 10px', height: 24, lineHeight: '24px', borderRadius: T.rPill, background: T.surface2, color: T.text4, fontSize: T.font.xs },
  stepItemActive: { padding: '0 10px', height: 24, lineHeight: '24px', borderRadius: T.rPill, background: T.brand, color: '#fff', fontSize: T.font.xs },
  stepItemDone: { padding: '0 10px', height: 24, lineHeight: '24px', borderRadius: T.rPill, background: T.okSoft, color: T.ok, fontSize: T.font.xs },

  /* 文本 */
  label: { display: 'block', margin: '12px 0 6px', color: T.text3, fontSize: T.font.sm, fontWeight: 500 },
  smallMuted: { color: T.text4, fontSize: T.font.sm },
  smallDanger: { color: T.danger, fontSize: T.font.sm },
  mono: { fontFamily: T.mono, fontSize: T.font.sm, fontVariantNumeric: 'tabular-nums' },
  num: { fontVariantNumeric: 'tabular-nums' },
  pre: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    background: T.surface2,
    border: `1px solid ${T.borderSoft}`,
    borderRadius: T.rSm,
    padding: 12,
    maxHeight: 280,
    overflow: 'auto',
    fontSize: T.font.sm,
    fontFamily: T.mono,
    lineHeight: 1.7,
  },

  /* 进度条 */
  progressOuter: { height: 6, borderRadius: T.rPill, background: T.surface2, overflow: 'hidden', marginTop: 6 },
  progressInner: { height: 6, background: T.brand, transition: 'width .8s cubic-bezier(.22,1,.36,1)' },

  /* 弹层 */
  modal: {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    background: 'rgba(15,23,42,.38)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: T.gap.md,
  },
  modalCard: {
    width: 'min(760px, 96vw)',
    maxHeight: '86vh',
    overflow: 'auto',
    background: T.surface,
    color: T.text,
    borderRadius: T.rLg,
    border: `1px solid ${T.borderSoft}`,
    padding: T.gap.lg,
    boxShadow: T.shadowModal,
  },
}

/* ------------------------------------------------------------- components */

/** 统一的 JSON 请求封装：非 2xx 或 ok:false 一律抛错，调用方只需 try/catch。 */
export async function api(url, options = {}) {
  let response
  try {
    response = await fetch(url, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    })
  } catch (err) {
    // 网络层失败（DSH 重启/页面与宿主断开）不要把 TypeError 直接甩给用户
    throw new Error(`连不上工作站（${String(err?.message ?? err)}）：DSH 可能刚重启，稍后重试或刷新页面`)
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok === false) {
    const fallback = response.status === 404
      ? '工作站接口不可用（HTTP 404）：DSH 可能正在重启或插件未加载，稍后重试'
      : response.status === 401 || response.status === 403
        ? `没有权限调用工作站接口（HTTP ${response.status}）：请在本机打开的页面里重试`
        : `HTTP ${response.status}`
    throw new Error(body?.error || fallback)
  }
  return body
}

export function splitLines(value) {
  return String(value ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

export function joinLines(values) {
  return Array.isArray(values) ? values.join('\n') : ''
}

export function errorText(err) {
  return String(err?.message ?? err)
}

export function Button({ primary, children, style, ...rest }) {
  const base = primary ? styles.primary : styles.button
  const merged = { ...base, ...(style ?? {}) }
  if (rest.disabled) {
    merged.opacity = 0.5
    merged.cursor = 'not-allowed'
  }
  return h('button', { type: 'button', style: merged, ...rest }, children)
}

/**
 * 表单内的主按钮。`Button` 固定 `type="button"`（不会触发表单提交），
 * 表单里必须用这个，否则点「保存」毫无反应。
 */
export function SubmitButton({ children, ...rest }) {
  return h('button', { type: 'submit', style: styles.primary, ...rest }, children)
}

/** 状态中文兜底：共享枚举缺项时不把英文枚举直接暴露给用户。 */
const STATUS_TEXT = {
  planned: '计划中',
  designing: '设计中',
  developing: '开发中',
  reviewing: '评审中',
  verifying: '验证中',
  done: '已完成',
  blocked: '阻塞',
}

/** 语义色 + 淡底：同一个状态全站一套值。 */
const TONE = {
  accent: { color: T.brand, bg: T.brandSoft },
  ok: { color: T.ok, bg: T.okSoft },
  danger: { color: T.danger, bg: T.dangerSoft },
  warn: { color: T.warnText, bg: T.warnSoft },
  info: { color: T.info, bg: T.infoSoft },
  neutral: { color: T.text4, bg: T.surface2 },
}

const STATUS_TONE = {
  planned: 'neutral',
  designing: 'accent',
  developing: 'accent',
  reviewing: 'info',
  verifying: 'info',
  done: 'ok',
  blocked: 'danger',
}

export function statusText(status) {
  return STATUS_LABELS[status] ?? STATUS_TEXT[status] ?? status
}

export function StatusPill({ status }) {
  return h(Tag, { tone: STATUS_TONE[status] ?? 'neutral' }, statusText(status))
}

export function Pill({ tone, children }) {
  return h(Tag, { tone: tone === 'warn' ? 'warn' : tone ?? 'neutral' }, children)
}

/** 家族式 Tag：文字=语义主色，底色=同色 8%，圆角 4，无边框。 */
export function Tag({ tone = 'neutral', children, style, onClick, title }) {
  const palette = TONE[tone] ?? TONE.neutral
  return h('span', {
    ...(onClick ? { role: 'button', tabIndex: 0 } : {}),
    ...(title ? { title } : {}),
    ...(onClick
      ? {
        onClick,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(event) }
        },
      }
      : {}),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: 20,
      padding: '0 8px',
      borderRadius: T.rTag,
      background: palette.bg,
      color: palette.color,
      fontSize: T.font.xs,
      fontWeight: 500,
      lineHeight: '20px',
      whiteSpace: 'nowrap',
      ...(onClick ? { cursor: 'pointer' } : {}),
      ...(style ?? {}),
    },
  }, children)
}

/**
 * 纯 CSS 旋转指示器：表示「这件事还在跑」，不引入动画库、不新增依赖。
 *
 * 为什么要有它：开发会话在后台跑时，页面如果只有一个静态「开发中」标签，
 * 用户很难意识到进程还活着。转圈是最便宜、最不会误读的“仍在工作”信号。
 * 颜色取 TONE 的语义主色，轨道用同色 8% 淡底；keyframes 叫 devhub-hub-spin，
 * 和 chat.mjs 里打字气泡的 devhub-spin 分开，避免同名动画互相覆盖。
 *
 * 服务端渲染（没有 document）时不注入 style，只输出带 animation 的 span；
 * 浏览器首次渲染时注入一次，之后所有 Spinner 复用同一段 CSS。
 */
let spinnerStyleInjected = false
function ensureSpinnerStyle() {
  if (spinnerStyleInjected || typeof document === 'undefined') return
  spinnerStyleInjected = true
  const style = document.createElement('style')
  style.id = 'devhub-hub-spinner'
  style.textContent = '@keyframes devhub-hub-spin{to{transform:rotate(360deg)}}'
  document.head?.appendChild(style)
}

export function Spinner({ size = 12, tone = 'accent', title, style }) {
  ensureSpinnerStyle()
  const palette = TONE[tone] ?? TONE.accent
  return h('span', {
    ...(title ? { title, role: 'img', 'aria-label': title } : { 'aria-hidden': true }),
    style: {
      display: 'inline-block',
      width: size,
      height: size,
      flex: `0 0 ${size}px`,
      boxSizing: 'border-box',
      border: `${Math.max(1.5, Math.round(size / 6))}px solid ${palette.bg}`,
      borderTopColor: palette.color,
      borderRadius: '50%',
      animation: 'devhub-hub-spin .7s linear infinite',
      verticalAlign: 'middle',
      ...(style ?? {}),
    },
  })
}

/** 品牌紫/深色底上的白色转圈：ArrowSteps 当前节点与主按钮里用。 */
export const spinnerOnBrand = {
  borderColor: 'rgba(255,255,255,.45)',
  borderTopColor: '#fff',
}

/** 圆角图标座：主色 8% 淡底 + 同色图形。 */
export function IconSeat({ children, tone = 'accent', size = 32 }) {
  const palette = TONE[tone] ?? TONE.accent
  return h('span', {
    style: {
      width: size,
      height: size,
      flex: `0 0 ${size}px`,
      borderRadius: size * 0.3,
      background: palette.bg,
      color: palette.color,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.5,
    },
  }, children)
}

/** 统计值：标签在上、数值在下，数值等宽不跳动。 */
export function Stat({ label, value, hint }) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 72 } },
    h('span', { style: { fontSize: T.font.sm, color: T.text4 } }, label),
    h('span', {
      style: {
        fontSize: T.font.stat,
        fontWeight: 600,
        color: T.text,
        lineHeight: 1.2,
        fontVariantNumeric: 'tabular-nums',
      },
    }, value),
    hint ? h('span', { style: { fontSize: T.font.xs, color: T.text4 } }, hint) : null,
  )
}

/** 等宽文本（路径 / hash / 行号）。 */
export function Mono({ children, style }) {
  return h('span', { style: { ...styles.mono, ...(style ?? {}) } }, children)
}

/**
 * 当前「项目」徽标：流程页 / 技能页的头部都靠它回答“现在管的是哪个库”。
 *
 * 多库项目（多库项目）没有主库：台账/规范/上下文/证据都在本机独立目录
 * `~/.dev-hub/workspaces/<id>/`，成员库只是一个平权的组合。
 *
 * 只做展示、不取数：调用方把 `/state` 返回的 repo / workspace 传进来即可。
 * 点击（可选）= 回「流程」页切换目标，避免用户在这里找不到切换入口。
 */
export function RepoScopeBadge({ repo = null, workspace = null, onClick = null, style = null }) {
  const repos = workspace?.repos ?? []
  const localPath = workspace?.path ?? workspace?.localPath ?? repo?.path ?? ''
  const clickable = typeof onClick === 'function'
  const truncate = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const title = workspace
    ? `多库项目「${workspace.name ?? '未命名'}」· ${repos.length} 个成员库\n本机台账 ${localPath || '—'}\n台账/规范/上下文/证据都写在本机，不写任何成员库`
    : repo
      ? `当前项目：${repo.name ?? '未命名'}\n${repo.path ?? '—'}`
      : '还没有选择项目：到「流程」页选择或新增'
  return h('div', {
    ...(clickable ? { role: 'button', tabIndex: 0 } : {}),
    title,
    ...(clickable
      ? {
        onClick,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(event) }
        },
      }
      : {}),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 28,
      padding: '0 12px',
      maxWidth: '100%',
      minWidth: 0,
      border: `1px solid ${T.borderSoft}`,
      borderRadius: T.rPill,
      background: T.surface2,
      color: T.text2,
      fontSize: T.font.sm,
      ...(clickable ? { cursor: 'pointer' } : {}),
      ...(style ?? {}),
    },
  },
    workspace
      ? [
        h(Tag, { key: 'kind', tone: 'accent' }, '多库项目'),
        h('span', { key: 'name', style: { fontWeight: 600, color: T.text, maxWidth: 180, flex: '0 1 auto', ...truncate } }, workspace.name ?? '未命名'),
        h(Tag, { key: 'count', tone: 'neutral' }, `${repos.length} 个代码库`),
        h('span', { key: 'local', style: { ...styles.mono, color: T.text4, maxWidth: 220, minWidth: 0, ...truncate } }, '本机台账'),
      ]
      : repo
        ? [
          h(Tag, { key: 'kind', tone: 'neutral' }, '项目'),
          h('span', { key: 'name', style: { fontWeight: 600, color: T.text, maxWidth: 180, flex: '0 0 auto', ...truncate } }, repo.name ?? repo.path ?? '未命名'),
          h('span', { key: 'dot', style: { color: T.text4, flex: '0 0 auto' } }, '·'),
          // 全路径放 tooltip；这里只留定位信息（目录名与仓库名相同时只显示父目录，避免重复）
          h('span', { key: 'path', style: { ...styles.mono, color: T.text4, minWidth: 0, flex: '1 1 auto', ...truncate } }, shortRepoPath(repo.path, repo.name)),
        ]
        : [h(Tag, { key: 'kind', tone: 'warn' }, '未选择项目')],
  )
}

/** 头部只展示定位用的目录尾部：`…/父目录/仓库名`（仓库名已单独显示时只留父目录），全路径仍放在 tooltip。 */
function shortRepoPath(path, name = '') {
  const parts = String(path ?? '').split(/[/\\]/).filter(Boolean)
  if (parts.length <= 2) return String(path ?? '')
  const [parent, base] = parts.slice(-2)
  return name && base === name ? `…/${parent}` : `…/${parent}/${base}`
}

/** 分段控件（页签）。 */
export function Segmented({ options, value, onChange }) {
  return h('div', {
    style: {
      display: 'inline-flex',
      padding: 2,
      gap: 2,
      background: T.surface2,
      borderRadius: T.rBase,
      border: `1px solid ${T.borderSoft}`,
    },
  }, options.map((option) => h('button', {
    key: option.value,
    type: 'button',
    onClick: () => onChange?.(option.value),
    style: {
      height: 26,
      padding: '0 12px',
      border: 'none',
      borderRadius: T.rSm,
      background: option.value === value ? T.surface : 'transparent',
      color: option.value === value ? T.text : T.text4,
      fontSize: T.font.sm,
      fontWeight: option.value === value ? 600 : 400,
      cursor: 'pointer',
      fontFamily: 'inherit',
      boxShadow: option.value === value ? '0 1px 2px rgba(9,25,64,.12)' : 'none',
      transition: T.transition,
    },
  }, option.label)))
}

/** 空状态：图标座 + 主句 + 提示。 */
export function EmptyState({ icon = '✎', title, hint, action }) {
  return h('div', { style: { padding: '32px 16px', textAlign: 'center' } },
    h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: T.gap.sm } }, h(IconSeat, { size: 44 }, icon)),
    h('div', { style: { fontSize: T.font.md, fontWeight: 600, color: T.text } }, title),
    hint ? h('div', { style: { marginTop: 6, fontSize: T.font.sm, color: T.text4 } }, hint) : null,
    action ? h('div', { style: { marginTop: T.gap.md } }, action) : null,
  )
}

export function fmtTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 路径最后一段目录名（多库项目成员库 label 的兜底口径）。 */
export function repoBaseName(path) {
  const value = String(path ?? '').replace(/[\\/]+$/, '')
  if (!value) return ''
  return value.split(/[\\/]/).filter(Boolean).pop() ?? ''
}

/**
 * scope 词条：`module:xxx` 表示模块名，`<成员库>:<仓库内路径>` 表示多库项目里的成员库范围，
 * 其余按裸路径展示。
 *
 * 多库项目的跨库 scope 用 `web:src/x` 存（Host 扫描返回的格式），界面上显示成
 * `web · src/x`，比冒号更像"某个库里的某个路径"，也不会和 `module:` 混在一起。
 * scope 路径都是仓库相对路径，因此不把单字母前缀（Windows 盘符）当特例。
 */
export function scopeTokenLabel(token) {
  const value = String(token ?? '')
  if (value.startsWith('module:')) return `模块 ${value.slice('module:'.length)}`
  const at = value.indexOf(':')
  if (at > 0 && at < value.length - 1) return `${value.slice(0, at)} · ${value.slice(at + 1)}`
  return value
}

export function moduleToken(module) {
  const kind = String(module?.kind ?? '')
  if (kind === 'module') return `module:${module?.name ?? ''}`
  return String(module?.path || module?.name || '')
}

export function uniqueTokens(values) {
  const seen = new Set()
  const out = []
  for (const raw of values ?? []) {
    const token = String(raw ?? '').trim()
    if (!token || seen.has(token)) continue
    seen.add(token)
    out.push(token)
  }
  return out
}