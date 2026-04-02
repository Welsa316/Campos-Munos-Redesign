import { ref } from 'vue'

const isAuthenticated = ref(false)
const adminEmail = ref('')
const loading = ref(true)
let verified = false

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  return res
}

export function useAuth() {
  async function verify() {
    if (verified) return isAuthenticated.value

    loading.value = true
    try {
      const res = await apiFetch('/api/auth/verify')
      if (res.ok) {
        const data = await res.json()
        isAuthenticated.value = true
        adminEmail.value = data.email
      } else {
        isAuthenticated.value = false
        adminEmail.value = ''
      }
    } catch {
      isAuthenticated.value = false
      adminEmail.value = ''
    } finally {
      loading.value = false
      verified = true
    }

    return isAuthenticated.value
  }

  async function login(email, password) {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Login failed')
    }

    isAuthenticated.value = true
    adminEmail.value = data.email
    verified = true
  }

  async function logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Clear state regardless
    }
    isAuthenticated.value = false
    adminEmail.value = ''
    verified = false
  }

  return {
    isAuthenticated,
    adminEmail,
    loading,
    verify,
    login,
    logout,
  }
}
