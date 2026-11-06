<template>
  <div class="border-t border-gray-100 p-5 flex-shrink-0">
    <form @submit.prevent="sendReply">
      <label for="reply-body" class="sr-only">Reply body</label>
      <textarea
        id="reply-body"
        v-model="body"
        rows="3"
        maxlength="10000"
        :disabled="sending"
        placeholder="Type your reply..."
        aria-label="Reply body"
        class="form-input resize-none text-sm mb-3"
        @keydown.enter.exact="(e) => { if (!isComposing(e)) { e.preventDefault(); sendReply() } }"
      ></textarea>

      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500 font-ui">
          <span class="hidden sm:inline">Enter to send · Shift+Enter for a new line · </span>{{ body.length.toLocaleString() }} / 10,000
        </span>

        <div class="flex items-center gap-3">
          <!-- Toast messages, in a region that is always mounted so the
               message is announced when it appears. -->
          <span role="status" aria-live="polite">
            <transition name="fade">
              <span v-if="toast"
                :class="[
                  'text-xs font-ui',
                  toast.type === 'success' ? 'text-green-700' : 'text-amber-700'
                ]">
                <FaIcon :name="toast.type === 'success' ? 'check-circle' : 'exclamation-triangle'" class="mr-1" />
                {{ toast.message }}
              </span>
            </transition>
          </span>

          <button
            type="submit"
            :disabled="sending || !body.trim()"
            class="bg-brand-navy text-white font-ui font-medium text-sm px-5 py-2.5 rounded-xl btn-magnetic disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          >
            <span v-if="sending">
              <i class="fa-solid fa-spinner fa-spin mr-1.5" aria-hidden="true"></i>Sending...
            </span>
            <span v-else>
              Send Reply <i class="fa-solid fa-paper-plane ml-1.5 text-xs" aria-hidden="true"></i>
            </span>
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { useApi } from '../../composables/useApi.js'
import FaIcon from '../FaIcon.vue'
import { isComposing } from '../../utils/text.js'

const props = defineProps({
  submissionId: { type: Number, required: true },
})

const emit = defineEmits(['replied'])

const { post } = useApi()
const body = ref('')
const sending = ref(false)
const toast = ref(null)
// One key per reply: a retry after a timeout carries the same key, so the
// server sends the email once even if the first attempt did get through.
// A new key once that reply is sent, or its text changes.
let clientKey = crypto.randomUUID()
let keyedText = ''

async function sendReply() {
  if (!body.value.trim() || sending.value) return

  sending.value = true
  toast.value = null

  const text = body.value.trim()
  if (text !== keyedText) { clientKey = crypto.randomUUID(); keyedText = text }
  try {
    const result = await post(`/api/submissions/${props.submissionId}/reply`, {
      body: text,
      clientKey,
    })

    body.value = ''
    clientKey = crypto.randomUUID()
    keyedText = ''
    // Pass the result up: it carries the auto-advanced lead status.
    emit('replied', result)

    if (result.emailFailed) {
      showToast('Reply saved but email delivery failed — follow up manually', 'warning')
    } else {
      showToast('Reply sent', 'success')
    }
  } catch {
    // The text stays; sending again reuses the key, so nothing goes out twice.
    showToast('Could not confirm it was sent. Send again — it will not go out twice.', 'warning')
  } finally {
    sending.value = false
  }
}

let toastTimer = null

function showToast(message, type) {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { message, type }
  toastTimer = setTimeout(() => { toast.value = null }, 5000)
}

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
})
</script>
