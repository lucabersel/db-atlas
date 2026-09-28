// Orthogonal routing of relation lines between table rows. Pure.
//
// Designed for thousands of tables: each edge is routed independently using only the tables near it
// (spatial index), so dragging a table only reroutes that table's edges.
//   1. pick sides (right→left when tables are apart horizontally, same side when they overlap);
//   2. leave/enter each table with a horizontal stub (room for the cardinality markers);
//   3. try a direct Z/C shaped path; if it hits a table, run A* on a sparse grid made of the
//      borders of nearby tables (inflated by MARGIN), with a bend penalty and an expansion cap;
//   4. separate overlapping parallel segments afterwards (`nudgeRoutes`).

import { type Rect, SpatialGrid } from "./spatialGrid";

export interface Point {
	x: number;
	y: number;
}

export type Side = "left" | "right";

export interface EdgeEnd {
	table: string;
	/** Absolute y of the row centre. */
	y: number;
}

/** Length of the horizontal stub at each end (must fit the cardinality markers). */
export const STUB = 20;
/** Clearance kept between lines and tables. Must be smaller than STUB. */
export const MARGIN = 14;
export const BEND_PENALTY = 40;
export const MAX_EXPANSIONS = 6000;
/** Weighted A*: slightly longer paths, far fewer expansions. */
const HEURISTIC_WEIGHT = 1.3;
/** Search window around the two ends, enlarged once if the first one has no path at all. */
const WINDOW_PADS = [240, 960];
/** Cell size of the per-search obstacle index. */
const LOCAL_CELL = 96;

/**
 * - `full`: direct path, else A* search, else fallback.
 * - `fast`: direct path, else fallback (no search). Used while dragging.
 */
export type RouteMode = "full" | "fast";
/** Spacing between nudged parallel segments. */
export const NUDGE_SPACING = 6;

const RIGHT = 0;
const LEFT = 1;
const DOWN = 2;
const UP = 3;
const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

function inflate(r: Rect, m: number): Rect {
	return { x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m };
}

/** Sides used to leave `a` and to enter `b`. */
export function chooseSides(a: Rect, b: Rect): [Side, Side] {
	if (a.x + a.width + 2 * STUB <= b.x) return ["right", "left"];
	if (b.x + b.width + 2 * STUB <= a.x) return ["left", "right"];
	// Horizontally overlapping (e.g. stacked): go around on the side with the smaller detour.
	const costRight = Math.abs(a.x + a.width - (b.x + b.width));
	const costLeft = Math.abs(a.x - b.x);
	return costRight <= costLeft ? ["right", "right"] : ["left", "left"];
}

/** Drops consecutive duplicates and collinear middle points. */
export function simplifyPath(points: Point[]): Point[] {
	const out: Point[] = [];
	for (const p of points) {
		const last = out[out.length - 1];
		if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
		out.push(p);
		while (out.length >= 3) {
			const [a, b, c] = out.slice(-3);
			if (!((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y))) break;
			out.splice(out.length - 2, 1);
		}
	}
	return out;
}

/** Minimal binary heap keyed by number. */
class MinHeap {
	private keys: number[] = [];
	private values: number[] = [];

	get size(): number {
		return this.keys.length;
	}

	push(key: number, value: number): void {
		const k = this.keys;
		const v = this.values;
		let i = k.length;
		k.push(key);
		v.push(value);
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (k[p] <= key) break;
			k[i] = k[p];
			v[i] = v[p];
			i = p;
		}
		k[i] = key;
		v[i] = value;
	}

	pop(): number {
		const k = this.keys;
		const v = this.values;
		const top = v[0];
		const lastK = k.pop() as number;
		const lastV = v.pop() as number;
		if (k.length > 0) {
			let i = 0;
			for (;;) {
				const l = 2 * i + 1;
				if (l >= k.length) break;
				const r = l + 1;
				const c = r < k.length && k[r] < k[l] ? r : l;
				if (k[c] >= lastK) break;
				k[i] = k[c];
				v[i] = v[c];
				i = c;
			}
			k[i] = lastK;
			v[i] = lastV;
		}
		return top;
	}
}

