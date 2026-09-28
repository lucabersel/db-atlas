import { App, Modal, Setting, TextComponent } from "obsidian";
import { validateTableName } from "../model/tableName";

/** Asks for the name of a new table (no ".", no duplicates in the folder). */
export class NewTableModal extends Modal {
	private name = "";
	private errorEl!: HTMLElement;

	constructor(
		app: App,
		private readonly folder: string,
		private readonly existingNames: string[],
		private readonly onSubmit: (name: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle("Nuova tabella");
		const { contentEl } = this;
		contentEl.createEl("p", { cls: "dba-modal-hint", text: `Cartella-DB: ${this.folder}` });

		let input: TextComponent | null = null;
		new Setting(contentEl).setName("Nome tabella").addText((t) => {
			input = t;
			t.setPlaceholder("es. clienti").onChange((v) => {
				this.name = v;
				this.showError(v.trim() === "" ? null : validateTableName(v, this.existingNames));
			});
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && !e.isComposing) {
					e.preventDefault();
					this.submit();
				}
			});
		});
		this.errorEl = contentEl.createDiv({ cls: ["dba-modal-error", "dba-hidden"] });

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Annulla").onClick(() => this.close()))
			.addButton((b) => b.setButtonText("Crea").setCta().onClick(() => this.submit()));

		window.setTimeout(() => (input as TextComponent | null)?.inputEl.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const error = validateTableName(this.name, this.existingNames);
		if (error) {
			this.showError(error);
			return;
		}
		this.close();
		this.onSubmit(this.name.trim());
	}

	private showError(message: string | null): void {
		this.errorEl.setText(message ?? "");
		this.errorEl.toggleClass("dba-hidden", message === null);
	}
}
