import assert from 'node:assert/strict'
import test from 'node:test'

import { renderReportHtml, renderReportMarkdown } from '../src/core/report-render.mjs'

function sampleReport() {
  return {
    schemaVersion: 1,
    itemId: 'item-1',
    title: '样例流程',
    status: 'done',
    statusLabel: '完成',
    stage: 'done',
    stageLabel: '完成',
    intent: 'feature',
    generatedAt: '2026-11-12T10:00:00.000Z',
    generatedAtLabel: '2026-11-12 18:00',
    verdict: 'passed',
    verdictLabel: '通过',
    verdictReason: '测试全部通过',
    summary: {
      goal: '做一份可点击查看的报告',
      rootProblem: '结项信息分散在台账里',
      changedFiles: 3,
      added: 42,
      removed: 7,
      testsPassed: 9,
      testsTotal: 9,
      tasksDone: 4,
      tasksTotal: 4,
      baseline: { commit: 'abc1234', branch: 'main', startedAt: '2026-11-11T09:00:00.000Z' },
      submission: null,
      workspace: { id: 'ws-1', name: '示例库' },
    },
    sections: [
      {
        id: 'goal',
        title: '目标背景',
        summary: '为什么做：团队需要一眼看清结项。',
        blocks: [
          {
            type: 'fields',
            title: '基本信息',
            fields: [
              { label: '目标', value: '生成可点击报告' },
              { label: '根因', value: '台账信息分散' },
            ],
          },
          { type: 'text', text: '不做的事：不改台账字段语义。\n报告只读。' },
        ],
      },
      {
        id: 'scope',
        title: '改动范围',
        summary: '计划与实际改动。',
        blocks: [
          {
            type: 'list',
            title: '变更点',
            items: [
              { text: '新增渲染层', tone: 'ok', meta: 'src/core/report-render.mjs' },
              { text: '新增测试', tone: 'info' },
            ],
          },
          {
            type: 'table',
            title: '文件',
            columns: [
              { key: 'path', label: '文件' },
              { key: 'added', label: '新增', align: 'right' },
              { key: 'status', label: '状态' },
            ],
            rows: [
              { path: 'src/a|b.mjs', added: 12, status: '已通过', tones: { status: 'ok' } },
              { path: 'src/line\nbreak.mjs', added: 3, status: '失败', tones: { status: 'danger' } },
            ],
          },
          { type: 'code', title: '命令', language: 'bash', text: 'node --test test/report-render.test.mjs' },
          {
            type: 'tags',
            title: '标签',
            items: [
              { label: 'report', tone: 'info' },
              { label: 'render', tone: 'neutral' },
            ],
          },
          { type: 'list', title: '空列表', items: [] },
        ],
      },
      {
        id: 'test',
        title: '测试报告',
        summary: '本机自测。',
        blocks: [
          {
            type: 'fields',
            fields: [
              { label: '状态', value: '通过', tone: 'ok' },
              { label: '耗时', value: '0.4s' },
            ],
          },
        ],
      },
    ],
  }
}

/* ------------------------------- Markdown ------------------------------- */

test('Markdown：固定章节、字段、表格与空数据占位', () => {
  const md = renderReportMarkdown(sampleReport())

  assert.ok(md.startsWith('# 样例流程 · 开发报告'), '一级标题含标题与「开发报告」')
  assert.ok(md.includes('流程 id：`item-1`'), '元信息含流程 id')
  assert.ok(md.includes('状态：完成'), '元信息含状态')
  assert.ok(md.includes('阶段：完成'), '元信息含阶段')
  assert.ok(md.includes('结论：通过'), '元信息含结论')
  assert.ok(md.includes('生成时间：2026-11-12 18:00'), 'generatedAtLabel 优先于 generatedAt')

  assert.ok(md.includes('## 1. 目标背景'), '第 1 章固定为目标背景')
  assert.ok(md.includes('## 2. 改动范围'), '第 2 章固定为改动范围')
  assert.ok(md.includes('## 3. 测试报告'), '第 3 章固定为测试报告')
  assert.ok(md.includes('为什么做：团队需要一眼看清结项。'), 'Section.summary 作为引导句')

  assert.ok(md.includes('- **目标**：生成可点击报告'), '字段渲染为 - **label**：value')
  assert.ok(md.includes('### 基本信息'), 'block 标题渲染为三级标题')
  assert.ok(md.includes('- 新增渲染层（src/core/report-render.mjs）'), 'list block 渲染')
  assert.ok(md.includes('node --test test/report-render.test.mjs'), 'code block 内容')
  assert.ok(md.includes('`report` `render`'), 'tags block 渲染')

  assert.ok(md.includes('| 文件 | 新增 | 状态 |'), 'table 表头是 GFM 表格')
  assert.ok(md.includes('| --- | ---: | --- |'), 'table 对齐分隔行')
  assert.ok(md.includes('src/a\\|b.mjs'), '表格单元格里的 | 被转义')
  assert.ok(md.includes('src/line<br>break.mjs'), '表格单元格换行转成 <br>')
  assert.ok(md.includes('| 已通过 |'), 'row.tones 不影响 Markdown 纯文本')
  assert.ok(!md.includes('class="tag"'), 'Markdown 不输出 HTML Tag')
  assert.ok(md.includes('_未填写_'), '空列表输出未填写占位')
})

