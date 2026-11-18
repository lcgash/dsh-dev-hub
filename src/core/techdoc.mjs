/**
 * 技术文档（技术方案）：纯逻辑，不读盘、不调模型。
 *
 * 设计要点：
 * - 生成内容与用户补充分开：文件里用 marker 标出 generated/user 两段，重新生成只替换
 *   generated 段，用户写的补充（台账里的 supplement）不会被覆盖；
 * - 不存任何飞书 token：飞书文档只记 URL，认证由本机 lark-cli 登录态负责；
 * - 冲突显式：文件被手工改过/没有 marker 时不静默覆盖，返回冲突让界面选择覆盖或合并。
 */

import { createHash } from 'node:crypto'

export const GENERATED_BEGIN = '<!-- devhub:generated:begin -->'
export const GENERATED_END = '<!-- devhub:generated:end -->'
export const USER_BEGIN = '<!-- devhub:user:begin -->'
export const USER_END = '<!-- devhub:user:end -->'

export const SUPPLEMENT_MAX = 20000
export const SUPPLEMENT_PLACEHOLDER = '（暂无补充：可以直接在这里写方案说明，重新生成不会覆盖）'

export const DEFAULT_DOCS_CONFIG = {
  provider: 'feishu',
  local: { path: 'docs/design/{id}.md' },
  feishu: { titleTemplate: '{title} 技术方案' },
  fallback: 'local',
}

/** 仓库级文档配置：provider 只认四态，路径模板缺省回退 docs/design/{id}.md。 */
export function normalizeDocsConfig(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const provider = ['feishu', 'local', 'link', 'none'].includes(value.provider) ? value.provider : DEFAULT_DOCS_CONFIG.provider
  const local = value.local && typeof value.local === 'object' ? value.local : {}
  const feishu = value.feishu && typeof value.feishu === 'object' ? value.feishu : {}
  return {
    provider,
    local: {
      path: String(local.path ?? '').trim() || DEFAULT_DOCS_CONFIG.local.path,
    },
    feishu: {
      titleTemplate: String(feishu.titleTemplate ?? '').trim() || DEFAULT_DOCS_CONFIG.feishu.titleTemplate,
    },
    fallback: ['local', 'none'].includes(value.fallback) ? value.fallback : DEFAULT_DOCS_CONFIG.fallback,
  }
}

export function hashText(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 16)
}

