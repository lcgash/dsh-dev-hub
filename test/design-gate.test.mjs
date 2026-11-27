import assert from 'node:assert/strict'
import test from 'node:test'

const { checkDesign, designGateSummary, parseDesignSections } = await import('../src/core/design-gate.mjs')

const GENERATED = `
# groups 接口返回分组可见流水线数量

## 1. 背景与目标
- 目标：GET /api/v1/groups 增加 pipelineCount
- 根本问题：前端看不到分组规模

## 2. 现状、约束与非目标
### 非目标
- 不改变分组树结构

## 3. 方案设计
- 用 MyBatis-Plus selectMaps 聚合后回填

### 关键文件与模块
- src/main/java/com/gitee/pipeline/service/impl/PipelineGroupServiceImpl.java

## 4. 接口 / 数据 / 兼容与回滚
- 兼容与迁移：纯增量字段
- 回滚方式：待补充

## 6. 验收与测试
- 本机自测通过
- 每个节点返回可见数量
`

test('checkDesign：现有 DevHub 方案通过，占位符只算提醒', () => {
  const gate = checkDesign(GENERATED, { legacy: true, scope: ['src/main/java/com/gitee/pipeline/service/impl'] })
  assert.equal(gate.ok, true)
  assert.equal(gate.status, 'warn')
  assert.match(gate.warnings.join('\n'), /待补充/)
  assert.equal(gate.scope.length, 1)
  assert.match(gate.basisHash, /^[a-f0-9]{16}$/)
})

test('checkDesign：缺方案章节直接 FAIL', () => {
  const gate = checkDesign('## 1. 背景与目标\n只有目标', { legacy: true })
  assert.equal(gate.ok, false)
  assert.equal(gate.status, 'fail')
  assert.match(gate.errors.join('\n'), /方案|验收/)
})

test('checkDesign：意图照搬用户原话 FAIL', () => {
  const raw = '需要在 api v1 的 groups 接口返回每一个分组的流水线数量'
  const gate = checkDesign(`
## 1. 背景与目标
${raw}

## 3. 方案设计
- 聚合计数

## 6. 验收与测试
- 自测通过
`, { rawRequest: raw })
  assert.equal(gate.ok, false)
  assert.match(gate.errors.join('\n'), /用户原话/)
})

test('checkDesign：方案或验收变化会改变 basisHash；scope 也参与', () => {
  const base = checkDesign(GENERATED, { scope: ['src/a'] })
  const changed = checkDesign(GENERATED.replace('聚合后回填', '逐组查询后回填'), { scope: ['src/a'] })
  const scoped = checkDesign(GENERATED, { scope: ['src/b'] })
  assert.notEqual(base.basisHash, changed.basisHash)
  assert.notEqual(base.basisHash, scoped.basisHash)
})

test('checkDesign：存量项目缺现状/回滚给提醒，仍是 PASS', () => {
  const gate = checkDesign(`
## 1. 背景与目标
- 修复存量订单状态机

## 3. 方案设计
- 在现有状态机旁边加 seam

## 6. 验收与测试
- 表征测试通过
`, { legacy: true, rawRequest: '生产环境重复扣款并且状态错乱' })
  assert.equal(gate.ok, true)
  assert.match(gate.warnings.join('\n'), /现状|回滚/)
})

test('parseDesignSections / summary：标题按二级切分，摘要稳定', () => {
  const sections = parseDesignSections(GENERATED)
  assert.equal(sections.length, 5)
  assert.equal(sections[0].title, '1. 背景与目标')
  assert.equal(designGateSummary(checkDesign(GENERATED)), '方案门禁 PASS（2 条提醒）')
})
