import {describe, it, expect} from 'vitest'

import {isInNestZone} from './useTaskDragNesting'

describe('isInNestZone', () => {
	// rect: top=100, height=40 → 25% zone starts at 110, ends at 130
	const rect = {top: 100, height: 40}

	it('returns true when pointer is in the middle 50%', () => {
		// Middle of element: 100 + 20 = 120, well within 110-130
		expect(isInNestZone(120, rect)).toBe(true)
	})

	it('returns true at the exact start of the middle zone', () => {
		// 25% of 40 = 10 → zone starts at 110
		expect(isInNestZone(110, rect)).toBe(true)
	})

	it('returns true at the exact end of the middle zone', () => {
		// 75% of 40 = 30 → zone ends at 130
		expect(isInNestZone(130, rect)).toBe(true)
	})

	it('returns false when pointer is in the top 25%', () => {
		// 109 is just inside the top reorder zone
		expect(isInNestZone(109, rect)).toBe(false)
	})

	it('returns false when pointer is at the very top', () => {
		expect(isInNestZone(100, rect)).toBe(false)
	})

	it('returns false when pointer is in the bottom 25%', () => {
		// 131 is just inside the bottom reorder zone
		expect(isInNestZone(131, rect)).toBe(false)
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
