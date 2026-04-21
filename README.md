# Markdown Formatting Repository
This directory is organized to hold the current Markdown formatting setup in one place.

It has two top-level folders:

* `remark/` for the `remark`-based formatter configurations
* `markdownlint/` for the `markdownlint`-based rule set and configuration

This structure is intended to be easy to turn into a standalone Git repository later.
No tests are included here.

Blog post:
[Harnessing the Wayward Machine-God, 1: Manual Markdown Cleanup Is a Bug][l1].

[l1]: https://parsiya.net/blog/machine-god-1/

## Layout

```
markdown-formatting-repo/
  README.md
  remark/
    README.md
    self-contained/
      .remarkrc.mjs
    with-plugins/
      .remarkrc.mjs
  markdownlint/
    README.md
    .markdownlint.jsonc
    rules/
      markdown-format-rules.cjs
```

## What is included

### `remark/`
Contains two variants of the formatter configuration:

* `self-contained/.remarkrc.mjs`
  * inline implementation
  * no extra npm packages required
* `with-plugins/.remarkrc.mjs`
  * uses `remark-gfm` and `remark-frontmatter`
  * simpler table/frontmatter handling

### `markdownlint/`
Contains the custom markdownlint rule set and the base `.markdownlint.jsonc`
configuration that enables the built-in and custom rules.

If you need per-repo overrides without using `extends`, prefer a repo-local
`.vscode/settings.json` over a repo-local `.markdownlint.jsonc`.
