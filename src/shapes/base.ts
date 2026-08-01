import { SketchMatterObject, SketchMatterSettings, SketchMatterTypeDefinition } from '../types';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Common style properties shared across all SVG shape types.
 */
export interface ShapeStyle {
	fill: string;
	stroke: string;
	strokeWidth: string;
	opacity: string;
}

/**
 * Resolved rendering context passed to each shape renderer.
 */
export interface ShapeRenderContext {
	object: SketchMatterObject;
	typeDefinition: SketchMatterTypeDefinition | null;
	coordinates: unknown;
	settings: SketchMatterSettings;
}

/**
 * Base abstract class for all SVG shape renderers.
 * Subclasses implement `createElements` to produce SVG DOM nodes
 * and can override `applyStyle` for shape-specific styling.
 */
export abstract class SvgShape {
	/**
	 * Unique identifier for this shape type, used in the registry
	 * and in type definitions' `shape` field.
	 */
	abstract readonly name: string;

	/**
	 * Create one or more SVG elements representing this shape.
	 * Returns null if the object's data is insufficient for this shape type.
	 */
	abstract createElements(context: ShapeRenderContext): SVGElement[] | null;

	/**
	 * Render the shape into the given SVG root element.
	 * Handles style application and appending to the SVG.
	 */
	render(svg: SVGElement, context: ShapeRenderContext): void {
		const elements = this.createElements(context);
		if (!elements || elements.length === 0) {
			return;
		}

		const style = this.resolveStyle(context);

		for (const element of elements) {
			this.applyStyle(element, style);
			svg.appendChild(element);
		}
	}

	/**
	 * Apply common SVG style attributes to an element.
	 * Override in subclasses for shape-specific styling behavior.
	 */
	protected applyStyle(element: SVGElement, style: ShapeStyle): void {
		element.setAttribute('fill', style.fill);
		element.setAttribute('stroke', style.stroke);
		element.setAttribute('stroke-width', style.strokeWidth);
		if (style.opacity !== '1') {
			element.setAttribute('opacity', style.opacity);
		}
	}

	/**
	 * Resolve final style by merging type definition defaults,
	 * object-level overrides, and fallback defaults.
	 */
	protected resolveStyle(context: ShapeRenderContext): ShapeStyle {
		const typeStyle = context.typeDefinition?.style ?? {};
		const props = context.object.properties;

		return {
			fill: this.getStyleValue(
				context.settings.fillProperty,
				props,
				typeStyle,
				'transparent',
				'fill',
			),
			stroke: this.getStyleValue(
				context.settings.strokeProperty,
				props,
				typeStyle,
				'#333333',
				'stroke',
			),
			strokeWidth: this.getStyleValue(
				context.settings.strokeWidthProperty,
				props,
				typeStyle,
				'2',
				'strokeWidth',
			),
			opacity: this.getStyleValue(
				context.settings.transparencyProperty,
				props,
				typeStyle,
				'1',
				'opacity',
			),
		};
	}

	private getStyleValue(
		key: string,
		objectProps: Record<string, unknown>,
		typeStyle: Record<string, string | number>,
		fallback: string,
		legacyKey?: string,
	): string {
		// Object-level property takes priority
		const objectValue = objectProps[key];
		if (typeof objectValue === 'string' && objectValue.length > 0) {
			return objectValue;
		}
		if (typeof objectValue === 'number') {
			return String(objectValue);
		}
		if (legacyKey) {
			const legacyObjectValue = objectProps[legacyKey];
			if (typeof legacyObjectValue === 'string' && legacyObjectValue.length > 0) {
				return legacyObjectValue;
			}
			if (typeof legacyObjectValue === 'number') {
				return String(legacyObjectValue);
			}
		}

		// Then type definition style
		const typeValue = typeStyle[key];
		if (typeValue != null) {
			return String(typeValue);
		}
		if (legacyKey) {
			const legacyTypeValue = typeStyle[legacyKey];
			if (legacyTypeValue != null) {
				return String(legacyTypeValue);
			}
		}

		return fallback;
	}
}

/**
 * Helper: create an SVG element in the SVG namespace.
 */
export function createSvgElement<K extends keyof SVGElementTagNameMap>(
	tagName: K,
): SVGElementTagNameMap[K] {
	return document.createElementNS(SVG_NAMESPACE, tagName);
}

/**
 * Parse a single "x, y" coordinate string into a numeric pair.
 * Returns null if the string cannot be interpreted.
 */
function parseCoordinateString(str: string): [number, number] | null {
	const parts = str.split(',');
	if (parts.length !== 2) {
		return null;
	}
	const x = Number(parts[0]?.trim());
	const y = Number(parts[1]?.trim());
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		return null;
	}
	return [x, y];
}

/**
 * Helper: parse coordinate data into an array of [x, y] pairs.
 *
 * Accepted formats:
 *   - Array of "x, y" strings: ["100, 200", "300, 400"]  ← preferred
 *   - Single "x, y" string:    "100, 200"
 *   - Array of numeric pairs:  [[100, 200], [300, 400]]  ← legacy, still supported
 *   - Single numeric pair:     [100, 200]                ← legacy, still supported
 *
 * Returns null if the data cannot be interpreted as coordinate pairs.
 */
export function toCoordinatePairs(value: unknown): [number, number][] | null {
	// Single "x, y" string → one coordinate pair
	if (typeof value === 'string') {
		const pair = parseCoordinateString(value);
		return pair ? [pair] : null;
	}

	if (!Array.isArray(value)) {
		return null;
	}

	// Array of "x, y" strings: ["100, 200", "300, 400"]
	if (value.length > 0 && value.every((item) => typeof item === 'string')) {
		const pairs: [number, number][] = [];
		for (const item of value) {
			const pair = parseCoordinateString(item);
			if (!pair) {
				return null;
			}
			pairs.push(pair);
		}
		return pairs;
	}

	// Legacy: single numeric pair [x, y]
	if (
		value.length === 2 &&
		typeof value[0] === 'number' &&
		typeof value[1] === 'number'
	) {
		return [value as [number, number]];
	}

	// Legacy: array of numeric pairs [[x1, y1], [x2, y2], ...]
	if (
		value.every(
			(item) =>
				Array.isArray(item) &&
				item.length === 2 &&
				typeof item[0] === 'number' &&
				typeof item[1] === 'number',
		)
	) {
		return value as [number, number][];
	}

	return null;
}
