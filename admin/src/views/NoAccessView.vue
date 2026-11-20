<template>
  <div class="min-h-dvh flex items-center justify-center bg-brand-surface px-4">
    <div class="text-center max-w-sm">
      <i class="fa-solid fa-lock text-3xl text-gray-300 mb-4" aria-hidden="true"></i>
      <h1 class="font-heading text-xl text-brand-navy mb-2">{{ t('noaccess.heading') }}</h1>
      <p class="text-sm font-ui text-gray-600 mb-6">
        {{ t('noaccess.body', { email: adminEmail }) }}
      </p>
      <button @click="signOut" class="px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold">{{ t('noaccess.sign_out') }}</button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { signOutAndLeave } from '../utils/signOut.js'
import { useT } from '../i18n/translator.js'
import { PORTAL } from '../i18n/portal.js'

const { t } = useT(PORTAL)

const router = useRouter()
const { adminEmail, logout } = useAuth()

const signOut = () => signOutAndLeave(logout, router)
</script>
