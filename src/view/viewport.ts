// Pan/zoom state of the diagram. The math at the top is pure; the Viewport class wires DOM input.

export interface Transform {
	x: number;
	y: number;
	k: number;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 3;
export const BUTTON_ZOOM_FACTOR = 1.25;
export const FIT_PADDING = 32;
/** Screen pixels a pointer must move before a press becomes a drag (click vs drag). */
export const DRAG_THRESHOLD = 4;

export function clampZoom(k: number): number {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

/** Zooms by `factor` keeping the screen point (px, py) fixed. */
export function zoomAt(t: Transform, factor: number, px: number, py: number): Transform {
	const k = clampZoom(t.k * factor);
	const wx = (px - t.x) / t.k;
	const wy = (py - t.y) / t.k;
	return { x: px - wx * k, y: py - wy * k, k };
}

/** Transform that centers `bounds` in a view of the given size, never zooming in beyond `maxZoom`. */
export function fitTransform(bounds: Rect, viewWidth: number, viewHeight: number, padding = FIT_PADDING, maxZoom = 1): Transform {
	const availW = Math.max(1, viewWidth - 2 * padding);
	const availH = Math.max(1, viewHeight - 2 * padding);
	const k = clampZoom(Math.min(availW / Math.max(1, bounds.width), availH / Math.max(1, bounds.height), maxZoom));
	return {
		x: (viewWidth - bounds.width * k) / 2 - bounds.x * k,
		y: (viewHeight - bounds.height * k) / 2 - bounds.y * k,
		k,
	};
}

/** Bounding box of a set of rectangles, or null if empty. */
export function unionRect(rects: Rect[]): Rect | null {
	if (rects.length === 0) return null;
	const minX = Math.min(...rects.map((r) => r.x));
	const minY = Math.min(...rects.map((r) => r.y));
	const maxX = Math.max(...rects.map((r) => r.x + r.width));
	const maxY = Math.max(...rects.map((r) => r.y + r.height));
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Converts a wheel delta to a zoom factor (pinch on trackpads arrives as ctrl+wheel with small deltas). */
export function wheelZoomFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
	const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
	return Math.exp(-px * (ctrlKey ? 0.01 : 0.0015));
}

interface Point {
	x: number;
	y: number;
}

/**
 * Mouse/touch/pen input on the SVG: drag = pan, wheel = zoom, two-finger pinch = zoom + pan.
 * Pointer-downs inside `ignoreSelector` are left alone (table headers: dragged in Fase 6).
 */
export class Viewport {
	private t: Transform = { x: 0, y: 0, k: 1 };
	private readonly pointers = new Map<number, Point>();
	/** True once a single-pointer drag has passed DRAG_THRESHOLD. */
	private panning = false;
	private readonly cleanup: (() => void)[] = [];

	constructor(
		private readonly el: SVGSVGElement,
		private readonly onChange: (t: Transform) => void,
		private readonly ignoreSelector?: string,
	) {
		this.listen("pointerdown", (e) => this.onPointerDown(e));
		this.listen("pointermove", (e) => this.onPointerMove(e));
		this.listen("pointerup", (e) => this.onPointerUp(e));
		this.listen("pointercancel", (e) => this.onPointerUp(e));
		this.listen("wheel", (e) => this.onWheel(e), { passive: false });
	}

	get transform(): Transform {
		return { ...this.t };
	}

	set(t: Transform): void {
		this.t = { ...t };
		this.onChange(this.transform);
	}

	/** Zooms around a point in element coordinates (default: center). */
	zoomBy(factor: number, px?: number, py?: number): void {
		const { width, height } = this.size();
		this.set(zoomAt(this.t, factor, px ?? width / 2, py ?? height / 2));
	}

	/** Fits `bounds` (world coordinates). Returns false if the element has no size yet (e.g. hidden). */
	fit(bounds: Rect): boolean {
		const { width, height } = this.size();
		if (width === 0 || height === 0) return false;
		this.set(fitTransform(bounds, width, height));
		return true;
	}

	size(): { width: number; height: number } {
		const r = this.el.getBoundingClientRect();
		return { width: r.width, height: r.height };
	}

	destroy(): void {
		for (const off of this.cleanup) off();
		this.cleanup.length = 0;
		this.pointers.clear();
	}

	private listen<K extends keyof SVGElementEventMap>(
		type: K,
		handler: (e: SVGElementEventMap[K]) => void,
		options?: AddEventListenerOptions,
	): void {
		this.el.addEventListener(type, handler, options);
		this.cleanup.push(() => this.el.removeEventListener(type, handler, options));
	}

	private local(e: PointerEvent | WheelEvent): Point {
		const r = this.el.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}

	private onPointerDown(e: PointerEvent): void {
		if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
		if (this.ignoreSelector && e.target instanceof Element && e.target.closest(this.ignoreSelector)) return;
		this.pointers.set(e.pointerId, this.local(e));
		this.el.setPointerCapture(e.pointerId);
		this.el.addClass("is-panning");
		if (e.button === 1) e.preventDefault();
	}

	private onPointerMove(e: PointerEvent): void {
		const prev = this.pointers.get(e.pointerId);
		if (!prev) return;
		const cur = this.local(e);

		if (this.pointers.size === 1) {
			// Pan starts past the drag threshold, so clicks, taps and long-presses do not move the view.
			if (!this.panning) {
				if (Math.hypot(cur.x - prev.x, cur.y - prev.y) < DRAG_THRESHOLD) return;
				this.panning = true;
			}
			this.pointers.set(e.pointerId, cur);
			this.set({ ...this.t, x: this.t.x + cur.x - prev.x, y: this.t.y + cur.y - prev.y });
			return;
		}

		// Pinch: use this pointer and one other.
		const [otherId, other] = [...this.pointers].find(([id]) => id !== e.pointerId) as [number, Point];
		const distBefore = Math.hypot(prev.x - other.x, prev.y - other.y);
		const distAfter = Math.hypot(cur.x - other.x, cur.y - other.y);
		const midBefore = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
		const midAfter = { x: (cur.x + other.x) / 2, y: (cur.y + other.y) / 2 };
		this.pointers.set(e.pointerId, cur);
		this.pointers.set(otherId, other);

		const zoomed = distBefore > 0 ? zoomAt(this.t, distAfter / distBefore, midBefore.x, midBefore.y) : this.t;
		this.set({ ...zoomed, x: zoomed.x + midAfter.x - midBefore.x, y: zoomed.y + midAfter.y - midBefore.y });
	}

	private onPointerUp(e: PointerEvent): void {
		if (!this.pointers.delete(e.pointerId)) return;
		if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
		if (this.pointers.size === 0) {
			this.panning = false;
			this.el.removeClass("is-panning");
		}
	}

	private onWheel(e: WheelEvent): void {
		e.preventDefault();
		const p = this.local(e);
		this.zoomBy(wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey), p.x, p.y);
	}
}
