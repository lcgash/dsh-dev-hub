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
import { spawn, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

// 独立版有旧 DSH 配置就复用（worktree/profile 不丢）；全新用户用 ~/.devhub。
// 必须在 import Host 模块之前设置，Host 的 PROFILE_DIR 是模块级常量。
if (!process.env.DEVHUB_HOME) {
  const legacy = join(homedir(), '.dsh', 'dev-hub')
  process.env.DEVHUB_HOME = existsSync(legacy) ? legacy : join(homedir(), '.devhub')
}

function usage() {
  console.error(`DevHub CLI

  devhub                        启动本机 Node Server 并打开浏览器
  devhub serve [--port N] [--no-open] [--host H] [--home DIR]
  devhub doctor                 检查 node/git/claude 能力
  devhub get --bridge <bridge.json>
  devhub update --bridge <bridge.json> [options]

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

function openBrowser(url) {
  try {
    if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    else if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  } catch { /* 无浏览器环境：URL 已打印，用户可手动打开 */ }
}

function parseHostArgs(argv) {
  const out = { port: 0, host: '127.0.0.1', open: true, home: '' }
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (value === '--no-open') out.open = false
    else if (value === '--port') out.port = Number(argv[++i] ?? 0)
    else if (value === '--host') out.host = String(argv[++i] ?? '127.0.0.1')
    else if (value === '--home') out.home = String(argv[++i] ?? '')
  }
  if (!Number.isInteger(out.port) || out.port < 0) throw new Error('--port 必须是 0 或正整数')
  return out
}

function which(bin) {
  const command = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(command, [bin], { encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout).trim().split(/\r?\n/)[0] : null
}

async function runHostCommand(argv) {
  const command = argv[0] === 'serve' || argv[0] === 'open' ? 'serve' : (argv[0] ?? 'serve')
  if (command === 'doctor') {
    console.log(`node    ${process.version}`)
    console.log(`home    ${process.env.DEVHUB_HOME}`)
    console.log(`git     ${which('git') ?? '未检测到'}`)
    console.log(`claude  ${which('claude') ?? '未检测到'}`)
    console.log(`codex   ${which('codex') ?? '未检测到'}`)
    console.log(`pi      ${which('pi') ?? '未检测到'}`)
    return
  }
  if (command !== 'serve') throw new Error(`未知命令：${command}`)
  const options = parseHostArgs(argv.slice(1))
  // --home 必须在本进程 import Host 前生效（PROFILE_DIR 是模块级常量）。
  if (options.home) process.env.DEVHUB_HOME = options.home
  const { startStandaloneServer } = await import('../src/standalone/server.mjs')
  const instance = await startStandaloneServer({ ...options, singleInstance: true })
  console.log(instance.existing
    ? `[devhub] 已有实例在运行：${instance.url}`
    : `[devhub] ${instance.url}  (${instance.routes.length} routes)`)
  if (!instance.existing) console.log('[devhub] 关闭：Ctrl+C')
  if (options.open) openBrowser(instance.url)
  if (instance.existing) return
  await new Promise((resolve) => {
    const stop = () => { instance.close().then(resolve, resolve) }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
}

async function main() {
  const argv = process.argv.slice(2)
  if (!argv.length || ['serve', 'open', 'doctor', '--help', '-h'].includes(argv[0])) {
    if (argv[0] === '--help' || argv[0] === '-h') { usage(); return }
    return runHostCommand(argv)
  }
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
