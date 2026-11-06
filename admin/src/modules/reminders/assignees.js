// Who a reminder can be assigned to, per kind of target, fetched once and
// shared by every Remind me panel (it changes only when an administrator
// adds or disables an account).
// Kept per signed-in account: "me" differs when someone else signs in.
import { remindersApi } from './remindersApi.js'
import { useAuth } from '../../composables/useAuth.js'

const cache = new Map()

export function loadAssignees(kind) {
  const k = `${useAuth().adminEmail.value}|${kind === 'submission' ? 'submission' : 'call'}`
  kind = kind === 'submission' ? 'submission' : 'call'
  if (!cache.has(k)) {
    const p = remindersApi.assignees(kind).catch((err) => { cache.delete(k); throw err })
    cache.set(k, p)
  }
  return cache.get(k)
}
