/**
 * dsh-dev-hub 浏览器半 —— 「技能」页。
 *
 * 这里管理的是**工作站自带的通用 skills（规范包）**，不是 DSH 的 skill 文件：
 * - 安装 = 把技能包里的约束写进 <repo>/.dev-hub/conventions.json；
 * - 卸载 = 只移除该包带来的约束，不动其它包与自定义项；
 * - 自定义约束独立于技能包，可增删改；
 * - 「重新生成默认」按已安装集合重建，自定义项保留。
 *
 * 数据全部来自 GET/POST API.skills；本组件不碰 core/shared/host。
 * 取舍：所有写操作成功后统一再 GET 一次（Host 对 add/update/remove 只回约束数组），
 * 保证「已安装 / 技能库 / 约束明细」三块永远同源、不会出现半更新。
 */
import { useEffect, useState } from 'react'
import { h, confirmText } from './i18n.mjs'
import { API } from '../shared/api.mjs'
import {
  Button,
  EmptyState,
  IconSeat,
  Stat,
  Tag,
  T,
  api,
  errorText,
  fmtTime,
  styles,
} from './common.mjs'

/** 次要动作统一缩一号，和流程页保持一致。 */
const mini = { height: 24, padding: '0 8px', fontSize: T.font.sm }
const miniBig = { height: 28, padding: '0 10px', fontSize: T.font.sm }

const CHECK_KINDS = [
  { value: 'checklist', label: '清单核对' },
  { value: 'files', label: '文件范围' },
  { value: 'imports', label: '依赖方向' },
  { value: 'gate', label: '门禁命令' },
]

const CHECK_LABELS = Object.fromEntries(CHECK_KINDS.map((entry) => [entry.value, entry.label]))

function checkLabel(kind) {
  return CHECK_LABELS[kind] ?? kind ?? '清单核对'
}

function levelTone(level) {
  if (level === 'L0') return 'ok'
  if (level === 'L1') return 'accent'
  return 'neutral'
}

/** 前端框架标签：检测到多个时按检测顺序展示。 */
function frameworkLabel(view) {
  return (view?.frameworks ?? []).join(' / ') || '前端'
}

function emptyForm() {
  return { id: '', title: '', rule: '', kind: 'checklist', value: '', doc: '', gate: '' }
}

/** 约束按技能分组：内置按技能库顺序，自定义固定放最后。 */
function groupConstraints(constraints, view) {
  const bySkill = new Map()
  for (const constraint of constraints ?? []) {
    const skill = constraint.skill || 'custom'
    if (!bySkill.has(skill)) bySkill.set(skill, [])
    bySkill.get(skill).push(constraint)
  }
  const nameOf = (id) => (view?.installed ?? []).find((entry) => entry.id === id)?.name
    ?? (view?.catalog ?? []).find((entry) => entry.id === id)?.name
    ?? id
  const levelOf = (id) => (view?.installed ?? []).find((entry) => entry.id === id)?.level
    ?? (view?.catalog ?? []).find((entry) => entry.id === id)?.level
    ?? ''
  const order = new Map((view?.catalog ?? []).map((pack, index) => [pack.id, index]))
  return [...bySkill.entries()]
    .map(([skill, items]) => ({
      skill,
      custom: skill === 'custom',
      name: skill === 'custom' ? '自定义' : nameOf(skill),
      level: skill === 'custom' ? '' : levelOf(skill),
      items,
    }))
    .sort((a, b) => {
      if (a.custom !== b.custom) return a.custom ? 1 : -1
      return (order.get(a.skill) ?? 999) - (order.get(b.skill) ?? 999)
    })
}

/**
 * @param {{
 *   initialView?: object | null,
 *   initialRepo?: { name?: string, path?: string } | null,
 *   initialWorkspace?: { name?: string, repos?: string[], path?: string } | null,
 * }} [props]
 *   initialView/initialRepo/initialWorkspace 只用于 SSR 冒烟与后续嵌入；DevHubPage 不传，组件自己 GET。
 */
