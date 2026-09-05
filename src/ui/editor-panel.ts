import { App, Modal } from 'obsidian';
import { SketchMatterObject, SketchMatterSettings, RESOLVED_TEXTURE_PROPERTY } from '../types';
import { getObsidianPropertyType } from '../property-value';
import { getRegisteredShapeNames } from '../shapes';

/**
 * Properties that are Obsidian internals or managed by the editor overlay
 * and should not appear as editable inputs in the detail form.
 */
const SKIP_PROPS = new Set(['position', RESOLVED_TEXTURE_PROPERTY]);

class ConfirmRemovalModal extends Modal {
	private resolver: ((confirmed: boolean) => void) | null = null;
	readonly result: Promise<boolean>;

	constructor(app: App, private readonly typeName: string, private readonly itemLabel: string) {
		super(app);
		this.result = new Promise((resolve) => {
			this.resolver = resolve;
		});
	}

	onOpen(): void {
		this.titleEl.setText(`Remove ${this.itemLabel}`);
		this.contentEl.createEl('p', { text: `Remove ${this.typeName} from this object?` });
		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancelButton = actions.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => this.resolveAndClose(false));
		const removeButton = actions.createEl('button', { cls: 'mod-warning', text: 'Remove' });
		removeButton.addEventListener('click', () => this.resolveAndClose(true));
	}

	onClose(): void {
		this.contentEl.empty();
		this.resolveAndClose(false, false);
	}

	private resolveAndClose(value: boolean, close = true): void {
		const resolver = this.resolver;
		this.resolver = null;
		resolver?.(value);
		if (close) this.close();
	}
}

function confirmTagRemoval(app: App, typeName: string, itemLabel = 'object type'): Promise<boolean> {
	const modal = new ConfirmRemovalModal(app, typeName, itemLabel);
	modal.open();
	return modal.result;
}

type EditableInput = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
type EditableValue = string | number | boolean | (string | number)[];

/** Returns true if the value can be represented by the detail form. */
function isEditableValue(value: unknown): value is EditableValue {
	return typeof value === 'string'
		|| typeof value === 'number'
		|| typeof value === 'boolean'
		|| (Array.isArray(value) && value.every((item) => typeof item === 'string' || typeof item === 'number'));
}

function isListPropertyType(propertyType: string | null): boolean {
	return propertyType === 'multitext' || propertyType === 'aliases' || propertyType === 'tags';
}

function inputValue(input: EditableInput): string {
	if (input.dataset.selectedTags !== undefined) {
		return input.dataset.selectedTags;
	}
	if (input instanceof HTMLInputElement && input.type === 'checkbox') {
		return String(input.checked);
	}
	if (input instanceof HTMLSelectElement && input.multiple) {
		return Array.from(input.selectedOptions, (option) => option.value).join('\n');
	}
	if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) {
		return input.value;
	}
	return '';
}

function formatPropertyIdentifier(key: string, settings: SketchMatterSettings): string {
	const identifiers = new Map<string, string>([
		[settings.coordinatesProperty, 'Coordinates'],
		[settings.labelCoordinatesProperty, 'Label coordinates'],
		[settings.labelTextProperty, 'Label text'],
		[settings.labelAngleProperty, 'Label angle'],
		[settings.fontFamilyProperty, 'Font family'],
		[settings.fontSizeProperty, 'Font size'],
		[settings.fontStyleProperty, 'Font style'],
		[settings.fontColorProperty, 'Font color'],
		[settings.imageIdProperty, 'Image ID'],
		[settings.layerProperty, 'Layer'],
		[settings.objectShapeProperty, 'Shape'],
		[settings.objectChildrenProperty, 'Children'],
		[settings.angleProperty, 'Angle'],
		[settings.rectWidthProperty, 'Width'],
		[settings.rectHeightProperty, 'Height'],
		[settings.rectRxProperty, 'Corner radius X'],
		[settings.rectRyProperty, 'Corner radius Y'],
		[settings.imageWidthProperty, 'Image width'],
		[settings.imageHeightProperty, 'Image height'],
		[settings.imageBackgroundColorProperty, 'Background color'],
		[settings.imageBackgroundImageProperty, 'Background image'],
		[settings.imagePreserveAspectRatioProperty, 'Preserve aspect ratio'],
		[settings.transparencyProperty, 'Opacity'],
		[settings.fillProperty, 'Fill'],
		[settings.strokeProperty, 'Stroke'],
		[settings.strokeWidthProperty, 'Stroke width'],
		[settings.textureProperty, 'Texture'],
		[settings.maskProperty, 'Mask'],
		[settings.noiseSeedProperty, 'Seed'],
		[settings.noiseMagnitudeProperty, 'Magnitude'],
		[settings.noiseAmountProperty, 'Noise amount'],
		[settings.blendProperty, 'Blend'],
		[settings.blendRadiusProperty, 'Blend radius'],
		[settings.blendOverflowProperty, 'Blend overflow'],
		[settings.overlapPatternProperty, 'Overlap pattern'],
		[settings.overlapPatternThicknessProperty, 'Overlap thickness'],
		[settings.overlapPatternSpacingProperty, 'Overlap spacing'],
		[settings.overlapPatternAngleProperty, 'Overlap angle'],
		[settings.overlapPatternColorProperty, 'Overlap color'],
		[settings.scatterCountProperty, 'Scatter count'],
		[settings.scatterItemWidthProperty, 'Scatter item width'],
		[settings.scatterItemHeightProperty, 'Scatter item height'],
		[settings.scatterItemTypeProperty, 'Scatter item type'],
	]);
	for (const definition of settings.typeDefinitions) {
		if (definition.layerOverrideProperty) {
			identifiers.set(
				definition.layerOverrideProperty,
				definition.useLabelCoordinates ? 'Label layer' : `${definition.name} layer`,
			);
		}
	}
	const identifier = identifiers.get(key);
	if (identifier) return identifier;

	const readableKey = key.replace(/^(sketchmatter[-_])/, '').replace(/[-_]+/g, ' ').trim();
	return readableKey.length > 0
		? readableKey.charAt(0).toUpperCase() + readableKey.slice(1)
		: key;
}

