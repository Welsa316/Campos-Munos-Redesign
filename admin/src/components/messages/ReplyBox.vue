<template>
  <div class="border-t border-gray-100 p-5 flex-shrink-0">
    <!-- relative: the emoji panel opens above the form, lined up with its right edge. -->
    <form @submit.prevent="sendReply" class="relative">
      <label for="reply-body" class="sr-only">{{ t('reply.label') }}</label>
      <textarea
        id="reply-body"
        ref="field"
        v-model="body"
        rows="3"
        maxlength="10000"
        :disabled="sending"
        :placeholder="t('reply.placeholder')"
        :aria-label="t('reply.label')"
        class="form-input resize-none text-sm mb-3"
        @keydown.enter.exact="(e) => { if (!isComposing(e)) { e.preventDefault(); sendReply() } }"
      ></textarea>

      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500 font-ui">
          <span class="hidden sm:inline">{{ t('reply.hint') }}</span>{{ body.length.toLocaleString(locale) }} / {{ (10000).toLocaleString(locale) }}
        </span>

        <div class="flex items-center gap-2">
          <EmojiPicker v-model="body" :field="field" :maxlength="10000" :disabled="sending" />
          <button
            type="submit"
            :disabled="sending || !body.trim()"
            class="bg-brand-navy text-white font-ui font-medium text-sm px-5 py-2.5 rounded-xl btn-magnetic disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          >
            <span v-if="sending">
              <i class="fa-solid fa-spinner fa-spin mr-1.5" aria-hidden="true"></i>{{ t('reply.sending') }}
            </span>
            <span v-else>
              {{ t('reply.send') }} <i class="fa-solid fa-paper-plane ml-1.5 text-xs" aria-hidden="true"></i>
            </span>
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useApi } from '../../composables/useApi.js'
import { toast } from '../../composables/useToast.js'
import { isComposing } from '../../utils/text.js'
import EmojiPicker from '../EmojiPicker.vue'
import { useT } from '../../i18n/translator.js'
import { MESSAGES } from '../../i18n/messages.js'

const { t, locale } = useT(MESSAGES)

const props = defineProps({
  submissionId: { type: Number, required: true },
})

const emit = defineEmits(['replied'])

const { post } = useApi()
const body = ref('')
const field = ref(null)
const sending = ref(false)
// One key per reply: a retry after a timeout carries the same key, so the
// server sends the email once even if the first attempt did get through.
// A new key once that reply is sent, or its text changes.
let clientKey = crypto.randomUUID()
let keyedText = ''

async function sendReply() {
  if (!body.value.trim() || sending.value) return

  sending.value = true

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

    // The portal's toast. A reply that may not have reached the client stays
    // until dismissed, so nobody misses it.
    if (result.emailFailed) {
      toast({ text: t('reply.email_failed'), tone: 'error' })
    } else {
      toast(t('reply.sent'))
    }
  } catch {
    // The text stays; sending again reuses the key, so nothing goes out twice.
    toast({ text: t('reply.unconfirmed'), tone: 'error' })
  } finally {
    sending.value = false
  }
}
</script>
