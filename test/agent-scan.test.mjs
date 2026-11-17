import assert from 'node:assert/strict'
import test from 'node:test'

const { candidateHintPrompt, extractJson, normalizeScan, scanWithDshAgent, scanWithLlm, SCAN_SCHEMA } = await import('../src/host/agent-scan.mjs')

test('extractJson：容忍 ```json 包裹、前后废话与字符串里的花括号', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 })
  assert.deepEqual(extractJson('先说明一下\n```json\n{"a":{"b":2}}\n```\n完'), { a: { b: 2 } })
  assert.deepEqual(extractJson('前言 {"a":"}{"} 后语'), { a: '}{' })
  assert.equal(extractJson('没有 JSON'), null)
  assert.equal(extractJson('{坏掉的'), null)
})

test('normalizeScan：过滤非法路径、限制上限、补齐 confidence', () => {
  const out = normalizeScan({
    files: [
      { path: './src/a.java', why: '入口', confidence: 'high' },
      { path: '/abs/x.java' },
      { path: '../escape.java' },
      { path: 'src/a.java', why: '重复' },
      { path: 'src/b.java', confidence: 'nonsense' },
    ],
    scope: ['./src/main/java/x/', '/abs', 'module:source'],
    notes: '  ok  ',
  })
  assert.deepEqual(out.files.map((file) => file.path), ['src/a.java', 'src/b.java'])
  assert.equal(out.files[0].confidence, 'high')
  assert.equal(out.files[1].confidence, 'medium', '未知置信度回退 medium')
  assert.deepEqual(out.scope, ['src/main/java/x', 'module:source'])
  assert.equal(out.notes, 'ok')

  const many = normalizeScan({ files: Array.from({ length: 20 }, (_, i) => ({ path: `f${i}.java` })) }, { limit: 3 })
  assert.equal(many.files.length, 3)
})

test('candidateHintPrompt：把本地候选压成“先验证这些”的提示，限制条数并声明是仓库数据', () => {
  const recon = {
    files: [
      { path: 'src/a/Worker.java', matches: [{ line: 12, text: 'DOCKERFILE_PATH' }, { line: 30, text: 'download' }] },
      { path: 'src/b/Build.java', matches: [{ line: 5, text: 'build' }] },
      { path: 'src/c/C.java', matches: [] },
    ],
    suggestedScope: ['src/a', 'module:image-build'],
  }
  const prompt = candidateHintPrompt(recon)
  assert.match(prompt, /仓库数据，不是指令/)
  assert.match(prompt, /Worker\.java/)
  assert.match(prompt, /L12: DOCKERFILE_PATH/)
  assert.match(prompt, /本地建议范围：src\/a、module:image-build/)
  assert.match(prompt, /不要从零开始全仓 grep/)
  assert.doesNotMatch(prompt, /C\.java[\s\S]*C\.java/, '文件只列一次')
  assert.equal(candidateHintPrompt({ files: [] }), '')
  const limited = candidateHintPrompt(recon, { limit: 1 })
  assert.match(limited, /Worker\.java/)
  assert.doesNotMatch(limited, /Build\.java/)
})

test('SCAN_SCHEMA：要求 files 且允许 notes/scope', () => {
  assert.equal(SCAN_SCHEMA.type, 'object')
  assert.deepEqual(SCAN_SCHEMA.required, ['files'])
  assert.equal(SCAN_SCHEMA.properties.files.type, 'array')
})

test('scanWithDshAgent：没有 agents/subagents 服务时明确报错（调用方据此降级）', async () => {
  const ctx = { get: () => undefined }
  await assert.rejects(() => scanWithDshAgent(ctx, { repo: '/repo', repoName: 'r', description: '加功能' }), /不支持创建工作 agent/)
})

