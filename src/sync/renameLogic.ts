// Pure logic behind rename propagation: `ref` rewriting and data.json updates.

import { splitRef } from "../model/buildSchema";
import { COLUMN_PREFIX } from "../model/parseColumn";
import type { DbAtlasData } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Replaces the table part of a `tabella.campo` ref if it is `oldTable`; null if nothing to change. */
function renamedRef(ref: unknown, oldTable: string, newTable: string): string | null {
	if (typeof ref !== "string") return null;
	const target = splitRef(ref);
	return target && target.table === oldTable ? `${newTable}.${target.column}` : null;
}

/**
 * New value for one `col_*` property whose `ref` points to `oldTable`, or undefined if unchanged.
 * JSON strings are re-serialized (keys keep their order); YAML objects are returned as objects;
 * invalid JSON is left alone.
 */
export function rewriteColumnRef(value: unknown, oldTable: string, newTable: string): unknown {
	if (typeof value === "string") {
		let def: unknown;
		try {
			def = JSON.parse(value);
		} catch {
			return undefined;
		}
		if (!isRecord(def)) return undefined;
		const ref = renamedRef(def.ref, oldTable, newTable);
		return ref === null ? undefined : JSON.stringify({ ...def, ref });
	}
	if (isRecord(value)) {
		const ref = renamedRef(value.ref, oldTable, newTable);
		return ref === null ? undefined : { ...value, ref };
	}
	return undefined;
}

/** Rewrites, in place, every `col_*` ref pointing to `oldTable`. Returns true if something changed. */
export function rewriteFrontmatterRefs(frontmatter: Record<string, unknown>, oldTable: string, newTable: string): boolean {
	let changed = false;
	for (const key of Object.keys(frontmatter)) {
		if (!key.startsWith(COLUMN_PREFIX)) continue;
		const next = rewriteColumnRef(frontmatter[key], oldTable, newTable);
		if (next !== undefined) {
			frontmatter[key] = next;
			changed = true;
		}
	}
	return changed;
}

/** True if the frontmatter has at least one ref to `table` (checked without modifying it). */
export function hasRefsTo(frontmatter: unknown, table: string): boolean {
	if (!isRecord(frontmatter)) return false;
	return Object.keys(frontmatter).some(
		(key) => key.startsWith(COLUMN_PREFIX) && rewriteColumnRef(frontmatter[key], table, table) !== undefined,
	);
}

/** Moves the saved position of a renamed table. Returns true if data changed. */
export function renameTableInLayouts(data: DbAtlasData, folder: string, oldTable: string, newTable: string): boolean {
	const tables = data.layouts[folder]?.tables;
	const pos = tables?.[oldTable];
	if (!tables || !pos) return false;
	delete tables[oldTable];
	tables[newTable] = pos;
	return true;
}

/** `path` with the `oldPrefix` folder replaced by `newPrefix`, or null if `path` is not inside it. */
export function remapFolderPath(path: string, oldPrefix: string, newPrefix: string): string | null {
	if (path === oldPrefix) return newPrefix;
	if (path.startsWith(oldPrefix + "/")) return newPrefix + path.slice(oldPrefix.length);
	return null;
}

/**
 * A folder was renamed/moved from `oldPath` to `newPath`: updates DB folders inside it
 * (the folder itself or descendants) in settings, layouts and lastFolder. Returns true if data changed.
 */
export function renameFolderInData(data: DbAtlasData, oldPath: string, newPath: string): boolean {
	let changed = false;
	const remap = (p: string) => remapFolderPath(p, oldPath, newPath);

	const folders = data.settings.dbFolders.map((f) => remap(f) ?? f);
	if (folders.some((f, i) => f !== data.settings.dbFolders[i])) {
		data.settings.dbFolders = [...new Set(folders)];
		changed = true;
	}

	for (const key of Object.keys(data.layouts)) {
		const next = remap(key);
		if (next === null || next === key) continue;
		data.layouts[next] = data.layouts[key];
		delete data.layouts[key];
		changed = true;
	}

	if (data.lastFolder !== undefined) {
		const next = remap(data.lastFolder);
		if (next !== null && next !== data.lastFolder) {
			data.lastFolder = next;
			changed = true;
		}
	}
	return changed;
}
