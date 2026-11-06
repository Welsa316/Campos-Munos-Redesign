// /api/reminders (server/routes/reminders.js). Unlike useApi, a refusal keeps
// its code and body: a 409 carries the existing reminder (a duplicate) or
// the current one (someone else changed it), which the popover offers.
import { rawFetch, goToLogin } from '../../composables/useApi.js'
import { sessionExpired } from '../../composables/appStatus.js'

export class ReminderRequestError extends Error {
  constructor(message, { status, code, reminder } = {}) {
    super(message)
    this.status = status
    this.code = code || null
    this.reminder = reminder || null
  }
}

async function call(method, path, body) {
  if (sessionExpired.value) throw new ReminderRequestError('Your session has ended. Sign in again.', { status: 401 })
  const res = await rawFetch(`/api/reminders${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) })
  if (res.status === 401) {
    goToLogin()
    throw new ReminderRequestError('Unauthorized', { status: 401 })
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ReminderRequestError(data.error || 'Request failed', { status: res.status, code: data.code, reminder: data.reminder })
  return data
}

export const remindersApi = {
  mine: () => call('GET', '/mine'),
  forCalls: () => call('GET', '?kind=call'),
  forLead: (id) => call('GET', `?lead=${encodeURIComponent(id)}`),
  assignees: (kind) => call('GET', `/assignees?kind=${kind === 'submission' ? 'submission' : 'call'}`),
  create: (body) => call('POST', '', body),
  update: (id, body) => call('PATCH', `/${id}`, body),
  complete: (id, version) => call('POST', `/${id}/complete`, { version }),
  cancel: (id, version) => call('POST', `/${id}/cancel`, { version }),
  snooze: (id, body) => call('POST', `/${id}/snooze`, body),
}
