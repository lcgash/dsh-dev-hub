import assert from 'node:assert/strict'
import test from 'node:test'

const { transcriptItemsFromRows } = await import('../src/host/session-log.mjs')

test('会话行 → DSH 时间线：工具调用独立成项，连续工具可折叠，不冒充助手消息', () => {
  const items = transcriptItemsFromRows([
    { role: 'user', text: '把表单创建做出来' },
    { role: 'assistant', text: '先看一下现有列表页。' },
    { role: 'assistant', text: '[调用工具] Read · web/templates/list.html' },
    { role: 'tool', roleLabel: '工具 Read', text: '<table>…' },
    { role: 'assistant', text: '[调用工具] Bash · go build ./...' },
    { role: 'tool', roleLabel: '工具 Bash', text: 'ok' },
    { role: 'assistant', text: '链路已跑通，接下来补测试。' },
  ])
  assert.equal(items[0].kind, 'user')
  assert.equal(items[1].kind, 'assistant')
  assert.match(items[1].text, /列表页/)
  assert.equal(items[2].kind, 'tool', '工具调用不能被当成助手消息')
  assert.equal(items[2].name, 'Read')
  assert.equal(items[2].status, 'ok')
  assert.match(items[2].detail, /<table>/)
  assert.equal(items[3].name, 'Bash')
  assert.equal(items[3].status, 'ok')
  assert.equal(items[4].kind, 'assistant')
  assert.match(items[4].text, /补测试/)
  assert.ok(!items.some((item) => item.kind === 'assistant' && /\[调用工具\]/.test(String(item.text))), '助手文本里不能再出现裸工具标记')
})

test('工具失败状态与长结果保留可展开的 detail', () => {
  const items = transcriptItemsFromRows([
    { role: 'assistant', text: '[调用工具] Bash · mvn -o clean test' },
    { role: 'tool', roleLabel: '工具 Bash', text: 'error: compilation failed' },
  ])
  assert.equal(items[0].kind, 'tool')
  assert.equal(items[0].status, 'error')
  assert.match(items[0].detail, /compilation failed/)
})