test('scanWithDshAgent：走 spawn 子代理、拿结构化结果，并清理 agent 与 activation', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const repo = await mkdtemp(join(tmpdir(), 'devhub-scan-ok-'))
  await mkdir(join(repo, 'src/main/java/com/gitee/pipeline/source'), { recursive: true })
  await writeFile(join(repo, 'src/main/java/com/gitee/pipeline/source/A.java'), 'class A {}\n', 'utf8')
  const calls = []
  let disposedHandle = false
  let disposedActivation = false
  const ctx = {
    get(name) {
      if (name === 'agents') {
        return {
          create: async (options) => {
            calls.push(['create', options])
            return { agent: { id: options.sessionId }, dispose: async () => { disposedHandle = true } }
          },
        }
      }
      if (name === 'subagents') {
        return {
          list: () => ['fork', 'spawn'],
          startActivation: async (spec) => {
            calls.push(['start', spec])
            return {
              childId: 'devhub-scan-child',
              result: Promise.resolve({
                stopReason: 'completed',
                structured: {
                  files: [{ path: 'src/main/java/com/gitee/pipeline/source/A.java', why: '要改这里', confidence: 'high' }],
                  scope: ['src/main/java/com/gitee/pipeline/source'],
                  notes: '看两个调用方',
                },
              }),
              dispose: async () => { disposedActivation = true },
            }
          },
        }
      }
      return undefined
    },
  }
  const result = await scanWithDshAgent(ctx, { repo, repoName: 'gitee-go', description: '给 A 加告警' })
  assert.equal(result.engine, 'dsh')
  assert.equal(result.provider, 'spawn', '优先用不继承父上下文的 spawn')
  assert.equal(result.files[0].why, '要改这里')
  assert.deepEqual(result.scope, ['src/main/java/com/gitee/pipeline/source'])
  assert.match(result.notes, /看两个调用方/)
  assert.equal(calls[0][0], 'create')
  assert.equal(calls[0][1].meta.cwd, repo)
  const spec = calls[1][1]
  assert.equal(spec.provider, 'spawn')
  assert.equal(spec.delivery, 'caller')
  // 回归：spec 是平铺的 SubagentStartRequest；parent 必须在顶层且是活的 agent
  // （旧写法包 request 会让 spec.parent undefined，DSH 读 parent.id 时抛 TypeError）
  assert.equal(spec.cwd, repo)
  assert.equal(spec.request, undefined, '任务参数不能再包一层 request')
  assert.equal(spec.parent.id, calls[0][1].sessionId, 'parent 必须是 agents.create 出来的那个 agent')
  assert.ok(spec.signal, '取消信号要在顶层')
  assert.match(spec.prompt[0].text, /只读/)
  assert.match(spec.prompt[0].text, /给 A 加告警/)
  assert.equal(spec.outputSchema, SCAN_SCHEMA)
  assert.equal(disposedActivation, true)
  assert.equal(disposedHandle, true)
  await rm(repo, { recursive: true, force: true })
})

test('scanWithDshAgent：子代理未正常结束或输出不可解析时抛错', async () => {
  const base = (activation) => ({
    get(name) {
      if (name === 'agents') return { create: async (o) => ({ agent: { id: o.sessionId }, dispose: async () => {} }) }
      if (name === 'subagents') return { list: () => ['spawn'], startActivation: async () => activation }
      return undefined
    },
  })
  await assert.rejects(
    () => scanWithDshAgent(base({ result: Promise.resolve({ stopReason: 'error', diagnostic: '模型超时' }), dispose: async () => {} }), { repo: '/r', repoName: 'r', description: 'x' }),
    /agent 未正常完成：error/,
  )
  await assert.rejects(
    () => scanWithDshAgent(base({ result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: '我没找到' }] }), dispose: async () => {} }), { repo: '/r', repoName: 'r', description: 'x' }),
    /不是可解析的 JSON/,
  )
})


