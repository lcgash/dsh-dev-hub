/**
 * 工作站自己评估工程量：用户不填 S/M/L 和人天。
 *
 * 依据（全部来自探测结果与仓库配置，可解释、可复算）：
 * - 命中文件数、命中模块数、命中行数；
 * - 是否涉及测试（要补/要改）、是否涉及 DB/契约/i18n 等高风险管理文件；
 * - 仓库自己的命令（编译/单测/门禁）意味着多少验证成本。
 *
 * 输出带 `basis`，让用户看到“为什么是 2 人日”，而不是一个黑盒数字。
 */

import { moduleOfPath } from './modules.mjs'

const RISK_PATTERNS = [
  { kind: 'db', test: (path) => /(^|\/)db\/|\.sql$/i.test(path), label: '涉及库表/迁移', extra: 1 },
  { kind: 'contract', test: (path) => /controller\/|model\/(dto|vo)\//i.test(path), label: '涉及对外契约', extra: 0.5 },
  { kind: 'i18n', test: (path) => /messages.*\.properties$|i18n|locales?\//i.test(path), label: '涉及多语言文案', extra: 0.5 },
  { kind: 'config', test: (path) => /(^|\/)config\/|[^/]+\.ya?ml$/i.test(path), label: '涉及配置', extra: 0.25 },
  // 前端/Node：依赖与公共导出、设计 token/样式、路由/页面结构都是跨边界风险
  { kind: 'deps', test: (path) => /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/i.test(path), label: '涉及依赖/公共契约', extra: 0.5 },
  { kind: 'ui', test: (path) => /\.(css|scss|less|sass)$|(^|\/)(theme|themes|tokens|styles|design-system)\//i.test(path), label: '涉及设计 token/样式', extra: 0.5 },
  { kind: 'routes', test: (path) => /(^|\/)(routes?|router|app)\//i.test(path), label: '涉及路由/页面结构', extra: 0.5 },
  { kind: 'public', test: (path) => /(^|\/)(index|exports|public-api)\.(ts|tsx|js|jsx|mjs)$/i.test(path), label: '涉及公共导出/组件契约', extra: 0.5 },
]

const SIZE_ORDER = ['S', 'M', 'L', 'XL']

function round(value) {
  return Math.round(value * 2) / 2
}

/**
 * 评估一次开发的工程量。
 * @param {{ recon?: object, scope?: string[], commands?: object, repoNames?: string[] }} input
 */
export function estimateWork({ recon, scope = [], commands = {}, repoNames = [] } = {}) {
  const files = recon?.files ?? []
  const fileCount = files.length
  const modules = new Set()
  for (const file of files) modules.add(moduleOfPath(file?.path, repoNames))
  const moduleCount = Math.max(modules.size, scope.length ? 1 : 0)
  const matchCount = files.reduce((total, file) => total + (file?.matches?.length ?? 0), 0)
  const hasTests = files.some((file) => /(^|\/)(?:__tests__|tests?|e2e)\/|\.(test|spec)\.(?:[cm]?[jt]sx?|vue)$|Test\.(java|kt)$|_test\.(go|py)$/i.test(String(file?.path ?? '')))

  const risks = []
  let riskExtra = 0
  for (const rule of RISK_PATTERNS) {
    const hit = files.find((file) => rule.test(String(file?.path ?? '')))
    if (!hit) continue
    risks.push({ kind: rule.kind, label: rule.label, sample: hit.path })
    riskExtra += rule.extra
  }

  // 基础成本：打开仓库 + 复述任务 + 收尾
  const base = 0.5
  // 每个模块要读边界、找调用方；每个文件要读要改；每条命中行都要核对
  const moduleCost = moduleCount * 0.3
  const primaryFiles = Math.min(fileCount, 6) // 前几个才真正要动手读改
  const fileCost = primaryFiles * 0.15
  const matchCost = Math.min(matchCount * 0.05, 0.6)
  const testCost = hasTests ? 0.25 : 0.4 // 没有测试命中，意味着可能要新写测试
  const verifyCost = commands.gate ? 0.3 : 0.15
  const raw = base + moduleCost + fileCost + matchCost + testCost + verifyCost + riskExtra
  const days = Math.max(0.5, round(raw))

  const size = days < 1.5 ? 'S' : days < 4 ? 'M' : days < 8 ? 'L' : 'XL'
  const confidence = fileCount === 0 ? 'low' : fileCount >= 3 && matchCount >= 3 ? 'high' : 'medium'

  const basis = [
    `${fileCount} 个候选文件${fileCount ? `（${files.slice(0, 3).map((file) => file.path.split('/').pop()).join('、')}${fileCount > 3 ? ' 等' : ''}）` : '（没有命中）'}`,
    `${moduleCount} 个模块`,
    `${matchCount} 处命中行`,
    hasTests ? '命中里已包含测试，按“改测试”估算' : '没有命中测试，按“需要补测试”估算',
    ...risks.map((risk) => risk.label),
    commands.gate ? '需要跑仓库门禁' : '只跑编译/单测',
  ]

  return {
    size,
    days,
    confidence,
    basis,
    risks,
    metrics: { fileCount, moduleCount, matchCount, hasTests },
    computedBy: 'dev-hub/estimate',
    computedAt: new Date().toISOString(),
  }
}

/** 人日 -> 规模，供外部单独换算。 */
export function sizeForDays(days) {
  const value = Number(days) || 0
  if (value < 1.5) return SIZE_ORDER[0]
  if (value < 4) return SIZE_ORDER[1]
  if (value < 8) return SIZE_ORDER[2]
  return SIZE_ORDER[3]
}
