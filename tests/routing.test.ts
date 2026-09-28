import { describe, expect, it } from "vitest";
import { chooseSides, MARGIN, nudgeRoutes, OrthoRouter, type Point, STUB } from "../src/layout/orthoRouter";
import { type EdgeSpec, RoutingModel } from "../src/layout/routingModel";
import { type Rect, SpatialGrid } from "../src/layout/spatialGrid";

const rect = (x: number, y: number, width = 100, height = 100): Rect => ({ x, y, width, height });

function isOrthogonal(pts: Point[]): boolean {
	return pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y);
}

/** True if an inner segment (stubs excluded) passes through the interior of `r`. */
function crosses(pts: Point[], r: Rect): boolean {
	for (let i = 1; i + 1 < pts.length - 1; i++) {
		const a = pts[i];
		const b = pts[i + 1];
		for (let t = 0; t <= 1; t += 0.02) {
			const x = a.x + (b.x - a.x) * t;
			const y = a.y + (b.y - a.y) * t;
			if (x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.height) return true;
		}
	}
	return false;
}

describe("SpatialGrid", () => {
	it("queries, moves and deletes rectangles", () => {
		const g = new SpatialGrid<string>(100);
		g.set("a", rect(0, 0, 50, 50));
		g.set("b", rect(500, 500, 50, 50));
		g.set("big", rect(-1000, -1000, 3000, 20));
		expect(g.query(rect(10, 10, 5, 5)).sort()).toEqual(["a"]);
		expect(g.query(rect(0, -1000, 10, 10)).sort()).toEqual(["big"]);
		g.set("a", rect(520, 520, 10, 10));
		expect(g.query(rect(10, 10, 5, 5))).toEqual([]);
		expect(g.query(rect(510, 510, 30, 30)).sort()).toEqual(["a", "b"]);
		g.delete("b");
		expect(g.query(rect(510, 510, 30, 30))).toEqual(["a"]);
		expect(g.size).toBe(2);
	});

	it("does not report rectangles that only touch the area", () => {
		const g = new SpatialGrid<string>(64);
		g.set("a", rect(0, 0, 10, 10));
		expect(g.query(rect(10, 0, 5, 5))).toEqual([]);
	});
});

describe("chooseSides", () => {
	it("uses facing sides when tables are apart and the same side when they overlap", () => {
		expect(chooseSides(rect(0, 0), rect(300, 0))).toEqual(["right", "left"]);
		expect(chooseSides(rect(300, 0), rect(0, 0))).toEqual(["left", "right"]);
		// Stacked: the side where the right/left edges are closer.
		expect(chooseSides(rect(0, 0, 100), rect(0, 300, 200))).toEqual(["left", "left"]);
		expect(chooseSides(rect(0, 0, 100), rect(-100, 300, 200))).toEqual(["right", "right"]);
	});
});

describe("OrthoRouter", () => {
	it("starts and ends on the rows with horizontal stubs", () => {
		const r = new OrthoRouter();
		r.setTable("a", rect(0, 0));
		r.setTable("b", rect(400, 200));
		const route = r.route({ table: "a", y: 40 }, { table: "b", y: 230 })!;
		expect(route[0]).toEqual({ x: 100, y: 40 });
		expect(route[1]).toEqual({ x: 100 + STUB, y: 40 });
		expect(route[route.length - 1]).toEqual({ x: 400, y: 230 });
		expect(route[route.length - 2]).toEqual({ x: 400 - STUB, y: 230 });
		expect(isOrthogonal(route)).toBe(true);
	});

	it("goes around tables in the way, keeping the margin", () => {
		const r = new OrthoRouter();
		r.setTable("a", rect(0, 0));
		r.setTable("b", rect(600, 0));
		const wall = rect(250, -200, 100, 500);
		r.setTable("wall", wall);
		const route = r.route({ table: "a", y: 50 }, { table: "b", y: 50 })!;
		expect(isOrthogonal(route)).toBe(true);
		expect(crosses(route, wall)).toBe(false);
		expect(crosses(route, { x: wall.x - MARGIN + 1, y: wall.y - MARGIN + 1, width: wall.width + 2 * MARGIN - 2, height: wall.height + 2 * MARGIN - 2 })).toBe(false);
	});

	it("uses a C shape on the same side for stacked tables", () => {
		const r = new OrthoRouter();
		r.setTable("a", rect(0, 0));
		r.setTable("b", rect(0, 300));
		const route = r.route({ table: "a", y: 50 }, { table: "b", y: 350 })!;
		expect(route[0].x).toBe(100);
		expect(route[route.length - 1].x).toBe(100);
		expect(crosses(route, rect(0, 0))).toBe(false);
		expect(crosses(route, rect(0, 300))).toBe(false);
	});

	it("fast mode never searches: may cross tables, full mode does not (enlarging the window)", () => {
		const r = new OrthoRouter();
		r.setTable("a", rect(0, 0));
		r.setTable("b", rect(600, 0));
		const wall = rect(250, -500, 100, 1100); // taller than the first search window
		r.setTable("wall", wall);
		const fast = r.route({ table: "a", y: 50 }, { table: "b", y: 50 }, "fast")!;
		const full = r.route({ table: "a", y: 50 }, { table: "b", y: 50 }, "full")!;
		expect(crosses(fast, wall)).toBe(true);
		expect(crosses(full, wall)).toBe(false);
	});

	it("returns null for unknown tables", () => {
		const r = new OrthoRouter();
		r.setTable("a", rect(0, 0));
		expect(r.route({ table: "a", y: 10 }, { table: "x", y: 10 })).toBeNull();
	});
});

