/**
 * dsh-dev-hub browser half.
 *
 * 入口是左上角面板列表里的一个图标（sidebar.panellist#dev-hub），点击后由
 * main#dev-hub 渲染整块「开发工作站」大页面：首次向导、开发站首页（项目切换、
 * 流程列表、并行检查）、流程详情、环境探测、测试与提交都在这一页里。
 * All data goes through the host's /api/dev-hub/* routes.
 *
 * 文件分工：common.mjs（样式/请求/原子组件）、home.mjs（开发站首页列表与并行区）、
 * chat.mjs（新建流程的对话式入口，含扫描/追问/计划）；本文件保留前端壳、
 * 流程台账与详情、环境探测、测试与提交等既有功能。
 */
import { useEffect, useRef, useState } from 'react'
import { h, LocaleProvider, LOCALE_NAMESPACE, en, zh } from './i18n.mjs'
import { API, STATUS_LABELS } from '../shared/api.mjs'
import { REVIEWER_ROLES, REVIEW_STATUS_LABELS, REVIEW_STATUS_TONES, STAGE_LABELS, WORKFLOW_STAGES } from '../shared/workflow.mjs'
import { describeReview, reviewAdvancePlan, reviewFailureHint } from '../core/review.mjs'
import { isWeakTitle, requirementStatusLabel } from '../shared/requirement.mjs'
import { attachmentLabel, isImageAttachment, normalizeAttachments } from '../shared/attachment.mjs'

// 流程类型文案（客户端本地；宿主端 core/intent.mjs 保持同义）
const INTENT_LABEL = { bug: '定位/修复 bug', feature: '开发需求功能', analysis: '分析' }
const INTENT_ORDER = ['bug', 'feature', 'analysis']

/** 流程类型只认三态；旧数据/缺省按 feature 展示。 */
function intentOf(value) {
  return INTENT_ORDER.includes(value) ? value : 'feature'
}

/** 点一下切换到下一类：bug → feature → analysis → bug。 */
function nextIntentOf(value) {
  const current = intentOf(value)
  return INTENT_ORDER[(INTENT_ORDER.indexOf(current) + 1) % INTENT_ORDER.length]
}
import { DevHubChat } from './chat.mjs'
import {
  Button,
  C,
  IconSeat,
  RepoScopeBadge,
  Segmented,
  Spinner,
  Stat,
  StatusPill,
  SubmitButton,
  T,
  Tag,
  api,
  errorText,
  fmtTime,
  joinLines,
  repoBaseName,
  scopeTokenLabel,
  spinnerOnBrand,
  splitLines,
  styles,
} from './common.mjs'
import { HomeView, SessionBadge, pendingFlowStep, sessionActivity, sessionStageText, workspaceMembersView } from './home.mjs'
import { DevHubSessionQuick } from './session-entry.mjs'
import { SessionLogPanel } from './session-log.mjs'
import { DevHubBoundary } from './error-boundary.mjs'
import { loadLastTab, loadPanelState, saveLastTab, savePanelState } from './ui-state.mjs'
import { startNewChat } from './chat-store.mjs'
import { SkillsPanel } from './skills.mjs'
import { ReportView } from './report.mjs'
import { KEY_FILE_LIMIT, excerptLines, keyFileKind, pickKeyFiles } from './key-files.mjs'

function Modal({ title, onClose, children, width }) {
  return h('div', {
    style: styles.modal,
    onClick: (event) => { if (event.target === event.currentTarget) onClose?.() },
  },
    h('div', { style: { ...styles.modalCard, ...(width ? { width } : {}) } },
      // 弹窗标题与内容之间留一档间距（报告预览这类长内容尤其需要，否则标题直接贴住内容）
      h('div', { style: { ...styles.row, marginBottom: T.gap.md } },
        h('h3', { style: { margin: 0 } }, title),
        h('div', { style: { flex: 1 } }),
        h(Button, { onClick: onClose, children: '关闭' }),
      ),
      children,
    ),
  )
}

/**
 * 顶栏「更多」菜单：低频操作收进 ⋯，不再和主操作抢一排按钮。
 * 点击外部/Esc 关闭；菜单项用按钮而不是链接，键盘可达。
 */
function HeaderMenu({ items = [], title = '更多（低频操作）' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
  return h('div', { ref: rootRef, style: { position: 'relative' } },
    h(Button, {
      // 与顶栏其它操作同高（32），不要出现 28/32 混排
      style: { height: 32, padding: '0 12px', fontSize: 18, lineHeight: 1 },
      title,
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      onClick: () => setOpen((value) => !value),
      children: '⋯',
    }),
    open
      ? h('div', {
        role: 'menu',
        style: {
          position: 'absolute',
          top: 38,
          right: 0,
          zIndex: 1002,
          minWidth: 210,
          padding: 4,
          border: `1px solid ${T.borderSoft}`,
          borderRadius: T.rBase,
          background: T.surface,
          boxShadow: T.shadowModal,
        },
      }, items.map((item, index) => h('button', {
        key: `${index}-${item.label}`,
        role: 'menuitem',
        type: 'button',
        disabled: Boolean(item.disabled),
        onClick: () => {
          if (item.disabled) return
          setOpen(false)
          item.onClick?.()
        },
        onMouseEnter: (event) => { event.currentTarget.style.background = T.surface2 },
        onMouseLeave: (event) => { event.currentTarget.style.background = 'transparent' },
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          width: '100%',
          padding: '8px 10px',
          border: 'none',
          borderRadius: T.rSm,
          background: 'transparent',
          textAlign: 'left',
          cursor: item.disabled ? 'not-allowed' : 'pointer',
          opacity: item.disabled ? 0.5 : 1,
          color: T.text2,
          fontSize: T.font.sm,
        },
      },
        h('span', { style: { fontWeight: 500, color: T.text } }, item.label),
        item.hint ? h('span', { style: { fontSize: T.font.xs, color: T.text4, lineHeight: 1.5 } }, item.hint) : null,
      )))
      : null,
  )
}

