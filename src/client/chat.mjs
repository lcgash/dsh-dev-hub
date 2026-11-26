/**
 * dsh-dev-hub 浏览器半 —— 聊天式开发入口。
 *
 * 目标形态：工作站首页是一个聊天页。用户只说「我要做什么」，
 * 工作站自己扫一遍仓库（API.recon），把候选文件与命中行摆出来；
 * **工作站不懂的地方自己追问**（最多 4 问、可跳过），再自己出一份
 * 带步骤/验收/风险的计划与工程量自评（API.plan）；用户确认计划后才建流程
 * （API.wizard create）并开启开发会话。
 *
 * 用户永远不填“规模/人天”：estimate 只来自 Host 的自评结果，界面只读展示。
 * 也不再走「描述 → 命名 → 选范围 → 初始化 → 开始」的多步表单向导（那个仍在「流程」页）。
 *
 * 业务逻辑一律复用 chat-flow.mjs（纯逻辑、已单测）与 session.mjs：
 *   probeCode / generatePlan / confirmAndStart / summarizeRecon / summarizePlan /
 *   estimateSummary / questionsMessage / planMessage / userMessage / stationMessage / reconMessage
 * 本文件只负责 React 渲染与把 api()/launchDevSession 注入成 deps，不重写业务规则。
 *
 * 失败一律落成一条 tone:'danger' 的工作站消息（中文原因），不静默。
 */
import { useEffect, useRef, useState } from 'react'
import { h } from './i18n.mjs'

const MAX_CLARIFY_ROUNDS = 4
import { API } from '../shared/api.mjs'
import {
  Button,
  C,
  EmptyState,
  fmtTime,
  IconSeat,
  Pill,
  Stat,
  T,
  api,
  errorText,
  moduleToken,
  repoBaseName,
  scopeTokenLabel,
  styles,
  uniqueTokens,
} from './common.mjs'
import {
  MAX_QUESTIONS,
  PHASE,
  confidenceText,
  confirmAndStart,
  generatePlan,
  planMessage,
  probeCode,
  clarifyMessage,
  questionsMessage,
  reconMessage,
  stationMessage,
  summarizePlan,
  summarizeRecon,
  userMessage,
} from './chat-flow.mjs'
import { launchDevSession, launchPrompt } from './session.mjs'
import { clearConversationJob, getActiveChat, getActiveConversationId, getConversation, listChats, saveChat, selectChat, startNewChat, titleOf } from './chat-store.mjs'
import { ATTACHMENT_MAX_BYTES, attachmentLabel, isImageAttachment, normalizeAttachments } from '../shared/attachment.mjs'

/**
 * 同一页面里，一段对话的同类任务同一时刻只允许一个在跑。
 *
 * 事故场景：扫描还没回来用户就切走/开了新流程，旧组件卸载后请求仍在飞；
 * 新挂载的实例读到"进行中的 job"又跑一遍 → 同一段对话出现两次探测结果。
 * 这里用进程内登记表兜住，跨页面刷新仍由台账里的 job 负责续跑。
 */
const ACTIVE_RUNS = new Set()

const CLARIFY_ENGINE_LABEL = {
  dsh: 'DSH 对话',
  'dsh-llm': 'DSH 模型',
  claude: 'Claude Code',
  codex: 'Codex',
  pi: 'Pi',
  local: '本地规则',
}

function clarifyEngineLabel(engine) {
  return CLARIFY_ENGINE_LABEL[engine] ?? '本地规则'
}

const SCAN_ENGINE_LABEL = {
  dsh: 'DSH 扫描',
  'dsh-llm': 'DSH 模型筛选',
  claude: 'Claude Code 扫描',
  codex: 'Codex 扫描',
  pi: 'Pi 扫描',
  local: '本地关键词兜底',
}

function scanEngineLabel(engine) {
  return SCAN_ENGINE_LABEL[engine] ?? '本地关键词兜底'
}

function clarifyElapsed(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return null
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(1)}s`
}

function clarifyEngineTone(engine) {
  return engine === 'local' ? 'warn' : engine === 'dsh' || engine === 'dsh-llm' || ['claude', 'codex', 'pi'].includes(engine) ? 'accent' : 'neutral'
}


function runKey(repoPath, scope, conversationId, kind) {
  return `${repoPath ?? 'unknown'}::${scope ?? 'new'}::${conversationId ?? 'unknown'}::${kind}`
}

/** 某段对话是否已有同类任务在跑（导出给回归测试用）。 */
export function isConversationRunning(repoPath, scope, conversationId, kind = 'recon') {
  return ACTIVE_RUNS.has(runKey(repoPath, scope, conversationId, kind))
}

function beginRun(key) {
  if (ACTIVE_RUNS.has(key)) return false
  ACTIVE_RUNS.add(key)
  return true
}

function endRun(key) {
  ACTIVE_RUNS.delete(key)
}

/** 聊天布局的局部样式：撑满工作站大页面，消息区滚动，输入区固定在底部。 */
const S = {
  // 不吃满父级的 100%（那会和页头叠加导致整页被顶出可视区），
  // 交给 flex 分配「页头之外的剩余高度」，消息区自己滚、输入区固定。
  root: { ...styles.page, height: 'auto', flex: '1 1 auto', minHeight: 0 },
  // 对话画布：居中、留白、限制行宽（宁疏勿密）
  body: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '20px 24px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    alignItems: 'center',
  },
  // 与输入框同宽（780）居中：agent 靠左、用户靠右，但都限制在这一栏内（和 DSH 对话一致）
  canvas: { width: '100%', maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 18 },
  // 右侧详情栏打开后，消息列与输入框必须留在同一个「聊天列」里一起居中：
  // 聊天列 = 消息区（可滚动）+ 底部输入区，右栏是它的同级；这样输入框不会按整页宽度居中而错位。
  row: { display: 'flex', flex: '1 1 auto', minHeight: 0, minWidth: 0 },
  chatCol: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0, minHeight: 0 },
  footer: {
    flex: '0 0 auto',
    // 不要整条 border-top：那会在聊天框上方拉出一条很重的灰线
    background: 'transparent',
    padding: '4px 24px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'center',
  },
  composer: {
    width: '100%',
    maxWidth: 780,
    // 让「边框 + 内边距」算进 780 里：否则输入框会比消息 canvas 宽 30px，同轴对齐又差一截
    boxSizing: 'border-box',
    border: `1px solid ${T.borderSoft}`,
    borderRadius: 14,
    background: T.surface,
    boxShadow: T.shadowCard,
    padding: '12px 14px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  side: {
    width: 320,
    flex: '0 0 320px',
    borderLeft: `1px solid ${T.borderSoft}`,
    background: T.surface,
    padding: '14px 14px 10px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  userRow: { display: 'flex', justifyContent: 'flex-end', width: '100%' },
  userBubble: {
    maxWidth: '78%',
    overflowWrap: 'anywhere',
    // 跟随主题：浅色淡紫底 + 深字，深色深紫底 + 浅字；不能亮底 + 主题浅字
    background: 'color-mix(in srgb, #6049e7 22%, var(--dsw-alias-bg-layer-1, #ffffff))',
    border: '1px solid color-mix(in srgb, #6049e7 30%, var(--dsw-alias-border-l1, #e9eaec))',
    color: T.text,
    borderRadius: '12px 12px 4px 12px',
    padding: '10px 14px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: T.line,
  },
  stationRow: { display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 10, width: '100%' },
  stationBody: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: '0 1 auto', maxWidth: '100%' },
  stationName: { fontSize: T.font.xs, color: T.text4, marginBottom: 2 },
  stationCard: {
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    border: `1px solid ${T.borderSoft}`,
    background: T.surface,
    borderRadius: '4px 12px 12px 12px',
    padding: '10px 14px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: T.line,
    boxShadow: T.shadowCard,
  },
  stationDanger: {
    maxWidth: '100%',
    border: `1px solid ${T.dangerSoft}`,
    borderLeft: `3px solid ${T.danger}`,
    background: T.dangerSoft,
    color: T.danger,
    borderRadius: T.rBase,
    padding: '10px 14px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  reconCard: { width: '100%', boxSizing: 'border-box', border: `1px solid ${T.borderSoft}`, borderRadius: T.rLg, background: T.surface, padding: 16, boxShadow: T.shadowCard },
  questionsCard: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${T.borderSoft}`,
    borderRadius: T.rLg,
    background: T.surface,
    padding: 16,
    boxShadow: T.shadowCard,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    minWidth: 0,
  },
  planCard: {
    width: '100%',
    // 和输入框同轴：width:100% 必须把 padding/border 算进去，否则会横向溢出
    boxSizing: 'border-box',
    border: `1px solid ${T.borderSoft}`,
    borderRadius: T.rLg,
    background: T.surface,
    padding: 16,
    boxShadow: T.shadowCard,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    minWidth: 0,
  },
  fileRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
    padding: '10px 0',
    borderTop: `1px solid ${T.borderSoft}`,
    cursor: 'pointer',
  },
  match: {
    fontFamily: T.mono,
    fontSize: T.font.xs,
    color: T.text4,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontVariantNumeric: 'tabular-nums',
  },
  questionBlock: { padding: '12px 0', borderTop: `1px solid ${T.borderSoft}` },
  riskBox: {
    borderLeft: `3px solid ${T.warn}`,
    // 深色主题下不要用亮奶油底：用低比例语义色叠在主题底色上
    background: 'color-mix(in srgb, #ca8a04 14%, var(--dsw-alias-bg-layer-1, #ffffff))',
    color: 'var(--dsw-alias-label-primary, #1e2a3d)',
    borderRadius: T.rBase,
    padding: '8px 12px',
    marginTop: 8,
    fontSize: T.font.sm,
  },
  list: { margin: '6px 0 0', paddingLeft: 20, color: T.text2, lineHeight: T.line },
  // 风险列表必须继承风险框语义色/前景，不能再用全局 list 的正文色（暗色下会变浅灰叠在亮底上）
  riskList: { margin: '6px 0 0', paddingLeft: 20, color: 'inherit', lineHeight: T.line },
  stepList: { margin: '6px 0 0', paddingLeft: 20, color: T.text, lineHeight: T.line },
}

/** 本机附件 URL：Host 只服务附件目录内的文件，浏览器不能直接读 file://。 */
function attachmentUrl(entry) {
  return `${API.attachment}?path=${encodeURIComponent(String(entry?.path ?? ''))}`
}

/** 附件 chip：图片显示缩略图，点名称/缩略图打开预览；可选的移除按钮保留在右侧。 */
function AttachmentChip({ entry, onPreview, onRemove }) {
  const image = isImageAttachment(entry)
  return h('span', {
    title: entry?.path ?? attachmentLabel(entry),
    onClick: () => onPreview?.(entry),
    style: {
      ...styles.pill,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      cursor: 'pointer',
    },
  },
    image
      ? h('img', {
        src: attachmentUrl(entry),
        alt: attachmentLabel(entry),
        style: { width: 24, height: 24, objectFit: 'cover', borderRadius: 4, flex: '0 0 auto' },
      })
      : '📄',
    h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, attachmentLabel(entry)),
    onRemove
      ? h('span', {
        style: { cursor: 'pointer', color: T.text4, flex: '0 0 auto' },
        onClick: (event) => { event.stopPropagation(); onRemove(entry.id) },
        title: '移除',
      }, '×')
      : null,
  )
}

/** 聊天内图片预览：点击遮罩/Esc 关闭，不打开新标签。 */
function AttachmentPreview({ entry, onClose }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose?.() }
    if (typeof document !== 'undefined') document.addEventListener('keydown', onKey)
    return () => { if (typeof document !== 'undefined') document.removeEventListener('keydown', onKey) }
  }, [onClose])
  if (!entry) return null
  const image = isImageAttachment(entry)
  return h('div', {
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 12000,
      background: 'rgba(10, 16, 30, 0.72)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    onClick: onClose,
  }, h('div', {
    style: { maxWidth: '92vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' },
    onClick: (event) => event.stopPropagation(),
  },
    h('div', { style: { color: '#fff', fontSize: T.font.sm, display: 'flex', alignItems: 'center', gap: 10, maxWidth: '90vw' } },
      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, attachmentLabel(entry)),
      h('span', { style: { cursor: 'pointer', opacity: 0.8 } , onClick: onClose }, '关闭'),
    ),
    image
      ? h('img', {
        src: attachmentUrl(entry),
        alt: attachmentLabel(entry),
        style: { maxWidth: '90vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8, background: '#fff' },
      })
      : h('div', { style: { color: '#fff', fontSize: T.font.sm } }, '该附件不是图片，暂不支持预览。'),
  ))
}

/** 探测结果里可用的范围建议：suggestedScope + 命中模块（去重）。 */
function scopeSuggestions(recon) {
  const suggested = Array.isArray(recon?.suggestedScope) ? recon.suggestedScope : []
  const fromModules = (recon?.modules ?? []).map(moduleToken).filter(Boolean)
  return uniqueTokens([...suggested, ...fromModules])
}

/** 候选文件属于哪个成员库（多库项目扫描带 repoName；单库为空）。 */
function reconFileRepo(file) {
  return String(file?.repoName ?? (file?.repo ? repoBaseName(file.repo) : '') ?? '')
}

/**
 * 候选文件按成员库分组：多库项目的探测结果会混着前后端文件，
 * 按库分组 + 组内按路径排序，比一锅平铺好扫。单库（没有 repoName）只有一组。
 */
function groupReconFiles(files) {
  const map = new Map()
  for (const file of Array.isArray(files) ? files : []) {
    const repo = reconFileRepo(file)
    if (!map.has(repo)) map.set(repo, [])
    map.get(repo).push(file)
  }
  for (const list of map.values()) {
    list.sort((a, b) => String(a?.path ?? '').localeCompare(String(b?.path ?? '')))
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

/** 探测结果里的成员库扫描摘要（workspace recon 才有 members）。 */
function reconMembers(recon) {
  return (Array.isArray(recon?.members) ? recon.members : []).filter(Boolean)
}

function matchLines(matches) {
  return (Array.isArray(matches) ? matches : []).filter((entry) => entry && entry.line !== undefined && entry.line !== null)
}

/** 追问答案是否算“已答”（空字符串/空值/空格都不算）。 */
function hasAnswer(value) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

/** 值相等：选项的 value 可能是对象（如 `{ mode:'only', module:'source' }`）。 */
function sameValue(a, b) {
  if (a === b) return true
  if (a === undefined || a === null || b === undefined || b === null) return false
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      return false
    }
  }
  return false
}

