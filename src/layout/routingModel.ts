// Routes of all relation lines of a diagram, kept up to date incrementally. Pure (no DOM).
//
// - Every change first gives affected edges a cheap "fast" route (direct path or fallback),
//   then queues them for a "full" route (with obstacle search), processed by `refine` within a
//   time budget, so the UI never blocks even with thousands of tables.
// - Only edges touching a changed/moved table, or crossing its new area, are rerouted.
// - `finalize` separates parallel lines and reports which drawn routes changed.

import { selfLoopRoute } from "../view/edgeGeometry";
import { ChannelNudger, OrthoRouter, type Point, type RouteMode } from "./orthoRouter";
import { type Rect, SpatialGrid } from "./spatialGrid";

export interface EdgeSpec {
	id: string;
	fromTable: string;
	/** Row centre, relative to the top of the table. */
	fromRowY: number;
	toTable: string;
	toRowY: number;
}

export interface RouteChanges {
	/** Edges whose drawn route changed (new ones included). */
	changed: Set<string>;
	/** Edges that no longer exist. */
	removed: Set<string>;
}

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const sameSpec = (a: EdgeSpec, b: EdgeSpec) =>
	a.fromTable === b.fromTable && a.toTable === b.toTable && a.fromRowY === b.fromRowY && a.toRowY === b.toRowY;
const samePoints = (a: Point[], b: Point[]) =>
	a.length === b.length && a.every((p, i) => Math.abs(p.x - b[i].x) < 0.05 && Math.abs(p.y - b[i].y) < 0.05);

/** One thin rectangle per segment (1px thick so that axis-aligned segments are never empty). */
function segmentRects(points: Point[]): Rect[] {
	const rects: Rect[] = [];
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const x = Math.min(a.x, b.x);
		const y = Math.min(a.y, b.y);
		rects.push({ x: x - 0.5, y: y - 0.5, width: Math.abs(a.x - b.x) + 1, height: Math.abs(a.y - b.y) + 1 });
	}
	return rects;
}

/** True if a segment of `points` (stubs excluded) passes through the interior of `r`. */
function crosses(points: Point[], r: Rect): boolean {
	for (let i = 1; i + 1 < points.length - 1; i++) {
		const a = points[i];
		const b = points[i + 1];
		const minX = Math.min(a.x, b.x);
		const maxX = Math.max(a.x, b.x);
		const minY = Math.min(a.y, b.y);
		const maxY = Math.max(a.y, b.y);
		if (minY === maxY) {
			if (r.y < minY && minY < r.y + r.height && maxX > r.x && minX < r.x + r.width) return true;
		} else if (r.x < minX && minX < r.x + r.width && maxY > r.y && minY < r.y + r.height) {
			return true;
		}
	}
	return false;
}

export class RoutingModel {
	private readonly router = new OrthoRouter();
	private rects = new Map<string, Rect>();
	private specs = new Map<string, EdgeSpec>();
	private byTable = new Map<string, Set<string>>();
	private loopIndex = new Map<string, number>();
	private raw = new Map<string, Point[]>();
	/** Edges waiting for a full route (insertion order = processing order). */
	private readonly queue = new Set<string>();
	private readonly drawn = new Map<string, Point[]>();
	private readonly nudger = new ChannelNudger();
	/** Raw routes changed since the last finalize, for the nudger (null = removed from it). */
	private readonly pendingRaw = new Map<string, Point[] | null>();
	/** Self-loops changed since the last finalize (drawn without nudging). */
	private readonly pendingLoops = new Set<string>();
	private readonly index = new SpatialGrid<string>(512);
	private readonly removed = new Set<string>();

	get pending(): number {
		return this.queue.size;
	}

	getRect(table: string): Rect | undefined {
		return this.rects.get(table);
	}

	allRects(): Rect[] {
		return [...this.rects.values()];
	}

	queryTables(area: Rect): string[] {
		return this.router.queryTables(area);
	}

	queryEdges(area: Rect): string[] {
		return this.index.query(area);
	}

	/** Route to draw, from the FK end to the referenced end. */
	getRoute(id: string): Point[] | undefined {
		return this.drawn.get(id);
	}

	edgesOf(table: string): string[] {
		return [...(this.byTable.get(table) ?? [])];
	}

