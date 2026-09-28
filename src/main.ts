import { debounce, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { normalizeData } from "./data";
import { setElkEngine } from "./layout/elkLayout";
import { createWorkerElk } from "./layout/elkWorker";
import { LayoutStore } from "./layout/layoutStore";
import { FolderPickerModal } from "./modals/FolderPickerModal";
import { NewTableModal } from "./modals/NewTableModal";
import { fillTemplate, tableNotePath } from "./model/tableName";
import { openFile } from "./sync/headingNav";
import { registerRenameHandler } from "./sync/renameHandler";
import { DbAtlasSettingTab } from "./settings";
import type { DbAtlasData, ViewLocation } from "./types";
import { DB_ATLAS_ICON, DbAtlasView, VIEW_TYPE_DB_ATLAS } from "./view/DbAtlasView";

/** Non-public API used to open the plugin's settings tab. */
interface AppWithSettings {
	setting?: { open(): void; openTabById(id: string): void };
}

export default class DbAtlasPlugin extends Plugin {
	data!: DbAtlasData;
	layoutStore!: LayoutStore;

	/** Debounced save for frequent changes (table positions). */
	readonly requestSave = debounce(() => void this.saveData(this.data), 1000, true);

	async onload() {
		this.data = normalizeData(await this.loadData());
		this.layoutStore = new LayoutStore(this.data, () => this.requestSave());
		setElkEngine(createWorkerElk);
		this.addSettingTab(new DbAtlasSettingTab(this.app, this));

		this.registerView(VIEW_TYPE_DB_ATLAS, (leaf) => new DbAtlasView(leaf, this));

		this.addRibbonIcon(DB_ATLAS_ICON, "Apri diagramma DB Atlas", () => void this.activateView());

		this.addCommand({ id: "open", name: "Apri diagramma", callback: () => void this.activateView() });
		this.addCommand({ id: "open-tab", name: "Apri diagramma in una tab", callback: () => void this.activateView("tab") });
		this.addCommand({ id: "open-right", name: "Apri diagramma nella sidebar destra", callback: () => void this.activateView("right") });
		this.addCommand({ id: "open-left", name: "Apri diagramma nella sidebar sinistra", callback: () => void this.activateView("left") });

		this.addCommand({ id: "new-table", name: "Nuova tabella", callback: () => this.newTable() });

		registerRenameHandler(this);
	}

	onunload() {
		this.requestSave.run();
		setElkEngine(null); // terminates the layout worker
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.data);
		for (const view of this.getViews()) view.onSettingsChanged();
	}

	openSettings(): void {
		const setting = (this.app as unknown as AppWithSettings).setting;
		if (!setting) return;
		setting.open();
		setting.openTabById(this.manifest.id);
	}

	getViews(): DbAtlasView[] {
		return this.app.workspace
			.getLeavesOfType(VIEW_TYPE_DB_ATLAS)
			.map((leaf) => leaf.view)
			.filter((view): view is DbAtlasView => view instanceof DbAtlasView);
	}

	/**
	 * Shows the diagram. Without `location` an already open view is revealed wherever it is;
	 * with a forced location an open view elsewhere is moved there (never duplicated).
	 */
	async activateView(location?: ViewLocation): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_DB_ATLAS);

		let leaf = existing.find((l) => location === undefined || this.leafLocation(l) === location) ?? null;
		if (!leaf) {
			for (const l of existing) l.detach();
			leaf = this.createLeaf(location ?? this.data.settings.viewLocation);
			if (!leaf) {
				new Notice("DB Atlas: impossibile aprire la vista in quella posizione");
				return;
			}
			await leaf.setViewState({ type: VIEW_TYPE_DB_ATLAS, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	/** `new-table`: in the folder shown by an open diagram, otherwise in a folder picked by the user. */
	private newTable(): void {
		const viewFolder = this.getViews()
			.map((v) => v.getFolder())
			.find((f): f is string => f !== null);
		if (viewFolder) {
			this.promptNewTable(viewFolder);
			return;
		}
		const folders = this.data.settings.dbFolders.filter((f) => this.getDbFolder(f) !== null);
		if (folders.length === 0) {
			new Notice("DB Atlas: nessuna cartella-DB configurata (vedi impostazioni).");
			return;
		}
		new FolderPickerModal(this.app, folders, (folder) => this.promptNewTable(folder)).open();
	}

	private getDbFolder(path: string) {
		return path === "/" ? this.app.vault.getRoot() : this.app.vault.getFolderByPath(path);
	}

	private promptNewTable(folderPath: string): void {
		const folder = this.getDbFolder(folderPath);
		if (!folder) {
			new Notice(`DB Atlas: la cartella "${folderPath}" non esiste.`);
			return;
		}
		// Every direct child name counts (not only .md), so the new file cannot collide.
		const existing = folder.children.map((f) => (f instanceof TFile && f.extension === "md" ? f.basename : f.name));
		new NewTableModal(this.app, folderPath, existing, (name) => {
			void this.createTable(folderPath, name);
		}).open();
	}

	private async createTable(folder: string, name: string): Promise<void> {
		try {
			const file = await this.app.vault.create(tableNotePath(folder, name), fillTemplate(this.data.settings.newTableTemplate, name));
			await openFile(this.app, file, this.getViews()[0]?.leaf);
		} catch (err) {
			console.error("[db-atlas] could not create table note", err);
			new Notice(`DB Atlas: impossibile creare la tabella "${name}".`);
		}
	}

	private createLeaf(location: ViewLocation): WorkspaceLeaf | null {
		const { workspace } = this.app;
		switch (location) {
			case "right":
				return workspace.getRightLeaf(false);
			case "left":
				return workspace.getLeftLeaf(false);
			case "tab":
				return workspace.getLeaf("tab");
		}
	}

	private leafLocation(leaf: WorkspaceLeaf): ViewLocation {
		const root = leaf.getRoot();
		if (root === this.app.workspace.rightSplit) return "right";
		if (root === this.app.workspace.leftSplit) return "left";
		return "tab";
	}
}
