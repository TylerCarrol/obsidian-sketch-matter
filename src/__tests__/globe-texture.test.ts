import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createScanlineSample,
	getGlobeTextureDimensions,
	inlineSvgImages,
	sampleBilinear,
} from '../globe/texture';
import { createSourceProjectionMapper } from '../globe/projection';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('globe texture assets', () => {
	it('loads Obsidian app-protocol images through the browser resource loader', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
			ok: true,
			blob: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })),
		} as Response);
		vi.stubGlobal('fetch', fetchMock);

		const result = await inlineSvgImages(
			'<svg xmlns="http://www.w3.org/2000/svg"><image href="app://local/background.png" /></svg>',
			new AbortController().signal,
		);

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(fetchMock.mock.calls[0]?.[0]).toBe('app://local/background.png');
		expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
		expect(result).toContain('href="data:image/png;base64,');
	});

	it('caps general projection textures below scanline textures', () => {
		expect(getGlobeTextureDimensions(5000, 'mollweide')).toEqual({ width: 4096, height: 2048 });
		expect(getGlobeTextureDimensions(5000, 'winkel-tripel')).toEqual({ width: 2048, height: 1024 });
	});

	it('narrows Mollweide scanlines toward the poles', () => {
		const mapper = createSourceProjectionMapper('mollweide', 1000, 500);
		const equator = createScanlineSample(mapper, 0);
		const highLatitude = createScanlineSample(mapper, 80);

		expect(equator).not.toBeNull();
		expect(highLatitude).not.toBeNull();
		expect(highLatitude?.sourceWidth).toBeLessThan(equator?.sourceWidth ?? 0);
	});

	it('bilinearly interpolates color and alpha channels', () => {
		const pixels = new Uint8ClampedArray([
			0, 0, 0, 0,
			100, 0, 0, 100,
			0, 100, 0, 100,
			100, 100, 0, 200,
		]);

		expect(sampleBilinear(pixels, 2, 2, 1, 1)).toEqual([50, 50, 0, 100]);
		expect(sampleBilinear(pixels, 2, 2, -1, 1)).toBeNull();
	});
});