// While someone is using the portal, a callback reminder of theirs falling
// due shows a toast with Open (App.vue). It asks /api/reminders/mine once a
// minute while the tab is visible; the email and the desktop notification
// come from the server whether or not the portal is open. Each reminder is
// announced once per tab (sessionStorage), and again only if it was
// snoozed and fell due again.
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import { toast } from '../../composables/useToast.js'
import { useVisiblePoll } from '../../composables/useVisiblePoll.js'
import { remindersApi } from './remindersApi.js'
import { dueToAnnounce, announceKey } from './reminderText.js'

export const POLL_MS = 60 * 1000
const STORE = 'cm-reminders-announced'

function loadSeen() {
  try { return new Set(JSON.parse(window.sessionStorage.getItem(STORE) || '[]')) } catch { return new Set() }
}
function saveSeen(seen) {
  try { window.sessionStorage.setItem(STORE, JSON.stringify([...seen].slice(-200))) } catch { /* private mode */ }
}

export function useReminderAlerts() {
  const router = useRouter()
  const { isAuthenticated, canAny } = useAuth()
  const seen = loadSeen()

  async function check() {
    if (!isAuthenticated.value || !canAny('calls.view', 'crm.view')) return
    const { reminders } = await remindersApi.mine()
    const fresh = dueToAnnounce(reminders, seen)
    if (!fresh.length) return
    for (const r of fresh) seen.add(announceKey(r))
    saveSeen(seen)
    // One toast however many fell due together; Open goes to the first.
    const first = fresh[0]
    toast({
      text: fresh.length === 1 ? 'A callback reminder is due' : `${fresh.length} callback reminders are due`,
      tone: 'info',
      persistent: true,
      action: { label: 'Open', run: () => router.push(first.target.path) },
    })
  }
  // Visible tab only; a failed check is retried on the next tick.
  const poll = useVisiblePoll(check, POLL_MS)
  watch(isAuthenticated, (on) => (on ? poll.start({ now: true }) : poll.stop()), { immediate: true })
}
