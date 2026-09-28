import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

const nodeModules = ["fs", "path", "os", "child_process", "electron"].map((name) => ({
	name,
	message: "Node/Electron APIs are not available on mobile.",
}));

export default defineConfig([
	{
		// Dev tooling (Node scripts, build and test configs) is not part of the plugin.
		ignores: ["main.js", "node_modules/", "test-vault/", "scripts/", "esbuild.config.mjs", "version-bump.mjs", "vitest*.config.ts"],
	},

	// Official Obsidian rules (the same checks as the community directory review), type-checked.
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: { allowDefaultProject: ["eslint.config.mjs"] },
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},

	{
		files: ["src/**/*.ts", "tests/**/*.ts"],
		rules: {
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"obsidianmd/ui/sentence-case": ["warn", { brands: ["DB Atlas"] }],
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
			"src/i18n/**/*.ts",
			"src/sync/markdownHeadings.ts",
			"src/sync/renameLogic.ts",
			"src/view/tooltipText.ts",
			"src/view/tableGeometry.ts",
			"src/view/viewport.ts",
			"src/view/color.ts",
		],
		ignores: ["src/model/schemaLoader.ts", "src/layout/elkWorker.ts"],
		rules: {
			"no-restricted-imports": [
				"error",
				{ paths: [...nodeModules, { name: "obsidian", message: "Pure module: no Obsidian imports." }] },
			],
		},
	},
]);
