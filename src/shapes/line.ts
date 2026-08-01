import { SvgShape, ShapeRenderContext, ShapeStyle, createSvgElement, toCoordinatePairs } from './base';
import { applyPointNoise } from './noise';

/**
 * Renders a line between two points.
 * Coordinates should be [[x1,y1], [x2,y2]].
 * If more than two points are provided, only the first and last are used.
 */
export class LineShape extends SvgShape {
	readonly name = 'line';

	createElements(context: ShapeRenderContext): SVGElement[] | null {
		const points = toCoordinatePairs(context.coordinates);
		if (!points || points.length < 2) {
			return null;
		}

		const first = points[0]!;
		const last = points[points.length - 1]!;
		const noisyPoints = applyPointNoise([first, last], context, false);

		if (noisyPoints.length > 2) {
			const polyline = createSvgElement('polyline');
			const pointsAttr = noisyPoints.map(([x, y]) => `${x},${y}`).join(' ');
			polyline.setAttribute('points', pointsAttr);
			return [polyline];
		}

		const line = createSvgElement('line');
		line.setAttribute('x1', String(first[0]));
		line.setAttribute('y1', String(first[1]));
		line.setAttribute('x2', String(last[0]));
		line.setAttribute('y2', String(last[1]));

		return [line];
	}

	protected applyStyle(element: SVGElement, style: ShapeStyle): void {
		// Lines have no fill by default
		element.setAttribute('fill', 'none');
		element.setAttribute('stroke', style.stroke);
		element.setAttribute('stroke-width', style.strokeWidth);
		if (style.opacity !== '1') {
			element.setAttribute('opacity', style.opacity);
		}
	}
}
