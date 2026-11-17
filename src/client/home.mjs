/**
 * dsh-dev-hub 浏览器半 —— 开发站首页。
 *
 * 取舍（用户反馈「流程那部分还是有点重、复杂」）：
 * - 不再用卡片网格平铺流程，改成**一条一行**的列表：标题/状态/阶段/流程进度/scope 摘要/更新时间
 *   都压在同一行里，行高 ≥52、整行可点、hover 只给浅底，扫一眼就能比较；
 * - 并行开发默认折叠成一行摘要（「N 个进行中 · 无冲突」），展开才看 active / pairs / advice；
 *   有冲突时用家族规范的 warn 左 3px 边线块提示，不抢列表的注意力；
 * - 顶部项目条只放项目身份与全局动作，`刷新`/`快速新建`这类列表级动作留在列表头。
 *
 * 数据形状保持与既有 Host 契约一致：
 * GET API.items / GET API.state 的 items 摘要（title/status/stage/进度/scope/updatedAt/session），
 * GET API.parallel 的 active / pairs / canParallel / advice；
 * 会话状态由 Panel 每 5 秒 GET API.sessions 后按 itemId 建 Map 下发（本文件只做展示，不请求）。
 * 点击一行由 index.mjs 打开详情。
 */
import { useEffect, useRef, useState } from 'react'
import { h } from './i18n.mjs'
import { API, STATUS_LABELS } from '../shared/api.mjs'
import { STAGE_LABELS, WORKFLOW_STAGES } from '../shared/workflow.mjs'
import {
  Button,
  EmptyState,
  IconSeat,
  Spinner,
  StatusPill,
  Tag,
  T,
  fmtTime,
  repoBaseName,
  scopeTokenLabel,
  styles,
} from './common.mjs'

/** 次要动作统一缩一号，避免顶部一排按钮比内容还抢眼。 */
const miniButton = { height: 28, padding: '0 10px', fontSize: T.font.sm }

/** 代码库卡与「新增开发目标」卡统一高度，让同一行网格对齐、不再一高一矮。 */
const GRID_CARD_MIN_HEIGHT = 120

function stageText(stage) {
  if (!stage) return '未开始'
  return STAGE_LABELS[stage] ?? stage
}

/**
 * 「开发任务完成 ≠ 流程完成」：按阶段与测试事实算流程还差哪一步。
 * 列表用它解释"任务 9/9 但还在验证中"的落差，避免满格绿色进度条被当成已完成。
 * @returns {string|null} null 表示流程已完成
 */
export function pendingFlowStep(item) {
  if (!item) return null
  if (item.status === 'done' || item.stage === 'done') return null
  if (item.status === 'blocked') return '流程被阻塞'
  const stage = item.stage ?? 'discovery'
  const local = item.testState ?? 'not_run'
  const env = item.environmentTestState ?? 'not_run'
  const review = item.reviewState ?? 'idle'
  const isAnalysis = item.intent === 'analysis'
  if (stage === 'discovery' || stage === 'techdoc' || stage === 'plan') return '还没进入开发'
  if (stage === 'develop') {
    if (review === 'failed') return '评审未通过，待纠偏'
    return isAnalysis ? '只读分析中，未出结论' : '开发中，待评审'
  }
  if (stage === 'review') {
    if (review === 'failed') return '评审未通过，待纠偏'
    if (review === 'error') return '评审异常待处理'
    if (review === 'pending') return '独立评审进行中'
    return local !== 'passed' ? '还差本机自测' : '继续推进即开始评审'
  }
  if (stage === 'verify') {
    if (isAnalysis) return local !== 'passed' ? '还差本机自测' : '结论待回写'
    return local !== 'passed' ? '还差本机自测' : (env !== 'passed' ? '还差环境测试' : '待提交')
  }
  if (stage === 'submit') return isAnalysis ? '分析流程不进入提交' : '待提交'
  return null
}

/**
 * 列表行的「报告」快捷入口：整行点击是进详情，这里只在新标签打开完整报告。
 * 报告页签在详情里也能看，但列表入口省掉“先进详情再找页签”的一步。
 */
export function reportHtmlUrl(itemId) {
  return `${API.report}?id=${encodeURIComponent(itemId)}&format=html`
}

export function openReportHtml(itemId) {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return
  try {
    window.open(reportHtmlUrl(itemId), '_blank', 'noopener')
  } catch {
    // 弹窗被拦截静默失败：用户仍可从详情页「报告」页签查看，不阻断列表操作。
  }
}

/* --------------------------------------------------------- 开发会话联动 */

/**
 * 会话状态 → 家族色 Tag。
 * Host 的 sessionState 在会话不在当前进程时返回 alive:false；还没读到状态时
 * 用 alive:null 表示「读取中」，不把未知状态伪装成运行中或已结束。
 */
export function sessionBadgeState(session) {
  if (!session || session.alive === null || session.alive === undefined) return { tone: 'neutral', label: '状态读取中' }
  if (session.running) return { tone: 'ok', label: '会话运行中' }
  if (session.alive) return { tone: 'neutral', label: '会话空闲' }
  return { tone: 'warn', label: '会话已结束' }
}

/** 列表/详情共用的会话状态 Tag，避免两处各写一套颜色。运行中必须带转圈，不能只是静态标签。 */
export function SessionBadge({ session }) {
  const badge = sessionBadgeState(session)
  const running = Boolean(session?.running)
  return h(Tag, {
    tone: badge.tone,
    style: running ? { gap: 5, paddingLeft: 6 } : undefined,
  },
    running ? h(Spinner, { key: 'spin', size: 9, tone: 'ok', title: '开发会话正在运行' }) : null,
    badge.label,
  )
}

