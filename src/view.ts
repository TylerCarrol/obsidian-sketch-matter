import { ItemView, Notice, Plugin, WorkspaceLeaf, setIcon } from 'obsidian';
import { DEFAULT_SETTINGS, SketchMatterObject, SketchMatterSettings, SketchMatterViewDefinition } from './types';
import {
	createImageDefinitionFlow,
	createObjectDefinitionFlow,
	createViewDefinitionFlow,
} from './creation';
import {
	collectSketchMatterMetadata,
	collectSketchMatterTypeDefinitions,
	collectAllImageIds,
	filterByImageId,
	filterSketchMatterObjects,
	SketchMatterMetadataBundle,
} from './metadata';
import { renderSvgPreview, renderSvgToString } from './renderer';
import { clampPreviewZoom, computePinchZoomState, stepPreviewZoom } from './preview-gesture';
import {
	attachEditorOverlay,
	detachEditorOverlay,
	serializeCoordinates,
	EditorOverlayHandle,
	SnapMode,
} from './editor';
import { renderObjectList, renderObjectDetail } from './ui/editor-panel';
import { convertPropertyInput } from './property-value';

export const VIEW_TYPE_SKETCH_MATTER = 'sketch-matter-view';
const PREVIEW_PAN_START_THRESHOLD = 2;
const PREVIEW_PAN_BLOCK_SELECTOR = '.sketchmatter-hit-target, .sketchmatter-handle';
const PREVIEW_ZOOM_FLOOR = 0.01;

type SketchMatterPluginLike = Plugin & { settings: SketchMatterSettings };
type PreviewButtonOptions = {
	label: string;
	icon: string;
	className: string;
	ariaLabel?: string;
};

type PreviewViewportState = {
	contentCenterXRatio: number;
	contentCenterYRatio: number;
};

