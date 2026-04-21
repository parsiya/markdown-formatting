---
draft: false
toc: false
comments: false
categories:
- ai-docs
title: "markdownlint Configuration Notes"
wip: false
snippet: "Automatically format markdown with markdownlint in VS Code"
---

# Central markdownlint rules in WSL
This document explains how to keep one shared set of `markdownlint` rules on your machine and use them from VS Code running in WSL.

It covers:

* central installation in one folder on your machine
* the VS Code settings you need
* the built-in `markdownlint` rules we still use
* the custom rules we wrote
* how each custom rule maps back to the original markdown instruction
* commented code snippets so someone unfamiliar with `markdownlint` can follow the logic

## Quickstart
If you just want to get set up quickly, do this first:

1. Create the central directory for your rules:
   ```bash
   mkdir -p ~/.markdownlint/rules
   ```
2. Copy the [custom rule file][rule] to `~/.markdownlint/rules/markdown-format-rules.cjs`
  1. You can change the name of the file.
  2.
3. Create `~/.markdownlint/.markdownlint.jsonc` with this content:
    ```json
    {
      // Enable all rules
      "default": true,

      // - MD004: use * for bullet lists
      "MD004": { "style": "asterisk" },
      // - MD030: require one space after list markers
      "MD030": {
        "ul_single": 1,
        "ul_multi": 1,
        "ol_single": 1,
        "ol_multi": 1
      },
      // - MD055: keep leading and trailing | in tables
      "MD055": { "style": "leading_and_trailing" },  
      "MD031": {
          "list_items": false
      },
      "MD032": false,
      "MD029": false, // ol-prefix. cause 3 spaces to indent ordered lists
      "MD022": false,
      "MD033": false, // no-inline-html
      "MD040": false, // fenced-code-language
      "MD025": false, // single-title
      "MD038": false, // no-space-in-code
      "MD034": false, // no-bare-urls
      "MD013": false, // line-length
      "MD031": false, // blanks-around-fences
      "MD005": false, // list-indent

      // Our custom rules.
      "markdown-format-block-spacing": true,
      "markdown-format-ascii-arrows": true,
      "markdown-format-bold-list-code": true,
      "markdown-format-bold-heading": true,
      "markdown-format-tight-definitions": true,
      "markdown-format-thematic-break": true,
      "markdown-format-table-align": true
    }
    ```
4. Open VS Code user settings and add this:
    ```json
    {
      // Disable formatter-based saves for Markdown.
      "[markdown]": {
        "editor.formatOnSave": false
      },
      // Run markdownlint fixers when saving.
      "editor.codeActionsOnSave": {
        "source.fixAll.markdownlint": "explicit"
      },
      // Point VS Code at the central shared config in WSL.
      "markdownlint.config": {
        "extends": "~/.markdownlint/.markdownlint.jsonc"
      },
      // Load the shared custom rule implementation.
      "markdownlint.customRules": [
        "~/.markdownlint/rules/markdown-format-rules.cjs"
      ]
    }
    ```
5. Reload VS Code. `ctrl+shift+p > Developer: Reload Window`
6. Open a bad test file and save it.

[rule]: markdown-formatting-repo/markdownlint/rules/markdown-format-rules.cjs

Details below.

## What goes where
We have two different files.

### `.markdownlint.jsonc`
This file is for rule configuration and set in `markdownlint.config` in VS Code settings.

Use it for:

* built-in rule settings like `MD004`, `MD030`, `MD055`
* enabling or disabling custom rules by name once those rules have already been loaded

### `markdown-format-rules.cjs`
Set it in `markdownlint.customRules` in VS Code settings to tell the VS Code
extension where the custom JavaScript rule file lives.

Use it for:

* loading custom rules

### Final setup layout
Choose one permanent folder in WSL. Example:

```text
~/.markdownlint/
  .markdownlint.jsonc
  rules/
    markdown-format-rules.cjs
```

