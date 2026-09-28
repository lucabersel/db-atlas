// Relation lines: rounded paths, self-loops and crow's foot markers. Pure.

import type { Rel } from "../types";

export interface Point {
	x: number;
	y: number;
}

export type EndKind = "many" | "one" | "zeroOrOne";

export type MarkerShape =
	| { type: "line"; x1: number; y1: number; x2: number; y2: number }
	| { type: "circle"; cx: number; cy: number; r: number };

export const CORNER_RADIUS = 6;
export const SELF_LOOP_OFFSET = 24;
export const SELF_LOOP_STEP = 10;
/** Crow's foot: distance of the joint from the table and half spread at the table. */
export const FOOT_LENGTH = 12;
export const FOOT_SPREAD = 6;
export const BAR_DISTANCE = 10;
export const BAR_HALF = 6;
export const CIRCLE_DISTANCE = 12;
export const CIRCLE_RADIUS = 4;

/** Symbols at the FK end and at the referenced end (PROJECT.md §4.5). */
export function endKinds(rel: Rel, fkNotNull: boolean): { fk: EndKind; ref: EndKind } {
	const refOne: EndKind = fkNotNull ? "one" : "zeroOrOne";
	switch (rel) {
		case ">":
			return { fk: "many", ref: refOne };
		case "<":
			return { fk: "one", ref: "many" };
		case "-":
			return { fk: "one", ref: refOne };
		case "<>":
			return { fk: "many", ref: "many" };
	}
}

/** Drops consecutive duplicates and collinear middle points. */
export function simplify(points: Point[]): Point[] {
	const out: Point[] = [];
	for (const p of points) {
		const last = out[out.length - 1];
		if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
		out.push(p);
		while (out.length >= 3) {
			const [a, b, c] = out.slice(-3);
			const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
			if (Math.abs(cross) > 0.01) break;
			out.splice(out.length - 2, 1);
		}
	}
	return out;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** SVG path through the points with corners rounded by `radius` (clamped to half of each segment). */
export function roundedPath(points: Point[], radius = CORNER_RADIUS): string {
	const pts = simplify(points);
	if (pts.length === 0) return "";
	let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`;
	for (let i = 1; i < pts.length - 1; i++) {
		const prev = pts[i - 1];
		const cur = pts[i];
		const next = pts[i + 1];
		const lenIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
		const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y);
		const r = Math.min(radius, lenIn / 2, lenOut / 2);
		const a = { x: cur.x - ((cur.x - prev.x) / lenIn) * r, y: cur.y - ((cur.y - prev.y) / lenIn) * r };
		const b = { x: cur.x + ((next.x - cur.x) / lenOut) * r, y: cur.y + ((next.y - cur.y) / lenOut) * r };
		d += `L${fmt(a.x)},${fmt(a.y)}Q${fmt(cur.x)},${fmt(cur.y)} ${fmt(b.x)},${fmt(b.y)}`;
	}
	const last = pts[pts.length - 1];
	if (pts.length > 1) d += `L${fmt(last.x)},${fmt(last.y)}`;
	return d;
}

/**
 * Loop on the right side of a table from row y1 to row y2 (absolute coordinates).
 * `index` separates several self-references of the same table.
 */
export function selfLoopRoute(tableRight: number, y1: number, y2: number, index: number): Point[] {
	const x = tableRight + SELF_LOOP_OFFSET + index * SELF_LOOP_STEP;
	if (Math.abs(y1 - y2) < 1) {
		// Column referencing itself: open the loop a little so it stays visible.
		y1 -= 4;
		y2 += 4;
	}
	return [
		{ x: tableRight, y: y1 },
		{ x, y: y1 },
		{ x, y: y2 },
		{ x: tableRight, y: y2 },
	];
}

/**
 * Marker at an end of a route. `end` is the point on the table border, `from` the next distinct
 * point along the route (defines the direction the line leaves the table).
 */
export function markerShapes(kind: EndKind, end: Point, from: Point): MarkerShape[] {
	const len = Math.hypot(from.x - end.x, from.y - end.y);
	if (len === 0) return [];
	const u = { x: (from.x - end.x) / len, y: (from.y - end.y) / len }; // away from the table
	const n = { x: -u.y, y: u.x };
	const at = (along: number, across: number) => ({ x: end.x + u.x * along + n.x * across, y: end.y + u.y * along + n.y * across });
	const line = (a: Point, b: Point): MarkerShape => ({ type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y });

	switch (kind) {
		case "many": {
			const joint = at(FOOT_LENGTH, 0);
			return [line(joint, at(0, FOOT_SPREAD)), line(joint, at(0, 0)), line(joint, at(0, -FOOT_SPREAD))];
		}
		case "one":
			return [line(at(BAR_DISTANCE, BAR_HALF), at(BAR_DISTANCE, -BAR_HALF))];
		case "zeroOrOne": {
			const c = at(CIRCLE_DISTANCE, 0);
			return [{ type: "circle", cx: c.x, cy: c.y, r: CIRCLE_RADIUS }];
		}
	}
}

/** First point of `points` (after index 0) that differs from the first one, or null. */
export function nextDistinct(points: Point[]): Point | null {
	const p0 = points[0];
	for (let i = 1; i < points.length; i++) {
		if (Math.hypot(points[i].x - p0.x, points[i].y - p0.y) > 0.01) return points[i];
	}
	return null;
}