export class SketchMatterView extends ItemView {
plugin: SketchMatterPluginLike;
selector: HTMLSelectElement | null = null;
imageSelector: HTMLSelectElement | null = null;
previewContainer: HTMLElement | null = null;
statusElement: HTMLElement | null = null;
currentViewId: string | null = null;
currentImageId: string | null = null;
showGrid = false;
editMode = false;
snapMode: SnapMode = 'disabled';
zoomLevel = 1;
selectedObjectPath: string | null = null;
private editorSidebarEl: HTMLElement | null = null;
private editorOverlayHandle: EditorOverlayHandle | null = null;
private currentFilteredObjects: SketchMatterObject[] = [];
private metadataBundle: SketchMatterMetadataBundle | null = null;
private zoomResetButton: HTMLButtonElement | null = null;
private previewPanState:
	| {
		pointerId: number;
		startClientX: number;
		startClientY: number;
		startScrollLeft: number;
		startScrollTop: number;
		didPan: boolean;
	}
	| null = null;
private previewPinchState:
	| {
		startDistance: number;
		startZoom: number;
		startScrollLeft: number;
		startScrollTop: number;
	}
	| null = null;
private suppressNextPreviewClick = false;

constructor(leaf: WorkspaceLeaf, plugin: SketchMatterPluginLike) {
super(leaf);
this.plugin = plugin;
}

getViewType(): string {
return VIEW_TYPE_SKETCH_MATTER;
}

getDisplayText(): string {
return 'SketchMatter Preview';
}

getIcon(): string {
return 'image-file';
}

async onOpen(): Promise<void> {
this.containerEl.empty();
this.containerEl.addClass('sketchmatter-view');
await this.renderView();
}

async reload(): Promise<void> {
this.metadataBundle = null;
await this.renderView();
}

private getMetadataBundle(): SketchMatterMetadataBundle {
	if (this.metadataBundle == null) {
		this.metadataBundle = collectSketchMatterMetadata(this.app, this.plugin.settings);
	}

	return this.metadataBundle;
}

private async renderView(): Promise<void> {
const previousViewId = this.selector?.value || this.currentViewId;
this.currentViewId = previousViewId;
const previousImageId = this.imageSelector?.value || this.currentImageId;
this.currentImageId = previousImageId;
	const previousViewport = this.capturePreviewViewportState();
this.containerEl.empty();
this.editorOverlayHandle = null;
this.editorSidebarEl = null;
this.zoomResetButton = null;

const header = this.containerEl.createDiv({ cls: 'sketchmatter-view-header' });
header.createEl('h3', { text: 'SketchMatter Preview' });

const controls = header.createDiv({ cls: 'sketchmatter-view-controls' });
const buttonPanel = controls.createDiv({ cls: 'sketchmatter-view-button-panel' });

const exportButton = this.createPreviewButton(buttonPanel, {
	label: 'Export SVG',
	icon: 'download',
	className: 'sketchmatter-export-button',
});
exportButton.addEventListener('click', () => {
void this.exportSvg();
});

const refreshButton = this.createPreviewButton(buttonPanel, {
	label: 'Refresh preview',
	icon: 'refresh-cw',
	className: 'sketchmatter-refresh-button',
});
refreshButton.addEventListener('click', () => {
	void this.reload();
});

const gridButton = this.createPreviewButton(buttonPanel, {
	label: 'Grid',
	icon: 'layout-grid',
	className: this.showGrid
		? 'sketchmatter-grid-button sketchmatter-grid-button-active'
		: 'sketchmatter-grid-button',
});
gridButton.addEventListener('click', () => {
this.showGrid = !this.showGrid;
void this.renderView();
});

if (this.showGrid) {
	const spacingLabel = buttonPanel.createEl('label', {
		cls: 'sketchmatter-control-label sketchmatter-grid-spacing-control',
	});
	spacingLabel.createSpan({ text: 'Spacing' });
	const spacingInput = spacingLabel.createEl('input', { cls: 'sketchmatter-spacing-input' });
	spacingInput.type = 'text';
	spacingInput.value = String(this.plugin.settings.gridSpacing);
	spacingInput.addEventListener('change', () => {
		void (async () => {
			const parsed = Number(spacingInput.value);
			this.plugin.settings.gridSpacing =
				Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_SETTINGS.gridSpacing : parsed;
			await this.plugin.saveData(this.plugin.settings);
			void this.renderView();
		})();
	});
}

const editButton = this.createPreviewButton(buttonPanel, {
	label: 'Edit',
	icon: 'pencil',
	className: this.editMode
		? 'sketchmatter-edit-button sketchmatter-edit-button-active'
		: 'sketchmatter-edit-button',
});
editButton.addEventListener('click', () => {
this.editMode = !this.editMode;
if (!this.editMode) {
	this.selectedObjectPath = null;
}
void this.renderView();
});

const zoomControls = buttonPanel.createDiv({ cls: 'sketchmatter-zoom-controls' });
const zoomOutButton = this.createPreviewButton(zoomControls, {
	label: 'Zoom out',
	icon: 'minus',
	className: 'sketchmatter-zoom-button',
});
zoomOutButton.addEventListener('click', () => {
	this.setZoomLevel(stepPreviewZoom(this.zoomLevel, 'out'));
});

this.zoomResetButton = this.createPreviewButton(zoomControls, {
	label: '100%',
	icon: 'rotate-ccw',
	className: 'sketchmatter-zoom-button sketchmatter-zoom-reset-button',
	ariaLabel: 'Reset zoom',
});
this.zoomResetButton.addEventListener('click', () => {
this.setZoomLevel(1);
});

const zoomInButton = this.createPreviewButton(zoomControls, {
	label: 'Zoom in',
	icon: 'plus',
	className: 'sketchmatter-zoom-button',
});
zoomInButton.addEventListener('click', () => {
	this.setZoomLevel(stepPreviewZoom(this.zoomLevel, 'in'));
});
this.updateZoomControls();

const imageLabel = controls.createEl('label', { cls: 'sketchmatter-control-label' });
imageLabel.createSpan({ text: 'Image' });
this.imageSelector = imageLabel.createEl('select', { cls: 'sketchmatter-image-selector' });
this.imageSelector.addEventListener('change', () => {
this.currentImageId = this.imageSelector?.value || null;
void this.renderView();
});

const viewLabel = controls.createEl('label', { cls: 'sketchmatter-control-label' });
viewLabel.createSpan({ text: 'View' });
this.selector = viewLabel.createEl('select');
this.selector.addEventListener('change', () => {
this.currentViewId = this.selector?.value || null;
void this.renderView();
});

const snapModeLabel = controls.createEl('label', { cls: 'sketchmatter-control-label' });
snapModeLabel.createSpan({ text: 'Snap mode' });
const snapModeSelector = snapModeLabel.createEl('select', { cls: 'sketchmatter-snap-mode-selector' });
const snapModeOptions: Array<{ value: SnapMode; label: string }> = [
	{ value: 'all-points', label: 'All points' },
	{ value: 'same-type', label: 'Same type' },
	{ value: 'disabled', label: 'Disabled' },
];
for (const optionDefinition of snapModeOptions) {
	const option = snapModeSelector.createEl('option', { text: optionDefinition.label });
	option.value = optionDefinition.value;
	option.selected = optionDefinition.value === this.snapMode;
}
snapModeSelector.addEventListener('change', () => {
	this.snapMode = snapModeSelector.value as SnapMode;
	void this.renderView();
});

const createActions = controls.createDiv({ cls: 'sketchmatter-create-actions' });
const createImageButton = this.createPreviewButton(createActions, {
	label: 'Create image',
	icon: 'image-plus',
	className: 'sketchmatter-create-image-button',
});
createImageButton.addEventListener('click', () => {
	void createImageDefinitionFlow(this.app, this.plugin.settings, async () => {
		await this.reload();
	});
});

const createViewButton = this.createPreviewButton(createActions, {
	label: 'Create view',
	icon: 'file-plus-2',
	className: 'sketchmatter-create-view-button',
});
createViewButton.addEventListener('click', () => {
	void createViewDefinitionFlow(this.app, this.plugin.settings, async () => {
		await this.reload();
	});
});

const createObjectButton = this.createPreviewButton(createActions, {
	label: 'Create object',
	icon: 'box-select',
	className: 'sketchmatter-create-object-button',
});
createObjectButton.addEventListener('click', () => {
	void createObjectDefinitionFlow(this.app, this.plugin.settings, async () => {
		await this.reload();
	});
});

this.statusElement = this.containerEl.createDiv({ cls: 'sketchmatter-view-status' });

// ── Content area: preview + optional edit sidebar ───────────────
const contentArea = this.containerEl.createDiv({
	cls: this.editMode ? 'sketchmatter-edit-mode-layout' : 'sketchmatter-content-area',
});
this.previewContainer = contentArea.createDiv({ cls: 'sketchmatter-preview-container' });
		this.previewContainer.addEventListener(
			'wheel',
			(event) => {
				this.onPreviewWheel(event);
			},
			{ passive: false },
		);
	this.registerPreviewPanHandlers(this.previewContainer);
	this.registerPreviewTouchHandlers(this.previewContainer);

if (this.editMode) {
	this.editorSidebarEl = contentArea.createDiv({ cls: 'sketchmatter-editor-sidebar' });
}

const metadataBundle = this.getMetadataBundle();
const objects = metadataBundle.objects;
const typeDefinitions = collectSketchMatterTypeDefinitions(this.plugin.settings);
const views = metadataBundle.views;
const imageDefinitions = metadataBundle.imageDefinitions;

this.populateImageSelector(objects, Array.from(imageDefinitions.keys()));
this.populateViewSelector(views);

const selectedView = views.find((view) => view.id === this.currentViewId) ?? null;
let filteredObjects = filterSketchMatterObjects(objects, selectedView);
	filteredObjects = filterByImageId(filteredObjects, this.currentImageId ?? null);
const resolvedImageId = this.resolveImageId(selectedView, filteredObjects);
const imageDefinition =
	resolvedImageId != null ? (imageDefinitions.get(resolvedImageId) ?? null) : null;

this.currentFilteredObjects = filteredObjects;

if (this.previewContainer) {
	renderSvgPreview(
		this.previewContainer,
		filteredObjects,
		typeDefinitions,
		this.plugin.settings.layerRenderOrder,
		this.plugin.settings,
		imageDefinition,
		this.showGrid,
	);
	this.applyPreviewZoom();
	this.restorePreviewViewportState(previousViewport);
}

// ── Attach editor overlay when in edit mode ─────────────────────
if (this.editMode && this.previewContainer) {
	const svgEl = this.previewContainer.querySelector('svg');
	if (svgEl) {
		this.editorOverlayHandle = attachEditorOverlay(
			svgEl,
			filteredObjects,
			typeDefinitions,
			this.plugin.settings,
			(obj) => { this.onObjectSelected(obj); },
			(obj, pts) => { this.onCoordinatesChanged(obj, pts); },
			{ snapMode: this.snapMode },
		);
		// Restore previous selection after a re-render
		if (this.selectedObjectPath) {
			this.editorOverlayHandle.selectByPath(this.selectedObjectPath);
		}
	}
	// Always render the panel (shows object list or detail based on selection)
	this.renderEditorPanel();
} else if (!this.editMode && this.previewContainer) {
	// Make sure no leftover overlay exists (shouldn't normally happen)
	const svgEl = this.previewContainer.querySelector('svg');
	if (svgEl) {
		detachEditorOverlay(svgEl);
	}
}

if (this.statusElement) {
this.statusElement.textContent = this.plugin.settings.showDebugInfo
	? `${filteredObjects.length} object(s) rendered`
	: '';
}
}

/** Called by the editor overlay when the selection changes. */
private onObjectSelected(obj: SketchMatterObject | null): void {
	this.selectedObjectPath = obj?.objectId ?? null;
	this.renderEditorPanel();
}

/** Called by the editor overlay after a drag handle is released. */
private onCoordinatesChanged(obj: SketchMatterObject, pts: [number, number][]): void {
	const serialized = serializeCoordinates(pts);
	void this.app.fileManager.processFrontMatter(obj.file, (fm: Record<string, unknown>) => {
		fm[obj.coordinatesProperty] = serialized;
	});
}

/** Re-render just the sidebar panel without rebuilding the whole view. */
private renderEditorPanel(): void {
	if (!this.editorSidebarEl) return;
	this.editorSidebarEl.empty();

	const selectedObj =
		this.selectedObjectPath
			? (this.currentFilteredObjects.find((o) => o.objectId === this.selectedObjectPath) ?? null)
			: null;

	if (selectedObj) {
		renderObjectDetail(
			this.editorSidebarEl,
			this.app,
			selectedObj,
			this.plugin.settings,
			async (obj, changes) => {
				await this.app.fileManager.processFrontMatter(obj.file, (fm: Record<string, unknown>) => {
					for (const [key, value] of Object.entries(changes)) {
						fm[key] = convertPropertyInput(this.app, key, value);
					}
				});
			},
			() => {
				this.selectedObjectPath = null;
				this.editorOverlayHandle?.deselect();
				this.renderEditorPanel();
			},
		);
	} else {
		renderObjectList(
			this.editorSidebarEl,
			this.currentFilteredObjects,
			this.plugin.settings,
			(obj) => {
				this.editorOverlayHandle?.selectByPath(obj.objectId);
			},
		);
	}
}

private async exportSvg(): Promise<void> {
const metadataBundle = this.getMetadataBundle();
const objects = metadataBundle.objects;
const typeDefinitions = collectSketchMatterTypeDefinitions(this.plugin.settings);
const views = metadataBundle.views;
const imageDefinitions = metadataBundle.imageDefinitions;

const selectedView = views.find((view) => view.id === this.currentViewId) ?? null;
let filteredObjects = filterSketchMatterObjects(objects, selectedView);
filteredObjects = filterByImageId(filteredObjects, this.currentImageId ?? null);
const resolvedImageId = this.resolveImageId(selectedView, filteredObjects);
const imageDefinition =
	resolvedImageId != null ? (imageDefinitions.get(resolvedImageId) ?? null) : null;

const svgContent = renderSvgToString(
	filteredObjects,
	typeDefinitions,
	this.plugin.settings.layerRenderOrder,
	this.plugin.settings,
	imageDefinition,
);

const viewName = selectedView ? selectedView.name : 'all';
const imageSuffix = this.currentImageId ? `-${this.currentImageId}` : '';
const sanitized = (viewName + imageSuffix).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
const fileName = `sketch-matter-export-${sanitized}.svg`;

const existingFile = this.app.vault.getAbstractFileByPath(fileName);
if (existingFile) {
	await this.app.vault.modify(existingFile as import('obsidian').TFile, svgContent);
} else {
	await this.app.vault.create(fileName, svgContent);
}

new Notice(`Exported SVG to ${fileName}`);
}

private populateViewSelector(views: SketchMatterViewDefinition[]): void {
if (!this.selector) {
return;
}

this.selector.innerHTML = '';

const defaultOption = createEl('option');
defaultOption.value = '';
defaultOption.text = 'All objects';
this.selector.appendChild(defaultOption);

const visibleViews = views.filter((view) =>
	view.imageIds.length === 0 || (this.currentImageId != null && view.imageIds.includes(this.currentImageId))
);

for (const view of visibleViews) {
const option = createEl('option');
option.value = view.id;
option.text = view.name;
if (view.id === this.currentViewId) {
option.selected = true;
}
this.selector.appendChild(option);
}

// If the previously selected view is no longer visible, clear the selection
if (this.currentViewId != null && !visibleViews.some((view) => view.id === this.currentViewId)) {
this.currentViewId = null;
}

this.selector.disabled = visibleViews.length === 0;
}

private populateImageSelector(
	objects: SketchMatterObject[],
	imageDefinitionIds: string[],
): void {
if (!this.imageSelector) {
return;
}

this.imageSelector.innerHTML = '';
const imageIds = Array.from(new Set([...collectAllImageIds(objects), ...imageDefinitionIds])).sort();

const defaultOption = createEl('option');
defaultOption.value = '';
defaultOption.text = 'All images';
this.imageSelector.appendChild(defaultOption);

for (const id of imageIds) {
const option = createEl('option');
option.value = id;
option.text = id;
if (id === this.currentImageId) {
option.selected = true;
}
this.imageSelector.appendChild(option);
}

this.imageSelector.disabled = imageIds.length === 0;
}

private resolveImageId(
	selectedView: SketchMatterViewDefinition | null,
	objects: SketchMatterObject[],
): string | null {
	if (this.currentImageId) {
		return this.currentImageId;
	}

	if (selectedView?.includeImageIds.length === 1) {
		return selectedView.includeImageIds[0] ?? null;
	}

	const uniqueIds = new Set<string>();
	for (const object of objects) {
		for (const id of object.imageIds) {
			uniqueIds.add(id);
		}
	}

	if (uniqueIds.size === 1) {
		return Array.from(uniqueIds)[0] ?? null;
	}

	return null;
}

