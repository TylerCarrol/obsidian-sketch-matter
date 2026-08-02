import { App, Plugin, PluginSettingTab, Setting, SettingDefinitionItem, SettingPage } from 'obsidian';
import { DEFAULT_SETTINGS, SketchMatterSettings, SketchMatterTypeDefinition } from './types';
import { getRegisteredShapeNames } from './shapes';
import type { CompositeChild } from './shapes';

export function buildTypeDefinitionStyle(
	currentStyle: Record<string, string | number> | null | undefined,
	explicitStyle: Partial<Record<'fill' | 'stroke' | 'strokeWidth' | 'opacity', string | number | null | undefined>>,
	advancedStyle?: Record<string, string | number> | null,
): Record<string, string | number> | undefined {
	const merged: Record<string, string | number> = {};
	const explicitKeys = ['fill', 'stroke', 'strokeWidth', 'opacity'] as const;

	for (const [key, value] of Object.entries(currentStyle ?? {})) {
		if (value != null && value !== '' && !explicitKeys.includes(key as (typeof explicitKeys)[number])) {
			merged[key] = value;
		}
	}

	for (const [key, value] of Object.entries(advancedStyle ?? {})) {
		if (value != null && value !== '' && !explicitKeys.includes(key as (typeof explicitKeys)[number])) {
			merged[key] = value;
		}
	}

	for (const key of explicitKeys) {
		const value = explicitStyle[key];
		if (value === null || value === '') {
			delete merged[key];
			continue;
		}
		if (value != null) {
			merged[key] = value;
		} else if (currentStyle?.[key] != null && currentStyle[key] !== '') {
			merged[key] = currentStyle[key];
		}
	}

	return Object.keys(merged).length > 0 ? merged : undefined;
}

export function getTypeDefinitionDescription(typeTagPrefix: string, typeName: string): string {
	const normalizedPrefix = (typeTagPrefix || 'type').trim();
	const normalizedTypeName = typeName?.trim() || '<type-name>';
	return `Tag suffix to identify notes of this type. Use ${normalizedPrefix}/${normalizedTypeName} to tag notes of this type.`;
}

export class SketchMatterSettingTab extends PluginSettingTab {
	plugin: Plugin;
	settings: SketchMatterSettings;

