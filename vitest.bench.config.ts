import { defineConfig } from "vitest/config";

// Benchmarks: not part of `npm test`.
export default defineConfig({
	test: {
		include: ["scripts/**/*.bench.ts"],
		setupFiles: ["tests/setup.ts"],
		environment: "node",
	},
});
