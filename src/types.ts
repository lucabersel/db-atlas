// Data model shared by parser, loader and view. No `obsidian` imports here.

import type { MessageKey } from "./i18n";

/** Cardinality read from the FK side (see PROJECT.md §4.5). */
export type Rel = ">" | "<" | "-" | "<>";

export type IssueLevel = "error" | "warning";

export type IssueCode = Extract<MessageKey, `issue.${string}`>;

export interface Issue {
	level: IssueLevel;
	/** Translation key of the message (translated when shown, see tooltipText.ts). */
	code: IssueCode;
	/** Values for the message placeholders. */
	params?: Record<string, string>;
	table: string;
	/** Set when the issue concerns a single column. */
	column?: string;
}

export interface Column {
	/** Frontmatter key without the `col_` prefix. */
	name: string;
	/** False when the definition could not be parsed (invalid JSON, missing `type`): rendered in red. */
	valid: boolean;
	/** SQL type as written by the user; empty string when `valid` is false. */
	type: string;
	pk: boolean;
	notNull: boolean;
	unique: boolean;
	increment: boolean;
	default?: string | number | boolean;
	/** Raw `tabella.campo` reference as written in the note. */
	ref?: string;
	/** Always set when `ref` is present (defaults to `>`). */
	rel?: Rel;
	issues: Issue[];
}

export interface Table {
	/** File basename without `.md`. Case-sensitive. */
	name: string;
	/** Vault path of the note. */
	path: string;
	color?: string;
	description?: string;
	/** Columns in frontmatter order. */
	columns: Column[];
	/** False when the name contains `.` (cannot be the target of a `ref`). */
	referenceable: boolean;
	issues: Issue[];
}

export interface Relation {
	fromTable: string;
	fromColumn: string;
	toTable: string;
	toColumn: string;
	rel: Rel;
	/** `notNull` of the FK column: decides bar vs circle on the referenced side. */
	fkNotNull: boolean;
}

export interface Schema {
	folder: string;
	tables: Table[];
	relations: Relation[];
}

export type ViewLocation = "tab" | "right" | "left";

export interface DbAtlasSettings {
	dbFolders: string[];
	/** "auto" (Obsidian's language) or a language code, see i18n/index.ts. */
	language: string;
	viewLocation: ViewLocation;
	/** Custom template; empty = built-in template in the current language. */
	newTableTemplate: string;
}

export interface TablePosition {
	x: number;
	y: number;
}

export interface FolderLayout {
	tables: { [tableName: string]: TablePosition };
}

export interface DbAtlasData {
	settings: DbAtlasSettings;
	lastFolder?: string;
	layouts: { [folderPath: string]: FolderLayout };
}
