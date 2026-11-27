import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('standalone server：路由/静态资源/鉴权/单实例在空 HOME 下可用', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devhub-server-'))
  const home = join(root, 'home')
  const repo = join(root, 'repo')
  await Promise.all([mkdir(home, { recursive: true }), mkdir(repo, { recursive: true })])
  execFileSync('git', ['init', '-q'], { cwd: repo })
  execFileSync('git', ['config', 'user.email', 'server@example.com'], { cwd: repo })
  execFileSync('git', ['config', 'user.name', 'Server Test'], { cwd: repo })
  await writeFile(join(repo, 'README.md'), 'server test\n')
  execFileSync('git', ['add', '.'], { cwd: repo })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: repo })

  const previousHome = process.env.DEVHUB_HOME
  process.env.DEVHUB_HOME = home
  const runtimePath = join(root, 'runtime.json')
  try {
    const { startStandaloneServer } = await import('../src/standalone/server.mjs')
    const instance = await startStandaloneServer({ runtimePath })
    try {
      assert.ok(instance.routes.length >= 60, `routes: ${instance.routes.length}`)
      const auth = { headers: { 'x-devhub-token': instance.token } }
      const health = await fetch(`${instance.url}/health`)
      assert.equal(health.status, 200)
      const body = await health.json()
      assert.equal(body.ok, true)
      assert.equal(body.routes, instance.routes.length)

      const fresh = await fetch(`${instance.url}/api/dev-hub/state`, auth)
      assert.equal(fresh.status, 200)
      const freshBody = await fresh.json()
      assert.equal(freshBody.ok, true)
      assert.equal(freshBody.needsSetup, true)
      assert.equal(freshBody.repo, null)

      const setup = await fetch(`${instance.url}/api/dev-hub/setup`, {
        method: 'POST',
        headers: { ...auth.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ repoPath: repo, name: 'Tester' }),
      })
      assert.equal(setup.status, 200)
      const setupBody = await setup.json()
      assert.equal(setupBody.ok, true)

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

      const second = await startStandaloneServer({ singleInstance: true, runtimePath })
      assert.equal(second.existing, true)
      assert.equal(second.url, instance.url)
      await second.close()
    } finally {
      await instance.close()
    }
  } finally {
    if (previousHome === undefined) delete process.env.DEVHUB_HOME
    else process.env.DEVHUB_HOME = previousHome
    await rm(root, { recursive: true, force: true })
  }
})
