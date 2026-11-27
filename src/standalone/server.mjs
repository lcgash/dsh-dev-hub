/**
 * DevHub standalone Node server.
 *
 * Routes are the same `createRoutes(ctx)` used by the DSH plugin; the difference
 * is the HostContext and the browser mount, not the workflow logic.
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createServer as createHttpServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStandaloneContext } from './context.mjs'

// Set before importing the Host module: it decides whether DSH-only engines/tools
// are available. This flag is process-local and never set by the DSH plugin host.
globalThis.__DEVHUB_STANDALONE__ = true
const { createRoutes } = await import('../index.mjs')

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = join(HERE, '..', '..')
const UI_HTML = join(HERE, 'index.html')
const UI_BUNDLE = join(PLUGIN_ROOT, 'lib', 'standalone.js')
const RUNTIME_PATH = join(process.env.DEVHUB_HOME || join(homedir(), '.dsh', 'dev-hub'), 'runtime.json')

function tokenOf(req, url) {
  const header = String(req.headers['x-devhub-token'] ?? '').trim()
  if (header) return header
  return String(url.searchParams.get('token') ?? '').trim()
}

function hostnameOf(hostHeader) {
  const value = String(hostHeader ?? '').trim().toLowerCase()
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1)
  return value.split(':')[0]
}

function isLocalHostname(name) {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(name ?? '').toLowerCase())
}

/** 本地 server 只接受 loopback Host/Origin，挡住 DNS rebinding 页面。 */
function isLocalRequest(req, configuredHost) {
  const hostName = hostnameOf(req.headers.host)
  if (!isLocalHostname(hostName) && hostName !== String(configuredHost ?? '').toLowerCase()) return false
  const origin = String(req.headers.origin ?? '').trim()
  if (!origin) return true
  try {
    const parsed = new URL(origin)
    return isLocalHostname(parsed.hostname) || parsed.hostname === String(configuredHost ?? '').toLowerCase()
  } catch {
    return false
  }
}

function isBridgeRoute(pathname) {
  // bridge CLI 自己校验 bridge token；不能再要求浏览器启动 token，否则 Claude 会话无法回写。
  return pathname === '/api/dev-hub/cli'
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

async function readRunningRuntime() {
  try {
    const runtime = JSON.parse(await readFile(RUNTIME_PATH, 'utf8'))
    if (!runtime?.url) return null
    const response = await fetch(`${runtime.url}/health`, { signal: AbortSignal.timeout(1500) })
    if (!response.ok) return null
    return runtime
  } catch {
    return null
  }
}

async function writeRuntime(url) {
  try {
    await mkdir(dirname(RUNTIME_PATH), { recursive: true })
    await writeFile(RUNTIME_PATH, JSON.stringify({ url, pid: process.pid, startedAt: new Date().toISOString() }, null, 2), 'utf8')
  } catch { /* runtime 只是加速器；写失败不影响 server */ }
}

async function clearRuntime(url) {
  try {
    const runtime = JSON.parse(await readFile(RUNTIME_PATH, 'utf8'))
    if (runtime?.url === url) await unlink(RUNTIME_PATH)
  } catch { /* 没文件/坏文件都不用处理 */ }
}

/** Start the standalone server. Port 0 lets the OS choose a free loopback port. */
export async function startStandaloneServer({ port = 0, host = '127.0.0.1', services = {}, singleInstance = false } = {}) {
  if (singleInstance) {
    const running = await readRunningRuntime()
    if (running) {
      return {
        existing: true,
        server: null,
        port: Number(new URL(running.url).port) || 0,
        url: String(running.url),
        token: null,
        routes: [],
        async close() { /* 已有实例不归本次调用所有 */ },
      }
    }
  }
  const hostContext = createStandaloneContext({ services })
  const routes = createRoutes(hostContext.ctx)
  const serverToken = randomUUID()
  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? host}`)
      if (!isLocalRequest(req, host)) {
        return send(res, 403, { ok: false, error: 'forbidden: non-local Host/Origin' })
      }
      if (url.pathname === '/health') {
        return send(res, 200, { ok: true, host, routes: routes.length })
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = (await readFile(UI_HTML, 'utf8')).replace('__DEVHUB_TOKEN_VALUE__', serverToken)
        return send(res, 200, html, 'text/html; charset=utf-8')
      }
      if (url.pathname.startsWith('/api/') && !isBridgeRoute(url.pathname) && tokenOf(req, url) !== serverToken) {
        return send(res, 403, { ok: false, error: 'forbidden: bad or missing devhub token' })
      }
      if (url.pathname === '/assets/standalone.js') {
        return send(res, 200, await readFile(UI_BUNDLE, 'utf8'), 'text/javascript; charset=utf-8')
      }
      const route = routes.find((entry) => entry.kind === 'exact' && entry.path === url.pathname)
      if (!route) return send(res, 404, { ok: false, error: `no route: ${url.pathname}` })
      await route.handler(req, res)
    } catch (error) {
      if (!res.headersSent) send(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  const url = `http://${host}:${actualPort}`
  await writeRuntime(url)
  return {
    server,
    port: actualPort,
    url,
    token: serverToken,
    routes,
    async close() {
      hostContext.dispose()
      await clearRuntime(url)
      // fetch/undici 会复用 keep-alive 连接，close() 单靠等待会一直挂着。
      server.closeIdleConnections?.()
      server.closeAllConnections?.()
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    },
  }
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  const instance = await startStandaloneServer({ port: Number(process.env.PORT ?? 0) })
  console.log(`[devhub] standalone M0 listening on ${instance.url} (${instance.routes.length} routes)`)
}
