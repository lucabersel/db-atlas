// SVG diagram: draws a Schema, owns the viewport and table dragging.
//
// Built for thousands of tables:
// - only tables and lines intersecting the viewport are in the DOM (culling via spatial indexes);
// - the level of detail follows the zoom (rows only when readable);
// - schema updates re-render only tables whose content or position changed;
// - relation routes are maintained incrementally by RoutingModel and refined a few ms per frame.

import { type LayoutEdge, placeMissing, type SizedNode } from "../layout/elkLayout";
import type { LayoutStore } from "../layout/layoutStore";
import { type EdgeSpec, type RouteChanges, RoutingModel } from "../layout/routingModel";
import type { Rect } from "../layout/spatialGrid";
import { t } from "../i18n";
import type { Column, Schema, Table, TablePosition } from "../types";
import { type EndKind, endKinds } from "./edgeGeometry";
import { DiagramInteractions } from "./interactions";
import { TextMeasurer } from "./measure";
import { drawEdge } from "./renderEdges";
import { type Detail, renderTable } from "./renderTable";
import { computeTableGeometry, ROW_HEIGHT, type TableGeometry } from "./tableGeometry";
import { BUTTON_ZOOM_FACTOR, DRAG_THRESHOLD, type Transform, unionRect, Viewport } from "./viewport";

const HEADER_SELECTOR = ".dba-table-header";
/** Zoom thresholds for the level of detail. */
const FULL_DETAIL_ZOOM = 0.45;
const COMPACT_DETAIL_ZOOM = 0.12;
/** Below this zoom the dotted background is hidden (too dense to be useful). */
const GRID_MIN_ZOOM = 0.3;
/** Extra area rendered around the viewport, in screen pixels. */
const CULL_MARGIN_PX = 200;
/** Time spent refining routes per animation frame. */
const REFINE_BUDGET_MS = 8;
/** Show the "laying out" indicator when at least this many tables need a position. */
const BUSY_MIN_TABLES = 30;

let instanceCounter = 0;

interface TableDrag {
	pointerId: number;
	table: string;
	el: SVGGElement;
	startX: number;
	startY: number;
	origin: TablePosition;
	moved: boolean;
}

export interface DiagramCallbacks {
	/** Header clicked/tapped (released without dragging). */
	onTableClick?: (table: Table, evt: PointerEvent) => void;
	/** Column row clicked/tapped (released without moving, not a long-press). */
	onColumnClick?: (table: Table, column: Column, evt: PointerEvent) => void;
}

function detailFor(k: number): Detail {
	return k >= FULL_DETAIL_ZOOM ? "full" : k >= COMPACT_DETAIL_ZOOM ? "compact" : "minimal";
}

export class Diagram {
	readonly svg: SVGSVGElement;
	private readonly world: SVGGElement;
	private readonly edgesLayer: SVGGElement;
	private readonly tablesLayer: SVGGElement;
	private readonly gridPattern: SVGPatternElement;
	private readonly viewport: Viewport;
	private readonly measurer: TextMeasurer;
	private readonly interactions: DiagramInteractions;
	private readonly busyEl: HTMLElement;
	private readonly cleanup: (() => void)[] = [];

	private schema: Schema | null = null;
	private tables = new Map<string, Table>();
	private geometries = new Map<string, TableGeometry>();
	private positions = new Map<string, TablePosition>();
	/** Content signature of each table, to re-render only what changed. */
	private signatures = new Map<string, string>();
	private edgeKinds = new Map<string, { fk: EndKind; ref: EndKind }>();
	private readonly routing = new RoutingModel();

	private tableEls = new Map<string, SVGGElement>();
	private edgeEls = new Map<string, SVGGElement>();
	private detail: Detail = "full";

	private drag: TableDrag | null = null;
	/** Incremented on every setSchema: stale async layouts are discarded. */
	private generation = 0;
	/** Fit requested while the view had no size (e.g. collapsed sidebar): done on next resize. */
	private pendingFit = false;
	private syncFrame = 0;
	private dragFrame = 0;
	private refineFrame = 0;
	private destroyed = false;

