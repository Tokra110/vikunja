<template>
	<div class="datepicker">
		<SimpleButton
			class="show"
			:disabled="disabled || undefined"
			@click.stop="toggleDatePopup"
		>
			{{ date === null ? chooseDateLabel : formatDisplayDate(date) }}
		</SimpleButton>

		<CustomTransition name="fade">
			<div
				v-if="show"
				ref="datepickerPopup"
				class="datepicker-popup"
			>
				<DatepickerInline
					v-model="date"
					@update:modelValue="updateData"
				/>

				<div class="datepicker-popup__actions">
					<BaseButton
						v-if="date !== null"
						v-cy="'removeDatepicker'"
						class="datepicker__remove-button"
						:title="$t('misc.delete')"
						@click="removeDate"
					>
						<Icon icon="trash-alt" />
					</BaseButton>
					<XButton
						v-cy="'closeDatepicker'"
						class="datepicker__close-button"
						:shadow="false"
						@click="close"
					>
						{{ $t('misc.confirm') }}
					</XButton>
				</div>
			</div>
		</CustomTransition>
	</div>
</template>

<script setup lang="ts">
import {ref, onMounted, onBeforeUnmount, toRef, watch} from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import CustomTransition from '@/components/misc/CustomTransition.vue'
import DatepickerInline from '@/components/input/DatepickerInline.vue'
import SimpleButton from '@/components/input/SimpleButton.vue'

import {formatDisplayDate} from '@/helpers/time/formatDate'
import {closeWhenClickedOutside} from '@/helpers/closeWhenClickedOutside'
import {createDateFromString} from '@/helpers/time/createDateFromString'
import {useI18n} from 'vue-i18n'

const props = withDefaults(defineProps<{
	modelValue: Date | null | string,
	chooseDateLabel?: string,
	disabled?: boolean,
}>(), {
	chooseDateLabel: () => {
		const {t} = useI18n({useScope: 'global'})
		return t('input.datepicker.chooseDate')
	},
	disabled: false,
})

const emit = defineEmits<{
	'update:modelValue': [value: Date | null],
	'close': [value: boolean],
	'closeOnChange': [value: boolean],
}>()

const date = ref<Date | null>(null)
const show = ref(false)
const changed = ref(false)

onMounted(() => document.addEventListener('click', hideDatePopup))
onBeforeUnmount(() =>document.removeEventListener('click', hideDatePopup))

const modelValue = toRef(props, 'modelValue')
watch(
	modelValue,
	setDateValue,
	{immediate: true},
)

function setDateValue(dateString: string | Date | null) {
	if (dateString === null) {
		date.value = null
		return
	}
	date.value = createDateFromString(dateString)
}

function updateData() {
	changed.value = true
	emit('update:modelValue', date.value ?? null)
}

function removeDate() {
	date.value = null
	updateData()
	close()
}

function toggleDatePopup() {
	if (props.disabled) {
		return
	}

	show.value = !show.value
}

const datepickerPopup = ref<HTMLElement | null>(null)
function hideDatePopup(e: MouseEvent) {
	if (show.value && datepickerPopup.value) {
		closeWhenClickedOutside(e, datepickerPopup.value, close)
	}
}

function close() {
	// Kind of dirty, but the timeout allows us to enter a time and click on "confirm" without
	// having to click on another input field before it is actually used.
	setTimeout(() => {
		show.value = false
		emit('close', changed.value)
		if (changed.value) {
			changed.value = false
			emit('closeOnChange', changed.value)
		}
	}, 200)
}
</script>

<style lang="scss" scoped>
.datepicker {
	input.input {
		display: none;
	}
}

.datepicker-popup {
	position: absolute;
	z-index: 99;
	inline-size: 320px;
	background: var(--white);
	border-radius: $radius;
	box-shadow: $shadow;

	@media screen and (max-width: ($tablet)) {
		inline-size: calc(100vw - 5rem);
	}
}

.datepicker-popup__actions {
	display: flex;
	align-items: stretch;
	gap: .5rem;
	margin: 1rem;
}

.datepicker__close-button {
	flex: 1;
}

.datepicker__remove-button {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 auto;
	padding-inline: .85rem;
	border-radius: $radius;
	color: var(--danger);
	transition: background-color $transition, color $transition;

	&:hover {
		background: var(--danger);
		color: var(--white);
	}
}

:deep(.flatpickr-calendar) {
	margin: 0 auto 8px;
	box-shadow: none;
}
</style>
