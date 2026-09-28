import { describe, expect, it } from "vitest";
import { parseTable } from "../src/model/parseTable";
import { parseCanvasColor, readableTextColor } from "../src/view/color";
import {
	computeTableGeometry,
	HEADER_DESC_HEIGHT,
	HEADER_NAME_HEIGHT,
	HEADER_PAD_BOTTOM,
	INVALID_TYPE_TEXT,
	MAX_DESC_WIDTH,
	MIN_TABLE_WIDTH,
	type Measure,
	ROW_HEIGHT,
	truncate,
	WARNING_ICON,
} from "../src/view/tableGeometry";
import { clampZoom, fitTransform, MAX_ZOOM, MIN_ZOOM, unionRect, wheelZoomFactor, zoomAt } from "../src/view/viewport";

/** Monospace-like measure: 7px per character, independent of role. */
const measure: Measure = (text) => [...text].length * 7;
const json = (obj: unknown) => JSON.stringify(obj);

describe("computeTableGeometry", () => {
	it("computes header and row positions", () => {
		const t = parseTable("clienti", "DB/clienti.md", {
			table_description: "Anagrafica",
			col_id: json({ type: "int", pk: true }),
			col_nome: json({ type: "varchar(120)" }),
		});
		const g = computeTableGeometry(t, measure);
		const header = HEADER_NAME_HEIGHT + HEADER_DESC_HEIGHT + HEADER_PAD_BOTTOM;
		expect(g.headerHeight).toBe(header);
		expect(g.rows.map((r) => r.y)).toEqual([header, header + ROW_HEIGHT]);
		expect(g.height).toBe(header + 2 * ROW_HEIGHT);
		expect(g.title).toBe("clienti");
		expect(g.description).toBe("Anagrafica");
	});

	it("omits the description band when there is no description", () => {
		const g = computeTableGeometry(parseTable("a", "a.md", { col_id: json({ type: "int" }) }), measure);
		expect(g.headerHeight).toBe(HEADER_NAME_HEIGHT + HEADER_PAD_BOTTOM);
		expect(g.description).toBeUndefined();
	});

	it("uses the minimum width for short content", () => {
		const g = computeTableGeometry(parseTable("a", "a.md", { col_id: json({ type: "int" }) }), measure);
		expect(g.width).toBe(MIN_TABLE_WIDTH);
	});

	it("widens to the longest row", () => {
		const long = "x".repeat(40);
		const g = computeTableGeometry(parseTable("a", "a.md", { [`col_${long}`]: json({ type: "int" }) }), measure);
		expect(g.width).toBeGreaterThan(40 * 7 + 3 * 7);
	});

	it("sets icons and shifts names only when some column has icons", () => {
		const plain = computeTableGeometry(parseTable("a", "a.md", { col_x: json({ type: "int" }) }), measure);
		const keyed = computeTableGeometry(
			parseTable("b", "b.md", {
				col_id: json({ type: "int", pk: true, ref: "a.x" }),
				col_x: json({ type: "int" }),
			}),
			measure,
		);
		expect(keyed.rows.map((r) => r.icons)).toEqual(["🔑🔗", ""]);
		expect(keyed.nameX).toBeGreaterThan(plain.nameX);
	});

	it("marks warnings and invalid columns", () => {
		const t = parseTable("t", "t.md", {
			col_obj: { type: "int" },
			col_bad: "{nope",
		});
		const g = computeTableGeometry(t, measure);
		expect(g.rows.map((r) => [r.warning, r.typeText])).toEqual([
			[true, "int"],
			[false, INVALID_TYPE_TEXT],
		]);
	});

	it("keeps one placeholder row and a ⚠️ title for tables without columns", () => {
		const g = computeTableGeometry(parseTable("vuota", "vuota.md", {}), measure);
		expect(g.rows).toEqual([]);
		expect(g.height).toBe(g.headerHeight + ROW_HEIGHT);
		expect(g.title).toBe(`vuota ${WARNING_ICON}`);
	});

	it("truncates long descriptions", () => {
		const t = parseTable("a", "a.md", { table_description: "d".repeat(200), col_id: json({ type: "int" }) });
		const g = computeTableGeometry(t, measure);
		expect(g.description?.endsWith("…")).toBe(true);
		expect(measure(g.description ?? "", "tableDesc")).toBeLessThanOrEqual(MAX_DESC_WIDTH);
	});
});

