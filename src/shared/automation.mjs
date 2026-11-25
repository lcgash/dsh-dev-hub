/**
 * 开发站自动化设置：默认完全自动化，也可人工触发每个节点。
 *
 * 只控制“工作站自己的推进动作”（评审、本机自测、环境测试）；
 * 提交/推送永远保留人工确认，避免默认配置直接改远端分支。
 */
export const AUTOMATION_MODES = ['full', 'manual']
// 开发会话引擎：DSH 原生会话 / 本机 Claude Code（后台会话）
export const DEVELOPER_ENGINES = ['dsh', 'claude', 'codex', 'pi']

export function normalizeAutomation(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return {
    mode: AUTOMATION_MODES.includes(value.mode) ? value.mode : 'full',
    // 是否引入独立评审环节；默认开启。关闭后小改动/大改动都直接进入测试验证。
    reviewEnabled: value.reviewEnabled === false ? false : true,
    engine: DEVELOPER_ENGINES.includes(value.engine) ? value.engine : 'dsh',
  }
}
