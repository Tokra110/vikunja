<template>
	<div
		v-if="hasAnyField"
		class="inline-quick-add-chip-bar"
		:class="{'inline-quick-add-chip-bar--inline': variant === 'inline'}"
		@mouseenter.once="preloadPopupData"
	>
		<button
			v-for="chip in inlineChips"
			:key="chip.field"
			type="button"
			class="inline-quick-add-chip"
			:class="[`inline-quick-add-chip--${chip.modifier}`, {'is-set': chip.isSet, 'is-overdue': chip.isOverdue}]"
			:disabled="disabled || undefined"
			@click.stop="toggleInlinePopup(chip.popup, $event)"
		>
			<span
				v-if="chip.colorValue"
				class="inline-quick-add-chip__swatch"
				:style="{background: chip.colorValue}"
			/>
			<Icon
				v-else-if="!chip.assignees && !chip.labels"
				:icon="chip.icon"
				class="inline-quick-add-chip__icon"
				:class="`inline-quick-add-chip__icon--${chip.modifier}`"
			/>
			<template v-if="chip.assignees">
				<User
					v-for="a in chip.assignees"
					:key="a.id"
					:user="a"
					:avatar-size="20"
					:show-username="false"
					:is-inline="true"
					class="inline-quick-add-chip__avatar"
				/>
			</template>
			<template v-else-if="chip.labels">
				<XLabel
					v-for="l in chip.labels"
					:key="l.id"
					:label="l"
					class="inline-quick-add-chip__label"
				/>
			</template>
			<span v-else>{{ chip.label }}</span>
			<span
				v-if="chip.isSet"
				class="inline-quick-add-chip__clear"
				@click.stop="clearField(chip.field)"
			>
				<Icon icon="times" />
			</span>
		</button>
	</div>

	<Teleport to="body">
		<div
			v-if="openPopup !== null"
			ref="popupRef"
			class="inline-quick-add-popup"
			:class="[
				`inline-quick-add-popup--${popupVariant}`,
				isPopupReady ? null : 'inline-quick-add-popup--measuring',
			]"
			:style="{top: `${popupPosition.top}px`, left: `${popupPosition.left}px`}"
		>
			<DatepickerInline
				v-if="openPopup === 'due'"
				v-model="popupFields.dueDate"
			/>
			<DatepickerInline
				v-else-if="openPopup === 'start'"
				v-model="popupFields.startDate"
			/>
			<InlineOptionList
				v-else-if="openPopup === 'priority'"
				:options="priorityOptions"
				@select="onPrioritySelect"
			/>
			<InlineOptionList
				v-else-if="openPopup === 'assignee'"
				:options="assigneeOptions"
				@select="onAssigneeSelect"
			>
				<template #option="{option}">
					<User
						:avatar-size="24"
						:show-username="true"
						:user="(option as any).user"
					/>
				</template>
			</InlineOptionList>
			<InlineOptionList
				v-else-if="openPopup === 'labels'"
				:options="labelOptions"
				@select="onLabelSelect"
			>
				<template #option="{option}">
					<span class="inline-label-option">
						<span
							class="inline-label-option__swatch"
							:style="{background: (option as any).hexColor}"
						/>
						{{ option.label }}
					</span>
				</template>
			</InlineOptionList>
			<template v-else-if="openPopup === 'reminder'">
				<ReminderPeriod
					v-if="reminderCustomForm !== null"
					v-model="reminderCustomForm"
				/>
				<InlineOptionList
					v-else
					:options="reminderOptions"
					@select="onReminderSelect"
				>
					<template #footer>
						<li>
							<button
								type="button"
								class="inline-quick-add-custom-button"
								@click="openReminderCustom"
							>
								{{ $t('task.reminder.custom') }}
							</button>
						</li>
					</template>
				</InlineOptionList>
			</template>
			<DatepickerInline
				v-else-if="openPopup === 'endDate'"
				v-model="popupFields.endDate"
			/>
			<template v-else-if="openPopup === 'color'">
				<InlineOptionList
					:options="colorOptions"
					@select="onColorSelect"
				>
					<template #option="{option}">
						<span class="inline-color-option">
							<span
								class="inline-color-option__swatch"
								:style="{background: (option as any).hex || 'transparent'}"
							/>
							{{ option.label }}
						</span>
					</template>
				</InlineOptionList>
				<ColorPicker
					v-model="popupFields.color"
					class="inline-quick-add-color-picker"
				/>
			</template>
			<div
				v-else-if="openPopup === 'percentDone'"
				class="inline-quick-add-percent-done"
			>
				<input
					v-model.number="popupFields.percentDone"
					type="range"
					min="0"
					max="100"
					step="10"
					class="inline-quick-add-percent-done__slider"
				>
				<span class="inline-quick-add-percent-done__label">{{ popupFields.percentDone }}%</span>
			</div>
			<XButton
				class="inline-quick-add-popup__confirm"
				:shadow="false"
				:disabled="!hasPopupChanges"
				@click="confirmPopup"
			>
				{{ $t('misc.confirm') }}
			</XButton>
		</div>
	</Teleport>
