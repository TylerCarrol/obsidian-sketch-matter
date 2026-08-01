import { SvgShape } from './base';

/**
 * Registry of all available SVG shape renderers.
 * Maps shape name → shape instance.
 */
const shapeRegistry = new Map<string, SvgShape>();

/**
 * Register a shape renderer in the global registry.
 */
export function registerShape(shape: SvgShape): void {
	shapeRegistry.set(shape.name, shape);
}

/**
 * Look up a shape renderer by name.
 * Returns undefined if no shape with that name is registered.
 */
export function getShape(name: string): SvgShape | undefined {
	return shapeRegistry.get(name);
}

/**
 * Get all registered shape names.
 */
export function getRegisteredShapeNames(): string[] {
	return Array.from(shapeRegistry.keys());
}

/**
 * The default shape used when no shape is specified and coordinates
 * suggest a closed polygon (3+ points).
 */
export const DEFAULT_POLYGON_SHAPE = 'polygon';

/**
 * The default shape used for a single coordinate point.
 */
export const DEFAULT_POINT_SHAPE = 'circle';

/**
 * The fallback shape when no coordinates are available.
 */
export const DEFAULT_FALLBACK_SHAPE = 'text';