export class OrthoRouter {
	private readonly tables = new SpatialGrid<string>(256);

	setTable(id: string, rect: Rect): void {
		this.tables.set(id, rect);
	}

	deleteTable(id: string): void {
		this.tables.delete(id);
	}

	clear(): void {
		this.tables.clear();
	}

	getTable(id: string): Rect | undefined {
		return this.tables.get(id);
	}

	queryTables(area: Rect): string[] {
		return this.tables.query(area);
	}

	/**
	 * Route from the FK row to the referenced row. Returns
	 * `[P0, S0, ..., S1, P1]`: P = points on the table borders, S = ends of the stubs.
	 * Null if a table is unknown. Self-references are not handled here.
	 */
	route(from: EdgeEnd, to: EdgeEnd, mode: RouteMode = "full"): Point[] | null {
		const a = this.tables.get(from.table);
		const b = this.tables.get(to.table);
		if (!a || !b) return null;

		const [sideA, sideB] = chooseSides(a, b);
		const dirA = sideA === "right" ? 1 : -1;
		const dirB = sideB === "right" ? 1 : -1;
		const p0 = { x: sideA === "right" ? a.x + a.width : a.x, y: from.y };
		const p1 = { x: sideB === "right" ? b.x + b.width : b.x, y: to.y };
		const s0 = { x: p0.x + dirA * STUB, y: p0.y };
		const s1 = { x: p1.x + dirB * STUB, y: p1.y };

		const middle =
			this.directPath(s0, s1, sideA, sideB) ??
			(mode === "full" ? this.searchPath(s0, s1, sideA, sideB) : null) ??
			this.fallbackPath(s0, s1, sideA, sideB);
		return [p0, ...simplifyPath(middle), p1];
	}

	// ---------- Obstacle checks ----------

	/** True if the axis-aligned segment passes through the interior of an inflated table. */
	private segmentBlocked(a: Point, b: Point): boolean {
		const minX = Math.min(a.x, b.x);
		const maxX = Math.max(a.x, b.x);
		const minY = Math.min(a.y, b.y);
		const maxY = Math.max(a.y, b.y);
		const area = { x: minX - MARGIN, y: minY - MARGIN, width: maxX - minX + 2 * MARGIN, height: maxY - minY + 2 * MARGIN };
		for (const id of this.tables.query(area)) {
			const r = inflate(this.tables.get(id) as Rect, MARGIN);
			if (minY === maxY) {
				if (r.y < minY && minY < r.y + r.height && Math.min(maxX, r.x + r.width) - Math.max(minX, r.x) > 0.01) return true;
			} else if (r.x < minX && minX < r.x + r.width && Math.min(maxY, r.y + r.height) - Math.max(minY, r.y) > 0.01) {
				return true;
			}
		}
		return false;
	}

	private pathBlocked(points: Point[]): boolean {
		for (let i = 1; i < points.length; i++) if (this.segmentBlocked(points[i - 1], points[i])) return true;
		return false;
	}

	// ---------- Direct Z / C paths ----------

	private directPath(s0: Point, s1: Point, sideA: Side, sideB: Side): Point[] | null {
		const candidates: Point[][] = [];
		if (sideA !== sideB) {
			// Z: horizontal, vertical channel, horizontal. Try the middle first, then near each end.
			const lo = Math.min(s0.x, s1.x);
			const hi = Math.max(s0.x, s1.x);
			for (const xc of [(s0.x + s1.x) / 2, lo + (hi - lo) / 4, lo + (3 * (hi - lo)) / 4, s0.x, s1.x]) {
				candidates.push([s0, { x: xc, y: s0.y }, { x: xc, y: s1.y }, s1]);
			}
		} else {
			// C: out, along the outer side, back in.
			const xm = sideA === "right" ? Math.max(s0.x, s1.x) : Math.min(s0.x, s1.x);
			candidates.push([s0, { x: xm, y: s0.y }, { x: xm, y: s1.y }, s1]);
		}
		for (const c of candidates) if (!this.pathBlocked(c)) return c;
		return null;
	}