</template>

<script lang="ts">
import ProjectUserService from '@/services/projectUsers'
import {getDisplayName} from '@/models/user'
import type {IUser} from '@/modelTypes/IUser'

const projectUserService = new ProjectUserService()
const membersCacheByProject = new Map<number, Promise<IUser[]>>()

function fetchProjectMembers(projectId: number): Promise<IUser[]> {
	let pending = membersCacheByProject.get(projectId)
	if (!pending) {
		pending = (projectUserService.getAll({projectId}, {s: ''}) as Promise<IUser[]>)
			.then(users => users.map(u => ({...u, name: getDisplayName(u)} as IUser)))
		membersCacheByProject.set(projectId, pending)
	}
	return pending
}
</script>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'

import DatepickerInline from '@/components/input/DatepickerInline.vue'
import InlineOptionList from '@/components/project/views/InlineOptionList.vue'
import type {InlineOption} from '@/components/project/views/InlineOptionList.vue'
import User from '@/components/misc/User.vue'
import ReminderPeriod from '@/components/tasks/partials/ReminderPeriod.vue'
import TaskReminderModel from '@/models/taskReminder'
import {SECONDS_A_DAY, SECONDS_A_HOUR} from '@/constants/date'
import {secondsToPeriod} from '@/helpers/time/period'
import ColorPicker from '@/components/input/ColorPicker.vue'
import XButton from '@/components/input/Button.vue'

import {formatDateShort, formatDisplayDate} from '@/helpers/time/formatDate'
import {closeWhenClickedOutside} from '@/helpers/closeWhenClickedOutside'
import {includesById} from '@/helpers/utils'
import {DEFAULT_INLINE_QUICK_ADD_FIELDS} from '@/modelTypes/IUserSettings'
import type {IUser} from '@/modelTypes/IUser'
import type {ILabel} from '@/modelTypes/ILabel'
import XLabel from '@/components/tasks/partials/Label.vue'
import type {ITask} from '@/modelTypes/ITask'
import type {ITaskReminder} from '@/modelTypes/ITaskReminder'
import type {IReminderPeriodRelativeTo} from '@/types/IReminderPeriodRelativeTo'
import {REMINDER_PERIOD_RELATIVE_TO_TYPES} from '@/types/IReminderPeriodRelativeTo'

import {useAuthStore} from '@/stores/auth'
import {useLabelStore} from '@/stores/labels'
import {useTaskStore} from '@/stores/tasks'

const props = withDefaults(defineProps<{
	projectId: number
	disabled: boolean
	task?: ITask
	variant?: 'grid' | 'inline'
}>(), {
	variant: 'grid',
})

const emit = defineEmits<{
	'taskUpdated': [task: ITask]
}>()

const isEditMode = computed(() => props.task !== undefined)

defineOptions({name: 'InlineQuickAddFields'})

const {t} = useI18n({useScope: 'global'})
const authStore = useAuthStore()
const labelStore = useLabelStore()

const PRIORITY_LABEL_KEYS: Record<number, string> = {
	1: 'low',
	2: 'medium',
	3: 'high',
	4: 'urgent',
	5: 'doNow',
}

// --- Field state ---

interface FieldState {
	dueDate: Date | null
	startDate: Date | null
	endDate: Date | null
	priority: number
	assignees: IUser[]
	labels: ILabel[]
	reminders: ITaskReminder[]
	color: string
	percentDone: number
}

function emptyFieldState(): FieldState {
	return {
		dueDate: null,
		startDate: null,
		endDate: null,
		priority: 0,
		assignees: [],
		labels: [],
		reminders: [],
		color: '',
		percentDone: 0,
	}
}

function copyFieldState(src: FieldState): FieldState {
	return {
		...src,
		assignees: [...src.assignees],
		labels: [...src.labels],
		reminders: [...src.reminders],
	}
}

const fields = ref<FieldState>(emptyFieldState())
const popupFields = ref<FieldState>(emptyFieldState())

// --- Edit mode: init fields from task ---

const taskStore = useTaskStore()

const projectMembers = ref<IUser[]>([])

function isUserAssigned(user: IUser) {
	return includesById(popupFields.value.assignees, user.id)
}

async function loadProjectMembers() {
	const users = await fetchProjectMembers(props.projectId)
	const currentUserId = authStore.info?.id
	projectMembers.value = [...users].sort((a, b) => {
		if (a.id === currentUserId) return -1
		if (b.id === currentUserId) return 1
		return (a.name ?? '').localeCompare(b.name ?? '')
	})
}

