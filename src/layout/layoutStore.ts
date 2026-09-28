// Saved table positions (`data.layouts`). Pure: persistence is delegated to `onChange`.

import type { DbAtlasData, TablePosition } from "../types";

export class LayoutStore {
	constructor(
		private readonly data: DbAtlasData,
		/** Called after every change; expected to schedule a (debounced) save. */
		private readonly onChange: () => void,
	) {}

	/** Copy of the saved positions of a folder. */
	get(folder: string): Map<string, TablePosition> {
		const tables = this.data.layouts[folder]?.tables ?? {};
		return new Map(Object.entries(tables).map(([name, p]) => [name, { ...p }]));
	}

	/** Saves positions (rounded to whole pixels). */
	set(folder: string, positions: Iterable<[string, TablePosition]>): void {
		const layout = (this.data.layouts[folder] ??= { tables: {} });
		let changed = false;
		for (const [name, p] of positions) {
			const rounded = { x: Math.round(p.x), y: Math.round(p.y) };
			const old = layout.tables[name];
			if (old && old.x === rounded.x && old.y === rounded.y) continue;
			layout.tables[name] = rounded;
			changed = true;
		}
		if (changed) this.onChange();
	}

	/** Removes positions of tables that no longer exist in the folder. */
	prune(folder: string, existing: Iterable<string>): void {
		const layout = this.data.layouts[folder];
		if (!layout) return;
		const keep = new Set(existing);
		const stale = Object.keys(layout.tables).filter((name) => !keep.has(name));
		for (const name of stale) delete layout.tables[name];
		if (stale.length > 0) this.onChange();
	}
}
