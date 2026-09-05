import { App } from 'obsidian';
import { SketchMatterObject, SketchMatterSettings, RESOLVED_TEXTURE_PROPERTY } from '../types';
import { getObsidianPropertyType } from '../property-value';
import { getRegisteredShapeNames } from '../shapes';

/**
 * Properties that are Obsidian internals or managed by the editor overlay
 * and should not appear as editable inputs in the detail form.
 */
const SKIP_PROPS = new Set(['position', RESOLVED_TEXTURE_PROPERTY]);

type EditableInput = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
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
	return input instanceof HTMLInputElement && input.type === 'checkbox'
		? String(input.checked)
		: input.value;
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
	typeRow.createSpan({ text: 'Type: ' });
	const relatedTypes = relatedObjects.length > 0 ? relatedObjects : [object];
	for (const relatedObject of relatedTypes) {
		const typeButton = typeRow.createEl('button', {
			cls: 'sketchmatter-detail-type-button',
			text: relatedObject.typeName,
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

	// ── Save button ─────────────────────────────────────────────────
	if (editableInputs.size > 0) {
		const saveBtn = container.createEl('button', {
			cls: 'sketchmatter-panel-save-btn',
			text: 'Save',
		});
		saveBtn.addEventListener('click', () => {
			const changes: Record<string, string> = {};
			for (const [key, input] of editableInputs) {
				changes[key] = inputValue(input);
			}
			saveBtn.disabled = true;
			saveBtn.textContent = 'Saving…';
			onPropertyChanged(object, changes).then(() => {
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