export function SkillsPanel({ initialView = null, initialRepo = null, initialWorkspace = null } = {}) {
  const [repo, setRepo] = useState(initialRepo)
  // 多库项目（多库项目）：规范技能写在多库项目本机独立目录，成员库不共享；页面顶部要说清楚。
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [view, setView] = useState(initialView)
  const [loading, setLoading] = useState(!initialView)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)

  /** silent=true 用于「刷新」按钮：不把整页切成 loading，只更新数据。 */
  async function loadAll({ silent = false } = {}) {
    if (!silent) setLoading(true)
    setError('')
    try {
      const state = await api(API.state)
      setRepo(state.repo ?? null)
      setWorkspace(state.workspace ?? null)
      if (!state.repo) { setView(null); return }
      setView(await api(API.skills))
    } catch (err) {
      setError(errorText(err))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (initialView) { setLoading(false); return }
    loadAll()
    // 只在挂载时拉一次；后续操作各自 refresh。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshSkills() {
    const next = await api(API.skills)
    setView(next)
    return next
  }

  /** 所有写操作的统一出口：POST → 重新 GET（三块数据同源）→ notice。 */
  async function runPost(payload, successText) {
    setBusy(true); setError(''); setNotice('')
    try {
      const body = await api(API.skills, { method: 'POST', body: JSON.stringify(payload) })
      await refreshSkills()
      setNotice(typeof successText === 'function' ? successText(body) : successText)
      return body
    } catch (err) {
      setError(errorText(err))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function install(pack) {
    const added = Number(pack?.constraints ?? 0)
    await runPost({ action: 'install', skillId: pack.id }, (body) => (
      body?.changed === false
        ? (view?.firstRun
          // 首次没有 conventions 时 Host 会按默认集合一次性落盘（L0 + 语言 L1），所以可能显示“已在列表中”。
          ? `已生成默认规范（${pack.name} 属于推荐集合，其余推荐技能包也一并写入）`
          : `${pack.name} 已在安装列表中`)
        : `已安装 ${pack.name}（+${added} 条约束）`
    ))
  }

  async function uninstall(skill) {
    if (!confirmText(`卸载「${skill.name}」？\n\n只移除该技能带来的约束，不改自定义项。`)) return
    const removed = Number(skill?.constraints ?? 0)
    await runPost({ action: 'uninstall', skillId: skill.id }, (body) => (
      body?.changed === false ? `${skill.name} 未安装` : `已卸载 ${skill.name}（-${removed} 条约束）`
    ))
  }

  async function regenerate() {
    if (!confirmText('按当前已安装技能重建约束？\n\n自定义约束会保留；内置约束的手工改动会被覆盖。')) return
    await runPost({ action: 'regenerate' }, '已按当前安装集合重建默认规范')
  }

  /** 首次没有 conventions.json：Host 对首个写动作会自动按默认集合落盘，这里按推荐技能显式走一遍。 */
  async function installRecommended() {
    setBusy(true); setError(''); setNotice('')
    try {
      await api(API.skills, { method: 'POST', body: JSON.stringify({ action: 'install', skillId: 'core-discipline' }) })
      await api(API.skills, { method: 'POST', body: JSON.stringify({ action: 'install', skillId: 'generic-quality' }) })
      const next = await refreshSkills()
      setNotice(`已生成推荐规范：L0 纪律 + 当前语言（${next?.profile ?? 'generic'}）对应的 L1 技能包${next?.frontend ? ` + 前端原型设计规范（${frameworkLabel(next)}）` : ''}（共 ${next?.installed?.length ?? 0} 个）。`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function removeConstraint(constraint) {
    if (!confirmText(`删除自定义约束「${constraint.title}」？`)) return
    await runPost({ action: 'removeConstraint', id: constraint.id }, `已删除约束「${constraint.title}」`)
  }

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm())
    setFormOpen(true)
    setError(''); setNotice('')
  }

  function openEdit(constraint) {
    setEditingId(constraint.id)
    setForm({
      id: constraint.id,
      title: constraint.title ?? '',
      rule: constraint.rule ?? '',
      kind: constraint.check?.kind ?? 'checklist',
      value: constraint.check?.value ?? '',
      doc: constraint.doc ?? '',
      gate: constraint.gate ?? '',
    })
    setFormOpen(true)
    setError(''); setNotice('')
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submitForm() {
    const payload = {
      id: form.id.trim(),
      title: form.title.trim(),
      rule: form.rule.trim(),
      check: { kind: form.kind, value: form.value.trim() },
      doc: form.doc.trim(),
      gate: form.gate.trim(),
    }
    if (!editingId && !payload.id) { setError('请填写约束 id（字母/数字/-/_）'); return }
    if (!payload.title || !payload.rule) { setError('请填写约束标题与规则内容'); return }
    if (editingId) {
      const body = await runPost(
        { action: 'updateConstraint', constraint: { ...payload, id: editingId } },
        `已更新约束「${payload.title || editingId}」`,
      )
      if (body) closeForm()
    } else {
      const body = await runPost(
        { action: 'addConstraint', constraint: payload },
        `已新增自定义约束「${payload.title || payload.id}」`,
      )
      if (body) closeForm()
    }
  }

  /* ------------------------------------------------------------- 小组件 */

  function field(label, node, hint) {
    return h('label', { style: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 } },
      h('span', { style: { fontSize: T.font.sm, fontWeight: 500, color: T.text3 } }, label),
      node,
      hint ? h('span', { style: { fontSize: T.font.xs, color: T.text4 } }, hint) : null,
    )
  }

  function levelTag(level) {
    return level ? h(Tag, { tone: levelTone(level) }, level) : null
  }

  function renderTopBar() {
    const workspaceRepos = workspace?.repos ?? []
    return h('div', { style: { ...styles.cardFlat, display: 'flex', alignItems: 'center', gap: T.gap.sm, flexWrap: 'wrap' } },
      h(IconSeat, { size: 32 }, '◈'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 280px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 } },
          h('span', {
            style: { fontSize: T.font.md, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            title: workspace
              ? `多库项目「${workspace.name ?? '未命名'}」：${workspaceRepos.length} 个代码库；规范技能只写入本机 ${workspace.path ?? workspace.localPath ?? '—'}`
              : repo?.path ?? '',
          }, workspace
            ? `多库项目 · ${workspace.name ?? '未命名'}`
            : (repo ? `项目 · ${repo.name ?? repo.path ?? '未命名'}` : '未选择项目')),
          workspace ? h(Tag, { tone: 'accent' }, `${workspaceRepos.length} 库`) : null,
          workspace ? h(Tag, { tone: 'neutral', title: '多库项目本机独立目录（不是任何成员库）' }, '本机规范') : null,
        ),
        workspace
          ? h('span', { style: styles.sectionHint },
            `多库项目的成员库不共享规范：技能与约束只写入多库项目本机目录 ${workspace.path ?? workspace.localPath ?? '—'}`)
          : null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          h('span', { style: styles.sectionHint }, '规范文件'),
          h('span', { style: { ...styles.mono, color: T.text4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, view?.path ?? '.dev-hub/conventions.json'),
          view?.profile ? h(Tag, { tone: 'neutral' }, view.frontend ? `${view.profile} · ${frameworkLabel(view)}` : `${view.profile} 仓库`) : null,
        ),
      ),
      h('div', { style: styles.spacer }),
      h(Button, { style: miniBig, disabled: busy || loading || !view, onClick: regenerate, children: '重新生成默认' }),
      h(Button, { style: miniBig, disabled: busy || loading, onClick: () => loadAll({ silent: true }), children: '刷新' }),
    )
  }

  function renderStats() {
    const installed = view?.installed ?? []
    const constraints = view?.constraints ?? []
    const custom = constraints.filter((constraint) => constraint.skill === 'custom').length
    return h('div', { style: { ...styles.cardFlat, display: 'flex', gap: T.gap.lg, flexWrap: 'wrap' } },
      h(Stat, { label: '已安装技能', value: installed.length, hint: 'L0 + 语言/前端包' }),
      h(Stat, { label: '约束总数', value: constraints.length, hint: '内置 + 自定义' }),
      h(Stat, { label: '自定义约束', value: custom, hint: '仅本仓库' }),
    )
  }

  /**
   * 已有规范文件的前端仓库：内置包不会被自动改写，但要把「可以补装」这件事显式说出来，
   * 否则前端仓库（尤其换人/升级后）根本发现不了这个包。
   */
  function recommendedPacks() {
    if (!view?.frontend || view.firstRun) return []
    return (view.catalog ?? []).filter((pack) => (pack.autoInstall ?? []).includes('frontend') && !pack.installed)
  }

  function renderRecommendation() {
    const packs = recommendedPacks()
    if (!packs.length) return null
    return h('div', { style: styles.infoCard },
      h('div', { style: styles.spread },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
          h('span', { style: { fontWeight: 600, fontSize: T.font.base, color: T.text } },
            `检测到前端框架（${frameworkLabel(view)}），建议补装前端原型规范`),
          h('span', { style: styles.sectionHint },
            '已有规范文件不会被自动改写；补装只追加该技能包的约束，之后可随时卸载。'),
        ),
        h('div', { style: styles.row },
          packs.map((pack) => h(Button, {
            key: pack.id,
            primary: true,
            disabled: busy,
            onClick: () => install(pack),
            children: busy ? '安装中…' : `安装 ${pack.name}`,
          })),
        ),
      ),
    )
  }

  function renderEmpty() {
    const language = view?.profile ?? 'generic'
    const hint = view?.frontend
      ? `首次生成会装入 L0 通用纪律 + 当前语言（${language}）的 L1 技能包；检测到前端框架（${frameworkLabel(view)}）后会再加上「前端原型设计规范」，写入 ${view?.path ?? '.dev-hub/conventions.json'}。`
      : `首次生成会装入 L0 通用纪律 + 当前语言（${language}）对应的 L1 技能包，写入 ${view?.path ?? '.dev-hub/conventions.json'}。`
    return h('div', { style: styles.cardFlat },
      h(EmptyState, {
        icon: '◈',
        title: '仓库还没有生成规范文件',
        hint,
        action: h(Button, { primary: true, disabled: busy, onClick: installRecommended, children: busy ? '生成中…' : '安装推荐技能' }),
      }),
    )
  }

  function renderInstalled() {
    const installed = view?.installed ?? []
    return h('div', { style: { ...styles.cardFlat, padding: 0, overflow: 'hidden' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap', padding: '10px 14px' } },
        h('span', { style: styles.sectionTitle }, '已安装'),
        h(Tag, { tone: 'neutral' }, String(installed.length)),
        h('div', { style: styles.spacer }),
        h('span', { style: styles.sectionHint }, '卸载只移除该技能带来的约束，不改自定义项'),
      ),
      h('div', { style: { borderTop: `1px solid ${T.borderSoft}` } },
        installed.length
          ? installed.map((skill) => h('div', {
            key: skill.id,
            style: { display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap', padding: '10px 14px', borderBottom: `1px solid ${T.borderSoft}` },
          },
            h('span', { style: { fontWeight: 600, fontSize: T.font.base, color: T.text } }, skill.name ?? skill.id),
            levelTag(skill.level),
            h('span', { style: { ...styles.num, fontSize: T.font.xs, color: T.text4 } }, `${Number(skill.constraints ?? 0)} 条约束`),
            skill.installedAt ? h('span', { style: styles.sectionHint }, `安装于 ${fmtTime(skill.installedAt)}`) : null,
            h('div', { style: styles.spacer }),
            h(Button, { style: mini, disabled: busy, onClick: () => uninstall(skill), children: '卸载' }),
          ))
          : h('div', { style: { padding: '12px 14px' } },
            h('span', { style: styles.sectionHint }, '还没有安装任何技能包。'),
          ),
      ),
    )
  }

  function renderCatalog() {
    const catalog = view?.catalog ?? []
    return h('div', { style: { ...styles.cardFlat, padding: 0, overflow: 'hidden' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap', padding: '10px 14px' } },
        h('span', { style: styles.sectionTitle }, '内置技能库'),
        h(Tag, { tone: 'neutral' }, String(catalog.length)),
        h('div', { style: styles.spacer }),
        h('span', { style: styles.sectionHint }, '按仓库语言给出可用技能包；前端包按 package.json 框架依赖自动判定，已安装的也列出便于对照'),
      ),
      h('div', { style: { borderTop: `1px solid ${T.borderSoft}` } },
        catalog.length
          ? catalog.map((pack) => h('div', {
            key: pack.id,
            style: { display: 'flex', alignItems: 'center', gap: T.gap.sm, flexWrap: 'wrap', padding: '10px 14px', borderBottom: `1px solid ${T.borderSoft}` },
          },
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 320px', minWidth: 0 } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                h('span', { style: { fontWeight: 600, fontSize: T.font.base, color: T.text } }, pack.name ?? pack.id),
                levelTag(pack.level),
                h('span', { style: { ...styles.num, fontSize: T.font.xs, color: T.text4 } }, `${Number(pack.constraints ?? 0)} 条约束`),
                (pack.appliesTo ?? []).length
                  ? h('span', { style: styles.sectionHint }, `适用 ${(pack.appliesTo ?? []).join(' / ')}`)
                  : null,
                (pack.autoInstall ?? []).includes('frontend') && !pack.installed
                  ? h(Tag, { tone: view?.frontend ? 'accent' : 'neutral' }, view?.frontend ? '推荐安装' : '前端仓库默认装')
                  : null,
              ),
              pack.description ? h('span', { style: { ...styles.sectionHint, lineHeight: T.line } }, pack.description) : null,
            ),
            h(Button, {
              style: mini,
              primary: !pack.installed,
              disabled: busy || pack.installed,
              onClick: () => install(pack),
              children: pack.installed ? '已安装' : '安装',
            }),
          ))
          : h('div', { style: { padding: '12px 14px' } },
            h('span', { style: styles.sectionHint }, '当前语言没有可用的技能包。'),
          ),
      ),
    )
  }

  function renderConstraint(constraint) {
    return h('div', { key: constraint.id, style: { padding: '10px 14px', borderBottom: `1px solid ${T.borderSoft}` } },
      h('div', { style: styles.spread },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 } },
          h('span', { style: { fontWeight: 600, fontSize: T.font.base, color: T.text } }, constraint.title ?? constraint.id),
          h(Tag, { tone: 'neutral' }, checkLabel(constraint.check?.kind)),
          h('span', { style: { ...styles.mono, fontSize: T.font.xs, color: T.text4 } }, constraint.id),
        ),
        h('div', { style: styles.row },
          constraint.builtin ? null : h(Button, { style: mini, disabled: busy, onClick: () => openEdit(constraint), children: '编辑' }),
          constraint.builtin ? null : h(Button, { style: mini, disabled: busy, onClick: () => removeConstraint(constraint), children: '删除' }),
        ),
      ),
      // 规则直接完整展示（不用"查看/收起"——一条两三行，折叠反而多点一次）
      h('div', {
        style: {
          marginTop: 4,
          fontSize: T.font.sm,
          lineHeight: T.line,
          color: T.text2,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        },
      }, constraint.rule ?? ''),
      (constraint.doc || constraint.gate)
        ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 } },
          constraint.doc ? h('span', { style: { ...styles.mono, fontSize: T.font.xs, color: T.text4 } }, `doc: ${constraint.doc}`) : null,
          constraint.gate ? h('span', { style: { ...styles.mono, fontSize: T.font.xs, color: T.text4 } }, `gate: ${constraint.gate}`) : null,
        )
        : null,
    )
  }

  function renderConstraints() {
    const constraints = view?.constraints ?? []
    const groups = groupConstraints(constraints, view)
    return h('div', { style: { ...styles.cardFlat, padding: 0, overflow: 'hidden' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: T.gap.xs, flexWrap: 'wrap', padding: '10px 14px' } },
        h('span', { style: styles.sectionTitle }, '约束明细'),
        h(Tag, { tone: 'neutral' }, String(constraints.length)),
        h('div', { style: styles.spacer }),
        h('span', { style: styles.sectionHint }, '内置项随技能包安装/卸载；自定义项可编辑/删除'),
      ),
      h('div', { style: { borderTop: `1px solid ${T.borderSoft}` } },
        groups.length
          ? groups.map((group) => h('div', { key: group.skill },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 14px', background: T.surface2 } },
              h('span', { style: { fontWeight: 600, fontSize: T.font.sm, color: T.text2 } }, group.name),
              group.custom ? null : levelTag(group.level),
              h('span', { style: { ...styles.num, fontSize: T.font.xs, color: T.text4 } }, `${group.items.length} 条`),
              h('span', { style: styles.sectionHint }, group.custom ? '仅本仓库' : '内置技能包'),
            ),
            group.items.map((constraint) => renderConstraint(constraint)),
          ))
          : h('div', { style: { padding: '12px 14px' } },
            h('span', { style: styles.sectionHint }, '还没有约束；安装技能包或新增自定义约束。'),
          ),
      ),
    )
  }

  function renderForm() {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm, marginTop: T.gap.xs } },
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: T.gap.sm } },
        field('约束 id', h('input', {
          style: styles.input,
          value: form.id,
          disabled: Boolean(editingId),
          placeholder: '例如：team-rule（字母/数字/-/_）',
          onChange: (event) => setField('id', event.target.value),
        }), editingId ? '编辑时不可改 id' : '自定义约束的唯一标识'),
        field('标题', h('input', {
          style: styles.input,
          value: form.title,
          placeholder: '例如：团队评审必须双人',
          onChange: (event) => setField('title', event.target.value),
        })),
      ),
      field('规则内容', h('textarea', {
        style: { ...styles.textarea, minHeight: 64 },
        value: form.rule,
        placeholder: '写清「什么情况算违反、应该怎么做」',
        onChange: (event) => setField('rule', event.target.value),
      })),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: T.gap.sm } },
        field('核对方式', h('select', {
          style: styles.input,
          value: form.kind,
          onChange: (event) => setField('kind', event.target.value),
        }, CHECK_KINDS.map((kind) => h('option', { key: kind.value, value: kind.value }, kind.label)))),
        field('核对参数', h('input', {
          style: styles.input,
          value: form.value,
          placeholder: '例如：src/** 或 package-check',
          onChange: (event) => setField('value', event.target.value),
        }), '可留空'),
      ),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: T.gap.sm } },
        field('文档路径 doc', h('input', {
          style: styles.input,
          value: form.doc,
          placeholder: 'docs/code-guide/…（可留空）',
          onChange: (event) => setField('doc', event.target.value),
        })),
        field('门禁命令 gate', h('input', {
          style: styles.input,
          value: form.gate,
          placeholder: 'sh scripts/check.sh（可留空）',
          onChange: (event) => setField('gate', event.target.value),
        })),
      ),
      h('div', { style: styles.row },
        h(Button, { primary: true, disabled: busy, onClick: submitForm, children: busy ? '保存中…' : (editingId ? '保存约束' : '新增约束') }),
        h(Button, { style: mini, disabled: busy, onClick: closeForm, children: '取消' }),
      ),
    )
  }

  function renderFormCard() {
    return h('div', { style: styles.cardFlat },
      h('div', { style: styles.spread },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          h('div', { style: styles.sectionTitle }, editingId ? `编辑约束 · ${editingId}` : '自定义约束'),
          h('div', { style: styles.sectionHint }, '自定义项独立于技能包，卸载技能或重建默认都不会删除它'),
        ),
        formOpen ? null : h(Button, { style: mini, disabled: busy, onClick: openAdd, children: '新增自定义约束' }),
      ),
      formOpen ? renderForm() : null,
    )
  }

  /* --------------------------------------------------------------- 组装 */

  if (loading) return h('div', { style: { ...styles.sectionHint, padding: '8px 0' } }, '正在读取技能与规范…')
  if (!repo) {
    return h('div', { style: styles.cardFlat },
      h(EmptyState, {
        icon: '◈',
        title: '还没有选择项目',
        hint: '请先到「流程」页完成项目初始化，再回来管理技能与约束。',
      }),
    )
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm } },
    renderTopBar(),
    error ? h('div', { style: styles.dangerCard }, error) : null,
    notice ? h('div', { style: styles.infoCard }, notice) : null,
    renderRecommendation(),
    renderStats(),
    view?.firstRun ? renderEmpty() : renderInstalled(),
    renderCatalog(),
    view?.firstRun ? null : renderConstraints(),
    view?.firstRun ? null : renderFormCard(),
  )
}