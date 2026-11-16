import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { repoRelative, safeId } from './paths.mjs'

const MAX_CANDIDATES = 40
const MAX_SUMMARY = 400
const SKIP = /^(附录|目录|参考|变更记录|修订记录|版本历史)$/i

async function walkDocs(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'archive' || entry.name === 'screenshots') continue
      out.push(...await walkDocs(path))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(path)
    }
  }
  return out
}

function cleanHeading(value) {
  return String(value ?? '').replace(/[*`_#]/g, '').trim()
}

/** Scan Markdown headings as candidate development items. */
export async function scanCandidates(repo) {
  const roots = [join(repo, 'docs/design'), join(repo, 'docs')]
  const files = new Set()
  for (const root of roots) {
    try {
      const info = await stat(root)
      if (!info.isDirectory()) continue
      for (const file of await walkDocs(root)) files.add(file)
    } catch {
      // absent directory
    }
  }
  for (const name of ['AGENTS.md', 'README.md']) {
    try {
      const info = await stat(join(repo, name))
      if (info.isFile()) files.add(join(repo, name))
    } catch {
      // absent
    }
  }
  const candidates = []
  for (const file of [...files].sort()) {
    const text = await readFile(file, 'utf8').catch(() => '')
    if (!text) continue
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const match = /^(#{2,3})\s+(.+?)\s*$/.exec(lines[i])
      if (!match) continue
      const title = cleanHeading(match[2])
      if (!title || title.length > 120 || SKIP.test(title)) continue
      const body = []
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#{1,3}\s+/.test(lines[j])) break
        const line = lines[j].trim()
        if (line) body.push(line)
        if (body.join('\n').length > MAX_SUMMARY) break
      }
      const summary = body.join(' ').slice(0, MAX_SUMMARY)
      candidates.push({
        id: safeId(`${repoRelative(repo, file)}-${i + 1}`),
        title,
        source: { path: repoRelative(repo, file), line: i + 1 },
        summary,
      })
      if (candidates.length >= MAX_CANDIDATES) return dedupe(candidates)
    }
  }
  return dedupe(candidates)
}

function dedupe(candidates) {
  const seen = new Set()
  const out = []
  for (const candidate of candidates) {
    const key = candidate.title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(candidate)
  }
  return out
}
