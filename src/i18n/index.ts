// Translations. Pure: no `obsidian` imports (the app language is passed in by the plugin).

import { ar } from "./locales/ar";
import { bn } from "./locales/bn";
import { de } from "./locales/de";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { hi } from "./locales/hi";
import { id } from "./locales/id";
import { it } from "./locales/it";
import { ja } from "./locales/ja";
import { pt } from "./locales/pt";
import { ru } from "./locales/ru";
import { zh } from "./locales/zh";

export type MessageKey = keyof typeof en;
export type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Message = string | PluralMessage;
/** A translation: any subset of the keys (missing ones fall back to English). */
export type Locale = Partial<Record<MessageKey, Message>>;

/** Supported languages, with their name in the language itself. Order: as shown in the settings. */
export const LANGUAGES: readonly { code: string; name: string; messages: Locale }[] = [
	{ code: "en", name: "English", messages: en },
	{ code: "zh", name: "中文（简体）", messages: zh },
	{ code: "hi", name: "हिन्दी", messages: hi },
	{ code: "es", name: "Español", messages: es },
	{ code: "fr", name: "Français", messages: fr },
	{ code: "ar", name: "العربية", messages: ar },
	{ code: "bn", name: "বাংলা", messages: bn },
	{ code: "pt", name: "Português", messages: pt },
	{ code: "ru", name: "Русский", messages: ru },
	{ code: "ja", name: "日本語", messages: ja },
	{ code: "de", name: "Deutsch", messages: de },
	{ code: "id", name: "Bahasa Indonesia", messages: id },
	{ code: "it", name: "Italiano", messages: it },
];

/** Setting value meaning "follow Obsidian's language". */
export const AUTO_LANGUAGE = "auto";

let current = "en";
let messages: Locale = en;

/**
 * Supported language code for a setting value: "auto" (or unknown) uses `appLanguage`
 * (e.g. "pt-BR" → "pt", "zh-TW" → "zh"), then English.
 */
export function resolveLanguage(setting: string, appLanguage: string): string {
	const wanted = setting === AUTO_LANGUAGE || !LANGUAGES.some((l) => l.code === setting) ? appLanguage : setting;
	const code = (wanted || "en").toLowerCase();
	if (LANGUAGES.some((l) => l.code === code)) return code;
	const base = code.split(/[-_]/)[0];
	return LANGUAGES.some((l) => l.code === base) ? base : "en";
}

export function setLanguage(code: string): void {
	const lang = LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
	current = lang.code;
	messages = lang.messages;
}

export function getLanguage(): string {
	return current;
}

/** Translated message, with `{name}` placeholders replaced. Plural messages use `vars.count`. */
export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
	const message: Message = messages[key] ?? en[key];
	let text: string;
	if (typeof message === "string") {
		text = message;
	} else {
		const count = Number(vars.count ?? 0);
		const category = new Intl.PluralRules(current).select(count);
		text = message[category] ?? message.other;
	}
	return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
