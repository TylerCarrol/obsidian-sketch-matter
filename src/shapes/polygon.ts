import { SvgShape, ShapeRenderContext, createSvgElement, toCoordinatePairs, toPointBoundsCenter } from './base';
import { applyPointNoise } from './noise';

/**
 * Renders a closed polygon from an array of coordinate pairs.
 * Coordinates should be provided as [[x1,y1], [x2,y2], ...].
 * The path is automatically closed.
 */
export class PolygonShape extends SvgShape {
	readonly name = 'polygon';

	createElements(context: ShapeRenderContext): SVGElement[] | null {
		const points = toCoordinatePairs(context.coordinates);
		if (!points || points.length < 3) {
			return null;
		}

		const finalPoints = applyPointNoise(points, context, true);
		const polygon = createSvgElement('polygon');
		const pointsAttr = finalPoints.map(([x, y]) => `${x},${y}`).join(' ');
		polygon.setAttribute('points', pointsAttr);
		const [centerX, centerY] = toPointBoundsCenter(finalPoints);
		this.applyRotation(polygon, context, centerX, centerY);

		return [polygon];
	}
}
