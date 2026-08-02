import { App, getAllTags, TFile } from 'obsidian';
import {
LayerRange,
SketchMatterImageDefinition,
SketchMatterObject,
SketchMatterSettings,
SketchMatterTypeDefinition,
SketchMatterViewDefinition,
RESOLVED_TEXTURE_PROPERTY,
} from './types';

export interface SketchMatterMetadataBundle {
	objects: SketchMatterObject[];
	views: SketchMatterViewDefinition[];
	imageDefinitions: Map<string, SketchMatterImageDefinition>;
}

function escapeRegExp(value: string): string {
return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTagPrefix(prefix: string): string {
return prefix.replace(/^#/, '');
}

function findTagSuffixes(tags: string[], prefix: string): string[] {
const normalizedPrefix = normalizeTagPrefix(prefix);
const matcher = new RegExp(`^${escapeRegExp(normalizedPrefix)}(?:[:/](.+))?$`);
const matches: string[] = [];

for (const tag of tags) {
	const normalizedTag = tag.replace(/^#/, '');
	const match = normalizedTag.match(matcher);
	if (match) {
		matches.push(match[1] ?? '');
	}
}

return matches;
}

function findTagSuffix(tags: string[], prefix: string): string | null {
return findTagSuffixes(tags, prefix)[0] ?? null;
}

function parseImageIds(raw: unknown): string[] {
if (raw == null) {
return [];
}

if (Array.isArray(raw)) {
return raw.map((item) => String(item).trim()).filter(Boolean);
}

if (typeof raw === 'string') {
		return raw
			.split(/[\r\n,]+/g)
		.map((item) => item.trim())
		.filter(Boolean);
}

if (typeof raw === 'number' || typeof raw === 'boolean') {
	return [String(raw)];
}

return [];
}

function parseLayerNumber(raw: unknown): number | undefined {
if (typeof raw === 'number' && Number.isFinite(raw)) {
	return Math.trunc(raw);
}

if (typeof raw === 'string' && raw.trim().length > 0) {
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isNaN(parsed)) {
		return parsed;
	}
}

return undefined;
}

function parseLayerValue(
rawFrontmatter: Record<string, unknown>,
typeName: string,
settings: SketchMatterSettings,
typeDefinitions: Map<string, SketchMatterTypeDefinition>,
): number {
const typeDef = typeDefinitions.get(typeName);
const typeLayerProperty = typeDef?.layerOverrideProperty?.trim();
if (typeLayerProperty) {
	const overrideLayer = parseLayerNumber(rawFrontmatter[typeLayerProperty]);
	if (overrideLayer != null) {
		return overrideLayer;
	}
}

const sharedLayer = parseLayerNumber(rawFrontmatter[settings.layerProperty]);
if (sharedLayer != null) {
	return sharedLayer;
}

if (typeDef?.defaultLayer != null) {
	return typeDef.defaultLayer;
}

return settings.defaultLayer;
}

function parseCoordinates(raw: unknown): unknown {
if (raw == null) {
return null;
}

if (Array.isArray(raw)) {
return raw;
}

if (typeof raw === 'string') {
const trimmed = raw.trim();
if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
try {
return JSON.parse(trimmed);
} catch {
return trimmed;
}
}

return trimmed;
}

return raw;
}

function parsePositiveNumber(raw: unknown): number | undefined {
if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
return raw;
}

if (typeof raw === 'string' && raw.trim().length > 0) {
const parsed = Number.parseFloat(raw);
if (Number.isFinite(parsed) && parsed > 0) {
return parsed;
}
}

return undefined;
}

function stripWikiLinkDecorators(raw: string): string {
const trimmed = raw.trim();
const withoutBrackets = trimmed.match(/^\[\[(.*)\]\]$/)?.[1] ?? trimmed;
return withoutBrackets.split('|')[0]?.trim() ?? '';
}

function hasUriScheme(value: string): boolean {
return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) || value.startsWith('//');
}

function resolveAssetSource(
app: App,
definitionPath: string,
raw: unknown,
): string | undefined {
if (typeof raw !== 'string') {
	return undefined;
}

const source = raw.trim();
if (!source) {
	return undefined;
}

if (hasUriScheme(source)) {
	return source;
}

const candidate = stripWikiLinkDecorators(source);
if (!candidate || hasUriScheme(candidate)) {
	return source;
}

const linkedFile = app.metadataCache.getFirstLinkpathDest(candidate, definitionPath);
if (linkedFile) {
	return app.vault.getResourcePath(linkedFile);
}

const fileByPath = app.vault.getAbstractFileByPath(candidate);
if (fileByPath instanceof TFile) {
	return app.vault.getResourcePath(fileByPath);
}

return source;
}

