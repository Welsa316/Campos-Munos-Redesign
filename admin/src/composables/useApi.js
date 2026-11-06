// HTTP client for the staff portal.
//
// The API lives on its own origin in production (api.camulaw.com), so every
// request carries the session cookie with credentials: 'include'. The cookie
// is host-only on the API and SameSite=Lax: admin.camulaw.com and
// api.camulaw.com are the same *site*, so the browser sends it, while a page on
// any other site cannot ride on it.
import { sessionExpired } from './appStatus.js'
import { createApiFetch, jsonBody } from '../utils/apiRequest.js'

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

/**
 * The session ended (a 401). No reload: a reload would throw away a reply
 * someone was typing. The banner in App.vue offers to sign in again and come
 * back to this screen; requests stop until then.
 */
function goToLogin() {
  if (typeof window === 'undefined') return
  if (window.location.pathname !== LOGIN_PATH) sessionExpired.value = true
}

/** Where to sign in so the person comes back to this screen afterwards. */
export function loginHref() {
  if (typeof window === 'undefined') return LOGIN_PATH
  const here = window.location.pathname.slice(import.meta.env.BASE_URL.length - 1) + window.location.search
  return here && here !== '/' ? `${LOGIN_PATH}?next=${encodeURIComponent(here)}` : LOGIN_PATH
}

export { latestOnly } from '../utils/latestOnly.js'
export { ApiError } from '../utils/apiRequest.js'

/**
 * Every portal request. A refusal throws an ApiError carrying status, the
 * server's code and its body (utils/apiRequest.js); once the session has
 * ended nothing more is sent.
 */
export const apiFetch = createApiFetch({ send: rawFetch, isEnded: () => sessionExpired.value, onEnded: () => goToLogin() })

const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  // A DELETE may carry a body (turning off push names the endpoint).
  del: (path, body) => apiFetch(path, { method: 'DELETE', body: jsonBody(body) }),
}

export function useApi() {
  return api
}

export { goToLogin }
