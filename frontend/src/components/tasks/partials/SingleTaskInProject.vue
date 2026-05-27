<template>
	<div
		:data-task-id="task.id"
		:data-project-id="task.projectId"
		@pointerdown="parentRelation ? onDetachPointerDown($event) : undefined"
	>
		<div
			ref="taskRoot"
			:class="{'is-loading': taskService.loading, 'has-custom-background-color': getHexColor(task.hexColor), 'has-popup-open': hasPopupOpen, 'is-nest-target': isNestTarget}"
			class="task loader-container single-task"
			:style="{'background-color': getHexColor(task.hexColor) || undefined}"
			tabindex="-1"
			@click="openTaskDetail"
			@keyup.enter="openTaskDetail"
		>
			<span
				v-tooltip="!canMarkAsDone ? $t('task.readOnlyCheckbox') : ''"
				class="task-checkbox"
			>
				<FancyCheckbox
					v-model="task.done"
					:disabled="isArchived || disabled || !canMarkAsDone"
					:aria-label="$t('task.detail.markAsDone', {task: task.title})"
					@update:modelValue="markAsDone"
					@click.stop
				/>
			</span>

			<div class="task-content">
				<div class="task-title-row">
					<span
						v-if="!isEditorContentEmpty(task.description)"
						class="project-task-icon is-mirrored-rtl task-description-icon"
					>
						<Icon icon="align-left" />
					</span>
					<ColorBubble
						v-if="!showProjectSeparately && projectColor !== '' && currentProject?.id !== task.projectId"
						:color="projectColor"
						class="mie-1"
					/>

					<div
						:class="{ 'done': task.done, 'show-project': showProject && project}"
						class="tasktext"
					>
						<RouterLink
							v-if="showProject && typeof project !== 'undefined'"
							v-tooltip="$t('task.detail.belongsToProject', {project: project.title})"
							:to="{ name: 'project.index', params: { projectId: task.projectId } }"
							class="task-project mie-1"
							:class="{'mie-2': task.hexColor !== ''}"
							@click.stop
						>
							{{ project.title }}
						</RouterLink>

						<ColorBubble
							v-if="task.hexColor !== ''"
							:color="getHexColor(task.hexColor)"
							class="mie-1"
						/>

						<TaskGlanceTooltip :task="task">
							<span
								v-if="isEditingTitle"
								ref="titleEditRef"
								class="task-link task-title-editable"
								contenteditable="true"
								@keydown.enter.prevent="saveTitle"
								@keydown.esc.prevent="cancelEditTitle"
								@blur="saveTitle"
								@click.stop
							>{{ task.title }}</span>
							<RouterLink
								v-else
								ref="taskLinkRef"
								:to="taskDetailRoute"
								class="task-link"
								tabindex="-1"
							>
								{{ task.title }}
							</RouterLink>
						</TaskGlanceTooltip>
					</div>
					<BaseButton
						v-if="!disabled && !isArchived && !isEditingTitle"
						class="task-edit-button"
						@click.stop="startEditTitle"
					>
						<Icon icon="pen" />
					</BaseButton>

					<RelationKindChip
						v-if="parentRelation && !isEditingTitle"
						:relation-kind="currentRelationKind"
						class="task-relation-chip"
						@click.stop
						@update:relationKind="changeRelationKind"
						@remove="removeRelation"
					/>

					<div
						v-if="!task.done"
						class="task-inline-fields"
					>
						<InlineQuickAddFields
							ref="inlineFieldsRef"
							:task="task"
							:project-id="task.projectId"
							variant="inline"
							:disabled="isArchived || disabled"
							@taskUpdated="t => { task = t; emit('taskUpdated', t) }"
						/>
					</div>
				</div>
			</div>

			<span class="task-meta-icons">
				<span
					v-if="task.attachments.length > 0"
					class="project-task-icon"
				>
					<Icon icon="paperclip" />
				</span>
				<span
					v-if="isRepeating"
					class="project-task-icon"
				>
					<Icon icon="history" />
				</span>
				<CommentCount
					:task="task"
					class="project-task-icon"
				/>
				<ChecklistSummary :task="task" />
			</span>

			<ColorBubble
				v-if="showProjectSeparately && projectColor !== '' && currentProject?.id !== task.projectId"
				:color="projectColor"
				class="mie-1"
			/>

			<RouterLink
				v-if="showProjectSeparately"
				v-tooltip="$t('task.detail.belongsToProject', {project: project.title})"
				:to="{ name: 'project.index', params: { projectId: task.projectId } }"
				class="task-project"
				@click.stop
			>
				{{ project.title }}
			</RouterLink>

			<BaseButton
				:class="{'is-favorite': task.isFavorite}"
				class="favorite"
				@click.stop="toggleFavorite"
			>
				<span class="is-sr-only">{{ task.isFavorite ? $t('task.detail.actions.unfavorite') : $t('task.detail.actions.favorite') }}</span>
				<Icon
					v-if="task.isFavorite"
					icon="star"
				/>
				<Icon
					v-else
					:icon="['far', 'star']"
				/>
			</BaseButton>
			<slot />
		</div>
		<template v-for="child in allChildRelations" :key="child.task.id">
			<template v-if="getTaskById(child.task.id)">
				<single-task-in-project
					:the-task="getTaskById(child.task.id)"
					:disabled="disabled"
					:can-mark-as-done="canMarkAsDone"
					:all-tasks="allTasks"
					:parent-relation="{ parentTaskId: task.id, relationKind: child.kind }"
					:class="getRelationClass(child.kind)"
					@taskUpdated="t => emit('taskUpdated', t)"
					@relationChanged="onSubtaskRelationChanged"
				/>
			</template>
		</template>
	</div>