function formatTagName(tag: string, settings: SketchMatterSettings): string {
	const prefix = `${settings.typeTagPrefix}/`;
	return tag.startsWith(prefix) ? tag.slice(prefix.length) : tag;
}

function propertyGroup(
	key: string,
	settings: SketchMatterSettings,
): 'Shape' | 'Rect' | 'Label' | 'Object' {
	if (key === settings.objectShapeProperty) return 'Shape';

	const rectKeys = new Set([
		settings.rectWidthProperty,
		settings.rectHeightProperty,
		settings.rectRxProperty,
		settings.rectRyProperty,
		settings.angleProperty,
	]);
	if (rectKeys.has(key)) return 'Rect';

	const labelKeys = new Set([
		settings.labelTextProperty,
		settings.labelAngleProperty,
		settings.fontFamilyProperty,
		settings.fontSizeProperty,
		settings.fontStyleProperty,
		settings.fontColorProperty,
		...settings.typeDefinitions
			.filter((definition) => definition.useLabelCoordinates)
			.map((definition) => definition.layerOverrideProperty)
			.filter((property): property is string => Boolean(property)),
	]);
	if (labelKeys.has(key)) return 'Label';
	return 'Object';
}

/**
 * Render a scrollable list of all visible objects so the user can click
 * one to select it.  Replaces the container's current content.
 */
export function renderObjectList(
	container: HTMLElement,
	objects: SketchMatterObject[],
	settings: SketchMatterSettings,
	onSelect: (obj: SketchMatterObject) => void,
): void {
	container.empty();
	container.removeClass('sketchmatter-detail-panel');

	const heading = container.createDiv({ cls: 'sketchmatter-panel-heading' });
	heading.createSpan({ text: 'Objects' });

	if (objects.length === 0) {
		container.createEl('p', {
			cls: 'sketchmatter-panel-empty',
			text: 'No objects to display.',
		});
		return;
	}

	const ul = container.createEl('ul', { cls: 'sketchmatter-object-list' });
	const objectsBySourcePath = new Map<string, SketchMatterObject[]>();
	for (const object of objects) {
		const sourceObjects = objectsBySourcePath.get(object.sourcePath) ?? [];
		sourceObjects.push(object);
		objectsBySourcePath.set(object.sourcePath, sourceObjects);
	}

	for (const sourceObjects of objectsBySourcePath.values()) {
		const obj = sourceObjects[0]!;
		const li = ul.createEl('li', { cls: 'sketchmatter-object-list-item' });

		li.createSpan({ cls: 'sketchmatter-object-name', text: obj.file.basename });
		const types = li.createDiv({ cls: 'sketchmatter-object-types' });
		for (const sourceObject of sourceObjects) {
			const typeButton = types.createEl('button', {
				cls: 'sketchmatter-object-type',
				text: sourceObject.typeName,
			});
			typeButton.addEventListener('click', (event) => {
				event.stopPropagation();
				onSelect(sourceObject);
			});
		}

		li.addEventListener('click', () => {
			onSelect(obj);
		});
	}
}

