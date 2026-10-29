// HTTP client for the staff portal.
//
// The API lives on its own origin in production (api.camulaw.com), so every
// request carries the session cookie with credentials: 'include'. The cookie
// is host-only on the API and SameSite=Lax: admin.camulaw.com and
// api.camulaw.com are the same *site*, so the browser sends it, while a page on
// any other site cannot ride on it.
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

/** Where the router lives, so redirects work under '/' and under '/admin/'. */
export const LOGIN_PATH = `${import.meta.env.BASE_URL}login`

export function apiUrl(path) {
  return `${API_BASE}${path}`
}

export async function rawFetch(path, options = {}) {
  return fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

function goToLogin() {
  if (typeof window === 'undefined') return
  if (window.location.pathname !== LOGIN_PATH) window.location.href = LOGIN_PATH
}

export function useApi() {
  async function apiFetch(path, options = {}) {
    const res = await rawFetch(path, options)

    if (res.status === 401) {
      goToLogin()
      throw new Error('Unauthorized')
    }

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      throw new Error(data.error || 'Request failed')
    }

    return data
  }

  return {
    get: (path) => apiFetch(path),
    post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
    patch: (path, body) => apiFetch(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
    del: (path) => apiFetch(path, { method: 'DELETE' }),
  }
}

export { goToLogin }