export function collectSketchMatterTypeDefinitions(settings: SketchMatterSettings): Map<string, SketchMatterTypeDefinition> {
const result = new Map<string, SketchMatterTypeDefinition>();

for (const definition of settings.typeDefinitions) {
	if (!definition.name.trim()) {
		continue;
	}

	result.set(definition.name, definition);
}

return result;
}

function getCachedMarkdownFiles(app: App): TFile[] {
	type MetadataCacheWithCachedFiles = {
		getCachedFiles: () => string[];
	};

	const metadataCache = app.metadataCache as App['metadataCache'] & Partial<MetadataCacheWithCachedFiles>;
	const cachedPaths = (typeof metadataCache.getCachedFiles === 'function')
		? metadataCache.getCachedFiles()
		: Array.from(
			new Set([
				...Object.keys(app.metadataCache.resolvedLinks),
				...Object.keys(app.metadataCache.unresolvedLinks),
			]),
		);

	const files: TFile[] = [];
	for (const path of cachedPaths) {
		const file = app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile && file.extension === 'md') {
			files.push(file);
		}
	}

	return files;
}

	export function collectSketchMatterMetadata(app: App, settings: SketchMatterSettings): SketchMatterMetadataBundle {
		const typeDefinitions = collectSketchMatterTypeDefinitions(settings);
		const objects: SketchMatterObject[] = [];
		const views: SketchMatterViewDefinition[] = [];
		const imageDefinitions = new Map<string, SketchMatterImageDefinition>();

		for (const file of getCachedMarkdownFiles(app)) {
			const cache = app.metadataCache.getFileCache(file);
			if (!cache?.frontmatter) {
				continue;
			}

			const tags = getAllTags(cache) ?? [];
			const typeNames = findTagSuffixes(tags, settings.typeTagPrefix).filter((typeName) => typeName.length > 0);
			const viewSuffix = findTagSuffix(tags, settings.viewDefinitionTagPrefix);
			const imageSuffix = findTagSuffix(tags, settings.imageDefinitionTagPrefix);

			if (typeNames.length === 0 && viewSuffix === null && imageSuffix === null) {
				continue;
			}

			const raw = cache.frontmatter;

			if (typeNames.length > 0) {
				const resolvedTexture = resolveAssetSource(app, file.path, raw[settings.textureProperty]);
				const properties: Record<string, unknown> = {
					...raw,
				};
				if (resolvedTexture) {
					properties[RESOLVED_TEXTURE_PROPERTY] = resolvedTexture;
				}

				for (const [index, typeName] of typeNames.entries()) {
					const typeDefinition = typeDefinitions.get(typeName);
					const coordinatesProperty = typeDefinition?.useLabelCoordinates
						? settings.labelCoordinatesProperty
						: settings.coordinatesProperty;
					const object: SketchMatterObject = {
						objectId: `${file.path}::${typeName}::${index}`,
						sourcePath: file.path,
						file,
						typeName,
						layer: parseLayerValue(raw, typeName, settings, typeDefinitions),
						coordinates: parseCoordinates(raw[coordinatesProperty]),
						coordinatesProperty,
						imageIds: parseImageIds(raw[settings.imageIdProperty]),
						properties,
					};

					objects.push(object);
				}
			}

			if (viewSuffix !== null) {
				const id = file.path;
				const nameFromProperty: unknown = raw[settings.viewNameProperty];
				const name = (typeof nameFromProperty === 'string' && nameFromProperty.trim().length > 0)
					? nameFromProperty.trim()
					: (viewSuffix.length > 0 ? viewSuffix : file.basename);

				views.push({
					id,
					name,
					imageIds: parseImageIds(raw[settings.viewImageIdsProperty]),
					includeLayers: parseConfiguredLayerRanges(raw, settings.viewIncludeLayersProperty, 'includeLayers'),
					excludeLayers: parseConfiguredLayerRanges(raw, settings.viewExcludeLayersProperty, 'excludeLayers'),
					includeImageIds: parseImageIds(raw.includeImageIds),
					excludeImageIds: parseImageIds(raw.excludeImageIds),
					properties: raw,
				});
			}

			if (imageSuffix !== null) {
				const imageIds = parseImageIds(raw[settings.imageIdProperty]);
				if (imageIds.length > 0) {
					const backgroundColorRaw: unknown = raw[settings.imageBackgroundColorProperty];
					const backgroundImageRaw: unknown = raw[settings.imageBackgroundImageProperty];
					const preserveAspectRatioRaw: unknown = raw[settings.imagePreserveAspectRatioProperty];

					const baseDefinition = {
						name: file.basename,
						width: parsePositiveNumber(raw[settings.imageWidthProperty]),
						height: parsePositiveNumber(raw[settings.imageHeightProperty]),
						backgroundColor: typeof backgroundColorRaw === 'string' ? backgroundColorRaw.trim() || undefined : undefined,
						backgroundImage: resolveAssetSource(app, file.path, backgroundImageRaw),
						preserveAspectRatio:
						typeof preserveAspectRatioRaw === 'string' ? preserveAspectRatioRaw.trim() || undefined : undefined,
						properties: raw,
					};

					for (const id of imageIds) {
						imageDefinitions.set(id, { ...baseDefinition, id });
					}
				}
			}
		}

		return {
			objects,
			views,
			imageDefinitions,
		};
	}

