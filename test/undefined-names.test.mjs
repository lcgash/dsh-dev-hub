import assert from 'node:assert/strict'
import test from 'node:test'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 用 TypeScript 编译器把 client 半当成 JS 做一次「未定义标识符」检查。
 * 只保留 2304/2552（Cannot find name / Cannot find namespace）：
 * 这正是「删了函数但 JSX 里还引用」「props 没解构就用」这类白屏 bug 的信号。
 */
test('client 半没有未定义标识符（防 ReferenceError → 白屏）', async () => {
  const ts = (await import('typescript')).default
  const dir = fileURLToPath(new URL('../src/client/', import.meta.url))
  const files = [
    'index.mjs', 'home.mjs', 'chat.mjs', 'chat-flow.mjs', 'skills.mjs',
    'session-entry.mjs', 'session-log.mjs', 'session.mjs', 'wizard.mjs',
    'common.mjs', 'error-boundary.mjs',
  ].map((name) => join(dir, name))
  const program = ts.createProgram(files, {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    types: [],
  })
  const problems = ts.getPreEmitDiagnostics(program)
    // 2304/2552 = 未定义名字；18004 = 解构简写时作用域里没有这个值
    // （后者正是「props 没接住却写 { ctx, ... }」这类白屏 bug 的准确信号）
    .filter((diagnostic) => [2304, 2552, 18004].includes(diagnostic.code))
    .map((diagnostic) => {
      const file = diagnostic.file?.fileName.split('/').pop() ?? '?'
      const pos = diagnostic.file
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : { line: 0, character: 0 }
      return `${file}:${pos.line + 1}:${pos.character + 1} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`
    })
  assert.deepEqual(problems, [])
})