describe("truncate", () => {
	it("returns the text unchanged when it fits", () => {
		expect(truncate("abc", 100, "tableDesc", measure)).toBe("abc");
	});

	it("cuts to the longest prefix that fits with the ellipsis", () => {
		expect(truncate("abcdefghij", 35, "tableDesc", measure)).toBe("abcd…");
	});
});

describe("viewport math", () => {
	it("clamps zoom", () => {
		expect(clampZoom(100)).toBe(MAX_ZOOM);
		expect(clampZoom(0)).toBe(MIN_ZOOM);
		expect(clampZoom(1)).toBe(1);
	});

	it("keeps the zoom anchor fixed on screen", () => {
		const t = { x: 30, y: -10, k: 1.5 };
		const anchor = { x: 200, y: 120 };
		const world = { x: (anchor.x - t.x) / t.k, y: (anchor.y - t.y) / t.k };
		const z = zoomAt(t, 1.3, anchor.x, anchor.y);
		expect(z.k).toBeCloseTo(1.95);
		expect(world.x * z.k + z.x).toBeCloseTo(anchor.x);
		expect(world.y * z.k + z.y).toBeCloseTo(anchor.y);
	});

	it("fits and centers bounds, without zooming in beyond 1", () => {
		const big = fitTransform({ x: 100, y: 50, width: 2000, height: 1000 }, 1000, 600, 0);
		expect(big.k).toBeCloseTo(0.5);
		expect(100 * big.k + big.x).toBeCloseTo(0);
		expect(50 * big.k + big.y + (1000 * big.k) / 2).toBeCloseTo(300);

		const small = fitTransform({ x: 0, y: 0, width: 100, height: 100 }, 1000, 600, 0);
		expect(small.k).toBe(1);
		expect(small.x).toBe(450);
		expect(small.y).toBe(250);
	});

	it("unions rectangles", () => {
		expect(unionRect([])).toBeNull();
		expect(
			unionRect([
				{ x: 0, y: 10, width: 50, height: 20 },
				{ x: -20, y: 40, width: 10, height: 10 },
			]),
		).toEqual({ x: -20, y: 10, width: 70, height: 40 });
	});

	it("zooms in on wheel up and out on wheel down", () => {
		expect(wheelZoomFactor(-100, 0, false)).toBeGreaterThan(1);
		expect(wheelZoomFactor(100, 0, false)).toBeLessThan(1);
		expect(wheelZoomFactor(-3, 1, false)).toBeCloseTo(wheelZoomFactor(-48, 0, false));
	});
});

describe("colors", () => {
	it("parses canvas-normalized colors", () => {
		expect(parseCanvasColor("#2e7d32")).toEqual({ r: 46, g: 125, b: 50 });
		expect(parseCanvasColor("rgba(10, 20, 30, 0.5)")).toEqual({ r: 10, g: 20, b: 30 });
		expect(parseCanvasColor("nope")).toBeNull();
	});

	it("picks a readable text color", () => {
		expect(readableTextColor({ r: 46, g: 125, b: 50 })).toBe("#ffffff");
		expect(readableTextColor({ r: 255, g: 235, b: 59 })).toBe("#000000");
		expect(readableTextColor({ r: 0, g: 0, b: 0 })).toBe("#ffffff");
		expect(readableTextColor({ r: 255, g: 255, b: 255 })).toBe("#000000");
	});
});
