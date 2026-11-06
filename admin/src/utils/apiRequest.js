// The portal's one request path (useApi's apiFetch), apart from Vue and the
// page so its rules are tested (admin/test/apiRequest.test.js):
//   - once the session has ended, nothing more is sent;
//   - a 401 marks the session ended (the banner offers to sign in again);
//   - a refusal throws an ApiError that keeps the status, the server's code
//     and its whole body, because some carry what the screen needs next (a
//     409 from /api/reminders carries the reminder it clashed with).

export const SESSION_ENDED = 'Your session has ended. Sign in again.'
export const FAILED = 'Something went wrong. Try again.'

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, data = {} } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.data = data
  }
}

/**
 * apiFetch(path, options) over a fetch-like `send` (rawFetch in the page).
 * isEnded() and onEnded() read and set the session-ended state.
 */
export function createApiFetch({ send, isEnded = () => false, onEnded = () => {} }) {
  return async function apiFetch(path, options = {}) {
    if (isEnded()) throw new ApiError(SESSION_ENDED, { status: 401, code: 'session_ended' })
    const res = await send(path, options)
    if (res.status === 401) {
      onEnded()
      throw new ApiError(SESSION_ENDED, { status: 401, code: 'session_ended' })
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(data.error || FAILED, { status: res.status, code: data.code || null, data })
    return data
  }
}

/** JSON in, for the verb helpers: a body only when there is one. */
export const jsonBody = (body) => (body === undefined ? undefined : JSON.stringify(body))
