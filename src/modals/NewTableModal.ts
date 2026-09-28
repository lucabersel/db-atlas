import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";
import { validateTableName } from "../model/tableName";

/** Asks for the name of a new table (no ".", no duplicates in the folder). */
export class NewTableModal extends Modal {
	private name = "";
	private errorEl!: HTMLElement;
	private inputEl: HTMLInputElement | null = null;

	constructor(
		app: App,
		private readonly folder: string,
		private readonly existingNames: string[],
		private readonly onSubmit: (name: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(t("newTable.title"));
		const { contentEl } = this;
		contentEl.createEl("p", { cls: "dba-modal-hint", text: t("newTable.folder", { folder: this.folder }) });

		new Setting(contentEl).setName(t("newTable.name")).addText((text) => {
			this.inputEl = text.inputEl;
			text.setPlaceholder(t("newTable.placeholder")).onChange((v) => {
				this.name = v;
				this.showError(v.trim() === "" ? null : this.errorText(v));
			});
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && !e.isComposing) {
					e.preventDefault();
					this.submit();
				}
			});
		});
		this.errorEl = contentEl.createDiv({ cls: ["dba-modal-error", "dba-hidden"] });

		new Setting(contentEl)
			.addButton((b) => b.setButtonText(t("newTable.cancel")).onClick(() => this.close()))
			.addButton((b) => b.setButtonText(t("newTable.create")).setCta().onClick(() => this.submit()));

		window.setTimeout(() => this.inputEl?.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const error = this.errorText(this.name);
		if (error) {
			this.showError(error);
			return;
		}
		this.close();
		this.onSubmit(this.name.trim());
	}

	private errorText(name: string): string | null {
		const code = validateTableName(name, this.existingNames);
		return code === null ? null : t(code, { name: name.trim() });
	}

	private showError(message: string | null): void {
		this.errorEl.setText(message ?? "");
		this.errorEl.toggleClass("dba-hidden", message === null);
	}
}
