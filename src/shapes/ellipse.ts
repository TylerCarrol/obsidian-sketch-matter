import { SvgShape, ShapeRenderContext, createSvgElement, toCoordinatePairs } from './base';

/**
 * Renders an ellipse at a given center point.
 * Coordinates should be a single point [cx, cy].
 * Radii are taken from `rx` and `ry` properties (defaults: rx=20, ry=10).
 */
export class EllipseShape extends SvgShape {
	readonly name = 'ellipse';

	createElements(context: ShapeRenderContext): SVGElement[] | null {
		const points = toCoordinatePairs(context.coordinates);
		if (!points || points.length === 0) {
			return null;
		}

		const [cx, cy] = points[0]!;
		const props = context.object.properties;

		const rx = this.resolveRadius(props, 'rx', 20);
		const ry = this.resolveRadius(props, 'ry', 10);

		const ellipse = createSvgElement('ellipse');
		ellipse.setAttribute('cx', String(cx));
		ellipse.setAttribute('cy', String(cy));
		ellipse.setAttribute('rx', String(rx));
		ellipse.setAttribute('ry', String(ry));
		this.applyRotation(ellipse, context, cx, cy);

		return [ellipse];
	}

	private resolveRadius(
		props: Record<string, unknown>,
		key: string,
		fallback: number,
	): number {
		const raw = props[key];
		if (raw != null) {
			const parsed = Number(raw);
			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed;
			}
		}
		return fallback;
	}
}
