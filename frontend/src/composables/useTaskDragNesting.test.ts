import {describe, it, expect} from 'vitest'

import {isInNestZone} from './useTaskDragNesting'

describe('isInNestZone', () => {
	// rect: top=100, height=40 → 10% = 4px, nest zone starts at 104, ends at 136
	const rect = {top: 100, height: 40}

	it('returns true when pointer is in the middle 80%', () => {
		expect(isInNestZone(120, rect)).toBe(true)
	})

	it('returns true at the exact start of the nest zone', () => {
		// 10% of 40 = 4 → zone starts at 104
		expect(isInNestZone(104, rect)).toBe(true)
	})

	it('returns true at the exact end of the nest zone', () => {
		// 90% of 40 = 36 → zone ends at 136
		expect(isInNestZone(136, rect)).toBe(true)
	})

	it('returns false when pointer is in the top 10%', () => {
		expect(isInNestZone(103, rect)).toBe(false)
	})

	it('returns false when pointer is at the very top', () => {
		expect(isInNestZone(100, rect)).toBe(false)
	})

	it('returns false when pointer is in the bottom 10%', () => {
		expect(isInNestZone(137, rect)).toBe(false)
	})

	it('returns false when pointer is at the very bottom', () => {
		expect(isInNestZone(140, rect)).toBe(false)
	})

	it('returns false when pointer is above the element entirely', () => {
		expect(isInNestZone(50, rect)).toBe(false)
	})

	it('returns false when pointer is below the element entirely', () => {
		expect(isInNestZone(200, rect)).toBe(false)
	})
})