function toggleAssignee(user: IUser) {
	if (isUserAssigned(user)) {
		const idx = popupFields.value.assignees.findIndex(a => a.id === user.id)
		if (idx !== -1) {
			popupFields.value.assignees.splice(idx, 1)
		}
	} else {
		popupFields.value.assignees.push(user)
	}
}

let suppressSave = false

function isDateSet(d: Date | null): boolean {
	return d !== null && d.getTime() > 0
}

function initFieldsFromTask(task: ITask) {
	suppressSave = true
	fields.value = {
		dueDate: isDateSet(task.dueDate) ? task.dueDate : null,
		startDate: isDateSet(task.startDate) ? task.startDate : null,
		endDate: isDateSet(task.endDate) ? task.endDate : null,
		priority: task.priority,
		assignees: [...task.assignees],
		labels: [...task.labels],
		reminders: [...task.reminders],
		color: task.hexColor ?? '',
		percentDone: task.percentDone * 100,
	}
	nextTick(() => { suppressSave = false })
}

if (props.task) {
	initFieldsFromTask(props.task)
}

function datesEqual(a: Date | null, b: Date | null): boolean {
	if (a === b) return true
	if (a === null || b === null) return false
	return a.getTime() === b.getTime()
}

async function saveEditField(popup: Exclude<PopupKind, null>) {
	if (!isEditMode.value || !props.task || suppressSave) return

	const task = props.task
	switch (popup) {
		case 'due':
			if (datesEqual(fields.value.dueDate, task.dueDate)) return
			await taskStore.update({...task, dueDate: fields.value.dueDate})
			break
		case 'start':
			if (datesEqual(fields.value.startDate, task.startDate)) return
			await taskStore.update({...task, startDate: fields.value.startDate})
			break
		case 'endDate':
			if (datesEqual(fields.value.endDate, task.endDate)) return
			await taskStore.update({...task, endDate: fields.value.endDate})
			break
		case 'priority':
			if (fields.value.priority === task.priority) return
			await taskStore.update({...task, priority: fields.value.priority})
			break
		case 'color':
			if (fields.value.color === (task.hexColor ?? '')) return
			await taskStore.update({...task, hexColor: fields.value.color})
			break
		case 'percentDone':
			if (fields.value.percentDone / 100 === task.percentDone) return
			await taskStore.update({...task, percentDone: fields.value.percentDone / 100})
			break
		case 'reminder':
			if (snapshotField(fields.value, 'reminder') === snapshotField({...fields.value, reminders: task.reminders}, 'reminder')) return
			await taskStore.update({...task, reminders: [...fields.value.reminders]})
			break
		case 'assignee': {
			const oldIds = new Set(task.assignees.map(a => a.id))
			const newIds = new Set(fields.value.assignees.map(a => a.id))
			await Promise.all([
				...fields.value.assignees
					.filter(u => !oldIds.has(u.id))
					.map(user => taskStore.addAssignee({user, taskId: task.id})),
				...task.assignees
					.filter(u => !newIds.has(u.id))
					.map(user => taskStore.removeAssignee({user, taskId: task.id})),
			])
			break
		}
		case 'labels': {
			const oldIds = new Set(task.labels.map(l => l.id))
			const newIds = new Set(fields.value.labels.map(l => l.id))
			await Promise.all([
				...fields.value.labels
					.filter(l => !oldIds.has(l.id))
					.map(label => taskStore.addLabel({label, taskId: task.id})),
				...task.labels
					.filter(l => !newIds.has(l.id))
					.map(label => taskStore.removeLabel({label, taskId: task.id})),
			])
			break
		}
	}

	emit('taskUpdated', {
		...task,
		dueDate: fields.value.dueDate,
		startDate: fields.value.startDate,
		endDate: fields.value.endDate,
		priority: fields.value.priority,
		hexColor: fields.value.color,
		percentDone: fields.value.percentDone / 100,
		reminders: [...fields.value.reminders],
		assignees: [...fields.value.assignees],
		labels: [...fields.value.labels],
	})
}

// --- Enabled fields ---

const MAX_INLINE_FIELDS = 6

const enabledFields = computed(
	() => (authStore.settings.frontendSettings.inlineQuickAddFields ?? DEFAULT_INLINE_QUICK_ADD_FIELDS).slice(0, MAX_INLINE_FIELDS),
)
const hasAnyField = computed(() => enabledFields.value.length > 0)

function isEnabled(field: string) {
	return enabledFields.value.includes(field as typeof enabledFields.value[number])
}

// --- Popup ---

type PopupKind = 'due' | 'start' | 'endDate' | 'assignee' | 'labels' | 'reminder' | 'priority' | 'color' | 'percentDone' | null
const openPopup = ref<PopupKind>(null)
const popupRef = ref<HTMLElement | null>(null)
const popupPosition = ref<{top: number, left: number}>({top: 0, left: 0})
const isPopupReady = ref(false)