	constructor(
		container: HTMLElement,
		private readonly store: LayoutStore,
		private readonly callbacks: DiagramCallbacks = {},
	) {
		const id = `dba-grid-${++instanceCounter}`;
		this.svg = container.createSvg("svg", { cls: "dba-svg" });
		const pattern = this.svg.createSvg("defs").createSvg("pattern", {
			attr: { id, width: 20, height: 20, patternUnits: "userSpaceOnUse" },
		});
		pattern.createSvg("circle", { cls: "dba-grid-dot", attr: { cx: 1, cy: 1, r: 1 } });
		this.gridPattern = pattern;
		this.svg.createSvg("rect", { cls: "dba-grid", attr: { width: "100%", height: "100%", fill: `url(#${id})` } });
		this.world = this.svg.createSvg("g", { cls: "dba-world" });
		this.edgesLayer = this.world.createSvg("g", { cls: "dba-edges" });
		this.tablesLayer = this.world.createSvg("g", { cls: "dba-tables" });

		this.busyEl = container.createDiv({ cls: ["dba-busy", "dba-hidden"], text: t("view.layingOut") });
		this.measurer = new TextMeasurer(this.svg);
		this.interactions = new DiagramInteractions(this.svg, container, {
			lookupTable: (name) => this.tables.get(name),
			onColumnClick: (table, column, evt) => this.callbacks.onColumnClick?.(table, column, evt),
		});
		this.viewport = new Viewport(this.svg, (t) => this.applyTransform(t), HEADER_SELECTOR);
		this.applyTransform(this.viewport.transform);

		this.listen("pointerdown", (e) => this.onPointerDown(e));
		this.listen("pointermove", (e) => this.onPointerMove(e));
		this.listen("pointerup", (e) => this.onPointerUp(e, false));
		this.listen("pointercancel", (e) => this.onPointerUp(e, true));
	}

	/**
	 * Draws the schema. Tables without a saved position are placed with ELK (without moving the others)
	 * and saved; positions of tables no longer in the folder are removed.
	 * With `fit`, adapts the viewport to the result; otherwise keeps the current viewport.
	 */
	async setSchema(schema: Schema, fit: boolean): Promise<void> {
		const generation = ++this.generation;
		this.cancelDrag();
		this.store.prune(schema.folder, schema.tables.map((t) => t.name));

		const geometries = new Map<string, TableGeometry>();
		for (const t of schema.tables) geometries.set(t.name, computeTableGeometry(t, this.measurer.measure));

		const saved = this.store.get(schema.folder);
		const nodes: SizedNode[] = schema.tables.map((t) => {
			const g = geometries.get(t.name) as TableGeometry;
			return { id: t.name, width: g.width, height: g.height };
		});
		const edges: LayoutEdge[] = schema.relations.map((r) => ({ from: r.fromTable, to: r.toTable }));

		const missing = nodes.filter((n) => !saved.has(n.id)).length;
		this.busyEl.toggleClass("dba-hidden", missing < BUSY_MIN_TABLES);
		let placed: Map<string, TablePosition>;
		try {
			placed = await placeMissing(nodes, edges, saved);
		} catch (err) {
			console.error("[db-atlas] ELK layout failed, using a simple placement", err);
			placed = fallbackPlacement(nodes, saved);
		}
		if (generation !== this.generation || this.destroyed) return; // a newer schema arrived meanwhile
		this.busyEl.addClass("dba-hidden");

		if (placed.size > 0) this.store.set(schema.folder, placed);
		this.schema = schema;
		this.geometries = geometries;
		this.positions = new Map([...saved, ...placed]);
		this.applyModel();
		if (fit) this.fit();
		else this.scheduleSync();
	}

	/** Redraws the texts in the current language. */
	refreshLanguage(): void {
		this.busyEl.setText(t("view.layingOut"));
		this.refreshStyles();
	}

