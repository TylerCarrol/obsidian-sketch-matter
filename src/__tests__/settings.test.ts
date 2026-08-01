import { describe, expect, it } from 'vitest';
import { buildTypeDefinitionStyle, getTypeDefinitionDescription } from '../settings';

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
});
