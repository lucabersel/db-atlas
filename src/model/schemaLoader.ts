// DB folder → Schema via the metadata cache, plus live updates. Not pure: uses Obsidian APIs.

import { App, Component, debounce, TAbstractFile, TFile, TFolder } from "obsidian";
import { parentPath } from "../data";
import type { Schema } from "../types";
import { buildSchema } from "./buildSchema";
import { parseTable } from "./parseTable";

const REFRESH_DEBOUNCE_MS = 200;

function getFolder(app: App, folderPath: string): TFolder | null {
	return folderPath === "/" ? app.vault.getRoot() : app.vault.getFolderByPath(folderPath);
}

function isTableNote(file: TAbstractFile): file is TFile {
	return file instanceof TFile && file.extension === "md";
}

/** Reads the direct `.md` children of a DB folder. Returns null if the folder does not exist. */
export function loadSchema(app: App, folderPath: string): Schema | null {
	const folder = getFolder(app, folderPath);
	if (!folder) return null;

	const tables = folder.children
		.filter(isTableNote)
		.sort((a, b) => a.basename.localeCompare(b.basename))
		.map((file) => parseTable(file.basename, file.path, app.metadataCache.getFileCache(file)?.frontmatter));

	return buildSchema(folderPath, tables);
}

/**
 * Keeps the Schema of one DB folder up to date. Changes to notes inside the folder
 * (frontmatter, create, delete, rename in/out) trigger a debounced reload.
 * Add it as a child of a loaded Component so its event handlers are released on unload.
 */
export class SchemaWatcher extends Component {
	private folderPath: string | null = null;
	private initialResolveSeen = false;
	private readonly scheduleRefresh = debounce(() => this.refresh(), REFRESH_DEBOUNCE_MS, true);

	constructor(
		private readonly app: App,
		private readonly onSchema: (schema: Schema | null) => void,
	) {
		super();
	}

	onload(): void {
		const { vault, metadataCache } = this.app;

		// Fires after the cache is updated (unlike vault 'modify', which fires before).
		this.registerEvent(metadataCache.on("changed", (file) => this.onFileEvent(file)));
		this.registerEvent(vault.on("create", (file) => this.onFileEvent(file)));
		this.registerEvent(vault.on("delete", (file) => this.onFileEvent(file)));
		this.registerEvent(
			vault.on("rename", (file, oldPath) => {
				if (this.folderPath === null) return;
				// Renamed inside, moved in, moved out, or the DB folder itself renamed/moved.
				if (
					this.isInFolder(file) ||
					(isTableNote(file) && parentPath(oldPath) === this.folderPath) ||
					oldPath === this.folderPath
				) {
					this.scheduleRefresh();
				}
			}),
		);
		// At startup some notes may not be cached yet: reload once when the first full resolve completes.
		this.registerEvent(
			metadataCache.on("resolved", () => {
				if (this.initialResolveSeen) return;
				this.initialResolveSeen = true;
				if (this.folderPath !== null) this.scheduleRefresh();
			}),
		);
	}

	onunload(): void {
		this.scheduleRefresh.cancel();
		this.folderPath = null;
	}

	/** Switches the watched folder and emits its schema immediately. `null` stops watching. */
	setFolder(folderPath: string | null): void {
		this.scheduleRefresh.cancel();
		this.folderPath = folderPath;
		if (folderPath !== null) this.refresh();
	}

	getFolder(): string | null {
		return this.folderPath;
	}

	/** Reloads and emits the schema of the current folder right away. */
	refresh(): void {
		if (this.folderPath === null) return;
		this.onSchema(loadSchema(this.app, this.folderPath));
	}

	private isInFolder(file: TAbstractFile): boolean {
		// Uses the path, not `file.parent`, which may already be null for deleted files.
		return isTableNote(file) && parentPath(file.path) === this.folderPath;
	}

	private onFileEvent(file: TAbstractFile): void {
		if (this.folderPath === null) return;
		if (this.isInFolder(file) || (file instanceof TFolder && file.path === this.folderPath)) {
			this.scheduleRefresh();
		}
	}
}
