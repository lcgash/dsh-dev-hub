import assert from 'node:assert/strict'
import test from 'node:test'

const { loadLastTab, saveLastTab, loadPanelState, savePanelState, clearUiState } = await import('../src/client/ui-state.mjs')

test('ui-state：页签记住并按白名单过滤', () => {
  clearUiState('/repo/x')
  assert.equal(loadLastTab(), null)
  saveLastTab('chat')
  assert.equal(loadLastTab(), 'chat')
  saveLastTab('skills')
  assert.equal(loadLastTab(), 'skills')
  saveLastTab('nonsense')
  assert.equal(loadLastTab(), 'skills', '非法页签不覆盖')
})

test('ui-state：每个仓库各记各的"上次打开的流程"', () => {
  clearUiState('/repo/a')
  clearUiState('/repo/b')
  savePanelState('/repo/a', { selectedId: 'flow-a', scrollTop: 120 })
  savePanelState('/repo/b', { selectedId: 'flow-b', scrollTop: 0 })
  assert.equal(loadPanelState('/repo/a').selectedId, 'flow-a')
  assert.equal(loadPanelState('/repo/b').selectedId, 'flow-b')
  assert.equal(loadPanelState('/repo/a').scrollTop, 120)
  assert.equal(loadPanelState('/repo/missing').selectedId, null)
})

test('ui-state：localStorage 不可用时内存兜底', () => {
  const original = globalThis.window
  globalThis.window = undefined
  try {
    clearUiState('/repo/nostorage')
    savePanelState('/repo/nostorage', { selectedId: 'flow-x' })
    assert.equal(loadPanelState('/repo/nostorage').selectedId, 'flow-x')
  } finally {
    globalThis.window = original
  }
})

test('ui-state：坏 JSON 不抛错', () => {
  const original = globalThis.window
  globalThis.window = {
    localStorage: {
      getItem: () => '{bad json',
      setItem() {}, removeItem() {},
    },
  }
  try {
    clearUiState('/repo/broken')
    assert.equal(loadPanelState('/repo/broken').selectedId, null)
  } finally {
    globalThis.window = original
  }
})
