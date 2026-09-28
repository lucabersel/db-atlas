// New table name validation and template filling. Pure.

/** Characters not allowed in file names on some platforms or that break Obsidian links. */
const FORBIDDEN_CHARS = /[\\/:*?"<>|#^[\]]/;

/**
 * Error message for an invalid new table name, or null if valid.
 * Duplicates are checked case-insensitively: "Clienti.md" and "clienti.md" collide on Windows/macOS.
 */
export function validateTableName(name: string, existingNames: string[]): string | null {
	const n = name.trim();
	if (n === "") return "Inserisci un nome.";
	if (n.includes(".")) return "Il nome non può contenere \".\".";
	if (FORBIDDEN_CHARS.test(n)) return "Il nome contiene caratteri non ammessi: \\ / : * ? \" < > | # ^ [ ]";
	const lower = n.toLowerCase();
	if (existingNames.some((e) => e.toLowerCase() === lower)) return `Esiste già una nota "${n}" in questa cartella.`;
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
