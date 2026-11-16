import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

const { h, en, zh, LocaleProvider, setActiveLocaleForTest, LOCALE_NAMESPACE } = await import('../src/client/i18n.mjs')

test('本地化词典：中英文 key 完整对齐，英文覆盖关键界面文案', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  assert.ok(Object.keys(en).length >= 100)
  assert.equal(en['开发工作站'], 'Development Workstation')
  assert.equal(en['独立评审'], 'Independent review')
  assert.equal(zh['开发工作站'], '开发工作站')
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.trim().length > 0, `empty translation: ${key}`)
    assert.notEqual(value, key, `untranslated key: ${key}`)
  }
})

test('本地化元素工厂：静态子节点/占位符/选项标题命中词典时翻译', () => {
  setActiveLocaleForTest('en', (key) => en[key] ?? key)
  try {
    const html = renderToStaticMarkup(h('div', { title: '开发工作站' },
      h('span', null, '独立评审'),
      h('input', { placeholder: '代码库路径' }),
      h('span', null, '未收录的自定义文案'),
    ))
    assert.match(html, /Development Workstation/)
    assert.match(html, /Independent review/)
    assert.match(html, /Repository path/)
    assert.match(html, /未收录的自定义文案/)
  } finally {
    setActiveLocaleForTest('zh', (key) => key)
  }
})

test('LocaleProvider：跟随 ctx.locale，语言切换后静态文案重新翻译', () => {
  const ctx = {
    locale: {
      getLocale: () => ({ active: 'en' }),
      bind: (ns) => (key) => (ns === LOCALE_NAMESPACE ? (en[key] ?? key) : key),
      subscribe: () => () => {},
    },
  }
  function Demo() {
    return h('div', null, h('span', null, '开发工作站'))
  }
  try {
    const html = renderToStaticMarkup(h(LocaleProvider, { ctx }, h(Demo)))
    assert.match(html, /Development Workstation/)
  } finally {
    setActiveLocaleForTest('zh', (key) => key)
  }
})

test('DSH 接入：client 注入 locale、注册字典，并提供中英文插件元数据', async () => {
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const localeEn = JSON.parse(await readFile(new URL('../locale/en.json', import.meta.url), 'utf8'))
  const localeZh = JSON.parse(await readFile(new URL('../locale/zh.json', import.meta.url), 'utf8'))
  assert.match(index, /export const inject = \['slots', 'locale'\]/)
  assert.match(index, /ctx\.locale\.register\(LOCALE_NAMESPACE, \{ zh, en \}\)/)
  assert.match(index, /LocaleProvider/)
  assert.ok(manifest.exports['./locale/*.json'])
  assert.equal(localeEn.meta.title, 'Development Workstation')
  assert.equal(localeZh.meta.title, '开发工作站')
})