/**
 * 一条工作站消息：探测卡片 / 追问卡片 / 计划卡片走专用渲染，其余是文本气泡（tone:'danger' 时红底）。
 */
function MessageRow({
  msg,
  live,
  questionsLive,
  planLive,
  selectedFiles,
  scopeList,
  answers,
  busy,
  hasQuestions,
  onToggleFile,
  onToggleScope,
  onAddScope,
  onRemoveScope,
  onReDescribe,
  onAnswer,
  onGeneratePlan,
  onStartPlan,
  onAdjustScope,
  syncBeforeStart = true,
  onSyncBeforeStartChange,
  clarifyBusy = false,
  onPreviewAttachment = null,
  onClarifyPick,
  onClarifySubmit,
  onClarifyContinue,
  clarifyTitle,
  onClarifyTitleChange,
}) {
  if (msg?.role === 'user') {
    return h('div', { style: S.userRow },
      h('span', { className: 'devhub-msg-time', style: { ...styles.smallMuted, alignSelf: 'flex-end', marginRight: 6, marginBottom: 2, fontSize: 11 } }, fmtTime(msg.at)),
      h('div', { style: S.userBubble },
        msg.text || null,
        (msg.attachments ?? []).length
          ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: msg.text ? 6 : 0 } },
            msg.attachments.map((entry) => h(AttachmentChip, {
              key: entry.id ?? entry.path,
              entry,
              onPreview: onPreviewAttachment,
            })),
          )
          : null,
      ),
    )
  }
  const seat = h(IconSeat, { size: 28 }, '◈')
  const wrapStation = (content) => h('div', { style: S.stationRow },
    seat,
    h('div', { style: S.stationBody },
      h('div', { style: S.stationName }, '开发工作站'),
      content,
    ),
  )
  // 卡片类消息（探测/追问/澄清/计划）铺满与输入框同宽的聊天列：
  // 头像与「开发工作站」在卡片上方一行，不再用左侧头像给卡片额外缩进，
  // 否则卡片会比下方 input 窄一截，看起来宽度没对齐。
  const wrapCard = (content) => h('div', {
    style: { width: '100%', display: 'flex', flexDirection: 'column', gap: 6 },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, seat, h('div', { style: S.stationName }, '开发工作站')),
    content,
  )
  if (msg?.kind === 'recon') {
    return wrapCard(
      h(ReconCard, {
        recon: msg.recon,
        draft: msg.draft,
        live,
        confirmedFiles: msg.confirmedFiles,
        confirmedScope: msg.confirmedScope,
        selectedFiles,
        scopeList,
        busy,
        // 没有追问时，计划按钮放在探测卡片里；有追问时放到追问卡片底部（避免两个重复入口）
        showPlanButton: live && !hasQuestions,
        onToggleFile,
        onToggleScope,
        onAddScope,
        onRemoveScope,
        onGeneratePlan,
        onReDescribe,
      }),
    )
  }
  if (msg?.kind === 'questions') {
    return wrapCard(
      h(QuestionsCard, {
        questions: msg.questions,
        // 生成计划时会把当时的回答快照进消息，历史里仍看得到答了什么
        answers: msg.answers ?? answers,
        live: questionsLive,
        busy,
        onAnswer,
        onGeneratePlan,
      }),
    )
  }
  if (msg?.kind === 'clarify') {
    return wrapCard(
      h(ClarifyCard, {
        card: msg,
        answers,
        busy: busy || clarifyBusy,
        title: clarifyTitle,
        onTitleChange: onClarifyTitleChange,
        onPick: onClarifyPick,
        onSubmit: () => onClarifySubmit?.(msg),
        onGeneratePlan,
        onContinue: () => onClarifyContinue?.(msg),
      }),
    )
  }
  if (msg?.kind === 'plan') {
    return wrapCard(
      h(PlanCard, {
        plan: msg.plan,
        live: planLive,
        busy,
        selectedFiles,
        scopeList,
        syncBeforeStart,
        onSyncBeforeStartChange,
        onStartPlan,
        onAdjustScope,
      }),
    )
  }
  return wrapStation(msg?.tone === 'danger'
    ? h('div', { style: S.stationDanger }, msg?.text ?? '')
    : h('div', { style: { color: T.text, fontSize: T.font.base, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, msg?.text ?? ''))
}

/**
 * 二次确认的核心卡片：
 * 结论行 + 逐文件勾选（默认全选，取消的不进上下文）+ 范围勾选（默认 suggestedScope，可加/删）。
 * 用户只在这里确认“要改哪些文件 / 哪些范围”，不填任何工程量。
 */
function ReconCard({
  recon,
  draft,
  live,
  confirmedFiles,
  confirmedScope,
  selectedFiles,
  scopeList,
  busy,
  showPlanButton,
  onToggleFile,
  onToggleScope,
  onAddScope,
  onRemoveScope,
  onGeneratePlan,
  onReDescribe,
}) {
  const [scopeDraft, setScopeDraft] = useState('')
  const files = Array.isArray(recon?.files) ? recon.files : []
  const modules = (recon?.modules ?? []).map((entry) => entry?.name).filter(Boolean).slice(0, 4)
  const suggestions = scopeSuggestions(recon)
  const members = reconMembers(recon)
  // 多库项目：同一个卡片里混着前后端文件，按成员库分组展示（单库只有一组、没有组标题）
  const groups = groupReconFiles(files)
  const multiRepo = groups.length > 1 || groups.some(([repo]) => Boolean(repo))
  // 非 live 时看“当时确认的快照”，否则历史卡片会显示成 0 个已选
  const activeFiles = live ? selectedFiles : (Array.isArray(confirmedFiles) ? confirmedFiles : selectedFiles)
  const activeScope = live ? scopeList : (Array.isArray(confirmedScope) ? confirmedScope : scopeList)
  const selectedCount = files.filter((file) => activeFiles.includes(String(file?.path ?? ''))).length
  const conclusion = [
    recon?.repoName ? `扫描仓库 ${recon.repoName}` : '',
    `扫描 ${Number(recon?.scanned ?? 0)} 个文件，命中 ${files.length} 个候选`,
    modules.length ? `集中在 ${modules.join('、')}` : '',
    members.length ? `覆盖 ${members.length} 个成员库` : '',
  ].filter(Boolean).join('，') + '。'

  /** 一个候选文件：标题行 + 相关度 + 命中行；live 时可勾选，历史卡片只回看。 */
  function renderFileRow(file, index) {
    const path = String(file?.path ?? `候选文件 ${index + 1}`)
    const repo = reconFileRepo(file)
    const matches = matchLines(file?.matches)
    const namePart = repo && !path.startsWith(`${repo}/`) ? `${repo}/${path}` : path
    return live
      ? h('label', { key: `${repo}:${path}`, style: S.fileRow },
        h('input', {
          type: 'checkbox',
          checked: activeFiles.includes(path),
          onChange: () => onToggleFile(path),
        }),
        h('div', { style: { minWidth: 0, flex: '1 1 auto' } },
          h('div', { style: styles.row },
            repo ? h(Pill, { tone: 'accent' }, repo) : null,
            h('span', { style: { fontWeight: 600, wordBreak: 'break-all' } }, namePart),
            file?.source === 'keyword'
              ? h(Pill, { tone: 'neutral' }, '关键词命中')
              : (file?.confidence ? h(Pill, { tone: file.confidence === 'high' ? 'ok' : file.confidence === 'low' ? 'warn' : 'neutral' }, `相关度 ${file.confidence}`) : null),
          ),
          file?.why ? h('div', { style: { ...styles.smallMuted, marginTop: 2 } }, file.why) : null,
          matches.length ? h('div', { style: { ...styles.smallMuted, marginTop: 2 } }, `命中 ${matches.length} 处`) : null,
          matches.slice(0, 3).map((match) => h('div', { key: `${path}:${match.line}`, style: S.match }, `L${match.line}: ${match.text ?? ''}`)),
          matches.length > 3 ? h('div', { style: styles.smallMuted }, `…还有 ${matches.length - 3} 处（开发会话里看完整 Context Pack）`) : null,
        ),
      )
      : h('div', { key: `${repo}:${path}`, style: { ...S.fileRow, cursor: 'default' } },
        h('span', { style: styles.smallMuted }, activeFiles.includes(path) ? '✓' : '•'),
        h('div', { style: { minWidth: 0 } },
          h('div', { style: { fontWeight: 600, wordBreak: 'break-all' } },
            repo ? h(Pill, { tone: 'accent', style: { marginRight: 6 } }, repo) : null,
            namePart),
          file?.why ? h('div', { style: { ...styles.smallMuted, marginTop: 2 } }, file.why) : null,
          matches.length ? h('div', { style: styles.smallMuted }, `命中 ${matches.length} 处`) : null,
          matches.slice(0, 3).map((match) => h('div', { key: `${path}:${match.line}`, style: S.match }, `L${match.line}: ${match.text ?? ''}`)),
        ),
      )
  }

  function addScope() {
    const token = String(scopeDraft ?? '').trim()
    if (!token) return
    onAddScope(token)
    setScopeDraft('')
  }

  return h('div', { style: S.reconCard },
    h('div', { style: styles.row },
      h(IconSeat, { size: 28 }, '⌕'),
      h('strong', { style: styles.sectionTitle }, '探测结果'),
      h(Pill, { tone: live ? 'accent' : 'ok' }, live ? '待确认' : '已确认'),
      recon?.engine
        ? h(Pill, { tone: recon.engine === 'local' ? 'warn' : 'accent' }, recon.engineLabel || scanEngineLabel(recon.engine))
        : null,
      recon?.elapsedMs ? h('span', { style: styles.smallMuted }, `${(recon.elapsedMs / 1000).toFixed(1)}s`) : null,
      h(Pill, { tone: selectedCount === files.length ? 'ok' : 'warn' }, `已选 ${selectedCount}/${files.length} 个文件`),
      recon?.truncated ? h(Pill, { tone: 'warn' }, '已达扫描上限') : null,
      h('div', { style: styles.spacer }),
      h(Stat, { label: '候选文件', value: files.length }),
      h(Stat, { label: '命中模块', value: modules.length }),
    ),
    h('div', { style: { ...styles.smallMuted, marginTop: 4 } }, conclusion),
    members.length
      ? h('div', { style: { marginTop: 8 } },
        h('div', { style: styles.label }, `成员库扫描（${members.length}）`),
        members.map((member, index) => h('div', {
          key: member.repo ?? member.name ?? index,
          style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '2px 0', fontSize: T.font.xs },
        },
          h(Pill, { tone: member.error ? 'warn' : 'ok' },
            member.error ? '失败' : `${Number(member.files) || 0} 候选`),
          h('span', { style: { fontWeight: 600, color: T.text2 } }, member.name ?? repoBaseName(member.repo) ?? '成员库'),
          member.repo ? h('span', {
            style: { ...styles.mono, color: T.text4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 },
            title: member.repo,
          }, member.repo) : null,
          member.error ? h('span', { style: styles.smallDanger }, member.error) : null,
        )),
      )
      : null,
    recon?.scanNotes && recon?.engine === 'local'
      ? h('div', { style: { ...styles.warnCard, marginTop: 8 } }, recon.scanNotes)
      : null,
    recon?.scanNotes && recon?.engine !== 'local'
      ? h('div', { style: { ...styles.smallMuted, marginTop: 4 } }, `扫描说明：${recon.scanNotes}`)
      : null,
    recon?.truncated ? h('div', { style: styles.smallMuted }, '结果可能不全：扫描达到上限，可把要做什么写得更具体。') : null,

    files.length
      ? h('div', { style: { marginTop: 8 } },
        h('div', { style: styles.label }, live ? '可能改动的文件（勾选进入开发上下文；默认全选）' : '当时确认的候选文件'),
        groups.map(([repo, groupFiles]) => h('div', {
          key: repo || '__single__',
          style: multiRepo && repo ? { marginTop: 4, borderTop: `1px solid ${T.borderSoft}`, paddingTop: 4 } : null,
        },
          multiRepo && repo
            ? h('div', { style: { ...styles.smallMuted, fontWeight: 600, color: T.text2, paddingLeft: 2 } },
              `${repo}（${groupFiles.length}）`)
            : null,
          groupFiles.map(renderFileRow),
        )),
      )
      : h('div', { style: { ...styles.smallMuted, marginTop: 8 } }, '没有命中候选文件。可以直接按目录/模块建流程，或点「重新描述」补充关键词。'),
    files.length && Number(recon?.truncatedFiles) > 0
      ? h('div', { style: { ...styles.smallMuted, marginTop: 4 } },
        `还有 ${Number(recon.truncatedFiles)} 个关键词命中未展示（达到展示上限）；可以缩小描述或按目录拆分扫描。`)
      : null,

    live
      ? h('div', { style: { marginTop: 10 } },
        h('div', { style: styles.label }, '开发范围 scope（用于并行冲突判定；裸路径 = 目录，module:xxx = 模块名）'),
        suggestions.length
          ? h('div', { style: styles.row },
            suggestions.map((token) => {
              const on = scopeList.includes(token)
              return h('span', {
                key: token,
                style: on ? styles.chipOn : styles.chip,
                title: '点击勾选/取消',
                onClick: () => onToggleScope(token),
              }, `${on ? '✓ ' : ''}${scopeTokenLabel(token)}`)
            }),
          )
          : h('div', { style: styles.smallMuted }, 'Host 没给出建议范围，请手填一个目录或 module:名称。'),
        scopeList.length
          ? h('div', { style: { ...styles.row, marginTop: 6 } },
            scopeList.map((token) => h('span', { key: token, style: styles.pill },
              `${scopeTokenLabel(token)} `,
              h('span', { style: { cursor: 'pointer', fontWeight: 700 }, title: '移除', onClick: () => onRemoveScope(token) }, '×'),
            )),
          )
          : h('div', { style: { ...styles.smallMuted, marginTop: 6 } }, '尚未选择任何范围；至少要保留一个目录或模块才能创建流程。'),
        h('div', { style: { ...styles.row, marginTop: 6 } },
          h('input', {
            style: { ...styles.input, flex: '1 1 220px' },
            value: scopeDraft,
            placeholder: '例如 src/main/java/com/example/app/scheduler 或 module:order-service',
            onChange: (event) => setScopeDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              addScope()
            },
          }),
          h(Button, { disabled: !String(scopeDraft).trim(), onClick: addScope, children: '添加范围' }),
        ),
        h('div', { style: { ...styles.row, marginTop: 10 } },
          showPlanButton
            ? h(Button, {
              primary: true,
              disabled: busy || !scopeList.length,
              onClick: onGeneratePlan,
              children: busy ? '正在生成计划…' : '继续，生成计划',
            })
            : h('span', { style: styles.smallMuted }, '先在下方回答工作站的问题（可以跳过），再点「继续，生成计划」。'),
          h(Button, { disabled: busy, onClick: onReDescribe, children: '重新描述' }),
        ),
      )
      : h('div', { style: { marginTop: 6, ...styles.smallMuted } },
        activeScope.length
          ? `当时确认的开发范围：${activeScope.map(scopeTokenLabel).join('、')}`
          : '当时没有确认开发范围。',
      ),
  )
}

