/**
 * dsh-dev-hub 浏览器半 —— 新建开发流程向导。
 *
 * 步骤：要开发什么（describe）→ 流程名称（name）→ 代码目录与模块（scope），
 * 首次开发（GET API.wizard 返回 firstRun 且 conventions 为 null）时在 create 之前
 * 插入「初始化仓库规范」（bootstrap）步骤。
 *
 * 全部数据走 src/shared/api.mjs 的 API.wizard / API.modules 契约；Host 路由由
 * Lead 并行实现，这里只按契约调用，不做任何本地 mock。
 */
import { useEffect, useMemo, useState } from 'react'
import { h } from './i18n.mjs'
import { API } from '../shared/api.mjs'
import { suggestFlowTitle } from '../shared/requirement.mjs'
import { WIZARD_STEP_LABELS, WIZARD_STEPS } from '../shared/wizard.mjs'
import {
  Button,
  C,
  Pill,
  api,
  errorText,
  joinLines,
  moduleToken,
  scopeTokenLabel,
  splitLines,
  styles,
  uniqueTokens,
} from './common.mjs'

const STEP_ORDER = ['describe', 'name', 'scope']

/** 与 Host 侧 safeId 同口径：允许小写字母、数字与中文，其余折叠为 `-`。 */
function safeId(input, fallback = '') {
  const slug = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || fallback
}

/** Host `action:'describe'` 不可用时的本地兜底命名（取描述首行）。 */
function localSuggestion(description) {
  const text = String(description ?? '').trim()
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] ?? '新开发流程'
  // 不拿第一行原样当名字（常常是代码/注解），先按"做什么"概括一个短标题
  const name = suggestFlowTitle({ description: text, fallback: firstLine.slice(0, 30) })
    || (firstLine.length > 30 ? firstLine.slice(0, 30) : firstLine)
  // goal 留空：目标交给 Host 的需求规范化生成，不把客户原话预填进去
  return { name, id: safeId(name, `flow-${Date.now().toString(36)}`), goal: '' }
}

function stepMeta(id) {
  return WIZARD_STEPS.find((step) => step.id === id) ?? { id, label: id, hint: '' }
}

/** 把 ConventionsSummary 压成可确认的摘要；形状不确定时回落到原始 JSON。 */
function summarizeConventions(conventions) {
  const value = conventions && typeof conventions === 'object' ? conventions : {}
  const constraints = Array.isArray(value.constraints)
    ? value.constraints.length
    : value.constraints && typeof value.constraints === 'object'
      ? Object.keys(value.constraints).length
      : Array.isArray(value.rules) ? value.rules.length : null
  const rawCommands = value.commands ?? value.command ?? null
  const commandsList = Array.isArray(rawCommands)
    ? rawCommands.map((entry) => typeof entry === 'string'
      ? entry
      : `${entry?.name ?? entry?.id ?? '命令'}：${entry?.command ?? entry?.run ?? ''}`)
    : rawCommands && typeof rawCommands === 'object'
      ? Object.entries(rawCommands).map(([key, val]) => `${key}：${typeof val === 'string' ? val : (val?.command ?? JSON.stringify(val))}`)
      : []
  const modules = Array.isArray(value.modules)
    ? value.modules.length
    : value.modules && typeof value.modules === 'object'
      ? Object.keys(value.modules).length
      : null
  return { constraints, commandsList, modules }
}