That folder can be a git repository.

## Per-repo overrides
Do not use a repo-local `.markdownlint.jsonc` if you want a small override on
top of the central VS Code setup.

In practice, a repo-local `.markdownlint.jsonc` becomes the active config for
that repo and does not behave like a small complementary patch unless you can
use `extends`.

If you cannot use `extends`, the practical per-repo override is a repo-local
`.vscode/settings.json`.

Example:

```json
{
  "markdownlint.config": {
    "markdown-format-ascii-arrows": false,
    "markdown-format-bold-heading": false
  }
}
```

This keeps the central setup in place and overrides only the rules you mention
for that repository.

Important:

* repo-local `.markdownlint.jsonc` is not a good small override mechanism here
* repo-local `.vscode/settings.json` is the working per-repo override pattern
* the custom rule file still needs to be loaded centrally through `markdownlint.customRules`

## Optional: CLI testing
If you just want to format in VS Code, ignore this section.

### 1. Create a central `.markdownlint-cli2.cjs`
Path:

```text
~/.markdownlint/.markdownlint-cli2.cjs
```

Contents:

```js
module.exports = {
  customRules: [
    "./rules/markdown-format-rules.cjs"
  ],
  config: {
    default: false,
    MD004: { style: "asterisk" },
    MD030: {
      ul_single: 1,
      ul_multi: 1,
      ol_single: 1,
      ol_multi: 1
    },
    MD055: { style: "leading_and_trailing" },
    MD056: true,
    MD058: true,

    "markdown-format-block-spacing": true,
    "markdown-format-ascii-arrows": true,
    "markdown-format-bold-list-code": true,
    "markdown-format-bold-heading": true,
    "markdown-format-tight-definitions": true,
    "markdown-format-thematic-break": true,
    "markdown-format-table-align": true
  }
}
```

### 2. Install `markdownlint-cli2` in the central folder
Run this in WSL:

```bash
cd ~/.markdownlint
npm install --save-dev markdownlint-cli2
```

### 3. Run lint or fix from the central folder
Examples:

```bash
cd ~/.markdownlint
npx markdownlint-cli2 "/home/parsia/dev/mycopilot/**/*.md"
npx markdownlint-cli2 --fix "/home/parsia/dev/mycopilot/**/*.md"
```

That uses the central `.markdownlint-cli2.cjs` plus the central custom rule file.

## Temporarily disable rules in Markdown
`markdownlint` supports directive comments inside Markdown files.

Use these when you want to keep one line or one block exactly as written.

### Disable one rule
For the custom ASCII arrow rule, disable the next line like this:

```md
<!-- markdownlint-disable-next-line markdown-format-ascii-arrows -->
keep → this line → exactly as-is
```

Disable the same line like this:

```md
keep → this line <!-- markdownlint-disable-line markdown-format-ascii-arrows -->
```

Disable a block like this:

```md
<!-- markdownlint-disable markdown-format-ascii-arrows -->
line with →
another line with ←
<!-- markdownlint-enable markdown-format-ascii-arrows -->
```

### Disable all rules
Disable all `markdownlint` rules for the next line:

```md
<!-- markdownlint-disable-next-line -->
this whole line is ignored by markdownlint
```

Disable all rules for the current line:

```md
this line is ignored <!-- markdownlint-disable-line -->
```

Disable all rules for a block. Remove the spaces in the tags below to use. I've
added those spaces so the linter doesn't lint the rest of the document.

```md
<!-- markdownlint - disable --> // remove the space
text here
more text here
<!-- markdownlint - enable --> // same as above, remove the spaces
```

For one-off exceptions, `markdownlint-disable-next-line` is usually the least
noisy option.

## Custom Rules

### How to understand one custom rule quickly
The rules now use one of two patterns.

For text-rewrite rules:

1. Build or reuse a small rule factory for the kind of rewrite we want
2. Decide which lines are safe to inspect
3. Scan the document line by line
4. Look for one specific formatting pattern
5. If the line is already correct, do nothing
6. If the line is wrong, call `onError(...)`
7. Attach a `fixInfo` object if the rule can rewrite the content automatically

For structure-sensitive rules:

1. Ask `markdown-it` for parsed block tokens
2. Find the exact block type we care about, like heading, paragraph, list item, table, or thematic break
3. Use the token line ranges to locate the original source line
4. Rewrite only that source line when needed

That means each rule is still basically a detector and optionally a fixer, but some detectors now use parsed block structure instead of raw line guessing.

### Parser choice
We no longer use one parser mode for every custom rule.

We now split the rules like this:

* `parser: 'markdownit'` for all current custom rules:
  * `markdown-format-block-spacing`
  * `markdown-format-ascii-arrows`
  * `markdown-format-bold-list-code`
  * `markdown-format-bold-heading`
  * `markdown-format-tight-definitions`
  * `markdown-format-thematic-break`
  * `markdown-format-table-align`

Why this is better:

* parser-based rules can tell whether something is actually a heading, paragraph, list item, table, or thematic break
* that removes a lot of regex guessing and reduces false positives in nested Markdown structures
* the rules can still do direct line rewrites even when they run through the same parser path

### `params.parsers.markdownit.tokens`
Parser-based rules read tokenized block structure from `markdown-it`:

```js
function: (params, onError) => {
  const tokens = params.parsers.markdownit.tokens
}
```

These tokens tell us what the document actually parsed as, which is why the structure-sensitive rules are now more reliable.

### `params.lines`
Every rule still reads the current document as an array of lines:

```js
function: (params, onError) => {
  const lines = params.lines
}
```

This is still the raw source we rewrite. Even parser-based rules use token line ranges to map back to `params.lines` before producing a fix.

### `onError(...)`
A rule reports a finding by calling `onError`.

Example:

```js
onError({
  lineNumber: index + 1,
  detail: 'Use ASCII arrows.',
  context: line,
  fixInfo: {
    lineNumber: index + 1,
    editColumn: 1,
    deleteCount: line.length,
    insertText: fixedLine
  }
})
```

This does two jobs:

* shows a diagnostic in the editor
* tells markdownlint how to fix the line automatically

### `fixInfo`
`fixInfo` is the important part for automatic rewriting.

We used three patterns:

1. Replace a whole line:
  ```js
  fixInfo: {
    lineNumber: index + 1,
    editColumn: 1,
    deleteCount: line.length,
    insertText: fixedLine
  }
  ```
2. Delete a whole blank line:
  ```js
  fixInfo: {
    lineNumber: blankIndex + 1,
    deleteCount: -1
  }
  ```
3. Insert a blank line before another line:
  ```js
  fixInfo: {
    lineNumber: nextNonBlank + 1,
    insertText: "\n"
  }
  ```

### Why we still use some built-in rules
Not everything needs a custom rule.

These built-ins already do part of the job:

* `MD004` for `*` unordered list markers
* `MD030` for one space after list markers
* `MD055` for leading/trailing pipe style in tables
* `MD056` for consistent table column counts

That let the custom rules focus on the behavior that `remark` used to provide and `markdownlint` does not provide natively.

### Shared helper functions
Before the individual rules, the rule file defines helpers.

Some helpers are still plain-text utilities, and some now support parser-based rules.

#### Protected-line detection
Original problem:

* text-replacement rules should not rewrite frontmatter or fenced code blocks

Relevant code:

```js
// Mark lines that should not be rewritten by text-based rules.
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
  ...
}
```

What it does:

* detects frontmatter at the top of the file
* detects fenced code blocks
* returns an array of booleans so every rule can skip protected lines

#### `markdown-it` token helpers
Original problem:

* structure-sensitive rules needed a reliable way to reason about parsed block structure
* we still wanted to map every fix back to the original source lines

Relevant helpers:

```js
function findMatchingCloseToken(tokens, openIndex, openType, closeType) {
  ...
}

function findNextBlockToken(tokens, startIndex) {
  ...
}

function isSingleLineToken(token) {
  ...
}

function getMeaningfulChildren(children) {
  ...
}
```

What they do:

* walk parsed block tokens safely
* find the matching close token for container blocks like headings
* find the next real block after the current one
* limit some rewrites to single-line blocks
* ignore empty text nodes when checking inline content like leading `strong` text

#### Whole-line text replacement
Original problem:

* some rules need a simple source-text rewrite on every non-protected line
* the original arrow instruction was to replace all of the target arrows, not to preserve inline code spans

This helper is now used by the reusable text-replacement rule factory.

#### Reusable text-replacement rule factory
Original problem:

* we wanted the ASCII arrows rule to be reusable instead of hand-writing the same `parser: 'none'` rule shape each time
* future text replacement rules should be able to reuse the same protected-line logic and `fixInfo` structure

Relevant code:

```js
function createTextReplacementRule({ name, description, detail, replacements }) {
  return {
    names: [name],
    description,
    tags: ['deterministic-markdown'],
    parser: 'markdownit',
    function: (params, onError) => {
      const protectedLines = buildProtectedLines(params.lines)
      ...
    }
  }
}
```

What it does:

* creates a concrete markdownlint rule object from configuration inputs
* keeps the exported rules compatible with markdownlint, because the factory returns a normal rule object
* centralizes the line-scanning and replacement pattern for simple text rules
* makes it easier to add future source-text replacement rules without copying the whole rule body

Relevant code:

```js
function replaceAllText(line, replacements) {
  let output = line

  for (const [from, to] of replacements) {
    output = output.split(from).join(to)
  }

  return output
}
```

What it does:

* applies every configured replacement pair to the whole line
* leaves fenced code blocks and frontmatter alone because those lines are filtered out earlier by `buildProtectedLines`

#### Table helpers
Original problem:

* we wanted `remark`-style padded tables

Relevant helpers:

```js
function parseCells(line) {
  let value = line.trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  return value.split('|').map((cell) => cell.trim())
}

function buildDelimiterCell(cell, width) {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  const innerWidth = Math.max(width - (left ? 1 : 0) - (right ? 1 : 0), 1)
  return `${left ? ':' : ''}${'-'.repeat(innerWidth)}${right ? ':' : ''}`
}

function formatTable(lines) {
  ...
}
```

What they do:

* split table lines into cells
* detect alignment markers like `:---:`
* measure the widest cell in each column
* rebuild the table with padded cells and a normalized delimiter row

### Final mapping: original instruction to implementation

| Original instruction                                             | Implementation                                  |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| Do not put a blank line between a heading and a normal paragraph | `block-spacing`                                 |
| Put one blank line between a heading and a list                  | `block-spacing`                                 |
| Put one blank line between a heading and a code block            | `block-spacing`                                 |
| Put one blank line between normal text and a list                | `block-spacing`                                 |
| Use `*` for unordered lists                                      | built-in `MD004`                                |
| Put one space after a list marker                                | built-in `MD030`                                |
| Do not use bold text in lists                                    | `bold-list-code`                                |
| Use headings instead of standalone bold paragraphs               | `bold-heading`                                  |
| Use `->` and `<-` instead of `->` and `<-`                       | `ascii-arrows`                                  |
| Keep adjacent reference definitions tight                        | `tight-definitions`                             |
| Normalize thematic breaks to `----------`                        | `thematic-break`                                |
| Pad and align tables                                             | `table-align` plus built-in `MD055` and `MD056` |
| Keep blank lines around tables                                   | built-in `MD058`                                |

#### 1. `markdown-format-block-spacing`
Rule name in code:

```js
names: ['markdown-format-block-spacing']
```

How it works:

