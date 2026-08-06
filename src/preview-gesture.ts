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

export function computePinchZoomState(input: PreviewPinchZoomInput): PreviewPinchZoomState {
	const ratio = input.currentDistance > 0 ? input.currentDistance / input.startDistance : 1;
	const nextZoom = clampZoom(input.startZoom * ratio, input.minZoom, input.maxZoom);
	const zoomRatio = nextZoom / input.startZoom;

	return {
		zoomLevel: nextZoom,
		scrollLeft: input.localX * zoomRatio - input.localX + input.startScrollLeft,
		scrollTop: input.localY * zoomRatio - input.localY + input.startScrollTop,
	};
}

function clampZoom(value: number, minZoom: number, maxZoom: number): number {
	if (!Number.isFinite(value)) {
		return minZoom;
	}
	return Math.min(maxZoom, Math.max(minZoom, Number(value.toFixed(2))));
}
