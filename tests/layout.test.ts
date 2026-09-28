import { describe, expect, it, vi } from "vitest";
import { defaultData } from "../src/data";
import { elkLayout, NEW_BLOCK_GAP, placeMissing, type SizedNode } from "../src/layout/elkLayout";
import { LayoutStore } from "../src/layout/layoutStore";
import type { TablePosition } from "../src/types";

function overlaps(a: SizedNode, pa: TablePosition, b: SizedNode, pb: TablePosition): boolean {
	return pa.x < pb.x + b.width && pb.x < pa.x + a.width && pa.y < pb.y + b.height && pb.y < pa.y + a.height;
}

function expectNoOverlaps(nodes: SizedNode[], pos: Map<string, TablePosition>): void {
	for (let i = 0; i < nodes.length; i++) {
		for (let j = i + 1; j < nodes.length; j++) {
			const a = nodes[i];
			const b = nodes[j];
			expect(overlaps(a, pos.get(a.id)!, b, pos.get(b.id)!), `${a.id} overlaps ${b.id}`).toBe(false);
		}
	}
}

const node = (id: string, width = 160, height = 100): SizedNode => ({ id, width, height });

describe("LayoutStore", () => {
	it("gets copies, sets rounded positions and notifies only on change", () => {
		const data = defaultData();
		const onChange = vi.fn();
		const store = new LayoutStore(data, onChange);

		expect(store.get("DB").size).toBe(0);
		store.set("DB", [["a", { x: 10.4, y: -3.6 }]]);
		expect(data.layouts.DB.tables.a).toEqual({ x: 10, y: -4 });
		expect(onChange).toHaveBeenCalledTimes(1);

		store.set("DB", [["a", { x: 10.2, y: -4.1 }]]); // same after rounding
		expect(onChange).toHaveBeenCalledTimes(1);

		const copy = store.get("DB");
		copy.get("a")!.x = 999;
		expect(data.layouts.DB.tables.a.x).toBe(10);
	});

	it("prunes positions of tables that no longer exist", () => {
		const data = defaultData();
		data.layouts.DB = { tables: { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } } };
		data.layouts.Other = { tables: { a: { x: 5, y: 5 } } };
		const onChange = vi.fn();
		const store = new LayoutStore(data, onChange);

		store.prune("DB", ["a", "c"]);
		expect(data.layouts.DB.tables).toEqual({ a: { x: 0, y: 0 } });
		expect(data.layouts.Other.tables).toEqual({ a: { x: 5, y: 5 } });
		expect(onChange).toHaveBeenCalledTimes(1);

		store.prune("DB", ["a"]);
		store.prune("Missing", []);
		expect(onChange).toHaveBeenCalledTimes(1);
	});
});

describe("elkLayout", () => {
	it("places every node without overlaps, referenced tables to the left", async () => {
		const nodes = [node("clienti"), node("ordini"), node("righe", 200, 150), node("prodotti"), node("isolata")];
		const pos = await elkLayout(nodes, [
			{ from: "ordini", to: "clienti" },
			{ from: "righe", to: "ordini" },
			{ from: "righe", to: "prodotti" },
			{ from: "clienti", to: "clienti" }, // self-reference: ignored
			{ from: "ordini", to: "fantasma" }, // unknown node: ignored
		]);
		expect([...pos.keys()].sort()).toEqual(["clienti", "isolata", "ordini", "prodotti", "righe"]);
		expectNoOverlaps(nodes, pos);
		expect(pos.get("clienti")!.x).toBeLessThan(pos.get("ordini")!.x);
		expect(pos.get("ordini")!.x).toBeLessThan(pos.get("righe")!.x);
	});

	it("returns an empty map for no nodes", async () => {
		expect((await elkLayout([], [])).size).toBe(0);
	});
});

describe("placeMissing", () => {
	it("lays out everything when nothing is saved", async () => {
		const nodes = [node("a"), node("b")];
		const pos = await placeMissing(nodes, [{ from: "b", to: "a" }], new Map());
		expect(pos.size).toBe(2);
		expectNoOverlaps(nodes, pos);
	});

	it("returns nothing when every node is saved", async () => {
		const saved = new Map([["a", { x: 0, y: 0 }]]);
		expect((await placeMissing([node("a")], [], saved)).size).toBe(0);
	});

	it("places new nodes right of the saved ones without moving them", async () => {
		const nodes = [node("a"), node("b", 300, 80), node("new1"), node("new2")];
		const saved = new Map([
			["a", { x: 0, y: 50 }],
			["b", { x: 400, y: 300 }],
		]);
		const placed = await placeMissing(nodes, [{ from: "new2", to: "new1" }], saved);
		expect([...placed.keys()].sort()).toEqual(["new1", "new2"]);
		for (const p of placed.values()) {
			expect(p.x).toBeGreaterThanOrEqual(700 + NEW_BLOCK_GAP);
			expect(p.y).toBeGreaterThanOrEqual(50);
		}
		expectNoOverlaps(nodes, new Map([...saved, ...placed]));
	});
});
