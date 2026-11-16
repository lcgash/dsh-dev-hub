import assert from 'node:assert/strict'
import test from 'node:test'

const {
  LOCAL_COMMAND_PHASES,
  LOCAL_COMMAND_SCHEMA,
  buildLocalCommandPrompt,
  normalizeLocalCommand,
  phaseLabel,
} = await import('../src/core/local-commands.mjs')

test('本机命令：三个槽位与项目命令同名，schema 要求 command/explanation', () => {
  assert.deepEqual(LOCAL_COMMAND_PHASES.map((phase) => phase.id), ['localTest', 'environmentTest', 'gate'])
  assert.equal(phaseLabel('environmentTest'), '环境测试')
  assert.equal(phaseLabel('unknown'), '本机自测')
  assert.deepEqual(LOCAL_COMMAND_SCHEMA.required, ['command', 'explanation'])
  assert.equal(LOCAL_COMMAND_SCHEMA.additionalProperties, false)
})

test('normalizeLocalCommand：去掉代码块/$ 前缀，多行取第一条有效命令', () => {
  assert.equal(normalizeLocalCommand('```sh\nkpipe-dev deploy --local\n```'), 'kpipe-dev deploy --local')
  assert.equal(normalizeLocalCommand('$ mvn -o clean test'), 'mvn -o clean test')
  assert.equal(normalizeLocalCommand('echo a\necho b'), 'echo a')
  assert.equal(normalizeLocalCommand('   '), '')
  assert.equal(normalizeLocalCommand('sh scripts/check.sh --full\n'), 'sh scripts/check.sh --full')
})

test('buildLocalCommandPrompt：带用户原话、阶段、项目命令与本机已装工具', () => {
  const prompt = buildLocalCommandPrompt({
    description: '本机用 kpipe-dev 把服务部署到本机环境',
    phase: 'environmentTest',
    repoName: 'pipeline',
    projectCommands: { environmentTest: 'sh scripts/sit.sh', localTest: 'mvn -o clean test' },
    env: {
      os: 'macos',
      arch: 'arm64',
      shell: { name: 'zsh' },
      tools: { docker: { available: true }, mysql: { available: false }, curl: { available: true } },
    },
  })
  assert.match(prompt, /kpipe-dev/)
  assert.match(prompt, /环境测试/)
  assert.match(prompt, /sh scripts\/sit\.sh/)
  assert.match(prompt, /macos arm64/)
  assert.match(prompt, /docker/)
  assert.match(prompt, /curl/)
  assert.doesNotMatch(prompt, /mysql/, '不可用工具不要喂给模型')
  assert.match(prompt, /只输出 JSON/)
})
