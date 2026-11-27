/**
 * 会话隔离回归：两个新流程不能把消息写进同一段对话。
 *
 * 事故现场（2026-11-12）：已经开了一个「新建流程」对话，再开第二个时，
 * 聊天页恢复的仍是上一段对话 + 上一段未完成的扫描任务；自动续跑又把结果
 * 追加到同一段对话里，出现两条「刚才的扫描被切走了」和交错的探测结果。
 *
 * 修复分三层，每层都在这里钉住：
 * 1) 新建流程入口先落一段新对话（openChat fresh → startNewChat）；
 * 2) 结果按对话 id 回写（saveChat），不写 store.activeId；
 * 3) 异步任务校验归属（runIsCurrent）并在收尾时清 job / 防重复续跑。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const chat = await import('../src/client/chat.mjs')
const chatStore = await import('../src/client/chat-store.mjs')

test('会话隔离：新建流程入口先落新对话，不接着上一段流程写', async () => {
  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /function openChat\(scope = null, hint = null, \{ fresh = false \} = \{\}\)/)
  assert.match(index, /if \(fresh && repoPath\) \{[\s\S]{0,200}?startNewChat\(repoPath, '新对话', 'new'\)/)
  assert.match(index, /onNewFlow: \(\) => onOpenChat\?\.\(null, null, \{ fresh: true \}\)/)
  assert.match(index, /startNewChat[^\n]*from '\.\/chat-store\.mjs'|import \{[^\n]*startNewChat[^\n]*\} from '\.\/chat-store\.mjs'/)
})

test('会话隔离：后台结果按对话 id 回写，不再写 store.activeId', async () => {
  const source = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(source, /saveChat\(repoPath, activeChatId, \{ messages/)
  assert.doesNotMatch(source, /saveActiveChat\(repoPath, \{ messages/)
  // 切对话 / 开新对话时按 id 保存当前这段
  assert.match(source, /saveChat\(repoPath, activeChatId, \{ messages, input, phase/)
})

test('会话隔离：异步任务校验对话归属，切走后的结果不写当前界面', async () => {
  const source = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  // 任务令牌 + 对话 id 双重校验
  assert.match(source, /function runIsCurrent\(run\)/)
  assert.match(source, /run\.conversationId !== activeChatIdRef\.current/)
  // 组件卸载后本地 ref 不再更新：还要对一次 store 里真正 active 的对话
  assert.match(source, /getActiveConversationId\(repoPath, scope\)/)
  assert.match(source, /activeId !== run\.conversationId/)
  // 扫描、澄清、重扫、计划、建流程都要在 await 之后校验
  assert.match(source, /const probed = await probeCode\(makeDeps\(ctx\), text, \{ attachments: usedAttachments(?:, repoPath: state\?\.repo\?\.path)? \}\)[\s\S]{0,400}?if \(!runIsCurrent\(run\)\) \{[\s\S]{0,120}?persistReconToOrigin\(run, probed\)/)
  assert.match(source, /const body = await api\(API\.clarify, \{[\s\S]{0,900}?if \(!runIsCurrent\(run\)\) \{[\s\S]{0,160}?persistClarifyToOrigin\(run, payload, \{ description, history \}\)/)
  assert.match(source, /const probed = await probeCode\(makeDeps\(ctx\), enriched(?:, \{ repoPath: state\?\.repo\?\.path \})?\)[\s\S]{0,300}?if \(!runIsCurrent\(run\)\) return/)
  // 建流程失败/成功分支持久化时也不能无条件写当前对话
  assert.match(source, /if \(!runIsCurrent\(run\)\) \{ onFlowsChanged\?\.\(\); return \}/)
})

test('会话隔离：晚到的扫描/澄清结果写回发起它的对话，不丢也不串', async () => {
  const source = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(source, /function persistReconToOrigin\(run, probed\)/)
  assert.match(source, /persistReconToOrigin\(run, probed\)/)
  assert.match(source, /function persistClarifyToOrigin\(run, payload, \{ description, history \}\)/)
  assert.match(source, /persistClarifyToOrigin\(run, payload, \{ description, history \}\)/)
  // 写回目标必须是 run.conversationId，而不是当前 activeChatId
  assert.match(source, /saveChat\(repoPath, run\.conversationId, \{/)
})

test('会话隔离：任务收尾清 job，且同一对话不允许并行同类任务', async () => {
  const source = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  assert.match(source, /function finishRun\(run, key\)/)
  assert.match(source, /clearConversationJob\(repoPath, run\.conversationId, scope\)/)
  // 续跑前先看这段对话是不是已经有任务在跑（旧组件卸载后请求还在飞）
  assert.match(source, /isConversationRunning\(state\.repo\.path, scope, activeChatIdRef\.current, resumeKind\)/)
  assert.match(source, /if \(!beginRun\(key\)\)/)
  // 同一段对话的扫描不能并行（否则两次结果交错）
  assert.match(source, /上一次仓库分析还在进行/)
})

test('会话登记表：同一段对话的同类任务只登记一次（进程内）', () => {
  const key = 'conversation-registry-check'
  assert.equal(typeof chat.isConversationRunning, 'function')
  // 未登记 → 不在跑；登记表是模块级 Set，跨实例共享（旧组件卸载后仍生效）
  assert.equal(chat.isConversationRunning('/repo', 'new', key, 'recon'), false)
  assert.equal(chat.isConversationRunning('/repo', 'new', key, 'clarify'), false)
})

test('会话隔离对应接口：saveChat / clearConversationJob 已导出', () => {
  assert.equal(typeof chatStore.saveChat, 'function')
  assert.equal(typeof chatStore.clearConversationJob, 'function')
})

test('按计划开工成功后自动跳到对应流程详情', async () => {
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  // 只有当前对话的建流程结果才能触发跳转，避免把用户正在看的另一段对话抢走
  assert.match(chat, /onFlowStarted\?\.\(result\.item\.id\)/)
  const jump = chat.indexOf('onFlowStarted?.(result.item.id)')
  const guard = chat.lastIndexOf('if (runIsCurrent(run)) {', jump)
  assert.ok(guard > 0 && guard < jump, '自动跳转必须在 runIsCurrent(run) 分支内')

  const index = await readFile(new URL('../src/client/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /onFlowStarted: \(id\) => \{[\s\S]{0,160}?setTab\('flows'\)[\s\S]{0,160}?setOpenFlow\(\{ id, nonce: Date\.now\(\) \}\)/)
  // 面板恢复"上次打开的流程"时不能覆盖本次自动跳转的目标
  assert.match(index, /if \(!openFlowId && saved\.selectedId/)
  // 面板因 flowsNonce 重挂载时，homeNonce 的清理 effect 不能把刚打开的流程清掉（只在 nonce 变化时清）
  assert.match(index, /const homeNonceRef = useRef\(homeNonce\)/)
  assert.match(index, /if \(homeNonce === homeNonceRef\.current\) return/)
  // 点 hub 回首页要同时清掉 openFlow，避免重挂载时又跳回旧流程
  assert.match(index, /setTab\('flows'\); setOpenFlow\(null\); setHomeNonce\(\(value\) => value \+ 1\)/)
})

test('切走页签：未返回的澄清/计划结果写回 chat store，不写已卸载组件', async () => {
  const { readFile } = await import('node:fs/promises')
  const chat = await readFile(new URL('../src/client/chat.mjs', import.meta.url), 'utf8')
  // 卸载后旧请求仍可能返回：runIsCurrent 必须知道组件已卸载，改走 persist*ToOrigin
  assert.match(chat, /const mountedRef = useRef\(false\)/)
  assert.match(chat, /mountedRef\.current = true[\s\S]{0,120}mountedRef\.current = false/)
  assert.match(chat, /function runIsCurrent\(run\) \{\n    if \(!mountedRef\.current\) return false/)
  assert.match(chat, /function persistPlanToOrigin\(run, \{ plan, files, answers, scopeList, pending \}\)/)
  assert.match(chat, /persistPlanToOrigin\(run, \{ plan, files, answers, scopeList: scopes, pending \}\)/)
  assert.match(chat, /persistClarifyToOrigin\(run, payload/)
  // 澄清等待时轮询真实 Claude 会话记录，不只显示转圈
  assert.match(chat, /API\.liveTranscript/)
  assert.match(chat, /const clarifyJob = \{ kind: 'clarify'/)
  assert.match(chat, /job: clarifyJob/)
  assert.match(chat, /会话记录/)
})
