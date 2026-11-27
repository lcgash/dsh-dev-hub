import assert from 'node:assert/strict'
import test from 'node:test'

const { buildContextArtifact, splitContextSections } = await import('../src/core/context.mjs')

const PROMPT = [
  '【开发项】示例（demo）',
  '【当前状态】开发中',
  '',
  '【目标】实现一个可观测的分组计数',
  '',
  '【非目标】不改权限模型',
  '',
  '【验收标准】计数恒为 0 或正数',
  '',
  '【阶段边界】开发阶段只改代码，不跑测试',
  '',
  '【独立评审】审核员只读',
  '',
  '【测试/门禁（工作站执行，开发会话不要运行）】mvn test',
  '',
  '【关键文件】src/A.java',
  '',
  '【目标文件与摘录】A.java 命中 3 行',
  '',
  '【仓库事实】commit abc123',
  '',
  '【本机环境】macOS / JDK 25',
  '',
  '【项目约束】[scope] 只改 scope 内',
  '',
  '【可用命令】mvn -o clean compile',
  '',
  '【下一步】拆分任务',
].join('\n')

test('splitContextSections：按【】标题切段，不丢标题', () => {
  const sections = splitContextSections(PROMPT)
  assert.ok(sections.length >= 10)
  assert.equal(sections.find((section) => section.title === '目标')?.body, '实现一个可观测的分组计数')
})

test('buildContextArtifact：任务/约束/证据分文件，索引只做入口', () => {
  const artifact = buildContextArtifact({
    item: { id: 'demo', title: '示例', status: 'developing', workflow: { stage: 'develop' } },
    context: { prompt: PROMPT, contextHash: 'hash-1', generatedAt: '2026-01-01T00:00:00.000Z' },
  })
  const names = artifact.files.map((file) => file.name).sort()
  assert.deepEqual(names, ['00-INDEX.md', '10-CONTRACT.md', '20-TASK.md', '30-SCOPE.md', '40-FACTS.md', '50-RULES.md'])
  assert.deepEqual(artifact.mustRead, ['10-CONTRACT.md', '20-TASK.md', '50-RULES.md'])
  const task = artifact.files.find((file) => file.name === '20-TASK.md').content
  assert.match(task, /【目标】/)
  assert.match(task, /【验收标准】/)
  assert.doesNotMatch(task, /【仓库事实】/)
  const index = artifact.files.find((file) => file.name === '00-INDEX.md').content
  assert.match(index, /hash-1/)
  assert.match(index, /20-TASK\.md/)
  assert.doesNotMatch(index, /实现一个可观测的分组计数/, 'index 不复制全文，只做入口')
})