/**
 * 「需求澄清」卡片：一句话描述往往太粗，这里由 dsh 追问 1~2 个关键问题，
 * 答完继续下一轮，直到能写出明确的问题/目标/非目标/验收/范围（或到轮次上限）。
 */
function ClarifyCard({ card, answers, busy, title, onTitleChange, onPick, onSubmit, onGeneratePlan, onContinue }) {
  const resolved = Boolean(card?.resolved)
  const questions = Array.isArray(card?.questions) ? card.questions : []
  const spec = card?.spec ?? {}
  const specRows = [
    ['要解决的问题', spec.problem],
    ['目标', (spec.goals ?? []).join('；')],
    ['非目标', (spec.nonGoals ?? []).join('；')],
    ['验收', (spec.acceptance ?? []).join('；')],
    ['范围', (spec.scope ?? []).join('、')],
    ['关键决策', (spec.decisions ?? []).map((entry) => `${entry.decision}${entry.why ? `（${entry.why}）` : ''}`).join('；')],
    ['术语', (spec.glossary ?? []).map((entry) => `${entry.term}：${entry.meaning || '—'}`).join('；')],
  ].filter(([, value]) => value)
  const ready = Boolean(card?.ready)

  /** 已提交的那一轮：只回看问题与当时的选择，不再渲染任何输入框。 */
  if (resolved) {
    const rows = questions
      .map((question, index) => {
        const id = String(question?.id ?? `q${index + 1}`)
        const saved = card?.answers?.[id]
        const picked = saved?.selected?.length ? saved.selected.join('、') : ''
        const custom = String(saved?.custom ?? '').trim()
        const answerText = [picked, custom].filter(Boolean).join('；')
        return { id, question: String(question?.question ?? ''), answer: answerText }
      })
      .filter((row) => row.question)
    return h('div', { style: S.questionsCard },
      h('div', { style: styles.row },
        h(IconSeat, { size: 28 }, '◈'),
        h('strong', null, `需求澄清 · 第 ${card?.round ?? 1} 轮`),
        h(Pill, { tone: 'ok' }, '已提交'),
        h(Pill, { tone: clarifyEngineTone(card?.engine) }, clarifyEngineLabel(card?.engine)),
        clarifyElapsed(card?.elapsedMs) ? h('span', { style: styles.smallMuted }, clarifyElapsed(card?.elapsedMs)) : null,
      ),
      title
        ? h('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 8 } },
          h('span', { style: { color: T.text4, fontSize: T.font.xs, flex: '0 0 76px' } }, '流程标题'),
          h('span', { style: { color: T.text, fontSize: T.font.sm, fontWeight: 600 } }, title))
        : null,
      rows.length
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 } },
          // 问题一行、答案一行：长问题不能用 flex 行把答案挤成竖排
          rows.map((row) => h('div', {
            key: row.id,
            style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
          },
            h('span', {
              style: { color: T.text4, fontSize: T.font.xs, lineHeight: 1.6, whiteSpace: 'normal', overflowWrap: 'anywhere' },
            }, row.question),
            h('span', {
              style: { color: T.text, fontSize: T.font.sm, fontWeight: 500, lineHeight: 1.7, whiteSpace: 'normal', overflowWrap: 'anywhere' },
            }, row.answer || '（未答）'),
          )))
        : null,
      specRows.length
        ? h('div', { style: { marginTop: 8, padding: '8px 10px', background: T.surface2, borderRadius: T.rBase, display: 'flex', flexDirection: 'column', gap: 4 } },
          specRows.map(([label, value]) => h('div', { key: label, style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
            h('span', { style: { color: T.text4, fontSize: T.font.xs, flex: '0 0 76px' } }, label),
            h('span', { style: { color: T.text2, fontSize: T.font.sm, flex: '1 1 auto', lineHeight: 1.6 } }, value))))
        : null,
      h('div', { style: { ...styles.row, marginTop: 10 } },
        onContinue
          ? h(Button, { disabled: busy, onClick: onContinue, children: busy ? '澄清中…' : '继续补充（再问一轮）' })
          : null,
        onGeneratePlan ? h(Button, { disabled: busy, onClick: onGeneratePlan, children: '直接生成计划' }) : null,
      ),
      h('div', { style: { ...styles.smallMuted, marginTop: 8 } }, '这一轮已经提交，可以继续补充，或直接生成计划。'),
    )
  }

  return h('div', { style: S.questionsCard },
    h('div', { style: styles.row },
      h(IconSeat, { size: 28 }, '◈'),
      h('strong', null, `需求澄清 · 第 ${card?.round ?? 1} 轮`),
      h(Pill, { tone: clarifyEngineTone(card?.engine) }, clarifyEngineLabel(card?.engine)),
      clarifyElapsed(card?.elapsedMs) ? h('span', { style: styles.smallMuted }, clarifyElapsed(card?.elapsedMs)) : null,
      card?.degraded ? h(Pill, { tone: 'warn' }, '已降级') : null,
    ),
    card?.reply ? h('div', { style: { marginTop: 6, color: T.text2, fontSize: T.font.base, whiteSpace: 'pre-wrap', lineHeight: 1.7 } }, card.reply) : null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 } },
      h('span', { style: { color: T.text4, fontSize: T.font.xs, flex: '0 0 76px' } }, '流程标题'),
      h('input', {
        style: { ...styles.input, height: 30, maxWidth: 420, fontSize: T.font.sm },
        placeholder: 'agent 会顺带给一个标题，可改',
        value: title ?? '',
        onChange: (event) => onTitleChange?.(event.target.value),
        disabled: busy,
      }),
    ),
    specRows.length
      ? h('div', { style: { marginTop: 10, padding: '10px 12px', background: T.surface2, borderRadius: T.rBase, display: 'flex', flexDirection: 'column', gap: 6 } },
        specRows.map(([label, value]) => h('div', { key: label, style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
          h('span', { style: { color: T.text4, fontSize: T.font.xs, flex: '0 0 76px' } }, label),
          h('span', { style: { color: T.text2, fontSize: T.font.sm, flex: '1 1 auto', lineHeight: 1.6 } }, value))))
      : null,
    (card?.missing ?? []).length
      ? h('div', { style: { ...styles.smallMuted, marginTop: 8 } }, `还缺：${card.missing.join('、')}`)
      : null,
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 } },
      questions.map((question, index) => {
        const id = String(question?.id ?? `q${index + 1}`)
        const answer = answers?.[id] && typeof answers[id] === 'object' ? answers[id] : { selected: [], custom: '' }
        const options = Array.isArray(question?.options) ? question.options : []
        // 兼容旧消息/模型只写“可多选”没置 flag 的情况
        const multi = Boolean(question?.multiSelect) || /(?:可多选|多选)/.test(String(question?.question ?? ''))
        return h('div', { key: id, style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontWeight: 600, fontSize: T.font.base, color: T.text, lineHeight: 1.6 } },
            h('span', null, String(question?.question ?? '')),
            multi ? h(Pill, { tone: 'neutral' }, '可多选') : null),
          question?.why ? h('div', { style: { ...styles.smallMuted, lineHeight: 1.6 } }, `为什么问：${question.why}`) : null,
          options.length
            ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              options.map((option, optionIndex) => {
                const on = (answer.selected ?? []).includes(option.label)
                return h('span', {
                  key: `${optionIndex}-${option.label}`,
                  title: option.description ?? '',
                  style: { ...(on ? styles.chipOn : styles.chip), cursor: busy ? 'default' : 'pointer' },
                  onClick: busy ? undefined : () => onPick(id, multi
                    ? { toggle: option.label }
                    : { selected: on ? [] : [option.label] }),
                }, `${on ? '✓ ' : ''}${option.label}`)
              }))
            : null,
          h('input', {
            style: { ...styles.input, marginTop: 2, maxWidth: 560, height: 32, fontSize: T.font.sm },
            disabled: busy,
            placeholder: options.length ? '补充说明（可选）' : '写下你的回答',
            value: answer.custom ?? '',
            onChange: (event) => onPick(id, { custom: event.target.value }),
            onKeyDown: (event) => {
              if (event.key !== 'Enter' || busy) return
              if (event.nativeEvent?.isComposing) return
              event.preventDefault()
              onSubmit()
            },
          }),
        )
      }),
    ),
    h('div', { style: { ...styles.row, marginTop: 14 } },
      h(Button, {
        primary: true,
        disabled: busy,
        onClick: onSubmit,
        children: busy ? '澄清中…' : (ready ? '再问一轮（可选）' : '回答并继续'),
      }),
      ready ? h(Button, { disabled: busy, onClick: onGeneratePlan, children: '需求清楚了，生成计划' }) : null,
    ),
    h('div', { style: { ...styles.smallMuted, marginTop: 8 } },
      ready ? '已经能写出问题定义：点「生成计划」继续（或再问一轮补细节）。' : '问题会一轮轮收敛；也可以直接点「生成计划」，我会按当前信息开工。'),
  )
}

/**
 * 「工作站想确认几件事」卡片：每问一行问题 + 一行灰色 why；
 * 选择题渲染成可点 chip（单选、选中高亮），文本题给一个输入框（Enter 提交该题）。
 * 顶部明确“可以跳过”，底部只有「继续，生成计划」——跳过就是不答，按 Host 默认做法推进。
 */
function QuestionsCard({ questions, answers, live, busy, onAnswer, onGeneratePlan }) {
  const list = (Array.isArray(questions) ? questions : []).filter(Boolean)
  const answeredCount = list.filter((question, index) => hasAnswer(answers?.[String(question?.id ?? `q${index + 1}`)])).length

  return h('div', { style: S.questionsCard },
    h('div', { style: styles.row },
      h(IconSeat, { size: 28 }, '?'),
      h('strong', null, '工作站想确认几件事'),
      h(Pill, { tone: 'accent' }, `已答 ${answeredCount}/${list.length}`),
      h(Pill, null, `最多 ${MAX_QUESTIONS} 问`),
    ),
    h('div', { style: { ...styles.smallMuted, marginTop: 4 } },
      '可以跳过，我按默认做法推进；答了会影响计划里的步骤、范围与验收。'),

    list.map((question, index) => {
      const id = String(question?.id ?? `q${index + 1}`)
      const options = Array.isArray(question?.options) ? question.options.filter(Boolean) : []
      const kind = question?.kind === 'choice' ? 'choice' : question?.kind === 'text' ? 'text' : options.length ? 'choice' : 'text'
      const answer = answers?.[id]
      return h('div', { key: id, style: S.questionBlock },
        h('div', { style: { fontWeight: 600 } }, String(question?.question ?? '（没有问题描述）')),
        question?.why ? h('div', { style: { ...styles.smallMuted, marginTop: 2 } }, String(question.why)) : null,
        kind === 'choice'
          ? h('div', { style: { ...styles.row, marginTop: 6 } },
            options.map((option, optionIndex) => {
              const value = option?.value ?? option?.id ?? option?.label
              const on = sameValue(answer, value)
              const checkable = live && !busy
              return h('span', {
                key: String(option?.id ?? optionIndex),
                style: { ...(on ? styles.chipOn : styles.chip), cursor: checkable ? 'pointer' : 'default' },
                title: checkable ? '点击选择（再点一次取消）' : undefined,
                onClick: checkable
                  ? () => onAnswer(id, on ? null : value)
                  : undefined,
              }, `${on ? '✓ ' : ''}${String(option?.label ?? value ?? '')}`)
            }),
          )
          : h('input', {
            style: { ...styles.input, marginTop: 6 },
            value: answer === undefined || answer === null || typeof answer === 'object' ? '' : String(answer),
            disabled: !live || busy,
            placeholder: live ? '写下你的回答，Enter 提交（留空 = 跳过）' : '当时没有回答，按默认做法推进',
            onChange: (event) => onAnswer(id, event.target.value),
            onKeyDown: (event) => {
              if (event.key !== 'Enter') return
              // 输入框里的回答是受控更新的，Enter 只做“确认该题”：失焦并把输入法状态收掉
              event.preventDefault()
              event.currentTarget?.blur?.()
            },
          }),
      )
    }),

    live
      ? h('div', { style: { ...styles.row, marginTop: 10 } },
        h(Button, {
          primary: true,
          disabled: busy,
          onClick: onGeneratePlan,
          children: busy ? '正在生成计划…' : '继续，生成计划',
        }),
        h('span', { style: styles.smallMuted }, answeredCount ? `已答 ${answeredCount} 题，剩下按默认做法推进。` : '没有回答也可以继续。'),
      )
      : null,
  )
}

/**
 * 计划卡片：工作站自评结论（规模/人天/置信度）+ 依据 + 步骤 + 风险 + 验收。
 * 工程量只读展示，没有任何输入框 —— 用户不填规模与人天。
 */
