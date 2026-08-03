import {
	DEFAULT_SETTINGS,
	LayerRenderOrder,
	SketchMatterImageDefinition,
	SketchMatterObject,
	SketchMatterSettings,
	SketchMatterTypeDefinition,
	RESOLVED_TEXTURE_PROPERTY,
} from './types';
import {
	createSvgElement,
	toCoordinatePairs,
	ShapeRenderContext,
	getShape,
	DEFAULT_POLYGON_SHAPE,
	DEFAULT_POINT_SHAPE,
	DEFAULT_FALLBACK_SHAPE,
} from './shapes';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
export const RENDERED_OBJECT_ID_ATTR = 'data-sketchmatter-object-id';

/**
 * Module-level counter that makes every generated SVG ID unique across all
 * renders in the same document lifetime.  Multiple SVGs rendered in the same
 * HTML document (e.g. a code-block preview and the SketchMatterView side panel)
 * would otherwise produce identical IDs such as `sketchmatter-mask-1`, causing
 * Chromium to resolve `url(#id)` references to the *first* matching element in
 * document order.  When that first element is later removed (e.g. because the
 * user navigates away from the note containing the code block), the reference
 * becomes stale and the mask disappears.
 */
let svgIdCounter = 0;

function nextSvgId(prefix: string): string {
	return `${prefix}-${++svgIdCounter}`;
}

interface ResolvedRenderableObject {
	object: SketchMatterObject;
	typeDefinition: SketchMatterTypeDefinition | null;
	shapeName: string;
}

interface RenderSupportState {
	defs: SVGDefsElement;
	typeDefinitions: Map<string, SketchMatterTypeDefinition>;
	resolvedObjects: ResolvedRenderableObject[];
	maskIdByKey: Map<string, string>;
	textureIdBySource: Map<string, string>;
	filterIdByRadius: Map<number, string>;
	overlapMaskIdByKey: Map<string, string>;
	overlapPatternIdByKey: Map<string, string>;
}

interface MultipartChild {
	shape?: string;
	coordinates?: unknown;
	style?: Record<string, unknown>;
	[key: string]: unknown;
}

type OverlapPatternKind = 'lines' | 'hatch' | 'crosshatch' | 'dots';

/**
 * Infer the appropriate shape name based on the object's coordinates
 * when no explicit shape is specified.
 */
function inferShapeName(coordinates: unknown): string {
	const points = toCoordinatePairs(coordinates);
	if (!points || points.length === 0) {
		return DEFAULT_FALLBACK_SHAPE;
	}
	if (points.length === 1) {
		return DEFAULT_POINT_SHAPE;
	}
	if (points.length === 2) {
		return 'line';
	}
	return DEFAULT_POLYGON_SHAPE;
}

function resolveConfiguredProperty(
	properties: Record<string, unknown>,
	configuredKey: string,
	legacyKeys: string[],
): unknown {
	const configuredValue = properties[configuredKey];
	if (configuredValue != null) {
		return configuredValue;
	}

	for (const legacyKey of legacyKeys) {
		if (legacyKey === configuredKey) {
			continue;
		}
		const legacyValue = properties[legacyKey];
		if (legacyValue != null) {
			return legacyValue;
		}
	}

	return undefined;
}

function resolveShapeOverride(properties: Record<string, unknown>, settings: SketchMatterSettings): string | null {
	const rawShape = resolveConfiguredProperty(properties, settings.objectShapeProperty, ['shape', 'sketchmatter-shape']);
	if (typeof rawShape !== 'string') {
		return null;
	}

	const normalized = rawShape.trim();
	return normalized.length > 0 ? normalized : null;
}

function resolveMultipartChildren(
	properties: Record<string, unknown>,
	settings: SketchMatterSettings,
): MultipartChild[] {
	const rawChildren = resolveConfiguredProperty(properties, settings.objectChildrenProperty, ['children']);
	if (!Array.isArray(rawChildren)) {
		return [];
	}

	return rawChildren.filter(
		(entry): entry is MultipartChild =>
			typeof entry === 'object' &&
			entry !== null &&
			'coordinates' in (entry as Record<string, unknown>),
	);
}

