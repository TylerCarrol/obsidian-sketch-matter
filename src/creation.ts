import { App, Modal, Notice, Plugin, TFile } from 'obsidian';
import { getRegisteredShapeNames } from './shapes';
import { SketchMatterSettings } from './types';
import { collectSketchMatterImageDefinitions } from './metadata';

type RefreshCallback = (() => Promise<void> | void) | undefined;

export type SketchMatterCreationPlugin = Plugin & {
	settings: SketchMatterSettings;
	refreshOpenViews?: () => Promise<void>;
};

interface ImagePromptValues {
	name: string;
	width: number;
	height: number;
}

interface ViewPromptValues {
	name: string;
	includeLayers: string[];
	excludeLayers: string[];
}

interface ObjectPromptValues {
	name: string;
	typeName: string;
	imageIds: string[];
}

class BasePromptModal<T> extends Modal {
	private resolver: ((value: T | null) => void) | null = null;
	readonly result: Promise<T | null>;

	constructor(app: App) {
		super(app);
		this.result = new Promise<T | null>((resolve) => {
			this.resolver = resolve;
		});
	}

	protected resolveAndClose(value: T | null): void {
		const resolve = this.resolver;
		this.resolver = null;
		resolve?.(value);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (this.resolver) {
			const resolve = this.resolver;
			this.resolver = null;
			resolve(null);
		}
	}
}

class CreateImageModal extends BasePromptModal<ImagePromptValues> {
	private nameInput!: HTMLInputElement;
	private widthInput!: HTMLInputElement;
	private heightInput!: HTMLInputElement;

	onOpen(): void {
		this.titleEl.setText('Create image');

		const form = this.contentEl.createEl('form', { cls: 'sketchmatter-create-form' });
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			this.submit();
		});

		this.nameInput = createLabeledInput(form, 'Name', 'text', 'Earth');
		this.widthInput = createLabeledInput(form, 'Width', 'number', '2000');
		this.heightInput = createLabeledInput(form, 'Height', 'number', '1200');

		const buttonRow = form.createDiv({ cls: 'sketchmatter-create-form-actions' });
		const cancelButton = buttonRow.createEl('button', { text: 'Cancel' });
		cancelButton.type = 'button';
		cancelButton.addEventListener('click', () => {
			this.resolveAndClose(null);
		});

		const createButton = buttonRow.createEl('button', { text: 'Create', cls: 'mod-cta' });
		createButton.type = 'submit';

		this.nameInput.focus();
	}

	private submit(): void {
		const name = this.nameInput.value.trim();
		const width = Number.parseInt(this.widthInput.value, 10);
		const height = Number.parseInt(this.heightInput.value, 10);

		if (!name) {
			new Notice('Enter an image name.');
			return;
		}
		if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
			new Notice('Width and height must be positive numbers.');
			return;
		}

		this.resolveAndClose({ name, width, height });
	}
}

class CreateViewModal extends BasePromptModal<ViewPromptValues> {
	private nameInput!: HTMLInputElement;
	private includeInput!: HTMLTextAreaElement;
	private excludeInput!: HTMLTextAreaElement;

	onOpen(): void {
		this.titleEl.setText('Create view');

		const form = this.contentEl.createEl('form', { cls: 'sketchmatter-create-form' });
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			this.submit();
		});

		this.nameInput = createLabeledInput(form, 'Name', 'text', 'All layers');
		this.includeInput = createLabeledTextarea(form, 'Include layers', 'One layer or range per line');
		this.includeInput.value = '1-1000';
		this.excludeInput = createLabeledTextarea(form, 'Exclude layers', 'One layer or range per line');

		const buttonRow = form.createDiv({ cls: 'sketchmatter-create-form-actions' });
		const cancelButton = buttonRow.createEl('button', { text: 'Cancel' });
		cancelButton.type = 'button';
		cancelButton.addEventListener('click', () => {
			this.resolveAndClose(null);
		});

		const createButton = buttonRow.createEl('button', { text: 'Create', cls: 'mod-cta' });
		createButton.type = 'submit';

		this.nameInput.focus();
	}

	private submit(): void {
		const name = this.nameInput.value.trim();
		const includeLayers = parseLayerListInput(this.includeInput.value);
		const excludeLayers = parseLayerListInput(this.excludeInput.value);

		if (!name) {
			new Notice('Enter a view name.');
			return;
		}

		this.resolveAndClose({
			name,
			includeLayers: includeLayers.length > 0 ? includeLayers : ['1-1000'],
			excludeLayers,
		});
	}
}

