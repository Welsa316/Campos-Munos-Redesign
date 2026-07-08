<template>
  <!-- Bubble + speech-bubble greeting (unified group, fixed bottom-right) -->
  <transition name="bubble">
    <div v-if="!isOpen" class="fixed bottom-6 right-6 z-[145] flex flex-col items-end gap-3">
      <!-- Speech bubble greeting -- comes out of the chat bubble -->
      <div v-show="showGreeting"
        class="speech-bubble relative bg-white rounded-2xl rounded-br-md shadow-[0_10px_40px_rgba(0,63,141,0.18)] border border-gray-100 px-4 py-3 pr-9 max-w-[240px]"
        :class="{ 'is-visible': showGreeting }">
        <button @click="openChat" type="button" class="text-left w-full">
          <p class="font-ui text-sm text-gray-700 leading-snug">
            {{ $t('chat.greetingMessage') }}
          </p>
        </button>
        <button @click.stop="dismissGreeting" type="button"
          class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          :aria-label="$t('chat.close')">
          <i class="fa-solid fa-xmark text-[10px]"></i>
        </button>
        <!-- Tail pointing down toward the bubble -->
        <span class="absolute -bottom-1.5 right-6 w-3 h-3 bg-white border-r border-b border-gray-100 rotate-45"></span>
      </div>

      <!-- Chat bubble trigger -->
      <button ref="launcherRef" @click="openChat" type="button"
        class="group relative"
        :aria-label="$t('chat.openChat')">
        <!-- Avatar -->
        <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-[3px] border-white shadow-[0_10px_40px_rgba(0,63,141,0.25)] group-hover:scale-105 transition-transform bg-brand-navy/5">
          <img src="/JuanChatBubble.png" alt="Juan Campos" class="w-full h-full object-cover" />
        </div>
        <!-- Chat icon badge -->
        <span class="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-brand-navy flex items-center justify-center shadow-lg border-[3px] border-white">
          <i class="fa-solid fa-comment-dots text-white text-sm"></i>
        </span>
      </button>
    </div>
  </transition>

  <!-- Chat modal -->
  <transition name="modal">
    <div v-if="isOpen" ref="panelRef"
      role="dialog" aria-modal="true" :aria-label="$t('chat.openChat')" tabindex="-1"
      class="fixed inset-x-3 bottom-3 sm:inset-x-auto sm:bottom-6 sm:right-6 z-[150] w-auto sm:w-[380px] max-w-[420px] h-[calc(100dvh-1.5rem)] sm:h-[560px] sm:max-h-[calc(100dvh-3rem)] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
      <!-- Header -->
      <div class="flex items-center gap-3 px-4 py-3 bg-brand-navy text-white flex-shrink-0">
        <div class="w-10 h-10 rounded-full overflow-hidden border-2 border-white/30 flex-shrink-0">
          <img src="/JuanChatBubble.png" alt="Juan Campos" class="w-full h-full object-cover" />
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-heading text-base leading-tight truncate">Campos Muños Law</h3>
          <p class="text-white/70 text-xs font-ui flex items-center gap-1.5 mt-0.5">
            <span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>
            {{ $t('chat.online') }}
          </p>
        </div>
        <button ref="closeBtn" @click="closeChat" type="button"
          class="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
          :aria-label="$t('chat.close')">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      <!-- Body — pre-chat form OR chat thread -->
      <div class="flex-1 overflow-hidden flex flex-col">
        <!-- Pre-chat form -->
        <div v-if="!session" class="flex-1 overflow-y-auto p-5 bg-brand-light">
          <div class="space-y-4">
            <div>
              <p class="font-ui text-sm text-gray-700 leading-relaxed">
                {{ $t('chat.intro') }}
              </p>
            </div>

            <form @submit.prevent="startChat" class="space-y-3">
              <div class="grid grid-cols-2 gap-2">
                <input v-model="form.firstName" type="text" required maxlength="255"
                  :placeholder="$t('chat.firstName')"
                  :aria-label="$t('chat.firstName')"
                  autocomplete="given-name"
                  class="chat-input" />
                <input v-model="form.lastName" type="text" required maxlength="255"
                  :placeholder="$t('chat.lastName')"
                  :aria-label="$t('chat.lastName')"
                  autocomplete="family-name"
                  class="chat-input" />
              </div>
              <input v-model="form.email" type="email" required maxlength="255"
                :placeholder="$t('chat.email')"
                :aria-label="$t('chat.email')"
                autocomplete="email"
                class="chat-input w-full" />
              <input v-model="form.phone" type="tel" required maxlength="50"
                :placeholder="$t('chat.phone')"
                :aria-label="$t('chat.phone')"
                autocomplete="tel"
                class="chat-input w-full" />
              <select v-model="form.consultationType" required
                :aria-label="$t('consultationForm.consultationType')"
                class="chat-input w-full"
                :class="!form.consultationType ? 'text-gray-500' : 'text-gray-800'">
                <option value="" disabled>{{ $t('consultationForm.selectConsultation') }}</option>
                <option v-for="key in CONSULTATION_KEYS" :key="key" :value="key">
                  {{ consultationLabel(key, t, te) }}
                </option>
              </select>
              <select v-model="form.location" required
                :aria-label="$t('consultationForm.country')"
                class="chat-input w-full"
                :class="!form.location ? 'text-gray-500' : 'text-gray-800'">
                <option value="" disabled>{{ $t('consultationForm.selectCountry') }}</option>
                <option v-for="c in COUNTRIES" :key="c.code" :value="c.code">
                  {{ locale === 'en' ? c.nameEn : c.nameEs }}
                </option>
              </select>
              <textarea v-model="form.message" rows="3" required maxlength="5000"
                :placeholder="$t('chat.firstMessage')"
                :aria-label="$t('chat.firstMessage')"
                class="chat-input w-full resize-none"></textarea>

              <p v-if="formError" role="alert" class="text-brand-red text-xs font-ui">
                <i class="fa-solid fa-circle-exclamation mr-1" aria-hidden="true"></i>{{ formError }}
              </p>

              <button type="submit" :disabled="loading"
                class="w-full bg-brand-navy hover:bg-brand-navy-dark text-white font-ui font-bold tracking-wide text-sm py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                <i v-if="loading" class="fa-solid fa-spinner fa-spin text-xs"></i>
                <span>{{ loading ? $t('chat.sending') : $t('chat.startChat') }}</span>
                <i v-if="!loading" class="fa-solid fa-paper-plane text-xs"></i>
              </button>

              <p class="text-gray-500 text-[11px] font-ui leading-relaxed text-center">
                {{ $t('chat.privacyNote') }}
              </p>
            </form>
          </div>
        </div>

        <!-- Chat thread -->
        <template v-else>
          <div ref="threadRef" aria-live="polite" class="flex-1 overflow-y-auto p-4 space-y-3 bg-brand-light">
            <!-- Bot welcome -->
            <div class="flex gap-2 items-end">
              <div class="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                <img src="/JuanChatBubble.png" alt="" class="w-full h-full object-cover" />
              </div>
              <div class="bg-white rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[80%] shadow-sm">
                <p class="text-gray-800 text-sm font-ui leading-relaxed">
                  {{ $t('chat.welcomeBack', { name: session.firstName }) }}
                </p>
              </div>
            </div>

            <!-- All messages from user, ordered by time -->
            <div v-for="msg in allUserMessages" :key="msg.id" class="flex justify-end">
              <div class="bg-brand-navy text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%]">
                <p class="text-sm font-ui leading-relaxed whitespace-pre-wrap break-words">{{ msg.body }}</p>
              </div>
            </div>

            <!-- Pending optimistic -->
            <div v-if="sending" class="flex justify-end">
              <div class="bg-brand-navy/60 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%]">
                <p class="text-sm font-ui leading-relaxed whitespace-pre-wrap break-words italic">{{ pendingText }}</p>
              </div>
            </div>

            <!-- Auto-reply after each user send -->
            <div v-if="allUserMessages.length > 0" class="flex gap-2 items-end">
              <div class="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                <img src="/JuanChatBubble.png" alt="" class="w-full h-full object-cover" />
              </div>
              <div class="bg-white rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[80%] shadow-sm">
                <p class="text-gray-800 text-sm font-ui leading-relaxed">
                  {{ $t('chat.autoReply') }}
                </p>
              </div>
            </div>
          </div>

          <!-- Follow-up send error (message is also restored to the input for retry) -->
          <p v-if="formError" role="alert"
            class="px-4 pt-2 -mb-1 text-xs font-ui text-red-600 flex-shrink-0">
            {{ formError }}
          </p>

          <!-- Composer -->
          <form @submit.prevent="sendFollowUp" class="flex items-center gap-2 px-3 py-3 border-t border-gray-100 bg-white flex-shrink-0">
            <input v-model="newMessage" type="text" maxlength="5000"
              :placeholder="$t('chat.typeMessage')"
              :aria-label="$t('chat.typeMessage')"
              :disabled="sending"
              class="flex-1 px-4 py-2.5 rounded-full bg-brand-light border border-transparent focus:border-brand-navy/30 focus:bg-white focus:outline-none text-sm font-ui text-gray-800 placeholder:text-gray-400 transition-colors disabled:opacity-60" />
            <button type="submit"
              :disabled="!newMessage.trim() || sending"
              class="w-10 h-10 rounded-full bg-brand-navy hover:bg-brand-navy-dark text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              :aria-label="$t('chat.send')">
              <i v-if="sending" class="fa-solid fa-spinner fa-spin text-xs"></i>
              <i v-else class="fa-solid fa-paper-plane text-sm"></i>
            </button>
          </form>
        </template>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { rawFetch } from '../composables/useApi.js'
