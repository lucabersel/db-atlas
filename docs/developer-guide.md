# DB Atlas — Developer guide

How the plugin is built, how its parts fit together and how to write code for it. For what the plugin does from a user's point of view see the [user guide](user-guide.md); the full functional specification is [PROJECT.md](PROJECT.md) (Italian).

- [Getting started](#getting-started)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [Modules](#modules)
- [Key algorithms](#key-algorithms)
- [Persistence](#persistence)
- [Translations](#translations)
- [Coding conventions](#coding-conventions)
- [Testing and benchmarks](#testing-and-benchmarks)
- [Performance rules](#performance-rules)
- [Releasing](#releasing)

---

## Getting started

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev        # esbuild in watch mode
npm run build      # type-check (tsc --noEmit) + production build
npm test           # vitest
npm run lint       # eslint
npm run bench      # layout and routing timings on generated schemas
npm run gen:perf -- 1000   # write a 1000-table schema into test-vault/Perf1000
```

Every build copies `main.js`, `manifest.json` and `styles.css` into `test-vault/.obsidian/plugins/db-atlas/`. `test-vault/` is a local, git-ignored vault: create it (or let the build create the plugin folder), open it in Obsidian, enable community plugins and DB Atlas. After a rebuild, reload the plugin (disable/enable, or the *Reload app without saving* command).

The stack follows `obsidian-sample-plugin`: TypeScript, esbuild bundling to a single CommonJS `main.js` (target ES2018, `lib` ES2020 + DOM), no UI framework — the diagram is plain SVG.

---

## Repository layout

```
src/                    plugin sources (see Modules)
tests/                  vitest unit tests; setup.ts configures ELK for Node
scripts/                benchmark (layout.bench.ts) and generated-schema tools
docs/                   user guide, developer guide, specification (PROJECT.md), README screenshot
styles.css              all plugin styles (.dba-* classes)
esbuild.config.mjs      bundling, ELK worker embedding, copy to test-vault
eslint.config.mjs       lint rules, including the "pure module" and "no Node API" rules
vitest.config.ts        unit tests; vitest.bench.config.ts for `npm run bench`
manifest.json           Obsidian manifest; versions.json maps versions to minAppVersion
version-bump.mjs        run by `npm version`
.github/workflows/      release workflow
```

---

## Architecture

```
            ┌──────────────── Obsidian ────────────────┐
  notes ──► │ metadataCache / vault events              │
            └──────────────┬───────────────────────────┘
                           ▼
  model/schemaLoader  SchemaWatcher (debounce 200 ms) ─► loadSchema(folder)
                           │        parseTable → parseColumn → buildSchema   (pure)
                           ▼
  view/DbAtlasView    toolbar, folder menu, empty states
                           │ Schema
                           ▼
  view/diagram        geometry + positions ──► layout/elkLayout (new tables, Web Worker)
                           │                    layout/layoutStore (saved positions)
                           ├─► layout/routingModel ─► orthoRouter + ChannelNudger (lines)
                           ├─► culling + level of detail ─► renderTable / renderEdges (SVG)
                           └─► viewport (pan/zoom), interactions (clicks, tooltips), drag
                                        │
  sync/headingNav  ◄───────────────────┘ open note / heading
  sync/renameHandler  vault rename events ─► rewrite refs, move positions, update settings
```

Data flows one way: notes → `Schema` → diagram. The diagram only writes two things: table positions (in `data.json`) and, on a column click, a missing `## column` heading.

---

## Modules

A module marked **pure** does not import `obsidian` (enforced by ESLint) and is unit-tested in Node.

### Plugin shell

| File | Role |
|---|---|
| `main.ts` | `Plugin` subclass: loads/normalizes data, applies the language, registers view, ribbon, commands, settings tab and rename handler; opens the view in the requested location; `new-table` flow; debounced saving; ELK worker lifecycle. |
| `settings.ts` | Settings tab: DB folder list (search with folder suggestions, drag to reorder with pointer events, remove), language, view location, template. Uses `SettingGroup` when available (Obsidian ≥ 1.11). |
| `data.ts` (pure) | Defaults and `normalizeData` (merges `data.json` with defaults, drops wrong types), folder path helpers, built-in template. |
| `types.ts` (pure) | Shared data model: `Column`, `Table`, `Relation`, `Issue`, `Schema`, `DbAtlasData`. |

### `model/` — from notes to a schema

| File | Role |
|---|---|
| `parseColumn.ts` (pure) | One `col_*` value (JSON string or YAML object) → `Column`, with `Issue`s. Never throws. |
| `parseTable.ts` (pure) | File name + frontmatter → `Table` (columns in frontmatter order, metadata, table-level issues). |
| `buildSchema.ts` (pure) | `Table[]` of one folder → `Schema`: resolves `ref`s (exactly one `.`, case-sensitive, same folder), creates `Relation`s, marks broken refs. |
| `tableName.ts` (pure) | Validation of new table names, template filling, note path. |
| `schemaLoader.ts` | `loadSchema(app, folder)` via `metadataCache`; `SchemaWatcher` (a `Component`) reloads on `changed`/`create`/`delete`/`rename` inside the folder, debounced. |

### `view/` — the diagram

| File | Role |
|---|---|
| `DbAtlasView.ts` | `ItemView`: floating toolbar, folder menu (`Menu`), messages, wiring of `SchemaWatcher` → `Diagram`, navigation callbacks. |
| `diagram.ts` | The SVG diagram: applies a schema (layout of new tables, routing model), culling, level of detail, table drag, busy indicator. |
| `tableGeometry.ts` (pure) | Table size and row positions from an injected text-measure function. |
| `measure.ts` | Text width with the theme's real fonts (canvas + computed style of probe SVG texts), cached. |
| `renderTable.ts` / `renderEdges.ts` | SVG for one table (three levels of detail) and one relation line with its markers. |
| `edgeGeometry.ts` (pure) | Rounded orthogonal paths, self-loops, crow's foot marker shapes, cardinality → marker kinds. |
| `viewport.ts` | Pan/zoom/fit state and input (drag threshold, wheel, pinch); the math is pure. |
| `interactions.ts` | Column clicks/taps, hover and long-press tooltips. |
| `tooltipText.ts` (pure) | Tooltip lines (column attributes, translated issues). |
| `color.ts` | Header colour from `table_color` (canvas-resolved, cached) and readable text colour. |

### `layout/` — positions and lines (all pure except the worker)

| File | Role |
|---|---|
| `elkLayout.ts` | Initial placement with ELK `layered`; `placeMissing` places only tables without a position, as a block to the right of the existing ones. The ELK engine is injected (`setElkEngine`). |
| `elkWorker.ts` | ELK in a Web Worker started from a Blob URL (the worker script is embedded in `main.js` as text). |
| `layoutStore.ts` | Saved positions per folder in `data.json` (rounding, pruning, change callback). |
| `spatialGrid.ts` | Uniform-grid spatial index; a key may own several rectangles (the segments of a line). |
| `orthoRouter.ts` | Orthogonal router for one relation, plus `ChannelNudger` (separation of parallel segments). |
| `routingModel.ts` | Routes of all relations, updated incrementally; full-route queue with a time budget; line index for culling. |

### `sync/` — keeping notes and data consistent

| File | Role |
|---|---|
| `headingNav.ts` | Opens a table note or a `## column` heading (appending it if missing), honouring modifier keys and never replacing the diagram's leaf. |
| `markdownHeadings.ts` (pure) | Finds / appends a level-2 heading, skipping frontmatter and code blocks. |
| `renameHandler.ts` | Vault `rename` events: table rename → rewrite refs with `processFrontMatter` and move the saved position; folder rename → update settings. |
| `renameLogic.ts` (pure) | Ref rewriting and `data.json` updates for renames. |

### `modals/` and `i18n/`

`NewTableModal` (name input with live validation) and `FolderPickerModal` (`SuggestModal` of DB folders). `i18n/` holds the translations, see [Translations](#translations).

---

## Key algorithms

### Parsing and validation

Parsing never throws and never stops at the first problem: every column and table carries a list of `Issue { level, code, params, table, column }`. `code` is a translation key (`issue.*`); the text is produced only when shown. An invalid column is kept (with `valid: false`) so it can be drawn in red.

### Initial layout

`placeMissing(nodes, edges, saved)` runs ELK `layered` (direction RIGHT, edges reversed so referenced tables come first) on the tables without a position only. With saved positions, the new block is offset to the right of the existing diagram (`NEW_BLOCK_GAP`). Options are tuned for speed (`thoroughness 1`, `BRANDES_KOEPF`, `GREEDY` cycle breaking): about 0.7 s for 1000 tables instead of 84 s with the defaults. In Obsidian it runs in a Web Worker; if the worker fails, the diagram falls back to a simple column placement.

### Routing (`orthoRouter.ts`)

For one relation from row A to row B:

1. **Sides**: right→left if the tables are apart horizontally, left→right if reversed, same side (C shape) if they overlap horizontally.
2. **Stubs**: a horizontal segment of `STUB` (20 px) at both ends, room for the cardinality markers.
3. **Direct path**: a Z or C shape through a few candidate vertical channels, accepted if no segment crosses a table inflated by `MARGIN` (14 px).
4. **Search**: otherwise A* on a sparse grid whose lines are the inflated borders of the tables near the two ends (window of 240 px, enlarged once to 960 px if the first has no path). Cost = length + `BEND_PENALTY` per turn, weighted heuristic (1.3), cap of `MAX_EXPANSIONS` (6000). Obstacle tests use a per-search cell index, so they cost O(1).
5. **Fallback**: a direct path ignoring obstacles (only if the search fails).

`route(..., "fast")` stops at step 3 (used while dragging).

**Parallel segments** (`ChannelNudger`): inner segments (never the stubs) are grouped by channel (same x for vertical, same y for horizontal); overlapping segments of different routes are spread `NUDGE_SPACING` (6 px) apart. Only channels touched by changed routes are recomputed.

### Incremental routing (`routingModel.ts`)

- `setGraph(rects, specs)`: diffs tables and relations with the previous state. Edges whose ends did not move keep their route; changed ones get a fast route immediately and are queued for a full route; edges crossing a changed table are queued too.
- `moveTable` (during drag): fast routes for that table's edges only.
- `settle` (on drop): queues full routes for its edges and for edges now crossing its area.
- `refine(budgetMs)`: computes queued full routes until the budget is spent (the diagram calls it with 8 ms per animation frame, paused while dragging).
- `finalize()`: nudging, then reports which drawn routes changed or were removed, and indexes each route's segments in a `SpatialGrid` for culling.

### Rendering, culling and level of detail (`diagram.ts`)

- Only tables and lines intersecting the visible area (plus a 200 px screen margin) are in the DOM; they are added/removed on every viewport change (throttled to one per frame).
- Level of detail by zoom: `full` ≥ 0.45 (rows, clickable), `compact` ≥ 0.12 (header and name), `minimal` below (boxes). Markers only in `full`. Lines and borders use `vector-effect: non-scaling-stroke`.
- On schema updates, a table element is re-created only if its content or position changed (signature = position + serialized table).

### Drag

The header's pointerdown starts a drag after `DRAG_THRESHOLD` (4 px); below it, release = click. The table element moves immediately; its lines follow on the next animation frame (fast routes); on drop the position is saved and full routes are queued.

---

## Persistence

`data.json`, read once at load and normalized (`normalizeData`), saved with `saveData`:

```ts
interface DbAtlasData {
  settings: {
    dbFolders: string[];                    // ordered, as shown in the folder menu
    language: string;                       // "auto" or a language code
    viewLocation: "tab" | "right" | "left";
    newTableTemplate: string;               // "" = built-in template in the current language
  };
  lastFolder?: string;
  layouts: { [folder: string]: { tables: { [table: string]: { x: number; y: number } } } };
}
```

Positions go through `LayoutStore` and a debounced save (1 s, flushed on unload). Settings changes are saved immediately and notify open views (`onSettingsChanged`). Positions of tables that no longer exist are pruned on every schema update.

---

## Translations

- `src/i18n/locales/en.ts` is the reference: every key must exist there. Other files export a `Locale` (any subset; missing keys fall back to English).
- Use `t(key, vars)` for every user-visible string. Placeholders are `{name}`; plural messages are objects keyed by `Intl.PluralRules` categories (`one`, `few`, `many`, …) and must have `other`.
- `resolveLanguage(setting, appLanguage)` maps "auto" to Obsidian's language (`getLanguage()` from 1.8.7, otherwise `moment.locale()`), regional variants to the base language, unknown languages to English.
- `plugin.applyLanguage()` switches language at runtime: settings tab, views (`onLanguageChanged`) and ribbon update immediately; command names only after a restart.

**Adding a language**: create `src/i18n/locales/<code>.ts` exporting a `Locale` with every key, add it to `LANGUAGES` in `src/i18n/index.ts` (name written in the language itself), run `npm test`: `tests/i18n.test.ts` fails if a key is missing or a placeholder differs from English.

**Adding a message**: add the key to `en.ts` and to every locale file (the test enforces it), then use it with `t()`.

---

## Coding conventions

- **Pure modules** (`model/`, `layout/`, `i18n/`, `data.ts`, `types.ts` and the files listed in `eslint.config.mjs`) must not import `obsidian`; keep logic there and test it.
- **No Node or Electron APIs** (`fs`, `path`, `electron`, …): the plugin runs on mobile. ESLint blocks these imports.
- **Text into the DOM** only via `textContent`, `setText` or `createEl({ text })`; never `innerHTML`.
- **Several CSS classes**: pass an array (`cls: ["a", "b"]`). `createSvg` throws on a string with spaces; ESLint reports it.
- **Styles** live in `styles.css`, classes prefixed `.dba-`, colours from Obsidian CSS variables. Inline styles only as CSS custom properties for dynamic values (`--dba-header-bg`, `--dba-tooltip-x`, …).
- **Obsidian APIs**: read frontmatter from `metadataCache`; write notes with `vault.process` / `fileManager.processFrontMatter`; register events with `registerEvent`; use the element's own `doc`/`win` where it matters (popout windows); check newer APIs before using them (`typeof SettingGroup === "function"`), `minAppVersion` stays 1.5.7.
- **Resources**: everything created by a view (listeners, timers, animation frames) is released in `destroy()`/`onClose`; the ELK worker is terminated on unload.
- **Performance**: no work proportional to the whole diagram on `pointermove` (see below).
- Code, comments and commit messages in English; UI text only through `t()`.

---

## Testing and benchmarks

- `npm test` runs vitest on `tests/**/*.test.ts` in Node. `tests/setup.ts` configures the in-thread ELK build (`elk.bundled.js`); Obsidian uses the worker.
- Coverage by file: parser and validation rules (`model.test.ts`), data normalization (`data.test.ts`), geometry, viewport math and colours (`view.test.ts`), ELK placement (`layout.test.ts`), router, nudging, spatial index and incremental model (`routing.test.ts`), markers and paths (`edges.test.ts`), headings and tooltips (`navigation.test.ts`), rename logic and table names (`rename.test.ts`), translations (`i18n.test.ts`).
- `npm run bench` (`scripts/layout.bench.ts`) measures, on generated schemas of 100–2000 tables: parsing, ELK, first-paint routes, full refinement, drag frames of the most connected table, drop, and counts lines crossing tables. Sizes: `BENCH_SIZES=100,1000 npm run bench`.
- `npm run gen:perf -- <n>` writes `test-vault/Perf<n>` with the same generator, to try the result in Obsidian.
- UI behaviour that needs Obsidian (rendering, pointer input, mobile) is checked by hand in `test-vault/`.

---

## Performance rules

The plugin must handle **more than 1000 tables smoothly**. Reference on a 1000-table / ~1900-relation generated schema (`npm run bench`): ELK layout < 1 s (once, in the worker), first-paint routes < 100 ms, drag frame < 16 ms even for the most connected table, zero lines crossing tables.

To keep it that way:

- never reroute, re-render or re-measure the whole diagram on `pointermove`; use the incremental APIs (`moveTable`, `settle`, `refine`);
- query the spatial indexes (`queryTables`, `queryEdges`) instead of scanning all items;
- anything expensive and non-urgent goes through a time budget (like `refine`) or a worker;
- run `npm run bench` before and after changes to layout, routing or rendering.

---

## Releasing

1. `npm version <patch|minor|major>`: updates `package.json`, `manifest.json` and `versions.json`, commits and tags (the tag is the bare version, e.g. `0.2.0`).
2. `git push && git push --tags`.
3. The *Release* workflow checks that the tag matches `manifest.json`, runs lint, tests and build, and creates a **draft** GitHub release with `main.js`, `manifest.json` and `styles.css`.
4. Review the draft, add release notes, publish.

`minAppVersion` changes only when a required API needs it; `versions.json` records the minimum Obsidian version of every release.

### Obsidian plugin guidelines checklist

Checked before submitting to the community plugin directory:

- [x] No `innerHTML` / `outerHTML` / `insertAdjacentHTML` with user data.
- [x] No Node/Electron APIs; `main.js` only requires `obsidian`; `isDesktopOnly: false`.
- [x] No `console.log`; only `console.error` for real failures.
- [x] No global `app`; files changed with `vault.process` / `processFrontMatter`.
- [x] Events registered with `registerEvent`; listeners, timers, frames and the worker released on close/unload; leaves not detached in `onunload`.
- [x] No `eval` / `new Function`.
- [x] Styles in `styles.css` with a plugin prefix; inline styles only for dynamic CSS variables.
- [x] Commands without default hotkeys, names without the plugin name; settings without a top-level heading, sections with `setHeading()` / `SettingGroup`; sentence case.
- [x] Interface translated (13 languages, English default, follows Obsidian's language).
- [x] `manifest.json` complete (`id` without "obsidian", description ending with a period), `versions.json`, `LICENSE` (MIT), `THIRD_PARTY_NOTICES.md` (elkjs, EPL-2.0) and licence notice in the `main.js` banner.
- [x] `app.setting.open()` / `openTabById()` (internal API, no public alternative) is used only by *Open settings* and *Manage folders…*; if it is missing or fails, a notice tells the user how to open the settings.
- [x] Translations other than English and Italian welcome review by native speakers through pull requests.
