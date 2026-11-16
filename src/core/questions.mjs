/**
 * 工作站自己追问：只有真的缺信息时才问，每问都带“为什么问”和可点选项。
 *
 * 原则：
 * - 不问用户能自己查到的事（代码位置、命令、规范）；
 * - 只问“影响做法/范围/验收”的分叉点；
 * - 最多 4 个，答完就能出计划；回答会写进流程台账与 Context Pack。
 */

const MAX_QUESTIONS = 4

function option(id, label, value = id) {
  return { id, label, value }
}

/**
 * @param {{ description: string, recon?: object, project?: object, conventions?: object }} input
 * @returns {{ id, question, why, options?, kind }[]}
 */
export function deriveQuestions({ description, recon, project, conventions } = {}) {
  const questions = []
  const text = String(description ?? '').trim()
  const files = recon?.files ?? []
  const modules = (recon?.modules ?? []).map((entry) => entry.name).filter(Boolean)
  const commands = project?.context?.commands ?? {}

  if (files.length === 0) {
    questions.push({
      id: 'scope-fallback',
      kind: 'text',
      question: '我没在仓库里找到明显相关的位置。是换个说法描述，还是你直接指定要改的目录？',
      why: '没有候选文件时，继续开发只能靠猜；给我一个目录或更具体的名字就能继续。',
    })
  }

  if (modules.length >= 3) {
    questions.push({
      id: 'scope-narrow',
      kind: 'choice',
      question: `命中分散在 ${modules.slice(0, 4).join('、')}。这次是全部一起改，还是只改其中一个？`,
      why: '范围决定并行冲突判定和验收边界；只改一处会让改动更可控。',
      options: [
        ...modules.slice(0, 4).map((name) => option(`only-${name}`, `只改 ${name}`, { mode: 'only', module: name })),
        option('all', '都改', { mode: 'all' }),
      ],
    })
  }

  const hasTests = files.some((file) => /\/test\/|Test\.(java|ts)$/i.test(String(file?.path ?? '')))
  if (files.length && !hasTests) {
    questions.push({
      id: 'tests',
      kind: 'choice',
      question: '命中里没有测试文件。这次要不要一起补单测？',
      why: '本仓库门禁会检查测试布局；没有测试的改动更容易在评审时被打回。',
      options: [
        option('add-tests', '一起补单测（推荐）'),
        option('no-tests', '先不补，后面单独做'),
      ],
    })
  }

  const risky = (recon?.files ?? []).find((file) => /(^|\/)db\/|\.sql$|controller\/|i18n|messages.*\.properties$/i.test(String(file?.path ?? '')))
  if (risky) {
    questions.push({
      id: 'risk-contract',
      kind: 'choice',
      question: `改动里包含 ${risky.path.split('/').slice(-2).join('/')} 这类文件。对外契约/库表/文案要同步变更吗？`,
      why: '契约与库表变更需要同步基线、迁移与三语 key，会影响发布方式。',
      options: [
        option('sync-all', '需要，按完整流程走（含迁移/三语）'),
        option('internal-only', '不需要，只改内部实现'),
      ],
    })
  }

  if (text.length < 12) {
    questions.push({
      id: 'expectation',
      kind: 'text',
      question: '能再补一句“改完之后用户会看到什么变化”吗？',
      why: '预期行为决定验收标准，也决定我能否判断实现是否跑偏。',
    })
  }

  if (commands.localTest || commands.gate) {
    questions.push({
      id: 'acceptance',
      kind: 'choice',
      question: '验收用哪条为准？',
      why: '确认命令后我会把它写进流程验收，并在开发结束时按它回收结果。',
      options: [
        ...(commands.localTest ? [option('local', `本机自测：${commands.localTest}`)] : []),
        ...(commands.gate ? [option('gate', `仓库门禁：${commands.gate}`)] : []),
        ...(commands.environmentTest ? [option('env', `环境测试：${commands.environmentTest}`)] : []),
      ],
    })
  }

  return questions.slice(0, MAX_QUESTIONS)
}

/** 把问答结果整理成可写进台账的澄清记录。 */
export function answeredQuestions(questions, answers) {
  return (questions ?? [])
    .map((question, index) => {
      const answer = answers?.[question.id]
      if (answer === undefined || answer === null || String(answer).trim() === '') return null
      return {
        id: question.id || `q${index + 1}`,
        question: question.question,
        answer: typeof answer === 'string' ? answer.trim() : JSON.stringify(answer),
        answeredAt: new Date().toISOString(),
      }
    })
    .filter(Boolean)
}
