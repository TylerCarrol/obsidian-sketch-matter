import { Menu } from 'obsidian';
import { SketchMatterObject, SketchMatterSettings, SketchMatterTypeDefinition } from './types';
import { toCoordinatePairs } from './shapes';
import { RENDERED_OBJECT_ID_ATTR } from './renderer';

const SVG_NS = 'http://www.w3.org/2000/svg';
const OVERLAY_CLASS = 'sketchmatter-edit-overlay';
const HANDLE_CLASS = 'sketchmatter-handle';
const HIT_TARGET_CLASS = 'sketchmatter-hit-target';
const HANDLES_GROUP_CLASS = 'sketchmatter-handles-group';
const INSERT_MARKER_CLASS = 'sketchmatter-insert-marker';
const EDGE_INSERT_THRESHOLD = 10;
const DRAG_START_THRESHOLD = 2;
const SINGLE_POINT_HIT_PADDING = 8;
const SINGLE_POINT_HIT_RADIUS = 12;

function createSvgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
	return document.createElementNS(SVG_NS, tag);
}

/** Convert a mouse/pointer event's screen coordinates to SVG user-space coordinates. */
function svgPoint(svg: SVGSVGElement, e: MouseEvent): [number, number] {
	const rect = svg.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) {
		return [0, 0];
	}

	const viewBox = svg.viewBox.baseVal;
	const vbX = Number.isFinite(viewBox?.x) ? viewBox.x : 0;
	const vbY = Number.isFinite(viewBox?.y) ? viewBox.y : 0;
	const vbW = Number.isFinite(viewBox?.width) && viewBox.width > 0
		? viewBox.width
		: rect.width;
	const vbH = Number.isFinite(viewBox?.height) && viewBox.height > 0
		? viewBox.height
		: rect.height;

	const rx = (e.clientX - rect.left) / rect.width;
	const ry = (e.clientY - rect.top) / rect.height;
	return [vbX + rx * vbW, vbY + ry * vbH];
}

/** Minimum distance from point (px, py) to segment (ax, ay)→(bx, by). */
function distToSegment(
	px: number, py: number,
	ax: number, ay: number,
	bx: number, by: number,
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(px - ax, py - ay);
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Closest point and distance from point (px, py) to segment (ax, ay)→(bx, by). */
function projectToSegment(
	px: number, py: number,
	ax: number, ay: number,
	bx: number, by: number,
): { x: number; y: number; distance: number } {
	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) {
		return { x: ax, y: ay, distance: Math.hypot(px - ax, py - ay) };
	}
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
	const x = ax + t * dx;
	const y = ay + t * dy;
	return { x, y, distance: distToSegment(px, py, ax, ay, bx, by) };
}

/**
 * Determine whether the shape for this object is open (polyline / line) or
 * closed (polygon).  Checks: explicit shape override on the object, the type
 * definition hierarchy, then falls back to point count (2 points → open).
 */
function resolveIsOpenShape(
	object: SketchMatterObject,
	typeDefinitions: Map<string, SketchMatterTypeDefinition>,
	settings: SketchMatterSettings,
	points: [number, number][],
): boolean {
	const rawShapeOverride =
		object.properties[settings.objectShapeProperty] ??
		object.properties['shape'] ??
		object.properties['sketchmatter-shape'];
	if (typeof rawShapeOverride === 'string') {
		const shapeOverride = rawShapeOverride.trim();
		return shapeOverride === 'polyline' || shapeOverride === 'line';
	}
	const typeDef = typeDefinitions.get(object.typeName);
	if (typeDef?.shape === 'polyline' || typeDef?.shape === 'line') {
		return true;
	}
	return points.length === 2;
}

/**
 * Serialize coordinate pairs back to the canonical `["x, y", ...]` YAML
 * format that `metadata.ts` already parses.
 */
export function serializeCoordinates(points: [number, number][]): string[] {
	return points.map(([x, y]) => `${Math.round(x)}, ${Math.round(y)}`);
}

export interface EditorOverlayHandle {
	/** Visually deselect the current object without firing the onSelect callback. */
	deselect(): void;
	/** Programmatically select the entry for the given object ID (fires onSelect). */
	selectByPath(path: string): boolean;
}

