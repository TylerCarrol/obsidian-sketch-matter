import { describe, expect, it } from 'vitest';
import { clampPreviewZoom, computePinchZoomState, stepPreviewZoom } from '../preview-gesture';

describe('computePinchZoomState', () => {
	it('scales zoom around the pinch center while preserving the viewed content', () => {
		const state = computePinchZoomState({
			startZoom: 1,
			startDistance: 100,
			currentDistance: 200,
			startScrollLeft: 0,
			startScrollTop: 0,
			localX: 50,
			localY: 40,
			minZoom: 0.25,
			maxZoom: 4,
		});

		expect(state.zoomLevel).toBe(2);
		expect(state.scrollLeft).toBe(50);
		expect(state.scrollTop).toBe(40);
	});

	it('clamps zoom to the configured bounds', () => {
		const state = computePinchZoomState({
			startZoom: 1,
			startDistance: 100,
			currentDistance: 1000,
			startScrollLeft: 0,
			startScrollTop: 0,
			localX: 10,
			localY: 20,
			minZoom: 0.25,
			maxZoom: 4,
		});

		expect(state.zoomLevel).toBe(4);
		expect(state.scrollLeft).toBe(30);
		expect(state.scrollTop).toBe(60);
	});

	it('allows the upper bound to be disabled', () => {
		expect(clampPreviewZoom(12.345, 0.25, 0)).toBe(12.35);
		expect(clampPreviewZoom(0.001, 0, 0)).toBe(0.01);
	});

	it('steps zoom multiplicatively for button and wheel zooming', () => {
		expect(stepPreviewZoom(1, 'in')).toBe(1.1);
		expect(stepPreviewZoom(1, 'out')).toBe(0.91);
	});
});
