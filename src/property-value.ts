import type { App } from 'obsidian';

interface MetadataTypeInfo {
	type?: unknown;
	expected?: {
		type?: unknown;
	};
}

interface MetadataTypeManagerCompat {
	getAssignedType?: (property: string) => unknown;
	getTypeInfo?: (property: string) => MetadataTypeInfo | null | undefined;
	getPropertyInfo?: (property: string) => MetadataTypeInfo | null | undefined;
}

function getMetadataTypeManager(app: App): MetadataTypeManagerCompat | null {
	const extendedApp = app as App & { metadataTypeManager?: MetadataTypeManagerCompat };
	return extendedApp.metadataTypeManager ?? null;
}

export function getObsidianPropertyType(app: App, property: string): string | null {
	const manager = getMetadataTypeManager(app);
	if (!manager) return null;

	const assignedType = manager.getAssignedType?.(property);
	if (typeof assignedType === 'string' && assignedType.length > 0) {
		return assignedType;
	}

	const typeInfo = manager.getTypeInfo?.(property);
	const expectedType = typeInfo?.expected?.type;
	if (typeof expectedType === 'string' && expectedType.length > 0) {
		return expectedType;
	}

	const propertyType = manager.getPropertyInfo?.(property)?.type;
	return typeof propertyType === 'string' && propertyType.length > 0
		? propertyType
		: null;
}

function parseNumber(property: string, input: string): number {
	const value = input.trim();
	const parsed = Number(value);
	if (value.length === 0 || !Number.isFinite(parsed)) {
		throw new Error(`Property "${property}" requires a number.`);
	}
	return parsed;
}

function parseCheckbox(property: string, input: string): boolean {
	const value = input.trim().toLowerCase();
	if (value === 'true') return true;
	if (value === 'false') return false;
	throw new Error(`Property "${property}" requires true or false.`);
}

function parseList(input: string): string[] {
	return input
		.split(/\r?\n/u)
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

export function convertPropertyInput(app: App, property: string, input: string): unknown {
	switch (getObsidianPropertyType(app, property)) {
		case 'number':
			return parseNumber(property, input);
		case 'checkbox':
			return parseCheckbox(property, input);
		case 'multitext':
		case 'aliases':
		case 'tags':
			return parseList(input);
		default:
			return input;
	}
}