import { describe, expect, it } from 'vitest';
import {
	latitudeToEquirectangularV,
	latitudeToMercatorV,
	MAP_PROJECTIONS,
	parseMapProjection,
	resolveMapProjection,
	createSourceProjectionMapper,
	sourceVForLatitude,
	WEB_MERCATOR_MAX_LATITUDE,
} from '../globe/projection';
import type { SketchMatterImageDefinition } from '../types';

describe('map projections', () => {
	it('parses supported projection names case-insensitively', () => {
		expect(parseMapProjection(' EQUIRECTANGULAR ')).toBe('equirectangular');
		expect(parseMapProjection('Mercator')).toBe('mercator');
		expect(parseMapProjection('Miller')).toBe('miller');
		expect(parseMapProjection('Gall-Peters')).toBe('gall-peters');
		expect(parseMapProjection('Mollweide')).toBe('mollweide');
		expect(parseMapProjection('Robinson')).toBe('robinson');
		expect(parseMapProjection('Winkel-Tripel')).toBe('winkel-tripel');
		expect(parseMapProjection('orthographic')).toBeUndefined();
	});

	it('defines each projection exactly once', () => {
		expect(new Set(MAP_PROJECTIONS.map(({ id }) => id)).size).toBe(MAP_PROJECTIONS.length);
		expect(MAP_PROJECTIONS).toHaveLength(7);
	});

	it('resolves explicit, image, and default projections in precedence order', () => {
		const imageDefinition: SketchMatterImageDefinition = {
			id: 'earth',
			name: 'Earth',
			projection: 'mercator',
			properties: {},
		};

		expect(resolveMapProjection('equirectangular', imageDefinition, 'mercator')).toBe('equirectangular');
		expect(resolveMapProjection(undefined, imageDefinition, 'equirectangular')).toBe('mercator');
		expect(resolveMapProjection(undefined, null, 'equirectangular')).toBe('equirectangular');
	});

	it('maps latitude to top-to-bottom source coordinates', () => {
		expect(latitudeToEquirectangularV(90)).toBe(0);
		expect(latitudeToEquirectangularV(0)).toBe(0.5);
		expect(latitudeToEquirectangularV(-90)).toBe(1);
		expect(latitudeToMercatorV(0)).toBeCloseTo(0.5);
		expect(latitudeToMercatorV(WEB_MERCATOR_MAX_LATITUDE)).toBeCloseTo(0);
		expect(latitudeToMercatorV(-WEB_MERCATOR_MAX_LATITUDE)).toBeCloseTo(1);
	});

	it('clamps Mercator polar caps to the nearest source edge', () => {
		expect(sourceVForLatitude(90, 'mercator')).toBeCloseTo(0);
		expect(sourceVForLatitude(-90, 'mercator')).toBeCloseTo(1);
	});

	it.each(MAP_PROJECTIONS.map(({ id }) => id))(
		'centers and orients the %s source projection',
		(projection) => {
			const mapper = createSourceProjectionMapper(projection, 1000, 500);
			const center = mapper.map(0, 0);
			const east = mapper.map(90, 0);
			const west = mapper.map(-90, 0);
			const north = mapper.map(0, 45);
			const south = mapper.map(0, -45);

			expect(center?.[0]).toBeCloseTo(500, 4);
			expect(center?.[1]).toBeCloseTo(250, 4);
			expect(east?.[0]).toBeGreaterThan(center?.[0] ?? Infinity);
			expect(west?.[0]).toBeLessThan(center?.[0] ?? -Infinity);
			expect(north?.[1]).toBeLessThan(center?.[1] ?? -Infinity);
			expect(south?.[1]).toBeGreaterThan(center?.[1] ?? Infinity);
		},
	);

	it('preserves the existing normalized Mercator mapping', () => {
		const mapper = createSourceProjectionMapper('mercator', 1000, 500);
		expect(mapper.map(0, 0)).toEqual([500, 250]);
		expect(mapper.map(180, WEB_MERCATOR_MAX_LATITUDE)?.[1]).toBeCloseTo(0);
		expect(mapper.map(-180, -WEB_MERCATOR_MAX_LATITUDE)?.[1]).toBeCloseTo(500);
	});

	it.each(['miller', 'gall-peters', 'mollweide', 'robinson', 'winkel-tripel'] as const)(
		'fits %s reference points inside the source canvas',
		(projection) => {
			const mapper = createSourceProjectionMapper(projection, 1000, 500);
			for (const point of [[-179.9, 0], [179.9, 0], [0, 89.9], [0, -89.9]] as const) {
				const mapped = mapper.map(...point);
				expect(mapped).not.toBeNull();
				expect(mapped?.[0]).toBeGreaterThanOrEqual(0);
				expect(mapped?.[0]).toBeLessThanOrEqual(1000);
				expect(mapped?.[1]).toBeGreaterThanOrEqual(0);
				expect(mapped?.[1]).toBeLessThanOrEqual(500);
			}
		},
	);
});