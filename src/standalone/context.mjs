/**
 * Standalone HostContext.
 *
 * Existing routes still accept the Cordis-shaped `ctx` surface (get/sessions/
 * agents). Standalone implements only what the external-CLI path needs; DSH-
 * only services are deliberately null instead of pretending to exist.
 */
export function createStandaloneContext({ services = {}, sessions, agents } = {}) {
  const routes = []
  const disposers = []
  const ctx = {
    get(name) {
      return services[name] ?? null
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
    },
    sessions: sessions ?? {
      get() { return undefined },
      list() { return [] },
      retain() { throw new Error('standalone host 不支持 DSH 会话') },
      create() { throw new Error('standalone host 不支持 DSH 会话') },
    },
    agents: agents ?? {
      get() { return undefined },
      list() { return [] },
    },
  }
  return {
    ctx,
    routes,
    dispose() {
      while (disposers.length) {
        try { disposers.pop()?.() } catch { /* best effort */ }
      }
      routes.length = 0
    },
  }
}