class CreateObjectModal extends BasePromptModal<ObjectPromptValues> {
	private nameInput!: HTMLInputElement;
	private typeSelect!: HTMLSelectElement;
	private imageSelect!: HTMLSelectElement;
	private readonly typeNames: string[];
	private readonly imageIds: string[];

	constructor(app: App, typeNames: string[], imageIds: string[]) {
		super(app);
		this.typeNames = typeNames;
		this.imageIds = imageIds;
	}

	onOpen(): void {
		this.titleEl.setText('Create object');

		const form = this.contentEl.createEl('form', { cls: 'sketchmatter-create-form' });
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			this.submit();
		});

		this.nameInput = createLabeledInput(form, 'Name', 'text', 'New object');

		const typeField = form.createDiv({ cls: 'sketchmatter-create-form-field' });
		typeField.createEl('label', { text: 'Type' });
		this.typeSelect = typeField.createEl('select');
		for (const typeName of this.typeNames) {
			const option = this.typeSelect.createEl('option');
			option.value = typeName;
			option.textContent = typeName;
		}

		const imageField = form.createDiv({ cls: 'sketchmatter-create-form-field' });
		imageField.createEl('label', { text: 'Image' });
		this.imageSelect = imageField.createEl('select');
		const emptyOption = this.imageSelect.createEl('option');
		emptyOption.value = '';
		emptyOption.textContent = 'None';
		for (const imageId of this.imageIds) {
			const option = this.imageSelect.createEl('option');
			option.value = imageId;
			option.textContent = imageId;
		}
		if (this.imageIds.length === 0) {
			this.imageSelect.disabled = true;
			emptyOption.textContent = 'No image definitions found';
		}

		const buttonRow = form.createDiv({ cls: 'sketchmatter-create-form-actions' });
		const cancelButton = buttonRow.createEl('button', { text: 'Cancel' });
		cancelButton.type = 'button';
		cancelButton.addEventListener('click', () => {
			this.resolveAndClose(null);
		});

		const createButton = buttonRow.createEl('button', { text: 'Create', cls: 'mod-cta' });
		createButton.type = 'submit';

		this.nameInput.focus();
	}

	private submit(): void {
		const name = this.nameInput.value.trim();
		const typeName = this.typeSelect.value;
		const selectedImageId = this.imageSelect.value.trim();
		const imageIds = selectedImageId ? [selectedImageId] : [];
		if (!name) {
			new Notice('Enter an object name.');
			return;
		}
		if (!typeName) {
			new Notice('Select an object type.');
			return;
		}

		this.resolveAndClose({ name, typeName, imageIds });
	}
}

function createLabeledInput(
	form: HTMLElement,
	label: string,
	inputType: 'text' | 'number',
	placeholder: string,
): HTMLInputElement {
	const field = form.createDiv({ cls: 'sketchmatter-create-form-field' });
	field.createEl('label', { text: label });
	const input = field.createEl('input');
	input.type = inputType;
	input.placeholder = placeholder;
	return input;
}

function createLabeledTextarea(
	form: HTMLElement,
	label: string,
	placeholder: string,
): HTMLTextAreaElement {
	const field = form.createDiv({ cls: 'sketchmatter-create-form-field' });
	field.createEl('label', { text: label });
	const textarea = field.createEl('textarea');
	textarea.placeholder = placeholder;
	textarea.rows = 3;
	return textarea;
}

