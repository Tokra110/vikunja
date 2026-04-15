<script setup lang="ts">
import {computed, useId} from 'vue'

interface Props {
	modelValue?: string | number | null
	id?: string
	disabled?: boolean
	loading?: boolean
	error?: string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
	'update:modelValue': [value: string | number]
}>()

defineOptions({inheritAttrs: false})

const fallbackId = useId()
const selectId = computed(() => props.id ?? fallbackId)

const wrapperClasses = computed(() => [
	'select',
	{'is-loading': props.loading},
])

function handleChange(event: Event) {
	const value = (event.target as HTMLSelectElement).value
	if (typeof props.modelValue === 'number') {
		emit('update:modelValue', value === '' ? '' : Number(value))
	} else {
		emit('update:modelValue', value)
	}
}
</script>

<template>
	<div :class="wrapperClasses">
		<select
			:id="selectId"
			v-bind="$attrs"
			:value="modelValue"
			:disabled="disabled || undefined"
			@change="handleChange"
		>
			<slot />
		</select>
	</div>
	<p
		v-if="error"
		class="help is-danger"
	>
		{{ error }}
	</p>
</template>
