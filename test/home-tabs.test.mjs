/**
 * 首页「项目管理 → 开发流程」的 tab 式打通：
 * 选中目标卡在最后一行、紧贴流程面板时，用卡片底色盖住分隔线（不画长线条）；
 * 换行后不贴面板就保持普通分隔线，避免穿过其它卡片。
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
    // 有流程时才渲染「开发流程」面板；空工作区由需求澄清引导卡接管
    items: [{ id: 'flow-1', title: '示例流程', status: 'developing', stage: 'develop', workflow: { stage: 'develop' } }],
    sessionStates: new Map(),
  }))
  assert.match(html, /项目管理/)
  assert.match(html, /2 个开发目标/)
  assert.match(html, /选中的目标决定下方「开发流程」/)
  assert.match(html, /id="devhub-flow-list"/)
  assert.match(html, /id="devhub-active-target"/)
  assert.match(html, /data-devhub-target-card="1"/)
})

test('tab 打通：贴住面板时用卡片底色盖住分隔线，换行不贴时保持普通分隔线', () => {
  assert.match(home, /const \[tabPatch, setTabPatch\] = useState\(null\)/)
  assert.match(home, /document\.getElementById\('devhub-active-target'\)/)
  assert.match(home, /document\.getElementById\('devhub-flow-list'\)/)
  assert.match(home, /const gap = Math\.round\(listRect\.top - cardRect\.bottom\)/)
  assert.match(home, /Math\.abs\(gap\) > 2/)
  assert.match(home, /tabPatch\.width/)
  // 用选中卡底色截断分隔线，而不是画一条竖线
  assert.match(home, /background: T\.brandSoft/)
  assert.match(home, /height: 2,/)
  assert.doesNotMatch(home, /tabLink/)
  // 卡片下边框透明，让底色接到分隔线上
  assert.match(home, /borderBottomColor: 'transparent'/)
  // 项目管理卡和流程面板拼成一块：去底边/下圆角 + 去上圆角
  assert.match(home, /paddingBottom: 0,\s+borderBottom: 'none'/)
  assert.match(home, /borderTopLeftRadius: 0, borderTopRightRadius: 0/)
  // 选中卡做成 tab：下沿收方
  assert.match(home, /active \? '12px 12px 4px 4px' : T\.rLg/)
})
