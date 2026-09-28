import { afterEach, describe, expect, it } from "vitest";
import { AUTO_LANGUAGE, LANGUAGES, type MessageKey, resolveLanguage, setLanguage, t } from "../src/i18n";
import { en } from "../src/i18n/locales/en";

const keys = Object.keys(en) as MessageKey[];

/** Placeholder names used by a message (all plural forms). */
function placeholders(message: unknown): string[] {
	const texts = typeof message === "string" ? [message] : Object.values(message as Record<string, string>);
	const names = new Set<string>();
	for (const text of texts) for (const m of text.matchAll(/\{(\w+)\}/g)) names.add(m[1]);
	return [...names].sort();
}

afterEach(() => setLanguage("en"));

describe("translations", () => {
	it.each(LANGUAGES.map((l) => [l.code, l]))("%s has every key and no unknown ones", (_code, lang) => {
		expect(Object.keys(lang.messages).sort()).toEqual([...keys].sort());
	});

	it.each(LANGUAGES.map((l) => [l.code, l]))("%s keeps the placeholders of English", (_code, lang) => {
		for (const key of keys) {
			const message = lang.messages[key];
			// `{count}` may be omitted in a plural form that spells the number out (e.g. Arabic "one").
			const expected = placeholders(en[key]).filter((p) => p !== "count" || typeof message === "string");
			const actual = placeholders(message);
			for (const p of expected) expect(actual, `${lang.code} ${key}`).toContain(p);
			for (const p of actual) expect(placeholders(en[key]), `${lang.code} ${key}`).toContain(p);
		}
	});

	it.each(LANGUAGES.map((l) => [l.code, l]))("%s plural messages have an 'other' form", (_code, lang) => {
		for (const key of keys) {
			const message = lang.messages[key];
			if (typeof message === "object") expect(message.other, `${lang.code} ${key}`).toBeTruthy();
		}
	});
});

describe("resolveLanguage", () => {
	it("follows Obsidian in automatic mode, mapping regional variants", () => {
		expect(resolveLanguage(AUTO_LANGUAGE, "it")).toBe("it");
		expect(resolveLanguage(AUTO_LANGUAGE, "pt-BR")).toBe("pt");
		expect(resolveLanguage(AUTO_LANGUAGE, "zh-TW")).toBe("zh");
		expect(resolveLanguage(AUTO_LANGUAGE, "ko")).toBe("en");
		expect(resolveLanguage(AUTO_LANGUAGE, "")).toBe("en");
	});

	it("uses an explicit choice, falling back to automatic for unknown values", () => {
		expect(resolveLanguage("ja", "it")).toBe("ja");
		expect(resolveLanguage("xx", "de")).toBe("de");
	});
});

describe("t", () => {
	it("replaces placeholders and falls back to English", () => {
		setLanguage("it");
		expect(t("notice.folderMissing", { folder: "DB" })).toBe('DB Atlas: la cartella "DB" non esiste.');
		setLanguage("en");
		expect(t("view.folderEmpty", { folder: "Sales" })).toBe('Folder "Sales" contains no notes.');
		expect(t("settings.template.desc")).toContain("{{name}}"); // unknown placeholders are kept
	});

	it("chooses plural forms with the language rules", () => {
		setLanguage("en");
		expect(t("settings.folders.tableCount", { count: 1 })).toBe("1 table");
		expect(t("settings.folders.tableCount", { count: 3 })).toBe("3 tables");
		setLanguage("ru");
		expect(t("settings.folders.tableCount", { count: 1 })).toBe("1 таблица");
		expect(t("settings.folders.tableCount", { count: 3 })).toBe("3 таблицы");
		expect(t("settings.folders.tableCount", { count: 5 })).toBe("5 таблиц");
		setLanguage("ar");
		expect(t("settings.folders.tableCount", { count: 2 })).toBe("جدولان");
	});
});