/**
 * Render the property detail form for a selected object.
 * Replaces the container's current content.
 *
 * Shows:
 * - A back button (deselect)
 * - File name (clickable link to open the note)
 * - Type label
 * - Coordinates (read-only — edited via drag handles on the SVG)
 * - All other editable frontmatter properties
 * - A "Save" button
 */
export function renderObjectDetail(
	container: HTMLElement,
	app: App,
	object: SketchMatterObject,
	relatedObjects: SketchMatterObject[],
	imageIds: string[],
	settings: SketchMatterSettings,
	onPropertyChanged: (obj: SketchMatterObject, changes: Record<string, string>) => Promise<void>,
	onTypeSelected: (obj: SketchMatterObject) => void,
	onDeselect: () => void,
): void {
	container.empty();
	container.addClass('sketchmatter-detail-panel');

	// ── Back button ────────────────────────────────────────────────
	const backBtn = container.createEl('button', {
		cls: 'sketchmatter-panel-back-btn',
		text: '← back',
	});
	backBtn.addEventListener('click', () => {
		onDeselect();
	});

	// ── Object name (link to note) ──────────────────────────────────
	const nameRow = container.createDiv({ cls: 'sketchmatter-detail-name-row' });
	const nameLink = nameRow.createEl('a', {
		cls: 'sketchmatter-detail-name-link',
		text: object.file.basename,
	});
	nameLink.addEventListener('click', (e) => {
		e.preventDefault();
		void app.workspace.openLinkText(object.file.path, '', false);
	});

	// ── Type selector ───────────────────────────────────────────────
	const typeRow = container.createDiv({ cls: 'sketchmatter-detail-type' });
	typeRow.createSpan({ text: 'Select object: ' });
	const relatedTypes = relatedObjects.length > 0 ? relatedObjects : [object];
	for (const relatedObject of relatedTypes) {
		const typeButton = typeRow.createEl('button', {
			cls: 'sketchmatter-detail-type-button',
			text: relatedObject.typeName,
			attr: { title: `Select ${relatedObject.typeName} on the map` },
		});
		typeButton.classList.toggle('is-active', relatedObject.objectId === object.objectId);
		typeButton.addEventListener('click', () => {
			if (relatedObject.objectId !== object.objectId) {
				onTypeSelected(relatedObject);
			}
		});
	}

	// ── Coordinates (read-only) ─────────────────────────────────────
	// ── Editable properties ─────────────────────────────────────────
const editableInputs = new Map<string, EditableInput>();

	const form = container.createDiv({ cls: 'sketchmatter-detail-form' });

	const skipKeys = new Set([
		...SKIP_PROPS,
		settings.coordinatesProperty,
		settings.labelCoordinatesProperty,
	]);
	const groupedProperties = new Map<'Shape' | 'Rect' | 'Label' | 'Object', [string, EditableValue][]>();

	for (const [key, value] of Object.entries(object.properties)) {
		if (skipKeys.has(key)) continue;
		if (!isEditableValue(value)) continue;
		const group = propertyGroup(key, settings);
		const properties = groupedProperties.get(group) ?? [];
		properties.push([key, value]);
		groupedProperties.set(group, properties);
	}

	const groupOrder: Array<'Object' | 'Shape' | 'Rect' | 'Label'> = ['Object', 'Shape', 'Rect', 'Label'];
	const shapeNames = new Set([
		...getRegisteredShapeNames(),
		...settings.typeDefinitions.map((definition) => definition.shape).filter((shape): shape is string => Boolean(shape)),
	]);
	const availableImageIds = new Set(imageIds);
	const objectTypeTags = new Set(
		settings.typeDefinitions.map((definition) => `${settings.typeTagPrefix}/${definition.name}`),
	);
	const fontStyleOptions = ['bold', 'italic', 'oblique', 'underline', 'line-through', 'overline'];
	let notifyChanged = (): void => {};

	for (const group of groupOrder) {
		const properties = groupedProperties.get(group);
		if (!properties || properties.length === 0) continue;

		const section = form.createDiv({ cls: 'sketchmatter-detail-section' });
		section.createEl('h4', { cls: 'sketchmatter-detail-section-heading', text: group });

		for (const [key, value] of properties) {
			const row = section.createDiv({ cls: 'sketchmatter-detail-row' });
			const propertyLabel = row.createEl('label', {
				cls: 'sketchmatter-detail-label',
				text: settings.objectEditorPropertyNames === 'identifier' ? formatPropertyIdentifier(key, settings) : key,
			});
			if (settings.objectEditorPropertyNames === 'identifier') {
				propertyLabel.setAttribute('title', key);
			}

			const propertyType = getObsidianPropertyType(app, key);
			const strValue = Array.isArray(value) ? value.join('\n') : String(value);
			let input: EditableInput;

			if (key === settings.objectShapeProperty) {
				const select = row.createEl('select', { cls: 'sketchmatter-detail-input' });
				if (strValue && !shapeNames.has(strValue)) shapeNames.add(strValue);
				for (const shapeName of [...shapeNames].sort()) {
					select.createEl('option', { text: shapeName, value: shapeName });
				}
				select.value = strValue;
				input = select;
			} else if (key === settings.imageIdProperty) {
				const select = row.createEl('select', { cls: 'sketchmatter-detail-input' });
				select.createEl('option', { text: 'None', value: '' });
				if (strValue && !availableImageIds.has(strValue)) availableImageIds.add(strValue);
				for (const imageId of [...availableImageIds].sort()) {
					select.createEl('option', { text: imageId, value: imageId });
				}
				select.value = strValue;
				input = select;
			} else if (key === settings.fontStyleProperty) {
				const currentStyles = Array.isArray(value)
					? value.map(String)
					: strValue.split(/\r?\n/u).map((style) => style.trim()).filter(Boolean);
				const styleOptions = new Set([...fontStyleOptions, ...currentStyles]);
				const styleEditor = row.createDiv({ cls: 'sketchmatter-tag-editor' });
				const pills = styleEditor.createDiv({ cls: 'sketchmatter-tag-pills' });
				const addButton = styleEditor.createEl('button', {
					cls: 'sketchmatter-tag-add',
					text: '+',
					attr: { type: 'button', 'aria-label': 'Add font style' },
				});
				const picker = styleEditor.createEl('select', { cls: 'sketchmatter-tag-picker' });
				picker.hidden = true;
				picker.createEl('option', { text: 'Add style...', value: '' });
				addButton.addEventListener('click', () => {
					picker.hidden = !picker.hidden;
					if (!picker.hidden) picker.focus();
				});

				const updateStyleEditor = (styles: string[]): void => {
					styleEditor.dataset.selectedTags = styles.join('\n');
					pills.empty();
					for (const style of styles) {
						const pill = pills.createDiv({ cls: 'sketchmatter-tag-pill' });
						pill.createSpan({ text: style });
						const removeButton = pill.createEl('button', {
							cls: 'sketchmatter-tag-remove',
							text: '×',
							attr: { type: 'button', 'aria-label': `Remove ${style}` },
						});
						removeButton.addEventListener('click', () => {
										void confirmTagRemoval(app, style, 'font style').then((confirmed) => {
								if (confirmed) {
									updateStyleEditor(styles.filter((currentStyle) => currentStyle !== style));
									notifyChanged();
								}
							});
						});
					}
					for (const option of Array.from(picker.options)) {
						option.hidden = option.value !== '' && styles.includes(option.value);
					}
				};

				for (const style of [...styleOptions].sort()) {
					picker.createEl('option', { text: style, value: style });
				}
				picker.addEventListener('change', () => {
					const selectedStyle = picker.value;
					if (!selectedStyle || currentStyles.includes(selectedStyle)) return;
					currentStyles.push(selectedStyle);
					updateStyleEditor(currentStyles);
					notifyChanged();
					picker.value = '';
					picker.hidden = true;
				});
				updateStyleEditor(currentStyles);
				input = styleEditor;
			} else if (key === 'tags' || propertyType === 'tags') {
				const currentTags = Array.isArray(value) ? value.map(String) : strValue.split(/\r?\n/u).filter(Boolean);
				const tagOptions = new Set([...objectTypeTags, ...currentTags]);
				const tagEditor = row.createDiv({ cls: 'sketchmatter-tag-editor' });
				const pills = tagEditor.createDiv({ cls: 'sketchmatter-tag-pills' });
				const addButton = tagEditor.createEl('button', {
					cls: 'sketchmatter-tag-add',
					text: '+',
					attr: { type: 'button', 'aria-label': 'Add object type' },
				});
				const picker = tagEditor.createEl('select', {
					cls: 'sketchmatter-tag-picker',
				});
				picker.hidden = true;
				picker.createEl('option', { text: 'Add type...', value: '' });
				addButton.addEventListener('click', () => {
					picker.hidden = !picker.hidden;
					if (!picker.hidden) picker.focus();
				});

				const updateTagEditor = (tags: string[]): void => {
					tagEditor.dataset.selectedTags = tags.join('\n');
					pills.empty();
					for (const tag of tags) {
						const pill = pills.createDiv({ cls: 'sketchmatter-tag-pill' });
						pill.createSpan({ text: formatTagName(tag, settings) });
						const removeButton = pill.createEl('button', {
							cls: 'sketchmatter-tag-remove',
							text: '×',
							attr: { type: 'button', 'aria-label': `Remove ${formatTagName(tag, settings)}` },
						});
						removeButton.addEventListener('click', () => {
							void confirmTagRemoval(app, formatTagName(tag, settings)).then((confirmed) => {
								if (confirmed) {
									updateTagEditor(tags.filter((currentTag) => currentTag !== tag));
									notifyChanged();
								}
							});
						});
					}
					for (const option of Array.from(picker.options)) {
						option.hidden = option.value !== '' && tags.includes(option.value);
					}
				};

				for (const tag of [...tagOptions].sort((a, b) => formatTagName(a, settings).localeCompare(formatTagName(b, settings)))) {
					picker.createEl('option', { text: formatTagName(tag, settings), value: tag });
				}
				picker.addEventListener('change', () => {
					const selectedTag = picker.value;
					if (!selectedTag || currentTags.includes(selectedTag)) return;
					currentTags.push(selectedTag);
					updateTagEditor(currentTags);
					notifyChanged();
					picker.value = '';
					picker.hidden = true;
				});
				updateTagEditor(currentTags);
				input = tagEditor;
			} else if (propertyType === 'checkbox') {
				const checkbox = row.createEl('input', { cls: 'sketchmatter-detail-checkbox' });
				checkbox.type = 'checkbox';
				checkbox.checked = value === true || strValue.toLowerCase() === 'true';
				input = checkbox;
			} else if (Array.isArray(value) || isListPropertyType(propertyType) || strValue.length > 60 || strValue.includes('\n')) {
				const ta = row.createEl('textarea', { cls: 'sketchmatter-detail-input' });
				ta.value = strValue;
				ta.rows = 3;
				input = ta;
			} else {
				const inp = row.createEl('input', { cls: 'sketchmatter-detail-input' });
				inp.type = 'text';
				inp.value = strValue;
				input = inp;
			}

			editableInputs.set(key, input);
		}
	}

	const changeStatus = container.createDiv({ cls: 'sketchmatter-panel-change-status' });
	let autoSaveTimer: number | null = null;
	let saving = false;
	let dirty = false;
	const collectChanges = (): Record<string, string> => {
		const changes: Record<string, string> = {};
		for (const [key, input] of editableInputs) {
			changes[key] = inputValue(input);
		}
		return changes;
	};
	const saveChanges = async (): Promise<void> => {
		if (saving) return;
		saving = true;
		changeStatus.removeClass('is-unsaved');
		changeStatus.setText('Saving…');
		try {
			await onPropertyChanged(object, collectChanges());
			dirty = false;
			changeStatus.setText('Saved');
			window.setTimeout(() => {
				if (!dirty) changeStatus.setText('');
			}, 1500);
		} catch {
			changeStatus.removeClass('is-unsaved');
			changeStatus.setText('Could not save changes');
		} finally {
			saving = false;
		}
	};
	notifyChanged = (): void => {
		dirty = true;
		if (!settings.autoSaveObjectEditor) {
			changeStatus.addClass('is-unsaved');
			changeStatus.setText('Unsaved changes');
			return;
		}
		if (autoSaveTimer !== null) window.clearTimeout(autoSaveTimer);
		autoSaveTimer = window.setTimeout(() => {
			autoSaveTimer = null;
			void saveChanges();
		}, 400);
	};
	for (const input of editableInputs.values()) {
		if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) {
			input.addEventListener('input', notifyChanged);
			input.addEventListener('change', notifyChanged);
		}
	}

	// ── Save button ─────────────────────────────────────────────────
	if (editableInputs.size > 0 && !settings.autoSaveObjectEditor) {
		const saveBtn = container.createEl('button', {
			cls: 'sketchmatter-panel-save-btn',
			text: 'Save',
		});
		saveBtn.addEventListener('click', () => {
			saveBtn.disabled = true;
			saveBtn.textContent = 'Saving…';
			void saveChanges().then(() => {
				saveBtn.disabled = false;
				saveBtn.textContent = 'Saved ✓';
				window.setTimeout(() => {
					saveBtn.textContent = 'Save';
				}, 1500);
			}).catch(() => {
				saveBtn.disabled = false;
				saveBtn.textContent = 'Save';
			});
		});
	}
}
