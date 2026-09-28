// ELK running in a Web Worker, so that laying out hundreds of tables never blocks Obsidian.
// The worker script is embedded in main.js as text (esbuild plugin in esbuild.config.mjs) and
// started from a Blob URL. If the worker fails, layout() rejects and the diagram falls back to
// a simple placement: no eval / new Function is used.

import ELK, { type ELK as ElkInstance } from "elkjs/lib/elk-api";
import workerSource from "elk-worker-source";

export function createWorkerElk(): ElkInstance {
	const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
	let failure: unknown = null;
	const failed = new Set<(err: unknown) => void>();

	const elk = new ELK({
		workerUrl: url,
		workerFactory: (workerUrl) => {
			const worker = new Worker(workerUrl as string);
			worker.addEventListener("error", (e) => {
				failure = e.message || "ELK worker error";
				for (const reject of failed) reject(failure);
				failed.clear();
			});
			return worker;
		},
	});

	return {
		layout: (graph, args) => {
			if (failure !== null) return Promise.reject(failure);
			return new Promise((resolve, reject) => {
				failed.add(reject);
				elk.layout(graph, args).then(
					(result) => {
						failed.delete(reject);
						resolve(result);
					},
					(err) => {
						failed.delete(reject);
						reject(err);
					},
				);
			});
		},
		knownLayoutAlgorithms: () => elk.knownLayoutAlgorithms(),
		knownLayoutOptions: () => elk.knownLayoutOptions(),
		knownLayoutCategories: () => elk.knownLayoutCategories(),
		terminateWorker: () => {
			elk.terminateWorker();
			URL.revokeObjectURL(url);
		},
	} as ElkInstance;
}
