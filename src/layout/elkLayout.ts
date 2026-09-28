// Initial placement of tables with ELK `layered`. Used only for tables without a saved position.
// No `obsidian` imports: runs in tests too.

import type { ELK } from "elkjs/lib/elk-api";
import type { TablePosition } from "../types";

export interface SizedNode {
	id: string;
	width: number;
	height: number;
}

/** Relation between two tables (FK table → referenced table). */
export interface LayoutEdge {
	from: string;
	to: string;
}

/** Gap between already placed tables and a block of newly placed ones. */
export const NEW_BLOCK_GAP = 80;

// Tuned for large schemas: ~0.7 s for 1000 tables (default layered options take ~84 s).
const LAYOUT_OPTIONS: Record<string, string> = {
	"elk.algorithm": "layered",
	"elk.direction": "RIGHT",
	"elk.spacing.nodeNode": "40",
	"elk.layered.spacing.nodeNodeBetweenLayers": "100",
	"elk.spacing.componentComponent": "60",
	"elk.layered.thoroughness": "1",
	"elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
	"elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
	"elk.layered.cycleBreaking.strategy": "GREEDY",
	"elk.layered.compaction.postCompaction.strategy": "NONE",
};

/**
 * ELK instance provider. In Obsidian it runs ELK in a Web Worker (see elkWorker.ts), so large
 * layouts do not block the UI; tests and benchmarks use the in-thread bundled build.
 */
let engineFactory: (() => ELK) | null = null;
let engine: ELK | null = null;

export function setElkEngine(factory: (() => ELK) | null): void {
	engine?.terminateWorker();
	engine = null;
	engineFactory = factory;
}

function getEngine(): ELK {
	if (!engine) {
		if (!engineFactory) throw new Error("ELK engine not configured");
		engine = engineFactory();
	}
	return engine;
}

/** Positions all `nodes`, top-left at (0, 0). Referenced tables end up left of the tables pointing to them. */
export async function elkLayout(nodes: SizedNode[], edges: LayoutEdge[]): Promise<Map<string, TablePosition>> {
	const positions = new Map<string, TablePosition>();
	if (nodes.length === 0) return positions;

	const ids = new Set(nodes.map((n) => n.id));
	const seen = new Set<string>();
	const elkEdges = [];
	for (const e of edges) {
		// Self-references and duplicates do not affect placement.
		const key = `${e.to}\u0000${e.from}`;
		if (e.from === e.to || !ids.has(e.from) || !ids.has(e.to) || seen.has(key)) continue;
		seen.add(key);
		elkEdges.push({ id: `e${elkEdges.length}`, sources: [e.to], targets: [e.from] });
	}

	const result = await getEngine().layout({
		id: "root",
		layoutOptions: LAYOUT_OPTIONS,
		children: nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
		edges: elkEdges,
	});

	for (const child of result.children ?? []) {
		positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
	}
	return positions;
}

/**
 * Positions for the nodes missing from `saved`, without moving saved ones:
 * if nothing is saved the whole graph is laid out; otherwise the new nodes are laid out
 * among themselves and placed as a block to the right of the existing diagram.
 */
export async function placeMissing(
	nodes: SizedNode[],
	edges: LayoutEdge[],
	saved: Map<string, TablePosition>,
): Promise<Map<string, TablePosition>> {
	const missing = nodes.filter((n) => !saved.has(n.id));
	if (missing.length === 0) return new Map();

	const block = await elkLayout(missing, edges);
	const placed = nodes.filter((n) => saved.has(n.id));
	if (placed.length === 0) return block;

	const right = Math.max(...placed.map((n) => (saved.get(n.id) as TablePosition).x + n.width));
	const top = Math.min(...placed.map((n) => (saved.get(n.id) as TablePosition).y));
	const offset = { x: right + NEW_BLOCK_GAP, y: top };
	return new Map([...block].map(([id, p]) => [id, { x: p.x + offset.x, y: p.y + offset.y }]));
}
