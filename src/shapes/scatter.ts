import { SvgShape, ShapeRenderContext, createSvgElement, toCoordinatePairs } from './base';
import { DEFAULT_FALLBACK_SHAPE, getShape } from './registry';
import type { SketchMatterTypeDefinition } from '../types';

type Point = [number, number];

// ---------------------------------------------------------------------------
// Deterministic PRNG (same algorithm as noise.ts)
// ---------------------------------------------------------------------------

function xmur3(seed: string): () => number {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		return (h ^= h >>> 16) >>> 0;
	};
}

function mulberry32(seed: number): () => number {
	return () => {
		let t = (seed += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function createDeterministicRandom(seed: string): () => number {
	const hash = xmur3(seed);
	return mulberry32(hash());
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

interface BoundingBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

function getBoundingBox(polygon: Point[]): BoundingBox {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const [x, y] of polygon) {
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	}
	return { minX, minY, maxX, maxY };
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
	const [px, py] = point;
	let inside = false;
	const n = polygon.length;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const [xi, yi] = polygon[i]!;
		const [xj, yj] = polygon[j]!;
		if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

function generateScatterPositions(
	polygon: Point[],
	count: number,
	itemWidth: number,
	itemHeight: number,
	random: () => number,
): Point[] {
	const bbox = getBoundingBox(polygon);
	const marginX = itemWidth / 2;
	const marginY = itemHeight / 2;
	const rangeX = bbox.maxX - bbox.minX - marginX * 2;
	const rangeY = bbox.maxY - bbox.minY - marginY * 2;

	if (rangeX <= 0 || rangeY <= 0) {
		return [];
	}

	const positions: Point[] = [];
	const maxAttempts = count * 60;
	let attempts = 0;

	while (positions.length < count && attempts < maxAttempts) {
		attempts++;
		const x = bbox.minX + marginX + random() * rangeX;
		const y = bbox.minY + marginY + random() * rangeY;
		if (pointInPolygon([x, y], polygon)) {
			positions.push([x, y]);
		}
	}

	return positions;
}

// ---------------------------------------------------------------------------
// Helper: read a numeric property from object frontmatter, type-definition
// properties, or a fallback default.
// ---------------------------------------------------------------------------

function resolveNumericProp(
	context: ShapeRenderContext,
	settingsKey: string,
	typePropKey: string,
	fallback: number,
): number {
	// 1. Object frontmatter (via settings key)
	const raw = context.object.properties[settingsKey];
	if (raw !== undefined && raw !== null) {
		const n = Number(raw);
		if (Number.isFinite(n)) return n;
	}

	// 2. Type definition properties (internal key used by type definitions)
	const typePropRaw = context.typeDefinition?.properties?.[typePropKey];
	if (typePropRaw !== undefined && typePropRaw !== null) {
		const n = Number(typePropRaw);
		if (Number.isFinite(n)) return n;
	}

	return fallback;
}

function randomSigned(random: () => number): number {
	return random() * 2 - 1;
}

function resolveSizeNoiseOptions(context: ShapeRenderContext): { magnitude: number; noise: number } | null {
	const magnitude = resolveNumericProp(
		context,
		context.settings.noiseMagnitudeProperty,
		'noiseMagnitude',
		0,
	);
	if (magnitude <= 0) {
		return null;
	}

	const noise = resolveNumericProp(context, context.settings.noiseAmountProperty, 'noise', 1);
	return {
		magnitude,
		noise: Math.max(0, noise),
	};
}

function scaleToFit(base: number, variation: number): number {
	if (base <= 0) {
		return 1;
	}
	return Math.max(0.1, (base + variation) / base);
}

function withScatterNoisePropsRemoved(
	properties: Record<string, unknown>,
	context: ShapeRenderContext,
): Record<string, unknown> {
	const next = { ...properties };
	delete next[context.settings.noiseMagnitudeProperty];
	delete next[context.settings.noiseAmountProperty];
	delete next['magnitude'];
	delete next['sketchmatter-magnitude'];
	delete next['noiseMagnitude'];
	delete next['noise'];
	delete next['sketchmatter-noise'];
	delete next['randomness'];
	return next;
}

function resolveStringProp(
	context: ShapeRenderContext,
	settingsKey: string,
	typePropKey: string,
): string | null {
	const raw = context.object.properties[settingsKey];
	if (typeof raw === 'string' && raw.trim().length > 0) {
		return raw.trim();
	}
	if (typeof raw === 'number' || typeof raw === 'boolean') {
		return String(raw);
	}

	const typePropRaw = context.typeDefinition?.properties?.[typePropKey];
	if (typeof typePropRaw === 'string' && typePropRaw.trim().length > 0) {
		return typePropRaw.trim();
	}
	if (typeof typePropRaw === 'number' || typeof typePropRaw === 'boolean') {
		return String(typePropRaw);
	}

	return null;
}

function resolveTypeDefinitionShapeName(
	typeDefinition: SketchMatterTypeDefinition,
	typeDefinitions?: Map<string, SketchMatterTypeDefinition>,
): string {
	let current: SketchMatterTypeDefinition | null = typeDefinition;
	const visited = new Set<string>();

	while (current) {
		if (typeof current.shape === 'string' && current.shape.trim().length > 0) {
			return current.shape.trim();
		}
		if (current.extends && !visited.has(current.extends)) {
			visited.add(current.extends);
			current = typeDefinitions?.get(current.extends) ?? null;
		} else {
			break;
		}
	}

	return DEFAULT_FALLBACK_SHAPE;
}

function resolveTemplate(
	templateName: string,
	context: ShapeRenderContext,
): {
	shapeName: string;
	typeDefinition: SketchMatterTypeDefinition | null;
} {
	const namedTypeDefinition = context.typeDefinitions?.get(templateName) ?? null;
	if (namedTypeDefinition) {
		return {
			shapeName: resolveTypeDefinitionShapeName(namedTypeDefinition, context.typeDefinitions),
			typeDefinition: namedTypeDefinition,
		};
	}

	// Allow direct registered shapes as templates, while still letting the
	// current scatter type definition provide style and property defaults.
	return {
		shapeName: templateName,
		typeDefinition: context.typeDefinition,
	};
}

function appendTriangleItem(group: SVGElement, cx: number, cy: number, itemWidth: number, itemHeight: number): void {
	const item = createSvgElement('g');
	item.setAttribute('transform', `translate(${cx},${cy})`);

	const path = createSvgElement('path');
	path.setAttribute('d', mountainPath(itemWidth, itemHeight));
	item.appendChild(path);
	group.appendChild(item);
}

// ---------------------------------------------------------------------------
// Mountain triangle path
//
// The icon is centred horizontally at 0 with its base on y=0 and peak at y=-h.
// A `<path>` element is used so the caller can `translate(cx, cy)` via a `<g>`.
// ---------------------------------------------------------------------------

function mountainPath(w: number, h: number): string {
	const hw = w / 2;
	// Left base → peak → right base, then closed
	return `M ${-hw},0 L 0,${-h} L ${hw},0 Z`;
}

// ---------------------------------------------------------------------------
// ScatterShape
// ---------------------------------------------------------------------------

/**
 * Renders a polygon region containing a set of randomly placed items.
 *
 * Coordinates define the enclosing polygon boundary (same format as PolygonShape).
 * The scatter items are placed at deterministic random positions inside that polygon.
 *
 * Configurable frontmatter keys (via settings):
	 *   - `scatterItemTypeProperty`  — type or shape rendered at each position
 *   - `scatterCountProperty`     — number of items to scatter (default 20)
 *   - `scatterItemWidthProperty` — width of each item in SVG units (default 24)
 *   - `scatterItemHeightProperty`— height of each item in SVG units (default 16)
 *
 * The noise seed (`noiseSeedProperty`) is reused as the scatter RNG seed.
 */
export class ScatterShape extends SvgShape {
	readonly name = 'scatter';

	createElements(context: ShapeRenderContext): SVGElement[] | null {
		const boundary = toCoordinatePairs(context.coordinates);
		if (!boundary || boundary.length < 3) {
			return null;
		}

		const { settings } = context;

		const templateName = resolveStringProp(context, settings.scatterItemTypeProperty, 'scatterItemType');
		const count = resolveNumericProp(context, settings.scatterCountProperty, 'scatterCount', 20);
		const itemWidth = resolveNumericProp(context, settings.scatterItemWidthProperty, 'scatterItemWidth', 24);
		const itemHeight = resolveNumericProp(context, settings.scatterItemHeightProperty, 'scatterItemHeight', 16);
		const sizeNoise = resolveSizeNoiseOptions(context);

		// Seed reuses noiseSeedProperty; falls back to source path
		const seedRaw =
			context.object.properties[settings.noiseSeedProperty] ?? context.object.sourcePath;
		const seed =
			typeof seedRaw === 'string' || typeof seedRaw === 'number' || typeof seedRaw === 'boolean'
				? `scatter:${String(seedRaw)}`
				: `scatter:${context.object.sourcePath}`;

		const random = createDeterministicRandom(seed);
		const positions = generateScatterPositions(
			boundary,
			Math.max(1, Math.round(count)),
			sizeNoise ? itemWidth + sizeNoise.magnitude * sizeNoise.noise * 2 : itemWidth,
			sizeNoise ? itemHeight + sizeNoise.magnitude * sizeNoise.noise * 2 : itemHeight,
			random,
		);

		if (positions.length === 0) {
			return null;
		}

		const group = createSvgElement('g');
		if (!templateName) {
			for (const [cx, cy] of positions) {
				const itemRandom = createDeterministicRandom(`${seed}:${cx},${cy}`);
				const widthDelta = sizeNoise ? randomSigned(itemRandom) * sizeNoise.magnitude * sizeNoise.noise : 0;
				const heightDelta = sizeNoise ? randomSigned(itemRandom) * sizeNoise.magnitude * sizeNoise.noise : 0;
				const variedWidth = Math.max(1, itemWidth + widthDelta);
				const variedHeight = Math.max(1, itemHeight + heightDelta);
				appendTriangleItem(group, cx, cy, variedWidth, variedHeight);
			}
			return [group];
		}

		const template = resolveTemplate(templateName, context);
		const shape = getShape(template.shapeName);
		if (!shape) {
			for (const [cx, cy] of positions) {
				appendTriangleItem(group, cx, cy, itemWidth, itemHeight);
			}
			return [group];
		}

		for (const [cx, cy] of positions) {
			const item = createSvgElement('g');
			const content = createSvgElement('g');
			const itemRandom = createDeterministicRandom(`${seed}:${cx},${cy}`);
			const widthDelta = sizeNoise ? randomSigned(itemRandom) * sizeNoise.magnitude * sizeNoise.noise : 0;
			const heightDelta = sizeNoise ? randomSigned(itemRandom) * sizeNoise.magnitude * sizeNoise.noise : 0;
			const scaleX = scaleToFit(itemWidth, widthDelta);
			const scaleY = scaleToFit(itemHeight, heightDelta);

			item.setAttribute('transform', `translate(${cx},${cy})`);
			content.setAttribute('transform', `scale(${scaleX},${scaleY})`);
			const itemContext: ShapeRenderContext = {
				object: {
					...context.object,
					typeName: template.typeDefinition?.name ?? template.shapeName,
					properties: withScatterNoisePropsRemoved(
						{
							...(template.typeDefinition?.properties ?? {}),
							...context.object.properties,
						},
						context,
					),
				},
				typeDefinition: template.typeDefinition,
				typeDefinitions: context.typeDefinitions,
				coordinates: [0, 0],
				settings,
			};

			shape.render(content, itemContext);
			item.appendChild(content);
			group.appendChild(item);
		}

		return [group];
	}
}
