/**
 * 「下一步」问答线程的本机留档：切流程/切页签回来仍能看到之前问过什么。
 * 只存本机 localStorage，不进台账、不提交。
 */
const PREFIX = 'devhub:assist-thread:'
const MAX = 40

function keyOf(repoPath, itemId) {
  return `${PREFIX}${String(repoPath ?? '').trim()}::${String(itemId ?? '').trim()}`
}

export function loadAssistThread(repoPath, itemId) {
  if (typeof localStorage === 'undefined' || !itemId) return []
  try {
    const raw = localStorage.getItem(keyOf(repoPath, itemId))
    if (!raw) return []
    const rows = JSON.parse(raw)
    return Array.isArray(rows)
      ? rows.map((row) => ({ role: row?.role === 'user' ? 'user' : 'assistant', text: String(row?.text ?? '') })).filter((row) => row.text).slice(-MAX)
      : []
  } catch { return [] }
}

export function saveAssistThread(repoPath, itemId, rows) {
  if (typeof localStorage === 'undefined' || !itemId) return
  try {
    localStorage.setItem(keyOf(repoPath, itemId), JSON.stringify((Array.isArray(rows) ? rows : []).slice(-MAX)))
  } catch { /* localStorage 满了也不影响主流程 */ }
}