	private clampZoom(value: number): number {
		const { minZoom, maxZoom } = this.getPreviewZoomBounds();
		return clampPreviewZoom(value, minZoom, maxZoom);
	}

	private getPreviewZoomBounds(): { minZoom: number; maxZoom: number } {
		const configuredMinZoom = this.plugin.settings.previewMinZoom;
		const configuredMaxZoom = this.plugin.settings.previewMaxZoom;
		const minZoom = configuredMinZoom > 0 ? configuredMinZoom : PREVIEW_ZOOM_FLOOR;
		const maxZoom = configuredMaxZoom > 0 ? configuredMaxZoom : Number.POSITIVE_INFINITY;

		return minZoom <= maxZoom
			? { minZoom, maxZoom }
			: { minZoom: maxZoom, maxZoom: minZoom };
	}

	private setZoomLevel(nextZoom: number): void {
		const container = this.previewContainer;
		if (!container) {
			return;
		}
		const rect = container.getBoundingClientRect();
		const localX = rect.width / 2;
		const localY = rect.height / 2;
		this.adjustZoomLevel(nextZoom, localX, localY);
	}

	private onPreviewWheel(event: WheelEvent): void {
		if (!event.ctrlKey || !this.previewContainer) {
			return;
		}
		event.preventDefault();

		const container = this.previewContainer;
		const rect = container.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		this.adjustZoomLevel(stepPreviewZoom(this.zoomLevel, event.deltaY < 0 ? 'in' : 'out'), localX, localY);
	}

