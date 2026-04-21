// ===========================================================================
// .remarkrc.mjs — remark configuration for vscode-remark (markdown formatter).
//
// All plugins are defined inline — no external npm packages, no package.json.
// This file is loaded by vscode-remark's language server via unified-engine's
// findUp (walks up the directory tree to find the nearest .remarkrc.mjs).
//
// Design: We avoid remark-gfm (tables), remark-frontmatter (YAML), and other
// ecosystem packages to keep the workspace dependency-free. The tradeoff is
// custom workarounds for things remark doesn't natively handle (table
// formatting as string post-processing, frontmatter stripping, shortcode
// preservation via placeholders).
//
// Plugin patterns used:
//   1. Tree transformer — returns (tree) => {...}, modifies AST nodes.
//   2. Compiler wrapper — wraps self.compiler to post-process serialized output.
//   3. Parser+compiler wrapper — wraps self.parser AND self.compiler to strip
//      content before parsing and restore it after serialization.
//   4. Custom handlers — override how specific AST node types are serialized.
//   5. Factory — function that returns a plugin (replaceText, preserveContent).
//
// After any change, reload the VS Code window (Ctrl+Shift+P -> Reload Window)
// because the language server caches this file via Node's ES module cache.
//
// Documentation: see remark-config-notes.md for detailed explanations,
// bug history, and lessons learned.
// ===========================================================================

// ---------------------------------------------------------------------------
// replaceText: Factory that returns a remark plugin to replace text patterns
// in the final serialized markdown.
// `mappings` is an object of { 'from': 'to' } pairs.
// ---------------------------------------------------------------------------
function replaceText(mappings) {
  return function() {
    const self = this
    const origCompiler = self.compiler

    self.compiler = function(tree, file) {
      let result = origCompiler.call(this, tree, file)
      for (const [from, to] of Object.entries(mappings)) {
        result = result.split(from).join(to)
      }
      return result
    }
  }
}

// ---------------------------------------------------------------------------
// headingJoin: Controls blank lines after headings.
// Returns 0 (no blank line) between a heading and a paragraph, UNLESS the
// paragraph is actually a table (without remark-gfm, tables are paragraph
// nodes). Returns 1 (single blank line) for all other sibling types.
// ---------------------------------------------------------------------------
function headingJoin(left, right) {
  if (left.type === 'heading') {
    if (right.type === 'paragraph' && !looksLikeTable(right)) return 0
    return 1
  }
}

// ---------------------------------------------------------------------------
// looksLikeTable: Helper for headingJoin. Without remark-gfm, tables are
// parsed as paragraph nodes. This reconstructs the raw text from a
// paragraph's children and checks if the second line is a table delimiter
// row (e.g., |---|---|).
// ---------------------------------------------------------------------------
function looksLikeTable(node) {
  if (!node.children) return false
  const raw = node.children.map(c => {
    if (c.type === 'text') return c.value
    if (c.type === 'inlineCode') return '`' + c.value + '`'
    return ''
  }).join('')
  const lines = raw.split('\n')
  if (lines.length < 2) return false
  const cells = parseCells(lines[1])
  return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c))
}

// ---------------------------------------------------------------------------
// boldToCodeInLists: Converts bold text at the start of list items to inline
// code. E.g., "* **foo** bar" becomes "* `foo` bar".
// Also handles bold containing inline code: "* **Use `.remarkrc.mjs`**"
// becomes "* `Use .remarkrc.mjs`" (inner backticks removed, whole text wrapped).
// Only converts when bold is the first child and all children are text or
// inlineCode nodes.
// ---------------------------------------------------------------------------
function boldToCodeInLists() {
  return (tree) => {
    function visit(node) {
      if (node.type === 'listItem') {
        for (const child of (node.children || [])) {
          if (child.type === 'paragraph' && child.children && child.children.length > 0) {
            const first = child.children[0]
            if (first.type === 'strong' && first.children && first.children.length > 0) {
              const allTextOrCode = first.children.every(
                c => c.type === 'text' || c.type === 'inlineCode'
              )
              if (allTextOrCode) {
                const value = first.children.map(c => c.value).join('')
                child.children[0] = { type: 'inlineCode', value }
              }
            }
          }
        }
      }
      if (node.children) {
        node.children.forEach(visit)
      }
    }
    visit(tree)
  }
}

