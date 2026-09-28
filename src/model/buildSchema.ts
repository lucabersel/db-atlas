// Table[] of one DB folder → Schema with resolved relations. Pure: no `obsidian` imports.

import type { Column, IssueCode, Relation, Schema, Table } from "../types";
import { DEFAULT_REL } from "./parseColumn";

/** Splits `tabella.campo`; null unless there is exactly one `.` with text on both sides. */
export function splitRef(ref: string): { table: string; column: string } | null {
	const parts = ref.split(".");
	if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return null;
	return { table: parts[0], column: parts[1] };
}

/**
 * Resolves every `ref` against the tables of the same folder (case-sensitive).
 * Input tables are not mutated: broken refs are reported as warnings on copies of the columns.
 */
export function buildSchema(folder: string, tables: Table[]): Schema {
	const byName = new Map<string, Table>();
	for (const t of tables) if (t.referenceable) byName.set(t.name, t);

	const relations: Relation[] = [];
	const resolved = tables.map((table): Table => {
		const columns = table.columns.map((col): Column => {
			const out: Column = { ...col, issues: [...col.issues] };
			if (!col.valid || col.ref === undefined) return out;

			const warn = (code: IssueCode, params: Record<string, string>) =>
				out.issues.push({ level: "warning", code, params, table: table.name, column: col.name });

			const target = splitRef(col.ref);
			if (!target) {
				warn("issue.refMalformed", { ref: col.ref });
				return out;
			}
			const targetTable = byName.get(target.table);
			if (!targetTable) {
				warn("issue.refMissingTable", { table: target.table });
				return out;
			}
			if (!targetTable.columns.some((c) => c.name === target.column)) {
				warn("issue.refMissingColumn", { column: target.column, table: target.table });
				return out;
			}

			relations.push({
				fromTable: table.name,
				fromColumn: col.name,
				toTable: target.table,
				toColumn: target.column,
				rel: col.rel ?? DEFAULT_REL,
				fkNotNull: col.notNull,
			});
			return out;
		});
		return { ...table, columns, issues: [...table.issues] };
	});

	return { folder, tables: resolved, relations };
}