1. read parsed `markdown-it` block tokens
2. find each real heading token and its matching close token
3. find the next parsed block after that heading
4. use token line ranges to measure how many blank lines exist in the source
5. if the next block is a paragraph, delete all blank lines in between
6. if the next block is a list, code block, table, shortcode, or another non-paragraph block, require exactly one blank line

Key snippet:

```js
if (tokens[index].type !== 'heading_open') continue

const headingCloseIndex = findMatchingCloseToken(tokens, index, 'heading_open', 'heading_close')
const nextBlockIndex = findNextBlockToken(tokens, headingCloseIndex + 1)

const headingEndLine = tokens[index].map && tokens[index].map[1]
const nextStartLine = tokens[nextBlockIndex].map && tokens[nextBlockIndex].map[0]
const blankCount = nextStartLine - headingEndLine
```

Why we changed it:

* the parser can tell us what the next block actually is
* that is more reliable than classifying blocks from raw lines alone
* it reduces false positives around nested Markdown structures

Why it had to be custom:

* built-in `markdownlint` blank-line rules are global
* your rule is context-sensitive
* you wanted different behavior for heading+paragraph versus heading+list/code/table
* we also wanted deterministic fixes instead of diagnostics only

#### 2. `markdown-format-ascii-arrows`
Rule name in code:

```js
names: ['markdown-format-ascii-arrows']
```

How it works:

1. build the rule from the reusable text-replacement rule factory
2. pass in the rule name, description, detail text, and arrow replacements
3. skip protected lines like frontmatter and fenced code
4. replace arrows everywhere on the remaining source line
5. replace the whole line with the fixed version

Key snippet:

```js
const asciiArrowRule = createTextReplacementRule({
  name: 'markdown-format-ascii-arrows',
  description: 'Replace Unicode arrows with ASCII arrows on non-protected lines.',
  detail: 'Use ASCII arrows.',
  replacements: [
    ['→', '->'],
    ['←', '<-']
  ]
})
```

Why we changed it:

* the rule logic is the same kind of line-based replacement we may want again later
* the factory keeps the markdownlint rule shape reusable without changing how the rule is exported
* the implementation now follows the original instruction literally by replacing the target arrows everywhere on non-protected lines

Why it had to be custom:

* `markdownlint` has no built-in rule for Unicode arrow normalization

#### 3. `markdown-format-bold-list-code`
Rule name in code:

```js
names: ['markdown-format-bold-list-code']
```

How it works:

1. read parsed inline tokens for paragraphs inside list items
2. check whether the first meaningful inline node is a `strong` span
3. map that token back to the original source line
4. normalize `-` or `+` to `*`
5. strip literal backticks from the bold content so the replacement is valid code
6. replace `**label**` with `` `label` `` and keep the rest of the line unchanged

Key snippet:

```js
if (
  token.type === 'inline' &&
  isSingleLineToken(token) &&
  stack.includes('list_item_open') &&
  stack[stack.length - 1] === 'paragraph_open'
) {
  const children = getMeaningfulChildren(token.children)
  if (children[0]?.type !== 'strong_open') continue
}

const pattern = /^(\s*(?:[*+-]|\d+\.)\s+)\*\*(.+?)\*\*(.*)$/
const prefix = match[1].replace(/^\s*[-+]\s/, (value) => value.replace(/[-+]/, '*'))
const strongContent = match[2].replace(/`/g, '')
const fixedLine = `${prefix}\`${strongContent}\`${suffix}`
```

Why we changed it:

* the parser tells us whether the bold text is actually the first inline content of a list paragraph
* that is safer than rewriting any raw line that happens to match the regex

Why it had to be custom:

* built-in `markdownlint` can complain about emphasis style, but it cannot convert bold labels in list items into inline code with your exact behavior

#### 4. `markdown-format-bold-heading`
Rule name in code:

```js
names: ['markdown-format-bold-heading']
```

How it works:

1. track heading depth from real parsed heading tokens
2. look for single-line paragraph tokens outside list items
3. check whether the paragraph's inline content is only a `strong` span
4. map that token back to the original source line
5. convert it into `#` markup one level below the last real heading
6. cap the depth at 6

