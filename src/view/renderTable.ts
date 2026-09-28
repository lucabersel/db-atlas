// SVG for one table. Text is always set via textContent (never innerHTML).

import type { Table, TablePosition } from "../types";
import { readableTextColor, resolveCssColor } from "./color";
import { EMPTY_TABLE_TEXT, HEADER_DESC_HEIGHT, HEADER_NAME_HEIGHT, PAD_X, ROW_HEIGHT, type TableGeometry } from "./tableGeometry";

export const TABLE_RADIUS = 6;

/**
 * Level of detail, chosen from the zoom level:
 * - full: header, description, rows (clickable, tooltips);
 * - compact: header with the table name only;
 * - minimal: coloured boxes only (whole-schema overview).
 */
export type Detail = "full" | "compact" | "minimal";

function text(parent: SVGElement, cls: string | string[], x: number, y: number, content: string, anchor?: "end"): SVGTextElement {
	const el = parent.createSvg("text", { cls, attr: { x, y } });
	if (anchor) el.setAttribute("text-anchor", anchor);
	el.textContent = content;
	return el;
}

/** Rectangle with only the top corners rounded. */
function topRoundedRect(width: number, height: number, r: number): string {
	return `M0,${height}V${r}A${r},${r} 0 0 1 ${r},0H${width - r}A${r},${r} 0 0 1 ${width},${r}V${height}Z`;
}

export function renderTable(parent: SVGElement, table: Table, g: TableGeometry, pos: TablePosition, detail: Detail = "full"): SVGGElement {
	const root = parent.createSvg("g", { cls: "dba-table", attr: { "data-table": table.name } });
	root.setAttribute("transform", `translate(${pos.x},${pos.y})`);
	root.toggleClass("is-warning", table.issues.length > 0);

	// Dynamic colors go through CSS variables so styles.css keeps control of fill/stroke.
	const bg = table.color !== undefined ? resolveCssColor(table.color) : null;
	if (bg) {
		root.style.setProperty("--dba-header-bg", `rgb(${bg.r},${bg.g},${bg.b})`);
		root.style.setProperty("--dba-header-fg", readableTextColor(bg));
	}

	root.createSvg("rect", { cls: "dba-table-body", attr: { width: g.width, height: g.height, rx: TABLE_RADIUS } });

	const header = root.createSvg("g", { cls: "dba-table-header" });
	header.createSvg("path", { cls: "dba-table-header-bg", attr: { d: topRoundedRect(g.width, g.headerHeight, TABLE_RADIUS) } });
	if (detail !== "minimal") text(header, "dba-table-name", PAD_X, HEADER_NAME_HEIGHT / 2 + 2, g.title);
	if (detail !== "full") {
		root.createSvg("rect", { cls: "dba-table-border", attr: { width: g.width, height: g.height, rx: TABLE_RADIUS } });
		return root;
	}
	if (g.description !== undefined) {
		text(header, "dba-table-desc", PAD_X, HEADER_NAME_HEIGHT + HEADER_DESC_HEIGHT / 2 - 2, g.description);
	}

	const rows = root.createSvg("g", { cls: "dba-rows" });
	for (const [i, row] of g.rows.entries()) {
		const c = row.column;
		const rowEl = rows.createSvg("g", { cls: "dba-row", attr: { "data-column": c.name } });
		rowEl.toggleClass("is-error", !c.valid);
		rowEl.toggleClass("is-warning", row.warning);
		rowEl.createSvg("rect", { cls: "dba-row-bg", attr: { x: 0, y: row.y, width: g.width, height: ROW_HEIGHT } });
		if (i > 0) rowEl.createSvg("line", { cls: "dba-row-sep", attr: { x1: 0, x2: g.width, y1: row.y, y2: row.y } });

		const cy = row.y + ROW_HEIGHT / 2;
		if (row.icons) text(rowEl, "dba-col-icon", PAD_X, cy, row.icons);
		const name = text(rowEl, "dba-col-name", g.nameX, cy, c.name);
		if (row.warning) name.createSvg("tspan", { cls: "dba-col-warn" }).textContent = " ⚠️";
		text(rowEl, "dba-col-type", g.width - PAD_X, cy, row.typeText, "end");
	}
	if (g.rows.length === 0) {
		text(rows, ["dba-col-name", "dba-empty-row"], PAD_X, g.headerHeight + ROW_HEIGHT / 2, EMPTY_TABLE_TEXT);
	}

	root.createSvg("rect", { cls: "dba-table-border", attr: { width: g.width, height: g.height, rx: TABLE_RADIUS } });
	return root;
}