	private adjustZoomLevel(nextZoom: number, localX: number, localY: number): void {
		const container = this.previewContainer;
		const previousZoom = this.zoomLevel;
		const clamped = this.clampZoom(nextZoom);
		if (clamped === this.zoomLevel) {
			this.updateZoomControls();
			return;
		}

		this.zoomLevel = clamped;
		this.applyPreviewZoom();

		if (container && previousZoom > 0) {
			const zoomRatio = this.zoomLevel / previousZoom;
			const anchorX = container.scrollLeft + localX;
			const anchorY = container.scrollTop + localY;
			container.scrollLeft = anchorX * zoomRatio - localX;
			container.scrollTop = anchorY * zoomRatio - localY;
		}
		this.updateZoomControls();
	}

	private registerPreviewTouchHandlers(container: HTMLElement): void {
		const handleTouchStart = (event: TouchEvent): void => {
			if (event.touches.length !== 2) {
				return;
			}
			const [firstTouch, secondTouch] = Array.from(event.touches);
			if (!firstTouch || !secondTouch) {
				return;
			}
			this.previewPinchState = {
				startDistance: Math.hypot(firstTouch.clientX - secondTouch.clientX, firstTouch.clientY - secondTouch.clientY),
				startZoom: this.zoomLevel,
				startScrollLeft: container.scrollLeft,
				startScrollTop: container.scrollTop,
			};
			event.preventDefault();
		};

		const handleTouchMove = (event: TouchEvent): void => {
			if (!this.previewPinchState || event.touches.length !== 2) {
				return;
			}
			const [firstTouch, secondTouch] = Array.from(event.touches);
			if (!firstTouch || !secondTouch) {
				return;
			}
			const rect = container.getBoundingClientRect();
			const currentDistance = Math.hypot(firstTouch.clientX - secondTouch.clientX, firstTouch.clientY - secondTouch.clientY);
			const centerX = (firstTouch.clientX + secondTouch.clientX) / 2 - rect.left;
			const centerY = (firstTouch.clientY + secondTouch.clientY) / 2 - rect.top;
			const pinchState = computePinchZoomState({
				startZoom: this.previewPinchState.startZoom,
				startDistance: this.previewPinchState.startDistance,
				currentDistance,
				startScrollLeft: this.previewPinchState.startScrollLeft,
				startScrollTop: this.previewPinchState.startScrollTop,
				localX: centerX,
				localY: centerY,
				...this.getPreviewZoomBounds(),
			});
			this.zoomLevel = pinchState.zoomLevel;
			this.applyPreviewZoom();
			container.scrollLeft = pinchState.scrollLeft;
			container.scrollTop = pinchState.scrollTop;
			this.updateZoomControls();
			event.preventDefault();
		};

		const handleTouchEnd = (event: TouchEvent): void => {
			if (event.touches.length < 2) {
				this.previewPinchState = null;
			}
		};

		container.addEventListener('touchstart', handleTouchStart, { passive: false });
		container.addEventListener('touchmove', handleTouchMove, { passive: false });
		container.addEventListener('touchend', handleTouchEnd, { passive: false });
		container.addEventListener('touchcancel', handleTouchEnd, { passive: false });
	}

