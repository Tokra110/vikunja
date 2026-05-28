<template>
	<ProjectWrapper
		class="project-list"
		:is-loading-project="isLoadingProject"
		:project-id="projectId"
		:view-id
	>
		<template #header>
			<div class="filter-container">
				<SortPopup
					v-model="sortByParam"
				/>
				<FilterPopup
					v-if="!isSavedFilter(project)"
					v-model="params"
					:view-id="viewId"
					:project-id="projectId"
					@update:modelValue="loadTasks()"
				/>
			</div>
		</template>

		<template #default>
			<div
				ref="taskListRef"
				:class="{ 'is-loading': loading && !suppressListLoading }"
				class="loader-container list-view"
			>
				<Card
					:padding="false"
					:has-content="false"
					class="has-overflow"
				>
					<div
						v-if="!project?.isArchived && canWrite"
						class="list-view__add-card d-print-none"
					>
						<AddTask
							ref="addTaskRef"
							class="list-view__add-task"
							:default-position="firstNewPosition"
							@taskAdded="onTaskAdded"
						/>
						<div class="list-view__add-fields">
							<InlineQuickAddFields
								ref="addFieldsRef"
								:project-id="projectId"
								:disabled="false"
								variant="inline"
							/>
						</div>
					</div>

					<Nothing v-if="ctaVisible && allTasks.length === 0 && !loading">
						{{ $t('project.list.empty') }}
						<ButtonLink
							v-if="project?.id > 0 && canWrite"
							@click="focusNewTaskInput()"
						>
							{{ $t('project.list.newTaskCta') }}
						</ButtonLink>
					</Nothing>

					<Draggable
						v-if="treeData.length > 0"
						ref="treeRef"
						v-model="treeData"
						:indent="28"
						:root-droppable="true"
						:disable-drag="!canDragTasks || !isPositionSorting"
						:disable-drop="!canDragTasks || !isPositionSorting"
						:update-behavior="'modify'"
						:default-open="true"
						:node-key="getTaskNodeKey"
						trigger-class="task-drag-trigger"
						class="tasks task-tree"
						:class="{
							'is-tree-dragging': isTreeDragging,
							'is-nest-preview': treeDropPreview === 'nest',
							'is-detach-preview': treeDropPreview === 'detach',
						}"
						:each-droppable="canDropOnTask"
						:drag-open-delay="350"
						@beforeDragStart="handleTreeDragStart"
						@afterDrop="handleTreeDrop"
					>
						<template #default="{node, stat}">
							<SingleTaskInProject
								:ref="(el) => setTaskRef(el as InstanceType<typeof SingleTaskInProject> | null, stat.index)"
								:class="{'is-nest-target': node.id === nestPreviewTaskId}"
								:show-list-color="false"
								:can-mark-as-done="canWrite || isPseudoProject"
								:the-task="node"
								:all-tasks="allTasks"
								@taskUpdated="updateTasks"
								@relationChanged="loadTasks"
							/>
						</template>
					</Draggable>

					<Pagination
						:total-pages="totalPages"
						:current-page="currentPage"
					/>
				</Card>
			</div>
		</template>
	</ProjectWrapper>
</template>


<script setup lang="ts">
import {ref, computed, nextTick, onMounted, onBeforeUnmount, watch, toRef} from 'vue'
import {Draggable, dragContext} from '@he-tree/vue'
import '@he-tree/vue/style/default.css'

import ProjectWrapper from '@/components/project/ProjectWrapper.vue'
import ButtonLink from '@/components/misc/ButtonLink.vue'
import AddTask from '@/components/tasks/AddTask.vue'
import SingleTaskInProject from '@/components/tasks/partials/SingleTaskInProject.vue'
import InlineQuickAddFields from '@/components/project/views/InlineQuickAddFields.vue'
import FilterPopup from '@/components/project/partials/FilterPopup.vue'
import Nothing from '@/components/misc/Nothing.vue'
import Pagination from '@/components/misc/Pagination.vue'
import SortPopup from '@/components/project/partials/SortPopup.vue'

import {useTaskList} from '@/composables/useTaskList'
import {PERMISSIONS as Permissions} from '@/constants/permissions'
import {calculateItemPosition} from '@/helpers/calculateItemPosition'
import type {ITask} from '@/modelTypes/ITask'
import {isSavedFilter, useSavedFilter} from '@/services/savedFilter'

