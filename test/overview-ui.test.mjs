/**
 * 「进行中」抽屉的跨目标 UI：多个项目/多库项目的流程要能一起看到，点击时切对目标。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const source = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')

test('头部/抽屉接入 /overview，并带跨目标切换与「当前」标记', () => {
  assert.match(source, /API\.overview/)
  assert.match(source, /const \[overview, setOverview\] = useState\(null\)/)
  assert.match(source, /function drawerTargetOf\(/)
  assert.match(source, /export function FlowDrawer\(\{ overview, fallbackState/)
  assert.match(source, /全部项目/)
  assert.match(source, /个目标 · \$\{inProgress\} 个进行中/)
  assert.match(source, /target\.current \? 'accent' : 'neutral'/)
  assert.match(source, /export function switchBodyForTarget\(/)
  assert.match(source, /setFlowsNonce\(\(value\) => value \+ 1\)/)
  // 头部计数必须优先用跨目标 overview，而不是当前 /state 的 items
  assert.match(source, /overview\?\.inProgressCount \?\?/)
  assert.match(source, /overview\?\.attentionCount \?\?/)
  assert.match(source, /overview\?\.targetCount \?\?/)
})

test('switchBodyForTarget：多库项目走 workspaceId，单库走 repoPath + 成员名', async () => {
  const { switchBodyForTarget } = await import('../src/client/index.mjs')
  assert.deepEqual(
    switchBodyForTarget({ kind: 'workspace', workspaceId: 'ws-1', path: '/p/a' }, '张三'),
    { workspaceId: 'ws-1' },
  )
  assert.deepEqual(
    switchBodyForTarget({ kind: 'repo', path: '/p/b', member: null }, '张三'),
    { repoPath: '/p/b', name: '张三', detect: false },
  )
  // 目标自带的成员优先于头部兜底成员
  assert.deepEqual(
    switchBodyForTarget({ kind: 'repo', path: '/p/c', member: '李四' }, '张三'),
    { repoPath: '/p/c', name: '李四', detect: false },
  )
})

test('FlowDrawer 渲染：跨目标条目、进行中标记、当前目标徽标', async () => {
  const { FlowDrawer } = await import('../src/client/index.mjs')
  const overview = {
    targetCount: 2,
    inProgressCount: 3,
    items: [
      {
        id: 'flow-a', title: 'A 仓库的流程', status: 'developing', stage: 'develop',
        running: true, attention: null, doneCount: 1, taskCount: 2,
        target: { key: 'repo:/p/a', kind: 'repo', name: 'repo-a', path: '/p/a', workspaceId: null, member: '张三', current: true },
      },
      {
        id: 'flow-b', title: '多库项目的流程', status: 'verifying', stage: 'verify',
        running: false, attention: { kind: 'ready-env', label: '可以跑环境测试', tone: 'accent' }, doneCount: 2, taskCount: 2,
        target: { key: 'workspace:ws-1', kind: 'workspace', name: '前后端组合', path: '/p/a', workspaceId: 'ws-1', member: '张三', current: false },
      },
      {
        id: 'flow-c', title: '已完成流程', status: 'done', stage: 'done',
        running: false, attention: null, doneCount: 3, taskCount: 3,
        target: { key: 'repo:/p/b', kind: 'repo', name: 'repo-b', path: '/p/b', workspaceId: null, member: '张三', current: false },
      },
    ],
  }
  const html = renderToStaticMarkup(h(FlowDrawer, {
    overview,
    fallbackState: null,
    onPick() {},
    onClose() {},
  }))
  assert.match(html, /全部项目/)
  assert.match(html, /2 个目标 · 3 个进行中/)
  assert.match(html, /repo-a/)
  assert.match(html, /前后端组合/)
  assert.match(html, /repo-a · 当前/, '当前目标要有明确徽标')
  assert.match(html, /可以跑环境测试/)
  assert.match(html, /开发中…/)
  assert.match(html, /已完成（1）/)
})

test('FlowDrawer：切目标中显示「切换中…」并锁住点击', async () => {
  const { FlowDrawer } = await import('../src/client/index.mjs')
  const overview = {
    targetCount: 2,
    inProgressCount: 1,
    items: [{
      id: 'flow-x', title: 'X 流程', status: 'developing', stage: 'develop',
      running: false, attention: null, doneCount: 0, taskCount: 0,
      target: { key: 'repo:/p/x', kind: 'repo', name: 'repo-x', path: '/p/x', workspaceId: null, member: '张三', current: false },
    }],
  }
  const html = renderToStaticMarkup(h(FlowDrawer, {
    overview,
    fallbackState: null,
    onPick() {},
    onClose() {},
    switchingTarget: 'repo:/p/x',
  }))
  assert.match(html, /正在切换…/)
  assert.match(html, /切换中…/)
  assert.match(html, /cursor:progress/)
})