/**
 * Resolve the shape name for an object, considering the type definition hierarchy.
 */
function resolveShapeName(
	object: SketchMatterObject,
	typeDefinition: SketchMatterTypeDefinition | null,
	typeDefinitions: Map<string, SketchMatterTypeDefinition>,
	settings: SketchMatterSettings,
): string {
	// Check object-level shape override
	const objectShape = resolveShapeOverride(object.properties, settings);
	if (objectShape) {
		return objectShape;
	}

	// Walk up the type inheritance chain to find a shape
	let current = typeDefinition;
	const visited = new Set<string>();
	while (current) {
		if (current.shape) {
			return current.shape;
		}
		if (current.extends && !visited.has(current.extends)) {
			visited.add(current.extends);
			current = typeDefinitions.get(current.extends) ?? null;
		} else {
			break;
		}
	}

	// Infer from coordinates
	return inferShapeName(object.coordinates);
}

function resolveRenderableObject(
	object: SketchMatterObject,
	typeDefinitions: Map<string, SketchMatterTypeDefinition>,
	settings: SketchMatterSettings,
): ResolvedRenderableObject {
	const typeDefinition = typeDefinitions.get(object.typeName) ?? null;
	const shapeName = resolveShapeName(object, typeDefinition, typeDefinitions, settings);
	return { object, typeDefinition, shapeName };
}

function parseStringList(raw: unknown): string[] {
	if (typeof raw === 'string') {
		return raw
			.split(/[\n,]+/g)
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	if (Array.isArray(raw)) {
		return raw
			.filter((entry): entry is string => typeof entry === 'string')
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	return [];
}

function parsePositiveNumber(raw: unknown, fallback: number): number {
	if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
		return raw;
	}
	if (typeof raw === 'string') {
		const parsed = Number.parseFloat(raw);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}
	}
	return fallback;
}

function parseFiniteNumber(raw: unknown, fallback: number): number {
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return raw;
	}
	if (typeof raw === 'string') {
		const parsed = Number.parseFloat(raw);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return fallback;
}

