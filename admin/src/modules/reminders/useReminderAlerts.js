// While someone is using the portal, a callback reminder of theirs falling
// due shows a toast with Open (App.vue). It asks /api/reminders/mine once a
// minute while the tab is visible; the email and the desktop notification
// come from the server whether or not the portal is open. Each reminder is
// announced once per tab (sessionStorage), and again only if it was
// snoozed and fell due again.
import { watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import { toast } from '../../composables/useToast.js'
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
  let timer = null
  let checking = false
  const seen = loadSeen()

  async function check() {
    if (checking || document.visibilityState !== 'visible' || !isAuthenticated.value) return
    if (!canAny('calls.view', 'crm.view')) return
    checking = true
    try {
      const { reminders } = await remindersApi.mine()
      const fresh = dueToAnnounce(reminders, seen)
      for (const r of fresh) seen.add(announceKey(r))
      if (fresh.length) saveSeen(seen)
      // One toast however many fell due together; Open goes to the first.
      if (fresh.length) {
        const first = fresh[0]
        toast({
          text: fresh.length === 1 ? 'A callback reminder is due' : `${fresh.length} callback reminders are due`,
          tone: 'info',
          persistent: true,
          action: { label: 'Open', run: () => router.push(first.target.path) },
        })
      }
    } catch { /* the next check tries again */ } finally {
      checking = false
    }
  }
  const onVisible = () => { if (document.visibilityState === 'visible') check() }
  function start() {
    stop()
    check()
    timer = setInterval(check, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
  }
  function stop() {
    clearInterval(timer)
    timer = null
    document.removeEventListener('visibilitychange', onVisible)
  }
  watch(isAuthenticated, (on) => (on ? start() : stop()), { immediate: true })
  onBeforeUnmount(stop)
}
