import { describe, expect, it } from "vitest";
import { defaultData, defaultTableTemplate, moveItem, normalizeData, normalizeFolderPath, tableTemplate } from "../src/data";
import { setLanguage } from "../src/i18n";

describe("normalizeFolderPath", () => {
	it("strips surrounding slashes and whitespace", () => {
		expect(normalizeFolderPath(" /Gestionale/ ")).toBe("Gestionale");
		expect(normalizeFolderPath("DB//Vendite/")).toBe("DB/Vendite");
		expect(normalizeFolderPath("DB\\Vendite")).toBe("DB/Vendite");
	});

	it("maps empty paths to the vault root", () => {
		expect(normalizeFolderPath("")).toBe("/");
		expect(normalizeFolderPath("/")).toBe("/");
	});
});

describe("moveItem", () => {
	it("moves an element up or down without mutating the input", () => {
		const items = ["a", "b", "c"];
		expect(moveItem(items, 2, -1)).toEqual(["a", "c", "b"]);
		expect(moveItem(items, 0, 1)).toEqual(["b", "a", "c"]);
		expect(items).toEqual(["a", "b", "c"]);
	});

	it("clamps at the ends and ignores invalid indexes", () => {
		expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
		expect(moveItem(["a", "b"], 1, 5)).toEqual(["a", "b"]);
		expect(moveItem(["a", "b"], 7, -1)).toEqual(["a", "b"]);
	});
});

describe("table template", () => {
	it("uses the built-in template in the current language when none is customized", () => {
		setLanguage("it");
		expect(defaultTableTemplate()).toContain("Chiave primaria.");
		setLanguage("en");
		expect(defaultTableTemplate()).toContain("Primary key.");
		expect(tableTemplate(defaultData().settings)).toBe(defaultTableTemplate());
		expect(tableTemplate({ ...defaultData().settings, newTableTemplate: "# {{name}}" })).toBe("# {{name}}");
	});

	it("treats the template saved by earlier versions as the built-in one", () => {
		const legacy = `---
table_description: ""
col_id: '{"type":"int","pk":true,"increment":true}'
---

# {{name}}

## id
Chiave primaria.
`;
		expect(normalizeData({ settings: { newTableTemplate: legacy } }).settings.newTableTemplate).toBe("");
	});
});

describe("normalizeData", () => {
	it("returns defaults for missing or non-object data", () => {
		for (const raw of [null, undefined, 42, "x", []]) {
			expect(normalizeData(raw)).toEqual(defaultData());
		}
	});

	it("uses the default template and tab location", () => {
		const d = normalizeData({});
		expect(d.settings).toEqual({ dbFolders: [], language: "auto", viewLocation: "tab", newTableTemplate: "" });
		expect(d.layouts).toEqual({});
		expect(d.lastFolder).toBeUndefined();
	});

	it("does not share the dbFolders array between calls", () => {
		const a = normalizeData({});
		a.settings.dbFolders.push("X");
		expect(normalizeData({}).settings.dbFolders).toEqual([]);
	});

	it("keeps valid stored values", () => {
		const raw = {
			settings: { dbFolders: ["Gestionale", "Altro/DB"], language: "it", viewLocation: "right", newTableTemplate: "# {{name}}" },
			lastFolder: "Gestionale",
			layouts: { Gestionale: { tables: { clienti: { x: 10, y: -20.5 } } } },
		};
		expect(normalizeData(raw)).toEqual(raw);
	});

	it("merges partial settings with defaults", () => {
		const d = normalizeData({ settings: { viewLocation: "left" } });
		expect(d.settings.viewLocation).toBe("left");
		expect(d.settings.dbFolders).toEqual([]);
		expect(d.settings.newTableTemplate).toBe("");
	});

	it("drops values of the wrong type", () => {
		const d = normalizeData({
			settings: { dbFolders: "Gestionale", viewLocation: "bottom", newTableTemplate: 3 },
			lastFolder: 7,
			layouts: "nope",
		});
		expect(d).toEqual(defaultData());
	});

	it("cleans, normalizes and deduplicates folders", () => {
		const d = normalizeData({ settings: { dbFolders: ["Gestionale", "/Gestionale/", 5, "", "  ", "DB/"] } });
		expect(d.settings.dbFolders).toEqual(["Gestionale", "DB"]);
	});

	it("keeps only finite positions in layouts", () => {
		const d = normalizeData({
			layouts: {
				"Gestionale/": {
					tables: { ok: { x: 1, y: 2 }, nan: { x: NaN, y: 0 }, str: { x: "1", y: 2 }, missing: { x: 1 } },
				},
				broken: { tables: null },
				alsoBroken: 3,
			},
		});
		expect(d.layouts).toEqual({
			Gestionale: { tables: { ok: { x: 1, y: 2 } } },
			broken: { tables: {} },
			alsoBroken: { tables: {} },
		});
	});
});