export function collectSketchMatterObjects(app: App, settings: SketchMatterSettings): SketchMatterObject[] {
		return collectSketchMatterMetadata(app, settings).objects;
}

function parseLayerRangeEntry(raw: unknown): LayerRange[] {
if (raw == null) {
return [];
}

const entries = Array.isArray(raw) ? raw : [raw];
const result: LayerRange[] = [];

for (const entry of entries) {
const value = String(entry).trim();
if (!value.length) {
continue;
}

const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
for (const part of parts) {
const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
if (rangeMatch) {
const min = Number.parseInt(rangeMatch[1] ?? '0', 10);
const max = Number.parseInt(rangeMatch[2] ?? '0', 10);
result.push({ min: Math.min(min, max), max: Math.max(min, max) });
continue;
}

const singleMatch = part.match(/^(\d+)$/);
if (singleMatch) {
const valueNumber = Number.parseInt(singleMatch[1] ?? '0', 10);
result.push({ min: valueNumber, max: valueNumber });
}
}
}

return result;
}

function parseConfiguredLayerRanges(
	frontmatter: Record<string, unknown>,
	configuredKey: string,
	legacyKey: string,
): LayerRange[] {
	const configured = parseLayerRangeEntry(frontmatter[configuredKey]);
	if (configured.length > 0) {
		return configured;
	}

	if (configuredKey === legacyKey) {
		return configured;
	}

	return parseLayerRangeEntry(frontmatter[legacyKey]);
}

export function collectSketchMatterViewDefinitions(app: App, settings: SketchMatterSettings): SketchMatterViewDefinition[] {
	return collectSketchMatterMetadata(app, settings).views;
}

export function collectSketchMatterImageDefinitions(app: App, settings: SketchMatterSettings): Map<string, SketchMatterImageDefinition> {
	return collectSketchMatterMetadata(app, settings).imageDefinitions;
}

function isLayerInRanges(layer: number, ranges: LayerRange[]): boolean {
return ranges.some((range) => layer >= range.min && layer <= range.max);
}

/**
 * Collect all unique image IDs across the given objects.
 */
export function collectAllImageIds(objects: SketchMatterObject[]): string[] {
const ids = new Set<string>();
for (const object of objects) {
for (const id of object.imageIds) {
ids.add(id);
}
}
return Array.from(ids).sort();
}

/**
 * Filter objects to only those that belong to the specified image ID.
 * If imageId is null or empty, returns all objects.
 */
export function filterByImageId(objects: SketchMatterObject[], imageId: string | null): SketchMatterObject[] {
if (!imageId) {
return objects;
}
return objects.filter((object) => object.imageIds.includes(imageId));
}

export function filterSketchMatterObjects(objects: SketchMatterObject[], viewDefinition: SketchMatterViewDefinition | null): SketchMatterObject[] {
if (!viewDefinition) {
return objects;
}

return objects.filter((object) => {
if (viewDefinition.excludeLayers.length > 0 && isLayerInRanges(object.layer, viewDefinition.excludeLayers)) {
return false;
}

if (viewDefinition.includeLayers.length > 0 && !isLayerInRanges(object.layer, viewDefinition.includeLayers)) {
return false;
}

if (viewDefinition.includeImageIds.length > 0) {
if (object.imageIds.length === 0) {
return false;
}

if (!object.imageIds.some((id) => viewDefinition.includeImageIds.includes(id))) {
return false;
}
}

if (viewDefinition.excludeImageIds.length > 0 && object.imageIds.some((id) => viewDefinition.excludeImageIds.includes(id))) {
return false;
}

return true;
});
}
