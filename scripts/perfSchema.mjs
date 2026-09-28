// Deterministic generator of a realistic large schema (used by the perf folder and the benchmark).
// Tables are grouped in modules; FKs point mostly to earlier tables of the same module,
// sometimes to a few "hub" tables (utenti, aziende, ...), like a real ERP schema.

const MODULES = ["core", "vendite", "acquisti", "magazzino", "contabilita", "hr", "crm", "produzione"];
const HUBS = ["core_utenti", "core_aziende", "core_valute"];
const TYPES = ["int", "varchar(40)", "varchar(120)", "decimal(12,2)", "date", "datetime", "boolean", "text"];

function rng(seed) {
	let s = seed;
	return () => {
		s = (s * 16807) % 2147483647;
		return s / 2147483647;
	};
}

/**
 * @param {number} count number of tables
 * @returns {{ name: string, frontmatter: Record<string, string> }[]}
 */
export function generateSchema(count = 80, seed = 42) {
	const rand = rng(seed);
	const pick = (arr) => arr[Math.floor(rand() * arr.length)];
	const perModule = Math.ceil(count / MODULES.length);
	const tables = [];

	for (let i = 0; i < count; i++) {
		const module = MODULES[Math.floor(i / perModule)] ?? MODULES[MODULES.length - 1];
		const name = i < HUBS.length ? HUBS[i] : `${module}_t${String(i).padStart(2, "0")}`;
		const fm = {};
		if (rand() < 0.5) fm.table_description = `Tabella ${name.replace(/_/g, " ")} del modulo ${module}`;
		if (rand() < 0.25) fm.table_color = pick(["#2E7D32", "#1565C0", "#6A1B9A", "#EF6C00", "#00838F"]);
		fm.col_id = JSON.stringify({ type: "int", pk: true, increment: true });

		const cols = 3 + Math.floor(rand() * 8);
		for (let c = 0; c < cols; c++) {
			const def = { type: pick(TYPES) };
			if (rand() < 0.4) def.notNull = true;
			if (rand() < 0.1) def.unique = true;
			fm[`col_campo_${c}`] = JSON.stringify(def);
		}

		// 1-2 FKs to earlier tables of the same module, sometimes one to a hub.
		const sameModule = tables.filter((t) => t.module === module);
		const fks = sameModule.length === 0 ? 0 : 1 + Math.floor(rand() * 2);
		for (let f = 0; f < fks; f++) {
			const target = pick(sameModule);
			fm[`col_${target.name}_id${f ? f : ""}`] = JSON.stringify({
				type: "int",
				ref: `${target.name}.id`,
				...(rand() < 0.6 ? { notNull: true } : {}),
				...(rand() < 0.1 ? { rel: pick(["-", "<", "<>"]) } : {}),
			});
		}
		if (i >= HUBS.length && rand() < 0.35) {
			const hub = pick(HUBS);
			fm[`col_${hub}_id`] = JSON.stringify({ type: "int", ref: `${hub}.id` });
		}
		if (rand() < 0.05) fm.col_parent_id = JSON.stringify({ type: "int", ref: `${name}.id` });

		tables.push({ name, module, frontmatter: fm });
	}
	return tables.map(({ name, frontmatter }) => ({ name, frontmatter }));
}
