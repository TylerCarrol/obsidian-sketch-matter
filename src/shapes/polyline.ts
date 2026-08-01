import { SvgShape, ShapeRenderContext, ShapeStyle, createSvgElement, toCoordinatePairs } from './base';
import { applyPointNoise } from './noise';

/**
 * Renders an open polyline (series of connected line segments, not closed).
 * Coordinates should be [[x1,y1], [x2,y2], [x3,y3], ...].
 * Use polygon for closed shapes.
 */
export class PolylineShape extends SvgShape {
	readonly name = 'polyline';

	createElements(context: ShapeRenderContext): SVGElement[] | null {
		const points = toCoordinatePairs(context.coordinates);
		if (!points || points.length < 2) {
			return null;
		}

		const finalPoints = applyPointNoise(points, context, false);
		const polyline = createSvgElement('polyline');
		const pointsAttr = finalPoints.map(([x, y]) => `${x},${y}`).join(' ');
		polyline.setAttribute('points', pointsAttr);

		return [polyline];
	}

	protected applyStyle(element: SVGElement, style: ShapeStyle): void {
		// Polylines default to no fill (open path)
		element.setAttribute('fill', style.fill === 'transparent' ? 'none' : style.fill);
		element.setAttribute('stroke', style.stroke);
		element.setAttribute('stroke-width', style.strokeWidth);
		if (style.opacity !== '1') {
			element.setAttribute('opacity', style.opacity);
		}
	}
}
