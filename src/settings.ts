import { App, FuzzySuggestModal, PluginSettingTab, type SettingDefinition, type SettingDefinitionItem, TFile, TFolder } from "obsidian";
import { defaultTableTemplate, moveItem, normalizeFolderPath, tableTemplate } from "./data";
import { AUTO_LANGUAGE, LANGUAGES, t } from "./i18n";
import type DbAtlasPlugin from "./main";
import type { DbAtlasSettings, ViewLocation } from "./types";

/** Picks a vault folder that is not a DB folder yet. */
class FolderPickerSuggest extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly exclude: string[],
		private readonly onChoose: (folder: TFolder) => void,
	) {
		super(app);
		this.setPlaceholder(t("settings.folders.search"));
	}

	getItems(): TFolder[] {
		const excluded = new Set(this.exclude);
		return this.app.vault
			.getAllFolders(true)
			.filter((f) => !excluded.has(normalizeFolderPath(f.path)))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}

/** Settings tab, declared with the settings definitions API (searchable from Obsidian's settings search). */
export class DbAtlasSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: DbAtlasPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const settings = this.plugin.data.settings;
		return [
			{
				type: "list",
				heading: t("settings.folders.heading"),
				cls: "dba-settings-folders",
				emptyState: `${t("settings.folders.empty")} ${t("settings.folders.desc")}`,
				addItem: { name: t("settings.folders.add"), action: () => this.addFolder() },
				onReorder: (from, to) => void this.updateFolders(moveItem(settings.dbFolders, from, to - from)),
				onDelete: (index) => void this.updateFolders(settings.dbFolders.filter((_, i) => i !== index)),
				items: settings.dbFolders.map((path) => this.folderItem(path)),
			},
			{
				type: "group",
				heading: t("settings.others.heading"),
				cls: "dba-settings-others",
				items: [
					{
						name: t("settings.language.name"),
						desc: t("settings.language.desc"),
						control: {
							type: "dropdown",
							key: "language",
							options: {
								[AUTO_LANGUAGE]: t("settings.language.auto"),
								...Object.fromEntries(LANGUAGES.map((l) => [l.code, l.name])),
							},
						},
					},
					{
						name: t("settings.viewLocation.name"),
						desc: t("settings.viewLocation.desc"),
						control: {
							type: "dropdown",
							key: "viewLocation",
							options: {
								tab: t("settings.viewLocation.tab"),
								right: t("settings.viewLocation.right"),
								left: t("settings.viewLocation.left"),
							},
						},
					},
					{
						name: t("settings.template.name"),
						desc: t("settings.template.desc"),
						control: { type: "textarea", key: "newTableTemplate", rows: 12 },
					},
					{
						name: t("settings.template.reset"),
						action: () => void this.resetTemplate(),
						disabled: () => settings.newTableTemplate === "",
					},
				],
			},
		];
	}

	/** Values of the declarative controls (settings live in `plugin.data.settings`). */
	getControlValue(key: string): unknown {
		const settings = this.plugin.data.settings;
		if (key === "newTableTemplate") return tableTemplate(settings); // built-in template until customized
		return settings[key as keyof DbAtlasSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.data.settings;
		if (key === "language" && typeof value === "string") {
			settings.language = value;
			this.plugin.applyLanguage();
			await this.plugin.saveSettings();
			this.update(); // re-render in the new language
			return;
		}
		if (key === "viewLocation") settings.viewLocation = value as ViewLocation;
		if (key === "newTableTemplate" && typeof value === "string") {
			settings.newTableTemplate = value === defaultTableTemplate() ? "" : value;
		}
		await this.plugin.saveSettings();
		this.refreshDomState();
	}

	private folderItem(path: string): SettingDefinition {
		const folder = path === "/" ? this.app.vault.getRoot() : this.app.vault.getFolderByPath(path);
		const tables = folder ? folder.children.filter((f) => f instanceof TFile && f.extension === "md").length : 0;
		return {
			name: path,
			desc: folder ? t("settings.folders.tableCount", { count: tables }) : `⚠️ ${t("settings.folders.notFound")}`,
		};
	}

	private addFolder(): void {
		const settings = this.plugin.data.settings;
		new FolderPickerSuggest(this.app, settings.dbFolders, (folder) => {
			void this.updateFolders([...settings.dbFolders, normalizeFolderPath(folder.path)]);
		}).open();
	}

	private async updateFolders(folders: string[]): Promise<void> {
		this.plugin.data.settings.dbFolders = folders;
		await this.plugin.saveSettings();
		this.update();
	}

	private async resetTemplate(): Promise<void> {
		this.plugin.data.settings.newTableTemplate = "";
		await this.plugin.saveSettings();
		this.update();
	}
}
