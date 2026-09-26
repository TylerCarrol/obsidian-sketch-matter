import type { MapProjection } from '../types';
import { createSourceProjectionMapper, SourceProjectionMapper } from './projection';
import { requestUrl } from 'obsidian';

const MAX_TEXTURE_WIDTH = 4096;
const MAX_GENERAL_TEXTURE_WIDTH = 2048;
const GENERAL_SAMPLER_ROWS_PER_CHUNK = 16;

export interface GlobeTextureDimensions {
	width: number;
	height: number;
}

export interface ScanlineSample {
	sourceX: number;
	sourceY: number;
	sourceWidth: number;
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new DOMException('Globe rendering was cancelled.', 'AbortError');
	}
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener('load', () => {
			if (typeof reader.result === 'string') {
				resolve(reader.result);
			} else {
				reject(new Error('Unable to encode image asset.'));
			}
		});
		reader.addEventListener('error', () => reject(reader.error ?? new Error('Unable to read image asset.')));
		reader.readAsDataURL(blob);
	});
}

async function loadImageAsset(href: string, signal: AbortSignal): Promise<Blob> {
	const protocol = new URL(href, window.location.href).protocol;
	if (protocol !== 'http:' && protocol !== 'https:') {
		const response = await window.fetch(href, { signal });
		if (!response.ok) {
			throw new Error(`Unable to load globe texture asset: ${href}`);
		}
		return response.blob();
	}

	const response = await requestUrl({ url: href, throw: false });
	throwIfAborted(signal);
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`Unable to load globe texture asset: ${href}`);
	}
	const contentType = response.headers['content-type'] ?? 'application/octet-stream';
	return new Blob([response.arrayBuffer], { type: contentType });
}

export async function inlineSvgImages(svgContent: string, signal: AbortSignal): Promise<string> {
	const document = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
	const parseError = document.querySelector('parsererror');
	if (parseError) {
		throw new Error('Unable to parse the rendered SVG for the globe texture.');
	}

	for (const image of Array.from(document.querySelectorAll('image'))) {
		throwIfAborted(signal);
		const href = image.getAttribute('href') ?? image.getAttribute('xlink:href');
		if (!href || href.startsWith('data:') || href.startsWith('#')) {
			continue;
		}

		image.setAttribute('href', await blobToDataUrl(await loadImageAsset(href, signal)));
		image.removeAttribute('xlink:href');
	}

	return new XMLSerializer().serializeToString(document.documentElement);
}

function loadSvgImage(svgContent: string, signal: AbortSignal): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		const objectUrl = URL.createObjectURL(new Blob([svgContent], { type: 'image/svg+xml' }));
		const cleanup = (): void => {
			URL.revokeObjectURL(objectUrl);
			signal.removeEventListener('abort', onAbort);
		};
		const onAbort = (): void => {
			cleanup();
			image.src = '';
			reject(new DOMException('Globe rendering was cancelled.', 'AbortError'));
		};

		image.addEventListener('load', () => {
			cleanup();
			resolve(image);
		}, { once: true });
		image.addEventListener('error', () => {
			cleanup();
			reject(new Error('Unable to decode the rendered SVG for the globe texture.'));
		}, { once: true });
		signal.addEventListener('abort', onAbort, { once: true });
		image.src = objectUrl;
	});
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
	const canvas = document.body.createEl('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

export function getGlobeTextureDimensions(
	sourceWidth: number,
	projection: MapProjection,
): GlobeTextureDimensions {
	const maximumWidth = projection === 'winkel-tripel'
		? MAX_GENERAL_TEXTURE_WIDTH
		: MAX_TEXTURE_WIDTH;
	const width = Math.max(2, Math.min(maximumWidth, Math.round(Math.max(1, sourceWidth))));
	return { width, height: Math.max(1, Math.round(width / 2)) };
}

export function createScanlineSample(
	mapper: SourceProjectionMapper,
	latitude: number,
): ScanlineSample | null {
	const west = mapper.map(-180, latitude);
	const center = mapper.map(0, latitude);
	const east = mapper.map(180, latitude);
	if (!west || !center || !east) {
		return null;
	}

	const sourceX = Math.min(west[0], east[0]);
	return {
		sourceX,
		sourceY: center[1],
		sourceWidth: Math.max(1, Math.abs(east[0] - west[0])),
	};
}

export function sampleBilinear(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
	x: number,
	y: number,
): [number, number, number, number] | null {
	if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > width || y > height) {
		return null;
	}

	const sampleX = Math.max(0, Math.min(width - 1, x - 0.5));
	const sampleY = Math.max(0, Math.min(height - 1, y - 0.5));
	const x0 = Math.floor(sampleX);
	const y0 = Math.floor(sampleY);
	const x1 = Math.min(width - 1, x0 + 1);
	const y1 = Math.min(height - 1, y0 + 1);
	const weightX = sampleX - x0;
	const weightY = sampleY - y0;
	const result: [number, number, number, number] = [0, 0, 0, 0];

	for (let channel = 0; channel < 4; channel++) {
		const topLeft = pixels[(y0 * width + x0) * 4 + channel] ?? 0;
		const topRight = pixels[(y0 * width + x1) * 4 + channel] ?? 0;
		const bottomLeft = pixels[(y1 * width + x0) * 4 + channel] ?? 0;
		const bottomRight = pixels[(y1 * width + x1) * 4 + channel] ?? 0;
		const top = topLeft + (topRight - topLeft) * weightX;
		const bottom = bottomLeft + (bottomRight - bottomLeft) * weightX;
		result[channel] = Math.round(top + (bottom - top) * weightY);
	}

	return result;
}

