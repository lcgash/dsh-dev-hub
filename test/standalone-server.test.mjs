import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('standalone M0：现有 Host 路由可在纯 Node HTTP server 上启动', async () => {
  const { startStandaloneServer } = await import('../src/standalone/server.mjs')
  const runtimeDir = await mkdtemp(join(tmpdir(), 'devhub-runtime-'))
  const runtimePath = join(runtimeDir, 'runtime.json')
  const instance = await startStandaloneServer({ runtimePath })
  try {
    assert.ok(instance.routes.length >= 60, `routes: ${instance.routes.length}`)
    const auth = { headers: { 'x-devhub-token': instance.token } }
    const health = await fetch(`${instance.url}/health`)
    assert.equal(health.status, 200)
    const body = await health.json()
    assert.equal(body.ok, true)
    assert.equal(body.routes, instance.routes.length)

    const state = await fetch(`${instance.url}/api/dev-hub/state`, auth)
    assert.equal(state.status, 200)
    const stateBody = await state.json()
    assert.equal(stateBody.ok, true)
    assert.ok(stateBody.repo || stateBody.workspace)

    const page = await fetch(`${instance.url}/`)
    assert.equal(page.status, 200)
    const html = await page.text()
    assert.match(html, /devhub-root/)
    assert.match(html, /\/assets\/standalone\.js/)

    const bundle = await fetch(`${instance.url}/assets/standalone.js`)
    assert.equal(bundle.status, 200)
    const js = await bundle.text()
    assert.match(js, /createRoot/)
    assert.doesNotMatch(js, /__ModuleLoader__/)

    const settings = await fetch(`${instance.url}/api/dev-hub/settings`, auth)
    assert.equal(settings.status, 200)
    const settingsBody = await settings.json()
    assert.equal(settingsBody.dshAvailable, false)
    assert.equal(settingsBody.engine, 'claude')

    const capabilities = await fetch(`${instance.url}/api/dev-hub/capabilities`, auth)
    assert.equal(capabilities.status, 200)
    const capabilitiesBody = await capabilities.json()
    assert.equal(capabilitiesBody.standalone, true)
    assert.equal(capabilitiesBody.engines.dsh, false)

    const denied = await fetch(`${instance.url}/api/dev-hub/state`)
    assert.equal(denied.status, 403)

    const missing = await fetch(`${instance.url}/api/dev-hub/not-a-route`, auth)
    assert.equal(missing.status, 404)
    // 单实例：第二个进程不再开新 server，而是复用已有实例。
    const second = await startStandaloneServer({ singleInstance: true, runtimePath })
    assert.equal(second.existing, true)
    assert.equal(second.url, instance.url)
    await second.close()
  } finally {
    await instance.close()
    await rm(runtimeDir, { recursive: true, force: true })
  }
})