function SetupForm({ state, onDone, mode = 'setup', onPickDirectory }) {
  const adding = mode === 'add'
  const [repoPath, setRepoPath] = useState(adding ? '' : (state?.suggestedRepoPath ?? state?.repo?.path ?? ''))
  const [name, setName] = useState(state?.profile?.member ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const next = await api(API.setup, { method: 'POST', body: JSON.stringify({ repoPath, name }) })
      onDone(next)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  async function pickDirectory() {
    if (!onPickDirectory) return
    try {
      const chosen = await onPickDirectory()
      if (chosen) setRepoPath(chosen)
    } catch (err) { setError(errorText(err)) }
  }

  return h('div', { style: styles.card },
    h('h3', { style: { margin: '0 0 6px' } }, adding ? '新增代码库' : '初始化 DevHub'),
    h('p', { style: { color: C.muted, marginTop: 0 } }, adding
      ? '填一个已有代码库的路径（或选择目录）；它会加入代码库卡片，环境自动探测一次后缓存。'
      : '只需要填代码库路径和你的名字；系统、Shell、JDK、Maven、Git 和可用工具会自动探测。'),
    h('form', { onSubmit: submit },
      h('label', { style: styles.label }, '代码库路径'),
      h('div', { style: { display: 'flex', gap: T.gap.xs } },
        h('input', {
          style: { ...styles.input, flex: '1 1 auto' },
          value: repoPath,
          placeholder: '/path/to/repository',
          onChange: (event) => setRepoPath(event.target.value),
        }),
        onPickDirectory
          ? h(Button, { onClick: pickDirectory, disabled: busy, children: '选择目录' })
          : null,
      ),
      h('label', { style: styles.label }, '你的名字/成员标识'),
      h('input', {
        style: styles.input,
        value: name,
        placeholder: '例如：张三',
        onChange: (event) => setName(event.target.value),
      }),
      h('div', { style: { ...styles.row, marginTop: 12 } },
        h(SubmitButton, { disabled: busy, children: busy ? '探测中…' : (adding ? '添加并探测环境' : '保存并探测环境') }),
      ),
      error ? h('p', { style: { color: C.danger } }, error) : null,
    ),
  )
}

function EnvironmentCard({ env, onDetect }) {
  if (!env) return h('div', { style: styles.card }, '尚未探测本机环境。', h(Button, { onClick: onDetect, children: '探测环境' }))
  const tools = env.tools ?? {}
  const available = Object.keys(tools).filter((name) => tools[name]?.available).sort()
  return h('div', { style: styles.card },
    h('div', { style: styles.row },
      h('strong', null, '本机环境'),
      h('span', { style: styles.pill }, `${env.os} ${env.arch}`),
      env.currentJdk ? h('span', { style: styles.pill }, `JDK ${env.currentJdk.major ?? '?'}`) : null,
      h(Button, { onClick: onDetect, children: '重新探测' }),
    ),
    h('div', { style: { color: C.muted, marginTop: 8 } },
      `Shell: ${env.shell?.name ?? 'unknown'} · Git: ${env.git?.version ?? 'unavailable'}`,
    ),
    env.jdks?.length ? h('div', { style: { marginTop: 8 } },
      h('div', { style: styles.label }, '已发现 JDK'),
      env.jdks.map((jdk) => h('div', { key: jdk.path, style: { fontSize: 12 } }, `${jdk.major ?? '?'} · ${jdk.version ?? ''} · ${jdk.path}`)),
    ) : null,
    h('div', { style: { marginTop: 8 } },
      h('div', { style: styles.label }, '可用工具'),
      available.length ? available.map((name) => h('span', { key: name, style: { ...styles.pill, marginRight: 4, marginBottom: 4 } }, name)) : '无',
    ),
    env.missing?.length ? h('div', { style: { marginTop: 8, color: C.muted } }, `不可用：${env.missing.join(', ')}`) : null,
  )
}

const LOCAL_COMMAND_SLOTS = [
  { id: 'localTest', label: '本机自测命令（localTest）', hint: '跑通后流程进入「验证中」' },
  { id: 'environmentTest', label: '环境测试命令（environmentTest）', hint: '跑通后流程进入「待提交」' },
  { id: 'gate', label: '门禁命令（gate）', hint: '提交前的检查脚本' },
]

/**
 * 测试命令分两层：
 * - 项目命令（.dev-hub/project.json）：团队共享，提交到仓库；
 * - 本机命令（~/.dsh/dev-hub/profile.json）：只在这台电脑生效，留空即沿用项目命令，
 *   不提交——每个人本机可能不同（例如本机用 kpipe-dev 做环境部署）。
 * 还支持用一句话描述本机做法，由 dsh agent 结合仓库脚本与已装工具整理成一条命令，人工确认后再保存。
 */
export function ProjectCommands({ project, localCommands = {}, onSaved }) {
  const commands = project?.context?.commands ?? {}
  const [shared, setShared] = useState({
    localTest: commands.localTest ?? '',
    environmentTest: commands.environmentTest ?? '',
    gate: commands.gate ?? '',
  })
  const [local, setLocal] = useState({
    localTest: localCommands.localTest ?? '',
    environmentTest: localCommands.environmentTest ?? '',
    gate: localCommands.gate ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  // 一句话 → 本机命令：只生成、不执行，确认后填入对应槽位
  const [slot, setSlot] = useState('environmentTest')
  const [description, setDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [suggestion, setSuggestion] = useState(null)

  async function saveShared() {
    setBusy(true); setMessage('')
    try {
      const body = await api(API.project, { method: 'POST', body: JSON.stringify({ commands: shared }) })
      onSaved?.(body.project, body.localCommands ?? local)
      setMessage('已保存项目命令（会随代码库提交，团队共用）')
    } catch (err) { setMessage(errorText(err)) } finally { setBusy(false) }
  }

  async function saveLocal() {
    setBusy(true); setMessage('')
    try {
      const body = await api(API.project, { method: 'POST', body: JSON.stringify({ localCommands: local }) })
      onSaved?.(body.project, body.localCommands ?? {})
      setMessage('已保存本机命令（只在这台电脑生效，不会提交）')
    } catch (err) { setMessage(errorText(err)) } finally { setBusy(false) }
  }

  async function generate() {
    if (!description.trim()) { setGenError('先用一句话描述你本机怎么做'); return }
    setGenerating(true); setGenError(''); setSuggestion(null)
    try {
      const body = await api(API.project, {
        method: 'POST',
        body: JSON.stringify({ action: 'suggest-local-command', phase: slot, description }),
      })
      setSuggestion(body)
    } catch (err) {
      setGenError(errorText(err))
    } finally { setGenerating(false) }
  }

  const slotLabel = LOCAL_COMMAND_SLOTS.find((entry) => entry.id === slot)?.label ?? slot

  return h('div', { style: { ...styles.card, marginTop: 12 } },
    h('strong', null, '测试命令'),
    h('div', { style: { color: C.muted, fontSize: 12, marginTop: 4 } },
      '分两层：项目命令提交到仓库、团队共用；本机命令只存在这台电脑（~/.dsh/dev-hub/profile.json），不提交，也不会影响别人。'),

    h('div', { style: { marginTop: 10 } },
      h('div', { style: styles.sectionTitle }, '项目命令（提交到 .dev-hub/project.json）'),
      LOCAL_COMMAND_SLOTS.map((entry) => h('div', { key: `shared-${entry.id}` },
        h('label', { style: styles.label }, entry.label),
        h('input', {
          style: styles.input,
          value: shared[entry.id] ?? '',
          placeholder: entry.id === 'localTest' ? '例如：mvn -o clean test' : entry.id === 'environmentTest' ? '例如：sh scripts/sit.sh' : '例如：sh scripts/check.sh --full',
          onChange: (event) => setShared((current) => ({ ...current, [entry.id]: event.target.value })),
        }),
      )),
      h('div', { style: { ...styles.row, marginTop: 8 } },
        h(Button, { primary: true, disabled: busy, onClick: saveShared, children: busy ? '保存中…' : '保存项目命令' }),
      ),
    ),

    h('div', { style: { marginTop: 14, paddingTop: 10, borderTop: `1px solid ${T.borderSoft}` } },
      h('div', { style: styles.row },
        h('span', { style: styles.sectionTitle }, '本机命令（只在这台电脑生效，不提交）'),
        h('div', { style: styles.spacer }),
        h(Tag, { tone: 'neutral' }, '本机'),
      ),
      h('div', { style: { ...styles.sectionHint, marginTop: 2 } },
        '留空＝沿用项目命令；填了就在这台电脑上覆盖对应按钮的执行命令。'),
      LOCAL_COMMAND_SLOTS.map((entry) => h('div', { key: `local-${entry.id}` },
        h('label', { style: styles.label }, entry.label),
        h('input', {
          style: styles.input,
          value: local[entry.id] ?? '',
          placeholder: shared[entry.id] ? `留空则用项目命令：${shared[entry.id]}` : '留空则用项目命令；也可以在这里写本机专用命令',
          onChange: (event) => setLocal((current) => ({ ...current, [entry.id]: event.target.value })),
        }),
      )),
      h('div', { style: { ...styles.row, marginTop: 8 } },
        h(Button, { primary: true, disabled: busy, onClick: saveLocal, children: busy ? '保存中…' : '保存本机命令' }),
        h('span', { style: styles.sectionHint }, '只写入 ~/.dsh/dev-hub/profile.json'),
      ),
    ),

    h('div', { style: { marginTop: 14, paddingTop: 10, borderTop: `1px solid ${T.borderSoft}` } },
      h('div', { style: styles.sectionTitle }, '用一句话生成本机命令'),
      h('div', { style: { ...styles.sectionHint, marginTop: 2 } },
        '描述你本机实际怎么跑（例如：本机用 kpipe-dev 把服务部署到本机环境，再 curl 健康检查）。dsh 会先看仓库脚本和本机已装工具，整理成一条命令交给你确认，不会自动执行。'),
      h('div', { style: { ...styles.row, marginTop: 6 } },
        h('select', {
          style: { ...styles.input, width: 200 },
          value: slot,
          onChange: (event) => setSlot(event.target.value),
        }, LOCAL_COMMAND_SLOTS.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.label.replace(/（.*?）/g, '')))),
        h(Button, { disabled: generating, onClick: generate, children: generating ? '探测中…' : '让 DSH 生成命令' }),
      ),
      h('textarea', {
        style: { ...styles.textarea, minHeight: 52, marginTop: 6 },
        value: description,
        placeholder: '例如：本机直接跑 kpipe-dev deploy --local，然后 curl http://127.0.0.1:8080/health 确认起没起来',
        onChange: (event) => setDescription(event.target.value),
      }),
      genError ? h('div', { style: { ...styles.dangerCard, marginTop: 6 } }, genError) : null,
      suggestion
        ? h('div', { style: { ...styles.cardFlat, marginTop: 8 } },
          h('div', { style: styles.row },
            h('strong', null, `建议的${slotLabel}`),
            h('div', { style: styles.spacer }),
            suggestion.probe?.ok
              ? h(Tag, { tone: 'ok' }, suggestion.probe.kind === 'bin' ? '本机已找到' : '路径存在')
              : h(Tag, { tone: 'warn' }, '未探测到可执行文件'),
          ),
          h('pre', { style: styles.pre }, suggestion.command),
          suggestion.explanation ? h('div', { style: { ...styles.sectionHint, marginTop: 2 } }, suggestion.explanation) : null,
          !suggestion.probe?.ok && suggestion.probe?.reason
            ? h('div', { style: { color: C.danger, fontSize: 12, marginTop: 2 } }, suggestion.probe.reason)
            : null,
          suggestion.caveats?.length
            ? h('div', { style: { ...styles.sectionHint, marginTop: 2 } }, `注意：${suggestion.caveats.join('；')}`)
            : null,
          h('div', { style: { ...styles.row, marginTop: 6 } },
            h(Button, {
              primary: true,
              onClick: () => {
                setLocal((current) => ({ ...current, [slot]: suggestion.command }))
                setMessage(`已把建议命令填入「${slotLabel}」，确认后点「保存本机命令」`)
              },
              children: '填入本机命令',
            }),
          ),
        )
        : null,
    ),
    message ? h('p', { style: { color: C.muted, marginBottom: 0 } }, message) : null,
  )
}

/**
 * 流程详情：从「一整页长表单」改成「分段 + 渐进披露」。
 *
 * 取舍：
 * - 默认全部只读，点「编辑」才出现对应输入框；保存后回到只读，减少“满屏输入框”的重量；
 * - 概览 / 计划 / 测试与提交 三个页签，低频项（标题、状态、历史、删除）收进「更多」；
 * - 自评工程量只读展示（规模/人日/置信度 + 依据），不提供任何输入框；
 * - 能力不删：阶段流转、Context Pack（低频入口收进「更多」）、追问/根因、计划、任务、技术文档、
 *   本机/环境测试、变更文件勾选、提交与 push 全部保留。
 */
/**
 * 流程指向条：箭头（chevron）串联的阶段进度，**只读**。
 * 阶段由事实推导（本机自测→验证、环境验证→待提交、提交→完成），不允许手工点选，
 * 否则会出现"人点一下、工具又改一下"的来回反复。
 */
function ArrowSteps({ stages, stageIndex, activeDetail, activePartial = false, activeLoading = false }) {
  const clipFor = (first) => (first
    ? 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)'
    : 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)')
  return h('div', {
    style: { display: 'flex', alignItems: 'stretch', width: '100%', overflowX: 'auto', paddingBottom: 2 },
  }, (stages ?? []).map((entry, index) => {
    const first = index === 0
    const active = index === stageIndex
    const done = stageIndex >= 0 && index < stageIndex
    const bg = active ? T.brand : done ? T.brandSoft : T.surface2
    const color = active ? '#fff' : done ? T.brand : T.text4
    const clip = clipFor(first)
    return h('span', {
      key: entry.id,
      title: `${entry.hint}${active ? '（当前阶段）' : done ? '（已完成）' : ''}`,
      style: {
        flex: '1 1 0',
        minWidth: 112,
        display: 'flex',
        padding: 2,
        marginLeft: first ? 0 : -10,
        clipPath: clip,
        background: T.surface,
      },
    },
      h('span', {
        style: {
          flex: '1 1 auto',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          height: 32,
          minWidth: 0,
          clipPath: clip,
          background: bg,
          color,
          fontSize: T.font.sm,
          fontWeight: active ? 600 : 500,
          padding: first ? '0 12px' : '0 14px 0 20px',
          whiteSpace: 'nowrap',
        },
      },
        active && activeLoading
          ? h(Spinner, { key: 'active-spin', size: 10, tone: 'accent', title: '正在开发…', style: spinnerOnBrand })
          : h('span', {
            key: 'dot',
            style: {
              width: 6,
              height: 6,
              flex: '0 0 6px',
              borderRadius: 999,
              background: active ? '#fff' : done ? T.brand : T.text4,
            },
          }, ''),
        entry.label,        done ? h('span', { style: { fontSize: 11, opacity: 0.9 } }, '✓') : null,
        active && activePartial ? h('span', { style: { fontSize: 11, opacity: 0.9 } }, '◐') : null,
        active && activeDetail ? h('span', { style: { fontSize: 10, opacity: 0.9, marginLeft: 4 } }, activeDetail) : null,
      ),
    )
  }))
}

/**
 * POST 一个「失败也带结果」的接口（测试 / 提交在多成员库里部分失败）。
 *
 * `api()` 遇到 `ok:false` 直接抛错，会把 body 里的逐库结果一起丢掉——那样界面只能显示
 * 一句"失败"，看不到哪个库提交成功、哪个库推送失败。所以这两条路径保留 body：
 * HTTP 非 2xx 仍然抛错（参数/权限错误），200 + ok:false 交给调用方逐库渲染。
 */
async function postAllowingFailure(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`)
  return body
}

/**
 * 流程归属的虚拟库徽标：流程建在虚拟库里时，标题旁要能看出「这次跨了几个库」。
 *
 * 台账里的 `item.workspace` 可能只有 `{id,name}`（归属快照），成员名按 `item.repos`
 * 的目录名兜底；两者都没有时（单库流程）不渲染，保持旧界面不变。
 */
function WorkspaceBadge({ workspace, repos }) {
  const paths = (Array.isArray(repos) ? repos : [])
    .map((entry) => String((typeof entry === 'string' ? entry : entry?.path ?? entry?.repo) ?? ''))
    .filter(Boolean)
  const members = Array.isArray(workspace?.members) && workspace.members.length
    ? workspace.members.map((member) => ({
      path: String(member?.path ?? ''),
      name: member?.name || repoBaseName(member?.path) || '',
    }))
    : paths.map((path) => ({ path, name: repoBaseName(path) }))
  if (!workspace && members.length < 2) return null
  const names = members.map((member) => member.name).filter(Boolean)
  return h(Tag, {
    key: 'workspace',
    tone: 'accent',
    title: [
      `虚拟库${workspace?.name ? `「${workspace.name}」` : ''}：${members.length} 个成员库`,
      names.length ? `成员库：${names.join('、')}（成员库平权）` : '',
      '台账/规范/上下文/证据写在本机独立目录，不写任何成员库',
    ].filter(Boolean).join('\n'),
  }, `虚拟库${workspace?.name ? ` ${workspace.name}` : ''} · ${members.length} 库`)
}

/** 提交/测试结果里的成员库名：优先 Host 的 name，旧数据按路径兜底。 */
function repoDisplayName(entry) {
  return entry?.name || entry?.repoName || repoBaseName(entry?.repo ?? entry?.path) || '成员库'
}

/**
 * 变更文件在界面上的唯一 key：虚拟库用 Host 的 `file.key`（`<成员库>/<路径>`），
 * 旧单库响应没有 key，回退 `path`，渲染与选中行为完全不变。
 */
function fileKeyOf(file) {
  return String(file?.key ?? (file?.repoName && file?.path ? `${file.repoName}/${file.path}` : (file?.path ?? '')))
}

/** diff 行高亮：关键改动预览与完整 diff 共用同一套配色。 */
function diffLineStyle(type) {
  if (type === 'added') return { background: T.okSoft, color: T.ok }
  if (type === 'removed') return { background: T.dangerSoft, color: T.danger }
  if (type === 'hunk') return { background: T.surface2, color: T.text4 }
  if (type === 'meta') return { color: T.text4 }
  return { color: T.text2 }
}

/** 文件显示路径：优先 Host 的 displayPath（`web/src/x.js`），旧数据就是 path。 */
function fileDisplayOf(file) {
  return String(file?.displayPath ?? file?.path ?? fileKeyOf(file))
}

/** 文件属于哪个成员库：优先 repoName，旧数据没有就返回空（单库界面不显示标签）。 */
function fileRepoOf(file) {
  return String(file?.repoName ?? (file?.repo ? repoBaseName(file.repo) : ''))
}

export function ItemEditor({ item, ctx, pendingQuestions = [], pendingApprovals = [], onPendingRefresh, onBack, onSaved, onContext, onLaunch, session, onOpenSession, onUnbindSession, onDeleted, onEditingChange }) {
  const [draft, setDraft] = useState(item)
  const [busy, setBusy] = useState(false)
  // 开启/继续/更换开发会话：建会话、发 Context Pack、绑定都要几秒，期间按钮必须锁住并转圈，
  // 否则用户不知道点了有没有生效。取值 null | 'open' | 'continue' | 'fresh'。
  const [launchBusy, setLaunchBusy] = useState(null)
  // 需求规范化：把客户原话整理成目标/根因（失败也要把原因说清楚）
  const [requirementBusy, setRequirementBusy] = useState(false)
  // 标题整理：用户输入常是代码/注解，点一下按目标概括一个能看的标题
  const [titleBusy, setTitleBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [lark, setLark] = useState(null)
  const [changes, setChanges] = useState(null)
  const [selectedPaths, setSelectedPaths] = useState([])
  const [commitMessage, setCommitMessage] = useState('')
  const [submitResult, setSubmitResult] = useState('')
  // 提交的结构化逐库结果：部分成员库失败时，单靠一段文字说不清哪个库成功/失败
  const [submitData, setSubmitData] = useState(null)
  const [branchMode, setBranchMode] = useState('current')
  const [branchName, setBranchName] = useState('')
  // 详情页局部状态：当前页签 + 当前唯一展开的编辑区（一次只编辑一处）+ 编辑前快照（取消时回滚）
  const [tab, setTab] = useState('overview')
  // 报告随时可预览：顶栏按钮打开弹窗，保存到本机的能力在弹窗内的报告工具栏里
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false)
  // 会话动态默认收起：它是过程证据，不应把"开发到哪一步"挤出首屏
  const [sessionLogOpen, setSessionLogOpen] = useState(false)
  const [editKey, setEditKey] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  // 文件说明的行内编辑（不用 window.prompt：Electron 里 prompt 不弹窗，表现为"点了没反应"）
  const [noteEdit, setNoteEdit] = useState(null) // { key, path, repo, text }
  // 正在编辑时不要轮询覆盖 item（会把未保存输入冲掉）；父级据此暂停详情自动刷新
  useEffect(() => {
    onEditingChange?.(Boolean(editKey) || Boolean(noteEdit))
  }, [editKey, noteEdit, onEditingChange])
  // 「下一步」对话框：进入流程先问"要不要推进 / 有什么改进"，而不是让人自己找按钮
  const [askText, setAskText] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  // 对话式补充：线程只展示最近几轮（完整留痕在 history）
  const [assistBusy, setAssistBusy] = useState(false)
  const [assistLog, setAssistLog] = useState([])
  // 待答问题：questionId -> 选中的选项 label 列表；custom 为自由输入
  const [answerPick, setAnswerPick] = useState({})
  const [answerCustom, setAnswerCustom] = useState({})
  const [answerBusy, setAnswerBusy] = useState(false)
  // 回答提交的行内反馈：成功/失败都直接显示在黄色卡片里（不再只报在页面顶部，用户看不到）
  const [answerFeedback, setAnswerFeedback] = useState(null) // { callId, tone:'ok'|'danger', text }
  // 计划校验：拿台账里的输入重算一次，看"计划是否与输入一致"
  const [planCheck, setPlanCheck] = useState(null)
  // 独立评审：派发中（审核会话要跑几十秒到几分钟，期间按钮必须锁住）；
  // advanceError 保存「自动开始评审失败」的原因，按钮旁内联展示，直到下次推进成功。
  const [reviewBusy, setReviewBusy] = useState(false)
  // reviewerId -> { alive, items, reason }：审核员子会话的最新动态（轮询，不跳会话也能看进度）
  const [reviewerProgress, setReviewerProgress] = useState({})
  const [advanceError, setAdvanceError] = useState('')
  // 变更预览：这个流程改了哪些文件、每个文件改了什么
  const [filesInfo, setFilesInfo] = useState(null)
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesAutoAt, setFilesAutoAt] = useState(null)
  const filesInFlightRef = useRef(false)
  // 当前 filesInfo 属于哪条流程：切流程时旧清单不能拿去按新 itemId 拉 diff
  const filesLoadedForRef = useRef('')
  const [onlyScope, setOnlyScope] = useState(true)
  const [diffFile, setDiffFile] = useState(null)
  const [diffLabel, setDiffLabel] = useState('')
  const [diffData, setDiffData] = useState(null)
  const [diffLoading, setDiffLoading] = useState(false)
  // 关键改动（默认展开 1~5 个）：key -> { loading, file, error }；按文件指纹去重，避免 8 秒轮询反复拉 diff
  const [keyDiffs, setKeyDiffs] = useState({})
  const keyDiffsRef = useRef({ fingerprint: '' })
  const [notesBusy, setNotesBusy] = useState(false)
  const notesTriedRef = useRef(false)
  // 变更文件自动刷新：停留在概览页时每 8 秒静默拉一次（页面隐藏时暂停），
  // 切回页面立即补一次；手动「刷新」仍然保留。
  useEffect(() => {
    if (tab !== 'overview' || !item?.id) return undefined
    loadFiles()
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      loadFiles({ silent: true })
    }, 8000)
    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') loadFiles({ silent: true })
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
    }
  }, [tab, item?.id])

  // 默认展开的关键改动：文件清单变化时按指纹各拉一次 diff（最多 5 个），轮询不重复请求
  useEffect(() => {
    const id = item?.id
    if (!id || filesLoadedForRef.current !== id) return undefined
    const all = filesInfo?.files ?? []
    const visible = onlyScope ? all.filter((file) => file.inScope !== false) : all
    const picks = pickKeyFiles(visible, KEY_FILE_LIMIT)
    const fingerprint = picks
      .map(({ file }) => `${fileKeyOf(file)}:${file.added}:${file.removed}:${file.status}`)
      .join('|')
    if (fingerprint === keyDiffsRef.current.fingerprint) return undefined
    keyDiffsRef.current.fingerprint = fingerprint
    if (!picks.length) {
      setKeyDiffs({})
      return undefined
    }
    let cancelled = false
    setKeyDiffs(Object.fromEntries(picks.map(({ file }) => [fileKeyOf(file), { loading: true }])))
    for (const { file } of picks) {
      const key = fileKeyOf(file)
      const params = new URLSearchParams({ itemId: id, path: String(file?.path ?? key) })
      if (file?.repo) params.set('repo', file.repo)
      else if (file?.repoName) params.set('repo', file.repoName)
      api(`${API.diff}?${params.toString()}`)
        .then((body) => {
          if (!cancelled) setKeyDiffs((current) => ({ ...current, [key]: { loading: false, file: body.file } }))
        })
        .catch((err) => {
          if (!cancelled) setKeyDiffs((current) => ({ ...current, [key]: { loading: false, error: errorText(err) } }))
        })
    }
    return () => { cancelled = true }
  }, [filesInfo, onlyScope, item?.id])

  useEffect(() => {
    setDraft(item)
    // 计划校验（纯本地计算；打开详情 / 指纹变化时各跑一次）
    if (item?.id) {
      api(API.repro, { method: 'POST', body: JSON.stringify({ id: item.id }) })
        .then((body) => setPlanCheck(body))
        .catch(() => setPlanCheck(null))
    }
    // 回看：把台账里最近的对话式补充铺进线程（编辑只用于纠偏，日常靠对话）
    const recent = (item?.history ?? []).filter((entry) => entry?.type === 'assist' || entry?.type === 'assist-reply').slice(-6)
    setAssistLog(recent.map((entry) => ({
      role: entry.type === 'assist' ? 'user' : 'assistant',
      text: entry.message,
    })))
  }, [item])
  if (!draft) return null
  const workflow = draft.workflow ?? {}
  const tests = workflow.tests ?? {}
  const techDoc = workflow.techDoc ?? {}
  const plan = workflow.plan ?? {}
  const estimate = plan.estimate ?? {}
  const stage = workflow.stage ?? 'discovery'
  const reviewView = describeReview(draft)
  const reviewStartedAt = reviewView.dispatchedAt ? new Date(reviewView.dispatchedAt).getTime() : NaN
  const reviewElapsed = reviewView.status === 'pending' && Number.isFinite(reviewStartedAt)
    ? Math.max(0, Math.round((Date.now() - reviewStartedAt) / 1000))
    : null
  // 「继续推进」在评审这一步的去向（自动开始/评审中禁用/失败重试）：与 core/next-steps 同一口径
  const advance = reviewAdvancePlan(draft)
  const advanceHint = advanceError || (advance.action === 'retry' ? advance.hint : '')
  const stageIndex = WORKFLOW_STAGES.findIndex((entry) => entry.id === stage)
  // 状态与阶段文案经常同义（开发中/开发中、已完成/已完成）：并排只显示一次，避免重复标签
  const stageLabelText = STAGE_LABELS[stage] ?? stage
  const statusLabelText = STATUS_LABELS[draft.status] ?? draft.status
  const showStageTag = stageLabelText !== statusLabelText
  // 会话正在跑时当前这步还没完：主按钮不应再给「继续推进」（否则会重复排队一次推进）
  const sessionRunning = Boolean(draft.session?.id) && Boolean(session?.running)
  const questions = workflow.questions ?? []
  const answered = questions.filter((question) => String(question.answer ?? '').trim()).length
  const tasks = draft.tasks ?? []
  const doneCount = tasks.filter((task) => task.done).length
  const taskPct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0
  // 风险勾选状态：「已知晓」用风险文本做 key；未勾选的才算待处理（与下一步建议同口径）
  const riskList = (draft.risks ?? []).map(String).filter(Boolean)
  const riskAckSet = new Set((draft.riskAcks ?? []).map(String))
  const riskAckedCount = riskList.filter((text) => riskAckSet.has(text)).length
  const baseline = draft.baseline ?? null
  // 需求规范化状态：原始需求、目标/根因来源、是否还没整理过
  const requirement = draft.requirement ?? null
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const updateWorkflow = (patch) => setDraft((current) => ({
    ...current,
    workflow: { ...(current.workflow ?? {}), ...patch },
  }))

  async function persistDraft(next = draft) {
    const body = await api(API.items, { method: 'POST', body: JSON.stringify(next) })
    setDraft(body.item)
    onSaved(body.item)
    return body.item
  }

  /**
   * 统一保存入口：写回台账 → 退出编辑态 → 给出轻提示。
   * 返回是否成功，调用方据此决定要不要关闭编辑区。
   */
  async function commit(next, message) {
    setBusy(true); setError(''); setNotice('')
    try {
      await persistDraft(next)
      setNotice(message)
      setEditKey(null)
      setSnapshot(null)
      return true
    } catch (err) {
      setError(errorText(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  function beginEdit(key) {
    setSnapshot(draft)
    setEditKey(key)
    setError('')
    setNotice('')
  }

  function cancelEdit() {
    if (snapshot) setDraft(snapshot)
    setEditKey(null)
    setSnapshot(null)
  }

  const isEditing = (key) => editKey === key
  const mini = { height: 24, padding: '0 8px', fontSize: T.font.sm }
  const sectionBox = { border: `1px solid ${T.borderSoft}`, borderRadius: T.rBase, background: T.surface, padding: T.gap.sm }

  /** 分段标题：默认在右侧给一个「编辑」，进入编辑态后由底部的保存/取消接管。 */
  function sectionHead(title, hint, key) {
    return h('div', { style: styles.spread },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
        h('div', { style: styles.sectionTitle }, title),
        hint ? h('div', { style: styles.sectionHint }, hint) : null,
      ),
      key && !isEditing(key) ? h(Button, { style: mini, onClick: () => beginEdit(key), children: '编辑' }) : null,
    )
  }

  function editFooter(message) {
    return h('div', { style: { ...styles.row, marginTop: T.gap.xs } },
      h(Button, { primary: true, disabled: busy, onClick: () => commit(draft, message), children: busy ? '保存中…' : '保存' }),
      h(Button, { disabled: busy, onClick: cancelEdit, children: '取消' }),
    )
  }

  function readText(value, placeholder = '还没有填写') {
    const text = String(value ?? '').trim()
    return text
      ? h('div', { style: { whiteSpace: 'pre-wrap', color: T.text2, fontSize: T.font.base, lineHeight: T.line } }, text)
      : h('div', { style: styles.sectionHint }, placeholder)
  }

  function readList(values, placeholder = '还没有填写') {
    const list = (values ?? []).map((entry) => String(entry ?? '').trim()).filter(Boolean)
    return list.length
      ? h('ul', { style: { margin: 0, paddingLeft: 18, color: T.text2, fontSize: T.font.base, lineHeight: T.line } },
        list.map((entry, index) => h('li', { key: `${index}-${entry}`, style: { marginBottom: 2 } }, entry)))
      : h('div', { style: styles.sectionHint }, placeholder)
  }

  /** scope + scopeModules 合并去重：只读 chip 与编辑框共用一份口径。 */
  function scopeTokensOf(value) {
    return [...new Set([...(value?.scope ?? []), ...(value?.scopeModules ?? [])].map(String).filter(Boolean))]
  }

  function tokenChips(tokens, limit = 8) {
    const list = tokens ?? []
    if (!list.length) return h('span', { style: styles.sectionHint }, '未标注 scope')
    return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
      list.slice(0, limit).map((token) => h(Tag, { key: token }, scopeTokenLabel(token))),
      list.length > limit ? h(Tag, { tone: 'neutral' }, `+${list.length - limit}`) : null,
    )
  }

  async function probeLark() {
    setLark(null); setError('')
    try { setLark(await api(API.techdoc, { method: 'POST', body: JSON.stringify({ action: 'probe' }) })) }
    catch (err) { setError(errorText(err)) }
  }

  async function createTechDoc(action) {
    setBusy(true); setError(''); setNotice('')
    try {
      await persistDraft()
      const body = await api(API.techdoc, { method: 'POST', body: JSON.stringify({ action, id: draft.id, title: techDoc.title || `${draft.title} 技术方案` }) })
      setDraft(body.item); onSaved(body.item)
      setNotice(action === 'create' ? `已创建：${body.url}` : `已生成：${body.path}`)
      setEditKey(null); setSnapshot(null)
    } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }

  /** 让工作站把客户原话整理成目标/根因/验收（旧流程也能一键补规范化）。 */
  async function normalizeRequirement() {
    if (requirementBusy) return
    setRequirementBusy(true); setError(''); setNotice('')
    try {
      const body = await api(API.requirement, { method: 'POST', body: JSON.stringify({ id: draft.id }) })
      if (body.item) { setDraft(body.item); onSaved(body.item) }
      setNotice(body.degraded
        ? `工作站暂时不可用：只生成了本地草稿（${body.reason || 'agent 不可用'}），目标和根因仍需人工确认`
        : '已把客户原话整理成目标/根因' + (body.requirement?.acceptance?.length ? '，并补了验收标准' : ''))
    } catch (err) {
      setError(`需求规范化失败：${errorText(err)}`)
    } finally { setRequirementBusy(false) }
  }

  /** 只重新生成标题：不动目标/根因（旧流程标题常是用户贴的代码/注解）。 */
  async function regenerateTitle() {
    if (titleBusy) return
    setTitleBusy(true); setError(''); setNotice('')
    try {
      const body = await api(API.requirement, { method: 'POST', body: JSON.stringify({ id: draft.id, regenerateTitle: true }) })
      if (body.item) { setDraft(body.item); onSaved(body.item) }
      if (body.changed === false) {
        setNotice('没生成比原话更合适的标题：可以直接手动改一个')
      } else {
        setNotice(`标题已生成：${body.title ?? body.item?.title ?? ''}${body.engine === 'local' ? '（工作站不可用，按目标兜底生成）' : ''}`)
      }
    } catch (err) {
      setError(`生成标题失败：${errorText(err)}`)
    } finally { setTitleBusy(false) }
  }

  /**
   * 统一的会话启动包装：无论成功、失败还是抛错，finally 复位 launchBusy，
   * 避免按钮永远停在「正在开启开发会话…」。
   */
  async function runLaunch(mode, action) {
    if (launchBusy) return undefined
    setLaunchBusy(mode)
    setError(''); setNotice('')
    try {
      return await action()
    } finally {
      setLaunchBusy(null)
    }
  }

  /**
   * 轻量「继续推进」：会话里已有规范与上下文，只发一句按最新台账继续的短消息。
   * 不重发整包 Context Pack（那会淹没之前的决定），也不弹确认框。
   *
   * 评审阶段不一样：开发阶段完成（stage=review 且评审 idle）时，「继续推进」就是开始评审——
   * 自动创建评审轮（复用 Host 的 dispatch/runReviewRound），不再让人到独立评审页手工派发；
   * 已有 pending 评审时不重复派发；failed/error 时再点即重试（见 startReview）。
   */
  /** 把审核员的纠偏意见发回开发会话：评审失败后的正确入口，而不是再次点评审。 */
  async function reworkFromReview() {
    if (busy) return
    const view = describeReview(draft)
    const boundId = draft.session?.id
    if (!boundId) {
      setError('还没有可用的开发会话：先开启开发会话，再把纠偏意见发回去返工')
      return
    }
    if (session?.running) {
      setNotice('开发会话正在工作：等它空闲后再提交纠偏意见')
      return
    }
    const lines = (view.corrections ?? []).map((correction) => [
      `【${correction.reviewerLabel}】${correction.summary || '未通过'}`,
      ...(correction.findings ?? []).map((finding) => `- ${finding}`),
    ].join('\n'))
    const prompt = [
      `独立评审未通过，请按下面的纠偏意见返工（流程：${draft.title}）。`,
      '先说明你准备怎么改，再改代码；完成后重跑本机自测并回写台账。评审通过前不要提交。',
      '',
      ...(lines.length ? [lines.join('\n\n')] : ['审核员未给出具体意见，请先读取评审页的结论与发现。']),
    ].join('\n')
    setBusy(true); setError(''); setNotice(''); setAdvanceError('')
    try {
      const result = await sendToSession(ctx, boundId, prompt)
      if (!result.sent) throw new Error(result.reason ?? '发送失败')
      setNotice('已把纠偏意见发回开发会话；修完重跑自测后再点「继续推进」重新评审')
    } catch (err) {
      setError(`提交纠偏意见失败：${errorText(err)}`)
    } finally { setBusy(false) }
  }

  async function continueDev() {
    if (busy) return
    const advance = reviewAdvancePlan(draft)
    if (advance.action === 'rework') { await reworkFromReview(); return }
    if (advance.action === 'verify') { setTab('test'); setNotice('评审已通过：去「测试与提交」跑环境测试并提交'); return }
    if (advance.action === 'dispatch' || advance.action === 'retry') {
      await startReview()
      return
    }
    if (advance.action === 'wait') return
    const boundId = draft.session?.id
    if (!boundId) { onLaunch?.(draft.id); return }
    // 防御：即使按钮状态还没刷新，也不在会话运行时再排一条“继续推进”
    if (session?.running) {
      setNotice('开发会话正在工作，等当前这步结束再继续推进')
      return
    }
    setBusy(true); setError(''); setNotice(''); setAdvanceError('')
    try {
      const result = await sendToSession(ctx, boundId, continuePrompt(describeFlow(draft, session)))
      if (!result.sent) throw new Error(result.reason ?? '发送失败')
      setAdvanceError('')
      setNotice(`已让开发会话继续推进（${boundId}）；进度与结果看下方「关联会话」。`)
    } catch (err) {
      setError(`${errorText(err)}（会话可能已归档；需要从零开始时用「更多 → 换一条开发会话」）`)
    } finally { setBusy(false) }
  }

  /**
   * 逐库测试结果：虚拟库里一个成员库失败，整体就是失败；但要说清哪几个库失败。
   * 旧响应没有 result.repos 时什么都不额外渲染，单库界面保持原样。
   */
  function repoTestRows(result) {
    const rows = Array.isArray(result?.repos) ? result.repos : []
    if (!rows.length) return null
    const failed = rows.filter((entry) => entry?.status && entry.status !== 'passed')
    return h('div', { style: { marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 } },
      h('div', { style: { ...styles.sectionHint, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
        `成员库结果（${rows.length}）`,
        failed.length
          ? h(Tag, { tone: 'danger' }, `${failed.length} 个失败：${failed.map(repoDisplayName).join('、')}`)
          : h(Tag, { tone: 'ok' }, '全部通过')),
      rows.map((repo, index) => {
        const status = repo?.status ?? (repo?.skipped ? 'skipped' : 'unknown')
        const tone = status === 'passed' ? 'ok' : status === 'failed' ? 'danger' : 'neutral'
        return h('div', {
          key: repo?.path ?? repo?.name ?? index,
          style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '4px 0', borderTop: index ? `1px solid ${T.borderSoft}` : 'none' },
        },
          h(Tag, { tone }, status === 'skipped' ? '跳过' : (TEST_TEXT[status] ?? status)),
          h('span', { style: { fontWeight: 600, color: T.text2 } }, repoDisplayName(repo)),
          repo?.branch ? h('span', { style: styles.sectionHint }, repo.branch) : null,
          repo?.durationMs ? h('span', { style: { ...styles.num, fontSize: T.font.xs, color: T.text4 } }, `${Math.round(repo.durationMs / 1000)}s`) : null,
          repo?.skipped ? h('span', { style: styles.sectionHint }, '已跳过（不需要在这个库跑）') : null,
          repo?.error ? h('span', { style: styles.smallDanger }, repo.error) : null,
          repo?.output
            ? h('details', { style: { flex: '1 1 100%' } },
              h('summary', { style: { cursor: 'pointer', fontSize: T.font.sm, color: status === 'failed' ? T.danger : T.brand } },
                status === 'failed' ? '查看失败输出' : '查看输出'),
              h('pre', { style: { ...styles.pre, marginTop: 4, maxHeight: 200 } }, String(repo.output).slice(-2000)))
            : null,
        )
      }),
    )
  }

  async function runTest(phase) {
    const command = tests[phase]?.command || (phase === 'local' ? '项目配置的 localTest' : '项目配置的 environmentTest')
    if (!window.confirm(`执行${phase === 'local' ? '本机自测' : '环境测试'}？\n\n${command}`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await persistDraft()
      // ok:false 也保留 body：部分成员库失败时 item/逐库结果仍要回写与展示
      const body = await postAllowingFailure(API.test, { id: draft.id, phase })
      if (body.item) { setDraft(body.item); onSaved(body.item) }
      const label = phase === 'local' ? '本机自测' : '环境测试'
      const rows = Array.isArray(body.result?.repos) ? body.result.repos : []
      const failed = rows.filter((entry) => entry?.status && entry.status !== 'passed')
      const suffix = rows.length ? `（${rows.length - failed.length}/${rows.length} 个成员库通过）` : ''
      if (body.ok === false) {
        setError(`${label}未通过：${body.error ?? (failed.length ? failed.map(repoDisplayName).join('、') : (body.result?.status ?? '失败'))}${suffix}`)
      } else {
        setNotice(`${label}：${body.result?.status ?? '通过'}${suffix}`)
      }
    } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }

  /** 开发前同步：fetch + ff-only 合并；不自动 rebase/reset，冲突/分叉明确报错。 */
  async function syncCode() {
    if (!window.confirm('拉取最新代码？\n\n会对当前流程涉及的仓库执行 git fetch + merge --ff-only。\n有本地未提交改动或分支分叉时不会强推/回滚，失败原因会显示在页面上。')) return
    setSyncBusy(true)
    setError('')
    setNotice('')
    try {
      const body = await postAllowingFailure(API.sync, { id: draft.id })
      const rows = Array.isArray(body.repos) ? body.repos : []
      const failed = rows.filter((row) => row?.ok === false)
      const detail = rows.map((row) => {
        const name = repoDisplayName(row)
        if (row?.ok === false) return `${name}：失败（${row.error || '未知原因'}）`
        return `${name}：${row?.updated ? `已更新 ${row.before ?? '?'} → ${row.after ?? '?'}` : '已是最新'}`
      }).join('；')
      if (body.ok === false || failed.length) setError(`部分仓库同步失败：${detail}`)
      else setNotice(`已同步代码：${detail}`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSyncBusy(false)
    }
  }

  // 评审是异步子代理：只靠一次 POST 返回时看不到中间态。pending 时轮询 /review，
  // 让审核员 sessionId、异常与最新结论能进界面；完成后自动停。
  useEffect(() => {
    const pending = draft?.workflow?.review?.status === 'pending' || reviewBusy
    if (!pending || !draft?.id) return undefined
    let stop = false
    const load = async () => {
      if (stop) return
      try {
        const body = await api(`${API.review}?id=${encodeURIComponent(draft.id)}`)
        if (stop || !body.item) return
        setDraft(body.item)
        onSaved?.(body.item)
      } catch { /* 下一轮继续；不覆盖当前界面 */ }
    }
    const timer = setInterval(load, 3000)
    load()
    return () => { stop = true; clearInterval(timer) }
  }, [draft?.id, draft?.workflow?.review?.status, reviewBusy])

  // 审核员子会话的最新动态：不等结论落盘，直接把最近 assistant/tool 事件拉回来展示。
  // 只轮询当前轮仍在 pending 的 reviewer，避免无意义请求。
  const reviewerSessionsKey = (draft?.workflow?.review?.reviewers ?? []).map((reviewer) => reviewer.sessionId ?? '').join(',')
  useEffect(() => {
    const active = reviewBusy || draft?.workflow?.review?.status === 'pending'
    const reviewers = (draft?.workflow?.review?.reviewers ?? []).filter((reviewer) => reviewer.sessionId)
    if (!active || !draft?.id || !reviewers.length) {
      setReviewerProgress({})
      return undefined
    }
    let stop = false
    const load = async () => {
      const next = {}
      await Promise.all(reviewers.map(async (reviewer) => {
        try {
          const body = await api(`${API.sessionLog}?itemId=${encodeURIComponent(draft.id)}&sessionId=${encodeURIComponent(reviewer.sessionId)}&limit=16`)
          if (!stop) next[reviewer.id] = { alive: body.alive, items: body.items ?? [], reason: body.reason ?? null }
        } catch (err) {
          if (!stop) next[reviewer.id] = { alive: null, items: [], reason: errorText(err) }
        }
      }))
      if (!stop) setReviewerProgress(next)
    }
    load()
    const timer = setInterval(load, 3000)
    return () => { stop = true; clearInterval(timer) }
  }, [draft?.id, draft?.workflow?.review?.status, reviewBusy, reviewerSessionsKey])

  /**
   * 「继续推进」在评审这一步＝开始评审：复用 Host 现有 dispatch/runReviewRound。
   *
   * - 已有 pending 评审：不重复派发（幂等，直接提示等审核员返回）；
   * - 派发失败或评审 failed/error：按钮保持可点，再点即重试派发，并把上次失败原因内联在按钮旁；
   * - 审核员数量沿用现有默认配置（上一轮人数或默认值），不再提供人数选择入口。
   */
  async function startReview() {
    const current = describeReview(draft)
    if (current.status === 'pending') {
      setNotice('独立评审进行中：等审核员返回结论，不重复派发')
      return
    }
    if (reviewBusy || busy) return
    setReviewBusy(true); setError(''); setNotice(''); setAdvanceError('')
    try {
      const count = current.total || undefined
      const body = await postAllowingFailure(API.review, { id: draft.id, action: 'dispatch', count })
      if (body.item) { setDraft(body.item); onSaved(body.item) }
      const view = body.review ?? describeReview(body.item ?? draft)
      if (view.status === 'passed') {
        setAdvanceError('')
        setNotice(`独立评审通过：${view.passed}/${view.total} 位审核员通过，可以进入测试验证`)
      } else if (view.status === 'failed') {
        setAdvanceError(`上次评审未通过：${reviewFailureHint(view)}（再点「继续推进」重试评审）`)
      } else if (view.status === 'error') {
        setAdvanceError(`上次评审异常：${reviewFailureHint(view)}（再点「继续推进」重试评审）`)
      } else {
        setNotice(`独立评审进行中：${view.passed}/${view.total} 位已返回，等审核员结论`)
      }
    } catch (err) {
      setAdvanceError(`自动开始评审失败：${errorText(err)}（再点「继续推进」重试）`)
      setTab('review')
    } finally { setReviewBusy(false) }
  }

  /** 评审卡在 pending（常见于 DSH 重启/请求中断）：允许用户显式重置本轮后重试。 */
  async function resetReview() {
    if (reviewBusy || busy) return
    if (typeof window !== 'undefined' && typeof window.confirm === 'function'
      && !window.confirm('重置本轮独立评审？当前 pending 的审核员会话会停止；历史轮次仍保留。')) return
    setReviewBusy(true); setError(''); setNotice(''); setAdvanceError('')
    try {
      const body = await postAllowingFailure(API.review, { id: draft.id, action: 'reset' })
      if (!body.ok && body.error) throw new Error(body.error)
      if (body.item) { setDraft(body.item); onSaved?.(body.item) }
      setNotice('已重置本轮评审；点「继续推进」可重新派发')
    } catch (err) {
      setError(`重置评审失败：${errorText(err)}`)
    } finally { setReviewBusy(false) }
  }

  /** 显式评审调整：确认忽略本轮拒绝后，把所有 failed/error 审核员标为人工通过，再进入测试验证。 */
  async function overrideReview() {
    if (reviewBusy || busy) return
    const view = describeReview(draft)
    if (view.status !== 'failed' && view.status !== 'error') return
    const count = (view.reviewers ?? []).filter((reviewer) => reviewer.status === 'failed' || reviewer.status === 'error').length
    if (typeof window !== 'undefined' && typeof window.confirm === 'function'
      && !window.confirm(`评审未通过（${count} 位拒绝/异常）。确认忽略本轮评审拒绝并继续交付？\n\n原审核意见会保留在流程历史与报告中，标记为人工通过。`)) return
    setReviewBusy(true); setError(''); setNotice(''); setAdvanceError('')
    try {
      const body = await postAllowingFailure(API.review, { id: draft.id, action: 'override' })
      if (!body.item) throw new Error(body.error || 'Host 没有返回流程')
      setDraft(body.item)
      onSaved?.(body.item)
      const next = describeReview(body.item)
      setNotice(next.status === 'passed'
        ? '已确认忽略评审拒绝；可以去「测试与提交」继续环境测试/提交'
        : '已记录评审调整，但仍有审核员未返回；先处理 pending/重置本轮')
    } catch (err) {
      setError(`评审调整失败：${errorText(err)}`)
    } finally { setReviewBusy(false) }
  }

  async function loadChanges() {
    setBusy(true); setError('')
    try {
      const body = await api(`${API.changes}?id=${encodeURIComponent(draft.id)}`)
      setChanges(body)
      setSelectedPaths(body.suggestedPaths ?? [])
      setCommitMessage((current) => current || `${draft.title}: update`)
    } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }

  /** 上次提交有没有"已 commit 但没 push"：单库看 submission.pushed，多库看 repos[].pushed。 */
  function submissionNeedsRetry() {
    const submission = draft.workflow?.submission ?? null
    if (!submission) return false
    if (submission.pushed === false) return true
    return Array.isArray(submission.repos) && submission.repos.some((entry) => entry && entry.commit && entry.pushed === false)
  }

  /** 按成员库分组变更文件：单库（没有 repoName/repo）只返回一组，界面仍然平铺。 */
  function changesByRepo() {
    const map = new Map()
    for (const change of changes?.changes ?? []) {
      const repo = change?.repoName || (change?.repo ? repoBaseName(change.repo) : '')
      if (!map.has(repo)) map.set(repo, [])
      map.get(repo).push(change)
    }
    return [...map.entries()]
  }

  async function submitCode({ pushOnly = false } = {}) {
    if (!pushOnly && !selectedPaths.length) { setError('请选择要提交的文件'); return }
    if (!pushOnly && !commitMessage.trim()) { setError('请填写提交信息'); return }
    if (branchMode === 'new' && !pushOnly && !branchName.trim()) { setError('请填写新分支名'); return }
    const target = branchMode === 'new' && !pushOnly ? `新分支 ${branchName.trim()}` : `当前分支（${changes?.branch ?? '当前'}）`
    // 多成员库时确认框按库分组列文件，避免一长串路径看不出跨了哪些库
    const groups = changesByRepo().filter(([, list]) => list.some((change) => selectedPaths.includes(change.path)))
    const pathLines = groups.length > 1
      ? groups.map(([repo, list]) => `【${repo || '成员库'}】\n${list.filter((change) => selectedPaths.includes(change.path)).map((change) => change.path).join('\n')}`).join('\n\n')
      : selectedPaths.join('\n')
    if (!window.confirm(pushOnly
      ? '上次提交没推送成功：现在重试 git push？'
      : `确认提交 ${selectedPaths.length} 个文件到「${target}」，并立即 git push？\n\n${pathLines}`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      // 部分成员库失败时 Host 仍返回逐库结果（ok:false）：不能让 api() 把 body 抛掉
      const body = await postAllowingFailure(API.submit, {
        id: draft.id,
        paths: selectedPaths,
        message: commitMessage,
        branchMode,
        branchName: branchName.trim(),
        pushOnly,
      })
      if (body.item) { setDraft(body.item); onSaved(body.item) }
      const repoResults = Array.isArray(body.repos)
        ? body.repos
        : (Array.isArray(body.item?.workflow?.submission?.repos) ? body.item.workflow.submission.repos : [])
      const failed = repoResults.filter((entry) => entry?.error || entry?.pushed === false)
      setSubmitData({
        at: Date.now(),
        ok: body.ok !== false,
        repos: repoResults,
        failed: failed.length,
        branch: body.branch ?? '',
        commit: body.commit ?? '',
        pushed: body.pushed !== false,
        error: body.error ?? '',
        pushOutput: body.pushOutput ?? '',
      })
      if (body.ok === false) {
        // 已经 commit 但 push 失败 / 部分成员库失败：保留结果，给一个"重试推送"
        const lines = repoResults.length
          ? repoResults.map((entry) => `${repoDisplayName(entry)}：${entry?.error ? `失败（${entry.error}）` : entry?.pushed === false ? '已提交，推送失败' : '已提交并推送'}`)
          : []
        setSubmitResult([
          body.error ?? '提交或推送失败',
          body.commit ? `已提交：${body.commit}（${body.branch ?? ''}）` : '',
          lines.join('\n'),
        ].filter(Boolean).join('\n\n'))
        setError(body.error ?? 'git push 失败')
        return
      }
      setSubmitResult(`已提交并推送到 ${body.branch}：${body.commit}${body.pushOutput ? '\n' + body.pushOutput : ''}`)
      setChanges(null)
      const submitNotice = repoResults.length
        ? `已提交并推送 ${repoResults.length} 个成员库（${repoResults.map(repoDisplayName).join('、')}）`
        : `已提交并推送到 ${body.branch}`
      const worktreeBranch = draft.workflow?.worktree?.branch
      setNotice(worktreeBranch
        ? `${submitNotice}；独立工作区分支 ${body.branch || worktreeBranch} 已推送，合并回目标分支后再清理工作区`
        : submitNotice)
    } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }

  /** 任务勾选直接落盘：勾一下就生效，不用再点一次保存。 */
  async function toggleTask(index) {
    const nextTasks = tasks.map((task, i) => (i === index ? { ...task, done: !task.done } : task))
    const next = { ...draft, tasks: nextTasks }
    setDraft(next)
    await commit(next, '已更新任务进度')
  }

  /**
   * 风险勾选＝同意并知晓：立即落盘，不用再点保存。
   * 未勾选的数量会同步到上方「下一步」的「处理 N 个风险/阻塞」。
   */
  async function toggleRiskAck(text) {
    const current = Array.isArray(draft.riskAcks) ? draft.riskAcks : []
    const nextAcks = current.includes(text)
      ? current.filter((entry) => entry !== text)
      : [...current, text]
    const next = { ...draft, riskAcks: nextAcks }
    setDraft(next)
    await commit(next, nextAcks.includes(text)
      ? `已标记已知晓：${text}`
      : '已取消知晓，重新计入待处理风险')
  }

  const setQuestions = (list) => updateWorkflow({ questions: list })
  const setQuestion = (id, key, value) => setQuestions(questions.map((question) => (question.id === id ? { ...question, [key]: value } : question)))
  const addQuestion = () => {
    // 不用 window.prompt（Electron 不弹窗）；加一行空问题，就地填写
    setQuestions([...questions, { id: `q${Date.now()}`, question: '', answer: '' }])
  }
  const togglePath = (path) => setSelectedPaths((current) => (current.includes(path) ? current.filter((p) => p !== path) : [...current, path]))
  const techDocText = (decision) => ({ existing: '已有技术文档', create: '开发中创建', none: '暂不需要' }[decision] ?? '未选择')
  const TEST_TEXT = { not_run: '未运行', running: '运行中', passed: '通过', failed: '失败' }
  const testTone = (status) => (status === 'passed' ? 'ok' : status === 'failed' ? 'danger' : status === 'running' ? 'info' : 'neutral')

  /* ------------------------------------------------------------- 概览页 */

  function renderOverview() {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
      // 只有进入开发后才谈评审：计划/澄清阶段提前显示只会制造噪音
      ['develop', 'review', 'verify', 'submit', 'done'].includes(stage) ? renderReviewSummary() : null,
      renderChanges(),
      h('div', { style: sectionBox },
        h('div', { style: styles.row },
          sectionHead('目标', '工作站规范化后的表述：做什么 + 为什么', 'goal'),
          requirement
            ? h(Tag, { tone: requirement.needsReview ? 'warn' : 'ok' }, requirementStatusLabel(requirement))
            : null,
        ),
        requirement?.needsReview
          ? h('div', { style: { ...styles.warnCard, display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap' } },
            h('span', null, '目标现在还是客户原话，没经过规范化：先整理成「做什么 + 为什么」，再开发更稳。'),
            h(Button, { style: mini, disabled: requirementBusy, onClick: normalizeRequirement, children: requirementBusy ? '规范化中…' : '让工作站规范化' }),
          )
          : null,
        requirement?.degraded
          ? h('div', { style: { ...styles.sectionHint, marginTop: 4 } },
            `规范化降级：${requirement.reason || '工作站不可用，只能给本地草稿'}`)
          : null,
        isEditing('goal')
          ? h('div', null,
            h('textarea', {
              style: { ...styles.textarea, marginTop: T.gap.xs },
              value: draft.goal ?? '',
              onChange: (event) => update('goal', event.target.value),
            }),
            editFooter('已保存目标'))
          : readText(draft.goal, '还没有写目标'),
      ),
      requirement?.raw
        ? h('details', { style: sectionBox },
          h('summary', { style: { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap' } },
            h('span', { style: styles.sectionTitle }, '原始需求'),
            h(Tag, { tone: 'neutral' }, '客户原话 · 仅追溯'),
          ),
          h('div', { style: { marginTop: T.gap.xs, color: T.text2, whiteSpace: 'pre-wrap', lineHeight: T.line } }, requirement.raw),
          h('div', { style: { ...styles.sectionHint, marginTop: 4 } },
            '保存原样，不会拿它直接当目标；改目标/根因也不会改这里。'),
        )
        : null,
      normalizeAttachments(draft.attachments).length
        ? h('div', { style: sectionBox },
          h('div', { style: styles.sectionTitle }, '引用文件 / 截图'),
          h('div', { style: { ...styles.sectionHint, marginTop: 2 } },
            '随需求提供；开发会话按路径用 read_image / read 读取（图片要求模型支持图片输入）。'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 } },
            normalizeAttachments(draft.attachments).map((entry) => h('div', {
              key: entry.id ?? entry.path,
              style: { display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' },
            },
              h(Tag, { tone: isImageAttachment(entry) ? 'info' : 'neutral' }, isImageAttachment(entry) ? '图片' : '文件'),
              h('span', { style: { fontWeight: 500, color: T.text2 } }, attachmentLabel(entry)),
              h('span', { style: { ...styles.mono, fontSize: T.font.xs, color: T.text4, overflowWrap: 'anywhere' } }, entry.path),
            ))),
        )
        : null,
      h('div', { style: sectionBox },
        sectionHead('非目标', '明确这次不做什么', 'nonGoals'),
        isEditing('nonGoals')
          ? h('div', null,
            h('textarea', {
              style: { ...styles.textarea, marginTop: T.gap.xs },
              value: joinLines(draft.nonGoals),
              onChange: (event) => update('nonGoals', splitLines(event.target.value)),
            }),
            editFooter('已保存非目标'))
          : readList(draft.nonGoals, '还没有写非目标'),
      ),
      h('div', { style: sectionBox },
        sectionHead('验收标准', '做到什么算完成', 'acceptance'),
        isEditing('acceptance')
          ? h('div', null,
            h('textarea', {
              style: { ...styles.textarea, marginTop: T.gap.xs },
              value: joinLines(draft.acceptance),
              onChange: (event) => update('acceptance', splitLines(event.target.value)),
            }),
            editFooter('已保存验收标准'))
          : readList(draft.acceptance, '还没有验收标准'),
      ),
      h('div', { style: sectionBox },
        sectionHead('改动范围', 'scope 同时用于并行冲突判定', 'scope'),
        isEditing('scope')
          ? h('div', null,
            h('textarea', {
              style: { ...styles.textarea, marginTop: T.gap.xs },
              placeholder: '关键文件/范围（一行一个；module:xxx 表示模块）',
              value: joinLines(scopeTokensOf(draft)),
              onChange: (event) => update('scope', splitLines(event.target.value)),
            }),
            editFooter('已保存改动范围'))
          : h('div', { style: { marginTop: T.gap.xs } }, tokenChips(scopeTokensOf(draft))),
      ),
      h('div', { style: sectionBox },
        h('div', { style: styles.row },
          sectionHead('需求澄清 · 根因', '禁止直接写解决方案', 'rootProblem'),
          requirement?.needsReview
            ? h(Tag, { tone: 'warn' }, '还没整理成根因')
            : requirement ? h(Tag, { tone: 'ok' }, requirementStatusLabel(requirement)) : null,
        ),
        requirement?.needsReview
          ? h('div', { style: { ...styles.sectionHint, marginTop: T.gap.xs } },
            '下面是客户原话，不是根因：补上「现状是什么、为什么会这样」，再改代码。')
          : null,
        isEditing('rootProblem')
          ? h('div', null,
            h('textarea', {
              style: { ...styles.textarea, marginTop: T.gap.xs },
              placeholder: '根本问题 / 根因（必填，禁止直接写解决方案）',
              value: workflow.rootProblem ?? '',
              onChange: (event) => updateWorkflow({ rootProblem: event.target.value }),
            }),
            editFooter('已保存根因'))
          : readText(workflow.rootProblem, '还没有写根本问题'),
      ),
      h('details', { style: sectionBox },
        h('summary', { style: { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap' } },
          h('span', { style: styles.sectionTitle }, '追问与回答'),
          h(Tag, { tone: questions.length && answered >= questions.length ? 'ok' : 'neutral' }, `${answered}/${questions.length} 已回答`),
          h('div', { style: styles.spacer }),
          isEditing('questions') ? null : h(Button, { style: mini, onClick: () => beginEdit('questions'), children: '编辑回答' }),
        ),
        isEditing('questions')
          ? h('div', { style: { marginTop: T.gap.xs } },
            questions.map((question) => h('div', { key: question.id, style: { marginTop: T.gap.xs } },
              h('input', {
                style: { ...styles.input, height: 28, marginBottom: 4 },
                placeholder: '问题（例如：这次只改 source 还是全部改？）',
                value: question.question ?? '',
                onChange: (event) => setQuestion(question.id, 'question', event.target.value),
              }),
              h('textarea', {
                style: { ...styles.textarea, minHeight: 44, marginTop: 4 },
                placeholder: '回答；不确定就继续追问',
                value: question.answer ?? '',
                onChange: (event) => setQuestion(question.id, 'answer', event.target.value),
              }),
            )),
            h('div', { style: { ...styles.row, marginTop: T.gap.xs } },
              h(Button, { style: mini, onClick: addQuestion, children: '新增问题' })),
            editFooter('已保存追问回答'))
          : h('div', { style: { marginTop: T.gap.xs, display: 'flex', flexDirection: 'column', gap: T.gap.xs } },
            questions.length
              ? questions.map((question) => h('div', { key: question.id },
                h('div', { style: { color: T.text2 } }, question.question),
                h('div', { style: question.answer ? styles.smallMuted : styles.sectionHint }, question.answer || '未回答'),
              ))
              : h('div', { style: styles.sectionHint }, '还没有追问')),
      ),
      h('div', { style: sectionBox, id: 'devhub-risks' },
        sectionHead('风险 / 阻塞', '一行一个；勾选＝同意并知晓，未勾选计入「待处理风险」', 'risks'),
        isEditing('risks')
          ? h('div', null,
            h('textarea', {
              style: { ...styles.textarea, marginTop: T.gap.xs },
              value: joinLines(draft.risks),
              onChange: (event) => update('risks', splitLines(event.target.value)),
            }),
            h('div', { style: { ...styles.sectionHint, marginTop: 2 } },
              '已勾选「已知晓」的行如果被删除，对应勾选会自动清掉，不会留下孤儿状态。'),
            editFooter('已保存风险'))
          : (riskList.length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: T.gap.xs } },
              riskList.map((text, index) => {
                const acked = riskAckSet.has(text)
                return h('label', {
                  key: `${index}-${text}`,
                  title: acked ? '已同意并知晓；取消勾选会重新计入待处理风险' : '勾选表示你已同意并知晓该风险',
                  style: {
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    minHeight: 28,
                    padding: '2px 0',
                    fontSize: T.font.base,
                    color: acked ? T.text4 : T.text2,
                    cursor: busy ? 'default' : 'pointer',
                  },
                },
                  h('input', {
                    type: 'checkbox',
                    checked: acked,
                    disabled: busy,
                    style: { marginTop: 4 },
                    onChange: () => toggleRiskAck(text),
                  }),
                  h('span', { style: { flex: '1 1 auto', textDecoration: acked ? 'line-through' : 'none', overflowWrap: 'anywhere' } }, text),
                  h(Tag, { tone: acked ? 'ok' : 'warn' }, acked ? '已知晓' : '待处理'),
                )
              }),
              h('div', { style: { ...styles.sectionHint, marginTop: 4 } },
                `已知晓 ${riskAckedCount}/${riskList.length}，待处理 ${riskList.length - riskAckedCount}；上方「下一步」会同步这个数量。`))
            : h('div', { style: styles.sectionHint }, '当前没有登记风险')),
      ),
      h('div', { style: sectionBox },
        sectionHead('变更点', '语义变更点，一行一个', 'changePoints'),
        isEditing('changePoints')
          ? h('div', null,
            h('textarea', {
              style: { ...styles.textarea, marginTop: T.gap.xs },
              placeholder: '一行一个变更点',
              value: joinLines((draft.changePoints ?? []).map((point) => point.summary)),
              onChange: (event) => update('changePoints', splitLines(event.target.value).map((line) => ({ type: 'manual', summary: line }))),
            }),
            editFooter('已保存变更点'))
          : readList((draft.changePoints ?? []).map((point) => point.summary), '还没有变更点'),
      ),
    )
  }

  /* ------------------------------------------------------------- 计划页 */

  /** 运行一条模板验收（命令来自台账，Host 只跑登记过的命令）。 */
  async function runCheck(checkId) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = await api(API.check, { method: 'POST', body: JSON.stringify({ id: draft.id, checkId }) })
      if (body.item) { setDraft(body.item); onSaved?.(body.item) }
      setNotice(body.ok ? `验收通过：${checkId}` : `验收未通过：${checkId}`)
      // 结果变化后重新校验计划指纹
      api(API.repro, { method: 'POST', body: JSON.stringify({ id: draft.id }) }).then(setPlanCheck).catch(() => {})
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function renderPlan() {
    const size = estimate.size ?? '待评估'
    const days = estimate.days === null || estimate.days === undefined || estimate.days === '' ? '—' : estimate.days
    const confidence = { low: '低', medium: '中', high: '高' }[estimate.confidence] ?? '待评估'
    // 台账落盘时会做归一化，只保留 size/days/confidence/notes；basis 来自 /plan 实时响应，
    // 有就展示，没有就退化成 notes 或一句提示，不凭空编造。
    const basis = Array.isArray(estimate.basis) && estimate.basis.length
      ? estimate.basis
      : (estimate.notes ? [estimate.notes] : [])
    const template = workflow.plan?.template ?? null
    const checks = draft.checks ?? []
    const references = draft.references ?? []
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
      planCheck
        ? h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: T.gap.xs,
            flexWrap: 'wrap',
            padding: '8px 12px',
            borderRadius: T.rBase,
            background: planCheck.same ? T.okSoft : planCheck.inputChanged ? T.warnSoft : T.dangerSoft,
            color: planCheck.same ? T.ok : planCheck.inputChanged ? T.warnText : T.danger,
            fontSize: T.font.sm,
          },
        },
          h('span', { style: { fontWeight: 600 } }, planCheck.same ? '计划与输入一致' : '计划需要校验'),
          h('span', { style: { opacity: 0.85 } }, planCheck.message),
          h('div', { style: styles.spacer }),
          h('span', { style: { ...styles.mono, fontSize: T.font.xs } }, `指纹 ${planCheck.current?.hash ?? '—'}`),
          planCheck.same
            ? null
            : h(Button, {
              style: mini,
              disabled: busy,
              onClick: async () => {
                try {
                  const body = await api(API.repro, { method: 'POST', body: JSON.stringify({ id: draft.id, save: true }) })
                  setPlanCheck(body)
                  if (body.item) { setDraft(body.item); onSaved?.(body.item) }
                  setNotice('已按当前输入重算计划并记录指纹')
                } catch (err) { setError(errorText(err)) }
              },
              children: planCheck.recorded ? '重算并记录' : '补记录指纹',
            }),
        )
        : null,
      template
        ? h('div', { style: sectionBox },
          sectionHead(`需求模板：${template.name ?? template.id}`, '按需求类型带出的必改触点；不是建议，是清单', 'plan'),
          (template.touchpoints ?? []).length
            ? h('ol', { style: { margin: '8px 0 0', paddingLeft: 18, color: T.text2, fontSize: T.font.sm, lineHeight: T.line } },
              (template.touchpoints ?? []).map((point, index) => h('li', { key: `${index}-${point}` }, point)))
            : h('div', { style: { ...styles.sectionHint, marginTop: 6 } }, '通用改动：没有预置触点'),
        )
        : null,
      h('div', { style: sectionBox },
        sectionHead('验收检查', '提交前每条都要有结果（命令逐条运行，断言人工确认）', 'plan'),
        checks.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: T.gap.xs } },
            checks.map((check) => h('div', {
              key: check.id,
              style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', border: `1px solid ${T.borderSoft}`, borderRadius: T.rBase },
            },
              h(Tag, { tone: check.status === 'passed' ? 'ok' : check.status === 'failed' ? 'danger' : 'neutral' },
                check.status === 'passed' ? '通过' : check.status === 'failed' ? '失败' : '未运行'),
              h('span', { style: { fontSize: T.font.sm, color: T.text, fontWeight: 500 } }, check.text),
              check.command
                ? h('span', { style: { ...styles.mono, color: T.text4, fontSize: T.font.xs } }, check.command)
                : h('span', { style: styles.sectionHint }, check.assertion ?? '人工确认'),
              h('div', { style: styles.spacer }),
              check.command
                ? h(Button, { style: mini, disabled: busy, onClick: () => runCheck(check.id), children: '运行' })
                : null,
            )),
          )
          : h('div', { style: { ...styles.sectionHint, marginTop: 6 } }, '这个流程没有模板验收项（旧流程可「重算并记录」生成）'),
      ),
      references.length
        ? h('div', { style: sectionBox },
          sectionHead('参考实现', '照这些类/文档的结构写，别自创分层', 'plan'),
          references.map((reference) => h('div', { key: reference.path, style: { marginTop: 6 } },
            h('span', { style: { ...styles.mono, fontSize: T.font.xs, color: T.text2 } }, reference.path),
            reference.why ? h('span', { style: { ...styles.sectionHint, marginLeft: 8 } }, reference.why) : null,
          )),
        )
        : null,
      h('div', { style: sectionBox, id: 'devhub-plan' },
        sectionHead('计划摘要', '工作站按仓库探测自评；这里只做确认或微调', 'plan'),
        isEditing('plan')
          ? h('div', null,
            h('textarea', {
              style: { ...styles.textarea, marginTop: T.gap.xs },
              placeholder: '计划摘要（工作站已生成）',
              value: plan.summary ?? '',
              onChange: (event) => updateWorkflow({ plan: { ...plan, summary: event.target.value } }),
            }),
            h('div', { style: { ...styles.sectionHint, marginTop: 6 } }, '计划步骤（一行一个）'),
            h('textarea', {
              style: { ...styles.textarea, marginTop: 4 },
              placeholder: '计划步骤（工作站已生成，一行一个）',
              value: joinLines(plan.steps),
              onChange: (event) => updateWorkflow({ plan: { ...plan, steps: splitLines(event.target.value) } }),
            }),
            editFooter('已保存计划'))
          : h('div', null,
            readText(plan.summary, '工作站还没有生成计划摘要'),
            (plan.steps ?? []).length
              ? h('ol', { style: { margin: '8px 0 0', paddingLeft: 18, color: T.text2, fontSize: T.font.base, lineHeight: T.line } },
                (plan.steps ?? []).map((step, index) => h('li', { key: `${index}-${step}`, style: { marginBottom: 2 } }, step)))
              : null),
      ),
      h('div', { style: sectionBox },
        h('div', { style: styles.spread },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('div', { style: styles.sectionTitle }, '自评工程量'),
            h('div', { style: styles.sectionHint }, '工作站按探测结果估算，不需要你填写'),
          ),
          h(Tag, { tone: 'accent' }, '只读'),
        ),
        h('div', { style: { display: 'flex', gap: T.gap.md, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: T.gap.xs } },
          h(Stat, { label: '规模', value: size, hint: 'S / M / L / XL' }),
          h(Stat, { label: '人日', value: days, hint: '预估工作量' }),
          h(Stat, { label: '置信度', value: confidence, hint: '自评' }),
        ),
        basis.length
          ? h('div', { style: { marginTop: T.gap.xs } },
            h('div', { style: styles.sectionHint }, '依据'),
            h('ul', { style: { margin: '2px 0 0', paddingLeft: 18, color: T.text2, fontSize: T.font.sm, lineHeight: T.line } },
              basis.map((entry, index) => h('li', { key: `${index}-${entry}`, style: { marginBottom: 2 } }, String(entry)))))
          : h('div', { style: { ...styles.sectionHint, marginTop: T.gap.xs } }, '还没有更多依据：先补全探测结果与改动范围。'),
      ),
      h('div', { style: sectionBox },
        h('div', { style: styles.spread },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('div', { style: styles.sectionTitle }, '开发任务'),
            h('div', { style: styles.sectionHint }, '勾选只代表开发任务完成；流程是否结束还要看测试与提交'),
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: T.gap.xs } },
            h('span', { style: { ...styles.num, fontSize: T.font.sm, color: T.text4 } }, `${doneCount}/${tasks.length}`),
            isEditing('tasks') ? null : h(Button, { style: mini, onClick: () => beginEdit('tasks'), children: '批量编辑' }),
          ),
        ),
        h('div', { style: styles.progressOuter },
          h('div', { style: { ...styles.progressInner, width: `${taskPct}%`, background: draft.status === 'done' ? T.ok : T.brand } }),
        ),
        h('div', {
          style: {
            ...styles.sectionHint,
            marginTop: 2,
            color: draft.status === 'done' ? T.ok : (tasks.length && doneCount >= tasks.length ? T.warnText : T.text4),
          },
        }, draft.status === 'done'
          ? '开发任务与流程都已完成'
          : `开发任务${tasks.length && doneCount >= tasks.length ? '已完成' : '进行中'}，流程未结束：${pendingFlowStep({
            status: draft.status,
            stage,
            testState: tests.local?.status,
            environmentTestState: tests.environment?.status,
          }) ?? '还差测试/提交'}`),
        isEditing('tasks')
          ? h('div', null,
            h('textarea', {
              style: { ...styles.textarea, marginTop: T.gap.xs },
              placeholder: '任务（一行一个；前缀 [x] 表示完成）',
              value: tasks.map((task) => `${task.done ? '[x]' : '[ ]'} ${task.text}`).join('\n'),
              onChange: (event) => update('tasks', splitLines(event.target.value).map((line) => ({
                done: /^\[x\]\s*/i.test(line),
                text: line.replace(/^\[[ x]\]\s*/i, ''),
              }))),
            }),
            editFooter('已更新任务'))
          : (tasks.length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: T.gap.xs } },
              tasks.map((task, index) => h('label', {
                key: `${index}-${task.text}`,
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 28,
                  fontSize: T.font.base,
                  color: task.done ? T.text4 : T.text2,
                  cursor: 'pointer',
                },
              },
                h('input', { type: 'checkbox', checked: Boolean(task.done), onChange: () => toggleTask(index) }),
                h('span', { style: { textDecoration: task.done ? 'line-through' : 'none' } }, task.text),
              )))
            : h('div', { style: { ...styles.sectionHint, marginTop: T.gap.xs } }, '还没有任务；「批量编辑」可以一次粘贴')),
      ),
      h('div', { style: sectionBox },
        sectionHead('技术文档', '有就填链接；没有可让 lark-cli 创建', 'techDoc'),
        isEditing('techDoc')
          ? h('div', null,
            h('select', {
              style: { ...styles.input, marginTop: T.gap.xs },
              value: techDoc.decision ?? '',
              onChange: (event) => updateWorkflow({ techDoc: { ...techDoc, decision: event.target.value || null } }),
            },
              h('option', { value: '' }, '请选择'),
              h('option', { value: 'existing' }, '已有技术文档'),
              h('option', { value: 'create' }, '没有，开发中创建'),
              h('option', { value: 'none' }, '暂不需要'),
            ),
            techDoc.decision === 'existing' ? h('div', null,
              h('input', {
                style: { ...styles.input, marginTop: 6 },
                placeholder: '文档标题',
                value: techDoc.title ?? '',
                onChange: (event) => updateWorkflow({ techDoc: { ...techDoc, title: event.target.value } }),
              }),
              h('input', {
                style: { ...styles.input, marginTop: 6 },
                placeholder: '文档 URL 或本地路径',
                value: techDoc.url || techDoc.localPath || '',
                onChange: (event) => updateWorkflow({ techDoc: { ...techDoc, url: event.target.value } }),
              }),
            ) : null,
            techDoc.decision === 'create' ? h('div', null,
              h('input', {
                style: { ...styles.input, marginTop: 6 },
                placeholder: '待创建文档标题',
                value: techDoc.title ?? '',
                onChange: (event) => updateWorkflow({ techDoc: { ...techDoc, title: event.target.value } }),
              }),
              h('div', { style: { ...styles.row, marginTop: 6 } },
                h(Button, { style: mini, onClick: probeLark, children: '检测 lark-cli' }),
                h(Button, { style: mini, onClick: () => createTechDoc('create'), disabled: busy, children: '用 lark-cli 创建' }),
                h(Button, { style: mini, onClick: () => createTechDoc('local'), disabled: busy, children: '生成本地文档' }),
              ),
              lark ? h('div', {
                style: { fontSize: T.font.sm, marginTop: 4, color: lark.available ? T.text4 : T.danger },
              }, `${lark.available ? 'available' : 'unavailable'} · ${lark.message ?? ''}`) : null,
            ) : null,
            editFooter('已保存技术文档'))
          : h('div', { style: { marginTop: T.gap.xs, display: 'flex', flexDirection: 'column', gap: 4 } },
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
              h(Tag, { tone: techDoc.decision === 'none' ? 'neutral' : techDoc.decision ? 'accent' : 'warn' }, techDocText(techDoc.decision)),
              techDoc.title ? h(Tag, { tone: 'neutral' }, techDoc.title) : null,
            ),
            techDoc.url || techDoc.localPath
              ? h('span', { style: { ...styles.mono, color: T.text4, wordBreak: 'break-all' } }, techDoc.url || techDoc.localPath)
              : null,
            techDoc.createdBy ? h('span', { style: styles.sectionHint }, `来源：${techDoc.createdBy}`) : null),
      ),
    )
  }

  /* ------------------------------------------------------- 测试与提交页 */

  function testBlock(phase, title, hint) {
    const result = tests[phase] ?? {}
    const status = result.status ?? 'not_run'
    const stale = Boolean(result.stale)
    const command = result.command || (phase === 'local' ? '未配置（使用项目 localTest）' : '未配置（使用项目 environmentTest）')
    return h('div', { style: sectionBox },
      h('div', { style: styles.spread },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          h('div', { style: styles.sectionTitle }, title),
          h('div', { style: styles.sectionHint }, hint),
        ),
        h(Tag, { tone: stale ? 'warn' : testTone(status) }, stale ? '已过期，需重跑' : (TEST_TEXT[status] ?? status)),
      ),
      h('div', { style: { ...styles.row, marginTop: T.gap.xs } },
        h('span', { style: styles.sectionHint }, '命令'),
        h('span', { style: { ...styles.mono, color: T.text2 } }, command),
        h('div', { style: styles.spacer }),
        h(Button, {
          style: mini,
          disabled: busy || (phase === 'environment' && (tests.local?.status !== 'passed' || tests.local?.stale || reviewView.status !== 'passed')),
          onClick: () => runTest(phase),
          children: phase === 'local' ? '运行本机自测' : '运行环境测试',
        }),
      ),
      result.at
        ? h('div', { style: { ...styles.sectionHint, marginTop: 4 } },
          `最近一次：${fmtTime(result.at)}${result.durationMs ? ` · ${Math.round(result.durationMs / 1000)}s` : ''}`)
        : null,
      result.output
        ? h('details', { style: { marginTop: 6 }, open: status === 'failed' || status === 'running' },
          h('summary', { style: { cursor: 'pointer', fontSize: T.font.sm, color: T.brand } },
            status === 'failed' ? '查看失败输出' : '查看输出'),
          h('pre', { style: { ...styles.pre, marginTop: 6 } }, String(result.output).slice(-4000)))
        : null,
      // 虚拟库：逐成员库测试结果（旧单库响应没有 repos，不渲染）
      repoTestRows(result),
    )
  }

  async function loadFiles({ silent = false } = {}) {
    // 后台轮询不抢手动刷新；静默失败保留上一次变更列表，不闪错
    if (silent && filesInFlightRef.current) return
    filesInFlightRef.current = true
    if (!silent) setFilesLoading(true)
    try {
      const body = await api(`${API.files}?itemId=${encodeURIComponent(draft.id)}`)
      setFilesInfo(body)
      filesLoadedForRef.current = draft.id
      setFilesAutoAt(Date.now())
      // 说明由 agent 自动补：只对"没有人工说明、且文件版本变了"的生成，服务端幂等
      const missing = (body.files ?? []).some((file) => file.noteSource === 'auto')
      if (missing && !notesTriedRef.current) {
        notesTriedRef.current = true
        setNotesBusy(true)
        api(API.genFileNotes, { method: 'POST', body: JSON.stringify({ id: draft.id }) })
          .then(async (result) => {
            if (result?.item) { setDraft(result.item); onSaved?.(result.item) }
            if (result?.generated?.length) {
              const refreshed = await api(`${API.files}?itemId=${encodeURIComponent(draft.id)}`)
              setFilesInfo(refreshed)
            }
          })
          .catch(() => { /* 自动补说明失败不打扰：保留默认解释 */ })
          .finally(() => setNotesBusy(false))
      }
    } catch (err) {
      if (!silent) setError(errorText(err))
    } finally {
      filesInFlightRef.current = false
      if (!silent) setFilesLoading(false)
    }
  }

  /**
   * 把一个 scope 外文件所在的目录纳入本流程 scope。
   * scope 是开工前确认的边界，不随 git 改动自动扩大；这里给用户一个显式纠正入口。
   */
  async function adoptFileScope(file) {
    const path = String(file?.path ?? '').replace(/\\/g, '/')
    if (!path) return
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : path
    if (!dir) return
    const token = file?.repoName ? `${file.repoName}:${dir}` : dir
    const nextScope = [...new Set([...(draft.scope ?? []), token])]
    const ok = await commit({ ...draft, scope: nextScope }, `已把 ${token} 纳入本流程 scope`)
    if (ok) await loadFiles()
  }

  /**
   * 打开一个文件的 diff。
   * 虚拟库里同一个仓库相对路径可能在多个成员库都存在，因此必须把 `repo` 一起带上，
   * 让 Host 去正确的成员库读；单库旧响应没有 repo 字段，URL 与以前完全一致。
   */
  async function openDiff(file) {
    const key = fileKeyOf(file)
    setDiffFile(key)
    setDiffLabel(fileDisplayOf(file))
    setDiffLoading(true)
    setDiffData(null)
    try {
      const params = new URLSearchParams({ itemId: draft.id, path: String(file?.path ?? key) })
      if (file?.repo) params.set('repo', file.repo)
      else if (file?.repoName) params.set('repo', file.repoName)
      const body = await api(`${API.diff}?${params.toString()}`)
      setDiffData(body.file)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setDiffLoading(false)
    }
  }

  /**
   * 关键改动预览（默认展开）：最多 5 个，数据库模型/迁移、接口契约、配置优先，
   * 其余按改动行数排序；每块只截前 36 行，点“完整 diff”看全文。
   */
  function renderKeyPreviews(visible) {
    const picks = pickKeyFiles(visible, KEY_FILE_LIMIT)
    if (!picks.length) {
      return h('div', { style: { ...styles.sectionHint, padding: 10 } },
        visible.length
          ? '这些文件没有可展开的文本 diff（二进制或纯重命名）；点左侧文件查看'
          : (onlyScope ? 'scope 内没有改动；取消勾选可看全部' : '这个流程还没有文件改动'))
    }
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      h('div', { style: { ...styles.row, marginBottom: 2 } },
        h('span', { style: styles.sectionTitle }, '关键改动'),
        h('span', { style: styles.sectionHint }, `默认展开 ${picks.length} 个：数据库模型 / 接口契约 / 配置优先`),
      ),
      // 关键改动全部展开（不内部滚动），一眼能看到全部；左侧列表占满等高来平衡版面
      picks.map(({ file, kind }) => {
        const key = fileKeyOf(file)
        const entry = keyDiffs[key] ?? {}
        const diff = entry.file
        const { lines, truncated, hidden } = excerptLines(diff?.lines, 36)
        return h('div', {
          key,
          style: { border: `1px solid ${T.borderSoft}`, borderRadius: T.rBase, overflow: 'hidden' },
        },
          h('div', {
            style: {
              display: 'grid',
              // 固定列宽：分类 / 状态 / 路径 / 行数 / 操作 纵向对齐，路径列吃掉剩余空间
              gridTemplateColumns: '88px 52px minmax(0, 1fr) 78px 64px',
              alignItems: 'center',
              columnGap: 8,
              padding: '6px 10px',
              background: T.surface2,
            },
          },
            h(Tag, { tone: kind === '数据库模型' ? 'accent' : 'neutral' }, kind),
            h(Tag, { tone: file.status === 'added' ? 'ok' : file.status === 'deleted' ? 'danger' : 'neutral' },
              file.status === 'added' ? '新增' : file.status === 'deleted' ? '删除' : file.status === 'renamed' ? '重命名' : '修改'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
              fileRepoOf(file) ? h(Tag, { tone: 'accent', style: { flex: '0 0 auto' } }, fileRepoOf(file)) : null,
              file.inScope === false ? h(Tag, { tone: 'warn', style: { flex: '0 0 auto' } }, 'scope 外') : null,
              h('span', {
                style: {
                  ...styles.mono,
                  fontSize: T.font.xs,
                  color: T.text2,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
                title: fileDisplayOf(file),
              }, fileDisplayOf(file)),
            ),
            h('span', {
              style: { ...styles.mono, fontSize: T.font.xs, color: T.text4, textAlign: 'right', whiteSpace: 'nowrap' },
            }, `+${file.added ?? 0} / -${file.removed ?? 0}`),
            h('span', {
              role: 'button',
              style: { fontSize: T.font.xs, color: T.brand, cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap' },
              title: '查看这个文件的完整 diff',
              onClick: () => openDiff(file),
            }, '完整 diff'),
          ),
          entry.loading
            ? h('div', { style: { ...styles.sectionHint, padding: 8 } }, '正在读取 diff…')
            : entry.error
              ? h('div', { style: { ...styles.dangerCard, margin: 8 } }, entry.error)
              : diff?.binary
                ? h('div', { style: { ...styles.sectionHint, padding: 8 } }, '二进制文件，不显示内容')
                : h('pre', {
                  style: {
                    margin: 0,
                    maxHeight: 180,
                    overflow: 'auto',
                    padding: '6px 0',
                    fontFamily: T.mono,
                    fontSize: 12,
                    lineHeight: 1.6,
                  },
                }, lines.map((line, index) => h('div', {
                  key: `${index}-${line.text.slice(0, 12)}`,
                  style: { ...diffLineStyle(line.type), padding: '0 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
                }, line.text || ' '))),
          truncated
            ? h('div', { style: { ...styles.sectionHint, padding: '4px 10px', borderTop: `1px solid ${T.borderSoft}` } },
              `只展示前 ${lines.length} 行；点「完整 diff」查看剩余 ${hidden} 行`)
            : null,
        )
      }),
    )
  }

  /** 变更页签：左边文件清单（状态/来源/增删行），右边默认关键改动、点文件后看完整 diff。 */
  function renderChanges() {
    const files = filesInfo?.files ?? []
    const visible = onlyScope ? files.filter((file) => file.inScope !== false) : files
    const totals = filesInfo?.totals ?? { files: 0, added: 0, removed: 0 }
    const diffLines = diffData?.lines ?? []
    // 左侧列表下方的概览：把文件按关键类型分组，避免短列表留下一大片空白
    const kindCounts = visible.reduce((acc, file) => {
      const kind = keyFileKind(file)?.kind ?? '其他改动'
      acc[kind] = (acc[kind] ?? 0) + 1
      return acc
    }, {})
    const outScopeCount = visible.filter((file) => file.inScope === false).length
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
      h('div', { style: sectionBox },
        h('div', { style: styles.spread },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('div', { style: styles.sectionTitle }, '这个流程改了哪些文件'),
            h('div', { style: styles.sectionHint },
              filesLoading
                ? '正在读取 git 变更…'
                : (() => {
                  const shownAdded = visible.reduce((sum, file) => sum + (file.binary ? 0 : file.added), 0)
                  const shownRemoved = visible.reduce((sum, file) => sum + (file.binary ? 0 : file.removed), 0)
                  const suffix = visible.length === totals.files ? '' : `（共 ${totals.files} 个，含 scope 外）`
                  return `${visible.length} 个文件 · +${shownAdded} / -${shownRemoved}${suffix}`
                })()),
          ),
          h('div', { style: styles.row },
            h('label', { style: { ...styles.sectionHint, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' } },
              h('input', { type: 'checkbox', checked: onlyScope, onChange: (event) => setOnlyScope(event.target.checked) }),
              '只看 scope 内'),
            h('span', { style: { ...styles.sectionHint, whiteSpace: 'nowrap' } },
              filesAutoAt ? `自动刷新 · ${fmtTime(filesAutoAt)}` : '每 8 秒自动刷新'),
            h(Button, { style: mini, disabled: filesLoading, onClick: () => loadFiles(), children: '刷新' }),
          ),
        ),
        filesInfo?.evidenceComplete === false
          ? h('div', { style: styles.warnCard }, filesInfo.reason ?? '证据不完整：只显示工作区改动')
          : null,
        (filesInfo?.excludedCount ?? 0) > 0
          ? h('div', { style: { ...styles.sectionHint } }, `已排除 ${filesInfo.excludedCount} 个工作站台账文件（.dev-hub/）`)
          : null,
        h('div', { style: { ...styles.sectionHint } },
          '统计口径：baseline 以来的提交 + 当前工作区；默认只显示 scope 内，取消勾选可看全部。scope 是开工确认时的边界，不会随改动自动扩大；scope 外文件如果属于本次需求，点「纳入 scope」即可。'),
        filesInfo
          ? h('div', { style: { display: 'flex', gap: T.gap.sm, marginTop: T.gap.xs, alignItems: 'stretch' } },
            h('div', { style: { flex: '1 1 42%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 } },
              h('div', { style: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', border: `1px solid ${T.borderSoft}`, borderRadius: T.rBase } },
              visible.length
                ? visible.map((file) => {
                  const key = fileKeyOf(file)
                  const display = fileDisplayOf(file)
                  const repoName = fileRepoOf(file)
                  const editing = noteEdit?.key === key
                  const saveNote = async () => {
                    if (!editing) return
                    try {
                      // 虚拟库：同一个相对路径可能出现在多个成员库，说明要跟着 repo 走
                      const body = await api(API.fileNote, {
                        method: 'POST',
                        body: JSON.stringify({ id: draft.id, path: file.path, repo: file.repo, note: noteEdit.text }),
                      })
                      if (body.item) { setDraft(body.item); onSaved?.(body.item) }
                      setNoteEdit(null)
                      await loadFiles()
                    } catch (err) { setError(errorText(err)) }
                  }
                  return h('div', { key, style: { borderBottom: `1px solid ${T.borderSoft}` } },
                    h('div', {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        width: '100%',
                        padding: '8px 10px',
                        background: diffFile === key ? T.brandSoft : T.surface,
                        cursor: 'pointer',
                      },
                      onClick: () => openDiff(file),
                    },
                      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
                        repoName ? h(Tag, { tone: 'accent', title: `成员库：${file.repo ?? repoName}` }, repoName) : null,
                        h(Tag, {
                          tone: file.status === 'added' ? 'ok' : file.status === 'deleted' ? 'danger' : 'neutral',
                        }, file.status === 'added' ? '新增' : file.status === 'deleted' ? '删除' : file.status === 'renamed' ? '重命名' : '修改'),
                        file.origin === 'both' ? h(Tag, { tone: 'accent' }, '提交+未提交') : null,
                        file.inScope === false
                          ? h(Tag, {
                            tone: 'warn',
                            title: '不在开工确认的 scope 内：scope 只按确认时的目录/模块判定；如属于本次需求，点右侧「纳入 scope」',
                          }, 'scope 外')
                          : null,
                        file.inScope === false
                          ? h(Button, {
                            style: { height: 22, padding: '0 6px', fontSize: T.font.xs },
                            disabled: busy,
                            onClick: (event) => {
                              event.stopPropagation()
                              adoptFileScope(file)
                            },
                            children: '纳入 scope',
                          })
                          : null,
                        h('span', {
                          style: {
                            ...styles.mono,
                            fontSize: T.font.xs,
                            color: T.text2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          },
                          title: display,
                        }, display),
                      ),
                      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
                        h('span', { style: { fontSize: T.font.xs, color: T.text4 } },
                          file.binary ? '二进制' : `+${file.added ?? 0} / -${file.removed ?? 0}`),
                        h('span', {
                          style: {
                            fontSize: T.font.xs,
                            color: file.noteSource === 'auto' ? T.text4 : T.text2,
                            flex: '1 1 120px',
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          },
                          title: file.note ?? '',
                        }, file.noteSource === 'auto'
                          ? (notesBusy ? '正在由 agent 补充说明…' : (file.note ?? ''))
                          : file.note),
                        file.noteSource === 'agent' ? h(Tag, { tone: 'neutral' }, 'agent') : null,
                        h('span', {
                          style: { fontSize: T.font.xs, color: T.brand, cursor: 'pointer', flex: '0 0 auto' },
                          title: '人工纠偏（默认由 agent 自动补充）',
                          onClick: (event) => {
                            event.stopPropagation()
                            setNoteEdit({ key, path: file.path, repo: file.repo, text: file.noteSource === 'auto' ? '' : (file.note ?? '') })
                          },
                        }, file.noteSource === 'human' ? '改说明' : '纠偏'),
                      ),
                    ),
                    editing
                      ? h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', padding: '6px 10px', background: T.surface2 } },
                        h('input', {
                          style: { ...styles.input, height: 26, flex: '1 1 auto' },
                          autoFocus: true,
                          placeholder: '一句话说明这个文件改了什么、为什么改',
                          value: noteEdit.text,
                          onChange: (event) => setNoteEdit({ key, path: file.path, repo: file.repo, text: event.target.value }),
                          onClick: (event) => event.stopPropagation(),
                          onKeyDown: (event) => {
                            if (event.key === 'Escape') { setNoteEdit(null); return }
                            if (event.key !== 'Enter' || event.shiftKey) return
                            event.preventDefault()
                            saveNote()
                          },
                        }),
                        h(Button, { style: mini, onClick: (event) => { event.stopPropagation(); saveNote() }, children: '保存' }),
                        h(Button, { style: mini, onClick: (event) => { event.stopPropagation(); setNoteEdit(null) }, children: '取消' }),
                      )
                      : null,
                  )
                })
                : h('div', { style: { ...styles.sectionHint, padding: 10 } },
                  onlyScope ? 'scope 内没有改动；取消勾选可看全部' : '这个流程还没有文件改动'),
              ),
              h('div', {
                style: { marginTop: 'auto', padding: '8px 10px', background: T.surface2, borderRadius: T.rBase, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
              },
                h('span', { style: styles.sectionHint }, `共 ${visible.length} 个文件`),
                Object.entries(kindCounts).map(([kind, count]) => h(Tag, {
                  key: kind,
                  tone: kind === '数据库模型' ? 'accent' : 'neutral',
                }, `${kind} ${count}`)),
                outScopeCount ? h(Tag, { tone: 'warn' }, `scope 外 ${outScopeCount}`) : null,
                h('span', { style: { ...styles.sectionHint, flex: '1 1 auto', textAlign: 'right' } }, '右侧默认展开关键改动'),
              ),
            ),
            h('div', { style: { flex: '1 1 58%', minWidth: 0 } },
              !diffFile
                ? renderKeyPreviews(visible)
                : diffLoading
                  ? h('div', { style: { ...styles.sectionHint, padding: 10 } }, '正在读取 diff…')
                  : h('div', null,
                    h('div', { style: { ...styles.row, marginBottom: 6 } },
                      h('span', {
                        role: 'button',
                        style: { fontSize: T.font.xs, color: T.brand, cursor: 'pointer', flex: '0 0 auto' },
                        onClick: () => setDiffFile(null),
                      }, '← 关键改动'),
                      fileRepoOf(diffData) ? h(Tag, { tone: 'accent' }, fileRepoOf(diffData)) : null,
                      h('span', { style: { ...styles.mono, fontSize: T.font.xs, color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis' } },
                        fileDisplayOf(diffData) || diffLabel || diffFile),
                      diffData?.truncated ? h(Tag, { tone: 'warn' }, '已截断') : null,
                      diffData?.mode === 'untracked' ? h(Tag, { tone: 'neutral' }, '未跟踪文件') : null,
                      diffData?.mode === 'worktree' ? h(Tag, { tone: 'warn' }, '仅工作区（无 baseline）') : null,
                      h('div', { style: styles.spacer }),
                      diffData && !diffData.binary ? h('span', { style: { ...styles.mono, fontSize: T.font.xs, color: T.text4 } }, `+${diffData.added} / -${diffData.removed}`) : null,
                    ),
                    diffData?.message ? h('div', { style: styles.sectionHint }, diffData.message) : null,
                    diffData?.binary
                      ? h('div', { style: styles.sectionHint }, '二进制文件，不显示内容')
                      : h('pre', {
                        style: {
                          margin: 0,
                          maxHeight: 420,
                          overflow: 'auto',
                          padding: '8px 0',
                          border: `1px solid ${T.borderSoft}`,
                          borderRadius: T.rBase,
                          background: T.surface,
                          fontFamily: T.mono,
                          fontSize: 12,
                          lineHeight: 1.6,
                        },
                      }, diffLines.map((line, index) => h('div', {
                        key: `${index}-${line.text.slice(0, 12)}`,
                        style: { ...diffLineStyle(line.type), padding: '0 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
                      }, line.text || ' '))),
                  ),
            ),
          )
          : h('div', { style: styles.sectionHint }, '还没有加载'),
      ),
    )
  }

  /* ------------------------------------------------------- 独立评审页 */

  function reviewerRoleLabel(role) {
    return REVIEWER_ROLES.find((entry) => entry.id === role)?.label ?? role ?? '审核'
  }

  function reviewerStatusText(reviewer) {
    if (reviewer.status === 'error') return '异常/未返回'
    if (reviewer.verdict === 'pass') return '通过'
    if (reviewer.verdict === 'fail') return '未通过'
    return '待返回'
  }

  function reviewerStatusTone(reviewer) {
    if (reviewer.status === 'passed') return 'ok'
    if (reviewer.status === 'failed') return 'danger'
    if (reviewer.status === 'error') return 'warn'
    return 'neutral'
  }

  const severityTone = (severity) => (severity === 'blocker' ? 'danger' : severity === 'major' ? 'warn' : 'neutral')

  /** 概览页的评审摘要：结论一眼可见，按钮跳到评审页。 */
  function renderReviewSummary() {
    const view = describeReview(draft)
    const tone = REVIEW_STATUS_TONES[view.status] ?? 'neutral'
    return h('div', { style: sectionBox },
      h('div', { style: styles.row },
        h('span', { style: styles.sectionTitle }, '独立评审'),
        h(Tag, { tone }, `${REVIEW_STATUS_LABELS[view.status] ?? view.status}${view.total ? ` · ${view.passed}/${view.total}` : ''}`),
        h('div', { style: styles.spacer }),
        h(Button, { style: mini, onClick: () => setTab('review'), children: '查看评审' }),
      ),
      h('div', { style: { ...styles.sectionHint, marginTop: 4 } },
        view.status === 'failed' && view.corrections.length
          ? `${view.gateReason}：${view.corrections.flatMap((entry) => entry.findings).slice(0, 2).join('；')}`
          : view.gateReason),
    )
  }

  /** 审核员卡片里的“实时动态”：最新回复 + 正在执行的工具，不要求用户跳会话。 */
  function renderReviewerProgress(reviewer) {
    if (!reviewer?.sessionId) return null
    const progress = reviewerProgress[reviewer.id]
    if (!progress) return null
    const items = (progress.items ?? []).filter((item) => item && (item.kind === 'assistant' || item.kind === 'tool'))
    const lastAssistant = [...items].reverse().find((item) => item.kind === 'assistant')
    const runningTool = [...items].reverse().find((item) => item.kind === 'tool' && item.status === 'running')
    const statusText = progress.reason
      ? `读取审核会话失败：${progress.reason}`
      : progress.alive === false
        ? '审核会话已结束；如果结论没有回写，可重置本轮后重试'
        : runningTool
          ? `正在执行：${runningTool.name || 'tool'}${runningTool.brief ? ` · ${runningTool.brief}` : ''}`
          : lastAssistant
            ? '已收到审核员的最新输出'
            : '审核会话已启动，等待第一条输出…'
    return h('div', { style: { ...styles.infoCard, marginTop: 6 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
        h(Spinner, { size: 10, tone: 'accent' }),
        h('span', { style: { fontSize: T.font.xs, fontWeight: 600, color: T.brand } }, '审核会话动态'),
        h('span', { style: { ...styles.sectionHint, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, statusText),
      ),
      lastAssistant?.text
        ? h('div', { style: { fontSize: T.font.xs, color: T.text2, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 92, overflow: 'hidden' } },
          `${String(lastAssistant.text).slice(0, 320)}${String(lastAssistant.text).length > 320 ? '…' : ''}`)
        : null,
    )
  }

  function renderReviewerCard(reviewer) {
    return h('div', { key: reviewer.id, style: sectionBox },
      h('div', { style: styles.row },
        h('span', { style: styles.sectionTitle }, reviewer.label),
        h(Tag, { tone: 'neutral' }, `视角：${reviewerRoleLabel(reviewer.role)}`),
        h('div', { style: styles.spacer }),
        h(Tag, { tone: reviewerStatusTone(reviewer) }, reviewerStatusText(reviewer)),
        reviewer.confidence ? h(Tag, { tone: 'neutral' }, `置信度 ${reviewer.confidence}`) : null,
      ),
      reviewer.error ? h('div', { style: { ...styles.dangerCard, marginTop: T.gap.xs } }, `审核员会话异常：${reviewer.error}`) : null,
      !reviewer.error && reviewer.status === 'pending' ? renderReviewerProgress(reviewer) : null,
      reviewer.summary
        ? h('div', { style: { whiteSpace: 'pre-wrap', color: T.text2, fontSize: T.font.base, lineHeight: T.line, marginTop: 6 } }, reviewer.summary)
        : (!reviewer.error && reviewer.status === 'pending' ? h('div', { style: styles.sectionHint }, '等待审核员返回结论…') : null),
      reviewer.direction ? h('div', { style: { ...styles.infoCard, marginTop: 6 } }, `方向建议：${reviewer.direction}`) : null,
      reviewer.findings.length
        ? h('ul', { style: { margin: '8px 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 } },
          reviewer.findings.map((finding, index) => h('li', {
            key: `${reviewer.id}-${index}`,
            style: { display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: T.font.sm, color: T.text2 },
          },
            h(Tag, { tone: severityTone(finding.severity) }, finding.severity),
            h('span', null,
              finding.summary,
              finding.file ? h('span', { style: { ...styles.mono, color: T.text4, marginLeft: 6 } }, finding.file) : null,
              finding.detail ? h('div', { style: { color: T.text3, marginTop: 2 } }, finding.detail) : null),
          )))
        : null,
      h('div', { style: { ...styles.sectionHint, marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' } },
        reviewer.source === 'manual'
          ? '结论来源：人工记录'
          : (reviewer.sessionId
            ? (reviewer.status === 'pending'
              ? h('span', null, '审核会话：', h('span', {
                role: 'button',
                title: '打开审核员子会话（运行中可查看它的实际读代码过程）',
                style: { color: T.brand, cursor: 'pointer' },
                onClick: () => onOpenSession?.(reviewer.sessionId),
              }, reviewer.sessionId))
              : `审核会话：${reviewer.sessionId}（已结束）`)
            : '审核会话：—'),
        reviewer.elapsedMs ? `耗时 ${Math.round(reviewer.elapsedMs / 1000)}s` : null,
        reviewer.finishedAt ? `返回于 ${fmtTime(reviewer.finishedAt)}` : null,
      ),
    )
  }

  function renderReview() {
    const view = describeReview(draft)
    const tone = REVIEW_STATUS_TONES[view.status] ?? 'neutral'
    const border = view.status === 'passed' ? T.ok : view.status === 'failed' ? T.danger : view.status === 'error' ? T.warnText : T.brand
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
      h('div', { style: { ...sectionBox, borderLeft: `3px solid ${border}` } },
        h('div', { style: styles.row },
          h('span', { style: styles.sectionTitle }, '独立评审'),
          h(Tag, { tone }, REVIEW_STATUS_LABELS[view.status] ?? view.status),
          view.round ? h(Tag, { tone: 'neutral' }, `第 ${view.round} 轮`) : null,
          h('div', { style: styles.spacer }),
          view.status === 'pending'
            ? h(Button, { style: mini, disabled: reviewBusy, onClick: resetReview, children: '重置本轮' })
            : (view.status === 'failed' || view.status === 'error')
              ? h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
                h(Button, {
                  style: {
                    height: 30,
                    padding: '0 12px',
                    fontSize: T.font.sm,
                    fontWeight: 600,
                    color: T.warnText,
                    background: T.warnSoft,
                    borderColor: T.warn,
                  },
                  disabled: reviewBusy || busy,
                  title: '确认忽略本轮评审拒绝：原审核意见保留，审核员标记为人工通过，然后继续测试/提交',
                  onClick: overrideReview,
                  children: '人工通过本轮',
                }),
                h(Button, { style: mini, disabled: reviewBusy || busy, onClick: startReview, children: '重新评审' }))
              : null,
          view.total ? h('span', { style: styles.sectionHint }, `${view.passed} 通过 / ${view.failed} 不通过 / ${view.errored} 异常 / ${view.pending} 待返回${reviewElapsed !== null ? ` · 已用时 ${reviewElapsed}s` : ''}`) : null,
        ),
        advanceError
          ? h('div', { style: { ...styles.dangerCard, marginTop: T.gap.xs } }, advanceError)
          : null,
        view.status === 'failed'
          ? h('div', { style: { ...styles.warnCard, marginTop: T.gap.xs, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            h('span', { style: { fontSize: T.font.sm, color: T.warnText, flex: '1 1 360px' } },
              '评审未通过。默认应把纠偏意见发回开发会话返工；如果确认这次拒绝可以忽略，点右侧「人工通过本轮」放行到测试/提交，原意见会保留。'),
            h(Button, {
              style: { height: 30, padding: '0 12px', fontSize: T.font.sm, fontWeight: 600, color: T.warnText, background: T.warnSoft, borderColor: T.warn },
              disabled: reviewBusy || busy,
              onClick: overrideReview,
              children: '人工通过本轮',
            }))
          : null,
        h('div', { style: { ...styles.sectionHint, marginTop: 4 } },
          '本页只读：不再提供手工派发入口。「继续推进」即开始评审——自动起 1~3 位只读审核员会话，'
          + '他们自己读目标/验收/scope/改动/自测结果/开发报告，各自给结论。'
          + '评审不是强制门禁：确认拒绝可忽略时点「人工通过本轮」，保留原意见并继续测试/提交；'
          + '不通过时也会展示纠偏意见，异常或未返回不会被伪装成自动通过。'),
        h('div', { style: { ...styles.row, marginTop: T.gap.xs, flexWrap: 'wrap' } },
          h('span', { style: styles.sectionHint },
            advance.action === 'wait'
              ? `评审进行中：${view.passed}/${view.total} 位已返回，等审核员结论（不重复派发）`
              : advance.action === 'dispatch'
                ? '开发阶段已完成：点「开始独立评审」即开始本轮评审'
                : advance.action === 'rework'
                  ? advance.hint
                  : advance.action === 'verify'
                    ? advance.hint
                    : advance.action === 'retry'
                      ? advance.hint
                      : '评审已结束：可以按结论继续推进流程'),
          h('div', { style: styles.spacer }),
          h(Button, { style: mini, onClick: () => setTab('report'), children: '查看开发报告' }),
        ),
        running
          ? h('div', { style: { ...styles.sectionHint, marginTop: 4 } }, '开发会话还在改代码：等它停下来再继续推进，否则审的是半成品。')
          : null,
        view.basis
          ? h('div', { style: { ...styles.sectionHint, marginTop: 4 } },
            `评审依据：${view.basis.files} 个文件 +${view.basis.added}/-${view.basis.removed} · 本机自测${TEST_TEXT[view.basis.localTest] ?? view.basis.localTest}${view.basis.head ? ` · ${String(view.basis.head).slice(0, 12)}` : ''}`)
          : null,
      ),
      view.status === 'failed' && view.corrections.length
        ? h('div', { style: { ...sectionBox, borderLeft: `3px solid ${T.danger}` } },
          h('div', { style: styles.sectionTitle }, '退回开发的纠偏意见'),
          h('div', { style: styles.sectionHint }, '流程已回到「开发中」：按下面的意见改完，再点「继续推进」重试评审（历史轮次会留在台账里）。'),
          view.corrections.map((correction) => h('div', { key: correction.reviewerId, style: { marginTop: T.gap.xs } },
            h('div', { style: { fontWeight: 600, color: T.text2, fontSize: T.font.sm } }, `${correction.reviewerLabel}：${correction.summary || ''}`),
            h('ul', { style: { margin: '4px 0 0', paddingLeft: 18, color: T.text2, fontSize: T.font.sm, lineHeight: T.line } },
              correction.findings.map((finding, index) => h('li', { key: `${correction.reviewerId}-${index}` }, finding))),
          )))
        : null,
      view.total
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } }, view.reviewers.map(renderReviewerCard))
        : h('div', { style: sectionBox },
          h('div', { style: styles.sectionTitle }, '还没有开始评审'),
          h('div', { style: { ...styles.sectionHint, marginTop: 4 } },
            '开发阶段完成、本机自测通过后，点顶栏「继续推进」即自动开始评审（审核员按默认配置产生）。审核员只读，不会改代码；他们给的结论会写进台账与开发报告。')),
      view.history.length
        ? h('details', { style: sectionBox },
          h('summary', { style: { cursor: 'pointer', fontSize: T.font.sm, fontWeight: 600 } }, `历史轮次（${view.history.length}）`),
          view.history.map((round) => h('div', { key: round.round, style: { marginTop: T.gap.xs, fontSize: T.font.sm } },
            h('div', { style: { fontWeight: 600, color: T.text2 } },
              `第 ${round.round} 轮 · ${REVIEW_STATUS_LABELS[round.status] ?? round.status} · ${round.decidedAt ? fmtTime(round.decidedAt) : '—'}`),
            ...(round.reviewers ?? []).map((reviewer) => h('div', { key: reviewer.id, style: { color: T.text3, marginTop: 2 } },
              `${reviewer.label}：${reviewer.verdict === 'pass' ? '通过' : reviewer.verdict === 'fail' ? '不通过' : '未返回'}${reviewer.summary ? ` —— ${reviewer.summary}` : ''}`)),
          )))
        : null,
    )
  }

  function renderTestAndSubmit() {
    const list = changes?.changes ?? []
    const localStatus = tests.local?.status ?? 'not_run'
    const envStatus = tests.environment?.status ?? 'not_run'
    // 测试通过后代码/诉求又变了：旧结果标记 expired，主操作回到"重跑本机自测"
    const localValid = localStatus === 'passed' && !tests.local?.stale
    const envValid = envStatus === 'passed' && !tests.environment?.stale
    const isAnalysis = draft.workflow?.intent === 'analysis'
    // 分析流程只读：没有提交/推送环节，本机自测通过即结束
    const isGitRepo = draft.workflow?.gitRepo !== false && !isAnalysis
    // 评审是测试验证的门禁：本机自测通过后点「继续推进」即开始评审，评审通过才允许跑环境测试
    const reviewAllowed = reviewView.status === 'passed'
    const step = isAnalysis
      ? (!localValid
        ? { label: '跑本机自测', hint: '分析流程只读：跑通本机自测作为结论证据，通过后流程直接完成（不跑环境测试、不提交）', action: () => runTest('local'), command: tests.local?.command }
        : { label: '已完成', hint: '分析流程只读：结论产出即结束，不建 worktree、不产生提交', action: () => {}, command: null })
      : !localValid
        ? { label: '重跑本机自测', hint: tests.local?.stale ? '测试通过后代码/诉求又有变化：旧结果已过期，重跑后才会进入评审' : '跑通后进入「独立评审」；评审通过才允许跑环境测试', action: () => runTest('local'), command: tests.local?.command }
        : !reviewAllowed
          ? {
            // 评审阶段的主操作也是「继续推进」：与顶栏同一个自动派发入口，不是手工派发按钮
            label: reviewView.status === 'failed'
              ? '重新开始评审'
              : reviewView.status === 'error'
                ? '重试评审'
                : reviewView.status === 'idle'
                  ? '继续推进即开始评审'
                  : '查看评审状态',
            hint: reviewView.status === 'failed'
              ? '评审未通过：流程已退回开发，按纠偏意见改完再点它重试评审'
              : reviewView.status === 'error'
                ? '评审异常待处理：有审核员未返回结论，点它重试派发（不重复已返回的结论）'
                : reviewView.status === 'idle'
                  ? '本机自测已通过：点它即自动开始评审（审核员按默认配置产生），评审通过后才能跑环境测试'
                  : '评审进行中：等审核员返回结论，不要跳过评审直接跑环境测试',
            action: () => {
              if (reviewView.status === 'pending') { setTab('review'); return }
              startReview()
            },
            command: null,
          }
          : !envValid
            ? {
              label: '跑环境测试',
              hint: isGitRepo ? '环境验证通过后阶段会进入「待提交」' : '环境验证通过后，这个流程自动完成（非 git 仓库没有提交环节）',
              action: () => runTest('environment'),
              command: tests.environment?.command,
            }
            : isGitRepo
              ? { label: '提交代码', hint: '测试都过了：选分支、提交并推送', action: () => { const node = typeof document !== 'undefined' ? document.getElementById('devhub-submit') : null; node?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }) }, command: null }
              : { label: '已完成', hint: '非 git 仓库：测试通过即完成，无需提交/推送', action: () => {}, command: null }
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
      h('div', { style: { ...sectionBox, borderLeft: `3px solid ${T.brand}` } },
        h('div', { style: styles.row },
          h('span', { style: styles.sectionTitle }, '推进到验证'),
          h(Tag, { tone: 'accent' }, STAGE_LABELS[stage] ?? stage),
          h('div', { style: styles.spacer }),
          h(Button, { primary: true, disabled: busy, onClick: step.action, children: busy ? '执行中…' : step.label }),
        ),
        h('div', { style: { ...styles.sectionHint, marginTop: 4 } }, step.hint),
        h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 } },
          h('span', { style: { ...styles.smallMuted } }, `本机自测 ${TEST_TEXT[localStatus] ?? localStatus}`),
          h('span', { style: { color: T.text4 } }, '→'),
          isAnalysis
            ? h('span', { style: { ...styles.smallMuted } }, '结论（只读，不跑环境测试/不提交）')
            : h('span', { style: { ...styles.smallMuted } }, `环境测试 ${TEST_TEXT[envStatus] ?? envStatus}`),
          h('span', { style: { color: T.text4 } }, '→'),
          h('span', { style: { ...styles.smallMuted } }, isAnalysis ? '已完成' : '提交'),
          step.command ? h('span', { style: { ...styles.mono, fontSize: T.font.xs, color: T.text4 } }, step.command) : null,
        ),
      ),
      testBlock('local', '本机自测', isAnalysis ? '分析流程用本机自测作为只读证据；通过即结束，不修改代码' : '先在本机跑通，再进独立评审'),
      isAnalysis ? null : testBlock('environment', '环境测试', '本机自测 + 独立评审通过后才可执行'),
      isGitRepo ? h('div', { style: sectionBox, id: 'devhub-submit' },
        h('div', { style: styles.spread },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('div', { style: styles.sectionTitle }, '提交代码'),
            h('div', { style: styles.sectionHint }, '只提交你勾选的文件，不会 git add -A'),
          ),
          h(Button, { style: mini, disabled: busy, onClick: loadChanges, children: changes ? '重新加载变更文件' : '加载变更文件' }),
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: T.gap.xs } },
          h('div', { style: styles.sectionHint }, '推送目标'),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: T.font.sm, cursor: 'pointer' } },
            h('input', {
              type: 'radio', name: 'branchMode', checked: branchMode === 'current',
              onChange: () => setBranchMode('current'),
            }),
            `基于当前分支推送（${changes?.branch ?? '当前分支'}）`),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: T.font.sm, cursor: 'pointer' } },
            h('input', {
              type: 'radio', name: 'branchMode', checked: branchMode === 'new',
              onChange: () => setBranchMode('new'),
            }),
            '新建分支后推送'),
          branchMode === 'new'
            ? h('input', {
              style: { ...styles.input, height: 30, maxWidth: 360 },
              placeholder: '新分支名，例如 feature/gerrit-source',
              value: branchName,
              onChange: (event) => setBranchName(event.target.value),
            })
            : null,
          h('div', { style: styles.sectionHint },
            '提交后会立即执行 git push（新分支自动建立 upstream）；台账 .dev-hub 会跟代码一起提交。'),
        ),
        h('input', {
          style: { ...styles.input, marginTop: T.gap.xs },
          placeholder: '提交信息',
          value: commitMessage,
          onChange: (event) => setCommitMessage(event.target.value),
        }),
        changes
          ? h('div', { style: { marginTop: T.gap.xs } },
            list.length
              ? (() => {
                const groups = changesByRepo()
                const multi = groups.length > 1 || groups.some(([repo]) => Boolean(repo))
                const row = (change) => h('label', {
                  key: change.key ?? `${change.repoName ?? change.repo ?? ''}/${change.path}`,
                  style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: T.font.sm, cursor: 'pointer' },
                },
                  h('input', { type: 'checkbox', checked: selectedPaths.includes(change.path), onChange: () => togglePath(change.path) }),
                  multi && (change.repoName || change.repo)
                    ? h(Tag, { tone: 'accent' }, change.repoName ?? repoBaseName(change.repo))
                    : null,
                  h('span', { style: { ...styles.mono, color: T.text2 } }, change.path),
                  change.type ? h(Tag, { tone: 'neutral' }, change.type) : null,
                )
                // 单库照旧平铺；虚拟库按成员库分组，避免"提交了哪几个库"看不出来
                if (!multi) return list.map(row)
                return groups.map(([repo, rows]) => h('div', { key: repo || '__members__', style: { marginTop: 4 } },
                  h('div', { style: { ...styles.sectionHint, paddingLeft: 2, fontWeight: 600, color: T.text2 } },
                    `${repo || '成员库'}（${rows.length}）`),
                  rows.map(row),
                ))
              })()
              : h('div', { style: styles.sectionHint }, '没有未提交的变更。'),
            h('div', { style: { ...styles.row, marginTop: T.gap.xs } },
              h(Button, { primary: true, disabled: busy, onClick: () => submitCode(), children: busy ? '提交并推送中…' : '提交并推送' }),
              submissionNeedsRetry()
                ? h(Button, { disabled: busy, onClick: () => submitCode({ pushOnly: true }), children: '重试推送' })
                : null,
              h('span', { style: styles.sectionHint }, `${selectedPaths.length} 个文件已选`),
            ),
          )
          : null,
        // 逐成员库提交结果：部分失败时不能只留一句 error，要说清朝哪个库失败、哪个已推
        submitData && submitData.repos.length
          ? h('div', { style: { marginTop: T.gap.xs, display: 'flex', flexDirection: 'column', gap: 6 } },
            h('div', { style: submitData.ok ? styles.okCard : styles.dangerCard },
              submitData.ok
                ? `已提交并推送 ${submitData.repos.length} 个成员库`
                : `部分成员库失败：${submitData.failed}/${submitData.repos.length} 个未成功（已提交成功的库不会回滚，可修好后重试推送）`),
            h('div', { style: { border: `1px solid ${T.borderSoft}`, borderRadius: T.rBase, background: T.surface } },
              submitData.repos.map((repo, index) => h('div', {
                key: repo.path ?? repo.name ?? index,
                style: { padding: '6px 10px', borderTop: index ? `1px solid ${T.borderSoft}` : 'none', display: 'flex', flexDirection: 'column', gap: 3 },
              },
                h('div', { style: styles.row },
                  h(Tag, { tone: repo.error ? 'danger' : repo.pushed === false ? 'warn' : 'ok' },
                    repo.error ? '失败' : repo.pushed === false ? '未推送' : '已推送'),
                  h('span', { style: { fontWeight: 600, color: T.text2 } }, repoDisplayName(repo)),
                  repo.branch ? h('span', { style: { ...styles.mono, fontSize: T.font.xs, color: T.text4 } }, repo.branch) : null,
                  repo.commit ? h('span', { style: { ...styles.mono, fontSize: T.font.xs, color: T.text4 } }, String(repo.commit).slice(0, 8)) : null,
                ),
                repo.error ? h('div', { style: styles.smallDanger }, repo.error) : null,
                repo.pushOutput
                  ? h('details', { style: { marginTop: 2 } },
                    h('summary', { style: { cursor: 'pointer', fontSize: T.font.sm, color: T.brand } }, '查看推送输出'),
                    h('pre', { style: { ...styles.pre, marginTop: 4, maxHeight: 160 } }, String(repo.pushOutput).slice(-2000)))
                  : null,
              ))),
          )
          : submitResult
            ? h('pre', { style: { ...styles.pre, marginTop: T.gap.xs } }, submitResult)
            : null,
      )
        : h('div', { style: sectionBox },
          h('div', { style: styles.sectionTitle }, '不需要提交'),
          h('div', { style: { ...styles.sectionHint, marginTop: 4 } },
            '这个代码库不是 git 仓库：没有提交与推送环节。本机自测 + 环境测试都通过后，流程会自动完成。'),
        ),
    )
  }

  /* ------------------------------------------------------------- 更多区 */

  function renderMore() {
    return h('details', { style: { ...styles.cardFlat, padding: '10px 12px' } },
      h('summary', { style: { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap' } },
        h('span', { style: styles.sectionTitle }, '更多'),
        h('span', { style: styles.sectionHint }, '标题、历史与删除（低频）'),
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm, marginTop: T.gap.sm } },
        draft.session?.id
          ? h('div', { style: sectionBox },
            h('div', { style: styles.sectionTitle }, '换一条开发会话'),
            h('div', { style: { ...styles.sectionHint, marginTop: 4 } },
              '默认沿用当前会话（上下文不丢）。只有当前会话不可用、或确实想从零开始时，才需要新建。'),
            h('div', { style: { ...styles.row, marginTop: 6 } },
              h(Button, {
                style: mini,
                disabled: busy || Boolean(launchBusy),
                onClick: () => runLaunch('fresh', () => onLaunch?.(draft.id, { fresh: true })),
                children: launchBusy === 'fresh'
                  ? [h(Spinner, { key: 'spin', size: 10, tone: 'accent' }), '正在开启开发会话…']
                  : '新建开发会话',
              }),
            ),
          )
          : null,
        draft.session?.id
          ? h('div', { style: sectionBox },
            h('div', { style: styles.sectionTitle }, '同步最新上下文（低频）'),
            h('div', { style: { ...styles.sectionHint, marginTop: 4 } },
              '「继续推进」只发一句短消息，不重发 Context Pack；只有计划/约束大改后，才需要把最新一包重新发回会话。'),
            h('div', { style: { ...styles.row, marginTop: 6 } },
              h(Button, {
                style: mini,
                disabled: busy,
                onClick: () => onLaunch?.(draft.id, { resync: true }),
                children: '重发最新上下文',
              }),
            ),
          )
          : null,
        h('div', { style: sectionBox },
          sectionHead('标题', '工作站按目标概括；也可以自己改', 'title'),
          isEditing('title')
            ? h('div', null,
              h('input', {
                style: { ...styles.input, marginTop: T.gap.xs },
                value: draft.title ?? '',
                onChange: (event) => update('title', event.target.value),
              }),
              editFooter('已保存标题'))
            : h('div', { style: { ...styles.row, marginTop: T.gap.xs } },
              h('span', { style: { fontWeight: 600, color: T.text } }, draft.title || draft.id),
              isWeakTitle(draft.title, draft.description) ? h(Tag, { tone: 'warn' }, '标题待整理') : null,
              h(StatusPill, { status: draft.status }),
              showStageTag ? h(Tag, { tone: 'neutral' }, stageLabelText) : null,
              h('span', { style: styles.sectionHint },
                draft.workflow?.stageReason ? `· ${draft.workflow.stageReason}` : ''),
            ),
          isEditing('title') ? null : h('div', { style: { ...styles.row, marginTop: T.gap.xs, flexWrap: 'wrap' } },
            isWeakTitle(draft.title, draft.description)
              ? h('span', { style: styles.sectionHint }, '当前标题像原始输入/代码片段：点右边按目标自动概括一个。')
              : null,
            h('div', { style: { flex: '1 1 auto' } }),
            h(Button, {
              style: mini,
              disabled: titleBusy || busy,
              onClick: regenerateTitle,
              children: titleBusy ? '生成中…' : '自动生成标题',
            }),
          ),
        ),
        h('div', { style: sectionBox },
          h('div', { style: styles.sectionTitle }, '历史'),
          (draft.history ?? []).length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: T.gap.xs } },
              [...(draft.history ?? [])].slice(-20).reverse().map((entry, index) => h('div', {
                key: `${entry.at}-${index}`,
                style: { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: T.font.sm },
              },
                h('span', { style: { ...styles.mono, color: T.text4, flex: '0 0 auto' } }, fmtTime(entry.at)),
                h('span', { style: { color: T.text2 } }, entry.message),
              )))
            : h('div', { style: { ...styles.sectionHint, marginTop: 4 } }, '还没有历史记录'),
        ),
        h('div', { style: sectionBox },
          h('div', { style: styles.sectionTitle }, '删除流程'),
          h('div', { style: { ...styles.sectionHint, marginTop: 4 } },
            '只删除这条流程的台账（目标/计划/验收/历史/会话绑定）；**不会**回滚已改代码，也**不会**删除 DSH 开发会话。'),
          h('div', { style: { ...styles.row, marginTop: T.gap.xs } },
            h(Button, {
              // 删除是破坏性操作：用危险色（红）标识，和普通次要按钮区分开
              style: {
                border: `1px solid ${T.danger}`,
                background: T.dangerSoft,
                color: T.danger,
                fontWeight: 500,
              },
              disabled: busy,
              onClick: async () => {
                const ok = typeof window !== 'undefined' && window.confirm(
                  `删除流程「${draft.title || draft.id}」？\n\n只删台账；代码不回滚、DSH 会话不删除。这个操作不可撤销。`,
                )
                if (!ok) return
                setBusy(true)
                setError('')
                try {
                  await api(API.deleteItem, { method: 'POST', body: JSON.stringify({ id: draft.id }) })
                  onDeleted?.(draft.id)
                } catch (err) {
                  setError(errorText(err))
                } finally {
                  setBusy(false)
                }
              },
              children: '删除这个流程',
            }),
          ),
        ),
      ),
    )
  }

  /* --------------------------------------------------------- 下一步对话 */

  /**
   * 进入流程后先给一段"对话"：当前状态摘要 + 最多 3 条按事实算出的建议，
   * 再加一个输入框（推进什么 / 有什么改进建议）。
   * 建议动作全部映射到已有能力，不新增隐藏逻辑。
   */
  function renderNextStep() {
    const summary = describeFlow(draft, session)
    const { steps } = suggestNextSteps(draft, session)
    const boundId = draft.session?.id ?? null
    // 开发任务完成 ≠ 流程完成：把还差的那一步直接说出来（列表与详情同一套口径）
    const pendingStep = pendingFlowStep({
      status: summary.status,
      stage: summary.stage,
      testState: summary.localTest,
      environmentTestState: summary.environmentTest,
    })
    const tasksAllDone = summary.tasks.total > 0 && summary.tasks.done >= summary.tasks.total
    // 流程已完成：隐藏「继续推进」输入区与待处理审批，只留结果入口
    if (summary.status === 'done' || summary.stage === 'done') {
      return h('div', { style: { ...styles.cardFlat, display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
        h('div', { style: styles.row },
          h(IconSeat, { size: 26, tone: 'ok' }, '✓'),
          h('span', { style: styles.sectionTitle }, '流程已完成'),
          h(Tag, { tone: 'ok' }, '已完成'),
        ),
        h('div', { style: styles.sectionHint },
          '目标、改动范围、测试结果与提交记录都已归档；需要回看时打开开发报告或变更文件。'),
        h('div', { style: styles.row },
          h(Button, { primary: true, onClick: () => setReportPreviewOpen(true), children: '预览开发报告' }),
          h(Button, { onClick: () => setTab('overview'), children: '查看变更文件' }),
          h(Button, { onClick: () => setTab('test'), children: '查看测试与提交' }),
        ),
      )
    }

    /** 打开建议对应的区块：切页签 + 进编辑态 + 滚到可见位置（避免"点了没反应"）。 */
    function scrollToId(id, block = 'center') {
      if (typeof document === 'undefined') return
      setTimeout(() => {
        try { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block }) } catch { /* 忽略 */ }
      }, 0)
    }

    async function runStep(action) {
      setError('')
      setNotice('')
      if (action === 'launch') { onLaunch?.(draft.id); return }
      if (action === 'start-review') { await startReview(); return }
      if (action === 'rework') { await reworkFromReview(); return }
      if (action === 'review') { setTab('review'); return }
      if (action === 'local-test') { runTest('local'); return }
      if (action === 'env-test') { runTest('environment'); return }
      if (action === 'submit') { setTab('test'); return }
      if (action === 'edit-plan') {
        setTab('plan')
        beginEdit('plan')
        scrollToId('devhub-plan', 'start')
        return
      }
      if (action === 'edit-risks') {
        setTab('overview')
        // 风险区现在是勾选列表：直接滚过去让人逐条勾「已知晓」，不自动进编辑态
        // （编辑态只用于增删风险文本，入口是区块右上角的「编辑」）。
        setEditKey(null)
        setSnapshot(null)
        scrollToId('devhub-risks', 'center')
        return
      }
      if (action === 'ask-session') { askSession(); return }
    }

    /**
     * 统一入口：用户只说一句话，由工作站（dsh）判断去补台账还是发开发会话，
     * 不再让用户区分「补充信息 / 推进开发」。
     */
    async function sendUnified() {
      const message = askText.trim()
      if (!message || busy || assistBusy) return
      setAssistBusy(true)
      setError('')
      setNotice('')
      setAssistLog((current) => [...current, { role: 'user', text: message }])
      try {
        const body = await api(API.dispatch, { method: 'POST', body: JSON.stringify({ id: draft.id, message }) })
        if (body.item) { setDraft(body.item); onSaved?.(body.item) }
        let sentToSession = false
        const targetSession = draft.session?.id
        if ((body.action === 'session' || body.action === 'both') && targetSession) {
          const sent = await sendToSession(ctx, targetSession, body.sessionMessage || message)
          sentToSession = Boolean(sent?.sent)
        }
        const parts = [body.reply]
        if (body.applied?.length) parts.push(`已更新台账：${body.applied.join('、')}`)
        if (sentToSession) parts.push('已发到开发会话')
        if (body.action === 'session' && !targetSession) parts.push('但还没绑定开发会话')
        parts.push(`（判定：${{ ledger: '补台账', session: '推进开发', both: '台账+开发', none: '无需处理' }[body.action] ?? body.action}${body.engine === 'local' ? ' · 本地规则降级' : ''}）`)
        setAssistLog((current) => [...current, { role: 'assistant', text: parts.filter(Boolean).join('；') }])
        setAskText('')
        setNotice(parts.join('；'))
      } catch (err) {
        setAssistLog((current) => [...current, { role: 'assistant', text: `处理失败：${errorText(err)}` }])
        setError(errorText(err))
      } finally {
        setAssistBusy(false)
      }
    }

    /** 对话式补充：一句话交给 agent 整理进台账（不是让人逐项填）。 */
    async function sendAssist() {
      const message = askText.trim()
      if (!message || assistBusy) return
      setAssistBusy(true)
      setError('')
      setNotice('')
      setAssistLog((current) => [...current, { role: 'user', text: message }])
      try {
        const body = await api(API.assist, { method: 'POST', body: JSON.stringify({ id: draft.id, message }) })
        setAssistLog((current) => [...current, { role: 'assistant', text: body.reply ?? '（没有回复）' }])
        if (body.item) { setDraft(body.item); onSaved?.(body.item) }
        setAskText('')
        setNotice(body.applied?.length
          ? `已按你的话更新：${body.applied.join('、')}（不满意可点「编辑」纠偏）`
          : '这句话没有产生字段变更；可以换个说法，或直接说"目标/验收/风险要改成…"')
      } catch (err) {
        setAssistLog((current) => [...current, { role: 'assistant', text: `处理失败：${errorText(err)}` }])
        setError(errorText(err))
      } finally {
        setAssistBusy(false)
      }
    }

    async function askSession() {
      if (askBusy) return
      setAskBusy(true)
      setError('')
      setNotice('')
      try {
        const message = composeAsk(summary, askText)
        let target = boundId
        if (!target) {
          // 还没有会话：先开一个（会带上 Context Pack），再把这句话作为追问发过去
          const launched = await onLaunch?.(draft.id)
          if (launched?.error) throw new Error(launched.error)
          target = launched?.sessionId ?? null
        }
        if (!target) throw new Error('还没有可用的开发会话：请先开启开发会话')
        const result = await sendToSession(ctx, target, message)
        if (!result.sent) throw new Error(result.reason ?? '发送失败')
        setAskText('')
        setNotice('已发到开发会话：它会按当前状态推进/给建议，进度显示在下方「会话内容」。')
      } catch (err) {
        setError(errorText(err))
      } finally {
        setAskBusy(false)
      }
    }

    const pending = (pendingQuestions ?? []).filter((entry) => (entry.questions ?? []).length)
    const approvals = (pendingApprovals ?? []).filter((entry) => entry?.title)

    function toggleAnswer(questionId, label, multi) {
      setAnswerPick((current) => {
        const chosen = current[questionId] ?? []
        if (multi) {
          return { ...current, [questionId]: chosen.includes(label) ? chosen.filter((item) => item !== label) : [...chosen, label] }
        }
        return { ...current, [questionId]: chosen.includes(label) ? [] : [label] }
      })
    }

    async function submitAnswer(callId, questions, { skip = false } = {}) {
      if (answerBusy) return
      setAnswerBusy(true)
      setError('')
      setAnswerFeedback({ callId, tone: 'ok', text: '正在提交回答…' })
      try {
        const answers = (questions ?? []).map((question) => ({
          id: question.id,
          selected: skip ? [] : (answerPick[question.id] ?? []),
          ...(skip ? {} : (answerCustom[question.id] ? { custom: answerCustom[question.id] } : {})),
        }))
        const body = await api(API.answer, {
          method: 'POST',
          body: JSON.stringify({ id: draft.id, callId, answers }),
        })
        setAnswerPick({})
        setAnswerCustom({})
        setNotice(body.accepted
          ? '已把答案发回开发会话，它会继续推进。'
          : '答案已提交，但会话当前没在等待（可能已超时）；下方会显示剩余待答问题。')
        setAnswerFeedback({
          callId,
          tone: body.accepted ? 'ok' : 'warn',
          text: body.accepted ? '已提交，会话会继续推进。' : '已提交，但会话可能已不再等待（已超时）。',
        })
        onPendingRefresh?.()
      } catch (err) {
        const text = errorText(err)
        setError(text)
        setAnswerFeedback({ callId, tone: 'danger', text: `提交失败：${text}` })
      } finally {
        setAnswerBusy(false)
      }
    }

    return h('div', { style: { ...styles.cardFlat, display: 'flex', flexDirection: 'column', gap: T.gap.xs } },
      approvals.length
        ? h('div', { key: 'approvals', style: styles.warnCard },
          h('div', { style: { ...styles.row, marginBottom: 4 } },
            h('span', { style: { fontWeight: 600 } }, '会话在等待授权 / 审批'),
            h(Tag, { tone: 'warn' }, '已暂停'),
            h('div', { style: styles.spacer }),
            h(Button, { style: mini, onClick: () => onOpenSession?.(draft.session?.id), children: '去会话处理' }),
          ),
          approvals.map((approval) => h('div', { key: approval.id, style: { marginTop: 4, fontSize: T.font.sm, color: T.text2 } },
            h('div', { style: { fontWeight: 500 } }, approval.title),
            approval.detail ? h('div', { style: { ...styles.sectionHint, marginTop: 2 } }, approval.detail) : null,
          )),
          h('div', { style: { ...styles.sectionHint, marginTop: 6 } },
            '授权/登录类请求只能在会话里确认（DSH 没给插件放行的接口）；点「去会话处理」直接到那一步。'),
        )
        : null,
      pending.map((entry) => {
        // 前台阻塞的提问（open）只能由会话页的 answerer 回答；
        // 工作站 Remote answer 对 open 会返回 false，所以这里直接引导去会话，不假装能代答。
        const needsSession = entry.answerable === false || entry.state === 'open'
        return h('div', { key: entry.callId, style: styles.warnCard },
          h('div', { style: { ...styles.row, marginBottom: 6 } },
            h('span', { style: { fontWeight: 600 } }, needsSession ? '会话正在前台等你选择' : '开发会话在等你回答'),
            h(Tag, { tone: 'warn' }, needsSession ? '需在会话处理' : '已暂停'),
            h('div', { style: styles.spacer }),
            needsSession
              ? h(Button, { style: mini, onClick: () => onOpenSession?.(draft.session?.id), children: '去会话处理' })
              : h('span', { style: styles.sectionHint }, '不答就会一直等；也可以「跳过」让它按默认推进'),
          ),
          needsSession
            ? h('div', { style: { ...styles.sectionHint, marginBottom: 4 } },
              '这个选择正在会话前台等待，只能在开发会话里点选；工作站不能代答，下面的选项仅用于查看。')
            : null,
          (entry.questions ?? []).map((question) => h('div', { key: question.id, style: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 } },
            h('div', { style: { fontSize: T.font.sm, fontWeight: 600, color: T.text } },
              question.header ? `${question.header}：` : '', question.question),
            question.detail ? h('div', { style: { fontSize: T.font.xs, color: T.text4 } }, question.detail) : null,
            h('div', { style: styles.row },
              (question.options ?? []).map((option) => {
                const chosen = (answerPick[question.id] ?? []).includes(option.label)
                return h('span', {
                  key: option.label,
                  title: option.description ?? '',
                  style: { ...(chosen ? styles.chipOn : styles.chip), cursor: needsSession ? 'default' : 'pointer' },
                  onClick: () => { if (!needsSession) toggleAnswer(question.id, option.label, question.multiSelect) },
                }, `${chosen ? '✓ ' : ''}${option.label}`)
              }),
            ),
            h('input', {
              style: { ...styles.input, marginTop: 2 },
              placeholder: '也可以直接写你的答案（可留空）',
              value: answerCustom[question.id] ?? '',
              disabled: needsSession,
              onChange: (event) => setAnswerCustom((current) => ({ ...current, [question.id]: event.target.value })),
            }),
          )),
          h('div', { style: { ...styles.row, marginTop: 8 } },
            needsSession
              ? h(Button, { primary: true, onClick: () => onOpenSession?.(draft.session?.id), children: '去会话处理' })
              : h(Button, { primary: true, disabled: answerBusy, onClick: () => submitAnswer(entry.callId, entry.questions), children: answerBusy ? '提交中…' : '提交回答' }),
            needsSession
              ? null
              : h(Button, { disabled: answerBusy, onClick: () => submitAnswer(entry.callId, entry.questions, { skip: true }), children: '跳过（按默认推进）' }),
            answerFeedback?.callId === entry.callId
              ? h('span', {
                style: {
                  fontSize: T.font.xs,
                  color: answerFeedback.tone === 'danger' ? T.danger : answerFeedback.tone === 'ok' ? T.ok : T.warnText,
                  maxWidth: 520,
                  overflowWrap: 'anywhere',
                },
              }, answerFeedback.text)
              : null,
          ),
        )
      }),
      h('div', { style: styles.row },
        h(IconSeat, { size: 26 }, '✎'),
        h('span', { style: styles.sectionTitle }, '下一步'),
        h('span', { style: styles.sectionHint }, '按当前状态给你建议；也可以直接说你想推进什么'),
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h(Tag, { tone: 'accent' }, summary.stageLabel),
        h(Tag, { tone: 'neutral' }, `开发任务 ${summary.tasks.done}/${summary.tasks.total}`),
        tasksAllDone && pendingStep
          ? h(Tag, { tone: 'warn', title: '开发任务完成不等于流程完成：还要过测试与提交' }, `流程未结束 · ${pendingStep}`)
          : null,
        h(Tag, {
          tone: summary.localTestStale ? 'warn' : summary.localTest === 'passed' ? 'ok' : summary.localTest === 'failed' ? 'danger' : 'neutral',
        }, `本机自测 ${summary.localTestLabel}`),
        h(Tag, {
          tone: summary.environmentTestStale ? 'warn' : summary.environmentTest === 'passed' ? 'ok' : summary.environmentTest === 'failed' ? 'danger' : 'neutral',
        }, `环境测试 ${summary.environmentTestLabel}`),
        summary.risks
          ? h(Tag, { tone: 'warn' }, `${summary.risks} 个风险待处理`)
          : (summary.risksTotal ? h(Tag, { tone: 'ok' }, `风险 ${summary.risksAcked}/${summary.risksTotal} 已知晓`) : null),
        boundId
          ? h(Tag, { tone: summary.session.running ? 'accent' : 'neutral' }, summary.session.running ? '会话运行中' : '会话空闲')
          : h(Tag, { tone: 'neutral' }, '未开会话'),
        summary.stageReason ? h('span', { style: styles.sectionHint }, summary.stageReason) : null,
      ),
      steps.length
        ? h('div', { style: { ...styles.row, marginTop: 2 } },
          steps.map((step) => h('button', {
            key: step.action + step.title,
            type: 'button',
            disabled: busy || askBusy,
            title: step.hint,
            onClick: () => runStep(step.action),
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              alignItems: 'flex-start',
              padding: '8px 12px',
              border: `1px solid ${T.borderSoft}`,
              borderRadius: T.rBase,
              background: T.surface,
              color: T.text2,
              cursor: busy || askBusy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
              transition: T.transition,
            },
          },
            h('span', { style: { fontSize: T.font.sm, fontWeight: 600, color: T.text } }, step.title),
            h('span', { style: { fontSize: T.font.xs, color: T.text4 } }, step.hint),
          )),
        )
        : null,
      assistLog.length
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, maxHeight: 220, overflow: 'auto' } },
          assistLog.map((entry, index) => h('div', {
            key: `${index}-${entry.role}`,
            style: entry.role === 'user'
              ? { alignSelf: 'flex-end', maxWidth: '86%', padding: '6px 10px', borderRadius: '10px 10px 2px 10px', background: T.brandSoft, color: T.text, fontSize: T.font.sm }
              : { alignSelf: 'flex-start', maxWidth: '86%', padding: '6px 10px', borderRadius: '2px 10px 10px 10px', background: T.surface2, color: T.text2, fontSize: T.font.sm },
          }, entry.text)),
        )
        : null,
      h('div', { style: { display: 'flex', gap: T.gap.xs, marginTop: 4 } },
        h('textarea', {
          style: { ...styles.textarea, minHeight: 44, maxHeight: 120, flex: '1 1 auto' },
          value: askText,
          placeholder: '用一句话补充或纠偏，例如：验收再加一条失败可回滚；顺便把「跑门禁」标成已完成',
          onChange: (event) => setAskText(event.target.value),
          onKeyDown: (event) => {
            if (event.key !== 'Enter' || event.shiftKey) return
            if (event.nativeEvent?.isComposing) return
            event.preventDefault()
            sendUnified()
          },
        }),
        h(Button, { primary: true, disabled: busy || assistBusy, onClick: sendUnified, children: assistBusy ? '处理中…' : '发送' }),
      ),
      h('div', { style: { ...styles.sectionHint } },
        '直接说就行：工作站会判断这句话是补台账、发开发会话，还是两者都做。'),
    )
  }

  /* ----------------------------------------------------------- 关联会话 */

  /**
   * 顶部卡里的「关联会话」区：绑定后显示 Host 推导的运行中/空闲/已结束、轮次、
   * 最近活动、当前工具/阶段与最后一句；没绑定只给一句引导，不堆控件。
   * `session` 来自 Panel 轮询出来的会话 Map（列表与详情共用同一份）。
   */
  /** 首屏进度摘要：任务完成度 + 测试/验收/变更事实 + 还差哪一步。 */
  function renderProgress() {
    const checks = draft.checks ?? []
    const checksPassed = checks.filter((check) => check.status === 'passed').length
    const pendingTasks = tasks.filter((task) => !task.done)
    const pendingStep = pendingFlowStep({
      status: draft.status,
      stage,
      testState: tests.local?.status,
      environmentTestState: tests.environment?.status,
    })
    const testTone = (test) => (test?.status === 'passed' ? 'ok' : test?.status === 'failed' ? 'danger' : test?.status === 'running' ? 'info' : 'neutral')
    const testLabel = (test) => TEST_TEXT[test?.status] ?? '未运行'
    const totals = filesInfo?.totals ?? null
    const progressColor = draft.status === 'done' ? T.ok : T.brand
    return h('div', {
      style: { borderTop: `1px solid ${T.borderSoft}`, paddingTop: T.gap.xs, display: 'flex', flexDirection: 'column', gap: 6 },
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h('span', { style: styles.sectionTitle }, '开发进度'),
        h(Tag, { tone: draft.status === 'done' ? 'ok' : draft.status === 'blocked' ? 'danger' : 'accent' }, STAGE_LABELS[stage] ?? stage),
        h('span', { style: { ...styles.num, fontSize: T.font.sm, color: T.text2, fontWeight: 600 } },
          tasks.length ? `任务 ${doneCount}/${tasks.length} · ${taskPct}%` : '任务清单为空'),
        h(Tag, { tone: tests.local?.stale ? 'warn' : testTone(tests.local) }, `本机自测 ${tests.local?.stale ? '已过期' : testLabel(tests.local)}`),
        h(Tag, { tone: tests.environment?.stale ? 'warn' : testTone(tests.environment) }, `环境测试 ${tests.environment?.stale ? '已过期' : testLabel(tests.environment)}`),
        checks.length ? h(Tag, { tone: checksPassed === checks.length ? 'ok' : 'warn' }, `验收 ${checksPassed}/${checks.length}`) : null,
        totals
          ? h('span', { style: styles.sectionHint }, `变更 ${totals.files ?? 0} 文件 · +${totals.added ?? 0} / -${totals.removed ?? 0}`)
          : h('span', { style: styles.sectionHint }, '正在读取变更…'),
      ),
      h('div', { style: { ...styles.progressOuter, height: 8 } },
        h('div', { style: { ...styles.progressInner, height: 8, width: `${taskPct}%`, background: progressColor } }),
      ),
      h('div', {
        style: {
          fontSize: T.font.sm,
          color: pendingStep ? (draft.status === 'blocked' ? T.danger : T.warnText) : T.ok,
          lineHeight: 1.7,
        },
      }, pendingStep
        ? `${pendingStep}${pendingTasks.length ? `；${pendingTasks.length} 个任务未完成（${pendingTasks.slice(0, 2).map((task) => task.text).join('、')}${pendingTasks.length > 2 ? ' 等' : ''}）` : ''}`
        : '开发、验证与提交都已完成'),
    )
  }

  function renderSession() {
    const boundId = draft.session?.id ?? null
    const live = session ?? (boundId ? { sessionId: boundId, boundAt: draft.session?.boundAt ?? null, alive: null, pending: true } : null)
    const stageText = live?.lastStage ? sessionStageText(live.lastStage) : ''
    // 没绑定会话但有进展证据：说明台账是被 Agent 直接写入推进的，要明确解释，避免被当成 UI 状态错乱
    const workEvidence = Boolean(
      draft.baseline?.commit
      || (draft.workflow?.tests?.local?.status && draft.workflow.tests.local.status !== 'not_run')
      || (draft.workflow?.tests?.environment?.status && draft.workflow.tests.environment.status !== 'not_run')
      || (draft.history ?? []).some((entry) => ['start', 'test', 'submit', 'implement', 'verify', 'ux'].includes(entry?.type)),
    )
    return h('div', {
      style: { borderTop: `1px solid ${T.borderSoft}`, paddingTop: T.gap.xs, display: 'flex', flexDirection: 'column', gap: 4 },
    },
      h('div', { style: styles.spread },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          h('span', { style: styles.sectionTitle }, '关联会话'),
          boundId ? h(SessionBadge, { session: live }) : null,
          boundId && Number(live?.turns) > 0
            ? h('span', { style: styles.sectionHint }, `第 ${live.turns} 轮`)
            : null,
          boundId
            ? h('span', { style: { ...styles.num, fontSize: T.font.xs, color: T.text4 } }, `最近活动 ${sessionActivity(live)}`)
            : null,
          live?.lastTool ? h(Tag, { tone: 'neutral' }, `工具 ${live.lastTool}`) : null,
          stageText ? h('span', { style: styles.sectionHint }, `当前：${stageText}`) : null,
        ),
        boundId
          ? h('span', {
            style: { ...styles.smallMuted, color: T.text4, cursor: 'pointer', alignSelf: 'center' },
            title: '只断开追踪，不删流程、不动历史',
            onClick: () => onUnbindSession?.(draft.id),
          }, '解绑会话')
          : null,
      ),
      boundId && live?.lastText
        ? h('div', {
          style: {
            ...styles.sectionHint,
            color: T.text3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
          title: live.lastText,
        }, live.lastText)
        : null,
      boundId && live?.error
        ? h('div', { style: styles.dangerCard },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
            h('span', { style: { fontWeight: 600 } }, '开发会话本轮失败'),
            h('span', { style: styles.sectionHint }, '只代表最近一轮；新一轮开始后会自动清掉'),
            h('div', { style: styles.spacer }),
            onOpenSession
              ? h(Button, {
                style: { height: 24, padding: '0 8px', fontSize: T.font.xs },
                onClick: () => onOpenSession(boundId),
                children: '去会话处理',
              })
              : null,
          ),
          h('div', { style: { ...styles.smallMuted, marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, live.error))
        : null,
      boundId && live?.alive === false && live?.reason
        ? h('div', { style: styles.sectionHint }, `说明：${live.reason}`)
        : null,
      !boundId
        ? (draft.status === 'done' || stage === 'done'
          ? h('div', { style: styles.sectionHint }, '流程已完成；无需再绑定开发会话，需要回看时展开上方「开发会话动态」。')
          : workEvidence
          ? h('div', { style: styles.warnCard },
            h('div', { style: { fontWeight: 600, marginBottom: 2 } }, '台账有进展，但没有绑定开发会话'),
            '当前阶段/测试记录来自 Agent 直接写入台账（没有走工作站绑定），所以右上角仍是「开启开发会话」。',
            '点「开启开发会话」会新开一个会话并绑定，之前的台账与历史都不会丢。')
          : h('div', { style: styles.sectionHint },
            '尚未绑定开发会话：点右上角「开启开发会话」，成功后会自动绑定；绑定后这里能看到轮次、最近活动并一键跳回会话。'))
        : null,
      // 会话动态默认收起：过程信息放在需要时展开，首屏优先给开发进度
      h('div', { style: { marginTop: 2 } },
        h('div', { style: styles.spread },
          h('span', { style: styles.sectionHint }, '开发会话动态（默认收起，避免挤占进度）'),
          h('span', {
            role: 'button',
            style: { ...styles.smallMuted, color: T.brand, cursor: 'pointer' },
            onClick: () => setSessionLogOpen((value) => !value),
          }, sessionLogOpen ? '收起' : '展开'),
        ),
        sessionLogOpen
          ? h(SessionLogPanel, {
            ctx,
            itemId: draft.id,
            sessionId: boundId,
            alive: live?.alive,
            onError: (message) => setError(message),
          })
          : null,
      ),
    )
  }

  /* --------------------------------------------------------------- 组装 */

  // 是否正在开发：优先会话实时状态；Host 的 /state items 也补了 running，取不到会话状态时兜底。
  const running = Boolean(session?.running ?? draft.running)

  const tabOptions = [
    { value: 'overview', label: '概览' },
    { value: 'plan', label: '计划' },
    { value: 'review', label: '独立评审' },
    { value: 'test', label: '测试与提交' },
    { value: 'report', label: '报告' },
  ]

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
    h('div', { style: { ...styles.cardFlat, display: 'flex', flexDirection: 'column', gap: T.gap.xs } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap' } },
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 } },
          h('span', {
            role: 'button',
            title: '回到开发站首页（流程列表）',
            onClick: onBack,
            style: { fontSize: T.font.sm, color: T.brand, cursor: 'pointer', flex: '0 0 auto' },
          }, 'hub'),
          h('span', { style: { color: T.text4, flex: '0 0 auto' } }, '/'),
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 280px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
            h('span', { style: styles.pageTitle }, draft.title || draft.id),
            h(StatusPill, { status: draft.status }),
            running
              ? h(Tag, {
                tone: 'accent',
                title: '开发会话正在工作',
                style: { gap: 6, paddingLeft: 6 },
              },
                h(Spinner, { key: 'spin', size: 10, tone: 'accent' }),
                '正在开发…',
              )
              : null,
            showStageTag ? h(Tag, { tone: 'neutral' }, stageLabelText) : null,
            draft.workflow?.worktree?.branch
              ? h(Tag, {
                tone: 'accent',
                title: `独立工作区：${draft.worktreePath ?? draft.workflow.worktree.branch}`,
              }, '独立工作区')
              : null,
            h(WorkspaceBadge, { workspace: draft.workspace, repos: draft.repos }),
            // 流程类型：bug / feature / analysis，点一下可手动纠正（不再标"创建方式"标签）
            h(Tag, {
              tone: workflow.intent === 'bug' ? 'warn' : workflow.intent === 'analysis' ? 'accent' : 'neutral',
              title: '点击切换流程类型（bug 先复现/定位；feature 先对齐范围；analysis 只读分析、不进入提交）',
              style: { cursor: 'pointer' },
              onClick: () => {
                const nextIntent = nextIntentOf(workflow.intent)
                const hint = nextIntent === 'bug'
                  ? 'bug 模板会要求先复现与定位根因。'
                  : nextIntent === 'analysis'
                    ? '分析流程只读：不建 worktree、不产生提交，只产出结论与补丁建议。'
                    : 'feature 先对齐范围与验收，再改代码。'
                if (!window.confirm(`把流程类型改成「${INTENT_LABEL[nextIntent]}」？\n\n${hint}`)) return
                commit({ ...draft, workflow: { ...workflow, intent: nextIntent } }, '已更新流程类型')
              },
            }, INTENT_LABEL[intentOf(workflow.intent)]),
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            h('span', { style: { ...styles.mono, color: T.text4 } }, draft.id),
            h('span', { style: styles.sectionHint }, `更新于 ${fmtTime(draft.updatedAt)}`),
            baseline?.commit
              ? h('span', { style: styles.sectionHint }, `baseline ${String(baseline.commit).slice(0, 8)}${baseline.branch ? ` @ ${baseline.branch}` : ''}`)
              : null,
            draft.workflow?.worktree?.branch
              ? h('span', { style: styles.sectionHint, title: draft.worktreePath ?? '' }, `工作区 ${draft.workflow.worktree.branch}`)
              : null,
          ),
        ),
        h('div', { style: styles.spacer }),
        // 顶栏操作从主到次：继续推进（主）→ 预览报告 → ⋯ 更多；三者同高 32。
        // flex: 0 0 auto：标题/标签再长也不压缩按钮（否则「正在开发…」会被挤到和「预览报告」重叠）
        h('div', { style: { display: 'flex', alignItems: 'center', gap: T.gap.sm, flexWrap: 'wrap', flex: '0 0 auto' } },
          // 流程已结束：不再显示「继续推进」；报告/结果入口才是有意义的动作
          draft.status === 'done' || stage === 'done'
            ? null
            : h(Button, {
              primary: true,
              style: {
                height: 32,
                padding: '0 14px',
                fontSize: T.font.base,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                minWidth: 104,
                flex: '0 0 auto',
              },
              // 评审 running（pending）时禁用并显示「评审中」；失败/异常时保持可点，再点即重试派发
              disabled: busy || Boolean(launchBusy) || sessionRunning || reviewBusy || advance.disabled,
              title: sessionRunning ? '开发会话正在工作：等当前这步结束再继续推进' : (advanceHint || undefined),
              onClick: () => {
                if (advance.action === 'rework') { runLaunch('rework', reworkFromReview); return }
                if (advance.action === 'verify') { setTab('test'); setNotice('评审已通过：去「测试与提交」跑环境测试并提交'); return }
                if (advance.action === 'dispatch' || advance.action === 'retry') {
                  if (draft.session?.id) runLaunch('continue', continueDev)
                  else runLaunch('review', startReview)
                  return
                }
                if (advance.action === 'wait') return
                if (draft.session?.id) runLaunch('continue', continueDev)
                else runLaunch('open', () => onLaunch?.(draft.id))
              },
              children: reviewBusy || launchBusy === 'review'
                ? [h(Spinner, { key: 'spin', size: 10, tone: 'accent', style: spinnerOnBrand }), '评审中…']
                : advance.action === 'wait'
                  ? [h(Spinner, { key: 'spin', size: 10, tone: 'accent', style: spinnerOnBrand }), '评审中']
                  : launchBusy === 'continue'
                    ? [h(Spinner, { key: 'spin', size: 10, tone: 'accent', style: spinnerOnBrand }), '正在继续开发会话…']
                    : launchBusy === 'open'
                      ? [h(Spinner, { key: 'spin', size: 10, tone: 'accent', style: spinnerOnBrand }), '正在开启开发会话…']
                      : sessionRunning
                        ? [h(Spinner, { key: 'spin', size: 10, tone: 'accent', style: spinnerOnBrand }), '正在开发…']
                        : advance.action === 'wait'
                      ? '评审中'
                      : (!draft.session?.id && advance.action === 'continue' ? '开启开发会话' : (advance.label || '继续推进')),
            }),
          // 开发前同步：独立工作区从最新 HEAD 创建，减少后续合并工作量
          (!draft.session?.id && draft.status !== 'done' && stage !== 'done' && draft.workflow?.gitRepo !== false)
            ? h(Button, {
              style: { height: 32, padding: '0 10px', fontSize: T.font.sm },
              disabled: busy || Boolean(launchBusy) || syncBusy,
              title: '开发前拉取最新代码：git fetch + merge --ff-only（不自动 rebase/reset）',
              onClick: syncCode,
              children: syncBusy
                ? [h(Spinner, { key: 'spin', size: 10, tone: 'accent' }), '同步中…']
                : '⟳ 拉取代码',
            })
            : null,
          // 报告随时可看：预览弹窗内可保存到本机，不再要求先跑完测试/提交
          h(Button, {
            style: { height: 32, padding: '0 12px', fontSize: T.font.base },
            onClick: () => setReportPreviewOpen(true),
            children: '预览报告',
          }),
          h(HeaderMenu, {
            items: [{
              label: '生成上下文',
              hint: '低频：只预览 Context Pack，不发给开发会话',
              disabled: busy,
              onClick: () => onContext?.(draft),
            }],
          }),
        ),
      ),
      renderProgress(),
      renderSession(),
    ),
    h('div', { style: { ...styles.cardFlat, padding: '10px 12px' } },
      h('div', { style: { ...styles.row, marginBottom: 8 } },
        h('span', { style: styles.sectionTitle }, '流程'),
        h('div', { style: styles.spacer }),
        h('span', { style: styles.sectionHint }, draft.workflow?.intent === 'analysis'
          ? '分析流程只读：只读排查 → 结论；不跑环境测试、不进入提交'
          : '阶段随工作自动推进：本机自测通过后点「继续推进」即开始独立评审；评审通过 → 测试验证；环境验证通过 → 待提交；提交后 → 完成'),
      ),
      h(ArrowSteps, {
        stages: draft.workflow?.gitRepo === false || draft.workflow?.intent === 'analysis'
          ? WORKFLOW_STAGES.filter((entry) => entry.id !== 'submit')
          : WORKFLOW_STAGES,
        stageIndex,
        activePartial: stage === 'verify' && tests.local?.status === 'passed' && !tests.local?.stale && tests.environment?.status !== 'passed',
        // 当前阶段正在干活：用转圈替代静态圆点，阶段条本身也在“动”。
        activeLoading: (stage === 'develop' && running) || (stage === 'review' && (reviewBusy || reviewView.status === 'pending')),
        activeDetail: (() => {
          if (stage === 'develop' && running) return '正在开发…'
          if (stage === 'review') {
            if (reviewBusy) return '评审中…'
            if (reviewView.status === 'pending') return `评审中 ${reviewView.passed}/${reviewView.total}`
            if (reviewView.status === 'failed') return '评审未通过，待纠偏'
            if (reviewView.status === 'error') return '评审异常待处理'
            if (reviewView.status === 'passed') return `评审 ✓ ${reviewView.passed}/${reviewView.total}`
            return '继续推进即开始评审'
          }
          const local = tests.local?.status === 'passed' && !tests.local?.stale
          const env = tests.environment?.status === 'passed' && !tests.environment?.stale
          if (stage === 'verify') return local ? `本机 ✓${env ? ' · 环境 ✓' : ' · 环境未跑'}` : '本机未跑'
          if (stage === 'submit') return '待推送'
          return ''
        })(),
      }),
      workflow.rework?.at
        ? h('div', { style: { ...styles.warnCard, marginTop: T.gap.xs } },
          h('strong', null, '已回到开发中：测试通过后代码/诉求又有变化'),
          h('div', { style: { marginTop: 2 } },
            workflow.rework.reason || '旧测试结论已过期，请在当前改动上重跑本机自测。'))
        : null,
      stage === 'develop' && running
        ? h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: T.gap.xs,
            padding: '8px 10px',
            borderLeft: `3px solid ${T.brand}`,
            borderRadius: T.rBase,
            background: T.brandSoft,
            color: T.text2,
            fontSize: T.font.sm,
          },
        },
          h(Spinner, { size: 12, tone: 'accent', title: '开发会话正在工作' }),
          h('span', null, '开发中：开发会话正在工作，完成后到「测试与提交」跑本机自测'),
        )
        : null,
      stage === 'review'
        ? h('div', { style: { ...styles.sectionHint, marginTop: 2 } },
          reviewView.status === 'failed'
            ? `独立评审未通过：${reviewView.corrections.length} 位审核员给出纠偏意见（改完点「继续推进」重试评审）。`
            : reviewView.status === 'error'
              ? '评审异常待处理：有审核员没有返回结论，流程不会进入测试验证；点「继续推进」重试派发。'
              : reviewView.status === 'pending'
                ? '独立评审进行中：等审核员返回结论，不要跳过评审直接跑环境测试。'
                : '继续推进即开始评审：自动派 1~3 位审核员复核改动与证据，全部通过后才进入测试验证。')
        : null,
      stage === 'verify'
        ? h('div', { style: { ...styles.sectionHint, marginTop: 2 } },
          tests.local?.status === 'passed' && !tests.local?.stale
            ? (tests.environment?.status === 'passed' && !tests.environment?.stale
              ? '测试验证完成：本机与环境都通过，接下来去「测试与提交」提交并推送。'
              : '测试验证还没完成：本机自测已通过，还需要跑「环境测试」才会进入「待提交」。')
            : '测试验证还没完成：先在「测试与提交」里跑本机自测。')
        : null,
    ),
    // 看完阶段再决定下一步：输入区放在流程下面，符合"说话就是在推动流程"
    renderNextStep(),
    error ? h('div', { style: styles.dangerCard }, error) : null,
    notice ? h('div', { style: styles.infoCard }, notice) : null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: T.gap.sm, flexWrap: 'wrap', marginTop: T.gap.xs } },
      h(Segmented, { options: tabOptions, value: tab, onChange: setTab }),
      h('div', { style: styles.spacer }),
      h('span', { style: styles.sectionHint }, '默认只读；点「编辑」才展开输入框'),
    ),
    tab === 'overview'
      ? renderOverview()
      : tab === 'plan'
        ? renderPlan()
        : tab === 'review'
          ? renderReview()
          : tab === 'report'
            ? h(ReportView, { itemId: draft.id })
            : renderTestAndSubmit(),
    renderMore(),
    reportPreviewOpen
      ? h(Modal, {
        title: '开发报告预览',
        width: 'min(1120px, 96vw)',
        onClose: () => setReportPreviewOpen(false),
      }, h(ReportView, { itemId: draft.id }))
      : null,
  )
}

import { launchDevSession, launchPrompt, sendToSession } from './session.mjs'
import { composeAsk, continuePrompt, describeFlow, suggestNextSteps } from './next-steps.mjs'

export { launchDevSession, launchPrompt }

function Panel({ ctx, onOpenChat, openFlowId = null, openFlowNonce = 0, homeNonce = 0, onScopeChanged = null }) {
  const [state, setState] = useState(null)
  // 虚拟库：多代码库组合（前后端联动）
  const [wsOpen, setWsOpen] = useState(false)
  // null = 新建；否则是正在编辑的虚拟库 id
  const [wsEditId, setWsEditId] = useState(null)
  const [wsName, setWsName] = useState('')
  const [wsPaths, setWsPaths] = useState('')
  // 勾选的已登记代码库（state.profile.repoCards 里 exists 的）；额外路径走文本框
  const [wsPicked, setWsPicked] = useState([])
  const [wsError, setWsError] = useState('')
  const [selected, setSelected] = useState(null)
  // 详情是否处于编辑态：编辑时暂停自动刷新，避免把未保存输入冲掉
  const [detailEditing, setDetailEditing] = useState(false)
  // 最近一次写进 state 的详情 JSON：自动刷新只在内容真变化时 setState（避免无意义重渲染/重置草稿）
  const detailJsonRef = useRef('')
  // 从右上角抽屉跳进来：切到这条流程的详情
  useEffect(() => {
    if (openFlowId) setSelected(openFlowId)
  }, [openFlowId, openFlowNonce])

  // 点「hub」回首页：清掉当前选中的流程。
  // 只在 nonce 真正变化时清：Panel 会因 flowsNonce 重挂载，挂载时跑一次会把
  // 刚由「按计划开工」自动打开的流程详情立刻清掉（看起来就是“没有跳转”）。
  const homeNonceRef = useRef(homeNonce)
  useEffect(() => {
    if (homeNonce === homeNonceRef.current) return
    homeNonceRef.current = homeNonce
    setSelected(null)
  }, [homeNonce])
  // 上次在这个仓库打开的流程（切走再回来直接回到详情）；滚动位置也一起记
  const restoredPanelRef = useRef('')
  const scrollRef = useRef(0)
  const [context, setContext] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [parallel, setParallel] = useState(null)
  const [parallelError, setParallelError] = useState('')
  const [busy, setBusy] = useState(false)
  // 批量整理弱标题（用户输入是代码/注解时，列表标题不可读）
  const [fixingTitles, setFixingTitles] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)
  // 列表「报告」入口：在站内弹窗预览，不依赖 window.open（桌面壳里可能被拦截/无反应）
  const [reportPreviewId, setReportPreviewId] = useState(null)
  const [setupMode, setSetupMode] = useState('setup')
  // 会话状态只在这里拉一次：列表与详情共用同一份 Map（itemId -> SessionState），避免各自请求。
  const [sessionStates, setSessionStates] = useState(new Map())
  // 会话卡在提问时把问题捞出来，在工作站就地作答（否则开发会一直等答案）
  const [pendingQuestions, setPendingQuestions] = useState([])
  const [pendingApprovals, setPendingApprovals] = useState([])
  // 代码库切换：进行中的目标路径 + 请求序号（防连点竞态）
  const [switchingRepo, setSwitchingRepo] = useState(null)
  const switchSeq = useRef(0)
  // 同一个目标正在切换时不重复发请求（state 更新有延迟，不能只靠 disabled）
  const switchTargetRef = useRef(null)

  function sessionMapFrom(rows) {
    return new Map((rows ?? []).filter((row) => row?.itemId).map((row) => [row.itemId, row]))
  }

  /** GET /pending：拉当前流程的待答问题；没有会话/不在进程内时返回空 + 原因。 */
  async function loadPending(itemId) {
    const id = itemId ?? selected
    if (!id) { setPendingQuestions([]); setPendingApprovals([]); return }
    try {
      const body = await api(`${API.pending}?itemId=${encodeURIComponent(id)}`)
      setPendingQuestions(Array.isArray(body.pending) ? body.pending : [])
      setPendingApprovals(Array.isArray(body.approvals) ? body.approvals : [])
    } catch {
      setPendingQuestions([])
      setPendingApprovals([])
    }
  }

  /** GET /sessions：轮询入口；失败时保留上一次的会话状态（不让整页报错），只记一条调试日志。 */
  async function loadSessions() {
    try {
      const body = await api(API.sessions)
      setSessionStates(sessionMapFrom(body.sessions))
      if (selected) loadPending(selected)
    } catch (err) {
      // 不把“未知”渲染成“已结束”：保留上一次事实，错误只写调试日志，不打断主流程。
      if (typeof console !== 'undefined') console.warn('[dev-hub] 会话状态刷新失败：', errorText(err))
    }
  }

  async function loadParallel() {
    setParallelError('')
    try {
      const body = await api(API.parallel)
      setParallel(body)
    } catch (err) {
      // 并行路由尚未就绪时只降级提示，不阻塞首页。
      setParallel(null)
      setParallelError(errorText(err))
    }
  }

  async function loadItems() {
    try {
      const body = await api(API.items)
      const items = body.items ?? []
      setState((current) => current ? { ...current, items } : current)
      return items
    } catch (err) {
      setError(errorText(err))
      return null
    }
  }

  /** 批量整理弱标题：按已有目标生成，不调模型；失败要显式提示。 */
  async function fixWeakTitles() {
    if (fixingTitles) return
    setFixingTitles(true); setError(''); setNotice('')
    try {
      const body = await api(API.requirement, { method: 'POST', body: JSON.stringify({ action: 'retitleWeak' }) })
      const changed = Array.isArray(body.changed) ? body.changed : []
      setNotice(changed.length
        ? `已整理 ${changed.length} 个流程标题：${changed.map((entry) => entry.to).join('；')}`
        : '没有需要整理的标题')
      await reload()
    } catch (err) {
      setError(`整理标题失败：${errorText(err)}`)
    } finally { setFixingTitles(false) }
  }

  async function reload() {
    setBusy(true)
    setError('')
    try {
      const next = await api(API.state)
      // /state 不带 selectedItem：保留当前已加载的详情，否则一次 reload 会把详情清空、
      // 而 selected 没变又不会重新拉取，界面就永远卡在「正在加载流程详情…」。
      setState((current) => {
        const merged = { ...next }
        const sameRepo = Boolean(current?.repo?.path) && current.repo.path === next?.repo?.path
        const stillExists = (next.items ?? []).some((item) => item.id === selected)
        if (sameRepo && selected && stillExists && current?.selectedItem?.id === selected) {
          merged.selectedItem = current.selectedItem
        }
        return merged
      })
      // 恢复上次在这个仓库打开的流程（该流程还在才恢复，已删除就回列表）
      const repoPath = next?.repo?.path
      if (repoPath && restoredPanelRef.current !== repoPath) {
        restoredPanelRef.current = repoPath
        const saved = loadPanelState(repoPath)
        // 从聊天页自动跳进某条流程时，openFlowId 是本次要打开的；不要被"上次打开的流程"覆盖
        if (!openFlowId && saved.selectedId && (next.items ?? []).some((item) => item.id === saved.selectedId)) {
          setSelected(saved.selectedId)
        }
        scrollRef.current = saved.scrollTop || 0
      }
      // state 顶层带 sessionStates（同 /sessions），先把首屏状态铺上，后续交给 5 秒轮询。
      if (Array.isArray(next.sessionStates)) setSessionStates(sessionMapFrom(next.sessionStates))
      if (next.needsSetup || !next.repo) return
      await Promise.all([loadItems(), loadParallel()])
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { reload() }, [])
  // 会话状态轮询：5 秒一次；页面不可见（切到别的标签页/最小化）时跳过，卸载时清理。
  useEffect(() => {
    if (!state?.repo) return undefined
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      loadSessions()
    }, 5000)
    return () => clearInterval(timer)
  }, [state?.repo?.path])
  // 页面状态留存：切走/刷新后回到同一条流程
  useEffect(() => {
    const repoPath = state?.repo?.path
    if (!repoPath) return
    savePanelState(repoPath, { selectedId: selected, scrollTop: scrollRef.current })
  }, [selected, state?.repo?.path])

  useEffect(() => {
    if (!selected) {
      setState((current) => current ? { ...current, selectedItem: null } : current)
      return
    }
    // 等首屏 /state 就位再拉详情：否则详情响应可能先到、setState 时 state 还是 null 被丢掉，
    // 之后 reload 完成也不会再触发（selected 没变），表现为一直「正在加载流程详情…」。
    if (!state?.repo) return
    api(`${API.item}?id=${encodeURIComponent(selected)}`).then((body) => {
      detailJsonRef.current = JSON.stringify(body.item)
      setSelectedItem(body.item)
    }).catch((err) => setError(errorText(err)))
    loadPending(selected)
  // openFlowNonce：每次从抽屉/聊天跳转都强制重拉一次，避免同 id 情况下详情为旧值或空
  }, [selected, state?.repo?.path, openFlowNonce])

  // 详情静默刷新：Host 会在 /item 里检测"测试通过后又有改动"并把阶段推回开发中，
  // 这里每 8 秒拉一次（仅在内容变化时更新），让用户不用手动刷新就能看到阶段回退。
  useEffect(() => {
    if (!selected || !state?.repo || detailEditing) return undefined
    const timer = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const body = await api(`${API.item}?id=${encodeURIComponent(selected)}`)
        const json = JSON.stringify(body.item)
        if (json === detailJsonRef.current) return
        detailJsonRef.current = json
        setSelectedItem(body.item)
      } catch {
        // 静默刷新失败保留当前详情，下一轮再试（不打断正在看的页面）
      }
    }, 8000)
    return () => clearInterval(timer)
  }, [selected, state?.repo?.path, detailEditing])

  function setSelectedItem(item) {
    setState((current) => current ? { ...current, selectedItem: item } : current)
  }

  async function detect() {
    try {
      const body = await api(API.detect, { method: 'POST', body: '{}' })
      setState((current) => current ? { ...current, env: body.env } : current)
    } catch (err) { setError(errorText(err)) }
  }

  async function makeContext(item) {
    try {
      const body = await api(API.context, { method: 'POST', body: JSON.stringify({ id: item.id }) })
      setContext(body)
    } catch (err) { setError(errorText(err)) }
  }

  async function copy() {
    if (!context?.prompt) return
    try { await navigator.clipboard.writeText(context.prompt) } catch { setError('复制失败，请手动选择文本') }
  }

  async function scan() {
    try {
      const body = await api(API.scan)
      setCandidates(body.candidates ?? [])
    } catch (err) { setError(errorText(err)) }
  }

  async function importCandidate(candidate) {
    try {
      await api(API.importCandidate, { method: 'POST', body: JSON.stringify({ candidate }) })
      setCandidates((current) => current.filter((item) => item.id !== candidate.id))
      await reload()
    } catch (err) { setError(errorText(err)) }
  }

  /**
   * 点代码库卡片切换。
   * - 请求序号防连点竞态：只认最后一次响应（避免切回来还是别的库）；
   * - 切换前清空旧库的详情/会话状态/并行数据，避免串味；
   * - detect:false 复用本机环境缓存（新库首次由「新增代码库」探测）。
   */
  async function selectRepo(repoPath) {
    const target = String(repoPath ?? '').trim()
    // 虚拟库激活时 state.repo 指向虚拟库自己的本机台账目录；点任意成员库代码卡都要能切回单库，
    // 不能因为“看起来是同一个目标”就 early-return（否则会卡在虚拟库、切不走）。
    const alreadySingle = !state?.workspace && target === state?.repo?.path
    if (!target || alreadySingle) return
    const name = state?.profile?.member
    if (!name) { setError('还没有成员标识，请先完成初始化'); return }
    const targetKey = `repo:${target}`
    if (switchTargetRef.current === targetKey) return
    switchTargetRef.current = targetKey
    switchSeq.current += 1
    const seq = switchSeq.current
    setSwitchingRepo(target)
    setError('')
    setNotice('')
    setContext(null)
    setCandidates([])
    setParallel(null)
    setSessionStates(new Map())
    try {
      const next = await api(API.switchRepo, {
        method: 'POST',
        body: JSON.stringify({ repoPath: target, name, detect: false }),
      })
      if (seq !== switchSeq.current) return // 有更新的切换请求，丢弃这次响应
      setState(next)
      // 切库后让页面头部（开发目标徽标）立刻刷新，不用等 10 秒轮询。
      onScopeChanged?.()
      setSessionStates(sessionMapFrom(next.sessionStates))
      setParallel(next.parallel ?? null)
      // 目标仓库也有自己的"上次打开的流程"：能恢复就恢复，否则停在列表
      const targetRepo = next?.repo?.path
      if (targetRepo) {
        restoredPanelRef.current = targetRepo
        const saved = loadPanelState(targetRepo)
        setSelected(saved.selectedId && (next.items ?? []).some((item) => item.id === saved.selectedId)
          ? saved.selectedId
          : null)
      }
    } catch (err) {
      if (seq === switchSeq.current) setError(errorText(err))
    } finally {
      if (seq === switchSeq.current) {
        setSwitchingRepo(null)
        switchTargetRef.current = null
      }
    }
  }

  /** 台账返回的 item 统一回写：详情与列表摘要一起更新（含 session 绑定信息）。 */
  function mergeSavedItem(saved) {
    if (!saved?.id) return
    setState((current) => current ? {
      ...current,
      selectedItem: saved,
      items: (current.items ?? []).map((item) => item.id === saved.id
        ? {
          ...item,
          title: saved.title,
          status: saved.status,
          stage: saved.workflow?.stage ?? item.stage,
          updatedAt: saved.updatedAt ?? item.updatedAt,
          scope: saved.scope ?? item.scope,
          doneCount: (saved.tasks ?? []).filter((task) => task.done).length,
          taskCount: (saved.tasks ?? []).length,
          session: saved.session ?? null,
        }
        : item),
    } : current)
  }

  /** 打开已绑定的 DSH 会话；壳的 openSession 不存在/报错时明确提示，不假装成功。 */
  async function openSession(sessionId) {
    const id = String(sessionId ?? '').trim()
    if (!id) { setError('该流程还没有绑定开发会话'); return }
    const workspace = ctx?.get?.('uiWorkspace')
    if (!workspace || typeof workspace.openSession !== 'function') {
      setError('当前环境没有可用的会话工作区，无法跳转开发会话')
      return
    }
    try {
      await workspace.openSession(id)
    } catch (err) {
      setError(`打开开发会话失败：${errorText(err)}`)
    }
  }

  /** 绑定：详情页「开启开发会话」成功、或聊天页开工后都用它把 sessionId 写回台账。 */
  async function bindSession(itemId, sessionId) {
    try {
      const body = await api(API.session, {
        method: 'POST',
        body: JSON.stringify({ action: 'bind', id: itemId, sessionId }),
      })
      if (body?.item) {
        mergeSavedItem(body.item)
        // 先用 bind 返回值铺一条，再让 /sessions 的权威状态覆盖（轮询/手动刷新都对齐）。
        setSessionStates((current) => {
          const next = new Map(current)
          const base = {
            itemId,
            itemTitle: body.item.title ?? itemId,
            status: body.item.status ?? '',
            boundAt: body.item.session?.boundAt ?? null,
          }
          next.set(itemId, body.session ? { ...base, ...body.session } : { ...base, sessionId, alive: null })
          return next
        })
      }
      await loadSessions()
      return body
    } catch (err) {
      // 交给调用方决定是「会话已开但绑定失败」还是别的；不要把 bind 失败伪装成成功。
      throw new Error(`开发会话已开启，但绑定到流程失败：${errorText(err)}`)
    }
  }

  /** 解绑：只断开追踪，不删流程、不动历史；确认后执行。 */
  async function unbindSession(itemId) {
    if (!window.confirm('解绑当前开发会话？流程内容与历史不受影响，只是不再追踪该会话。')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const body = await api(API.session, {
        method: 'POST',
        body: JSON.stringify({ action: 'unbind', id: itemId }),
      })
      if (body?.item) mergeSavedItem(body.item)
      setSessionStates((current) => {
        const next = new Map(current)
        next.delete(itemId)
        return next
      })
      setNotice('已解绑开发会话')
    } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }

  /** 工作站开启开发会话：记录 baseline → 生成 Context Pack → 新建会话并发送 → 绑定 → 切过去。 */
  /**
   * 开启开发会话：已有绑定会话时默认「继续之前的沟通」（发回同一会话，历史/决定还在）；
   * 传 { fresh: true } 则强制新建。
   */
  async function launchDev(id, { fresh = false, resync = false } = {}) {
    const item = state?.selectedItem
    const title = item?.title ?? id
    if (!state?.repo?.path) { setError('尚未选择代码库'); return }
    const previous = item?.session?.id
    const continueExisting = Boolean(previous) && !fresh
    // resync 来自「更多」里的显式低频按钮，标签已说明后果，不再弹确认。
    if (!resync && !window.confirm(continueExisting
      ? `把「${title}」的最新 Context Pack 重发到 ${previous}？（之前聊过的内容、决定与工具结果都还在）\n\n日常推进用「继续推进」就够了；要开新的，请在「更多 → 换一条开发会话」里新建。`
      : `开启新的开发会话？\n\n将新建一个 DSH 会话，并把「${title}」的约束与 Context Pack 作为首条消息发送。`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      // 重发上下文只读台账、重新生成 Context Pack；不能走 start（那会把阶段打回 develop、并记一条 baseline）
      const started = resync
        ? await api(API.context, { method: 'POST', body: JSON.stringify({ id }) })
        : await api(API.start, { method: 'POST', body: JSON.stringify({ id }) })
      setState((current) => current ? { ...current, selectedItem: started.item } : current)
      const result = await launchDevSession(ctx, {
        // 独立工作区：开发会话必须开在 worktree 里，否则会和其他流程互相污染
        cwd: started.workRoot ?? state.repo.path,
        prompt: launchPrompt(started.context?.prompt, started.item ?? item),
        continueSessionId: continueExisting ? previous : null,
        // 不跳转会话页：进度与结果就在本页「关联会话 + 会话内容」里看
        open: false,
      })
      // 详情页这条路径：会话开出来就立刻绑定回流程；绑定失败不假装成功，reload 后再报错。
      let bindError = ''
      if (result.sessionId) {
        try { await bindSession(id, result.sessionId) } catch (err) { bindError = errorText(err) }
      }
      const bound = Boolean(result.sessionId) && !bindError
      setNotice(bound
        ? (result.sent
          ? (result.continued
            ? (resync
              ? `已把最新上下文重发给开发会话 ${result.sessionId}。`
              : `已继续之前的开发会话 ${result.sessionId}。`)
            : `${result.continueFailed ? `原会话已不可用（${result.continueFailed}），` : ''}已开启开发会话 ${result.sessionId} 并绑定到本流程。`)
          : `已绑定开发会话 ${result.sessionId}（当前版本不支持自动发送，确认后按发送即可开始）。`)
        : (result.sent
          ? `已开启开发会话 ${result.sessionId}：约束与 Context Pack 已发送，开发在该会话里继续。`
          : '已开启新会话并把上下文放进输入框（当前版本不支持自动发送），确认后按发送即可开始。'))
      await reload()
      if (bindError) setError(bindError)
      return { sessionId: result.sessionId ?? null, sent: Boolean(result.sent), continued: Boolean(result.continued), bindError }
    } catch (err) {
      setError(errorText(err))
      return { sessionId: null, sent: false, error: errorText(err) }
    } finally {
      setBusy(false)
    }
  }

  /** 切到某个虚拟库（多成员库组合）。 */
  async function selectWorkspace(workspaceId) {
    const target = String(workspaceId ?? '').trim()
    if (!target) return
    // 已经在这个虚拟库里：重复点击不再弹切换提示、不再发请求
    if (state?.workspace?.id === target) return
    const targetKey = `workspace:${target}`
    if (switchTargetRef.current === targetKey) return
    switchTargetRef.current = targetKey
    switchSeq.current += 1
    const seq = switchSeq.current
    setSwitchingRepo(targetKey)
    setError('')
    setNotice('')
    setContext(null)
    setCandidates([])
    setParallel(null)
    setSessionStates(new Map())
    try {
      const body = await api(API.switchRepo, { method: 'POST', body: JSON.stringify({ workspaceId: target }) })
      if (seq !== switchSeq.current) return
      // 兼容旧 Host：切换接口若只回 workspace、没把它并进 state，也把激活态补进页面
      const next = { ...(body.state ?? body) }
      if (!next.workspace && body.workspace) next.workspace = body.workspace
      setState(next)
      onScopeChanged?.()
      setSessionStates(sessionMapFrom(body.sessionStates))
      setSelected(null)
      const members = workspaceMembersView(body.workspace)
      setNotice(`已切到虚拟库「${body.workspace?.name ?? target}」（${members.length} 个成员库；台账在本机 ${body.workspace?.path ?? '—'}）`)
    } catch (err) {
      if (seq === switchSeq.current) setError(errorText(err))
    } finally {
      if (seq === switchSeq.current) {
        setSwitchingRepo(null)
        switchTargetRef.current = null
      }
    }
  }

  function toggleWorkspaceRepo(path) {
    setWsPicked((current) => (current.includes(path) ? current.filter((entry) => entry !== path) : [...current, path]))
  }

  /** 新建虚拟库的输入汇总：勾选的已登记代码库 + 文本框里的额外路径（去重）。 */
  function workspaceDraftRepos() {
    const extra = wsPaths.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    return [...new Set([...wsPicked, ...extra])]
  }

  /** 打开新建虚拟库弹窗。 */
  function openCreateWorkspace() {
    setWsEditId(null)
    setWsName('')
    setWsPaths('')
    setWsPicked([])
    setWsError('')
    setError('')
    setNotice('')
    setWsOpen(true)
  }

  /** 打开编辑虚拟库弹窗：预填名字与现有成员。 */
  function openEditWorkspace(workspace) {
    setWsEditId(workspace?.id ?? null)
    setWsName(workspace?.name ?? '')
    setWsPicked([...(workspace?.repos ?? [])])
    setWsPaths('')
    setWsError('')
    setError('')
    setNotice('')
    setWsOpen(true)
  }

  function closeWorkspaceModal() {
    setWsOpen(false)
    setWsEditId(null)
    setWsError('')
  }

  /** 新建/编辑虚拟库：名字 + 勾选/填写 ≥2 个代码库；成员库平权，任意成员都可移除/替换。 */
  async function saveWorkspaceNow() {
    const editing = Boolean(wsEditId)
    const name = wsName.trim()
    const repos = workspaceDraftRepos()
    if (!name) { setWsError('虚拟库需要名字'); return }
    if (repos.length < 2) { setWsError('虚拟库至少需要两个不同的代码库：勾选已登记的库，或在下面每行填一个路径'); return }
    setBusy(true)
    setWsError('')
    setError('')
    try {
      const body = await api(API.workspaces, {
        method: 'POST',
        body: JSON.stringify(editing ? { action: 'update', id: wsEditId, name, repos } : { name, repos }),
      })
      closeWorkspaceModal()
      setWsName(''); setWsPaths(''); setWsPicked([])
      const next = body.state ?? null
      if (next) {
        setState(next)
        setSessionStates(sessionMapFrom(next.sessionStates))
      } else {
        await reload()
      }
      onScopeChanged?.()
      setSelected(null)
      const members = workspaceMembersView(body.workspace ?? next?.workspace)
      if (editing) {
        const added = body.added ?? []
        const removed = body.removed ?? []
        setNotice(`已更新虚拟库「${body.workspace?.name ?? name}」（${members.length} 个成员库${added.length ? `；新增 ${added.map(repoBaseName).join('、')}` : ''}${removed.length ? `；移除 ${removed.map(repoBaseName).join('、')}` : ''}）`)
      } else {
        setNotice(`已创建并切到虚拟库「${body.workspace?.name ?? name}」（${members.length} 个成员库；台账在本机 ${body.localPath ?? body.workspace?.path ?? '—'}）`)
      }
    } catch (err) {
      // 错误显示在弹窗里：用户正在填表，不该跑回页面顶部找红字
      setWsError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * 移除虚拟库：只删本机 profile 里的分组登记，不动任何成员库的代码与 .dev-hub 台账。
   * 当前激活时 Host 会清掉/回退 activeRepo，这里按返回的 state 刷新（没有 state 就重取）。
   */
  async function removeWorkspace(workspace) {
    const name = workspace?.name ?? workspace?.id ?? '未命名'
    const ok = typeof window !== 'undefined' && window.confirm(
      `从本机移除虚拟库「${name}」？\n\n只删本机的分组登记，不会删除或修改任何成员库的代码与 .dev-hub；成员库本身仍保留在代码库列表里。\n\n虚拟库自己的台账/规范/上下文/证据仍留在本机 ~/.dev-hub/workspaces/${workspace?.id ?? '<id>'}/（不删数据）。`,
    )
    if (!ok) return
    setError('')
    setNotice('')
    try {
      const body = await api(API.workspaces, { method: 'POST', body: JSON.stringify({ action: 'remove', id: workspace?.id }) })
      onScopeChanged?.()
      if (body?.state) {
        setState(body.state)
        setSessionStates(sessionMapFrom(body.state.sessionStates))
      } else {
        await reload()
      }
      setSelected(null)
      setNotice(`已移除虚拟库「${name}」（成员库代码与 .dev-hub 未动；本机台账仍保留）`)
    } catch (err) {
      setError(errorText(err))
    }
  }

  async function removeRepo(repoPath) {
    const name = repoPath.split('/').filter(Boolean).pop() || repoPath
    const ok = typeof window !== 'undefined' && window.confirm(
      `从列表移除代码库「${name}」？\n\n只删本机列表登记，不会删除磁盘上的代码/流程台账；以后还能重新添加。`,
    )
    if (!ok) return
    setError('')
    try {
      const body = await api(API.removeRepo, { method: 'POST', body: JSON.stringify({ repoPath }) })
      setSelected(null)
      setNotice(`已从列表移除 ${name}（磁盘文件未动）`)
      if (body?.state) {
        setState(body.state)
        onScopeChanged?.()
        setSessionStates(sessionMapFrom(body.state.sessionStates))
      } else {
        await reload()
      }
    } catch (err) {
      setError(errorText(err))
    }
  }

  function onSetupDone(next) {
    setSetupOpen(false)
    setState(next)
    onScopeChanged?.()
    // 新增代码库时 Host 会顺手装好内置技能：明确告诉用户，不用再等"首次初始化"
    const skills = next?.skills
    if (skills?.initialized) {
      setNotice(`已装好内置技能 ${skills.installedSkills?.length ?? 0} 个（约束 ${skills.constraints ?? 0} 条），可以直接新建流程。`)
    } else if (skills?.initialized === false && skills?.error) {
      setError(`内置技能初始化失败：${skills.error}（首次建流程时会再试）`)
    } else if (skills?.alreadyHad) {
      setNotice(`沿用这个代码库已有的规范：${skills.installedSkills?.length ?? 0} 个技能 / ${skills.constraints ?? 0} 条约束。`)
    }
    setSessionStates(sessionMapFrom(next?.sessionStates))
    setSelected(next?.items?.[0]?.id ?? null)
    setContext(null)
    setCandidates([])
    setParallel(null)
    loadParallel()
  }

  if (state === null) return h('div', { style: styles.wrap }, busy ? '加载 DevHub…' : 'DevHub 尚未加载')
  if (state.needsSetup || !state.repo) {
    // 首次初始化 / 新增代码库也改变了“当前开发目标”，头部徽标要跟着刷新。
    return h('div', { style: styles.wrap }, h(SetupForm, {
      state,
      onDone: (next) => { setState(next); onScopeChanged?.() },
    }))
  }

  const items = state.items ?? []
  const detail = state.selectedItem ?? null
  // 编辑时把当前成员也列出来（即使路径已失效），否则用户无法移除失效成员；
  // 新建时只列路径存在的已登记代码库。
  const editingWorkspace = wsEditId ? (state.workspaces ?? []).find((entry) => entry.id === wsEditId) ?? null : null
  const editingRepos = editingWorkspace?.repos ?? (wsEditId ? wsPicked : [])
  const repoChoices = (state.profile?.repoCards ?? []).filter((card) => card
    && card.path
    && (card.exists !== false || editingRepos.includes(card.path)))
  const wsDraftRepos = workspaceDraftRepos()

  // 环境探测与项目命令是低频操作：默认折叠成一行，需要时再展开，避免详情页下面的长表单感。
  const envAndCommands = h('details', { style: { ...styles.cardFlat, padding: '10px 12px' } },
    h('summary', { style: { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap' } },
      h('span', { style: styles.sectionTitle }, '本机环境与项目命令'),
      h('span', { style: styles.sectionHint }, '低频；需要探测环境或修改测试命令时展开'),
    ),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm, marginTop: T.gap.sm } },
      h(EnvironmentCard, { env: state.env, onDetect: detect }),
      h(ProjectCommands, {
        project: state.project,
        localCommands: state.localCommands ?? {},
        onSaved: (project, nextLocal) => setState((current) => current ? {
          ...current,
          project,
          localCommands: nextLocal ?? current.localCommands,
        } : current),
      }),
    ),
  )

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
    error ? h('div', { style: styles.dangerCard }, error) : null,
    notice ? h('div', { style: styles.infoCard }, notice) : null,
    context ? h('div', { style: { ...styles.cardFlat } },
      h('div', { style: { ...styles.row, flexWrap: 'wrap' } },
        h('strong', null, 'Context Pack'),
        h('span', { style: styles.pill }, context.context.contextHash),
        h('div', { style: styles.spacer }),
        h(Button, { primary: true, disabled: busy, onClick: () => launchDev(context.item?.id), children: '在工作站开启开发会话' }),
        h(Button, { style: { height: 28, padding: '0 10px', fontSize: T.font.sm }, onClick: copy, children: '复制' }),
        h(Button, { style: { height: 28, padding: '0 10px', fontSize: T.font.sm }, onClick: () => setContext(null), children: '关闭' }),
      ),
      h('pre', { style: styles.pre }, context.context.prompt),
    ) : null,
    selected
      ? (detail
        ? h(ItemEditor, {
          item: detail,
          ctx,
          pendingQuestions,
          pendingApprovals,
          onPendingRefresh: () => loadPending(detail?.id),
          onBack: () => setSelected(null),
          onSaved: mergeSavedItem,
          session: detail?.session?.id
            ? (sessionStates.get(detail.id) ?? {
              sessionId: detail.session.id,
              boundAt: detail.session.boundAt ?? null,
              alive: null,
              pending: true,
            })
            : null,
          onOpenSession: openSession,
          onUnbindSession: unbindSession,
          onEditingChange: setDetailEditing,
          onDeleted: async (id) => {
            setSelected(null)
            setNotice(`已删除流程 ${id}（代码与会话未动）`)
            await reload()
          },
          onContext: makeContext,
          onLaunch: launchDev,
        })
        : h('div', { style: styles.cardFlat },
          h('div', { style: styles.row },
            h(Button, { onClick: () => setSelected(null), children: '← 返回列表' }),
            h('span', { style: styles.sectionHint }, '正在加载流程详情…'),
          )))
      : h(HomeView, {
        state,
        items,
        selectedId: selected,
        parallel,
        parallelError,
        sessionStates,
        onOpenItem: (id) => setSelected(id),
        onOpenReport: (id) => setReportPreviewId(id),
        onRefresh: reload,
        onFixTitles: fixWeakTitles,
        fixingTitles,
        onSelectRepo: selectRepo,
        switchingRepo,
        onAddRepo: () => { setSetupMode('add'); setSetupOpen(true) },
        onRemoveRepo: removeRepo,
        onSelectWorkspace: selectWorkspace,
        onRemoveWorkspace: removeWorkspace,
        onNewWorkspace: openCreateWorkspace,
        onEditWorkspace: openEditWorkspace,
        onScan: scan,
        onNewFlow: () => onOpenChat?.(null, null, { fresh: true }),
      }),
    candidates.length ? h('div', { style: styles.cardFlat },
      h('div', { style: styles.row },
        h('strong', null, '从文档扫描到的候选'),
        h('div', { style: styles.spacer }),
        h(Button, { onClick: () => setCandidates([]), children: '收起' }),
      ),
      candidates.map((candidate) => h('div', { key: candidate.id, style: { ...styles.item, display: 'flex', justifyContent: 'space-between', gap: 8 } },
        h('div', null,
          h('div', null, candidate.title),
          h('div', { style: { ...styles.mono, color: T.text4 } }, `${candidate.source.path}:${candidate.source.line}`),
        ),
        h(Button, { onClick: () => importCandidate(candidate), children: '导入' }),
      )),
    ) : null,
    envAndCommands,
    wsOpen ? h(Modal, {
      title: wsEditId ? '编辑虚拟库（成员库）' : '新建虚拟库（多代码库组合）',
      onClose: closeWorkspaceModal,
    },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h('div', { style: styles.sectionHint },
          wsEditId
            ? '调整成员库或改名。成员库平权：任意成员（包括第一个）都可以移除或替换；新增成员从当前 HEAD 开始计算变更。'
            : '把前后端等多个代码库当成一个开发目标：扫描、计划、变更会一起看；台账/规范/上下文/证据都写在本机独立目录，不写任何成员库。'),
        h('label', { style: styles.label }, '虚拟库名字'),
        h('input', {
          style: styles.input,
          placeholder: '例如「用户中心 前后端」',
          value: wsName,
          onChange: (event) => setWsName(event.target.value),
        }),
        h('label', { style: styles.label }, wsEditId ? '成员库（勾选调整；成员库平权）' : '已登记的代码库（勾选加入，仅列出路径存在的）'),
        repoChoices.length
          ? h('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              maxHeight: 200,
              overflow: 'auto',
              border: `1px solid ${T.borderSoft}`,
              borderRadius: T.rBase,
              padding: '6px 10px',
            },
          }, repoChoices.map((card) => {
            const git = card.branch ? `${card.branch}${card.head ? `@${String(card.head).slice(0, 7)}` : ''}` : ''
            return h('label', {
              key: card.path,
              title: card.path,
              style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: T.font.sm, cursor: 'pointer', minWidth: 0 },
            },
              h('input', {
                type: 'checkbox',
                checked: wsPicked.includes(card.path),
                onChange: () => toggleWorkspaceRepo(card.path),
              }),
              h('span', { style: { fontWeight: 500, color: card.exists === false ? T.danger : T.text2, flex: '0 0 auto' } },
                card.name || repoBaseName(card.path)),
              card.exists === false ? h(Tag, { tone: 'danger' }, '路径不存在') : null,
              h('span', { style: { ...styles.mono, color: T.text4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 0 } },
                git ? `${git} · ${card.path}` : card.path),
            )
          }))
          : h('div', { style: styles.sectionHint }, '还没有已登记的代码库；直接在下面填路径（每行一个，都是平权成员库）。'),
        h('label', { style: styles.label }, wsEditId ? '新增成员库路径（每行一个，可留空）' : '其它代码库路径（每行一个，可只填这里）'),
        h('textarea', {
          style: { ...styles.textarea, minHeight: 90 },
          placeholder: '代码库路径，每行一个，例如：\n/Users/you/backend\n/Users/you/frontend',
          value: wsPaths,
          onChange: (event) => setWsPaths(event.target.value),
        }),
        h('div', { style: styles.row },
          h(Tag, { tone: wsDraftRepos.length >= 2 ? 'ok' : 'warn' }, `已选 ${wsDraftRepos.length} 个代码库`),
          h('span', { style: styles.sectionHint }, wsEditId ? '取消勾选 = 移除成员（任意成员都可移除）' : '至少 2 个；成员库平权'),
        ),
        wsError ? h('div', { style: styles.dangerCard }, wsError) : null,
        h('div', { style: styles.row },
          h(SubmitButton, {
            disabled: busy,
            onClick: saveWorkspaceNow,
            children: busy ? (wsEditId ? '保存中…' : '创建中…') : (wsEditId ? '保存修改' : '创建并切换'),
          }),
          h(Button, { onClick: closeWorkspaceModal, children: '取消' }),
        ),
      ),
    ) : null,
    setupOpen ? h(Modal, { title: setupMode === 'add' ? '新增代码库' : '初始化 DevHub', onClose: () => setSetupOpen(false) },
      h(SetupForm, {
        state,
        mode: setupMode,
        onDone: onSetupDone,
        onPickDirectory: async () => {
          const ui = ctx?.get?.('uiWorkspace')
          if (!ui?.pickDirectory) throw new Error('当前 DSH 不支持目录选择，请手动输入路径')
          return ui.pickDirectory()
        },
      }),
    ) : null,
    // 报告入口不靠 window.open：站内弹窗一定能打开；弹窗内再提供保存到本机/打开完整报告
    reportPreviewId
      ? h(Modal, {
        title: '开发报告预览',
        width: 'min(1120px, 96vw)',
        onClose: () => setReportPreviewId(null),
      }, h(ReportView, { itemId: reportPreviewId }))
      : null,
  )
}

/**
 * 左上角面板图标（sidebar.panellist）。owner 提供 size/active，
 * 文案由 sidebar 从列表元数据取，图标只用 currentColor 继承主题。
 */
function DevHubIcon({ size = 18, active = false }) {
  const edge = Number(size) || 18
  const [count, setCount] = useState(0)
  useEffect(() => {
    let stop = false
    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const body = await api(API.state)
        if (!stop) setCount(Number(body?.attentionCount) || 0)
      } catch { /* 角标失败不影响图标 */ }
    }
    tick()
    const timer = setInterval(tick, 15000)
    return () => { stop = true; clearInterval(timer) }
  }, [])
  return h('span', { style: { position: 'relative', display: 'inline-flex', width: edge, height: edge } },
    h('svg', {
    width: edge,
    height: edge,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: active ? 2.1 : 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    style: { display: 'block' },
  },
    h('rect', { x: 3, y: 4, width: 18, height: 12, rx: 2 }),
    h('path', { d: 'M12 16v4' }),
    h('path', { d: 'M8.5 20h7' }),
    h('path', { d: 'M7 11.5l2.6-2.6L12 11.4l2.2-3 2.8 3.1' }),
    ),
    count > 0
      ? h('span', {
        style: {
          position: 'absolute',
          top: -5,
          right: -6,
          minWidth: 13,
          height: 13,
          padding: '0 3px',
          borderRadius: 999,
          background: T.danger,
          color: '#fff',
          fontSize: 9,
          lineHeight: '13px',
          textAlign: 'center',
          fontWeight: 600,
          boxSizing: 'border-box',
          boxShadow: '0 0 0 2px var(--dsw-alias-bg-layer-1, #fff)',
        },
        title: `${count} 个流程需要你处理`,
      }, count > 99 ? '99+' : String(count))
      : null,
  )
}

/**
 * main 面板里的开发工作站大页面：整块高度、内部滚动。
 * 默认是「对话」页：说一句要做什么 → 工作站扫仓库 → 二次确认 → 建流程并开启开发会话；
 * 「流程」页仍是原来的台账/详情/环境/测试提交那一套（Panel）。
 */
/**
 * 流程是否正在开发：优先用 Host 在 item 上补的 running（/state 与 /items 同源），
 * 旧响应没有该字段时回退 state.sessionStates（可能是数组，也可能是 Map）里的实时状态。
 * 右上角计数与抽屉共用这一份口径，避免两处判断不一致。
 */
function isItemRunning(state, item) {
  if (typeof item?.running === 'boolean') return item.running
  const states = state?.sessionStates
  if (Array.isArray(states)) {
    const live = states.find((row) => row?.itemId === item?.id)
    return Boolean(live?.running)
  }
  if (states && typeof states.get === 'function') return Boolean(states.get(item?.id)?.running)
  return false
}

/** 右上角「进行中」抽屉：需要你处理 / 进行中 / 已完成，点条目直接进详情。 */
/** 当前激活目标（代码库 / 虚拟库）在抽屉里的统一描述；overview 还没回来时兜底。 */
function drawerTargetOf(state) {
  const workspace = state?.workspace ?? null
  const repo = state?.repo ?? null
  if (workspace?.id) {
    return {
      key: `workspace:${workspace.id}`,
      kind: 'workspace',
      name: workspace.name ?? '虚拟库',
      path: repo?.path ?? null,
      workspaceId: workspace.id,
      member: state?.profile?.member ?? null,
      current: true,
    }
  }
  if (repo?.path) {
    return {
      key: `repo:${repo.path}`,
      kind: 'repo',
      name: repo.name ?? repo.path,
      path: repo.path,
      workspaceId: null,
      member: state?.profile?.member ?? null,
      current: true,
    }
  }
  return null
}

export function FlowDrawer({ overview, fallbackState, onPick, onClose, switchingTarget = null, error = '' }) {
  const hasOverview = Array.isArray(overview?.items)
  const fallbackTarget = drawerTargetOf(fallbackState)
  // overview 是跨全部代码库/虚拟库的聚合；首屏没回来时先用当前目标兜底，不让抽屉空着。
  const items = hasOverview
    ? overview.items
    : (fallbackState?.items ?? []).map((item) => ({
      ...item,
      running: Boolean(item.running),
      target: fallbackTarget,
    }))
  const targetCount = overview?.targetCount ?? (fallbackTarget ? 1 : 0)
  const inProgress = overview?.inProgressCount ?? items.filter((item) => item.status !== 'done').length
  const groups = [
    { key: 'attention', title: '需要你处理', list: items.filter((item) => item.attention) },
    { key: 'running', title: '进行中', list: items.filter((item) => !item.attention && item.status !== 'done') },
    { key: 'done', title: '已完成', list: items.filter((item) => item.status === 'done') },
  ].filter((group) => group.list.length)

  return h('div', {
    style: {
      position: 'absolute',
      top: 34,
      right: 0,
      zIndex: 10002,
      width: 400,
      maxHeight: '60vh',
      overflow: 'auto',
      padding: 10,
      border: `1px solid ${T.borderSoft}`,
      borderRadius: T.rLg,
      background: T.surface,
      boxShadow: T.shadowModal,
    },
  },
    h('div', { style: { ...styles.row, marginBottom: 4, alignItems: 'flex-start' } },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 } },
        h('span', { style: styles.sectionTitle }, '全部开发目标'),
        h('span', { style: styles.sectionHint },
          `${targetCount} 个目标 · ${inProgress} 个进行中${switchingTarget ? ' · 正在切换…' : ''}`),
      ),
      h('div', { style: styles.spacer }),
      h('span', { style: { ...styles.smallMuted, cursor: 'pointer' }, onClick: onClose }, '关闭'),
    ),
    error ? h('div', { style: { ...styles.smallDanger, marginBottom: 4 } }, error) : null,
    groups.length
      ? groups.map((group) => h('div', { key: group.key, style: { marginTop: 6 } },
        h('div', { style: { ...styles.sectionHint, padding: '2px 4px' } }, `${group.title}（${group.list.length}）`),
        group.list.map((item) => {
          const running = item.running === true
          const target = item.target ?? null
          const switching = Boolean(switchingTarget && target?.key === switchingTarget)
          return h('div', {
            key: `${target?.key ?? ''}:${item.id}`,
            role: 'button',
            title: target ? `切到「${target.name}」并打开这个流程` : '打开流程详情',
            onClick: () => { if (!switchingTarget) onPick?.(item) },
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              padding: '8px 8px',
              borderRadius: T.rBase,
              cursor: switchingTarget ? 'progress' : 'pointer',
              opacity: switchingTarget && !switching ? 0.55 : 1,
              borderTop: `1px solid ${T.borderSoft}`,
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
              h('span', {
                style: { fontSize: T.font.sm, fontWeight: 500, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' },
              }, item.title),
              switching
                ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: T.font.xs, color: T.brand, flex: '0 0 auto' } },
                  h(Spinner, { size: 9, tone: 'accent' }), '切换中…')
                : running
                  ? h('span', {
                    style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: T.font.xs, fontWeight: 600, color: T.brand, flex: '0 0 auto' },
                  },
                    h(Spinner, { size: 9, tone: 'accent' }),
                    '开发中…',
                  )
                  : null,
              item.attention ? h(Tag, { tone: item.attention.tone ?? 'warn' }, item.attention.label) : null,
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: T.font.xs, color: T.text4, minWidth: 0 } },
              h('span', null, STAGE_LABELS[item.stage] ?? item.stage ?? '—'),
              h(StatusPill, { status: item.status }),
              h('span', null, `${item.doneCount ?? 0}/${item.taskCount ?? 0} 任务`),
              h('div', { style: styles.spacer }),
              target
                ? h(Tag, {
                  tone: target.current ? 'accent' : 'neutral',
                  title: target.path ?? '',
                  style: { flex: '0 0 auto', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' },
                }, `${target.name}${target.current ? ' · 当前' : ''}`)
                : null,
            ),
          )
        }),
      ))
      : h('div', { style: styles.sectionHint }, '还没有开发流程'),
  )
}

/** 小房子图标：头部「回开发站首页」按钮用。 */
function HomeGlyph({ size = 15 }) {
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  },
    h('path', { d: 'M3.8 11.2 12 4.4l8.2 6.8' }),
    h('path', { d: 'M6.1 9.8v9.8h11.8V9.8' }),
    h('path', { d: 'M9.9 19.6v-4.8h4.2v4.8' }),
  )
}

/** 「进行中」抽屉点一条流程时，/switch-repo 请求体的唯一构造点（方便单测）。 */
export function switchBodyForTarget(target, member = null) {
  if (target?.kind === 'workspace') return { workspaceId: target.workspaceId }
  return { repoPath: target?.path ?? null, name: target?.member ?? member ?? null, detect: false }
}

function DevHubPage({ ctx }) {
  // 页签：恢复上次所在的页面（切走面板再回来、刷新页面都保持）；没有记录才默认「流程」
  const [tab, setTabState] = useState(() => loadLastTab() ?? 'flows')
  const setTab = (next) => {
    setTabState(next)
    saveLastTab(next)
  }
  // 对话作用域：null = 新建流程；某 flow = 专注该流程的开发对话
  const [chatScope, setChatScope] = useState(null)
  // 点「新建流程」时自增：即使仍在同一个 scope（都显示为 new），也必须重建聊天组件，
  // 否则旧对话的计划卡片会留在屏幕上，用户点确认就绕过澄清直接建了流程。
  const [chatNonce, setChatNonce] = useState(0)
  const [flowsNonce, setFlowsNonce] = useState(0)
  // 当前开发目标（代码库 / 虚拟库）变化时自增：头部徽标立刻重取 /state，不等轮询
  const [scopeNonce, setScopeNonce] = useState(0)
  const [flowHint, setFlowHint] = useState(null)
  // 右上角"进行中"抽屉：所有流程按状态分类，点条目直接进详情
  const [flowList, setFlowList] = useState(null)
  // /state 轮询/切目标请求可能乱序返回：只接受最后一次发起的响应，避免旧目标的响应覆盖顶栏
  const flowStateSeqRef = useRef(0)
  // 跨代码库/虚拟库的流程总览：抽屉与「进行中」角标都用它，避免只看得到当前目标
  const [overview, setOverview] = useState(null)
  const [overviewError, setOverviewError] = useState('')
  // 正在切换的目标 key（切库时抽屉保持打开、行内显示"切换中…"）
  const [switchingTarget, setSwitchingTarget] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 小房子按钮的悬停态：默认淡品牌底 + 品牌色屋顶，hover/focus 时反白，明确是「可点」的。
  const [homeHover, setHomeHover] = useState(false)
  const [openFlow, setOpenFlow] = useState(null)
  const [homeNonce, setHomeNonce] = useState(0)

  useEffect(() => {
    let stop = false
    const load = async () => {
      if (stop) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      const seq = flowStateSeqRef.current + 1
      flowStateSeqRef.current = seq
      try {
        const body = await api(API.state)
        // 慢请求回来时用户可能已经切到别的代码库/虚拟库：旧目标不能覆盖新顶栏
        if (!stop && seq === flowStateSeqRef.current) setFlowList(body)
      } catch { /* 抽屉数据失败：保留上次 */ }
    }
    load()
    const timer = setInterval(load, 10000)
    // 页面在后台时轮询会跳过；切回来要立刻重取，否则顶栏可能一直显示旧目标
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop = true
      clearInterval(timer)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
    }
  }, [flowsNonce, scopeNonce, tab])

  // 跨目标总览：每 10 秒刷新一次；切库/切页签也会立刻重取。
  // 抽屉打开与否都保持一份，因为头部「进行中」按钮的计数也要跨目标。
  useEffect(() => {
    let stop = false
    const load = async () => {
      if (stop) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const body = await api(API.overview)
        if (!stop) { setOverview(body); setOverviewError('') }
      } catch (err) {
        const message = errorText(err)
        // 旧 Host 还没有 /overview（未重启）时静默降级为当前目标，不把"没重启"显示成故障
        if (!stop) setOverviewError(/HTTP 404|not found/i.test(message) ? '' : `跨目标流程读取失败：${message}`)
      }
    }
    load()
    const timer = setInterval(load, 10000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop = true
      clearInterval(timer)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
    }
  }, [flowsNonce, scopeNonce, tab])

  /**
   * 抽屉里点一条流程：如果它属于别的代码库/虚拟库，先切目标再打开详情。
   * 切目标走 /switch-repo（与面板里点代码库卡片同一套 Host 逻辑），
   * 成功后重挂 Panel（flowsNonce）让 /state 用新目标重载，并把 openFlow 带过去。
   */
  async function openAcrossTarget(item) {
    if (!item?.id || switchingTarget) return
    const target = item.target ?? null
    setOverviewError('')
    if (!target || target.current) {
      setDrawerOpen(false)
      setTab('flows')
      setOpenFlow({ id: item.id, nonce: Date.now() })
      return
    }
    setSwitchingTarget(target.key)
    try {
      const body = await api(API.switchRepo, {
        method: 'POST',
        body: JSON.stringify(switchBodyForTarget(target, flowList?.profile?.member)),
      })
      setFlowList(body)
      setOverview(null)
      setScopeNonce((value) => value + 1)
      setFlowsNonce((value) => value + 1)
      setDrawerOpen(false)
      setTab('flows')
      setOpenFlow({ id: item.id, nonce: Date.now() })
    } catch (err) {
      setOverviewError(`切到「${target.name}」失败：${errorText(err)}`)
    } finally {
      setSwitchingTarget(null)
    }
  }

  /**
   * 进聊天页。
   * fresh=true 用于「新建流程」入口：先落一段新对话再进聊天，
   * 这样第二个新流程不会接着上一段流程的对话继续写（否则两段消息会串在一起）。
   */
  function openChat(scope = null, hint = null, { fresh = false } = {}) {
    const repoPath = flowList?.repo?.path
    if (fresh && repoPath) {
      startNewChat(repoPath, '新对话', 'new')
      // 关键：同一 scope 下也强制重建 DevHubChat，避免旧计划/旧 pendingPlan 继续可见
      setChatNonce((value) => value + 1)
    }
    setChatScope(scope)
    setFlowHint(hint)
    setTab('chat')
  }

  const flowItems = flowList?.items ?? []
  // 头部计数跨全部代码库/虚拟库（overview 未到时先用当前目标兜底）。
  const inProgressCount = overview?.inProgressCount ?? flowItems.filter((item) => item.status !== 'done').length
  const attentionCount = overview?.attentionCount ?? (flowList?.attentionCount ?? 0)
  const runningCount = overview?.runningCount ?? flowItems.filter((item) => isItemRunning(flowList, item)).length
  const targetCount = overview?.targetCount ?? (flowList?.repo ? 1 : 0)

  return h('div', { style: styles.page },
    h('div', {
      style: {
        ...styles.pageHeader,
        // 左/右两栏等宽，中间徽标因此正好落在头部正中（不再挤在标题后面）
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
      },
    },
      // 左：品牌 + 标题
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' } },
        h(IconSeat, { size: 30 }, '◈'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
          h('div', { style: styles.pageTitle }, '开发工作站'),
          h('div', {
            style: { ...styles.pageSubtitle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          }, tab === 'flows'
            ? '开发流程台账 · 会话状态 · 并行开发 · 测试与提交'
            : tab === 'skills'
              ? '通用技能包 · 安装/卸载 · 自定义约束 · 重建默认规范'
              : (chatScope
                ? `专注流程：${flowHint?.title ?? chatScope} · 一句话追问、看扫仓库与计划`
                : '新建开发流程 · 说一句要做什么 · 工作站扫仓库、追问、自评计划')),
        ),
      ),
      // 中：当前开发目标（流程台账、技能与约束都落在这个目标上；点击回流程页切库）
      h('div', { style: { display: 'flex', justifyContent: 'center', minWidth: 0, maxWidth: 560, padding: '0 8px' } },
        flowList
          ? h(RepoScopeBadge, {
            repo: flowList.repo ?? null,
            workspace: flowList.workspace ?? null,
            // 点了回「流程」列表（切库/虚拟库入口在那里），从详情页也能一步回到能切库的地方
            onClick: () => { setTab('flows'); setOpenFlow(null); setHomeNonce((value) => value + 1) },
          })
          : null,
      ),
      // 右：操作（回会话 / 进行中 / 回首页 / 页签）
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: T.gap.xs, minWidth: 0, flexWrap: 'wrap' } },
      tab === 'chat'
        ? h(Button, { style: { height: 26, padding: '0 10px' }, onClick: () => setTab('flows'), children: '← 回流程' })
        : null,
      h('div', { style: { position: 'relative' } },
        h(Button, {
          style: { height: 28, padding: '0 12px', borderColor: attentionCount > 0 ? T.brandBorder : undefined },
          title: `${targetCount} 个开发目标 · ${inProgressCount} 个进行中${attentionCount > 0 ? ` · ${attentionCount} 个需要你处理` : ''}`,
          onClick: () => setDrawerOpen((value) => !value),
          children: [
            runningCount > 0 ? h(Spinner, { key: 'spin', size: 10, tone: 'accent', style: { marginRight: 6 } }) : null,
            `进行中 ${inProgressCount}${attentionCount > 0 ? ` · ${attentionCount} 待处理` : ''}${runningCount > 0 ? ` · ${runningCount} 开发中` : ''} ▾`,
          ],
        }),
        drawerOpen ? h(FlowDrawer, {
          overview,
          fallbackState: flowList,
          onPick: openAcrossTarget,
          switchingTarget,
          error: overviewError,
          onClose: () => setDrawerOpen(false),
        }) : null,
      ),
      // 回首页做成小房子图标按钮，放在「进行中」右边：图标比文字 hub 更容易认，
      // 淡品牌底也让它和旁边两个工具按钮区分开。
      h('button', {
        type: 'button',
        title: '回到开发站首页（流程列表）',
        'aria-label': '回到开发站首页',
        onMouseEnter: () => setHomeHover(true),
        onMouseLeave: () => setHomeHover(false),
        onFocus: () => setHomeHover(true),
        onBlur: () => setHomeHover(false),
        onClick: () => { setTab('flows'); setOpenFlow(null); setHomeNonce((value) => value + 1) },
        style: {
          width: 28,
          height: 28,
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${homeHover ? T.brand : T.brandBorder}`,
          borderRadius: T.rBase,
          background: homeHover ? T.brand : T.brandSoft,
          color: homeHover ? '#fff' : T.brand,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: T.transition,
          flex: '0 0 auto',
        },
      }, h(HomeGlyph, { size: 15 })),
      h(Segmented, {
        value: tab,
        // 「新建流程」页签是明确的“再开一个”：先落新对话，不能恢复上一段的进行中对话
        // （否则上一段的扫描/澄清结果会和这一次混在同一段对话里）。
        onChange: (next) => {
          if (next === tab) return
          if (next === 'chat') { openChat(null, null, { fresh: true }); return }
          setTab(next)
        },
        options: [
          { value: 'flows', label: '流程' },
          { value: 'chat', label: '新建流程' },
          { value: 'skills', label: '技能' },
        ],
      }),
      ),
    ),
    tab === 'chat'
      ? h(DevHubChat, {
        ctx,
        // 换代码库必须重建聊天组件：否则旧库的对话/探测结果会留在新库的聊天页里
        key: `${flowList?.repo?.path ?? 'none'}:${chatScope ?? 'new'}:${chatNonce}`,
        scopeId: chatScope,
        scopeTitle: flowHint?.title ?? '',
        // 聊天页不再回写顶栏目标：聊天自己的 /state 可能晚到/属于别的目标，
        // 回写会把正在看的流程顶栏覆盖成另一个虚拟库（顶栏只认自己的 /state 序列）。
        onFlowsChanged: () => setFlowsNonce((current) => current + 1),
        onRequireSetup: () => setTab('flows'),
        // 建流程 + 开工成功后自动进对应流程详情（标准流程继续，不留在聊天页）
        onFlowStarted: (id) => {
          setTab('flows')
          setOpenFlow({ id, nonce: Date.now() })
        },
      })
      : tab === 'skills'
        ? h('div', { style: styles.pageBody }, h(SkillsPanel))
        : h('div', { style: styles.pageBody }, h(Panel, {
          ctx,
          key: flowsNonce,
          onOpenChat: openChat,
          openFlowId: openFlow?.id ?? null,
          openFlowNonce: openFlow?.nonce ?? 0,
          homeNonce,
          onScopeChanged: () => setScopeNonce((value) => value + 1),
        })),
  )
}

