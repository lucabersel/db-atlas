// New table name validation and template filling. Pure.

export type TableNameError = "name.empty" | "name.dot" | "name.chars" | "name.duplicate";

/** Characters not allowed in file names on some platforms or that break Obsidian links. */
const FORBIDDEN_CHARS = /[\\/:*?"<>|#^[\]]/;

/**
 * Translation key of the error for an invalid new table name, or null if valid.
 * Duplicates are checked case-insensitively: "Clienti.md" and "clienti.md" collide on Windows/macOS.
 */
export function validateTableName(name: string, existingNames: string[]): TableNameError | null {
	const n = name.trim();
	if (n === "") return "name.empty";
	if (n.includes(".")) return "name.dot";
	if (FORBIDDEN_CHARS.test(n)) return "name.chars";
	const lower = n.toLowerCase();
	if (existingNames.some((e) => e.toLowerCase() === lower)) return "name.duplicate";
	return null;
}

/** Replaces every `{{name}}` in the template. */
export function fillTemplate(template: string, name: string): string {
	return template.split("{{name}}").join(name);
}

/** Vault path of a table note in a DB folder (the vault root is "/"). */
export function tableNotePath(folder: string, name: string): string {
	return folder === "/" ? `${name}.md` : `${folder}/${name}.md`;
}
