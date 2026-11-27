/**
 * 工作站 → DSH 会话：把 Context Pack 交给一个新会话，并切过去。
 * 单独成文件，避免 chat/index 之间互相 import 形成环。
 */
import { DEV_STAGE_RULE } from '../shared/boundaries.mjs'
/**
 * 工作站 → DSH 会话：新建一个会话，把 Context Pack 作为首条消息入队，
 * 然后切到那个会话。规范与约束就是这样“由工作站告知”的。
 * 优先走会话控制器（真会话 + 真发送）；不支持时退化为带草稿的新会话。
 */
/**
 * 工作站创建/接管的开发会话默认用「完全权限」：
 * 开发过程需要写仓库外的 ~/.dsh（本机命令、工作区、附件），否则每次越界都会卡在授权，
 * 而这类授权只能在会话页确认。会话里随时可以切回更窄的模式。
 */
const DEFAULT_SESSION_PERMISSION = 'danger-full-access'

/** 把会话的 sandbox 模式写进会话事件（DSH 的 setSandboxMode 等价写法，旧版本不支持则跳过）。 */
function applySessionPermission(session, mode = DEFAULT_SESSION_PERMISSION) {
  try {
    if (mode && typeof session?.append === 'function') session.append('sandbox/mode', { mode })
    return true
  } catch {
    return false
  }
}

export async function launchDevSession(ctx, { cwd, prompt, continueSessionId, open = true, permissionMode = DEFAULT_SESSION_PERMISSION } = {}) {
  const sessions = ctx?.get?.('sessions')
  const uiWorkspace = ctx?.get?.('uiWorkspace')
  let failure = null

  // 继续之前的沟通：把上下文发回同一个会话（历史、工具结果、决定都在），而不是从零开始。
  if (continueSessionId && sessions?.retain) {
    try {
      const reference = sessions.retain(String(continueSessionId), { source: 'controllerOperation' })
      try {
        const binding = await reference.ready
        applySessionPermission(binding.session, permissionMode)
        const result = await binding.session.prompt([{ type: 'text', text: prompt }], 'queue')
        if (result && result.ok === false) throw new Error(result.error?.message ?? '会话拒绝了这条开发上下文')
      } finally {
        reference.release()
      }
      // 默认不跳转：进度与结果留在工作站里看；需要时才显式 open
      if (open) uiWorkspace?.openSession?.(continueSessionId)
      return { sessionId: String(continueSessionId), sent: true, continued: true }
    } catch (error) {
      // 会话可能已被归档/清理：退化为新建，并在返回值里说明原因
      failure = error
    }
  }

  if (sessions?.create) {
    try {
      const sessionId = await sessions.create(cwd ? { cwd } : undefined)
      const reference = sessions.retain(sessionId, { source: 'controllerOperation' })
      try {
        const binding = await reference.ready
        applySessionPermission(binding.session, permissionMode)
        const result = await binding.session.prompt([{ type: 'text', text: prompt }], 'queue')
        if (result && result.ok === false) {
          throw new Error(result.error?.message ?? '会话拒绝了这条开发上下文')
        }
      } finally {
        reference.release()
      }
      if (open) uiWorkspace?.openSession?.(sessionId)
      return {
        sessionId,
        sent: true,
        continued: false,
        ...(failure ? { continueFailed: String(failure?.message ?? failure) } : {}),
      }
    } catch (error) {
      failure = error
    }
  }

  // 退化路径：只把上下文放进新会话的输入框，由用户确认后发送。
  if (uiWorkspace?.startSession) {
    uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'replace' })
    return { sessionId: null, sent: false, continued: false }
  }
  throw failure ?? new Error('当前 DSH 版本不支持从插件开启会话')
}

