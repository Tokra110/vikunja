import {ref, onUnmounted, type Ref} from 'vue'

/**
 * Returns true if pointerY falls in the middle 50% of the element's rect.
 * The top 25% and bottom 25% are "reorder zones"; the middle 50% is the "nest zone".
 */
export function isInNestZone(pointerY: number, rect: Pick<DOMRect, 'top' | 'height'>): boolean {
	const nestStart = rect.top + rect.height * 0.25
	const nestEnd = rect.top + rect.height * 0.75
	return pointerY >= nestStart && pointerY <= nestEnd
}

export function useTaskDragNesting(containerRef: Ref<HTMLElement | null>) {
	const nestTargetTaskId = ref<number | null>(null)
	const isDragging = ref(false)
	let draggedTaskId: number | null = null

	function onPointerMove(event: PointerEvent) {
		const container = containerRef.value
		if (!container) return

		const taskElements = container.querySelectorAll<HTMLElement>('.single-task[data-task-id]')
		let found: number | null = null

		for (const el of taskElements) {
			const taskId = Number(el.dataset.taskId)
			if (taskId === draggedTaskId) continue

			const rect = el.getBoundingClientRect()
			if (event.clientX < rect.left || event.clientX > rect.right) continue
			if (isInNestZone(event.clientY, rect)) {
				found = taskId
				break
			}
		}

		nestTargetTaskId.value = found
	}

	function startDrag(taskId: number) {
		draggedTaskId = taskId
		isDragging.value = true
		document.addEventListener('pointermove', onPointerMove)
	}

	function endDrag(): {nestTargetId: number | null} {
		const nestTargetId = nestTargetTaskId.value
		nestTargetTaskId.value = null
		isDragging.value = false
		draggedTaskId = null
		document.removeEventListener('pointermove', onPointerMove)
		return {nestTargetId}
	}

	onUnmounted(() => {
		document.removeEventListener('pointermove', onPointerMove)
	})

	return {nestTargetTaskId, isDragging, startDrag, endDrag}
}
