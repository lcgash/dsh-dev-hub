/**
 * 每个变更文件的「修改意义」：给默认解释，允许人工/AI 覆盖。
 *
 * 默认解释是**确定性**的（按路径分类 + 模板触点 + 探测证据），不调模型；
 * 人工/对话补充的说明存在 item.fileNotes 里，优先于默认值 —— 这样"看得懂"和"可复现"不冲突。
 */

const GROUP_TEXT = {
  contract: '接口契约（路由/DTO/VO/请求用例）',
  database: '库表与迁移',
  source: '源适配（Provider/codec/struct）',
  architecture: '架构门禁',
  config: '配置',
  docs: '文档',
  code: '代码',
  plugin: '工作站插件',
}

function inScope(path, scope) {
  if (!scope?.length) return true
  return scope.some((entry) => path === entry || path.startsWith(String(entry).replace(/\/$/, '') + '/'))
}

/**
 * @param {{ path: string, status: string, origin: string, added: number, removed: number, binary: boolean, group: string, inScope?: boolean }} file
 * @param {object} item
 * @returns {string}
 */
export function autoFileNote(file, item) {
  const path = String(file?.path ?? '')
  // 虚拟库：人工说明按 `成员库/相对路径` 的 key 存；recon 也是带前缀的路径
  const lookup = String(file?.key ?? file?.displayPath ?? path)
  const reconHit = (item?.recon?.files ?? []).find((entry) => entry.path === lookup || entry.path === path)
  if (reconHit) {
    const why = String(reconHit.why ?? '').trim()
    return why ? `探测命中：${why}` : '探测命中：可能要改的位置'
  }

  const template = item?.workflow?.plan?.template ?? null
  const group = file?.group ?? 'code'
  if (group === 'plugin') return '工作站插件自身的改动'
  if (path.startsWith('.dev-hub/')) return '流程台账/规范（随代码一起提交，供跨人交接）'
  if (/\/test\/|Test\.(java|ts)$/.test(path)) return '补测试/更新测试（覆盖新增分支）'
  if (group === 'docs') return '同步文档（与实现保持一致）'
  if (group === 'database') return '库表/迁移：需要同步 MySQL 与 DM 基线'
  if (group === 'contract') return '接口契约：需要同步 Swagger 与 request-tests 用例'
  if (group === 'source') {
    return template?.id === 'source-provider'
      ? '模板触点：源适配（SourceProvider 9 处之一）'
      : '源适配相关改动'
  }
  if (group === 'config') return '配置项变更（注意默认值与兼容）'
  if (group === 'architecture') return '架构门禁自身的改动（谨慎：门禁只允许变严）'
  if (file?.inScope === false || inScope(path, item?.scope) === false) return 'scope 外的改动：确认是否属于本流程，必要时补进 plan'
  const text = GROUP_TEXT[group] ?? '代码改动'
  return text
}

/** 合并默认说明与人工说明（人工优先），并给出来源。 */
export function fileNoteOf(file, item) {
  const manual = item?.fileNotes?.[file?.key ?? file?.displayPath ?? file?.path]
  if (manual?.note) return { note: manual.note, source: manual.source ?? 'human' }
  return { note: autoFileNote(file, item), source: 'auto' }
}


/** 文件说明的"版本指纹"：文件状态/增删行变化就需要重新生成说明。 */
export function noteSignature(file) {
  return `${file?.path ?? ''}|${file?.status ?? ''}|${file?.added ?? 0}|${file?.removed ?? 0}`
}

/**
 * 需要 agent 自动补说明的文件：没有人工说明，且（没有 agent 说明 或 版本已变）。
 * 只返回前 limit 个，避免一次调用过大。
 */
export function filesNeedingNotes(files, item, limit = 10) {
  const out = []
  for (const file of files ?? []) {
    const manual = item?.fileNotes?.[file.key ?? file.displayPath ?? file.path]
    if (manual?.source === 'human') continue
    const sig = noteSignature(file)
    if (manual?.source === 'agent' && manual.sig === sig && manual.note) continue
    out.push(file)
    if (out.length >= limit) break
  }
  return out
}
