<template>
  <div class="min-h-dvh bg-brand-surface flex items-center justify-center px-6">
    <div class="w-full max-w-md">
      <!-- Logo -->
      <div class="text-center mb-10">
        <img :src="LOGO_SRC" alt="Campos Muños Law" class="logo-on-page h-16 mx-auto mb-6" />
        <h1 class="font-heading text-2xl text-brand-navy">Admin Portal</h1>
      </div>

      <!-- Login card -->
      <div class="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        <form @submit.prevent="handleLogin" class="space-y-5">
          <div class="form-group">
            <label for="admin-login-email" class="form-label">Email</label>
            <input
              id="admin-login-email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="form-input"
              placeholder="admin@camulaw.com"
            />
          </div>

          <div class="form-group">
            <label for="admin-login-password" class="form-label">Password</label>
            <input
              id="admin-login-password"
              ref="passwordRef"
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              class="form-input"
            />
          </div>

          <!-- 30 days instead of 8 hours. Signing out still ends it at once. -->
          <div class="flex items-start gap-3">
            <input id="admin-login-remember" v-model="remember" type="checkbox" aria-describedby="admin-login-remember-hint" class="mt-0.5 w-4 h-4 accent-brand-navy flex-shrink-0 cursor-pointer" />
            <label for="admin-login-remember" class="text-sm font-ui text-gray-700 leading-snug cursor-pointer select-none">Keep me signed in on this computer
              <span id="admin-login-remember-hint" class="block text-xs text-gray-500">For 30 days. Leave it off on a shared computer.</span>
            </label>
          </div>

          <transition name="fade">
            <p v-if="errorMsg" role="alert" aria-live="assertive" class="text-brand-red text-sm font-ui">
              <i class="fa-solid fa-exclamation-circle mr-1" aria-hidden="true"></i>{{ errorMsg }}
            </p>
          </transition>

          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-brand-navy text-white font-ui font-semibold tracking-wider text-sm py-4 rounded-xl btn-magnetic disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="loading">
              <i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Signing in...
            </span>
            <span v-else>Sign In</span>
          </button>
        </form>
      </div>

      <p class="text-center text-gray-500 text-xs font-ui mt-8">
        Campos Mu&ntilde;os Law &mdash; Secure Admin Access
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { LOGO_SRC } from '../data/brand.js'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { safeNextPath } from '../utils/safeNext.js'

const router = useRouter()
const route = useRoute()
const { login, homeRoute } = useAuth()

// The last address used to sign in here, so only the password needs typing.
const EMAIL_KEY = 'cm-login-email'
const readEmail = () => { try { return localStorage.getItem(EMAIL_KEY) || '' } catch { return '' } }
const email = ref(readEmail())
const password = ref('')
const remember = ref(false)
const passwordRef = ref(null)
// The address is remembered: start in the password box.
onMounted(() => { if (email.value) passwordRef.value?.focus() })
const loading = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  loading.value = true
  errorMsg.value = ''

  try {
    await login(email.value, password.value, { remember: remember.value })
    try { localStorage.setItem(EMAIL_KEY, email.value.trim()) } catch { /* private window: nothing to remember */ }
    // The guard redirects again if `next` is a screen this account cannot use.
    router.push(safeNextPath(route.query.next) || homeRoute())
  } catch (err) {
    errorMsg.value = err.message || 'Invalid email or password'
  } finally {
    loading.value = false
  }
}
</script>
