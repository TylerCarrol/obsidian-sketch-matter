import type { Vault } from 'obsidian';

/**
 * Manual mock for the `obsidian` module.
 *
 * The `obsidian` npm package is type-definitions only and provides no runtime
 * exports — Obsidian itself injects the real module at runtime inside the
 * application.  During unit tests we need a lightweight stand-in so that
 * source files that `import { ... } from 'obsidian'` can be loaded by Vitest.
 */

export class TFile {
	path: string;
	basename: string;
	extension: string;
	name: string;
	parent: null = null;
	stat = { ctime: 0, mtime: 0, size: 0 };
	vault = {} as Vault;

	constructor(path: string) {
		this.path = path;
		const parts = path.split('/');
		this.name = parts[parts.length - 1] ?? path;
		const dotIndex = this.name.lastIndexOf('.');
		this.basename = dotIndex >= 0 ? this.name.slice(0, dotIndex) : this.name;
		this.extension = dotIndex >= 0 ? this.name.slice(dotIndex + 1) : '';
	}
}

export class TFolder {
	path: string;
	name: string;
	parent: null = null;
	children: (TFile | TFolder)[] = [];
	isRoot() {
		return this.path === '';
	}
	constructor(path: string) {
		this.path = path;
		const parts = path.split('/');
		this.name = parts[parts.length - 1] ?? path;
	}
}

export class TAbstractFile {
	path = '';
	name = '';
	vault = {} as Vault;
	parent: null = null;
}

export type CachedMetadata = {
	frontmatter?: Record<string, unknown>;
	tags?: { tag: string }[];
};

/**
 * Minimal replica of Obsidian's `getAllTags` helper: extracts tag strings
 * from a `CachedMetadata` object produced by the mock vault.
 */
export function getAllTags(cache: CachedMetadata): string[] {
	return (cache.tags ?? []).map((t) => t.tag);
}

export class Plugin {
	app!: App;
	manifest = { id: 'test', name: 'Test', version: '0.0.0', minAppVersion: '1.0.0', author: '', description: '' };
	addCommand(_command: unknown): void { /* noop */ }
	addSettingTab(_tab: unknown): void { /* noop */ }
	registerEvent(_event: unknown): void { /* noop */ }
	registerMarkdownCodeBlockProcessor(_id: string, _cb: unknown): void { /* noop */ }
	registerView(_type: string, _factory: unknown): void { /* noop */ }
	addRibbonIcon(_icon: string, _title: string, _cb: unknown) { return document.createElement('div'); }
	async loadData(): Promise<unknown> { return {}; }
	async saveData(_data: unknown): Promise<void> { /* noop */ }
	async onload(): Promise<void> { /* noop */ }
	onunload(): void { /* noop */ }
}

export class PluginSettingTab {
	app!: App;
	plugin!: Plugin;
	containerEl!: HTMLElement;
	display(): void { /* noop */ }
	hide(): void { /* noop */ }
}

export class SettingPage {
	tab!: PluginSettingTab;
	id = '';
	name = '';
	containerEl = document.createElement('div');
	subPages: SettingPage[] = [];

	constructor(tab: PluginSettingTab, id: string, name: string) {
		this.tab = tab;
		this.id = id;
		this.name = name;
	}

	display(): void { /* noop */ }
	hide(): void { /* noop */ }
}

export class Setting {
	constructor(_containerEl?: HTMLElement) {}
	setName(_name: string) { return this; }
	setDesc(_desc: string) { return this; }
	addText(_cb: unknown) { return this; }
	addToggle(_cb: unknown) { return this; }
	addDropdown(_cb: unknown) { return this; }
	addTextArea(_cb: unknown) { return this; }
	addButton(_cb: unknown) { return this; }
}

export class ItemView {
	app!: App;
	containerEl = document.createElement('div');
	contentEl = document.createElement('div');
	leaf: null = null;
	getViewType() { return 'mock'; }
	getDisplayText() { return 'Mock View'; }
	async onOpen(): Promise<void> { /* noop */ }
	async onClose(): Promise<void> { /* noop */ }
}

export class WorkspaceLeaf {
	view: ItemView | null = null;
	async setViewState(_state: unknown): Promise<void> { /* noop */ }
}

export type EventRef = object;

export class App {
	vault: MockVault;
	metadataCache: MockMetadataCache;
	workspace: MockWorkspace;

	constructor(files: TFile[] = [], metadataMap: Map<string, CachedMetadata> = new Map()) {
		this.vault = new MockVault(files);
		this.metadataCache = new MockMetadataCache(metadataMap);
		this.workspace = new MockWorkspace();
	}
}

export class MockVault {
	private files: TFile[];

	constructor(files: TFile[] = []) {
		this.files = files;
	}

	getMarkdownFiles(): TFile[] {
		return this.files.filter((f) => f.extension === 'md');
	}

	getAbstractFileByPath(path: string): TFile | null {
		return this.files.find((f) => f.path === path) ?? null;
	}

	getResourcePath(file: TFile): string {
		return `app://local/${file.path}`;
	}
}

export class MockMetadataCache {
	private metadataMap: Map<string, CachedMetadata>;

	constructor(metadataMap: Map<string, CachedMetadata> = new Map()) {
		this.metadataMap = metadataMap;
	}

	getFileCache(file: TFile): CachedMetadata | null {
		return this.metadataMap.get(file.path) ?? null;
	}

	getCachedFiles(): string[] {
		return Array.from(this.metadataMap.keys());
	}

	getFirstLinkpathDest(_linkpath: string, _sourcePath: string): TFile | null {
		return null;
	}
}

export class MockWorkspace {
	on(_event: string, _callback: unknown): EventRef { return {}; }
	getLeavesOfType(_type: string): WorkspaceLeaf[] { return []; }
	getLeaf(_newLeaf?: 'tab' | 'split' | boolean): WorkspaceLeaf { return new WorkspaceLeaf(); }
	getRightLeaf(_create: boolean): WorkspaceLeaf { return new WorkspaceLeaf(); }
	revealLeaf(_leaf: WorkspaceLeaf): void { /* noop */ }
}

export const Notice = class {
	constructor(_message: string) { /* noop */ }
};

export const MarkdownView = class {};
export const Modal = class {};
export const FileSystemAdapter = class {};