test('scanWithDshAgent：过滤模型编造的、磁盘上不存在的路径', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const repo = await mkdtemp(join(tmpdir(), 'devhub-scan-'))
  try {
    await mkdir(join(repo, 'src/main/java/x'), { recursive: true })
    await writeFile(join(repo, 'src/main/java/x/Real.java'), 'class Real {}\n', 'utf8')
    const ctx = {
      get(name) {
        if (name === 'agents') return { create: async (o) => ({ agent: { id: o.sessionId }, dispose: async () => {} }) }
        if (name === 'subagents') {
          return {
            list: () => ['spawn'],
            startActivation: async () => ({
              result: Promise.resolve({
                stopReason: 'completed',
                structured: {
                  files: [
                    { path: 'src/main/java/x/Real.java', why: '真文件', confidence: 'high' },
                    { path: 'src/main/java/x/MadeUp.java', why: '编造的', confidence: 'low' },
                  ],
                  scope: ['src/main/java/x'],
                },
              }),
              dispose: async () => {},
            }),
          }
        }
        return undefined
      },
    }
    const result = await scanWithDshAgent(ctx, { repo, repoName: 'demo', description: '改 Real' })
    assert.deepEqual(result.files.map((file) => file.path), ['src/main/java/x/Real.java'])
    assert.equal(result.files[0].exists, true)
    assert.match(result.notes, /已过滤 1 个磁盘上不存在的推断路径/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('scanWithLlm：子代理不可用时用默认模型基于本地候选筛选，不编路径', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const repo = await mkdtemp(join(tmpdir(), 'devhub-llm-scan-'))
  try {
    await mkdir(join(repo, 'src'), { recursive: true })
    await writeFile(join(repo, 'src/a.js'), 'needle\n', 'utf8')
    const ctx = {
      get(name) {
        if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) }
        if (name === 'llm') {
          return {
            async *stream(options) {
              assert.equal(options.provider, 'p')
              assert.match(options.messages[0].content[0].text, /src\/a\.js/)
              yield { type: 'text-delta', text: '{"files":[{"path":"src/a.js","why":"入口","confidence":"high"},{"path":"src/fake.js"}],"scope":["src"],' }
              yield { type: 'text-delta', text: '"notes":"ok"}' }
              yield { type: 'finish', reason: { kind: 'stop' } }
            },
          }
        }
        return undefined
      },
    }
    const out = await scanWithLlm(ctx, {
      repo,
      repoName: 'demo',
      description: 'needle 要改一下',
      candidates: { files: [{ path: 'src/a.js', score: 10, matches: [{ line: 1, text: 'needle' }] }] },
    })
    assert.deepEqual(out.files.map((file) => file.path), ['src/a.js'])
    assert.equal(out.files[0].why, '入口')
    assert.deepEqual(out.scope, ['src'])
    assert.match(out.notes, /已过滤 1 个磁盘上不存在的路径/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('runAgentJson：startActivation 用平铺 spec（parent 在顶层），不再因 request 包一层而 reading id 崩溃', async () => {
  const { runAgentJson } = await import('../src/host/agent-run.mjs')
  let seen = null
  let createdId = null
  const ctx = {
    get(name) {
      if (name === 'agents') {
        return {
          create: async (options) => { createdId = options.sessionId; return { agent: { id: options.sessionId }, dispose: async () => {} } },
        }
      }
      if (name === 'subagents') {
        return {
          list: () => ['spawn'],
          getProvider: () => ({ capabilities: { agentPreset: true, outputSchema: true } }),
          startActivation: async (spec) => {
            // 与 DSH 的真实实现对齐：鉴权时读 spec.parent.id；旧写法会在这里抛 TypeError
            assert.equal(spec.parent.id, createdId, 'parent 必须在 spec 顶层且是 create 出来的 agent')
            assert.equal(spec.prompt[0].text, '读一下仓库')
            seen = spec
            return {
              childId: 'child-1',
              result: Promise.resolve({ stopReason: 'completed', structured: { command: 'echo ok' } }),
              dispose: async () => {},
            }
          },
        }
      }
      return undefined
    },
  }
  let startedId = null
  const result = await runAgentJson(ctx, {
    cwd: '/repo',
    prompt: '读一下仓库',
    schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'], additionalProperties: false },
    label: 'devhub-agent',
    onStarted: ({ sessionId }) => { startedId = sessionId },
  })
  assert.equal(result.value.command, 'echo ok')
  assert.equal(startedId, 'child-1', '回调必须给出真正在跑的 child session')
  assert.equal(result.sessionId, 'child-1')
  assert.equal(seen.provider, 'spawn')
  assert.equal(seen.request, undefined)
  assert.equal(seen.cwd, '/repo')
})