import {useBaseStore} from '@/stores/base'
import {useTaskStore} from '@/stores/tasks'

import type {IProject} from '@/modelTypes/IProject'
import type {IProjectView} from '@/modelTypes/IProjectView'
import TaskPositionService from '@/services/taskPosition'
import TaskPositionModel from '@/models/taskPosition'
import TaskRelationService from '@/services/taskRelation'
import TaskRelationModel from '@/models/taskRelation'
import {RELATION_KIND} from '@/types/IRelationKind'
import {error} from '@/message'

type TreeNode = ITask & { children: TreeNode[] }
type TreeLocation = {
	parent: TreeNode | null,
	siblings: TreeNode[],
	index: number,
}
type TreeStat = {
	data: TreeNode,
	parent: TreeStat | null,
	children: TreeStat[],
	hidden?: boolean,
}
type TreeDropPreview = 'reorder' | 'nest' | 'detach'

const props = defineProps<{
        isLoadingProject: boolean,
        projectId: IProject['id'],
        viewId: IProjectView['id'],
}>()

const projectId = toRef(props, 'projectId')

defineOptions({name: 'List'})

const ctaVisible = ref(false)

const taskListRef = ref<HTMLElement | null>(null)
const treeRef = ref<InstanceType<typeof Draggable> | null>(null)

const {
	tasks: allTasks,
	loading,
	totalPages,
	currentPage,
	loadTasks,
	params,
	sortByParam,
} = useTaskList(
	() => projectId.value,
	() => props.viewId,
	{position: 'asc'},
	() => projectId.value === -1
		? ['comment_count', 'is_unread']
		: ['subtasks', 'comment_count', 'is_unread'],
)

const taskPositionService = ref(new TaskPositionService())
const taskRelationService = new TaskRelationService()

// Saved filter composable for accessing filter data
const _savedFilter = useSavedFilter(() => isSavedFilter({id: projectId.value}) ? projectId.value : undefined).filter

const tasks = ref<ITask[]>([])
watch(
	allTasks,
	() => {
		tasks.value = [...allTasks.value]
	},
)

function buildTaskTree(flatTasks: ITask[]): TreeNode[] {
	const taskMap = new Map<number, ITask>()
	for (const t of flatTasks) taskMap.set(t.id, t)

	const childIdsByParent = new Map<number, Set<number>>()
	const addChild = (parentId: number, childId: number) => {
		if (parentId === childId || !taskMap.has(parentId) || !taskMap.has(childId)) {
			return
		}

		if (!childIdsByParent.has(parentId)) {
			childIdsByParent.set(parentId, new Set())
		}

		childIdsByParent.get(parentId)!.add(childId)
	}

	const childIds = new Set<number>()
	for (const t of flatTasks) {
		for (const sub of (t.relatedTasks?.subtask ?? [])) {
			if (taskMap.has(sub.id)) {
				childIds.add(sub.id)
				addChild(t.id, sub.id)
			}
		}

		for (const parent of (t.relatedTasks?.parenttask ?? [])) {
			if (taskMap.has(parent.id)) {
				childIds.add(t.id)
				addChild(parent.id, t.id)
			}
		}
	}

	const roots = flatTasks.filter(t => !childIds.has(t.id))

	function toTreeNode(task: ITask, seenTaskIds = new Set<number>()): TreeNode {
		if (seenTaskIds.has(task.id)) {
			return {
				...task,
				children: [],
			}
		}

		const nextSeenTaskIds = new Set(seenTaskIds)
		nextSeenTaskIds.add(task.id)
		const subtasks = [...(childIdsByParent.get(task.id) ?? [])]
			.map(taskId => taskMap.get(taskId))
			.filter(Boolean) as ITask[]

		return {
			...task,
			children: subtasks.map(subtask => toTreeNode(subtask, nextSeenTaskIds)),
		}
	}

	return roots.map(task => toTreeNode(task))
}

