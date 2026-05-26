<template>
	<div class="datepicker-inline">
		<div class="datepicker-inline__left">
			<div class="datepicker-inline__shortcuts">
				<BaseButton
					v-for="preset in activePresets"
					:key="preset.key"
					class="datepicker__quick-select-date"
					@click.stop="setDate(preset.key)"
				>
					<span class="icon"><Icon :icon="preset.icon" /></span>
					<span class="text">
						<span>{{ $t(`input.datepicker.${preset.key}`) }}</span>
						<span class="weekday">{{ getWeekdayFromStringInterval(preset.key) }}</span>
					</span>
				</BaseButton>
			</div>

			<div
				class="datepicker-inline__time"
				@click.stop
			>
				<Icon
					:icon="['far', 'clock']"
					class="datepicker-inline__time-icon"
				/>
				<div class="datepicker-inline__time-spinner">
					<button
						type="button"
						class="datepicker-inline__time-arrow datepicker-inline__time-arrow--up"
						tabindex="-1"
						@click="onTimeWheel('hours', {deltaY: -1, preventDefault(){}} as WheelEvent)"
					>
						<Icon icon="chevron-up" />
					</button>
					<input
						ref="hoursInputRef"
						type="number"
						class="datepicker-inline__time-input"
						:value="timeHours"
						min="0"
						:max="is24h ? 23 : 12"
						@input="onHoursInput"
						@wheel.prevent="onTimeWheel('hours', $event)"
					>
					<button
						type="button"
						class="datepicker-inline__time-arrow datepicker-inline__time-arrow--down"
						tabindex="-1"
						@click="onTimeWheel('hours', {deltaY: 1, preventDefault(){}} as WheelEvent)"
					>
						<Icon icon="chevron-down" />
					</button>
				</div>
				<span class="datepicker-inline__time-sep">:</span>
				<div class="datepicker-inline__time-spinner">
					<button
						type="button"
						class="datepicker-inline__time-arrow datepicker-inline__time-arrow--up"
						tabindex="-1"
						@click="onTimeWheel('minutes', {deltaY: -1, preventDefault(){}} as WheelEvent)"
					>
						<Icon icon="chevron-up" />
					</button>
					<input
						ref="minutesInputRef"
						type="number"
						class="datepicker-inline__time-input"
						:value="timeMinutes"
						min="0"
						max="59"
						@input="onMinutesInput"
						@wheel.prevent="onTimeWheel('minutes', $event)"
					>
					<button
						type="button"
						class="datepicker-inline__time-arrow datepicker-inline__time-arrow--down"
						tabindex="-1"
						@click="onTimeWheel('minutes', {deltaY: 1, preventDefault(){}} as WheelEvent)"
					>
						<Icon icon="chevron-down" />
					</button>
				</div>
				<button
					v-if="!is24h"
					type="button"
					class="datepicker-inline__time-ampm"
					@click="toggleAmPm"
				>
					{{ amPm }}
				</button>
			</div>
		</div>

		<div class="flatpickr-container">
			<flat-pickr
				ref="flatPickrRef"
				v-model="flatPickrDate"
				:config="flatPickerConfig"
			/>
		</div>
	</div>
</template>

<script lang="ts" setup>
import {computed, onBeforeUnmount, onMounted, ref, toRef, watch} from 'vue'
import flatPickr from 'vue-flatpickr-component'
import 'flatpickr/dist/flatpickr.css'

import BaseButton from '@/components/base/BaseButton.vue'

import {formatDate} from '@/helpers/time/formatDate'
import {calculateDayInterval} from '@/helpers/time/calculateDayInterval'
import {calculateNearestHours} from '@/helpers/time/calculateNearestHours'
import {createDateFromString} from '@/helpers/time/createDateFromString'
import {useI18n} from 'vue-i18n'
import {useFlatpickrLanguage} from '@/helpers/useFlatpickrLanguage'
import {useTimeFormat} from '@/composables/useTimeFormat'
import {TIME_FORMAT} from '@/constants/timeFormat'

const props = defineProps<{
	modelValue: Date | null | string
}>()