function parseLayerListInput(raw: string): string[] {
	return raw
		.split(/[\n,]+/g)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function yamlListLines(key: string, values: string[]): string[] {
	if (values.length === 0) {
		return [`${key}: []`];
	}

	return [
		`${key}:`,
		...values.map((value) => `  - ${quoteYaml(value)}`),
	];
}

function sanitizeFileName(raw: string): string {
	return raw
		.trim()
		.replace(/[\\/:*?"<>|#[\]]+/g, '-')
		.replace(/\s+/g, ' ')
		.trim();
}

function slugify(value: string): string {
	const slug = value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || 'item';
}

function quoteYaml(value: string): string {
	return JSON.stringify(value);
}

function getActiveFolderPath(app: App): string {
	const activeFile = app.workspace.getActiveFile();
	const parentPath = activeFile?.parent?.path;
	if (!parentPath || parentPath === '/') {
		return '';
	}
	return parentPath;
}

function toNotePath(folderPath: string, fileName: string): string {
	return folderPath ? `${folderPath}/${fileName}` : fileName;
}

function getUniqueMarkdownPath(app: App, folderPath: string, preferredBaseName: string): string {
	const safeBaseName = sanitizeFileName(preferredBaseName) || 'Untitled';
	let suffix = 0;
	while (true) {
		const numberedBase = suffix === 0 ? safeBaseName : `${safeBaseName} ${suffix + 1}`;
		const candidatePath = toNotePath(folderPath, `${numberedBase}.md`);
		if (!app.vault.getAbstractFileByPath(candidatePath)) {
			return candidatePath;
		}
		suffix += 1;
	}
}

async function createNoteAndRefresh(
	app: App,
	filePath: string,
	content: string,
	noticeMessage: string,
	refreshAfterCreate: RefreshCallback,
): Promise<void> {
	const file = await app.vault.create(filePath, content);
	await revealCreatedFile(app, file);
	new Notice(noticeMessage);
	await refreshAfterCreate?.();
}

async function revealCreatedFile(app: App, file: TFile): Promise<void> {
	const leaf = app.workspace.getLeaf('tab');
	await leaf.openFile(file);
}

const STYLE_KEY_TO_SETTINGS: ReadonlyArray<{ key: string; prop: (s: SketchMatterSettings) => string }> = [
	{ key: 'fill', prop: (s) => s.fillProperty },
	{ key: 'stroke', prop: (s) => s.strokeProperty },
	{ key: 'strokeWidth', prop: (s) => s.strokeWidthProperty },
	{ key: 'opacity', prop: (s) => s.transparencyProperty },
];

function resolveTypeShape(typeName: string, settings: SketchMatterSettings): string {
	const def = settings.typeDefinitions.find((d) => d.name === typeName);
	return def?.shape ?? typeName;
}

function defaultCoordinatesForShape(shape: string): string[] {
	switch (shape) {
		case 'polygon':
			return ['500, 400', '600, 400', '550, 480'];
		case 'polyline':
		case 'line':
			return ['400, 500', '600, 500'];
		default:
			return ['500, 500'];
	}
}

function emptyStylePropertyLines(typeName: string, settings: SketchMatterSettings): string[] {
	const def = settings.typeDefinitions.find((d) => d.name === typeName);
	const style = def?.style ?? {};
	return STYLE_KEY_TO_SETTINGS
		.filter(({ key }) => key in style)
		.map(({ prop }) => `${prop(settings)}:`);
}

function collectObjectTypeNames(settings: SketchMatterSettings): string[] {
	const configuredNames = settings.typeDefinitions
		.map((definition) => definition.name.trim())
		.filter((name) => name.length > 0);
	const unique = new Set<string>(configuredNames);
	for (const shapeName of getRegisteredShapeNames()) {
		const normalized = shapeName.trim();
		if (normalized.length > 0) {
			unique.add(normalized);
		}
	}
	return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

export async function createImageDefinitionFlow(
	app: App,
	settings: SketchMatterSettings,
	refreshAfterCreate?: () => Promise<void> | void,
): Promise<void> {
	const modal = new CreateImageModal(app);
	modal.open();
	const values = await modal.result;
	if (!values) {
		return;
	}

	const folderPath = getActiveFolderPath(app);
	const filePath = getUniqueMarkdownPath(app, folderPath, `image-${values.name}`);
	const imageId = slugify(values.name);
	const imageTag = `${settings.imageDefinitionTagPrefix}/${imageId}`;

	const content = [
		'---',
		'tags:',
		`  - ${imageTag}`,
		`${settings.imageIdProperty}: ${quoteYaml(imageId)}`,
		`${settings.imageWidthProperty}: ${values.width}`,
		`${settings.imageHeightProperty}: ${values.height}`,
		'---',
		'',
		`# ${values.name}`,
		'',
	].join('\n');

	await createNoteAndRefresh(
		app,
		filePath,
		content,
		`Created image definition: ${filePath}`,
		refreshAfterCreate,
	);
}

export async function createViewDefinitionFlow(
	app: App,
	settings: SketchMatterSettings,
	refreshAfterCreate?: () => Promise<void> | void,
): Promise<void> {
	const modal = new CreateViewModal(app);
	modal.open();
	const values = await modal.result;
	if (!values) {
		return;
	}

	const folderPath = getActiveFolderPath(app);
	const filePath = getUniqueMarkdownPath(app, folderPath, `view-${values.name}`);
	const viewId = slugify(values.name);
	const viewTag = `${settings.viewDefinitionTagPrefix}/${viewId}`;

	const content = [
		'---',
		'tags:',
		`  - ${viewTag}`,
		`${settings.viewNameProperty}: ${quoteYaml(values.name)}`,
		...yamlListLines(settings.viewIncludeLayersProperty, values.includeLayers),
		...yamlListLines(settings.viewExcludeLayersProperty, values.excludeLayers),
		'---',
		'',
		`# ${values.name}`,
		'',
	].join('\n');

	await createNoteAndRefresh(
		app,
		filePath,
		content,
		`Created view definition: ${filePath}`,
		refreshAfterCreate,
	);
}

export async function createObjectDefinitionFlow(
	app: App,
	settings: SketchMatterSettings,
	refreshAfterCreate?: () => Promise<void> | void,
): Promise<void> {
	const typeNames = collectObjectTypeNames(settings);
	const imageIds = Array.from(collectSketchMatterImageDefinitions(app, settings).keys()).sort((left, right) =>
		left.localeCompare(right),
	);
	if (typeNames.length === 0) {
		new Notice('No object types are defined yet. Add one in settings first.');
		return;
	}

	const modal = new CreateObjectModal(app, typeNames, imageIds);
	modal.open();
	const values = await modal.result;
	if (!values) {
		return;
	}

	const folderPath = getActiveFolderPath(app);
	const filePath = getUniqueMarkdownPath(app, folderPath, values.name);
	const objectTag = `${settings.typeTagPrefix}/${values.typeName}`;

	const shape = resolveTypeShape(values.typeName, settings);
	const defaultCoords = defaultCoordinatesForShape(shape);
	const styleLines = emptyStylePropertyLines(values.typeName, settings);

	const contentLines = [
		'---',
		'tags:',
		`  - ${objectTag}`,
		`${settings.layerProperty}: ${settings.defaultLayer}`,
		...yamlListLines(settings.imageIdProperty, values.imageIds),
		...yamlListLines(settings.coordinatesProperty, defaultCoords),
		...yamlListLines(settings.labelCoordinatesProperty, defaultCoords.slice(0, 1)),
		...styleLines,
	];

	if (values.typeName === 'label') {
		contentLines.push(`${settings.labelTextProperty}: ${quoteYaml(values.name)}`);
	}

	contentLines.push('---', '', `# ${values.name}`, '');

	await createNoteAndRefresh(
		app,
		filePath,
		contentLines.join('\n'),
		`Created object note: ${filePath}`,
		refreshAfterCreate,
	);
}

export function registerCreationCommands(plugin: SketchMatterCreationPlugin): void {
	plugin.addCommand({
		id: 'create-image',
		name: 'Create image',
		callback: () => {
			void createImageDefinitionFlow(plugin.app, plugin.settings, plugin.refreshOpenViews);
		},
	});

	plugin.addCommand({
		id: 'create-view',
		name: 'Create view',
		callback: () => {
			void createViewDefinitionFlow(plugin.app, plugin.settings, plugin.refreshOpenViews);
		},
	});

	plugin.addCommand({
		id: 'create-object',
		name: 'Create object',
		callback: () => {
			void createObjectDefinitionFlow(plugin.app, plugin.settings, plugin.refreshOpenViews);
		},
	});
}