<template>
  <!-- A "Color" button that opens the picker under it: the current colour as
       a dot (or an empty ring), and the word unless it is icon-only. -->
  <div class="relative inline-flex" data-color-trigger>
    <button ref="btn" type="button" :aria-label="aria" :title="aria" aria-haspopup="dialog" :aria-expanded="open"
      :class="[iconOnly ? 'cpb-icon' : 'cpb', btnClass]" @click="open = !open">
      <FaIcon v-if="iconOnly && !shown" name="palette" class="text-gray-500" />
      <span v-else :data-swatch="shown || undefined" :class="shown ? '' : 'cpb-empty'" class="cpb-dot" aria-hidden="true"></span>
      <span v-if="!iconOnly">{{ t('button.label') }}</span>
    </button>
    <ColorSwatchMenu v-if="open" floating :kind="kind" :id="id" :match="match" :current="shown" :targets="targets"
      @close="onClose" @changed="(c) => $emit('changed', c)" />
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import FaIcon from '../FaIcon.vue'
import ColorSwatchMenu from './ColorSwatchMenu.vue'
import { COLOURS } from '../../i18n/colours.js'
import { useT } from '../../i18n/translator.js'
import { entryColor } from './entryColorStore.js'
import { ensureEntryColorStyles } from '../../data/entryColors.js'

const props = defineProps({
  kind: { type: String, required: true },
  id: { type: Number, required: true },
  match: { type: [String, Number], default: null },
  // What the server sent for this entry.
  color: { type: String, default: null },
  targets: { type: Array, default: () => [] },
  iconOnly: Boolean,
  btnClass: { type: [String, Array, Object], default: '' },
})
defineEmits(['changed'])
const { t } = useT(COLOURS)
const open = ref(false)
const btn = ref(null)
ensureEntryColorStyles()

const shown = computed(() => entryColor(props.kind, props.match ?? props.id, props.color))
const aria = computed(() => (shown.value ? t('button.current', { name: t(`name.${shown.value}`) }) : t('button.none')))

function onClose({ restore } = {}) {
  open.value = false
  if (restore) nextTick(() => btn.value?.focus())
}
</script>

<style scoped>
.cpb {
  display: inline-flex; align-items: center; gap: 7px; min-height: 44px; padding: 0 12px; border-radius: 10px;
  font-size: 12.5px; font-weight: 600; white-space: nowrap; color: var(--text-strong);
  background: var(--surface); box-shadow: inset 0 0 0 1px var(--border);
  transition: background-color 160ms ease, color 160ms ease;
}
@media (min-width: 640px) { .cpb { min-height: 34px; } }
.cpb:hover, .cpb[aria-expanded="true"] { background: var(--surface-hover); color: var(--text-primary); }
.cpb-icon {
  display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 9999px;
  transition: background-color 160ms ease;
}
@media (min-width: 1024px) { .cpb-icon { width: 34px; height: 34px; } }
.cpb-icon:hover, .cpb-icon[aria-expanded="true"] { background: var(--surface-hover); }
.cpb-dot { width: 14px; height: 14px; border-radius: 9999px; flex-shrink: 0; }
.cpb-empty { box-shadow: inset 0 0 0 1.5px var(--icon-secondary); background: transparent; }
</style>
