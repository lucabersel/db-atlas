// Tooltip contents. Pure.

import type { Column, Issue, Table } from "../types";

function issueLine(i: Issue): string {
	return `${i.level === "error" ? "❌" : "⚠️"} ${i.message}`;
}

/** `int · PK · NOT NULL · UNIQUE · AI · default: x · → agenti.id` (PROJECT.md §4.6), then one line per issue. */
export function columnTooltip(column: Column): string[] {
	const lines: string[] = [];
	if (column.valid) {
		const parts = [column.type];
		if (column.pk) parts.push("PK");
		if (column.notNull) parts.push("NOT NULL");
		if (column.unique) parts.push("UNIQUE");
		if (column.increment) parts.push("AI");
		if (column.default !== undefined) parts.push(`default: ${String(column.default)}`);
		if (column.ref !== undefined) parts.push(`→ ${column.ref}`);
		lines.push(parts.join(" · "));
	}
	lines.push(...column.issues.map(issueLine));
	return lines;
}

/** Only table-level issues (e.g. "nessun campo"): nothing to show for a clean table. */
export function tableTooltip(table: Table): string[] {
	return table.issues.map(issueLine);
}