	/** Redraws with fresh font metrics (theme / font change). */
	refreshStyles(): void {
		this.measurer.reset();
		if (!this.schema) return;
		for (const t of this.schema.tables) this.geometries.set(t.name, computeTableGeometry(t, this.measurer.measure));
		this.signatures.clear(); // force re-render of every table
		this.applyModel();
		this.scheduleSync();
	}

	zoomIn(): void {
		this.viewport.zoomBy(BUTTON_ZOOM_FACTOR);
	}

	zoomOut(): void {
		this.viewport.zoomBy(1 / BUTTON_ZOOM_FACTOR);
	}

	fit(): void {
		const bounds = unionRect(this.routing.allRects());
		if (!bounds) return;
		this.pendingFit = !this.viewport.fit(bounds);
	}

	onResize(): void {
		if (this.pendingFit) this.fit();
		else this.scheduleSync();
	}

	destroy(): void {
		this.destroyed = true;
		this.generation++;
		this.cancelDrag();
		for (const frame of [this.syncFrame, this.dragFrame, this.refineFrame]) if (frame) window.cancelAnimationFrame(frame);
		for (const off of this.cleanup) off();
		this.viewport.destroy();
		this.interactions.destroy();
		this.busyEl.remove();
		this.svg.remove();
	}

	// ---------- Model ----------

	/** Pushes schema, geometries and positions into the routing model and invalidates changed tables. */
	private applyModel(): void {
		const schema = this.schema;
		if (!schema) return;

		const rects = new Map<string, Rect>();
		const signatures = new Map<string, string>();
		this.tables = new Map(schema.tables.map((t) => [t.name, t]));
		for (const t of schema.tables) {
			const g = this.geometries.get(t.name) as TableGeometry;
			const p = this.positions.get(t.name) ?? { x: 0, y: 0 };
			rects.set(t.name, { x: p.x, y: p.y, width: g.width, height: g.height });
			signatures.set(t.name, `${p.x},${p.y}|${JSON.stringify(t)}`);
		}
		for (const [name, el] of this.tableEls) {
			if (signatures.get(name) !== this.signatures.get(name)) {
				el.remove();
				this.tableEls.delete(name);
			}
		}
		this.signatures = signatures;

		const specs: EdgeSpec[] = [];
		this.edgeKinds = new Map();
		for (const r of schema.relations) {
			const from = this.rowCenter(r.fromTable, r.fromColumn);
			const to = this.rowCenter(r.toTable, r.toColumn);
			if (from === null || to === null) continue;
			const id = `${r.fromTable}.${r.fromColumn}>${r.toTable}.${r.toColumn}`;
			specs.push({ id, fromTable: r.fromTable, fromRowY: from, toTable: r.toTable, toRowY: to });
			this.edgeKinds.set(id, endKinds(r.rel, r.fkNotNull));
		}

		this.routing.setGraph(rects, specs);
		this.applyRouteChanges(this.routing.finalize());
		this.scheduleRefine();
	}

	/** Row centre relative to the table top, or null if the column is not drawn. */
	private rowCenter(table: string, column: string): number | null {
		const row = this.geometries.get(table)?.rows.find((r) => r.column.name === column);
		return row ? row.y + ROW_HEIGHT / 2 : null;
	}

	private applyRouteChanges(changes: RouteChanges): void {
		for (const id of changes.removed) {
			this.edgeEls.get(id)?.remove();
			this.edgeEls.delete(id);
		}
		for (const id of changes.changed) {
			const el = this.edgeEls.get(id);
			if (el) this.drawEdgeInto(id, el);
		}
		this.scheduleSync(); // changed routes may enter or leave the viewport
	}

	/** Computes full routes a few milliseconds per frame (paused while dragging). */
	private scheduleRefine(): void {
		if (this.refineFrame || this.destroyed || this.routing.pending === 0) return;
		this.refineFrame = window.requestAnimationFrame(() => {
			this.refineFrame = 0;
			if (this.drag?.moved) return; // resumed on drop
			this.routing.refine(REFINE_BUDGET_MS);
			this.applyRouteChanges(this.routing.finalize());
			this.scheduleRefine();
		});
	}

