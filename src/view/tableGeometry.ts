// Table box sizes and row positions. Pure: text widths come from an injected measure function.

import type { Column, Table } from "../types";

export type FontRole = "tableName" | "tableDesc" | "colName" | "colType";

/** Returns the rendered width in px of `text` in the given font role. */
export type Measure = (text: string, role: FontRole) => number;

export const PAD_X = 10;
export const ROW_HEIGHT = 24;
export const HEADER_NAME_HEIGHT = 30;
export const HEADER_DESC_HEIGHT = 18;
export const HEADER_PAD_BOTTOM = 4;
export const NAME_TYPE_GAP = 20;
export const ICON_GAP = 6;
export const MIN_TABLE_WIDTH = 140;
export const MAX_DESC_WIDTH = 320;
export const WARNING_ICON = "⚠️";
export const PK_ICON = "🔑";
export const FK_ICON = "🔗";
export const EMPTY_TABLE_TEXT = "nessun campo";
export const INVALID_TYPE_TEXT = "—";

export interface RowGeometry {
	column: Column;
	/** Top of the row, relative to the table. */
	y: number;
	icons: string;
	warning: boolean;
	typeText: string;
}

export interface TableGeometry {
	width: number;
	height: number;
	headerHeight: number;
	/** Table name as displayed (with ⚠️ for table-level warnings). */
	title: string;
	/** Description, truncated with … to MAX_DESC_WIDTH. */
	description?: string;
	/** X where column names start (after the icon column). */
	nameX: number;
	rows: RowGeometry[];
}

export function columnIcons(column: Column): string {
	return (column.pk ? PK_ICON : "") + (column.ref !== undefined ? FK_ICON : "");
}

/** Truncates `text` with an ellipsis so that it fits in `maxWidth`. */
export function truncate(text: string, maxWidth: number, role: FontRole, measure: Measure): string {
	if (measure(text, role) <= maxWidth) return text;
	let lo = 0;
	let hi = text.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (measure(text.slice(0, mid) + "…", role) <= maxWidth) lo = mid;
		else hi = mid - 1;
	}
	return text.slice(0, lo).trimEnd() + "…";
}

export function computeTableGeometry(table: Table, measure: Measure): TableGeometry {
	const title = table.issues.length > 0 ? `${table.name} ${WARNING_ICON}` : table.name;
	const description =
		table.description !== undefined ? truncate(table.description, MAX_DESC_WIDTH, "tableDesc", measure) : undefined;
	const headerHeight = HEADER_NAME_HEIGHT + (description !== undefined ? HEADER_DESC_HEIGHT : 0) + HEADER_PAD_BOTTOM;

	const rowsData = table.columns.map((column) => ({
		column,
		icons: columnIcons(column),
		warning: column.valid && column.issues.length > 0,
		typeText: column.valid ? column.type : INVALID_TYPE_TEXT,
	}));

	const iconWidth = Math.max(0, ...rowsData.map((r) => (r.icons ? measure(r.icons, "colName") : 0)));
	const nameX = PAD_X + (iconWidth > 0 ? iconWidth + ICON_GAP : 0);
	const warnWidth = measure(` ${WARNING_ICON}`, "colName");

	let width = Math.max(
		MIN_TABLE_WIDTH,
		PAD_X + measure(title, "tableName") + PAD_X,
		description !== undefined ? PAD_X + measure(description, "tableDesc") + PAD_X : 0,
	);
	for (const r of rowsData) {
		const nameWidth = measure(r.column.name, "colName") + (r.warning ? warnWidth : 0);
		width = Math.max(width, nameX + nameWidth + NAME_TYPE_GAP + measure(r.typeText, "colType") + PAD_X);
	}
	if (rowsData.length === 0) {
		width = Math.max(width, PAD_X + measure(EMPTY_TABLE_TEXT, "colName") + PAD_X);
	}
	width = Math.ceil(width);

	const rows = rowsData.map((r, i) => ({ ...r, y: headerHeight + i * ROW_HEIGHT }));
	const bodyRows = Math.max(rows.length, 1); // an empty table still shows one placeholder row
	return { width, height: headerHeight + bodyRows * ROW_HEIGHT, headerHeight, title, description, nameX, rows };
}
