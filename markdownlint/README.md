# Markdownlint Rules

This folder holds the current `markdownlint` configuration and custom rule implementation.

## Files

### `.markdownlint.jsonc`

Enables the built-in and custom rules.

Built-in rules kept here:

- `MD004`
- `MD030`
- `MD055`
- `MD056`
- `MD058`

Custom rules enabled here:

- `markdown-format-block-spacing`
- `markdown-format-ascii-arrows`
- `markdown-format-bold-list-code`
- `markdown-format-bold-heading`
- `markdown-format-tight-definitions`
- `markdown-format-thematic-break`
- `markdown-format-table-align`

### `rules/markdown-format-rules.cjs`

Implements the custom rules.

Current design split:

- parser-aware rules use `markdownit`
- the rule file also contains plain line-based helpers for protected lines, table formatting, and text replacement

## Important setup detail

The JSONC file only configures rules. To use these custom rules in VS Code, the rule file must also be loaded with `markdownlint.customRules`.

If you are using a central VS Code setup, a repo-local `.markdownlint.jsonc`
does not work well as a small complementary override unless you can use
`extends`.

For practical per-repo overrides, use repo-local `.vscode/settings.json`
instead. Example:

```json
{
	"markdownlint.config": {
		"markdown-format-ascii-arrows": false,
		"markdown-format-bold-heading": false
	}
}
```

That keeps the central custom rule loading and central defaults in place while
overriding only the listed rules for one repository.

## Scope

This folder intentionally does not include tests. It is meant to hold the rule implementation and the configuration needed to reuse it elsewhere.