function findTreeLocation(nodes: TreeNode[], taskId: ITask['id'], parent: TreeNode | null = null): TreeLocation | null {
	const index = nodes.findIndex(node => node.id === taskId)
	if (index !== -1) {
		return {
			parent,
			siblings: nodes,
			index,
		}
	}

	for (const node of nodes) {
		const location = findTreeLocation(node.children, taskId, node)
		if (location !== null) {
			return location
		}
	}

	return null
}

function hasRelationBetween(firstTask: ITask, secondTask: ITask): boolean {
	const hasRelationToSecond = Object.values(firstTask.relatedTasks ?? {})
		.some(relatedTasks => relatedTasks?.some(task => task.id === secondTask.id))
	const hasRelationToFirst = Object.values(secondTask.relatedTasks ?? {})
		.some(relatedTasks => relatedTasks?.some(task => task.id === firstTask.id))

	return hasRelationToSecond || hasRelationToFirst
}

function getTaskNodeKey(stat: TreeStat) {
	return stat.data.id
}

const treeData = ref<TreeNode[]>([])
watch(
	tasks,
	() => {
		treeData.value = buildTaskTree(tasks.value)
	},
	{immediate: true},
)

const suppressListLoading = ref(false)

async function reloadTasksWithoutListFlash() {
	suppressListLoading.value = true
	try {
		await loadTasks(false)
	} finally {
		suppressListLoading.value = false
	}
}

const isPositionSorting = computed(() => 'position' in sortByParam.value)

const firstNewPosition = computed(() => {
	if (tasks.value.length === 0) {
		return 0
	}

	return calculateItemPosition(null, tasks.value[0].position)
})

const baseStore = useBaseStore()
const taskStore = useTaskStore()
const project = computed(() => baseStore.currentProject)

const canWrite = computed(() => {
	return project.value?.maxPermission > Permissions.READ && project.value?.id > 0
})

const isPseudoProject = computed(() => (project.value && isSavedFilter(project.value)) || project.value?.id === -1)

onMounted(async () => {
	await nextTick()
	ctaVisible.value = true
})

const canDragTasks = computed(() => canWrite.value || isSavedFilter(project.value))

const addTaskRef = ref<typeof AddTask | null>(null)
const addFieldsRef = ref<InstanceType<typeof InlineQuickAddFields> | null>(null)

function focusNewTaskInput() {
	addTaskRef.value?.focusTaskInput()
}

async function onTaskAdded(task: ITask) {
	const fieldValues = addFieldsRef.value?.getFieldValues()
	if (fieldValues) {
		const updates: Partial<ITask> = {}
		if (fieldValues.dueDate) updates.dueDate = fieldValues.dueDate
		if (fieldValues.startDate) updates.startDate = fieldValues.startDate
		if (fieldValues.endDate) updates.endDate = fieldValues.endDate
		if (fieldValues.priority) updates.priority = fieldValues.priority
		if (fieldValues.hexColor) updates.hexColor = fieldValues.hexColor
		if (fieldValues.percentDone) updates.percentDone = fieldValues.percentDone / 100
		if (fieldValues.reminders.length > 0) updates.reminders = fieldValues.reminders

		if (Object.keys(updates).length > 0) {
			task = await taskStore.update({...task, ...updates})
		}

		await Promise.all([
			...fieldValues.assignees.map(user => taskStore.addAssignee({user, taskId: task.id})),
			...fieldValues.labels.map(label => taskStore.addLabel({label, taskId: task.id})),
		])

		task = {
			...task,
			assignees: fieldValues.assignees,
			labels: fieldValues.labels,
		}

		addFieldsRef.value.reset()
	}

	updateTaskList(task)
}

function updateTaskList(task: ITask) {
	if (!isPositionSorting.value) {
		// reload tasks with current filter and sorting
		loadTasks()
	} else {
		allTasks.value = [
			task,
			...allTasks.value,
		]
	}

	baseStore.setHasTasks(true)
}

function updateTasks(updatedTask: ITask) {
	if (projectId.value < 0) {
		// Reload tasks to keep saved filter results in sync
		loadTasks(false)
		return
	}

	for (let t = 0; t < tasks.value.length; t++) {
		if (tasks.value[t].id === updatedTask.id) {
			tasks.value[t] = updatedTask
			break
		}
	}
}

