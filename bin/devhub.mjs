#!/usr/bin/env node
/**
 * DevHub CLI bridge for external agents (Claude Code, Codex, ...).
 *
 * Usage:
 *   devhub get --bridge /path/to/bridge.json
 *   devhub update --bridge /path/to/bridge.json --task "..." --done
 *   devhub update --bridge /path/to/bridge.json --change-point "..."
 *   devhub update --bridge /path/to/bridge.json --risk "..."
 *
 * The bridge file is created by the workstation when a Claude Code session starts.
 * It contains the loopback URL, a one-time token and the flow id; never commit it.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

function usage() {
  console.error(`DevHub CLI

  node bin/devhub.mjs get --bridge <bridge.json>
  node bin/devhub.mjs update --bridge <bridge.json> [options]

Options:
  --task <text>          task text (creates or updates)
  --done                 mark --task done (default true)
  --undone               mark --task not done
  --change-point <text>  add a semantic change point
  --risk <text>          add a risk/blocker
  --status <status>      planned|designing|developing|reviewing|verifying|blocked|done
  --root-problem <text>
  --plan-summary <text>
  --bridge <path>        bridge JSON (or DEVHUB_BRIDGE env)
  --json                 raw JSON output (default)
`)
}

function parse(argv) {
  const out = { args: {}, action: 'get', bridge: process.env.DEVHUB_BRIDGE || '' }
  const rest = []
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    switch (value) {
      case '--bridge': out.bridge = argv[++i] ?? ''; break
      case '--task': out.args.taskText = argv[++i] ?? ''; break
      case '--change-point': out.args.changePoint = argv[++i] ?? ''; break
      case '--risk': out.args.risk = argv[++i] ?? ''; break
      case '--status': out.args.status = argv[++i] ?? ''; break
      case '--root-problem': out.args.rootProblem = argv[++i] ?? ''; break
      case '--plan-summary': out.args.planSummary = argv[++i] ?? ''; break
      case '--done': out.args.taskDone = true; break
      case '--undone': out.args.taskDone = false; break
      case '--json': break
      case '--help': case '-h': out.help = true; break
      default:
        if (!value.startsWith('-')) rest.push(value)
        else throw new Error(`未知参数：${value}`)
    }
  }
  if (rest[0]) out.action = rest[0]
  return out
}

async function main() {
  let parsed
  try { parsed = parse(process.argv.slice(2)) } catch (error) {
    usage(); throw error
  }
  if (parsed.help) { usage(); return }
  if (!parsed.bridge) throw new Error('缺少 --bridge，或设置 DEVHUB_BRIDGE')
  if (!existsSync(parsed.bridge)) throw new Error(`bridge 文件不存在：${parsed.bridge}`)
  const bridge = JSON.parse(await readFile(parsed.bridge, 'utf8'))
  if (!bridge?.url || !bridge?.token) throw new Error('bridge 文件缺少 url/token')
  const payload = JSON.stringify({
    token: bridge.token,
    action: parsed.action,
    args: parsed.args,
  })
  async function post(url) {
    return fetch(new URL('/api/dev-hub/cli', url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-devhub-token': String(bridge.token),
      },
      body: payload,
    })
  }
  let response
  try {
    response = await post(bridge.url)
  } catch (firstError) {
    // DevHub 重启后端口会变：bridge 文件里的旧地址连不上时，
    // 用本机 runtime.json 里的当前地址重试一次；不要求用户重开会话。
    const runtimePaths = [
      join(dirname(parsed.bridge), '..', 'runtime.json'),
      join(process.env.DEVHUB_HOME || join(homedir(), '.dsh', 'dev-hub'), 'runtime.json'),
    ]
    let runtime = null
    for (const runtimePath of runtimePaths) {
      try { runtime = JSON.parse(await readFile(runtimePath, 'utf8')) } catch { runtime = null }
      if (runtime?.url) break
    }
    if (!runtime?.url || runtime.url === bridge.url) {
      throw new Error(`连不上 DevHub（${bridge.url}）：它可能已重启。在工作站打开一次页面刷新运行时地址后再试（不需要重开本会话）。原因：${String(firstError?.message ?? firstError)}`)
    }
    response = await post(runtime.url)
    // 回写 bridge 文件，后续调用直接走新地址
    try {
      bridge.url = runtime.url
      await writeFile(parsed.bridge, JSON.stringify(bridge, null, 2), 'utf8')
    } catch { /* 回写失败不影响本次请求 */ }
  }
  const body = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))
  if (!response.ok || body?.ok === false) throw new Error(body?.error ?? `HTTP ${response.status}`)
  process.stdout.write(JSON.stringify(body.item ?? body, null, 2) + '\n')
}

main().catch((error) => {
  console.error(`devhub: ${String(error?.message ?? error)}`)
  process.exitCode = 1
})
