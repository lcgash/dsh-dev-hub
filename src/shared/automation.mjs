/**
 * 开发站自动化设置：默认完全自动化，也可人工触发每个节点。
 *
 * 只控制“工作站自己的推进动作”（评审、本机自测、环境测试）；
 * 提交/推送永远保留人工确认，避免默认配置直接改远端分支。
 */
export const AUTOMATION_MODES = ['full', 'manual']

export function normalizeAutomation(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return {
    mode: AUTOMATION_MODES.includes(value.mode) ? value.mode : 'full',
  }
}