</template>

<script setup lang="ts">
import {ref, watch, shallowReactive, computed, nextTick, inject, type ComponentInstance, type Ref} from 'vue'
import {useI18n} from 'vue-i18n'

import TaskModel, {getHexColor} from '@/models/task'
import type {ITask} from '@/modelTypes/ITask'

import TaskGlanceTooltip from '@/components/tasks/partials/TaskGlanceTooltip.vue'
import ChecklistSummary from '@/components/tasks/partials/ChecklistSummary.vue'
import CommentCount from '@/components/tasks/partials/CommentCount.vue'
import InlineQuickAddFields from '@/components/project/views/InlineQuickAddFields.vue'
import RelationKindChip from '@/components/tasks/partials/RelationKindChip.vue'

import BaseButton from '@/components/base/BaseButton.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import ColorBubble from '@/components/misc/ColorBubble.vue'

import TaskService from '@/services/task'
import TaskRelationService from '@/services/taskRelation'
import TaskRelationModel from '@/models/taskRelation'

import {success, error} from '@/message'
import {RELATION_KIND, type IRelationKind} from '@/types/IRelationKind'

import {useProjectStore} from '@/stores/projects'
import {useBaseStore} from '@/stores/base'
import {useTaskStore} from '@/stores/tasks'
import {playPopSound} from '@/helpers/playPop'
import {isEditorContentEmpty} from '@/helpers/editorContentEmpty'
import {TASK_REPEAT_MODES} from '@/types/IRepeatMode'

const props = withDefaults(defineProps<{
	theTask: ITask,
	isArchived?: boolean,
	showProject?: boolean,
	disabled?: boolean,
	canMarkAsDone?: boolean,
	allTasks?: ITask[],
	isNestTarget?: boolean,
	parentRelation?: { parentTaskId: number, relationKind: IRelationKind } | null,
}>(), {
	isArchived: false,
	showProject: false,
	disabled: false,
	canMarkAsDone: true,
	allTasks: () => [],
	isNestTarget: false,
	parentRelation: null,
})

const emit = defineEmits<{
	'taskUpdated': [task: ITask],
	'relationChanged': [payload?: { taskId: number, newKind: IRelationKind }],
	'subtaskDetached': [taskId: number],
}>()

type NestDetection = {
	startDrag: (id: number) => void,
	endDrag: () => {nestTargetId: number | null},
	nestTargetTaskId: Ref<number | null>,
	nestTaskAsSubtask: (child: ITask, parentId: number) => Promise<void>,
}
const nestDetection = inject<NestDetection | null>('nestDetection', null)

function getTaskById(taskId: number): ITask | undefined {
	if (typeof props.allTasks === 'undefined' || props.allTasks.length === 0) {
		return null
	}

	return props.allTasks.find(t => t.id === taskId)
}

const taskRelationService = new TaskRelationService()

const localRelationKinds = ref<Record<number, IRelationKind>>({})

