import type { TFile } from 'obsidian';

export interface SketchMatterSettings {
	panelOpenLocation: PanelOpenLocation;
	typeTagPrefix: string;
	typeDefinitions: SketchMatterTypeDefinition[];
	viewDefinitionTagPrefix: string;
	viewNameProperty: string;
	viewImageIdsProperty: string;
	viewIncludeLayersProperty: string;
	viewExcludeLayersProperty: string;
	imageDefinitionTagPrefix: string;
	layerProperty: string;
	objectShapeProperty: string;
	objectChildrenProperty: string;
	angleProperty: string;
	rectWidthProperty: string;
	rectHeightProperty: string;
	rectRxProperty: string;
	rectRyProperty: string;
	layerRenderOrder: LayerRenderOrder;
	coordinatesProperty: string;
	labelCoordinatesProperty: string;
	labelTextProperty: string;
	fontFamilyProperty: string;
	fontSizeProperty: string;
	fontStyleProperty: string;
	fontColorProperty: string;
	imageIdProperty: string;
	imageWidthProperty: string;
	imageHeightProperty: string;
	imageBackgroundColorProperty: string;
	imageBackgroundImageProperty: string;
	imagePreserveAspectRatioProperty: string;
	transparencyProperty: string;
	fillProperty: string;
	strokeProperty: string;
	strokeWidthProperty: string;
	textureProperty: string;
	maskProperty: string;
	noiseSeedProperty: string;
	noiseMagnitudeProperty: string;
	noiseAmountProperty: string;
	blendProperty: string;
	blendRadiusProperty: string;
	overlapPatternProperty: string;
	overlapPatternThicknessProperty: string;
	overlapPatternSpacingProperty: string;
	overlapPatternAngleProperty: string;
	overlapPatternColorProperty: string;
	scatterCountProperty: string;
	scatterItemWidthProperty: string;
	scatterItemHeightProperty: string;
	scatterItemTypeProperty: string;
	defaultLayer: number;
	autoRefresh: boolean;
	showDebugInfo: boolean;
	gridSpacing: number;
	previewMinZoom: number;
	previewMaxZoom: number;
}

export type LayerRenderOrder = '0-1' | '1-0';
export type PanelOpenLocation = 'center' | 'side';

