export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export async function rawFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

export function useApi() {
  async function apiFetch(path, options = {}) {
    const res = await rawFetch(path, options)

    if (res.status === 401) {
      window.location.href = '/admin/login'
      throw new Error('Unauthorized')
    }

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Request failed')
    }

    return data
  }

  return {
    get: (path) => apiFetch(path),
    post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
    patch: (path, body) => apiFetch(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  }
}
