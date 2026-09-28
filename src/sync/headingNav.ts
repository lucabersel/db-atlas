// Opening a table note, or a column's `## campo` heading (created at the end of the note if missing).

import { App, Keymap, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { t } from "../i18n";
import { appendHeading, findHeadingLine } from "./markdownHeadings";

/**
 * Leaf honoring the standard modifiers (Ctrl/Cmd+click → new tab, etc.).
 * Never returns `avoid` (the diagram's own leaf), so a plain click does not replace the diagram.
 */
function targetLeaf(app: App, evt?: MouseEvent, avoid?: WorkspaceLeaf): WorkspaceLeaf {
	const mod = evt ? Keymap.isModEvent(evt) : false;
	if (mod) return app.workspace.getLeaf(mod);
	const leaf = app.workspace.getLeaf(false);
	return leaf === avoid ? app.workspace.getLeaf("tab") : leaf;
}

function getFile(app: App, path: string): TFile | null {
	const file = app.vault.getFileByPath(path);
	if (!file) new Notice(t("notice.noteMissing", { path }));
	return file;
}

/** Opens a file without replacing the diagram's leaf. */
export async function openFile(app: App, file: TFile, avoid?: WorkspaceLeaf): Promise<void> {
	await targetLeaf(app, undefined, avoid).openFile(file, { active: true });
}

export async function openTableNote(app: App, path: string, evt: MouseEvent, avoid?: WorkspaceLeaf): Promise<void> {
	const file = getFile(app, path);
	if (!file) return;
	await targetLeaf(app, evt, avoid).openFile(file, { active: true });
}

/**
 * Opens the note at `## column`. If the heading is missing it is appended at the end of the note
 * first; the check is repeated inside `vault.process`, so quick repeated clicks add it only once.
 */
export async function openColumnHeading(app: App, path: string, column: string, evt: MouseEvent, avoid?: WorkspaceLeaf): Promise<void> {
	const file = getFile(app, path);
	if (!file) return;

	let line = findHeadingLine(await app.vault.cachedRead(file), column);
	if (line < 0) {
		await app.vault.process(file, (data) => {
			line = findHeadingLine(data, column);
			if (line >= 0) return data;
			const appended = appendHeading(data, column);
			line = appended.line;
			return appended.content;
		});
	}
	await targetLeaf(app, evt, avoid).openFile(file, { active: true, eState: { line } });
}