/** 路径模板：{id} / {title} / {repo}；只允许仓库内相对路径。 */
export function expandDocPath(template, { id, title, repoName } = {}) {
  const raw = String(template ?? '')
    .replaceAll('{id}', String(id ?? 'item'))
    .replaceAll('{title}', String(title ?? '').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60) || 'tech-doc')
    .replaceAll('{repo}', String(repoName ?? '').replace(/[\\/:*?"<>|\s]+/g, '-'))
  const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '').trim()
  if (!normalized) return ''
  const segments = normalized.split('/')
  if (normalized.startsWith('/') || segments.includes('..') || segments[0] === '.git') {
    throw new Error(`技术文档路径不合法：${template}`)
  }
  return normalized
}

function list(items, empty = '（未填写）') {
  return items?.length ? items.map((entry) => `- ${entry}`).join('\n') : `- ${empty}`
}

function fileLines(files, { why = false } = {}) {
  if (!files?.length) return '- （未探测到候选文件）'
  return files.slice(0, 12).map((file) => {
    const path = String(file?.path ?? '')
    const note = why && file?.why ? `：${file.why}` : ''
    return `- \`${path}\`${note}`
  }).join('\n')
}

/** 生成结构化技术方案（不含用户补充；不含 marker）。 */
export function buildTechDocMarkdown(item, { repoName = '', generatedAt = new Date().toISOString() } = {}) {
  const workflow = item?.workflow ?? {}
  const plan = workflow.plan ?? {}
  const estimate = plan.estimate ?? {}
  const intent = workflow.intent === 'analysis' ? '分析' : workflow.intent === 'bug' ? '缺陷修复' : workflow.intent === 'refactor' ? '代码重构' : '功能需求'
  const scope = item?.scope ?? []
  const reconFiles = (item?.recon?.files ?? []).filter(Boolean)
  const changePoints = (item?.changePoints ?? []).map((point) => point?.summary).filter(Boolean)
  const lines = [
    `# ${item?.title || item?.id || '未命名流程'}`,
    '',
    `> 由 DevHub 工作站生成 · ${generatedAt} · 类型：${intent}`,
    '',
    '## 1. 背景与目标',
    '',
    `- 代码库：${repoName || '（未记录）'}`,
    `- 开发项：${item?.id ?? ''}`,
    `- 目标：${item?.goal || '（未填写）'}`,
    `- 根本问题：${workflow.rootProblem || '（待确认）'}`,
    '',
    '## 2. 现状、约束与非目标',
    '',
    '### 现状与约束',
    '',
    ...(workflow.questions ?? []).filter((question) => question.answer).slice(0, 4)
      .map((question) => `- ${question.question}：${question.answer}`),
    ...(workflow.background ? [`- 背景：${workflow.background}`] : []),
    ...(workflow.expected ? [`- 期望：${workflow.expected}`] : []),
    '',
    '### 非目标',
    '',
    list(item?.nonGoals),
    '',
    '## 3. 方案设计',
    '',
    `- 计划摘要：${plan.summary || '（未填写）'}`,
    ...(plan.steps?.length ? ['', '实施步骤：', ...plan.steps.map((step) => `- [ ] ${step}`)] : []),
    ...(changePoints.length ? ['', '已识别变更点：', ...changePoints.map((point) => `- ${point}`)] : []),
    '',
    '### 关键文件与模块',
    '',
    fileLines(scope.map((entry) => ({ path: entry }))),
    '',
    ...(reconFiles.length ? ['### 探测到的相关文件', '', fileLines(reconFiles, { why: true }), ''] : []),
    '## 4. 接口 / 数据 / 兼容与回滚',
    '',
    ...(scope.some((entry) => /controller|api|db|migration|\.sql$|i18n|messages/i.test(entry))
      ? ['- 命中了接口/库表/文案相关范围：需要同步契约、迁移与三语 key。']
      : ['- 未命中接口/库表/文案范围（以实际改动为准）。']),
    '- 兼容与迁移：待补充（如有存量数据/对外契约变更，请在这里写清迁移与回滚）。',
    '- 回滚方式：待补充。',
    '',
    '## 5. 风险与未决问题',
    '',
    ...(item?.risks?.length ? item.risks.map((risk) => `- ${risk}`) : ['- 暂无已登记风险']),
    ...(workflow.missing?.length ? ['', '未确认：', ...workflow.missing.map((entry) => `- ${entry}`)] : []),
    '',
    '## 6. 验收与测试',
    '',
    ...(item?.acceptance?.length ? item.acceptance.map((entry) => `- ${entry}`) : ['- （未填写验收标准）']),
    '',
    `- 工程量（工作站自评）：${estimate.size || '?'} / ${estimate.days ?? '?'} 人日 / 置信度 ${estimate.confidence || '?'}`,
    '',
    '## 7. 附件与参考',
    '',
    ...((item?.attachments ?? []).length
      ? item.attachments.map((entry) => `- ${entry.kind === 'image' ? '图片' : '文件'}：\`${entry.path}\``)
      : ['- 无随需求提供的附件']),
    '',
  ]
  return lines.join('\n')
}

/** 生成完整本地文件内容：generated 段 + user 段（用户补充不会被覆盖）。 */
export function renderLocalDoc(item, { repoName = '', supplement = '', generatedAt = new Date().toISOString() } = {}) {
  const generated = buildTechDocMarkdown(item, { repoName, generatedAt })
  const user = String(supplement ?? '').trim() || SUPPLEMENT_PLACEHOLDER
  return [
    GENERATED_BEGIN,
    generated.trimEnd(),
    GENERATED_END,
    '',
    '## 8. 我的补充',
    '',
    USER_BEGIN,
    user,
    USER_END,
    '',
  ].join('\n')
}

function between(content, begin, end) {
  const start = String(content ?? '').indexOf(begin)
  if (start < 0) return null
  const endIndex = String(content).indexOf(end, start + begin.length)
  if (endIndex < 0) return null
  return String(content).slice(start + begin.length, endIndex).trim()
}

export function extractGenerated(content) {
  return between(content, GENERATED_BEGIN, GENERATED_END)
}

export function extractSupplement(content) {
  const value = between(content, USER_BEGIN, USER_END)
  if (!value) return null
  return value === SUPPLEMENT_PLACEHOLDER ? '' : value
}

/**
 * 合并本地文档：
 * - 文件不存在 → 新建；
 * - 有 marker 且 generated 段与上次记录一致 → 只替换 generated、保留 user 段；
 * - generated 段被手改 / 文件没有 marker → 返回 conflict，不静默覆盖；
 * - force=true 时：没有 marker 的旧内容整体并入用户补充（不丢内容）。
 */
export function mergeLocalDoc(existing, item, {
  repoName = '',
  supplement = '',
  generatedHash = '',
  force = false,
  generatedAt = new Date().toISOString(),
} = {}) {
  const content = String(existing ?? '')
  const nextGenerated = buildTechDocMarkdown(item, { repoName, generatedAt })
  if (!content.trim()) {
    return {
      status: 'created',
      content: renderLocalDoc(item, { repoName, supplement, generatedAt }),
      supplement: String(supplement ?? '').trim(),
      conflict: false,
    }
  }

  const currentGenerated = extractGenerated(content)
  const currentUser = extractSupplement(content)
  const effectiveSupplement = String(supplement ?? '').trim() || currentUser || ''
  const externalModified = Boolean(currentGenerated && generatedHash && hashText(currentGenerated) !== generatedHash)
  const unmarked = !currentGenerated
  if (!force && (externalModified || unmarked)) {
    return {
      status: externalModified ? 'external-modified' : 'unmarked',
      conflict: true,
      content,
      nextGenerated,
      supplement: effectiveSupplement,
      currentGenerated,
      currentUser,
      message: externalModified
        ? '本地文档的生成段被手工改过（与上次记录不一致）：默认不覆盖。可选「覆盖生成段」或「保留内容并合并」。'
        : '本地文档已有内容但没有 DevHub 标记：默认不覆盖。可选「保留内容并合并」（旧内容会进入用户补充）。',
    }
  }

  const mergedSupplement = unmarked && force
    ? [effectiveSupplement, content.trim()].filter(Boolean).join('\n\n')
    : effectiveSupplement
  return {
    status: externalModified ? 'overwritten' : 'updated',
    content: renderLocalDoc(item, { repoName, supplement: mergedSupplement, generatedAt }),
    supplement: mergedSupplement,
    conflict: false,
    currentGenerated,
    currentUser,
  }
}

/** 只更新用户补充段，不动生成段（保存 supplement 时用；避免误伤手工修改）。 */
export function applySupplementToFile(existing, supplement) {
  const content = String(existing ?? '')
  const user = String(supplement ?? '').trim() || SUPPLEMENT_PLACEHOLDER
  if (!content.trim()) return null
  const start = content.indexOf(USER_BEGIN)
  if (start < 0) {
    return `${content.trimEnd()}\n\n## 8. 我的补充\n\n${USER_BEGIN}\n${user}\n${USER_END}\n`
  }
  const endIndex = content.indexOf(USER_END, start + USER_BEGIN.length)
  if (endIndex < 0) return null
  return `${content.slice(0, start + USER_BEGIN.length)}\n${user}\n${content.slice(endIndex)}`
}

/** 给 Context Pack / 报告用的一行摘要（不读文件）。 */
export function techDocSummary(item) {
  const techDoc = item?.workflow?.techDoc ?? {}
  const provider = techDoc.provider ?? (techDoc.decision === 'none' ? 'none' : '')
  const label = { feishu: '飞书文档', local: '本地 Markdown', link: '外部链接', none: '暂不需要' }[provider] || '未选择'
  const location = techDoc.url || techDoc.localPath || ''
  const supplement = String(techDoc.supplement ?? '').trim()
  return {
    provider,
    label,
    title: String(techDoc.title ?? '').trim(),
    location,
    hasSupplement: Boolean(supplement),
    supplementExcerpt: supplement.slice(0, 300),
    status: techDoc.sync?.status ?? (location ? 'fresh' : 'not-created'),
  }
}
