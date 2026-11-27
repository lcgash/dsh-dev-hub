/**
 * 独立版首次进入引导（macOS 风格）。
 *
 * 目标不是“教程弹窗”，而是在用户第一次看到空工作区时回答三个问题：
 * 这是干什么的、我的电脑能不能跑、从哪个项目开始。
 * 视觉上使用系统字体、半透明材质、克制阴影和一次性入场动画；
 * 不堆动效，不遮挡键盘操作，尊重 prefers-reduced-motion。
 */
import { useEffect, useState } from 'react'
import { API } from '../shared/api.mjs'
import { h } from './i18n.mjs'
import { api, errorText } from './common.mjs'

const ONBOARD_KEY = 'dev-hub:standalone-onboarding:v1'

function storage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

export function isOnboardingDone() {
  try { return storage()?.getItem(ONBOARD_KEY) === 'done' } catch { return false }
}

export function markOnboardingDone() {
  try { storage()?.setItem(ONBOARD_KEY, 'done') } catch { /* 存不了就每次显示；不阻断使用 */ }
}

const M = {
  accent: 'var(--devhub-mac-accent, #0a84ff)',
  accentHover: 'var(--devhub-mac-accent-hover, #3395ff)',
  accentSoft: 'var(--devhub-mac-accent-soft, rgba(10,132,255,.12))',
  text: 'var(--devhub-mac-text, #1d1d1f)',
  secondary: 'var(--devhub-mac-secondary, #6e6e73)',
  tertiary: 'var(--devhub-mac-tertiary, #8e8e93)',
  card: 'var(--devhub-mac-card, rgba(255,255,255,.78))',
  cardSolid: 'var(--devhub-mac-card-solid, #ffffff)',
  border: 'var(--devhub-mac-border, rgba(60,60,67,.12))',
  soft: 'var(--devhub-mac-soft, rgba(60,60,67,.06))',
  danger: 'var(--devhub-mac-danger, #ff3b30)',
  ok: 'var(--devhub-mac-ok, #248a3d)',
  shadow: 'var(--devhub-mac-shadow, 0 24px 70px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.06))',
  font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Helvetica Neue", sans-serif',
}

function FeatureIcon({ kind }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (kind === 'scope') return h('svg', common, h('path', { d: 'M4 7h6l2 2h8v10H4z' }), h('path', { d: 'M8 13h8' }))
  if (kind === 'context') return h('svg', common, h('rect', { x: 5, y: 4, width: 14, height: 16, rx: 3 }), h('path', { d: 'M9 8h6M9 12h6M9 16h4' }))
  return h('svg', common, h('path', { d: 'M12 3.5 19 7v5c0 4.4-3 7.4-7 8.5-4-1.1-7-4.1-7-8.5V7z' }), h('path', { d: 'm9 12 2 2 4-4' }))
}

