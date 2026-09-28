// Keeps refs, layouts and settings in sync when table notes or DB folders are renamed/moved.

import { Notice, TAbstractFile, TFile, TFolder } from "obsidian";
import { parentPath } from "../data";
import type DbAtlasPlugin from "../main";
import { t } from "../i18n";
import { hasRefsTo, renameFolderInData, renameTableInLayouts, rewriteFrontmatterRefs } from "./renameLogic";

function tableName(path: string): string {
	const file = path.slice(path.lastIndexOf("/") + 1);
	return file.endsWith(".md") ? file.slice(0, -3) : file;
}

export function registerRenameHandler(plugin: DbAtlasPlugin): void {
	plugin.registerEvent(
		plugin.app.vault.on("rename", (file, oldPath) => {
			handleRename(plugin, file, oldPath).catch((err) => console.error("[db-atlas] rename sync failed", err));
		}),
	);
}

async function handleRename(plugin: DbAtlasPlugin, file: TAbstractFile, oldPath: string): Promise<void> {
	// DB folder (or one of its ancestors) renamed/moved: settings, layouts, lastFolder.
	if (file instanceof TFolder) {
		if (renameFolderInData(plugin.data, oldPath, file.path)) await plugin.saveSettings();
		return;
	}

	if (!(file instanceof TFile) || file.extension !== "md" || !oldPath.endsWith(".md")) return;
	const folder = parentPath(file.path);
	// Moved into/out of a DB folder: nothing to rewrite (refs to a moved-out table just become broken).
	if (parentPath(oldPath) !== folder || !plugin.data.settings.dbFolders.includes(folder)) return;

	const oldName = tableName(oldPath);
	const newName = file.basename;
	if (oldName === newName) return;

	// Must happen synchronously in the event, before the view reloads the schema and prunes old positions.
	if (renameTableInLayouts(plugin.data, folder, oldName, newName)) plugin.requestSave();

	// Names with "." are not referenceable: rewriting refs to or from them would not fix anything.
	if (oldName.includes(".") || newName.includes(".")) return;
	await rewriteRefsInFolder(plugin, folder, oldName, newName);
}

/** Rewrites refs to `oldName` in every note of the folder (the renamed note too, for self-references). */
async function rewriteRefsInFolder(plugin: DbAtlasPlugin, folderPath: string, oldName: string, newName: string): Promise<void> {
	const { app } = plugin;
	const folder = folderPath === "/" ? app.vault.getRoot() : app.vault.getFolderByPath(folderPath);
	if (!folder) return;

	let updated = 0;
	let failed = 0;
	for (const child of folder.children) {
		if (!(child instanceof TFile) || child.extension !== "md") continue;
		if (!hasRefsTo(app.metadataCache.getFileCache(child)?.frontmatter, oldName)) continue;
		try {
			await app.fileManager.processFrontMatter(child, (fm: Record<string, unknown>) => {
				if (rewriteFrontmatterRefs(fm, oldName, newName)) updated++;
			});
		} catch (err) {
			failed++;
			console.error(`[db-atlas] could not update refs in ${child.path}`, err);
		}
	}

	if (updated > 0) new Notice(t("notice.refsUpdated", { table: oldName, count: updated }));
	if (failed > 0) new Notice(t("notice.refsFailed", { count: failed }));
}
