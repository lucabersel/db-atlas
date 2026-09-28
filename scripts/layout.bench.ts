// Timing of the diagram pipeline on generated schemas (Node, real ELK + RoutingModel).
// Usage: npm run bench            (sizes: BENCH_SIZES=100,1000 npm run bench)

import { it } from "vitest";
import { placeMissing } from "../src/layout/elkLayout";
import type { Point } from "../src/layout/orthoRouter";
import { type EdgeSpec, RoutingModel } from "../src/layout/routingModel";
import type { Rect } from "../src/layout/spatialGrid";
import { buildSchema } from "../src/model/buildSchema";
import { parseTable } from "../src/model/parseTable";
import { computeTableGeometry, type Measure, ROW_HEIGHT } from "../src/view/tableGeometry";
import { generateSchema } from "./perfSchema.mjs";

const measure: Measure = (text) => [...text].length * 7;

function crossesAny(pts: Point[], rects: Rect[]): boolean {
	for (let i = 1; i + 1 < pts.length - 1; i++) {
		const a = pts[i];
		const b = pts[i + 1];
		const minX = Math.min(a.x, b.x);
		const maxX = Math.max(a.x, b.x);
		const minY = Math.min(a.y, b.y);
		const maxY = Math.max(a.y, b.y);
		for (const r of rects) {
			const hit =
				minY === maxY
					? r.y < minY && minY < r.y + r.height && maxX > r.x && minX < r.x + r.width
					: r.x < minX && minX < r.x + r.width && maxY > r.y && minY < r.y + r.height;
			if (hit) return true;
		}
	}
	return false;
}

async function run(count: number): Promise<void> {
	const t0 = performance.now();
	const schema = buildSchema("Perf", generateSchema(count).map((t) => parseTable(t.name, `Perf/${t.name}.md`, t.frontmatter)));
	const geometries = new Map(schema.tables.map((t) => [t.name, computeTableGeometry(t, measure)]));
	const t1 = performance.now();

	const nodes = schema.tables.map((t) => ({ id: t.name, width: geometries.get(t.name)!.width, height: geometries.get(t.name)!.height }));
	const positions = await placeMissing(nodes, schema.relations.map((r) => ({ from: r.fromTable, to: r.toTable })), new Map());
	const t2 = performance.now();

	const rects = new Map<string, Rect>(nodes.map((n) => [n.id, { ...positions.get(n.id)!, width: n.width, height: n.height }]));
	const rowY = (table: string, column: string) => {
		const row = geometries.get(table)!.rows.find((r) => r.column.name === column)!;
		return row.y + ROW_HEIGHT / 2;
	};
	const specs: EdgeSpec[] = schema.relations.map((r) => ({
		id: `${r.fromTable}.${r.fromColumn}>${r.toTable}.${r.toColumn}`,
		fromTable: r.fromTable,
		fromRowY: rowY(r.fromTable, r.fromColumn),
		toTable: r.toTable,
		toRowY: rowY(r.toTable, r.toColumn),
	}));

	// First paint: fast routes for everything.
	const model = new RoutingModel();
	model.setGraph(rects, specs);
	model.finalize();
	const t3 = performance.now();
	// Background refinement (done in 8 ms slices by the view).
	while (model.refine(1000));
	model.finalize();
	const t4 = performance.now();

	// Drag of the most connected table: 20 frames, then drop.
	const degree = new Map<string, number>();
	for (const s of specs) for (const t of [s.fromTable, s.toTable]) degree.set(t, (degree.get(t) ?? 0) + 1);
	const busiest = [...degree].sort((a, b) => b[1] - a[1])[0][0];
	const start = rects.get(busiest)!;
	// Drag towards a free area right of the diagram (a table dropped onto another one cannot be avoided).
	const right = Math.max(...[...rects.values()].map((r) => r.x + r.width));
	const target = { x: right + 400, y: start.y };
	const frames: number[] = [];
	const finalizeMs: number[] = [];
	for (let k = 1; k <= 20; k++) {
		const f0 = performance.now();
		model.moveTable(busiest, { ...start, x: start.x + ((target.x - start.x) * k) / 20, y: start.y });
		const m1 = performance.now();
		model.finalize();
		finalizeMs.push(performance.now() - m1);
		frames.push(performance.now() - f0);
	}
	const d0 = performance.now();
	model.settle(busiest);
	while (model.refine(1000));
	model.finalize();
	const dropMs = performance.now() - d0;

	const allRects = [...rects.values()];
	allRects[nodes.findIndex((n) => n.id === busiest)] = { ...start, x: target.x, y: target.y };
	let crossing = 0;
	for (const s of specs) if (s.fromTable !== s.toTable && crossesAny(model.getRoute(s.id)!, allRects)) crossing++;

	const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
	const fmt = (ms: number) => `${Math.round(ms)} ms`.padStart(8);
	console.log(
		`${String(count).padStart(4)} tables, ${String(specs.length).padStart(4)} edges |` +
			` parse+geom ${fmt(t1 - t0)} | ELK ${fmt(t2 - t1)} | first paint routes ${fmt(t3 - t2)} | refine ${fmt(t4 - t3)} |` +
			` drag frame avg ${fmt(avg)} (finalize ${fmt(finalizeMs.reduce((a, b) => a + b, 0) / finalizeMs.length)}) max ${fmt(Math.max(...frames))} (degree ${degree.get(busiest)}) | drop ${fmt(dropMs)} |` +
			` crossing ${crossing}/${specs.length}`,
	);
}

it("pipeline timings", async () => {
	for (const count of (process.env.BENCH_SIZES ?? "100,250,500,1000,2000").split(",").map(Number)) await run(count);
}, 600_000);
