import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, SketchMatterObject, SketchMatterTypeDefinition } from '../types';
import { TFile } from '../__mocks__/obsidian';
import type { ShapeRenderContext } from '../shapes/base';
import { PolygonShape } from '../shapes/polygon';
import { PolylineShape } from '../shapes/polyline';
import { LineShape } from '../shapes/line';
import { CircleShape } from '../shapes/circle';
import { RectShape } from '../shapes/rect';
import { EllipseShape } from '../shapes/ellipse';
import { TextShape } from '../shapes/text';
import { CompositeShape } from '../shapes/composite';
// Register all built-in shapes so CompositeShape can look up 'circle' etc.
import '../shapes/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(
	coordinates: unknown,
	propsOverride: Record<string, unknown> = {},
): ShapeRenderContext {
	const file = new TFile('notes/test.md');
	const object: SketchMatterObject = {
		objectId: 'test',
		sourcePath: 'notes/test.md',
		file,
		typeName: 'continent',
		layer: 100,
		coordinates,
		coordinatesProperty: 'sketchmatter-coordinates',
		imageIds: [],
		properties: propsOverride,
	};
	return {
		object,
		typeDefinition: null,
		coordinates,
		settings: DEFAULT_SETTINGS,
	};
}

function renderShape(
	shape: { createElements: (ctx: ShapeRenderContext) => SVGElement[] | null },
	coordinates: unknown,
	props: Record<string, unknown> = {},
): SVGElement[] | null {
	return shape.createElements(makeContext(coordinates, props));
}

function makeContextWithTypeDef(
	coordinates: unknown,
	typeDefinition: SketchMatterTypeDefinition,
	propsOverride: Record<string, unknown> = {},
): ShapeRenderContext {
	const file = new TFile('notes/test.md');
	const object: SketchMatterObject = {
		objectId: 'test',
		sourcePath: 'notes/test.md',
		file,
		typeName: typeDefinition.name,
		layer: 100,
		coordinates,
		coordinatesProperty: 'sketchmatter-coordinates',
		imageIds: [],
		properties: propsOverride,
	};
	return {
		object,
		typeDefinition,
		coordinates,
		settings: DEFAULT_SETTINGS,
	};
}

function makeSvgRoot(): SVGElement {
	return document.createElementNS('http://www.w3.org/2000/svg', 'svg');
}

// ---------------------------------------------------------------------------
// PolygonShape
// ---------------------------------------------------------------------------

describe('PolygonShape', () => {
	const shape = new PolygonShape();

	it('has the name "polygon"', () => {
		expect(shape.name).toBe('polygon');
	});

	it('returns null when coordinates are null', () => {
		expect(renderShape(shape, null)).toBeNull();
	});

	it('returns null for fewer than 3 points', () => {
		expect(renderShape(shape, ['0, 0', '100, 0'])).toBeNull();
	});

	it('renders a <polygon> element for 3+ points', () => {
		const elements = renderShape(shape, ['0, 0', '100, 0', '50, 100']);
		expect(elements).not.toBeNull();
		expect(elements).toHaveLength(1);
		expect(elements![0]!.tagName.toLowerCase()).toBe('polygon');
	});

	it('sets the "points" attribute on the <polygon>', () => {
		const elements = renderShape(shape, ['0, 0', '100, 0', '50, 100']);
		const pointsAttr = elements![0]!.getAttribute('points');
		expect(pointsAttr).toBeTruthy();
		expect(pointsAttr).toMatch(/\d/);
	});

	it('appends to the SVG root via render()', () => {
		const svg = makeSvgRoot();
		const ctx = makeContext(['0, 0', '100, 0', '50, 100']);
		shape.render(svg, ctx);
		expect(svg.children).toHaveLength(1);
		expect(svg.children[0]!.tagName.toLowerCase()).toBe('polygon');
	});
});

// ---------------------------------------------------------------------------
// PolylineShape
// ---------------------------------------------------------------------------

describe('PolylineShape', () => {
	const shape = new PolylineShape();

	it('has the name "polyline"', () => {
		expect(shape.name).toBe('polyline');
	});

	it('returns null for fewer than 2 points', () => {
		expect(renderShape(shape, ['50, 50'])).toBeNull();
	});

	it('renders a <polyline> element for 2+ points', () => {
		const elements = renderShape(shape, ['0, 0', '100, 100', '200, 0']);
		expect(elements).not.toBeNull();
		expect(elements![0]!.tagName.toLowerCase()).toBe('polyline');
	});

	it('sets fill to "none" for the default transparent fill', () => {
		const svg = makeSvgRoot();
		const ctx = makeContext(['0, 0', '100, 100']);
		shape.render(svg, ctx);
		expect(svg.children[0]!.getAttribute('fill')).toBe('none');
	});
});

// ---------------------------------------------------------------------------
// LineShape
// ---------------------------------------------------------------------------

