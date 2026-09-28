// Frontmatter `col_*` value → Column. Pure: no `obsidian` imports.

import type { Column, Issue, Rel } from "../types";

export const COLUMN_PREFIX = "col_";
export const RELS: readonly Rel[] = [">", "<", "-", "<>"];
export const DEFAULT_REL: Rel = ">";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidColumn(name: string, issues: Issue[]): Column {
	return { name, valid: false, type: "", pk: false, notNull: false, unique: false, increment: false, issues };
}

/**
 * Parses one `col_*` property.
 * @param key frontmatter key, including the `col_` prefix
 * @param rawValue value as returned by the metadata cache (normally a JSON string)
 * @param table name of the owning table, used in issues
 */
export function parseColumn(key: string, rawValue: unknown, table: string): Column {
	const name = key.startsWith(COLUMN_PREFIX) ? key.slice(COLUMN_PREFIX.length) : key;
	const issues: Issue[] = [];
	const error = (message: string) => invalidColumn(name, [...issues, { level: "error", message, table, column: name }]);
	const warn = (message: string) => issues.push({ level: "warning", message, table, column: name });

	let def: unknown;
	if (typeof rawValue === "string") {
		try {
			def = JSON.parse(rawValue);
		} catch {
			return error("JSON non valido");
		}
	} else if (isRecord(rawValue)) {
		def = rawValue;
		warn("Valore YAML non racchiuso tra apici: usare una stringa JSON tra apici singoli");
	} else {
		return error("Definizione mancante o non valida: attesa una stringa JSON");
	}

	if (!isRecord(def)) return error("JSON non valido: atteso un oggetto");
	if (typeof def.type !== "string" || def.type.trim() === "") return error("Chiave \"type\" mancante");

	const column: Column = {
		name,
		valid: true,
		type: def.type,
		pk: def.pk === true,
		notNull: def.notNull === true,
		unique: def.unique === true,
		increment: def.increment === true,
		issues,
	};

	const dflt = def.default;
	if (typeof dflt === "string" || typeof dflt === "number" || typeof dflt === "boolean") {
		column.default = dflt;
	}

	// Any present `ref` is kept (even non-string or empty) so that buildSchema reports it as malformed.
	if (def.ref !== undefined && def.ref !== null) {
		column.ref = typeof def.ref === "string" ? def.ref : JSON.stringify(def.ref);
		if (def.rel === undefined) {
			column.rel = DEFAULT_REL;
		} else if (RELS.includes(def.rel as Rel)) {
			column.rel = def.rel as Rel;
		} else {
			column.rel = DEFAULT_REL;
			warn(`"rel" non valido (${JSON.stringify(def.rel)}): usato "${DEFAULT_REL}"`);
		}
	}

	return column;
}