const emit = defineEmits<{
	'update:modelValue': [Date | null],
}>()

const {t} = useI18n({useScope: 'global'})
const {store: timeFormat} = useTimeFormat()

const date = ref<Date | null>(null)
const changed = ref(false)

const modelValue = toRef(props, 'modelValue')
watch(
	modelValue,
	setDateValue,
	{immediate: true},
)

const is24h = computed(() => timeFormat.value === TIME_FORMAT.HOURS_24)

const flatPickrRef = ref<InstanceType<typeof flatPickr> | null>(null)
const flatPickerConfig = computed(() => ({
	altFormat: t('date.altFormatLong'),
	altInput: true,
	dateFormat: 'Y-m-d H:i',
	enableTime: true,
	time_24hr: true,
	inline: true,
	locale: useFlatpickrLanguage().value,
}))

function formatDateToFlatpickrString(date: Date): string {
	const year = date.getFullYear()
	const month = (date.getMonth() + 1).toString().padStart(2, '0')
	const day = date.getDate().toString().padStart(2, '0')
	const hours = date.getHours().toString().padStart(2, '0')
	const minutes = date.getMinutes().toString().padStart(2, '0')

	return `${year}-${month}-${day} ${hours}:${minutes}`
}

// Since flatpickr dates are strings, we need to convert them to native date objects.
// To make that work, we need a separate variable since flatpickr does not have a change event.
const flatPickrDate = computed({
	set(newValue: string | Date | null) {
		if (newValue === null) {
			date.value = null
			return
		}

		if (date.value && formatDateToFlatpickrString(date.value) === newValue) {
			return
		}
		date.value = createDateFromString(newValue)
		updateData()
	},
	get() {
		if (!date.value) {
			return ''
		}

		return formatDateToFlatpickrString(date.value)
	},
})

function handleMonthWheel(e: WheelEvent) {
	e.preventDefault()
	const fp = flatPickrRef.value?.fp
	if (!fp) return
	if (e.deltaY < 0) fp.changeMonth(1)
	else fp.changeMonth(-1)
}

function handleYearWheel(e: WheelEvent) {
	e.preventDefault()
	const fp = flatPickrRef.value?.fp
	if (!fp) return
	if (e.deltaY < 0) fp.changeYear(fp.currentYear + 1)
	else fp.changeYear(fp.currentYear - 1)
}

onMounted(() => {
	const container = flatPickrRef.value?.$el.parentNode
	const inputs = container?.querySelectorAll('.numInputWrapper > input.numInput')
	inputs?.forEach((i: Element) => {
		i.addEventListener('input', handleFlatpickrInput)
	})

	const monthEl = container?.querySelector('.flatpickr-current-month .flatpickr-monthDropdown-months, .flatpickr-current-month span.cur-month')
	monthEl?.addEventListener('wheel', handleMonthWheel, {passive: false})

	const yearEl = container?.querySelector('.flatpickr-current-month .cur-year')
	yearEl?.addEventListener('wheel', handleYearWheel, {passive: false})
})

onBeforeUnmount(() => {
	const container = flatPickrRef.value?.$el.parentNode
	const inputs = container?.querySelectorAll('.numInputWrapper > input.numInput')
	inputs?.forEach((i: Element) => {
		i.removeEventListener('input', handleFlatpickrInput)
	})

	const monthEl = container?.querySelector('.flatpickr-current-month .flatpickr-monthDropdown-months, .flatpickr-current-month span.cur-month')
	monthEl?.removeEventListener('wheel', handleMonthWheel)

	const yearEl = container?.querySelector('.flatpickr-current-month .cur-year')
	yearEl?.removeEventListener('wheel', handleYearWheel)
})

function handleFlatpickrInput(e: Event) {
	const newDate = new Date(date?.value || 'now')
	const target = e.target as HTMLInputElement
	if (target.classList.contains('flatpickr-minute')) {
		newDate.setMinutes(Number(target.value))
	}
	if (target.classList.contains('flatpickr-hour')) {
		newDate.setHours(Number(target.value))
	}
	if (target.classList.contains('cur-year')) {
		newDate.setFullYear(Number(target.value))
	}
	flatPickrDate.value = newDate
}


