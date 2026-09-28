import { describe, expect, it } from "vitest";
import { buildSchema, splitRef } from "../src/model/buildSchema";
import { parseColumn } from "../src/model/parseColumn";
import { parseTable } from "../src/model/parseTable";
import type { Column, Rel, Schema, Table } from "../src/types";

const col = (value: unknown, key = "col_x") => parseColumn(key, value, "t");
const json = (obj: unknown) => JSON.stringify(obj);
const table = (name: string, fm: Record<string, unknown>) => parseTable(name, `DB/${name}.md`, fm);

function schemaOf(tables: Record<string, Record<string, unknown>>): Schema {
	return buildSchema(
		"DB",
		Object.entries(tables).map(([name, fm]) => table(name, fm)),
	);
}

function column(schema: Schema, tableName: string, colName: string): Column {
	const t = schema.tables.find((x) => x.name === tableName);
	const c = t?.columns.find((x) => x.name === colName);
	if (!c) throw new Error(`missing ${tableName}.${colName}`);
	return c;
}

const levels = (c: Column | Table) => c.issues.map((i) => i.level);

describe("parseColumn", () => {
	it("parses a full JSON definition", () => {
		const c = col(json({ type: "int", pk: true, notNull: true, unique: true, increment: true, default: 0 }), "col_id");
		expect(c).toEqual({
			name: "id",
			valid: true,
			type: "int",
			pk: true,
			notNull: true,
			unique: true,
			increment: true,
			default: 0,
			issues: [],
		});
	});

	it("defaults boolean flags to false and has no ref/rel", () => {
		const c = col(json({ type: "varchar(20)" }));
		expect(c).toMatchObject({ valid: true, pk: false, notNull: false, unique: false, increment: false });
		expect(c.ref).toBeUndefined();
		expect(c.rel).toBeUndefined();
		expect(c.default).toBeUndefined();
	});

	it("accepts string, number and boolean defaults only", () => {
		expect(col(json({ type: "t", default: "bozza" })).default).toBe("bozza");
		expect(col(json({ type: "t", default: 1.5 })).default).toBe(1.5);
		expect(col(json({ type: "t", default: false })).default).toBe(false);
		expect(col(json({ type: "t", default: { a: 1 } })).default).toBeUndefined();
	});

	it("only treats boolean true as a set flag", () => {
		const c = col(json({ type: "int", pk: "true", notNull: 1 }));
		expect(c.pk).toBe(false);
		expect(c.notNull).toBe(false);
	});

	it("ignores unknown keys without issues", () => {
		const c = col(json({ type: "int", comment: "x", foo: [1, 2] }));
		expect(c.valid).toBe(true);
		expect(c.issues).toEqual([]);
		expect(c).not.toHaveProperty("comment");
	});

	// §3: JSON non valido
	it("marks invalid JSON as an error column keeping the name", () => {
		const c = col('{"type":"int",pk:true', "col_rotto");
		expect(c.name).toBe("rotto");
		expect(c.valid).toBe(false);
		expect(c.type).toBe("");
		expect(c.issues).toEqual([{ level: "error", code: "issue.invalidJson", table: "t", column: "rotto" }]);
	});

	it("marks JSON that is not an object as an error", () => {
		for (const raw of ["42", '"int"', "[1]", "null"]) {
			expect(col(raw).valid).toBe(false);
		}
	});

	it("marks empty or non-string, non-object values as an error", () => {
		for (const raw of [null, undefined, 42, true, ["a"]]) {
			const c = col(raw);
			expect(c.valid).toBe(false);
			expect(levels(c)).toEqual(["error"]);
		}
	});

	// §3: type mancante
	it("treats a missing or empty type like invalid JSON", () => {
		for (const def of [{ notNull: true }, { type: "" }, { type: "  " }, { type: 3 }]) {
			const c = col(json(def));
			expect(c.valid).toBe(false);
			expect(levels(c)).toEqual(["error"]);
		}
	});

	// §2.2 robustezza: valore YAML oggetto (apici dimenticati)
	it("accepts a YAML object value with a warning", () => {
		const c = col({ type: "varchar(20)", notNull: true }, "col_oggetto");
		expect(c.valid).toBe(true);
		expect(c.type).toBe("varchar(20)");
		expect(c.notNull).toBe(true);
		expect(levels(c)).toEqual(["warning"]);
	});

	it("still reports a missing type in a YAML object value as an error", () => {
		const c = col({ notNull: true });
		expect(c.valid).toBe(false);
		expect(levels(c)).toEqual(["warning", "error"]);
	});

	// §2.2: rel default e valori
	it("defaults rel to > when ref is present", () => {
		expect(col(json({ type: "int", ref: "a.id" })).rel).toBe(">");
	});

	it.each<Rel>([">", "<", "-", "<>"])("keeps rel %s", (rel) => {
		const c = col(json({ type: "int", ref: "a.id", rel }));
		expect(c.rel).toBe(rel);
		expect(c.issues).toEqual([]);
	});

	// §3: rel non valido
	it("replaces an invalid rel with > and warns", () => {
		for (const rel of ["=>", "", "many", 1, null]) {
			const c = col(json({ type: "int", ref: "a.id", rel }));
			expect(c.valid).toBe(true);
			expect(c.rel).toBe(">");
			expect(levels(c)).toEqual(["warning"]);
		}
	});

	it("ignores rel when there is no ref", () => {
		const c = col(json({ type: "int", rel: "<" }));
		expect(c.rel).toBeUndefined();
	});

	it("keeps non-string refs so they are reported as malformed", () => {
		expect(col(json({ type: "int", ref: 5 })).ref).toBe("5");
	});
});

