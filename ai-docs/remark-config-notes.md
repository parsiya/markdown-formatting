---
draft: false
toc: false
comments: false
categories:
- ai-docs
title: "vscode-remark Configuration Notes"
wip: false
snippet: "Automatically format markdown with unifiedjs.remark in VS Code"
url: /ai-docs/markdown-formatting/remark-config-notes/
---

# vscode-remark Configuration Notes

## Setup

* Extension: `unifiedjs.vscode-remark` v3.2.0.
* Config file: `.remarkrc.mjs` (ESM) at workspace root or any parent directory.
* Two working config styles exist:
  * Inline-only: no `package.json`, all plugins defined in `.remarkrc.mjs`.
  * Installed plugins: local `package.json` plus `remark-gfm` and
    `remark-frontmatter` imported from `.remarkrc.mjs`.

### Design Decision: Inline vs Installed Plugins
There are two viable ways to run `vscode-remark` with this config.

**Inline-only config** keeps everything inside `.remarkrc.mjs` and avoids npm
metadata in the repo. This is useful when the main goal is keeping Markdown
repos dependency-free.

**Installed plugins** uses a normal local Node setup and imports ecosystem
packages from `.remarkrc.mjs`. This is now verified to work in this workspace
with a real `.remarkrc.mjs`, a local `package.json`, and installed packages.
It simplifies the config because remark can parse frontmatter and GFM tables
natively.

The two main packages are:

* `remark-frontmatter` — would handle YAML frontmatter natively (replaces our
  `preserveFrontmatter` parser+compiler wrapper).
* `remark-gfm` — would parse tables into proper `table`/`tableRow`/`tableCell`
  AST nodes (replaces our `formatTables` compiler wrapper and `looksLikeTable`
  helper). Would also fix `headingJoin` not needing the table detection hack.

Tradeoffs:

* Inline-only avoids `package.json` and `node_modules`, but needs more custom
  code and more workarounds for things remark does not parse natively.
* Installed plugins add `package.json`, `package-lock.json`, and
  `node_modules/`, but remove the table/frontmatter hacks and are easier to
  reason about.
* vscode-remark still cannot reliably use globally installed plugins in
  Remote/WSL setups, so installed plugins should be local to the repo or a
  shared parent directory.
* VS Code settings:

```json
"[markdown]": {
    "editor.defaultFormatter": "unifiedjs.vscode-remark",
    "editor.formatOnSave": true
},
"remark.requireConfig": true
```

## Config File Search (findUp)
The language server uses unified-engine's `findUp` to locate `.remarkrc.mjs`.
It walks **up** the directory tree from the file being formatted, checking each
directory for a config file. It stops at the **first** match.

For a file at `/home/parsia/dev/myproject/docs/file.md`, the search order is:

1. `/home/parsia/dev/myproject/docs/`
2. `/home/parsia/dev/myproject/` <- workspace-level config
3. `/home/parsia/dev/`
4. `/home/parsia/` <- home directory config
5. `/home/`
6. `/`

### Global Config (Home Directory)
Place `.remarkrc.mjs` at `~/.remarkrc.mjs` (`/home/parsia/.remarkrc.mjs` on
Linux/WSL, `C:\Users\Parsia\.remarkrc.mjs` on Windows). This applies to **all
files under your home directory** — which is effectively all workspaces.

### Per-Workspace Overrides
A `.remarkrc.mjs` in a workspace directory takes precedence over the home
directory one (findUp stops at the first match). This allows a global default
with per-workspace overrides when needed.

### Symlink Approach
Keep a canonical config in a dotfiles repo and symlink it:

```bash
# Linux/WSL: global config via symlink

ln -s ~/dotfiles/.remarkrc.mjs ~/.remarkrc.mjs

# Linux/WSL: per-workspace symlink

ln -s ~/dotfiles/.remarkrc.mjs /path/to/workspace/.remarkrc.mjs
```

```powershell
# Windows (elevated PowerShell): global config

New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.remarkrc.mjs" -Target "C:\dotfiles\.remarkrc.mjs"
```

