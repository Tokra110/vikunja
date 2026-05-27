import {describe, it, expect} from 'vitest'

import {isInNestZone} from './useTaskDragNesting'

describe('isInNestZone', () => {
	// rect: top=100, height=40 → 10% = 4px, nest zone 104-136
	const rect = {top: 100, height: 40}

	it('returns true in the middle 80% of the element', () => {
		expect(isInNestZone(120, rect)).toBe(true) // center
		expect(isInNestZone(104, rect)).toBe(true) // exact start of zone
		expect(isInNestZone(136, rect)).toBe(true) // exact end of zone
	})

	it('returns false in the top 10% (reorder zone)', () => {
		expect(isInNestZone(100, rect)).toBe(false)
		expect(isInNestZone(103, rect)).toBe(false)
	})

	it('returns false in the bottom 10% (reorder zone)', () => {
		expect(isInNestZone(137, rect)).toBe(false)
		expect(isInNestZone(140, rect)).toBe(false)
	})

	it('returns false outside the element', () => {
		expect(isInNestZone(50, rect)).toBe(false)
		expect(isInNestZone(200, rect)).toBe(false)
	})
})

describe('allChildRelations logic', () => {
	// This tests the logic that will be extracted into buildChildRelations()

	function buildChildRelations(
		relatedTasks: Record<string, {id: number}[]> | undefined,
		localKindOverrides: Record<number, string>,
		hasParent: boolean,
	) {
		const rt = relatedTasks ?? {}
		const children: {taskId: number, kind: string}[] = []

		for (const t of (rt.subtask ?? [])) {
			const override = localKindOverrides[t.id]
			children.push({taskId: t.id, kind: override ?? 'subtask'})
		}
		for (const t of (rt.blocking ?? [])) {
			if (!children.some(c => c.taskId === t.id)) {
				children.push({taskId: t.id, kind: 'blocking'})
			}
		}
		// Related is symmetric — only render at top level to prevent infinite recursion
		if (!hasParent) {
			for (const t of (rt.related ?? [])) {
				if (!children.some(c => c.taskId === t.id)) {
					children.push({taskId: t.id, kind: 'related'})
				}
			}
		}

		return children.sort((a, b) => {
			const aBlocking = a.kind === 'blocking' ? 0 : 1
			const bBlocking = b.kind === 'blocking' ? 0 : 1
			return aBlocking - bBlocking
		})
	}

	it('returns subtasks with their default kind', () => {
		const result = buildChildRelations(
			{subtask: [{id: 10}, {id: 11}]},
			{},
			false,
		)
		expect(result).toEqual([
			{taskId: 10, kind: 'subtask'},
			{taskId: 11, kind: 'subtask'},
		])
	})

	it('applies local kind overrides', () => {
		const result = buildChildRelations(
			{subtask: [{id: 10}, {id: 11}]},
			{10: 'blocking'},
			false,
		)
		// Blocking sorts to front
		expect(result).toEqual([
			{taskId: 10, kind: 'blocking'},
			{taskId: 11, kind: 'subtask'},
		])
	})

	it('includes blocking relations from the API', () => {
		const result = buildChildRelations(
			{subtask: [{id: 10}], blocking: [{id: 20}]},
			{},
			false,
		)
		expect(result).toEqual([
			{taskId: 20, kind: 'blocking'},
			{taskId: 10, kind: 'subtask'},
		])
	})

	it('includes related relations only at top level', () => {
		const topLevel = buildChildRelations(
			{related: [{id: 30}]},
			{},
			false,
		)
		expect(topLevel).toEqual([{taskId: 30, kind: 'related'}])

		const nested = buildChildRelations(
			{related: [{id: 30}]},
			{},
			true,
		)
		expect(nested).toEqual([])
	})

	it('deduplicates tasks across relation types', () => {
		const result = buildChildRelations(
			{subtask: [{id: 10}], blocking: [{id: 10}]},
			{},
			false,
		)
		expect(result).toEqual([{taskId: 10, kind: 'subtask'}])
	})

	it('returns empty array when no relations', () => {
		expect(buildChildRelations(undefined, {}, false)).toEqual([])
		expect(buildChildRelations({}, {}, false)).toEqual([])
	})

	it('sorts blocking tasks before others', () => {
		const result = buildChildRelations(
			{subtask: [{id: 1}], blocking: [{id: 2}], related: [{id: 3}]},
			{},
			false,
		)
		expect(result[0]).toEqual({taskId: 2, kind: 'blocking'})
	})
})

describe('canNestInto logic', () => {
	function canNestInto(
		draggedTask: {id: number, relatedTasks?: Record<string, {id: number}[]>},
		targetTask: {id: number, relatedTasks?: Record<string, {id: number}[]>},
	): boolean {
		// Cannot nest if any relation already exists between these tasks
		const rt = targetTask.relatedTasks ?? {}
		for (const tasks of Object.values(rt)) {
			if (tasks?.some(t => t.id === draggedTask.id)) return false
		}
		const drt = draggedTask.relatedTasks ?? {}
		for (const tasks of Object.values(drt)) {
			if (tasks?.some(t => t.id === targetTask.id)) return false
		}
		return true
	}

	it('allows nesting when no relation exists', () => {
		expect(canNestInto({id: 1}, {id: 2})).toBe(true)
	})

	it('blocks nesting when target already has dragged as subtask', () => {
		expect(canNestInto(
			{id: 1},
			{id: 2, relatedTasks: {subtask: [{id: 1}]}},
		)).toBe(false)
	})

	it('blocks nesting when dragged already has target as parent', () => {
		expect(canNestInto(
			{id: 1, relatedTasks: {parenttask: [{id: 2}]}},
			{id: 2},
		)).toBe(false)
	})

	it('blocks nesting when any relation exists (blocking, related, etc.)', () => {
		expect(canNestInto(
			{id: 1},
			{id: 2, relatedTasks: {blocking: [{id: 1}]}},
		)).toBe(false)
		expect(canNestInto(
			{id: 1},
			{id: 2, relatedTasks: {related: [{id: 1}]}},
		)).toBe(false)
	})

	it('allows nesting when relations exist but not with each other', () => {
		expect(canNestInto(
			{id: 1, relatedTasks: {parenttask: [{id: 99}]}},
			{id: 2, relatedTasks: {subtask: [{id: 88}]}},
		)).toBe(true)
	})
})
