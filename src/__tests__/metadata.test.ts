import { describe, it, expect } from 'vitest';
import {
	collectSketchMatterTypeDefinitions,
	collectSketchMatterObjects,
	collectSketchMatterImageDefinitions,
	filterSketchMatterObjects,
	filterByImageId,
	collectAllImageIds,
} from '../metadata';
import { DEFAULT_SETTINGS, SketchMatterObject, SketchMatterViewDefinition } from '../types';
import { App, TFile } from '../__mocks__/obsidian';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(path: string): TFile {
	return new TFile(path);
}

function makeObject(
	overrides: Partial<SketchMatterObject> & { typeName: string },
): SketchMatterObject {
	return {
		objectId: overrides.typeName,
		sourcePath: 'test.md',
		file: makeFile('test.md'),
		typeName: overrides.typeName,
		layer: overrides.layer ?? 100,
		coordinates: overrides.coordinates ?? null,
		coordinatesProperty: 'sketchmatter-coordinates',
		imageIds: overrides.imageIds ?? [],
		properties: overrides.properties ?? {},
	};
}

function makeView(
	overrides: Partial<SketchMatterViewDefinition> = {},
): SketchMatterViewDefinition {
	return {
		id: 'view-1',
		name: 'Test View',
		includeLayers: overrides.includeLayers ?? [],
		excludeLayers: overrides.excludeLayers ?? [],
		includeImageIds: overrides.includeImageIds ?? [],
		excludeImageIds: overrides.excludeImageIds ?? [],
		properties: {},
	};
}

// ---------------------------------------------------------------------------
// collectSketchMatterTypeDefinitions
// ---------------------------------------------------------------------------

