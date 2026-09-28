import {
	AbstractInputSuggest,
	App,
	ButtonComponent,
	ExtraButtonComponent,
	Notice,
	PluginSettingTab,
	Setting,
	SettingGroup,
	setIcon,
	TFile,
	TFolder,
} from "obsidian";
import { DEFAULT_TABLE_TEMPLATE, moveItem, normalizeFolderPath } from "./data";
import type DbAtlasPlugin from "./main";
import type { ViewLocation } from "./types";

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, private inputEl: HTMLInputElement, private exclude: () => string[]) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		const excluded = new Set(this.exclude());
		return this.app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder)
			.filter((f) => !excluded.has(f.path) && f.path.toLowerCase().includes(q))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.setValue(folder.path);
		this.inputEl.dispatchEvent(new Event("input"));
		this.close();
	}
}

type AddSetting = (build: (setting: Setting) => void) => void;

/**
 * Section with a heading. On Obsidian >= 1.11 it is a native SettingGroup (settings in one card,
 * separated by lines); on older versions, a heading followed by plain settings.
 * `el` is where custom content of the section can be appended.
 */
function section(containerEl: HTMLElement, heading: string, cls: string): { add: AddSetting; el: HTMLElement } {
	if (typeof SettingGroup === "function") {
		const group = new SettingGroup(containerEl).setHeading(heading).addClass(cls);
		return { add: (build) => void group.addSetting(build), el: group.listEl.parentElement ?? containerEl };
	}
	new Setting(containerEl).setName(heading).setHeading().setClass(cls);
	return { add: (build) => build(new Setting(containerEl)), el: containerEl };
}

/**
 * Drag to reorder with pointer events (mouse and touch; HTML5 drag and drop does not work on mobile).
 * The dragged row follows the pointer, the others slide to make room; `onDrop` gets the new index.
 */
function startReorder(e: PointerEvent, rows: HTMLElement[], from: number, onDrop: (to: number) => void): void {
	if (e.pointerType === "mouse" && e.button !== 0) return;
	e.preventDefault();
	const handle = e.currentTarget as HTMLElement;
	const dragged = rows[from];
	const rects = rows.map((r) => r.getBoundingClientRect());
	const height = rects[from].height;
	const startY = e.clientY;
	let to = from;

	handle.setPointerCapture(e.pointerId);
	dragged.addClass("is-dragging");

	const onMove = (ev: PointerEvent) => {
		const dy = ev.clientY - startY;
		const center = rects[from].top + height / 2 + dy;
		to = from;
		rects.forEach((r, i) => {
			const mid = r.top + r.height / 2;
			if (i < from && center < mid) to = Math.min(to, i);
			if (i > from && center > mid) to = Math.max(to, i);
		});
		dragged.style.setProperty("--dba-drag-y", `${dy}px`);
		rows.forEach((row, i) => {
			if (i === from) return;
			const shift = from < to && i > from && i <= to ? -height : to < from && i >= to && i < from ? height : 0;
			row.style.setProperty("--dba-shift", `${shift}px`);
		});
	};
	const onEnd = (ev: PointerEvent) => {
		handle.removeEventListener("pointermove", onMove);
		handle.removeEventListener("pointerup", onEnd);
		handle.removeEventListener("pointercancel", onEnd);
		if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
		dragged.removeClass("is-dragging");
		for (const row of rows) {
			row.style.removeProperty("--dba-shift");
			row.style.removeProperty("--dba-drag-y");
		}
		if (ev.type === "pointerup" && to !== from) onDrop(to);
	};
	handle.addEventListener("pointermove", onMove);
	handle.addEventListener("pointerup", onEnd);
	handle.addEventListener("pointercancel", onEnd);
}

export class DbAtlasSettingTab extends PluginSettingTab {
	/** Refocuses the add-folder input after a re-render, to add several folders in a row. */
	private focusFolderInput = false;

	constructor(app: App, private plugin: DbAtlasPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.displayFolders(section(containerEl, "Gestione cartelle", "dba-settings-folders").el);
		const others = section(containerEl, "Altre opzioni", "dba-settings-others");
		this.displayViewLocation(others.add);
		this.displayTemplate(others.add);
	}