const currentRelationKind = computed<IRelationKind>(() => {
	return props.parentRelation?.relationKind ?? RELATION_KIND.SUBTASK
})

const allChildRelations = computed(() => {
	const rt = task.value.relatedTasks ?? {}
	const children: {task: ITask, kind: IRelationKind}[] = []

	for (const t of (rt.subtask ?? [])) {
		const override = localRelationKinds.value[t.id]
		children.push({task: t, kind: override ?? RELATION_KIND.SUBTASK})
	}
	for (const t of (rt.blocking ?? [])) {
		if (!children.some(c => c.task.id === t.id)) {
			children.push({task: t, kind: RELATION_KIND.BLOCKING})
		}
	}
	// Related tasks are symmetric (A→B and B→A), so only render them
	// when this task is not already a nested child (prevents infinite loop)
	if (!props.parentRelation) {
		for (const t of (rt.related ?? [])) {
			if (!children.some(c => c.task.id === t.id)) {
				children.push({task: t, kind: RELATION_KIND.RELATED})
			}
		}
	}

	return children.sort((a, b) => {
		const aBlocking = a.kind === RELATION_KIND.BLOCKING ? 0 : 1
		const bBlocking = b.kind === RELATION_KIND.BLOCKING ? 0 : 1
		return aBlocking - bBlocking
	})
})

function getRelationClass(kind: IRelationKind): Record<string, boolean> {
	return {
		'subtask-nested': kind === RELATION_KIND.SUBTASK,
		'relation-blocking': kind === RELATION_KIND.BLOCKING,
		'relation-related': kind === RELATION_KIND.RELATED,
	}
}

async function changeRelationKind(newKind: IRelationKind) {
	if (!props.parentRelation) return
	const oldKind = props.parentRelation.relationKind

	try {
		await taskRelationService.delete(new TaskRelationModel({
			taskId: props.parentRelation.parentTaskId,
			otherTaskId: task.value.id,
			relationKind: oldKind,
		}))

		await taskRelationService.create(new TaskRelationModel({
			taskId: props.parentRelation.parentTaskId,
			otherTaskId: task.value.id,
			relationKind: newKind,
		}))

		emit('relationChanged', {taskId: task.value.id, newKind})
	} catch (e: unknown) {
		error(e)
	}
}

async function removeRelation() {
	if (!props.parentRelation) return

	try {
		await taskRelationService.delete(new TaskRelationModel({
			taskId: props.parentRelation.parentTaskId,
			otherTaskId: task.value.id,
			relationKind: props.parentRelation.relationKind,
		}))

		emit('relationChanged')
	} catch (e: unknown) {
		error(e)
	}
}

function onDetachPointerDown(e: PointerEvent) {
	if (!props.parentRelation) return
	if ((e.target as HTMLElement)?.closest('a, button, label, input, [contenteditable], .favorite, [role="button"]')) return

	const startX = e.clientX
	const startY = e.clientY
	const el = taskRoot.value
	let clone: HTMLElement | null = null
	let dragging = false
	let offsetX = 0
	let offsetY = 0

	function onMove(me: PointerEvent) {
		const dx = me.clientX - startX
		const dy = me.clientY - startY

		if (!dragging && Math.sqrt(dx * dx + dy * dy) > 10) {
			dragging = true
			nestDetection?.startDrag(task.value.id)
			if (el) {
				const rect = el.getBoundingClientRect()
				offsetX = startX - rect.left
				offsetY = startY - rect.top
				clone = el.cloneNode(true) as HTMLElement
				Object.assign(clone.style, {
					position: 'fixed',
					width: `${rect.width}px`,
					top: `${rect.top}px`,
					left: `${rect.left}px`,
					opacity: '0.85',
					pointerEvents: 'none',
					zIndex: '10000',
					boxShadow: '0 4px 12px rgba(0,0,0,.15)',
					borderRadius: 'var(--radius, 4px)',
					transition: 'none',
				})
				document.body.appendChild(clone)
				el.style.opacity = '0.25'
			}
		}

		if (dragging && clone) {
			clone.style.top = `${me.clientY - offsetY}px`
			clone.style.left = `${me.clientX - offsetX}px`
		}
	}

	async function onUp() {
		if (dragging) {
			clone?.remove()
			if (el) el.style.opacity = ''
			const {nestTargetId} = nestDetection?.endDrag() ?? {nestTargetId: null}

			if (!props.parentRelation) return cleanup()

			try {
				// Delete old parent relation
				await taskRelationService.delete(new TaskRelationModel({
					taskId: props.parentRelation.parentTaskId,
					otherTaskId: task.value.id,
					relationKind: props.parentRelation.relationKind,
				}))

				// If dropping onto a new parent, create the new relation
				if (nestTargetId !== null && nestTargetId !== props.parentRelation.parentTaskId) {
					await taskRelationService.create(new TaskRelationModel({
						taskId: nestTargetId,
						otherTaskId: task.value.id,
						relationKind: RELATION_KIND.SUBTASK,
					}))
				}

				// Single reload after all API calls complete
				emit('relationChanged')
			} catch (e: unknown) {
				error(e)
			}
		}
		cleanup()
	}

	function cleanup() {
		document.removeEventListener('pointermove', onMove)
		document.removeEventListener('pointerup', onUp)
	}

	document.addEventListener('pointermove', onMove)
	document.addEventListener('pointerup', onUp)
}

