// ===========================================================================
// remarkrc-with-plugins.mjs — remark config that uses installed npm plugins.
//
// This is an alternative to .remarkrc.mjs that uses remark-gfm and
// remark-frontmatter instead of custom inline implementations.
//
// To use this config:
//   1. Install dependencies:
//        npm init -y
//        npm install remark-gfm remark-frontmatter
//        echo 'node_modules/' >> .gitignore
//   2. Rename this file to .remarkrc.mjs (replacing the existing one).
//   3. Reload VS Code window (Ctrl+Shift+P -> Reload Window).
//
// What remark-gfm replaces:
//   - formatTables, formatTableText, parseCells, buildDelimCell (table formatting)
//   - looksLikeTable (table detection for headingJoin)
//   remark-gfm parses tables into proper table/tableRow/tableCell AST nodes
//   and handles formatting natively.
//
// What remark-frontmatter replaces:
//   - preserveFrontmatter (parser+compiler wrapper)
//   remark-frontmatter adds YAML frontmatter as a native AST node type.
//
// What stays the same (no npm equivalent):
//   - replaceText, boldToCodeInLists, boldToHeading, preserveContent
//   - textHandler, linkHandler, definitionHandler (escape disabling)
//   - headingJoin (simplified — no looksLikeTable needed)
//
// Documentation: see remark-config-notes.md
// ===========================================================================

import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'

// ---------------------------------------------------------------------------
// replaceText: Factory that returns a remark plugin to replace text patterns
// in the final serialized markdown.
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
// With remark-gfm, tables are proper 'table' nodes, so we check right.type
// directly instead of using looksLikeTable().
// ---------------------------------------------------------------------------
function headingJoin(left, right) {
  if (left.type === 'heading') {
    if (right.type === 'paragraph') return 0
    if (right.type === 'table') return 1
    return 1
  }
}

// ---------------------------------------------------------------------------
// boldToCodeInLists: Converts bold text at the start of list items to inline
// code. E.g., "* **foo** bar" becomes "* `foo` bar".
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
// preserveContent: Factory that returns a parser+compiler wrapper to preserve
// content matching a regex pattern (e.g., Hugo shortcodes).
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
    remarkFrontmatter,
    remarkGfm,
    preserveContent(/\{\{<[\s\S]*?>}}|\{\{-[\s\S]*?-}}/g, 'SHORTCODE'),
    boldToCodeInLists,
    boldToHeading,
    replaceText({ '→': '->', '←': '<-' })
  ]
}
