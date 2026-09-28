// SVG for one relation line and its cardinality markers.

import { type EndKind, markerShapes, nextDistinct, type Point, roundedPath } from "./edgeGeometry";

export interface EdgeDraw {
	/** Route from the FK end to the referenced end. */
	points: Point[];
	fk: EndKind;
	ref: EndKind;
}

function drawMarker(parent: SVGElement, kind: EndKind, points: Point[]): void {
	const from = nextDistinct(points);
	if (!from) return;
	for (const s of markerShapes(kind, points[0], from)) {
		if (s.type === "line") {
			parent.createSvg("line", { cls: "dba-edge-marker", attr: { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 } });
		} else {
			parent.createSvg("circle", { cls: ["dba-edge-marker", "dba-edge-marker-circle"], attr: { cx: s.cx, cy: s.cy, r: s.r } });
		}
	}
}

/** Draws one relation into `el` (emptied first). Markers are skipped when zoomed far out. */
export function drawEdge(el: SVGGElement, e: EdgeDraw, markers: boolean): void {
	el.empty();
	if (e.points.length < 2) return;
	el.createSvg("path", { cls: "dba-edge-line", attr: { d: roundedPath(e.points) } });
	if (!markers) return;
	drawMarker(el, e.fk, e.points);
	drawMarker(el, e.ref, [...e.points].reverse());
}
