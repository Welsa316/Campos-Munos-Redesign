<template>
  <div class="border-t border-gray-100 p-5 flex-shrink-0">
    <form @submit.prevent="sendReply">
      <textarea
        v-model="body"
        rows="3"
        maxlength="10000"
        :disabled="sending"
        placeholder="Type your reply..."
        class="form-input resize-none text-sm mb-3"
      ></textarea>

      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-400 font-ui">
          {{ body.length.toLocaleString() }} / 10,000
        </span>

        <div class="flex items-center gap-3">
          <!-- Toast messages -->
          <transition name="fade">
            <span v-if="toast" :class="[
              'text-xs font-ui',
              toast.type === 'success' ? 'text-green-600' : 'text-amber-600'
            ]">
              <i :class="toast.type === 'success' ? 'fa-solid fa-check-circle' : 'fa-solid fa-exclamation-triangle'" class="mr-1"></i>
              {{ toast.message }}
            </span>
          </transition>

          <button
            type="submit"
            :disabled="sending || !body.trim()"
            class="bg-brand-navy text-white font-ui font-medium text-sm px-5 py-2.5 rounded-xl btn-magnetic disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          >
            <span v-if="sending">
              <i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Sending...
            </span>
            <span v-else>
              Send Reply <i class="fa-solid fa-paper-plane ml-1.5 text-xs"></i>
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

const props = defineProps({
  submissionId: { type: Number, required: true },
})

const emit = defineEmits(['replied'])

const { post } = useApi()
const body = ref('')
const sending = ref(false)
const toast = ref(null)

async function sendReply() {
  if (!body.value.trim() || sending.value) return

  sending.value = true
  toast.value = null

  try {
    const result = await post(`/api/submissions/${props.submissionId}/reply`, {
      body: body.value.trim(),
    })

    body.value = ''
    emit('replied')

    if (result.emailFailed) {
      showToast('Reply saved but email delivery failed — follow up manually', 'warning')
    } else {
      showToast('Reply sent', 'success')
    }
  } catch {
    showToast('Failed to send reply. Please try again.', 'warning')
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