Key snippet:

```js
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
  ...
}

const boldMatch = line.match(/^\*\*([^`].*[^`]|[^`])\*\*$/)
const depth = Math.min(lastDepth + 1, 6)
const fixedLine = `${'#'.repeat(depth)} ${boldMatch[1]}`
```

Why we changed it:

* the parser can distinguish a real standalone paragraph from bold text inside some other structure
* heading depth now comes from real heading tokens instead of regex matches over raw lines

Why it had to be custom:

* built-in `MD036` can detect emphasis used as a heading
* but your behavior is stronger: it automatically converts the line into a new heading at the correct depth

#### 5. `markdown-format-tight-definitions`
Rule name in code:

```js
names: ['markdown-format-tight-definitions']
```

How it works:

1. scan for a blank line
2. check whether the previous line and next line are both reference definitions
3. if yes, delete the blank line

Current note:

* this rule now lives in the parser-aware set, but the actual detection is still source-line based because reference definitions are not exposed as normal block tokens in the same way headings, tables, and thematic breaks are

Key snippet:

```js
const definitionPattern = /^\[[^\]]+\]:\s+\S/

if (!definitionPattern.test(params.lines[index - 1])) continue
if (!definitionPattern.test(params.lines[index + 1])) continue

onError({
  lineNumber: index + 1,
  fixInfo: {
    lineNumber: index + 1,
    deleteCount: -1
  }
})
```

Why it had to be custom:

* the old remark config used `tightDefinitions: true`
* `markdownlint` does not have a built-in autofix rule specifically for this exact definition-spacing behavior

#### 6. `markdown-format-thematic-break`
Rule name in code:

```js
names: ['markdown-format-thematic-break']
```

How it works:

1. read parsed `hr` tokens from `markdown-it`
2. map each real thematic break token back to its source line
3. if it is not already `----------`, replace the line with that exact string

Key snippet:

```js
if (token.type !== 'hr' || !isSingleLineToken(token)) continue

const index = token.map[0]
if (line === '----------') return
```

Why we changed it:

* the parser can tell us whether a line is actually a thematic break
* that is safer than trying to avoid setext-heading edge cases with raw-line heuristics

Why it had to be custom:

* built-in `MD035` can enforce a horizontal rule style
* but your old remark config normalized the output to one exact string

#### 7. `markdown-format-table-align`
Rule name in code:

```js
names: ['markdown-format-table-align']
```

How it works:

1. read parsed `table_open` tokens from `markdown-it`
2. use the token line range to extract the exact source lines for that table block
3. split each row into cells
4. compute the maximum width for each column
5. rebuild every row using padded cells
6. rebuild the delimiter row using the original alignment markers
7. replace each changed line in place

Key snippet:

```js
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
    fixInfo: {
      lineNumber: index + rowOffset + 1,
      editColumn: 1,
      deleteCount: line.length,
      insertText: formattedLine
    }
  })
})
```

Why we changed it:

* the parser gives us exact table boundaries
* that is more reliable than guessing table blocks from raw `|` lines

Why it had to be custom:

* built-in `markdownlint` can validate table structure and style
* it does not natively pad and align tables the way the old remark formatter did

## Practical notes

### If VS Code highlights but does not rewrite
Your settings are probably missing:

```json
"editor.codeActionsOnSave": {
  "source.fixAll.markdownlint": "explicit"
}
```

Also check that you are not relying only on `editor.formatOnSave`.

For this setup, the reliable mechanism is:

* `source.fixAll.markdownlint`

not:

* `editor.formatOnSave` by itself

### If fixes seem to require two saves
Use this setting pattern:

```json
"[markdown]": {
  "editor.formatOnSave": false
},
"editor.codeActionsOnSave": {
  "source.fixAll.markdownlint": "explicit"
}
```

Why:

* fix-on-save is the path that applies markdownlint fixes directly
* format-on-save can make the flow feel like a two-pass pipeline

### If the custom rules do not load at all
Check these in order:

1. the workspace is trusted
2. the `markdownlint.customRules` path is a valid VS Code path
3. the rule file exists at that path
4. you reloaded the VS Code window after changing `.cjs` files

### If the path format is wrong
Use paths like this:

```text
~/.markdownlint/.markdownlint.jsonc
~/.markdownlint/rules/markdown-format-rules.cjs
```

Do not use Windows paths like:

```text
C:\Users\...
```

And do not use a `vscode-remote://` URI in settings.