const isTreeDragging = ref(false)
const nestPreviewTaskId = ref<ITask['id'] | null>(null)
const treeDropPreview = ref<TreeDropPreview>('reorder')
const treeDragStartParentId = ref<ITask['id'] | null>(null)
let treeDragPreviewFrame: number | null = null
let draggedTaskGhostFrame: number | null = null

function canDropOnTask(stat: TreeStat): boolean | null {
	const draggedTask = dragContext.dragNode?.data as ITask | undefined
	const targetTask = stat.data

	if (!draggedTask || draggedTask.id === targetTask.id) {
		return false
	}

	// Reordering under the existing parent must stay allowed even though that
	// parent already has a subtask relation to the dragged task.
	if (dragContext.startInfo?.parent?.data.id === targetTask.id) {
		return true
	}

	return !hasRelationBetween(draggedTask, targetTask)
}

function handleTreeDragStart(stat: TreeStat) {
	isTreeDragging.value = true
	treeDragStartParentId.value = stat.parent?.data.id ?? null
	keepDraggedTaskGhostVisible(stat)
	maintainDraggedTaskGhost()
	document.addEventListener('dragover', scheduleTreeDragPreviewSync, true)
	document.addEventListener('dragend', stopTreeDragPreview, {once: true})
	document.addEventListener('drop', stopTreeDragPreview, {once: true})
}

function keepDraggedTaskGhostVisible(stat?: TreeStat) {
	const draggedStat = stat ?? (dragContext.dragNode as TreeStat | null)
	if (draggedStat) {
		draggedStat.hidden = false
	}
}

function maintainDraggedTaskGhost() {
	if (!isTreeDragging.value) {
		draggedTaskGhostFrame = null
		return
	}

	keepDraggedTaskGhostVisible()
	draggedTaskGhostFrame = window.requestAnimationFrame(maintainDraggedTaskGhost)
}

function scheduleTreeDragPreviewSync() {
	if (treeDragPreviewFrame !== null) {
		return
	}

	const previousRects = captureTaskNodeRects()
	treeDragPreviewFrame = window.requestAnimationFrame(() => {
		treeDragPreviewFrame = null
		keepDraggedTaskGhostVisible()
		syncTreeDragPreview()
		animateTaskNodeShifts(previousRects)
	})
}

function captureTaskNodeRects() {
	const taskNodeRects = new Map<ITask['id'], DOMRect>()

	for (const taskNode of getTaskTreeNodes()) {
		const taskElement = taskNode.querySelector('[data-task-id]') as HTMLElement | null
		const taskId = Number(taskElement?.dataset.taskId)
		if (!Number.isNaN(taskId)) {
			taskNodeRects.set(taskId, taskNode.getBoundingClientRect())
		}
	}

	return taskNodeRects
}

function animateTaskNodeShifts(previousRects: Map<ITask['id'], DOMRect>) {
	if (previousRects.size === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		return
	}

	for (const taskNode of getTaskTreeNodes()) {
		if (taskNode.classList.contains('dragging-node')) {
			continue
		}

		const taskElement = taskNode.querySelector('[data-task-id]') as HTMLElement | null
		const taskId = Number(taskElement?.dataset.taskId)
		const previousRect = previousRects.get(taskId)
		if (!previousRect) {
			continue
		}

		const currentRect = taskNode.getBoundingClientRect()
		const deltaX = previousRect.left - currentRect.left
		const deltaY = previousRect.top - currentRect.top
		if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
			continue
		}

		const previousTransition = taskNode.style.transition
		const previousWillChange = taskNode.style.willChange
		taskNode.style.transition = 'none'
		taskNode.style.transform = `translate(${deltaX}px, ${deltaY}px)`
		taskNode.style.willChange = 'transform'

		window.requestAnimationFrame(() => {
			taskNode.style.transition = 'transform 120ms cubic-bezier(.2, 0, .2, 1)'
			taskNode.style.transform = ''
		})

		window.setTimeout(() => {
			taskNode.style.transition = previousTransition
			taskNode.style.willChange = previousWillChange
		}, 150)
	}
}

function getTaskTreeNodes(): HTMLElement[] {
	return Array.from(taskListRef.value?.querySelectorAll('.task-tree .tree-node:not(.drag-placeholder-wrapper)') ?? []) as HTMLElement[]
}

