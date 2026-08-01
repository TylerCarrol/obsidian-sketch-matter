import { ShapeRenderContext } from './base';

type Point = [number, number];

function toNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number.parseFloat(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return null;
}

function getProperty(properties: Record<string, unknown>, keys: string[]): unknown {
	for (const key of keys) {
		const value = properties[key];
		if (value !== undefined && value !== null) {
			return value;
		}
	}
	return undefined;
}

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

function getNoiseOptions(context: ShapeRenderContext): {
	seed: string;
	magnitude: number;
	noise: number;
} | null {
	const props = context.object.properties;
	const { noiseMagnitudeProperty, noiseAmountProperty, noiseSeedProperty } = context.settings;
	const magnitude = toNumber(
		getProperty(props, [noiseMagnitudeProperty, 'magnitude', 'sketchmatter-magnitude', 'noiseMagnitude']),
	);

	if (magnitude == null || magnitude <= 0) {
		return null;
	}

	const noise =
		toNumber(getProperty(props, [noiseAmountProperty, 'noise', 'sketchmatter-noise', 'randomness'])) ?? 1;
	const seedValue =
		getProperty(props, [noiseSeedProperty, 'seed', 'sketchmatter-seed', 'noiseSeed']) ?? context.object.sourcePath;
	const seed =
		typeof seedValue === 'string' ||
		typeof seedValue === 'number' ||
		typeof seedValue === 'boolean'
			? String(seedValue)
			: context.object.sourcePath;

	return {
		seed,
		magnitude,
		noise: Math.max(0, noise),
	};
}

function withOffset(
	from: Point,
	to: Point,
	t: number,
	offset: number,
): Point {
	const x = from[0] + (to[0] - from[0]) * t;
	const y = from[1] + (to[1] - from[1]) * t;

	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	const length = Math.hypot(dx, dy);
	if (length === 0) {
		return [x, y];
	}

	const nx = -dy / length;
	const ny = dx / length;
	return [x + nx * offset, y + ny * offset];
}

function segmentPointCount(length: number, noise: number): number {
	const density = Math.max(1, Math.min(12, Math.round(noise * 3)));
	const fromLength = Math.max(1, Math.round(length / 120));
	return Math.max(1, Math.min(30, density * fromLength));
}

export function applyPointNoise(
	points: Point[],
	context: ShapeRenderContext,
	closed: boolean,
): Point[] {
	const options = getNoiseOptions(context);
	if (!options || points.length < 2) {
		return points;
	}

	const random = createDeterministicRandom(
		`${options.seed}:${context.object.sourcePath}:${context.object.typeName}:${closed ? 'closed' : 'open'}`,
	);
	const result: Point[] = [];
	const segmentCount = closed ? points.length : points.length - 1;

	for (let i = 0; i < segmentCount; i++) {
		const start = points[i]!;
		const end = points[(i + 1) % points.length]!;
		const dx = end[0] - start[0];
		const dy = end[1] - start[1];
		const length = Math.hypot(dx, dy);
		const extraPoints = segmentPointCount(length, options.noise);

		if (i === 0) {
			result.push(start);
		}

		for (let step = 1; step <= extraPoints; step++) {
			const t = step / (extraPoints + 1);
			const taper = Math.sin(Math.PI * t);
			const randomFactor = random() * 2 - 1;
			const offset = randomFactor * options.magnitude * taper;
			result.push(withOffset(start, end, t, offset));
		}

		result.push(end);
	}

	if (!closed) {
		return result;
	}

	if (result.length > 1) {
		const first = result[0]!;
		const last = result[result.length - 1]!;
		if (first[0] === last[0] && first[1] === last[1]) {
			result.pop();
		}
	}

	return result;
}
