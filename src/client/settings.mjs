/**
 * 设置页：左侧分类、右侧内容，方便后续持续增加开关。
 *
 * 当前只有「自动化推进」和「独立评审」；保存后写入本机 profile，
 * 不写仓库、不影响其他开发者。
 */
import { useEffect, useState } from 'react'
import { h } from './i18n.mjs'
import { API } from '../shared/api.mjs'
import { normalizeAutomation } from '../shared/automation.mjs'
import { SkillsPanel } from './skills.mjs'
import { Button, Pill, T, api, errorText, styles } from './common.mjs'

function OptionCard({ active, title, hint, onSelect }) {
  return h('button', {
    type: 'button',
    onClick: onSelect,
    style: {
      textAlign: 'left',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '14px 16px',
      border: `1px solid ${active ? T.brand : T.borderSoft}`,
      borderRadius: T.rLg,
      background: active ? T.brandSoft : T.surface,
      color: T.text,
      cursor: 'pointer',
      fontFamily: 'inherit',
      boxShadow: active ? `0 0 0 2px rgba(96,73,231,.10)` : T.shadowCard,
    },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      h('span', { style: { fontSize: T.font.base, fontWeight: 650 } }, title),
      active ? h(Pill, { tone: 'accent' }, '当前') : null),
    h('div', { style: { ...styles.sectionHint, lineHeight: 1.65 } }, hint),
  )
}

function SettingRow({ title, hint, children }) {
  return h('div', { style: { ...styles.card, padding: '14px 16px' } },
    h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' } },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 420px', minWidth: 0 } },
        h('span', { style: { fontSize: T.font.base, fontWeight: 600, color: T.text } }, title),
        h('span', { style: { ...styles.sectionHint, lineHeight: 1.7 } }, hint)),
      h('div', { style: { flex: '0 0 auto' } }, children)),
  )
}

function NavButton({ active, children, onClick }) {
  return h('button', {
    type: 'button',
    onClick,
    style: {
      width: '100%',
      textAlign: 'left',
      padding: '9px 10px',
      border: 'none',
      borderRadius: T.rBase,
      background: active ? T.brandSoft : 'transparent',
      color: active ? T.brand : T.text2,
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: T.font.sm,
      fontWeight: active ? 600 : 500,
    },
  }, children)
}