async function yieldToBrowser(signal: AbortSignal): Promise<void> {
	await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
	throwIfAborted(signal);
}

async function renderGeneralProjection(
	image: HTMLImageElement,
	output: HTMLCanvasElement,
	mapper: SourceProjectionMapper,
	sourceWidth: number,
	sourceHeight: number,
	signal: AbortSignal,
): Promise<void> {
	const source = createCanvas(sourceWidth, sourceHeight);
	const sourceContext = source.getContext('2d', { willReadFrequently: true });
	const outputContext = output.getContext('2d');
	if (!sourceContext || !outputContext) {
		throw new Error('Canvas rendering is unavailable.');
	}

	sourceContext.drawImage(image, 0, 0, sourceWidth, sourceHeight);
	const sourcePixels = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight).data;
	const outputImage = outputContext.createImageData(output.width, output.height);

	for (let targetY = 0; targetY < output.height; targetY++) {
		const latitude = 90 - ((targetY + 0.5) / output.height) * 180;
		for (let targetX = 0; targetX < output.width; targetX++) {
			const longitude = ((targetX + 0.5) / output.width) * 360 - 180;
			const sourcePoint = mapper.map(longitude, latitude);
			if (!sourcePoint) {
				continue;
			}
			const color = sampleBilinear(sourcePixels, sourceWidth, sourceHeight, sourcePoint[0], sourcePoint[1]);
			if (!color) {
				continue;
			}
			const targetIndex = (targetY * output.width + targetX) * 4;
			for (let channel = 0; channel < 4; channel++) {
				outputImage.data[targetIndex + channel] = color[channel] ?? 0;
			}
		}
		if ((targetY + 1) % GENERAL_SAMPLER_ROWS_PER_CHUNK === 0) {
			await yieldToBrowser(signal);
		}
	}

	outputContext.putImageData(outputImage, 0, 0);
}

export async function createGlobeTextureCanvas(
	svgContent: string,
	sourceWidth: number,
	sourceHeight: number,
	projection: MapProjection,
	signal: AbortSignal,
): Promise<HTMLCanvasElement> {
	throwIfAborted(signal);
	const inlinedSvg = await inlineSvgImages(svgContent, signal);
	const image = await loadSvgImage(inlinedSvg, signal);
	throwIfAborted(signal);

	const safeSourceWidth = Math.max(1, sourceWidth);
	const safeSourceHeight = Math.max(1, sourceHeight);
	const dimensions = getGlobeTextureDimensions(safeSourceWidth, projection);
	const output = createCanvas(dimensions.width, dimensions.height);
	const context = output.getContext('2d');
	if (!context) {
		throw new Error('Canvas rendering is unavailable.');
	}

	if (projection === 'equirectangular') {
		context.drawImage(image, 0, 0, safeSourceWidth, safeSourceHeight, 0, 0, output.width, output.height);
		return output;
	}

	const mapper = createSourceProjectionMapper(projection, safeSourceWidth, safeSourceHeight);
	if (mapper.samplingStrategy === 'general') {
		await renderGeneralProjection(
			image,
			output,
			mapper,
			Math.round(safeSourceWidth),
			Math.round(safeSourceHeight),
			signal,
		);
		return output;
	}

	for (let targetY = 0; targetY < output.height; targetY++) {
		const latitude = 90 - ((targetY + 0.5) / output.height) * 180;
		const sample = createScanlineSample(mapper, latitude);
		if (!sample) {
			continue;
		}
		context.drawImage(
			image,
			Math.max(0, sample.sourceX),
			Math.max(0, Math.min(safeSourceHeight - 1, sample.sourceY)),
			Math.min(safeSourceWidth - sample.sourceX, sample.sourceWidth),
			1,
			0,
			targetY,
			output.width,
			1,
		);
	}

	return output;
}