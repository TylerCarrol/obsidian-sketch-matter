import { SvgShape, ShapeRenderContext, createSvgElement, toCoordinatePairs } from './base';

/**
 * Renders a rectangle from a position and dimensions.
 * Coordinates should be a single point [x, y] representing the top-left corner.
 * Width and height come from configurable frontmatter keys or native type-definition properties.
 * Optional corner radii come from configurable frontmatter keys.
 * The defaults are `sketchmatter-width`, `sketchmatter-height`, `sketchmatter-rx`, and `sketchmatter-ry`.
 */
export class RectShape extends SvgShape {
	readonly name = 'rect';

	createElements(context: ShapeRenderContext): SVGElement[] | null {
		const points = toCoordinatePairs(context.coordinates);
		if (!points || points.length === 0) {
			return null;
		}

		const props = context.object.properties;
		const [firstX, firstY] = points[0]!;
		const secondPoint = points.length > 1 ? points[1]! : null;
		const width = this.resolveNumericProp(
			props,
			context.settings.rectWidthProperty,
			'width',
			secondPoint ? Math.abs(secondPoint[0] - firstX) : 50,
		);
		const height = this.resolveNumericProp(
			props,
			context.settings.rectHeightProperty,
			'height',
			secondPoint ? Math.abs(secondPoint[1] - firstY) : 30,
		);
		const x = secondPoint ? Math.min(firstX, secondPoint[0]) : firstX;
		const y = secondPoint ? Math.min(firstY, secondPoint[1]) : firstY;

		const rect = createSvgElement('rect');
		rect.setAttribute('x', String(x));
		rect.setAttribute('y', String(y));
		rect.setAttribute('width', String(width));
		rect.setAttribute('height', String(height));

		const rx = this.resolveOptionalNumericProp(props, context.settings.rectRxProperty);
		if (rx != null) {
			rect.setAttribute('rx', String(rx));
		}

		const ry = this.resolveOptionalNumericProp(props, context.settings.rectRyProperty);
		if (ry != null) {
			rect.setAttribute('ry', String(ry));
		}

		this.applyRotation(rect, context, x + width / 2, y + height / 2);

		return [rect];
	}

	private resolveNumericProp(
		props: Record<string, unknown>,
		configuredKey: string,
		nativeKey: string,
		fallback: number,
	): number {
		const configuredValue = this.parsePositiveNumber(props[configuredKey]);
		if (configuredValue != null) {
			return configuredValue;
		}
		const nativeValue = this.parsePositiveNumber(props[nativeKey]);
		if (nativeValue != null) {
			return nativeValue;
		}

		return fallback;
	}

	private resolveOptionalNumericProp(
		props: Record<string, unknown>,
		configuredKey: string,
	): number | null {
		const configuredValue = this.parseNonNegativeNumber(props[configuredKey]);
		if (configuredValue != null) {
			return configuredValue;
		}

		return null;
	}

	private parsePositiveNumber(raw: unknown): number | null {
		if (raw != null) {
			const parsed = Number(raw);
			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed;
			}
		}
		return null;
	}

	private parseNonNegativeNumber(raw: unknown): number | null {
		if (raw != null) {
			const parsed = Number(raw);
			if (Number.isFinite(parsed) && parsed >= 0) {
				return parsed;
			}
		}
		return null;
	}
}
