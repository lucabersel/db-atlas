// Header colors from `table_color`. The parsing/contrast helpers are pure.

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

/** Parses the normalized forms a canvas returns for `fillStyle`: `#rrggbb` or `rgba(r, g, b, a)`. */
export function parseCanvasColor(value: string): Rgb | null {
	const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
	if (hex) return { r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16) };
	const rgb = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/i.exec(value);
	if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
	return null;
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Black or white, whichever contrasts more with the background. */
export function readableTextColor(bg: Rgb): "#000000" | "#ffffff" {
	const l = relativeLuminance(bg);
	return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
}

let ctx: CanvasRenderingContext2D | null = null;
const resolved = new Map<string, Rgb | null>();

/**
 * Resolves any CSS color string through a canvas. Returns null for invalid colors
 * (the canvas ignores invalid assignments, detected with two different sentinels).
 */
export function resolveCssColor(color: string): Rgb | null {
	const cached = resolved.get(color);
	if (cached !== undefined) return cached;
	const value = resolveUncached(color);
	resolved.set(color, value);
	return value;
}

function resolveUncached(color: string): Rgb | null {
	ctx ??= document.createElement("canvas").getContext("2d");
	if (!ctx) return null;
	ctx.fillStyle = "#000001";
	ctx.fillStyle = color;
	const a = ctx.fillStyle;
	ctx.fillStyle = "#000002";
	ctx.fillStyle = color;
	const b = ctx.fillStyle;
	return a === b ? parseCanvasColor(a) : null;
}