	/** Used only when no path is found: ignores obstacles. */
	private fallbackPath(s0: Point, s1: Point, sideA: Side, sideB: Side): Point[] {
		const xm = sideA !== sideB ? (s0.x + s1.x) / 2 : sideA === "right" ? Math.max(s0.x, s1.x) : Math.min(s0.x, s1.x);
		return [s0, { x: xm, y: s0.y }, { x: xm, y: s1.y }, s1];
	}

	// ---------- A* on a sparse orthogonal grid ----------

	private searchPath(s0: Point, s1: Point, sideA: Side, sideB: Side): Point[] | null {
		for (const pad of WINDOW_PADS) {
			const result = this.searchInWindow(s0, s1, sideA, sideB, pad);
			if (result !== "exhausted") return result; // a path, or null when the expansion cap was hit
		}
		return null;
	}

	/** A path, `null` if the expansion cap was reached, "exhausted" if the window has no path. */
	private searchInWindow(s0: Point, s1: Point, sideA: Side, sideB: Side, pad: number): Point[] | null | "exhausted" {
		const area = {
			x: Math.min(s0.x, s1.x) - pad,
			y: Math.min(s0.y, s1.y) - pad,
			width: Math.abs(s0.x - s1.x) + 2 * pad,
			height: Math.abs(s0.y - s1.y) + 2 * pad,
		};
		const obstacles = this.tables.query(area).map((id) => inflate(this.tables.get(id) as Rect, MARGIN));

		const xsSet = new Set([s0.x, s1.x, area.x, area.x + area.width]);
		const ysSet = new Set([s0.y, s1.y, area.y, area.y + area.height]);
		for (const o of obstacles) {
			xsSet.add(o.x);
			xsSet.add(o.x + o.width);
			ysSet.add(o.y);
			ysSet.add(o.y + o.height);
		}
		const inWindowX = (v: number) => v >= area.x && v <= area.x + area.width;
		const inWindowY = (v: number) => v >= area.y && v <= area.y + area.height;
		const xs = [...xsSet].filter(inWindowX).sort((p, q) => p - q);
		const ys = [...ysSet].filter(inWindowY).sort((p, q) => p - q);
		const nx = xs.length;
		const ny = ys.length;
		const xi0 = xs.indexOf(s0.x);
		const yi0 = ys.indexOf(s0.y);
		const xi1 = xs.indexOf(s1.x);
		const yi1 = ys.indexOf(s1.y);

		// Local cell index of the inflated obstacles: point queries in O(1).
		const cells = new Map<number, Rect[]>();
		const cellKey = (cx: number, cy: number) => cx * 73856093 + cy;
		for (const o of obstacles) {
			for (let cx = Math.floor(o.x / LOCAL_CELL); cx <= Math.floor((o.x + o.width) / LOCAL_CELL); cx++) {
				for (let cy = Math.floor(o.y / LOCAL_CELL); cy <= Math.floor((o.y + o.height) / LOCAL_CELL); cy++) {
					const key = cellKey(cx, cy);
					let list = cells.get(key);
					if (!list) cells.set(key, (list = []));
					list.push(o);
				}
			}
		}
		// Obstacle borders are grid lines, so a segment between adjacent lines is blocked
		// exactly when its midpoint is strictly inside an obstacle.
		const inside = (x: number, y: number) => {
			const list = cells.get(cellKey(Math.floor(x / LOCAL_CELL), Math.floor(y / LOCAL_CELL)));
			return list !== undefined && list.some((o) => o.x < x && x < o.x + o.width && o.y < y && y < o.y + o.height);
		};
		const blockedCache = new Map<number, boolean>();
		const stepBlocked = (xi: number, yi: number, dir: number): boolean => {
			const key = (yi * nx + xi) * 4 + dir;
			let blocked = blockedCache.get(key);
			if (blocked === undefined) {
				const nxi = xi + DX[dir];
				const nyi = yi + DY[dir];
				blocked = inside((xs[xi] + xs[nxi]) / 2, (ys[yi] + ys[nyi]) / 2);
				blockedCache.set(key, blocked);
			}
			return blocked;
		};

		const startDir = sideA === "right" ? RIGHT : LEFT;
		const finalDir = sideB === "right" ? LEFT : RIGHT; // direction of the S1 → P1 stub
		const opposite = [LEFT, RIGHT, UP, DOWN];
		const stateOf = (xi: number, yi: number, dir: number) => (yi * nx + xi) * 4 + dir;
		const h = (xi: number, yi: number) => HEURISTIC_WEIGHT * (Math.abs(xs[xi] - s1.x) + Math.abs(ys[yi] - s1.y));

		const g = new Map<number, number>();
		const parent = new Map<number, number>();
		const heap = new MinHeap();
		const start = stateOf(xi0, yi0, startDir);
		g.set(start, 0);
		heap.push(h(xi0, yi0), start);

		let expansions = 0;
		let goal = -1;
		while (heap.size > 0) {
			if (expansions++ >= MAX_EXPANSIONS) return null;
			const state = heap.pop();
			const dir = state & 3;
			const cell = state >> 2;
			const xi = cell % nx;
			const yi = (cell - xi) / nx;
			const cost = g.get(state) as number;
			if (xi === xi1 && yi === yi1) {
				goal = state;
				break;
			}
			for (let nd = 0; nd < 4; nd++) {
				if (nd === opposite[dir]) continue;
				const nxi = xi + DX[nd];
				const nyi = yi + DY[nd];
				if (nxi < 0 || nyi < 0 || nxi >= nx || nyi >= ny) continue;
				if (stepBlocked(xi, yi, nd)) continue;
				let ncost = cost + Math.abs(xs[nxi] - xs[xi]) + Math.abs(ys[nyi] - ys[yi]) + (nd !== dir ? BEND_PENALTY : 0);
				if (nxi === xi1 && nyi === yi1 && nd !== finalDir) ncost += BEND_PENALTY;
				const next = stateOf(nxi, nyi, nd);
				const old = g.get(next);
				if (old !== undefined && old <= ncost) continue;
				g.set(next, ncost);
				parent.set(next, state);
				heap.push(ncost + h(nxi, nyi), next);
			}
		}
		if (goal < 0) return "exhausted";

		const points: Point[] = [];
		for (let s: number | undefined = goal; s !== undefined; s = parent.get(s)) {
			const cell = s >> 2;
			const xi = cell % nx;
			points.push({ x: xs[xi], y: ys[(cell - xi) / nx] });
		}
		return points.reverse();
	}
}

