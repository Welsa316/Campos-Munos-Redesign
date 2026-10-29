<template>
  <div class="min-h-dvh flex items-center justify-center bg-brand-surface px-4">
    <div class="text-center max-w-sm">
      <i class="fa-solid fa-lock text-3xl text-gray-300 mb-4" aria-hidden="true"></i>
      <h1 class="font-heading text-xl text-brand-navy mb-2">Nothing to open yet</h1>
      <p class="text-sm font-ui text-gray-600 mb-6">
        You are signed in as {{ adminEmail }}, but this account has not been given access to any part of the portal.
        Ask the office administrator.
      </p>
      <button @click="signOut" class="px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold">Sign out</button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const router = useRouter()
const { adminEmail, logout } = useAuth()

async function signOut() {
  await logout()
  router.push({ name: 'Login' })
}
</script>
