// markdown-format-rules.cjs
//
// This file contains custom markdownlint rules that mimic the deterministic
// markdown formatting behavior we previously implemented with remark.
//
// Design goals:
// - only change the exact structures we care about
// - avoid touching fenced code blocks and YAML frontmatter
// - keep each rule focused on one instruction from the original markdown rules
// - use markdownlint fixInfo so VS Code can apply the change on save/fixAll

// Mark lines that should not be rewritten by text-based rules.
//
// We protect:
// - YAML frontmatter at the top of the file
// - fenced code blocks
//
// That lets the custom rules safely operate on plain markdown content without
// accidentally rewriting metadata or code examples.
function buildProtectedLines(lines) {
  const protectedLines = new Array(lines.length).fill(false)

  // Treat a leading --- ... --- block as YAML frontmatter.
  if (lines[0] === '---') {
    protectedLines[0] = true
    for (let index = 1; index < lines.length; index++) {
      protectedLines[index] = true
      if (lines[index] === '---') break
    }
  }

  // Track fenced code blocks so text replacement rules skip them.
  let inFence = false
  let fenceChar = ''
  let fenceLength = 0

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^\s*(`{3,}|~{3,})/)
    if (!match) {
      if (inFence) protectedLines[index] = true
      continue
    }

    const marker = match[1]
    const markerChar = marker[0]
    const markerLength = marker.length

    if (!inFence) {
      inFence = true
      fenceChar = markerChar
      fenceLength = markerLength
      protectedLines[index] = true
      continue
    }

    protectedLines[index] = true
    if (markerChar === fenceChar && markerLength >= fenceLength) {
      inFence = false
      fenceChar = ''
      fenceLength = 0
    }
  }

  return protectedLines
}

// Replace all configured text pairs in a line.
//
// Example:
// - "left → right" should become "left -> right"
// - "`x → y`" should also become "`x -> y`"
function replaceAllText(line, replacements) {
  let output = line

  for (const [from, to] of replacements) {
    output = output.split(from).join(to)
  }

  return output
}

// Parse a table row into trimmed cell values.
function parseCells(line) {
  let value = line.trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  return value.split('|').map((cell) => cell.trim())
}

// Identify a GFM delimiter row like:
// | --- | :---: |
function isDelimiterRow(line) {
  if (!line.includes('|')) return false
  const cells = parseCells(line)
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell))
}

// Decide whether the current line begins a markdown table.
function looksLikeTableStart(lines, protectedLines, index) {
  if (index + 1 >= lines.length) return false
  if (protectedLines[index] || protectedLines[index + 1]) return false
  if (!lines[index].includes('|')) return false
  return isDelimiterRow(lines[index + 1])
}

// Build a normalized delimiter cell with the same alignment markers.
function buildDelimiterCell(cell, width) {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  const innerWidth = Math.max(width - (left ? 1 : 0) - (right ? 1 : 0), 1)
  return `${left ? ':' : ''}${'-'.repeat(innerWidth)}${right ? ':' : ''}`
}

// Format a whole markdown table so the columns line up.
//
// This mirrors the earlier remark table-padding behavior.
function formatTable(lines) {
  const rows = lines.map(parseCells)
  const columnCount = Math.max(...rows.map((row) => row.length))
  const widths = new Array(columnCount).fill(3)

  // Measure only header/body content. The delimiter row is generated later.
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    if (rowIndex === 1) continue
    for (let columnIndex = 0; columnIndex < rows[rowIndex].length; columnIndex++) {
      widths[columnIndex] = Math.max(widths[columnIndex], rows[rowIndex][columnIndex].length)
    }
  }

  return rows.map((cells, rowIndex) => {
    const padded = []
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      const cell = cells[columnIndex] || ''
      if (rowIndex === 1) {
        padded.push(buildDelimiterCell(cell, widths[columnIndex]))
      } else {
        padded.push(cell + ' '.repeat(widths[columnIndex] - cell.length))
      }
    }
    return `| ${padded.join(' | ')} |`
  })
}

function isHeadingLine(line) {
  return /^#{1,6}\s+/.test(line)
}

function isListLine(line) {
  return /^\s*(?:[*+-]|\d+\.)\s+/.test(line)
}

function isFenceLine(line) {
  return /^\s*(`{3,}|~{3,})/.test(line)
}

