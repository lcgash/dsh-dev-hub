import assert from 'node:assert/strict'
import test from 'node:test'

const { KEY_FILE_LIMIT, excerptLines, keyFileKind, pickKeyFiles } = await import('../src/client/key-files.mjs')

function file(path, extra = {}) {
  return { path, added: 3, removed: 1, status: 'modified', inScope: true, ...extra }
}

test('keyFileKind：数据库模型/迁移 > 接口契约 > 配置', () => {
  assert.equal(keyFileKind({ path: 'src/main/java/x/model/User.java' })?.kind, '数据库模型')
  assert.equal(keyFileKind({ path: 'db/migration/V2__add.sql' })?.kind, '数据库模型')
  assert.equal(keyFileKind({ path: 'src/main/java/x/entity/Order.java' })?.kind, '数据库模型')
  assert.equal(keyFileKind({ path: 'src/main/java/x/controller/UserController.java' })?.kind, '接口/契约')
  assert.equal(keyFileKind({ path: 'application.yml' })?.kind, '配置')
  assert.equal(keyFileKind({ path: 'README.md' }), null)
  assert.equal(keyFileKind(null), null)
})

test('pickKeyFiles：模型文件优先、最多 5 个、二进制跳过', () => {
  const files = [
    file('README.md', { added: 200, removed: 100 }),
    file('src/model/User.java', { added: 2, removed: 1 }),
    file('src/controller/UserController.java'),
    file('application.yml'),
    file('docs/a.md'),
    file('docs/b.md'),
    file('docs/c.md'),
    file('assets/logo.png', { binary: true, added: 0, removed: 0 }),
  ]
  const picks = pickKeyFiles(files)
  assert.equal(picks.length, KEY_FILE_LIMIT)
  assert.equal(picks[0].file.path, 'src/model/User.java')
  assert.equal(picks[0].kind, '数据库模型')
  assert.ok(picks.some((entry) => entry.kind === '接口/契约'))
  assert.ok(!picks.some((entry) => entry.file.path === 'assets/logo.png'), '二进制没有可读 diff，不入选')
})

test('pickKeyFiles：scope 外降权，但文件很少时仍可入选；没有改动行的文件跳过', () => {
  const inScope = file('src/model/A.java', { added: 1, removed: 0 })
  const outScope = file('src/model/B.java', { added: 1, removed: 0, inScope: false })
  const picks = pickKeyFiles([outScope, inScope])
  assert.equal(picks[0].file.path, 'src/model/A.java')
  assert.equal(picks.length, 2)

  assert.equal(pickKeyFiles([file('src/model/Empty.java', { added: 0, removed: 0, status: 'modified' })]).length, 0)
  assert.equal(pickKeyFiles([]).length, 0)
})

test('excerptLines：超过上限截断，并告诉还剩多少行', () => {
  const lines = Array.from({ length: 50 }, (_, index) => ({ type: 'context', text: `line ${index}` }))
  const cut = excerptLines(lines, 36)
  assert.equal(cut.lines.length, 36)
  assert.equal(cut.truncated, true)
  assert.equal(cut.hidden, 14)

  const whole = excerptLines(lines.slice(0, 10), 36)
  assert.equal(whole.truncated, false)
  assert.equal(whole.hidden, 0)
  assert.equal(whole.lines.length, 10)
  assert.deepEqual(excerptLines(null).lines, [])
})