### If you want to test the rules outside VS Code
Use the optional CLI testing section earlier in this guide.

### If a rule file change does not take effect
Reload the window.

## Most important files in this workspace

* [tmp/markdownlint-remark-parity/rules/markdown-format-rules.cjs](/home/parsia/dev/mycopilot/tmp/markdownlint-remark-parity/rules/markdown-format-rules.cjs)
* [tmp/markdownlint-remark-parity/tests/90-save-test-bad.md](/home/parsia/dev/mycopilot/tmp/markdownlint-remark-parity/tests/90-save-test-bad.md)
* [tmp/markdownlint-remark-parity/tests/91-table-save-test-bad.md](/home/parsia/dev/mycopilot/tmp/markdownlint-remark-parity/tests/91-table-save-test-bad.md)

## Drawbacks
One important limitation we found is around nested content inside ordered lists.

This matters for two cases in particular:

* nested sublists under items like `1. ...`
* fenced code blocks that are supposed to belong to the ordered list item

The short version is that this is not mainly a `markdownlint` preference.

It comes from how Markdown parsers interpret ordered list items.

### The problem
Consider this pattern:

```text
1. Create the central directory for your rules:
  [start fence]
  mkdir -p ~/.markdownlint/rules
  [end fence]
2. Copy the custom rule file:
  1. Source -> destination
```

If the nested fence or nested `1.` line is indented by only 2 spaces, many Markdown parsers do not treat it as part of the ordered list item.

That means the content may render as a separate block instead of a child of the list item.

### What we investigated
We checked whether this behavior comes from a configurable `markdownlint` rule.

The relevant rules we looked at were:

* `MD005`, which checks inconsistent indentation for list items at the same parsed level
* `MD007`, which checks unordered list indentation and defaults to 2 spaces
* `MD031`, which requires blank lines around fenced code blocks

We also checked the `markdownlint` rules documentation for whether any rule can change how a parser recognizes nested content under an ordered list item.

### Why 3 spaces appears
For an ordered list item like `1. text`, the marker plus following space takes 3 columns:

```text
1. 
```

Because of that, nested content usually has to be indented to that content column or beyond in order to be treated as belonging to the list item.

So under `1. ...`, child content often needs 3 spaces.

Under an unordered item like `* ...`, the marker plus following space is only 2 columns, so a 2-space nested indent often works there.

### Underlying parser behavior
This comes from the CommonMark list item rules, not from a `markdownlint` preference.

CommonMark defines a list item in terms of:

* the width of the list marker itself
* the number of spaces after the marker
* the indentation needed for following lines to stay inside that list item

The spec describes this as `W + N`:

* `W` is the width of the list marker
* `N` is the number of spaces after the marker
* blocks that belong to the item must be indented by `W + N`

For example:

* `* foo` -> `W = 1`, `N = 1`, so following content needs 2 spaces
* `1. foo` -> `W = 2`, `N = 1`, so following content needs 3 spaces
* `10. foo` -> `W = 3`, `N = 1`, so following content needs 4 spaces

That is why a fixed 2-space rule works for many unordered lists but stops working as soon as the ordered marker becomes wider.

The CommonMark sublist rule follows directly from the same logic.