function onSubtaskRelationChanged(payload?: { taskId: number, newKind: IRelationKind }) {
	if (payload) {
		localRelationKinds.value[payload.taskId] = payload.newKind
	}
	emit('relationChanged', payload)
}

const {t} = useI18n({useScope: 'global'})

const taskService = shallowReactive(new TaskService())
const task = ref<ITask>(new TaskModel())

const isRepeating = computed(() => task.value.repeatAfter.amount > 0 || (task.value.repeatAfter.amount === 0 && task.value.repeatMode === TASK_REPEAT_MODES.REPEAT_MODE_MONTH))

watch(
	() => props.theTask,
	newVal => {
		task.value = newVal
	},
	{
		immediate: true,
		deep: true,
	},
)

const baseStore = useBaseStore()
const projectStore = useProjectStore()
const taskStore = useTaskStore()

const project = computed(() => projectStore.projects[task.value.projectId])
const projectColor = computed(() => project.value ? project.value?.hexColor : '')

const showProjectSeparately = computed(() => !props.showProject && currentProject.value?.id !== task.value.projectId && project.value)

const currentProject = computed(() => {
	return typeof baseStore.currentProject === 'undefined' ? {
		id: 0,
		title: '',
	} : baseStore.currentProject
})

const taskDetailRoute = computed(() => ({
	name: 'task.detail',
	params: {id: task.value.id},
	// TODO: re-enable opening task detail in modal
	// state: { backdropView: router.currentRoute.value.fullPath },
}))

let oldTask

async function markAsDone(checked: boolean, wasReverted: boolean = false) {
	const updateFunc = async () => {
		oldTask = {...task.value}
		const newTask = await taskStore.update(task.value)
		task.value = newTask

		if (wasReverted) {
			return
		}

		if (checked) {
			playPopSound()
		}
		emit('taskUpdated', newTask)

		let message = t('task.doneSuccess')
		if (!task.value.done && !isRepeating.value) {
			message = t('task.undoneSuccess')
		}

		success({message}, [{
			title: t('task.undo'),
			callback: () => undoDone(checked),
		}])
	}

	if (checked) {
		setTimeout(updateFunc, 300) // Delay it to show the animation when marking a task as done
	} else {
		await updateFunc() // Don't delay it when un-marking it as it doesn't have an animation the other way around
	}
}

function undoDone(checked: boolean) {
	if (isRepeating.value) {
		task.value = {...oldTask}
	}
	task.value.done = !task.value.done
	markAsDone(!checked, true)
}

async function toggleFavorite() {
	task.value = await taskStore.toggleFavorite(task.value)
	emit('taskUpdated', task.value)
}

const taskRoot = ref<HTMLElement | null>(null)
const taskLinkRef = ref<HTMLElement | null>(null)
const titleEditRef = ref<HTMLElement | null>(null)
const inlineFieldsRef = ref<ComponentInstance<typeof InlineQuickAddFields> | null>(null)
const hasPopupOpen = computed(() => inlineFieldsRef.value?.isPopupOpen ?? false)

const isEditingTitle = ref(false)