describe('LineShape', () => {
	const shape = new LineShape();

	it('has the name "line"', () => {
		expect(shape.name).toBe('line');
	});

	it('returns null for fewer than 2 points', () => {
		expect(renderShape(shape, ['50, 50'])).toBeNull();
	});

	it('renders a <line> element for exactly 2 points without noise', () => {
		const elements = renderShape(shape, ['0, 0', '200, 200']);
		expect(elements).not.toBeNull();
		const tag = elements![0]!.tagName.toLowerCase();
		expect(['line', 'polyline']).toContain(tag);
	});

	it('sets x1/y1/x2/y2 when no noise is applied', () => {
		const elements = renderShape(shape, ['10, 20', '30, 40']);
		expect(elements).not.toBeNull();
		const el = elements![0]!;
		if (el.tagName.toLowerCase() === 'line') {
			expect(el.getAttribute('x1')).toBe('10');
			expect(el.getAttribute('y1')).toBe('20');
			expect(el.getAttribute('x2')).toBe('30');
			expect(el.getAttribute('y2')).toBe('40');
		}
	});

	it('sets fill to "none"', () => {
		const svg = makeSvgRoot();
		shape.render(svg, makeContext(['0, 0', '100, 100']));
		expect(svg.children[0]!.getAttribute('fill')).toBe('none');
	});
});

// ---------------------------------------------------------------------------
// CircleShape
// ---------------------------------------------------------------------------

describe('CircleShape', () => {
	const shape = new CircleShape();

	it('has the name "circle"', () => {
		expect(shape.name).toBe('circle');
	});

	it('returns null when coordinates are null', () => {
		expect(renderShape(shape, null)).toBeNull();
	});

	it('renders a <circle> element for a single point', () => {
		const elements = renderShape(shape, ['100, 200']);
		expect(elements).not.toBeNull();
		expect(elements![0]!.tagName.toLowerCase()).toBe('circle');
	});

	it('sets cx, cy, and r attributes', () => {
		const elements = renderShape(shape, ['100, 200']);
		const el = elements![0]!;
		expect(el.getAttribute('cx')).toBe('100');
		expect(el.getAttribute('cy')).toBe('200');
		expect(el.getAttribute('r')).toBe('10'); // default radius
	});

	it('respects the "radius" property override', () => {
		const elements = renderShape(shape, ['0, 0'], { radius: 25 });
		expect(elements![0]!.getAttribute('r')).toBe('25');
	});

	it('respects the "r" shorthand property', () => {
		const elements = renderShape(shape, ['0, 0'], { r: 42 });
		expect(elements![0]!.getAttribute('r')).toBe('42');
	});
});

// ---------------------------------------------------------------------------
// RectShape
// ---------------------------------------------------------------------------

