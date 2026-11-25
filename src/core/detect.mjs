import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import { canonical, exists } from './paths.mjs'

const execFileAsync = promisify(execFile)
const IS_WINDOWS = process.platform === 'win32'

/** Run one fixed command with a short timeout; never use a shell string. */
export async function run(command, args = [], options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      timeout: options.timeout ?? 4000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      cwd: options.cwd,
      env: process.env,
    })
    return { ok: true, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? ''), code: 0 }
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout ?? ''),
      stderr: String(error?.stderr ?? error?.message ?? ''),
      code: typeof error?.code === 'number' ? error.code : -1,
    }
  }
}

function firstLine(text) {
  return String(text ?? '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? ''
}

/** Locate a command without a shell. */
export async function which(command) {
  const result = await run(IS_WINDOWS ? 'where' : 'which', [command], { timeout: 2500 })
  if (!result.ok) return null
  const path = firstLine(result.stdout)
  return path || null
}

/** Read a command version with a small fixed command table. */
async function probe(command, args) {
  const path = await which(command)
  if (!path) return { available: false, path: null, version: null }
  const result = await run(path, args, { timeout: 5000 })
  const text = result.ok ? result.stdout : result.stderr
  return { available: true, path, version: firstLine(text) || null }
}

function parseJavaMajor(versionText) {
  const match = String(versionText ?? '').match(/version "(\d+)(?:\.(\d+))?/)
  if (!match) return null
  const first = Number(match[1])
  if (first === 1 && match[2]) return Number(match[2])
  return first
}

async function javaAt(path) {
  const executable = join(path, 'bin', IS_WINDOWS ? 'java.exe' : 'java')
  if (!(await exists(executable))) return null
  const result = await run(executable, ['-version'], { timeout: 5000 })
  const text = (result.stderr || result.stdout).trim()
  if (!text) return null
  return {
    path: await canonical(path),
    executable,
    version: firstLine(text),
    major: parseJavaMajor(text),
  }
}

/** Candidate directories that commonly contain JDK installations. */
async function jdkCandidates() {
  const out = []
  const add = (value) => {
    if (value) out.push(value)
  }
  add(process.env.JAVA_HOME)
  const home = homedir()
  if (process.platform === 'darwin') {
    add(join(home, 'Library/Java/JavaVirtualMachines'))
    add('/Library/Java/JavaVirtualMachines')
  }
  if (process.platform === 'linux') {
    add('/usr/lib/jvm')
    add('/usr/java')
  }
  if (IS_WINDOWS) {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]) {
      if (base) add(join(base, 'Java'))
      if (base) add(join(base, 'Eclipse Adoptium'))
    }
  }
  const java = await which('java')
  if (java) add(dirname(dirname(java)))
  const unique = [...new Set(out.map((value) => value.trim()).filter(Boolean))]
  const result = []
  for (const base of unique) {
    if (!(await exists(base))) continue
    result.push(base)
    try {
      const entries = await readdir(base, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const path = join(base, entry.name)
        result.push(path)
        if (await exists(join(path, 'Contents', 'Home'))) result.push(join(path, 'Contents', 'Home'))
      }
    } catch {
      // unreadable candidate: ignore
    }
  }
  return result
}

/** Discover installed JDKs (deduplicated, current JDK first). */
export async function detectJdks() {
  const current = await which('java')
  const currentHome = current ? dirname(dirname(await canonical(current))) : null
  const candidates = await jdkCandidates()
  if (currentHome) candidates.unshift(currentHome)
  const seen = new Set()
  const jdks = []
  for (const candidate of candidates) {
    const jdk = await javaAt(candidate)
    if (!jdk || seen.has(jdk.path)) continue
    seen.add(jdk.path)
    jdks.push(jdk)
  }
  jdks.sort((a, b) => (b.major ?? 0) - (a.major ?? 0) || a.path.localeCompare(b.path))
  return { jdks, current: jdk(currentHome, jdks) }
}

function jdk(home, jdks) {
  if (!home) return jdks[0] ?? null
  const canonicalHome = home
  return jdks.find((item) => item.path === canonicalHome) ?? jdks[0] ?? null
}

async function detectShell() {
  if (IS_WINDOWS) {
    return { path: process.env.ComSpec || 'cmd.exe', name: 'cmd', wsl: false }
  }
  const path = process.env.SHELL || '/bin/sh'
  let wsl = false
  try {
    const proc = await stat('/proc/version')
    if (proc) {
      const { readFile } = await import('node:fs/promises')
      wsl = /microsoft/i.test(await readFile('/proc/version', 'utf8'))
    }
  } catch {
    // not Linux
  }
  return { path, name: path.split(/[\\/]/).pop() || path, wsl }
}

/** Fixed tool list; adding a tool here is an explicit, reviewable change. */
const TOOLS = [
  ['git', ['--version']],
  ['node', ['--version']],
  ['npm', ['--version']],
  ['pnpm', ['--version']],
  ['yarn', ['--version']],
  ['bun', ['--version']],
  ['mvn', ['-v']],
  ['docker', ['--version']],
  ['mysql', ['--version']],
  ['psql', ['--version']],
  ['redis-cli', ['--version']],
  ['curl', ['--version']],
  ['jq', ['--version']],
]

/** Detect OS, shell, JDKs and available developer tools. */
export async function detectEnvironment(repoPath) {
  const [shell, javaInfo, tools] = await Promise.all([
    detectShell(),
    detectJdks(),
    (async () => {
      const entries = {}
      for (const [name, args] of TOOLS) entries[name] = await probe(name, args)
      return entries
    })(),
  ])
  const git = tools.git
  return {
    schemaVersion: 1,
    detectedAt: new Date().toISOString(),
    repo: repoPath,
    os: IS_WINDOWS ? 'windows' : process.platform === 'darwin' ? 'macos' : shell.wsl ? 'wsl' : 'linux',
    arch: process.arch,
    platform: process.platform,
    shell,
    jdks: javaInfo.jdks,
    currentJdk: javaInfo.current,
    tools,
    available: Object.entries(tools).filter(([, value]) => value.available).map(([name]) => name),
    missing: Object.entries(tools).filter(([, value]) => !value.available).map(([name]) => name),
    git: git?.available ? { available: true, version: git.version, path: git.path } : { available: false },
  }
}

export { IS_WINDOWS, parseJavaMajor }
