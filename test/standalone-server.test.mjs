import assert from 'node:assert/strict'
import test from 'node:test'

test('standalone M0：现有 Host 路由可在纯 Node HTTP server 上启动', async () => {
  const { startStandaloneServer } = await import('../src/standalone/server.mjs')
  const instance = await startStandaloneServer()
  try {
    assert.equal(instance.routes.length, 60)
    const health = await fetch(`${instance.url}/health`)
    assert.equal(health.status, 200)
    const body = await health.json()
    assert.equal(body.ok, true)
    assert.equal(body.routes, 60)

    const state = await fetch(`${instance.url}/api/dev-hub/state`)
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

    const missing = await fetch(`${instance.url}/api/dev-hub/not-a-route`)
    assert.equal(missing.status, 404)
  } finally {
    await instance.close()
  }
})
