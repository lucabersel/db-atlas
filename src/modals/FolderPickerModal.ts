import { App, SuggestModal } from "obsidian";

/** Picks one of the configured DB folders. */
export class FolderPickerModal extends SuggestModal<string> {
	constructor(
		app: App,
		private readonly folders: string[],
		private readonly onChoose: (folder: string) => void,
	) {
		super(app);
		this.setPlaceholder("Scegli la cartella-DB in cui creare la tabella");
	}

	getSuggestions(query: string): string[] {
		const q = query.toLowerCase();
		return this.folders.filter((f) => f.toLowerCase().includes(q));
	}

	renderSuggestion(folder: string, el: HTMLElement): void {
		el.setText(folder);
	}

	onChooseSuggestion(folder: string): void {
		this.onChoose(folder);
	}
}
