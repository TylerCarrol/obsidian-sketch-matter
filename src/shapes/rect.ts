import { SvgShape, ShapeRenderContext, createSvgElement, toCoordinatePairs } from './base';

/**
 * Renders a rectangle from a position and dimensions.
 * Coordinates should be a single point [x, y] representing the top-left corner.
 * Width and height are taken from the object's `width`/`height` properties.
 * Optionally supports `rx`/`ry` for rounded corners.
 */
export class RectShape extends SvgShape {
	readonly name = 'rect';

	createElements(context: ShapeRenderContext): SVGElement[] | null {
		const points = toCoordinatePairs(context.coordinates);
		if (!points || points.length === 0) {
			return null;
		}

		const [x, y] = points[0]!;
		const props = context.object.properties;

		const width = this.resolveNumericProp(props, 'width', 50);
		const height = this.resolveNumericProp(props, 'height', 30);

		const rect = createSvgElement('rect');
		rect.setAttribute('x', String(x));
		rect.setAttribute('y', String(y));
		rect.setAttribute('width', String(width));
		rect.setAttribute('height', String(height));

		const rx = this.resolveOptionalNumericProp(props, 'rx');
		if (rx != null) {
			rect.setAttribute('rx', String(rx));
		}

		const ry = this.resolveOptionalNumericProp(props, 'ry');
		if (ry != null) {
			rect.setAttribute('ry', String(ry));
		}

		return [rect];
	}

	private resolveNumericProp(
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

	private resolveOptionalNumericProp(
		props: Record<string, unknown>,
		key: string,
	): number | null {
		const raw = props[key];
		if (raw != null) {
			const parsed = Number(raw);
			if (Number.isFinite(parsed) && parsed >= 0) {
				return parsed;
			}
		}
		return null;
	}
}