// ---------------------------------------------------------------------------
// boldToHeading: Converts standalone bold paragraphs to headings.
// E.g., a paragraph containing only "**Title**" becomes a heading one level
// deeper than the last heading seen. Depth is capped at 6 (h6).
// Only converts root-level paragraphs (not inside lists/blockquotes).
// Uses the PREVIOUS heading's depth, not the converted heading's depth,
// to avoid cascading depth escalation.
// ---------------------------------------------------------------------------
function boldToHeading() {
  return (tree) => {
    if (tree.type !== 'root' || !tree.children) return
    let lastDepth = 1
    for (let i = 0; i < tree.children.length; i++) {
      const node = tree.children[i]
      if (node.type === 'heading') {
        lastDepth = node.depth
        continue
      }
      if (
        node.type === 'paragraph' &&
        node.children &&
        node.children.length === 1 &&
        node.children[0].type === 'strong' &&
        node.children[0].children &&
        node.children[0].children.length === 1 &&
        node.children[0].children[0].type === 'text'
      ) {
        const depth = Math.min(lastDepth + 1, 6)
        tree.children[i] = {
          type: 'heading',
          depth,
          children: [{ type: 'text', value: node.children[0].children[0].value }]
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// formatTables: Compiler wrapper that pads table columns to equal width.
// Wraps self.compiler (own property) to post-process the serialized markdown.
// Cannot use an AST transformer because without remark-gfm, tables are not
// parsed into table/tableRow/tableCell nodes — they're paragraph > text.
// Splits output by code fences first so tables inside ``` blocks are not touched.
// ---------------------------------------------------------------------------
function formatTables() {
  const self = this
  const orig = self.compiler
  self.compiler = function(tree, file) {
    const result = orig.call(this, tree, file)
    const parts = result.split(/(^(?:`{3,}|~{3,}).*\n[\s\S]*?^(?:`{3,}|~{3,})\s*$)/gm)
    return parts.map((part, i) => {
      if (i % 2 === 1) return part
      return part.replace(
        /^(\|[^\n]+\n\|[\s:|\-]+\n(?:\|[^\n]+\n?)*)/gm,
        (match) => formatTableText(match)
      )
    }).join('')
  }
}

function formatTableText(tableText) {
  const lines = tableText.trimEnd().split('\n')
  const rows = lines.map(parseCells)
  const colCount = Math.max(...rows.map(r => r.length))

  const colWidths = new Array(colCount).fill(0)
  for (let r = 0; r < rows.length; r++) {
    if (r === 1) continue
    for (let c = 0; c < rows[r].length; c++) {
      colWidths[c] = Math.max(colWidths[c], rows[r][c].length)
    }
  }
  for (let c = 0; c < colCount; c++) {
    colWidths[c] = Math.max(colWidths[c], 3)
  }

  return rows.map((cells, r) => {
    const padded = []
    for (let c = 0; c < colCount; c++) {
      const cell = cells[c] || ''
      if (r === 1) {
        padded.push(buildDelimCell(cell, colWidths[c]))
      } else {
        padded.push(cell + ' '.repeat(colWidths[c] - cell.length))
      }
    }
    return '| ' + padded.join(' | ') + ' |'
  }).join('\n') + '\n'
}

function parseCells(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  const cells = []
  let current = ''
  let inCode = false
  for (const ch of s) {
    if (ch === '`') {
      inCode = !inCode
      current += ch
    } else if (ch === '|' && !inCode) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function buildDelimCell(cell, width) {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  const innerWidth = width - (left ? 1 : 0) - (right ? 1 : 0)
  return (left ? ':' : '') + '-'.repeat(innerWidth) + (right ? ':' : '')
}

// ---------------------------------------------------------------------------
// preserveFrontmatter: Parser + compiler wrapper that preserves YAML
// frontmatter (---...---). Without remark-frontmatter (npm package), remark
// parses --- as thematicBreak (***) and YAML lists as markdown lists,
// destroying frontmatter. This strips it before parsing and re-adds it after.
// ---------------------------------------------------------------------------
function preserveFrontmatter() {
  const self = this
  const origParser = self.parser
  let savedFrontmatter = null

  self.parser = function(doc, file) {
    const str = String(doc)
    const match = str.match(/^---\n([\s\S]*?)\n---\n?/)
    if (match) {
      savedFrontmatter = match[0]
      return origParser(str.slice(match[0].length), file)
    }
    savedFrontmatter = null
    return origParser(doc, file)
  }

  const origCompiler = self.compiler
  self.compiler = function(tree, file) {
    const result = origCompiler.call(this, tree, file)
    return savedFrontmatter ? savedFrontmatter + '\n' + result : result
  }
}

// ---------------------------------------------------------------------------
// preserveContent: Factory that returns a parser+compiler wrapper to preserve
// content matching a regex pattern. Replaces matches with safe alphanumeric
// placeholders before parsing, then restores originals after serialization.
// ---------------------------------------------------------------------------
function preserveContent(pattern, label) {
  return function() {
    const self = this
    const origParser = self.parser
    const saved = []

    self.parser = function(doc, file) {
      const str = String(doc)
      const cleaned = str.replace(pattern, (match) => {
        const idx = saved.length
        saved.push(match)
        return `REMARK${label}${idx}END`
      })
      return origParser(cleaned, file)
    }

    const origCompiler = self.compiler
    self.compiler = function(tree, file) {
      let result = origCompiler.call(this, tree, file)
      for (let i = 0; i < saved.length; i++) {
        result = result.replace(`REMARK${label}${i}END`, saved[i])
      }
      return result
    }
  }
}

// ---------------------------------------------------------------------------
// Custom handlers to disable remark-stringify's defensive escaping.
// ---------------------------------------------------------------------------
function textHandler(node) {
  return node.value
}

function linkHandler(node, _, state, info) {
  const exit = state.enter('link')
  const subexit = state.enter('label')
  const tracker = state.createTracker(info)
  let value = tracker.move('[')
  value += tracker.move(
    state.containerPhrasing(node, {
      before: value,
      after: '](',
      ...tracker.current()
    })
  )
  value += tracker.move('](')
  subexit()
  value += tracker.move(node.url || '')
  if (node.title) {
    value += tracker.move(' "' + node.title + '"')
  }
  value += tracker.move(')')
  exit()
  return value
}

function definitionHandler(node, _, state) {
  const exit = state.enter('definition')
  const subexit = state.enter('label')
  const id = state.associationId(node)
  subexit()
  let value = '[' + id + ']: ' + (node.url || '')
  if (node.title) {
    value += ' "' + node.title + '"'
  }
  exit()
  return value
}

// ---------------------------------------------------------------------------
// Export config
// ---------------------------------------------------------------------------
export default {
  settings: {
    bullet: '*',
    listItemIndent: 'one',
    tightDefinitions: true,
    rule: '-',
    ruleRepetition: 10,
    join: [headingJoin],
    handlers: {
      text: textHandler,
      link: linkHandler,
      definition: definitionHandler
    }
  },
  plugins: [
    preserveFrontmatter,
    preserveContent(/\{\{<[\s\S]*?>}}|\{\{-[\s\S]*?-}}/g, 'SHORTCODE'),
    boldToCodeInLists,
    boldToHeading,
    formatTables,
    replaceText({ '→': '->', '←': '<-' })
  ]
}
