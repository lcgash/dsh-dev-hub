/**
 * 「关键改动」选文件：默认展开 1~5 个最值得看的文件，其余留在变更列表里。
 *
 * 为什么不用纯改动行数排序：一次需求里最该被看到的往往是数据库模型/迁移、
 * 接口契约或配置；这些文件可能只有几行，却决定了别人怎么理解这次改动。
 * 所以先按类型加权，再按改动行数做次级排序。
 *
 * 纯函数、无 React 依赖，便于单测。
 */

export const KEY_FILE_LIMIT = 5

/** 文件类型规则：顺序即优先级；第一个命中的规则生效。 */
const KEY_FILE_RULES = [
  {
    kind: '数据库模型',
    weight: 100,
    // migrations/V1__x.sql、model/、entity/、dao/、mapper/、schema、repository...
    re: /(^|\/)(migrations?|db|database|schema|models?|entities|entity|dao|mappers?|repository|repositories|sql)(\/|$|\.)|\.sql$|(^|\/)V\d+__/i,
  },
  {
    kind: '接口/契约',
    weight: 70,
    re: /(controller|apis?|routes?|router|handlers?|dto|vo|openapi|swagger)/i,
  },
  {
    kind: '配置',
    weight: 55,
    re: /(application\.(ya?ml|properties)|bootstrap\.(ya?ml|properties)|pom\.xml|build\.gradle|package\.json|dockerfile|\.env)/i,
  },
]

export function keyFileKind(file) {
  const path = String(file?.path ?? file?.displayPath ?? '')
  if (!path) return null
  return KEY_FILE_RULES.find((rule) => rule.re.test(path)) ?? null
}

/**
 * 从变更文件里挑出关键改动（最多 limit 个）。
 * - 二进制文件没有可读 diff，跳过；
 * - 没有类型命中的文件也能入选（按改动行数排），保证“1~5 个”里不空着；
 * - scope 外文件降权，但仍可入选。
 * @returns {Array<{ file: object, kind: string, score: number }>}
 */
export function pickKeyFiles(files, limit = KEY_FILE_LIMIT) {
  const rows = (Array.isArray(files) ? files : [])
    .filter((file) => file && !file.binary)
    .filter((file) => {
      const changed = Number(file.added ?? 0) + Number(file.removed ?? 0)
      return changed > 0 || file.status === 'added' || file.status === 'deleted' || file.status === 'renamed'
    })
    .map((file) => {
      const rule = keyFileKind(file)
      const changed = Math.min(400, Number(file.added ?? 0) + Number(file.removed ?? 0))
      const scopePenalty = file.inScope === false ? 20 : 0
      return {
        file,
        kind: rule?.kind ?? '其他改动',
        score: (rule?.weight ?? 10) + changed / 10 - scopePenalty,
      }
    })
    .sort((left, right) => right.score - left.score)
  return rows.slice(0, Math.max(0, limit))
}

/** 截取 diff 前 maxLines 行；返回剩余行数，界面据此提示“还有多少行”。 */
export function excerptLines(lines, maxLines = 40) {
  const list = Array.isArray(lines) ? lines : []
  if (list.length <= maxLines) return { lines: list, truncated: false, hidden: 0 }
  return { lines: list.slice(0, maxLines), truncated: true, hidden: list.length - maxLines }
}