describe('collectSketchMatterTypeDefinitions', () => {
	it('returns a Map keyed by type name', () => {
		const result = collectSketchMatterTypeDefinitions(DEFAULT_SETTINGS);
		expect(result).toBeInstanceOf(Map);
		expect(result.has('continent')).toBe(true);
		expect(result.has('river')).toBe(true);
	});

	it('ignores type definitions with blank names', () => {
		const settings = {
			...DEFAULT_SETTINGS,
			typeDefinitions: [
				{ name: 'valid' },
				{ name: '   ' },
				{ name: '' },
			],
		};
		const result = collectSketchMatterTypeDefinitions(settings);
		expect(result.size).toBe(1);
		expect(result.has('valid')).toBe(true);
	});

	it('uses the last definition when duplicate names are present', () => {
		const settings = {
			...DEFAULT_SETTINGS,
			typeDefinitions: [
				{ name: 'duplicate', shape: 'polygon' },
				{ name: 'duplicate', shape: 'circle' },
			],
		};
		const result = collectSketchMatterTypeDefinitions(settings);
		expect(result.size).toBe(1);
		expect(result.get('duplicate')?.shape).toBe('circle');
	});

	it('returns an empty Map when typeDefinitions is empty', () => {
		const settings = { ...DEFAULT_SETTINGS, typeDefinitions: [] };
		const result = collectSketchMatterTypeDefinitions(settings);
		expect(result.size).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// collectAllImageIds
// ---------------------------------------------------------------------------

describe('collectAllImageIds', () => {
	it('returns sorted unique image IDs across all objects', () => {
		const objects = [
			makeObject({ typeName: 'a', imageIds: ['world', 'local'] }),
			makeObject({ typeName: 'b', imageIds: ['world', 'regional'] }),
			makeObject({ typeName: 'c', imageIds: [] }),
		];
		const ids = collectAllImageIds(objects);
		expect(ids).toEqual(['local', 'regional', 'world']);
	});

	it('returns an empty array when no objects have image IDs', () => {
		const objects = [
			makeObject({ typeName: 'a' }),
			makeObject({ typeName: 'b' }),
		];
		expect(collectAllImageIds(objects)).toEqual([]);
	});

	it('returns an empty array for an empty input', () => {
		expect(collectAllImageIds([])).toEqual([]);
	});

	it('preserves image IDs that contain spaces', () => {
		const files = [makeFile('fantasy-map-object.md')];
		const metadata = new Map([
			['fantasy-map-object.md', {
				frontmatter: {
					[DEFAULT_SETTINGS.coordinatesProperty]: [[0, 0], [1, 1]],
					[DEFAULT_SETTINGS.imageIdProperty]: 'Fantasy Map',
				},
				tags: [{ tag: `#${DEFAULT_SETTINGS.typeTagPrefix}/region` }],
			}],
		]);
		const app = new App(files, metadata);

		const objects = collectSketchMatterObjects(app, DEFAULT_SETTINGS);
		expect(objects).toHaveLength(1);
		expect(objects[0]?.imageIds).toEqual(['Fantasy Map']);
		expect(collectAllImageIds(objects)).toEqual(['Fantasy Map']);
	});

	it('splits image IDs only on commas or new lines', () => {
		const files = [makeFile('fantasy-map-image.md')];
		const metadata = new Map([
			['fantasy-map-image.md', {
				frontmatter: {
					[DEFAULT_SETTINGS.imageIdProperty]: 'Fantasy Map, Regional Map\nWorld Map',
				},
				tags: [{ tag: `#${DEFAULT_SETTINGS.imageDefinitionTagPrefix}` }],
			}],
		]);
		const app = new App(files, metadata);

		const definitions = collectSketchMatterImageDefinitions(app, DEFAULT_SETTINGS);
		expect(Array.from(definitions.keys())).toEqual([
			'Fantasy Map',
			'Regional Map',
			'World Map',
		]);
	});
});

// ---------------------------------------------------------------------------
// filterByImageId
// ---------------------------------------------------------------------------

describe('filterByImageId', () => {
	const objects = [
		makeObject({ typeName: 'a', imageIds: ['map1'] }),
		makeObject({ typeName: 'b', imageIds: ['map2'] }),
		makeObject({ typeName: 'c', imageIds: ['map1', 'map2'] }),
		makeObject({ typeName: 'd', imageIds: [] }),
	];

	it('returns all objects when imageId is null', () => {
		expect(filterByImageId(objects, null)).toHaveLength(4);
	});

	it('returns all objects when imageId is an empty string', () => {
		expect(filterByImageId(objects, '')).toHaveLength(4);
	});

	it('filters to only objects that include the given imageId', () => {
		const result = filterByImageId(objects, 'map1');
		expect(result.map((o) => o.typeName)).toEqual(['a', 'c']);
	});

	it('returns an empty array when no objects match', () => {
		expect(filterByImageId(objects, 'nonexistent')).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// filterSketchMatterObjects — no view (passthrough)
// ---------------------------------------------------------------------------

describe('filterSketchMatterObjects — no view definition', () => {
	it('returns all objects when viewDefinition is null', () => {
		const objects = [
			makeObject({ typeName: 'a', layer: 100 }),
			makeObject({ typeName: 'b', layer: 200 }),
		];
		expect(filterSketchMatterObjects(objects, null)).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// filterSketchMatterObjects — layer include / exclude filters
// ---------------------------------------------------------------------------

describe('filterSketchMatterObjects — layer filtering', () => {
	const objects = [
		makeObject({ typeName: 'l100', layer: 100 }),
		makeObject({ typeName: 'l200', layer: 200 }),
		makeObject({ typeName: 'l300', layer: 300 }),
		makeObject({ typeName: 'l400', layer: 400 }),
	];

	it('includes only objects in the specified layer range', () => {
		const view = makeView({ includeLayers: [{ min: 100, max: 200 }] });
		const result = filterSketchMatterObjects(objects, view);
		expect(result.map((o) => o.typeName)).toEqual(['l100', 'l200']);
	});

	it('excludes objects in the excluded layer range', () => {
		const view = makeView({ excludeLayers: [{ min: 200, max: 300 }] });
		const result = filterSketchMatterObjects(objects, view);
		expect(result.map((o) => o.typeName)).toEqual(['l100', 'l400']);
	});

	it('exclude takes precedence when object is in both include and exclude ranges', () => {
		const view = makeView({
			includeLayers: [{ min: 100, max: 300 }],
			excludeLayers: [{ min: 200, max: 200 }],
		});
		const result = filterSketchMatterObjects(objects, view);
		expect(result.map((o) => o.typeName)).toEqual(['l100', 'l300']);
	});

	it('returns no objects when include range matches nothing', () => {
		const view = makeView({ includeLayers: [{ min: 500, max: 600 }] });
		expect(filterSketchMatterObjects(objects, view)).toHaveLength(0);
	});

	it('handles a single-value range (min === max)', () => {
		const view = makeView({ includeLayers: [{ min: 300, max: 300 }] });
		const result = filterSketchMatterObjects(objects, view);
		expect(result.map((o) => o.typeName)).toEqual(['l300']);
	});
});

// ---------------------------------------------------------------------------
// filterSketchMatterObjects — imageId include / exclude filters
// ---------------------------------------------------------------------------

describe('filterSketchMatterObjects — imageId filtering', () => {
	const objects = [
		makeObject({ typeName: 'a', imageIds: ['world'] }),
		makeObject({ typeName: 'b', imageIds: ['local'] }),
		makeObject({ typeName: 'c', imageIds: ['world', 'local'] }),
		makeObject({ typeName: 'd', imageIds: [] }),
	];

	it('includes only objects with the specified imageId', () => {
		const view = makeView({ includeImageIds: ['world'] });
		const result = filterSketchMatterObjects(objects, view);
		expect(result.map((o) => o.typeName)).toEqual(['a', 'c']);
	});

	it('excludes objects with no imageIds when include filter is active', () => {
		const view = makeView({ includeImageIds: ['world'] });
		const result = filterSketchMatterObjects(objects, view);
		expect(result.every((o) => o.imageIds.length > 0)).toBe(true);
	});

	it('excludes objects whose imageId matches the exclude list', () => {
		const view = makeView({ excludeImageIds: ['local'] });
		const result = filterSketchMatterObjects(objects, view);
		expect(result.map((o) => o.typeName)).toEqual(['a', 'd']);
	});

	it('returns all objects when both include/exclude lists are empty', () => {
		const view = makeView();
		expect(filterSketchMatterObjects(objects, view)).toHaveLength(4);
	});
});

// ---------------------------------------------------------------------------
// collectSketchMatterObjects — layer overrides
// ---------------------------------------------------------------------------

describe('collectSketchMatterObjects — layer overrides', () => {
	it('uses the type-specific layer override property when present', () => {
		const files = [makeFile('northland.md')];
		const metadata = new Map([
			['northland.md', {
				frontmatter: {
					[DEFAULT_SETTINGS.layerProperty]: 100,
					'sketchmatter-label-layer': 920,
					[DEFAULT_SETTINGS.coordinatesProperty]: [[0, 0], [1, 1], [2, 2]],
					[DEFAULT_SETTINGS.labelCoordinatesProperty]: [[1, 1]],
				},
				tags: [
					{ tag: `#${DEFAULT_SETTINGS.typeTagPrefix}/continent` },
					{ tag: `#${DEFAULT_SETTINGS.typeTagPrefix}/label` },
				],
			}],
		]);
		const app = new App(files, metadata);

		const objects = collectSketchMatterObjects(app, DEFAULT_SETTINGS);
		expect(objects).toHaveLength(2);
		expect(objects.find((obj) => obj.typeName === 'continent')?.layer).toBe(100);
		expect(objects.find((obj) => obj.typeName === 'label')?.layer).toBe(920);
	});

	it('falls back to the shared layer property when no type override value exists', () => {
		const files = [makeFile('capital.md')];
		const metadata = new Map([
			['capital.md', {
				frontmatter: {
					[DEFAULT_SETTINGS.layerProperty]: 520,
					[DEFAULT_SETTINGS.coordinatesProperty]: [[3, 4]],
					[DEFAULT_SETTINGS.labelCoordinatesProperty]: [[4, 5]],
				},
				tags: [
					{ tag: `#${DEFAULT_SETTINGS.typeTagPrefix}/city` },
					{ tag: `#${DEFAULT_SETTINGS.typeTagPrefix}/label` },
				],
			}],
		]);
		const app = new App(files, metadata);

		const objects = collectSketchMatterObjects(app, DEFAULT_SETTINGS);
		expect(objects).toHaveLength(2);
		expect(objects.every((obj) => obj.layer === 520)).toBe(true);
	});
});
