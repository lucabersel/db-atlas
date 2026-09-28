# DB Atlas — User guide

DB Atlas turns a folder of notes into a database schema: **one note per table**, columns defined in the note's properties, and free-form notes about each column in the note's body. The schema is shown as an **interactive ER diagram** you can explore, rearrange and use to jump straight to the right note.

- [Installation](#installation)
- [Core ideas](#core-ideas)
- [Building a schema step by step](#building-a-schema-step-by-step)
- [Writing a table note](#writing-a-table-note)
- [Relations](#relations)
- [Errors and warnings](#errors-and-warnings)
- [Using the diagram](#using-the-diagram)
- [Commands](#commands)
- [Settings](#settings)
- [Renaming and moving notes](#renaming-and-moving-notes)
- [Large schemas](#large-schemas)
- [Limitations](#limitations)
- [FAQ](#faq)

---

## Installation

**With BRAT (beta releases)**

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) community plugin.
2. In BRAT choose **Add beta plugin** and enter `https://github.com/lucabersel/db-atlas`.
3. Enable **DB Atlas** in *Settings → Community plugins*.

**Manually**

Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/lucabersel/db-atlas/releases/latest) into `<vault>/.obsidian/plugins/db-atlas/`, then enable the plugin.

DB Atlas works on desktop and mobile and requires Obsidian 1.13.0 or later.

---

## Core ideas

| Concept | What it is |
|---|---|
| **DB folder** | A folder of your vault that represents one database. You choose which folders are DB folders in the settings. |
| **Table note** | Every Markdown note **directly** inside a DB folder. Notes in subfolders are ignored. |
| **Table name** | The file name of the note, without `.md`. `customers.md` is the table `customers`. |
| **Column** | A property of the note whose name starts with `col_`. `col_email` is the column `email`. |
| **Column notes** | A `## column` heading in the body of the note, followed by whatever you want to write about that column. |

A vault can contain several DB folders (e.g. `Sales`, `Warehouse`, `Legacy ERP`); each one is a separate diagram.

---

## Building a schema step by step

This example builds a tiny shop database with customers, orders and order lines.

**1. Create the DB folder**

Create a folder, e.g. `Shop`. Open *Settings → DB Atlas*, click **+** next to **DB folders** and choose `Shop`.

**2. Create the tables**

Run the command **DB Atlas: New table**, type `customers` and confirm. The note is created from the template with a primary key already defined. Do the same for `orders` and `order_items`. You can also create notes in the folder by hand: every note in the folder is a table.

**3. Define the columns**

Open `customers.md` and write its properties:

```yaml
---
table_color: "#2E7D32"
table_description: Registered customers
col_id: '{"type":"int","pk":true,"increment":true}'
col_email: '{"type":"varchar(160)","notNull":true,"unique":true}'
col_full_name: '{"type":"varchar(120)","notNull":true}'
---
```

`orders.md` points to `customers` with a foreign key:

```yaml
---
table_description: Customer orders
col_id: '{"type":"int","pk":true,"increment":true}'
col_customer_id: '{"type":"int","notNull":true,"ref":"customers.id"}'
col_placed_at: '{"type":"datetime","notNull":true}'
col_status: '{"type":"varchar(20)","notNull":true,"default":"pending"}'
---
```

`order_items.md` has a composite primary key (two `pk` columns):

```yaml
---
table_description: Order lines
col_order_id: '{"type":"int","pk":true,"notNull":true,"ref":"orders.id"}'
col_line_no: '{"type":"smallint","pk":true,"notNull":true}'
col_quantity: '{"type":"int","notNull":true,"default":1}'
---
```

**4. Write about the columns**

In the body of `orders.md`:

```markdown
## status
pending → paid → shipped → delivered, or cancelled.
Set by the payment job; never change it by hand.
```

**5. Open the diagram**

Click the database icon in the ribbon, or run **DB Atlas: Open diagram**, and pick `Shop` in the folder menu at the top left. Tables are placed automatically, lines connect each foreign key to the column it references. Drag the tables where you like: positions are saved.

---

## Writing a table note

### Table properties (optional)

| Property | Value | Effect |
|---|---|---|
| `table_color` | any CSS colour (`"#2E7D32"`, `teal`, …) | Colour of the table header. The text colour (black or white) is chosen automatically. |
| `table_description` | text | Shown under the table name (long text is shortened with "…"). |

Any other property (`tags`, `aliases`, your own) is ignored by DB Atlas, so you can keep using properties as usual.

### Columns

Each `col_` property holds a **JSON object written as text, in single quotes**:

```yaml
col_email: '{"type":"varchar(160)","notNull":true,"unique":true}'
```

The single quotes matter: without them YAML reads the value as a nested object, which Obsidian's Properties panel does not handle well. DB Atlas still accepts it, but marks the column with a warning.

| Key | Value | Required | Default | Meaning |
|---|---|---|---|---|
| `type` | text | **yes** | — | SQL type, free text: `int`, `varchar(20)`, `decimal(10,2)`, `jsonb`, … |
| `pk` | `true` / `false` | no | `false` | Part of the primary key. Several `pk` columns form a composite key. |
| `notNull` | `true` / `false` | no | `false` | NOT NULL |
| `unique` | `true` / `false` | no | `false` | UNIQUE |
| `increment` | `true` / `false` | no | `false` | Auto increment |
| `default` | text, number or `true`/`false` | no | — | Default value |
| `ref` | `"table.column"` | no | — | Foreign key to a column of a table **in the same DB folder** |
| `rel` | `">"`, `"<"`, `"-"`, `"<>"` | no | `">"` when `ref` is set | Cardinality of the relation (see below) |

Notes:

- Flags count only when they are the boolean `true` (`"true"` in quotes is ignored).
- Unknown keys are ignored, so you can add your own (e.g. `"comment": "..."`).
- Table and column names are case-sensitive: `Customers.id` and `customers.id` are different.
- Columns are shown in the order of the properties in the note.

### Column notes

Write a `## column_name` heading (level 2, exactly the column name) in the body of the note. Clicking the column in the diagram opens the note at that heading; if the heading does not exist yet, DB Atlas adds it at the end of the note and opens it there, ready for you to type.

The body can contain anything else too: general notes about the table, links, queries in code blocks (headings inside code blocks are not taken into account).

### The new table template

The **New table** command creates notes from a template, editable in the settings. `{{name}}` is replaced by the table name. The built-in template defines an `id` primary key and its `## id` heading.

---

## Relations

A column with `ref` draws a line **from that column's row to the referenced column's row**. The ends of the line show the cardinality with crow's foot notation:

| `rel` | Meaning | On the foreign key side | On the referenced side |
|---|---|---|---|
| `>` (default) | many-to-one | crow's foot (many) | one |
| `<` | one-to-many | bar (one) | crow's foot (many) |
| `-` | one-to-one | bar (one) | one |
| `<>` | many-to-many | crow's foot (many) | crow's foot (many) |

When the referenced side is "one", it also tells whether the relation is mandatory:

- the foreign key column has `"notNull": true` → **bar** (exactly one);
- otherwise → **circle** (zero or one).

Examples:

```yaml
# Every order belongs to exactly one customer (bar at customers)
col_customer_id: '{"type":"int","notNull":true,"ref":"customers.id"}'

# A product may have a brand (circle at brands)
col_brand_id: '{"type":"int","ref":"brands.id"}'

# One invoice per order
col_order_id: '{"type":"int","notNull":true,"unique":true,"ref":"orders.id","rel":"-"}'

# Self-reference: an employee's manager is another employee (drawn as a loop)
col_manager_id: '{"type":"int","ref":"employees.id"}'
```

Only tables of the **same DB folder** can be referenced, and a foreign key points to a single column (composite foreign keys are not supported).

---

## Errors and warnings

DB Atlas never refuses to draw: a mistake in one note affects only that note, and the diagram tells you what is wrong. Hover the column (long-press on mobile) to read the reason.

| Problem | How it looks |
|---|---|
| Invalid JSON, or no `type` | The column is red, its type shows "—" |
| `ref` to a table or column that does not exist | ⚠️ on the column, no line |
| `ref` to a table in another DB folder | ⚠️ on the column, no line |
| `ref` not in the `table.column` form | ⚠️ on the column, no line |
| Invalid `rel` | ⚠️ on the column; `>` is used |
| Column value without single quotes (YAML object) | ⚠️ on the column; the column works |
| Note without any `col_` property | Empty table with ⚠️ in the title |
| File name containing `.` | ⚠️ in the title; other tables cannot reference it |

Table-level warnings are explained in the tooltip of the table header.

---

## Using the diagram

### Opening it

- Ribbon icon or **DB Atlas: Open diagram**: opens in the location chosen in the settings (main tab, right or left sidebar).
- **Open diagram in a new tab / in the right sidebar / in the left sidebar**: a specific location. If the diagram is already open elsewhere, it moves there.

### Toolbar

- **Folder menu** (top left): shows the current DB folder; click it to switch folder or to open *Manage folders…* (the settings). The last folder is remembered.
- **Zoom in**, **Zoom out**, **Fit to view** (top right).

### Mouse and touch

| Desktop | Mobile | Effect |
|---|---|---|
| Hover a column | Long-press a column | Column details: `int · PK · NOT NULL · UNIQUE · AI · default: x · → customers.id`, plus any warning |
| Click the table header | Tap the header | Open the table note |
| Click a column | Tap a column | Open the note at `## column` (created if missing) |
| Drag the table header | Drag the header | Move the table (position saved) |
| Drag the background or a table body | Drag with one finger | Pan |
| Mouse wheel / trackpad pinch | Pinch | Zoom around the pointer |

Ctrl-click (Cmd-click on macOS) opens the note in a new tab. A plain click never replaces the diagram itself.

### Layout

Tables without a saved position are placed automatically, referenced tables to the left of the tables that point to them. When you add tables to an existing diagram they are placed to the right of it, without moving your arrangement. Positions are stored in the plugin's data, per DB folder.

### Levels of detail

When you zoom out, the diagram simplifies itself to stay readable and fast: below about 45% only table headers are shown, below about 12% only coloured boxes. Zoom in again to see the columns.

### Live updates

Edit a note and the diagram follows within a fraction of a second: new, deleted, renamed and changed notes are picked up, without losing your zoom or positions.

---

## Commands

| Command | What it does |
|---|---|
| **Open diagram** | Opens the diagram in the default location |
| **Open diagram in a new tab / in the right sidebar / in the left sidebar** | Opens the diagram in that location |
| **New table** | Asks for a name and creates a table note from the template in the current DB folder (the one shown in the diagram; otherwise you choose it), then opens it |

A new table name cannot be empty, contain `.` or any of `\ / : * ? " < > | # ^ [ ]`, or match an existing note of the folder (ignoring upper/lower case).

No hotkeys are assigned by default; you can add your own in *Settings → Hotkeys*.

---

## Settings

**DB folders**

- Click **+** (on mobile, the *Add* row below the list) and choose a folder of the vault.
- Drag a folder by its handle to reorder the list: the diagram's folder menu uses the same order.
- Remove a folder with its delete button: only the setting is removed, the notes are not touched.
- Each folder shows how many tables it contains, or "not found" if it no longer exists.

All DB Atlas settings can be found from Obsidian's settings search.

**Other options**

- **Language**: *Automatic* follows Obsidian's language; otherwise choose one of English, 中文, हिन्दी, Español, Français, العربية, বাংলা, Português, Русский, 日本語, Deutsch, Bahasa Indonesia, Italiano. The change is immediate; command names update after restarting Obsidian.
- **Diagram location**: main tab, right sidebar or left sidebar.
- **New table template**: the content of new table notes (`{{name}}` = table name). Until you edit it, the built-in template follows the language; **Restore default** brings it back.

---

## Renaming and moving notes

| You do | DB Atlas does |
|---|---|
| Rename a table note inside its DB folder | Updates every `ref` to it in the notes of the folder (and in the note itself for self-references), and keeps its position in the diagram |
| Move a note out of the DB folder | The table disappears; references to it are shown as broken |
| Rename or move a DB folder (or a folder containing it) | Updates the settings, the saved positions and the last opened folder |
| Rename a column | Nothing: references to the old column name are shown as broken, update them by hand |

---

## Large schemas

DB Atlas is designed for big databases and stays smooth with more than 1000 tables:

- only what is on screen is drawn;
- the first layout of a large folder runs in the background ("Laying out tables…" appears);
- while you drag a table, only its lines are recalculated; the rest follows when you drop it.

Tips: split very large databases into several DB folders if they are really separate schemas, and use `table_color` to mark the areas of the schema (e.g. one colour per module).

---

## Limitations

Not available in this version: export to image, search, table groups, indexes and enums, composite foreign keys, editing columns from the diagram, relations between different DB folders, tables in subfolders, automatic update of references when a column is renamed.

---

## FAQ

**The diagram is empty.** Check that the folder is listed in *Settings → DB Atlas* and selected in the folder menu, and that the notes are directly inside it (not in subfolders).

**A column is red.** The value is not valid JSON or has no `type`. The most common causes are missing double quotes around keys (`{type:"int"}` instead of `{"type":"int"}`) and a missing closing `}`. Hover the column to see the exact reason.

**A line is missing.** The column's `ref` is broken: check spelling and upper/lower case of `table.column`, and that the table is in the same DB folder. The column shows ⚠️ and the tooltip says what is wrong.

**The column is fine but has ⚠️ "YAML value without quotes".** Wrap the JSON in single quotes: `col_x: '{"type":"int"}'`.

**I want to start the layout over.** Positions are stored per DB folder in the plugin's data (`.obsidian/plugins/db-atlas/data.json`, key `layouts`). Removing a folder's entry while Obsidian is closed makes DB Atlas lay it out again.
