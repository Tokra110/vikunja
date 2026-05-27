<template>
	<div
		ref="wrapperRef"
		class="relation-kind-chip-wrapper"
	>
		<BaseButton
			ref="chipRef"
			class="relation-kind-chip"
			:class="{'relation-kind-chip--blocking': relationKind === RELATION_KIND.BLOCKING}"
			@click="togglePopup"
		>
			<Icon :icon="kindIcon" />
			<span class="relation-kind-label">{{ kindLabel }}</span>
		</BaseButton>
		<BaseButton
			class="relation-remove-button"
			@click="emit('remove')"
		>
			<Icon icon="xmark" />
		</BaseButton>

		<Teleport to="body">
			<div
				v-if="isOpen"
				ref="popupRef"
				class="relation-kind-popup"
				:style="popupStyle"
			>
				<BaseButton
					v-for="option in OPTIONS"
					:key="option.kind"
					class="relation-kind-option"
					:class="{'relation-kind-option--active': relationKind === option.kind}"
					@click="selectKind(option.kind)"
				>
					<Icon :icon="option.icon" />
					<span>{{ t(option.labelKey, 1) }}</span>
					<Icon
						v-if="relationKind === option.kind"
						icon="check"
						class="relation-kind-option__check"
					/>
				</BaseButton>
			</div>
		</Teleport>
	</div>
</template>

<script setup lang="ts">
import {ref, computed, nextTick, onUnmounted} from 'vue'
import {useI18n} from 'vue-i18n'
import BaseButton from '@/components/base/BaseButton.vue'
import type {IRelationKind} from '@/types/IRelationKind'
import {RELATION_KIND} from '@/types/IRelationKind'

const props = defineProps<{
	relationKind: IRelationKind
}>()

const emit = defineEmits<{
	'update:relationKind': [kind: IRelationKind]
	'remove': []
}>()

const {t} = useI18n({useScope: 'global'})

const OPTIONS = [
	{kind: RELATION_KIND.SUBTASK, icon: 'sitemap', labelKey: 'task.relation.kinds.subtask'},
	{kind: RELATION_KIND.BLOCKING, icon: 'ban', labelKey: 'task.relation.kinds.blocking'},
	{kind: RELATION_KIND.RELATED, icon: 'link', labelKey: 'task.relation.kinds.related'},
] as const

const KIND_CONFIG = Object.fromEntries(OPTIONS.map(o => [o.kind, o])) as Record<string, typeof OPTIONS[number]>

const kindIcon = computed(() => KIND_CONFIG[props.relationKind]?.icon ?? 'link')
const kindLabel = computed(() => {
	const cfg = KIND_CONFIG[props.relationKind]
	return cfg ? t(cfg.labelKey, 1) : props.relationKind
})

const isOpen = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)
const chipRef = ref<InstanceType<typeof BaseButton> | null>(null)
const popupRef = ref<HTMLElement | null>(null)
const popupStyle = ref<{top: string, left: string}>({top: '0px', left: '0px'})

function positionPopup() {
	const chipEl = chipRef.value?.$el as HTMLElement | undefined
	if (!chipEl) return

	const rect = chipEl.getBoundingClientRect()
	let top = rect.bottom + 4
	let left = rect.left

	nextTick(() => {
		const popup = popupRef.value
		if (!popup) return

		const popupRect = popup.getBoundingClientRect()
		const margin = 8

		if (top + popupRect.height + margin > window.innerHeight) {
			top = rect.top - popupRect.height - 4
		}
		if (top < margin) {
			top = margin
		}
		if (left + popupRect.width + margin > window.innerWidth) {
			left = Math.max(margin, window.innerWidth - popupRect.width - margin)
		}

		popupStyle.value = {top: `${top}px`, left: `${left}px`}
	})

	popupStyle.value = {top: `${top}px`, left: `${left}px`}
}

function togglePopup() {
	if (isOpen.value) {
		isOpen.value = false
		return
	}
	isOpen.value = true
	positionPopup()
}

function selectKind(kind: IRelationKind) {
	emit('update:relationKind', kind)
	isOpen.value = false
}

function onDocumentClick(e: MouseEvent) {
	if (!isOpen.value) return
	const path = e.composedPath()
	const wrapper = wrapperRef.value
	const popup = popupRef.value
	if ((wrapper && path.includes(wrapper)) || (popup && path.includes(popup))) {
		return
	}
	isOpen.value = false
}

document.addEventListener('click', onDocumentClick)
onUnmounted(() => {
	document.removeEventListener('click', onDocumentClick)
})
</script>

<style lang="scss" scoped>
.relation-kind-chip-wrapper {
	display: inline-flex;
	align-items: center;
	gap: .2rem;

	&:hover .relation-remove-button {
		opacity: 1;
		pointer-events: auto;
	}
}

.relation-kind-chip {
	display: inline-flex;
	align-items: center;
	gap: .3rem;
	padding: .1rem .4rem;
	border-radius: $radius;
	font-size: .75rem;
	color: var(--grey-500);
	transition: color $transition, background-color $transition;

	&:hover {
		color: var(--grey-700);
		background: var(--grey-100);
	}

	&--blocking {
		color: var(--danger);

		&:hover {
			color: var(--danger);
			background: var(--danger-light, var(--grey-100));
		}
	}
}

.relation-kind-label {
	font-size: .75rem;
}

.relation-remove-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: .1rem .25rem;
	border-radius: $radius;
	font-size: .65rem;
	color: var(--grey-400);
	opacity: 0;
	pointer-events: none;
	transition: color $transition, background-color $transition, opacity $transition;

	&:hover {
		color: var(--danger);
		background: var(--grey-100);
	}
}

.relation-kind-popup {
	position: fixed;
	z-index: 50;
	padding: .375rem;
	background: var(--white);
	border: 1px solid var(--grey-200);
	border-radius: $radius;
	box-shadow: var(--shadow-md);
	display: flex;
	flex-direction: column;
	gap: .125rem;
	min-inline-size: 10rem;
}

.relation-kind-option {
	display: flex;
	align-items: center;
	gap: .5rem;
	padding: .4rem .6rem;
	border-radius: $radius;
	font-size: .85rem;
	color: var(--grey-700);
	inline-size: 100%;
	transition: background-color $transition, color $transition;

	&:hover {
		background: var(--grey-100);
	}

	&--active {
		color: var(--primary);
		background: var(--primary-light);
	}
}

.relation-kind-option__check {
	margin-inline-start: auto;
	font-size: .8rem;
}
</style>