describe("parseTable", () => {
	it("extracts metadata and columns in frontmatter order, ignoring other properties", () => {
		const t = table("clienti", {
			table_color: "#2E7D32",
			table_description: "Anagrafica clienti",
			col_id: json({ type: "int", pk: true }),
			tags: ["db"],
			col_nome: json({ type: "varchar(120)" }),
			col_agente_id: json({ type: "int", ref: "agenti.id" }),
			altro: "x",
		});
		expect(t.name).toBe("clienti");
		expect(t.path).toBe("DB/clienti.md");
		expect(t.color).toBe("#2E7D32");
		expect(t.description).toBe("Anagrafica clienti");
		expect(t.columns.map((c) => c.name)).toEqual(["id", "nome", "agente_id"]);
		expect(t.referenceable).toBe(true);
		expect(t.issues).toEqual([]);
	});

	it("leaves empty or non-string metadata undefined", () => {
		const t = table("a", { table_color: "", table_description: 3, col_id: json({ type: "int" }) });
		expect(t.color).toBeUndefined();
		expect(t.description).toBeUndefined();
	});

	it("supports composite primary keys", () => {
		const t = table("righe", {
			col_ordine_id: json({ type: "int", pk: true }),
			col_riga_num: json({ type: "smallint", pk: true }),
		});
		expect(t.columns.filter((c) => c.pk).map((c) => c.name)).toEqual(["ordine_id", "riga_num"]);
		expect(t.issues).toEqual([]);
	});

	// §3: nota senza alcun col_*
	it("warns when there are no columns", () => {
		for (const fm of [{ table_description: "x", tags: ["db"] }, undefined, null]) {
			const t = parseTable("vuota", "DB/vuota.md", fm);
			expect(t.columns).toEqual([]);
			expect(levels(t)).toEqual(["warning"]);
		}
	});

	it("ignores a bare col_ key", () => {
		const t = table("a", { col_: json({ type: "int" }), col_id: json({ type: "int" }) });
		expect(t.columns.map((c) => c.name)).toEqual(["id"]);
	});

	// §3: nome nota contenente "."
	it("warns and marks non-referenceable when the name contains a dot", () => {
		const t = table("nome.con.punto", { col_id: json({ type: "int" }) });
		expect(t.referenceable).toBe(false);
		expect(levels(t)).toEqual(["warning"]);
		expect(t.columns).toHaveLength(1);
	});

	// §3: un errore non impedisce il resto
	it("renders the other columns when one is invalid", () => {
		const t = table("t", {
			col_id: json({ type: "int" }),
			col_rotto: "{nope",
			col_ok: json({ type: "text" }),
		});
		expect(t.columns.map((c) => [c.name, c.valid])).toEqual([
			["id", true],
			["rotto", false],
			["ok", true],
		]);
		expect(t.issues).toEqual([]);
	});
});

describe("splitRef", () => {
	it("requires exactly one dot with both sides non-empty", () => {
		expect(splitRef("agenti.id")).toEqual({ table: "agenti", column: "id" });
		for (const ref of ["agenti", "a.b.c", ".id", "agenti.", "", "."]) {
			expect(splitRef(ref)).toBeNull();
		}
	});
});

