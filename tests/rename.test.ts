import { describe, expect, it } from "vitest";
import { defaultData } from "../src/data";
import { buildSchema } from "../src/model/buildSchema";
import { parseTable } from "../src/model/parseTable";
import { fillTemplate, tableNotePath, validateTableName } from "../src/model/tableName";
import {
	hasRefsTo,
	remapFolderPath,
	renameFolderInData,
	renameTableInLayouts,
	rewriteColumnRef,
	rewriteFrontmatterRefs,
} from "../src/sync/renameLogic";

const json = (o: unknown) => JSON.stringify(o);

describe("rewriteColumnRef", () => {
	it("rewrites the table of a matching ref and re-serializes JSON keeping key order", () => {
		const out = rewriteColumnRef('{"type": "int", "ref": "clienti.id", "rel": ">", "notNull": true}', "clienti", "anagrafica_clienti");
		expect(out).toBe('{"type":"int","ref":"anagrafica_clienti.id","rel":">","notNull":true}');
	});

	it("leaves other refs, malformed refs and invalid JSON untouched", () => {
		for (const v of [
			json({ type: "int", ref: "agenti.id" }),
			json({ type: "int", ref: "clienti" }),
			json({ type: "int", ref: "x.clienti.id" }),
			json({ type: "int" }),
			'{"type":"int",ref:"clienti.id"',
			"42",
			null,
			7,
		]) {
			expect(rewriteColumnRef(v, "clienti", "nuovo")).toBeUndefined();
		}
	});

	it("is case-sensitive", () => {
		expect(rewriteColumnRef(json({ type: "int", ref: "Clienti.id" }), "clienti", "nuovo")).toBeUndefined();
	});

	it("keeps YAML object values as objects", () => {
		expect(rewriteColumnRef({ type: "int", ref: "clienti.id" }, "clienti", "nuovo")).toEqual({ type: "int", ref: "nuovo.id" });
	});
});

describe("rewriteFrontmatterRefs", () => {
	it("rewrites only col_* properties pointing to the old table, in place", () => {
		const fm: Record<string, unknown> = {
			table_description: "clienti.id",
			col_id: json({ type: "int", pk: true }),
			col_cliente_id: json({ type: "int", ref: "clienti.id" }),
			col_altro: json({ type: "int", ref: "clienti.codice", rel: "-" }),
			col_agente_id: json({ type: "int", ref: "agenti.id" }),
			tags: ["db"],
		};
		expect(rewriteFrontmatterRefs(fm, "clienti", "anagrafica_clienti")).toBe(true);
		expect(fm).toEqual({
			table_description: "clienti.id",
			col_id: json({ type: "int", pk: true }),
			col_cliente_id: json({ type: "int", ref: "anagrafica_clienti.id" }),
			col_altro: json({ type: "int", ref: "anagrafica_clienti.codice", rel: "-" }),
			col_agente_id: json({ type: "int", ref: "agenti.id" }),
			tags: ["db"],
		});
		expect(rewriteFrontmatterRefs(fm, "clienti", "x")).toBe(false);
	});

	it("keeps the schema resolved after a rename (integration with the parser)", () => {
		const ordini: Record<string, unknown> = { col_cliente_id: json({ type: "int", notNull: true, ref: "clienti.id" }) };
		const agenti: Record<string, unknown> = { col_id: json({ type: "int" }), col_resp: json({ type: "int", ref: "agenti.id" }) };
		rewriteFrontmatterRefs(ordini, "clienti", "anagrafica_clienti");
		rewriteFrontmatterRefs(agenti, "agenti", "rete"); // self-reference in the renamed note
		const s = buildSchema("DB", [
			parseTable("anagrafica_clienti", "DB/anagrafica_clienti.md", { col_id: json({ type: "int" }) }),
			parseTable("ordini", "DB/ordini.md", ordini),
			parseTable("rete", "DB/rete.md", agenti),
		]);
		expect(s.relations.map((r) => `${r.fromTable}.${r.fromColumn}>${r.toTable}.${r.toColumn}`)).toEqual([
			"ordini.cliente_id>anagrafica_clienti.id",
			"rete.resp>rete.id",
		]);
	});
});