// Static service requirement: without it the fiber activates before the
// renderer's `slots` service exists, `ctx.slots` is undefined and the whole
// entry fails, which aborts the Web boot ("1 entry did not activate").
export const inject = ['slots', 'locale']

export function apply(ctx) {
  // 本地化字典：与 DSH 设置里的语言选择共用 ctx.locale；语言切换后 Provider 会重建子树，
  // 让 h 工厂重新翻译静态文案。
  if (typeof ctx.locale?.register === 'function') {
    ctx.effect(() => {
      try {
        return ctx.locale.register(LOCALE_NAMESPACE, { zh, en })
      } catch (error) {
        // 字典注册失败不应让整个工作站白屏；退回原文继续渲染。
        try { console.warn('[dev-hub] locale registration failed:', error) } catch { /* ignore */ }
        return () => {}
      }
    }, 'dev-hub: locale dictionaries')
  }
  let translate = (key) => key
  try {
    if (typeof ctx.locale?.bind === 'function') translate = ctx.locale.bind(LOCALE_NAMESPACE)
  } catch { /* 语言服务还没就绪时不能拖垮整个插件 */ }
  // 入口：左上角面板列表（插件 / 自动化任务 同一排），点开即 main 大页面。
  ctx.slots.inject('sidebar.panellist', () => {
    const dispose = ctx.slots.register({
      name: 'sidebar.panellist',
      id: 'dev-hub',
      order: 20,
      label: () => translate('开发工作站'),
    }, DevHubIcon)
    return () => dispose()
  })

  // 会话页快捷入口：显示"本会话属于哪个开发流程"，并能一键切到别的流程会话/回工作站。
  ctx.slots.inject('conversation.session.header.actions', () => {
    const dispose = ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'dev-hub-session',
      order: 15,
      label: () => translate('开发流程'),
    }, (props) => h(DevHubBoundary, null, h(LocaleProvider, { ctx }, h(DevHubSessionQuick, { sessionId: props?.sessionId, ctx }))))
    return () => dispose()
  })

  // 页面：sidebar.panellist 的 id 与 main 的 key 同名即互相寻址。
  // 组件由 owner 用标准 props 渲染，这里把插件 ctx 一并传进去，供“开启开发会话”取会话/工作区服务。
  ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register({
      name: 'main',
      key: 'dev-hub',
    }, (props) => h(DevHubBoundary, null, h(LocaleProvider, { ctx }, h(DevHubPage, { ...props, ctx }))))
    return () => dispose()
  })
}