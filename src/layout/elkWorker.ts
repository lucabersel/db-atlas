// ELK running in a Web Worker, so that laying out hundreds of tables never blocks Obsidian.
// The worker script is embedded in main.js as text (esbuild plugin in esbuild.config.mjs) and
// started from a Blob URL. If the worker fails, layout() rejects and the diagram falls back to
// a simple placement: no eval / new Function is used.

import ELK, { type ELK as ElkInstance } from "elkjs/lib/elk-api";
import workerSource from "elk-worker-source";

export function createWorkerElk(): ElkInstance {
	const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
	let failure: Error | null = null;
	const pending = new Set<(err: Error) => void>();

	const elk = new ELK({
		workerUrl: url,
		workerFactory: (workerUrl) => {
			const worker = new Worker(workerUrl as string);
			worker.addEventListener("error", (e) => {
				failure = new Error(e.message || "ELK worker error");
				for (const reject of pending) reject(failure);
				pending.clear();
			});
			return worker;
		},
	});

	const engine: ElkInstance = {
		layout: async (graph, args) => {
			if (failure) throw failure;
			// Rejected by the worker's "error" event too: a crashed worker never answers.
			let onCrash: ((err: Error) => void) | null = null;
			const crashed = new Promise<never>((_, reject) => {
				onCrash = reject;
				pending.add(reject);
			});
			try {
				return await Promise.race([elk.layout(graph, args), crashed]);
			} finally {
				if (onCrash) pending.delete(onCrash);
			}
		},
		knownLayoutAlgorithms: () => elk.knownLayoutAlgorithms(),
		knownLayoutOptions: () => elk.knownLayoutOptions(),
		knownLayoutCategories: () => elk.knownLayoutCategories(),
		terminateWorker: () => {
			elk.terminateWorker();
			URL.revokeObjectURL(url);
		},
	};
	return engine;
}
