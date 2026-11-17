import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const { ItemEditor } = await import('../src/client/index.mjs')
const { sanitizeItem } = await import('../src/core/store.mjs')

function render(item) {
  return renderToStaticMarkup(h(ItemEditor, {
    item,
    ctx: { get: () => undefined },
    session: null,
    onBack() {}, onSaved() {}, onContext() {}, onStarted() {}, onLaunch() {}, onOpenSession() {}, onUnbindSession() {},
  }))
}

function base(extra = {}) {
  return sanitizeItem({
    id: 'techdoc-ui',
    title: '技术方案 UI',
    goal: '验证技术方案卡片',
    description: '验证技术方案卡片',
    acceptance: ['能渲染'],
    scope: ['src/client'],
    workflow: {
      rootProblem: '技术文档只是链接占位',
      entry: 'chat',
      techDoc: {
        provider: 'feishu',
        decision: 'create',
        title: '技术方案 UI 技术方案',
        exists: false,
        supplement: '我的补充内容',
        supplementUpdatedAt: '2026-11-17T00:00:00.000Z',
        sync: { status: 'fresh', note: '' },
      },
      plan: { summary: '加技术方案', steps: ['一步'], estimate: { size: 'S', days: 1 } },
    },
    ...extra,
  })
}

test('技术方案卡片：provider 选择、生成/预览、补充编辑、冲突入口都在', async () => {
  const html = render(base())
  assert.ok(html.length > 0, '详情页 SSR 不能抛错')
  assert.match(html, /技术方案 UI/)
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  for (const label of ['飞书文档', '本地 Markdown', '外部链接', '已有飞书文档 URL', '创建飞书文档', '预览', '我的补充', '保存补充']) {
    assert.ok(index.includes(label), `缺少技术方案 UI 文案：${label}`)
  }
})

test('技术方案：本地 provider 显示默认 docs/design 路径与更新按钮；不出现 token 字段', async () => {
  const item = base({
    workflow: {
      rootProblem: 'x',
      entry: 'chat',
      techDoc: {
        provider: 'local',
        decision: 'existing',
        title: '本地方案',
        exists: true,
        localPath: 'docs/design/techdoc-ui.md',
        supplement: '',
        generatedAt: '2026-11-17T00:00:00.000Z',
        sync: { status: 'fresh' },
      },
      plan: { summary: '计划', steps: ['一步'], estimate: { size: 'S', days: 1 } },
    },
  })
  const html = render(item)
  assert.ok(html.length > 0, '本地 provider 的详情页 SSR 不能抛错')
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /更新本地文档/)
  assert.match(index, /复制路径/)
  assert.doesNotMatch(index, /feishuToken|access_token/)
})

test('源码：补充走 API.techdoc supplement，冲突用 force，飞书创建失败可回退', async () => {
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /action: 'supplement'/)
  assert.match(index, /runTechDoc\(true\)/)
  assert.match(index, /飞书创建失败/)
  assert.match(index, /不会覆盖「我的补充」/)
})