function normalizeAngleDegrees(raw: unknown, fallback: number): number {
	const parsed = parseFiniteNumber(raw, fallback);
	const normalized = ((parsed % 360) + 360) % 360;
	return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeOverlapPatternKind(raw: unknown): OverlapPatternKind | null {
	if (typeof raw !== 'string') {
		return null;
	}
	const normalized = raw.trim().toLowerCase();
	if (!normalized) {
		return null;
	}
	if (normalized === 'line' || normalized === 'lines') {
		return 'lines';
	}
	if (normalized === 'hatch' || normalized === 'diagonal') {
		return 'hatch';
	}
	if (normalized === 'crosshatch' || normalized === 'cross-hatch') {
		return 'crosshatch';
	}
	if (normalized === 'dots' || normalized === 'dot') {
		return 'dots';
	}
	return null;
}

function hasSharedImageId(source: SketchMatterObject, target: SketchMatterObject): boolean {
	if (source.imageIds.length === 0) {
		return true;
	}
	if (target.imageIds.length === 0) {
		return false;
	}
	const targetIds = new Set(target.imageIds);
	return source.imageIds.some((id) => targetIds.has(id));
}

function selectorMatchesObject(selector: string, target: SketchMatterObject): boolean {
	const normalized = selector.trim();
	if (!normalized) {
		return false;
	}

	const lower = normalized.toLowerCase();
	const targetType = target.typeName.toLowerCase();
	const targetPath = target.sourcePath.toLowerCase();
	const targetName = target.file.basename.toLowerCase();

	if (lower.startsWith('type:')) {
		return targetType === lower.slice('type:'.length).trim();
	}
	if (lower.startsWith('file:')) {
		const fileSelector = lower.slice('file:'.length).trim();
		return targetPath === fileSelector || targetName === fileSelector;
	}

	return targetType === lower || targetPath === lower || targetName === lower;
}

function buildMaskSources(
	object: SketchMatterObject,
	state: RenderSupportState,
	settings: SketchMatterSettings,
): ResolvedRenderableObject[] {
	const selectors = parseStringList(object.properties[settings.maskProperty]);
	if (selectors.length === 0) {
		return [];
	}

	return state.resolvedObjects.filter(
		(target) =>
			target.object !== object &&
			hasSharedImageId(object, target.object) &&
			selectors.some((selector) => selectorMatchesObject(selector, target.object)),
	);
}

function ensureMaskId(
	object: SketchMatterObject,
	maskSources: ResolvedRenderableObject[],
	settings: SketchMatterSettings,
	state: RenderSupportState,
): string | null {
	if (maskSources.length === 0) {
		return null;
	}

	const selectorKey = parseStringList(object.properties[settings.maskProperty]).join('|');
	const sourceKey = maskSources.map((source) => source.object.objectId).sort().join('|');
	const cacheKey = `${selectorKey}::${sourceKey}`;
	const cached = state.maskIdByKey.get(cacheKey);
	if (cached) {
		return cached;
	}

	const clipPathId = nextSvgId('sketchmatter-mask');
	const clipPath = createSvgElement('clipPath');
	clipPath.setAttribute('id', clipPathId);

	for (const source of maskSources) {
		const shape = getShape(source.shapeName);
		if (!shape) {
			continue;
		}

		const context: ShapeRenderContext = {
			object: source.object,
			typeDefinition: source.typeDefinition,
			typeDefinitions: state.typeDefinitions,
			coordinates: source.object.coordinates,
			settings,
		};

		const elements = shape.createElements(context);
		if (!elements || elements.length === 0) {
			continue;
		}

		for (const element of elements) {
			clipPath.appendChild(element.cloneNode(true));
		}
	}

	if (clipPath.childElementCount === 0) {
		return null;
	}

	state.defs.appendChild(clipPath);
	state.maskIdByKey.set(cacheKey, clipPathId);
	return clipPathId;
}

function buildOverlapSources(
	object: SketchMatterObject,
	state: RenderSupportState,
): ResolvedRenderableObject[] {
	return state.resolvedObjects.filter(
		(target) =>
			target.object !== object &&
			target.object.typeName === object.typeName &&
			hasSharedImageId(object, target.object),
	);
}

function ensureOverlapMaskId(
	object: SketchMatterObject,
	overlapSources: ResolvedRenderableObject[],
	settings: SketchMatterSettings,
	state: RenderSupportState,
): string | null {
	if (overlapSources.length === 0) {
		return null;
	}

	const sourceKey = overlapSources.map((source) => source.object.objectId).sort().join('|');
	const cacheKey = `${object.objectId}::${sourceKey}`;
	const cached = state.overlapMaskIdByKey.get(cacheKey);
	if (cached) {
		return cached;
	}

	const clipPathId = nextSvgId('sketchmatter-overlap-mask');
	const clipPath = createSvgElement('clipPath');
	clipPath.setAttribute('id', clipPathId);

	for (const source of overlapSources) {
		const shape = getShape(source.shapeName);
		if (!shape) {
			continue;
		}

		const context: ShapeRenderContext = {
			object: source.object,
			typeDefinition: source.typeDefinition,
			typeDefinitions: state.typeDefinitions,
			coordinates: source.object.coordinates,
			settings,
		};
		const elements = shape.createElements(context);
		if (!elements || elements.length === 0) {
			continue;
		}

		for (const element of elements) {
			clipPath.appendChild(element.cloneNode(true));
		}
	}

	if (clipPath.childElementCount === 0) {
		return null;
	}

	state.defs.appendChild(clipPath);
	state.overlapMaskIdByKey.set(cacheKey, clipPathId);
	return clipPathId;
}

function ensureOverlapPatternId(
	pattern: OverlapPatternKind,
	thickness: number,
	spacing: number,
	angle: number,
	color: string,
	state: RenderSupportState,
): string {
	const cacheKey = `${pattern}|${thickness}|${spacing}|${angle}|${color}`;
	const cached = state.overlapPatternIdByKey.get(cacheKey);
	if (cached) {
		return cached;
	}

	const patternId = nextSvgId('sketchmatter-overlap-pattern');
	const patternElement = createSvgElement('pattern');
	patternElement.setAttribute('id', patternId);
	patternElement.setAttribute('patternUnits', 'userSpaceOnUse');
	patternElement.setAttribute('width', String(spacing));
	patternElement.setAttribute('height', String(spacing));

	const createLine = (x1: number, y1: number, x2: number, y2: number): void => {
		const line = createSvgElement('line');
		line.setAttribute('x1', String(x1));
		line.setAttribute('y1', String(y1));
		line.setAttribute('x2', String(x2));
		line.setAttribute('y2', String(y2));
		line.setAttribute('stroke', color);
		line.setAttribute('stroke-width', String(thickness));
		line.setAttribute('stroke-linecap', 'round');
		patternElement.appendChild(line);
	};

	if (pattern === 'lines') {
		if (angle !== 0) {
			patternElement.setAttribute('patternTransform', `rotate(${angle})`);
		}
		createLine(0, 0, 0, spacing);
		createLine(spacing, 0, spacing, spacing);
	} else if (pattern === 'hatch' || pattern === 'crosshatch') {
		createLine(-spacing, spacing, spacing, -spacing);
		createLine(0, spacing * 2, spacing * 2, 0);
		if (pattern === 'crosshatch') {
			createLine(-spacing, 0, spacing, spacing * 2);
			createLine(0, -spacing, spacing * 2, spacing);
		}
	} else if (pattern === 'dots') {
		const circle = createSvgElement('circle');
		circle.setAttribute('cx', String(spacing / 2));
		circle.setAttribute('cy', String(spacing / 2));
		circle.setAttribute('r', String(Math.max(thickness * 0.75, 0.75)));
		circle.setAttribute('fill', color);
		patternElement.appendChild(circle);
	}

	state.defs.appendChild(patternElement);
	state.overlapPatternIdByKey.set(cacheKey, patternId);
	return patternId;
}

function resolveTextureSource(
	object: SketchMatterObject,
	settings: SketchMatterSettings,
): string | null {
	const resolvedTexture = object.properties[RESOLVED_TEXTURE_PROPERTY];
	if (typeof resolvedTexture === 'string' && resolvedTexture.trim().length > 0) {
		return resolvedTexture.trim();
	}

	const configuredTexture = object.properties[settings.textureProperty];
	if (typeof configuredTexture === 'string' && configuredTexture.trim().length > 0) {
		return configuredTexture.trim();
	}

	return null;
}

function ensureTextureId(
	textureSource: string,
	element: SVGElement,
	state: RenderSupportState,
): string {
	const cached = state.textureIdBySource.get(textureSource);
	if (cached) {
		return cached;
	}

	const patternId = nextSvgId('sketchmatter-texture');
	const pattern = createSvgElement('pattern');
	pattern.setAttribute('id', patternId);
	pattern.setAttribute('patternUnits', 'userSpaceOnUse');

	let width = 256;
	let height = 256;
	let x = 0;
	let y = 0;
	try {
		if (!(element.instanceOf(SVGGraphicsElement))) {
			throw new Error('Element does not support getBBox');
		}
		const box = element.getBBox();
		if (Number.isFinite(box.width) && box.width > 0) {
			width = box.width;
		}
		if (Number.isFinite(box.height) && box.height > 0) {
			height = box.height;
		}
		x = box.x;
		y = box.y;
	} catch {
		// getBBox may fail in some contexts; keep defaults.
	}

	pattern.setAttribute('x', String(x));
	pattern.setAttribute('y', String(y));
	pattern.setAttribute('width', String(width));
	pattern.setAttribute('height', String(height));

	const image = createSvgElement('image');
	image.setAttribute('x', String(x));
	image.setAttribute('y', String(y));
	image.setAttribute('width', String(width));
	image.setAttribute('height', String(height));
	image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
	image.setAttribute('href', textureSource);
	pattern.appendChild(image);

	state.defs.appendChild(pattern);
	state.textureIdBySource.set(textureSource, patternId);
	return patternId;
}

function ensureBlendFilterId(
	radius: number,
	state: RenderSupportState,
): string {
	const cached = state.filterIdByRadius.get(radius);
	if (cached) {
		return cached;
	}

	const filterId = nextSvgId('sketchmatter-blend');
	const filter = createSvgElement('filter');
	filter.setAttribute('id', filterId);
	filter.setAttribute('x', '-100%');
	filter.setAttribute('y', '-100%');
	filter.setAttribute('width', '300%');
	filter.setAttribute('height', '300%');
	filter.setAttribute('color-interpolation-filters', 'sRGB');

	// Erode first so the blur creates an inward fade to zero at the boundary.
	const erode = createSvgElement('feMorphology');
	erode.setAttribute('in', 'SourceAlpha');
	erode.setAttribute('operator', 'erode');
	erode.setAttribute('radius', String(Math.max(radius * 0.6, 0.5)));
	erode.setAttribute('result', 'innerAlpha');
	filter.appendChild(erode);

	// Blur the eroded alpha channel to create a stronger feather ramp.
	const blur = createSvgElement('feGaussianBlur');
	blur.setAttribute('in', 'innerAlpha');
	blur.setAttribute('stdDeviation', String(radius));
	blur.setAttribute('result', 'softAlpha');
	filter.appendChild(blur);

	// Clip the original graphic through the softened alpha to get feathered edges.
	const composite = createSvgElement('feComposite');
	composite.setAttribute('in', 'SourceGraphic');
	composite.setAttribute('in2', 'softAlpha');
	composite.setAttribute('operator', 'in');
	filter.appendChild(composite);

	state.defs.appendChild(filter);
	state.filterIdByRadius.set(radius, filterId);
	return filterId;
}

function applyPostRenderAttributes(
	element: SVGElement,
	object: SketchMatterObject,
	settings: SketchMatterSettings,
	state: RenderSupportState,
): void {
	const maskSources = buildMaskSources(object, state, settings);
	const maskId = ensureMaskId(object, maskSources, settings, state);
	if (maskId) {
		element.setAttribute('clip-path', `url(#${maskId})`);
	}

	const textureSource = resolveTextureSource(object, settings);
	if (textureSource) {
		const textureId = ensureTextureId(textureSource, element, state);
		element.setAttribute('fill', `url(#${textureId})`);
	}

	const blendRaw = object.properties[settings.blendProperty];
	const blendEnabled =
		blendRaw === true ||
		blendRaw === 'true' ||
		blendRaw === 1 ||
		blendRaw === '1';
	if (blendEnabled) {
		const radiusRaw = object.properties[settings.blendRadiusProperty];
		const radius = parsePositiveNumber(radiusRaw, 20);
		const filterId = ensureBlendFilterId(radius, state);
		element.setAttribute('filter', `url(#${filterId})`);
	}
}

function appendOverlapPatternOverlay(
	svg: SVGElement,
	element: SVGElement,
	object: SketchMatterObject,
	settings: SketchMatterSettings,
	state: RenderSupportState,
): void {
	const patternKind = normalizeOverlapPatternKind(object.properties[settings.overlapPatternProperty]);
	if (!patternKind) {
		return;
	}

	const overlapSources = buildOverlapSources(object, state);
	const overlapMaskId = ensureOverlapMaskId(object, overlapSources, settings, state);
	if (!overlapMaskId) {
		return;
	}

	const strokeRaw = object.properties[settings.strokeProperty];
	const colorRaw = object.properties[settings.overlapPatternColorProperty];
	const color =
		typeof colorRaw === 'string' && colorRaw.trim().length > 0
			? colorRaw.trim()
			: typeof strokeRaw === 'string' && strokeRaw.trim().length > 0
				? strokeRaw.trim()
				: '#000000';
	const thickness = parsePositiveNumber(object.properties[settings.overlapPatternThicknessProperty], 1.5);
	const spacing = parsePositiveNumber(object.properties[settings.overlapPatternSpacingProperty], 10);
	const angle = normalizeAngleDegrees(object.properties[settings.overlapPatternAngleProperty], 0);
	const patternId = ensureOverlapPatternId(patternKind, thickness, spacing, angle, color, state);

	const overlayGroup = createSvgElement('g');
	overlayGroup.setAttribute('clip-path', `url(#${overlapMaskId})`);

	const overlayElement = element.cloneNode(true);
	if (overlayElement.nodeType !== Node.ELEMENT_NODE) {
		return;
	}
	const overlaySvgElement = overlayElement as SVGElement;
	if (overlaySvgElement.namespaceURI !== SVG_NAMESPACE) {
		return;
	}

	overlaySvgElement.removeAttribute('filter');
	overlaySvgElement.setAttribute('fill', `url(#${patternId})`);
	overlaySvgElement.setAttribute('stroke', 'none');
	overlaySvgElement.setAttribute('opacity', '1');

	overlayGroup.appendChild(overlaySvgElement);
	svg.appendChild(overlayGroup);
}

function renderObject(
	svg: SVGElement,
	object: SketchMatterObject,
	typeDefinitions: Map<string, SketchMatterTypeDefinition>,
	settings: SketchMatterSettings,
	state: RenderSupportState,
): void {
	const { typeDefinition, shapeName } = resolveRenderableObject(object, typeDefinitions, settings);
	const beforeCount = svg.childElementCount;
	const multipartChildren = resolveMultipartChildren(object.properties, settings);

	if (multipartChildren.length > 0 && shapeName !== 'composite') {
		for (const child of multipartChildren) {
			renderMultipartChild(svg, object, typeDefinition, settings, shapeName, child);
		}
	} else {
		const shape = getShape(shapeName);

		if (!shape) {
			// Unknown shape: fall back to text
			const fallbackShape = getShape(DEFAULT_FALLBACK_SHAPE);
			if (fallbackShape) {
				const context: ShapeRenderContext = {
					object,
					typeDefinition,
					typeDefinitions: state.typeDefinitions,
					coordinates: object.coordinates,
					settings,
				};
				fallbackShape.render(svg, context);
			}
		} else {
			const context: ShapeRenderContext = {
				object,
				typeDefinition,
				typeDefinitions: state.typeDefinitions,
				coordinates: object.coordinates,
				settings,
			};
			shape.render(svg, context);
		}
	}

	const children = Array.from(svg.children);
	for (let index = beforeCount; index < children.length; index += 1) {
		const child = children[index];
		if (child instanceof SVGElement) {
			child.setAttribute(RENDERED_OBJECT_ID_ATTR, object.objectId);
			applyPostRenderAttributes(child, object, settings, state);
			appendOverlapPatternOverlay(svg, child, object, settings, state);
		}
	}

	function renderMultipartChild(
		svg: SVGElement,
		object: SketchMatterObject,
		typeDefinition: SketchMatterTypeDefinition | null,
		settings: SketchMatterSettings,
		defaultShapeName: string,
		child: MultipartChild,
	): void {
		const childShapeOverride = resolveShapeOverride(child, settings);
		const shapeName =
			childShapeOverride
				? childShapeOverride
				: defaultShapeName;
		const shape = getShape(shapeName) ?? getShape(DEFAULT_FALLBACK_SHAPE);
		if (!shape) {
			return;
		}

		const styleFromChild =
			typeof child.style === 'object' && child.style != null
				? child.style
				: {};
		const childProperties: Record<string, unknown> = {
			...object.properties,
			...child,
		};
		childProperties[settings.fillProperty] =
			styleFromChild.fill ?? child.fill ?? childProperties[settings.fillProperty];
		childProperties[settings.strokeProperty] =
			styleFromChild.stroke ?? child.stroke ?? childProperties[settings.strokeProperty];
		childProperties[settings.strokeWidthProperty] =
			styleFromChild.strokeWidth ?? child.strokeWidth ?? childProperties[settings.strokeWidthProperty];
		childProperties[settings.transparencyProperty] =
			styleFromChild.opacity ?? child.opacity ?? childProperties[settings.transparencyProperty];

		const context: ShapeRenderContext = {
			object: {
				...object,
				properties: childProperties,
			},
			typeDefinition,
			typeDefinitions: state.typeDefinitions,
			coordinates: child.coordinates,
			settings,
		};
		shape.render(svg, context);
	}
}

function groupObjectsByLayer(
	objects: SketchMatterObject[],
	renderOrder: LayerRenderOrder,
): Array<[number, SketchMatterObject[]]> {
	const objectsByLayer = new Map<number, SketchMatterObject[]>();
	for (const object of objects) {
		let layerObjects = objectsByLayer.get(object.layer);
		if (!layerObjects) {
			layerObjects = [];
			objectsByLayer.set(object.layer, layerObjects);
		}
		layerObjects.push(object);
	}

	const orderedLayers = Array.from(objectsByLayer.keys()).sort((a, b) => a - b);
	if (renderOrder === '1-0') {
		orderedLayers.reverse();
	}

	return orderedLayers.map((layer) => [layer, objectsByLayer.get(layer) ?? []]);
}

function createRootSvg(
	imageDefinition: SketchMatterImageDefinition | null,
): SVGSVGElement {
	const width = imageDefinition?.width ?? 1200;
	const height = imageDefinition?.height ?? 900;
	const preserveAspectRatio = imageDefinition?.preserveAspectRatio || 'xMinYMin meet';
	const svg = createSvgElement('svg');
	svg.setAttribute('class', 'sketchmatter-root-svg');
	svg.setAttribute('xmlns', SVG_NAMESPACE);
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	svg.setAttribute('preserveAspectRatio', preserveAspectRatio);
	svg.setAttribute('width', String(width));
	svg.setAttribute('height', String(height));

	if (imageDefinition?.backgroundColor) {
		const backgroundColor = createSvgElement('rect');
		backgroundColor.setAttribute('x', '0');
		backgroundColor.setAttribute('y', '0');
		backgroundColor.setAttribute('width', String(width));
		backgroundColor.setAttribute('height', String(height));
		backgroundColor.setAttribute('fill', imageDefinition.backgroundColor);
		svg.appendChild(backgroundColor);
	}

	if (imageDefinition?.backgroundImage) {
		const background = createSvgElement('image');
		background.setAttribute('x', '0');
		background.setAttribute('y', '0');
		background.setAttribute('width', String(width));
		background.setAttribute('height', String(height));
		background.setAttribute('preserveAspectRatio', preserveAspectRatio);
		background.setAttribute('href', imageDefinition.backgroundImage);
		svg.appendChild(background);
	}

	return svg;
}

function renderToSvg(
	svg: SVGSVGElement,
	objects: SketchMatterObject[],
	typeDefinitions: Map<string, SketchMatterTypeDefinition>,
	renderOrder: LayerRenderOrder,
	settings: SketchMatterSettings,
): void {
	const defs = createSvgElement('defs');
	svg.appendChild(defs);

	const resolvedObjects = objects.map((object) => resolveRenderableObject(object, typeDefinitions, settings));
	const state: RenderSupportState = {
		defs,
		typeDefinitions,
		resolvedObjects,
		maskIdByKey: new Map<string, string>(),
		textureIdBySource: new Map<string, string>(),
		filterIdByRadius: new Map<number, string>(),
		overlapMaskIdByKey: new Map<string, string>(),
		overlapPatternIdByKey: new Map<string, string>(),
	};

	for (const [layer, layerObjects] of groupObjectsByLayer(objects, renderOrder)) {
		const layerGroup = createSvgElement('g');
		layerGroup.setAttribute('data-sketchmatter-layer', String(layer));
		for (const object of layerObjects) {
			renderObject(layerGroup, object, typeDefinitions, settings, state);
		}
		svg.appendChild(layerGroup);
	}
}

/**
 * Render a coordinate grid overlay into the SVG.
 * Draws vertical and horizontal lines at every `spacing` units and labels
 * each axis line with its coordinate value to aid point-based map drawing.
 */
function renderGrid(svg: SVGSVGElement, width: number, height: number, spacing: number): void {
	const group = createSvgElement('g');
	group.setAttribute('class', 'sketchmatter-grid');

	const lineColor = '#888888';
	const textColor = '#666666';
	const fontSize = Math.max(8, Math.min(14, spacing * 0.12));

	// Vertical lines + X-axis labels along the top
	for (let x = 0; x <= width; x += spacing) {
		const line = createSvgElement('line');
		line.setAttribute('x1', String(x));
		line.setAttribute('y1', '0');
		line.setAttribute('x2', String(x));
		line.setAttribute('y2', String(height));
		line.setAttribute('stroke', lineColor);
		line.setAttribute('stroke-width', '0.5');
		line.setAttribute('opacity', '0.5');
		group.appendChild(line);

		const label = createSvgElement('text');
		label.setAttribute('x', String(x + 2));
		label.setAttribute('y', String(fontSize + 1));
		label.setAttribute('fill', textColor);
		label.setAttribute('font-size', String(fontSize));
		label.setAttribute('font-family', 'monospace');
		label.textContent = String(x);
		group.appendChild(label);
	}

	// Horizontal lines + Y-axis labels along the left
	for (let y = spacing; y <= height; y += spacing) {
		const line = createSvgElement('line');
		line.setAttribute('x1', '0');
		line.setAttribute('y1', String(y));
		line.setAttribute('x2', String(width));
		line.setAttribute('y2', String(y));
		line.setAttribute('stroke', lineColor);
		line.setAttribute('stroke-width', '0.5');
		line.setAttribute('opacity', '0.5');
		group.appendChild(line);

		const label = createSvgElement('text');
		label.setAttribute('x', '2');
		label.setAttribute('y', String(y - 2));
		label.setAttribute('fill', textColor);
		label.setAttribute('font-size', String(fontSize));
		label.setAttribute('font-family', 'monospace');
		label.textContent = String(y);
		group.appendChild(label);
	}

	svg.appendChild(group);
}

export function renderSvgPreview(
	container: HTMLElement,
	objects: SketchMatterObject[],
	typeDefinitions?: Map<string, SketchMatterTypeDefinition>,
	renderOrder: LayerRenderOrder = '0-1',
	settings: SketchMatterSettings = DEFAULT_SETTINGS,
	imageDefinition: SketchMatterImageDefinition | null = null,
	showGrid = false,
): void {
	container.innerHTML = '';
	const svg = createRootSvg(imageDefinition);

	const typeDefs = typeDefinitions ?? new Map<string, SketchMatterTypeDefinition>();
	renderToSvg(svg, objects, typeDefs, renderOrder, settings);

	if (showGrid) {
		const width = imageDefinition?.width ?? 1200;
		const height = imageDefinition?.height ?? 900;
		const spacing = settings.gridSpacing > 0 ? settings.gridSpacing : 100;
		renderGrid(svg, width, height, spacing);
	}

	container.appendChild(svg);
}

/**
 * Render objects to an SVG string suitable for export/saving as a file.
 */
export function renderSvgToString(
	objects: SketchMatterObject[],
	typeDefinitions?: Map<string, SketchMatterTypeDefinition>,
	renderOrder: LayerRenderOrder = '0-1',
	settings: SketchMatterSettings = DEFAULT_SETTINGS,
	imageDefinition: SketchMatterImageDefinition | null = null,
): string {
	const svg = createRootSvg(imageDefinition);
	const typeDefs = typeDefinitions ?? new Map<string, SketchMatterTypeDefinition>();
	renderToSvg(svg, objects, typeDefs, renderOrder, settings);

	const serializer = new XMLSerializer();
	const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
	return xmlDeclaration + serializer.serializeToString(svg);
}
