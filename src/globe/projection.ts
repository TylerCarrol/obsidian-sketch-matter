import type { MapProjection, SketchMatterImageDefinition } from '../types';
import type { GeoPermissibleObjects, GeoProjection } from 'd3-geo';
import {
	geoCylindricalEqualArea,
	geoMiller,
	geoMollweide,
	geoRobinson,
	geoWinkel3,
} from 'd3-geo-projection';

export const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
const ANTIMERIDIAN_EPSILON = 1e-7;
const SPHERE: GeoPermissibleObjects = { type: 'Sphere' };

export type ProjectionSamplingStrategy = 'direct' | 'scanline' | 'pseudocylindrical' | 'general';

export interface MapProjectionDescriptor {
	id: MapProjection;
	label: string;
	samplingStrategy: ProjectionSamplingStrategy;
}

export interface SourceProjectionMapper {
	readonly samplingStrategy: ProjectionSamplingStrategy;
	map(longitude: number, latitude: number): [number, number] | null;
}

export const MAP_PROJECTIONS: readonly MapProjectionDescriptor[] = [
	{ id: 'equirectangular', label: 'Equirectangular', samplingStrategy: 'direct' },
	{ id: 'mercator', label: 'Mercator', samplingStrategy: 'scanline' },
	{ id: 'miller', label: 'Miller cylindrical', samplingStrategy: 'scanline' },
	{ id: 'gall-peters', label: 'Gall–Peters', samplingStrategy: 'scanline' },
	{ id: 'mollweide', label: 'Mollweide', samplingStrategy: 'pseudocylindrical' },
	{ id: 'robinson', label: 'Robinson', samplingStrategy: 'pseudocylindrical' },
	{ id: 'winkel-tripel', label: 'Winkel Tripel', samplingStrategy: 'general' },
];

const MAP_PROJECTION_IDS = new Set<MapProjection>(MAP_PROJECTIONS.map(({ id }) => id));

export function parseMapProjection(value: unknown): MapProjection | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const normalized = value.trim().toLowerCase();
	return MAP_PROJECTION_IDS.has(normalized as MapProjection)
		? normalized as MapProjection
		: undefined;
}

export function resolveMapProjection(
	override: unknown,
	imageDefinition: SketchMatterImageDefinition | null,
	fallback: MapProjection,
): MapProjection {
	return parseMapProjection(override) ?? imageDefinition?.projection ?? fallback;
}

export function latitudeToEquirectangularV(latitude: number): number {
	const clampedLatitude = Math.max(-90, Math.min(90, latitude));
	return (90 - clampedLatitude) / 180;
}

export function latitudeToMercatorV(latitude: number): number {
	const clampedLatitude = Math.max(
		-WEB_MERCATOR_MAX_LATITUDE,
		Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude),
	);
	const radians = clampedLatitude * Math.PI / 180;
	return (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
}

export function sourceVForLatitude(latitude: number, projection: MapProjection): number {
	return projection === 'mercator'
		? latitudeToMercatorV(latitude)
		: latitudeToEquirectangularV(latitude);
}

function createExtendedProjection(projection: MapProjection): GeoProjection {
	switch (projection) {
		case 'miller':
			return geoMiller();
		case 'gall-peters':
			return geoCylindricalEqualArea().parallel(45);
		case 'mollweide':
			return geoMollweide();
		case 'robinson':
			return geoRobinson();
		case 'winkel-tripel':
			return geoWinkel3();
		default:
			throw new Error(`No extended projection factory for ${projection}.`);
	}
}

function isFinitePoint(point: [number, number] | null): point is [number, number] {
	return point != null && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

export function createSourceProjectionMapper(
	projection: MapProjection,
	width: number,
	height: number,
): SourceProjectionMapper {
	const safeWidth = Math.max(1, width);
	const safeHeight = Math.max(1, height);
	const descriptor = MAP_PROJECTIONS.find(({ id }) => id === projection);
	if (!descriptor) {
		throw new Error(`Unsupported map projection: ${projection}`);
	}

	if (projection === 'equirectangular' || projection === 'mercator') {
		return {
			samplingStrategy: descriptor.samplingStrategy,
			map(longitude, latitude) {
				const clampedLongitude = Math.max(-180, Math.min(180, longitude));
				return [
					((clampedLongitude + 180) / 360) * safeWidth,
					sourceVForLatitude(latitude, projection) * safeHeight,
				];
			},
		};
	}

	const d3Projection = createExtendedProjection(projection)
		.center([0, 0])
		.rotate([0, 0, 0])
		.fitExtent([[0, 0], [safeWidth, safeHeight]], SPHERE);

	return {
		samplingStrategy: descriptor.samplingStrategy,
		map(longitude, latitude) {
			const boundedLongitude = Math.max(
				-180 + ANTIMERIDIAN_EPSILON,
				Math.min(180 - ANTIMERIDIAN_EPSILON, longitude),
			);
			const point = d3Projection([boundedLongitude, Math.max(-90, Math.min(90, latitude))]);
			if (!isFinitePoint(point)) {
				return null;
			}
			if (point[0] < 0 || point[0] > safeWidth || point[1] < 0 || point[1] > safeHeight) {
				return null;
			}
			return point;
		},
	};
}