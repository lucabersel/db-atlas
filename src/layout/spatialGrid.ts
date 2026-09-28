// Uniform-grid spatial index for rectangles. Pure.
// Used for viewport culling and for obstacle queries while routing, so that both stay
// proportional to what is near, not to the size of the whole diagram.
// A key may own several rectangles (e.g. the segments of a line): a long L-shaped line then
// covers the cells along its segments, not every cell of its bounding box.

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function intersects(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export class SpatialGrid<K> {
	private readonly cells = new Map<string, Set<K>>();
	private readonly rects = new Map<K, Rect[]>();

	constructor(private readonly cellSize = 256) {}

	get size(): number {
		return this.rects.size;
	}

	/** First rectangle of `key`. */
	get(key: K): Rect | undefined {
		return this.rects.get(key)?.[0];
	}

	/** Inserts or replaces `key` with one or more rectangles. */
	set(key: K, rect: Rect | Rect[]): void {
		this.delete(key);
		const list = (Array.isArray(rect) ? rect : [rect]).map((r) => ({ ...r }));
		this.rects.set(key, list);
		for (const r of list) {
			this.forCells(r, (cell) => {
				let set = this.cells.get(cell);
				if (!set) this.cells.set(cell, (set = new Set()));
				set.add(key);
			});
		}
	}

	delete(key: K): void {
		const old = this.rects.get(key);
		if (!old) return;
		this.rects.delete(key);
		for (const r of old) {
			this.forCells(r, (cell) => {
				const set = this.cells.get(cell);
				set?.delete(key);
				if (set?.size === 0) this.cells.delete(cell);
			});
		}
	}

	clear(): void {
		this.cells.clear();
		this.rects.clear();
	}

	/** Keys with at least one rectangle intersecting `area`. */
	query(area: Rect): K[] {
		const found = new Set<K>();
		const rejected = new Set<K>();
		this.forCells(area, (cell) => {
			const set = this.cells.get(cell);
			if (!set) return;
			for (const key of set) {
				if (found.has(key) || rejected.has(key)) continue;
				if ((this.rects.get(key) as Rect[]).some((r) => intersects(r, area))) found.add(key);
				else rejected.add(key);
			}
		});
		return [...found];
	}

	private forCells(r: Rect, fn: (cell: string) => void): void {
		const s = this.cellSize;
		const x0 = Math.floor(r.x / s);
		const y0 = Math.floor(r.y / s);
		const x1 = Math.floor((r.x + Math.max(r.width, 0)) / s);
		const y1 = Math.floor((r.y + Math.max(r.height, 0)) / s);
		for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) fn(`${cx},${cy}`);
	}
}