	private applyPreviewZoom(): void {
		if (!this.previewContainer) {
			return;
		}
		const svg = this.previewContainer.querySelector('svg');
		if (!svg) {
			return;
		}
		const percent = `${this.zoomLevel * 100}%`;
		svg.style.width = percent;
		svg.style.height = percent;
	}

	private registerPreviewPanHandlers(container: HTMLElement): void {
		container.addEventListener('pointerdown', (event: PointerEvent) => {
			const target = event.target;
			const targetEl = target instanceof Element ? target : null;
			if (
				event.button !== 0
				|| !this.canStartPreviewPan()
				|| !!targetEl?.closest(PREVIEW_PAN_BLOCK_SELECTOR)
			) {
				return;
			}
			this.previewPanState = {
				pointerId: event.pointerId,
				startClientX: event.clientX,
				startClientY: event.clientY,
				startScrollLeft: container.scrollLeft,
				startScrollTop: container.scrollTop,
				didPan: false,
			};
			container.classList.add('sketchmatter-preview-pan-ready');
		});

		container.addEventListener('pointermove', (event: PointerEvent) => {
			if (!this.previewPanState || this.previewPanState.pointerId !== event.pointerId) {
				return;
			}
			const dx = event.clientX - this.previewPanState.startClientX;
			const dy = event.clientY - this.previewPanState.startClientY;
			if (!this.previewPanState.didPan && Math.hypot(dx, dy) < PREVIEW_PAN_START_THRESHOLD) {
				return;
			}
			if (!this.previewPanState.didPan) {
				container.setPointerCapture(event.pointerId);
			}
			this.previewPanState.didPan = true;
			container.classList.add('sketchmatter-preview-panning');
			container.scrollLeft = this.previewPanState.startScrollLeft - dx;
			container.scrollTop = this.previewPanState.startScrollTop - dy;
			event.preventDefault();
		});

		const finishPan = (event: PointerEvent): void => {
			if (!this.previewPanState || this.previewPanState.pointerId !== event.pointerId) {
				return;
			}
			if (container.hasPointerCapture(event.pointerId)) {
				container.releasePointerCapture(event.pointerId);
			}
			this.suppressNextPreviewClick = this.previewPanState.didPan;
			this.previewPanState = null;
			container.classList.remove('sketchmatter-preview-pan-ready', 'sketchmatter-preview-panning');
		};
		container.addEventListener('pointerup', finishPan);
		container.addEventListener('pointercancel', finishPan);

		container.addEventListener('click', (event: MouseEvent) => {
			if (!this.suppressNextPreviewClick) {
				return;
			}
			this.suppressNextPreviewClick = false;
			event.preventDefault();
			event.stopPropagation();
		}, true);
	}

