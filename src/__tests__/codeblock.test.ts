import { describe, expect, it } from 'vitest';
import { parseCodeBlockParams } from '../codeblock';

describe('parseCodeBlockParams', () => {
	it('keeps existing code blocks in 2D mode', () => {
		expect(parseCodeBlockParams('image: Earth\nview: political')).toEqual({
			image: 'Earth',
			view: 'political',
			mode: '2d',
			projection: null,
		});
	});

	it('parses globe mode and supported projections case-insensitively', () => {
		expect(parseCodeBlockParams('mode: GLOBE\nprojection: Mercator')).toMatchObject({
			mode: 'globe',
			projection: 'mercator',
		});
	});

	it('parses extended source projections', () => {
		expect(parseCodeBlockParams('mode: globe\nprojection: Winkel-Tripel')).toMatchObject({
			mode: 'globe',
			projection: 'winkel-tripel',
		});
	});

	it('ignores unsupported modes and projections', () => {
		expect(parseCodeBlockParams('mode: terrain\nprojection: orthographic')).toMatchObject({
			mode: '2d',
			projection: null,
		});
	});
});