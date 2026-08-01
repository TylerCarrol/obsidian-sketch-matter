export { SvgShape, createSvgElement, toCoordinatePairs } from './base';
export type { ShapeStyle, ShapeRenderContext } from './base';
export { PolygonShape } from './polygon';
export { LineShape } from './line';
export { PolylineShape } from './polyline';
export { TextShape } from './text';
export { CircleShape } from './circle';
export { RectShape } from './rect';
export { EllipseShape } from './ellipse';
export { CompositeShape } from './composite';
export type { CompositeChild } from './composite';
export {
	registerShape,
	getShape,
	getRegisteredShapeNames,
	DEFAULT_POLYGON_SHAPE,
	DEFAULT_POINT_SHAPE,
	DEFAULT_FALLBACK_SHAPE,
} from './registry';

// Register all built-in shapes here (after all modules are fully resolved)
// to avoid circular dependency issues between composite.ts and registry.ts.
import { registerShape } from './registry';
import { PolygonShape } from './polygon';
import { LineShape } from './line';
import { PolylineShape } from './polyline';
import { TextShape } from './text';
import { CircleShape } from './circle';
import { RectShape } from './rect';
import { EllipseShape } from './ellipse';
import { CompositeShape } from './composite';

registerShape(new PolygonShape());
registerShape(new LineShape());
registerShape(new PolylineShape());
registerShape(new TextShape());
registerShape(new CircleShape());
registerShape(new RectShape());
registerShape(new EllipseShape());
registerShape(new CompositeShape());
