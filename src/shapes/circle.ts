import { SvgShape, ShapeRenderContext, createSvgElement, toCoordinatePairs } from './base';

/**
 * Renders a circle at a given center point with a radius.
 * Coordinates should be a single point [cx, cy].
 * Radius is taken from the configured property (default: sketchmatter-radius),
 * with `radius` and `r` kept as legacy aliases (default radius: 10).
 */
export class CircleShape extends SvgShape {
	readonly name = 'circle';

	createElements(context: ShapeRenderContext): SVGElement[] | null {
		const points = toCoordinatePairs(context.coordinates);
		if (!points || points.length === 0) {
			return null;
		}

		const [cx, cy] = points[0]!;
		const radius = this.resolveRadius(context);

		const circle = createSvgElement('circle');
		circle.setAttribute('cx', String(cx));
		circle.setAttribute('cy', String(cy));
		circle.setAttribute('r', String(radius));
		this.applyRotation(circle, context, cx, cy);

		return [circle];
	}

	private resolveRadius(context: ShapeRenderContext): number {
		const props = context.object.properties;
		const raw = props[context.settings.radiusProperty] ?? props['radius'] ?? props['r'];
		if (raw != null) {
			const parsed = Number(raw);
			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed;
			}
		}

		return 10;
	}
}