const PRIORITY_OPTIONS = [
	{value: 0, labelKey: 'task.priority.unset'},
	{value: 1, labelKey: 'task.priority.low'},
	{value: 2, labelKey: 'task.priority.medium'},
	{value: 3, labelKey: 'task.priority.high'},
	{value: 4, labelKey: 'task.priority.urgent'},
	{value: 5, labelKey: 'task.priority.doNow'},
] as const

// --- Priority options ---

const priorityOptions = computed<InlineOption[]>(() =>
	PRIORITY_OPTIONS.map(opt => ({
		label: t(opt.labelKey),
		active: popupFields.value.priority === opt.value,
		key: opt.value,
	})),
)

function onPrioritySelect(_opt: InlineOption, idx: number) {
	popupFields.value.priority = PRIORITY_OPTIONS[idx].value
}

// --- Assignee options ---

const assigneeOptions = computed<(InlineOption & {user: IUser})[]>(() =>
	projectMembers.value.map(u => ({
		label: u.name ?? u.username,
		active: includesById(popupFields.value.assignees, u.id),
		key: u.id,
		user: u,
	})),
)

function onAssigneeSelect(opt: InlineOption & {user: IUser}) {
	toggleAssignee(opt.user)
}

// --- Label options ---

const labelOptions = computed<(InlineOption & {hexColor: string, labelObj: ILabel})[]>(() =>
	labelStore.labelsArray.map(l => ({
		label: l.title,
		active: popupFields.value.labels.some(fl => fl.id === l.id),
		key: l.id,
		hexColor: l.hexColor,
		labelObj: l,
	})),
)

function onLabelSelect(opt: InlineOption & {labelObj: ILabel}) {
	const label = opt.labelObj
	if (opt.active) {
		const idx = popupFields.value.labels.findIndex(l => l.id === label.id)
		if (idx !== -1) popupFields.value.labels.splice(idx, 1)
	} else {
		popupFields.value.labels.push(label)
	}
}

// --- Color options ---

const COLOR_PRESETS = [
	{hex: '#1973ff', name: 'Blue'},
	{hex: '#7F23FF', name: 'Purple'},
	{hex: '#ff4136', name: 'Red'},
	{hex: '#ff851b', name: 'Orange'},
	{hex: '#ffeb10', name: 'Yellow'},
	{hex: '#00db60', name: 'Green'},
]

const colorOptions = computed<(InlineOption & {hex: string})[]>(() => [
	{label: t('input.resetColor'), active: popupFields.value.color === '', key: 'none', hex: ''},
	...COLOR_PRESETS.map(c => ({
		label: c.name,
		active: popupFields.value.color.toLowerCase() === c.hex.toLowerCase(),
		key: c.hex,
		hex: c.hex,
	})),
])

function onColorSelect(opt: InlineOption & {hex: string}) {
	popupFields.value.color = opt.hex
}

// --- Reminder options ---

const popupVariant = computed(() => {
	if (openPopup.value === 'due' || openPopup.value === 'start' || openPopup.value === 'endDate') {
		return 'date'
	}
	return 'picker'
})

const reminderDefaultRelativeTo = computed<IReminderPeriodRelativeTo | null>(
	() => fields.value.dueDate !== null ? REMINDER_PERIOD_RELATIVE_TO_TYPES.DUEDATE : null,
)

const REMINDER_PRESETS_PERIODS = [
	0,
	-2 * SECONDS_A_HOUR,
	-1 * SECONDS_A_DAY,
	-3 * SECONDS_A_DAY,
	-7 * SECONDS_A_DAY,
	-30 * SECONDS_A_DAY,
]

function formatReminderPreset(relativePeriod: number, relativeTo: IReminderPeriodRelativeTo): string {
	const period = secondsToPeriod(relativePeriod)
	if (period.amount === 0) {
		switch (relativeTo) {
			case REMINDER_PERIOD_RELATIVE_TO_TYPES.DUEDATE: return t('task.reminder.onDueDate')
			case REMINDER_PERIOD_RELATIVE_TO_TYPES.STARTDATE: return t('task.reminder.onStartDate')
			case REMINDER_PERIOD_RELATIVE_TO_TYPES.ENDDATE: return t('task.reminder.onEndDate')
		}
	}
	const amountAbs = Math.abs(period.amount)
	const unit = t(`time.units.${period.unit}`, amountAbs)
	let type = ''
	switch (relativeTo) {
		case REMINDER_PERIOD_RELATIVE_TO_TYPES.DUEDATE: type = t('task.attributes.dueDate'); break
		case REMINDER_PERIOD_RELATIVE_TO_TYPES.STARTDATE: type = t('task.attributes.startDate'); break
		case REMINDER_PERIOD_RELATIVE_TO_TYPES.ENDDATE: type = t('task.attributes.endDate'); break
	}
	return t('task.reminder.before', {amount: amountAbs, unit, type})
}