	private displayFolders(containerEl: HTMLElement): void {
		const settings = this.plugin.data.settings;

		containerEl.createEl("p", {
			cls: ["setting-item-description", "dba-settings-intro"],
			text: "Ogni cartella rappresenta un database: le note figlie dirette sono le tabelle. Le sottocartelle vengono ignorate. L'ordine della lista è quello del menu delle cartelle nel diagramma.",
		});

		// Add row above the list.
		const addEl = containerEl.createDiv();
		const listEl = containerEl.createDiv({ cls: "dba-folder-list" });
		if (settings.dbFolders.length === 0) {
			listEl.createDiv({ cls: "dba-folder-list-empty", text: "Nessuna cartella configurata." });
		}

		const move = async (index: number, delta: number) => {
			settings.dbFolders = moveItem(settings.dbFolders, index, delta);
			await this.plugin.saveSettings();
			this.display();
		};

		const rows: HTMLElement[] = [];
		for (const [index, path] of settings.dbFolders.entries()) {
			const folder = this.app.vault.getFolderByPath(path);
			const itemEl = listEl.createDiv({ cls: "dba-folder-item" });
			itemEl.toggleClass("is-missing", folder === null);
			rows.push(itemEl);

			// Drag handle: the order is the one used by the folder menu of the diagram.
			const handle = itemEl.createSpan({ cls: "dba-folder-handle", attr: { "aria-label": "Trascina per riordinare" } });
			setIcon(handle, "grip-vertical");
			handle.addEventListener("pointerdown", (e) => startReorder(e, rows, index, (to) => move(index, to - index)));

			setIcon(itemEl.createSpan({ cls: "dba-folder-icon" }), folder ? "folder" : "alert-triangle");
			itemEl.createSpan({ cls: "dba-folder-path", text: path });

			const tables = folder ? folder.children.filter((f) => f instanceof TFile && f.extension === "md").length : 0;
			itemEl.createSpan({
				cls: "dba-folder-meta",
				text: folder ? `${tables} ${tables === 1 ? "tabella" : "tabelle"}` : "non trovata",
			});

			const remove = new ExtraButtonComponent(itemEl)
				.setIcon("x")
				.setTooltip("Rimuovi")
				.onClick(async () => {
					settings.dbFolders = settings.dbFolders.filter((f) => f !== path);
					await this.plugin.saveSettings();
					this.display();
				});
			remove.extraSettingsEl.addClass("dba-folder-remove");
		}

		let pending = "";
		let addButton: ButtonComponent | null = null;
		const add = async () => {
			if (pending.trim() === "") return;
			const path = normalizeFolderPath(pending);
			if (this.app.vault.getFolderByPath(path) === null) {
				new Notice(`DB Atlas: la cartella "${path}" non esiste.`);
				return;
			}
			if (settings.dbFolders.includes(path)) {
				new Notice(`DB Atlas: "${path}" è già presente.`);
				return;
			}
			settings.dbFolders.push(path);
			await this.plugin.saveSettings();
			this.focusFolderInput = true;
			this.display();
		};

		new Setting(addEl)
			.setClass("dba-folder-add")
			.addSearch((search) => {
				search.setPlaceholder("Cerca una cartella del vault…").onChange((v) => {
					pending = v;
					addButton?.setDisabled(v.trim() === "");
				});
				new FolderSuggest(this.app, search.inputEl, () => settings.dbFolders);
				search.inputEl.addEventListener("keydown", (evt) => {
					if (evt.key === "Enter") void add();
				});
				if (this.focusFolderInput) {
					this.focusFolderInput = false;
					window.setTimeout(() => search.inputEl.focus(), 0);
				}
			})
			.addButton((b) => {
				addButton = b.setButtonText("Aggiungi").setCta().setDisabled(true).onClick(add);
			});
	}

	private displayViewLocation(add: AddSetting): void {
		add((s) =>
			s
				.setName("Posizione apertura vista")
				.setDesc("Dove aprire il diagramma con il comando predefinito e l'icona nella barra laterale.")
				.addDropdown((d) =>
					d
						.addOptions({ tab: "Tab principale", right: "Sidebar destra", left: "Sidebar sinistra" })
						.setValue(this.plugin.data.settings.viewLocation)
						.onChange(async (v) => {
							this.plugin.data.settings.viewLocation = v as ViewLocation;
							await this.plugin.saveSettings();
						}),
				),
		);
	}

	private displayTemplate(add: AddSetting): void {
		add((s) =>
			s
				.setName("Template nuova tabella")
				.setDesc("Contenuto della nota creata dal comando \"Nuova tabella\". {{name}} viene sostituito col nome della tabella.")
				.addExtraButton((b) =>
					b
						.setIcon("rotate-ccw")
						.setTooltip("Ripristina default")
						.onClick(async () => {
							this.plugin.data.settings.newTableTemplate = DEFAULT_TABLE_TEMPLATE;
							await this.plugin.saveSettings();
							this.display();
						}),
				),
		);

		add((s) =>
			s.setClass("dba-setting-template").addTextArea((t) => {
				t.setValue(this.plugin.data.settings.newTableTemplate).onChange(async (v) => {
					this.plugin.data.settings.newTableTemplate = v;
					await this.plugin.saveSettings();
				});
				t.inputEl.rows = 12;
				t.inputEl.spellcheck = false;
			}),
		);
	}
}