function isShortcodeLine(line) {
  return /^\s*\{\{[-<]/.test(line)
}

function isTableBlockStart(lines, protectedLines, index) {
  return looksLikeTableStart(lines, protectedLines, index)
}

function isParagraphLine(lines, protectedLines, index) {
  const line = lines[index]
  if (!line || protectedLines[index]) return false
  if (line.trim() === '') return false
  if (isHeadingLine(line) || isListLine(line) || isFenceLine(line)) return false
  if (isShortcodeLine(line)) return false
  if (isTableBlockStart(lines, protectedLines, index)) return false
  return true
}

function classifyBlockStart(lines, protectedLines, index) {
  if (isTableBlockStart(lines, protectedLines, index)) return 'table'
  if (isFenceLine(lines[index])) return 'fence'
  if (isListLine(lines[index])) return 'list'
  if (isParagraphLine(lines, protectedLines, index)) return 'paragraph'
  if (isHeadingLine(lines[index])) return 'heading'
  if (isShortcodeLine(lines[index])) return 'shortcode'
  return 'other'
}

function findNextNonBlank(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index++) {
    if (lines[index].trim() !== '') return index
  }
  return -1
}

function isMarkdownItBlockStartToken(token) {
  return token && (
    token.type === 'paragraph_open' ||
    token.type === 'heading_open' ||
    token.type === 'bullet_list_open' ||
    token.type === 'ordered_list_open' ||
    token.type === 'blockquote_open' ||
    token.type === 'table_open' ||
    token.type === 'fence' ||
    token.type === 'code_block' ||
    token.type === 'html_block' ||
    token.type === 'hr'
  )
}

function findMatchingCloseToken(tokens, openIndex, openType, closeType) {
  let depth = 0

  for (let index = openIndex; index < tokens.length; index++) {
    if (tokens[index].type === openType) depth++
    if (tokens[index].type === closeType) depth--
    if (depth === 0) return index
  }

  return -1
}

function findNextBlockToken(tokens, startIndex) {
  for (let index = startIndex; index < tokens.length; index++) {
    if (isMarkdownItBlockStartToken(tokens[index])) return index
  }

  return -1
}

function isSingleLineToken(token) {
  return !!(token && token.map && token.map[1] === token.map[0] + 1)
}

function getMeaningfulChildren(children) {
  return (children || []).filter((child) => child.type !== 'text' || child.content !== '')
}

function lineHasLeadingStrong(line) {
  return /^(\s*(?:[*+-]|\d+\.)\s+)\*\*(.+?)\*\*(.*)$/.test(line)
}

function lineIsStandaloneStrong(line) {
  return /^\*\*([^`].*[^`]|[^`])\*\*$/.test(line)
}

function createTextReplacementRule({ name, description, detail, replacements }) {
  return {
    names: [name],
    description,
    tags: ['deterministic-markdown'],
    parser: 'markdownit',
    function: (params, onError) => {
      const protectedLines = buildProtectedLines(params.lines)

      params.lines.forEach((line, index) => {
        if (protectedLines[index]) return
        const fixedLine = replaceAllText(line, replacements)
        if (fixedLine === line) return

        onError({
          lineNumber: index + 1,
          detail,
          context: line,
          fixInfo: {
            lineNumber: index + 1,
            editColumn: 1,
            deleteCount: line.length,
            insertText: fixedLine
          }
        })
      })
    }
  }
}

const blockSpacingRule = {
  names: ['markdown-format-block-spacing'],
  description: 'Apply the custom block-spacing rules used by the deterministic markdown style.',
  tags: ['deterministic-markdown'],
  parser: 'markdownit',
  function: (params, onError) => {
    const tokens = params.parsers.markdownit.tokens

    for (let index = 0; index < tokens.length; index++) {
      if (tokens[index].type !== 'heading_open') continue

      const headingCloseIndex = findMatchingCloseToken(tokens, index, 'heading_open', 'heading_close')
      if (headingCloseIndex === -1) continue

      const nextBlockIndex = findNextBlockToken(tokens, headingCloseIndex + 1)
      if (nextBlockIndex === -1) continue

      const headingEndLine = tokens[index].map && tokens[index].map[1]
      const nextStartLine = tokens[nextBlockIndex].map && tokens[nextBlockIndex].map[0]
      if (headingEndLine === undefined || nextStartLine === undefined) continue

      const nextToken = tokens[nextBlockIndex]
      const nextStartLineText = params.lines[nextStartLine] || ''
      const nextKind = nextToken.type === 'paragraph_open' && isShortcodeLine(nextStartLineText)
        ? 'shortcode'
        : nextToken.type === 'paragraph_open'
          ? 'paragraph'
          : 'other'
      const blankCount = nextStartLine - headingEndLine

      if (nextKind === 'paragraph') {
        for (let lineIndex = headingEndLine; lineIndex < nextStartLine; lineIndex++) {
          onError({
            lineNumber: lineIndex + 1,
            detail: 'Do not leave a blank line between a heading and a paragraph.',
            fixInfo: {
              lineNumber: lineIndex + 1,
              deleteCount: -1
            }
          })
        }
      } else {
        if (blankCount === 0) {
          onError({
            lineNumber: nextStartLine + 1,
            detail: 'Leave one blank line after a heading before lists, code blocks, or shortcodes.',
            fixInfo: {
              lineNumber: nextStartLine + 1,
              insertText: '\n'
            }
          })
        } else if (blankCount > 1) {
          for (let lineIndex = headingEndLine + 1; lineIndex < nextStartLine; lineIndex++) {
            onError({
              lineNumber: lineIndex + 1,
              detail: 'Leave exactly one blank line after a heading before non-paragraph blocks.',
              fixInfo: {
                lineNumber: lineIndex + 1,
                deleteCount: -1
              }
            })
          }
        }
      }
    }
  }
}

const asciiArrowRule = createTextReplacementRule({
  name: 'markdown-format-ascii-arrows',
  description: 'Replace Unicode arrows with ASCII arrows on non-protected lines.',
  detail: 'Use ASCII arrows.',
  replacements: [
    ['→', '->'],
    ['←', '<-']
  ]
})

const boldListCodeRule = {
  names: ['markdown-format-bold-list-code'],
  description: 'Convert leading bold text in list items to inline code and normalize the list marker.',
  tags: ['deterministic-markdown'],
  parser: 'markdownit',
  function: (params, onError) => {
    const tokens = params.parsers.markdownit.tokens
    const pattern = /^(\s*(?:[*+-]|\d+\.)\s+)\*\*(.+?)\*\*(.*)$/
    const stack = []

    for (const token of tokens) {
      if (token.nesting === -1) {
        stack.pop()
        continue
      }

      if (
        token.type === 'inline' &&
        isSingleLineToken(token) &&
        stack.includes('list_item_open') &&
        stack[stack.length - 1] === 'paragraph_open'
      ) {
        const children = getMeaningfulChildren(token.children)
        if (children[0]?.type !== 'strong_open') {
          if (token.nesting === 1) stack.push(token.type)
          continue
        }

        const index = token.map[0]
        const line = params.lines[index]
        if (!lineHasLeadingStrong(line)) {
          if (token.nesting === 1) stack.push(token.type)
          continue
        }

        const match = line.match(pattern)
        if (!match) {
          if (token.nesting === 1) stack.push(token.type)
          continue
        }

        const prefix = match[1].replace(/^\s*[-+]\s/, (value) => value.replace(/[-+]/, '*'))
        const strongContent = match[2].replace(/`/g, '')
        const suffix = match[3]
        const fixedLine = `${prefix}\`${strongContent}\`${suffix}`
        if (fixedLine !== line) {
          onError({
            lineNumber: index + 1,
            detail: 'Use inline code instead of leading bold in list items.',
            context: line,
            fixInfo: {
              lineNumber: index + 1,
              editColumn: 1,
              deleteCount: line.length,
              insertText: fixedLine
            }
          })
        }
      }

      if (token.nesting === 1) stack.push(token.type)
    }
  }
}

