import js from "@eslint/js";
import tseslint from "typescript-eslint";

const nodeModules = ["fs", "path", "os", "child_process", "electron"].map((name) => ({
	name,
	message: "Node/Electron APIs are not available on mobile.",
}));

export default tseslint.config(
	{
		ignores: ["main.js", "node_modules/", "test-vault/", "*.mjs"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		// Dev scripts run in Node.
		files: ["scripts/**/*.mjs"],
		languageOptions: { globals: { process: "readonly", console: "readonly" } },
	},
	{
		files: ["src/**/*.ts", "tests/**/*.ts"],
		rules: {
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"no-restricted-imports": ["error", { paths: nodeModules }],
			"no-restricted-syntax": [
				"error",
				{
					// Obsidian's createSvg() adds `cls` via classList.add, which throws on spaces.
					selector: "Property[key.name='cls'] > Literal[value=/\\s/]",
					message: "Use an array for several classes: cls: [\"a\", \"b\"].",
				},
			],
		},
	},
	{
		// Pure modules: must stay testable without Obsidian.
		files: [
			"src/model/**/*.ts",
			"src/types.ts",
			"src/data.ts",
			"src/layout/**/*.ts",
			"src/sync/markdownHeadings.ts",
			"src/sync/renameLogic.ts",
			"src/view/tooltipText.ts",
			"src/view/tableGeometry.ts",
			"src/view/viewport.ts",
			"src/view/color.ts",
		],
		ignores: ["src/model/schemaLoader.ts"],
		rules: {
			"no-restricted-imports": [
				"error",
				{ paths: [...nodeModules, { name: "obsidian", message: "Pure module: no Obsidian imports." }] },
			],
		},
	},
);
