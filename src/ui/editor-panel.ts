import { App } from 'obsidian';
import { SketchMatterObject, SketchMatterSettings, RESOLVED_TEXTURE_PROPERTY } from '../types';

/**
 * Properties that are Obsidian internals or managed by the editor overlay
 * and should not appear as editable inputs in the detail form.
 */
const SKIP_PROPS = new Set(['position', RESOLVED_TEXTURE_PROPERTY]);

/** Returns true if the value is a plain string or number (safe to edit in a text input). */
function isSimpleValue(value: unknown): value is string | number {
	return typeof value === 'string' || typeof value === 'number';
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

	for (const obj of objects) {
		const li = ul.createEl('li', { cls: 'sketchmatter-object-list-item' });

		const nameSpan = li.createSpan({ cls: 'sketchmatter-object-name', text: obj.file.basename });
		const typeSpan = li.createSpan({ cls: 'sketchmatter-object-type', text: obj.typeName });

		// Only items with ≥2 coordinate points are interactively editable via handles;
		// still allow selecting any object to view / edit its properties.
		li.addEventListener('click', () => {
			onSelect(obj);
		});

		// Suppress unused variable warning for typeSpan (it is appended via createEl)
		void nameSpan;
		void typeSpan;
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
 * - All other simple-valued frontmatter properties as editable text inputs
 * - A "Save" button
 */
export function renderObjectDetail(
	container: HTMLElement,
	app: App,
	object: SketchMatterObject,
	settings: SketchMatterSettings,
	onPropertyChanged: (obj: SketchMatterObject, changes: Record<string, string>) => Promise<void>,
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

	// ── Type label ─────────────────────────────────────────────────
	container.createDiv({
		cls: 'sketchmatter-detail-type',
		text: `Type: ${object.typeName}`,
	});

	// ── Coordinates (read-only) ─────────────────────────────────────
	const coordKey = object.coordinatesProperty;
	const coordValue = object.properties[coordKey];
	if (coordValue !== undefined) {
		const coordRow = container.createDiv({ cls: 'sketchmatter-detail-row sketchmatter-detail-readonly' });
		coordRow.createEl('label', { cls: 'sketchmatter-detail-label', text: coordKey });
		coordRow.createSpan({
			cls: 'sketchmatter-detail-coord-hint',
			text: '(edit via handles on the map)',
		});
	}

	// ── Editable properties ─────────────────────────────────────────
	const editableInputs = new Map<string, HTMLInputElement | HTMLTextAreaElement>();

	const form = container.createDiv({ cls: 'sketchmatter-detail-form' });

	const skipKeys = new Set([...SKIP_PROPS, coordKey]);

	for (const [key, value] of Object.entries(object.properties)) {
		if (skipKeys.has(key)) continue;
		if (!isSimpleValue(value)) continue;

		const row = form.createDiv({ cls: 'sketchmatter-detail-row' });
		row.createEl('label', { cls: 'sketchmatter-detail-label', text: key });

		const strValue = String(value);
		let input: HTMLInputElement | HTMLTextAreaElement;

		if (strValue.length > 60 || strValue.includes('\n')) {
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

	// ── Save button ─────────────────────────────────────────────────
	if (editableInputs.size > 0) {
		const saveBtn = container.createEl('button', {
			cls: 'sketchmatter-panel-save-btn',
			text: 'Save',
		});
		saveBtn.addEventListener('click', () => {
			const changes: Record<string, string> = {};
			for (const [key, input] of editableInputs) {
				changes[key] = input.value;
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
