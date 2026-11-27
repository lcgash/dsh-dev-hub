/**
 * M0 spike: run the existing Host routes on a plain Node HTTP server.
 *
 * This deliberately imports the DSH entry (`apply`) only to prove route reuse.
 * M1 will move route registration into `createApp(host)` and remove the DSH
 * import from the standalone runtime.
 */
import { readFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStandaloneContext } from './shim.mjs'

// Set before importing the Host module: it decides whether DSH-only engines/tools
// are available. This flag is process-local and never set by the DSH plugin host.
globalThis.__DEVHUB_STANDALONE__ = true
const { createRoutes } = await import('../index.mjs')

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = join(HERE, '..', '..')
const UI_HTML = join(HERE, 'index.html')
const UI_BUNDLE = join(PLUGIN_ROOT, 'lib', 'standalone.js')

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

/** Start the spike server. Port 0 lets the OS choose a free loopback port. */
export async function startStandaloneServer({ port = 0, host = '127.0.0.1', services = {} } = {}) {
  const shim = createStandaloneContext({ services })
  const routes = createRoutes(shim.ctx)
  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? host}`)
      if (url.pathname === '/health') {
        return send(res, 200, { ok: true, host, routes: routes.length })
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return send(res, 200, await readFile(UI_HTML, 'utf8'), 'text/html; charset=utf-8')
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
  return {
    server,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    routes,
    async close() {
      shim.dispose()
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    },
  }
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  const instance = await startStandaloneServer({ port: Number(process.env.PORT ?? 0) })
  console.log(`[devhub] standalone M0 listening on ${instance.url} (${instance.routes.length} routes)`)
}
