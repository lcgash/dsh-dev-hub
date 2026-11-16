import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const { reconRepo, extractTokens } = await import('../src/core/recon.mjs')

async function fixtureRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'devhub-recon-'))
  const source = join(dir, 'src/main/java/com/gitee/pipeline/source')
  const controller = join(dir, 'src/main/java/com/gitee/pipeline/controller')
  await mkdir(source, { recursive: true })
  await mkdir(controller, { recursive: true })
  await writeFile(join(source, 'GitlabCodeProvider.java'), [
    'class GitlabCodeProvider {',
    '  // webhook 重试',
    '  void ensureWebhook() {}',
    '}',
  ].join('\n'), 'utf8')
  await writeFile(join(controller, 'PipelineController.java'), 'class PipelineController {}\n', 'utf8')
  await writeFile(join(dir, 'README.md'), '# demo\n', 'utf8')
  await writeFile(join(dir, 'package-lock.json'), '{"lockfileVersion":3}\n', 'utf8')
  await mkdir(join(dir, 'node_modules/noise'), { recursive: true })
  await writeFile(join(dir, 'node_modules/noise/index.js'), 'const webhook = 1\n', 'utf8')
  return dir
}

test('extractTokens：英文词 + 中文整段 + 中文 2-gram，去停用词', () => {
  assert.deepEqual(extractTokens('给 GitlabCodeProvider 补 webhook 重试'), ['gitlabcodeprovider', 'webhook', '重试'])
  const chinese = extractTokens('补齐流水线标签功能')
  assert.ok(chinese.includes('补齐流水线标签功能'))
  assert.ok(chinese.includes('标签'), '该保留有检索价值的词')
  assert.ok(!chinese.includes('补齐'), '功能词（动词）不进检索词')
  // 中文 2-gram 里夹功能词切出来的碎片（“表的”“的标”）必须丢掉
  const noisy = extractTokens('给流水线列表加标签筛选')
  assert.ok(noisy.includes('标签') && noisy.includes('列表'))
  assert.ok(!noisy.some((token) => token === '表的' || token === '的标' || token === '给流'))
})

test('reconRepo：按描述找出候选文件、命中行、归属模块与建议范围', async () => {
  const repo = await fixtureRepo()
  try {
    const result = await reconRepo(repo, '给 GitlabCodeProvider 补 webhook 重试')
    assert.ok(result.tokens.includes('gitlabcodeprovider'))
    assert.ok(result.scanned >= 3)
    assert.equal(result.files[0].path, 'src/main/java/com/gitee/pipeline/source/GitlabCodeProvider.java')
    assert.ok(result.files[0].matches.some((match) => /webhook/i.test(match.text)))
    assert.equal(result.modules[0].name, 'source')
    assert.deepEqual(result.suggestedScope, ['src/main/java/com/gitee/pipeline/source'])
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('reconRepo：跳过 node_modules 等目录，不把噪音当候选', async () => {
  const repo = await fixtureRepo()
  try {
    const result = await reconRepo(repo, 'webhook 重试')
    assert.ok(!result.files.some((file) => file.path.includes('node_modules')))
    assert.ok(!result.files.some((file) => file.path.endsWith('package-lock.json')))
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('reconRepo：描述与仓库无关时给出空结果，而不是瞎猜', async () => {
  const repo = await fixtureRepo()
  try {
    const result = await reconRepo(repo, 'zzz-nonexistent-topic-qqq')
    assert.deepEqual(result.files, [])
    assert.deepEqual(result.suggestedScope, [])
    assert.ok(result.scanned >= 3)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('reconRepo：结果稳定（同一描述两次一致）', async () => {
  const repo = await fixtureRepo()
  try {
    const a = await reconRepo(repo, 'webhook 重试')
    const b = await reconRepo(repo, 'webhook 重试')
    assert.deepEqual(a.files, b.files)
    assert.deepEqual(a.suggestedScope, b.suggestedScope)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('reconRepo：命中行优先展示类声明/实现，不把 package/import 当主要内容', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'devhub-recon-lines-'))
  try {
    const dir = join(repo, 'src/main/java/com/gitee/pipeline/source')
    await mkdir(dir, { recursive: true })
    const imports = Array.from({ length: 20 }, (_, i) => `import com.gitee.pipeline.source.Thing${i};`).join('\n')
    await writeFile(join(dir, 'GitlabCodeProvider.java'),
      `package com.gitee.pipeline.source;\n${imports}\npublic class GitlabCodeProvider extends SourcesProvider {\n  // webhook 重试\n}\n`, 'utf8')
    const result = await reconRepo(repo, '给 GitlabCodeProvider 补 webhook 重试')
    const file = result.files.find((entry) => entry.path.endsWith('GitlabCodeProvider.java'))
    assert.ok(file, '必须命中目标类')
    assert.ok(file.matches.length > 0)
    assert.match(file.matches[0].text, /class GitlabCodeProvider/, '第一条命中应是类声明而不是 import')
    assert.ok(!file.matches.some((match) => /^import\b/.test(match.text)), '有更有意义的命中时不要展示 import')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})