describe('RectShape', () => {
	const shape = new RectShape();

	it('has the name "rect"', () => {
		expect(shape.name).toBe('rect');
	});

	it('returns null when coordinates are null', () => {
		expect(renderShape(shape, null)).toBeNull();
	});

	it('renders a <rect> element for a single point', () => {
		const elements = renderShape(shape, ['10, 20']);
		expect(elements).not.toBeNull();
		expect(elements![0]!.tagName.toLowerCase()).toBe('rect');
	});

	it('sets x, y, width, height attributes', () => {
		const elements = renderShape(shape, ['10, 20']);
		const el = elements![0]!;
		expect(el.getAttribute('x')).toBe('10');
		expect(el.getAttribute('y')).toBe('20');
		expect(el.getAttribute('width')).toBe('50'); // default
		expect(el.getAttribute('height')).toBe('30'); // default
	});

	it('respects custom width and height properties', () => {
		const elements = renderShape(shape, ['0, 0'], { width: 80, height: 60 });
		const el = elements![0]!;
		expect(el.getAttribute('width')).toBe('80');
		expect(el.getAttribute('height')).toBe('60');
	});

	it('sets rx attribute when provided', () => {
		const elements = renderShape(shape, ['0, 0'], { rx: 5 });
		expect(elements![0]!.getAttribute('rx')).toBe('5');
	});

	it('does not set rx attribute when not provided', () => {
		const elements = renderShape(shape, ['0, 0']);
		expect(elements![0]!.getAttribute('rx')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// EllipseShape
// ---------------------------------------------------------------------------

describe('EllipseShape', () => {
	const shape = new EllipseShape();

	it('has the name "ellipse"', () => {
		expect(shape.name).toBe('ellipse');
	});

	it('returns null when coordinates are null', () => {
		expect(renderShape(shape, null)).toBeNull();
	});

	it('renders a <ellipse> element', () => {
		const elements = renderShape(shape, ['50, 75']);
		expect(elements).not.toBeNull();
		expect(elements![0]!.tagName.toLowerCase()).toBe('ellipse');
	});

	it('sets cx and cy from the first coordinate', () => {
		const elements = renderShape(shape, ['50, 75']);
		const el = elements![0]!;
		expect(el.getAttribute('cx')).toBe('50');
		expect(el.getAttribute('cy')).toBe('75');
	});
});

// ---------------------------------------------------------------------------
// TextShape
// ---------------------------------------------------------------------------

describe('TextShape', () => {
	const shape = new TextShape();

	it('has the name "text"', () => {
		expect(shape.name).toBe('text');
	});

	it('renders a <text> element even without coordinates (defaults to 10,20)', () => {
		const elements = renderShape(shape, null, {
			[DEFAULT_SETTINGS.labelTextProperty]: 'Hello',
		});
		expect(elements).not.toBeNull();
		expect(elements![0]!.tagName.toLowerCase()).toBe('text');
		expect(elements![0]!.getAttribute('x')).toBe('10');
		expect(elements![0]!.getAttribute('y')).toBe('20');
	});

	it('renders a <text> element when coordinates and label text are given', () => {
		const elements = renderShape(shape, ['100, 200'], {
			[DEFAULT_SETTINGS.labelTextProperty]: 'Hello',
		});
		expect(elements).not.toBeNull();
		expect(elements![0]!.tagName.toLowerCase()).toBe('text');
	});

	it('sets x and y attributes', () => {
		const elements = renderShape(shape, ['100, 200'], {
			[DEFAULT_SETTINGS.labelTextProperty]: 'Test',
		});
		const el = elements![0]!;
		expect(el.getAttribute('x')).toBe('100');
		expect(el.getAttribute('y')).toBe('200');
	});

	it('falls back to the file basename when no label text property is set', () => {
		const elements = renderShape(shape, ['0, 0']);
		expect(elements).not.toBeNull();
		// The mock TFile basename is "test" (from "notes/test.md")
		expect(elements![0]!.textContent).toBe('test');
	});

	it('preserves explicit font color when rendered', () => {
		const svg = makeSvgRoot();
		shape.render(
			svg,
			makeContext(['100, 200'], {
				[DEFAULT_SETTINGS.labelTextProperty]: 'Bright',
				[DEFAULT_SETTINGS.fontColorProperty]: '#e8c060',
			}),
		);
		expect(svg.children[0]!.getAttribute('fill')).toBe('#e8c060');
	});
});

// ---------------------------------------------------------------------------
// CompositeShape
// ---------------------------------------------------------------------------

describe('CompositeShape', () => {
	const shape = new CompositeShape();

	it('has the name "composite"', () => {
		expect(shape.name).toBe('composite');
	});

	it('returns null when no children are defined', () => {
		expect(renderShape(shape, ['50, 50'])).toBeNull();
	});

	it('renders a <g> element containing child elements from object properties', () => {
		const elements = renderShape(shape, ['100, 200'], {
			children: [
				{ shape: 'circle', radius: 10 },
				{ shape: 'circle', radius: 3 },
			],
		});
		expect(elements).not.toBeNull();
		expect(elements![0]!.tagName.toLowerCase()).toBe('g');
		expect(elements![0]!.childElementCount).toBe(2);
	});

	it('falls back to typeDefinition.properties.children when the object has none', () => {
		const cityTypeDef = DEFAULT_SETTINGS.typeDefinitions.find((d) => d.name === 'city')!;
		const ctx = makeContextWithTypeDef(['300, 400'], cityTypeDef);
		const elements = shape.createElements(ctx);
		expect(elements).not.toBeNull();
		const group = elements![0]!;
		expect(group.tagName.toLowerCase()).toBe('g');
		// Two children: outer ring circle + inner dot circle
		expect(group.childElementCount).toBe(2);
	});

	it('city type definition children are both <circle> elements', () => {
		const cityTypeDef = DEFAULT_SETTINGS.typeDefinitions.find((d) => d.name === 'city')!;
		const ctx = makeContextWithTypeDef(['300, 400'], cityTypeDef);
		const elements = shape.createElements(ctx)!;
		const group = elements[0]!;
		const circles = Array.from(group.children);
		expect(circles.every((el) => el.tagName.toLowerCase() === 'circle')).toBe(true);
	});

	it('object-level children override typeDefinition children', () => {
		const cityTypeDef = DEFAULT_SETTINGS.typeDefinitions.find((d) => d.name === 'city')!;
		// One child only — overrides the two from the type definition
		const ctx = makeContextWithTypeDef(['300, 400'], cityTypeDef, {
			children: [{ shape: 'circle', radius: 20 }],
		});
		const elements = shape.createElements(ctx)!;
		expect(elements[0]!.childElementCount).toBe(1);
	});

	it('uses parent object coordinates for children that do not specify their own', () => {
		const elements = renderShape(shape, ['50, 75'], {
			children: [{ shape: 'circle', radius: 8 }],
		});
		const circle = elements![0]!.children[0]!;
		expect(circle.getAttribute('cx')).toBe('50');
		expect(circle.getAttribute('cy')).toBe('75');
	});

	it('returns null when children array is empty', () => {
		expect(renderShape(shape, ['50, 50'], { children: [] })).toBeNull();
	});

	it('skips children with unknown shape names', () => {
		const elements = renderShape(shape, ['50, 50'], {
			children: [
				{ shape: 'nonexistent-shape' },
				{ shape: 'circle', radius: 5 },
			],
		});
		// Only the known circle should have rendered
		expect(elements).not.toBeNull();
		expect(elements![0]!.childElementCount).toBe(1);
	});
});
