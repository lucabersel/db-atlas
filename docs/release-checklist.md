# Release checklist

Checks against the Obsidian plugin guidelines and submission requirements, with the current status.

## Code

- [x] No `innerHTML` / `outerHTML` / `insertAdjacentHTML` with user data: all text is set with `textContent`, `setText` or `createEl({ text })`.
- [x] No Node/Electron APIs (`fs`, `path`, `electron`, …): enforced by ESLint; `main.js` only requires `obsidian`. `isDesktopOnly: false`.
- [x] No `console.log`; only `console.error` for real failures.
- [x] No global `app`: always the plugin's / view's `this.app`.
- [x] Files are changed with `vault.process` and `fileManager.processFrontMatter`, never `vault.modify` or the adapter.
- [x] Events registered with `registerEvent`; DOM listeners, timers, animation frames and the layout worker are released on view close / plugin unload.
- [x] Leaves are not detached in `onunload`.
- [x] Popout windows: text measuring uses the SVG's own `doc`/`win`.
- [x] Styles in `styles.css`, classes prefixed `dba-`, Obsidian CSS variables only. Inline styles are limited to CSS custom properties for dynamic values (table colours, positions, tooltip placement).
- [x] No `eval` / `new Function`.
- [ ] Private API: `app.setting.open()/openTabById()` is used by the "Open settings" button and the "Manage folders…" menu item (guarded: does nothing if missing). Reviewers may ask to remove it.

## UI

- [x] Commands have no default hotkeys; names do not repeat the plugin name.
- [x] Settings: no top-level heading with the plugin name, section headings via `setHeading()` / `SettingGroup`.
- [x] Sentence case in UI text.
- [x] UI translated in 13 languages (English default, follows Obsidian's language); translations other than English and Italian are machine-quality and would benefit from native review.

## Manifest and release

- [x] `manifest.json`: `id` `db-atlas` (no "obsidian"), `name`, `version`, `minAppVersion` 1.5.7, `description` (ends with a period, no "This plugin"), `author`, `isDesktopOnly`.
- [x] `versions.json` maps each version to its `minAppVersion`; `npm version` updates both files.
- [x] GitHub workflow: on a tag equal to the manifest version, lint + test + build and create a draft release with `main.js`, `manifest.json`, `styles.css`.
- [x] `LICENSE` (MIT) and `THIRD_PARTY_NOTICES.md` (elkjs, EPL-2.0); license notice in the `main.js` banner.
- [x] `docs/screenshot.png` for the README.
- [ ] GitHub repository created, `authorUrl`/repository link filled in, first release published and installed through BRAT.
