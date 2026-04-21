# Remark Configurations

This folder holds the current `remark` formatter configurations.

## Variants

### `self-contained/`

This version keeps everything inside `.remarkrc.mjs`.

Characteristics:

- no extra npm packages required
- custom inline implementations for frontmatter handling, table alignment, shortcode preservation, and escape handling
- useful when you want a dependency-free setup

### `with-plugins/`

This version uses ecosystem packages for the parts `remark` handles better with plugins.

Characteristics:

- uses `remark-gfm`
- uses `remark-frontmatter`
- keeps the custom formatting transforms for arrows, list bold-to-code, bold-to-heading, shortcode preservation, and escape handling
- simpler than the self-contained version for tables and frontmatter

## Notes

Both configurations currently normalize arrows everywhere in the final serialized markdown output.

If you change either `.remarkrc.mjs`, reload the VS Code window so the `vscode-remark` language server picks up the new module version.
