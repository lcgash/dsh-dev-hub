/**
 * 通用「让 dsh 干一件只读/结构化的事」：起一个插件自有的 root agent，
 * 派一个 spawn 子代理（不继承父上下文、带完整工具），等它回结构化 JSON。
 *
 * 扫描（recon）和对话式补充（assist）都用它，避免两套重复的创建/清理逻辑。
 * 失败一律抛出，由调用方决定降级还是报错 —— 不假装成功。
 */

import { access } from 'node:fs/promises'
import { join } from 'node:path'

export const DEFAULT_TIMEOUT_MS = 180_000

function withTimeout(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`超时（${Math.round(ms / 1000)}s）`)), ms)
  return { signal: controller.signal, dispose: () => clearTimeout(timer) }
}

function textOf(output) {
  return (Array.isArray(output) ? output : [])
    .map((block) => (block?.type === 'text' ? block.text : ''))
    .join('\n')
    .trim()
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{
 *   cwd: string,
 *   prompt: string,
 *   schema: object,
 *   label?: string,
 *   timeoutMs?: number,
 *   agentPreset?: string,
 * }} input
 * @returns {Promise<{ value: any, sessionId: string, elapsedMs: number, provider: string }>}
 */
export async function runAgentJson(ctx, { cwd, prompt, schema, label = 'devhub-agent', timeoutMs = DEFAULT_TIMEOUT_MS, onStarted = null }) {
  const agents = ctx.get('agents')
  const subagents = ctx.get('subagents')
  if (!agents?.create) throw new Error('当前 DSH 不支持创建工作 agent')
  if (!subagents?.startActivation) throw new Error('当前 DSH 不支持派生子代理')

  // HMR / 启动顺序可能让 provider 注册晚于插件激活：短暂重试，并兼容只能 getProvider 的运行时。
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  let providers = []
  for (let attempt = 0; attempt < 8 && !providers.length; attempt += 1) {
    providers = typeof subagents.list === 'function' ? subagents.list() : []
    if (!providers.length && typeof subagents.getProvider === 'function') {
      providers = ['spawn', 'fork'].filter((name) => subagents.getProvider(name))
    }
    if (!providers.length) await sleep(150)
  }
  const provider = providers.find((name) => /spawn/i.test(name))
    ?? providers.find((name) => /fork/i.test(name))
    ?? providers[0]
  if (!provider) {
    const known = providers.length ? providers.join('、') : '无'
    throw new Error(`没有可用的子代理后端（已注册：${known}；请在插件页启用 subagent/spawn 后重试）`)
  }

  // 复用当前默认模型，否则可能落到没有凭据的默认路由
  const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
  const agentOptions = selection?.provider && selection?.model
    ? { provider: selection.provider, model: selection.model }
    : undefined

  // 子代理要能自己 glob/grep/read：挑一个带完整工具集的预设
  let agentPreset
  try {
    const presets = await ctx.get('agentPresets')?.list?.()
    const list = Array.isArray(presets) ? presets : []
    const preferred = list.find((preset) => /standard/i.test(String(preset?.id ?? '')))
      ?? list.find((preset) => /default|code|dev/i.test(String(preset?.id ?? '')))
      ?? list[0]
    agentPreset = preferred?.id
  } catch {
    agentPreset = undefined
  }

  // 有的后端（如 fork）不支持独立 preset：不支持时不要硬传，否则会在能力校验处被拒
  const providerInfo = typeof subagents.getProvider === 'function' ? subagents.getProvider(provider) : null
  const presetSupported = providerInfo?.capabilities?.agentPreset !== false

  const startedAt = Date.now()
  const sessionId = `${label}-${startedAt.toString(36)}`
  const timer = withTimeout(timeoutMs)
  let handle
  let activation
  try {
    handle = await agents.create({ sessionId, meta: { cwd }, agentOptions, signal: timer.signal })
    // 兼容少数运行时把 create 的返回值直接给成 Agent（而不是 AgentHandle）
    const parent = handle?.agent ?? handle
    if (!parent?.id) throw new Error('agents.create 没有返回可用的 agent 实例')
    // 注意：startActivation 的 spec 就是 SubagentStartRequest 的平铺字段
    // （provider/label/delivery/signal + cwd/parent/prompt/outputSchema），
    // 不能把任务参数再包一层 request——旧写法会让 spec.parent 为 undefined，
    // DSH 在鉴权处读 parent.id 时直接抛 "Cannot read properties of undefined (reading 'id')"。
    activation = await subagents.startActivation({
      provider,
      label,
      delivery: 'caller',
      signal: timer.signal,
      cwd,
      parent,
      ...(agentPreset && presetSupported ? { agentPreset } : {}),
      prompt: [{ type: 'text', text: prompt }],
      outputSchema: schema,
    })
    // 审核员等长任务需要让调用方拿到真正在跑的 child sessionId（不是外层空白 root），
    // 才能把“审核会话”写进台账；外层 sessionId 只是 runAgentJson 自己的临时 root。
    const childSessionId = activation?.childId ?? sessionId
    if (typeof onStarted === 'function') {
      try { await onStarted({ sessionId: childSessionId, parentSessionId: sessionId, provider }) } catch { /* 进度记录失败不影响任务本身 */ }
    }
    const result = await activation.result
    if (result?.stopReason && result.stopReason !== 'completed') {
      throw new Error([
        `agent 未正常完成：${result.stopReason}`,
        result.diagnostic ? `（${result.diagnostic}）` : '',
        textOf(result?.output).slice(-300),
      ].join(''))
    }
    const value = result?.structured ?? extractJson(textOf(result?.output))
    if (!value) throw new Error('agent 输出不是可解析的 JSON')
    return { value, sessionId: childSessionId, parentSessionId: sessionId, elapsedMs: Date.now() - startedAt, provider }
  } finally {
    timer.dispose()
    try { await activation?.dispose?.() } catch { /* 清理失败不影响结果 */ }
    try { await handle?.dispose?.() } catch { /* 同上 */ }
  }
}

