// Defaults and normalization of data.json. Pure: no `obsidian` imports.

import type { DbAtlasData, DbAtlasSettings, FolderLayout, ViewLocation } from "./types";

export const DEFAULT_TABLE_TEMPLATE = `---
table_description: ""
col_id: '{"type":"int","pk":true,"increment":true}'
---

# {{name}}

## id
Chiave primaria.
`;

export const VIEW_LOCATIONS: readonly ViewLocation[] = ["tab", "right", "left"];

export const DEFAULT_SETTINGS: DbAtlasSettings = {
	dbFolders: [],
	viewLocation: "tab",
	newTableTemplate: DEFAULT_TABLE_TEMPLATE,
};

export function defaultData(): DbAtlasData {
	return {
		settings: { ...DEFAULT_SETTINGS, dbFolders: [] },
		layouts: {},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Vault-relative folder path without leading/trailing slashes; the vault root is `/`. */
export function normalizeFolderPath(path: string): string {
	const trimmed = path.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
	return trimmed === "" ? "/" : trimmed;
}

/** Copy of `items` with the element at `index` moved by `delta` positions (clamped to the ends). */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
	const out = [...items];
	const target = Math.max(0, Math.min(out.length - 1, index + delta));
	if (index < 0 || index >= out.length || target === index) return out;
	const [item] = out.splice(index, 1);
	out.splice(target, 0, item);
	return out;
}

/** Parent folder path in the same form as `TFolder.path` (vault root = `/`). */
export function parentPath(path: string): string {
	const i = path.lastIndexOf("/");
	return i === -1 ? "/" : path.slice(0, i);
}

function normalizeLayout(raw: unknown): FolderLayout {
	const tables: FolderLayout["tables"] = {};
	const rawTables = isRecord(raw) && isRecord(raw.tables) ? raw.tables : {};
	for (const [name, pos] of Object.entries(rawTables)) {
		if (isRecord(pos) && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
			tables[name] = { x: pos.x as number, y: pos.y as number };
		}
	}
	return { tables };
}

/**
 * Merges whatever `loadData()` returned with the defaults, dropping values of the wrong type.
 * Never throws: a corrupted data.json falls back to defaults field by field.
 */
export function normalizeData(raw: unknown): DbAtlasData {
	const data = defaultData();
	if (!isRecord(raw)) return data;

	const s = isRecord(raw.settings) ? raw.settings : {};
	if (Array.isArray(s.dbFolders)) {
		const folders = s.dbFolders
			.filter((f): f is string => typeof f === "string" && f.trim() !== "")
			.map(normalizeFolderPath);
		data.settings.dbFolders = [...new Set(folders)];
	}
	if (VIEW_LOCATIONS.includes(s.viewLocation as ViewLocation)) {
		data.settings.viewLocation = s.viewLocation as ViewLocation;
	}
	if (typeof s.newTableTemplate === "string") {
		data.settings.newTableTemplate = s.newTableTemplate;
	}

	if (typeof raw.lastFolder === "string" && raw.lastFolder.trim() !== "") {
		data.lastFolder = normalizeFolderPath(raw.lastFolder);
	}

	if (isRecord(raw.layouts)) {
		for (const [folder, layout] of Object.entries(raw.layouts)) {
			data.layouts[normalizeFolderPath(folder)] = normalizeLayout(layout);
		}
	}

	return data;
}
