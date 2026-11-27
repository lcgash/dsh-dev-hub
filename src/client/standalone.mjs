/**
 * Standalone browser entry (M2).
 *
 * The DSH plugin entry uses `ctx.slots` to register a panel/page. This entry
 * mounts the same DevHubPage directly, so the UI source stays single-sourced.
 * Missing DSH services (sessions/layout) are explicitly absent, not faked.
 */
import { createRoot } from 'react-dom/client'
import { h } from './i18n.mjs'
import { DevHubPage } from './index.mjs'

const root = createRoot(document.getElementById('devhub-root'))

// 独立版没有 DSH 的 slots/sessions/uiWorkspace；页面组件必须按缺失能力降级。
const standaloneContext = {
  standalone: true,
  get() { return null },
}

root.render(h(DevHubPage, { ctx: standaloneContext }))