/** 最近活动：优先用 Host 的 idleSeconds（秒），没有就按 lastEventAt 现算；只显示相对时间。 */
export function sessionActivity(session) {
  if (!session) return '—'
  let idle = Number(session.idleSeconds)
  if (!Number.isFinite(idle) && session.lastEventAt) {
    idle = Math.max(0, Math.round((Date.now() - Number(session.lastEventAt)) / 1000))
  }
  if (!Number.isFinite(idle)) return '暂无活动'
  if (idle < 60) return '刚刚'
  if (idle < 3600) return `${Math.floor(idle / 60)} 分钟前`
  return `${Math.floor(idle / 3600)} 小时前`
}

const SESSION_STAGE_TEXT = {
  idle: '等待中',
  turn: '本轮对话',
  step: '思考步骤',
  tool: '调用工具',
  assistant: '输出回答',
  ended: '已结束',
}

export function sessionStageText(stage) {
  if (!stage) return ''
  return SESSION_STAGE_TEXT[stage] ?? stage
}

/** 列表里按 itemId 取会话状态；已绑定但 /sessions 还没回来时给一个 pending 占位。 */
function sessionForItem(sessionStates, item) {
  // /sessions 是按 itemId 建的权威状态：即使列表摘要没带 session.id（旧投影/刚绑定），
  // 只要会话在跑也要能显示「正在开发…」，不能因为投影缺字段就丢掉运行态。
  const live = sessionStates?.get?.(item?.id)
  if (live) return live
  if (!item?.session?.id) return null
  return {
    sessionId: item.session.id,
    boundAt: item.session.boundAt ?? null,
    alive: null,
    pending: true,
  }
}

/** scope + scopeModules 合并去重；列表里只展示 2 个，其余折成 +N。 */
function scopeTokens(item) {
  return [...new Set([...(item?.scope ?? []), ...(item?.scopeModules ?? [])].map(String).filter(Boolean))]
}

function ScopeChips({ tokens }) {
  if (!tokens.length) return h('span', { style: styles.sectionHint }, '未标注 scope')
  return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
    tokens.slice(0, 2).map((token) => h(Tag, { key: token }, scopeTokenLabel(token))),
    tokens.length > 2 ? h(Tag, { tone: 'neutral' }, `+${tokens.length - 2}`) : null,
  )
}

/** 一个已有代码库＝一张卡：选中用品牌紫边 + 淡底 + 对勾，点一下就切换。 */
/**
 * 末尾的虚线卡：把「新增代码库」和「新建虚拟库」合并成一个入口，避免同屏两个
 * 含义相近的按钮让用户分不清该点哪个。两个动作仍各自保留明确文案。
 */
function AddTargetCard({ busy, onAddRepo, onAddWorkspace }) {
  return h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 8,
      minWidth: 0,
      minHeight: GRID_CARD_MIN_HEIGHT,
      boxSizing: 'border-box',
      padding: '10px 12px',
      border: `1px dashed ${T.border}`,
      borderRadius: T.rLg,
      background: 'transparent',
      color: T.text4,
      transition: T.transition,
    },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 } },
      h(IconSeat, { size: 26, tone: 'neutral' }, '+'),
      h('span', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
        h('span', { style: { fontSize: T.font.base, fontWeight: 500, color: T.text2 } }, '新增开发目标'),
        h('span', { style: { fontSize: T.font.xs, color: T.text4 } }, '单个代码库，或前后端多库组合'),
      ),
    ),
    // footer：两个动作平分左右，和上方标题区拉开，点哪个一目了然
    h('div', { style: { display: 'flex', gap: 6, width: '100%' } },
      h(Button, {
        style: { ...miniButton, flex: '1 1 0', minWidth: 0, padding: '0 6px' },
        disabled: Boolean(busy),
        onClick: onAddRepo,
        children: '+ 新增代码库',
      }),
      h(Button, {
        style: { ...miniButton, flex: '1 1 0', minWidth: 0, padding: '0 6px' },
        disabled: Boolean(busy),
        onClick: onAddWorkspace,
        children: '▣ 新建虚拟库',
      }),
    ),
  )
}