export function PlanCard({ plan, live, busy, syncBeforeStart = true, onSyncBeforeStartChange, onStartPlan, onAdjustScope, selectedFiles = [], scopeList = [] }) {
  const estimate = plan?.estimate ?? {}
  const steps = Array.isArray(plan?.steps) ? plan.steps : []
  const acceptance = Array.isArray(plan?.acceptance) ? plan.acceptance : []
  const risks = Array.isArray(plan?.risks) ? plan.risks : []
  const basis = Array.isArray(estimate?.basis) ? estimate.basis : []
  const modules = Array.isArray(plan?.modules) ? plan.modules.filter(Boolean) : []
  const confirmedScope = Array.isArray(plan?.scope) && plan.scope.length ? plan.scope : (Array.isArray(scopeList) ? scopeList : [])
  const confirmedFiles = Array.isArray(plan?.files) && plan.files.length ? plan.files : (Array.isArray(selectedFiles) ? selectedFiles : [])

  return h('div', { style: S.planCard },
    h('div', { style: styles.row },
      h(IconSeat, { size: 28 }, '▤'),
      h('strong', { style: styles.sectionTitle }, '开发计划'),
      h(Pill, { tone: 'accent' }, '工作站自评'),
      h(Pill, null, `${steps.length} 步`),
    ),
    plan?.name
      ? h('div', { style: { marginTop: 6, fontSize: T.font.sm, color: T.text2 } },
        h('span', { style: { color: T.text4 } }, '流程标题：'),
        h('span', { style: { fontWeight: 600, color: T.text } }, plan.name))
      : null,
    h('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 12,
        marginTop: 12,
        padding: '12px 16px',
        background: T.surface2,
        borderRadius: T.rBase,
      },
    },
      h(Stat, { label: '规模', value: estimate.size ?? '—' }),
      h(Stat, { label: '人日', value: estimate.days ?? '—' }),
      h(Stat, { label: '置信度', value: confidenceText(estimate.confidence) }),
    ),
    plan?.summary ? h('div', { style: { ...styles.smallMuted, marginTop: 4 } }, String(plan.summary)) : null,

    basis.length
      ? h('div', { style: { marginTop: 6 } },
        h('div', { style: styles.label }, '为什么是这个量级（自评依据）'),
        h('ul', { style: S.list }, basis.map((item, index) => h('li', { key: index, style: styles.smallMuted }, String(item)))),
      )
      : null,

    steps.length
      ? h('div', { style: { marginTop: 6 } },
        h('div', { style: styles.label }, '计划步骤'),
        h('ol', { style: S.stepList }, steps.map((step, index) => h('li', { key: index, style: { marginBottom: 2 } }, String(step)))),
      )
      : h('div', { style: { ...styles.smallMuted, marginTop: 6 } }, '工作站没有返回计划步骤，建议补充描述后重新生成。'),

    risks.length
      ? h('div', { style: S.riskBox },
        h('div', { style: { fontWeight: 600 } }, '风险与注意'),
        h('ul', { style: S.riskList }, risks.map((risk, index) => h('li', { key: index }, String(risk)))),
      )
      : h('div', { style: { ...styles.smallMuted, marginTop: 6 } }, '工作站暂时没有识别到特别风险。'),

    acceptance.length
      ? h('div', { style: { marginTop: 6 } },
        h('div', { style: styles.label }, '验收标准'),
        h('ul', { style: S.list }, acceptance.map((item, index) => h('li', { key: index }, `✓ ${String(item)}`))),
      )
      : h('div', { style: { ...styles.smallMuted, marginTop: 6 } }, '工作站没有返回验收标准。'),

    modules.length
      ? h('div', { style: { ...styles.row, marginTop: 8 } },
        h('span', { style: styles.smallMuted }, '涉及模块：'),
        modules.map((name) => h('span', { key: name, style: styles.pill }, String(name))),
      )
      : null,

    h('div', { style: { marginTop: 10, padding: '10px 12px', borderRadius: T.rBase, background: T.surface2 } },
      h('div', { style: { ...styles.label, marginBottom: 4 } }, '本次确认范围'),
      confirmedScope.length
        ? h('div', { style: { ...styles.row, gap: 6 } },
          confirmedScope.slice(0, 8).map((token) => h('span', { key: token, style: styles.pill }, String(token))),
          confirmedScope.length > 8 ? h('span', { style: styles.smallMuted }, `+${confirmedScope.length - 8}`) : null)
        : h('div', { style: styles.smallMuted }, '未限定范围（按描述与候选文件执行）'),
      h('div', { style: { ...styles.smallMuted, marginTop: 4 } }, `已确认候选文件：${confirmedFiles.length} 个`),
      confirmedFiles.length
        ? h('details', { style: { marginTop: 4 } },
          h('summary', { style: { cursor: 'pointer', fontSize: T.font.sm, color: T.text2 } }, '查看已确认文件'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 } },
            confirmedFiles.slice(0, 40).map((path) => h('span', { key: path, style: { ...styles.mono, fontSize: T.font.xs, color: T.text3, overflowWrap: 'anywhere' } }, String(path))),
            confirmedFiles.length > 40 ? h('span', { style: styles.smallMuted }, `…还有 ${confirmedFiles.length - 40} 个`) : null))
        : null,
    ),

    live
      ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 } },
        h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: T.font.sm, color: T.text2, cursor: 'pointer' } },
          h('input', {
            type: 'checkbox',
            checked: syncBeforeStart,
            disabled: busy,
            onChange: (event) => onSyncBeforeStartChange?.(event.target.checked),
          }),
          '开工前拉取最新代码（git fetch + merge --ff-only）',
        ),
        h('div', { style: styles.row },
          h(Button, {
            primary: true,
            disabled: busy,
            onClick: onStartPlan,
            children: busy ? '正在开工…' : '按这个计划开工',
          }),
          h(Button, { disabled: busy, onClick: onAdjustScope, children: '再调整范围' }),
        ),
      )
      : null,
  )
}

/** 首次确认后要注入 chat-flow 的 Host 调用集合（组件里不重写任何业务规则）。 */
function makeDeps(ctx) {
  return {
    recon: (description, options = {}) => api(API.recon, {
      method: 'POST',
      body: JSON.stringify({
        description,
        ...(Array.isArray(options.attachments) && options.attachments.length ? { attachments: options.attachments } : {}),
        ...(options.repoPath ? { repoPath: options.repoPath } : {}),
      }),
    }),
    attach: (payload) => api(API.attach, { method: 'POST', body: JSON.stringify(payload) }),
    plan: (payload) => api(API.plan, { method: 'POST', body: JSON.stringify(payload) }),
    bootstrap: () => api(API.wizard, { method: 'POST', body: JSON.stringify({ action: 'bootstrap' }) }),
    create: (payload) => api(API.wizard, { method: 'POST', body: JSON.stringify({ action: 'create', ...payload }) }),
    start: (id) => api(API.start, { method: 'POST', body: JSON.stringify({ id }) }),
    sync: (id) => api(API.sync, { method: 'POST', body: JSON.stringify({ id }) }),
    launch: ({ cwd, prompt }) => launchDevSession(ctx, { cwd, prompt, open: false }),
    prompt: launchPrompt,
  }
}

/**
 * 聊天式开发入口：
 * 说一句要做什么 → 工作站扫仓库并追问 → 用户确认文件/范围 + 回答/跳过追问
 * → 工作站出计划（步骤/验收/风险/工程量自评）→ 用户确认 → 建流程并开启开发会话。
 */
/**
 * @param {object} props
 * @param {string|null} [props.scopeId] 作用域：某个流程 id = 专注该流程的开发对话；null/空 = 新建流程
 * @param {string} [props.scopeTitle] 作用域显示名（流程标题）
 */
let spinInjected = false
function ensureSpinKeyframes() {
  if (spinInjected || typeof document === 'undefined') return
  spinInjected = true
  const style = document.createElement('style')
  style.textContent = [
    '@keyframes devhub-spin { to { transform: rotate(360deg) } }',
    '@keyframes devhub-typing { 0%, 80%, 100% { opacity: .25; transform: translateY(0) } 40% { opacity: 1; transform: translateY(-2px) } }',
    '.devhub-typing-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: devhub-typing 1.2s infinite ease-in-out }',
    '.devhub-typing-dot:nth-child(2) { animation-delay: .15s }',
    '.devhub-typing-dot:nth-child(3) { animation-delay: .3s }',
    '.devhub-msg-time { opacity: 0; transition: opacity .15s ease }',
    '.devhub-msg:hover .devhub-msg-time { opacity: 1 }',
  ].join('\n')
  document.head.appendChild(style)
}

