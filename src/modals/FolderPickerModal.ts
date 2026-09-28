import { App, SuggestModal } from "obsidian";
import { t } from "../i18n";

/** Picks one of the configured DB folders. */
export class FolderPickerModal extends SuggestModal<string> {
	constructor(
		app: App,
		private readonly folders: string[],
		private readonly onChoose: (folder: string) => void,
	) {
		super(app);
		this.setPlaceholder(t("folderPicker.placeholder"));
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
