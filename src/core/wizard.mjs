import { draftFromDescription, suggestName } from '../shared/slug.mjs'

/**
 * 命名规则在 shared/slug.mjs（浏览器半也要用同样的规则），这里只做 Host 侧再导出，
 * 保持 core/wizard.mjs 的既有 API 不变。
 */
export { draftFromDescription, suggestName }

/** Step completion flags for the wizard header, shared by Host and browser. */
export function wizardSteps({ firstRun = true, description = '', name = '', id = '', scope = [], bootstrapped = false } = {}) {
  const hasScope = Array.isArray(scope) ? scope.length > 0 : Boolean(scope)
  return [
    { id: 'describe', done: Boolean(String(description).trim()) },
    { id: 'name', done: Boolean(String(name).trim() && String(id).trim()) },
    { id: 'scope', done: hasScope },
    { id: 'bootstrap', done: !firstRun || bootstrapped },
    { id: 'start', done: false },
  ]
}

/** The default goal text shown when the user only wrote a short description. */
export function goalFor(description, fallbackTitle) {
  const text = String(description ?? '').trim()
  return text || String(fallbackTitle ?? '').trim()
}