function RepoCard({ path, name: givenName, exists = true, active, busy, isRepo, branch, head, initialized, workspaces, onSelect, onRemove }) {
  const name = givenName || String(path ?? '').split('/').filter(Boolean).pop() || path
  const [hovered, setHovered] = useState(false)
  // 虚拟库归属只放 tooltip：footer 再挂一个「虚拟库 · xxx」会让代码库卡看起来像虚拟库卡
  const workspaceNames = (Array.isArray(workspaces) ? workspaces : []).filter(Boolean)
  const gitText = !exists
    ? '路径不存在，不能切换'
    : busy
      ? '正在切换…'
      : isRepo === false
        ? '非 git 仓库'
        : branch
          ? `${branch}${head ? `@${head}` : ''}`
          : '本地代码库'
  const hint = !exists
    ? '已失效'
    : active
      ? '当前开发目标'
      : initialized === false
        ? '尚未初始化 .dev-hub'
        : '点击切换'
  return h('div', {
    // 选中卡作为「项目管理」的当前 tab：首页用它和下方流程列表画一条连通线
    id: active ? 'devhub-active-target' : undefined,
    'data-devhub-target-card': '1',
    style: { position: 'relative', minWidth: 0 },
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  },
    h('button', {
      type: 'button',
      title: [
        !exists ? `路径已不存在：${path}（可点右上角 × 移除）` : active ? `当前代码库：${path}` : busy ? '正在切换…' : `切换到 ${path}`,
        branch ? `分支 ${branch}${head ? `@${head}` : ''}` : (exists && isRepo === false ? '不是 git 仓库' : ''),
        workspaceNames.length ? `虚拟库：${workspaceNames.join('、')}` : '',
      ].filter(Boolean).join('\n'),
      disabled: Boolean(busy) || !exists,
      'aria-pressed': active,
      onClick: () => onSelect?.(path),
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        gap: 8,
        width: '100%',
        minWidth: 0,
        minHeight: GRID_CARD_MIN_HEIGHT,
        boxSizing: 'border-box',
        padding: '10px 12px',
        textAlign: 'left',
        border: `1px solid ${!exists ? T.danger : active ? T.brandBorder : T.borderSoft}`,
        // 选中卡是「项目管理」的当前 tab：下沿收方，和下面的流程面板用连通线连起来
        borderRadius: active ? '12px 12px 4px 4px' : T.rLg,
        background: !exists ? T.dangerSoft : active ? T.brandSoft : T.surface,
        boxShadow: active ? `0 0 0 2px rgba(96,73,231,.10)` : T.shadowCard,
        cursor: !exists ? 'not-allowed' : busy ? 'progress' : active ? 'default' : 'pointer',
        opacity: busy ? 0.75 : 1,
        fontFamily: 'inherit',
        transition: T.transition,
      },
    },
      // 上半区：图标 + 名称/路径，右侧只放当前状态
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 } },
        h(IconSeat, { size: 26, tone: active ? 'accent' : 'neutral' }, !exists ? '!' : active ? '✓' : '◈'),
        h('span', { style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 auto' } },
          h('span', { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
            h('span', {
              style: {
                fontSize: T.font.base,
                fontWeight: active ? 600 : 500,
                color: !exists ? T.danger : active ? T.brand : T.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              },
            }, name),
            !exists
              ? h(Tag, { tone: 'danger' }, '路径不存在')
              : active
                ? h(Tag, { tone: 'accent' }, '当前')
                : busy ? h(Tag, { tone: 'neutral' }, '切换中…') : null,
          ),
          h('span', {
            title: path,
            style: {
              ...styles.mono,
              fontSize: T.font.xs,
              lineHeight: 1.45,
              color: T.text4,
              // 目录直接换行展示（最多两行），别只留一行省略号把卡片中段空出来
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-all',
              whiteSpace: 'normal',
            },
          }, path),
        ),
      ),
      // 下半区 footer：Git 事实 / 虚拟库归属 / 下一步提示，和上方信息分层
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          paddingTop: 6,
          borderTop: `1px solid ${exists ? T.borderSoft : T.danger}`,
        },
      },
        h('span', {
          title: branch ? `分支 ${branch}${head ? ` @ ${head}` : ''}` : '',
          style: {
            ...styles.mono,
            fontSize: T.font.xs,
            color: !exists ? T.danger : T.text4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: '1 1 auto',
            minWidth: 0,
          },
        }, gitText),
        h('span', {
          style: {
            fontSize: T.font.xs,
            color: active ? T.brand : T.text4,
            whiteSpace: 'nowrap',
            flex: '0 0 auto',
          },
        }, hint),
      ),
    ),
    // 移除卡片：只从本机列表忘掉，不动磁盘
    hovered && !busy
      ? h('button', {
        type: 'button',
        title: '从列表移除这个代码库（不动磁盘文件）',
        onClick: (event) => {
          event.stopPropagation()
          onRemove?.(path)
        },
        style: {
          position: 'absolute',
          top: -6,
          right: -6,
          width: 18,
          height: 18,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${T.danger}`,
          borderRadius: 999,
          background: T.surface,
          color: T.danger,
          fontSize: 11,
          lineHeight: 1,
          cursor: 'pointer',
          boxShadow: T.shadowCard,
          fontFamily: 'inherit',
        },
      }, '×')
      : null,
  )
}

/**
 * 成员库展示数据：优先用 Host 的 `workspace.members`（带 exists / branch / head /
 * initialized），旧响应只有 `repos` 路径时按目录名兜底，不把信息藏起来。
 * 没有主库：成员库平权，顺序只影响展示，不代表归属。
 */
export function workspaceMembersView(workspace) {
  const repos = Array.isArray(workspace?.repos) ? workspace.repos : []
  const detail = Array.isArray(workspace?.members) ? workspace.members : []
  if (detail.length) {
    return detail.map((member, index) => {
      const path = String(member?.path ?? member?.repo ?? '')
      return {
        path,
        name: member?.name || repoBaseName(path) || `成员库 ${index + 1}`,
        exists: member?.exists !== false,
        isRepo: member?.isRepo,
        initialized: member?.initialized,
        branch: member?.branch || null,
        head: member?.head || null,
      }
    })
  }
  return repos.map((entry) => {
    const path = String(entry ?? '')
    return { path, name: repoBaseName(path), exists: true, isRepo: undefined, initialized: undefined, branch: null, head: null }
  })
}

const chipTruncate = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

/** 一张虚拟库卡：和代码库卡同高同结构，用 ▣ 图标区分；hover 右上角 × 只从本机移除。 */
function WorkspaceCard({ workspace, active, busy, onSelect, onEdit, onRemove }) {
  const [hovered, setHovered] = useState(false)
  const members = workspaceMembersView(workspace)
  const missing = members.filter((member) => !member.exists)
  const memberNames = members.map((member) => member.name).join(' · ')
  const memberTitle = members.map((member) => {
    const git = member.branch ? `${member.branch}${member.head ? `@${String(member.head).slice(0, 7)}` : ''}` : ''
    return [member.name, '成员库', git, member.path, member.exists === false ? '路径不存在' : '']
      .filter(Boolean).join(' · ')
  }).join('\n')
  const hint = !members.length
    ? '未登记成员库'
    : active
      ? '当前开发目标'
      : '点击切换'
  return h('div', {
    id: active ? 'devhub-active-target' : undefined,
    'data-devhub-target-card': '1',
    style: { position: 'relative', minWidth: 0 },
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  },
    h('button', {
      type: 'button',
      'aria-pressed': active,
      disabled: Boolean(busy),
      title: [
        `切换到虚拟库「${workspace?.name ?? '未命名'}」：${members.length} 个成员库`,
        memberTitle,
        missing.length ? `${missing.length} 个成员库路径不存在` : '',
      ].filter(Boolean).join('\n'),
      onClick: () => onSelect?.(workspace.id),
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        gap: 8,
        width: '100%',
        minWidth: 0,
        minHeight: GRID_CARD_MIN_HEIGHT,
        boxSizing: 'border-box',
        padding: '10px 12px',
        textAlign: 'left',
        border: `1px solid ${active ? T.brandBorder : T.borderSoft}`,
        borderRadius: active ? '12px 12px 4px 4px' : T.rLg,
        // 非激活态也用浅灰底 + 品牌色 ▣，和白色代码库卡一眼区分开
        background: active ? T.brandSoft : T.surface2,
        boxShadow: active ? `0 0 0 2px rgba(96,73,231,.10)` : T.shadowCard,
        cursor: busy ? 'progress' : active ? 'default' : 'pointer',
        fontFamily: 'inherit',
        transition: T.transition,
      },
    },
      // 上区：▣ 图标 + 虚拟库名 / 类型说明；右侧只放当前与缺失状态
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 } },
        h(IconSeat, { size: 26, tone: 'accent' }, '▣'),
        h('span', { style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 auto' } },
          h('span', { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
            h('span', {
              style: {
                fontSize: T.font.base,
                fontWeight: active ? 600 : 500,
                color: active ? T.brand : T.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              },
            }, workspace?.name ?? '未命名虚拟库'),
            active ? h(Tag, { tone: 'accent' }, '当前') : null,
            missing.length ? h(Tag, { tone: 'danger' }, '缺失') : null,
          ),
          h('span', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: T.font.xs, color: T.text4, minWidth: 0 } },
            h('span', null, '多代码库组合'),
            h('span', { style: { color: T.border } }, '·'),
            h('span', null, `${members.length} 个成员库`),
          ),
        ),
      ),
      // 中区：成员库名字直接展示，缺失路径也能一眼看到
      h('span', {
        title: memberTitle,
        style: {
          ...styles.mono,
          fontSize: T.font.xs,
          lineHeight: 1.45,
          color: missing.length ? T.danger : T.text3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-all',
          whiteSpace: 'normal',
        },
      }, `成员库：${memberNames || '未登记'}`),
      // footer：成员库计数/本机台账 + 下一步动作
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          paddingTop: 6,
          borderTop: `1px solid ${missing.length ? T.danger : T.borderSoft}`,
        },
      },
        h('span', {
          style: {
            fontSize: T.font.xs,
            color: missing.length ? T.danger : T.text4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: '1 1 auto',
            minWidth: 0,
          },
        }, missing.length
          ? `成员库（${members.length}）· ${missing.length} 个成员库路径不存在`
          : `成员库（${members.length}）· 本机台账`),
        h('span', {
          style: {
            fontSize: T.font.xs,
            color: active ? T.brand : T.text4,
            whiteSpace: 'nowrap',
            flex: '0 0 auto',
          },
        }, hint),
      ),
    ),
    // 悬停操作：编辑成员 / 从本机移除（只删分组登记，不动成员库磁盘与台账）
    hovered && !busy
      ? h('div', {
        style: { position: 'absolute', top: -6, right: -6, display: 'flex', gap: 4 },
      },
        h('button', {
          type: 'button',
          title: '编辑这个虚拟库：改名、增删成员库（成员库平权，任意成员都可移除/替换）',
          onClick: (event) => {
            event.stopPropagation()
            onEdit?.(workspace)
          },
          style: {
            width: 18,
            height: 18,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${T.brandBorder}`,
            borderRadius: 999,
            background: T.surface,
            color: T.brand,
            fontSize: 10,
            lineHeight: 1,
            cursor: 'pointer',
            boxShadow: T.shadowCard,
            fontFamily: 'inherit',
          },
        }, '✎'),
        h('button', {
          type: 'button',
          title: '从本机移除这个虚拟库（不动成员库代码与流程台账）',
          onClick: (event) => {
            event.stopPropagation()
            onRemove?.(workspace)
          },
          style: {
            width: 18,
            height: 18,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${T.danger}`,
            borderRadius: 999,
            background: T.surface,
            color: T.danger,
            fontSize: 11,
            lineHeight: 1,
            cursor: 'pointer',
            boxShadow: T.shadowCard,
            fontFamily: 'inherit',
          },
        }, '×'),
      )
      : null,
  )
}

/** 顶部项目条：当前库 + 成员 + 全局动作；下方是虚拟库/代码库卡片，点卡片即切换。 */
function ProjectBar({ repo, member, repos, workspaces, activeWorkspace, switchingRepo, onRefresh, onSelectRepo, onAddRepo, onScan, onNewFlow, onRemoveRepo, onSelectWorkspace, onEditWorkspace, onRemoveWorkspace, onNewWorkspace, tabbed = false }) {
  const members = workspaceMembersView(activeWorkspace)
  const memberCount = activeWorkspace ? members.length : 0
  const localPath = activeWorkspace?.path ?? activeWorkspace?.localPath ?? null
  const activeWorkspaceId = activeWorkspace?.id ?? null
  // 激活的虚拟库补上 members（/state 的 workspaces 列表只有名字/路径），并排到最前面
  const workspaceViews = [...(workspaces ?? [])]
    .map((workspace) => (workspace.id === activeWorkspaceId ? { ...workspace, ...activeWorkspace } : workspace))
    .sort((left, right) => Number(right.id === activeWorkspaceId) - Number(left.id === activeWorkspaceId))
  // 旧响应/局部测试里可能只给 activeWorkspace、不给 workspaces 列表：激活的虚拟库仍要有卡片
  if (activeWorkspace && !workspaceViews.some((workspace) => workspace.id === activeWorkspace.id)) {
    workspaceViews.unshift(activeWorkspace)
  }
  const targetCount = workspaceViews.length + (repos ?? []).length
  return h('div', {
    style: {
      ...styles.cardFlat,
      display: 'flex',
      flexDirection: 'column',
      gap: T.gap.xs,
      // 和下方「开发流程」拼成一块：去掉底边/下圆角，选中卡才能像 tab 一样压住分隔线
      ...(tabbed
        ? {
            paddingBottom: 0,
            borderBottom: 'none',
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            position: 'relative',
            zIndex: 2,
          }
        : {}),
    },
  },
    // 这一块是「项目管理」：管理代码库/虚拟库，选中的目标决定下面的流程列表
    h('div', { style: { display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap' } },
      h('span', { style: styles.sectionTitle }, '项目管理'),
      h(Tag, { tone: 'neutral' }, `${targetCount} 个开发目标`),
      h('div', { style: styles.spacer }),
      h('span', { style: styles.sectionHint }, '选中的目标决定下方「开发流程」'),
    ),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: T.gap.sm, flexWrap: 'wrap' } },
      h(IconSeat, { size: 34 }, '◈'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 240px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 } },
          h('span', {
            style: { fontSize: T.font.md, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            title: activeWorkspace
              ? `虚拟库「${activeWorkspace.name ?? '未命名'}」：${memberCount} 个成员库平权；台账/规范/上下文/证据写本机 ${localPath ?? '—'}`
              : repo?.path ?? '',
          }, activeWorkspace
            ? `虚拟库 · ${activeWorkspace.name ?? '未命名'}`
            : (repo?.name ?? '未选择代码库')),
          activeWorkspace ? h(Tag, { tone: 'accent' }, `${memberCount} 库`) : null,
          activeWorkspace
            ? h(Tag, { tone: 'neutral', title: `台账/规范/上下文/证据都在本机独立目录：${localPath ?? '—'}（不写任何成员库）` }, '本机台账')
            : null,
        ),
        h('span', {
          style: {
            ...styles.mono,
            color: T.text4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        }, activeWorkspace ? (localPath ?? '—') : (repo?.path ?? '—')),
      ),
      h(Tag, { tone: 'accent' }, `成员 ${member ?? '未命名'}`),
      h('div', { style: styles.spacer }),
      h(Button, { style: miniButton, onClick: onScan, children: '扫描文档' }),
      h(Button, { style: miniButton, onClick: onRefresh, children: '刷新' }),
      h(Button, { primary: true, onClick: onNewFlow, children: '开始需求澄清' }),
    ),
    // 虚拟库与代码库放进同一个卡片网格，用 ▣ / ◈ 图标和卡内信息区分，不再分两块渲染
    workspaceViews.length || (repos ?? []).length
      ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 } },
        h('span', { style: { ...styles.sectionHint, paddingLeft: 2 } },
          `开发目标（${workspaceViews.length + (repos ?? []).length}）· ▣ 虚拟库 / ◈ 代码库，点卡片切换，末尾新增`),
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: T.gap.xs,
          },
        }, [
          ...workspaceViews.map((workspace) => h(WorkspaceCard, {
            key: workspace.id,
            workspace,
            active: activeWorkspace?.id === workspace.id,
            busy: Boolean(switchingRepo),
            onSelect: onSelectWorkspace,
            onEdit: onEditWorkspace,
            onRemove: onRemoveWorkspace,
          })),
          ...(repos ?? []).map((entry) => h(RepoCard, {
            key: typeof entry === 'string' ? entry : entry.path,
            path: typeof entry === 'string' ? entry : entry.path,
            name: typeof entry === 'string' ? undefined : entry.name,
            exists: typeof entry === 'string' ? true : entry.exists !== false,
            isRepo: typeof entry === 'string' ? undefined : entry.isRepo,
            branch: typeof entry === 'string' ? null : entry.branch,
            head: typeof entry === 'string' ? null : entry.head,
            initialized: typeof entry === 'string' ? undefined : entry.initialized,
            workspaces: typeof entry === 'string' ? [] : entry.workspaces,
            // 激活虚拟库时不再把某个成员库的代码卡片标成选中：选中的是虚拟库，代码库只是成员
            active: !activeWorkspace && (typeof entry === 'string' ? entry : entry.path) === repo?.path,
            busy: (typeof entry === 'string' ? entry : entry.path) === switchingRepo,
            onSelect: onSelectRepo,
            onRemove: onRemoveRepo,
          })),
          h(AddTargetCard, {
            key: '__add__',
            busy: Boolean(switchingRepo),
            onAddRepo,
            onAddWorkspace: onNewWorkspace,
          }),
        ]),
      )
      : null,
  )
}

/**
 * 一条流程 = 一行。整行可点、hover 浅底、hover 不位移；
 * 进度列固定宽度让多行的数字对齐（tnum），列表直接看流程走到哪一步，而不是任务勾选数。
 */
function FlowRow({ item, session, selected, last, onClick, onOpenReport }) {
  const [hovered, setHovered] = useState(false)
  const tokens = scopeTokens(item)
  // 列表展示的是「流程进度」：按阶段走到第几步；开发任务完成与否不再单独占一列
  const flowDone = item?.status === 'done' || item?.stage === 'done'
  const pending = pendingFlowStep(item)
  const stages = item?.gitRepo === false || item?.intent === 'analysis'
    ? WORKFLOW_STAGES.filter((entry) => entry.id !== 'submit')
    : WORKFLOW_STAGES
  const stageIndex = stages.findIndex((entry) => entry.id === item?.stage)
  const currentStep = flowDone ? stages.length : stageIndex >= 0 ? stageIndex + 1 : 0
  // running 优先取会话实时状态；Host 的 /state items 也补了 running，旧会话状态未到时兜底。
  const running = Boolean(session?.running ?? item?.running)
  // 列表也去重：状态与阶段文案相同（开发中/已完成）时只显示一次
  const stageLabel = stageText(item?.stage)
  const statusLabel = STATUS_LABELS[item?.status] ?? item?.status ?? ''
  const showStageTag = stageLabel !== statusLabel
  return h('div', {
    role: 'button',
    tabIndex: 0,
    title: '点击查看该开发流程详情',
    onClick,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onClick?.()
      }
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: T.gap.sm,
      flexWrap: 'wrap',
      minHeight: 52,
      padding: '10px 16px 10px 13px',
      borderLeft: `3px solid ${selected ? T.brand : 'transparent'}`,
      borderBottom: last ? 'none' : `1px solid ${T.borderSoft}`,
      background: selected ? T.brandSoft : hovered ? T.surface2 : 'transparent',
      cursor: 'pointer',
      transition: T.transition,
    },
  },
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: '1 1 280px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h('span', { style: { fontWeight: 600, fontSize: T.font.base, color: T.text } }, item?.title || item?.id || '未命名开发流程'),
        running
          ? h('span', {
            key: 'running',
            title: '开发会话正在工作',
            style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: T.font.xs, fontWeight: 600, color: T.brand },
          },
            h(Spinner, { size: 10, tone: 'accent' }),
            '正在开发…',
          )
          : null,
        h(StatusPill, { status: item?.status }),
        showStageTag ? h(Tag, { tone: 'neutral' }, stageLabel) : null,
        // 流程类型：bug（先复现/定位）/ feature（先对齐范围）/ analysis（只读分析）
        item?.intent === 'bug'
          ? h(Tag, { tone: 'warn' }, 'bug')
          : item?.intent === 'analysis' ? h(Tag, { tone: 'accent', title: '只读分析：结论产出即结束，不进入提交' }, '分析') : null,
        // 标题还是用户输入/代码片段：点进去可一键自动生成
        item?.titleNeedsWork ? h(Tag, { tone: 'warn', title: '标题像原始输入或代码片段，进详情可自动生成' }, '标题待整理') : null,
        (item?.repos ?? []).length > 1 ? h(Tag, { tone: 'neutral' }, '多库') : null,
        item?.worktree?.branch
          ? h(Tag, { tone: 'accent', title: `独立工作区：${item.worktree.branch}` }, '独立工作区')
          : null,
        item?.attention ? h(Tag, { tone: item.attention.tone ?? 'warn' }, item.attention.label) : null,
      ),
      h(ScopeChips, { tokens }),
    ),
    h('div', { style: { flex: '0 0 176px', minWidth: 132 } },
      h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: T.font.xs, color: T.text4 } },
        h('span', null, '流程进度'),
        h('span', { style: { ...styles.num, color: T.text2, fontWeight: 600 }, title: '当前阶段 / 总阶段数' }, `${currentStep}/${stages.length}`),
      ),
      // 迷你阶段条：已完成=品牌色，当前=浅品牌，未开始=浅灰；流程 done 才整条变绿
      h('div', { style: { display: 'flex', gap: 2, marginTop: 4 } },
        stages.map((entry, index) => h('span', {
          key: entry.id,
          title: `${entry.label}${index + 1 < currentStep ? '（已完成）' : index + 1 === currentStep ? '（当前）' : '（未开始）'}`,
          style: {
            flex: '1 1 0',
            height: 4,
            borderRadius: 2,
            background: flowDone
              ? T.ok
              : index + 1 < currentStep
                ? T.brand
                : index + 1 === currentStep
                  ? T.brandBorder
                  : T.surface2,
          },
        })),
      ),
      h('div', {
        style: {
          marginTop: 3,
          fontSize: T.font.xs,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: flowDone ? T.ok : pending ? T.warnText : T.text4,
        },
        title: flowDone ? '流程已完成' : `当前：${stageText(item?.stage)}；还没完成：${pending ?? '还差测试/提交'}`,
      }, flowDone ? '流程已完成' : (pending ?? '流程未完成')),
    ),
    // 报告入口：不抢整行“进详情”的主点击，只在新标签打开完整报告。
    h(Button, {
      style: { height: 24, padding: '0 8px', fontSize: T.font.xs },
      title: '在新标签打开开发报告（目标背景 / 改动范围 / 测试报告）',
      onClick: (event) => {
        event.stopPropagation()
        ;(onOpenReport ?? openReportHtml)(item?.id)
      },
      // 键盘激活按钮时不要让事件冒泡回整行的 Enter/Space（否则会同时打开详情）。
      onKeyDown: (event) => event.stopPropagation(),
      children: '报告',
    }),
    // 会话状态列：只展示状态，不提供「进入会话」——开发统一走工作站标准流程，
    // 避免用户绕过流程直接介入对话（授权/审批等必须例外仍在详情里单独引导）。
    session
      ? h('div', { style: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
        h(SessionBadge, { session }),
        h('span', {
          style: { ...styles.num, fontSize: T.font.xs, color: T.text4 },
          title: '最近活动',
        }, sessionActivity(session)),
      )
      : null,
    h('div', { style: { ...styles.sectionHint, flex: '0 0 auto', minWidth: 118, textAlign: 'right' } }, fmtTime(item?.updatedAt)),
  )
}

function FlowList({ items, selectedId, sessionStates, onOpenItem, onRefresh, onNewFlow, onOpenReport, onFixTitles, fixingTitles = false, tabbed = false }) {
  const weakTitleCount = items.filter((entry) => entry?.titleNeedsWork).length
  return h('div', {
    id: 'devhub-flow-list',
    style: {
      ...styles.cardFlat,
      padding: 0,
      overflow: 'hidden',
      // 与上方项目管理卡无缝相接：上圆角去掉，顶边线就是 tab 栏的分隔线
      ...(tabbed
        ? { borderTopLeftRadius: 0, borderTopRightRadius: 0, position: 'relative', zIndex: 1 }
        : {}),
    },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap', padding: '10px 16px' } },
      h('span', { style: styles.sectionTitle }, '开发流程'),
      h(Tag, { tone: 'neutral' }, String(items.length)),
      h('div', { style: styles.spacer }),
      // 标题还是用户输入/代码片段：一键按已有目标整理（不调模型，立刻生效）
      weakTitleCount && onFixTitles
        ? h(Button, {
          style: miniButton,
          disabled: fixingTitles,
          title: `${weakTitleCount} 个流程的标题像原始输入/代码片段`,
          onClick: onFixTitles,
          children: fixingTitles ? '整理中…' : `整理标题 ${weakTitleCount}`,
        })
        : null,
      h(Button, { style: miniButton, onClick: onRefresh, children: '刷新' }),
    ),
    h('div', { style: { borderTop: `1px solid ${T.borderSoft}` } },
      items.length
        ? items.map((item, index) => h(FlowRow, {
          key: item.id,
          item,
          session: sessionForItem(sessionStates, item),
          selected: item.id === selectedId,
          last: index === items.length - 1,
          onClick: () => onOpenItem?.(item.id),
          onOpenReport,
        }))
        : h(EmptyState, {
          icon: '✎',
          title: '还没有开发流程',
          hint: '用一段话描述你要做什么：工作站会扫仓库、追问、自评计划，再确认范围。',
          action: h(Button, { primary: true, onClick: onNewFlow, children: '新建开发流程' }),
        }),
    ),
  )
}

function PairRow({ pair }) {
  const overlap = pair?.overlap ?? []
  const conflict = overlap.length > 0
  // 有重叠才用 warn 左边线块；无重叠只是一行灰字，避免整块“告警疲劳”。
  if (!conflict) {
    return h('div', { style: { ...styles.sectionHint, padding: '3px 0' } },
      `${pair?.a ?? '?'} ↔ ${pair?.b ?? '?'} · 无范围重叠`)
  }
  return h('div', { style: styles.warnCard },
    h('div', { style: { fontWeight: 600 } }, `${pair?.a ?? '?'} ↔ ${pair?.b ?? '?'}`),
    h('div', { style: { marginTop: 2 } }, `重叠范围：${overlap.map(scopeTokenLabel).join('、')}`),
    pair?.reason ? h('div', { style: { marginTop: 2 } }, `原因：${pair.reason}`) : null,
  )
}

function parallelSummary(parallel) {
  if (!parallel) return '正在读取…'
  const active = parallel.active ?? []
  const pairs = (parallel.pairs ?? []).filter((pair) => (pair.overlap ?? []).length)
  if (parallel.canParallel === false || pairs.length) {
    return `${active.length} 个进行中 · ${pairs.length} 处范围重叠`
  }
  return active.length ? `${active.length} 个进行中 · 无冲突` : '当前没有进行中的流程'
}

/**
 * 并行开发区：默认折叠。用原生 <details> 而不是 state，
 * 少一层重渲染；冲突时整个折叠块沿用 warn 边线（收起状态也看得到）。
 */
function ParallelSection({ parallel, error }) {
  const active = parallel?.active ?? []
  const pairs = (parallel?.pairs ?? []).filter((pair) => (pair.overlap ?? []).length)
  const conflict = !error && (parallel?.canParallel === false || pairs.length > 0)
  return h('details', {
    style: conflict
      ? { ...styles.warnCard, marginTop: 0, padding: '10px 12px' }
      : { ...styles.cardFlat, marginTop: 0, padding: '10px 12px' },
  },
    h('summary', {
      style: { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', listStyle: 'none' },
    },
      h('span', { style: { fontWeight: 600, color: conflict ? T.warnText : T.text } }, '并行开发'),
      error
        ? h(Tag, { tone: 'neutral' }, '暂不可用')
        : h(Tag, { tone: conflict ? 'warn' : 'ok' }, conflict ? '存在冲突，建议串行' : '可以并行'),
      h('span', { style: { ...styles.sectionHint, color: conflict ? T.warnText : T.text4 } },
        error ? `并行状态暂不可用：${error}` : parallelSummary(parallel)),
      h('div', { style: styles.spacer }),
      h('span', { style: { fontSize: T.font.sm, color: conflict ? T.warnText : T.brand } }, '展开/收起'),
    ),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.xs, marginTop: T.gap.xs } },
      active.length
        ? active.map((flow) => h('div', {
          key: flow?.id ?? flow?.title,
          style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '3px 0' },
        },
          h('span', { style: { fontWeight: 600, fontSize: T.font.base, color: T.text } }, flow?.title ?? flow?.id ?? '未命名'),
          h('span', { style: { ...styles.mono, color: T.text4 } }, flow?.id ?? '?'),
          h(StatusPill, { status: flow?.status }),
          h(Tag, { tone: 'neutral' }, stageText(flow?.stage)),
          scopeTokens(flow).length
            ? h('span', { style: styles.sectionHint }, scopeTokens(flow).slice(0, 3).map(scopeTokenLabel).join('、'))
            : null,
        ))
        : h('div', { style: styles.sectionHint }, '当前没有进行中的流程。'),
      pairs.length
        ? h('div', null,
          h('div', { style: { ...styles.sectionHint, marginBottom: 2 } }, '两两范围比对'),
          pairs.map((pair, index) => h(PairRow, { key: `${pair?.a ?? index}-${pair?.b ?? ''}`, pair })))
        : null,
      parallel?.advice
        ? h('div', { style: { ...styles.sectionHint, color: conflict ? T.warnText : T.text4 } }, `建议：${parallel.advice}`)
        : null,
      parallel?.canParallel === false
        ? h('div', { style: { fontSize: T.font.sm, fontWeight: 600, color: T.warnText } },
          '建议改为串行：冲突范围内的改动互相影响，串行执行更安全。')
        : null,
    ),
  )
}

export function HomeView(props) {
  const {
    state,
    items,
    selectedId,
    parallel,
    parallelError,
    sessionStates,
    onOpenItem,
    onRefresh,
    onFixTitles,
    fixingTitles = false,
    onSelectRepo,
    switchingRepo,
    onAddRepo,
    onScan,
    onNewFlow,
    onOpenClarifications,
    onOpenReport,
    onRemoveRepo,
    onSelectWorkspace,
    onEditWorkspace,
    onRemoveWorkspace,
    onNewWorkspace,
  } = props
  const repo = state?.repo ?? null
  const list = items ?? state?.items ?? []
  const wrapRef = useRef(null)
  // 选中目标卡 → 下方「开发流程」的连通线（tab 式）：用真实布局测量，窗口换行/切目标都不会错位
  const [tabLink, setTabLink] = useState(null)
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const measure = () => {
      const wrap = wrapRef.current
      const card = document.getElementById('devhub-active-target')
      const listNode = document.getElementById('devhub-flow-list')
      if (!wrap || !card || !listNode) {
        setTabLink((current) => (current ? null : current))
        return
      }
      const wrapRect = wrap.getBoundingClientRect()
      const cardRect = card.getBoundingClientRect()
      const listRect = listNode.getBoundingClientRect()
      const height = Math.round(listRect.top - cardRect.bottom + 2)
      if (height < 2) {
        setTabLink((current) => (current ? null : current))
        return
      }
      // 目标卡换行时，选中卡下面可能压着别的卡：线不穿卡，宁可不画
      const centerX = cardRect.left + cardRect.width / 2
      const blocked = [...document.querySelectorAll('[data-devhub-target-card]')].some((node) => {
        if (node === card) return false
        const rect = node.getBoundingClientRect()
        return rect.top >= cardRect.bottom - 2
          && rect.top < listRect.top
          && rect.left <= centerX
          && rect.right >= centerX
      })
      if (blocked) {
        setTabLink((current) => (current ? null : current))
        return
      }
      const next = {
        left: Math.round(cardRect.left - wrapRect.left + cardRect.width / 2 - 1),
        top: Math.round(cardRect.bottom - wrapRect.top - 1),
        height,
      }
      setTabLink((current) => (current && current.left === next.left && current.top === next.top && current.height === next.height
        ? current
        : next))
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver !== 'undefined' && wrapRef.current ? new ResizeObserver(measure) : null
    observer?.observe(wrapRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  })
  return h('div', { ref: wrapRef, style: { position: 'relative', display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
    // tab 连通线：从选中目标卡底部中央连到「开发流程」顶边
    tabLink
      ? h('span', {
        'aria-hidden': true,
        style: {
          position: 'absolute',
          left: tabLink.left,
          top: tabLink.top,
          width: 2,
          height: tabLink.height,
          borderRadius: 2,
          background: T.brand,
          zIndex: 5,
          pointerEvents: 'none',
        },
      })
      : null,
    h(ProjectBar, {
      repo,
      member: state?.profile?.member,
      // 优先用带 exists 的卡片数据；旧数据回退到路径数组
      repos: state?.profile?.repoCards ?? state?.profile?.repos,
      onRefresh,
      onSelectRepo,
      switchingRepo,
      onAddRepo,
      onScan,
      onNewFlow,
      onRemoveRepo,
      workspaces: state?.workspaces,
      activeWorkspace: state?.workspace,
      onSelectWorkspace,
      onEditWorkspace,
      onRemoveWorkspace,
      onNewWorkspace,
    }),
    // 首次进入/空工作区：需求澄清才是第一步，不要让用户先猜“新建流程”按钮在哪
    list.length === 0
      ? h('div', {
        style: {
          border: `1px solid ${T.brandBorder}`,
          borderRadius: T.rLg,
          background: `linear-gradient(135deg, ${T.brandSoft}, ${T.surface})`,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          h(IconSeat, { size: 30, tone: 'accent' }, '✧'),
          h('span', { style: { fontSize: T.font.md, fontWeight: 650, color: T.text } }, '从一次需求澄清开始'),
          h('span', { style: styles.sectionHint }, '不用先想流程；先说一句要做什么，工作站会扫仓库并追问。'),
        ),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          ['1. 描述要做什么', '2. 回答关键追问', '3. 确认计划并开工'].map((text) => h('span', {
            key: text,
            style: {
              height: 26,
              padding: '0 10px',
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 6,
              background: T.surface,
              border: `1px solid ${T.borderSoft}`,
              color: T.text2,
              fontSize: T.font.sm,
            },
          }, text)),
        ),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          h(Button, { primary: true, onClick: onNewFlow, children: '开始需求澄清' }),
          h(Button, { onClick: onOpenClarifications, children: '查看澄清会话' }),
        ),
      )
      : null,
    h(FlowList, {
      items: list,
      selectedId,
      sessionStates,
      onOpenItem,
      onRefresh,
      onNewFlow,
      onOpenReport,
      onFixTitles,
      fixingTitles,
    }),
    h(ParallelSection, { parallel, error: parallelError }),
  )
}