describe("buildSchema", () => {
	const base = { col_id: json({ type: "int", pk: true }), col_codice: json({ type: "varchar(10)" }) };

	it("creates a relation for a valid ref", () => {
		const s = schemaOf({
			agenti: base,
			clienti: { col_id: json({ type: "int" }), col_agente_id: json({ type: "int", ref: "agenti.id" }) },
		});
		expect(s.folder).toBe("DB");
		expect(s.relations).toEqual([
			{ fromTable: "clienti", fromColumn: "agente_id", toTable: "agenti", toColumn: "id", rel: ">", fkNotNull: false },
		]);
		expect(column(s, "clienti", "agente_id").issues).toEqual([]);
	});

	it.each<Rel>([">", "<", "-", "<>"])("carries rel %s into the relation", (rel) => {
		const s = schemaOf({ a: base, b: { col_a_id: json({ type: "int", ref: "a.id", rel }) } });
		expect(s.relations.map((r) => r.rel)).toEqual([rel]);
	});

	it("carries notNull of the FK column", () => {
		const s = schemaOf({
			a: base,
			b: {
				col_req: json({ type: "int", notNull: true, ref: "a.id" }),
				col_opt: json({ type: "int", ref: "a.id" }),
			},
		});
		expect(s.relations.map((r) => [r.fromColumn, r.fkNotNull])).toEqual([
			["req", true],
			["opt", false],
		]);
	});

	it("supports self-references", () => {
		const s = schemaOf({ agenti: { ...base, col_responsabile_id: json({ type: "int", ref: "agenti.id" }) } });
		expect(s.relations).toEqual([
			expect.objectContaining({ fromTable: "agenti", toTable: "agenti", toColumn: "id" }),
		]);
	});

	it("uses > for an invalid rel and keeps the relation", () => {
		const s = schemaOf({ a: base, b: { col_a_id: json({ type: "int", ref: "a.id", rel: "=>" }) } });
		expect(s.relations.map((r) => r.rel)).toEqual([">"]);
		expect(levels(column(s, "b", "a_id"))).toEqual(["warning"]);
	});

	// §3: ref verso tabella/campo inesistente
	it("warns without a relation when the target table does not exist", () => {
		const s = schemaOf({ b: { col_x: json({ type: "int", ref: "fantasma.id" }) } });
		expect(s.relations).toEqual([]);
		expect(levels(column(s, "b", "x"))).toEqual(["warning"]);
	});

	it("warns without a relation when the target column does not exist", () => {
		const s = schemaOf({ a: base, b: { col_x: json({ type: "int", ref: "a.fantasma" }) } });
		expect(s.relations).toEqual([]);
		expect(levels(column(s, "b", "x"))).toEqual(["warning"]);
	});

	// §3: ref verso tabella di un'altra cartella-DB (lo schema contiene solo la cartella corrente)
	it("treats a ref to a table outside the folder as broken", () => {
		const other = buildSchema("Altro", [table("clienti", base)]);
		const s = buildSchema("DB", [table("ordini", { col_cliente_id: json({ type: "int", ref: "clienti.id" }) })]);
		expect(other.tables).toHaveLength(1);
		expect(s.relations).toEqual([]);
		expect(levels(column(s, "ordini", "cliente_id"))).toEqual(["warning"]);
	});

	// §3: ref malformato
	it.each(["base", "schema.base.id", "", ".id", "base.", "5"])("treats malformed ref %j as broken", (ref) => {
		const s = schemaOf({ base, b: { col_x: json({ type: "int", ref: ref === "5" ? 5 : ref }) } });
		expect(s.relations).toEqual([]);
		expect(levels(column(s, "b", "x"))).toEqual(["warning"]);
	});

	// §3: case-sensitive
	it("resolves table and column names case-sensitively", () => {
		const s = schemaOf({
			base,
			b: {
				col_t: json({ type: "int", ref: "Base.id" }),
				col_c: json({ type: "int", ref: "base.ID" }),
				col_ok: json({ type: "int", ref: "base.id" }),
			},
		});
		expect(s.relations.map((r) => r.fromColumn)).toEqual(["ok"]);
		expect(levels(column(s, "b", "t"))).toEqual(["warning"]);
		expect(levels(column(s, "b", "c"))).toEqual(["warning"]);
	});

	// §3: nome nota contenente "." → non referenziabile
	it("does not resolve refs to a table whose name contains a dot", () => {
		const s = schemaOf({
			"nome.con.punto": base,
			b: { col_x: json({ type: "int", ref: "nome.con.punto.id" }) },
		});
		expect(s.relations).toEqual([]);
		expect(levels(column(s, "b", "x"))).toEqual(["warning"]);
	});

	it("ignores refs on invalid columns and keeps table-level issues", () => {
		const s = schemaOf({ vuota: {}, b: { col_x: "{broken" } });
		expect(s.relations).toEqual([]);
		expect(levels(column(s, "b", "x"))).toEqual(["error"]);
		expect(levels(s.tables[0])).toEqual(["warning"]);
	});

	it("does not mutate the input tables", () => {
		const input = [table("b", { col_x: json({ type: "int", ref: "fantasma.id" }) })];
		buildSchema("DB", input);
		expect(input[0].columns[0].issues).toEqual([]);
	});

	// §3: un errore in una nota non impedisce il rendering delle altre
	it("resolves the valid part of a folder with broken notes", () => {
		const s = schemaOf({
			base,
			rotta: { col_x: "{nope", col_y: json({ type: "int", ref: "base.id" }) },
			vuota: {},
			"a.b": base,
		});
		expect(s.tables.map((t) => t.name)).toEqual(["base", "rotta", "vuota", "a.b"]);
		expect(s.relations).toEqual([expect.objectContaining({ fromTable: "rotta", fromColumn: "y", toTable: "base" })]);
	});
});