const reminderOptions = computed<InlineOption[]>(() => {
	const relativeTo = reminderDefaultRelativeTo.value ?? REMINDER_PERIOD_RELATIVE_TO_TYPES.DUEDATE
	return REMINDER_PRESETS_PERIODS.map(relativePeriod => ({
		label: formatReminderPreset(relativePeriod, relativeTo),
		active: popupFields.value.reminders.some(r =>
			r.relativePeriod === relativePeriod && r.relativeTo === relativeTo,
		),
		key: relativePeriod,
		relativePeriod,
		relativeTo,
	}))
})

const reminderCustomForm = ref<ITaskReminder | null>(null)

function onReminderSelect(opt: InlineOption & {relativePeriod: number, relativeTo: IReminderPeriodRelativeTo}) {
	const idx = popupFields.value.reminders.findIndex(r =>
		r.relativePeriod === opt.relativePeriod && r.relativeTo === opt.relativeTo,
	)
	if (idx !== -1) {
		popupFields.value.reminders.splice(idx, 1)
	} else {
		popupFields.value.reminders.push({
			reminder: null,
			relativePeriod: opt.relativePeriod,
			relativeTo: opt.relativeTo,
		} as ITaskReminder)
	}
}

function openReminderCustom() {
	reminderCustomForm.value = new TaskReminderModel() as ITaskReminder
}

let popupConfirmed = false

function confirmPopup() {
	if (reminderCustomForm.value !== null && reminderCustomForm.value.relativePeriod !== 0) {
		popupFields.value.reminders.push(reminderCustomForm.value)
		reminderCustomForm.value = null
	}
	popupConfirmed = true
	fields.value = copyFieldState(popupFields.value)
	openPopup.value = null
}

// --- Change tracking ---

function snapshotField(src: FieldState, popup: Exclude<PopupKind, null>): string {
	switch (popup) {
		case 'assignee': return JSON.stringify(src.assignees.map(a => a.id).sort())
		case 'labels': return JSON.stringify(src.labels.map(l => l.id).sort())
		case 'reminder': return JSON.stringify(src.reminders.map(r => r.relativePeriod).sort())
		case 'priority': return String(src.priority)
		case 'color': return src.color
		case 'percentDone': return String(src.percentDone)
		case 'due': return src.dueDate?.toISOString() ?? ''
		case 'start': return src.startDate?.toISOString() ?? ''
		case 'endDate': return src.endDate?.toISOString() ?? ''
		default: return ''
	}
}

const hasPopupChanges = computed(() => {
	if (openPopup.value === null) return false
	return snapshotField(popupFields.value, openPopup.value) !== snapshotField(fields.value, openPopup.value)
})

// --- Popup positioning ---

const anchorChipRect = ref<DOMRect | null>(null)
let popupResizeObserver: ResizeObserver | null = null

function preloadPopupData() {
	if (projectMembers.value.length === 0) {
		loadProjectMembers()
	}
}

function toggleInlinePopup(which: Exclude<PopupKind, null>, event: MouseEvent) {
	if (openPopup.value === which) {
		openPopup.value = null
		return
	}
	const chip = event.currentTarget as HTMLElement
	const rect = chip.getBoundingClientRect()
	anchorChipRect.value = rect
	popupPosition.value = {
		top: rect.bottom + 4,
		left: rect.left,
	}
	isPopupReady.value = false
	openPopup.value = which
	nextTick(() => {
		clampPopupToViewport()
		isPopupReady.value = true
		observePopupResize()
	})
}

function clampPopupToViewport() {
	const popup = popupRef.value
	const chipRect = anchorChipRect.value
	if (!popup || !chipRect) {
		return
	}
	const margin = 8
	const popupRect = popup.getBoundingClientRect()
	let top = chipRect.bottom + 4
	let left = chipRect.left

	if (top + popupRect.height + margin > window.innerHeight) {
		top = chipRect.top - popupRect.height - 4
	}
	if (top < margin) {
		top = margin
	}

	if (left + popupRect.width + margin > window.innerWidth) {
		left = Math.max(margin, window.innerWidth - popupRect.width - margin)
	}

	popupPosition.value = {top, left}
}

function observePopupResize() {
	disconnectPopupResize()
	const popup = popupRef.value
	if (!popup || typeof ResizeObserver === 'undefined') {
		return
	}
	popupResizeObserver = new ResizeObserver(() => {
		requestAnimationFrame(() => clampPopupToViewport())
	})
	popupResizeObserver.observe(popup)
}

function disconnectPopupResize() {
	if (popupResizeObserver) {
		popupResizeObserver.disconnect()
		popupResizeObserver = null
	}
}