import { CONSULTATION_KEYS, consultationLabel } from '../data/consultationTypes.js'
import { COUNTRIES } from '../data/countries.js'

const { t, te, locale } = useI18n()

import { CHAT_GREETING_DELAY_MS, CHAT_GREETING_DISMISS_TTL_MS } from '../data/timing.js'

const SESSION_KEY = 'cm_chat_session_v1'
const GREETING_KEY = 'cm_chat_greeting_dismissed_at'

const isOpen = ref(false)
const showGreeting = ref(false)
const loading = ref(false)
const sending = ref(false)
const formError = ref('')
const pendingText = ref('')

const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  consultationType: '',
  location: '',
  message: '',
})

const session = ref(null) // { id, firstName, lastName, email, phone, startedAt }
const messages = ref([])  // [{ id, body, sent_at }]
const newMessage = ref('')
const threadRef = ref(null)
const panelRef = ref(null)
const closeBtn = ref(null)
const launcherRef = ref(null)

let greetingTimer = null
let lastFocused = null

const allUserMessages = computed(() => messages.value)

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed && parsed.id) {
      session.value = parsed
      messages.value = parsed.messages || []
    }
  } catch {
    /* ignore corrupted session */
  }
}

function saveSession() {
  if (!session.value) return
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      ...session.value,
      messages: messages.value,
    }))
  } catch {
    /* ignore quota errors */
  }
}