async function startEditTitle() {
	isEditingTitle.value = true
	await nextTick()
	const el = titleEditRef.value
	if (!el) return
	el.focus()
	const range = document.createRange()
	range.selectNodeContents(el)
	const sel = window.getSelection()
	sel?.removeAllRanges()
	sel?.addRange(range)
}

async function saveTitle() {
	if (!isEditingTitle.value) return
	const trimmed = titleEditRef.value?.textContent?.trim() ?? ''
	if (trimmed === '' || trimmed === task.value.title) {
		isEditingTitle.value = false
		return
	}
	task.value.title = trimmed
	isEditingTitle.value = false
	task.value = await taskStore.update({...task.value, title: trimmed})
	emit('taskUpdated', task.value)
}

function cancelEditTitle() {
	if (titleEditRef.value) {
		titleEditRef.value.textContent = task.value.title
	}
	isEditingTitle.value = false
}

function hasTextSelected() {
	const isTextSelected = window.getSelection().toString()
	return !(typeof isTextSelected === 'undefined' || isTextSelected === '' || isTextSelected === '\n')
}

function openTaskDetail(event: MouseEvent | KeyboardEvent) {
	if (isEditingTitle.value) return
	if (event.target instanceof HTMLElement) {
		const isInteractiveElement = event.target.closest('a, button, label, input, [contenteditable], .favorite, [role="button"]')
		if (isInteractiveElement || hasTextSelected()) {
			return
		}
	}

	taskLinkRef.value?.$el.click()
}

defineExpose({
	focus: () => taskRoot.value?.focus(),
	click: (e: MouseEvent | KeyboardEvent) => openTaskDetail(e),
})
</script>

