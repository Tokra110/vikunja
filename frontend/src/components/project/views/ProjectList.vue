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
				:class="{ 'is-loading': loading }"
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

					<Nothing v-if="ctaVisible && tasks.length === 0 && !loading">
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
						node-key="id"
						class="tasks"
						@afterDrop="handleTreeDrop"
					>
						<template #default="{node, stat}">
							<SingleTaskInProject
								:ref="(el) => setTaskRef(el as InstanceType<typeof SingleTaskInProject> | null, stat.index)"
								:show-list-color="false"
								:can-mark-as-done="canWrite || isPseudoProject"
								:the-task="node"
								:all-tasks="allTasks"
								@taskUpdated="updateTasks"
								@relationChanged="loadTasks"
							>
								<span
									v-if="canDragTasks && isPositionSorting"
									class="icon handle"
								>
									<Icon icon="grip-lines" />
								</span>
							</SingleTaskInProject>
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
import {shouldShowTaskInListView} from '@/composables/useTaskListFiltering'
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
		const isFiltered = isSavedFilter({id: projectId.value})
		tasks.value = ([...allTasks.value]).filter(t => shouldShowTaskInListView(t, allTasks.value, isFiltered))
	},
)

function buildTaskTree(flatTasks: ITask[]): TreeNode[] {
	const taskMap = new Map<number, ITask>()
	for (const t of flatTasks) taskMap.set(t.id, t)

	const childIds = new Set<number>()
	for (const t of flatTasks) {
		for (const sub of (t.relatedTasks?.subtask ?? [])) {
			if (taskMap.has(sub.id)) childIds.add(sub.id)
		}
	}

	const roots = flatTasks.filter(t => !childIds.has(t.id))

	function toTreeNode(task: ITask): TreeNode {
		const subtasks = (task.relatedTasks?.subtask ?? [])
			.map(s => taskMap.get(s.id))
			.filter(Boolean) as ITask[]
		return {
			...task,
			children: subtasks.map(toTreeNode),
		}
	}

	return roots.map(toTreeNode)
}

const treeData = ref<TreeNode[]>([])
watch(
	tasks,
	() => {
		treeData.value = buildTaskTree(tasks.value)
	},
	{immediate: true},
)

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

async function handleTreeDrop() {
	const {startInfo, dragNode} = dragContext
	if (!startInfo || !dragNode) return

	const task = dragNode.data as ITask
	const oldParentStat = startInfo.parent
	const newParentStat = dragNode.parent

	const oldParent = oldParentStat ? (oldParentStat.data as ITask) : undefined
	const newParent = newParentStat ? (newParentStat.data as ITask) : undefined

	const wasChild = !!oldParent
	const isNowChild = !!newParent
	const parentChanged = wasChild !== isNowChild || oldParent?.id !== newParent?.id

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

		// Handle position update for root-level reorder (root→root, no parent change)
		if (!isNowChild && !parentChanged) {
			const rootNodes = treeData.value
			const idx = rootNodes.findIndex(n => n.id === task.id)
			const taskBefore = idx > 0 ? rootNodes[idx - 1] : null
			const taskAfter = idx < rootNodes.length - 1 ? rootNodes[idx + 1] : null

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

		await loadTasks()
	} catch (e: unknown) {
		error(e)
		await loadTasks() // revert on error
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
</style>