watch(openPopup, (newVal, oldVal) => {
	if (newVal !== null) {
		popupFields.value = copyFieldState(fields.value)
	}
	if (newVal === null) {
		disconnectPopupResize()
		anchorChipRect.value = null
		isPopupReady.value = false
		reminderCustomForm.value = null

		if (oldVal !== null && popupConfirmed && isEditMode.value) {
			saveEditField(oldVal)
		}

		popupConfirmed = false
	}
})

function onDocumentClick(e: MouseEvent) {
	if (openPopup.value !== null && popupRef.value) {
		closeWhenClickedOutside(e, popupRef.value, () => {
			openPopup.value = null
		})
	}
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => {
	document.removeEventListener('click', onDocumentClick)
	disconnectPopupResize()
})

// --- Chip rendering ---

type InlineChip = {
	field: string
	modifier: string
	icon: string
	popup: Exclude<PopupKind, null>
	isSet: boolean
	isOverdue: boolean
	label: string
	colorValue?: string
	assignees?: IUser[]
	labels?: ILabel[]
}

const CHIP_CONFIG: Record<string, {modifier: string, icon: string, popup: Exclude<PopupKind, null>}> = {
	assignee: {modifier: 'assignee', icon: 'user', popup: 'assignee'},
	dueDate: {modifier: 'due', icon: 'calendar', popup: 'due'},
	startDate: {modifier: 'start', icon: 'play', popup: 'start'},
	endDate: {modifier: 'end', icon: 'stop', popup: 'endDate'},
	priority: {modifier: 'priority', icon: 'exclamation', popup: 'priority'},
	labels: {modifier: 'labels', icon: 'tags', popup: 'labels'},
	reminder: {modifier: 'reminder', icon: 'bell', popup: 'reminder'},
	color: {modifier: 'color', icon: 'fill-drip', popup: 'color'},
	percentDone: {modifier: 'percent', icon: 'percent', popup: 'percentDone'},
}

const assigneeChipLabel = computed(() => {
	const count = fields.value.assignees.length
	if (count === 0) return t('task.attributes.assignees')
	if (count === 1) return fields.value.assignees[0].name || fields.value.assignees[0].username
	return t('task.attributes.assigneesN', count)
})

const labelsChipLabel = computed(() => {
	const count = fields.value.labels.length
	if (count === 0) return t('task.attributes.labels')
	if (count === 1) return fields.value.labels[0].title
	return t('task.attributes.labelsN', count)
})

const reminderChipLabel = computed(() => {
	const count = fields.value.reminders.length
	if (count === 0) return t('task.attributes.reminders')
	return t('task.attributes.remindersN', count)
})

const inlineChips = computed<InlineChip[]>(() => {
	const formatDate = isEditMode.value ? formatDisplayDate : formatDateShort
	const chipLabel: Record<string, () => string> = {
		assignee: () => assigneeChipLabel.value,
		dueDate: () => fields.value.dueDate !== null ? formatDate(fields.value.dueDate) : t('task.attributes.dueDate'),
		startDate: () => fields.value.startDate !== null ? formatDate(fields.value.startDate) : t('task.attributes.startDate'),
		endDate: () => fields.value.endDate !== null ? formatDate(fields.value.endDate) : t('task.attributes.endDate'),
		priority: () => fields.value.priority !== 0 ? t(`task.priority.${PRIORITY_LABEL_KEYS[fields.value.priority]}`) : t('task.attributes.priority'),
		labels: () => labelsChipLabel.value,
		reminder: () => reminderChipLabel.value,
		color: () => t('task.attributes.color'),
		percentDone: () => fields.value.percentDone > 0 ? `${fields.value.percentDone}%` : t('task.attributes.percentDone'),
	}
	const chipIsSet: Record<string, () => boolean> = {
		assignee: () => fields.value.assignees.length > 0,
		dueDate: () => fields.value.dueDate !== null,
		startDate: () => fields.value.startDate !== null,
		endDate: () => fields.value.endDate !== null,
		priority: () => fields.value.priority !== 0,
		labels: () => fields.value.labels.length > 0,
		reminder: () => fields.value.reminders.length > 0,
		color: () => fields.value.color !== '',
		percentDone: () => fields.value.percentDone > 0,
	}

	const now = new Date()
	function isDateOverdue(d: Date | null): boolean {
		return d !== null && d.getTime() < now.getTime()
	}

	const chips = enabledFields.value.map(field => {
		const cfg = CHIP_CONFIG[field]
		const isOverdue = field === 'dueDate' && isDateOverdue(fields.value.dueDate)
			|| field === 'endDate' && isDateOverdue(fields.value.endDate)
		return {
			field,
			modifier: cfg.modifier,
			icon: cfg.icon,
			popup: cfg.popup,
			isSet: chipIsSet[field](),
			isOverdue,
			label: chipLabel[field](),
			colorValue: field === 'color' && fields.value.color ? fields.value.color : undefined,
			assignees: field === 'assignee' && fields.value.assignees.length > 0 ? fields.value.assignees : undefined,
			labels: field === 'labels' && fields.value.labels.length > 0 ? fields.value.labels : undefined,
		}
	})

	if (isEditMode.value && props.variant !== 'inline') {
		return chips.filter(c => !c.isSet)
	}

	if (isEditMode.value && props.variant === 'inline') {
		return [...chips].sort((a, b) => Number(b.isSet) - Number(a.isSet))
	}

	return chips
})

