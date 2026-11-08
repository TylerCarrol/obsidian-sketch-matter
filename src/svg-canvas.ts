export interface SvgCanvasBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Measure rendered geometry, including child transforms, in SVG coordinates. */
export function expandSvgCanvas(svg: SVGSVGElement): SvgCanvasBounds {
	const [x = 0, y = 0, width = 1200, height = 900] =
		(svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
	let minX = x;
	let minY = y;
	let maxX = x + width;
	let maxY = y + height;
	const parent = svg.parentNode;
	const nextSibling = svg.nextSibling;
	let measurementHost: HTMLDivElement | null = null;

	if (!svg.isConnected) {
		measurementHost = svg.ownerDocument.createElement('div');
		measurementHost.classList.add('sketchmatter-canvas-measurement');
		measurementHost.appendChild(svg);
		svg.ownerDocument.body.appendChild(measurementHost);
	}

	try {
		for (const layer of Array.from(svg.querySelectorAll<SVGGElement>(':scope > g[data-sketchmatter-layer]'))) {
			if (layer.children.length === 0) continue;
			const box = layer.getBBox();
			let padding = 0;
			for (const element of Array.from(layer.querySelectorAll<SVGElement>('*'))) {
				const stroke = element.getAttribute('stroke');
				const strokeWidth = stroke && stroke !== 'none' && stroke !== 'transparent'
					? Number.parseFloat(element.getAttribute('stroke-width') ?? '1')
					: 0;
				// getBBox excludes strokes and filter overflow in Chromium.
				const lineJoin = element.getAttribute('stroke-linejoin') ?? 'miter';
				const miterLimit = Number(element.getAttribute('stroke-miterlimit') ?? 4);
				const strokeExtent = lineJoin === 'miter' ? Math.max(1, miterLimit) : Math.SQRT2;
				let elementPadding = Number.isFinite(strokeWidth) ? strokeWidth / 2 * strokeExtent : 0;
				const filterId = element.getAttribute('filter')?.match(/^url\(#(.+)\)$/)?.[1];
				if (filterId) {
					const filter = svg.querySelector(`#${filterId}`);
					for (const blur of Array.from(filter?.querySelectorAll('feGaussianBlur') ?? [])) {
						elementPadding += 3 * Number(blur.getAttribute('stdDeviation') ?? 0);
					}
				}
				padding = Math.max(padding, elementPadding);
			}
			if (![box.x, box.y, box.width, box.height, padding].every(Number.isFinite)) {
				throw new Error('Cannot determine SVG canvas bounds');
			}
			minX = Math.min(minX, box.x - padding);
			minY = Math.min(minY, box.y - padding);
			maxX = Math.max(maxX, box.x + box.width + padding);
			maxY = Math.max(maxY, box.y + box.height + padding);
		}
	} finally {
		if (measurementHost) {
			if (parent) parent.insertBefore(svg, nextSibling);
			else svg.remove();
			measurementHost.remove();
		}
	}

	const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
	svg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
	svg.setAttribute('width', String(bounds.width));
	svg.setAttribute('height', String(bounds.height));
	return bounds;
}