const boldHeadingRule = {
  names: ['markdown-format-bold-heading'],
  description: 'Convert standalone bold paragraphs to headings one level below the last real heading.',
  tags: ['deterministic-markdown'],
  parser: 'markdownit',
  function: (params, onError) => {
    const tokens = params.parsers.markdownit.tokens
    let lastDepth = 1
    const stack = []

    for (const token of tokens) {
      if (token.nesting === -1) {
        stack.pop()
        continue
      }

      if (token.type === 'heading_open') {
        lastDepth = Number(token.tag.slice(1))
      }

      if (
        token.type === 'inline' &&
        isSingleLineToken(token) &&
        stack[stack.length - 1] === 'paragraph_open' &&
        !stack.includes('list_item_open')
      ) {
        const children = getMeaningfulChildren(token.children)
        if (children[0]?.type !== 'strong_open' || children[children.length - 1]?.type !== 'strong_close') {
          if (token.nesting === 1) stack.push(token.type)
          continue
        }

        const index = token.map[0]
        const line = params.lines[index]
        if (!lineIsStandaloneStrong(line)) {
          if (token.nesting === 1) stack.push(token.type)
          continue
        }

        const boldMatch = line.match(/^\*\*([^`].*[^`]|[^`])\*\*$/)
        if (!boldMatch) {
          if (token.nesting === 1) stack.push(token.type)
          continue
        }

        const depth = Math.min(lastDepth + 1, 6)
        const fixedLine = `${'#'.repeat(depth)} ${boldMatch[1]}`
        onError({
          lineNumber: index + 1,
          detail: 'Use a heading instead of a standalone bold paragraph.',
          context: line,
          fixInfo: {
            lineNumber: index + 1,
            editColumn: 1,
            deleteCount: line.length,
            insertText: fixedLine
          }
        })
      }

      if (token.nesting === 1) stack.push(token.type)
    }
  }
}

const tightDefinitionsRule = {
  names: ['markdown-format-tight-definitions'],
  description: 'Remove blank lines between adjacent reference definitions.',
  tags: ['deterministic-markdown'],
  parser: 'markdownit',
  function: (params, onError) => {
    const protectedLines = buildProtectedLines(params.lines)
    const definitionPattern = /^\[[^\]]+\]:\s+\S/

    for (let index = 1; index < params.lines.length - 1; index++) {
      if (protectedLines[index]) continue
      if (params.lines[index] !== '') continue
      if (!definitionPattern.test(params.lines[index - 1])) continue
      if (!definitionPattern.test(params.lines[index + 1])) continue

      onError({
        lineNumber: index + 1,
        detail: 'Keep adjacent link definitions tight.',
        fixInfo: {
          lineNumber: index + 1,
          deleteCount: -1
        }
      })
    }
  }
}

const thematicBreakRule = {
  names: ['markdown-format-thematic-break'],
  description: 'Normalize thematic breaks to ten dashes.',
  tags: ['deterministic-markdown'],
  parser: 'markdownit',
  function: (params, onError) => {
    const tokens = params.parsers.markdownit.tokens

    for (const token of tokens) {
      if (token.type !== 'hr' || !isSingleLineToken(token)) continue

      const index = token.map[0]
      const line = params.lines[index]
      if (line === '----------') continue

      onError({
        lineNumber: index + 1,
        detail: 'Use ten dashes for thematic breaks.',
        context: line,
        fixInfo: {
          lineNumber: index + 1,
          editColumn: 1,
          deleteCount: line.length,
          insertText: '----------'
        }
      })
    }
  }
}

const tableAlignRule = {
  names: ['markdown-format-table-align'],
  description: 'Pad and align markdown tables.',
  tags: ['deterministic-markdown'],
  parser: 'markdownit',
  function: (params, onError) => {
    const tokens = params.parsers.markdownit.tokens

    for (const token of tokens) {
      if (token.type !== 'table_open' || !token.map) continue

      const index = token.map[0]
      const end = token.map[1] - 1

      const originalLines = params.lines.slice(index, end + 1)
      const formattedLines = formatTable(originalLines)

      originalLines.forEach((line, rowOffset) => {
        const formattedLine = formattedLines[rowOffset]
        if (formattedLine === line) return

        onError({
          lineNumber: index + rowOffset + 1,
          detail: 'Align markdown table columns.',
          context: line,
          fixInfo: {
            lineNumber: index + rowOffset + 1,
            editColumn: 1,
            deleteCount: line.length,
            insertText: formattedLine
          }
        })
      })
    }
  }
}

module.exports = [
  blockSpacingRule,
  asciiArrowRule,
  boldListCodeRule,
  boldHeadingRule,
  tightDefinitionsRule,
  thematicBreakRule,
  tableAlignRule
]
