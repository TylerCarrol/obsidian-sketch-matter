import { describe, it, expect } from 'vitest';
import { toCoordinatePairs } from '../shapes/base';

describe('toCoordinatePairs', () => {
	// -----------------------------------------------------------------------
	// Null / invalid inputs
	// -----------------------------------------------------------------------

	it('returns null for null input', () => {
		expect(toCoordinatePairs(null)).toBeNull();
	});

	it('returns null for undefined input', () => {
		expect(toCoordinatePairs(undefined)).toBeNull();
	});

	it('returns null for a numeric input', () => {
		expect(toCoordinatePairs(42)).toBeNull();
	});

	it('returns null for an object input', () => {
		expect(toCoordinatePairs({ x: 1, y: 2 })).toBeNull();
	});

	it('returns an empty array for an empty array input', () => {
		expect(toCoordinatePairs([])).toEqual([]);
	});

	// -----------------------------------------------------------------------
	// Single "x, y" string
	// -----------------------------------------------------------------------

	it('parses a single "x, y" string into one coordinate pair', () => {
		expect(toCoordinatePairs('100, 200')).toEqual([[100, 200]]);
	});

	it('handles integer values without spaces', () => {
		expect(toCoordinatePairs('0,0')).toEqual([[0, 0]]);
	});

	it('handles negative coordinates in a string', () => {
		expect(toCoordinatePairs('-10, -20')).toEqual([[-10, -20]]);
	});

	it('handles decimal coordinates in a string', () => {
		const result = toCoordinatePairs('1.5, 2.75');
		expect(result).not.toBeNull();
		expect(result![0]).toEqual([1.5, 2.75]);
	});

	it('returns null for a string with more than two comma-separated values', () => {
		expect(toCoordinatePairs('1, 2, 3')).toBeNull();
	});

	it('returns null for a string with only one value', () => {
		expect(toCoordinatePairs('42')).toBeNull();
	});

	it('returns null for a non-numeric string', () => {
		expect(toCoordinatePairs('hello, world')).toBeNull();
	});

	// -----------------------------------------------------------------------
	// Array of "x, y" strings (preferred format)
	// -----------------------------------------------------------------------

	it('parses an array of "x, y" strings', () => {
		const result = toCoordinatePairs(['100, 200', '300, 400', '500, 600']);
		expect(result).toEqual([
			[100, 200],
			[300, 400],
			[500, 600],
		]);
	});

	it('returns null when any string in the array is malformed', () => {
		expect(toCoordinatePairs(['100, 200', 'bad'])).toBeNull();
	});

	it('parses a single-element array of strings', () => {
		expect(toCoordinatePairs(['50, 75'])).toEqual([[50, 75]]);
	});

	// -----------------------------------------------------------------------
	// Legacy: single numeric pair [x, y]
	// -----------------------------------------------------------------------

	it('parses a legacy [x, y] numeric pair', () => {
		expect(toCoordinatePairs([10, 20])).toEqual([[10, 20]]);
	});

	// -----------------------------------------------------------------------
	// Legacy: array of numeric pairs [[x1,y1], [x2,y2], ...]
	// -----------------------------------------------------------------------

	it('parses a legacy array of numeric pairs', () => {
		const result = toCoordinatePairs([
			[1, 2],
			[3, 4],
			[5, 6],
		]);
		expect(result).toEqual([
			[1, 2],
			[3, 4],
			[5, 6],
		]);
	});

	it('parses a single nested numeric pair as a legacy array of pairs', () => {
		// [[1, 2]] — one pair wrapped in an outer array
		expect(toCoordinatePairs([[1, 2]])).toEqual([[1, 2]]);
	});
});