	/**
	 * Replaces tables and edges. Edges whose ends did not move keep their route, unless a changed
	 * table now lies across it.
	 */
	setGraph(rects: Map<string, Rect>, specs: EdgeSpec[]): void {
		const changedTables = new Set<string>();
		for (const t of this.rects.keys()) {
			if (!rects.has(t)) {
				changedTables.add(t);
				this.router.deleteTable(t);
			}
		}
		for (const [t, r] of rects) {
			const old = this.rects.get(t);
			if (!old || !sameRect(old, r)) {
				changedTables.add(t);
				this.router.setTable(t, r);
			}
		}
		this.rects = new Map(rects);

		const previous = this.specs;
		this.specs = new Map(specs.map((s) => [s.id, s]));
		for (const id of previous.keys()) if (!this.specs.has(id)) this.dropEdge(id);

		this.byTable = new Map();
		this.loopIndex = new Map();
		const loopsPerTable = new Map<string, number>();
		for (const s of specs) {
			for (const t of [s.fromTable, s.toTable]) {
				let set = this.byTable.get(t);
				if (!set) this.byTable.set(t, (set = new Set()));
				set.add(s.id);
			}
			if (s.fromTable === s.toTable) {
				const i = loopsPerTable.get(s.fromTable) ?? 0;
				loopsPerTable.set(s.fromTable, i + 1);
				this.loopIndex.set(s.id, i);
			}
		}

		const crossing = new Set<string>();
		for (const t of changedTables) {
			const r = rects.get(t);
			if (r) for (const id of this.edgesThrough(r)) crossing.add(id);
		}
		for (const s of specs) {
			const old = previous.get(s.id);
			const stale =
				!old ||
				!sameSpec(old, s) ||
				!this.raw.has(s.id) ||
				changedTables.has(s.fromTable) ||
				changedTables.has(s.toTable) ||
				this.loopIndex.get(s.id) !== undefined; // loop indexes may shift: cheap to recompute
			if (stale) this.reroute(s.id, "fast");
			else if (crossing.has(s.id)) this.queue.add(s.id);
		}
	}

	/** A table moved (while dragging): its edges get fast routes right away. */
	moveTable(table: string, rect: Rect): void {
		this.rects.set(table, rect);
		this.router.setTable(table, rect);
		for (const id of this.byTable.get(table) ?? []) this.reroute(id, "fast");
	}

	/** The move ended: queue full routes for its edges and for edges now crossing it. */
	settle(table: string): void {
		const r = this.rects.get(table);
		for (const id of this.byTable.get(table) ?? []) this.queue.add(id);
		if (r) for (const id of this.edgesThrough(r)) this.queue.add(id);
	}

	/** Computes queued full routes until `budgetMs` elapses. Returns true if work remains. */
	refine(budgetMs: number): boolean {
		const end = performance.now() + budgetMs;
		for (const id of this.queue) {
			this.reroute(id, "full");
			if (performance.now() >= end) break;
		}
		return this.queue.size > 0;
	}

	/** Separates parallel lines and returns what changed since the previous call. */
	finalize(): RouteChanges {
		const affected = this.nudger.update(this.pendingRaw);
		this.pendingRaw.clear();
		for (const id of this.pendingLoops) affected.add(id);
		this.pendingLoops.clear();

		const changed = new Set<string>();
		for (const id of affected) {
			if (!this.specs.has(id)) continue;
			const pts = this.loopIndex.has(id) ? this.raw.get(id) : this.nudger.get(id);
			if (!pts) continue;
			const old = this.drawn.get(id);
			if (old && samePoints(old, pts)) continue;
			this.drawn.set(id, pts);
			this.index.set(id, segmentRects(pts));
			changed.add(id);
		}
		const removed = new Set(this.removed);
		this.removed.clear();
		return { changed, removed };
	}

	private reroute(id: string, mode: RouteMode): void {
		const s = this.specs.get(id);
		if (!s) return;
		const a = this.rects.get(s.fromTable);
		const b = this.rects.get(s.toTable);
		if (!a || !b) return;

		const loop = this.loopIndex.get(id);
		if (loop !== undefined) {
			this.raw.set(id, selfLoopRoute(a.x + a.width, a.y + s.fromRowY, a.y + s.toRowY, loop));
			this.pendingLoops.add(id);
			this.pendingRaw.set(id, null); // in case it was a regular edge before
			this.queue.delete(id);
			return;
		}
		const route = this.router.route({ table: s.fromTable, y: a.y + s.fromRowY }, { table: s.toTable, y: b.y + s.toRowY }, mode);
		if (!route) return;
		this.raw.set(id, route);
		this.pendingRaw.set(id, route);
		if (mode === "full") this.queue.delete(id);
		else this.queue.add(id);
	}

	private dropEdge(id: string): void {
		this.raw.delete(id);
		this.queue.delete(id);
		this.pendingRaw.set(id, null);
		this.pendingLoops.delete(id);
		this.drawn.delete(id);
		this.index.delete(id);
		this.removed.add(id);
	}

	/** Edges whose current route passes through `r`. */
	private edgesThrough(r: Rect): string[] {
		return this.index.query(r).filter((id) => {
			const pts = this.raw.get(id);
			return pts !== undefined && !this.loopIndex.has(id) && crosses(pts, r);
		});
	}
}