/**
 * 往已有开发会话发一条消息（工作站内嵌对话框、推进建议都用它）。
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function sendToSession(ctx, sessionId, text) {
  const id = String(sessionId ?? '').trim()
  const value = String(text ?? '').trim()
  if (!id || !value) return { sent: false, reason: '缺少会话或内容' }
  const sessions = ctx?.get?.('sessions')
  if (!sessions?.retain) return { sent: false, reason: '当前 DSH 不支持从工作站发送消息' }
  const reference = sessions.retain(id, { source: 'controllerOperation' })
  try {
    const binding = await reference.ready
    const result = await binding.session.prompt([{ type: 'text', text: value }], 'queue')
    if (result && result.ok === false) throw new Error(result.error?.message ?? '会话拒绝了这条消息')
    return { sent: true }
  } finally {
    reference.release()
  }
}

function contextView(pack) {
  if (pack && typeof pack === 'object') return pack
  return { prompt: String(pack ?? '') }
}

/** 有上下文目录就发「薄 prompt + 索引」，没有就退回完整 Context Pack。 */
function contextPromptLines(pack, item, engineName, extra = []) {
  const view = contextView(pack)
  const title = item?.title ?? item?.id ?? '未命名流程'
  const id = item?.id ?? ''
  const shared = [
    `你是由 DevHub 开发工作站启动的${engineName ? ` ${engineName} ` : ''}开发会话。开发流程：${title}${id ? `（${id}）` : ''}。`,
  ]
  if (!view.indexPath) {
    return [
      ...shared,
      '请严格按下方的 Context Pack 开发，其中【项目约束】是本次开发的硬规则；与仓库门禁冲突时以门禁为准。',
      `【阶段边界】${DEV_STAGE_RULE}`,
      ...extra,
      '',
      '===== Context Pack =====',
      '',
      String(view.prompt ?? ''),
    ].join('\n')
  }
  const mustRead = Array.isArray(view.mustRead) && view.mustRead.length ? view.mustRead : ['10-CONTRACT.md', '20-TASK.md']
  const optional = Array.isArray(view.files)
    ? view.files.map((file) => file.name).filter((name) => !mustRead.includes(name) && name !== '00-INDEX.md')
    : []
  return [
    ...shared,
    '本次开发的事实来源已落成一个统一上下文目录，不要只凭这条消息开工。',
    `- 目录：${view.folder ?? ''}`,
    `- 入口：${view.indexPath}`,
    `- 必读：${mustRead.join('、')}`,
    ...(optional.length ? [`- 按需：${optional.join('、')}`] : []),
    `- contextHash：${view.contextHash ?? '—'}`,
    '',
    '开工第一步：先读入口与必读文件；读不到文件就明确说明，不要编造内容。',
    `【阶段边界】${DEV_STAGE_RULE}`,
    '【项目约束】在 50-RULES.md 中，是本次开发的硬规则；与仓库门禁冲突时以门禁为准。',
    ...extra,
  ].join('\n')
}

/** 给 Codex/Pi 等外部终端的启动消息：它们没有 DSH 工具，使用 bridge CLI。 */
export function launchExternalPrompt(pack, item, engine = '外部 Agent') {
  return [
    contextPromptLines(pack, item, engine),
    '',
    `${engine} 无法调用 devhub_get / devhub_update；使用启动消息末尾的 DevHub 联动 CLI 回写任务/变更点/风险。评审与测试由工作站「继续推进」自动执行，不要要求用户手动触发，也不要自行跑测试/提交。不要编造 baseline diff。`,
  ].join('\n')
}

/** 给 Claude Code 的首条消息：它没有 DSH 的 devhub_* 工具，不要让它调用。 */
export function launchClaudePrompt(pack, item) {
  return [
    contextPromptLines(pack, item, 'Claude Code'),
    '',
    'Claude Code 无法调用 devhub_get / devhub_update；使用启动消息末尾的 DevHub 联动 CLI 回写任务/变更点/风险。评审与测试由工作站「继续推进」自动执行，不要要求用户手动触发，也不要自行跑测试/提交。不要编造 baseline diff。',
  ].join('\n')
}

/** 给开发会话的首条消息：说明来源，并把它钉在 Context Pack 的规范上。 */
export function launchPrompt(pack, item) {
  return [
    contextPromptLines(pack, item, '', [
      '开工前先调用 devhub_get 读取该流程的最新状态；开发中用 devhub_update 回写任务与变更点（阶段由工作站按事实推导）；不要编造 baseline diff。',
    ]),
  ].join('\n')
}