test('Markdown：代码围栏、文本块与空 report 健壮性', () => {
  const md = renderReportMarkdown({
    title: 'x',
    sections: [
      {
        id: 'goal',
        title: '目标背景',
        blocks: [
          { type: 'code', language: 'js', text: 'console.log(1)' },
          { type: 'text', text: '第一行\n第二行' },
        ],
      },
    ],
  })
  assert.ok(md.includes('```js\nconsole.log(1)\n```'), 'code 使用围栏代码块')
  assert.ok(md.includes('第一行\n第二行'), 'text 保留原文换行')

  assert.doesNotThrow(() => renderReportMarkdown({}))
  assert.doesNotThrow(() => renderReportMarkdown({ title: 'x', sections: [] }))
  assert.doesNotThrow(() => renderReportMarkdown({ title: 'x' }))
  assert.doesNotThrow(() => renderReportMarkdown(null))
  assert.doesNotThrow(() =>
    renderReportMarkdown({
      title: 'x',
      sections: [{ title: '目标背景', blocks: [{ type: 'fields', fields: [{ label: '目标' }] }] }],
    }),
  )

  const empty = renderReportMarkdown({ title: 'x', sections: [] })
  assert.ok(empty.includes('# x · 开发报告'))
  assert.ok(empty.includes('_未填写_'), '没有章节时也有占位')

  const missingValue = renderReportMarkdown({
    title: 'x',
    sections: [{ title: '目标背景', blocks: [{ type: 'fields', fields: [{ label: '目标' }] }] }],
  })
  assert.ok(missingValue.includes('- **目标**：未填写'), 'undefined 字段值降级为未填写')

  const nestedFence = renderReportMarkdown({
    title: 'x',
    sections: [{ title: '测试报告', blocks: [{ type: 'code', text: '```js\nconst a = 1\n```' }] }],
  })
  assert.ok(nestedFence.includes('````'), '内容含围栏时自动加长围栏，避免截断')

  const derivedColumns = renderReportMarkdown({
    title: 'x',
    sections: [{ title: '测试报告', blocks: [{ type: 'table', rows: [{ path: 'a.mjs', tones: { path: 'ok' } }] }] }],
  })
  assert.ok(derivedColumns.includes('| path |'), '缺 columns 时按行 key 推导表头')
  assert.ok(!derivedColumns.includes('tones'), 'Markdown 不把 row.tones 当列')
})

test('Markdown：generatedAtLabel 缺失时回退 generatedAt', () => {
  const md = renderReportMarkdown({ title: 'x', generatedAt: '2026-11-11T00:00:00.000Z', sections: [] })
  assert.ok(md.includes('生成时间：2026-11-11T00:00:00.000Z'))
})

/* -------------------------------- HTML: shell -------------------------------- */