	// ---------- Rendering with culling ----------

	private scheduleSync(): void {
		if (this.syncFrame || this.destroyed) return;
		this.syncFrame = window.requestAnimationFrame(() => {
			this.syncFrame = 0;
			this.syncVisible();
		});
	}

	/** Visible world area (plus a margin), or null if the view has no size. */
	private visibleArea(): Rect | null {
		const { width, height } = this.viewport.size();
		if (width === 0 || height === 0) return null;
		const t = this.viewport.transform;
		const pad = CULL_MARGIN_PX / t.k;
		return { x: -t.x / t.k - pad, y: -t.y / t.k - pad, width: width / t.k + 2 * pad, height: height / t.k + 2 * pad };
	}

	/** Adds elements that became visible and removes those that left the viewport. */
	private syncVisible(): void {
		const area = this.visibleArea();
		if (!area || !this.schema) return;

		const detail = detailFor(this.viewport.transform.k);
		if (detail !== this.detail) {
			this.detail = detail;
			this.svg.setAttribute("data-detail", detail);
			for (const el of this.tableEls.values()) el.remove();
			this.tableEls.clear();
			for (const [id, el] of this.edgeEls) this.drawEdgeInto(id, el); // markers depend on detail
		}

		const wantTables = new Set(this.routing.queryTables(area));
		if (this.drag) wantTables.add(this.drag.table);
		for (const [name, el] of this.tableEls) {
			if (!wantTables.has(name)) {
				el.remove();
				this.tableEls.delete(name);
			}
		}
		for (const name of wantTables) {
			if (this.tableEls.has(name)) continue;
			const table = this.tables.get(name);
			const g = this.geometries.get(name);
			const p = this.positions.get(name);
			if (!table || !g || !p) continue;
			this.tableEls.set(name, renderTable(this.tablesLayer, table, g, p, detail));
		}

		const wantEdges = new Set(this.routing.queryEdges(area));
		for (const [id, el] of this.edgeEls) {
			if (!wantEdges.has(id)) {
				el.remove();
				this.edgeEls.delete(id);
			}
		}
		for (const id of wantEdges) {
			if (this.edgeEls.has(id)) continue;
			const el = this.edgesLayer.createSvg("g", { cls: "dba-edge" });
			this.edgeEls.set(id, el);
			this.drawEdgeInto(id, el);
		}
	}

	private drawEdgeInto(id: string, el: SVGGElement): void {
		const points = this.routing.getRoute(id);
		const kinds = this.edgeKinds.get(id);
		if (!points || !kinds) {
			el.empty();
			return;
		}
		drawEdge(el, { points, ...kinds }, this.detail === "full");
	}

	private applyTransform(t: Transform): void {
		const transform = `translate(${t.x},${t.y}) scale(${t.k})`;
		this.world.setAttribute("transform", transform);
		this.gridPattern.setAttribute("patternTransform", transform);
		this.svg.toggleClass("hide-grid", t.k < GRID_MIN_ZOOM);
		this.interactions?.hideTooltip(); // undefined during construction
		this.scheduleSync();
	}

	// ---------- Table drag (from the header) ----------

	private listen<K extends keyof SVGElementEventMap>(type: K, handler: (e: SVGElementEventMap[K]) => void): void {
		this.svg.addEventListener(type, handler);
		this.cleanup.push(() => this.svg.removeEventListener(type, handler));
	}

	private onPointerDown(e: PointerEvent): void {
		if (this.drag || (e.pointerType === "mouse" && e.button !== 0)) return;
		const header = e.target instanceof Element ? e.target.closest(HEADER_SELECTOR) : null;
		const el = header?.closest<SVGGElement>(".dba-table");
		const table = el?.getAttribute("data-table");
		if (!el || table == null) return;
		const origin = this.positions.get(table);
		if (!origin) return;

		this.drag = { pointerId: e.pointerId, table, el, startX: e.clientX, startY: e.clientY, origin: { ...origin }, moved: false };
		this.svg.setPointerCapture(e.pointerId);
	}

