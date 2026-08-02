import { Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, SketchMatterSettings } from './types';
import { SketchMatterSettingTab } from './settings';
import { SketchMatterView, VIEW_TYPE_SKETCH_MATTER } from './view';
import { registerCodeBlockProcessor } from './codeblock';
import { registerCreationCommands } from './creation';

export default class SketchMatterPlugin extends Plugin {
	settings: SketchMatterSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SketchMatterSettingTab(this.app, this, this.settings));
		this.registerView(VIEW_TYPE_SKETCH_MATTER, (leaf: WorkspaceLeaf) => new SketchMatterView(leaf, this));
		registerCodeBlockProcessor(this);
		registerCreationCommands(this);

		this.addRibbonIcon('image-file', 'Open SketchMatter preview', async () => {
			await this.openPanel();
		});

		this.addCommand({
			id: 'open-panel',
			name: 'Open panel',
			callback: async () => {
				await this.openPanel();
			},
		});

		this.registerEvent(
			this.app.metadataCache.on('changed', () => {
				if (this.settings.autoRefresh) {
					void this.refreshOpenViews();
				}
			}),
		);
	}

	async refreshOpenViews() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SKETCH_MATTER)) {
			const view = leaf.view as SketchMatterView;
			await view?.reload?.();
		}
	}

	private async openPanel(): Promise<void> {
		const leaf = this.settings.panelOpenLocation === 'side'
			? this.app.workspace.getRightLeaf(true)
			: this.app.workspace.getLeaf('tab');
		if (!leaf) {
			return;
		}
		await leaf.setViewState({ type: VIEW_TYPE_SKETCH_MATTER, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	onunload() {
		// Do not detach leaves here; Obsidian manages leaf lifecycle.
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<SketchMatterSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
