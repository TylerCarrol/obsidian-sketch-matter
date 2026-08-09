export type PreviewPinchZoomInput = {
	startZoom: number;
	startDistance: number;
	currentDistance: number;
	startScrollLeft: number;
	startScrollTop: number;
	localX: number;
	localY: number;
	minZoom: number;
	maxZoom: number;
};

export type PreviewPinchZoomState = {
	zoomLevel: number;
	scrollLeft: number;
	scrollTop: number;
};

const PREVIEW_ZOOM_FLOOR = 0.01;
const PREVIEW_ZOOM_FACTOR = 1.1;

export function computePinchZoomState(input: PreviewPinchZoomInput): PreviewPinchZoomState {
	const ratio = input.currentDistance > 0 ? input.currentDistance / input.startDistance : 1;
	const nextZoom = clampPreviewZoom(input.startZoom * ratio, input.minZoom, input.maxZoom);
	const zoomRatio = nextZoom / input.startZoom;

	return {
		zoomLevel: nextZoom,
		scrollLeft: input.localX * zoomRatio - input.localX + input.startScrollLeft,
		scrollTop: input.localY * zoomRatio - input.localY + input.startScrollTop,
	};
}

export function clampPreviewZoom(value: number, minZoom: number, maxZoom: number): number {
	const resolvedMinZoom = minZoom > 0 ? minZoom : PREVIEW_ZOOM_FLOOR;
	const resolvedMaxZoom = maxZoom > 0 ? maxZoom : Number.POSITIVE_INFINITY;

	if (!Number.isFinite(value)) {
		return resolvedMinZoom;
	}
	return Math.min(resolvedMaxZoom, Math.max(resolvedMinZoom, Number(value.toFixed(2))));
}

export function stepPreviewZoom(currentZoom: number, direction: 'in' | 'out'): number {
	const factor = direction === 'in' ? PREVIEW_ZOOM_FACTOR : 1 / PREVIEW_ZOOM_FACTOR;
	return Number((currentZoom * factor).toFixed(2));
}
