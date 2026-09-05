import { SvgShape, ShapeRenderContext, ShapeStyle, createSvgElement, toCoordinatePairs } from './base';

function readProperty(properties: Record<string, unknown>, ...keys: string[]): unknown {
	for (const key of keys) {
		if (key && properties[key] !== undefined) {
			return properties[key];
		}
	}
	return undefined;
}

function toStringList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((entry) => String(entry).trim().toLowerCase())
			.filter(Boolean);
	}
	if (typeof value === 'string') {
		return value
			.split(/[\n,]+/g)
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean);
	}
	return [];
}

/**
 * Renders text at a given position.
 * Coordinates should be a single point [x, y].
 * The text content is taken from the object's `text` or `label` property,
 * falling back to the note's file basename.
 */
export class TextShape extends SvgShape {
	readonly name = 'text';

	createElements(context: ShapeRenderContext): SVGElement[] | null {
		const points = toCoordinatePairs(context.coordinates);
		const x = points && points.length > 0 ? points[0]![0] : 10;
		const y = points && points.length > 0 ? points[0]![1] : 20;

		const textContent = this.resolveTextContent(context);

		const text = createSvgElement('text');
		text.setAttribute('x', String(x));
		text.setAttribute('y', String(y));
		text.textContent = textContent;
		this.applyRotation(text, context, x, y);

		const properties = context.object.properties;
		const fontSize = readProperty(
			properties,
			context.settings.fontSizeProperty,
			'fontSize',
			'font-size',
		);
		if (typeof fontSize === 'string' || typeof fontSize === 'number') {
			text.setAttribute('font-size', String(fontSize));
		}

		const fontFamily = readProperty(
			properties,
			context.settings.fontFamilyProperty,
			'fontFamily',
			'font-family',
		);
		if (typeof fontFamily === 'string') {
			text.setAttribute('font-family', fontFamily);
		}

		const fontStyles = toStringList(
			readProperty(
				properties,
				context.settings.fontStyleProperty,
				'fontStyle',
				'font-style',
			),
		);
		if (fontStyles.includes('bold')) {
			text.setAttribute('font-weight', 'bold');
		}
		if (fontStyles.includes('italic')) {
			text.setAttribute('font-style', 'italic');
		} else if (fontStyles.includes('oblique')) {
			text.setAttribute('font-style', 'oblique');
		}
		const textDecorations = [
			fontStyles.includes('underline') ? 'underline' : null,
			fontStyles.includes('line-through') || fontStyles.includes('strikethrough') ? 'line-through' : null,
			fontStyles.includes('overline') ? 'overline' : null,
		].filter((value): value is string => value !== null);
		if (textDecorations.length > 0) {
			text.setAttribute('text-decoration', textDecorations.join(' '));
		}

		const fontColor = readProperty(
			properties,
			context.settings.fontColorProperty,
			context.settings.fillProperty,
			'fontColor',
			'font-color',
		);
		if (typeof fontColor === 'string' && fontColor.length > 0) {
			text.setAttribute('fill', fontColor);
		}

		return [text];
	}

	protected applyStyle(element: SVGElement, style: ShapeStyle): void {
		// Respect an explicit fill set by createElements (e.g. sketchmatter-font-color).
		const existingFill = element.getAttribute('fill');
		if (!existingFill || existingFill.trim().length === 0) {
			element.setAttribute('fill', style.fill === 'transparent' ? '#333333' : style.fill);
		}
		if (style.opacity !== '1') {
			element.setAttribute('opacity', style.opacity);
		}
	}

	private resolveTextContent(context: ShapeRenderContext): string {
		const props = context.object.properties;
		const text = readProperty(
			props,
			context.settings.labelTextProperty,
			'text',
			'label',
			'name',
		);
		if (typeof text === 'string' && text.length > 0) {
			return text;
		}
		if (typeof text === 'number') {
			return String(text);
		}

		return context.object.file.basename;
	}

	protected resolveRotationAngle(context: ShapeRenderContext): number | null {
		const props = context.object.properties;
		const raw = readProperty(
			props,
			context.settings.labelAngleProperty,
			context.settings.angleProperty,
			'angle',
			'rotation',
		);
		if (raw == null) {
			return null;
		}

		const parsed = Number(raw);
		return Number.isFinite(parsed) ? parsed : null;
	}
}
