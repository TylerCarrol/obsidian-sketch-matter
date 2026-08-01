import { App, Plugin } from 'obsidian';
import { SketchMatterObject, SketchMatterSettings } from './types';
import {
	collectSketchMatterObjects,
	collectSketchMatterTypeDefinitions,
	collectSketchMatterViewDefinitions,
	collectSketchMatterImageDefinitions,
	filterByImageId,
	filterSketchMatterObjects,
} from './metadata';
import { renderSvgPreview } from './renderer';

type SketchMatterPluginLike = Plugin & { settings: SketchMatterSettings };

interface CodeBlockParams {
	image: string | null;
	view: string | null;
}

function parseCodeBlockParams(source: string): CodeBlockParams {
	const params: CodeBlockParams = { image: null, view: null };

	for (const line of source.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}

		const match = trimmed.match(/^(\w+)\s*:\s*(.+)$/);
		if (match) {
			const key = match[1]?.toLowerCase();
			const value = match[2]?.trim();
			if (key === 'image' && value) {
				params.image = value;
			} else if (key === 'view' && value) {
				params.view = value;
			}
		}
	}

	return params;
}

/**
 * Register the `sketch-matter` code block processor on the plugin.
 * Usage in a note:
 * ```sketch-matter
 * image: map1
 * view: political
 * ```
 */
export function registerCodeBlockProcessor(plugin: SketchMatterPluginLike): void {
	plugin.registerMarkdownCodeBlockProcessor('sketch-matter', (source, el) => {
		renderCodeBlock(plugin.app, plugin.settings, source, el);
	});
}

function renderCodeBlock(
	app: App,
	settings: SketchMatterSettings,
	source: string,
	container: HTMLElement,
): void {
	const params = parseCodeBlockParams(source);

	const objects = collectSketchMatterObjects(app, settings);
	const typeDefinitions = collectSketchMatterTypeDefinitions(settings);
	const views = collectSketchMatterViewDefinitions(app, settings);
	const imageDefinitions = collectSketchMatterImageDefinitions(app, settings);

	const selectedView = params.view
		? views.find((v) => v.name.toLowerCase() === params.view?.toLowerCase()) ?? null
		: null;

	let filteredObjects = filterSketchMatterObjects(objects, selectedView);
	filteredObjects = filterByImageId(filteredObjects, params.image);
	const resolvedImageId = resolveImageId(params.image, selectedView?.includeImageIds, filteredObjects);
	const imageDefinition =
		resolvedImageId != null ? (imageDefinitions.get(resolvedImageId) ?? null) : null;

	container.addClass('sketchmatter-embed');
	renderSvgPreview(
		container,
		filteredObjects,
		typeDefinitions,
		settings.layerRenderOrder,
		settings,
		imageDefinition,
	);
}

function resolveImageId(
	imageId: string | null,
	viewImageIds: string[] | undefined,
	objects: SketchMatterObject[],
): string | null {
	if (imageId) {
		return imageId;
	}

	if ((viewImageIds?.length ?? 0) === 1) {
		return viewImageIds?.[0] ?? null;
	}

	const ids = new Set<string>();
	for (const object of objects) {
		for (const id of object.imageIds) {
			ids.add(id);
		}
	}

	if (ids.size === 1) {
		return Array.from(ids)[0] ?? null;
	}

	return null;
}