function setDateValue(dateString: string | Date | null) {
	if (dateString === null) {
		date.value = null
		return
	}
	date.value = createDateFromString(dateString)
}

function updateData() {
	changed.value = true
	emit('update:modelValue', date.value)
}

type IconSpec = string | string[]

interface DatePreset {
	key: string
	icon: IconSpec
}

const ALL_PRESETS: (DatePreset & {available?: () => boolean})[] = [
	{key: 'today', icon: ['far', 'calendar-alt'], available: () => new Date().getHours() < 21},
	{key: 'tomorrow', icon: ['far', 'sun']},
	{key: 'laterThisWeek', icon: 'chess-knight'},
	{key: 'thisFriday', icon: ['far', 'star']},
	{key: 'thisWeekend', icon: 'cocktail'},
	{key: 'nextMonday', icon: 'coffee'},
	{key: 'nextFriday', icon: ['far', 'star']},
	{key: 'nextWeek', icon: 'forward'},
]

const MAX_PRESETS = 6

const activePresets = computed<DatePreset[]>(() => {
	const candidates = ALL_PRESETS
		.filter(p => p.available === undefined || p.available())
		.map(p => ({
			key: p.key,
			icon: p.icon,
			interval: calculateDayInterval(p.key),
		}))
		.filter(p => p.interval > 0 || p.key === 'today')

	const seen = new Set<number>()
	const unique = candidates.filter(p => {
		if (seen.has(p.interval)) return false
		seen.add(p.interval)
		return true
	})

	return unique
		.sort((a, b) => a.interval - b.interval)
		.slice(0, MAX_PRESETS)
})

function setDate(dateString: string) {
	const interval = calculateDayInterval(dateString)
	const newDate = new Date()
	newDate.setDate(newDate.getDate() + interval)
	newDate.setHours(calculateNearestHours(newDate))
	newDate.setMinutes(0)
	newDate.setSeconds(0)
	date.value = newDate
	updateData()
}

function getWeekdayFromStringInterval(dateString: string) {
	const interval = calculateDayInterval(dateString)
	const newDate = new Date()
	newDate.setDate(newDate.getDate() + interval)
	return formatDate(newDate, 'ddd')
}

// --- Custom time inputs ---

const hoursInputRef = ref<HTMLInputElement | null>(null)
const minutesInputRef = ref<HTMLInputElement | null>(null)

const timeHours = computed(() => {
	if (!date.value) return '09'
	const h = date.value.getHours()
	if (is24h.value) return String(h).padStart(2, '0')
	const h12 = h % 12 || 12
	return String(h12).padStart(2, '0')
})

const timeMinutes = computed(() => {
	if (!date.value) return '00'
	return String(date.value.getMinutes()).padStart(2, '0')
})

const amPm = computed(() => {
	if (!date.value) return 'AM'
	return date.value.getHours() >= 12 ? 'PM' : 'AM'
})

function setTime(hours: number, minutes: number) {
	const d = date.value ? new Date(date.value) : new Date()
	d.setHours(hours)
	d.setMinutes(minutes)
	d.setSeconds(0)
	date.value = d
	updateData()
}

function onHoursInput(e: Event) {
	const target = e.target as HTMLInputElement
	let h = parseInt(target.value, 10)
	if (isNaN(h)) return
	if (!is24h.value) {
		const waspm = date.value ? date.value.getHours() >= 12 : false
		if (h === 12) h = waspm ? 12 : 0
		else if (waspm) h += 12
	}
	h = Math.max(0, Math.min(23, h))
	setTime(h, date.value?.getMinutes() ?? 0)
}

function onMinutesInput(e: Event) {
	const target = e.target as HTMLInputElement
	let m = parseInt(target.value, 10)
	if (isNaN(m)) return
	m = Math.max(0, Math.min(59, m))
	setTime(date.value?.getHours() ?? 9, m)
}

