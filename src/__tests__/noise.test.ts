import { describe, it, expect } from 'vitest';
import { applyPointNoise } from '../shapes/noise';
import { DEFAULT_SETTINGS, SketchMatterObject } from '../types';
import { TFile } from '../__mocks__/obsidian';
import type { ShapeRenderContext } from '../shapes/base';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type Point = [number, number];

function makeContext(
	propsOverride: Record<string, unknown> = {},
): ShapeRenderContext {
	const file = new TFile('notes/test-object.md');
	const object: SketchMatterObject = {
		objectId: 'test',
		sourcePath: 'notes/test-object.md',
		file,
		typeName: 'continent',
		layer: 100,
		coordinates: null,
		coordinatesProperty: 'sketchmatter-coordinates',
		imageIds: [],
		properties: propsOverride,
	};
	return {
		object,
		typeDefinition: null,
		coordinates: null,
		settings: DEFAULT_SETTINGS,
	};
}

const TRIANGLE: Point[] = [
	[0, 0],
	[100, 0],
	[50, 100],
];

const LINE: Point[] = [
	[0, 0],
	[200, 200],
];

// ---------------------------------------------------------------------------
// No-noise passthrough
// ---------------------------------------------------------------------------

describe('applyPointNoise — no noise settings', () => {
	it('returns the original points unchanged when no magnitude is set', () => {
		const ctx = makeContext();
		const result = applyPointNoise(TRIANGLE, ctx, true);
		expect(result).toEqual(TRIANGLE);
	});

	it('returns the original points unchanged when magnitude is 0', () => {
		const ctx = makeContext({ 'sketchmatter-magnitude': 0 });
		const result = applyPointNoise(TRIANGLE, ctx, true);
		expect(result).toEqual(TRIANGLE);
	});

	it('returns the original points unchanged when magnitude is negative', () => {
		const ctx = makeContext({ 'sketchmatter-magnitude': -5 });
		const result = applyPointNoise(TRIANGLE, ctx, true);
		expect(result).toEqual(TRIANGLE);
	});

	it('returns the original array when fewer than 2 points are given', () => {
		const ctx = makeContext({ 'sketchmatter-magnitude': 10 });
		const single: Point[] = [[50, 50]];
		const result = applyPointNoise(single, ctx, false);
		expect(result).toEqual(single);
	});
});

// ---------------------------------------------------------------------------
// With noise applied
// ---------------------------------------------------------------------------

describe('applyPointNoise — with noise settings', () => {
	it('returns more points than the original when magnitude > 0', () => {
		const ctx = makeContext({
			'sketchmatter-magnitude': 20,
			'sketchmatter-seed': 'test-seed',
		});
		const result = applyPointNoise(TRIANGLE, ctx, true);
		expect(result.length).toBeGreaterThan(TRIANGLE.length);
	});

	it('returns a valid Point[] — all elements are numeric [x, y] pairs', () => {
		const ctx = makeContext({ 'sketchmatter-magnitude': 15 });
		const result = applyPointNoise(TRIANGLE, ctx, true);
		for (const [x, y] of result) {
			expect(Number.isFinite(x)).toBe(true);
			expect(Number.isFinite(y)).toBe(true);
		}
	});

	it('is deterministic: same seed produces the same output', () => {
		const props = { 'sketchmatter-magnitude': 30, 'sketchmatter-seed': 'deterministic' };
		const first = applyPointNoise(LINE, makeContext(props), false);
		const second = applyPointNoise(LINE, makeContext(props), false);
		expect(first).toEqual(second);
	});

	it('produces different output for different seeds', () => {
		const base = { 'sketchmatter-magnitude': 30 };
		const r1 = applyPointNoise(TRIANGLE, makeContext({ ...base, 'sketchmatter-seed': 'seed-A' }), true);
		const r2 = applyPointNoise(TRIANGLE, makeContext({ ...base, 'sketchmatter-seed': 'seed-B' }), true);
		// Same point count but different coordinate values
		expect(r1).not.toEqual(r2);
	});

	it('closed path: does not duplicate the first point at the end', () => {
		const ctx = makeContext({ 'sketchmatter-magnitude': 20, 'sketchmatter-seed': 'closed' });
		const result = applyPointNoise(TRIANGLE, ctx, true);
		const first = result[0]!;
		const last = result[result.length - 1]!;
		// First and last should not be the exact same coordinates
		const areDuplicate = first[0] === last[0] && first[1] === last[1];
		expect(areDuplicate).toBe(false);
	});

	it('open path: first point is preserved exactly', () => {
		const ctx = makeContext({ 'sketchmatter-magnitude': 20 });
		const result = applyPointNoise(LINE, ctx, false);
		expect(result[0]).toEqual(LINE[0]);
	});

	it('open path: last point is preserved exactly', () => {
		const ctx = makeContext({ 'sketchmatter-magnitude': 20 });
		const result = applyPointNoise(LINE, ctx, false);
		expect(result[result.length - 1]).toEqual(LINE[LINE.length - 1]);
	});
});
