import { ItemView, Menu, setIcon, WorkspaceLeaf } from "obsidian";
import { t } from "../i18n";
import type DbAtlasPlugin from "../main";
import { SchemaWatcher } from "../model/schemaLoader";
import type { Schema } from "../types";
import { openColumnHeading, openTableNote } from "../sync/headingNav";
import { Diagram } from "./diagram";

export const VIEW_TYPE_DB_ATLAS = "db-atlas-view";
export const DB_ATLAS_ICON = "database";

export class DbAtlasView extends ItemView {
	private toolbarEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private messageEl!: HTMLElement;
	private diagram!: Diagram;
	private zoomButtons: HTMLButtonElement[] = [];
	/** Set when the folder changes: the next schema is fitted to the view. */
	private needsFit = true;
	/** Folder picker: a button opening an Obsidian menu (native <select> options cannot be styled). */
	private folderButton: HTMLButtonElement | null = null;
	private folderLabelEl: HTMLElement | null = null;
	/** Folder list the toolbar was built with, to detect settings changes. */
	private renderedFolders = "";
	private watcher!: SchemaWatcher;
	private folder: string | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: DbAtlasPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_DB_ATLAS;
	}

	getDisplayText(): string {
		return "DB Atlas";
	}

	getIcon(): string {
		return DB_ATLAS_ICON;
	}

	/** Folder currently shown, used by the `new-table` command. */
	getFolder(): string | null {
		return this.folder;
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("dba-view");
		this.toolbarEl = this.contentEl.createDiv({ cls: "dba-toolbar" });
		this.bodyEl = this.contentEl.createDiv({ cls: "dba-body" });
		this.diagram = new Diagram(
			this.bodyEl,
			this.plugin.layoutStore,
			{
				onTableClick: (table, evt) => void openTableNote(this.app, table.path, evt, this.leaf),
				onColumnClick: (table, column, evt) => void openColumnHeading(this.app, table.path, column.name, evt, this.leaf),
			},
		);
		this.messageEl = this.bodyEl.createDiv({ cls: "dba-empty" });
		this.registerEvent(this.app.workspace.on("css-change", () => this.diagram.refreshStyles()));
		this.watcher = this.addChild(new SchemaWatcher(this.app, (schema) => this.onSchema(schema)));
		this.render();
	}

	async onClose(): Promise<void> {
		this.watcher.setFolder(null);
		this.diagram.destroy();
		this.contentEl.empty();
	}

	onResize(): void {
		this.diagram.onResize();
	}

	/** Called by the plugin when the interface language changes. */
	onLanguageChanged(): void {
		this.diagram.refreshLanguage();
		this.render();
		this.watcher.refresh(); // re-shows the current message, if any
	}

	/** Called by the plugin whenever settings are saved. */
	onSettingsChanged(): void {
		const folders = this.plugin.data.settings.dbFolders;
		const unchanged =
			this.folderButton !== null && this.folder !== null && folders.includes(this.folder) && this.renderedFolders === folders.join("\n");
		if (!unchanged) this.render();
	}

	/** Rebuilds toolbar and body from the current settings. */
	private render(): void {
		const folders = this.plugin.data.settings.dbFolders;
		this.toolbarEl.empty();
		this.folderButton = null;
		this.folderLabelEl = null;
		this.renderedFolders = folders.join("\n");
		this.zoomButtons = [];

		if (folders.length === 0) {
			this.setFolder(null);
			this.renderNoFolders();
			return;
		}

		const last = this.plugin.data.lastFolder;
		const selected = this.folder !== null && folders.includes(this.folder) ? this.folder : last && folders.includes(last) ? last : folders[0];

		const button = this.toolbarEl.createEl("button", { cls: "dba-folder-button", attr: { "aria-label": t("view.folderMenu"), "aria-haspopup": "menu" } });
		setIcon(button.createSpan({ cls: "dba-folder-button-icon" }), "database");
		this.folderLabelEl = button.createSpan({ cls: "dba-folder-button-label" });
		setIcon(button.createSpan({ cls: "dba-folder-button-chevron" }), "chevron-down");
		button.addEventListener("click", () => this.openFolderMenu(button));
		this.folderButton = button;

		this.toolbarEl.createDiv({ cls: "dba-toolbar-spacer" });
		this.zoomButtons = [
			this.addToolbarButton("zoom-in", t("view.zoomIn"), () => this.diagram.zoomIn()),
			this.addToolbarButton("zoom-out", t("view.zoomOut"), () => this.diagram.zoomOut()),
			this.addToolbarButton("maximize", t("view.fit"), () => this.diagram.fit()),
		];

		this.selectFolder(selected);
	}

	private addToolbarButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
		const button = this.toolbarEl.createEl("button", { cls: ["clickable-icon", "dba-toolbar-button"], attr: { "aria-label": label } });
		setIcon(button, icon);
		button.disabled = this.diagram.svg.hasClass("dba-hidden");
		button.addEventListener("click", onClick);
		return button;
	}

	private openFolderMenu(anchor: HTMLElement): void {
		const menu = new Menu();
		for (const f of this.plugin.data.settings.dbFolders) {
			menu.addItem((item) =>
				item
					.setTitle(f)
					.setIcon("folder")
					.setChecked(f === this.folder)
					.onClick(() => this.selectFolder(f)),
			);
		}
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle(t("view.manageFolders"))
				.setIcon("settings")
				.onClick(() => this.plugin.openSettings()),
		);
		const r = anchor.getBoundingClientRect();
		menu.showAtPosition({ x: r.left, y: r.bottom + 4 });
	}

	private selectFolder(folder: string): void {
		this.folderLabelEl?.setText(folder);
		this.folderButton?.setAttr("title", folder);
		if (this.plugin.data.lastFolder !== folder) {
			this.plugin.data.lastFolder = folder;
			void this.plugin.saveData(this.plugin.data);
		}
		this.setFolder(folder);
	}

	private setFolder(folder: string | null): void {
		if (folder === this.folder) return;
		this.folder = folder;
		this.needsFit = true;
		this.watcher.setFolder(folder);
	}

	private onSchema(schema: Schema | null): void {
		if (!schema) {
			this.showMessage(t("view.folderMissing", { folder: this.folder ?? "" }));
			return;
		}
		if (schema.tables.length === 0) {
			this.showMessage(t("view.folderEmpty", { folder: schema.folder }));
			return;
		}
		this.showDiagram(true);
		void this.diagram.setSchema(schema, this.needsFit);
		this.needsFit = false;
	}

	private showDiagram(show: boolean): void {
		this.diagram.svg.toggleClass("dba-hidden", !show);
		this.messageEl.toggleClass("dba-hidden", show);
		for (const b of this.zoomButtons) b.disabled = !show;
	}

	private renderNoFolders(): void {
		this.showDiagram(false);
		this.messageEl.empty();
		this.messageEl.createEl("p", { text: t("view.noFolders") });
		this.messageEl.createEl("p", {
			cls: "dba-empty-hint",
			text: t("view.noFoldersHint"),
		});
		this.messageEl.createEl("button", { cls: "mod-cta", text: t("view.openSettings") }).addEventListener("click", () => {
			this.plugin.openSettings();
		});
	}

	private showMessage(text: string): void {
		this.showDiagram(false);
		this.messageEl.empty();
		this.messageEl.createEl("p", { text });
	}
}
