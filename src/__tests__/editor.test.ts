import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachEditorOverlay } from '../editor';
import { RENDERED_OBJECT_ID_ATTR } from '../renderer';
import { DEFAULT_SETTINGS, SketchMatterObject } from '../types';
import { TFile } from '../__mocks__/obsidian';

type Point = [number, number];

function makeObject(id: string, coordinates: unknown, typeName = 'river'): SketchMatterObject {
	return {
		objectId: id,
		sourcePath: `notes/${id}.md`,
		file: new TFile(`notes/${id}.md`),
		typeName,
		layer: 100,
		coordinates,
		coordinatesProperty: DEFAULT_SETTINGS.coordinatesProperty,
		imageIds: [],
		properties: {},
	};
}

function makeSvg(width = 400, height = 400): SVGSVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 200 100');
	svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
	svg.setAttribute('width', '200');
	svg.setAttribute('height', '100');
	Object.defineProperty(svg, 'getBoundingClientRect', {
		configurable: true,
		value: () => ({
			x: 0,
			y: 0,
			top: 0,
			left: 0,
			right: width,
			bottom: height,
			width,
			height,
			toJSON: () => ({}),
		}),
	});
	return svg;
}

function userToClient([x, y]: Point): Point {
	const scale = 2;
	const offsetY = 100;
	return [x * scale, y * scale + offsetY];
}

function pointerEvent(type: string, clientX: number, clientY: number, pointerId = 1): Event {
	const Evt = window.PointerEvent ?? window.MouseEvent;
	const event = new Evt(type, {
		bubbles: true,
		cancelable: true,
		button: 0,
		clientX,
		clientY,
	}) as Event & { pointerId?: number };
	if (typeof event.pointerId !== 'number') {
		Object.defineProperty(event, 'pointerId', { value: pointerId });
	}
	return event;
}

