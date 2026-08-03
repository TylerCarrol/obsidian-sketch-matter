import { describe, expect, it } from 'vitest';
import {
	buildTypeDefinitionStyle,
	formatCompositeChildCoordinates,
	formatCompositeChildLabel,
	getTypeDefinitionDescription,
	parseCompositeChildCoordinates,
} from '../settings';

describe('getTypeDefinitionDescription', () => {
	it('includes the current type name in the example tag', () => {
		expect(getTypeDefinitionDescription('sketchmatter-type', 'continent')).toContain('sketchmatter-type/continent');
	});

	it('falls back to a placeholder when the type name is blank', () => {
		expect(getTypeDefinitionDescription('sketchmatter-type', '   ')).toContain('sketchmatter-type/<type-name>');
	});

	it('adds explicit style fields while preserving advanced properties', () => {
		expect(
			buildTypeDefinitionStyle(
				{ fill: '#000', opacity: 0.5, filter: 'url(#shadow)' },
				{ fill: '#fff', stroke: '#222', strokeWidth: '2', opacity: null },
			),
		).toEqual({ fill: '#fff', stroke: '#222', strokeWidth: '2', filter: 'url(#shadow)' });
	});

	it('returns undefined when all explicit style fields are empty', () => {
		expect(buildTypeDefinitionStyle({ fill: '#000' }, { fill: null, stroke: null, strokeWidth: null, opacity: null })).toBeUndefined();
	});

	it('formats composite child coordinates for the settings textarea', () => {
		expect(formatCompositeChildCoordinates(['10, 20', '30, 40'])).toBe('10, 20\n30, 40');
		expect(formatCompositeChildCoordinates([100, 200])).toBe('100, 200');
	});

	it('parses composite child coordinates from textarea lines', () => {
		expect(parseCompositeChildCoordinates('')).toBeUndefined();
		expect(parseCompositeChildCoordinates('100, 200')).toBe('100, 200');
		expect(parseCompositeChildCoordinates('100, 200\n150, 250')).toEqual(['100, 200', '150, 250']);
	});

	it('formats composite child labels from names and shapes', () => {
		expect(formatCompositeChildLabel({ name: 'Roof', shape: 'polygon' }, 0)).toBe('1. Roof (polygon)');
		expect(formatCompositeChildLabel({ name: 'Roof', shape: '' }, 0)).toBe('1. Roof');
		expect(formatCompositeChildLabel({ shape: 'circle' }, 1)).toBe('2. circle');
	});
});