function shouldShowGreeting() {
  if (session.value) return false
  try {
    const dismissed = parseInt(localStorage.getItem(GREETING_KEY) || '0', 10)
    if (dismissed && Date.now() - dismissed < CHAT_GREETING_DISMISS_TTL_MS) return false
  } catch {
    /* ignore */
  }
  return true
}

function dismissGreeting() {
  showGreeting.value = false
  try { localStorage.setItem(GREETING_KEY, String(Date.now())) } catch { /* ignore */ }
}

function openChat() {
  isOpen.value = true
  dismissGreeting()
  if (session.value) {
    nextTick(scrollThreadToBottom)
  }
}

function closeChat() {
  isOpen.value = false
}

function scrollThreadToBottom() {
  if (threadRef.value) {
    threadRef.value.scrollTop = threadRef.value.scrollHeight
  }
}

// Dialog keyboard handling: Escape closes; Tab is trapped within the panel so
// focus can't wander into the page behind the open chat. Mirrors the pattern
// in InactivityPopup.vue and SiteHeader.vue.
function onKeydown(e) {
  if (!isOpen.value) return
  if (e.key === 'Escape') { closeChat(); return }
  if (e.key !== 'Tab' || !panelRef.value) return
  const focusables = Array.from(panelRef.value.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null || el === document.activeElement)
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

// Move focus into the panel on open, restore it to the launcher on close.
watch(isOpen, (open) => {
  if (open) {
    lastFocused = document.activeElement
    nextTick(() => closeBtn.value?.focus())
  } else {
    nextTick(() => {
      if (launcherRef.value && typeof launcherRef.value.focus === 'function') {
        launcherRef.value.focus()
      } else if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus()
      }
      lastFocused = null
    })
  }
})

