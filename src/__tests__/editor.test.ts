import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachEditorOverlay } from '../editor';
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
