import { describe, expect, it } from "vitest";
import type { Rel } from "../src/types";
import {
	BAR_DISTANCE,
	CIRCLE_DISTANCE,
	endKinds,
	FOOT_LENGTH,
	markerShapes,
	nextDistinct,
	roundedPath,
	selfLoopRoute,
	simplify,
} from "../src/view/edgeGeometry";

describe("endKinds (PROJECT.md §4.5)", () => {
	it.each<[Rel, boolean, string, string]>([
		[">", true, "many", "one"],
		[">", false, "many", "zeroOrOne"],
		["<", true, "one", "many"],
		["<", false, "one", "many"],
		["-", true, "one", "one"],
		["-", false, "one", "zeroOrOne"],
		["<>", true, "many", "many"],
		["<>", false, "many", "many"],
	])("rel %s notNull=%s → FK %s, ref %s", (rel, notNull, fk, ref) => {
		expect(endKinds(rel, notNull)).toEqual({ fk, ref });
	});
});

describe("path geometry", () => {
	it("simplifies duplicates and collinear points", () => {
		expect(
			simplify([
				{ x: 0, y: 0 },
				{ x: 0, y: 0 },
				{ x: 5, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
			]),
		).toEqual([
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
		]);
	});

	it("rounds corners, clamping the radius on short segments", () => {
		expect(roundedPath([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }], 6)).toBe("M0,0L14,0Q20,0 20,6L20,20");
		expect(roundedPath([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 20 }], 6)).toBe("M0,0L2,0Q4,0 4,2L4,20");
		expect(roundedPath([{ x: 1, y: 2 }, { x: 5, y: 2 }])).toBe("M1,2L5,2");
		expect(roundedPath([])).toBe("");
	});

	it("builds self loops on the right side, spaced by index", () => {
		const a = selfLoopRoute(100, 40, 80, 0);
		const b = selfLoopRoute(100, 40, 80, 1);
		expect(a[0]).toEqual({ x: 100, y: 40 });
		expect(a[3]).toEqual({ x: 100, y: 80 });
		expect(a[1].x).toBeGreaterThan(100);
		expect(b[1].x).toBeGreaterThan(a[1].x);
		const same = selfLoopRoute(100, 50, 50, 0);
		expect(same[0].y).not.toBe(same[3].y);
	});

	it("finds the next distinct point", () => {
		expect(nextDistinct([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 3, y: 0 }])).toEqual({ x: 3, y: 0 });
		expect(nextDistinct([{ x: 0, y: 0 }])).toBeNull();
	});
});

describe("markerShapes", () => {
	// Line leaves the table border at (100, 50) going right.
	const end = { x: 100, y: 50 };
	const from = { x: 200, y: 50 };

	it("draws a crow's foot with the joint away from the table", () => {
		const s = markerShapes("many", end, from);
		expect(s).toHaveLength(3);
		for (const l of s) {
			if (l.type !== "line") throw new Error("expected lines");
			expect(l.x1).toBe(100 + FOOT_LENGTH);
			expect(l.y1).toBe(50);
			expect(l.x2).toBe(100);
		}
		const ys = s.map((l) => (l.type === "line" ? l.y2 : NaN)).sort((a, b) => a - b);
		expect(ys[0]).toBeLessThan(50);
		expect(ys[2]).toBeGreaterThan(50);
	});

	it("draws a perpendicular bar for one", () => {
		const [bar] = markerShapes("one", end, from);
		expect(bar).toMatchObject({ type: "line", x1: 100 + BAR_DISTANCE, x2: 100 + BAR_DISTANCE });
	});

	it("draws a circle for zero-or-one", () => {
		const [c] = markerShapes("zeroOrOne", end, from);
		expect(c).toMatchObject({ type: "circle", cx: 100 + CIRCLE_DISTANCE, cy: 50 });
	});

	it("follows the direction of the last segment", () => {
		const [bar] = markerShapes("one", { x: 0, y: 0 }, { x: 0, y: -40 }); // leaving upwards
		expect(bar).toMatchObject({ type: "line", y1: -BAR_DISTANCE, y2: -BAR_DISTANCE });
		expect(markerShapes("one", end, end)).toEqual([]);
	});
});
