import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderSvgPreview, renderSvgToString } from '../renderer';
import { collectSketchMatterTypeDefinitions } from '../metadata';
import { DEFAULT_SETTINGS, SketchMatterObject } from '../types';
import { TFile } from '../__mocks__/obsidian';
// Register all built-in shapes so polygon/polyline etc. are available.
import '../shapes/index';

const getBBox = vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0 }));

beforeEach(() => {
	getBBox.mockReset();
	getBBox.mockReturnValue({ x: 0, y: 0, width: 0, height: 0 });
	Object.defineProperty(SVGElement.prototype, 'getBBox', {
		configurable: true,
		value: getBBox,
	});
});

describe('SVG canvas bounds', () => {
	it('includes Earth-sized artwork without an image definition in previews and exports', () => {
		getBBox.mockReturnValue({ x: 10, y: 10, width: 4390, height: 2190 });
		const objects = [makeObject('large', 'polygon', ['10, 10', '4400, 10', '4400, 2200'])];
		const container = document.createElement('div');

		renderSvgPreview(container, objects);
		const svg = container.querySelector('svg')!;
		const [x, y, width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
		expect(x! + width!).toBeGreaterThanOrEqual(4400);
		expect(y! + height!).toBeGreaterThanOrEqual(2200);
		expect(svg.getAttribute('width')).toBe(String(width));
		expect(svg.getAttribute('height')).toBe(String(height));
		expect(renderSvgToString(objects)).toContain(`viewBox="${svg.getAttribute('viewBox')}"`);
		expect(container.firstElementChild).toBe(svg);
	});

	it('expands explicit dimensions and includes negative coordinates and strokes', () => {
		getBBox.mockReturnValue({ x: -100, y: -50, width: 1800, height: 1000 });
		const objects = [makeObject('outside', 'polygon', ['-100, -50', '1700, -50', '1700, 950'], {
			[DEFAULT_SETTINGS.strokeWidthProperty]: 20,
		})];
		const container = document.createElement('div');
		const image = { id: 'small', name: 'Small', width: 640, height: 480, properties: {} };
		renderSvgPreview(container, objects, undefined, '0-1', DEFAULT_SETTINGS, image, 'grid');

		const [x, y, width, height] = container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
		expect(x).toBeLessThanOrEqual(-110);
		expect(y).toBeLessThanOrEqual(-60);
		expect(x! + width!).toBeGreaterThanOrEqual(1710);
		expect(y! + height!).toBeGreaterThanOrEqual(960);
		expect(container.querySelector('.sketchmatter-grid line[y1]')?.getAttribute('y1')).toBe(String(y));
	});

	it('retains the minimum canvas when artwork fits inside it', () => {
		getBBox.mockReturnValue({ x: 100, y: 100, width: 200, height: 100 });
		const objects = [makeObject('inside', 'polygon', ['100, 100', '300, 100', '300, 200'])];
		expect(renderSvgToString(objects)).toContain('viewBox="0 0 1200 900"');
	});

	it('includes rotated geometry and stroke miter joins', () => {
		getBBox.mockReturnValue({ x: 1100, y: 850, width: 300, height: 200 });
		const objects = [makeObject('rotated', 'polygon', ['1100, 850', '1400, 850', '1400, 1050'], {
			[DEFAULT_SETTINGS.angleProperty]: 45,
			[DEFAULT_SETTINGS.strokeWidthProperty]: 20,
		})];
		const svgContent = renderSvgToString(objects);
		expect(svgContent).toContain('rotate(45');
		expect(svgContent).toContain('viewBox="0 0 1440 1090"');
	});

	it('includes outward blend halos beyond geometric bounds', () => {
		getBBox.mockReturnValue({ x: 1100, y: 850, width: 300, height: 200 });
		const objects = [makeObject('blended', 'polygon', ['1100, 850', '1400, 850', '1400, 1050'], {
			[DEFAULT_SETTINGS.fillProperty]: '#cc8844',
			[DEFAULT_SETTINGS.blendProperty]: true,
			[DEFAULT_SETTINGS.blendOverflowProperty]: 20,
		})];
		const container = document.createElement('div');
		renderSvgPreview(container, objects);
		const [, , width, height] = container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
		expect(width).toBeGreaterThanOrEqual(1441);
		expect(height).toBeGreaterThanOrEqual(1091);
	});

	it('extends hex grids into negative coordinates without resizing around grid overflow', () => {
		getBBox.mockReturnValue({ x: -300, y: -200, width: 1600, height: 1200 });
		const objects = [makeObject('negative', 'polygon', ['-300, -200', '1300, -200', '1300, 1000'])];
		const container = document.createElement('div');
		renderSvgPreview(container, objects, undefined, '0-1', DEFAULT_SETTINGS, null, 'hex-grid');
		const svg = container.querySelector('svg')!;
		const point = container.querySelector('.sketchmatter-grid polygon')!.getAttribute('points')!.split(' ')[0]!.split(',').map(Number);
		expect(point[0]).toBeLessThan(-300);
		expect(point[1]).toBeLessThan(-200);
		expect(renderSvgToString(objects)).toContain(`viewBox="${svg.getAttribute('viewBox')}"`);
	});

	it('keeps globe source dimensions fixed without measuring geometry', () => {
		const objects = [makeObject('outside', 'polygon', ['0, 0', '4400, 0', '4400, 2200'])];
		expect(renderSvgToString(objects, undefined, '0-1', DEFAULT_SETTINGS, null, false))
			.toContain('viewBox="0 0 1200 900"');
		expect(getBBox).not.toHaveBeenCalled();
	});

	it('measures detached SVGs in the document and cleans up after errors', () => {
		const originalChildren = document.body.childElementCount;
		getBBox.mockImplementation(function (this: SVGElement) {
			expect(this.isConnected).toBe(true);
			throw new Error('Measurement failed');
		});
		const objects = [makeObject('outside', 'polygon', ['0, 0', '4400, 0', '4400, 2200'])];
		expect(() => renderSvgToString(objects)).toThrow('Measurement failed');
		expect(document.body.childElementCount).toBe(originalChildren);
	});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObject(
	id: string,
	typeName: string,
	coordinates: unknown,
	properties: Record<string, unknown> = {},
): SketchMatterObject {
	return {
		objectId: id,
		sourcePath: `notes/${id}.md`,
		file: new TFile(`notes/${id}.md`),
		typeName,
		layer: 100,
		coordinates,
		coordinatesProperty: DEFAULT_SETTINGS.coordinatesProperty,
		imageIds: [],
		properties,
	};
}

function collectClipPathIds(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll('clipPath[id]')).map(
		(el) => el.getAttribute('id')!,
	);
}

// ---------------------------------------------------------------------------
// Regression test: globally unique SVG IDs across renders
//
// Before the fix, renderToSvg used per-render counters that reset to 0 on
// every call, so two consecutive renders both produced `sketchmatter-mask-1`.
// When both SVGs lived in the same HTML document (e.g. the SketchMatterView side
// panel and a code-block preview), Chromium resolved `url(#sketchmatter-mask-1)`
// to the *first* matching element.  Navigating away from the note removed
// that element, silently dropping the mask on the second SVG.
//
// The fix replaces the per-render counters with a module-level `svgIdCounter`
// incremented by `nextSvgId(prefix)`.  IDs are therefore monotonically unique
// across the entire document lifetime.
// ---------------------------------------------------------------------------

describe('renderSvgPreview — globally unique SVG IDs', () => {
	it('clipPath IDs are unique across two separate renders', () => {
		// mask source: a continent polygon (matched by `type:continent` selector)
		const maskSource = makeObject('mask-source', 'continent', [
			'0, 0',
			'100, 0',
			'100, 100',
			'0, 100',
		]);

		// masked object: references the continent polygon as its clip-path mask
		const maskedObject = makeObject(
			'masked',
			'river',
			['10, 10', '90, 10', '90, 90', '10, 90'],
			{ [DEFAULT_SETTINGS.maskProperty]: 'type:continent' },
		);

		const objects = [maskSource, maskedObject];

		// First render
		const container1 = document.createElement('div');
		renderSvgPreview(container1, objects, undefined, '0-1', DEFAULT_SETTINGS, null, false);
		const ids1 = collectClipPathIds(container1);

		// Second render (simulates a second SVG in the same HTML document,
		// e.g. the SketchMatterView side panel rendered while the code-block SVG is
		// still live)
		const container2 = document.createElement('div');
		renderSvgPreview(container2, objects, undefined, '0-1', DEFAULT_SETTINGS, null, false);
		const ids2 = collectClipPathIds(container2);

		// Both renders must have produced at least one <clipPath>
		expect(ids1.length).toBeGreaterThan(0);
		expect(ids2.length).toBeGreaterThan(0);

		// No ID must appear in both renders — colliding IDs would let Chromium
		// resolve `url(#id)` to the wrong (or removed) element
		const collision = ids1.filter((id) => ids2.includes(id));
		expect(collision).toHaveLength(0);
	});

	it('all generated IDs within a single render are unique', () => {
		const maskSource = makeObject('mask-source', 'continent', [
			'0, 0',
			'100, 0',
			'100, 100',
			'0, 100',
		]);
		const maskedObject = makeObject(
			'masked',
			'river',
			['10, 10', '90, 10', '90, 90', '10, 90'],
			{ [DEFAULT_SETTINGS.maskProperty]: 'type:continent' },
		);

		const container = document.createElement('div');
		renderSvgPreview(
			container,
			[maskSource, maskedObject],
			undefined,
			'0-1',
			DEFAULT_SETTINGS,
			null,
			false,
		);

		const allIds = Array.from(container.querySelectorAll('[id]')).map(
			(el) => el.getAttribute('id')!,
		);
		const uniqueIds = new Set(allIds);
		expect(uniqueIds.size).toBe(allIds.length);
	});
});

describe('renderSvgPreview — grid types', () => {
	it('renders a hexagonal overlay for the hex-grid mode', () => {
		const container = document.createElement('div');

		renderSvgPreview(container, [], undefined, '0-1', DEFAULT_SETTINGS, null, 'hex-grid');

		const hexagons = container.querySelectorAll('.sketchmatter-grid polygon');
		expect(hexagons.length).toBeGreaterThan(0);
		expect(hexagons[0]?.getAttribute('points')?.split(' ')).toHaveLength(6);
	});
});

describe('renderSvgToString — exported backgrounds', () => {
	it('omits background rect when backgroundColor is not set (transparent by default)', () => {
		const svgContent = renderSvgToString(
			[],
			undefined,
			'0-1',
			DEFAULT_SETTINGS,
			{
				id: 'map',
				name: 'Map',
				width: 640,
				height: 480,
				backgroundColor: undefined,
				properties: {},
			},
		);

		// No background fill rect should be present, leaving the SVG transparent.
		expect(svgContent).not.toContain('fill="#');
	});

	it('renders background colors as SVG elements so they survive export', () => {
		const svgContent = renderSvgToString(
			[],
			undefined,
			'0-1',
			DEFAULT_SETTINGS,
			{
				id: 'map',
				name: 'Map',
				width: 640,
				height: 480,
				backgroundColor: '#77b9ff',
				backgroundImage: 'app://local/backgrounds/sample-background.svg',
				properties: {},
			},
		);

		expect(svgContent).toContain('<rect');
		expect(svgContent).toContain('fill="#77b9ff"');
		expect(svgContent).toContain('width="640"');
		expect(svgContent).toContain('height="480"');
		expect(svgContent).toContain('href="app://local/backgrounds/sample-background.svg"');
	});
});

describe('renderSvgToString — outward blending', () => {
	it('adds an expanded halo for blended objects', () => {
		const object = makeObject(
			'blended-biome',
			'biome',
			['0, 0', '100, 0', '100, 100', '0, 100'],
			{
				[DEFAULT_SETTINGS.fillProperty]: '#cc8844',
				[DEFAULT_SETTINGS.blendProperty]: true,
				[DEFAULT_SETTINGS.blendOverflowProperty]: 18,
			},
		);

		const svgContent = renderSvgToString([object], undefined, '0-1', DEFAULT_SETTINGS, null);

		expect(svgContent).toContain('sketchmatter-blend-halo');
		expect(svgContent).toContain('stroke-width="36"');
		expect(svgContent).toContain('stroke="none"');
	});
});

describe('renderSvgToString — configurable object shape and children keys', () => {
	it('uses configured object shape key for shape overrides', () => {
		const settings = {
			...DEFAULT_SETTINGS,
			objectShapeProperty: 'custom-shape',
		};
		const object = makeObject(
			'custom-shape-object',
			'continent',
			['0, 0', '100, 0', '80, 60'],
			{ 'custom-shape': 'line' },
		);

		const svgContent = renderSvgToString([object], undefined, '0-1', settings, null);
		expect(svgContent).toContain('<line');
		expect(svgContent).not.toContain('<polygon');
	});

	it('keeps the configured label shape when a shared note overrides its geometry shape', () => {
		const properties = {
			[DEFAULT_SETTINGS.objectShapeProperty]: 'rect',
			[DEFAULT_SETTINGS.labelTextProperty]: 'Northland',
			[DEFAULT_SETTINGS.rectWidthProperty]: 1085,
			[DEFAULT_SETTINGS.rectHeightProperty]: 633,
		};
		const rectangle = makeObject('rectangle-geometry', 'continent', ['8, 9'], properties);
		const label = makeObject('rectangle-label', 'label', ['16, 4'], properties);
		const typeDefinitions = collectSketchMatterTypeDefinitions(DEFAULT_SETTINGS);

		const svgContent = renderSvgToString(
			[rectangle, label],
			typeDefinitions,
			'0-1',
			DEFAULT_SETTINGS,
			null,
		);

		expect(svgContent).toContain('<rect');
		expect(svgContent).toContain('<text');
		expect(svgContent).toContain('Northland</text>');
	});

	it('uses configured object children key for multipart child rendering', () => {
		const settings = {
			...DEFAULT_SETTINGS,
			objectShapeProperty: 'custom-shape',
			objectChildrenProperty: 'custom-children',
		};
		const object = makeObject(
			'custom-children-object',
			'continent',
			null,
			{
				'custom-children': [
					{
						'custom-shape': 'circle',
						coordinates: '50, 60',
						radius: 10,
					},
				],
			},
		);

		const svgContent = renderSvgToString([object], undefined, '0-1', settings, null);
		expect(svgContent).toContain('<circle');
	});
});
