import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, SketchMatterObject, SketchMatterTypeDefinition } from '../types';
import { TFile } from '../__mocks__/obsidian';
import type { ShapeRenderContext } from '../shapes/base';
import { ScatterShape } from '../shapes/scatter';
import '../shapes/index';

function makeContext(
	coordinates: unknown,
	propsOverride: Record<string, unknown> = {},
	typeDefinitions: Map<string, SketchMatterTypeDefinition> = new Map(),
): ShapeRenderContext {
	const file = new TFile('notes/test.md');
	const object: SketchMatterObject = {
		objectId: 'test-scatter',
		sourcePath: 'notes/test.md',
		file,
		typeName: 'mountains',
		layer: 100,
		coordinates,
		coordinatesProperty: DEFAULT_SETTINGS.coordinatesProperty,
		imageIds: [],
		properties: propsOverride,
	};

	return {
		object,
		typeDefinition: null,
		typeDefinitions,
		coordinates,
		settings: DEFAULT_SETTINGS,
	};
}

describe('ScatterShape', () => {
	it('keeps the legacy triangle fallback when no item type is configured', () => {
		const shape = new ScatterShape();
		const elements = shape.createElements(
			makeContext(['0, 0', '120, 0', '60, 120'], {
				[DEFAULT_SETTINGS.scatterCountProperty]: 1,
				[DEFAULT_SETTINGS.scatterItemWidthProperty]: 20,
				[DEFAULT_SETTINGS.scatterItemHeightProperty]: 14,
			}),
		);

		expect(elements).not.toBeNull();
		expect(elements![0]!.querySelector('path')).not.toBeNull();
	});

	it('renders a registered shape type at each scatter position', () => {
		const shape = new ScatterShape();
		const elements = shape.createElements(
			makeContext(
				['0, 0', '160, 0', '160, 160', '0, 160'],
				{
					[DEFAULT_SETTINGS.scatterCountProperty]: 1,
					[DEFAULT_SETTINGS.scatterItemWidthProperty]: 20,
					[DEFAULT_SETTINGS.scatterItemHeightProperty]: 20,
					[DEFAULT_SETTINGS.scatterItemTypeProperty]: 'circle',
				},
			),
		);

		expect(elements).not.toBeNull();
		expect(elements![0]!.querySelector('circle')).not.toBeNull();
	});

	it('renders a composite type definition as the scatter item template', () => {
		const shape = new ScatterShape();
		const treeType: SketchMatterTypeDefinition = {
			name: 'tree',
			shape: 'composite',
			properties: {
				children: [
					{ shape: 'circle', radius: 10, fill: '#2f7d32', stroke: 'none' },
					{ shape: 'rect', width: 6, height: 16, fill: '#6b4f2a', stroke: 'none' },
				],
			},
		};

		const typeDefinitions = new Map<string, SketchMatterTypeDefinition>([['tree', treeType]]);
		const elements = shape.createElements(
			makeContext(
				['0, 0', '180, 0', '180, 180', '0, 180'],
				{
					[DEFAULT_SETTINGS.scatterCountProperty]: 1,
					[DEFAULT_SETTINGS.scatterItemWidthProperty]: 24,
					[DEFAULT_SETTINGS.scatterItemHeightProperty]: 24,
					[DEFAULT_SETTINGS.scatterItemTypeProperty]: 'tree',
				},
				typeDefinitions,
			),
		);

		expect(elements).not.toBeNull();
		const group = elements![0]!;
		expect(group.querySelectorAll('circle').length).toBeGreaterThan(0);
		expect(group.querySelectorAll('rect').length).toBeGreaterThan(0);
	});

	it('applies size noise to the rendered scatter item', () => {
		const shape = new ScatterShape();
		const elements = shape.createElements(
			makeContext(
				['0, 0', '180, 0', '180, 180', '0, 180'],
				{
					[DEFAULT_SETTINGS.scatterCountProperty]: 1,
					[DEFAULT_SETTINGS.scatterItemWidthProperty]: 24,
					[DEFAULT_SETTINGS.scatterItemHeightProperty]: 24,
					[DEFAULT_SETTINGS.scatterItemTypeProperty]: 'circle',
					[DEFAULT_SETTINGS.noiseMagnitudeProperty]: 6,
					[DEFAULT_SETTINGS.noiseAmountProperty]: 1.5,
				},
			),
		);

		expect(elements).not.toBeNull();
		const outerGroup = elements![0]!;
		const translatedGroup = outerGroup.firstElementChild as SVGGElement | null;
		expect(translatedGroup).not.toBeNull();
		const scaledGroup = translatedGroup?.firstElementChild as SVGGElement | null;
		expect(scaledGroup).not.toBeNull();
		expect(scaledGroup!.getAttribute('transform')).toContain('scale(');
	});

	it('applies size noise to legacy mountain triangles', () => {
		const shape = new ScatterShape();
		const elements = shape.createElements(
			makeContext(
				['0, 0', '180, 0', '180, 180', '0, 180'],
				{
					[DEFAULT_SETTINGS.scatterCountProperty]: 1,
					[DEFAULT_SETTINGS.scatterItemWidthProperty]: 24,
					[DEFAULT_SETTINGS.scatterItemHeightProperty]: 24,
					[DEFAULT_SETTINGS.noiseMagnitudeProperty]: 8,
					[DEFAULT_SETTINGS.noiseAmountProperty]: 1,
				},
			),
		);

		expect(elements).not.toBeNull();
		const path = elements![0]!.querySelector('path');
		expect(path).not.toBeNull();
		expect(path!.getAttribute('d')).not.toBe('M -12,0 L 0,-24 L 12,0 Z');
	});

	it('does not apply point-noise wobble to tree child polygons when using scatter size noise', () => {
		const shape = new ScatterShape();
		const treeType: SketchMatterTypeDefinition = {
			name: 'tree',
			shape: 'composite',
			properties: {
				children: [{ shape: 'polygon', coordinates: ['-10, 0', '0, -16', '10, 0'] }],
			},
		};

		const elements = shape.createElements(
			makeContext(
				['0, 0', '180, 0', '180, 180', '0, 180'],
				{
					[DEFAULT_SETTINGS.scatterCountProperty]: 1,
					[DEFAULT_SETTINGS.scatterItemWidthProperty]: 24,
					[DEFAULT_SETTINGS.scatterItemHeightProperty]: 24,
					[DEFAULT_SETTINGS.scatterItemTypeProperty]: 'tree',
					[DEFAULT_SETTINGS.noiseMagnitudeProperty]: 8,
					[DEFAULT_SETTINGS.noiseAmountProperty]: 1.5,
				},
				new Map([['tree', treeType]]),
			),
		);

		expect(elements).not.toBeNull();
		const polygon = elements![0]!.querySelector('polygon');
		expect(polygon).not.toBeNull();
		const points = polygon!.getAttribute('points') ?? '';
		expect(points.trim().split(/\s+/).length).toBe(3);
	});
});
