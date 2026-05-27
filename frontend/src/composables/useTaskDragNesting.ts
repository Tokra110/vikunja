import {ref, onUnmounted, type Ref} from 'vue'

export function isInNestZone(pointerY: number, rect: Pick<DOMRect, 'top' | 'height'>): boolean {
	const nestStart = rect.top + rect.height * 0.1
	const nestEnd = rect.top + rect.height * 0.9
	return pointerY >= nestStart && pointerY <= nestEnd
}

export function useTaskDragNesting(
	containerRef: Ref<HTMLElement | null>,
	canNestInto?: (draggedId: number, targetId: number) => boolean,
) {
	const nestTargetTaskId = ref<number | null>(null)
	const isDragging = ref(false)
	let draggedTaskId: number | null = null

	function onCursorMove(event: {clientX: number, clientY: number}) {
		const container = containerRef.value
		if (!container) return

		// Only match top-level task wrappers (direct children of the task list),
		// not nested subtask wrappers inside them.
		const taskElements = container.querySelectorAll<HTMLElement>(':scope ul.tasks > div[data-task-id]')
		let found: number | null = null

		for (const el of taskElements) {
			const taskId = Number(el.dataset.taskId)
			if (taskId === draggedTaskId) continue

			// Use the inner .single-task element for hit testing (the visible row)
			const innerEl = el.querySelector<HTMLElement>('.single-task') ?? el
			const rect = innerEl.getBoundingClientRect()
			if (event.clientX < rect.left || event.clientX > rect.right) continue
			if (isInNestZone(event.clientY, rect)) {
				if (canNestInto && !canNestInto(draggedTaskId!, taskId)) continue
				found = taskId
				break
			}
		}

		nestTargetTaskId.value = found
	}

	function startDrag(taskId: number) {
		draggedTaskId = taskId
		isDragging.value = true
		document.addEventListener('drag', onCursorMove)
		document.addEventListener('mousemove', onCursorMove)
		document.addEventListener('pointermove', onCursorMove)
	}

	function endDrag(): {nestTargetId: number | null} {
		const nestTargetId = nestTargetTaskId.value
		nestTargetTaskId.value = null
		isDragging.value = false
		draggedTaskId = null
		document.removeEventListener('drag', onCursorMove)
		document.removeEventListener('mousemove', onCursorMove)
		document.removeEventListener('pointermove', onCursorMove)
		return {nestTargetId}
	}

	onUnmounted(() => {
		document.removeEventListener('drag', onCursorMove)
		document.removeEventListener('mousemove', onCursorMove)
		document.removeEventListener('pointermove', onCursorMove)
	})

	return {nestTargetTaskId, isDragging, startDrag, endDrag}
}
