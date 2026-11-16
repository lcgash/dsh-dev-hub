/**
 * 工作站"界面状态"留存：切走再回来，回到上次所在的页面。
 *
 * 只存与"页面"有关的东西（页签、当前打开哪条流程、列表滚动位置），
 * 不存业务数据（业务数据在 .dev-hub 台账、对话内容在 chat-store）。
 *
 * 内存 + localStorage：同页面内切换立即恢复；刷新/重启后也能恢复。
 */

const MEMORY = new Map()
const TAB_KEY = 'dev-hub:ui:tab'
const PANEL_PREFIX = 'dev-hub:ui:panel:'

function storage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

function panelKey(repoPath) {
  const repo = String(repoPath ?? '').trim() || 'unknown-repo'
  return PANEL_PREFIX + repo
}

function read(key) {
  if (MEMORY.has(key)) return MEMORY.get(key)
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw)
    MEMORY.set(key, value)
    return value
  } catch {
    return null
  }
}

function write(key, value) {
  MEMORY.set(key, value)
  const store = storage()
  if (!store) return
  try { store.setItem(key, JSON.stringify(value)) } catch { /* 容量满等：内存兜底 */ }
}

/** 上次所在的页签（flows / chat / skills）。 */
export function loadLastTab() {
  const value = read(TAB_KEY)
  const tab = typeof value === 'string' ? value : value?.tab
  return ['flows', 'chat', 'skills'].includes(tab) ? tab : null
}

export function saveLastTab(tab) {
  if (!['flows', 'chat', 'skills'].includes(tab)) return
  write(TAB_KEY, tab)
}

/**
 * 某代码库上次的详情页状态。
 * @returns {{ selectedId: string|null, scrollTop: number }}
 */
export function loadPanelState(repoPath) {
  const value = read(panelKey(repoPath))
  return {
    selectedId: typeof value?.selectedId === 'string' ? value.selectedId : null,
    scrollTop: Number.isFinite(Number(value?.scrollTop)) ? Number(value.scrollTop) : 0,
    savedAt: value?.savedAt ?? null,
  }
}

export function savePanelState(repoPath, { selectedId = null, scrollTop = 0 } = {}) {
  write(panelKey(repoPath), {
    selectedId: selectedId ?? null,
    scrollTop: Number(scrollTop) || 0,
    savedAt: new Date().toISOString(),
  })
}

/** 清空（调试/重置用）。 */
export function clearUiState(repoPath) {
  const keys = [TAB_KEY]
  if (repoPath) keys.push(panelKey(repoPath))
  for (const key of keys) {
    MEMORY.delete(key)
    try { storage()?.removeItem(key) } catch { /* ignore */ }
  }
}
