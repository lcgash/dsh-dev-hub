/**
 * 计划回放：用台账里**已记录的输入**重算一次计划，和当初存下的指纹对比。
 *
 * 回答三个问题：
 * 1. 输入（描述/答案/范围/规范）变了没有？
 * 2. 规则（插件版本/技能包）变了没有？
 * 3. 输入没变，但重算出的计划与台账里的不一致 —— 说明计划被手改过或规则变了。
 *
 * 纯函数：不读文件、不调模型，全部入参由 Host 提供。
 */

import { buildPlan } from './plan.mjs'
import { planHash, inputHash, specHash } from './provenance.mjs'

/** 从台账里取出重算计划所需的输入。 */
export function planInputsFromItem(item) {
  const recon = item?.recon
    ? {
        files: item.recon.files ?? [],
        tokens: item.recon.tokens ?? [],
      }
    : null
  return {
    description: String(item?.description || item?.goal || '').trim(),
    answers: item?.answers ?? {},
    scope: item?.scope ?? [],
    recon,
  }
}

/**
 * 重算计划并与台账里的指纹对比。
 * @param {object} item
 * @param {{ project?: object, conventions?: object }} env
 */
export function reproPlan(item, { project, conventions } = {}) {
  const inputs = planInputsFromItem(item)
  const recomputed = buildPlan({
    description: inputs.description,
    recon: inputs.recon,
    scope: inputs.scope,
    answers: inputs.answers,
    project,
    conventions,
  })
  const recomputedHash = planHash(recomputed)
  const currentInputHash = inputHash({
    description: inputs.description,
    answers: inputs.answers,
    scope: inputs.scope,
    conventions,
  })
  const currentSpecHash = specHash({
    description: inputs.description,
    answers: inputs.answers,
    scope: inputs.scope,
  })

  const stored = item?.provenance?.plan ?? null
  const storedHash = stored?.hash ?? null
  const storedInputHash = stored?.inputHash ?? null

  const inputChanged = Boolean(storedInputHash) && storedInputHash !== currentInputHash
  const planChanged = Boolean(storedHash) && storedHash !== recomputedHash
  const recorded = Boolean(storedHash)

  return {
    recorded,
    inputChanged,
    planChanged,
    same: recorded ? (!inputChanged && !planChanged) : false,
    stored: stored ? { hash: storedHash, inputHash: storedInputHash, specHash: stored.specHash ?? null, pluginVersion: stored.pluginVersion ?? null, at: stored.at ?? null } : null,
    current: { hash: recomputedHash, inputHash: currentInputHash, specHash: currentSpecHash },
    inputs: {
      description: inputs.description,
      answers: inputs.answers,
      scope: inputs.scope,
      files: (inputs.recon?.files ?? []).map((file) => file.path),
    },
    plan: recomputed,
    message: !recorded
      ? '这个流程还没有记录计划指纹（旧流程）：可以先「重算并记录」一次。'
      : inputChanged
        ? '输入已变化（描述/答案/范围/规范），当前计划可能已过期，建议重算。'
        : planChanged
          ? '输入没变，但重算出的计划与台账不一致：计划被手动改过，或插件/技能包版本变了。'
          : '计划与当前输入一致。',
  }
}