async function startChat() {
  formError.value = ''
  const f = form.value

  if (!f.firstName.trim() || !f.lastName.trim() || !f.email.trim() || !f.phone.trim() || !f.consultationType || !f.location.trim() || !f.message.trim()) {
    formError.value = t('chat.requiredError')
    return
  }
  if (!/^[0-9+\-() ]+$/.test(f.phone.trim())) {
    formError.value = t('chat.phoneError')
    return
  }

  loading.value = true
  try {
    const res = await rawFetch('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        consultationType: f.consultationType,
        location: f.location.trim(),
        message: f.message.trim(),
        source: 'chat',
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Submission failed')
    }

    const data = await res.json()
    const firstMessageBody = f.message.trim()
    session.value = {
      id: data.id,
      chatToken: data.chat_token,
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim(),
      phone: f.phone.trim(),
      startedAt: data.created_at,
    }
    messages.value = [{ id: `m-${data.id}`, body: firstMessageBody, sent_at: data.created_at }]
    saveSession()
    form.value = { firstName: '', lastName: '', email: '', phone: '', consultationType: '', location: '', message: '' }
    nextTick(scrollThreadToBottom)
  } catch (err) {
    formError.value = t('chat.sendError')
  } finally {
    loading.value = false
  }
}

async function sendFollowUp() {
  const body = newMessage.value.trim()
  if (!body || !session.value || sending.value) return

  sending.value = true
  pendingText.value = body
  newMessage.value = ''
  formError.value = ''

  try {
    const res = await rawFetch(`/api/submissions/${session.value.id}/chat-message`, {
      method: 'POST',
      body: JSON.stringify({ body, chatToken: session.value.chatToken }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Send failed')
    }

    const data = await res.json()
    messages.value.push({ id: data.id, body: data.body, sent_at: data.sent_at })
    saveSession()
    pendingText.value = ''
    nextTick(scrollThreadToBottom)
  } catch (err) {
    // Restore the message into the input so the user can retry
    newMessage.value = body
    pendingText.value = ''
    formError.value = t('chat.sendError')
  } finally {
    sending.value = false
  }
}

watch(messages, () => {
  if (isOpen.value) nextTick(scrollThreadToBottom)
}, { deep: true })

onMounted(() => {
  loadSession()
  document.addEventListener('keydown', onKeydown)
  if (shouldShowGreeting()) {
    greetingTimer = window.setTimeout(() => {
      if (!isOpen.value && !session.value) {
        showGreeting.value = true
      }
    }, CHAT_GREETING_DELAY_MS)
  }
})

onUnmounted(() => {
  if (greetingTimer) clearTimeout(greetingTimer)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
/* Bubble fade/slide */
.bubble-enter-active,
.bubble-leave-active { transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.bubble-enter-from,
.bubble-leave-to { opacity: 0; transform: scale(0.7) translateY(20px); }

/* Modal slide-up from bottom-right */
.modal-enter-active { transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.modal-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.modal-enter-from { opacity: 0; transform: translateY(20px) scale(0.95); transform-origin: bottom right; }
.modal-leave-to { opacity: 0; transform: translateY(10px) scale(0.97); transform-origin: bottom right; }

/* Speech bubble greeting fade/slide */
.speech-bubble {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.35s ease, transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
}
.speech-bubble.is-visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
</style>