<style lang="scss" scoped>
.task {
	display: flex;
	padding: .5rem .4rem;
	transition: background-color $transition;
	align-items: center;
	cursor: pointer;
	border-radius: $radius;
	border: 2px solid transparent;

	&.is-nest-target {
		border: 2px solid var(--success);
		background-color: hsla(var(--success-h), var(--success-s), var(--success-l), 0.06);
		box-shadow: 0 0 8px hsla(var(--success-h), var(--success-s), var(--success-l), 0.2);
		transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease;
		animation: nest-pulse 1.5s ease-in-out infinite;
	}

	@keyframes nest-pulse {
		0%, 100% { box-shadow: 0 0 6px hsla(var(--success-h), var(--success-s), var(--success-l), 0.15); }
		50% { box-shadow: 0 0 12px hsla(var(--success-h), var(--success-s), var(--success-l), 0.3); }
	}

	&:hover {
		background-color: var(--grey-100);
	}

	&:has(*:focus-visible), &:focus {
		box-shadow: 0 0 0 2px hsla(var(--primary-hsl), 0.5);

		a.task-link {
			box-shadow: none;
		}
	}

	@supports not selector(:focus-within) {
		:focus {
			box-shadow: 0 0 0 2px hsla(var(--primary-hsl), 0.5);

			a.task-link {
				box-shadow: none;
			}
		}
	}

	.task-checkbox {
		display: inline-flex;
		align-items: center;
		align-self: center;
		padding-inline-end: .75rem;
	}

	.task-content {
		flex: 1 1 0;
		min-inline-size: 0;
	}

	.task-title-row {
		display: flex;
		align-items: center;
		gap: .25rem;
	}

	.tasktext,
	&.tasktext {
		text-overflow: ellipsis;
		word-wrap: break-word;
		word-break: break-word;
		overflow: hidden;
		white-space: nowrap;
		flex: 0 1 auto;
		min-inline-size: 0;
	}

	.task-edit-button {
		opacity: 0;
		color: var(--grey-400);
		flex-shrink: 0;
		padding: .15rem .25rem;
		font-size: .8rem;
		transition: opacity $transition, color $transition;
		border-radius: $radius;

		&:hover {
			color: var(--primary);
		}
	}

	&:hover .task-edit-button,
	&.has-popup-open .task-edit-button {
		opacity: 1;
	}

	.task-relation-chip {
		opacity: 0;
		transition: opacity $transition;
		flex-shrink: 0;
	}

	&:hover .task-relation-chip,
	&.has-popup-open .task-relation-chip {
		opacity: 1;
	}

	.task-title-editable {
		cursor: text;
		outline: none;
		border-radius: $radius;
		box-decoration-break: clone;

		&:focus {
			box-shadow: 0 0 0 2px hsla(var(--primary-hsl), 0.3);
		}
	}

	.task-meta-icons {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		gap: .5rem;
		margin-inline-start: 1rem;
	}

	.task-inline-fields {
		display: inline-flex;
		align-items: center;
		margin-inline-start: .5rem;
		padding-inline-start: .5rem;
		border-inline-start: 1px solid var(--grey-200);
		flex-shrink: 0;

		:deep(.inline-quick-add-chip:not(.is-set)) {
			opacity: 0;
			clip-path: inset(0 100% 0 0);
			pointer-events: none;
			transition: opacity .2s ease, clip-path .2s ease;
		}
	}

	&:hover .task-inline-fields :deep(.inline-quick-add-chip:not(.is-set)),
	&.has-popup-open .task-inline-fields :deep(.inline-quick-add-chip:not(.is-set)) {
		opacity: .5;
		clip-path: inset(0 0 0 0);
		pointer-events: auto;
	}

	.task-description-icon {
		margin-inline-start: 0;
		margin-inline-end: .25rem;
		flex-shrink: 0;
	}

	.task-project {
		inline-size: auto;
		color: var(--grey-400);
		font-size: .9rem;
		white-space: nowrap;
	}

	.avatar {
		border-radius: 50%;
		vertical-align: bottom;
		margin-inline-start: 5px;
		block-size: 27px;
		inline-size: 27px;
	}

	.project-task-icon {
		margin-inline-start: 6px;

		&:not(:first-of-type) {
			margin-inline-start: 8px;
		}

	}

	a {
		color: var(--text);
		transition: color ease $transition-duration;

		&:hover {
			color: var(--grey-900);
		}
	}

	.favorite {
		opacity: 1;
		text-align: center;
		inline-size: 27px;
		transition: opacity $transition, color $transition;
		border-radius: $radius;
		flex-shrink: 0;
		margin-inline-start: 1rem;

		&:hover {
			color: var(--warning);
		}

		&.is-favorite {
			opacity: 1;
			color: var(--warning);
		}
	}

	@media(hover: hover) and (pointer: fine) {
		& .favorite {
			opacity: 0;
		}

		&:hover .favorite {
			opacity: 1;
		}
	}

	.favorite:focus {
		opacity: 1;
	}

	:deep(.fancy-checkbox) {
		block-size: 18px;
		padding-block-start: 0;
		padding-inline-end: .5rem;

		span {
			display: none;
		}

		// Extend the hit target to >=44x44 without affecting layout (WCAG 2.5.5).
		.base-checkbox__label {
			position: relative;

			&::before {
				content: '';
				position: absolute;
				inset-block-start: 50%;
				inset-inline-start: 50%;
				min-block-size: 44px;
				min-inline-size: 44px;
				block-size: 100%;
				inline-size: 100%;
				transform: translate(-50%, -50%);
			}
		}
	}

	.tasktext.done {
		text-decoration: line-through;
		color: var(--grey-500);
	}

	span.parent-tasks {
		color: var(--grey-500);
		inline-size: auto;
	}

	.show-project .parent-tasks {
		padding-inline-start: .25rem;
	}

	.remove {
		color: var(--danger);
	}

	input[type='checkbox'] {
		vertical-align: middle;
	}

	.settings {
		float: inline-end;
		inline-size: 24px;
		cursor: pointer;
	}

	&.loader-container.is-loading:after {
		inset-block-start: calc(50% - 1rem);
		inset-inline-start: calc(50% - 1rem);
		inline-size: 2rem;
		block-size: 2rem;
		border-inline-start-color: var(--grey-300);
		border-block-end-color: var(--grey-300);
	}
}

.subtask-nested {
	margin-inline-start: 1.75rem;
}

.relation-blocking {
	margin-inline-start: 0;
	border-inline-start: 3px solid var(--danger);
	padding-inline-start: calc(1.75rem - 3px);
}

.relation-related {
	margin-inline-start: 0;

	:deep(.task) {
		border-radius: 0;
		border-block-end: 1px solid var(--grey-100);
	}

	&:first-child :deep(.task) {
		border-start-start-radius: $radius;
		border-start-end-radius: $radius;
	}

	&:last-child :deep(.task) {
		border-end-start-radius: $radius;
		border-end-end-radius: $radius;
		border-block-end: none;
	}
}

</style>
