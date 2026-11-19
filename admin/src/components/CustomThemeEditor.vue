<template>
  <!-- A person's own colours (Themes → Custom). A panel at the side (a sheet
       from the bottom on a phone) over a light dim, so the portal behind it
       shows each pick live. Cancel, Escape or a click outside puts the
       previous theme back; only Save keeps the new one. -->
  <Teleport to="body">
    <transition name="fade">
      <div v-if="visible" ref="overlayRef" class="fixed inset-0 z-(--z-dialog) font-ui" :lang="lang"
        role="dialog" aria-modal="true" aria-labelledby="custom-theme-title" aria-describedby="custom-theme-intro"
        @keydown.esc.stop.prevent="cancel" @keydown.tab="trapFocus">
        <div class="absolute inset-0 scrim-soft" aria-hidden="true" @click="cancel"></div>

        <div class="custom-theme-panel absolute bg-white shadow-2xl flex flex-col overflow-hidden
                    inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[26px]
                    sm:inset-y-3 sm:right-3 sm:left-auto sm:bottom-3 sm:max-h-none sm:w-[440px] sm:rounded-[26px]">
          <div class="px-5 sm:px-6 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-gray-100">
            <div class="min-w-0">
              <h2 id="custom-theme-title" class="text-[19px] font-semibold tracking-tight text-gray-900">{{ t('editor.title') }}</h2>
              <p id="custom-theme-intro" class="text-[12px] text-gray-500 mt-0.5">{{ t('editor.intro') }}</p>
            </div>
            <button ref="closeRef" type="button" @click="cancel" :aria-label="t('editor.close')" :title="t('editor.close')"
              class="w-9 h-9 pointer-coarse:w-11 pointer-coarse:h-11 flex-shrink-0 rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 flex items-center justify-center transition-colors">
              <FaIcon name="xmark" class="text-sm" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 flex flex-col gap-5">
            <!-- Preview: drawn from the live tokens, so it is the theme itself. -->
            <section :aria-label="t('editor.preview')" class="shrink-0 rounded-2xl overflow-hidden ring-1 ring-gray-200" style="background: var(--app-bg)">
              <div class="flex items-center gap-1 px-3 h-10" style="background: var(--sidebar-bg)">
                <span class="w-5 h-5 rounded-full mr-1.5" style="background: var(--icon-on-sidebar); opacity: 0.85" aria-hidden="true"></span>
                <span class="px-2.5 py-1 rounded-full text-[12px] font-semibold" style="background: var(--sidebar-active); color: var(--text-on-sidebar)">{{ t('preview.tab') }}</span>
                <span class="px-2.5 py-1 text-[12px] font-medium" style="color: var(--text-sidebar-muted)">{{ t('preview.tab2') }}</span>
              </div>
              <div class="p-3 flex flex-col gap-2.5">
                <div class="grid grid-cols-[7fr_5fr] gap-2">
                  <div class="rounded-xl px-3 py-2.5 min-w-0" style="background: color-mix(in srgb, var(--summary-a-bg) 88%, var(--app-bg))">
                    <p class="text-[11px] font-semibold truncate" style="color: var(--summary-a-text)">{{ t('preview.missed') }}</p>
                    <p class="text-[22px] font-bold leading-none mt-1 tabular-nums" style="color: var(--summary-a-text)">3</p>
                  </div>
                  <div class="rounded-xl px-3 py-2.5 min-w-0" style="background: color-mix(in srgb, var(--summary-b-bg) 92%, var(--app-bg))">
                    <p class="text-[11px] font-semibold truncate" style="color: var(--summary-b-text)">{{ t('preview.unread') }}</p>
                    <p class="text-[22px] font-bold leading-none mt-1 tabular-nums" style="color: var(--summary-b-text)">5</p>
                  </div>
                </div>
                <div class="rounded-xl p-3 flex items-end justify-between gap-3" style="background: var(--surface); box-shadow: inset 0 0 0 1px var(--border)">
                  <div class="min-w-0">
                    <p class="text-[13px] font-semibold" style="color: var(--text-primary)">{{ t('preview.title') }}</p>
                    <p class="text-[12px] mt-0.5" style="color: var(--text-secondary)">{{ t('preview.text') }}</p>
                    <p class="text-[12px] font-semibold mt-1 underline underline-offset-2" style="color: var(--text-link)">{{ t('preview.link') }}</p>
                  </div>
                  <span class="px-3.5 py-1.5 rounded-full text-[12px] font-semibold flex-shrink-0" style="background: var(--primary); color: var(--text-on-primary)">{{ t('preview.button') }}</span>
                </div>
              </div>
            </section>

            <p v-if="adjustedText" role="status" class="flex gap-2 text-[12px] leading-snug rounded-xl px-3 py-2.5 bg-sky-50 text-sky-800">
              <FaIcon name="circle-info" class="text-[12px] mt-0.5 flex-shrink-0" />
              <span>{{ adjustedText }}</span>
            </p>

            <div class="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
              <label class="flex flex-col gap-1.5 min-w-0">
                <span class="text-[12px] font-semibold text-gray-700">{{ t('editor.start') }}</span>
                <select v-model="startFrom" @change="restart"
                  class="h-10 pointer-coarse:h-11 w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 text-[13px] text-gray-900">
                  <option value="">{{ t('editor.start_current') }}</option>
                  <option v-for="th in THEMES" :key="th.key" :value="th.key">{{ th.name }}</option>
                </select>
              </label>
              <div class="flex flex-col gap-1.5 min-w-0">
                <span id="custom-base-label" class="text-[12px] font-semibold text-gray-700">{{ t('editor.base') }}</span>
                <div role="radiogroup" aria-labelledby="custom-base-label" class="inline-flex w-full bg-brand-surface rounded-xl p-1" @keydown="rovingKeydown">
                  <button v-for="(b, i) in BASES" :key="b" type="button" role="radio" :aria-checked="draft.base === b"
                    :tabindex="rovingTabindex(draft.base === b, i, true)" @click="setBase(b)"
                    :class="draft.base === b ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'"
                    class="flex-1 h-8 pointer-coarse:h-11 rounded-lg text-[13px] font-semibold transition-colors">{{ t(`base.${b}`) }}</button>
                </div>
              </div>
            </div>

            <ColourRow v-for="key in CUSTOM_MAIN" :key="key" :name="t(`color.${key}`)" :hint="t(`hint.${key}`)" :id="`custom-${key}`"
              :value="draft[key]" :swatches="swatchesFor(key)" :t="t" @pick="(hex) => set(key, hex)" />

            <details class="group rounded-2xl ring-1 ring-gray-200" :open="advancedOpen" @toggle="advancedOpen = $event.target.open">
              <summary class="list-none flex items-center justify-between gap-3 px-4 min-h-11 cursor-pointer rounded-2xl text-[13px] font-semibold text-gray-800 hover:bg-gray-50">
                <span class="flex items-center gap-2"><FaIcon name="sliders" class="text-[12px] text-gray-500" />{{ t('editor.more') }}</span>
                <FaIcon name="chevron-down" class="text-[11px] text-gray-500 transition-transform group-open:rotate-180" />
              </summary>
              <div class="px-4 pb-4 pt-1 flex flex-col gap-5">
                <p class="text-[12px] text-gray-500">{{ t('editor.more_hint') }}</p>
                <ColourRow v-for="key in CUSTOM_ADVANCED" :key="key" :name="t(`color.${key}`)" :id="`custom-${key}`"
                  :value="draft[key] || null" :auto-value="autoValue(key)" :swatches="ADVANCED_SWATCHES" :t="t"
                  @pick="(hex) => set(key, hex)" @auto="unset(key)" />
              </div>
            </details>
          </div>

          <div class="px-5 sm:px-6 py-3.5 border-t border-gray-100 flex flex-wrap items-center gap-2">
            <p v-if="error" role="alert" class="basis-full text-[12px] text-brand-red">{{ error }}</p>
            <button type="button" @click="reset" :disabled="!changed"
              class="h-10 pointer-coarse:h-11 px-3.5 rounded-full text-[13px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50 inline-flex items-center gap-1.5">
              <FaIcon name="rotate-left" class="text-[11px]" />{{ t('reset') }}
            </button>
            <div class="ml-auto flex gap-2">
              <button type="button" @click="cancel" class="h-10 pointer-coarse:h-11 px-4 rounded-full text-[13px] font-semibold text-gray-600 hover:bg-gray-100">{{ t('cancel') }}</button>
              <button type="button" @click="save" :disabled="saving"
                class="h-10 pointer-coarse:h-11 px-5 rounded-full bg-gray-900 text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50">
                {{ saving ? t('saving') : t('save') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import {
  THEMES, CUSTOM_MAIN, CUSTOM_ADVANCED, DEFAULT_THEME, CUSTOM_THEME,
  applyTheme, buildCustomTheme, customFromTheme, normalizeCustom, settleCustom, isTheme,
} from '../data/themes.js'
import { useAuth, setTheme } from '../composables/useAuth.js'
import { rawFetch, goToLogin } from '../composables/useApi.js'
import { useT } from '../i18n/translator.js'
import { THEME_WORDS } from '../i18n/themes.js'
import { rovingKeydown, rovingTabindex } from '../utils/roving.js'
import FaIcon from './FaIcon.vue'
import ColourRow from './CustomThemeColourRow.vue'

const props = defineProps({ visible: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'saved'])

const { t, lang } = useT(THEME_WORDS)
const { profile } = useAuth()

const BASES = ['light', 'dark']
// Curated suggestions per colour (a native picker beside them takes any colour).
const HEADERS = ['#003F8D', '#172238', '#174C4D', '#2A2E34', '#382F4C', '#1F4D2E', '#6B1D2A', '#8A3B12', '#0B6E99', '#0D141C', '#F3EEE4', '#FFFFFF']
const SWATCHES = {
  header: { light: HEADERS, dark: HEADERS },
  primary: {
    light: ['#003F8D', '#345F9B', '#176F6A', '#424E62', '#69518D', '#CE1D1D', '#B4501A', '#E8A33D', '#FFD500', '#2E7D32', '#C2185B', '#111111'],
    dark: ['#3A699C', '#7CA6CC', '#4C9B91', '#8FA3BF', '#9981AE', '#E06666', '#E8894A', '#E8A33D', '#FFD500', '#5DBB63', '#F06292', '#F2F2F2'],
  },
  page: {
    light: ['#F5F7FA', '#FFFFFF', '#F4F1EA', '#F1F7F6', '#F6F4F8', '#F3F4F5', '#FFF8EC', '#EEF3FB'],
    dark: ['#111820', '#0B0B0C', '#14171C', '#101A16', '#17131D', '#1A1410', '#0E1424', '#161616'],
  },
  surface: {
    light: ['#FFFFFF', '#FBFAF7', '#F8FAFC', '#FFFDF7', '#FAF8FC', '#F7FBFA', '#F2F4F7', '#FFF9F0'],
    dark: ['#1C2631', '#1A1A1C', '#1F2329', '#18241F', '#221C2A', '#262019', '#1B2236', '#232323'],
  },
  summaryA: {
    light: ['#FCEAEA', '#FFE8D6', '#FFF3C4', '#E3F4EA', '#E3EEFB', '#EDE6F5', '#CE1D1D', '#003F8D'],
    dark: ['#442B31', '#4A3424', '#3F3A20', '#20392F', '#24394D', '#33294A', '#B0474D', '#3A699C'],
  },
  summaryB: { light: HEADERS, dark: HEADERS },
}
const ADVANCED_SWATCHES = ['#111111', '#FFFFFF', '#003F8D', '#CE1D1D', '#176F6A', '#69518D', '#E8A33D', '#2E7D32', '#B4501A', '#C2185B', '#5D6876', '#0B6E99']
const swatchesFor = (key) => SWATCHES[key][draft.value.base]

const draft = ref(customFromTheme(DEFAULT_THEME))
const origin = ref(null) // what Reset goes back to
const startFrom = ref('')
const advancedOpen = ref(false)
const saving = ref(false)
const error = ref('')
const overlayRef = ref(null)
const closeRef = ref(null)
let previous = null // { theme, custom } to put back on cancel
let previouslyFocused = null
let saved = false

const built = computed(() => buildCustomTheme(draft.value))
const changed = computed(() => JSON.stringify(draft.value) !== JSON.stringify(origin.value))
const adjustedText = computed(() => {
  const keys = built.value?.adjusted || []
  return keys.length ? t('adjusted', { list: keys.map((k) => t(`color.${k}`)).join(', ') }) : ''
})
const autoValue = (key) => {
  // What "Automatic" resolves to, shown beside the switch.
  const map = { text: 'text-primary', link: 'text-link', border: 'border', navActive: 'sidebar-active', focus: 'focus-ring', success: 'success-solid', danger: 'danger-solid', input: 'input-bg' }
  const auto = buildCustomTheme({ ...draft.value, [key]: undefined })
  return auto?.tokens[map[key]] || null
}

/** The theme the person has now, as editable colours. */
function currentChoices() {
  const saved = normalizeCustom(profile.value.customTheme)
  if (profile.value.theme === CUSTOM_THEME && saved) return saved
  return saved || customFromTheme(isTheme(profile.value.theme) ? profile.value.theme : DEFAULT_THEME)
}

watch(() => props.visible, (v) => {
  if (v) {
    previous = { theme: profile.value.theme || DEFAULT_THEME, custom: profile.value.customTheme || null }
    saved = false
    draft.value = currentChoices()
    origin.value = { ...draft.value }
    startFrom.value = ''
    error.value = ''
    saving.value = false
    advancedOpen.value = CUSTOM_ADVANCED.some((k) => draft.value[k])
    previouslyFocused = document.activeElement
    preview()
    nextTick(() => closeRef.value?.focus())
  } else {
    if (!saved && previous) applyTheme(previous.theme, previous.custom)
    previous = null
    if (previouslyFocused?.focus) previouslyFocused.focus()
    previouslyFocused = null
  }
})

// Every pick shows on the whole portal at once (not remembered for the next
// load until saved).
let frame = 0
function preview() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => applyTheme(CUSTOM_THEME, draft.value, { remember: false }))
}
watch(draft, () => { if (props.visible) preview() }, { deep: true })