describe("hasRefsTo", () => {
	it("detects refs without modifying the frontmatter", () => {
		const fm = { col_a: json({ type: "int", ref: "clienti.id" }) };
		expect(hasRefsTo(fm, "clienti")).toBe(true);
		expect(fm.col_a).toBe(json({ type: "int", ref: "clienti.id" }));
		expect(hasRefsTo(fm, "agenti")).toBe(false);
		expect(hasRefsTo(undefined, "clienti")).toBe(false);
	});
});

describe("renameTableInLayouts", () => {
	it("moves the saved position to the new name", () => {
		const data = defaultData();
		data.layouts.DB = { tables: { clienti: { x: 10, y: 20 }, ordini: { x: 0, y: 0 } } };
		expect(renameTableInLayouts(data, "DB", "clienti", "anagrafica_clienti")).toBe(true);
		expect(data.layouts.DB.tables).toEqual({ anagrafica_clienti: { x: 10, y: 20 }, ordini: { x: 0, y: 0 } });
		expect(renameTableInLayouts(data, "DB", "clienti", "x")).toBe(false);
		expect(renameTableInLayouts(data, "Altro", "ordini", "x")).toBe(false);
	});
});

describe("folder renames", () => {
	it("remaps paths inside the renamed folder only", () => {
		expect(remapFolderPath("DB", "DB", "Database")).toBe("Database");
		expect(remapFolderPath("DB/Vendite", "DB", "Database")).toBe("Database/Vendite");
		expect(remapFolderPath("DBx", "DB", "Database")).toBeNull();
		expect(remapFolderPath("Altro", "DB", "Database")).toBeNull();
	});

	it("updates dbFolders, layouts and lastFolder", () => {
		const data = defaultData();
		data.settings.dbFolders = ["Lavoro/Gestionale", "Altro", "Lavoro/Gestionale/Sub"];
		data.layouts["Lavoro/Gestionale"] = { tables: { a: { x: 1, y: 2 } } };
		data.layouts.Altro = { tables: {} };
		data.lastFolder = "Lavoro/Gestionale";

		expect(renameFolderInData(data, "Lavoro", "Archivio/Lavoro")).toBe(true);
		expect(data.settings.dbFolders).toEqual(["Archivio/Lavoro/Gestionale", "Altro", "Archivio/Lavoro/Gestionale/Sub"]);
		expect(data.layouts).toEqual({ "Archivio/Lavoro/Gestionale": { tables: { a: { x: 1, y: 2 } } }, Altro: { tables: {} } });
		expect(data.lastFolder).toBe("Archivio/Lavoro/Gestionale");
	});

	it("reports no change for unrelated folders", () => {
		const data = defaultData();
		data.settings.dbFolders = ["DB"];
		data.lastFolder = "DB";
		expect(renameFolderInData(data, "Note", "Appunti")).toBe(false);
		expect(data.settings.dbFolders).toEqual(["DB"]);
	});
});

describe("new table", () => {
	it("validates names", () => {
		const existing = ["clienti", "Ordini", "immagine.png"];
		expect(validateTableName("fatture", existing)).toBeNull();
		expect(validateTableName("  fatture  ", existing)).toBeNull();
		expect(validateTableName("", existing)).not.toBeNull();
		expect(validateTableName("   ", existing)).not.toBeNull();
		expect(validateTableName("a.b", existing)).toMatch(/\./);
		expect(validateTableName("clienti", existing)).toMatch(/già/);
		expect(validateTableName("ordini", existing)).toMatch(/già/); // case-insensitive
		for (const bad of ["a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a|b", "a#b", "a^b", "a[b]"]) {
			expect(validateTableName(bad, existing)).not.toBeNull();
		}
	});

	it("fills every {{name}} placeholder", () => {
		expect(fillTemplate("# {{name}}\n\n{{name}} {{ name }}", "clienti")).toBe("# clienti\n\nclienti {{ name }}");
	});

	it("builds the note path, also for the vault root", () => {
		expect(tableNotePath("DB/Vendite", "clienti")).toBe("DB/Vendite/clienti.md");
		expect(tableNotePath("/", "clienti")).toBe("clienti.md");
	});
});