test('HTML：完整独立文档、内联样式、无外部资源', () => {
  const html = renderReportHtml(sampleReport())

  assert.match(html, /^<!doctype html>/i, '以 doctype 开头')
  assert.ok(html.includes('<html lang="zh-CN">'), 'lang=zh-CN')
  assert.ok(html.includes('<meta charset="utf-8">'), '声明 charset')
  assert.ok(html.includes('name="viewport"'), '声明 viewport')
  assert.ok(html.includes('<title>样例流程 · 开发报告</title>'), 'title 含标题与开发报告')
  assert.ok(html.includes('<style>') && html.includes('</style>'), '内联 style')
  assert.ok(html.trimEnd().endsWith('</html>'), '文档完整闭合')

  assert.doesNotMatch(html, /\bsrc\s*=\s*["']https?:/i, '无外部 src')
  assert.doesNotMatch(html, /\bhref\s*=\s*["']https?:/i, '无外部 href')
  assert.ok(!html.includes('http://') && !html.includes('https://'), '整个文档不引用外部 URL')
  assert.ok(!/<(script|link|iframe)\b/i.test(html), '文档不含脚本/外链标签')
})

test('HTML：Gitee 家族 token 与骨架落地', () => {
  const html = renderReportHtml(sampleReport())
  const tokens = [
    '#6049e7',
    '#f9fafd',
    '#1e2a3d',
    '#4d545e',
    '#5a5b70',
    '#848c9f',
    '#00875a',
    '#de350d',
    '#ca8a04',
    '#b65c00',
    '#0c62ff',
    '0 0 2px rgba(9,25,64,.1), 0 2px 6px -2px rgba(9,25,64,.25)',
    'border-radius: 12px',
    'border-radius: 8px',
    'border-radius: 6px',
    'border-radius: 4px',
    '999px',
    'line-height: 1.8',
    'font-feature-settings: "tnum"',
    '#eaedf1',
    '#f5f5f8',
    '#e9eaec',
    '#ecedf0',
    'max-height: 360px',
  ]
  for (const token of tokens) assert.ok(html.includes(token), `包含家族 token：${token}`)

  assert.ok(html.includes('class="page-head"'), 'PageContainer 式页头')
  assert.ok(html.includes('class="head-tags"'), '页头右侧状态标签组')
  assert.ok(html.includes('class="tag-key">状态<') && html.includes('class="tag-key">阶段<') && html.includes('class="tag-key">结论<'))
  assert.ok(html.includes('class="page-sub"') && html.includes('功能需求'), '页头副信息含需求类型')
  assert.ok(html.includes('class="head-time"') && html.includes('生成时间 2026-11-12 18:00'), '页头生成时间')
  assert.ok(html.includes('class="head-reason">测试全部通过'), '页头结论原因')
  assert.ok(html.includes('class="help-alert" open'), '可折叠帮助 Alert')
  assert.ok(html.includes('<summary>') && html.includes('class="help-icon"'), '帮助 Alert 的 info 图标与折叠入口')
  assert.ok(html.includes('class="section-index">1<'), '分节数字徽标')
  assert.ok(html.includes('<h2>目标背景</h2>'), '分节标题')
  assert.ok(html.includes('<h2>改动范围</h2>') && html.includes('<h2>测试报告</h2>'), '按 section 顺序渲染')
})

test('HTML：四张渐变统计卡 + 圆角图标座 + 关键指标', () => {
  const html = renderReportHtml(sampleReport())

  assert.equal((html.match(/class="stat-card /g) ?? []).length, 4, '恰好四张统计卡')
  assert.equal((html.match(/class="stat-icon"/g) ?? []).length, 4, '每卡一个图标座')
  assert.ok((html.match(/linear-gradient\(135deg/g) ?? []).length >= 4, '统计卡使用 135deg 淡彩渐变')
  assert.ok(html.includes('width: 36px;') && html.includes('height: 36px;'), '图标座 36×36')
  assert.ok(html.includes('font-size: 26px;') && html.includes('font-weight: 700;'), '数值 26px/700')

  assert.ok(html.includes('变更文件') && html.includes('>3</span>'), '变更文件数')
  assert.ok(html.includes('增删行') && html.includes('+42 / -7'), '增删行')
  assert.ok(html.includes('测试通过') && html.includes('9 / 9'), '测试通过数')
  assert.ok(html.includes('任务完成') && html.includes('4 / 4'), '任务完成进度')
  assert.ok(html.includes('<svg'), '图标为内联 SVG')
})

test('HTML：表格家族样式、数字列与 row.tones 状态 Tag', () => {
  const html = renderReportHtml(sampleReport())

  assert.ok(html.includes('background: #eaedf1'), '表头 #eaedf1')
  assert.ok(html.includes('color: var(--text-4)'), '表头灰字')
  assert.ok(html.includes('tbody tr:hover td { background: #f5f5f8; }'), '行 hover #f5f5f8')
  assert.ok(html.includes('border-bottom: 1px solid #e9eaec'), '单元格边框 #e9eaec')
  assert.ok(html.includes('<th class="num">新增</th>'), '数字列头右对齐')
  assert.ok(html.includes('<td class="num">12</td>'), '数字列右对齐')
  assert.ok(html.includes('font-variant-numeric: tabular-nums'), '数字列 tnum')

  assert.ok(html.includes('<span class="tag tag-ok">已通过</span>'), 'row.tones.ok 渲染状态 Tag')
  assert.ok(html.includes('<span class="tag tag-danger">失败</span>'), 'row.tones.danger 渲染状态 Tag')
  assert.ok(html.includes('src/a|b.mjs'), '普通表格单元格正常转义输出')
})

test('HTML：打印友好', () => {
  const html = renderReportHtml(sampleReport())

  assert.ok(html.includes('@media print'), '打印样式')
  assert.ok(html.includes('@page { margin: 12mm; }'), '页边距 12mm')
  assert.ok(html.includes('.topbar, .help-alert { display: none !important; }'), '隐藏帮助与粘性栏')
  assert.ok(html.includes('break-inside: avoid'), '卡片避免跨页')
  assert.ok(html.includes('page-break-inside: avoid'), '兼容 page-break')
  assert.ok(html.includes('thead { display: table-header-group; }'), '打印重复表头')
  assert.ok(html.includes('print-color-adjust: exact'), '打印底色保真')
  assert.ok(html.includes('background: #fff'), '打印白底')
})

test('HTML：结论颜色区分 passed/failed/incomplete/blocked', () => {
  const cases = [
    ['passed', '通过', 'tag-ok'],
    ['failed', '未通过', 'tag-danger'],
    ['incomplete', '未完成', 'tag-warn'],
    ['blocked', '阻塞', 'tag-blocked'],
  ]
  for (const [verdict, label, className] of cases) {
    const html = renderReportHtml({ title: 'x', verdict, verdictLabel: label, sections: [] })
    assert.ok(html.includes(`class="tag ${className}">${label}</span>`), `${verdict} 使用 ${className}`)
  }
  const unknown = renderReportHtml({ title: 'x', verdict: 'wat', sections: [] })
  assert.ok(unknown.includes('class="tag tag-neutral">未填写</span>'), '未知结论用中性 Tag')
})

/* --------------------------------- HTML: XSS -------------------------------- */

test('HTML：XSS 文本全部转义，tones/属性不注入', () => {
  const evil = {
    itemId: '<script>alert(0)</script>',
    title: '<script>alert(1)</script>',
    status: 'done',
    statusLabel: "' onload='alert(1)",
    stage: 'done',
    stageLabel: '" onmouseover=alert(1)',
    verdict: 'failed',
    verdictLabel: '未通过',
    verdictReason: '" onmouseover=alert(1)',
    generatedAt: '2026-11-12T10:00:00.000Z',
    summary: { changedFiles: 1, added: 1, removed: 0, testsPassed: 0, testsTotal: 1, tasksDone: 0, tasksTotal: 1 },
    sections: [
      {
        id: 'goal',
        title: '目标背景<script>alert(1)</script>',
        summary: "' onload='alert(1)",
        blocks: [
          { type: 'text', text: '<script>alert(1)</script>' },
          { type: 'fields', fields: [{ label: '根因', value: '" onmouseover=alert(1)' }] },
          {
            type: 'table',
            columns: [
              { key: 'v', label: '值' },
              { key: 's', label: '状态' },
            ],
            rows: [{ v: 'a|b<script>alert(1)</script>\nnext', s: '<script>alert(2)</script>', tones: { s: '"><script>' } }],
          },
          { type: 'tags', items: [{ label: '<script>alert(3)</script>', tone: '"><script>' }] },
          { type: 'code', text: '<script>alert(4)</script>' },
        ],
      },
    ],
  }

  const html = renderReportHtml(evil)
  assert.ok(!html.toLowerCase().includes('<script'), 'HTML 中不出现原始 script 标签')
  assert.ok(!html.includes('</script>'), 'HTML 中不出现原始 script 闭合标签')
  assert.ok(!html.includes('<img'), '不产生注入标签')
  assert.ok(!html.includes('" onmouseover='), '双引号属性注入原文不出现')
  assert.ok(!html.includes("' onload="), '单引号属性注入原文不出现')
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'script 文本被转义展示')
  assert.ok(html.includes('&quot; onmouseover=alert(1)'), '双引号被转义')
  assert.ok(html.includes('&#39; onload=&#39;alert(1)'), '单引号被转义')
  assert.ok(html.includes('&lt;script&gt;alert(2)&lt;/script&gt;'), '非法 tone 不改变单元格文本转义')
  assert.ok(!html.includes('tag-&quot;'), '非法 tone 不会拼进 class')

  const md = renderReportMarkdown(evil)
  assert.ok(md.includes('a\\|b<script>alert(1)</script><br>next'), 'Markdown 表格转义 | 并把换行转成 <br>')
  assert.ok(md.includes('| 值 | 状态 |'), 'HTML 恶意内容不影响表格结构')
})

/* ------------------------------- HTML: empty -------------------------------- */

test('HTML：空 report / 缺字段不抛错', () => {
  assert.doesNotThrow(() => renderReportHtml({}))
  assert.doesNotThrow(() => renderReportHtml(null))
  assert.doesNotThrow(() => renderReportHtml({ title: 'x', sections: [] }))
  assert.doesNotThrow(() => renderReportHtml({ title: 'x' }))

  const minimal = renderReportHtml({ title: 'x', sections: [] })
  assert.match(minimal, /^<!doctype html>/i)
  assert.ok(minimal.includes('<title>x · 开发报告</title>'))
  assert.ok(minimal.includes('未填写'), '缺失字段降级为未填写')
  assert.ok(minimal.includes('class="tag tag-neutral">未填写</span>'), '缺失结论用中性 Tag')

  const noBlocks = renderReportHtml({ title: 'x', sections: [{ title: '目标背景' }] })
  assert.ok(noBlocks.includes('<h2>目标背景</h2>'))
  assert.ok(noBlocks.includes('未填写'), '没有 blocks 也显示占位')

  const emptyCode = renderReportHtml({
    title: 'x',
    sections: [{ title: '测试报告', blocks: [{ type: 'code', text: '' }] }],
  })
  assert.ok(emptyCode.includes('未运行'), '空代码块显示未运行')

  const emptyTable = renderReportHtml({
    title: 'x',
    sections: [{ title: '改动范围', blocks: [{ type: 'table', columns: [{ key: 'p', label: '文件' }], rows: [] }] }],
  })
  assert.ok(emptyTable.includes('<table') && emptyTable.includes('未填写'), '空表格保留结构并显示未填写')
})

test('HTML：generatedAtLabel 优先于 generatedAt', () => {
  const html = renderReportHtml({
    title: 'x',
    generatedAt: '2026-11-11T00:00:00.000Z',
    generatedAtLabel: '2026-11-12 18:00',
    sections: [],
  })
  assert.ok(html.includes('生成时间 2026-11-12 18:00'))
  assert.ok(!html.includes('2026-11-11T00:00:00.000Z'))
})

test('HTML/Markdown：分析流程显示「只读分析」与结论统计，不显示变更文件', () => {
  const report = {
    ...sampleReport(),
    intent: 'analysis',
    verdictReason: '分析流程：只读结论已产出，不进入提交',
    summary: { ...sampleReport().summary, changedFiles: 3, added: 42, removed: 7 },
    sections: [{
      id: 'conclusion',
      title: '分析结论',
      summary: '只读排查 · 1 条结论',
      blocks: [
        { type: 'fields', fields: [{ label: '代码改动', value: '无（补丁建议只记录、不落地）' }] },
        { type: 'list', title: '结论与补丁建议', items: [{ text: '结论：调用链在 X 分支提前返回' }] },
      ],
    }],
  }
  const html = renderReportHtml(report)
  assert.match(html, /只读分析/)
  assert.match(html, /分析产出/)
  assert.match(html, /代码改动/)
  assert.doesNotMatch(html, /变更文件/)
  assert.doesNotMatch(html, /增删行/)
  assert.match(html, /<h2>分析结论<\/h2>/)

  const md = renderReportMarkdown(report)
  assert.match(md, /流程类型：只读分析/)
  assert.match(md, /## 1\. 分析结论/)
  assert.match(md, /代码改动/)
})