function BrandMark() {
  return h('div', {
    style: {
      width: 64, height: 64, borderRadius: 18, display: 'grid', placeItems: 'center',
      background: `linear-gradient(145deg, ${M.accent}, #5e5ce6)`,
      boxShadow: '0 10px 24px rgba(10,132,255,.28), inset 0 1px 0 rgba(255,255,255,.35)',
    },
  }, h('svg', { width: 34, height: 34, viewBox: '0 0 40 40', fill: 'none', stroke: '#fff', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    h('path', { d: 'M10 12l8 8-8 8M19 12l8 8-8 8' })))
}

function PrimaryButton({ children, onClick, disabled = false, type = 'button' }) {
  return h('button', {
    type,
    disabled,
    onClick: disabled ? undefined : onClick,
    style: {
      appearance: 'none', border: 'none', borderRadius: 12, padding: '0 22px', height: 44,
      background: disabled ? 'rgba(120,120,128,.18)' : M.accent,
      color: disabled ? M.tertiary : '#fff', font: `600 15px ${M.font}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: disabled ? 'none' : '0 6px 16px rgba(10,132,255,.22)',
      transition: 'background-color .18s ease, transform .12s ease, box-shadow .18s ease',
    },
    onPointerDown: disabled ? undefined : (event) => { event.currentTarget.style.transform = 'scale(.97)' },
    onPointerUp: disabled ? undefined : (event) => { event.currentTarget.style.transform = '' },
    onPointerLeave: disabled ? undefined : (event) => { event.currentTarget.style.transform = '' },
  }, children)
}

function TextButton({ children, onClick }) {
  return h('button', {
    type: 'button',
    onClick,
    style: {
      appearance: 'none', border: 'none', background: 'transparent', color: M.secondary,
      font: `500 13px ${M.font}`, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
    },
  }, children)
}

function Dots({ step, total = 3 }) {
  return h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
    Array.from({ length: total }, (_, index) => h('span', {
      key: index,
      style: {
        width: index === step ? 20 : 6, height: 6, borderRadius: 999,
        background: index === step ? M.accent : (index < step ? 'rgba(10,132,255,.45)' : 'rgba(60,60,67,.18)'),
        transition: 'width .28s cubic-bezier(.2,.8,.2,1), background-color .2s ease',
      },
    })))
}

function CapabilityRow({ label, detail, ok, pending = false }) {
  return h('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
      borderRadius: 12, background: M.soft,
    },
  },
    h('span', {
      style: {
        width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center',
        background: pending ? 'rgba(120,120,128,.14)' : (ok ? 'rgba(36,138,61,.14)' : 'rgba(255,59,48,.12)'),
        color: pending ? M.tertiary : (ok ? M.ok : M.danger), fontSize: 13, fontWeight: 700,
      },
    }, pending ? '…' : (ok ? '✓' : '!')),
    h('div', { style: { minWidth: 0, flex: '1 1 auto' } },
      h('div', { style: { font: `600 13px ${M.font}`, color: M.text } }, label),
      h('div', { style: { font: `400 12px ${M.font}`, color: M.secondary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, detail),
    ),
  )
}

function StepIntro({ onNext, onSkip }) {
  const features = [
    { kind: 'scope', title: '先定范围', text: '说清楚这次改什么、不改什么；溢出改动不会被混进来。' },
    { kind: 'context', title: '统一上下文', text: '把任务、约束、证据写成一个目录，Claude 读文件开工。' },
    { kind: 'review', title: '评审与证据', text: '独立评审、测试记录、交付报告，不让“做完了”只是一句话。' },
  ]
  return h('div', { key: 'intro', className: 'devhub-onboarding-step' },
    h(BrandMark, null),
    h('div', { style: { marginTop: 24, font: `600 12px/1 ${M.font}`, letterSpacing: '.08em', color: M.accent, textTransform: 'uppercase' } }, 'DevHub for Claude Code'),
    h('h1', {
      style: {
        margin: '10px 0 0', font: `700 clamp(34px, 5vw, 46px)/1.08 ${M.font}`,
        letterSpacing: '-0.035em', color: M.text, maxWidth: 620,
      },
    }, '把一句话需求，做成可交付的流程。'),
    h('p', {
      style: { margin: '14px 0 0', font: `400 16px/1.55 ${M.font}`, color: M.secondary, maxWidth: 560 },
    }, '你继续用 Claude Code 写代码。DevHub 负责范围、上下文、独立评审、测试证据和最后的报告。'),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 30 } },
      features.map((feature) => h('div', {
        key: feature.kind,
        style: { padding: '14px 14px 15px', borderRadius: 14, background: M.cardSolid, border: `1px solid ${M.border}`, boxShadow: '0 1px 2px rgba(0,0,0,.03)' },
      },
        h('span', { style: { color: M.accent, display: 'inline-flex' } }, h(FeatureIcon, { kind: feature.kind })),
        h('div', { style: { marginTop: 10, font: `650 13px ${M.font}`, color: M.text } }, feature.title),
        h('div', { style: { marginTop: 4, font: `400 12px/1.55 ${M.font}`, color: M.secondary } }, feature.text),
      ))),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 30, flexWrap: 'wrap' } },
      h(PrimaryButton, { onClick: onNext }, '开始使用'),
      h(TextButton, { onClick: onSkip }, '跳过引导，直接初始化'),
      h('span', { style: { marginLeft: 'auto', font: `400 11px ${M.font}`, color: M.tertiary } }, '本地运行 · 不上传代码'),
    ),
  )
}

function StepEnvironment({ capabilities, loading, error, onLoad, onNext, onBack }) {
  const engines = capabilities?.engines ?? {}
  return h('div', { key: 'environment', className: 'devhub-onboarding-step' },
    h('div', { style: { font: `600 12px ${M.font}`, letterSpacing: '.08em', color: M.accent, textTransform: 'uppercase' } }, '第 2 步 · 本机能力'),
    h('h1', { style: { margin: '10px 0 0', font: `700 clamp(30px, 4.5vw, 40px)/1.1 ${M.font}`, letterSpacing: '-0.03em', color: M.text } }, '先确认这台电脑能不能开工。'),
    h('p', { style: { margin: '12px 0 0', font: `400 15px/1.55 ${M.font}`, color: M.secondary } }, 'DevHub 不内置模型，也不保存 Claude 凭据；它调用你已经登录的本机 CLI。'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 } },
      h(CapabilityRow, { label: 'Claude Code', detail: loading ? '正在检测…' : (error ? `检测失败：${error}` : (engines.claude ? '已安装，可用于开发 / 澄清 / 评审' : '未检测到 claude 命令')), ok: Boolean(engines.claude), pending: loading }),
      h(CapabilityRow, { label: 'Node.js', detail: capabilities?.runtime?.node ? `当前 ${capabilities.runtime.node}` : '由 DevHub 服务进程提供', ok: Boolean(capabilities?.runtime?.node || !loading) }),
      h(CapabilityRow, { label: 'Git', detail: loading ? '正在检测…' : (capabilities?.runtime?.git ? '已安装，可创建独立工作区' : '未检测到 git'), ok: Boolean(capabilities?.runtime?.git), pending: loading }),
    ),
    !engines.claude && !loading
      ? h('div', { style: { marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,149,0,.10)', color: '#8a4b00', font: `400 12px/1.6 ${M.font}` } },
        '没有 Claude Code 也能先建项目，但无法开启开发会话。安装并登录后回到这里点「重新检测」。')
      : null,
    error ? h('div', { style: { marginTop: 12, font: `400 12px ${M.font}`, color: M.danger } }, error) : null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 28, flexWrap: 'wrap' } },
      h(PrimaryButton, { onClick: onNext }, '继续'),
      h(TextButton, { onClick: onLoad }, '重新检测'),
      h(TextButton, { onClick: onBack }, '上一步'),
    ),
  )
}

function StepProject({ state, onDone, onBack, onSkip }) {
  const [repoPath, setRepoPath] = useState(String(state?.suggestedRepoPath ?? state?.repo?.path ?? ''))
  const [name, setName] = useState(String(state?.profile?.member ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (!repoPath.trim()) { setError('请填写项目的绝对路径'); return }
    if (!name.trim()) { setError('请填写你的名字/成员标识'); return }
    setBusy(true); setError('')
    try {
      const next = await api(API.setup, { method: 'POST', body: JSON.stringify({ repoPath: repoPath.trim(), name: name.trim() }) })
      markOnboardingDone()
      onDone(next)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return h('div', { key: 'project', className: 'devhub-onboarding-step' },
    h('div', { style: { font: `600 12px ${M.font}`, letterSpacing: '.08em', color: M.accent, textTransform: 'uppercase' } }, '第 3 步 · 选择项目'),
    h('h1', { style: { margin: '10px 0 0', font: `700 clamp(30px, 4.5vw, 40px)/1.1 ${M.font}`, letterSpacing: '-0.03em', color: M.text } }, '从哪个项目开始？'),
    h('p', { style: { margin: '12px 0 0', font: `400 15px/1.55 ${M.font}`, color: M.secondary } }, '粘一个本地 Git 仓库的绝对路径。DevHub 会探测环境，并把流程台账写在该仓库的 .dev-hub 目录。'),
    h('form', { onSubmit: submit, style: { marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 } },
      h('label', { style: { font: `600 12px ${M.font}`, color: M.secondary } }, '项目路径'),
      h('input', {
        autoFocus: true,
        value: repoPath,
        placeholder: '/Users/you/Projects/your-repo',
        onChange: (event) => setRepoPath(event.target.value),
        style: {
          width: '100%', boxSizing: 'border-box', height: 46, padding: '0 14px',
          borderRadius: 12, border: `1px solid ${M.border}`, background: 'rgba(255,255,255,.9)',
          color: M.text, font: `400 14px ${M.font}`, outline: 'none',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,.03)',
        },
      }),
      h('label', { style: { font: `600 12px ${M.font}`, color: M.secondary, marginTop: 4 } }, '你的名字 / 成员标识'),
      h('input', {
        value: name,
        placeholder: '例如：张三',
        onChange: (event) => setName(event.target.value),
        style: {
          width: '100%', boxSizing: 'border-box', height: 42, padding: '0 14px',
          borderRadius: 12, border: `1px solid ${M.border}`, background: 'rgba(255,255,255,.9)',
          color: M.text, font: `400 14px ${M.font}`, outline: 'none',
        },
      }),
      error ? h('div', { style: { font: `400 12px/1.5 ${M.font}`, color: M.danger } }, error) : null,
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' } },
        h(PrimaryButton, { type: 'submit', disabled: busy }, busy ? '正在打开…' : '打开项目'),
        h(TextButton, { onClick: onBack }, '上一步'),
        h(TextButton, { onClick: onSkip }, '跳过引导'),
      ),
    ),
    h('div', { style: { marginTop: 20, font: `400 11px/1.6 ${M.font}`, color: M.tertiary } }, '路径必须是本机已经存在的目录；不存在的路径会明确报错，不会自动创建假项目。'),
  )
}

export function StandaloneOnboarding({ state, onDone, onSkip, onPickDirectory = null }) {
  const [step, setStep] = useState(0)
  const [capabilities, setCapabilities] = useState(null)
  const [loading, setLoading] = useState(false)
  const [capError, setCapError] = useState('')

  async function loadCapabilities() {
    setLoading(true); setCapError('')
    try {
      const body = await api(API.capabilities)
      setCapabilities(body)
    } catch (error) {
      setCapError(errorText(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCapabilities() }, [])

  // 键盘可达：Esc 跳过引导（不困住用户），但不吞掉输入框里的 Esc。
  useEffect(() => {
    function onKey(event) {
      if (event.key !== 'Escape') return
      if (String(event.target?.tagName ?? '').toLowerCase() === 'input') return
      onSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSkip])

  return h('div', {
    className: 'devhub-onboarding',
    style: {
      position: 'fixed', inset: 0, zIndex: 4000, display: 'grid', placeItems: 'center',
      padding: 'clamp(16px, 4vw, 40px)', overflow: 'auto',
      background: 'var(--devhub-onboarding-bg, radial-gradient(circle at 18% 12%, rgba(10,132,255,.20), transparent 34%), radial-gradient(circle at 84% 86%, rgba(94,92,230,.16), transparent 38%), linear-gradient(180deg, #f7f7fa, #ececf1))',
      fontFamily: M.font, WebkitFontSmoothing: 'antialiased',
    },
  },
    h('div', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'DevHub 首次使用引导',
      className: 'devhub-onboarding-card',
      style: {
        width: 'min(760px, calc(100vw - 32px))',
        borderRadius: 28, padding: 'clamp(24px, 4vw, 40px)',
        background: M.card,
        border: `1px solid rgba(255,255,255,.55)`,
        boxShadow: M.shadow,
        backdropFilter: 'blur(30px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(30px) saturate(1.4)',
        color: M.text,
      },
    },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 } },
        h(Dots, { step }),
        h('span', { style: { font: `500 11px ${M.font}`, color: M.tertiary, letterSpacing: '.02em' } }, 'DevHub · 本地开发工作站'),
      ),
      step === 0 ? h(StepIntro, { onNext: () => setStep(1), onSkip }) : null,
      step === 1 ? h(StepEnvironment, {
        capabilities, loading, error: capError, onLoad: loadCapabilities,
        onNext: () => setStep(2), onBack: () => setStep(0),
      }) : null,
      step === 2 ? h(StepProject, {
        state, onDone, onSkip, onBack: () => setStep(1), onPickDirectory,
      }) : null,
    ),
  )
}
