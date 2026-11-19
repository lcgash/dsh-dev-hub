/**
 * 设置页：自动化推进模式。
 *
 * 默认完全自动化：开发完成后自动开始评审，评审通过后自动跑本机自测、环境测试，
 * 到「待提交」停下；提交/推送仍保留人工确认。
 */
import { useEffect, useState } from 'react'
import { h } from './i18n.mjs'
import { API } from '../shared/api.mjs'
import { normalizeAutomation } from '../shared/automation.mjs'
import { Button, Pill, T, api, errorText, styles } from './common.mjs'

function OptionCard({ active, title, hint, children, onSelect }) {
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
    children ? h('div', { style: { marginTop: 2 } }, children) : null,
  )
}

export function AutomationSettings() {
  const [automation, setAutomation] = useState(() => normalizeAutomation(null))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    api(API.settings)
      .then((body) => { if (alive) setAutomation(normalizeAutomation(body?.automation)) })
      .catch((err) => { if (alive) setError(errorText(err)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  async function save(next = automation) {
    setSaving(true); setError(''); setNotice('')
    try {
      const body = await api(API.settings, { method: 'POST', body: JSON.stringify({ automation: next }) })
      setAutomation(normalizeAutomation(body?.automation ?? next))
      setNotice(next.mode === 'full'
        ? (next.reviewEnabled === false
          ? '已保存：完全自动化 + 已关闭独立评审，流程直接进入测试验证'
          : '已开启完全自动化：评审、本机自测、环境测试会按阶段自动推进，停在提交前')
        : '已切换为人工触发：每个节点都需要你确认')
    } catch (err) {
      setError(errorText(err))
    } finally { setSaving(false) }
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: T.gap.sm, padding: '14px 16px', maxWidth: 920 } },
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '自动化推进'),
      h('div', { style: { ...styles.sectionHint, marginTop: 4, lineHeight: 1.7 } },
        '控制工作站自己的推进动作：评审、本机自测、环境测试。提交与推送始终由你确认，默认不会自动改远端分支。'),
      loading
        ? h('div', { style: { ...styles.sectionHint, marginTop: 10 } }, '正在读取设置…')
        : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10, marginTop: 12 } },
          h(OptionCard, {
            active: automation.mode === 'full',
            title: '完全自动化（默认）',
            hint: '开发任务完成 → 自动开始评审；评审通过 → 自动跑本机自测 → 自动跑环境测试；到「待提交」停下。评审未通过仍会退回开发，不会自动改代码。',
            onSelect: () => setAutomation({ mode: 'full' }),
          }),
          h(OptionCard, {
            active: automation.mode === 'manual',
            title: '人工触发每个节点',
            hint: '评审、本机自测、环境测试都由你点按钮触发；工作站只提示下一步，不自动执行。',
            onSelect: () => setAutomation({ mode: 'manual' }),
          })),
      h('div', { style: { ...styles.card, marginTop: 10, padding: '12px 14px' } },
        h('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' } },
          h('input', {
            type: 'checkbox',
            checked: automation.reviewEnabled !== false,
            onChange: (event) => setAutomation((current) => ({ ...current, reviewEnabled: event.target.checked })),
            style: { marginTop: 3 },
          }),
          h('span', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
            h('span', { style: { fontSize: T.font.base, fontWeight: 600, color: T.text } }, '启用独立评审环节'),
            h('span', { style: { ...styles.sectionHint, lineHeight: 1.65 } },
              '默认开启。开启时按工程量决定评审强度（S 免评审，M 1 位，L/XL 2 位）；关闭后所有流程跳过独立评审，直接进入测试验证。已经失败的评审仍会保留，不会替你忽略。'),
          ),
        ),
      ),
      h('div', { style: { ...styles.row, marginTop: 14 } },
        h(Button, { primary: true, disabled: loading || saving, onClick: () => save(), children: saving ? '保存中…' : '保存设置' }),
        notice ? h('span', { style: { color: T.ok, fontSize: T.font.sm } }, notice) : null,
        error ? h('span', { style: { color: T.danger, fontSize: T.font.sm } }, `保存失败：${error}`) : null,
      ),
    ),
    h('div', { style: styles.infoCard },
      '说明：自动化在开发站打开并读取到流程状态时生效；开发会话还在跑时不会抢跑。默认完全自动化，但不会自动提交/推送。'),
  )
}
