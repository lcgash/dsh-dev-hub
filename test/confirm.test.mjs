/**
 * 自建确认弹层：不依赖浏览器原生 confirm，也要保证「一次只显示一条、只结算一次」。
 * 这里覆盖队列语义与默认文案；渲染部分用 SSR 验证关键属性/按钮确实生成。
 */
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import test from 'node:test'

const confirm = await import('../src/client/confirm.mjs')
const { h } = await import('../src/client/i18n.mjs')

test('确认弹层：危险操作默认文案、排队与结算', async () => {
  const first = confirm.askConfirm({
    title: '删除澄清草稿',
    tone: 'danger',
    message: '删除澄清草稿「演示需求」？',
  })
  const active = confirm.currentConfirm()
  assert.equal(active?.title, '删除澄清草稿')
  assert.equal(active?.confirmLabel, '确认删除', '危险操作默认按钮文案不能还是「确认」')
  assert.equal(active?.cancelLabel, '取消')
  assert.equal(active?.tone, 'danger')

  // 同时再来一条：不打断当前弹层，排队等待
  const second = confirm.askConfirm('第二条确认')
  assert.equal(confirm.currentConfirm().id, active.id)

  assert.equal(confirm.settleConfirm(active.id, true), true)
  assert.equal(await first, true, '确认后返回 true')
  assert.equal(confirm.currentConfirm()?.message, '第二条确认', '第一条结算后应推进到下一条')

  const svg = renderToStaticMarkup(h(confirm.ConfirmHost, null))
  assert.match(svg, /role="dialog"/)
  assert.match(svg, /aria-modal="true"/)
  assert.match(svg, /第二条确认/)
  assert.match(svg, /取消/)
  assert.match(svg, /确认/)

  assert.equal(confirm.settleConfirm(confirm.currentConfirm().id, false), true)
  assert.equal(await second, false, '取消后返回 false')
  assert.equal(confirm.currentConfirm(), null)
})

test('确认弹层：重复结算/未知请求不产生副作用', async () => {
  const pending = confirm.askConfirm({ title: '切换项目', message: '离开当前项目？' })
  const id = confirm.currentConfirm().id
  assert.equal(confirm.settleConfirm(id, false), true)
  assert.equal(confirm.settleConfirm(id, true), false, '同一请求不能结算两次')
  assert.equal(confirm.settleConfirm(id + 9999, true), false)
  assert.equal(await pending, false)
  assert.equal(confirm.currentConfirm(), null)
})
