/**
 * 外部 CLI 的新工作区信任：
 * - Claude 普通 CLI 没有 --trust-workspace（只有 self-hosted-runner 有），
 *   必须写 ~/.claude.json 的 hasTrustDialogAccepted；
 * - Codex 用 exec --trust + config.toml [projects]；
 * - Pi 用 --approve。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const { withClaudeWorkspaceTrust, withCodexWorkspaceTrust } = await import('../src/core/trust.mjs')

test('Claude 信任：写入 projects[path].hasTrustDialogAccepted，保留已有字段', () => {
  const config = { projects: { '/repo/a': { allowedTools: ['Read'], lastCost: 1.2 } }, other: { x: 1 } }
  const next = withClaudeWorkspaceTrust(config, ['/repo/a', '/repo/worktree'])
  assert.equal(next.changed, true)
  assert.equal(next.config.projects['/repo/a'].hasTrustDialogAccepted, true)
  assert.equal(next.config.projects['/repo/a'].lastCost, 1.2)
  assert.deepEqual(next.config.projects['/repo/a'].allowedTools, ['Read'])
  assert.equal(next.config.projects['/repo/worktree'].hasTrustDialogAccepted, true)
  assert.equal(next.config.other.x, 1)

  // 已经是受信任：不重复写
  const again = withClaudeWorkspaceTrust(next.config, ['/repo/a'])
  assert.equal(again.changed, false)
})

test('Codex 信任：补 [projects] trust_level，已存在的 section 不重复追加', () => {
  const source = `[projects.'/old']\ntrust_level = 'trusted'\n\n[sandbox_workspace_write]\nwritable_roots = ['/x']\n`
  const next = withCodexWorkspaceTrust(source, ['/new/worktree'])
  assert.equal(next.changed, true)
  assert.match(next.text, /\[projects\."\/new\/worktree"\]\ntrust_level = 'trusted'/)
  assert.equal((next.text.match(/\[projects\./g) ?? []).length, 2)

  // 已有同名 section 但未信任：改成 trusted，不追加重复 section
  const untrusted = `[projects.'/repo']\ntrust_level = 'untrusted'\nother = 'keep'\n`
  const fixed = withCodexWorkspaceTrust(untrusted, ['/repo'])
  assert.equal(fixed.changed, true)
  assert.match(fixed.text, /trust_level = 'trusted'/)
  assert.doesNotMatch(fixed.text, /untrusted/)
  assert.match(fixed.text, /other = 'keep'/)
  assert.equal((fixed.text.match(/\[projects\./g) ?? []).length, 1)

  const trusted = `[projects.'/repo']\ntrust_level = 'trusted'\n`
  assert.equal(withCodexWorkspaceTrust(trusted, ['/repo']).changed, false)
})

test('Claude/Codex/Pi 启动路径真的接上了信任处理', async () => {
  const index = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
  const claude = index.slice(index.indexOf('async function runClaudeBackground('), index.indexOf('function claudeLaunchError', index.indexOf('async function runClaudeBackground(')))
  assert.match(claude, /ensureClaudeWorkspaceTrust\(root\)/)
  assert.doesNotMatch(claude, /--trust-workspace/, '普通 claude CLI 不认识 --trust-workspace，不能传')
  assert.match(index, /async function openClaudeTerminal/)
  assert.match(index, /await ensureClaudeWorkspaceTrust\(work\)/)

  const codex = index.slice(index.indexOf('async function runCodexJson('), index.indexOf('async function runPiJson('))
  assert.match(codex, /'--trust'/)
  assert.match(codex, /unknown option '--trust'/)
  const pi = index.slice(index.indexOf('async function runPiJson('), index.indexOf('async function runExternalJson'))
  assert.match(pi, /'--approve'/)
  assert.match(pi, /unknown option '--approve'/)
  assert.match(index, /ensureCodexWorkspaceTrust\(root\)/)
  assert.match(index, /engine === 'pi' \? 'pi --approve' : 'codex'/)
})