/**
 * 不依赖子代理的默认模型调用：给一段 prompt，收文本并解析 JSON。
 * 用于子代理 provider 不可用时的语义兜底（扫描/澄清），失败向上抛由调用方降级。
 */
export async function runLlmJson(ctx, { prompt, system = '你是只读的代码助手。只输出 JSON，不要解释。', timeoutMs = 90_000, maxTokens = 1600 } = {}) {
  const llm = ctx.get('llm')
  if (!llm?.stream) throw new Error('当前 DSH 不支持直接调用模型（ctx.llm 不可用）')
  const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
  if (!selection?.provider || !selection?.model) throw new Error('没有可用的默认模型')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`超时（${Math.round(timeoutMs / 1000)}s）`)), timeoutMs)
  let text = ''
  try {
    for await (const chunk of llm.stream({
      provider: selection.provider,
      model: selection.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: String(prompt ?? '') }] }],
      maxTokens,
      signal: controller.signal,
    })) {
      if (chunk?.type === 'text-delta') text += chunk.text ?? ''
      if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') {
        throw new Error(chunk.reason.failure?.message ?? '模型请求失败')
      }
    }
  } finally {
    clearTimeout(timer)
  }
  const value = extractJson(text)
  if (!value) throw new Error('模型输出不是可解析的 JSON')
  return { value, text, elapsedMs: 0 }
}

/** 从模型输出里抠出第一个完整 JSON 对象（容忍 ```json 包裹与前后废话）。 */
export function extractJson(text) {
  const raw = String(text ?? '')
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  for (const candidate of [fenced?.[1], raw].filter(Boolean)) {
    const start = candidate.indexOf('{')
    if (start < 0) continue
    let depth = 0
    let inString = false
    let escape = false
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i]
      if (inString) {
        if (escape) escape = false
        else if (ch === '\\') escape = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') { inString = true; continue }
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          try { return JSON.parse(candidate.slice(start, i + 1)) } catch { break }
        }
      }
    }
  }
  return null
}

/** 校对路径是否真实存在（agent 会"按命名习惯"编出不存在的文件）。 */
export async function filterExistingPaths(repo, files, limit = 8) {
  const kept = []
  let dropped = 0
  for (const file of (files ?? []).slice(0, limit)) {
    try {
      await access(join(repo, String(file?.path ?? '')))
      kept.push(file)
    } catch {
      dropped += 1
    }
  }
  return { kept, dropped }
}
