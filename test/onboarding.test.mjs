import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { h } from '../src/client/i18n.mjs'
import { isOnboardingDone, markOnboardingDone, StandaloneOnboarding } from '../src/client/onboarding.mjs'

test('独立版首次引导：mac 风格首屏可渲染，且不依赖 DSH ctx', () => {
  const html = renderToStaticMarkup(h(StandaloneOnboarding, {
    state: { needsSetup: true, suggestedRepoPath: '/tmp/repo' },
    onDone() {}, onSkip() {},
  }))
  assert.match(html, /把一句话需求/)
  assert.match(html, /开始使用/)
  assert.match(html, /跳过引导/)
  assert.match(html, /devhub-onboarding/)
  assert.doesNotMatch(html, /DSH 原生会话/)
})

test('引导完成标记在无 localStorage 环境里安全降级', () => {
  assert.equal(isOnboardingDone(), false)
  markOnboardingDone()
  assert.equal(isOnboardingDone(), false)
})
