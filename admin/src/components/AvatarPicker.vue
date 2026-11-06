<template>
  <!-- Choose a profile picture: a 3D animal or an emoji, on a colour. -->
  <transition name="fade">
    <div v-if="visible" ref="overlayRef"
      class="fixed inset-0 z-(--z-dialog) flex items-center justify-center dialog-frame"
      role="dialog" aria-modal="true" aria-labelledby="avatar-picker-title"
      @keydown.esc="close" @keydown.tab="trapFocus" @click.self="close">
      <div class="absolute inset-0 scrim" aria-hidden="true"></div>

      <div class="relative w-full max-w-[520px] max-h-[calc(100dvh-2rem)] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden font-ui">
        <div class="px-6 pt-6 pb-4 flex items-start justify-between">
          <h2 id="avatar-picker-title" class="text-[19px] font-semibold tracking-tight text-gray-900">Choose your picture</h2>
          <button ref="closeBtnRef" @click="close" type="button" aria-label="Close"
            class="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors">
            <i class="fa-solid fa-xmark text-sm" aria-hidden="true"></i>
          </button>
        </div>

        <!-- Live preview -->
        <div class="flex flex-col items-center pb-4">
          <UserAvatar :avatar="draft" :size="104" label="Preview" class="shadow-md ring-4 ring-white" />
        </div>

        <div class="px-6">
          <div class="inline-flex w-full bg-brand-surface rounded-xl p-1" role="tablist" aria-label="Picture style" @keydown="rovingKeydown">
            <button v-for="t in TABS" :key="t.key" :id="`avatar-tab-${t.key}`" type="button" role="tab" :aria-selected="tab === t.key"
              aria-controls="avatar-panel" :tabindex="tab === t.key ? 0 : -1" @click="tab = t.key"
              :class="tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'"
              class="flex-1 py-1.5 rounded-lg text-[13px] font-semibold transition-colors">{{ t.label }}</button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-4">
          <!-- Each group is one Tab stop; the arrow keys pick inside it. -->
          <div id="avatar-panel" role="tabpanel" :aria-labelledby="`avatar-tab-${tab}`">
          <div v-if="tab === 'fluent'" class="grid grid-cols-4 sm:grid-cols-8 gap-2" role="radiogroup" aria-label="3D animals" @keydown="rovingKeydown">
            <button v-for="(a, i) in FLUENT_AVATARS" :key="a.key" type="button" role="radio"
              :aria-checked="isPicked('fluent', a.key)" :aria-label="a.label" :title="a.label"
              :tabindex="rovingTabindex(isPicked('fluent', a.key), i, draft.kind === 'fluent')"
              @click="pick('fluent', a.key)"
              :class="isPicked('fluent', a.key) ? 'ring-2 ring-brand-navy bg-brand-surface' : 'hover:bg-brand-surface'"
              class="aspect-square rounded-2xl flex items-center justify-center transition-colors">
              <img :src="fluentSrc(a.key)" alt="" width="128" height="128" loading="lazy" decoding="async" class="w-[78%] h-[78%]" draggable="false" />
            </button>
          </div>
          <div v-else class="grid grid-cols-6 sm:grid-cols-8 gap-2" role="radiogroup" aria-label="Emoji" @keydown="rovingKeydown">
            <button v-for="(e, i) in EMOJI_AVATARS" :key="e" type="button" role="radio"
              :aria-checked="isPicked('emoji', e)" :aria-label="e"
              :tabindex="rovingTabindex(isPicked('emoji', e), i, draft.kind === 'emoji')"
              @click="pick('emoji', e)"
              :class="isPicked('emoji', e) ? 'ring-2 ring-brand-navy bg-brand-surface' : 'hover:bg-brand-surface'"
              class="aspect-square rounded-2xl flex items-center justify-center text-[26px] leading-none transition-colors">
              {{ e }}
            </button>
          </div>
          <p v-if="tab === 'emoji'" class="text-[11px] text-gray-500 mt-3">Emoji are drawn by each computer, so they look slightly different on a Mac and on Windows.</p>
          </div>

          <p class="text-[12px] font-semibold text-gray-700 mt-5 mb-2">Background</p>
          <div class="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Background colour" @keydown="rovingKeydown">
            <button v-for="(c, i) in AVATAR_COLORS" :key="c.key" type="button" role="radio"
              :aria-checked="draft.bg === c.key" :aria-label="c.label" :title="c.label"
              :tabindex="rovingTabindex(draft.bg === c.key, i, AVATAR_COLORS.some((x) => x.key === draft.bg))"
              @click="draft = { ...draft, bg: c.key }"
              :style="{ backgroundColor: c.hex }"
              :class="draft.bg === c.key ? 'ring-2 ring-offset-2 ring-brand-navy' : 'ring-1 ring-black/5'"
              class="w-8 h-8 rounded-full transition-shadow"></button>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
          <p v-if="error" role="alert" class="text-[12px] text-brand-red flex-1">{{ error }}</p>
          <div class="ml-auto flex gap-2">
            <button type="button" @click="close" class="px-4 py-2 rounded-full text-[13px] font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="button" @click="save" :disabled="saving"
              class="px-5 py-2 rounded-full bg-gray-900 text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50">
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { rawFetch, goToLogin } from '../composables/useApi.js'
import { FLUENT_AVATARS, EMOJI_AVATARS, AVATAR_COLORS, fluentSrc } from '../data/avatars.js'
import UserAvatar from './UserAvatar.vue'
import { rovingKeydown, rovingTabindex } from '../utils/roving.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  current: { type: Object, default: null }, // { kind, key, bg }
})
const emit = defineEmits(['close', 'saved'])

const TABS = [{ key: 'fluent', label: '3D animals' }, { key: 'emoji', label: 'Emoji' }]
const tab = ref('fluent')
const draft = ref({ kind: 'fluent', key: 'monkey', bg: 'sky' })
const saving = ref(false)
const error = ref('')
const overlayRef = ref(null)
const closeBtnRef = ref(null)
let previouslyFocused = null

watch(() => props.visible, (v) => {
  if (v) {
    draft.value = { ...(props.current || draft.value) }
    tab.value = draft.value.kind === 'emoji' ? 'emoji' : 'fluent'
    error.value = ''
    saving.value = false
    previouslyFocused = document.activeElement
    nextTick(() => {
      const picked = overlayRef.value?.querySelector('[role="radio"][aria-checked="true"]')
      ;(picked || closeBtnRef.value)?.focus()
    })
  } else if (previouslyFocused?.focus) {
    previouslyFocused.focus()
    previouslyFocused = null
  }
})

const isPicked = (kind, key) => draft.value.kind === kind && draft.value.key === key
const pick = (kind, key) => { draft.value = { ...draft.value, kind, key } }
const close = () => emit('close')

function trapFocus(e) {
  if (!overlayRef.value) return
  const focusable = overlayRef.value.querySelectorAll('button:not([disabled]):not([tabindex="-1"])')
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    const res = await rawFetch('/api/auth/avatar', {
      method: 'PUT',
      body: JSON.stringify({ avatar: `${draft.value.kind}:${draft.value.key}`, bg: draft.value.bg }),
    })
    if (res.status === 401) { goToLogin(); return }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Could not save your picture')
    emit('saved', data)
    emit('close')
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

</script>
