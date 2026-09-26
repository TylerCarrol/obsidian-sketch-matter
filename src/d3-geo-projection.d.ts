declare module 'd3-geo-projection' {
	import type { GeoProjection } from 'd3-geo';

	export interface GeoCylindricalEqualAreaProjection extends GeoProjection {
		parallel(): number;
		parallel(value: number): this;
	}

	export function geoCylindricalEqualArea(): GeoCylindricalEqualAreaProjection;
	export function geoMiller(): GeoProjection;
	export function geoMollweide(): GeoProjection;
	export function geoRobinson(): GeoProjection;
	export function geoWinkel3(): GeoProjection;
}