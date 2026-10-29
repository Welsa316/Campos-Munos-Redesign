import { ref, computed } from 'vue'
import { rawFetch } from './useApi.js'

const isAuthenticated = ref(false)
const adminEmail = ref('')
// Who is signed in and what they may do (server/auth/capabilities.js). The
// portal only uses this to decide what to show; the API checks every
// request on its own.
const profile = ref({ name: '', role: '', roleLabel: '', capabilities: [] })
const loading = ref(false)
let verified = false

const capabilitySet = computed(() => new Set(profile.value.capabilities))

function applyProfile(data) {
  isAuthenticated.value = true
  adminEmail.value = data.email
  profile.value = {
    name: data.name || '',
    role: data.role || '',
    roleLabel: data.roleLabel || '',
    capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
  }
}

function clearProfile() {
  isAuthenticated.value = false
  adminEmail.value = ''
  profile.value = { name: '', role: '', roleLabel: '', capabilities: [] }
}

/** True when the signed-in account has every named capability. */
export function can(...names) {
  return names.every((n) => capabilitySet.value.has(n))
}

/** True when it has at least one of them. */
export function canAny(...names) {
  return names.some((n) => capabilitySet.value.has(n))
}

// The first screen: where the account does its main work. Whoever works the
// leads starts on Messages (as every account did before roles); a billing
// account on Billing.
const SECTIONS = [
  { name: 'Inbox', any: ['crm.manage'] },
  { name: 'BillingOverview', any: ['billing.view'] },
  { name: 'WhatsApp', any: ['whatsapp.view'] },
  { name: 'Inbox', any: ['crm.view'] },
  { name: 'BillingInvoices', any: ['billing.status'] },
  { name: 'BillingContacts', any: ['whatsapp.contacts'] },
]

/** The first screen this account may open, or the no-access page. */
export function homeRoute() {
  const s = SECTIONS.find((x) => canAny(...x.any))
  return { name: s ? s.name : 'NoAccess' }
}

export function useAuth() {
  async function verify() {
    if (verified) return isAuthenticated.value

    loading.value = true
    try {
      const res = await rawFetch('/api/auth/verify')
      if (res.ok) applyProfile(await res.json())
      else clearProfile()
    } catch {
      clearProfile()
    } finally {
      loading.value = false
      verified = true
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
    verify,
    login,
    logout,
  }
}
