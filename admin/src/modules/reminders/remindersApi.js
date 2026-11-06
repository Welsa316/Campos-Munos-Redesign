// /api/reminders (server/routes/reminders.js), through the portal's apiFetch.
// A refusal keeps its code and body (ApiError): a 409 carries the existing
// reminder (a duplicate) or the current one (someone else changed it) in
// err.data.reminder, which the popover offers.
import { useApi } from '../../composables/useApi.js'

const { get, post, patch } = useApi()
const base = '/api/reminders'

export const remindersApi = {
  mine: () => get(`${base}/mine`),
  forCalls: () => get(`${base}?kind=call`),
  forLead: (id) => get(`${base}?lead=${encodeURIComponent(id)}`),
  assignees: (kind) => get(`${base}/assignees?kind=${kind === 'submission' ? 'submission' : 'call'}`),
  create: (body) => post(base, body),
  update: (id, body) => patch(`${base}/${id}`, body),
  complete: (id, version) => post(`${base}/${id}/complete`, { version }),
  cancel: (id, version) => post(`${base}/${id}/cancel`, { version }),
  snooze: (id, body) => post(`${base}/${id}/snooze`, body),
}
