// Finding and appending `## campo` headings in a note's markdown. Pure.

const FRONTMATTER_FENCE = /^---\s*$/;
const CODE_FENCE = /^\s*(```|~~~)/;
const H2 = /^##[ \t]+(.*?)[ \t]*#*[ \t]*$/;

/**
 * 0-based line of the first level-2 heading whose text is exactly `name` (case-sensitive),
 * ignoring frontmatter and fenced code blocks. -1 if absent.
 */
export function findHeadingLine(content: string, name: string): number {
	const lines = content.split(/\r?\n/);
	let i = 0;
	if (lines.length > 0 && FRONTMATTER_FENCE.test(lines[0])) {
		const end = lines.findIndex((l, j) => j > 0 && FRONTMATTER_FENCE.test(l));
		if (end > 0) i = end + 1;
	}
	let fence: string | null = null;
	for (; i < lines.length; i++) {
		const line = lines[i];
		const f = CODE_FENCE.exec(line);
		if (f) {
			if (fence === null) fence = f[1];
			else if (f[1] === fence) fence = null;
			continue;
		}
		if (fence !== null) continue;
		const m = H2.exec(line);
		if (m && m[1] === name) return i;
	}
	return -1;
}

/** Appends `## name` at the end of the note, separated by a blank line. Returns the new content and the heading line. */
export function appendHeading(content: string, name: string): { content: string; line: number } {
	const eol = content.includes("\r\n") ? "\r\n" : "\n";
	let base = content;
	if (base !== "" && !base.endsWith("\n")) base += eol;
	if (base !== "" && !/(\r?\n){2}$/.test(base)) base += eol;
	const line = base === "" ? 0 : base.split(/\r?\n/).length - 1;
	return { content: `${base}## ${name}${eol}`, line };
}