// ---------- Separation of parallel segments ----------

interface Segment {
	route: string;
	/** Index of the first point of the segment. */
	index: number;
	/** Channel: "v<2x>" for vertical segments, "h<2y>" for horizontal ones. */
	channel: string;
	axis: "x" | "y";
	/** Shared coordinate (x for vertical, y for horizontal). */
	at: number;
	lo: number;
	hi: number;
}

/** Inner segments that may be moved: never the stubs (points 0,1 and n-2,n-1) or the segments touching them. */
function movableSegments(id: string, pts: Point[]): Segment[] {
	const segs: Segment[] = [];
	for (let i = 2; i + 1 <= pts.length - 3; i++) {
		const a = pts[i];
		const b = pts[i + 1];
		if (a.x === b.x && a.y !== b.y) {
			segs.push({ route: id, index: i, channel: `v${Math.round(a.x * 2)}`, axis: "x", at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
		} else if (a.y === b.y && a.x !== b.x) {
			segs.push({ route: id, index: i, channel: `h${Math.round(a.y * 2)}`, axis: "y", at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
		}
	}
	return segs;
}

/**
 * Spreads apart overlapping collinear segments of different routes, incrementally: segments are
 * grouped by channel (same x for vertical, same y for horizontal) and only channels touched by
 * changed routes are recomputed.
 */
export class ChannelNudger {
	private readonly raw = new Map<string, Point[]>();
	private readonly segments = new Map<string, Segment[]>();
	private readonly channels = new Map<string, Set<Segment>>();
	/** Offset of each moved segment, by route then segment index. */
	private readonly offsets = new Map<string, Map<number, number>>();

	constructor(
		private readonly spacing = NUDGE_SPACING,
		private readonly maxSpread = 2 * MARGIN - 4,
	) {}

	/**
	 * Applies new raw routes (`null` = removed). Returns the routes whose nudged points may have
	 * changed: the updated ones and those sharing a channel with them.
	 */
	update(changes: Map<string, Point[] | null>): Set<string> {
		const dirty = new Set<string>();
		const affected = new Set<string>();
		for (const [id, pts] of changes) {
			affected.add(id);
			for (const s of this.segments.get(id) ?? []) {
				this.channels.get(s.channel)?.delete(s);
				dirty.add(s.channel);
			}
			this.segments.delete(id);
			this.offsets.delete(id);
			if (!pts) {
				this.raw.delete(id);
				continue;
			}
			this.raw.set(id, pts);
			const segs = movableSegments(id, pts);
			this.segments.set(id, segs);
			for (const s of segs) {
				let set = this.channels.get(s.channel);
				if (!set) this.channels.set(s.channel, (set = new Set()));
				set.add(s);
				dirty.add(s.channel);
			}
		}
		for (const channel of dirty) {
			const set = this.channels.get(channel);
			if (!set || set.size === 0) {
				this.channels.delete(channel);
				continue;
			}
			for (const s of set) affected.add(s.route);
			this.spreadChannel([...set]);
		}
		return affected;
	}

	/** Route with the offsets applied (new array), or undefined if unknown. */
	get(id: string): Point[] | undefined {
		const pts = this.raw.get(id);
		if (!pts) return undefined;
		const out = pts.map((p) => ({ ...p }));
		const offsets = this.offsets.get(id);
		if (offsets) {
			for (const s of this.segments.get(id) ?? []) {
				const o = offsets.get(s.index);
				if (!o) continue;
				out[s.index][s.axis] = s.at + o;
				out[s.index + 1][s.axis] = s.at + o;
			}
		}
		return out;
	}

	private setOffset(s: Segment, offset: number): void {
		let m = this.offsets.get(s.route);
		if (!m) this.offsets.set(s.route, (m = new Map()));
		if (offset === 0) m.delete(s.index);
		else m.set(s.index, offset);
	}

	private spreadChannel(segs: Segment[]): void {
		segs.sort((p, q) => p.lo - q.lo || p.hi - q.hi || (p.route < q.route ? -1 : p.route > q.route ? 1 : 0));
		// Clusters of overlapping intervals.
		let cluster: Segment[] = [];
		let clusterHi = -Infinity;
		const flush = () => {
			const routes = new Set(cluster.map((s) => s.route));
			const m = cluster.length;
			const step = routes.size > 1 ? Math.min(this.spacing, this.maxSpread / (m - 1)) : 0;
			cluster.forEach((s, j) => this.setOffset(s, (j - (m - 1) / 2) * step));
			cluster = [];
			clusterHi = -Infinity;
		};
		for (const s of segs) {
			if (cluster.length > 0 && s.lo >= clusterHi - 0.01) flush();
			cluster.push(s);
			clusterHi = Math.max(clusterHi, s.hi);
		}
		flush();
	}
}

/** One-shot separation of parallel segments (see ChannelNudger). The input is not modified. */
export function nudgeRoutes(routes: Map<string, Point[]>, spacing = NUDGE_SPACING, maxSpread = 2 * MARGIN - 4): Map<string, Point[]> {
	const nudger = new ChannelNudger(spacing, maxSpread);
	nudger.update(new Map(routes));
	return new Map([...routes.keys()].map((id) => [id, nudger.get(id) as Point[]]));
}