### Remote WSL Considerations
When using VS Code Remote WSL, the language server runs on the Linux side.
Config search uses the Linux filesystem (`/home/parsia/`). For files opened
locally on Windows (not via Remote), the server runs on Windows and searches the
Windows filesystem (`C:\Users\Parsia\`). If you use both, you need the config in
both locations.

### Extension Settings
The extension only has three settings: `remark.requireConfig` (boolean),
`remark.trace.server.format`, and `remark.trace.server.verbosity`. There is **no
setting for a global config path** — the findUp search is the only mechanism.

## Window Reload Required
The language server uses `import()` to load `.remarkrc.mjs`. Node.js caches ES
modules for the lifetime of the process. **Every change to `.remarkrc.mjs`
requires reloading the VS Code window** (Ctrl+Shift+P -> "Developer: Reload
Window") to take effect.

## Config File Structure
Everything goes in one `.remarkrc.mjs` file. Plugins are defined as inline
functions. Separate plugin files (`.js`/`.mjs` imports) do NOT work without a
`package.json` because the bundled `load-plugin` in vscode-remark can't resolve
local paths correctly.

```js
// Plugin functions live inline in `.remarkrc.mjs`.
function myPlugin() {
  // Plugin setup or transformer logic goes here.
  // ...
}

export default {
  settings: {
    // Built-in remark-stringify options go here.
  },
  plugins: [
    // Plugins are registered here in execution order.
    myPlugin
  ]
}
```

## Settings (remark-stringify options)
Settings map directly to `mdast-util-to-markdown` options. They are applied via
`processor.data('settings', ...)`. Only use settings that actually correspond to
a formatting rule you need.

### Rule-to-Setting Mapping

<!-- markdownlint-disable markdown-format-ascii-arrows -->
| Formatting Rule                              | How It's Handled                   | Detail                                                                        |
| -------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| Use `*` for unordered lists, not `-`         | `bullet: '*'` setting              | Converts all `-` and `+` list markers to `*`                                  |
| One space between list marker and text       | `listItemIndent: 'one'` setting    | Produces `* text` with exactly one space                                      |
| No blank line between heading and paragraph  | `join: [headingJoin]` setting      | Custom join function returns `0` for heading+paragraph                        |
| Blank line between heading and list          | `join: [headingJoin]` setting      | Custom join function returns `1` for heading+list                             |
| Blank line between heading and code block    | `join: [headingJoin]` setting      | Custom join function returns `1` for heading+code                             |
| Use `->` and `<-` instead of `→` and `←`     | `replaceText` plugin               | Factory function: final serialized-text replacement across the whole document |
| Blank line between normal text and list      | remark default                     | remark-stringify always adds `\n\n` between all block elements                |
| Blank line between heading and heading       | remark default + join              | Default `\n\n`, also explicitly returned as `1` in headingJoin                |
| Bold in lists -> backticks                   | `boldToCodeInLists` plugin         | Replaces leading `strong` in `listItem` with `inlineCode`                     |
| Bold -> heading conversion                   | `boldToHeading` plugin             | Replaces standalone `strong` paragraphs with `heading` at context-aware depth |
| Align table columns                          | `formatTables` plugin              | Compiler wrapper: pads cells and aligns pipes in the serialized output        |
| Don't escape text, URLs, or definitions      | Custom `handlers` setting          | Override `text`, `link`, `definition` handlers to skip `state.safe()`         |
| No blank lines between reference definitions | `tightDefinitions: true`           | Built-in remark-stringify setting                                             |
| Preserve YAML frontmatter                    | `preserveFrontmatter` plugin       | Parser+compiler wrapper: strips before parse, re-adds after compile           |
| Normalize thematic breaks to `----------`    | `rule: '-'` + `ruleRepetition: 10` | All `---`, `***`, `* * *`, etc. become 10 dashes                              |
| Preserve Hugo shortcodes                     | `preserveContent` factory plugin   | Placeholder pattern: strips before parse, restores after compile              |
<!-- markdownlint-enable markdown-format-ascii-arrows -->

**`bullet: '*'`** - remark-stringify uses this character for all unordered list
markers. Converts `-` and `+` lists to `*`. Fixes the rule: "Use `*` for
unordered lists, not `-`."

**`listItemIndent: 'one'`** - controls indent after the list marker. `'one'`
means exactly one space: `* text`. Other values: `'tab'` (tab stop width) and
`'mixed'` (one for tight lists, tab for loose). Must be the string `'one'`, not
the number `1`. Fixes the rule: "Put one space between a list marker and the
text that follows it."

**`join: [headingJoin]`** - array of functions controlling blank lines between
blocks. Our `headingJoin` function handles three rules at once: no blank line
after heading+paragraph, keep blank line for heading+list, heading+code, and
heading+heading. See "Join Functions" section below for details.

### Other available settings
Full list: `bullet`, `bulletOther`, `bulletOrdered`,
`closeAtx`, `emphasis`, `fence`, `fences`, `incrementListMarker`,
`listItemIndent`, `quote`, `resourceLink`, `rule`, `ruleRepetition`,
`ruleSpaces`, `setext`, `strong`, `tightDefinitions`, `handlers`, `join`,
`unsafe`.

Reference: [https://github.com/syntax-tree/mdast-util-to-markdown#options](https://github.com/syntax-tree/mdast-util-to-markdown#options)

## Join Functions (Blank Line Control)
remark-stringify inserts `\n\n` (one blank line) between ALL block elements by
default. The only way to change this is the `join` API. There is no boolean
setting for it (except `tightDefinitions` for definition lists).

A join function receives `(left, right, parent, state)` and returns:

* `0` - no blank line (just `\n`).
* `1` or `true` - one blank line (default `\n\n`). Stops further join
  processing.
* Any number `n` - `n` blank lines (`\n` repeated `n+1` times).
* `false` - nodes can't be adjacent, inserts an HTML comment to break them.
* `undefined` - no opinion, try next join function. If all return undefined, the
  default `\n\n` is used.

Join functions are checked in **reverse order** (last added checked first).

### headingJoin Implementation
The join function only needs to handle heading+paragraph (remove blank line).
Everything else after a heading keeps the default blank line. The key design
decision: use a whitelist for removal (`paragraph`) rather than a blacklist of
types to keep. This way new block types (tables, blockquotes, HTML, thematic
breaks, etc.) automatically get the blank line without updating the function.

```js
function headingJoin(left, right) {
  // Only customize spacing after headings.
  if (left.type === 'heading') {
    // Heading + normal paragraph: remove the blank line.
    if (right.type === 'paragraph' && !looksLikeTable(right)) return 0

    // Heading + anything else: keep the default blank line.
    return 1
  }
}
```

Place in config under `settings.join`:

```js
export default {
  settings: {
    // Register the join rule with remark-stringify.
    join: [headingJoin]
  }
}
```

Block types that keep the blank line after a heading (by returning `1`):
`list`, `code`, `heading`, `table`, `blockquote`, `thematicBreak`, `html`, and
any future types.

#### headingJoin and tables
Without remark-gfm, tables are parsed as `paragraph` nodes (not `table` nodes).
The original `headingJoin` treated heading+table as heading+paragraph and
removed the blank line.

**Fix:** The `looksLikeTable` helper inspects the paragraph's children to detect
table content. It reconstructs the raw text (including inline code), splits by
`\n`, and checks if the second line is a valid delimiter row (`| --- | --- |`).
If it is, `headingJoin` skips the `return 0` and falls through to `return 1`
(keep blank line).

```js
function looksLikeTable(node) {
  // Tables only matter on paragraph-like nodes.
  if (!node.children) return false

  // Rebuild the paragraph text, preserving inline code markers.
  const raw = node.children.map(c => {
    if (c.type === 'text') return c.value
    if (c.type === 'inlineCode') return '`' + c.value + '`'
    return ''
  }).join('')

  // Markdown tables need at least a header row and delimiter row.
  const lines = raw.split('\n')
  if (lines.length < 2) return false

  // A valid delimiter row (`---`, `:---`, `---:`, `:---:`) is the signal.
  const cells = parseCells(lines[1])
  return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c))
}
```

The delimiter row is what makes a table a table — a random paragraph starting
with `|` won't have `| --- | --- |` on line 2. This reuses the same
`parseCells` helper used by `formatTables`.

## Tree Transformer Plugins
Plugins that modify the AST (parsed markdown tree) before serialization. Most
of the custom plugins below are tree transformers, but `replaceText` was moved
to a compiler wrapper so arrow replacement now applies to the final markdown
output everywhere, not just to `text` nodes.

Node types: `text`, `heading`, `paragraph`, `list`, `listItem`, `code`,
`inlineCode`, `strong`, `emphasis`, `link`, `image`, `blockquote`,
`thematicBreak`, `html`, `definition`, `root`.

Text replacement — `replaceText` factory:

```js
// Factory that returns a remark plugin to replace text patterns in the final
// serialized markdown.
// `mappings` is an object of { 'from': 'to' } pairs.
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
```

Usage in the plugins array:

```js
plugins: [
  // Each factory call creates one configured plugin instance.
  replaceText({ '→': '->', '←': '<-' }),
]
```

The function returns a setup plugin that wraps the compiler. It runs after
remark has serialized the document, so the replacement applies to the final
markdown text rather than only to selected AST node types.

To add more replacements, add entries to the mappings object:

```js
// Add more entries when one plugin instance should handle them together.
replaceText({ '→': '->', '←': '<-', '…': '...' }),
```

Or use multiple calls for different groups:

```js
plugins: [
  // Or keep separate instances when you want the mappings grouped apart.
  replaceText({ '→': '->', '←': '<-' }),
  replaceText({ '…': '...' }),
]
```

Because the implementation now uses literal `split(...).join(...)`
replacement, the mapping keys are treated as plain text, not regular
expressions.

Key points:

* The function passed to `plugins: []` is called during processor setup with
  `this` bound to the processor.
* It can also return a setup-only plugin that wraps the parser or compiler
  instead of returning a tree transformer.
* Tree nodes have `.type`, `.value` (for text/code), `.children` (for
  containers), `.depth` (for headings 1-6).

This was changed specifically for arrow replacement. The old implementation
only touched `text` nodes, so arrows inside inline code, fenced code, YAML
frontmatter, and preserved shortcode content were left alone. The current
implementation rewrites those too because it runs on the final serialized
markdown string.

### boldToCodeInLists Implementation
Replaces bold text at the start of list items with inline code. Works for both
ordered and unordered lists because both use `listItem` nodes in the AST.

AST before (simple): `* **file.js** — description`

```
listItem -> paragraph -> [strong -> [text("file.js")], text(" — description")]
```

AST after: ``* `file.js` — description``

```
listItem -> paragraph -> [inlineCode("file.js"), text(" — description")]
```

AST before (with inline code): ``* **Use `.remarkrc.mjs`, not `.remarkrc.json`.**``

```
listItem -> paragraph -> [strong -> [text("Use "), inlineCode(".remarkrc.mjs"), text(", not "), inlineCode(".remarkrc.json"), text(".")]]
```

AST after: `` * `Use .remarkrc.mjs, not .remarkrc.json.` ``

```
listItem -> paragraph -> [inlineCode("Use .remarkrc.mjs, not .remarkrc.json.")]
```

The plugin walks the tree looking for `listItem` nodes. For each list item, it
checks if the first child of the item's paragraph is a `strong` node whose
children are all `text` or `inlineCode` nodes. If so, it concatenates all
children's `.value` properties into a single string and replaces the `strong`
node with an `inlineCode` node.

```js
function boldToCodeInLists() {
  return (tree) => {
    function visit(node) {
      // Only list items can trigger this conversion.
      if (node.type === 'listItem') {
        for (const child of (node.children || [])) {
          // Look for the paragraph that holds the list item content.
          if (child.type === 'paragraph' && child.children && child.children.length > 0) {
            const first = child.children[0]

            // Only convert leading bold content.
            if (first.type === 'strong' && first.children && first.children.length > 0) {
              // Allow bold text that contains plain text and inline code.
              const allTextOrCode = first.children.every(
                c => c.type === 'text' || c.type === 'inlineCode'
              )
              if (allTextOrCode) {
                // Flatten the bold children into one inlineCode node.
                const value = first.children.map(c => c.value).join('')
                child.children[0] = { type: 'inlineCode', value }
              }
            }
          }
        }
      }

      // Continue through nested structures.
      if (node.children) {
        node.children.forEach(visit)
      }
    }

    // Walk the whole tree from the root.
    visit(tree)
  }
}
```

Conditions for replacement:

* Node is a `listItem`.
* List item has a `paragraph` child.
* First child of the paragraph is `strong`.
* All children of the `strong` node are `text` or `inlineCode` nodes.
* Only the first bold in the item is replaced (not all bold text).
* Inner inline code backticks are stripped (values concatenated into one string).

#### Bug: bold with inline code was not converted
The first version required `strong` to have exactly one `text` child:

```js
// BUG: only matched strong with a single text child
if (first.children.length === 1 && first.children[0].type === 'text') {
```

When bold contained inline code (e.g., ``**Use `.remarkrc.mjs`**``), the
`strong` node had multiple children: `[text("Use "), inlineCode(".remarkrc.mjs")]`.
The `length === 1` check failed and the bold was left unconverted.

**Fix:** Check that all children are `text` or `inlineCode` (not just one
`text`), then concatenate all `.value` properties. Both `text` and `inlineCode`
nodes have a `.value` string property, so `.map(c => c.value).join('')` works
for both.

### boldToHeading Implementation
Converts standalone bold paragraphs into headings. Only matches when bold is the
**only** content of the paragraph — bold mixed with other text is left alone.

The heading depth is context-aware: the plugin walks root's children in order,
tracks the most recent real heading's depth, and creates the new heading at
`lastDepth + 1` (capped at 6).

AST before: `**Prerequisites**` (after a `###` heading)

```
root -> paragraph -> [strong -> [text("Prerequisites")]]
```

AST after: `#### Prerequisites`

```
root -> heading (depth: 4) -> [text("Prerequisites")]
```

```js
function boldToHeading() {
  return (tree) => {
    // This transform only makes sense at the document root.
    if (tree.type !== 'root' || !tree.children) return

    // Track the last real heading so new headings can be one level deeper.
    let lastDepth = 1
    for (let i = 0; i < tree.children.length; i++) {
      const node = tree.children[i]
      if (node.type === 'heading') {
        // Existing headings update the depth context.
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
        // Convert standalone bold into a heading one level below context.
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
```

Conditions for replacement:

* Node is a `paragraph` that is a direct child of `root`.
* Paragraph has exactly one child of type `strong`.
* The `strong` has exactly one child of type `text`.
* Bold with surrounding text (e.g., `**bold** and more`) is NOT converted.
* Bold inside lists, blockquotes, etc. is NOT converted (only root children).
* Matches both numbered (`**3. Steps**`) and non-numbered (`**Prerequisites**`).

### formatTables Implementation
Formats markdown tables so all columns are padded to equal width with aligned
pipes. Unlike the other plugins, this does NOT operate on the AST — it wraps
the compiler and post-processes the serialized markdown string.

**Why not an AST transformer?** Without remark-gfm, tables are NOT parsed into
`table`/`tableRow`/`tableCell` AST nodes. They remain as `paragraph` nodes
whose children contain raw pipe text (mixed with `inlineCode` nodes for
backticks in cells). Modifying the AST and replacing children with a single
`text` node causes remark-stringify to escape backticks (`\``) and asterisks
(`*`). The compiler wrapper avoids this by operating after serialization.

**Plugin type:** Compiler wrapper (not a tree transformer). Uses `this` to
access the processor and wrap `self.compiler`. Does NOT return a transformer
function.

```js
function formatTables() {
  // Wrap the compiler because table formatting is easier on the final string.
  const self = this
  const orig = self.compiler
  self.compiler = function(tree, file) {
    // First let remark serialize the AST normally.
    const result = orig.call(this, tree, file)

    // Then find table-shaped blocks and rewrite them with aligned columns.
    return result.replace(
      /^(\|[^\n]+\n\|[\s:|\-]+\n(?:\|[^\n]+\n?)*)/gm,
      (match) => formatTableText(match)
    )
  }
}
```

The regex finds table blocks in the serialized output:
`^(\|[^\n]+\n\|[\s:|\-]+\n(?:\|[^\n]+\n?)*)` matches lines starting with
`|` followed by a delimiter row (`| --- | --- |`) and subsequent data rows.

Helper functions:

```js
function formatTableText(tableText) {
  // Break the serialized table into rows and cells.
  const lines = tableText.trimEnd().split('\n')
  const rows = lines.map(parseCells)

  // Size each column to the widest non-delimiter cell.
  const colCount = Math.max(...rows.map(r => r.length))
  const colWidths = new Array(colCount).fill(0)
  for (let r = 0; r < rows.length; r++) {
    if (r === 1) continue  // skip delimiter row
    for (let c = 0; c < rows[r].length; c++) {
      colWidths[c] = Math.max(colWidths[c], rows[r][c].length)
    }
  }
  for (let c = 0; c < colCount; c++) {
    colWidths[c] = Math.max(colWidths[c], 3)  // min width 3 for ---
  }

  // Rebuild each row using the computed widths.
  return rows.map((cells, r) => {
    const padded = []
    for (let c = 0; c < colCount; c++) {
      const cell = cells[c] || ''
      if (r === 1) {
        // Delimiter rows use dashes and optional alignment colons.
        padded.push(buildDelimCell(cell, colWidths[c]))
      } else {
        // Content rows are padded with spaces to column width.
        padded.push(cell + ' '.repeat(colWidths[c] - cell.length))
      }
    }
    return '| ' + padded.join(' | ') + ' |'
  }).join('\n') + '\n'
}

function parseCells(line) {
  // Strip outer pipes so splitting is easier.
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map(c => c.trim())
}

function buildDelimCell(cell, width) {
  // Preserve left/right alignment markers from the original delimiter cell.
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  const innerWidth = width - (left ? 1 : 0) - (right ? 1 : 0)
  return (left ? ':' : '') + '-'.repeat(innerWidth) + (right ? ':' : '')
}
```

Algorithm:

1. Split table text into rows, parse each row into cells by splitting on `|`.
2. Compute max width per column (skipping the delimiter row).
3. Pad content cells with trailing spaces to column width.
4. Rebuild delimiter cells with correct number of dashes, preserving `:` alignment markers.
5. Reassemble rows with `| cell | cell |` format.

Preserves: column alignment (`:---:`, `:---`, `---:`), inline code, emphasis,
and all other markdown syntax in cells.

**Known limitation: tables are `paragraph` nodes in the AST.** Without
remark-gfm, the `headingJoin` function sees tables as paragraphs and returns `0`
(no blank line between heading and table). This is a known issue — see
[headingJoin and tables](#headingjoin-and-tables).

#### Bug: formatTables also formatted tables inside code fences
**The problem:** The table-matching regex ran on the entire serialized output
string, including content inside fenced code blocks (` ``` ` and `~~~`). Any
table-like text in a code fence would get reformatted — padding cells, aligning
pipes — destroying the original code example.

##### Why not reuse `looksLikeTable`?**`looksLikeTable` operates on**AST nodes
during tree traversal (used by `headingJoin` to detect paragraph nodes that are
secretly tables). `formatTables` is a **compiler wrapper** that runs on the
serialized markdown **string** after the AST is gone. There are no nodes to
inspect at that point, only text. You could theoretically move table formatting
to an AST transformer that uses `looksLikeTable`, but modifying `paragraph >
text` node values to pad cells would cause remark-stringify to re-escape the
content through `state.safe()` — which is exactly why `formatTables` is a
compiler wrapper in the first place.

**Fix:** Split the serialized output by code fences before running the table
regex. The split regex captures fenced code blocks as alternating segments —
odd indices are code fence content (left untouched), even indices are regular
markdown (table formatting applied).

```js
self.compiler = function(tree, file) {
  const result = orig.call(this, tree, file)
  // Split by code fences — only format tables outside fences.
  const parts = result.split(
    /(^(?:`{3,}|~{3,}).*\n[\s\S]*?^(?:`{3,}|~{3,})\s*$)/gm
  )
  return parts.map((part, i) => {
    if (i % 2 === 1) return part  // code fence — leave untouched
    return part.replace(          // regular content — format tables
      /^(\|[^\n]+\n\|[\s:|\-]+\n(?:\|[^\n]+\n?)*)/gm,
      (match) => formatTableText(match)
    )
  }).join('')
}
```

### preserveFrontmatter Implementation
Preserves YAML frontmatter (`---...---`) by stripping it before remark parses
the document and re-adding it to the serialized output.

**The problem:** Without `remark-frontmatter` (an npm package), remark doesn't
recognize YAML frontmatter. It parses `---` as `thematicBreak` (horizontal
rule, serialized as `***`), and YAML content with `- items` as list items
(converted to `* items` by `bullet: '*'`). The entire frontmatter block gets
destroyed.

**Plugin type:** Parser + compiler wrapper. Uses `this` to wrap both
`self.parser` and `self.compiler`.

```js
function preserveFrontmatter() {
  // `this` is the current remark processor instance.
  // We keep a reference so we can wrap its parser and compiler.
  const self = this

  // Save the original parser so our wrapper can delegate to normal parsing
  // after stripping frontmatter.
  const origParser = self.parser

  // Holds the exact `--- ... ---` block for the current document so we can
  // prepend it back unchanged after compilation.
  let savedFrontmatter = null

  self.parser = function(doc, file) {
    // `doc` is the raw markdown source before remark has parsed anything.
    const str = String(doc)
    const match = str.match(/^---\n([\s\S]*?)\n---\n/)
    if (match) {
      // Save the full frontmatter block exactly as written, including fences.
      savedFrontmatter = match[0]

      // Parse only the markdown body. remark never sees the frontmatter, so it
      // cannot reinterpret `---` as a thematic break or YAML `- item` lines as
      // markdown list items.
      return origParser(str.slice(match[0].length), file)
    }

    // No frontmatter in this file, so clear any previous saved value.
    savedFrontmatter = null

    // Fall back to normal parsing of the whole document.
    return origParser(doc, file)
  }

  // Save the original compiler so our wrapper can let remark serialize the AST
  // normally, then restore the stripped frontmatter afterward.
  const origCompiler = self.compiler
  self.compiler = function(tree, file) {
    // `tree` is the parsed AST after all transforms have run.
    const result = origCompiler.call(this, tree, file)

    // Reattach the exact saved frontmatter at the very end.
    return savedFrontmatter ? savedFrontmatter + result : result
  }
}
```

How it works:

1. `Parser wrapper:` Before remark parses, checks if the document starts with
   `---\n...\n---\n`. If found, saves the entire frontmatter block and strips
   it from the input so remark only sees the markdown content.
2. `Compiler wrapper:` After remark serializes, prepends the saved frontmatter
   to the output.

Must be the **first** plugin in the plugins array so its compiler wrapper is the
outermost one (runs after all other compiler wrappers like `formatTables`).

#### Bug: wrapping `self.parse` vs `self.parser`
The processor has two levels:

* `self.parse` — prototype method on the processor. Calls `self.parser` internally.
* `self.parser` — own property on the processor instance. The actual parse function.

Same pattern for serialization: `self.stringify` (method) calls `self.compiler`
(own property).

Wrapping `self.parse` (the prototype method) works in standalone remark but
**fails in vscode-remark**. The language server likely clones or reconstructs
the processor between operations, copying own properties but not prototype
overrides.

**Fix:** Always wrap `self.parser` and `self.compiler` (own properties), never
`self.parse` or `self.stringify` (prototype methods). This is consistent with
how `formatTables` already wraps `self.compiler` successfully.

### Thematic Break Normalization (`rule` + `ruleRepetition`)
**The problem:** Remark normalizes all thematic breaks (`---`, `***`, `* * *`,
`----------`, etc.) into a single `thematicBreak` AST node with no memory of the
original characters, count, or spacing. On output, remark-stringify recreates the
break using the `rule` setting (default `'*'`) repeated `ruleRepetition` times
(default `3`). So `----------` in the source becomes `***` in the output.

**Solution 1 (tried, discarded): `preserveThematicBreaks` plugin.** A parser
wrapper that scans the input for thematic break lines (using the same regex
remark uses: `^([-*_])[ \t]*(?:\1[ \t]*){2,}$`), collects them in order, then
annotates each `thematicBreak` AST node with `node.data.original`. A custom
`thematicBreak` handler outputs `node.data.original` instead of the default.
This preserved each break's exact original text. Required frontmatter exclusion
from the scan (to avoid `---` fences being miscounted). The plugin had to be
registered after `preserveFrontmatter` so its parser wrapper wrapped around
`preserveFrontmatter`'s wrapper — it would see the full document for scanning
but get the frontmatter-free tree for annotation.

**Solution 2 (chosen): `rule: '-'` + `ruleRepetition: 10`.** Two built-in
remark-stringify settings: `rule` controls the character (`-`, `*`, or `_`) and
`ruleRepetition` controls how many times it's repeated. Setting `rule: '-'` and
`ruleRepetition: 10` makes all thematic breaks output as `----------`.

**Why Solution 2 was chosen:** The user has a keyboard shortcut that inserts
10 dashes as a horizontal rule, so normalizing everything to `----------` is the
desired behavior. This avoids the complexity of `preserveThematicBreaks` (parser
wrapper, frontmatter exclusion, custom handler, plugin ordering) for no benefit.

**Frontmatter interaction:** `rule` and `ruleRepetition` do NOT affect YAML
frontmatter fences. `preserveFrontmatter` strips the `---` fences before remark
ever parses the document, so the serializer never sees them. The frontmatter
regex matches exactly `^---\n` (3 dashes at the start of the file), so
`----------` in the body is never confused for frontmatter.

### Preserving Content with Placeholders (`preserveContent` Factory)
**The problem:** Remark's parser (micromark) destroys certain content that isn't
standard markdown. Hugo shortcodes like `{{</* xref ... */>}}` lose their leading
indentation (1-3 leading spaces are "insignificant" per the CommonMark spec and
are stripped during tokenization), and characters like `<`, `{`, `>` can be
escaped or misinterpreted. This happens in the **parser**, not the serializer —
there is no remark setting to disable it.

**The technique:** Replace matching content with safe alphanumeric placeholders
before remark parses the document, then restore the originals after
serialization. Same pattern as `preserveFrontmatter`.

**`preserveContent(pattern, label)` factory:** A generic version of this
technique. Takes two parameters:

* `pattern` — RegExp with the global flag (`g`) matching content to preserve.
  Must use `[\s\S]*?` (not `.`) for multi-line matching.
* `label` — Alphanumeric string for unique placeholder names. Placeholders look
  like `REMARK<label><index>END` (e.g., `REMARKSHORTCODE0END`).
  Must be unique across all `preserveContent` instances to avoid collisions.

Placeholders are intentionally alphanumeric-only. Using underscores
(`REMARK_SHORTCODE_0`) would cause remark's default text handler to escape them
as `REMARK\_SHORTCODE\_0`. Our custom `textHandler` disables escaping, but
alphanumeric placeholders make the plugin robust regardless of handler config.

```js
// Factory: preserveContent(pattern, label) returns a plugin function.
function preserveContent(pattern, label) {
  return function() {
    // Wrap parser and compiler so protected content survives both phases.
    const self = this
    const origParser = self.parser
    const saved = []

    self.parser = function(doc, file) {
      const str = String(doc)

      // Replace each matched block with a safe placeholder and remember it.
      const cleaned = str.replace(pattern, (match) => {
        const idx = saved.length
        saved.push(match)
        return `REMARK${label}${idx}END`
      })

      // Parse the placeholder version so remark does not touch the original.
      return origParser(cleaned, file)
    }

    const origCompiler = self.compiler
    self.compiler = function(tree, file) {
      // Compile the placeholder version first.
      let result = origCompiler.call(this, tree, file)

      // Restore the original content byte-for-byte.
      for (let i = 0; i < saved.length; i++) {
        result = result.replace(`REMARK${label}${i}END`, saved[i])
      }
      return result
    }
  }
}
```

Usage in the plugins array:

```js
plugins: [
  // Frontmatter must run first so later plugins see the body only.
  preserveFrontmatter,
  // Hugo shortcodes: {{</* ... */>}} and {{-/* ... */-}}
  preserveContent(/\{\{<[\s\S]*?>}}|\{\{-[\s\S]*?-}}/g, 'SHORTCODE'),
  // Could add more patterns with different labels:
  // preserveContent(/<!-- raw -->[\s\S]*?<!-- \/raw -->/g, 'RAWBLOCK'),
]
```

All leading spaces, line breaks, and special characters inside the shortcode are
preserved exactly as written.

**Why not configure the parser?** The space stripping happens in micromark (the
tokenizer underneath remark-parse). It implements the CommonMark spec where 1-3
leading spaces in paragraphs are insignificant. There is no
`preserveWhitespace` option. 4+ spaces trigger indented code block syntax.
Writing a micromark extension to change this would be significantly more complex
and would be fighting the markdown spec.

**Plugin ordering:** `preserveContent` instances should be registered after
`preserveFrontmatter` so frontmatter is already stripped. Multiple
`preserveContent` instances can be used safely — each has its own `saved` array
and unique placeholder namespace from the `label` parameter.

#### Why `preserveFrontmatter` is not built on `preserveContent`
`preserveFrontmatter` stays as a separate plugin because it has three behaviors
that don't fit the factory:

1. `Position-specific match.` Frontmatter must match only at `^` (start of
   file) and only once. `preserveContent` is designed for global regex (`g`
   flag) matching anywhere in the document.
2. `Extra blank line.` `preserveFrontmatter` adds an extra `\n` between the
   closing `---` and the first content line. `preserveContent` does straight
   replacement with no whitespace adjustment.
3. `Removal vs. replacement.` `preserveFrontmatter` removes the frontmatter
   entirely so remark never sees it. `preserveContent` replaces with a
   placeholder that remark parses as text inside a paragraph node. Both
   approaches work, but frontmatter is a file header at byte 0, not content at
   an arbitrary position.

Adding options like `{ global: false, prefix: '\n' }` to the factory would
handle these cases but would add frontmatter-specific logic to a generic
function for a single use case.

### Disabling Escaping with Custom Handlers
Remark-stringify calls `state.safe()` on text content, link URLs, and definition
URLs, which escapes ~20 ASCII punctuation characters (`[`, `(`, `<`, `_`, `&`,
`!`, `#`, etc.) to prevent them from being reinterpreted as markdown syntax.

This breaks:

* Placeholder brackets: `[author(s)]` becomes `\[author(s)]`
* Underscores in text: `some_variable_name` becomes `some\_variable\_name`
* Ampersands: `this & that` becomes `this \& that`
* Parens in URLs: `https://en.wikipedia.org/wiki/Freehold_(novel)` becomes
  `Freehold_\(novel\)` in both inline links and reference definitions

#### Why there's no config option to disable escaping
The `unsafe` option in `mdast-util-to-markdown` only **appends** to the
defaults. The `configure()` function in
`mdast-util-to-markdown/lib/configure.js` always pushes:

```js
// from mdast-util-to-markdown/lib/configure.js
case 'unsafe': {
  // User-provided `unsafe` entries are appended to the built-in defaults.
  list(base[key], extension[key])  // always appends, never replaces
  break
}

function list(left, right) {
  if (right) {
    // This push is why there is no replace/remove behavior.
    left.push(...right)  // pushes onto existing defaults
  }
}
```

The defaults are spread into `state.unsafe` in `index.js`, then user config is
pushed on top. There is no way to remove or replace the defaults.

#### The fix: custom handlers
Instead of stripping escapes after serialization (the old `removeEscapes`
compiler wrapper approach), override the handlers that call `state.safe()` to
skip it entirely. Three handlers cover all escaping:

* `text` — plain text content. Default calls `state.safe()`. Override returns
  `node.value` directly.
* `link` — inline link URLs `[text](url)`. Default calls `state.safe()` on
  `node.url`. Override outputs `node.url` directly.
* `definition` — reference definitions `[label]: url`. Default calls
  `state.safe()` on `node.url`. Override outputs `node.url` directly.

This is safe because remark already parsed real markdown syntax (links,
emphasis, etc.) into their own AST nodes. Text nodes and URL properties contain
only literal values — no markdown syntax that needs protecting.

```js
// Return text content directly without escaping.
function textHandler(node) {
  // Text is already parsed, so emit its literal value.
  return node.value
}

// Serialize inline links without escaping the URL.
function linkHandler(node, _, state, info) {
  // Enter normal link serialization state so surrounding syntax stays correct.
  const exit = state.enter('link')
  const subexit = state.enter('label')
  const tracker = state.createTracker(info)

  // Build the `[label](` prefix and serialize the label content normally.
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

  // Insert the raw URL directly instead of calling `state.safe()`.
  value += tracker.move(node.url || '')
  if (node.title) {
    value += tracker.move(' "' + node.title + '"')
  }

  // Close the link and exit the serializer state.
  value += tracker.move(')')
  exit()
  return value
}

// Serialize reference definitions without escaping the URL.
function definitionHandler(node, _, state) {
  // Use the normal definition state so association IDs stay consistent.
  const exit = state.enter('definition')
  const subexit = state.enter('label')
  const id = state.associationId(node)
  subexit()

  // Emit the raw URL directly.
  let value = '[' + id + ']: ' + (node.url || '')
  if (node.title) {
    value += ' "' + node.title + '"'
  }
  exit()
  return value
}
```

Registered in settings:

```js
settings: {
  handlers: {
    // Override only the handlers that escape content we want to preserve.
    text: textHandler,
    link: linkHandler,
    definition: definitionHandler
  }
}
```

#### Evolution: removeEscapes -> custom handlers
The first approach was a `removeEscapes` compiler wrapper that stripped `\`
before specific characters (`[`, `(`, `<`, `_`) from the serialized output using
a regex. This had two problems:

1. Playing whack-a-mole: every new escaped character (`&`, `!`, etc.) needed
   adding to the regex.
2. Stripping ALL ASCII punctuation escapes was unsafe — some escapes (like `\#`
   at a line start) are semantically meaningful.

The handler approach is cleaner: it disables escaping at the source rather than
fixing it after the fact, and it's selective — only `text`, `link`, and
`definition` handlers are overridden. Other handlers (headings, emphasis, code,
etc.) keep their default behavior.

#### Bug: cascading depth escalation
The first version updated `lastDepth` after each conversion:

```js
// BUG: this caused cascading depth
tree.children[i] = { type: 'heading', depth, children: [...] }
lastDepth = depth  // <-- THIS LINE WAS THE BUG
```

This meant consecutive bold paragraphs under the same real heading would
escalate in depth:

```markdown
### Section          <!-- lastDepth = 3 -->

**First bold**       <!-- became ####, then lastDepth = 4 -->
**Second bold**      <!-- became #####, then lastDepth = 5 -->
**Third bold**       <!-- became ######, then lastDepth = 6 -->
```

The fix: only update `lastDepth` from headings that already existed in the
document, not from converted ones. Remove the `lastDepth = depth` line after
conversion. Now all sibling bolds under the same real heading get the same
depth:

```markdown
### Section          <!-- lastDepth = 3 -->

**First bold**       <!-- becomes #### -->
**Second bold**      <!-- becomes #### -->
**Third bold**       <!-- becomes #### -->
```

## Plugin Loading Failures (What Doesn't Work)

* `.remarkrc.json` with `"plugins": ["./path/to/plugin.js"]` - fails with
  "Cannot parse file" because the bundled `load-plugin` uses ESM `import()` and
  without `package.json`, `.js` files are treated as CJS.
* Separate `.mjs` plugin files referenced from config - loads without error but
  plugin doesn't apply (silent failure).
* Using `require()` in `.remarkrc.mjs` - not available in ESM context.

### Solution: define all plugin functions inline in `.remarkrc.mjs`

## Current Config

```js
// Preserves YAML frontmatter by stripping it before parse and re-adding after
// compile. Must be FIRST in plugins array.
function preserveFrontmatter() {
  const self = this
  const origParser = self.parser
  let savedFrontmatter = null

  self.parser = function(doc, file) {
    const str = String(doc)
    const match = str.match(/^---\n([\s\S]*?)\n---\n/)
    if (match) {
      savedFrontmatter = match[0]
      // Strip frontmatter before parsing the body.
      return origParser(str.slice(match[0].length), file)
    }
    savedFrontmatter = null
    return origParser(doc, file)
  }

  const origCompiler = self.compiler
  self.compiler = function(tree, file) {
    const result = origCompiler.call(this, tree, file)
    // Reattach saved frontmatter after compilation.
    return savedFrontmatter ? savedFrontmatter + result : result
  }
}

// Factory: preserves content matching a regex by replacing with placeholders
// before parsing and restoring after serialization.
// pattern: RegExp with global flag, label: unique alphanumeric string.
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

// Factory that returns a remark plugin to replace text patterns in the final
// serialized markdown.
// `mappings` is an object of { 'from': 'to' } pairs.
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

function headingJoin(left, right) {
  if (left.type === 'heading') {
    if (right.type === 'paragraph' && !looksLikeTable(right)) return 0
    return 1
  }
}

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

function formatTables() {
  const self = this
  const orig = self.compiler
  self.compiler = function(tree, file) {
    const result = orig.call(this, tree, file)
    return result.replace(
      /^(\|[^\n]+\n\|[\s:|\-]+\n(?:\|[^\n]+\n?)*)/gm,
      (match) => formatTableText(match)
    )
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
  return s.split('|').map(c => c.trim())
}

function buildDelimCell(cell, width) {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  const innerWidth = width - (left ? 1 : 0) - (right ? 1 : 0)
  return (left ? ':' : '') + '-'.repeat(innerWidth) + (right ? ':' : '')
}

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
```

## Debugging Tips

* Test remark behavior standalone with a local install in `/tmp`:
  ```bash
  mkdir /tmp/remark-test && cd /tmp/remark-test
  echo '{"type":"module"}' > package.json
  npm install unified remark-parse remark-stringify
  ```
* Then run test scripts with `node test.mjs` to verify settings/plugins work
  before putting them in the vscode config.
* The extension source is at
  `~/.vscode-server/extensions/unifiedjs.vscode-remark-3.2.0/out/remark-language-server.js`
  (minified, but searchable).
* After every change to `.remarkrc.mjs`, reload the VS Code window, then save
  the test file to verify.

## Implementation Workflow

1. Write the plugin function inline in `.remarkrc.mjs`.
2. Add it to `plugins: []` array (for tree transformers) or `settings.join`
   (for blank line control).
3. Reload VS Code window (Ctrl+Shift+P -> "Developer: Reload Window").
4. Open and save `test-markdown/formatting-issues.md`.
5. Verify the formatting change was applied.
6. If not working, test standalone in `/tmp/remark-test/` with `node test.mjs`
   to isolate whether the issue is the plugin logic or the vscode-remark
   integration.

## Lessons Learned

1. `Reload the window after every config change.` The language server caches
   `.remarkrc.mjs` via Node's ES module cache. No reload = old config. See
   [Window Reload Required](#window-reload-required).
2. `All plugins must be inline in .remarkrc.mjs.` Separate plugin files
   fail silently or throw errors because the bundled `load-plugin` can't resolve
   local paths without `package.json`. See
   [Plugin Loading Failures](#plugin-loading-failures-what-doesnt-work).
3. `Use .remarkrc.mjs, not .remarkrc.json.` JSON configs can't contain
   functions (needed for `join` and plugins). ESM config loaded via `import()`
   preserves functions. See [Config File Structure](#config-file-structure).
4. `join is the only way to control blank lines between blocks.` There's no
   boolean setting. remark-stringify adds `\n\n` between all blocks by default.
   The `tightDefinitions` setting only covers definition lists. See
   [Join Functions](#join-functions-blank-line-control).
5. `Whitelist removal, not blacklist.` When writing join functions, check for
   the specific type you want to change (e.g., `paragraph`) and return the
   default for everything else. This prevents new block types (tables,
   blockquotes, HTML) from needing updates. See
   [headingJoin Implementation](#headingjoin-implementation).
6. `Plugins must return a transformer function.` A plugin that only sets up
   data on the processor (e.g., `this.data()`) returns nothing. A plugin that
   modifies the tree must `return (tree) => { ... }`. See
   [Tree Transformer Plugins](#tree-transformer-plugins).
7. `listItemIndent takes the string 'one', not the number 1.` Easy
   mistake that silently produces wrong output. See
   [Settings](#settings-remark-stringify-options).
8. `Don't update tracking state from converted nodes.` The `boldToHeading`
   plugin initially updated `lastDepth` after each conversion, causing
   consecutive bolds to cascade (`####` -> `#####` -> `######`). Fix: only
   update depth from pre-existing headings. See
   [Bug: cascading depth escalation](#bug-cascading-depth-escalation).
9. `AST node replacement is in-place.` Assign directly to
   `parent.children[i]` to replace a node. No need to splice or rebuild arrays.
   See [boldToCodeInLists](#boldtocodeinlists-implementation) and
   [boldToHeading](#boldtoheading-implementation).
10. `Test standalone before testing in vscode-remark.` The extension's
    language server adds layers of complexity (config loading, module caching,
    processor cloning). Isolate plugin logic in `/tmp/remark-test/` first. See
    [Debugging Tips](#debugging-tips).
11. `remark already handles some rules by default.` Blank lines between text
    and lists, fenced code blocks, and ATX headings are all default behavior.
    Check before writing a plugin. See
    [Rule-to-Setting Mapping](#rule-to-setting-mapping).
12. `listItem is shared by ordered and unordered lists.` The list type is on
    the parent `list` node, not on items. Plugins targeting `listItem` work for
    both list types automatically. See
    [boldToCodeInLists](#boldtocodeinlists-implementation).
13. `Only match bold that is the sole paragraph content.` Both
    `boldToCodeInLists` (first child of list paragraph) and `boldToHeading`
    (only child of root paragraph) avoid converting legitimate emphasis that
    appears alongside other text.
14. `Without remark-gfm, tables are paragraph nodes.` They are NOT parsed
    into `table`/`tableRow`/`tableCell` AST nodes. This affects table formatting
    (can't use a tree transformer) and join functions (tables look like
    paragraphs). Fix: inspect the paragraph content for a delimiter row to
    detect tables. See [formatTables](#formattables-implementation) and
    [headingJoin and tables](#headingjoin-and-tables).
15. `Compiler wrappers are a different plugin pattern.` Instead of returning
    `(tree) => {...}`, the plugin uses `this` to access the processor and wraps
    `self.compiler`. This allows post-processing the serialized markdown string,
    avoiding AST escaping issues. See
    [formatTables](#formattables-implementation).
16. `remark-stringify escapes markdown syntax in text nodes.` If you replace
    mixed AST children (text + inlineCode) with a single `text` node containing
    backticks, remark will escape them to ```. Operate on the serialized string
    instead when the content contains markdown syntax.
17. `Without remark-frontmatter, frontmatter is destroyed.` Remark parses
    `---` as `thematicBreak` (`***`) and YAML list items as markdown lists.
    Fix: strip frontmatter before parsing, re-add after serialization. See
    [preserveFrontmatter](#preservefrontmatter-implementation).
18. `Wrap self.parser/self.compiler, not self.parse/self.stringify.`
    The processor has own properties (`parser`, `compiler`) and prototype
    methods (`parse`, `stringify`). Wrapping the prototype methods works in
    standalone remark but fails in vscode-remark — the language server copies
    own properties but not prototype overrides. Always wrap the own properties.
    See [Bug: wrapping self.parse vs self.parser](#bug-wrapping-selfparse-vs-selfparser).
19. `remark-stringify escapes ~20 ASCII punctuation characters in text and URLs.` The `unsafe` patterns in `mdast-util-to-markdown` are hardcoded
    defaults. The `unsafe` config option only appends — `configure()` always
    pushes, never replaces. Fix: override the `text`, `link`, and `definition`
    handlers in `settings.handlers` to skip `state.safe()`. This is cleaner
    than the earlier `removeEscapes` compiler wrapper approach. See
    [Disabling Escaping with Custom Handlers](#disabling-escaping-with-custom-handlers).
20. `tightDefinitions: true removes blank lines between reference link
    definitions.` Built-in `remark-stringify` setting. Equivalent to a join
    function returning `0` for two adjacent `definition` nodes.
21. `Custom handlers in settings override how specific AST nodes are
    serialized.` Each key is a node type (`text`, `link`, `definition`, etc.),
    each value is a function `(node, parent, state, info) -> string`. The
    default handlers call `state.safe()` for escaping; custom handlers can skip
    it. Handlers are passed via `settings.handlers` in `.remarkrc.mjs`.
22. `Bold with inline code inside has multiple AST children.` `**Use
    `.remarkrc.mjs`**` is parsed as `strong -> [text("Use "),
    inlineCode(".remarkrc.mjs")]`, not a single text child. To convert it to
    inline code, check that all children are `text` or `inlineCode`, then
    concatenate all `.value` properties into one string. Both node types have
    `.value`. See
    [Bug: bold with inline code was not converted](#bug-bold-with-inline-code-was-not-converted).
23. `Remark normalizes thematic breaks — use rule + ruleRepetition to control
    output.` All thematic breaks (`---`, `***`, `* * *`, `----------`) become a
    single `thematicBreak` AST node with no memory of the original. `rule: '-'`
    sets the character, `ruleRepetition: 10` sets the count. A
    `preserveThematicBreaks` parser wrapper was built and tested (annotates AST
    nodes with originals via `node.data.original`) but discarded in favor of the
    simpler settings approach since normalizing to `----------` was the desired
    behavior. The `rule` setting does NOT affect frontmatter — `preserveFrontmatter`
    strips it before remark parses. See
    [Thematic Break Normalization](#thematic-break-normalization-rule--rulerepetition).
24. `Use the preserveContent placeholder pattern to protect content remark
    destroys.` Remark's parser strips 1-3 leading spaces (CommonMark spec) and
    mangles non-markdown syntax like Hugo shortcodes. No parser setting to
    disable this. Fix: replace matching content with alphanumeric placeholders
    before parsing, restore after serialization. The `preserveContent(pattern,
    label)` factory generalizes this — pass any regex and a unique label.
    Placeholders must be alphanumeric only to avoid remark escaping underscores.
    See [Preserving Content with Placeholders](#preserving-content-with-placeholders-preservecontent-factory).

## Bulk Processing with remark-cli
The `.remarkrc.mjs` config is self-contained (all plugins inline, no external
npm dependencies) but it's just instructions — it doesn't include the markdown
parser, serializer, or file I/O engine. `remark-cli` bundles all of that
(`unified` + `remark-parse` + `remark-stringify` + `unified-engine` for file
handling and config loading). It's the same runtime vscode-remark uses
internally, so behavior is identical.

### Install

```bash
# Local install (more reliable)
mkdir ~/remark-tool && cd ~/remark-tool
echo '{"type":"module"}' > package.json
npm install remark-cli

# Or global
npm install -g remark-cli
```

### Usage

```bash
# Format files in-place
remark --output *.md

# Format all markdown files recursively
remark --output .

# Specific files
remark --output file1.md file2.md docs/

# Dry run (print to stdout, don't modify)
remark file.md

# Point to a specific config file
remark --rc-path /path/to/.remarkrc.mjs --output .
```

`remark-cli` uses the same `findUp` config loading as vscode-remark. Without
`--rc-path`, it walks up the directory tree from each file looking for
`.remarkrc.mjs`. With `--rc-path`, it uses the specified config for all files.

This is useful for bulk-formatting an entire repo or running formatting in CI.

## Alternative: Using Installed Plugins (remark-gfm, remark-frontmatter)

### What Changes
Installing `remark-gfm` and `remark-frontmatter` removes the need for our
custom `formatTables`, `formatTableText`, `parseCells`, `buildDelimCell`,
`looksLikeTable`, and `preserveFrontmatter` functions (~125 lines). The table
detection hack in `headingJoin` also goes away since tables become proper AST
nodes.

What stays regardless: `replaceText`, `boldToCodeInLists`, `boldToHeading`,
`preserveContent` (shortcodes), custom escape handlers (`textHandler`,
`linkHandler`, `definitionHandler`), and `headingJoin` (simplified).

### Cost Per Repository

| File                | Size               | Git tracked?      |
| ------------------- | ------------------ | ----------------- |
| `package.json`      | ~15 lines          | Yes               |
| `package-lock.json` | ~1,179 lines       | Yes               |
| `node_modules/`     | ~6 MB, 70 packages | No (`.gitignore`) |

Anyone cloning the repo must run `npm install` to restore `node_modules/`.

### Setup Commands

```bash
# In the repository root (where .remarkrc.mjs lives)

npm init -y
npm install remark-cli remark-gfm remark-frontmatter

# Add node_modules/ to .gitignore

echo 'node_modules/' >> .gitignore
```

`remark-cli` is not required by the VS Code extension, but it is useful for
manual verification and bulk formatting.

### Plugin Resolution (How It Works)
The vscode-remark language server uses `unified-engine` which uses `load-plugin`
to resolve plugin strings. `load-plugin` uses Node.js module resolution
(`import-meta-resolve`) starting from the workspace folder, walking up the
directory tree through `node_modules/` directories. This is why `package.json`
and `node_modules/` must be at or above the `.remarkrc.mjs` location.

### Global Install Does Not Work Reliably
The `load-plugin` package has a `global` option, but it auto-detects global mode
by checking `process.versions.electron` or whether `argv` starts with the npm
global prefix. In VS Code (especially Remote/WSL), the language server runs as a
Node.js child process where neither condition is true, so global `node_modules/`
is never searched. The `.npmrc` `prefix` approach (documented in some guides)
relies on this same detection and is equally unreliable.

### Shared Parent node_modules (Alternative)
Installing in a common parent directory (e.g., `/home/parsia/dev/`) would let
all repos beneath it find the plugins via Node.js upward resolution. But this
puts `package.json` and `node_modules/` in `/dev`, which is undesirable.

### Config File With Installed Plugins
See `remarkrc-with-plugins.mjs` in this repo for a ready-to-use config that
imports `remark-gfm` and `remark-frontmatter`. To use it, rename it to
`.remarkrc.mjs` after installing the packages.

### Verified Working Setup
This approach has now been tested successfully in this workspace with:

* `.remarkrc.mjs` importing `remark-gfm` and `remark-frontmatter`.
* Local dependencies installed in `package.json`.
* `remark-cli` installed for local verification.
* Test files under `tmp/remark-fixtures/`.

Direct processor test succeeded: loading `remarkrc.mjs` in Node produced the
expected formatting for frontmatter, tables, list-item bold-to-code,
bold-to-heading, and arrow replacement.

CLI validation also succeeded:

```bash
npx remark tmp/remark-fixtures/*.md --frail
```

That means the installed-plugin config is not just theoretical here; it works
with the current repo layout.

### Decision
Current guidance:

* Use the installed-plugin setup when you want the simpler, more maintainable
  `.remarkrc.mjs` and are willing to keep a small Node setup in the repo.
* Use the inline-only setup when avoiding `package.json` and `node_modules/`
  matters more than config simplicity.

## Future Work: Line Wrapping (Rewrap)

### Goal
Automatically wrap long lines to 80 columns on save, similar to the
[Rewrap extension](https://github.com/stkb/Rewrap) (Alt+Q). Rewrap handles
paragraphs, list items (with proper indentation), blockquotes, etc.

### remark-stringify Has No Wrapping Support
The `mdast-util-to-markdown` types contain a comment: *"This info isn't used yet
but such functionality will allow line wrapping."* There is no `width`, `column`,
or `wrap` option. Wrapping is not implemented.

### How Rewrap Works (Reference)
Rewrap's core is written in F# (`/core/Wrapping.fs`, `Parsing.Markdown.fs`).
Key design:

* `Block detection` — Parses markdown into block types: paragraphs, list
  items, blockquotes, headings, code blocks, tables, HTML. Each type has
  different wrapping rules.
* `Tables, headings, code blocks` — `NoWrap` (never wrapped).
* `Paragraphs` — All lines concatenated into one string, then broken at word
  boundaries to fit within the configured column width.
* `List items` — Parsed with their prefix (`* `, `1. `, etc.). Continuation
  lines get indentation matching the prefix width (e.g., 2 spaces for `* `, 3
  for `1. `). Content is recursively parsed (a list item can contain
  paragraphs, sub-lists, code blocks, etc.).
* `Block quotes` — `> ` prefix stripped, content recursively parsed and
  wrapped, then `> ` re-added.
* `Break position search` — Searches backwards from the column limit to find a
  valid break position. Handles CJK characters (can break between any two CJK
  chars without spaces).
* `Line concatenation` — When joining lines before re-breaking, adds a space
  between words but not between CJK characters. Optional double-space after
  sentence-ending punctuation (`.`, `?`, `!`).

### Implementation Approach for Remark
Use the same compiler-wrapper pattern as `formatTables` — post-process the
serialized markdown string after remark-stringify produces it.

```js
function wrapLines() {
  // Wrap the compiler so line reflow happens on the final markdown string.
  const self = this
  const orig = self.compiler
  self.compiler = function(tree, file) {
    // Let remark serialize the AST first.
    const result = orig.call(this, tree, file)

    // Then rewrap the serialized markdown to the chosen column width.
    return wrapMarkdown(result, 80)
  }
}
```

### Block Types and Wrapping Rules

| Block Type  | Wrap? | Prefix Handling                                 |
| ----------- | ----- | ----------------------------------------------- |
| Paragraph   | Yes   | No prefix, just wrap at column width            |
| List item   | Yes   | First line: `* ` / `1. `, continuation: spaces  |
| Block quote | Yes   | Strip `> `, wrap, re-add `> `                   |
| Heading     | No    | ATX headings stay on one line                   |
| Code block  | No    | Fenced and indented code blocks left as-is      |
| Table       | No    | Tables left as-is (pipes must stay on one line) |
| HTML block  | No    | HTML left as-is                                 |
| Blank line  | No    | Preserved as paragraph separators               |

### Edge Cases to Handle

* `Don't break URLs` — A URL in a paragraph shouldn't be split across lines.
* `Don't break inline code` — Backtick spans should stay on one line if possible.
* `List continuation indent` — Must match the list marker width: 2 for `* `,
  3 for `1. `, 4 for `10. `, etc.
* `Nested lists` — Each nesting level adds its own indent.
* `Nested block quotes` — `> > ` for double-nested, etc.
* `Lines ending in \ or <br>` — Hard line breaks, don't join with next line.
* `Already short lines` — Don't re-wrap lines that are already under the
  limit unless they're part of a paragraph that could be reflowed.

### Detecting the Column Width
The extension has no access to VS Code settings from `.remarkrc.mjs`. Options:

1. `Hardcode in .remarkrc.mjs` — e.g., `wrapMarkdown(result, 80)`. Simple,
   must be changed manually if the ruler changes.
2. `Read from an environment variable` — e.g., `process.env.REMARK_COLUMNS`
   with a fallback to 80.
3. `Read editor.rulers from settings.json` — Technically possible via
   `fs.readFileSync` but fragile and platform-dependent.

Option 1 (hardcoded) is the most practical.

### Decision: Not Implemented
We decided not to build this. The [Rewrap extension](https://github.com/stkb/Rewrap)
(Alt+Q) already handles line wrapping well and covers all the edge cases listed
above. Implementing it in remark would duplicate that work.

The Rewrap extension reads the column width from (in priority order):
`rewrap.wrappingColumn`, `editor.rulers`, `editor.wordWrapColumn`. Our
`.remarkrc.mjs` runs inside the language server's Node.js process and cannot
access VS Code settings APIs.
