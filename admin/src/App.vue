<template>
  <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[300] focus:bg-brand-navy focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-ui focus:text-sm">
    Skip to content
  </a>
  <!-- The session ended, or a screen failed: say so without reloading. -->
  <div v-if="sessionExpired || renderError" role="alert"
    class="fixed inset-x-0 top-0 z-[250] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 bg-amber-50 text-amber-900 ring-1 ring-amber-200 text-sm font-ui shadow-sm">
    <template v-if="sessionExpired">
      <span>Your session has ended. Anything you were typing is still here.</span>
      <a :href="loginHref()" class="font-semibold underline">Sign in again</a>
    </template>
    <template v-else>
      <span>Something went wrong showing this screen.</span>
      <button type="button" @click="reload" class="font-semibold underline">Reload</button>
    </template>
  </div>
  <main id="main" tabindex="-1" class="relative">
    <!-- The sections staff move between stay alive, so going back to one
         shows it at once while it refreshes in the background. Signing out
         empties the cache, so the next account never sees the last one's. -->
    <!-- Changing section cross-fades: the new page fades in and settles while
         the old one fades out over it (nothing waits, so it is no slower). -->
    <router-view v-slot="{ Component }">
      <Transition name="section">
        <KeepAlive :include="isAuthenticated ? KEPT : []" :max="KEPT.length">
          <component :is="Component" />
        </KeepAlive>
      </Transition>
    </router-view>
  </main>
  <SwipeToast />
</template>

<script setup>
import { sessionExpired, renderError } from './composables/appStatus.js'
import { loginHref } from './composables/useApi.js'
import { useAuth } from './composables/useAuth.js'
import SwipeToast from './components/SwipeToast.vue'

// Each refreshes itself when shown again (onActivated) and stops polling
// while hidden (onDeactivated).
const KEPT = ['DashboardView', 'InboxView', 'CallsView', 'WhatsAppView']
const { isAuthenticated } = useAuth()

const reload = () => window.location.reload()
</script>

<style>
/* Section changes: ~200 ms, one curve, no movement with reduced motion. */
.section-enter-active { transition: opacity 200ms ease-out, transform 240ms cubic-bezier(0.22, 1, 0.36, 1); }
.section-leave-active { transition: opacity 140ms ease-in; position: absolute; inset: 0; pointer-events: none; }
.section-enter-from { opacity: 0; transform: translateY(4px); }
.section-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .section-enter-active, .section-leave-active { transition: none; }
  .section-enter-from { transform: none; }
}
</style>
