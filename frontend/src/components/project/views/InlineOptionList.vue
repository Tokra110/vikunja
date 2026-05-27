<template>
	<ul class="inline-option-list">
		<li
			v-for="(option, idx) in options"
			:key="option.key ?? idx"
		>
			<button
				type="button"
				class="inline-option-list__item"
				:class="{'is-active': option.active}"
				@click="$emit('select', option, idx)"
			>
				<span class="inline-option-list__content">
					<slot
						name="option"
						:option="option"
						:index="idx"
					>
						{{ option.label }}
					</slot>
				</span>
				<Icon
					v-if="option.active"
					icon="check"
					class="inline-option-list__check"
				/>
			</button>
		</li>
		<slot name="footer" />
	</ul>
</template>

<script lang="ts">
export interface InlineOption {
	label: string
	active: boolean
	key?: string | number
}
</script>

<script setup lang="ts">
defineProps<{
	options: InlineOption[]
}>()

defineEmits<{
	select: [option: InlineOption, index: number]
}>()
</script>

<style lang="scss" scoped>
.inline-option-list {
	display: flex;
	flex-direction: column;
	gap: .125rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.inline-option-list__item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	inline-size: 100%;
	padding: .5rem .75rem;
	border: 0;
	border-radius: $radius;
	background: transparent;
	color: var(--text);
	text-align: start;
	font-size: .9rem;
	cursor: pointer;

	&:hover {
		background: var(--primary-light);
		color: var(--primary-dark);
	}

	&.is-active {
		background: var(--primary-light);
		color: var(--primary-dark);
		font-weight: 600;
	}
}

.inline-option-list__content {
	flex: 1;
	min-inline-size: 0;
}

.inline-option-list__check {
	color: var(--primary);
	font-size: .85rem;
	flex-shrink: 0;
	margin-inline-start: .5rem;
}
</style>