	private onPointerMove(e: PointerEvent): void {
		const d = this.drag;
		if (!d || e.pointerId !== d.pointerId) return;
		const dx = e.clientX - d.startX;
		const dy = e.clientY - d.startY;
		if (!d.moved) {
			if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
			d.moved = true;
			d.el.parentNode?.appendChild(d.el); // bring to front
			d.el.addClass("is-dragging");
			this.svg.addClass("is-dragging-table");
		}
		const k = this.viewport.transform.k;
		this.moveTable(d.table, { x: d.origin.x + dx / k, y: d.origin.y + dy / k });
	}

	private onPointerUp(e: PointerEvent, cancelled: boolean): void {
		const d = this.drag;
		if (!d || e.pointerId !== d.pointerId) return;
		this.endDrag();
		if (cancelled) {
			if (d.moved) this.finishMove(d.table, d.origin);
			return;
		}
		if (d.moved) {
			const pos = this.positions.get(d.table) as TablePosition;
			if (this.schema) this.store.set(this.schema.folder, [[d.table, pos]]);
			this.finishMove(d.table, pos);
		} else {
			const table = this.tables.get(d.table);
			if (table) this.callbacks.onTableClick?.(table, e);
		}
	}

	/** Moves the table element now; its lines follow on the next frame (fast routes). */
	private moveTable(table: string, pos: TablePosition): void {
		this.positions.set(table, pos);
		this.tableEls.get(table)?.setAttribute("transform", `translate(${pos.x},${pos.y})`);
		if (this.dragFrame) return;
		this.dragFrame = window.requestAnimationFrame(() => {
			this.dragFrame = 0;
			this.pushPosition(table);
			this.applyRouteChanges(this.routing.finalize());
		});
	}

	private pushPosition(table: string): void {
		const p = this.positions.get(table);
		const g = this.geometries.get(table);
		if (p && g) this.routing.moveTable(table, { x: p.x, y: p.y, width: g.width, height: g.height });
	}

	/** End of a move: final position, full rerouting of affected lines. */
	private finishMove(table: string, pos: TablePosition): void {
		if (this.dragFrame) {
			window.cancelAnimationFrame(this.dragFrame);
			this.dragFrame = 0;
		}
		this.positions.set(table, pos);
		this.tableEls.get(table)?.setAttribute("transform", `translate(${pos.x},${pos.y})`);
		const sig = this.signatures.get(table);
		if (sig !== undefined) this.signatures.set(table, `${pos.x},${pos.y}|${sig.slice(sig.indexOf("|") + 1)}`);
		this.pushPosition(table);
		this.routing.settle(table);
		this.applyRouteChanges(this.routing.finalize());
		this.scheduleRefine();
	}

	private cancelDrag(): void {
		const d = this.drag;
		if (!d) return;
		this.endDrag();
		if (d.moved) this.finishMove(d.table, d.origin);
	}

	private endDrag(): void {
		const d = this.drag;
		if (!d) return;
		this.drag = null;
		d.el.removeClass("is-dragging");
		this.svg.removeClass("is-dragging-table");
		if (this.svg.hasPointerCapture(d.pointerId)) this.svg.releasePointerCapture(d.pointerId);
	}
}

/** Used only if ELK throws: stacks unplaced tables in columns right of the placed ones. */
function fallbackPlacement(nodes: SizedNode[], saved: Map<string, TablePosition>): Map<string, TablePosition> {
	const placed = nodes.filter((n) => saved.has(n.id));
	let x = placed.length > 0 ? Math.max(...placed.map((n) => (saved.get(n.id) as TablePosition).x + n.width)) + 80 : 0;
	let y = 0;
	const out = new Map<string, TablePosition>();
	for (const n of nodes.filter((n) => !saved.has(n.id))) {
		out.set(n.id, { x, y });
		y += n.height + 40;
		if (y > 1200) {
			y = 0;
			x += 320;
		}
	}
	return out;
}
