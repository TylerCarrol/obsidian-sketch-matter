import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { convertPropertyInput, getObsidianPropertyType } from '../property-value';

function makeApp(manager: object): App {
	return { metadataTypeManager: manager } as unknown as App;
}

describe('property value conversion', () => {
	it('uses the assigned type from the legacy Obsidian API', () => {
		const app = makeApp({ getAssignedType: () => 'number' });

		expect(getObsidianPropertyType(app, 'population')).toBe('number');
		expect(convertPropertyInput(app, 'population', '42.5')).toBe(42.5);
	});

	it('uses the expected type from the current Obsidian API', () => {
		const app = makeApp({ getTypeInfo: () => ({ expected: { type: 'checkbox' } }) });

		expect(getObsidianPropertyType(app, 'published')).toBe('checkbox');
		expect(convertPropertyInput(app, 'published', 'true')).toBe(true);
		expect(convertPropertyInput(app, 'published', 'false')).toBe(false);
	});

	it('converts list property types to arrays', () => {
		const app = makeApp({ getAssignedType: () => 'multitext' });

		expect(convertPropertyInput(app, 'locations', 'London\nParis\n')).toEqual(['London', 'Paris']);
	});

	it('keeps date and text property values as strings', () => {
		const dateApp = makeApp({ getAssignedType: () => 'date' });
		const textApp = makeApp({ getAssignedType: () => 'text' });

		expect(convertPropertyInput(dateApp, 'due', '2026-08-09')).toBe('2026-08-09');
		expect(convertPropertyInput(textApp, 'version', '42')).toBe('42');
	});

	it('rejects invalid number and checkbox values', () => {
		const numberApp = makeApp({ getAssignedType: () => 'number' });
		const checkboxApp = makeApp({ getAssignedType: () => 'checkbox' });

		expect(() => convertPropertyInput(numberApp, 'population', 'many')).toThrow('requires a number');
		expect(() => convertPropertyInput(checkboxApp, 'published', 'yes')).toThrow('requires true or false');
	});
});