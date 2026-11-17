import assert from 'node:assert/strict'
import test from 'node:test'

const {
  DEFAULT_DOCS_CONFIG,
  GENERATED_BEGIN,
  GENERATED_END,
  USER_BEGIN,
  USER_END,
  applySupplementToFile,
  buildTechDocMarkdown,
  expandDocPath,
  extractGenerated,
  extractSupplement,
  hashText,
  mergeLocalDoc,
  normalizeDocsConfig,
  renderLocalDoc,
  techDocSummary,
} = await import('../src/core/techdoc.mjs')

function item(overrides = {}) {
  return {
    id: 'flow-x',
    title: '给模板支持复制',
    goal: '支持模板复制并保留归属',
    status: 'developing',
    acceptance: ['复制后归属正确', '本机测试通过'],
    scope: ['src/main/java/com/x/controller/TemplateController.java', 'src/main/resources/db/migration'],
    nonGoals: ['不改前端'],
    risks: ['存量数据迁移'],
    attachments: [{ kind: 'image', name: 'shot.png', path: '/tmp/shot.png' }],
    workflow: {
      rootProblem: '模板只能手工复制',
      background: '运营需要复用模板',
      expected: '一键复制到企业空间',
      questions: [{ question: '复制范围？', answer: '模板+关联关系' }],
      plan: { summary: '加复制接口', steps: ['加接口', '补测试'], estimate: { size: 'M', days: 2, confidence: 'medium' } },
      ...overrides.workflow,
    },
    ...overrides,
  }
}

test('normalizeDocsConfig / expandDocPath：默认飞书 + docs/design/{id}.md，拒绝越界路径', () => {
  assert.equal(DEFAULT_DOCS_CONFIG.provider, 'feishu')
  assert.equal(DEFAULT_DOCS_CONFIG.local.path, 'docs/design/{id}.md')
  const docs = normalizeDocsConfig({ provider: 'bad', local: { path: '' } })
  assert.equal(docs.provider, 'feishu')
  assert.equal(docs.local.path, 'docs/design/{id}.md')
  assert.equal(expandDocPath('docs/design/{id}.md', { id: 'flow-x' }), 'docs/design/flow-x.md')
  assert.equal(expandDocPath('{repo}/design/{title}.md', { repoName: 'gitee-go', title: 'A B' }), 'gitee-go/design/A-B.md')
  assert.throws(() => expandDocPath('../etc/passwd', { id: 'x' }), /路径不合法/)
  assert.throws(() => expandDocPath('/tmp/x.md', { id: 'x' }), /路径不合法/)
})

test('buildTechDocMarkdown：结构化章节覆盖目标/方案/风险/验收/附件', () => {
  const markdown = buildTechDocMarkdown(item(), { repoName: 'demo', generatedAt: '2026-11-17T00:00:00.000Z' })
  for (const heading of ['背景与目标', '现状、约束与非目标', '方案设计', '接口 / 数据 / 兼容与回滚', '风险与未决问题', '验收与测试', '附件与参考']) {
    assert.match(markdown, new RegExp(heading))
  }
  assert.match(markdown, /一键复制到企业空间/)
  assert.match(markdown, /复制范围/)
  assert.match(markdown, /TemplateController\.java/)
  assert.match(markdown, /存量数据迁移/)
  assert.match(markdown, /\/tmp\/shot\.png/)
})

test('renderLocalDoc：generated/user 分段，用户补充不会被包进生成段', () => {
  const content = renderLocalDoc(item(), { repoName: 'demo', supplement: '我的取舍：先只做同企业复制' })
  assert.ok(content.indexOf(GENERATED_BEGIN) < content.indexOf(GENERATED_END))
  assert.ok(content.indexOf(USER_BEGIN) < content.indexOf(USER_END))
  assert.match(extractGenerated(content), /加复制接口/)
  assert.match(extractSupplement(content), /我的取舍/)
  assert.doesNotMatch(extractGenerated(content), /我的取舍/)
})

test('mergeLocalDoc：新建 / 更新保留补充 / 外部改生成段要冲突 / force 合并不丢内容', () => {
  const first = mergeLocalDoc(null, item(), { repoName: 'demo', supplement: '我的补充' })
  assert.equal(first.status, 'created')
  assert.match(first.content, /我的补充/)

  const generatedHash = hashText(extractGenerated(first.content))
  const updated = mergeLocalDoc(first.content, item({ workflow: { plan: { summary: '新计划', steps: ['x'], estimate: {} } } }), {
    repoName: 'demo',
    supplement: '我的补充',
    generatedHash,
  })
  assert.equal(updated.conflict, false)
  assert.match(extractGenerated(updated.content), /新计划/)
  assert.match(extractSupplement(updated.content), /我的补充/)

  const manualEdited = first.content.replace('加复制接口', '我手改的方案')
  const conflict = mergeLocalDoc(manualEdited, item(), { repoName: 'demo', supplement: '我的补充', generatedHash })
  assert.equal(conflict.conflict, true)
  assert.equal(conflict.status, 'external-modified')
  assert.match(conflict.message, /默认不覆盖/)

  const unmarked = mergeLocalDoc('旧文档内容（没有 marker）', item(), { repoName: 'demo', supplement: '', generatedHash: '', force: true })
  assert.equal(unmarked.conflict, false)
  assert.match(unmarked.supplement, /旧文档内容/)
  assert.match(unmarked.content, /旧文档内容/)
})

test('applySupplementToFile：只替换 user 段，不动 generated 段', () => {
  const content = renderLocalDoc(item(), { repoName: 'demo', supplement: '旧补充' })
  const next = applySupplementToFile(content, '新补充')
  assert.match(extractGenerated(next), /加复制接口/)
  assert.match(extractSupplement(next), /新补充/)
  assert.doesNotMatch(extractSupplement(next), /旧补充/)
})

test('techDocSummary：给 Context/报告用的摘要不带 token', () => {
  const summary = techDocSummary(item({
    workflow: {
      techDoc: {
        provider: 'feishu',
        title: '方案',
        url: 'https://example.feishu.cn/docx/abc',
        supplement: '补充内容',
        sync: { status: 'fresh' },
      },
    },
  }))
  assert.equal(summary.provider, 'feishu')
  assert.equal(summary.location, 'https://example.feishu.cn/docx/abc')
  assert.equal(summary.hasSupplement, true)
  assert.equal(JSON.stringify(summary).includes('token'), false)
})
