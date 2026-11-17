/**
 * 首页「项目管理 → 开发流程」的 tab 式连通：
 * 选中目标卡要带锚点，流程列表带锚点，HomeView 用真实布局测量后画一条连通线。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const home = await readFile(new URL('../src/client/home.mjs', import.meta.url), 'utf8')
const { HomeView } = await import('../src/client/home.mjs')

function state() {
  return {
    repo: { name: 'web', path: '/w/web' },
    profile: {
      member: '吕晨光',
      repoCards: [
        { path: '/w/web', name: 'web', exists: true, isRepo: true, branch: 'main', head: 'abc1234', initialized: true, workspaces: [] },
        { path: '/w/api', name: 'api', exists: true, isRepo: true, branch: 'main', head: 'def5678', initialized: true, workspaces: [] },
      ],
      repos: [],
    },
    workspace: null,
    workspaces: [],
    items: [],
  }
}

test('项目管理：顶部有标题，选中目标卡与流程列表都带稳定锚点', async () => {
  const html = renderToStaticMarkup(h(HomeView, {
    state: state(),
    items: [],
    sessionStates: new Map(),
  }))
  assert.match(html, /项目管理/)
  assert.match(html, /2 个开发目标/)
  assert.match(html, /选中的目标决定下方「开发流程」/)
  assert.match(html, /id="devhub-flow-list"/)
  assert.match(html, /id="devhub-active-target"/)
  assert.match(html, /data-devhub-target-card="1"/)
})

test('tab 连通线：按选中卡与流程列表的真实位置测量，并避开换行后的其它卡片', () => {
  // 锚点 + 测量逻辑
  assert.match(home, /const \[tabLink, setTabLink\] = useState\(null\)/)
  assert.match(home, /document\.getElementById\('devhub-active-target'\)/)
  assert.match(home, /document\.getElementById\('devhub-flow-list'\)/)
  assert.match(home, /getBoundingClientRect\(\)/)
  assert.match(home, /ResizeObserver/)
  assert.match(home, /tabLink\.height/)
  // 选中卡下面压着别的目标卡时不画线（不能从别的卡上穿过去）
  assert.match(home, /\[\.\.\.document\.querySelectorAll\('\[data-devhub-target-card\]'\)\]/)
  assert.match(home, /rect\.left <= centerX/)
  // 选中卡做成 tab：下沿收方
  assert.match(home, /active \? '12px 12px 4px 4px' : T\.rLg/)
})
