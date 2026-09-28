# Changelog

All notable changes to DB Atlas. The release workflow uses the section of each version as the GitHub release notes.

## 0.3.0

- Settings rebuilt on Obsidian's settings definitions API: they now appear in Obsidian's settings search, the DB folder list uses the native list (drag to reorder, delete, add from a folder picker).
- Requires Obsidian 1.13.0 or later.
- Fixes from the community directory review: popout-safe animation frames and canvas creation, errors reported as `Error` objects by the layout worker, stricter typing, no `!important` in styles.
- Release assets are published with GitHub artifact attestations (build provenance).

## 0.2.2

- User-entered paths (DB folders, new table notes) are normalized with Obsidian's `normalizePath()`.

## 0.2.1

- If the settings cannot be opened directly from the diagram, a notice explains how to open them.
- Documentation: contributing section.

## 0.2.0

- Interface translated into 13 languages (English, Chinese, Hindi, Spanish, French, Arabic, Bengali, Portuguese, Russian, Japanese, German, Indonesian, Italian), with a language setting that follows Obsidian's language by default.
- New user and developer guides.

## 0.1.0

- First release: one note per table, interactive ER diagram with orthogonal relation lines and crow's foot cardinality, validation with clear errors and warnings, navigation from the diagram to notes and column headings, new table command, rename propagation, support for 1000+ tables.
