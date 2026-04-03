<template>
  <div class="min-h-screen bg-brand-surface flex items-center justify-center px-6">
    <div class="w-full max-w-md">
      <!-- Logo -->
      <div class="text-center mb-10">
        <img src="/logo.png" alt="Campos Munos Law" class="h-16 mx-auto mb-6" />
        <h1 class="font-heading text-2xl text-brand-navy">Admin Portal</h1>
      </div>

      <!-- Login card -->
      <div class="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        <form @submit.prevent="handleLogin" class="space-y-5">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="form-input"
              placeholder="admin@camulaw.com"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Password</label>
            <input
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              class="form-input"
            />
          </div>

          <transition name="fade">
            <p v-if="errorMsg" class="text-brand-red text-sm font-ui">
              <i class="fa-solid fa-exclamation-circle mr-1"></i>{{ errorMsg }}
            </p>
          </transition>

          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-brand-navy text-white font-ui font-semibold tracking-wider text-sm py-4 rounded-xl btn-magnetic disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="loading">
              <i class="fa-solid fa-spinner fa-spin mr-2"></i>Signing in...
            </span>
            <span v-else>Sign In</span>
          </button>
        </form>
      </div>

      <p class="text-center text-gray-400 text-xs font-ui mt-8">
        Campos Mu&ntilde;os Law &mdash; Secure Admin Access
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const router = useRouter()
const { login } = useAuth()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  loading.value = true
  errorMsg.value = ''

  try {
    await login(email.value, password.value)
    router.push({ name: 'AdminDashboard' })
  } catch (err) {
    errorMsg.value = err.message || 'Invalid email or password'
  } finally {
    loading.value = false
  }
}
</script>
