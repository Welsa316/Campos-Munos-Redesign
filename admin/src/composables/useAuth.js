import { ref, computed } from 'vue'
import { rawFetch } from './useApi.js'
import { applyTheme, cacheTheme, DEFAULT_THEME } from '../data/themes.js'

const isAuthenticated = ref(false)
const adminEmail = ref('')
// Who is signed in and what they may do (server/auth/capabilities.js). The
// portal only uses this to decide what to show; the API checks every
// request on its own.
const profile = ref({ name: '', displayName: '', role: '', roleLabel: '', capabilities: [], avatar: null, theme: DEFAULT_THEME })
const loading = ref(false)
let verified = false

const capabilitySet = computed(() => new Set(profile.value.capabilities))

function applyProfile(data) {
  isAuthenticated.value = true
  adminEmail.value = data.email
  profile.value = {
    name: data.name || '',
    displayName: data.displayName || '',
    role: data.role || '',
    roleLabel: data.roleLabel || '',
    capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
    // { kind: 'fluent'|'emoji', key, bg, chosen } (server/auth/avatars.js)
    avatar: data.avatar || null,
    // Colour theme (server/auth/themes.js); the whole portal follows it.
    theme: data.theme || DEFAULT_THEME,
  }
  applyTheme(profile.value.theme)
  cacheTheme(profile.value.theme)
}

function clearProfile() {
  isAuthenticated.value = false
  adminEmail.value = ''
  profile.value = { name: '', displayName: '', role: '', roleLabel: '', capabilities: [], avatar: null, theme: DEFAULT_THEME }
  // Signed out (or someone else signing in on this computer): back to Classic.
  applyTheme(DEFAULT_THEME)
  cacheTheme(null)
}

/** Switch this account's theme on screen (the caller saves it). */
export function setTheme(key) {
  profile.value = { ...profile.value, theme: key }
  applyTheme(key)
  cacheTheme(key)
}

/** True when the signed-in account has every named capability. */
export function can(...names) {
  return names.every((n) => capabilitySet.value.has(n))
}

/** True when it has at least one of them. */
export function canAny(...names) {
  return names.some((n) => capabilitySet.value.has(n))
}

/** Home (the dashboard) for any account that may do anything; else the no-access page. */
export function homeRoute() {
  return { name: capabilitySet.value.size ? 'Home' : 'NoAccess' }
}

export function useAuth() {
  async function verify() {
    if (verified) return isAuthenticated.value

    loading.value = true
    // Only a 401 means signed out. A network blip or a 5xx is tried once more,
    // and if it still fails the next navigation checks again.
    let settled = false
    try {
      for (let attempt = 0; attempt < 2 && !settled; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 800))
        try {
          const res = await rawFetch('/api/auth/verify')
          if (res.ok) { applyProfile(await res.json()); settled = true } else if (res.status === 401) { clearProfile(); settled = true }
        } catch { /* try again */ }
      }
      if (!settled) clearProfile()
    } finally {
      loading.value = false
      verified = settled
    }

    return isAuthenticated.value
  }

  async function login(email, password) {
    const res = await rawFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      throw new Error(data.error || 'Login failed')
    }

    applyProfile(data)
    verified = true
  }

  async function logout() {
    try {
      await rawFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // noop
    }
    clearProfile()
    verified = false
  }

  return {
    isAuthenticated,
    adminEmail,
    profile,
    loading,
    can,
    canAny,
    homeRoute,
    // After the account changes something about itself (its picture).
    updateProfile: applyProfile,
    verify,
    login,
    logout,
  }
}