function onTimeWheel(field: 'hours' | 'minutes', e: WheelEvent) {
	const delta = e.deltaY < 0 ? 1 : -1
	const d = date.value ? new Date(date.value) : new Date()
	if (field === 'hours') {
		d.setHours(((d.getHours() + delta) % 24 + 24) % 24)
	} else {
		d.setMinutes(((d.getMinutes() + delta) % 60 + 60) % 60)
	}
	d.setSeconds(0)
	date.value = d
	updateData()
}

function toggleAmPm() {
	if (!date.value) return
	const d = new Date(date.value)
	d.setHours((d.getHours() + 12) % 24)
	date.value = d
	updateData()
}
</script>

<style lang="scss" scoped>
.datepicker-inline {
	display: flex;
	flex-direction: row;
	align-items: stretch;
	inline-size: 450px;
}

.datepicker-inline__left {
	flex: 0 0 40%;
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	border-inline-end: 1px solid var(--grey-200);
}

.flatpickr-container {
	flex: 0 0 60%;
	overflow: hidden;
}

.flatpickr-container :deep(.flatpickr-calendar),
.flatpickr-container :deep(.flatpickr-days),
.flatpickr-container :deep(.dayContainer) {
	width: 100% !important;
	min-width: 0 !important;
	max-width: 100% !important;
}

.datepicker-inline__shortcuts {
	display: flex;
	flex-direction: column;
	gap: 1px;
	padding: .25rem;
}

.datepicker__quick-select-date {
	display: flex;
	align-items: center;
	padding: .3rem .5rem;
	inline-size: 100%;
	color: var(--text);
	cursor: pointer;
	border-radius: $radius;
	transition: background-color $transition, color $transition;

	&:hover {
		background: var(--primary-light);
		color: var(--primary-dark);

		.icon {
			color: var(--primary);
		}
	}

	.text {
		inline-size: 100%;
		font-size: .8rem;
		display: flex;
		justify-content: space-between;
		gap: .5rem;

		.weekday {
			color: var(--text-light);
			font-size: .75rem;
			text-transform: capitalize;
		}
	}

	.icon {
		inline-size: 1.5rem;
		flex-shrink: 0;
		text-align: center;
		font-size: .75rem;
		color: var(--grey-400);
	}
}

.datepicker-inline__time {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: .35rem;
	padding: .5rem;
	border-block-start: 1px solid var(--grey-200);
	margin-block-start: auto;
}

.datepicker-inline__time-icon {
	color: var(--grey-400);
	font-size: .8rem;
	margin-inline-end: .15rem;
}

.datepicker-inline__time-spinner {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
}

.datepicker-inline__time-arrow {
	display: flex;
	align-items: center;
	justify-content: center;
	inline-size: 2.5rem;
	block-size: 14px;
	padding: 0;
	border: none;
	border-radius: $radius;
	background: transparent;
	color: var(--grey-400);
	font-size: .5rem;
	cursor: pointer;
	transition: color $transition, background-color $transition;

	&:hover {
		color: var(--primary);
		background: var(--primary-light);
	}
}

.datepicker-inline__time-input {
	inline-size: 2.5rem;
	padding: .15rem;
	border: 1px solid var(--grey-200);
	border-radius: $radius;
	background: var(--grey-100);
	color: var(--text);
	font-size: .85rem;
	text-align: center;
	font-variant-numeric: tabular-nums;
	-moz-appearance: textfield;

	&::-webkit-inner-spin-button,
	&::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	&:focus {
		outline: none;
		border-color: var(--primary);
	}
}

.datepicker-inline__time-sep {
	color: var(--grey-400);
	font-weight: 600;
	font-size: .85rem;
	align-self: center;
}

.datepicker-inline__time-ampm {
	padding: .2rem .4rem;
	border: 1px solid var(--grey-200);
	border-radius: $radius;
	background: var(--grey-100);
	color: var(--text);
	font-size: .75rem;
	font-weight: 600;
	cursor: pointer;
	align-self: center;

	&:hover {
		background: var(--primary-light);
		color: var(--primary-dark);
	}
}

.flatpickr-container :deep(.flatpickr-calendar) {
	margin: 0 auto;
	box-shadow: none;
}

.flatpickr-container :deep(.flatpickr-time) {
	display: none;
}

.flatpickr-container :deep(.input) {
	border: none;
}
</style>
