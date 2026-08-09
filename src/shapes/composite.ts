import { SvgShape, ShapeRenderContext, ShapeStyle, createSvgElement, toCoordinatePairs } from './base';
import { getShape } from './registry';

/**
 * Definition for a single child element within a composite shape.
 */
export interface CompositeChild {
	name?: string;
	shape: string;
	coordinates?: unknown;
	relativeCoordinates?: boolean;
	style?: Record<string, string | number>;
	[key: string]: unknown;
}

/**
 * Renders a composite shape composed of multiple child shapes grouped together.
 * Children are defined in the object's `children` frontmatter property as an array.
 *
 * Example frontmatter:
 * ```yaml
 * shape: composite
 * children:
 *   - shape: circle
 *     sketchmatter-coordinates: "200, 200"
 *     radius: 40
 *     fill: "#cc0000"
 *   - shape: circle
 *     sketchmatter-coordinates: "200, 200"
 *     radius: 25
 *     fill: "#ffffff"
 *   - shape: circle
 *     sketchmatter-coordinates: "200, 200"
 *     radius: 10
 *     fill: "#cc0000"
 * ```
 */
export class CompositeShape extends SvgShape {
	readonly name = 'composite';

	createElements(context: ShapeRenderContext): SVGElement[] | null {
		const children = this.resolveChildren(context);
		if (!children || children.length === 0) {
			return null;
		}

		const group = createSvgElement('g');

		for (const child of children) {
			const childShape = getShape(child.shape);
			if (!childShape) {
				continue;
			}

			const childContext = this.buildChildContext(context, child);
			const elements = childShape.createElements(childContext);
			if (!elements) {
				continue;
			}

			const childStyle = this.resolveChildStyle(context, child);
			for (const element of elements) {
				childShape['applyStyle'](element, childStyle);
				group.appendChild(element);
			}
		}

		if (group.childElementCount === 0) {
			return null;
		}

		const points = toCoordinatePairs(context.coordinates);
		if (points && points.length > 0) {
			const [anchorX, anchorY] = points[0]!;
			this.applyRotation(group, context, anchorX, anchorY);
		}

		return [group];
	}

	protected applyStyle(element: SVGElement, style: ShapeStyle): void {
		// Only apply group-level opacity; children handle their own fill/stroke
		if (style.opacity !== '1') {
			element.setAttribute('opacity', style.opacity);
		}
	}

	private resolveChildren(context: ShapeRenderContext): CompositeChild[] | null {
		// Prefer per-object children, then fall back to type-definition defaults.
		// This lets a type definition like 'city' declare a canonical composite
		// structure so individual notes don't need to repeat it.
		const configuredChildrenKey = context.settings.objectChildrenProperty;
		const raw =
			context.object.properties[configuredChildrenKey] ??
			context.object.properties['children'] ??
			context.typeDefinition?.properties?.['children'];
		if (!Array.isArray(raw)) {
			return null;
		}

		const result: CompositeChild[] = [];
		for (const entry of raw) {
			if (typeof entry !== 'object' || entry === null) {
				continue;
			}
			const record = entry as Record<string, unknown>;
			const shape =
				record[context.settings.objectShapeProperty] ??
				record['shape'] ??
				record['sketchmatter-shape'];
			if (typeof shape !== 'string' || shape.length === 0) {
				continue;
			}
			result.push({ ...record, shape });
		}

		return result.length > 0 ? result : null;
	}

	private buildChildContext(
		parentContext: ShapeRenderContext,
		child: CompositeChild,
	): ShapeRenderContext {
		// Child coordinates override the parent's, falling back to parent coordinates
		const childCoordinates = child['coordinates'] ?? child['sketchmatter-coordinates'] ?? parentContext.coordinates;
		const resolvedChildCoordinates = child.relativeCoordinates
			? this.offsetCoordinates(childCoordinates, parentContext.coordinates)
			: childCoordinates;

		// Merge child properties onto parent properties so the child shape
		// can resolve its own style and dimension properties
		const childProperties: Record<string, unknown> = {
			...parentContext.object.properties,
		};
		for (const [key, value] of Object.entries(child)) {
			if (key !== 'shape' && key !== parentContext.settings.objectShapeProperty && key !== 'style') {
				childProperties[key] = value;
			}
		}

		return {
			object: {
				...parentContext.object,
				properties: childProperties,
			},
			typeDefinition: parentContext.typeDefinition,
			typeDefinitions: parentContext.typeDefinitions,
			coordinates: resolvedChildCoordinates,
			settings: parentContext.settings,
		};
	}

