<template>
  <transition name="fade">
    <div v-if="visible" class="fixed inset-0 z-[200] flex items-center justify-center p-4" @click.self="close">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

      <div class="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div class="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 class="font-heading text-xl text-brand-navy">Change password</h2>
            <p class="text-gray-400 text-sm font-ui mt-1">Use at least 10 characters.</p>
          </div>
          <button @click="close" type="button"
            class="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors"
            aria-label="Close">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        <form @submit.prevent="submit" class="px-6 py-5 space-y-4">
          <div>
            <label class="block text-xs font-ui font-semibold tracking-wide uppercase text-gray-500 mb-1.5">
              Current password
            </label>
            <input v-model="form.currentPassword" type="password" required autocomplete="current-password"
              class="w-full px-3 py-2.5 rounded-lg bg-brand-surface border border-gray-200 focus:border-brand-navy/40 focus:ring-2 focus:ring-brand-navy/10 focus:outline-none text-sm font-ui text-gray-800" />
          </div>
          <div>
            <label class="block text-xs font-ui font-semibold tracking-wide uppercase text-gray-500 mb-1.5">
              New password
            </label>
            <input v-model="form.newPassword" type="password" required minlength="10" autocomplete="new-password"
              class="w-full px-3 py-2.5 rounded-lg bg-brand-surface border border-gray-200 focus:border-brand-navy/40 focus:ring-2 focus:ring-brand-navy/10 focus:outline-none text-sm font-ui text-gray-800" />
          </div>
          <div>
            <label class="block text-xs font-ui font-semibold tracking-wide uppercase text-gray-500 mb-1.5">
              Confirm new password
            </label>
            <input v-model="form.confirmPassword" type="password" required minlength="10" autocomplete="new-password"
              class="w-full px-3 py-2.5 rounded-lg bg-brand-surface border border-gray-200 focus:border-brand-navy/40 focus:ring-2 focus:ring-brand-navy/10 focus:outline-none text-sm font-ui text-gray-800" />
          </div>

          <p v-if="error" class="text-brand-red text-xs font-ui">
            <i class="fa-solid fa-circle-exclamation mr-1"></i>{{ error }}
          </p>
          <p v-if="success" class="text-green-600 text-xs font-ui">
            <i class="fa-solid fa-check-circle mr-1"></i>Password updated. You'll need to use it next time you sign in.
          </p>

          <div class="flex items-center gap-2 pt-2">
            <button type="button" @click="close"
              class="flex-1 py-2.5 rounded-lg text-gray-500 hover:text-gray-800 text-sm font-ui font-medium border border-gray-200 hover:border-gray-300 transition-colors">
              Cancel
            </button>
            <button type="submit" :disabled="loading || success"
              class="flex-1 py-2.5 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-sm font-ui font-bold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <span v-if="loading"><i class="fa-solid fa-spinner fa-spin mr-1.5 text-xs"></i>Updating…</span>
              <span v-else>Update password</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch } from 'vue'
import { rawFetch } from '../../composables/useApi.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const form = ref({ currentPassword: '', newPassword: '', confirmPassword: '' })
const loading = ref(false)
const error = ref('')
const success = ref(false)

watch(() => props.visible, (v) => {
  if (v) {
    form.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
    error.value = ''
    success.value = false
    loading.value = false
  }
})

function close() {
  emit('close')
}

async function submit() {
  error.value = ''
  success.value = false

  if (form.value.newPassword !== form.value.confirmPassword) {
    error.value = 'New password and confirmation do not match.'
    return
  }
  if (form.value.newPassword.length < 10) {
    error.value = 'New password must be at least 10 characters.'
    return
  }
  if (form.value.newPassword === form.value.currentPassword) {
    error.value = 'New password must be different from the current one.'
    return
  }

  loading.value = true
  try {
    const res = await rawFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: form.value.currentPassword,
        newPassword: form.value.newPassword,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to update password')
    }

    success.value = true
    form.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
  } catch (err) {
    error.value = err.message || 'Failed to update password'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