export function NewFlowWizard({ state, onCreated }) {
  const [loading, setLoading] = useState(true)
  const [stepIndex, setStepIndex] = useState(0)
  const [description, setDescription] = useState('')
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [goal, setGoal] = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [scopeList, setScopeList] = useState([])
  const [scopeTouched, setScopeTouched] = useState(false)
  const [modules, setModules] = useState([])
  const [moduleProfile, setModuleProfile] = useState('')
  const [activeFlows, setActiveFlows] = useState([])
  const [firstRun, setFirstRun] = useState(false)
  const [conventions, setConventions] = useState(null)
  const [bootstrapSkipped, setBootstrapSkipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // 首次加载：GET API.wizard 决定是否插入 bootstrap 步骤；GET API.modules 拿建议列表。
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const meta = await api(API.wizard)
        if (!alive) return
        setFirstRun(Boolean(meta?.firstRun) && !meta?.conventions)
        setConventions(meta?.conventions ?? null)
        setActiveFlows(Array.isArray(meta?.active) ? meta.active : [])
        if (Array.isArray(meta?.modules) && meta.modules.length) setModules(meta.modules)
        const suggested = meta?.suggested ?? null
        if (suggested) {
          if (suggested.name) setName(suggested.name)
          if (suggested.id) setId(suggested.id)
          // 目标不再预填客户原话：留空由工作站规范化，或由用户自己写
        }
      } catch (err) {
        if (alive) setNotice(`未能读取向导初始化数据（${errorText(err)}），可继续手动填写。`)
      }
      try {
        const mods = await api(API.modules)
        if (!alive) return
        if (Array.isArray(mods?.modules)) setModules(mods.modules)
        setModuleProfile(String(mods?.profile ?? ''))
      } catch (err) {
        if (alive) setNotice((current) => current || `模块建议暂不可用（${errorText(err)}），请手动填写目录或 module:模块名。`)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  // 建议的模块默认勾选；用户一旦手动改过 scope 就不再覆盖。
  useEffect(() => {
    if (scopeTouched || !modules.length) return
    const pre = uniqueTokens(modules.filter((entry) => entry?.suggested).map(moduleToken).filter(Boolean))
    if (pre.length) setScopeList(pre)
  }, [modules, scopeTouched])

  const steps = useMemo(() => {
    const needBootstrap = firstRun && !conventions && !bootstrapSkipped
    return needBootstrap ? [...STEP_ORDER, 'bootstrap'] : [...STEP_ORDER]
  }, [firstRun, conventions, bootstrapSkipped])

  useEffect(() => {
    if (stepIndex > steps.length - 1) setStepIndex(steps.length - 1)
  }, [steps.length, stepIndex])

  const stepId = steps[Math.min(stepIndex, steps.length - 1)]
  const isLast = stepIndex >= steps.length - 1
  const repo = state?.repo ?? null
  const conventionsSummary = useMemo(() => summarizeConventions(conventions), [conventions])

  const conflicts = useMemo(() => {
    if (!scopeList.length || !activeFlows.length) return []
    return activeFlows.map((flow) => {
      const theirs = new Set([...(flow?.scope ?? []), ...(flow?.scopeModules ?? [])])
      const overlap = scopeList.filter((token) => theirs.has(token))
      return overlap.length ? { flow, overlap } : null
    }).filter(Boolean)
  }, [activeFlows, scopeList])

  function toggleId(value) {
    setIdTouched(true)
    setId(safeId(value))
  }

  function applyName(value) {
    setName(value)
    if (!idTouched) setId(safeId(value))
  }

  async function submitDescribe() {
    if (!description.trim()) {
      setError('请先用一段话说清要开发什么')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = await api(API.wizard, { method: 'POST', body: JSON.stringify({ action: 'describe', description }) })
      const suggested = body?.suggested ?? {}
      if (suggested.name) applyName(suggested.name)
      if (suggested.id) setId(safeId(suggested.id))
    } catch (err) {
      const suggested = localSuggestion(description)
      applyName(suggested.name)
      setId(suggested.id)
      setNotice(`自动命名接口暂不可用（${errorText(err)}），已按描述生成默认名称，可自行修改。`)
    } finally {
      setBusy(false)
      setStepIndex((current) => current + 1)
    }
  }

  function submitScope() {
    setError('')
    if (!scopeList.length && !window.confirm('还没有选择代码目录或模块，并行冲突将无法判定。确定继续？')) return
    setStepIndex((current) => current + 1)
  }

  function toggleModule(entry) {
    const token = moduleToken(entry)
    if (!token) return
    setScopeTouched(true)
    setScopeList((current) => current.includes(token) ? current.filter((item) => item !== token) : [...current, token])
  }

  async function runBootstrap() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = await api(API.wizard, { method: 'POST', body: JSON.stringify({ action: 'bootstrap' }) })
      setConventions(body?.conventions ?? null)
      setNotice('仓库规范已初始化：.dev-hub/conventions.json')
    } catch (err) {
      setError(`初始化仓库规范失败：${errorText(err)}`)
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    const trimmedName = name.trim()
    const flowId = safeId(id || trimmedName)
    if (!trimmedName) { setError('请填写流程名称'); return }
    if (!flowId) { setError('请填写合法的流程 id（小写字母、数字、中文或连字符）'); return }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = await api(API.wizard, {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          description,
          name: trimmedName,
          id: flowId,
          scope: scopeList,
          goal,
        }),
      })
      onCreated?.(body?.item ?? body, body)
    } catch (err) {
      setError(`创建开发流程失败：${errorText(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const currentMeta = stepMeta(stepId)

  function renderStep() {
    if (stepId === 'describe') {
      return h('div', null,
        h('div', { style: styles.label }, currentMeta.hint),
        h('textarea', {
          style: { ...styles.textarea, minHeight: 120 },
          placeholder: '例如：把关卡状态回传从同步改成异步，解决连接池被远端 IO 占满的问题……',
          value: description,
          onChange: (event) => setDescription(event.target.value),
        }),
        h('div', { style: styles.smallMuted }, '说清「要解决什么问题、谁受影响、成功标准」即可，名称稍后可以改。'),
      )
    }
    if (stepId === 'name') {
      return h('div', null,
        h('div', { style: styles.label }, '流程名称'),
        h('input', { style: styles.input, value: name, placeholder: '例如：状态回传异步化', onChange: (event) => applyName(event.target.value) }),
        h('div', { style: styles.label }, '流程 id（台账文件名，创建后不再改）'),
        h('input', { style: styles.input, value: id, placeholder: '例如：async-callback-status', onChange: (event) => toggleId(event.target.value) }),
        h('div', { style: styles.label }, '目标（可留空：工作站会按需求规范化生成）'),
        h('textarea', {
          style: styles.textarea,
          placeholder: '留空 = 由工作站把上面的需求整理成「做什么 + 为什么」；也可以自己写一句目标',
          value: goal,
          onChange: (event) => setGoal(event.target.value),
        }),
        h('div', { style: styles.smallMuted }, '客户原话会单独保存为「原始需求」，不会直接当成目标。'),
      )
    }
    if (stepId === 'scope') {
      return h('div', null,
        h('div', { style: styles.label }, currentMeta.hint),
        modules.length ? h('div', null,
          h('div', { style: styles.smallMuted }, `模块建议${moduleProfile ? `（profile：${moduleProfile}）` : ''}，点击勾选/取消：`),
          h('div', { style: { ...styles.row, marginTop: 6 } },
            modules.map((entry) => {
              const token = moduleToken(entry)
              const on = scopeList.includes(token)
              return h('span', {
                key: `${entry?.kind ?? 'dir'}:${token}`,
                style: on ? styles.chipOn : styles.chip,
                title: [entry?.path, entry?.role].filter(Boolean).join(' · '),
                onClick: () => toggleModule(entry),
              }, `${on ? '✓ ' : ''}${entry?.name ?? token}${entry?.role ? `（${entry.role}）` : ''}`)
            }),
          ),
        ) : h('div', { style: styles.smallMuted }, '暂无模块建议，请手动填写。'),
        h('div', { style: styles.label }, '代码目录与模块（一行一个；裸路径 = 目录，module:xxx = 模块名）'),
        h('textarea', {
          style: { ...styles.textarea, minHeight: 90 },
          placeholder: 'src/main/java/com/example/app/scheduler\nmodule:order-service\ntools/dsh-dev-hub/src/client',
          value: joinLines(scopeList),
          onChange: (event) => { setScopeTouched(true); setScopeList(splitLines(event.target.value)) },
        }),
        h('div', { style: styles.smallMuted }, `已选 ${scopeList.length} 项${scopeList.length ? '：' + scopeList.map(scopeTokenLabel).join('、') : ''}`),
        conflicts.length
          ? h('div', { style: styles.dangerCard },
            h('strong', null, '与开发中的流程存在范围重叠'),
            conflicts.map((entry) => h('div', { key: entry.flow?.id ?? entry.overlap.join(',') },
              `${entry.flow?.title ?? entry.flow?.id ?? '未命名流程'}（${entry.flow?.id ?? '?'}）：${entry.overlap.map(scopeTokenLabel).join('、')}`,
            )),
            h('div', { style: { marginTop: 6, fontWeight: 600 } }, '建议改为串行：等上述流程完成，或先把范围挪开再并行。'),
          )
          : h('div', { style: styles.okCard }, '与当前开发中的流程没有范围重叠，可以并行。'),
      )
    }
    // bootstrap
    return h('div', null,
      h('div', { style: styles.label }, currentMeta.hint),
      h('div', { style: styles.smallMuted }, '这一步会生成仓库级规范文件（.dev-hub/conventions.json），后续每个流程都复用它。'),
      conventions ? h('div', null,
        h('div', { style: styles.okCard },
          h('div', { style: { fontWeight: 600 } }, '仓库规范已就绪'),
          h('div', null, `约束条数：${conventionsSummary.constraints ?? '未知'}`),
          h('div', null, `命令数：${conventionsSummary.commandsList.length}`),
          h('div', null, `模块数：${conventionsSummary.modules ?? '未知'}`),
        ),
        conventionsSummary.commandsList.length ? h('div', { style: { marginTop: 8 } },
          h('div', { style: styles.label }, '可用命令'),
          conventionsSummary.commandsList.map((line) => h('div', { key: line, style: styles.smallMuted }, line)),
        ) : null,
        h('details', { style: { marginTop: 8 } },
          h('summary', { style: { cursor: 'pointer', color: C.muted } }, '查看完整 conventions JSON'),
          h('pre', { style: styles.pre }, JSON.stringify(conventions, null, 2)),
        ),
      ) : null,
      h('div', { style: { ...styles.row, marginTop: 10 } },
        h(Button, { primary: true, disabled: busy, onClick: runBootstrap, children: busy ? '初始化中…' : (conventions ? '重新初始化' : '初始化仓库规范') }),
        !conventions ? h(Button, {
          disabled: busy,
          onClick: () => { setBootstrapSkipped(true); setStepIndex(0) },
          children: '暂不初始化，返回修改范围',
        }) : null,
      ),
    )
  }

  return h('div', null,
    // 关闭按钮由外层 Modal 提供，这里只留标题与仓库标记（避免出现两个「关闭」）
    h('div', { style: styles.row },
      h('strong', null, '新建开发流程'),
      repo ? h(Pill, { tone: 'accent' }, repo.name) : null,
    ),
    h('div', { style: { ...styles.stepBar, marginTop: 10 } },
      steps.map((step, index) => h('span', {
        key: step,
        style: index === stepIndex ? styles.stepItemActive : (index < stepIndex ? styles.stepItemDone : styles.stepItem),
      }, `${index + 1}. ${WIZARD_STEP_LABELS[step] ?? stepMeta(step).label}`)),
    ),
    loading ? h('div', { style: styles.smallMuted }, '正在读取仓库与模块信息…') : null,
    renderStep(),
    h('div', { style: styles.divider }),
    h('div', { style: styles.smallMuted }, `流程：${name || '（未命名）'} · id：${id || '（未生成）'} · 范围 ${scopeList.length} 项`),
    h('div', { style: { ...styles.row, marginTop: 10 } },
      stepIndex > 0 ? h(Button, { disabled: busy, onClick: () => { setError(''); setStepIndex((current) => Math.max(0, current - 1)) }, children: '上一步' }) : null,
      stepId === 'describe'
        ? h(Button, { primary: true, disabled: busy, onClick: submitDescribe, children: busy ? '生成中…' : '下一步：流程名称' })
        : null,
      stepId === 'name'
        ? h(Button, { primary: true, disabled: busy, onClick: () => { setError(''); if (!name.trim()) { setError('请填写流程名称'); return } setStepIndex((current) => current + 1) }, children: '下一步：代码目录与模块' })
        : null,
      stepId === 'scope' && !isLast
        ? h(Button, { primary: true, disabled: busy, onClick: submitScope, children: '下一步：初始化仓库规范' })
        : null,
      stepId === 'bootstrap' && (conventions || bootstrapSkipped)
        ? h(Button, { primary: true, disabled: busy, onClick: create, children: busy ? '创建中…' : '创建并开始开发' })
        : null,
      stepId === 'scope' && isLast
        ? h(Button, { primary: true, disabled: busy, onClick: create, children: busy ? '创建中…' : '创建并开始开发' })
        : null,
      stepId === 'bootstrap' && !conventions && !bootstrapSkipped
        ? h('span', { style: styles.smallMuted }, '先完成初始化，或点「暂不初始化」返回上一步。')
        : null,
    ),
    error ? h('p', { style: { color: C.danger } }, error) : null,
    notice ? h('p', { style: styles.smallMuted }, notice) : null,
    h('div', { style: { ...styles.smallMuted, marginTop: 8 } }, '提示：create 成功后会自动打开该流程详情；Host 会返回 parallel 供并行冲突提示。'),
  )
}