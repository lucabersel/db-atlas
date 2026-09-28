import { describe, expect, it } from "vitest";
import { parseColumn } from "../src/model/parseColumn";
import { parseTable } from "../src/model/parseTable";
import { appendHeading, findHeadingLine } from "../src/sync/markdownHeadings";
import { columnTooltip, tableTooltip } from "../src/view/tooltipText";

const note = [
	"---",
	"col_id: '{\"type\":\"int\"}'",
	"## id",
	"---",
	"",
	"Intro",
	"",
	"```sql",
	"## agente_id",
	"```",
	"### agente_id",
	"## Agente_id",
	"## agente_id ##",
	"testo",
].join("\n");

describe("findHeadingLine", () => {
	it("finds an exact level-2 heading, skipping frontmatter, code blocks, other levels and case", () => {
		expect(findHeadingLine(note, "agente_id")).toBe(12);
		expect(findHeadingLine(note, "Agente_id")).toBe(11);
	});

	it("ignores headings inside the frontmatter", () => {
		expect(findHeadingLine(note, "id")).toBe(-1);
	});

	it("returns -1 when missing", () => {
		expect(findHeadingLine(note, "nope")).toBe(-1);
		expect(findHeadingLine("", "x")).toBe(-1);
	});

	it("handles CRLF and extra spaces", () => {
		expect(findHeadingLine("a\r\n##   nome  \r\nb", "nome")).toBe(1);
	});

	it("does not match a heading only prefixed by the name", () => {
		expect(findHeadingLine("## id_cliente", "id")).toBe(-1);
	});
});

describe("appendHeading", () => {
	it("appends after a blank line and returns the heading line", () => {
		const r = appendHeading("---\na: 1\n---\n\nTesto", "agente_id");
		expect(r.content).toBe("---\na: 1\n---\n\nTesto\n\n## agente_id\n");
		expect(r.line).toBe(6);
		expect(findHeadingLine(r.content, "agente_id")).toBe(r.line);
	});

	it("does not add extra blank lines when the note already ends with one", () => {
		const r = appendHeading("Testo\n\n", "x");
		expect(r.content).toBe("Testo\n\n## x\n");
		expect(r.line).toBe(2);
	});

	it("works on an empty note and keeps CRLF", () => {
		expect(appendHeading("", "x")).toEqual({ content: "## x\n", line: 0 });
		const r = appendHeading("a\r\nb", "x");
		expect(r.content).toBe("a\r\nb\r\n\r\n## x\r\n");
		expect(findHeadingLine(r.content, "x")).toBe(r.line);
	});

	it("is idempotent when combined with findHeadingLine (heading created only once)", () => {
		const once = appendHeading("Testo", "x").content;
		expect(findHeadingLine(once, "x")).toBeGreaterThanOrEqual(0);
	});
});

describe("tooltips", () => {
	const json = (o: unknown) => JSON.stringify(o);

	it("formats every attribute in the PROJECT.md order", () => {
		const c = parseColumn(
			"col_x",
			json({ type: "int", pk: true, notNull: true, unique: true, increment: true, default: 0, ref: "agenti.id" }),
			"t",
		);
		expect(columnTooltip(c)).toEqual(["int · PK · NOT NULL · UNIQUE · AI · default: 0 · → agenti.id"]);
	});

	it("shows just the type for a plain column", () => {
		expect(columnTooltip(parseColumn("col_x", json({ type: "varchar(20)" }), "t"))).toEqual(["varchar(20)"]);
	});

	it("adds one line per issue, and only issues for invalid columns", () => {
		const warn = parseColumn("col_x", json({ type: "int", ref: "a.id", rel: "=>" }), "t");
		const lines = columnTooltip(warn);
		expect(lines).toHaveLength(2);
		expect(lines[1].startsWith("⚠️")).toBe(true);

		const bad = columnTooltip(parseColumn("col_x", "{nope", "t"));
		expect(bad).toHaveLength(1);
		expect(bad[0].startsWith("❌")).toBe(true);
	});

	it("lists table issues only", () => {
		expect(tableTooltip(parseTable("a", "a.md", { col_id: json({ type: "int" }) }))).toEqual([]);
		expect(tableTooltip(parseTable("vuota", "vuota.md", {}))).toHaveLength(1);
	});
});