	private canStartPreviewPan(): boolean {
		if (!this.editMode) {
			return true;
		}
		return this.selectedObjectPath == null;
	}

	private createPreviewButton(container: HTMLElement, options: PreviewButtonOptions): HTMLButtonElement {
		const button = container.createEl('button', {
			cls: `sketchmatter-preview-button ${options.className}`,
		});
		button.type = 'button';
		const tooltipText = options.ariaLabel ?? options.label;
		button.setAttribute('aria-label', tooltipText);
		const iconEl = button.createSpan({ cls: 'sketchmatter-preview-button-icon' });
		setIcon(iconEl, options.icon);
		return button;
	}

	private updateZoomControls(): void {
		if (!this.zoomResetButton) {
			return;
		}
		const zoomPercent = `${Math.round(this.zoomLevel * 100)}%`;
		const tooltipText = `Reset zoom (current ${zoomPercent})`;
		this.zoomResetButton.setAttribute('aria-label', tooltipText);
	}

		private capturePreviewViewportState(): PreviewViewportState | null {
			if (!this.previewContainer) {
				return null;
			}
			const contentWidth = this.previewContainer.scrollWidth;
			const contentHeight = this.previewContainer.scrollHeight;
			const centerX = this.previewContainer.scrollLeft + this.previewContainer.clientWidth / 2;
			const centerY = this.previewContainer.scrollTop + this.previewContainer.clientHeight / 2;

			return {
				contentCenterXRatio: contentWidth > 0 ? centerX / contentWidth : 0.5,
				contentCenterYRatio: contentHeight > 0 ? centerY / contentHeight : 0.5,
			};
		}

		private restorePreviewViewportState(state: PreviewViewportState | null): void {
			if (!state || !this.previewContainer) {
				return;
			}
			const targetCenterX = state.contentCenterXRatio * this.previewContainer.scrollWidth;
			const targetCenterY = state.contentCenterYRatio * this.previewContainer.scrollHeight;
			const targetScrollLeft = targetCenterX - this.previewContainer.clientWidth / 2;
			const targetScrollTop = targetCenterY - this.previewContainer.clientHeight / 2;
			const maxScrollLeft = Math.max(0, this.previewContainer.scrollWidth - this.previewContainer.clientWidth);
			const maxScrollTop = Math.max(0, this.previewContainer.scrollHeight - this.previewContainer.clientHeight);

			this.previewContainer.scrollLeft = Math.min(maxScrollLeft, Math.max(0, targetScrollLeft));
			this.previewContainer.scrollTop = Math.min(maxScrollTop, Math.max(0, targetScrollTop));
		}
}
