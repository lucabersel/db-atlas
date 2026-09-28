// Data model shared by parser, loader and view. No `obsidian` imports here.

/** Cardinality read from the FK side (see PROJECT.md §4.5). */
export type Rel = ">" | "<" | "-" | "<>";

export type IssueLevel = "error" | "warning";

export interface Issue {
	level: IssueLevel;
	message: string;
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
	viewLocation: ViewLocation;
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
