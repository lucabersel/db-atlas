// Row taps/clicks, hover tooltips (mouse) and long-press tooltips (touch/pen) on the diagram.
// Table header clicks and drags are handled by Diagram; panning/zooming by Viewport.

import type { Column, Table } from "../types";
import { columnTooltip, tableTooltip } from "./tooltipText";
import { DRAG_THRESHOLD } from "./viewport";

export const LONG_PRESS_MS = 500;
export const HOVER_DELAY_MS = 350;

export interface InteractionHandlers {
	lookupTable(table: string): Table | undefined;
	onColumnClick(table: Table, column: Column, evt: PointerEvent): void;
}

interface Tap {
	pointerId: number;
	x: number;
	y: number;
	table: string;
	column: string;
	longPressed: boolean;
	timer: number;
}

type Target = { kind: "row"; table: string; column: string } | { kind: "header"; table: string };

function targetOf(el: EventTarget | null): Target | null {
	if (!(el instanceof Element)) return null;
	const tableEl = el.closest(".dba-table");
	const table = tableEl?.getAttribute("data-table");
	if (table == null) return null;
	if (el.closest(".dba-table-header")) return { kind: "header", table };
	const column = el.closest(".dba-row")?.getAttribute("data-column");
	return column == null ? null : { kind: "row", table, column };
}

const sameTarget = (a: Target | null, b: Target | null) =>
	a?.kind === b?.kind && a?.table === b?.table && (a?.kind !== "row" || b?.kind !== "row" || a.column === b.column);

export class DiagramInteractions {
	private readonly tooltipEl: HTMLElement;
	private readonly cleanup: (() => void)[] = [];
	private tap: Tap | null = null;
	private hovered: Target | null = null;
	private hoverTimer = 0;

	constructor(
		private readonly svg: SVGSVGElement,
		private readonly container: HTMLElement,
		private readonly handlers: InteractionHandlers,
	) {
		this.tooltipEl = container.createDiv({ cls: ["dba-tooltip", "dba-hidden"] });
		this.listen("pointerdown", (e) => this.onPointerDown(e));
		this.listen("pointermove", (e) => this.onPointerMove(e));
		this.listen("pointerup", (e) => this.onPointerUp(e));
		this.listen("pointercancel", () => this.cancelTap());
		this.listen("pointerleave", () => this.clearHover());
		this.listen("wheel", () => this.clearHover());
		// Long-press must show our tooltip, not the system context menu.
		this.listen("contextmenu", (e) => e.preventDefault());
	}

	hideTooltip(): void {
		this.tooltipEl.addClass("dba-hidden");
	}

	destroy(): void {
		this.cancelTap();
		this.clearHover();
		for (const off of this.cleanup) off();
		this.tooltipEl.remove();
	}

	private listen<K extends keyof SVGElementEventMap>(type: K, handler: (e: SVGElementEventMap[K]) => void): void {
		this.svg.addEventListener(type, handler);
		this.cleanup.push(() => this.svg.removeEventListener(type, handler));
	}

	// ---------- Taps / clicks on rows ----------

	private onPointerDown(e: PointerEvent): void {
		this.clearHover();
		if (this.tap) {
			this.cancelTap(); // second finger: it is a pinch, not a tap
			return;
		}
		if (e.pointerType === "mouse" && e.button !== 0) return;
		const target = targetOf(e.target);
		if (target?.kind !== "row") return;

		const tap: Tap = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, table: target.table, column: target.column, longPressed: false, timer: 0 };
		if (e.pointerType !== "mouse") {
			tap.timer = window.setTimeout(() => {
				tap.longPressed = true;
				this.showTooltip(target, tap.x, tap.y);
			}, LONG_PRESS_MS);
		}
		this.tap = tap;
	}

	private onPointerMove(e: PointerEvent): void {
		const tap = this.tap;
		if (tap && e.pointerId === tap.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) >= DRAG_THRESHOLD) {
			this.cancelTap();
		}
		if (e.pointerType === "mouse" && e.buttons === 0) this.onHover(e);
	}

	private onPointerUp(e: PointerEvent): void {
		const tap = this.tap;
		if (!tap || e.pointerId !== tap.pointerId) return;
		this.tap = null;
		window.clearTimeout(tap.timer);
		if (tap.longPressed) return; // tooltip stays until the next touch
		const table = this.handlers.lookupTable(tap.table);
		const column = table?.columns.find((c) => c.name === tap.column);
		if (table && column) this.handlers.onColumnClick(table, column, e);
	}

	private cancelTap(): void {
		if (this.tap) window.clearTimeout(this.tap.timer);
		this.tap = null;
	}

	// ---------- Tooltips ----------

	private onHover(e: PointerEvent): void {
		const target = targetOf(e.target);
		if (sameTarget(target, this.hovered)) return;
		this.clearHover();
		this.hovered = target;
		if (!target) return;
		const { clientX, clientY } = e;
		this.hoverTimer = window.setTimeout(() => this.showTooltip(target, clientX, clientY), HOVER_DELAY_MS);
	}

	private clearHover(): void {
		window.clearTimeout(this.hoverTimer);
		this.hovered = null;
		this.hideTooltip();
	}

	private tooltipLines(target: Target): string[] {
		const table = this.handlers.lookupTable(target.table);
		if (!table) return [];
		if (target.kind === "header") return tableTooltip(table);
		const column = table.columns.find((c) => c.name === target.column);
		return column ? columnTooltip(column) : [];
	}

	private showTooltip(target: Target, clientX: number, clientY: number): void {
		const lines = this.tooltipLines(target);
		if (lines.length === 0) return;
		const el = this.tooltipEl;
		el.empty();
		for (const line of lines) el.createDiv({ cls: "dba-tooltip-line", text: line });
		el.removeClass("dba-hidden");

		// Below-right of the pointer, kept inside the view.
		const box = this.container.getBoundingClientRect();
		const margin = 8;
		let x = clientX - box.left + 12;
		let y = clientY - box.top + 16;
		x = Math.max(margin, Math.min(x, box.width - el.offsetWidth - margin));
		if (y + el.offsetHeight > box.height - margin) y = clientY - box.top - el.offsetHeight - 12;
		el.style.setProperty("--dba-tooltip-x", `${Math.round(x)}px`);
		el.style.setProperty("--dba-tooltip-y", `${Math.round(Math.max(margin, y))}px`);
	}
}
