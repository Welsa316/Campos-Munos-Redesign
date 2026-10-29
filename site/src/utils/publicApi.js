// Client for the public endpoints the website calls (contact form, chat).
//
// The website never authenticates: chat follow-ups carry their own chat_token
// in the body. So requests go out WITHOUT cookies (credentials: 'omit'). That
// matters once the API moves to api.camulaw.com: the API only grants
// credentialed CORS to the staff portal's origin, and a public page that could
// send the staff session cookie would be a way to ride on it.
//
// VITE_API_BASE_URL is the API origin in production (https://api.camulaw.com).
// Empty means same origin: local dev (Vite proxies /api) and the transitional
// single-service deployment.
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

export async function rawFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}
