// Text measurement with the fonts actually applied by the theme to the diagram's SVG text classes.

import type { FontRole, Measure } from "./tableGeometry";

/** CSS class of the SVG <text> element for each font role (see styles.css). */
export const FONT_ROLE_CLASS: Record<FontRole, string> = {
	tableName: "dba-table-name",
	tableDesc: "dba-table-desc",
	colName: "dba-col-name",
	colType: "dba-col-type",
};

/**
 * Measures text on a canvas using the computed font of probe <text> elements placed in `svg`,
 * so theme fonts and sizes are respected. Results are cached until `reset()`.
 */
export class TextMeasurer {
	// Detached canvas: only used to measure; fonts come from the SVG's own window (popout-safe).
	private readonly ctx: CanvasRenderingContext2D | null;
	private fonts: Partial<Record<FontRole, string>> = {};
	private cache = new Map<string, number>();

	constructor(private readonly svg: SVGSVGElement) {
		this.ctx = createEl("canvas").getContext("2d");
	}

	readonly measure: Measure = (text, role) => {
		const key = `${role}\u0000${text}`;
		let width = this.cache.get(key);
		if (width === undefined) {
			width = this.measureUncached(text, role);
			this.cache.set(key, width);
		}
		return width;
	};

	/** Call when the theme or fonts change. */
	reset(): void {
		this.fonts = {};
		this.cache.clear();
	}

	private font(role: FontRole): string {
		let font = this.fonts[role];
		if (font === undefined) {
			const probe = this.svg.createSvg("text", { cls: FONT_ROLE_CLASS[role] });
			const s = probe.win.getComputedStyle(probe);
			font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
			probe.remove();
			this.fonts[role] = font;
		}
		return font;
	}

	private measureUncached(text: string, role: FontRole): number {
		if (!this.ctx) return text.length * 7; // rough fallback, never expected in Obsidian
		this.ctx.font = this.font(role);
		return this.ctx.measureText(text).width;
	}
}
