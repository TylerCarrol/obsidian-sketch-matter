import { ItemView, Notice, Plugin, WorkspaceLeaf, setIcon } from 'obsidian';
import { DEFAULT_SETTINGS, SketchMatterObject, SketchMatterSettings, SketchMatterViewDefinition } from './types';
import {
	collectSketchMatterObjects,
	collectSketchMatterTypeDefinitions,
	collectSketchMatterViewDefinitions,
	collectSketchMatterImageDefinitions,
	collectAllImageIds,
	filterByImageId,
	filterSketchMatterObjects,
} from './metadata';
import { renderSvgPreview, renderSvgToString } from './renderer';
import {
	attachEditorOverlay,
	detachEditorOverlay,
	serializeCoordinates,
	EditorOverlayHandle,
} from './editor';
import { renderObjectList, renderObjectDetail } from './ui/editor-panel';

export const VIEW_TYPE_SKETCH_MATTER = 'sketch-matter-view';
const MIN_PREVIEW_ZOOM = 0.25;
const MAX_PREVIEW_ZOOM = 4;
const PREVIEW_ZOOM_STEP = 0.1;
const PREVIEW_PAN_START_THRESHOLD = 2;
const PREVIEW_PAN_BLOCK_SELECTOR = '.sketchmatter-hit-target, .sketchmatter-handle';

type SketchMatterPluginLike = Plugin & { settings: SketchMatterSettings };
type PreviewButtonOptions = {
	label: string;
	icon: string;
	className: string;
	ariaLabel?: string;
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
zoomLevel = 1;
selectedObjectPath: string | null = null;
private editorSidebarEl: HTMLElement | null = null;
private editorOverlayHandle: EditorOverlayHandle | null = null;
private currentFilteredObjects: SketchMatterObject[] = [];
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
await this.renderView();
}

private async renderView(): Promise<void> {
const previousViewId = this.selector?.value || this.currentViewId;
this.currentViewId = previousViewId;
const previousImageId = this.imageSelector?.value || this.currentImageId;
this.currentImageId = previousImageId;
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
this.setZoomLevel(this.zoomLevel - PREVIEW_ZOOM_STEP);
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
this.setZoomLevel(this.zoomLevel + PREVIEW_ZOOM_STEP);
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

if (this.editMode) {
	this.editorSidebarEl = contentArea.createDiv({ cls: 'sketchmatter-editor-sidebar' });
}

const objects = collectSketchMatterObjects(this.app, this.plugin.settings);
const typeDefinitions = collectSketchMatterTypeDefinitions(this.plugin.settings);
const views = collectSketchMatterViewDefinitions(this.app, this.plugin.settings);
const imageDefinitions = collectSketchMatterImageDefinitions(this.app, this.plugin.settings);

this.populateImageSelector(objects);
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
						fm[key] = value;
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
const objects = collectSketchMatterObjects(this.app, this.plugin.settings);
const typeDefinitions = collectSketchMatterTypeDefinitions(this.plugin.settings);
const views = collectSketchMatterViewDefinitions(this.app, this.plugin.settings);
const imageDefinitions = collectSketchMatterImageDefinitions(this.app, this.plugin.settings);

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

private populateImageSelector(objects: SketchMatterObject[]): void {
if (!this.imageSelector) {
return;
}

this.imageSelector.innerHTML = '';
const imageIds = collectAllImageIds(objects);

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
		if (!Number.isFinite(value)) {
			return 1;
		}
		return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, Number(value.toFixed(2))));
	}

	private setZoomLevel(nextZoom: number): void {
		const clamped = this.clampZoom(nextZoom);
		if (clamped === this.zoomLevel) {
			this.updateZoomControls();
			return;
		}

		const container = this.previewContainer;
		let anchorX = 0;
		let anchorY = 0;
		let localX = 0;
		let localY = 0;
		if (container) {
			const rect = container.getBoundingClientRect();
			localX = rect.width / 2;
			localY = rect.height / 2;
			anchorX = container.scrollLeft + localX;
			anchorY = container.scrollTop + localY;
		}

		const previousZoom = this.zoomLevel;
		this.zoomLevel = clamped;
		this.applyPreviewZoom();

		if (container && previousZoom > 0) {
			const zoomRatio = this.zoomLevel / previousZoom;
			container.scrollLeft = anchorX * zoomRatio - localX;
			container.scrollTop = anchorY * zoomRatio - localY;
		}
		this.updateZoomControls();
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
		const anchorX = container.scrollLeft + localX;
		const anchorY = container.scrollTop + localY;

		const zoomDirection = event.deltaY < 0 ? 1 : -1;
		const nextZoom = this.clampZoom(this.zoomLevel + PREVIEW_ZOOM_STEP * zoomDirection);
		if (nextZoom === this.zoomLevel) {
			this.updateZoomControls();
			return;
		}

		const previousZoom = this.zoomLevel;
		this.zoomLevel = nextZoom;
		this.applyPreviewZoom();

		const zoomRatio = this.zoomLevel / previousZoom;
		container.scrollLeft = anchorX * zoomRatio - localX;
		container.scrollTop = anchorY * zoomRatio - localY;
		this.updateZoomControls();
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
}