export const DEFAULT_SETTINGS: SketchMatterSettings = {
	panelOpenLocation: 'center',
	typeTagPrefix: 'sketchmatter-type',
	typeDefinitions: [
		{
			name: 'continent',
			shape: 'polygon',
			layerOverrideProperty: 'sketchmatter-continent-layer',
			defaultLayer: 100,
			style: {
				fill: '#f6d794',
				stroke: '#aa7d44',
				strokeWidth: 3,
			},
		},
		{
			name: 'river',
			shape: 'polyline',
			layerOverrideProperty: 'sketchmatter-river-layer',
			defaultLayer: 200,
			style: {
				fill: 'transparent',
				stroke: '#3366cc',
				strokeWidth: 4,
			},
		},
		{
			name: 'lake',
			shape: 'polygon',
			layerOverrideProperty: 'sketchmatter-lake-layer',
			defaultLayer: 250,
			style: {
				fill: '#77b9ff',
				stroke: '#1f5fa6',
				strokeWidth: 3,
			},
		},
		{
			name: 'biome',
			shape: 'polygon',
			layerOverrideProperty: 'sketchmatter-biome-layer',
			defaultLayer: 150,
			style: {
				fill: '#7ab87a',
				stroke: '#4a7a4a',
				strokeWidth: 1,
				opacity: 0.5,
			},
		},
		{
			name: 'polity',
			shape: 'polygon',
			layerOverrideProperty: 'sketchmatter-polity-layer',
			defaultLayer: 300,
			style: {
				fill: '#7f7fbf',
				stroke: '#555599',
				strokeWidth: 2,
				opacity: 0.5,
			},
		},
		{
			name: 'label',
			shape: 'text',
			layerOverrideProperty: 'sketchmatter-label-layer',
			defaultLayer: 1000,
			useLabelCoordinates: true,
			style: {
				fill: '#222222',
				stroke: 'none',
			},
		},
		{
			name: 'tree',
			shape: 'composite',
			layerOverrideProperty: 'sketchmatter-tree-layer',
			defaultLayer: 395,
			style: {
				opacity: 1,
			},
			properties: {
				children: [
					{
						name: 'Outer canopy',
						shape: 'polygon',
						relativeCoordinates: true,
						coordinates: ['-11, 6', '0, -14', '11, 6'],
						fill: '#2f6b2f',
						stroke: '#234f23',
						strokeWidth: 1,
					},
					{
						name: 'Middle canopy',
						shape: 'polygon',
						relativeCoordinates: true,
						coordinates: ['-9, 0', '0, -20', '9, 0'],
						fill: '#3b7c3b',
						stroke: '#234f23',
						strokeWidth: 1,
					},
					{
						name: 'Upper canopy',
						shape: 'polygon',
						relativeCoordinates: true,
						coordinates: ['-7, -6', '0, -26', '7, -6'],
						fill: '#4d8e4d',
						stroke: '#234f23',
						strokeWidth: 1,
					},
					{
						name: 'Trunk',
						shape: 'rect',
						relativeCoordinates: true,
						coordinates: ['-2, 6'],
						width: 4,
						height: 10,
						fill: '#6b4f2a',
						stroke: 'none',
						strokeWidth: 0,
					},
				],
			},
		},
		{
			name: 'mountains',
			shape: 'scatter',
			layerOverrideProperty: 'sketchmatter-mountains-layer',
			defaultLayer: 400,
			style: {
				fill: '#7a6a55',
				stroke: '#4a3a2a',
				strokeWidth: 1,
			},
			properties: {
				scatterCount: 25,
				scatterItemWidth: 28,
				scatterItemHeight: 18,
				noiseMagnitude: 4,
				noise: 1.2,
			},
		},
		{
			name: 'trees',
			shape: 'scatter',
			layerOverrideProperty: 'sketchmatter-trees-layer',
			defaultLayer: 405,
			style: {
				fill: '#4f8d4f',
				stroke: '#345f34',
				strokeWidth: 1,
			},
			properties: {
				scatterCount: 20,
				scatterItemWidth: 26,
				scatterItemHeight: 34,
				scatterItemType: 'tree',
				noiseMagnitude: 5,
				noise: 1.15,
			},
		},
		{
			name: 'city',
			shape: 'composite',
			layerOverrideProperty: 'sketchmatter-city-layer',
			defaultLayer: 500,
			useLabelCoordinates: false,
			style: {
				opacity: 1,
			},
			properties: {
				children: [
					{
						name: 'Outer ring',
						shape: 'circle',
						radius: 12,
						fill: 'none',
						stroke: '#2c2c2c',
						strokeWidth: 1.5,
					},
					{
						name: 'Core',
						shape: 'circle',
						radius: 4,
						fill: '#2c2c2c',
						stroke: 'none',
						strokeWidth: 0,
					},
				],
			},
		},
	],
	viewDefinitionTagPrefix: 'sketchmatter-view',
	viewNameProperty: 'sketchmatter-view-name',
	viewImageIdsProperty: 'sketchmatter-image-ids',
	viewIncludeLayersProperty: 'sketchmatter-include-layers',
	viewExcludeLayersProperty: 'sketchmatter-exclude-layers',
	imageDefinitionTagPrefix: 'sketchmatter-image',
	layerProperty: 'sketchmatter-layer',
	objectShapeProperty: 'sketchmatter-shape',
	objectChildrenProperty: 'sketchmatter-children',
	layerRenderOrder: '0-1',
	coordinatesProperty: 'sketchmatter-coordinates',
	labelCoordinatesProperty: 'sketchmatter-label-coordinates',
	labelTextProperty: 'sketchmatter-label-text',
	fontFamilyProperty: 'sketchmatter-font-family',
	fontSizeProperty: 'sketchmatter-font-size',
	fontStyleProperty: 'sketchmatter-font-style',
	fontColorProperty: 'sketchmatter-font-color',
	imageIdProperty: 'sketchmatter-image-id',
	imageWidthProperty: 'sketchmatter-width',
	imageHeightProperty: 'sketchmatter-height',
	angleProperty: 'sketchmatter-angle',
	rectWidthProperty: 'sketchmatter-width',
	rectHeightProperty: 'sketchmatter-height',
	rectRxProperty: 'sketchmatter-rx',
	rectRyProperty: 'sketchmatter-ry',
	imageBackgroundColorProperty: 'sketchmatter-background-color',
	imageBackgroundImageProperty: 'sketchmatter-background-image',
	imagePreserveAspectRatioProperty: 'sketchmatter-preserve-aspect-ratio',
	transparencyProperty: 'sketchmatter-opacity',
	fillProperty: 'sketchmatter-fill',
	strokeProperty: 'sketchmatter-stroke',
	strokeWidthProperty: 'sketchmatter-stroke-width',
	textureProperty: 'sketchmatter-texture',
	maskProperty: 'sketchmatter-mask',
	noiseSeedProperty: 'sketchmatter-seed',
	noiseMagnitudeProperty: 'sketchmatter-magnitude',
	noiseAmountProperty: 'sketchmatter-noise',
	blendProperty: 'sketchmatter-blend',
	blendRadiusProperty: 'sketchmatter-blend-radius',
	overlapPatternProperty: 'sketchmatter-overlap-pattern',
	overlapPatternThicknessProperty: 'sketchmatter-overlap-thickness',
	overlapPatternSpacingProperty: 'sketchmatter-overlap-spacing',
	overlapPatternAngleProperty: 'sketchmatter-overlap-angle',
	overlapPatternColorProperty: 'sketchmatter-overlap-color',
	scatterCountProperty: 'sketchmatter-scatter-count',
	scatterItemWidthProperty: 'sketchmatter-scatter-item-width',
	scatterItemHeightProperty: 'sketchmatter-scatter-item-height',
	scatterItemTypeProperty: 'sketchmatter-scatter-item-type',
	defaultLayer: 1000,
	autoRefresh: true,
	showDebugInfo: false,
	gridSpacing: 100,
	previewMinZoom: 0.25,
	previewMaxZoom: 4,
};

export interface SketchMatterTypeDefinition {
	name: string;
	extends?: string;
	shape?: string;
	layerOverrideProperty?: string;
	defaultLayer?: number;
	useLabelCoordinates?: boolean;
	style?: Record<string, string | number>;
	properties?: Record<string, unknown>;
}

export interface SketchMatterObject {
	objectId: string;
	sourcePath: string;
	file: TFile;
	typeName: string;
	layer: number;
	coordinates: unknown;
	coordinatesProperty: string;
	imageIds: string[];
	properties: Record<string, unknown>;
}

export interface LayerRange {
	min: number;
	max: number;
}

export interface SketchMatterViewDefinition {
	id: string;
	name: string;
	imageIds: string[];
	includeLayers: LayerRange[];
	excludeLayers: LayerRange[];
	includeImageIds: string[];
	excludeImageIds: string[];
	properties: Record<string, unknown>;
}

export interface SketchMatterImageDefinition {
	id: string;
	name: string;
	width?: number;
	height?: number;
	backgroundColor?: string;
	backgroundImage?: string;
	preserveAspectRatio?: string;
	properties: Record<string, unknown>;
}

export const RESOLVED_TEXTURE_PROPERTY = '__SketchMatterResolvedTexture';