/** Remove any previously attached editor overlay from the SVG. */
export function detachEditorOverlay(svg: SVGSVGElement): void {
	for (const el of Array.from(svg.querySelectorAll('.' + OVERLAY_CLASS))) {
		el.remove();
	}
}

/**
 * Attach an interactive editing overlay to a rendered SVG.
 *
 * - Click on a polygon/polyline/line → select it (shows drag handles on each vertex).
 * - Drag a handle → move that vertex; fires onCoordinatesChanged on pointer-up.
 * - Click on the edge of a selected polyline/line → inserts a new vertex at that
 *   position and fires onCoordinatesChanged.
 * - Click on empty background → deselects.
 */
export function attachEditorOverlay(
	svg: SVGSVGElement,
	objects: SketchMatterObject[],
	typeDefinitions: Map<string, SketchMatterTypeDefinition>,
	settings: SketchMatterSettings,
	onSelect: (obj: SketchMatterObject | null) => void,
	onCoordinatesChanged: (obj: SketchMatterObject, points: [number, number][]) => void,
): EditorOverlayHandle {
	detachEditorOverlay(svg);

	const overlay = createSvgEl('g');
	overlay.setAttribute('class', OVERLAY_CLASS);

	// A transparent background rect that catches clicks on empty space
	const viewBox = svg.getAttribute('viewBox')?.split(' ') ?? [];
	const bgW = viewBox[2] ?? svg.getAttribute('width') ?? '1200';
	const bgH = viewBox[3] ?? svg.getAttribute('height') ?? '900';
	const bgRect = createSvgEl('rect');
	bgRect.setAttribute('x', '0');
	bgRect.setAttribute('y', '0');
	bgRect.setAttribute('width', bgW);
	bgRect.setAttribute('height', bgH);
	bgRect.setAttribute('fill', 'transparent');
	bgRect.setAttribute('pointer-events', 'all');
	overlay.appendChild(bgRect);

	svg.appendChild(overlay);

	interface EditEntry {
		object: SketchMatterObject;
		points: [number, number][];
		isOpen: boolean;
		isSinglePoint: boolean;
		hitTarget: SVGElement;
	}

	interface SegmentHit {
		insertIndex: number;
		distance: number;
		x: number;
		y: number;
	}

	function getRenderedObjectBounds(objectId: string): DOMRect | null {
		const selector = `[${RENDERED_OBJECT_ID_ATTR}="${CSS.escape(objectId)}"]`;
		const elements = Array.from(svg.querySelectorAll(selector));
		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;
		let foundBounds = false;

		for (const element of elements) {
			if (!element.instanceOf(SVGGraphicsElement)) {
				continue;
			}
			try {
				const box = element.getBBox();
				if (!Number.isFinite(box.x) || !Number.isFinite(box.y)
					|| !Number.isFinite(box.width) || !Number.isFinite(box.height)) {
					continue;
				}
				minX = Math.min(minX, box.x);
				minY = Math.min(minY, box.y);
				maxX = Math.max(maxX, box.x + box.width);
				maxY = Math.max(maxY, box.y + box.height);
				foundBounds = true;
			} catch {
				// Ignore elements that cannot report bounds.
			}
		}

		if (!foundBounds) {
			return null;
		}
		return new DOMRect(minX, minY, maxX - minX, maxY - minY);
	}

	function updateSinglePointHitTarget(entry: EditEntry, previousPoint?: [number, number]): void {
		if (entry.points.length === 0) {
			return;
		}

		const [x, y] = entry.points[0]!;
		if (entry.hitTarget.instanceOf(SVGRectElement)) {
			if (previousPoint) {
				const currentX = Number(entry.hitTarget.getAttribute('x') ?? '0');
				const currentY = Number(entry.hitTarget.getAttribute('y') ?? '0');
				entry.hitTarget.setAttribute('x', String(currentX + x - previousPoint[0]));
				entry.hitTarget.setAttribute('y', String(currentY + y - previousPoint[1]));
				return;
			}

			const bounds = getRenderedObjectBounds(entry.object.objectId);
			if (bounds) {
				entry.hitTarget.setAttribute('x', String(bounds.x - SINGLE_POINT_HIT_PADDING));
				entry.hitTarget.setAttribute('y', String(bounds.y - SINGLE_POINT_HIT_PADDING));
				entry.hitTarget.setAttribute('width', String(bounds.width + SINGLE_POINT_HIT_PADDING * 2));
				entry.hitTarget.setAttribute('height', String(bounds.height + SINGLE_POINT_HIT_PADDING * 2));
				return;
			}
		}

		entry.hitTarget.setAttribute('cx', String(x));
		entry.hitTarget.setAttribute('cy', String(y));
	}

	function findNearestSegmentHit(entry: EditEntry, x: number, y: number): SegmentHit | null {
		if (entry.points.length < 2) return null;
		const segmentCount = entry.isOpen ? entry.points.length - 1 : entry.points.length;
		let best: SegmentHit | null = null;
		for (let i = 0; i < segmentCount; i++) {
			const next = (i + 1) % entry.points.length;
			const [ax, ay] = entry.points[i]!;
			const [bx, by] = entry.points[next]!;
			const projected = projectToSegment(x, y, ax, ay, bx, by);
			const insertIndex = next === 0 ? entry.points.length : next;
			if (!best || projected.distance < best.distance) {
				best = {
					insertIndex,
					distance: projected.distance,
					x: projected.x,
					y: projected.y,
				};
			}
		}
		return best;
	}

	const insertionMarker = createSvgEl('circle');
	insertionMarker.setAttribute('class', INSERT_MARKER_CLASS);
	insertionMarker.setAttribute('r', '6');
	insertionMarker.setAttribute('visibility', 'hidden');
	insertionMarker.setAttribute('pointer-events', 'none');
	overlay.appendChild(insertionMarker);

	const sourceOrder = new Map<string, number>();
	for (let i = 0; i < objects.length; i++) {
		sourceOrder.set(objects[i]!.objectId, i);
	}
	const renderOrderedObjects = [...objects].sort((a, b) => {
		if (a.layer !== b.layer) {
			return settings.layerRenderOrder === '1-0'
				? b.layer - a.layer
				: a.layer - b.layer;
		}
		return (sourceOrder.get(a.objectId) ?? 0) - (sourceOrder.get(b.objectId) ?? 0);
	});

	const entries: EditEntry[] = [];

	// Build hit-target elements for all editable objects
	for (const object of renderOrderedObjects) {
		const rawPoints = toCoordinatePairs(object.coordinates);
		if (!rawPoints || rawPoints.length < 1) continue;

		const points: [number, number][] = rawPoints.map(([x, y]) => [x, y]);
		const isOpen = resolveIsOpenShape(object, typeDefinitions, settings, points);
		const isSinglePoint = points.length === 1;

		let hitTarget: SVGElement;
		if (isSinglePoint) {
			const bounds = getRenderedObjectBounds(object.objectId);
			if (bounds) {
				const rect = createSvgEl('rect');
				rect.setAttribute('x', String(bounds.x - SINGLE_POINT_HIT_PADDING));
				rect.setAttribute('y', String(bounds.y - SINGLE_POINT_HIT_PADDING));
				rect.setAttribute('width', String(bounds.width + SINGLE_POINT_HIT_PADDING * 2));
				rect.setAttribute('height', String(bounds.height + SINGLE_POINT_HIT_PADDING * 2));
				hitTarget = rect;
			} else {
				const [x, y] = points[0]!;
				const circle = createSvgEl('circle');
				circle.setAttribute('cx', String(x));
				circle.setAttribute('cy', String(y));
				circle.setAttribute('r', String(SINGLE_POINT_HIT_RADIUS));
				hitTarget = circle;
			}
		} else {
			const pointsAttr = points.map(([x, y]) => `${x},${y}`).join(' ');
			if (isOpen) {
				const poly = createSvgEl('polyline');
				poly.setAttribute('points', pointsAttr);
				// Wide transparent stroke so clicks near the line are captured
				poly.setAttribute('stroke', 'transparent');
				poly.setAttribute('stroke-width', '12');
				hitTarget = poly;
			} else {
				const poly = createSvgEl('polygon');
				poly.setAttribute('points', pointsAttr);
				hitTarget = poly;
			}
		}

		hitTarget.setAttribute('class', HIT_TARGET_CLASS);
		hitTarget.setAttribute('fill', 'transparent');
		hitTarget.setAttribute('pointer-events', 'all');
		hitTarget.setAttribute('data-source-path', object.objectId);

		overlay.appendChild(hitTarget);
		entries.push({ object, points, isOpen, isSinglePoint, hitTarget });
	}

	let selectedEntry: EditEntry | null = null;
	let handlesGroup: SVGGElement | null = null;
	let didDragSelection = false;

	function hideInsertionMarker(): void {
		insertionMarker.setAttribute('visibility', 'hidden');
	}

	function showInsertionMarker(x: number, y: number): void {
		insertionMarker.setAttribute('cx', String(x));
		insertionMarker.setAttribute('cy', String(y));
		insertionMarker.setAttribute('visibility', 'visible');
	}

	function tryGetInsertionPoint(entry: EditEntry, x: number, y: number): SegmentHit | null {
		const hit = findNearestSegmentHit(entry, x, y);
		if (!hit || hit.distance > EDGE_INSERT_THRESHOLD) return null;
		return hit;
	}

	function clearHandles(): void {
		handlesGroup?.remove();
		handlesGroup = null;
	}

	function updateHitTarget(entry: EditEntry, previousPoint?: [number, number]): void {
		if (entry.isSinglePoint) {
			updateSinglePointHitTarget(entry, previousPoint);
			return;
		}
		const pointsAttr = entry.points.map(([x, y]) => `${x},${y}`).join(' ');
		entry.hitTarget.setAttribute('points', pointsAttr);
	}

	function drawHandles(entry: EditEntry): void {
		clearHandles();
		handlesGroup = createSvgEl('g');
		handlesGroup.setAttribute('class', HANDLES_GROUP_CLASS);
		overlay.appendChild(handlesGroup);

		for (let i = 0; i < entry.points.length; i++) {
			const [x, y] = entry.points[i]!;
			const handle = createSvgEl('circle');
			handle.setAttribute('class', HANDLE_CLASS);
			handle.setAttribute('cx', String(x));
			handle.setAttribute('cy', String(y));
			handle.setAttribute('r', '6');

			let isDragging = false;

			const onPointerDown = (e: PointerEvent): void => {
				e.stopPropagation();
				e.preventDefault();
				isDragging = true;
				handle.setPointerCapture(e.pointerId);
			};

			const onPointerMove = (e: PointerEvent): void => {
				if (!isDragging) return;
				const [nx, ny] = svgPoint(svg, e);
				const previousPoint = entry.points[i] ?? undefined;
				entry.points[i] = [nx, ny];
				handle.setAttribute('cx', String(nx));
				handle.setAttribute('cy', String(ny));
				updateHitTarget(entry, previousPoint);
			};

			const onPointerUp = (e: PointerEvent): void => {
				if (!isDragging) return;
				isDragging = false;
				handle.releasePointerCapture(e.pointerId);
				onCoordinatesChanged(entry.object, [...entry.points]);
			};

			const onContextMenu = (e: MouseEvent): void => {
				e.preventDefault();
				e.stopPropagation();
				const minPoints = entry.isOpen ? 2 : 3;
				const canDelete = entry.points.length > minPoints;
				const menu = new Menu();
				menu.addItem((item) => {
					item.setTitle('Delete point').setIcon('trash');
					if (!canDelete) {
						item.setDisabled(true);
						return;
					}
					item.onClick(() => {
						entry.points.splice(i, 1);
						updateHitTarget(entry);
						drawHandles(entry);
						onCoordinatesChanged(entry.object, [...entry.points]);
					});
				});
				menu.showAtMouseEvent(e);
			};

			handle.addEventListener('pointerdown', onPointerDown);
			handle.addEventListener('pointermove', onPointerMove);
			handle.addEventListener('pointerup', onPointerUp);
			handle.addEventListener('contextmenu', onContextMenu);

			// Prevent drag-end from bubbling up as a click on the hit target
			handle.addEventListener('click', (e: MouseEvent) => {
				e.stopPropagation();
			});

			handlesGroup.appendChild(handle);
		}
	}

	function deselectInternal(): void {
		clearHandles();
		hideInsertionMarker();
		if (selectedEntry) {
			selectedEntry.hitTarget.removeAttribute('data-selected');
			selectedEntry = null;
		}
	}

	function selectEntryInternal(entry: EditEntry, fireCallback: boolean): void {
		deselectInternal();
		selectedEntry = entry;
		entry.hitTarget.setAttribute('data-selected', 'true');
		drawHandles(entry);
		if (fireCallback) {
			onSelect(entry.object);
		}
	}

	// Click handler for each hit target
	for (const entry of entries) {
		let dragPointerId: number | null = null;
		let dragStartMouse: [number, number] | null = null;
		let dragStartPoints: [number, number][] | null = null;

		entry.hitTarget.addEventListener('pointerdown', (e: PointerEvent) => {
			if (selectedEntry !== entry || entry.isOpen || e.button !== 0) return;
			e.stopPropagation();
			e.preventDefault();
			dragPointerId = e.pointerId;
			dragStartMouse = svgPoint(svg, e);
			dragStartPoints = entry.points.map(([x, y]) => [x, y]);
			didDragSelection = false;
			entry.hitTarget.setPointerCapture(e.pointerId);
		});

		entry.hitTarget.addEventListener('pointermove', (e: PointerEvent) => {
			if (dragPointerId !== e.pointerId || !dragStartMouse || !dragStartPoints) return;
			const [mx, my] = svgPoint(svg, e);
			const dx = mx - dragStartMouse[0];
			const dy = my - dragStartMouse[1];
			if (!didDragSelection && Math.hypot(dx, dy) < DRAG_START_THRESHOLD) {
				return;
			}
			didDragSelection = true;
			const previousPoint = entry.isSinglePoint ? (entry.points[0] ?? undefined) : undefined;
			entry.points = dragStartPoints.map(([x, y]) => [x + dx, y + dy]);
			updateHitTarget(entry, previousPoint);
			drawHandles(entry);
		});

		const finishDrag = (e: PointerEvent): void => {
			if (dragPointerId !== e.pointerId) return;
			if (entry.hitTarget.hasPointerCapture(e.pointerId)) {
				entry.hitTarget.releasePointerCapture(e.pointerId);
			}
			const moved = didDragSelection;
			dragPointerId = null;
			dragStartMouse = null;
			dragStartPoints = null;
			if (moved) {
				onCoordinatesChanged(entry.object, [...entry.points]);
			}
		};

		entry.hitTarget.addEventListener('pointerup', finishDrag);
		entry.hitTarget.addEventListener('pointercancel', finishDrag);

		entry.hitTarget.addEventListener('mousemove', (e: MouseEvent) => {
			if (selectedEntry !== entry) {
				hideInsertionMarker();
				return;
			}
			const [mx, my] = svgPoint(svg, e);
			const hit = tryGetInsertionPoint(entry, mx, my);
			if (!hit) {
				hideInsertionMarker();
				return;
			}
			showInsertionMarker(hit.x, hit.y);
		});

		entry.hitTarget.addEventListener('mouseleave', () => {
			hideInsertionMarker();
		});

		entry.hitTarget.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			if (didDragSelection) {
				didDragSelection = false;
				return;
			}

			if (selectedEntry === entry) {
				if (entry.isSinglePoint) {
					return;
				}
				// Already selected: insert a point only when clicking near an edge.
				const [clickX, clickY] = svgPoint(svg, e);
				const hit = tryGetInsertionPoint(entry, clickX, clickY);
				if (hit) {
					entry.points.splice(hit.insertIndex, 0, [hit.x, hit.y]);
					updateHitTarget(entry);
					drawHandles(entry);
					onCoordinatesChanged(entry.object, [...entry.points]);
				}
				return;
			}

			selectEntryInternal(entry, true);
		});
	}

	// Background click → deselect
	bgRect.addEventListener('click', () => {
		if (selectedEntry) {
			deselectInternal();
			onSelect(null);
		}
	});
	bgRect.addEventListener('mousemove', () => {
		hideInsertionMarker();
	});

	return {
		deselect(): void {
			deselectInternal();
		},
		selectByPath(path: string): boolean {
			const entry = entries.find((e) => e.object.objectId === path);
			if (!entry) return false;
			selectEntryInternal(entry, true);
			return true;
		},
	};
}
