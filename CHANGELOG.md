# Release notes

User-visible changes to **dsh-dev-hub**. Dates are in the author's local time zone.

## 0.2.0-beta.1 — 2026-11-27

### Added

- **Standalone Node server**: `devhub` / `devhub serve` / `devhub doctor`, no DSH installation required.
- Standalone browser UI reuses the same React page and workflow core; React is bundled separately.
- A macOS-style first-run guide introduces scope/context/review, checks Claude Code/Node/Git, then lets the user choose a project. Light/dark and reduced-motion are respected.
- Claude Code is the first standalone engine: background sessions, blocked/running state, bridge CLI, external review, local tests and reports.
- Startup token, Host/Origin checks and attachment query token for the standalone server.
- `DEVHUB_HOME` and legacy `~/.dsh/dev-hub` reuse; `devhub serve --home`.
- Single-instance `runtime.json`: repeated starts reuse a healthy instance.
- `npm pack` installs in a clean environment; DSH peer dependencies are optional.
- Standalone E2E with a temporary git repo and fake Claude CLI.
- Standalone quick-start guide.

### Changed

- `createRoutes(ctx)` extracted from the DSH `apply`; both hosts share the same routes.
- `@deepseek-ai/dsh-tools` is optional at import time.
- Standalone defaults to Claude and hides the DSH engine; it does not rewrite the user's DSH profile.

### Boundaries

- v0.1 only gates Claude Code; Codex/Pi paths remain but are not in the release gate.
- No DSH native engine in standalone.
- No Electron shell, auto-update or signed installers yet.

