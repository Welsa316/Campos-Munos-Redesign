// One line per event in a contact's history (GET /api/contacts/history).
// Pure, so the wording is tested apart from the page.
import { CLASS_LABEL } from '../calls/callEvidenceText.js'

const by = (name) => (name ? ` by ${name}` : '')

/** label: turns a consultation-type key into its name (consultationLabel). */
export function historyLine(e, label = (k) => k) {
  switch (e.type) {
    case 'call':
      if (e.direction === 'outbound') {
        return e.outcome === 'connected' ? 'Outgoing call, connected' : e.outcome === 'no_answer' ? 'Outgoing call, no answer' : 'Outgoing call'
      }
      if (e.classification === 'answered') return `Incoming call, answered${by(e.employee)}`
      return `Incoming call, ${(CLASS_LABEL[e.classification] || 'not confirmed').toLowerCase()}`
    case 'submission': {
      const what = e.channel === 'chat' ? 'Website chat started' : 'Website enquiry'
      return e.consultationType ? `${what} · ${label(e.consultationType)}` : what
    }
    case 'reply': return `Email reply sent${by(e.employee)}`
    case 'lead_note': return `Note on the website lead${by(e.employee)}`
    case 'call_note': return `Call note${by(e.employee)}`
    default: return 'Activity'
  }
}

/** The name on a website lead that is only a possible match. */
export const possibleMatch = (e) => e.type === 'submission' && e.match === 'possible'

export const HISTORY_ICON = { call: 'phone', submission: 'inbox', reply: 'envelope', lead_note: 'note-sticky', call_note: 'note-sticky' }
