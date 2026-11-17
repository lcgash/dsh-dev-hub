/**
 * 覆盖率测试用的轻量词法扫描：列出源码里所有静态中文字符串字面量。
 *
 * 不能只按行/块注释删除：字符串里可能包含 `//` 或 `/*`（如 skills.mjs 的
 * "例如：src/** 或 package-check"），简单正则会把后面的代码当注释吞掉。
 * 这里先做字符串感知的注释剥离；模板字面量属于动态文案，由 templates 承载。
 */


/** 把源码字面量里的 JS 转义还原成运行时字符串（\n、\t、\\ 等）。 */
function decodeJsEscapes(text) {
  return String(text).replace(/\\(.)/g, (whole, char) => {
    if (char === 'n') return '\n'
    if (char === 't') return '\t'
    if (char === 'r') return '\r'
    if (char === 'b') return '\b'
    if (char === 'f') return '\f'
    if (char === 'v') return '\v'
    if (char === '0') return '\0'
    if (char === "'" || char === '"' || char === '\\') return char
    return whole
  })
}

function stripCommentsAndTemplates(source) {
  let output = ''
  let index = 0
  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]
    if (char === "'" || char === '"') {
      const quote = char
      output += char
      index += 1
      while (index < source.length) {
        const current = source[index]
        output += current
        if (current === '\\') {
          index += 1
          if (index < source.length) output += source[index]
          index += 1
          continue
        }
        index += 1
        if (current === quote) break
      }
      continue
    }
    if (char === '`') {
      // 模板字面量整体跳过（含 ${} 表达式），避免把动态拼接误当静态文案。
      index += 1
      let depth = 0
      while (index < source.length) {
        const current = source[index]
        if (current === '\\') { index += 2; continue }
        if (current === '`' && depth === 0) { index += 1; break }
        if (current === '$' && source[index + 1] === '{') { depth += 1; index += 2; continue }
        if (current === '}' && depth > 0) { depth -= 1; index += 1; continue }
        index += 1
      }
      output += ' '
      continue
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1
      output += '\n'
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1
      index += 2
      output += ' '
      continue
    }
    output += char
    index += 1
  }
  return output
}

/**
 * 返回源码中所有静态中文字符串字面量（去重、去注释、不含模板插值）。
 * @param {string} source
 * @returns {string[]}
 */
export function extractStaticChineseStrings(source) {
  const output = new Set()
  for (const match of stripCommentsAndTemplates(source).matchAll(/(["'])((?:[^"'\\\n]|\\.)*)\1/gu)) {
    const text = decodeJsEscapes(match[2])
    if (/\p{Script=Han}/u.test(text)) output.add(text)
  }
  return [...output]
}

/**
 * 提取源码中含中文插值的模板字面量，并把 ${...} 归一成 {valueN}。
 * 用于断言每个动态模板都能在 locale 的 templates 里找到对应语言资源。
 * @param {string} source
 * @returns {string[]}
 */
export function extractChineseTemplates(source) {
  const output = new Set()
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === "'" || char === '"') {
      const quote = char
      index += 1
      while (index < source.length) {
        if (source[index] === '\\') { index += 2; continue }
        if (source[index] === quote) { index += 1; break }
        index += 1
      }
      continue
    }
    if (char === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') index += 1
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1
      index += 2
      continue
    }
    if (char !== '`') { index += 1; continue }
    index += 1
    let literal = ''
    let slot = 0
    while (index < source.length) {
      const current = source[index]
      if (current === '\\') {
        literal += current + (source[index + 1] ?? '')
        index += 2
        continue
      }
      if (current === '`') { index += 1; break }
      if (current === '$' && source[index + 1] === '{') {
        slot += 1
        literal += `{value${slot}}`
        index += 2
        let depth = 1
        while (index < source.length && depth > 0) {
          const inner = source[index]
          if (inner === "'" || inner === '"' || inner === '`') {
            const quote = inner
            index += 1
            while (index < source.length) {
              if (source[index] === '\\') { index += 2; continue }
              if (source[index] === quote) { index += 1; break }
              index += 1
            }
            continue
          }
          if (inner === '{') depth += 1
          else if (inner === '}') depth -= 1
          index += 1
        }
        continue
      }
      literal += current
      index += 1
    }
    const decoded = decodeJsEscapes(literal)
    if (/\p{Script=Han}/u.test(decoded) && /\{value\d+\}/.test(decoded)) output.add(decoded)
  }
  return [...output]
}