It does not have a separate special rule saying "sublists are always indented by 2" or "ordered sublists are always indented by 3".

Instead, a sublist must be indented by however much indentation a paragraph would need in order to belong to the parent list item.

That means the required indent is relative to the parent item's marker width.

### Why 2 spaces fails under `1.`
If the parent item is written like this:

```md
1. Parent
```

then the content region for that item begins after `1.`.

So a child block has to start at or beyond that point to be considered part of the item.

With only 2 spaces:

```md
1. Parent
  1. Child
```

the nested ordered item is not indented far enough to fall under the parent item according to the parser's rule.

The same issue applies to other block types, not just sublists.

### Why fenced code blocks behave the same way
Fenced code blocks have their own rule in CommonMark: the opening fence may be indented by up to 3 spaces.

However, that rule applies after the parser has already determined which container block the line belongs to.

So inside a list item, the fence still has to be indented enough to remain inside the list item's content region.

That means a fence under `1. foo` still needs to satisfy the list item's required indentation before it can be recognized as a fenced code block inside that item.

So this:

```md
1. Parent
  [start fence: bash]
  echo hi
  [end fence]
```

is not reliably parsed as a fence inside the list item, because the fence line is not indented enough to belong to the item in the first place.

By contrast, this matches the list item indentation rule:

```md
1. Parent
   [start fence: bash]
   echo hi
   [end fence]
```

The important detail is that the parser first decides container structure and only then interprets the line as a fence, paragraph, sublist, or some other block.

### Why lazy continuation does not help
CommonMark has a concept of lazy continuation lines for paragraphs in list items and block quotes.

But laziness only applies to paragraph continuation text.

It does not apply to block starts like:

* a nested list item
* a fenced code block
* a block quote

So even though paragraph text can sometimes continue with less indentation, nested lists and fences cannot use that escape hatch.

That is why a child paragraph may still appear to belong to a list item while a child sublist or fence at the same indentation does not.

### Why `markdownlint` cannot override this
`markdownlint` can validate and rewrite source text, but it does not redefine the parser's block construction algorithm.

The underlying parser determines where list items begin and end, and whether a later line is:

* part of the same list item
* a nested sublist
* a fenced code block inside the item
* a new top-level block outside the list

Once that structural interpretation is fixed, `markdownlint` can report style issues on top of it.

That is why disabling `MD005` or adjusting `MD007` may suppress diagnostics, but neither can make the parser reinterpret a 2-space nested block under `1. ...` as belonging to that item.

### Why the obvious fixes do not solve it
Disabling `MD005` can remove one lint complaint, but it does not change Markdown parsing.

So a nested ordered sublist indented by 2 spaces under `1. ...` may still not be recognized as a real child list.

Adjusting `MD007` does not solve it either.

`MD007` is about unordered list indentation, not about redefining ordered-list parsing.

Relaxing `MD031` can reduce friction around fenced code blocks inside lists, especially if `MD031.list_items` is set to `false`.

However, that still does not make a 2-space-indented fence under `1. ...` belong to the list item.

In other words, lint configuration can remove warnings, but it cannot override the parser's structural rules.

### Practical consequence
There is no `markdownlint` setting that gives all of these at the same time:

1. ordered outer lists
2. 2-space nested indentation under those ordered items
3. nested sublists and fenced code blocks still being recognized as part of the ordered list item

If ordered lists must remain ordered and the nested content must truly belong to the item, then the nested content needs to follow the parser's indentation requirements.

For `1. ...`, that commonly means 3 spaces.

### What this means for this setup
This guide can enforce style choices with `markdownlint`, and our custom rules can add project-specific formatting behavior.

But neither the built-in rules nor the custom rules can redefine CommonMark-style ordered list nesting so that 2 spaces under `1. ...` becomes equivalent to 3 spaces.

That is a parser-level constraint, not a linter preference.

We can still decide later how to handle that tradeoff in practice, but the limitation itself should be treated as real.