	private offsetCoordinates(childCoordinates: unknown, parentCoordinates: unknown): unknown {
		const parentPoints = this.toPointArray(parentCoordinates);
		if (!parentPoints || parentPoints.length === 0) {
			return childCoordinates;
		}

		const [offsetX, offsetY] = parentPoints[0]!;
		const childPoints = this.toPointArray(childCoordinates);
		if (!childPoints || childPoints.length === 0) {
			return childCoordinates;
		}

		return childPoints.map(([x, y]) => `${x + offsetX}, ${y + offsetY}`);
	}

	private toPointArray(value: unknown): [number, number][] | null {
		if (
			Array.isArray(value) &&
			value.length === 2 &&
			typeof value[0] === 'number' &&
			typeof value[1] === 'number'
		) {
			return [value as [number, number]];
		}

		if (Array.isArray(value) && value.length > 0) {
			const pairs: [number, number][] = [];
			for (const entry of value) {
				if (typeof entry === 'string') {
					const parts = entry.split(',');
					if (parts.length !== 2) {
						return null;
					}
					const x = Number(parts[0]?.trim());
					const y = Number(parts[1]?.trim());
					if (!Number.isFinite(x) || !Number.isFinite(y)) {
						return null;
					}
					pairs.push([x, y]);
					continue;
				}
				if (Array.isArray(entry) && entry.length === 2) {
					const x = Number(entry[0]);
					const y = Number(entry[1]);
					if (!Number.isFinite(x) || !Number.isFinite(y)) {
						return null;
					}
					pairs.push([x, y]);
					continue;
				}
				return null;
			}
			return pairs;
		}

		if (typeof value === 'string') {
			const parts = value.split(',');
			if (parts.length !== 2) {
				return null;
			}
			const x = Number(parts[0]?.trim());
			const y = Number(parts[1]?.trim());
			return Number.isFinite(x) && Number.isFinite(y) ? [[x, y]] : null;
		}

		return null;
	}

	private resolveChildStyle(
		parentContext: ShapeRenderContext,
		child: CompositeChild,
	): ShapeStyle {
		const parentTypeStyle = parentContext.typeDefinition?.style ?? {};
		const childStyle = child.style ?? {};

		// Child inline style → child properties → parent type style → defaults
		return {
			fill: this.getChildStyleValue('fill', child, childStyle, parentTypeStyle, 'transparent'),
			stroke: this.getChildStyleValue('stroke', child, childStyle, parentTypeStyle, '#333333'),
			strokeWidth: this.getChildStyleValue('strokeWidth', child, childStyle, parentTypeStyle, '2'),
			opacity: this.getChildStyleValue('opacity', child, childStyle, parentTypeStyle, '1'),
		};
	}

	private getChildStyleValue(
		key: string,
		child: CompositeChild,
		childStyle: Record<string, string | number>,
		parentTypeStyle: Record<string, string | number>,
		fallback: string,
	): string {
		// Direct property on child (e.g., fill: "#cc0000" at top level of child)
		const directValue = child[key];
		if (typeof directValue === 'string' && directValue.length > 0) {
			return directValue;
		}
		if (typeof directValue === 'number') {
			return String(directValue);
		}

		// Child style object
		const styleValue = childStyle[key];
		if (styleValue != null) {
			return String(styleValue);
		}

		// Parent type style
		const parentValue = parentTypeStyle[key];
		if (parentValue != null) {
			return String(parentValue);
		}

		return fallback;
	}
}