function clearField(field: string) {
	const clearMap: Record<string, () => void> = {
		assignee: () => { fields.value.assignees = [] },
		dueDate: () => { fields.value.dueDate = null },
		startDate: () => { fields.value.startDate = null },
		endDate: () => { fields.value.endDate = null },
		priority: () => { fields.value.priority = 0 },
		labels: () => { fields.value.labels = [] },
		reminder: () => { fields.value.reminders = [] },
		color: () => { fields.value.color = '' },
		percentDone: () => { fields.value.percentDone = 0 },
	}
	clearMap[field]?.()

	if (isEditMode.value) {
		const popup = CHIP_CONFIG[field]?.popup
		if (popup) {
			saveEditField(popup)
		}
	}
}

// --- Public API ---

function getFieldValues() {
	return {
		dueDate: isEnabled('dueDate') && fields.value.dueDate !== null ? fields.value.dueDate : undefined,
		startDate: isEnabled('startDate') && fields.value.startDate !== null ? fields.value.startDate : undefined,
		endDate: isEnabled('endDate') && fields.value.endDate !== null ? fields.value.endDate : undefined,
		priority: isEnabled('priority') && fields.value.priority !== 0 ? fields.value.priority : undefined,
		hexColor: isEnabled('color') && fields.value.color !== '' ? fields.value.color : undefined,
		percentDone: isEnabled('percentDone') && fields.value.percentDone > 0 ? fields.value.percentDone : undefined,
		assignees: isEnabled('assignee') ? [...fields.value.assignees] : [],
		labels: isEnabled('labels') ? [...fields.value.labels] : [],
		reminders: isEnabled('reminder') ? [...fields.value.reminders] : [],
	}
}

function reset() {
	fields.value = emptyFieldState()
	openPopup.value = null
}

function containsElement(el: Element | null): boolean {
	return el !== null && popupRef.value?.contains(el) === true
}

const isPopupOpen = computed(() => openPopup.value !== null)
const taskColor = computed(() => fields.value.color)

async function openForField(field: string, anchorEl: HTMLElement) {
	const cfg = CHIP_CONFIG[field]
	if (!cfg) return

	if (openPopup.value === cfg.popup) {
		openPopup.value = null
		return
	}

	const rect = anchorEl.getBoundingClientRect()
	anchorChipRect.value = rect
	popupPosition.value = {
		top: rect.bottom + 4,
		left: rect.left,
	}
	isPopupReady.value = false
	openPopup.value = cfg.popup
	nextTick(() => {
		clampPopupToViewport()
		isPopupReady.value = true
		observePopupResize()
	})
}

defineExpose({
	getFieldValues,
	reset,
	containsElement,
	hasAnyField,
	isPopupOpen,
	taskColor,
	openForField,
})
</script>

<style lang="scss" scoped>
.inline-quick-add-chip-bar {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: .375rem;
	margin-block-start: .5rem;
}

.inline-quick-add-chip-bar--inline {
	display: flex;
	flex-wrap: wrap;
	grid-template-columns: unset;
	gap: .25rem;
	margin-block-start: .25rem;

	.inline-quick-add-chip:not(.is-set) {
		opacity: .45;
	}
}

.inline-quick-add-chip {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: .4rem;
	padding: .3rem .65rem;
	border: 1px solid transparent;
	border-radius: $radius;
	background: transparent;
	color: var(--grey-700);
	font-size: .8rem;
	font-weight: 500;
	line-height: 1.2;
	cursor: pointer;
	transition: background-color $transition, color $transition, border-color $transition, box-shadow $transition;

	&:hover:not(:disabled) {
		background: var(--primary-light);
		color: var(--primary-dark);
		box-shadow: 0 1px 4px hsla(var(--primary-hsl), .2);
	}

	&:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--primary-light);
	}

	&:disabled {
		cursor: not-allowed;
		opacity: .5;
	}
}

.inline-quick-add-chip__icon {
	font-size: .85rem;
	color: var(--grey-500);
}

.inline-quick-add-chip:not(.is-set) .inline-quick-add-chip__icon {
	&--due {
		color: var(--danger);
	}

	&--start {
		color: var(--success);
	}

	&--priority {
		color: var(--warning);
	}

	&--assignee,
	&--labels,
	&--reminder {
		color: var(--primary);
	}
}

