// Note basename + frontmatter → Table. Pure: no `obsidian` imports.

import type { Issue, Table } from "../types";
import { COLUMN_PREFIX, parseColumn } from "./parseColumn";

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * @param name file basename without `.md` (= table name)
 * @param path vault path of the note
 * @param frontmatter frontmatter object from the metadata cache, or undefined if the note has none
 */
export function parseTable(name: string, path: string, frontmatter: unknown): Table {
	const fm = typeof frontmatter === "object" && frontmatter !== null ? (frontmatter as Record<string, unknown>) : {};
	const issues: Issue[] = [];

	// Object key order = frontmatter order (col_* keys are never integer-like).
	const columns = Object.keys(fm)
		.filter((key) => key.startsWith(COLUMN_PREFIX) && key.length > COLUMN_PREFIX.length)
		.map((key) => parseColumn(key, fm[key], name));

	if (columns.length === 0) {
		issues.push({ level: "warning", message: "Nessun campo (nessuna property col_*)", table: name });
	}

	const referenceable = !name.includes(".");
	if (!referenceable) {
		issues.push({ level: "warning", message: "Il nome contiene \".\": la tabella non è referenziabile", table: name });
	}

	return {
		name,
		path,
		color: nonEmptyString(fm.table_color),
		description: nonEmptyString(fm.table_description),
		columns,
		referenceable,
		issues,
	};
}