function set(key, hex) { draft.value = { ...draft.value, [key]: hex.toUpperCase() } }
function unset(key) {
  const next = { ...draft.value }
  delete next[key]
  draft.value = next
}
// Light ↔ dark: the page, the cards and the first Home card move to the
// other base's colours; the header, the buttons and the second card stay.
function setBase(base) {
  if (draft.value.base === base) return
  const from = customFromTheme(base === 'dark' ? 'midnight-dark' : DEFAULT_THEME)
  const next = { ...draft.value, base, page: from.page, surface: from.surface, summaryA: from.summaryA }
  delete next.text
  delete next.input
  draft.value = next
}
function restart() {
  draft.value = startFrom.value ? customFromTheme(startFrom.value) : { ...origin.value }
}
function reset() {
  startFrom.value = ''
  draft.value = { ...origin.value }
}

function cancel() {
  if (saving.value) return
  emit('close')
}

function trapFocus(e) {
  const root = overlayRef.value
  if (!root) return
  const focusable = [...root.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), select, input, summary')]
    .filter((el) => el.offsetParent !== null || el === document.activeElement)
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

async function save() {
  // Saved as shown: a colour nudged for readability is kept as its nudged self.
  const custom = settleCustom(draft.value)
  if (!custom) return
  saving.value = true
  error.value = ''
  try {
    const res = await rawFetch('/api/auth/theme', { method: 'PUT', body: JSON.stringify({ theme: CUSTOM_THEME, custom }) })
    if (res.status === 401) { goToLogin(); return }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || t('error.save'))
    saved = true
    setTheme(CUSTOM_THEME, data.customTheme || custom)
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e.message || t('error.save')
    // Keep the dialog open with their picks; the portal behind shows them still.
  } finally {
    saving.value = false
  }
}

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  if (props.visible && !saved && previous) applyTheme(previous.theme, previous.custom)
})
</script>

<style>
.custom-theme-panel { background-color: var(--surface-elevated); }
</style>