.inline-quick-add-chip.is-overdue .inline-quick-add-chip__icon {
	color: var(--danger-dark);
}

.inline-quick-add-chip__avatar {
	:deep(.avatar) {
		border-radius: 50%;
	}

	& + .inline-quick-add-chip__avatar {
		margin-inline-start: -.35rem;
	}
}

.inline-quick-add-chip__label {
	pointer-events: none;
}

.inline-quick-add-chip__swatch {
	display: inline-block;
	inline-size: .85rem;
	block-size: .85rem;
	border-radius: .2rem;
	border: 1px solid var(--grey-300);
	flex-shrink: 0;
}

.inline-quick-add-chip__clear {
	display: none;
	align-items: center;
	justify-content: center;
	position: absolute;
	inset-inline-end: 0;
	inset-block-start: 0;
	block-size: 100%;
	padding-inline: .25rem;
	font-size: .65rem;
	background: transparent;
	border-radius: 0 $radius $radius 0;
	z-index: 1;
	color: inherit;

	&:hover {
		color: var(--danger);
	}
}

.inline-quick-add-chip:hover .inline-quick-add-chip__clear {
	display: flex;
}

.inline-quick-add-chip.is-set {
	background: var(--grey-100);
	color: var(--grey-700);
	border-color: var(--grey-200);
}

.inline-quick-add-chip--labels.is-set {
	background: transparent;
	border-color: transparent;
	padding: 0;
	gap: .25rem;

	&:hover:not(:disabled) {
		background: transparent;
		box-shadow: none;
	}
}

.inline-quick-add-chip.is-overdue {
	background: var(--danger-light);
	color: var(--danger-dark);
	border-color: transparent;
}

.inline-quick-add-popup {
	position: fixed;
	z-index: 50;
	padding: .5rem;
	background: var(--white);
	border: 1px solid var(--grey-200);
	border-radius: $radius;
	box-shadow: var(--shadow-md);
}

.inline-quick-add-popup--measuring {
	visibility: hidden;
}

.inline-quick-add-custom-button {
	inline-size: 100%;
	padding: .5rem .75rem;
	border: 0;
	border-radius: $radius;
	background: transparent;
	color: var(--grey-500);
	text-align: start;
	font-size: .85rem;
	cursor: pointer;
	border-block-start: 1px solid var(--grey-200);
	margin-block-start: .25rem;
	padding-block-start: .625rem;

	&:hover {
		background: var(--primary-light);
		color: var(--primary-dark);
	}
}

.inline-label-option {
	display: flex;
	align-items: center;
	gap: .5rem;

	&__swatch {
		display: inline-block;
		inline-size: .75rem;
		block-size: .75rem;
		border-radius: .2rem;
		border: 1px solid var(--grey-300);
		flex-shrink: 0;
	}
}

.inline-color-option {
	display: flex;
	align-items: center;
	gap: .5rem;

	&__swatch {
		display: inline-block;
		inline-size: 1rem;
		block-size: 1rem;
		border-radius: .25rem;
		border: 1px solid var(--grey-300);
		flex-shrink: 0;
	}
}

.inline-quick-add-color-picker {
	padding: .5rem;
	border-block-start: 1px solid var(--grey-200);
}

.inline-quick-add-percent-done {
	display: flex;
	align-items: center;
	gap: .75rem;
	padding: .5rem .25rem;

	&__slider {
		flex: 1;
		accent-color: var(--primary);
	}

	&__label {
		min-inline-size: 3rem;
		text-align: end;
		font-weight: 600;
		font-size: .9rem;
	}
}

.inline-quick-add-popup--picker {
	inline-size: min(18rem, calc(100vw - 2rem));

	:deep(.color-picker-container) {
		justify-content: start;
	}
}

.inline-quick-add-popup--date {
	display: flex;
	flex-direction: column;
	max-inline-size: calc(100vw - 1rem);
}

.inline-quick-add-popup--date :deep(.datepicker-inline) {
	flex-direction: row;
	gap: .75rem;
	align-items: stretch;
}

.inline-quick-add-popup--date :deep(.datepicker-inline__shortcuts) {
	display: flex;
	flex-direction: column;
	flex-shrink: 0;
}

.inline-quick-add-popup--date :deep(.datepicker-inline__shortcuts .datepicker__quick-select-date) {
	flex: 1 1 auto;
	block-size: auto;
}

.inline-quick-add-popup--date :deep(.flatpickr-container) {
	flex: 0 1 auto;
}

.inline-quick-add-popup--date :deep(.flatpickr-container > input) {
	display: none;
}

.inline-quick-add-popup__confirm {
	inline-size: 100%;
	margin-block-start: .5rem;
}

@media (width <= 520px) {
	.inline-quick-add-popup--date :deep(.datepicker-inline) {
		flex-direction: column;
	}
}
</style>