	constructor(app: App, plugin: Plugin, settings: SketchMatterSettings) {
		super(app, plugin);
		this.plugin = plugin;
		this.settings = settings;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: 'page',
				name: 'General',
				desc: 'Core behavior and defaults for SketchMatter.',
				items: [
					{
						name: 'Panel open location',
						desc: 'Choose where the open panel command and ribbon button open the SketchMatter preview.',
						control: {
							type: 'dropdown',
							key: 'panelOpenLocation',
							options: {
								center: 'Center',
								side: 'Side panel',
							},
							defaultValue: DEFAULT_SETTINGS.panelOpenLocation,
						},
					},
					{
						name: 'Auto-refresh preview',
						desc: 'Automatically refresh the SketchMatter panel when metadata changes.',
						control: {
							type: 'toggle',
							key: 'autoRefresh',
							defaultValue: DEFAULT_SETTINGS.autoRefresh,
						},
					},
					{
						name: 'Show debug info',
						desc: 'Show the object count status line at the bottom of the SketchMatter panel.',
						control: {
							type: 'toggle',
							key: 'showDebugInfo',
							defaultValue: DEFAULT_SETTINGS.showDebugInfo,
						},
					},
					{
						name: 'Default layer',
						desc: 'Fallback layer number for objects that have no layer property set.',
						control: {
							type: 'number',
							key: 'defaultLayer',
							defaultValue: DEFAULT_SETTINGS.defaultLayer,
						},
					},
				],
			},
			{
				type: 'page',
				name: 'Type definitions',
				desc: 'Manage type inheritance, styles, and composite children.',
				page: () => new TypeDefinitionsSettingPage(this),
			},
			{
				type: 'page',
				name: 'Identifiers',
				desc: 'Tag prefixes and frontmatter keys used by SketchMatter.',
				items: [
					{
						type: 'page',
						name: 'Tag prefixes',
						desc: 'Tag namespaces used to discover objects, views, and images.',
						items: [
							this.textSetting(
								'Object type prefix',
								'Tag prefix that identifies object notes. For example: sketchmatter-type/continent.',
								'typeTagPrefix',
							),
							this.textSetting(
								'View definition prefix',
								'Tag prefix that identifies view definition notes. For example: sketchmatter-view/overview.',
								'viewDefinitionTagPrefix',
							),
							this.textSetting(
								'Image definition prefix',
								'Tag prefix that identifies image definition notes. The image ID is read from the image ID frontmatter property, not the tag suffix. For example: sketchmatter-image.',
								'imageDefinitionTagPrefix',
							),
						],
					},
					{
						type: 'page',
						name: 'Object properties',
						desc: 'Frontmatter keys for object geometry, labels, layering, and assignment.',
						items: [
							this.textSetting('Coordinates', 'Frontmatter key for coordinate or path data.', 'coordinatesProperty'),
							this.textSetting(
								'Label coordinates',
								'Frontmatter key for label-specific coordinates used by the label type.',
								'labelCoordinatesProperty',
							),
							this.textSetting('Label text', 'Frontmatter key for label text content.', 'labelTextProperty'),
							this.textSetting('Font family', 'Frontmatter key for label typeface or font family.', 'fontFamilyProperty'),
							this.textSetting('Font size', 'Frontmatter key for label font size.', 'fontSizeProperty'),
							this.textSetting(
								'Font style',
								'Frontmatter key for a label font-style list such as bold, italic, or underline.',
								'fontStyleProperty',
							),
							this.textSetting('Font color', 'Frontmatter key for label font color.', 'fontColorProperty'),
							this.textSetting('Image ID', 'Frontmatter key that assigns an object to one or more images.', 'imageIdProperty'),
							this.textSetting('Layer', 'Frontmatter key for layer assignment.', 'layerProperty'),
							this.textSetting(
								'Object shape property',
								'Frontmatter key that overrides the resolved shape for an object.',
								'objectShapeProperty',
							),
							this.textSetting(
								'Object children property',
								'Frontmatter key for child shape arrays used by composite and multipart objects.',
								'objectChildrenProperty',
							),
							{
								name: 'Layer render order',
								desc: 'Whether lower-numbered layers render first (0 -> 1) or last (1 -> 0).',
								control: {
									type: 'dropdown',
									key: 'layerRenderOrder',
									options: {
										'0-1': '0 -> 1 (lower layers first)',
										'1-0': '1 -> 0 (higher layers first)',
									},
									defaultValue: DEFAULT_SETTINGS.layerRenderOrder,
								},
							},
						],
					},
					{
						type: 'page',
						name: 'View properties',
						desc: 'Frontmatter keys used by view definition notes.',
						items: [
							this.textSetting(
								'View name property',
								"Frontmatter key used to set a view's display name (allows spaces). Falls back to the tag suffix when absent.",
								'viewNameProperty',
							),
							this.textSetting(
								'View image IDs property',
								'Frontmatter key listing image IDs a view applies to. When empty the view is available for all images; otherwise the view is only shown when a matching image is selected.',
								'viewImageIdsProperty',
							),
							this.textSetting(
								'View include layers property',
								'Frontmatter key listing layer ranges to include for a view.',
								'viewIncludeLayersProperty',
							),
							this.textSetting(
								'View exclude layers property',
								'Frontmatter key listing layer ranges to exclude for a view.',
								'viewExcludeLayersProperty',
							),
						],
					},
					{
						type: 'page',
						name: 'Image properties',
						desc: 'Frontmatter keys for canvas sizing and background.',
						items: [
							this.textSetting('Width', 'Frontmatter key for SVG canvas width.', 'imageWidthProperty'),
							this.textSetting('Height', 'Frontmatter key for SVG canvas height.', 'imageHeightProperty'),
							this.textSetting(
								'Background color',
								'Frontmatter key for canvas background color.',
								'imageBackgroundColorProperty',
							),
							this.textSetting(
								'Background image',
								'Frontmatter key for canvas background image source.',
								'imageBackgroundImageProperty',
							),
							this.textSetting(
								'Preserve aspect ratio',
								'Frontmatter key for SVG aspect ratio handling.',
								'imagePreserveAspectRatioProperty',
							),
						],
					},
					{
						type: 'page',
						name: 'Visual effects',
						desc: 'Frontmatter keys for styling, masking, and overlap patterns.',
						items: [
							this.textSetting('Opacity', 'Frontmatter key for object opacity (0-1).', 'transparencyProperty'),
							this.textSetting('Fill', 'Frontmatter key for object fill color/value.', 'fillProperty'),
							this.textSetting('Stroke', 'Frontmatter key for object stroke color/value.', 'strokeProperty'),
							this.textSetting('Stroke width', 'Frontmatter key for object stroke width.', 'strokeWidthProperty'),
							this.textSetting('Texture', 'Frontmatter key for a fill texture image source.', 'textureProperty'),
							this.textSetting('Mask', 'Frontmatter key for clip-path selectors.', 'maskProperty'),
							this.textSetting(
								'Blend',
								'Frontmatter key for soft-edge blending. Set to true on an object to feather its edges.',
								'blendProperty',
							),
							this.textSetting(
								'Blend radius',
								'Frontmatter key for blend feather radius in SVG units (default 20).',
								'blendRadiusProperty',
							),
							this.textSetting(
								'Overlap pattern',
								'Frontmatter key for overlap-only pattern style. Supported values: lines, hatch, crosshatch, dots.',
								'overlapPatternProperty',
							),
							this.textSetting(
								'Overlap pattern thickness',
								'Frontmatter key for overlap pattern line thickness in SVG units.',
								'overlapPatternThicknessProperty',
							),
							this.textSetting(
								'Overlap pattern spacing',
								'Frontmatter key for overlap pattern spacing in SVG units.',
								'overlapPatternSpacingProperty',
							),
							this.textSetting(
								'Overlap pattern angle',
								'Frontmatter key for overlap line-angle in degrees.',
								'overlapPatternAngleProperty',
							),
							this.textSetting(
								'Overlap pattern color',
								'Frontmatter key for overlap pattern color. Defaults to object stroke color.',
								'overlapPatternColorProperty',
							),
						],
					},
					{
						type: 'page',
						name: 'Noise',
						desc: 'Frontmatter keys for deterministic procedural noise.',
						items: [
							this.textSetting('Seed', 'Frontmatter key for the deterministic noise seed string.', 'noiseSeedProperty'),
							this.textSetting('Magnitude', 'Frontmatter key for point-offset magnitude (amplitude).', 'noiseMagnitudeProperty'),
							this.textSetting('Amount', 'Frontmatter key for roughness/detail amount.', 'noiseAmountProperty'),
						],
					},
				],
			},			
		];
	}

	private textSetting(name: string, desc: string, key: keyof SketchMatterSettings): SettingDefinitionItem {
		const defaultValue = DEFAULT_SETTINGS[key] as string;
		return {
			name,
			desc,
			control: {
				type: 'text',
				key,
				defaultValue,
				placeholder: defaultValue,
			},
		};
	}

	buildTypeDefinitionsTab(el: HTMLElement, refresh: () => void = () => this.update()): void {
		const listEl = el.createDiv('sketchmatter-type-definition-list');

		const renderTypeDefinition = (definition: SketchMatterTypeDefinition, index: number) => {
			const details = listEl.createEl('details', { cls: 'sketchmatter-type-definition-item' });
			const summary = details.createEl('summary', { cls: 'sketchmatter-type-definition-summary' });
			summary.textContent = definition.name || 'Unnamed type';

			const typeNameSetting = new Setting(details)
				.setName('Type name')
				.setDesc(getTypeDefinitionDescription(this.settings.typeTagPrefix, definition.name))
				.addText((text) =>
					text
						.setValue(definition.name)
						.onChange(async (value) => {
							const typeDefinition = this.settings.typeDefinitions[index];
							if (!typeDefinition) {
								return;
							}
							typeDefinition.name = value.trim();
							summary.textContent = typeDefinition.name || 'Unnamed type';
							typeNameSetting.setDesc(getTypeDefinitionDescription(this.settings.typeTagPrefix, typeDefinition.name));
							await this.plugin.saveData(this.settings);
						}),
				);

			new Setting(details)
				.setName('Extends')
				.setDesc('Optional base type name to inherit style and properties from.')
				.addDropdown((dropdown) => {
					const otherTypeNames = this.settings.typeDefinitions
						.filter((_, i) => i !== index)
						.map((td) => td.name)
						.filter((n) => n.length > 0);
					dropdown.addOption('', 'None');
					for (const name of otherTypeNames) {
						dropdown.addOption(name, name);
					}
					dropdown.setValue(definition.extends || '');
					dropdown.onChange(async (value) => {
						const typeDefinition = this.settings.typeDefinitions[index];
						if (!typeDefinition) {
							return;
						}
						typeDefinition.extends = value || undefined;
						await this.plugin.saveData(this.settings);
					});
				});

			// childrenSection is assigned below; the onChange callback fires after page render
			let childrenSection!: HTMLElement;

			new Setting(details)
				.setName('Shape')
				.setDesc('SVG shape type to use when rendering this object type.')
				.addDropdown((dropdown) => {
					dropdown.addOption('', '— (auto)');
					for (const name of getRegisteredShapeNames()) {
						dropdown.addOption(name, name);
					}
					dropdown.setValue(definition.shape || '');
					dropdown.onChange(async (value) => {
						const typeDefinition = this.settings.typeDefinitions[index];
						if (!typeDefinition) {
							return;
						}
						typeDefinition.shape = value || undefined;
						await this.plugin.saveData(this.settings);
						childrenSection.empty();
						if (value === 'composite') {
							this.renderCompositeChildrenSection(childrenSection, index);
						}
					});
				});

			new Setting(details)
				.setName('Default layer')
				.addText((text) =>
					text
						.setPlaceholder('100')
						.setValue(definition.defaultLayer?.toString() ?? '')
						.onChange(async (value) => {
							const typeDefinition = this.settings.typeDefinitions[index];
							if (!typeDefinition) {
								return;
							}
							const parsed = Number(value);
							typeDefinition.defaultLayer = Number.isNaN(parsed) ? undefined : parsed;
							await this.plugin.saveData(this.settings);
						}),
				);

			new Setting(details)
				.setName('Layer override property')
				.setDesc('Optional frontmatter key that overrides the shared layer key for this type.')
				.addText((text) =>
					text
						.setPlaceholder('Optional layer override key')
						.setValue(definition.layerOverrideProperty ?? '')
						.onChange(async (value) => {
							const typeDefinition = this.settings.typeDefinitions[index];
							if (!typeDefinition) {
								return;
							}
							typeDefinition.layerOverrideProperty = value.trim() || undefined;
							await this.plugin.saveData(this.settings);
						}),
				);

			new Setting(details)
				.setName('Fill')
				.setDesc('Default fill for this type. Leave empty to inherit or use advanced styling.')
				.addText((text) =>
					text
						.setPlaceholder('E.g. #F6d794')
						.setValue(String(definition.style?.fill ?? ''))
						.onChange(async (value) => {
							const typeDefinition = this.settings.typeDefinitions[index];
							if (!typeDefinition) {
								return;
							}
							typeDefinition.style = buildTypeDefinitionStyle(typeDefinition.style, {
								fill: value.trim() ? value.trim() : null,
								stroke: typeDefinition.style?.stroke,
								strokeWidth: typeDefinition.style?.strokeWidth,
								opacity: typeDefinition.style?.opacity,
							});
							await this.plugin.saveData(this.settings);
						}),
				);

			new Setting(details)
				.setName('Stroke')
				.setDesc('Default stroke for this type. Leave empty to inherit or use advanced styling.')
				.addText((text) =>
					text
						.setPlaceholder('E.g. #Aa7d44')
						.setValue(String(definition.style?.stroke ?? ''))
						.onChange(async (value) => {
							const typeDefinition = this.settings.typeDefinitions[index];
							if (!typeDefinition) {
								return;
							}
							typeDefinition.style = buildTypeDefinitionStyle(typeDefinition.style, {
								fill: typeDefinition.style?.fill,
								stroke: value.trim() ? value.trim() : null,
								strokeWidth: typeDefinition.style?.strokeWidth,
								opacity: typeDefinition.style?.opacity,
							});
							await this.plugin.saveData(this.settings);
						}),
				);

			new Setting(details)
				.setName('Stroke width')
				.setDesc('Default stroke width for this type. Leave empty to inherit or use advanced styling.')
				.addText((text) =>
					text
						.setPlaceholder('E.g. 2')
						.setValue(String(definition.style?.strokeWidth ?? ''))
						.onChange(async (value) => {
							const typeDefinition = this.settings.typeDefinitions[index];
							if (!typeDefinition) {
								return;
							}
							typeDefinition.style = buildTypeDefinitionStyle(typeDefinition.style, {
								fill: typeDefinition.style?.fill,
								stroke: typeDefinition.style?.stroke,
								strokeWidth: value.trim() ? value.trim() : null,
								opacity: typeDefinition.style?.opacity,
							});
							await this.plugin.saveData(this.settings);
						}),
				);

			new Setting(details)
				.setName('Opacity')
				.setDesc('Default opacity for this type. Leave empty to inherit or use advanced styling.')
				.addText((text) =>
					text
						.setPlaceholder('e.g. 0.5')
						.setValue(String(definition.style?.opacity ?? ''))
						.onChange(async (value) => {
							const typeDefinition = this.settings.typeDefinitions[index];
							if (!typeDefinition) {
								return;
							}
							typeDefinition.style = buildTypeDefinitionStyle(typeDefinition.style, {
								fill: typeDefinition.style?.fill,
								stroke: typeDefinition.style?.stroke,
								strokeWidth: typeDefinition.style?.strokeWidth,
								opacity: value.trim() ? value.trim() : null,
							});
							await this.plugin.saveData(this.settings);
						}),
				);

			new Setting(details)
				.setName('Style JSON')
				.setDesc('Advanced JSON object for any additional SVG style properties, e.g. {"filter":"url(#shadow)"}.')
				.addTextArea((textarea) => {
					const advancedStyle = Object.fromEntries(
						Object.entries(definition.style ?? {}).filter(
							([key]) => !['fill', 'stroke', 'strokeWidth', 'opacity'].includes(key),
						),
					);
					textarea
						.setPlaceholder('{"filter":"url(#shadow)"}')
						.setValue(JSON.stringify(advancedStyle, null, 2))
						.onChange(async (value) => {
							try {
								const typeDefinition = this.settings.typeDefinitions[index];
								if (!typeDefinition) {
									return;
								}
								const parsed: unknown = value.trim().length > 0 ? JSON.parse(value) : undefined;
								typeDefinition.style = buildTypeDefinitionStyle(
									typeDefinition.style,
									{
										fill: typeDefinition.style?.fill,
										stroke: typeDefinition.style?.stroke,
										strokeWidth: typeDefinition.style?.strokeWidth,
										opacity: typeDefinition.style?.opacity,
									},
									parsed as Record<string, string | number> | null | undefined,
								);
							} catch {
								// preserve previous value if JSON is invalid
							}
							await this.plugin.saveData(this.settings);
						});
				});

				childrenSection = details.createDiv('sketchmatter-composite-children');
				if (definition.shape === 'composite') {
					this.renderCompositeChildrenSection(childrenSection, index);
				}

				new Setting(details).addButton((button) =>
				button.setButtonText('Remove type').setDestructive().onClick(async () => {
					this.settings.typeDefinitions.splice(index, 1);
					await this.plugin.saveData(this.settings);
					refresh();
				}),
			);
		};

		for (const [index, definition] of this.settings.typeDefinitions.entries()) {
			renderTypeDefinition(definition, index);
		}

		new Setting(el).addButton((button) =>
			button.setButtonText('Add type').setCta().onClick(async () => {
				this.settings.typeDefinitions.push({ name: '', style: {} });
				await this.plugin.saveData(this.settings);
				refresh();
			}),
		);
	}

	private renderCompositeChildrenSection(container: HTMLElement, typeIndex: number): void {
		new Setting(container).setName('Children').setHeading();

		const typeDefinition = this.settings.typeDefinitions[typeIndex];
		if (!typeDefinition) return;

		if (!typeDefinition.properties) {
			typeDefinition.properties = {};
		}

		const rawChildren = typeDefinition.properties['children'];
		const children: CompositeChild[] = Array.isArray(rawChildren)
			? (rawChildren as CompositeChild[])
			: [];

		for (let ci = 0; ci < children.length; ci++) {
			this.renderCompositeChild(container, typeIndex, ci);
		}

		new Setting(container).addButton((btn) =>
			btn
				.setButtonText('Add child')
				.setCta()
				.onClick(async () => {
					const td = this.settings.typeDefinitions[typeIndex];
					if (!td) return;
					if (!td.properties) td.properties = {};
					if (!Array.isArray(td.properties['children'])) {
						td.properties['children'] = [];
					}
					(td.properties['children'] as CompositeChild[]).push({ shape: 'circle' });
					await this.plugin.saveData(this.settings);
					container.empty();
					this.renderCompositeChildrenSection(container, typeIndex);
				}),
		);
	}

	private renderCompositeChild(container: HTMLElement, typeIndex: number, childIndex: number): void {
		const typeDefinition = this.settings.typeDefinitions[typeIndex];
		if (!typeDefinition) return;

		const children = typeDefinition.properties?.['children'] as CompositeChild[] | undefined;
		if (!children || !children[childIndex]) return;

		const child = children[childIndex];
		const childContainer = container.createDiv('sketchmatter-composite-child');

		new Setting(childContainer)
			.setName(`Child ${childIndex + 1}`)
			.setHeading()
			.addButton((btn) =>
				btn
					.setIcon('trash')
					.setDestructive()
					.setTooltip('Remove this child')
					.onClick(async () => {
						const td = this.settings.typeDefinitions[typeIndex];
						const ch = td?.properties?.['children'];
						if (!Array.isArray(ch)) return;
						ch.splice(childIndex, 1);
						await this.plugin.saveData(this.settings);
						container.empty();
						this.renderCompositeChildrenSection(container, typeIndex);
					}),
			);

		new Setting(childContainer).setName('Shape').addDropdown((dropdown) => {
			for (const name of getRegisteredShapeNames()) {
				dropdown.addOption(name, name);
			}
			dropdown.setValue(child.shape);
			dropdown.onChange(async (value) => {
				const td = this.settings.typeDefinitions[typeIndex];
				const ch = (td?.properties?.['children'] as CompositeChild[] | undefined)?.[childIndex];
				if (!ch) return;
				ch.shape = value;
				await this.plugin.saveData(this.settings);
			});
		});

		new Setting(childContainer)
			.setName('Fill')
			.addText((text) => {
				const fillVal = child['fill'];
				return text
					.setPlaceholder('Transparent')
					.setValue(typeof fillVal === 'string' ? fillVal : '')
					.onChange(async (value) => {
						const td = this.settings.typeDefinitions[typeIndex];
						const ch = (td?.properties?.['children'] as CompositeChild[] | undefined)?.[childIndex];
						if (!ch) return;
						if (value.trim().length > 0) {
							ch['fill'] = value.trim();
						} else {
							delete ch['fill'];
						}
						await this.plugin.saveData(this.settings);
					});
			});

		new Setting(childContainer)
			.setName('Stroke')
			.addText((text) => {
				const strokeVal = child['stroke'];
				return text
					.setPlaceholder('None')
					.setValue(typeof strokeVal === 'string' ? strokeVal : '')
					.onChange(async (value) => {
						const td = this.settings.typeDefinitions[typeIndex];
						const ch = (td?.properties?.['children'] as CompositeChild[] | undefined)?.[childIndex];
						if (!ch) return;
						if (value.trim().length > 0) {
							ch['stroke'] = value.trim();
						} else {
							delete ch['stroke'];
						}
						await this.plugin.saveData(this.settings);
					});
			});

		new Setting(childContainer)
			.setName('Stroke width')
			.addText((text) => {
				const swVal = child['strokeWidth'];
				const swStr = typeof swVal === 'number' || typeof swVal === 'string' ? String(swVal) : '';
				return text
					.setPlaceholder('2')
					.setValue(swStr)
					.onChange(async (value) => {
						const td = this.settings.typeDefinitions[typeIndex];
						const ch = (td?.properties?.['children'] as CompositeChild[] | undefined)?.[childIndex];
						if (!ch) return;
						const parsed = Number(value.trim());
						if (value.trim().length > 0 && !Number.isNaN(parsed)) {
							ch['strokeWidth'] = parsed;
						} else {
							delete ch['strokeWidth'];
						}
						await this.plugin.saveData(this.settings);
					});
			});

		new Setting(childContainer)
			.setName('Opacity')
			.addText((text) => {
				const opVal = child['opacity'];
				const opStr = typeof opVal === 'number' || typeof opVal === 'string' ? String(opVal) : '';
				return text
					.setPlaceholder('1')
					.setValue(opStr)
					.onChange(async (value) => {
						const td = this.settings.typeDefinitions[typeIndex];
						const ch = (td?.properties?.['children'] as CompositeChild[] | undefined)?.[childIndex];
						if (!ch) return;
						const parsed = Number(value.trim());
						if (value.trim().length > 0 && !Number.isNaN(parsed)) {
							ch['opacity'] = parsed;
						} else {
							delete ch['opacity'];
						}
						await this.plugin.saveData(this.settings);
					});
			});

		new Setting(childContainer)
			.setName('Radius')
			.setDesc('For circle shapes.')
			.addText((text) => {
				const rVal = child['radius'];
				const rStr = typeof rVal === 'number' || typeof rVal === 'string' ? String(rVal) : '';
				return text
					.setPlaceholder('10')
					.setValue(rStr)
					.onChange(async (value) => {
						const td = this.settings.typeDefinitions[typeIndex];
						const ch = (td?.properties?.['children'] as CompositeChild[] | undefined)?.[childIndex];
						if (!ch) return;
						const parsed = Number(value.trim());
						if (value.trim().length > 0 && !Number.isNaN(parsed)) {
							ch['radius'] = parsed;
						} else {
							delete ch['radius'];
						}
						await this.plugin.saveData(this.settings);
					});
			});
	}
}

class TypeDefinitionsSettingPage extends SettingPage {
	private readonly tab: SketchMatterSettingTab;

	constructor(tab: SketchMatterSettingTab) {
		super();
		this.tab = tab;
		this.title = 'Type definitions';
	}

	display(): void {
		this.containerEl.empty();
		this.tab.buildTypeDefinitionsTab(this.containerEl, () => this.display());
	}
}