export function AutomationSettings({ initialSection = 'automation' } = {}) {
  const [automation, setAutomation] = useState(() => normalizeAutomation(null))
  const [repo, setRepo] = useState(null)
  const [section, setSection] = useState(initialSection === 'skills' ? 'skills' : 'automation')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let alive = true
    api(API.settings)
      .then((body) => { if (alive) { setAutomation(normalizeAutomation(body?.automation)); setRepo(body?.repo ?? null) } })
      .catch((err) => { if (alive) setLoadError(errorText(err)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  async function save(next = automation) {
    setSaving(true); setSaveError(''); setNotice('')
    try {
      const body = await api(API.settings, { method: 'POST', body: JSON.stringify({ automation: next }) })
      setAutomation(normalizeAutomation(body?.automation ?? next))
      const baseNotice = next.mode === 'full'
        ? (next.reviewEnabled === false
          ? '已保存：完全自动化 + 已关闭独立评审，流程直接进入测试验证'
          : '已保存：评审、本机自测、环境测试会自动推进，停在提交前')
        : '已保存：每个节点都需要你手动触发'
      const warnings = Array.isArray(body?.warnings) ? body.warnings : []
      setNotice(warnings.length ? `${baseNotice}；部分流程未更新：${warnings.slice(0, 3).join('；')}` : baseNotice)
    } catch (err) {
      setSaveError(errorText(err))
    } finally { setSaving(false) }
  }

  const sections = [
    { id: 'automation', label: '自动化推进' },
    { id: 'review', label: '独立评审' },
    { id: 'skills', label: '技能' },
  ]
  const current = sections.find((entry) => entry.id === section) ?? sections[0]

  return h('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(150px, 190px) minmax(0, 1fr)',
      gap: T.gap.md,
      alignItems: 'start',
      padding: '16px 18px',
      maxWidth: 1180,
    },
  },
    h('aside', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        position: 'sticky',
        top: 12,
      },
    },
      h('div', { style: { ...styles.sectionTitle, padding: '0 10px 6px' } }, '设置'),
      sections.map((entry) => h(NavButton, {
        key: entry.id,
        active: section === entry.id,
        onClick: () => setSection(entry.id),
      }, entry.label)),
    ),
    h('main', { style: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 } },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' } },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 360px' } },
          h('div', { style: { fontSize: T.font.md, fontWeight: 650, color: T.text } }, current.label),
          h('div', { style: styles.sectionHint },
            current.id === 'automation'
              ? `控制当前项目（${repo?.name ?? '当前项目'}）的推进动作；提交与推送始终由你确认。`
              : current.id === 'skills'
                ? `管理当前项目（${repo?.name ?? '当前项目'}）的技能包与约束。`
                : '控制是否引入独立评审，以及按规模选择评审强度。')),
        current.id === 'skills'
          ? null
          : h(Button, { primary: true, disabled: loading || saving, onClick: () => save(), children: saving ? '保存中…' : '保存设置' }),
      ),
      loadError ? h('div', { style: styles.dangerCard }, `读取设置失败：${loadError}`) : null,
      saveError ? h('div', { style: styles.dangerCard }, `保存失败：${saveError}`) : null,
      notice ? h('div', { style: styles.infoCard }, notice) : null,

      section === 'skills'
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          h(SkillsPanel))
        : section === 'automation'
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          loading
            ? h('div', { style: { ...styles.sectionHint, padding: '10px 2px' } }, '正在读取设置…')
            : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 } },
              h(OptionCard, {
                active: automation.mode === 'full',
                title: '完全自动化（默认）',
                hint: '开发任务完成 → 自动开始评审；评审通过 → 自动跑本机自测 → 自动跑环境测试；到「待提交」停下。',
                onSelect: () => setAutomation((currentValue) => ({ ...currentValue, mode: 'full' })),
              }),
              h(OptionCard, {
                active: automation.mode === 'manual',
                title: '人工触发每个节点',
                hint: '评审、本机自测、环境测试都由你点按钮触发；工作站只提示下一步。',
                onSelect: () => setAutomation((currentValue) => ({ ...currentValue, mode: 'manual' })),
              })),
          h('div', { style: styles.infoCard },
            automation.mode === 'full'
              ? '当前：自动开始评审、自动跑本机自测和环境测试，停在提交前；评审未通过仍会退回开发，不会自动改代码。'
              : '当前：每个节点都停下来等你点；工作站只给出下一步提示。'),
          h('div', { style: { ...styles.sectionHint, lineHeight: 1.7 } },
            '自动化在流程详情打开并读取到状态时生效；开发会话还在跑时不会抢跑。提交/推送始终手动确认。'),
        )
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          h(SettingRow, {
            title: '启用独立评审环节',
            hint: '开启时按工程量决定评审强度（S 免评审，M 1 位，L/XL 2 位）；关闭后所有流程跳过独立评审，直接进入测试验证。已经失败的评审仍会保留，不会替你忽略。',
            children: h('input', {
              type: 'checkbox',
              checked: automation.reviewEnabled !== false,
              disabled: loading,
              onChange: (event) => setAutomation((currentValue) => ({ ...currentValue, reviewEnabled: event.target.checked })),
              style: { width: 18, height: 18, marginTop: 2, cursor: loading ? 'default' : 'pointer' },
            }),
          }),
          h('div', { style: styles.infoCard },
            automation.reviewEnabled === false
              ? '当前：独立评审已关闭；开发完成后直接进入测试验证。'
              : '当前：独立评审已开启；小改动仍会按规模自动免评审，中大改动保留评审。'),
        ),
    ),
  )
}