describe("nudgeRoutes", () => {
	const z = (x: number, y0: number, y1: number): Point[] => [
		{ x: 0, y: y0 },
		{ x: 20, y: y0 },
		{ x, y: y0 },
		{ x, y: y1 },
		{ x: 180, y: y1 },
		{ x: 200, y: y1 },
	];

	it("separates overlapping vertical segments of different routes", () => {
		const out = nudgeRoutes(new Map([["a", z(100, 0, 100)], ["b", z(100, 50, 150)]]));
		const xa = out.get("a")![2].x;
		const xb = out.get("b")![2].x;
		expect(xa).not.toBe(xb);
		expect(Math.abs(xa - xb)).toBeLessThanOrEqual(6);
		expect(out.get("a")![3].x).toBe(xa); // segment stays vertical
	});

	it("leaves non-overlapping segments and stubs alone, and does not mutate the input", () => {
		const a = z(100, 0, 40);
		const input = new Map([["a", a], ["b", z(100, 60, 100)]]);
		const out = nudgeRoutes(input);
		expect(out.get("a")![2].x).toBe(100);
		expect(out.get("b")![2].x).toBe(100);
		expect(out.get("a")![1]).toEqual({ x: 20, y: 0 });
		expect(input.get("a")).toBe(a);
	});
});

describe("RoutingModel", () => {
	const rects = () =>
		new Map<string, Rect>([
			["clienti", rect(0, 0)],
			["ordini", rect(400, 0)],
			["righe", rect(800, 0)],
			["isolata", rect(0, 600)],
		]);
	const specs: EdgeSpec[] = [
		{ id: "o>c", fromTable: "ordini", fromRowY: 40, toTable: "clienti", toRowY: 30 },
		{ id: "r>o", fromTable: "righe", fromRowY: 40, toTable: "ordini", toRowY: 30 },
		{ id: "c>c", fromTable: "clienti", fromRowY: 60, toTable: "clienti", toRowY: 30 },
	];

	function settled(m: RoutingModel) {
		while (m.refine(1000));
		return m.finalize();
	}

	it("routes every edge, self-references included", () => {
		const m = new RoutingModel();
		m.setGraph(rects(), specs);
		const first = m.finalize();
		expect([...first.changed].sort()).toEqual(["c>c", "o>c", "r>o"]);
		expect(m.pending).toBeGreaterThan(0);
		settled(m);
		expect(m.pending).toBe(0);
		expect(m.getRoute("o>c")![0]).toEqual({ x: 400, y: 40 });
		expect(m.getRoute("c>c")![0]).toEqual({ x: 100, y: 60 });
	});

	it("keeps routes of unchanged edges when the graph is set again", () => {
		const m = new RoutingModel();
		m.setGraph(rects(), specs);
		settled(m);
		m.setGraph(rects(), specs);
		const again = settled(m);
		expect(again.changed.has("o>c")).toBe(false);
		expect(again.changed.has("r>o")).toBe(false);
	});

	it("reroutes only the edges of a moved table", () => {
		const m = new RoutingModel();
		m.setGraph(rects(), specs);
		settled(m);
		const before = m.getRoute("o>c");
		m.moveTable("righe", rect(800, 300));
		const moved = m.finalize();
		expect(moved.changed.has("r>o")).toBe(true);
		expect(moved.changed.has("o>c")).toBe(false);
		expect(m.getRoute("o>c")).toEqual(before);
		m.settle("righe");
		settled(m);
		expect(m.getRoute("r>o")![0]).toEqual({ x: 800, y: 340 });
	});

	it("reroutes edges that a moved table now covers", () => {
		const m = new RoutingModel();
		m.setGraph(rects(), specs);
		settled(m);
		const blocker = rect(150, -100, 150, 400); // across the ordini → clienti line
		m.moveTable("isolata", blocker);
		m.settle("isolata");
		settled(m);
		expect(crosses(m.getRoute("o>c")!, blocker)).toBe(false);
	});

	it("reports removed edges and forgets them", () => {
		const m = new RoutingModel();
		m.setGraph(rects(), specs);
		settled(m);
		m.setGraph(rects(), specs.filter((s) => s.id !== "r>o"));
		const changes = settled(m);
		expect([...changes.removed]).toEqual(["r>o"]);
		expect(m.getRoute("r>o")).toBeUndefined();
		expect(m.edgesOf("righe")).toEqual([]);
	});

	it("finds visible tables and edges by area", () => {
		const m = new RoutingModel();
		m.setGraph(rects(), specs);
		settled(m);
		expect(m.queryTables(rect(-10, 550, 50, 100))).toEqual(["isolata"]);
		expect(m.queryEdges(rect(-10, 550, 50, 100))).toEqual([]);
		expect(m.queryEdges(rect(700, 0, 100, 100))).toContain("r>o");
	});
});