beforeAll(() => {
	if (!window.SVGRectElement) {
		vi.stubGlobal('SVGRectElement', class {});
	}
	if (!Element.prototype.instanceOf) {
		Object.defineProperty(Element.prototype, 'instanceOf', {
			configurable: true,
			value: function (this: Element, constructor: typeof SVGElement): boolean {
				if (constructor === SVGRectElement) return this.tagName === 'rect';
				if (constructor === SVGGraphicsElement) return this.tagName === 'text';
				return Object.prototype.isPrototypeOf.call(constructor.prototype, this);
			},
		});
	}
	if (!Element.prototype.setPointerCapture) {
		Element.prototype.setPointerCapture = () => { /* noop */ };
	}
	if (!Element.prototype.releasePointerCapture) {
		Element.prototype.releasePointerCapture = () => { /* noop */ };
	}
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = () => true;
	}
});

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('attachEditorOverlay', () => {
	it.each([45, -30, 90, 0])('follows a label angle of %s degrees through selection and dragging', (angle) => {
		const svg = makeSvg();
		document.body.appendChild(svg);
		const object = makeObject('label', ['50, 20'], 'label');
		const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		text.setAttribute(RENDERED_OBJECT_ID_ATTR, object.objectId);
		const transform = `rotate(${angle} 50 20)`;
		if (angle !== 0) text.setAttribute('transform', transform);
		Object.defineProperty(text, 'getBBox', {
			value: () => new DOMRect(50, 5, 80, 20),
		});
		svg.appendChild(text);
		const onCoordinatesChanged = vi.fn();
		const overlay = attachEditorOverlay(svg, [object], new Map(), DEFAULT_SETTINGS, vi.fn(), onCoordinatesChanged);
		const target = svg.querySelector<SVGRectElement>('.sketchmatter-hit-target')!;
		expect(target.tagName).toBe('rect');
		expect(target.getAttribute('x')).toBe('42');
		expect(target.getAttribute('y')).toBe('-3');
		expect(target.getAttribute('width')).toBe('96');
		expect(target.getAttribute('height')).toBe('36');
		expect(target.getAttribute('transform')).toBe(angle === 0 ? null : transform);
		expect(overlay.selectByPath(object.objectId)).toBe(true);

		const [startX, startY] = userToClient([60, 20]);
		target.dispatchEvent(pointerEvent('pointerdown', startX, startY));
		target.dispatchEvent(pointerEvent('pointermove', startX + 20, startY + 10));
		target.dispatchEvent(pointerEvent('pointermove', startX + 40, startY + 20));
		target.dispatchEvent(pointerEvent('pointerup', startX + 40, startY + 20));
		expect(onCoordinatesChanged.mock.calls[0]?.[1]).toEqual([[70, 30]]);
		if (angle !== 0) {
			expect(target.getAttribute('transform')).toBe(`translate(20 10) ${transform}`);
			expect(target.getAttribute('x')).toBe('42');
			expect(target.getAttribute('y')).toBe('-3');
		} else {
			expect(target.getAttribute('transform')).toBeNull();
			expect(target.getAttribute('x')).toBe('62');
			expect(target.getAttribute('y')).toBe('7');
		}

		const handle = svg.querySelector('.sketchmatter-handle')!;
		const [handleX, handleY] = userToClient([70, 30]);
		handle.dispatchEvent(pointerEvent('pointerdown', handleX, handleY));
		handle.dispatchEvent(pointerEvent('pointermove', handleX + 20, handleY));
		handle.dispatchEvent(pointerEvent('pointerup', handleX + 20, handleY));
		expect(onCoordinatesChanged.mock.calls[1]?.[1]).toEqual([[80, 30]]);
		if (angle !== 0) expect(target.getAttribute('transform')).toBe(`translate(30 10) ${transform}`);
	});

	it('drags a handle without snapping to pointer position', () => {
		const svg = makeSvg();
		document.body.appendChild(svg);

		const object = makeObject('path-1', ['50, 20', '150, 20']);
		const onCoordinatesChanged = vi.fn();

		attachEditorOverlay(
			svg,
			[object],
			new Map(),
			DEFAULT_SETTINGS,
			() => { /* noop */ },
			onCoordinatesChanged,
		);

		const hitTarget = svg.querySelector('.sketchmatter-hit-target');
		expect(hitTarget).not.toBeNull();
		hitTarget!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		const handle = svg.querySelector<SVGCircleElement>('.sketchmatter-handle');
		expect(handle).not.toBeNull();

		const [startX, startY] = userToClient([50, 20]);
		handle!.dispatchEvent(pointerEvent('pointerdown', startX + 10, startY + 5));
		handle!.dispatchEvent(pointerEvent('pointermove', startX + 30, startY + 5));
		handle!.dispatchEvent(pointerEvent('pointerup', startX + 30, startY + 5));

		expect(onCoordinatesChanged).toHaveBeenCalledTimes(1);
		const movedPoints = onCoordinatesChanged.mock.calls[0]?.[1] as Point[];
		expect(movedPoints[0]?.[0]).toBeCloseTo(60, 4);
		expect(movedPoints[0]?.[1]).toBeCloseTo(20, 4);
	});

	it('does not drag an entire object when whole-object dragging is disabled', () => {
		const svg = makeSvg();
		document.body.appendChild(svg);

		const object = makeObject('path-no-object-drag', ['50, 20', '150, 20']);
		const onCoordinatesChanged = vi.fn();

		attachEditorOverlay(
			svg,
			[object],
			new Map(),
			DEFAULT_SETTINGS,
			() => { /* noop */ },
			onCoordinatesChanged,
			{ allowWholeObjectDragging: false },
		);

		const hitTarget = svg.querySelector('.sketchmatter-hit-target');
		expect(hitTarget).not.toBeNull();
		hitTarget!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		const [startX, startY] = userToClient([50, 20]);
		hitTarget!.dispatchEvent(pointerEvent('pointerdown', startX, startY));
		hitTarget!.dispatchEvent(pointerEvent('pointermove', startX + 30, startY + 10));
		hitTarget!.dispatchEvent(pointerEvent('pointerup', startX + 30, startY + 10));

		expect(onCoordinatesChanged).not.toHaveBeenCalled();
	});

	it('accepts edge insertion within 10 screen pixels under letterboxing', () => {
		const svg = makeSvg();
		document.body.appendChild(svg);

		const object = makeObject('path-2', ['50, 20', '150, 20']);
		const onCoordinatesChanged = vi.fn();

		attachEditorOverlay(
			svg,
			[object],
			new Map(),
			DEFAULT_SETTINGS,
			() => { /* noop */ },
			onCoordinatesChanged,
		);

		const hitTarget = svg.querySelector('.sketchmatter-hit-target');
		expect(hitTarget).not.toBeNull();
		hitTarget!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		const [lineX, lineY] = userToClient([100, 20]);
		hitTarget!.dispatchEvent(new MouseEvent('click', {
			bubbles: true,
			clientX: lineX,
			clientY: lineY + 8,
		}));

		expect(onCoordinatesChanged).toHaveBeenCalledTimes(1);
		const insertedPoints = onCoordinatesChanged.mock.calls[0]?.[1] as Point[];
		expect(insertedPoints).toHaveLength(3);
	});

	it('snaps a dragged point to a nearby point on any other object', () => {
		const svg = makeSvg();
		document.body.appendChild(svg);

		const movingObject = makeObject('path-3', ['50, 20', '150, 20']);
		const targetObject = makeObject('target-1', ['70, 20'], 'continent');
		const onCoordinatesChanged = vi.fn();

		attachEditorOverlay(
			svg,
			[movingObject, targetObject],
			new Map(),
			DEFAULT_SETTINGS,
			() => { /* noop */ },
			onCoordinatesChanged,
			{ snapMode: 'all-points' },
		);

		const hitTarget = svg.querySelector('.sketchmatter-hit-target');
		hitTarget!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(svg.querySelectorAll('.sketchmatter-snap-point')).toHaveLength(1);

		const handle = svg.querySelector<SVGCircleElement>('.sketchmatter-handle');
		const [startX, startY] = userToClient([50, 20]);
		const [nearTargetX, nearTargetY] = userToClient([68, 20]);
		handle!.dispatchEvent(pointerEvent('pointerdown', startX, startY));
		handle!.dispatchEvent(pointerEvent('pointermove', nearTargetX, nearTargetY));
		handle!.dispatchEvent(pointerEvent('pointerup', nearTargetX, nearTargetY));

		const movedPoints = onCoordinatesChanged.mock.calls[0]?.[1] as Point[];
		expect(movedPoints[0]).toEqual([70, 20]);
	});

	it('shows and snaps only to points on objects of the same type', () => {
		const svg = makeSvg();
		document.body.appendChild(svg);

		const movingObject = makeObject('path-4', ['50, 20', '150, 20']);
		const differentTypeTarget = makeObject('target-2', ['68, 20'], 'continent');
		const sameTypeTarget = makeObject('target-3', ['70, 20']);
		const onCoordinatesChanged = vi.fn();

		attachEditorOverlay(
			svg,
			[movingObject, differentTypeTarget, sameTypeTarget],
			new Map(),
			DEFAULT_SETTINGS,
			() => { /* noop */ },
			onCoordinatesChanged,
			{ snapMode: 'same-type' },
		);

		const hitTarget = svg.querySelector('.sketchmatter-hit-target');
		hitTarget!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(svg.querySelectorAll('.sketchmatter-snap-point')).toHaveLength(1);

		const handle = svg.querySelector<SVGCircleElement>('.sketchmatter-handle');
		const [startX, startY] = userToClient([50, 20]);
		const [differentTargetX, differentTargetY] = userToClient([68, 20]);
		handle!.dispatchEvent(pointerEvent('pointerdown', startX, startY));
		handle!.dispatchEvent(pointerEvent('pointermove', differentTargetX, differentTargetY));
		handle!.dispatchEvent(pointerEvent('pointerup', differentTargetX, differentTargetY));

		const movedPoints = onCoordinatesChanged.mock.calls[0]?.[1] as Point[];
		expect(movedPoints[0]).toEqual([70, 20]);
	});

	it('does not show or snap to nearby points when snapping is disabled', () => {
		const svg = makeSvg();
		document.body.appendChild(svg);

		const movingObject = makeObject('path-5', ['50, 20', '150, 20']);
		const targetObject = makeObject('target-4', ['70, 20']);
		const onCoordinatesChanged = vi.fn();

		attachEditorOverlay(
			svg,
			[movingObject, targetObject],
			new Map(),
			DEFAULT_SETTINGS,
			() => { /* noop */ },
			onCoordinatesChanged,
			{ snapMode: 'disabled' },
		);

		const hitTarget = svg.querySelector('.sketchmatter-hit-target');
		hitTarget!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(svg.querySelectorAll('.sketchmatter-snap-point')).toHaveLength(0);

		const handle = svg.querySelector<SVGCircleElement>('.sketchmatter-handle');
		const [startX, startY] = userToClient([50, 20]);
		const [nearTargetX, nearTargetY] = userToClient([68, 20]);
		handle!.dispatchEvent(pointerEvent('pointerdown', startX, startY));
		handle!.dispatchEvent(pointerEvent('pointermove', nearTargetX, nearTargetY));
		handle!.dispatchEvent(pointerEvent('pointerup', nearTargetX, nearTargetY));

		const movedPoints = onCoordinatesChanged.mock.calls[0]?.[1] as Point[];
		expect(movedPoints[0]).toEqual([68, 20]);
	});
});
