// Writes test-vault/Perf80/*.md from the generated schema. Usage: npm run gen:perf [-- <count>]

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { generateSchema } from "./perfSchema.mjs";

const count = Number(process.argv[2] ?? 80);
const dir = `test-vault/Perf${count}`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

for (const { name, frontmatter } of generateSchema(count)) {
	const yaml = Object.entries(frontmatter)
		.map(([k, v]) => (k.startsWith("col_") ? `${k}: '${v}'` : `${k}: ${JSON.stringify(v)}`))
		.join("\n");
	writeFileSync(`${dir}/${name}.md`, `---\n${yaml}\n---\n\nNota generata per il test di prestazioni.\n`);
}
console.log(`Generated ${count} tables in ${dir}`);