/** Windows/Edge 粘贴截图时 files 可能为空，真正内容在 items(kind=file) 里。 */
export function clipboardFiles(clipboard) {
  const direct = Array.from(clipboard?.files ?? [])
  const fromItems = Array.from(clipboard?.items ?? [])
    .filter((item) => item?.kind === 'file')
    .map((item) => { try { return item.getAsFile?.() ?? null } catch { return null } })
    .filter(Boolean)
  const seen = new Set()
  return [...direct, ...fromItems].filter((file) => {
    const key = `${file.name || ''}:${file.type || ''}:${file.size || 0}:${file.lastModified || 0}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function DevHubChat({ ctx, onFlowsChanged, onRequireSetup, onFlowStarted, scopeId = null, scopeTitle = '', lockedRepoPath = null }) {
  const [state, setState] = useState(null)
  const [stateError, setStateError] = useState('')
  const [loadingState, setLoadingState] = useState(true)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState(PHASE.idle)
  const [pending, setPending] = useState(null)
  const [pendingPlan, setPendingPlan] = useState(null)
  const [answers, setAnswers] = useState({})
  // 多轮需求澄清：历史、当前规格、轮次（description 粗，靠几轮问答问准）
  const [clarify, setClarify] = useState(null)
  const [clarifyBusy, setClarifyBusy] = useState(false)
  // 开工前默认先同步代码；用户可在计划卡里取消
  const [syncBeforeStart, setSyncBeforeStart] = useState(true)
  // 长操作的进度反馈：动作名 + 已用秒数（否则只能看着"澄清中…"猜是不是死了）
  const [progress, setProgress] = useState(null)
  // 进行中的任务：{ kind:'recon'|'clarify'|'plan', ...入参, at }；落盘用于"切走再回来续跑"
  const [job, setJob] = useState(null)
  const resumeTriedRef = useRef(false)
  // 图片粘贴 / 文件引用：只存元信息，二进制由 Host 落到本机附件目录
  const [attachments, setAttachments] = useState([])
  const [previewAttachment, setPreviewAttachment] = useState(null)
  const [attachBusy, setAttachBusy] = useState(false)
  const [attachError, setAttachError] = useState('')
  const [capabilities, setCapabilities] = useState(null)
  const attachInputRef = useRef(null)
  // 任务归属：发起任务时所在的对话 id + 运行令牌；切到别的对话后，旧任务的结果不能再写进当前界面
  const activeChatIdRef = useRef(null)
  const runTokenRef = useRef(0)
  // 组件是否还挂着：切走页签后旧请求仍可能返回，不能写进已卸载组件的 state
  // （否则结果“看起来丢了”，再回来只剩旧卡片）。必须改为写回 chat store。
  const mountedRef = useRef(false)
  ensureSpinKeyframes()
  const [clarifyOrigin, setClarifyOrigin] = useState('')
  // 右侧详情面板（像 DSH 的右区）：最终候选文件 + 计划 + 澄清规格
  const [sideOpen, setSideOpen] = useState(true)
  const [rescanBusy, setRescanBusy] = useState(false)
  const [rescanNote, setRescanNote] = useState('')
  const [clarifyTitle, setClarifyTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const clarifyInFlightRef = useRef(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [scopeList, setScopeList] = useState([])
  const endRef = useRef(null)
  const bodyRef = useRef(null)
  const stickRef = useRef(true)
  const inputRef = useRef(null)

  // 澄清也是前台操作：没问完之前不能再点「继续，生成计划」，否则会绕过澄清直接出计划
  const busy = clarifyBusy || phase === PHASE.analyzing || phase === PHASE.planning || phase === PHASE.creating
  const setupRequired = Boolean(state && (state.needsSetup || !state.repo))
  const locked = busy || phase === PHASE.confirm || phase === PHASE.plan || setupRequired || loadingState || Boolean(stateError)

  async function loadState() {
    setLoadingState(true)
    setStateError('')
    try {
      const body = await api(API.state)
      setState(body)
      // 顶栏徽标可能比聊天页晚加载；把聊天自己拿到的 repo/workspace 回报给页面
    } catch (err) {
      setStateError(errorText(err))
    } finally {
      setLoadingState(false)
    }
  }

  // 恢复上次的对话（按项目分区，支持多段历史）：切走面板/页签回来、刷新页面都不该从空白开始
  const restoredRef = useRef(null)
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => { loadState() }, [])
  // 聊天页有自己的项目归属：外部把 activeRepo 切走后自动切回来，
  // 否则整块聊天会重新挂载到另一个项目，看起来像“会话突然丢了”。
  useEffect(() => {
    if (!lockedRepoPath || !state?.repo?.path || state.repo.path === lockedRepoPath) return undefined
    let alive = true
    const restore = async () => {
      try {
        const body = await api(API.switchRepo, {
          method: 'POST',
          body: JSON.stringify({ repoPath: lockedRepoPath, name: state?.profile?.member ?? null, detect: false }),
        })
        if (!alive) return
        setState(body)
        onFlowsChanged?.()
      } catch (err) {
        if (alive) setStateError(`当前项目被切换，且无法切回原项目：${errorText(err)}`)
      }
    }
    restore()
    return () => { alive = false }
  }, [lockedRepoPath, state?.repo?.path])

  // 模型是否支持图片输入：拿不到能力就按"不支持"提示，图片不会被静默丢掉
  useEffect(() => {
    let alive = true
    api(API.capabilities)
      .then((body) => { if (alive) setCapabilities(body) })
      .catch((err) => {
        if (alive) setCapabilities({ images: { supported: false, reason: errorText(err) }, files: { supported: true } })
      })
    return () => { alive = false }
  }, [])


  function applyConversation(conversation) {
    const restored = Array.isArray(conversation?.messages) ? conversation.messages : []
    // 每次恢复都让续跑逻辑重新判断这段对话；进度先清掉，job 存在时下面的 effect 会重新建计时
    resumeTriedRef.current = false
    setProgress(null)
    // 恢复时的幂等：一旦后面已经生成过计划，前面的探测/追问/澄清卡片都锁死，
    // 避免"明明提交过了，重新进来还能再提交一次"
    const hasPlan = restored.some((msg) => msg.kind === 'plan')
    // 去重：同轮澄清卡片、相邻重复的助手文本（历史快照可能因为重复续跑写了两遍）
    const deduped = []
    const seenClarify = new Map()
    for (const msg of restored) {
      if (msg.kind === 'clarify') {
        const prev = seenClarify.get(msg.round)
        if (prev) {
          // 同轮重复：覆盖前一张（保留后写入的、内容更完整的），并把前一张标成已提交
          deduped[prev.index] = { ...deduped[prev.index], resolved: true }
        }
        seenClarify.set(msg.round, { index: deduped.length })
        deduped.push(msg)
        continue
      }
      const last = deduped[deduped.length - 1]
      if (last && msg.role === 'assistant' && last.role === 'assistant' && String(last.text ?? '') === String(msg.text ?? '')) continue
      deduped.push(msg)
    }
    const normalized = hasPlan
      ? deduped.map((msg) => (['recon', 'questions', 'clarify'].includes(msg.kind) ? { ...msg, resolved: true } : msg))
      : deduped
    setMessages(normalized)
    setInput(conversation?.input ?? '')
    setAnswers(conversation?.answers ?? {})
    setSelectedFiles(conversation?.selectedFiles ?? [])
    setScopeList(conversation?.scopeList ?? [])
    setAttachments(normalizeAttachments(conversation?.attachments))
    setAttachError('')
    setPending(conversation?.pending ?? null)
    setPendingPlan(conversation?.pendingPlan ?? null)
    // 关键：切页/刷新回来时任务本身还在跑（或需要续跑），必须把 job 一起恢复，
    // 否则界面没有任何进度，用户会以为已经中断了。
    setJob(conversation?.job ?? null)
    const restoredClarify = conversation?.clarify ?? null
    setClarify(restoredClarify)
    const restoredOrigin = conversation?.clarifyOrigin
      || (normalized.filter((msg) => msg.role === 'user' && String(msg.text ?? '').trim())[0]?.text ?? '')
    setClarifyOrigin(restoredOrigin)
    // 流程标题是用户可改的受控输入：切走/刷新后要恢复，不能用空值覆盖
    setClarifyTitle(String(conversation?.clarifyTitle || conversation?.clarify?.title || ''))
    setTitleTouched(Boolean(conversation?.titleTouched))
    // 兼容旧数据：只有卡片、没有 clarify 上下文时，从最后一张卡补出 description/spec/round
    if (!restoredClarify) {
      const lastCard = [...normalized].reverse().find((msg) => msg.kind === 'clarify')
      if (lastCard && restoredOrigin) {
        setClarify({
          description: restoredOrigin,
          history: [{ role: 'user', text: restoredOrigin }],
          round: lastCard.round ?? 1,
          reply: lastCard.reply ?? '',
          questions: [],
          spec: lastCard.spec ?? {},
          ready: Boolean(lastCard.ready),
          missing: [],
          engine: lastCard.engine ?? 'dsh',
        })
      }
    }
    // 恢复时把"当时在跑"的阶段退回可交互状态；没有**可见且未提交**的确认卡片，
    // 就不能停在 confirm/plan —— 否则输入框会永久禁用，用户以为 agent 不响应了。
    const pending = conversation?.pending ?? null
    const pendingPlan = conversation?.pendingPlan ?? null
    const pendingCard = pending?.messageId ? normalized.find((msg) => msg.id === pending.messageId) : null
    const questionsCard = pending?.questionsId ? normalized.find((msg) => msg.id === pending.questionsId) : null
    const lastClarify = [...normalized].reverse().find((msg) => msg.kind === 'clarify')
    const clarifyActionable = Boolean(lastClarify && !lastClarify.resolved)
    const pendingActionable = Boolean(pending && (
      (pendingCard && !pendingCard.resolved)
      || (questionsCard && !questionsCard.resolved)
      || clarifyActionable
    ))
    const planCard = pendingPlan?.id ? normalized.find((msg) => msg.id === pendingPlan.id) : null
    const planActionable = Boolean(pendingPlan && planCard && !planCard.resolved)
    const safePhase = conversation?.phase === PHASE.plan && planActionable
      ? PHASE.plan
      : conversation?.phase === PHASE.confirm && pendingActionable
        ? PHASE.confirm
        : PHASE.idle
    setPhase(safePhase)
  }

  const scope = String(scopeId ?? '').trim() || 'new'

  useEffect(() => {
    if (!progress) return
    const timer = setInterval(() => {
      setProgress((current) => current ? { ...current, seconds: Math.round((Date.now() - current.startedAt) / 1000) } : current)
    }, 1000)
    return () => clearInterval(timer)
  }, [progress?.startedAt])

  // 从 chat store 恢复 job 后，先给用户一个可见进度（读秒从前端计时；
  // 真正的请求在 Host 执行，切页不会凭空变出一个新任务）。
  useEffect(() => {
    if (!job || progress) return
    const startedAt = Number(job.at) || Date.now()
    const kindLabel = job.kind === 'clarify'
      ? `需求澄清（第 ${Number(job.round) || 1} 轮）`
      : job.kind === 'plan'
        ? '生成开发计划'
        : '扫描仓库'
    setProgress({
      label: `${kindLabel}：已恢复任务，正在等待工作站继续…`,
      startedAt,
      seconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    })
  }, [job, progress])

  useEffect(() => {
    const repoPath = state?.repo?.path
    if (!repoPath) return
    const key = `${repoPath}::${scope}`
    if (restoredRef.current === key) return
    restoredRef.current = key
    const active = getActiveChat(repoPath, scope)
    activeChatIdRef.current = active.id
    setActiveChatId(active.id)
    setChats(listChats(repoPath, scope))
    applyConversation(active.conversation)
  }, [state?.repo?.path, scope])

  // 当前对话 id 供异步任务校验归属：不要在 effect 之外读 state（闭包里会是旧值）
  useEffect(() => { activeChatIdRef.current = activeChatId }, [activeChatId])

  // 任何交互变化都落盘到**当前这段对话的 id**（不是 store.activeId）：
  // 后台任务晚到的结果只能写回发起它的对话，不能串到用户后来打开的另一段对话
  useEffect(() => {
    const repoPath = state?.repo?.path
    if (!repoPath || !activeChatId) return
    if (restoredRef.current !== `${repoPath}::${scope}`) return
    saveChat(repoPath, activeChatId, { messages, input, phase, pending, pendingPlan, answers, selectedFiles, scopeList, attachments, clarify, clarifyOrigin, clarifyTitle, titleTouched, job }, scope)
    setChats(listChats(repoPath, scope))
  }, [state?.repo?.path, scope, activeChatId, messages, input, phase, pending, pendingPlan, answers, selectedFiles, scopeList, attachments, clarify, clarifyOrigin, clarifyTitle, titleTouched, job])

  /** 打开某段历史对话（先保存当前，再切换）。 */
  function openChat(id) {
    const repoPath = state?.repo?.path
    if (!repoPath || id === activeChatId) { setHistoryOpen(false); return }
    saveChat(repoPath, activeChatId, { messages, input, phase, pending, pendingPlan, answers, selectedFiles, scopeList, attachments, clarify, clarifyOrigin, clarifyTitle, titleTouched, job }, scope)
    const target = selectChat(repoPath, id, scope)
    if (!target) return
    // 先更新 ref：旧任务的结果再回来时会被 runIsCurrent 判为过期，不会写进这段对话
    activeChatIdRef.current = target.id
    setActiveChatId(target.id)
    applyConversation(target)
    setChats(listChats(repoPath, scope))
    setHistoryOpen(false)
  }

  /** 显式开一段新对话（旧的保留在历史里）。 */
  function beginNewChat() {
    const repoPath = state?.repo?.path
    if (!repoPath || busy) return
    saveChat(repoPath, activeChatId, { messages, input, phase, pending, pendingPlan, answers, selectedFiles, scopeList, attachments, clarify, clarifyOrigin, clarifyTitle, titleTouched, job }, scope)
    const conversation = startNewChat(repoPath, '新对话', scope)
    activeChatIdRef.current = conversation.id
    setActiveChatId(conversation.id)
    applyConversation(conversation)
    setChats(listChats(repoPath, scope))
    setHistoryOpen(false)
    inputRef.current?.focus?.()
  }

  // 切走/刷新导致中断的长任务：回来自动续跑一次（扫描或澄清），计划类提示手动重试
  useEffect(() => {
    if (resumeTriedRef.current || !state?.repo?.path || !job) return
    if (loadingState) return
    resumeTriedRef.current = true
    // 这段对话已经有一个同类任务在跑（旧组件卸载了但请求还在飞）：不再重复续跑，
    // 由那个任务收尾时清掉 job；跨进程/刷新恢复才真正需要续跑。
    const resumeKind = job.kind === 'clarify' ? 'clarify' : 'recon'
    if (job.kind !== 'plan' && isConversationRunning(state.repo.path, scope, activeChatIdRef.current, resumeKind)) {
      // 旧组件可能已卸载，但它收尾时会把结果写回 chat store；这里轮询等它落盘后再载入，
      // 否则切走再回来会一直停在旧消息上，看起来"agent 不响应"。
      setProgress({ label: '当前扫描/澄清还在处理，结束后会自动继续…', startedAt: Date.now() })
      const repoPath = state.repo.path
      let ticks = 0
      const timer = setInterval(() => {
        ticks += 1
        const origin = getConversation(repoPath, activeChatIdRef.current, scope)
        if (!origin) return
        const stillRunning = isConversationRunning(repoPath, scope, activeChatIdRef.current, resumeKind)
        if (stillRunning && ticks < 100) return
        clearInterval(timer)
        applyConversation(origin)
        setChats(listChats(repoPath, scope))
        if (stillRunning) {
          // 旧请求已经超过 2 分钟没有收尾：不能把“等待”永久留在界面上。
          // 清掉进程内标记与持久化 job，恢复可交互状态；用户可决定是否重发。
          endRun(runKey(repoPath, scope, activeChatIdRef.current, resumeKind))
          clearConversationJob(repoPath, activeChatIdRef.current, scope)
          setJob(null)
          setProgress(null)
          push(stationMessage('上一轮请求超过 2 分钟没有收尾，已停止等待；如果结果没出来，请重新发一句。', { tone: 'warn' }))
        } else {
          setJob(origin.job ?? null)
          setProgress(null)
        }
      }, 1200)
      return () => {
        clearInterval(timer)
        setProgress(null)
      }
    }
    const age = Date.now() - Number(job.at ?? 0)
    if (job.kind === 'clarify') {
      const lastClarify = [...messages].reverse().find((msg) => msg.kind === 'clarify')
      if (lastClarify && Number(lastClarify.round ?? 0) >= Number(job.round ?? 0)) {
        // 这一轮其实已经问出来了（快照里已有卡片）：不要再问一遍
        setJob(null)
        setProgress(null)
        return
      }
      if (Number(job.resumeCount ?? 0) >= 1) {
        push(stationMessage('上次的澄清可能已经完成；如需继续，点最新一轮的「继续补充（再问一轮）」。'))
        setJob(null)
        setProgress(null)
        return
      }
      setJob({ ...job, resumeCount: Number(job.resumeCount ?? 0) + 1 })
    }
    if (age > 15 * 60 * 1000) {
      push(stationMessage('上次的扫描/澄清已中断超过 15 分钟，直接重新发一句即可。', { tone: 'danger' }))
      setJob(null)
      setProgress(null)
      return
    }
    if (job.kind === 'recon') {
      push(stationMessage('刚才的扫描被切走了，已自动重新扫描…'))
      analyze(job.description, { echo: false, extraAttachments: job.attachments })
    } else if (job.kind === 'clarify') {
      push(stationMessage('刚才的澄清被切走了，已自动接着问…'))
      runClarify(job)
    } else if (job.kind === 'plan') {
      push(stationMessage('刚才生成计划时你切走了：确认范围后点「继续，生成计划」重试。'))
      setPhase(PHASE.confirm)
      setJob(null)
      setProgress(null)
    }
  }, [state?.repo?.path, job, loadingState])

  // 扫描结果恢复了，但澄清卡片/job 在切页时丢了：不能直接让用户去点「生成计划」，
  // 否则需求澄清这一环被静默跳过。补一次澄清（卡片存在/job 在跑时不会重复）。
  const clarifyResumeRef = useRef('')
  useEffect(() => {
    if (loadingState || !state?.repo?.path || phase !== PHASE.confirm || !pending?.recon) return
    const conversationId = activeChatIdRef.current
    if (!conversationId || clarifyResumeRef.current === conversationId) return
    if (job || clarifyInFlightRef.current) return
    if (messages.some((msg) => msg.kind === 'clarify')) return
    const description = String(clarifyOrigin || messages.find((msg) => msg.role === 'user' && String(msg.text ?? '').trim())?.text || '').trim()
    if (!description) return
    clarifyResumeRef.current = conversationId
    runClarify({
      description,
      round: 1,
      history: [{ role: 'user', text: description }],
      recon: pending.recon,
      spec: clarify?.spec ?? {},
      attachments: [],
    })
  }, [loadingState, state?.repo?.path, phase, pending, messages, job, clarifyOrigin, clarify])

  // 只有用户本来就贴着底部时才自动滚动；往上翻看历史时不再被拽回去
  useEffect(() => {
    if (!stickRef.current) return
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' })
  }, [messages, phase, progress?.seconds])

  function onBodyScroll() {
    const node = bodyRef.current
    if (!node) return
    stickRef.current = (node.scrollHeight - node.scrollTop - node.clientHeight) < 80
  }

  function push(...items) {
    setMessages((current) => [...current, ...items])
  }

  /** File/Blob → base64（分块拼，避免 8MB 图片触发调用栈上限）。 */
  function bytesToBase64(buffer) {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunk = 0x8000
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
    }
    return btoa(binary)
  }

  /**
   * 粘贴/拖入/选择文件：先传到 Host 落盘，再把附件元信息挂到本条消息。
   * 图片要求当前模型支持图片输入；不支持就明确提示（不静默丢弃）。
   */
  async function addFiles(fileList) {
    const files = Array.from(fileList ?? []).filter(Boolean)
    if (!files.length || attachBusy) return
    if (locked) return
    setAttachError('')
    setAttachBusy(true)
    try {
      for (const file of files) {
        const isImage = /^image\//.test(String(file.type ?? ''))
        if (isImage && capabilities && capabilities.images?.supported === false) {
          setAttachError(`当前模型不支持图片输入：${capabilities.images.reason ?? '模型未声明图片能力'}。可以改用文件引用或文字描述。`)
          continue
        }
        if (Number(file.size) > ATTACHMENT_MAX_BYTES) {
          setAttachError(`文件太大：${file.name ?? '附件'}（上限 ${Math.round(ATTACHMENT_MAX_BYTES / 1024 / 1024)}MB）`)
          continue
        }
        if (attachments.length >= 8) {
          setAttachError('一条需求最多带 8 个附件')
          break
        }
        const data = bytesToBase64(await file.arrayBuffer())
        const body = await api(API.attach, {
          method: 'POST',
          body: JSON.stringify({
            name: file.name || (isImage ? '粘贴的图片' : '附件'),
            mediaType: file.type || 'application/octet-stream',
            data,
          }),
        })
        if (body.capabilities) setCapabilities(body.capabilities)
        if (body.attachment) {
          setAttachments((current) => normalizeAttachments([...current, body.attachment]))
        }
      }
    } catch (err) {
      setAttachError(`附件上传失败：${errorText(err)}`)
    } finally {
      setAttachBusy(false)
    }
  }

  function onPasteFiles(event) {
    const files = clipboardFiles(event.clipboardData)
    if (!files.length) return // 普通文字粘贴交给输入框
    event.preventDefault()
    addFiles(files)
  }

  function onDropFiles(event) {
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (!files.length) return
    event.preventDefault()
    addFiles(files)
  }

  function removeAttachment(id) {
    setAttachments((current) => current.filter((entry) => entry.id !== id))
    setAttachError('')
  }

  /** 是否支持图片输入（能力未探测到时按"允许尝试"处理，上传后会再校准）。 */
  const imageInputSupported = capabilities?.images?.supported !== false

  /**
   * 任务归属：发起时记住是**哪段对话**，结果回来时校验。
   * 不匹配说明用户已经切到别的对话（或又开了新流程）——只清任务，不写当前界面，
   * 否则就会把 A 流程的扫描/澄清结果输出到 B 流程的对话里。
   */
  function startRun(conversationId) {
    runTokenRef.current += 1
    return { token: runTokenRef.current, conversationId }
  }

  function runIsCurrent(run) {
    if (!mountedRef.current) return false
    if (!run || run.token !== runTokenRef.current || run.conversationId !== activeChatIdRef.current) return false
    // 组件卸载后本地 ref 不会变；再对一次 store 里真正 active 的对话 id。
    // 用户在别的入口开了新流程时，旧组件的结果必须走"写回原对话"而不是写当前界面。
    const repoPath = state?.repo?.path
    if (repoPath && run.conversationId) {
      const activeId = getActiveConversationId(repoPath, scope)
      if (activeId && activeId !== run.conversationId) return false
    }
    return true
  }

  /** 收尾：即使组件已卸载也要清掉发起它的那段对话的 job（否则下次挂载会重复续跑）。 */
  function finishRun(run, key) {
    endRun(key)
    const repoPath = state?.repo?.path
    if (repoPath && run?.conversationId) clearConversationJob(repoPath, run.conversationId, scope)
    if (runIsCurrent(run)) setJob(null)
  }

  /**
   * 扫描结果晚到、用户已经切走：写回**发起它的那段对话**。
   * 这样既不丢结果，也不会像以前那样把消息追加到用户后来打开的那段对话里。
   */
  function persistReconToOrigin(run, probed) {
    const repoPath = state?.repo?.path
    if (!repoPath || !run?.conversationId) return
    const origin = getConversation(repoPath, run.conversationId, scope)
    if (!origin) return
    const recon = probed?.recon ?? {}
    const card = reconMessage(recon, probed?.draft)
    const files = Array.isArray(recon.files) ? recon.files : []
    saveChat(repoPath, run.conversationId, {
      messages: [...(origin.messages ?? []), stationMessage(summarizeRecon(recon)), card],
      pending: { ...probed, messageId: card.id },
      pendingPlan: null,
      answers: {},
      selectedFiles: files.map((file) => String(file?.path ?? '')).filter(Boolean),
      scopeList: uniqueTokens(Array.isArray(recon.suggestedScope) ? recon.suggestedScope : []),
      phase: PHASE.confirm,
      job: null,
    }, scope)
  }

  /** 澄清结果晚到、用户已经切走：同样写回原对话（卡片还能继续答）。 */
  function persistClarifyToOrigin(run, payload, { description, history }) {
    const repoPath = state?.repo?.path
    if (!repoPath || !run?.conversationId) return
    const origin = getConversation(repoPath, run.conversationId, scope)
    if (!origin) return
    const card = clarifyMessage(payload)
    saveChat(repoPath, run.conversationId, {
      messages: [
        ...(origin.messages ?? []),
        stationMessage(payload.degraded ? `（澄清降级为本地规则：${payload.reason ?? '工作站不可用'}）` : payload.reply),
        card,
      ],
      ...(origin.pending ? { pending: { ...origin.pending, questionsId: card.id } } : {}),
      clarify: { ...(origin.clarify ?? {}), description, history, ...payload },
      job: null,
    }, scope)
  }

  /**
   * 计划结果晚到、用户已经切走：把计划与已确认的卡片写回原对话。
   * 不这样做的话，切页签回来会停留在 confirm 阶段，但计划已经生成过，看起来“按钮点不动”。
   */
  function persistPlanToOrigin(run, { plan, files, answers, scopeList, pending }) {
    const repoPath = state?.repo?.path
    if (!repoPath || !run?.conversationId || !plan) return
    const origin = getConversation(repoPath, run.conversationId, scope)
    if (!origin) return
    // 澄清阶段总结出来的标题：用户改过就以用户为准（和在线路径保持一致）
    if (currentTitle()) plan.name = currentTitle()
    const card = planMessage(plan)
    const snapshot = { ...(answers ?? {}) }
    const messages = (origin.messages ?? []).map((item) => {
      if (item.id === pending?.messageId) return { ...item, resolved: true, confirmedFiles: files, confirmedScope: scopeList }
      if (pending?.questionsId && item.id === pending.questionsId) return { ...item, resolved: true, answers: snapshot }
      return item
    })
    messages.push(stationMessage(summarizePlan(plan)), card)
    saveChat(repoPath, run.conversationId, {
      messages,
      pendingPlan: { id: card.id, plan },
      phase: PHASE.plan,
      selectedFiles: files,
      scopeList,
      answers: snapshot,
      job: null,
    }, scope)
  }

  /** 清空当前这轮交互（保留对话历史）。 */
  function resetFlow() {
    setPending(null)
    setPendingPlan(null)
    setAnswers({})
    setSelectedFiles([])
    setScopeList([])
    setAttachments([])
    setAttachError('')
    setPhase(PHASE.idle)
  }

  /** 用户勾选后真正要带进上下文/计划的文件。 */
  function confirmedFiles() {
    return (pending?.recon?.files ?? []).filter((file) => selectedFiles.includes(String(file?.path ?? '')))
  }

  /** 扫描 + 第一轮澄清：send() 与"恢复续跑"共用（echo=false 时不重复插入用户气泡）。 */
  async function analyze(text, { echo = true, extraAttachments = null } = {}) {
    const usedAttachments = normalizeAttachments(extraAttachments ?? attachments)
    const repoPath = state?.repo?.path
    const conversationId = activeChatIdRef.current
    const key = runKey(repoPath, scope, conversationId, 'recon')
    // 同一段对话不允许并行两次扫描：否则两次结果会交错写进同一段对话
    if (!beginRun(key)) {
      push(stationMessage('上一次扫描还没结束：等它回来再发，或点「新对话」另开一段。', { tone: 'warn' }))
      return
    }
    const run = startRun(conversationId)
    setPhase(PHASE.analyzing)
    if (echo) push(userMessage(text, usedAttachments))
    setJob({ kind: 'recon', description: text, attachments: usedAttachments, at: Date.now() })
    setProgress({ label: '扫描仓库：让 dsh 找可能要改的文件', startedAt: Date.now(), seconds: 0 })
    try {
      const probed = await probeCode(makeDeps(ctx), text, { attachments: usedAttachments, repoPath: state?.repo?.path })
      // 用户已经切到别的对话/开了新流程：结果写回原对话，不能写进当前界面
      if (!runIsCurrent(run)) {
        persistReconToOrigin(run, probed)
        return
      }
      const recon = probed.recon ?? {}
      const card = reconMessage(recon, probed.draft)
      const files = Array.isArray(recon.files) ? recon.files : []
      setPending({ ...probed, messageId: card.id })
      setPendingPlan(null)
      setAnswers({})
      setSelectedFiles(files.map((file) => String(file?.path ?? '')).filter(Boolean))
      setScopeList(uniqueTokens(Array.isArray(recon.suggestedScope) ? recon.suggestedScope : []))
      push(stationMessage(summarizeRecon(recon)), card)
      setPhase(PHASE.confirm)
      setClarifyOrigin(text)
      // 需求通常很粗：先用 dsh 走一轮澄清（后续可多轮），问准"到底解决什么问题"
      await runClarify({ description: text, round: 1, history: [{ role: 'user', text }], recon, spec: {}, attachments: usedAttachments })
    } catch (err) {
      if (runIsCurrent(run)) {
        push(stationMessage(`探测失败：${errorText(err)}（可重试）`, { tone: 'danger' }))
        setPhase(PHASE.idle)
      }
    } finally {
      if (runIsCurrent(run)) setProgress(null)
      finishRun(run, key)
    }
  }

  async function send() {
    const text = input.trim()
    if (locked) return
    if (!text) {
      setAttachError(attachments.length ? '附件已就绪：再补一句要做什么（Enter 发送）' : '')
      return
    }
    setInput('')
    // 发出后输入区不再保留图片；消息气泡里仍保留可点击预览的附件
    const pendingAttachments = attachments
    setAttachments([])
    stickRef.current = true
    await analyze(text, { extraAttachments: pendingAttachments })
  }

  const currentTitle = () => clarifyTitle || clarify?.title || ''

  /** 调一次澄清：把「用户这句话 + 已有问答」交给 dsh，拿回 reply/questions/spec/title。 */
  async function runClarify({ description, round, history, recon, spec, attachments: chosenAttachments = null }) {
    // 并发保护：同一时刻只允许一次澄清请求（避免重复续跑/双击写出两张同轮卡片）
    if (clarifyInFlightRef.current) return null
    const usedAttachments = normalizeAttachments(chosenAttachments ?? attachments)
    const repoPath = state?.repo?.path
    const conversationId = activeChatIdRef.current
    const key = runKey(repoPath, scope, conversationId, 'clarify')
    if (!beginRun(key)) return null
    clarifyInFlightRef.current = true
    const run = startRun(conversationId)
    setClarifyBusy(true)
    setJob({ kind: 'clarify', description, round, history, recon, spec, attachments: usedAttachments, at: Date.now() })
    setProgress({ label: `需求澄清（第 ${round} 轮）：dsh 正在结合仓库证据整理问题`, startedAt: Date.now(), seconds: 0 })
    try {
      const body = await api(API.clarify, {
        method: 'POST',
        body: JSON.stringify({ description, round, history, recon, spec, attachments: usedAttachments }),
      })
      const payload = {
        round: body.round ?? round,
        // 标题：agent 每轮给一个建议；用户手动改过就不再覆盖
        title: titleTouched ? currentTitle() : (body.title ?? ''),
        reply: body.reply ?? '',
        questions: body.questions ?? [],
        spec: body.spec ?? spec ?? {},
        ready: Boolean(body.ready),
        missing: body.missing ?? [],
        engine: body.engine ?? 'dsh',
        elapsedMs: body.elapsedMs ?? null,
        degraded: Boolean(body.degraded),
        // 需求关联：评审/开发之外，澄清子代理也要能回到这条需求下
        sessionId: body.sessionId ?? null,
      }
      // 切到别的对话了：这轮澄清结果只属于原来的对话（写回去，不丢也不串）
      if (!runIsCurrent(run)) {
        persistClarifyToOrigin(run, payload, { description, history })
        return null
      }
      if (!titleTouched && body.title) setClarifyTitle(String(body.title))
      setClarify((current) => ({ ...(current ?? {}), description, history, ...payload }))
      const card = clarifyMessage(payload)
      setPending((current) => current ? { ...current, questionsId: card.id } : current)
      push(stationMessage(payload.degraded ? `（澄清降级为本地规则：${body.reason ?? '工作站不可用'}）` : payload.reply), card)
      return payload
    } catch (err) {
      if (runIsCurrent(run)) push(stationMessage(`澄清失败：${errorText(err)}`, { tone: 'danger' }))
      return null
    } finally {
      clarifyInFlightRef.current = false
      if (runIsCurrent(run)) {
        setClarifyBusy(false)
        setProgress(null)
      }
      finishRun(run, key)
    }
  }

  /** 按最新讨论重扫：把澄清历史里的用户回答拼进描述，再让 dsh 找一次文件。 */
  async function rescan() {
    if (rescanBusy) return
    const repoPath = state?.repo?.path
    const conversationId = activeChatIdRef.current
    const runKeyRescan = runKey(repoPath, scope, conversationId, 'rescan')
    if (!beginRun(runKeyRescan)) return
    const run = startRun(conversationId)
    const base = String(clarify?.description || clarifyOrigin || pending?.description || '').trim()
    if (base.length < 2) { setRescanNote('原始描述丢了，先重新说一句需求'); return }
    const extra = (clarify?.history ?? [])
      .filter((turn) => turn.role === 'user')
      .map((turn) => turn.text)
      .filter((text) => text && text !== base)
      .slice(-6)
      .join('\n')
    const enriched = extra ? `${base}\n\n补充说明：\n${extra}` : base
    setRescanBusy(true)
    setRescanNote('正在按最新讨论重新扫描…')
    try {
      const probed = await probeCode(makeDeps(ctx), enriched, { repoPath: state?.repo?.path })
      if (!runIsCurrent(run)) return
      const recon = probed.recon ?? {}
      const files = Array.isArray(recon.files) ? recon.files : []
      setPending((current) => (current
        ? { ...current, recon: { ...(current.recon ?? {}), ...recon }, description: enriched }
        : current))
      setSelectedFiles(files.map((file) => String(file?.path ?? '')).filter(Boolean))
      setScopeList(uniqueTokens(Array.isArray(recon.suggestedScope) ? recon.suggestedScope : []))
      setRescanNote(`已按最新讨论重扫：命中 ${files.length} 个文件${files.length ? '' : '（可能是描述还不够具体）'}`)
    } catch (err) {
      if (runIsCurrent(run)) setRescanNote(`重扫失败：${errorText(err)}`)
    } finally {
      if (runIsCurrent(run)) setRescanBusy(false)
      finishRun(run, runKeyRescan)
    }
  }

  /** 提交这一轮答案：把回答拼成一句话继续问；ready 或到轮次上限就收口。 */
  /** 找到这次对话最初那句话（恢复后 clarify 上下文丢失时的兜底）。 */
  function originDescription() {
    const first = (messages ?? []).find((msg) => msg.role === 'user' && String(msg.text ?? '').trim())
    return String(first?.text ?? '').trim()
  }

  /** 已提交的澄清卡：继续问下一轮（带上已有 spec 与历史）。 */
  async function continueClarify(card) {
    if (clarifyBusy) return
    const description = String(
      clarify?.description || clarifyOrigin || pending?.description || originDescription(),
    ).trim()
    if (description.length < 2) {
      push(stationMessage('原始描述丢了（可能刷新过页面）。请在下面重新说一句「要做什么」。', { tone: 'danger' }))
      return
    }
    const history = clarify?.history?.length
      ? clarify.history
      : [{ role: 'user', text: description }]
    await runClarify({
      description,
      round: (card?.round ?? 1) + 1,
      history,
      recon: pending?.recon,
      spec: card?.spec ?? clarify?.spec ?? {},
    })
  }

  async function submitClarify(card) {
    // 防重复提交：正在跑、或这张卡已经提交过，都不再发一次
    if (clarifyBusy || card?.resolved) return
    const questions = card?.questions ?? []
    const answered = questions
      .map((question) => {
        const value = answers[question.id]
        const text = typeof value === 'string' ? value : [value?.selected?.join('、'), value?.custom].filter(Boolean).join('；')
        return text ? `${question.question} → ${text}` : null
      })
      .filter(Boolean)
    const reply = answered.length ? answered.join('\n') : '（这轮没有问题可答）'
    const description = String(
      clarify?.description
      || clarifyOrigin
      || pending?.description
      || pending?.draft?.raw
      || originDescription(),
    ).trim()
    if (description.length < 2) {
      push(stationMessage('这次对话的原始描述丢了（可能刷新过页面）。请在下面重新说一句「要做什么」，我接着问。', { tone: 'danger' }))
      setPhase(PHASE.idle)
      return
    }
    // 记住这一轮的答案并锁住卡片：重新进对话时可以回看，但不能再提交
    const nextMessages = messages.map((msg) => (msg.id === card?.id
      ? { ...msg, resolved: true, answers: { ...answers } }
      : msg)).concat(userMessage(reply))
    setMessages(nextMessages)
    // 副作用落盘要等下一次 render；如果用户点完答案立刻切页签，等不到那次 effect。
    // 这里先同步写一次，保证“已提交的卡片 + 用户回答”在切走前就进了 chat store。
    const repoPath = state?.repo?.path
    const conversationId = activeChatIdRef.current
    if (repoPath && conversationId) {
      saveChat(repoPath, conversationId, {
        messages: nextMessages,
        pending,
        answers,
        selectedFiles,
        scopeList,
        attachments,
        clarify,
        phase,
      }, scope)
    }
    const history = [...(clarify?.history ?? []), { role: 'assistant', text: card?.reply ?? '' }, { role: 'user', text: reply }]
    const nextRound = (card?.round ?? 1) + 1
    const round = card?.ready || nextRound > MAX_CLARIFY_ROUNDS ? MAX_CLARIFY_ROUNDS : nextRound
    await runClarify({ description, round, history, recon: pending?.recon, spec: card?.spec ?? clarify?.spec ?? {} })
  }

  /** 澄清卡片的选择/自由回答（按问题 id 合并成 {selected, custom}）。 */
  function setClarifyAnswer(id, patch) {
    setAnswers((current) => {
      const prev = current[id] && typeof current[id] === 'object' ? current[id] : { selected: [], custom: '' }
      // 多选走函数式 toggle：连续快速点选时不会拿旧 render 的 selected 覆盖前一次
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'toggle')) {
        const selected = Array.isArray(prev.selected) ? prev.selected : []
        const next = selected.includes(patch.toggle)
          ? selected.filter((item) => item !== patch.toggle)
          : [...selected, patch.toggle]
        const { toggle, ...rest } = patch
        return { ...current, [id]: { ...prev, ...rest, selected: next } }
      }
      return { ...current, [id]: { ...prev, ...patch } }
    })
  }

  function toggleFile(path) {
    setSelectedFiles((current) => current.includes(path)
      ? current.filter((entry) => entry !== path)
      : [...current, path])
  }

  function toggleScope(token) {
    setScopeList((current) => current.includes(token)
      ? current.filter((entry) => entry !== token)
      : [...current, token])
  }

  function addScope(token) {
    setScopeList((current) => uniqueTokens([...current, token]))
  }

  function removeScope(token) {
    setScopeList((current) => current.filter((entry) => entry !== token))
  }

  /** 追问答案：选择题存原始 value（可能是对象），再点一次传入 null 表示取消。 */
  function setAnswer(id, value) {
    const key = String(id ?? '').trim()
    if (!key) return
    setAnswers((current) => {
      const next = { ...current }
      const empty = value === undefined || value === null || (typeof value === 'string' && !value.trim())
      if (empty) delete next[key]
      else next[key] = value
      return next
    })
  }

  function reDescribe() {
    resetFlow()
    inputRef.current?.focus?.()
  }

  /** 由工作站生成计划：用户不填任何工程量，数字全部来自 Host 自评。 */
  async function continueToPlan() {
    if (!pending || busy) return
    const repoPath = state?.repo?.path
    const conversationId = activeChatIdRef.current
    // 这段对话已经不是 store 里的 active：很可能是“新建流程”后旧组件还没卸载，
    // 不能再拿旧 pending 去生成计划/建流程。
    const activeId = repoPath ? getActiveConversationId(repoPath, scope) : null
    if (activeId && conversationId && activeId !== conversationId) {
      push(stationMessage('这段对话已经切走了：请回到最新对话再继续，或点「重新描述」开一段新的。', { tone: 'warn' }))
      return
    }
    // 恢复旧对话时 pending 可能字段不全：从 clarify/首条用户消息/扫描结果兜底，
    // 否则切页回来点「继续，生成计划」会静默失败。
    const description = String(
      pending.description || clarify?.description || clarifyOrigin || originDescription(),
    ).trim()
    if (!description) {
      push(stationMessage('原始描述丢了：请在下面重新说一句「要做什么」。', { tone: 'danger' }))
      return
    }
    const scopes = scopeList.length
      ? scopeList
      : uniqueTokens(Array.isArray(pending.recon?.suggestedScope) ? pending.recon.suggestedScope : [])
    if (!scopes.length) {
      push(stationMessage('还没有可用的改动范围：请在上方确认目录/模块，或点「重新描述」再扫一次。', { tone: 'warn' }))
      return
    }
    const key = runKey(repoPath, scope, conversationId, 'plan')
    if (!beginRun(key)) {
      push(stationMessage('上一次生成计划还没结束：稍等它收尾再试，避免重复生成。', { tone: 'warn' }))
      return
    }
    const run = startRun(conversationId)
    const files = confirmedFiles().length
      ? confirmedFiles()
      : (pending.recon?.files ?? []).map((file) => String(file?.path ?? '')).filter(Boolean)
    setPhase(PHASE.planning)
    setJob({ kind: 'plan', description, scope: [...scopes], files, answers: { ...answers }, tokens: pending.recon?.tokens ?? [], at: Date.now() })
    try {
      const plan = await generatePlan(makeDeps(ctx), {
        description,
        scope: scopes,
        recon: { tokens: pending.recon?.tokens ?? [], files },
        answers,
        // 澄清过的规格带进计划：摘要与目标用规范化后的说法
        spec: clarify?.spec ?? {},
      })
      // 用户已经切走（换对话或换页签）：计划只属于发起它的那段对话，写回 store，不能只丢在已卸载组件里
      if (!runIsCurrent(run)) {
        persistPlanToOrigin(run, { plan, files, answers, scopeList: scopes, pending })
        return
      }
      // 把当时的勾选与回答快照进消息：之后清空交互态，历史卡片仍显示“当时确认了什么”
      const snapshot = { ...answers }
      setMessages((current) => current.map((item) => {
        if (item.id === pending.messageId) return { ...item, resolved: true, confirmedFiles: files, confirmedScope: [...scopes] }
        if (pending.questionsId && item.id === pending.questionsId) return { ...item, resolved: true, answers: snapshot }
        return item
      }))
      // 澄清阶段总结出来的标题：作为流程标题带入创建（用户改过就以用户为准）
      if (currentTitle()) plan.name = currentTitle()
      const card = planMessage(plan)
      setPendingPlan({ id: card.id, plan })
      push(stationMessage(summarizePlan(plan)), card)
      setPhase(PHASE.plan)
    } catch (err) {
      if (runIsCurrent(run)) {
        push(stationMessage(`生成计划失败：${errorText(err)}（可补充描述或调整范围后重试）`, { tone: 'danger' }))
        setPhase(PHASE.confirm)
      }
    } finally {
      finishRun(run, key)
    }
  }

  /** 计划已确认：带计划与追问答案建流程，并开启开发会话。 */
  async function startPlanned() {
    if (!pending || !pendingPlan || busy) return
    const repoPath = state?.repo?.path
    const conversationId = activeChatIdRef.current
    // 同上：旧组件/旧计划不能在新对话里“幽灵开工”
    const activeId = repoPath ? getActiveConversationId(repoPath, scope) : null
    if (activeId && conversationId && activeId !== conversationId) return
    const key = runKey(repoPath, scope, conversationId, 'create')
    if (!beginRun(key)) return
    const run = startRun(conversationId)
    const planData = pendingPlan.plan ?? {}
    const files = confirmedFiles()
    setPhase(PHASE.creating)
    try {
      const result = await confirmAndStart(makeDeps(ctx), {
        description: pending.description,
        draft: pending.draft,
        scope: scopeList,
        recon: { tokens: pending.recon?.tokens ?? [], files, scanSessionId: pending.recon?.scanSessionId ?? null },
        clarifySessionId: clarify?.sessionId ?? null,
        firstRun: Boolean(state?.firstRun),
        cwd: state?.repo?.path,
        summary: planData.summary,
        steps: planData.steps,
        acceptance: planData.acceptance,
        estimate: planData.estimate,
        // 随需求提供的截图/文件：一起入库，Context Pack 带路径给开发会话
        attachments: normalizeAttachments(pending.attachments ?? attachments),
        // 澄清阶段概括出来的标题：Host 用它替换"用户输入第一行"这类弱标题
        title: planData.name || currentTitle(),
        answers,
        // 需求规范化：把澄清 agent 得出的规格交给 Host 落库（目标/根因/验收），
        // 而不是让 Host 拿客户原话兜底。
        spec: clarify?.spec ?? {},
        questions: Array.isArray(pending.recon?.questions) ? pending.recon.questions : [],
        syncBeforeStart,
      })
      // 用户已经切到别的对话：流程照样会建好（Host 侧），但消息不能写进当前这段对话
      if (!runIsCurrent(run)) { onFlowsChanged?.(); return }
      push(...(result.messages ?? []))
      if (result.item?.requirement?.needsReview) {
        push(stationMessage(
          '提醒：这次没拿到工作站总结后的需求（目标/根因还是客户原话，已标记待规范化）。到「流程」详情页点「让工作站规范化」再开工，效果更稳。',
          { tone: 'warn' },
        ))
      }
      // 会话联动：把刚开启的 DSH 会话绑到流程上，工作站据此追踪状态/跳回会话。
      if (result.sessionId && result.item?.id) {
        try {
          await api(API.session, { method: 'POST', body: JSON.stringify({ action: 'bind', id: result.item.id, sessionId: result.sessionId }) })
          if (runIsCurrent(run)) push(stationMessage('已把这个会话关联到本流程。'))
        } catch (error) {
          if (runIsCurrent(run)) {
            push(stationMessage(`流程已建好，但会话关联失败：${errorText(error)}。可在「流程」详情里手动重试。`, { tone: 'danger' }))
          }
        }
      }
      if (runIsCurrent(run)) {
        // 先记下这条对话已创建流程：需求澄清工作区据此显示「已进入开发」而不是「计划待确认」
        if (repoPath && conversationId && result.item?.id) {
          saveChat(repoPath, conversationId, {
            flowId: result.item.id,
            flowTitle: result.item.title ?? '',
            startedAt: new Date().toISOString(),
            job: null,
          }, scope)
        }
        resetFlow()
        // 已经按计划开工：直接跳到这条流程的详情，用户在「流程」页继续标准流程，
        // 不再停在聊天页等用户自己找（聊天记录已持久化，回来还能看到）。
        if (result.item?.id) onFlowStarted?.(result.item.id)
      }
      onFlowsChanged?.()
    } catch (err) {
      // 失败必须给出中文原因；此时流程可能已经建好，引导去「流程」页确认而不是原地重试（避免重复建流程）。
      if (runIsCurrent(run)) {
        push(stationMessage(
          `创建失败：${errorText(err)}。若流程已经建立，请到「流程」页继续；也可以改一下描述重新探测。`,
          { tone: 'danger' },
        ))
        resetFlow()
      }
      onFlowsChanged?.()
    } finally {
      finishRun(run, key)
    }
  }

  /** 回到范围确认：改完文件/范围或追问答案后重新生成计划。 */
  function adjustScope() {
    if (busy) return
    setPhase(PHASE.confirm)
    push(stationMessage('已回到范围确认：改完文件/范围或追问答案后，重新点「继续，生成计划」。'))
  }

  function onKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent?.isComposing) return // 中文输入法组字中不发送
    event.preventDefault()
    send()
  }

  const scopeLabel = scope === 'new' ? '新建开发流程' : (scopeTitle || scope)

  const hint = clarifyBusy
    ? '工作站正在结合仓库证据整理澄清问题…'
    : phase === PHASE.analyzing
      ? '工作站正在调用 dsh 扫仓库（通常 30~90 秒，会真的读代码）…'
      : phase === PHASE.planning
      ? '工作站正在出计划：步骤、验收、风险与工程量自评…'
      : phase === PHASE.creating
          ? '正在建立开发流程并开启开发会话…'
          : phase === PHASE.confirm
            ? '先确认文件/范围与追问，再让工作站生成计划。'
            : phase === PHASE.plan
              ? '计划已生成：确认后按计划开工，或点「再调整范围」改完重算。'
              : 'Enter 发送 · Shift+Enter 换行'
  const sendLabel = clarifyBusy
    ? '澄清中…'
    : phase === PHASE.analyzing
      ? '正在扫描…'
      : phase === PHASE.planning
        ? '正在生成计划…'
        : phase === PHASE.creating ? '正在创建…' : '发送'

  /** 相邻且内容完全相同的用户消息只显示一条（历史遗留的重复提交气泡）。 */
  function visibleMessages() {
    return messages.filter((msg, index) => {
      if (msg?.role !== 'user') return true
      const prev = messages[index - 1]
      return !(prev?.role === 'user' && String(prev.text ?? '') === String(msg.text ?? ''))
    })
  }

  function renderBody() {
    if (loadingState && !state && !stateError) {
      return h('div', { style: { padding: '16px 18px' } }, h('div', { style: styles.smallMuted }, '正在读取工作站状态…'))
    }
    if (stateError) {
      return h('div', { style: { padding: '16px 18px' } },
        h('div', { style: styles.dangerCard },
          h('div', { style: { fontWeight: 600 } }, '读取工作站状态失败'),
          h('div', null, stateError),
        ),
        h('div', { style: { ...styles.row, marginTop: 10 } },
          h(Button, { onClick: loadState, children: '重试' }),
        ),
      )
    }
    if (setupRequired) {
      return h('div', { style: { padding: '16px 18px' } },
        h('div', { style: styles.warnCard },
          h('div', { style: { fontWeight: 600 } }, '请先在“流程”页完成项目初始化'),
          h('div', { style: { marginTop: 4 } }, '工作站需要一个项目路径才能扫仓库、建流程和开启开发会话。'),
        ),
        h('div', { style: { ...styles.row, marginTop: 10 } },
          h(Button, { primary: true, onClick: () => onRequireSetup?.(), children: '去“流程”页初始化' }),
        ),
      )
    }
    return h('div', { style: S.body, ref: bodyRef, onScroll: onBodyScroll },
      h('div', { style: S.canvas },
        messages.length
          ? visibleMessages().map((msg) => h(MessageRow, {
            key: msg.id,
            msg,
            live: Boolean(pending && pending.messageId === msg.id && phase === PHASE.confirm && !msg.resolved),
            questionsLive: Boolean(pending && pending.questionsId === msg.id && (phase === PHASE.confirm || phase === PHASE.planning)),
            planLive: Boolean(pendingPlan && pendingPlan.id === msg.id && (phase === PHASE.plan || phase === PHASE.creating)),
            selectedFiles,
            scopeList,
            answers,
            busy,
            hasQuestions: Boolean(pending?.questionsId),
            onToggleFile: toggleFile,
            onToggleScope: toggleScope,
            onAddScope: addScope,
            onRemoveScope: removeScope,
            onReDescribe: reDescribe,
            onAnswer: setAnswer,
            onGeneratePlan: continueToPlan,
            onStartPlan: startPlanned,
            onAdjustScope: adjustScope,
            syncBeforeStart,
            onSyncBeforeStartChange: setSyncBeforeStart,
            clarifyBusy,
            onPreviewAttachment: setPreviewAttachment,
            // 流程标题是受控输入：漏传这两个 prop 会让输入框永远回到空值（打字被“冲掉”）
            clarifyTitle,
            onClarifyTitleChange: (value) => {
              setTitleTouched(true)
              setClarifyTitle(value)
            },
            onClarifyPick: setClarifyAnswer,
            onClarifySubmit: submitClarify,
            onClarifyContinue: continueClarify,
          }))
          : h('div', null,
            h(EmptyState, {
              icon: '◈',
              title: '说说你要做什么',
              hint: '我会自己扫一遍仓库，列出可能要改的文件与命中行；不懂的地方会问你几个问题（可以跳过）。',
            }),
            h('div', { style: { ...styles.card, marginTop: 12 } },
              h('div', { style: styles.sectionTitle }, '我会怎么推进'),
              h('div', { style: { marginTop: 8, color: T.text3, fontSize: T.font.sm, lineHeight: T.line } },
                '1. 扫描仓库，给出候选文件与命中行；2. 不懂的地方向你追问；3. 自己出计划（规模/人天/步骤/验收，附依据）；4. 你确认后建流程并开启开发会话。'),
              h('div', { style: { marginTop: 8, color: T.text4, fontSize: T.font.sm } },
                '例如：把关卡状态回传从同步改成异步，解决连接池被远端 IO 占满的问题。'),
            ),
          ),
        progress
          ? h('div', { style: { ...S.stationRow, marginTop: 2 } },
            h(IconSeat, { size: 28 }, '◈'),
            h('div', { style: S.stationBody },
              h('div', { style: S.stationName }, '开发工作站'),
              h('div', { style: { ...S.stationCard, display: 'flex', alignItems: 'center', gap: 10 } },
                h('span', { style: { display: 'inline-flex', gap: 3, color: T.brand } },
                  h('span', { className: 'devhub-typing-dot' }),
                  h('span', { className: 'devhub-typing-dot' }),
                  h('span', { className: 'devhub-typing-dot' })),
                h('span', { style: { color: T.text2, fontSize: T.font.sm } }, progress.label),
                h('span', { style: { ...styles.mono, color: T.text4, fontSize: T.font.xs } }, `${progress.seconds}s`),
              ),
            ),
          )
          : null,
        h('div', { ref: endRef }),
      ),
    )
  }

  /** 右侧详情：候选文件、计划、已澄清规格；随讨论更新。 */
  function renderSide() {
    const recon = pending?.recon ?? null
    const files = Array.isArray(recon?.files) ? recon.files : []
    const members = reconMembers(recon)
    // 侧栏保留全部候选（大改动可能命中很多文件）；分组展示，成员库之间不互相挤占
    const shownGroups = groupReconFiles(files)
    const plan = pendingPlan?.plan ?? null
    const spec = clarify?.spec ?? {}
    const box = { display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 10, borderBottom: `1px solid ${T.borderSoft}` }
    return h('div', { style: { ...S.side } },
      h('div', { style: { ...styles.row } },
        h('span', { style: styles.sectionTitle }, '本次详情'),
        h('div', { style: styles.spacer }),
        h('span', { style: { ...styles.smallMuted, cursor: 'pointer' }, onClick: () => setSideOpen(false) }, '收起 ▸'),
      ),
      rescanNote ? h('div', { style: { ...styles.smallMuted, color: T.brand } }, rescanNote) : null,
      members.length
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 1 } },
          members.map((member, index) => h('div', {
            key: member.repo ?? member.name ?? index,
            style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: T.font.xs, color: member.error ? T.danger : T.text4 },
          },
            h(Pill, { tone: member.error ? 'warn' : 'ok' },
              member.error ? '失败' : `${Number(member.files) || 0} 候选`),
            h('span', { style: { fontWeight: 500, color: T.text2 } }, member.name ?? repoBaseName(member.repo) ?? '成员库'),
            member.error ? h('span', { style: { ...styles.smallDanger } }, member.error) : null,
          )))
        : null,
      h('div', { style: box },
        h('div', { style: styles.row },
          h('span', { style: styles.sectionTitle }, `候选文件 ${files.length ? `(${files.length})` : ''}`),
          h('div', { style: styles.spacer }),
          h(Button, { style: { height: 24, padding: '0 8px' }, disabled: rescanBusy, onClick: rescan, children: rescanBusy ? '扫描中…' : '重新扫描' }),
        ),
        files.length
          ? shownGroups.map(([repo, list]) => h('div', {
            key: repo || '__single__',
            style: { display: 'flex', flexDirection: 'column', gap: 1, marginTop: repo ? 3 : 0 },
          },
            repo
              ? h('span', { style: { ...styles.smallMuted, fontWeight: 600, color: T.text2 } }, `${repo}（${list.length}）`)
              : null,
            list.map((file) => h('div', { key: `${repo}:${file.path}`, style: { display: 'flex', flexDirection: 'column', gap: 1 } },
              h('span', { style: { ...styles.mono, fontSize: T.font.xs, color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                String(file?.displayPath ?? file?.path ?? '')),
              file.why ? h('span', { style: { fontSize: 11, color: T.text4 } }, file.why) : null,
            )),
          ))
          : h('div', { style: styles.sectionHint }, '还没有候选文件：先发一句需求，或点「重新扫描」'),
      ),
      plan
        ? h('div', { style: box },
          h('span', { style: styles.sectionTitle }, '计划'),
          h('span', { style: { ...styles.smallMuted } }, `${(plan.steps ?? []).length} 步 · ${plan.estimate?.size ?? '?'} / ${plan.estimate?.days ?? '?'} 人日`),
          (plan.steps ?? []).slice(0, 8).map((step, index) => h('div', { key: `${index}-${step}`, style: { fontSize: T.font.xs, color: T.text3, lineHeight: 1.5 } }, `${index + 1}. ${step}`)),
        )
        : null,
      (spec?.problem || (spec?.acceptance ?? []).length)
        ? h('div', { style: { ...box, borderBottom: 'none', paddingBottom: 0 } },
          h('span', { style: styles.sectionTitle }, '已澄清'),
          spec.problem ? h('div', { style: { fontSize: T.font.xs, color: T.text3, lineHeight: 1.5 } }, `问题：${spec.problem}`) : null,
          (spec.acceptance ?? []).length
            ? h('div', { style: { fontSize: T.font.xs, color: T.text3, lineHeight: 1.5 } }, `验收：${spec.acceptance.join('；')}`)
            : null,
        )
        : null,
    )
  }

  // 布局：右侧详情栏是「聊天列（消息 + 输入框）」的同级，而不是把输入框留在
  // 整页宽度上居中——否则打开右栏后消息列左移、输入框仍按整页居中，两者会错开半个右栏宽。
  // 输入框必须跟随消息列一起居中（消息与输入框同宽同轴）。
  return h('div', { style: S.root, onPaste: onPasteFiles },
    h('div', { style: S.row },
      h('div', { style: S.chatCol },
        renderBody(),
        setupRequired || stateError || (loadingState && !state)
          ? null
          : h('div', { style: S.footer },
        h('div', { style: S.composer },
        // 输入框在 confirm/plan 阶段按设计是锁住的；把唯一能推进的按钮放到输入区上方，
        // 避免切走再回来后只看到“灰输入框”，误以为 agent 不响应。
        phase === PHASE.confirm && pending
          ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 } },
            h(Button, { primary: true, disabled: busy, onClick: continueToPlan, children: '继续，生成计划' }),
            h(Button, { disabled: busy, onClick: reDescribe, children: '重新描述' }),
          )
          : phase === PHASE.plan && pendingPlan
            ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 } },
              h(Button, { primary: true, disabled: busy, onClick: startPlanned, children: '确认开工' }),
              h(Button, { disabled: busy, onClick: adjustScope, children: '再调整范围' }),
            )
            : null,
        // 附件区：粘贴/拖入/选择文件后显示 chip；不支持图片时明确提示，不静默丢
        attachments.length || attachError || (capabilities && capabilities.images?.supported === false)
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 } },
            attachments.length
              ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                attachments.map((entry) => h(AttachmentChip, {
                  key: entry.id,
                  entry,
                  onPreview: setPreviewAttachment,
                  onRemove: removeAttachment,
                })))
              : null,
            attachments.length
              ? h('div', { style: styles.sectionHint },
                '发送后工作站会把路径交给 dsh：图片用 read_image 读取；模型不支持图片时会明确提示。')
              : null,
            attachBusy ? h('span', { style: styles.sectionHint }, '附件上传中…') : null,
            attachError ? h('div', { style: styles.smallDanger }, attachError) : null,
            capabilities && capabilities.images?.supported === false
              ? h('div', { style: styles.sectionHint },
                `当前模型不支持图片输入（${capabilities.images.reason ?? '模型未声明图片能力'}）；日志/代码等文件仍可粘贴或引用。`)
              : null,
          )
          : null,
        h('textarea', {
          ref: inputRef,
          onDragOver: (event) => {
            if (Array.from(event.dataTransfer?.files ?? []).length) event.preventDefault()
          },
          onDrop: onDropFiles,
          style: {
            ...styles.textarea,
            minHeight: 56,
            maxHeight: 200,
            border: 'none',
            boxShadow: 'none',
            background: 'transparent',
            padding: '0 2px',
            fontSize: T.font.base,
            lineHeight: 1.6,
            resize: 'none',
          },
          placeholder: clarifyBusy
            ? '澄清进行中…（完成后会直接出下一轮问题或规格）'
            : phase === PHASE.confirm
            ? '请先确认上面的文件/范围与追问，再点「继续，生成计划」'
            : phase === PHASE.plan
              ? '计划已生成：请确认开工，或点「再调整范围」'
              : phase === PHASE.planning
                ? '正在生成计划…'
                : '说一句你要做什么（Enter 发送，Shift+Enter 换行）',
          value: input,
          disabled: locked,
          onChange: (event) => setInput(event.target.value),
          onKeyDown,
        }),
        h('div', { style: { ...styles.row, justifyContent: 'space-between', alignItems: 'flex-end' } },
          h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 } },
            h('span', { style: { ...styles.smallMuted, fontSize: 11, color: T.text4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              `${state?.repo?.name ?? ''} · ${scope === 'new' ? '新建开发流程' : scopeLabel}`),
            sideOpen
              ? null
              : h('span', { style: { fontSize: 11, color: T.brand, cursor: 'pointer' }, onClick: () => setSideOpen(true) }, '详情 ▸'),
          ),
          h('div', { style: styles.row },
            h('input', {
              ref: attachInputRef,
              type: 'file',
              multiple: true,
              style: { display: 'none' },
              onChange: (event) => {
                addFiles(event.target.files)
                event.target.value = ''
              },
            }),
            h(Button, {
              disabled: locked || attachBusy,
              title: imageInputSupported ? '粘贴截图，或选择日志/代码文件作为需求输入' : '当前模型不支持图片；可引用日志/代码文件',
              onClick: () => attachInputRef.current?.click(),
              children: attachBusy ? '上传中…' : '引用文件/图片',
            }),
            // 历史对话：同一个项目下的旧对话可以随时进入，而不是只有最后一段
            chats.length
              ? h('div', { style: { position: 'relative' } },
                h(Button, { onClick: () => setHistoryOpen((value) => !value), disabled: busy, children: '历史对话 ▾' }),
                historyOpen
                  ? h('div', {
                    style: {
                      position: 'absolute',
                      bottom: 34,
                      right: 0,
                      zIndex: 10001,
                      width: 320,
                      maxHeight: 300,
                      overflow: 'auto',
                      padding: 8,
                      border: `1px solid ${T.borderSoft}`,
                      borderRadius: T.rLg,
                      background: T.surface,
                      boxShadow: T.shadowModal,
                    },
                  },
                    h('div', { style: { ...styles.sectionHint, padding: '4px 6px' } },
                      `${state?.repo?.name ?? '当前仓库'} · ${chats.length} 段对话`),
                    chats.map((chat) => h('button', {
                      key: chat.id,
                      type: 'button',
                      onClick: () => openChat(chat.id),
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 8px',
                        border: 'none',
                        borderRadius: T.rSm,
                        background: chat.id === activeChatId ? T.brandSoft : 'transparent',
                        color: chat.id === activeChatId ? T.brand : T.text2,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: T.font.sm,
                      },
                    },
                      h('span', {
                        style: {
                          fontWeight: chat.id === activeChatId ? 600 : 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        },
                      }, chat.title),
                      h('span', { style: { fontSize: T.font.xs, color: T.text4 } },
                        `${chat.messageCount} 条 · ${fmtTime(chat.updatedAt)}`),
                    )),
                  )
                  : null,
              )
              : null,
            h(Button, { onClick: beginNewChat, disabled: busy, children: '新对话' }),
            h(Button, { primary: true, disabled: locked || !input.trim(), onClick: send, children: sendLabel }),
          ),
        ),
        ),
      ),
      ),
      sideOpen ? renderSide() : null,
    ),
  )
}