function syncTreeDragPreview() {
	const tree = treeRef.value as (InstanceType<typeof Draggable> & {
		placeholderData: unknown,
		has: (data: unknown) => boolean,
		getStat: (data: unknown) => TreeStat | null,
	}) | null

	if (!tree?.has(tree.placeholderData)) {
		nestPreviewTaskId.value = null
		treeDropPreview.value = 'reorder'
		return
	}

	const placeholder = tree.getStat(tree.placeholderData) as TreeStat | null
	const previewParentId = placeholder?.parent?.data.id ?? null

	if (previewParentId !== null && previewParentId !== treeDragStartParentId.value) {
		nestPreviewTaskId.value = previewParentId
		treeDropPreview.value = 'nest'
		return
	}

	nestPreviewTaskId.value = null
	treeDropPreview.value = previewParentId === null && treeDragStartParentId.value !== null
		? 'detach'
		: 'reorder'
}

function stopTreeDragPreview() {
	if (treeDragPreviewFrame !== null) {
		window.cancelAnimationFrame(treeDragPreviewFrame)
		treeDragPreviewFrame = null
	}
	if (draggedTaskGhostFrame !== null) {
		window.cancelAnimationFrame(draggedTaskGhostFrame)
		draggedTaskGhostFrame = null
	}

	isTreeDragging.value = false
	nestPreviewTaskId.value = null
	treeDropPreview.value = 'reorder'
	treeDragStartParentId.value = null
	document.removeEventListener('dragover', scheduleTreeDragPreviewSync, true)
	document.removeEventListener('dragend', stopTreeDragPreview)
	document.removeEventListener('drop', stopTreeDragPreview)
}

async function handleTreeDrop() {
	const {startInfo, dragNode} = dragContext
	if (!startInfo || !dragNode) {
		stopTreeDragPreview()
		return
	}

	const task = dragNode.data as ITask
	const oldParentStat = startInfo.parent
	const oldParent = oldParentStat ? (oldParentStat.data as ITask) : undefined
	const newLocation = findTreeLocation(treeData.value, task.id)

	if (newLocation === null) {
		await reloadTasksWithoutListFlash()
		stopTreeDragPreview()
		return
	}

	const newParent = newLocation.parent ?? undefined

	const wasChild = !!oldParent
	const isNowChild = !!newParent
	const parentChanged = wasChild !== isNowChild || oldParent?.id !== newParent?.id
	const positionChanged = parentChanged || startInfo.indexBeforeDrop !== newLocation.index

	try {
		// Remove old relation if it was a subtask and parent changed
		if (wasChild && parentChanged) {
			await taskRelationService.delete(new TaskRelationModel({
				taskId: oldParent!.id,
				otherTaskId: task.id,
				relationKind: RELATION_KIND.SUBTASK,
			}))
		}

		// Create new relation if it's now a subtask and parent changed
		if (isNowChild && parentChanged) {
			await taskRelationService.create(new TaskRelationModel({
				taskId: newParent!.id,
				otherTaskId: task.id,
				relationKind: RELATION_KIND.SUBTASK,
			}))
		}

		if (positionChanged) {
			const taskBefore = newLocation.index > 0 ? newLocation.siblings[newLocation.index - 1] : null
			const taskAfter = newLocation.index < newLocation.siblings.length - 1 ? newLocation.siblings[newLocation.index + 1] : null

			const position = calculateItemPosition(
				taskBefore !== null ? taskBefore.position : null,
				taskAfter !== null ? taskAfter.position : null,
			)

			await taskPositionService.value.update(new TaskPositionModel({
				position,
				projectViewId: props.viewId,
				taskId: task.id,
			}))
		}

		await reloadTasksWithoutListFlash()
	} catch (e: unknown) {
		error(e)
		await loadTasks() // revert on error
	} finally {
		stopTreeDragPreview()
	}
}

const taskRefs = ref<(InstanceType<typeof SingleTaskInProject> | null)[]>([])
const focusedIndex = ref(-1)

function setTaskRef(el: InstanceType<typeof SingleTaskInProject> | null, index: number) {
	if (el === null) {
		delete taskRefs.value[index]
	} else {
		taskRefs.value[index] = el
	}
}

