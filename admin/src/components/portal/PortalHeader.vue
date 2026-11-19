<template>
  <!-- The shell every section uses: white bar, logo, title, the other
       sections, password, desktop notifications and sign-out. A section
       with a second row (Billing's tabs) puts it in the default slot. -->
  <header :class="$slots.default ? '' : 'h-16'" class="nav-chrome flex-shrink-0 bg-white border-b border-gray-200 z-10">
    <div :class="$slots.default ? 'h-16' : 'h-full'" class="flex items-center px-4 sm:px-6 gap-3">
      <div class="flex items-center gap-3 sm:gap-4 min-w-0">
        <img :src="LOGO_SRC" alt="Campos Muños Law" class="hidden min-[420px]:block h-7 sm:h-9 flex-shrink-0" />
        <div class="w-px h-8 bg-gray-200 hidden sm:block" aria-hidden="true"></div>
        <h1 class="font-heading text-lg text-brand-navy tracking-tight truncate">{{ title }}</h1>
      </div>
      <div class="ml-auto flex items-center gap-1 sm:gap-3">
        <SectionLinks :current="current" :label-at="labelAt" />
        <span v-if="showEmail" class="text-xs text-gray-500 font-ui hidden lg:inline">{{ adminEmail }}</span>
        <button @click="showChangePassword = true" :aria-label="t('header.change_password')" :title="t('header.change_password')"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors">
          <FaIcon name="key" class="text-xs" />
          <span :class="actionLabel">{{ t('header.password') }}</span>
        </button>
        <button v-if="notifications" @click="showNotifications = true" :aria-label="t('header.desktop_notifications')" :title="t('header.desktop_notifications')"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors">
          <FaIcon name="bell" class="text-xs" />
          <span :class="actionLabel">{{ t('header.notifications') }}</span>
        </button>
        <button @click="signOut" :aria-label="t('header.sign_out')"
          class="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-gray-500 hover:text-brand-red hover:bg-red-50 text-sm font-ui font-medium transition-colors">
          <FaIcon name="arrow-right-from-bracket" class="text-xs" />
          <span class="hidden sm:inline">{{ t('header.sign_out') }}</span>
        </button>
      </div>
    </div>
    <slot />
  </header>
  <ChangePasswordModal :visible="showChangePassword" @close="showChangePassword = false" />
  <NotificationsModal v-if="notifications" :visible="showNotifications" @close="showNotifications = false" />
</template>

<script setup>
import { ref, computed } from 'vue'
import { LOGO_SRC } from '../../data/brand.js'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import { signOutAndLeave } from '../../utils/signOut.js'
import SectionLinks from './SectionLinks.vue'
import ChangePasswordModal from '../messages/ChangePasswordModal.vue'
import NotificationsModal from './NotificationsModal.vue'
import FaIcon from '../FaIcon.vue'
import { useT } from '../../i18n/translator.js'
import { PORTAL } from '../../i18n/portal.js'

const { t, lang } = useT(PORTAL)

const props = defineProps({
  title: { type: String, required: true },
  // SectionLinks key of this section (not linked to itself).
  current: { type: String, required: true },
  // From which width the section links carry their labels (SectionLinks).
  labelAt: { type: String, default: '2xl' },
  // From which width Password and Notifications carry theirs: 'lg' or '2xl'.
  actionsLabelAt: { type: String, default: '2xl' },
  // The signed-in email beside the actions, from lg.
  showEmail: { type: Boolean, default: false },
  notifications: { type: Boolean, default: true },
})

// Whole class names, so Tailwind sees them.
const ACTION_LABEL = { lg: 'hidden lg:inline', '2xl': 'hidden 2xl:inline' }
// Spanish (Contraseña, Notificaciones) is longer: labelled only on very
// wide screens, so an administrator's full header still fits on one line
// (icons with their tooltip and spoken name below that).
const ACTION_LABEL_ES = 'hidden min-[1800px]:inline'
const actionLabel = computed(() => (lang.value === 'en' ? ACTION_LABEL[props.actionsLabelAt] || ACTION_LABEL['2xl'] : ACTION_LABEL_ES))

const router = useRouter()
const { adminEmail, logout } = useAuth()
const showChangePassword = ref(false)
const showNotifications = ref(false)

const signOut = () => signOutAndLeave(logout, router)
</script>