function focusTask(index: number) {
	if (index < 0 || index >= tasks.value.length) {
		return
	}

	const taskRef = taskRefs.value[index]

	focusedIndex.value = index
	taskRef?.focus()
}

function handleListNavigation(e: KeyboardEvent) {
	if (e.target instanceof HTMLElement && (e.target.closest('input, textarea, select, [contenteditable="true"]'))) {
		return
	}

	if (e.code === 'KeyJ') {
		e.preventDefault()
		focusTask(Math.min(focusedIndex.value + 1, tasks.value.length - 1))
		return
	}

	if (e.code === 'KeyK') {
		e.preventDefault()
		if (focusedIndex.value === -1) {
			focusTask(tasks.value.length - 1)
			return
		}

		if (focusedIndex.value === 0) {
			addTaskRef.value?.focusTaskInput()
			focusedIndex.value = -1
			return
		}

		focusTask(Math.max(focusedIndex.value - 1, 0))
		return
	}

	if (e.code === 'Enter') {
		if (e.isComposing) {
			return
		}
		e.preventDefault()
		taskRefs.value[focusedIndex.value]?.click(e)
	}
}

onMounted(() => {
	document.addEventListener('keydown', handleListNavigation)
})

onBeforeUnmount(() => {
	stopTreeDragPreview()
	document.removeEventListener('keydown', handleListNavigation)
})
</script>

<style lang="scss" scoped>
.filter-container {
	display: flex;
	align-items: center;
	gap: .5rem;

	:deep(.popup) {
		inset-block-start: 3rem;
		inset-inline-end: 0;
		max-inline-size: 300px;
	}
}

.tasks {
	padding: .5rem;
	display: flex;
	flex-direction: column;
	gap: .5rem;

	:deep(.single-task) {
		box-shadow: var(--shadow-xs);
		border-radius: $radius;
		background: var(--white);

		&.has-custom-background-color {
			background: none;
		}
	}
}

.list-view__add-card {
	box-shadow: var(--shadow-xs);
	border-radius: $radius;
	background: var(--white);
	padding: .75rem;
	margin: .5rem;
}

.list-view__add-task {
	padding: 0;
}

.list-view__add-fields {
	padding-block-start: .5rem;
}

.link-share-view .card {
	border: none;
	box-shadow: none;
}

:deep(.single-task .handle) {
	cursor: grab;
	margin-inline-end: .25rem;
	color: var(--grey-400);
}

@media (hover: hover) and (pointer: fine) {
	:deep(.single-task .handle) {
		display: none;
	}
}

:deep(.tasks:not(.dragging-disabled) .single-task) {
	cursor: grab;
	-webkit-touch-callout: none;
	user-select: none;
	touch-action: manipulation;

	&:active {
		cursor: grabbing;
	}
}

.list-view {
	padding-block-end: 1rem;

	:deep(.card) {
		margin-block-end: 0;
		background: transparent;
		box-shadow: none;
		border: none;
	}
}

// he-tree drag overrides
.task-tree {
	:deep(.he-tree-drag-placeholder) {
		block-size: 3px !important;
		background: var(--primary);
		border: none;
		border-radius: 2px;
		margin: 4px 0;
		box-shadow: 0 0 0 1px hsla(var(--primary-hsl), .12);
		transition: background-color $transition, box-shadow $transition;
	}

	:deep(.tree-node) {
		padding: 0;
	}

	&.is-nest-preview {
		:deep(.he-tree-drag-placeholder) {
			background: var(--success);
			box-shadow: 0 0 0 1px hsla(var(--success-h), var(--success-s), var(--success-l), .18);
		}
	}

	&.is-detach-preview {
		:deep(.he-tree-drag-placeholder) {
			background: var(--warning);
			box-shadow: 0 0 0 1px hsla(var(--warning-h), var(--warning-s), var(--warning-l), .18);
		}
	}

	:deep(.is-nest-target > .single-task) {
		border-color: var(--success);
		box-shadow: 0 0 0 3px hsla(var(--success-h), var(--success-s), var(--success-l), .18);
	}

	:deep(.dragging-node > .single-task) {
		opacity: .42;
		box-shadow: var(--shadow-xs);
	}
}
</style>
