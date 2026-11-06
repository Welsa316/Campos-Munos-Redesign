// How a call looks in the list: its icon, badge and label, by the server's
// classification (incoming) or RingCentral's result (outgoing).
import { formatPhone } from '../../utils/phone.js'
import { CLASS_LABEL } from './callEvidenceText.js'

const LOOK = {
  answered: { icon: 'phone', label: CLASS_LABEL.answered, badge: 'bg-green-100 text-green-700' },
  not_answered: { icon: 'phone-slash', label: CLASS_LABEL.not_answered, badge: 'bg-red-100 text-brand-red' },
  caller_hung_up: { icon: 'phone-slash', label: CLASS_LABEL.caller_hung_up, badge: 'bg-orange-100 text-orange-800' },
  ended_before_ringing: { icon: 'phone-slash', label: CLASS_LABEL.ended_before_ringing, badge: 'bg-orange-100 text-orange-800' },
  voicemail: { icon: 'voicemail', label: CLASS_LABEL.voicemail, badge: 'bg-amber-100 text-amber-700' },
  system: { icon: 'ban', label: CLASS_LABEL.system, badge: 'bg-gray-100 text-gray-600' },
  unknown: { icon: 'circle-question', label: CLASS_LABEL.unknown, badge: 'bg-gray-100 text-gray-600' },
  connected: { icon: 'arrow-turn-up', label: 'Outgoing', badge: 'bg-brand-navy/10 text-brand-navy' },
  no_answer: { icon: 'arrow-turn-up', label: 'Outgoing, no answer', badge: 'bg-gray-100 text-gray-500' },
  other: { icon: 'phone', label: 'Other', badge: 'bg-gray-100 text-gray-500' },
}
export const look = (c) => (c.direction === 'inbound' ? LOOK[c.classification] || LOOK.unknown : LOOK[c.outcome] || LOOK.other)

// "+15045550101" → "(504) 555-0101"; other countries keep their + form.
export function phone(n) {
  const s = String(n || '')
  return /^\+1\d{10}$/.test(s) ? formatPhone(s.slice(2)) : formatPhone(s)
}

export function durationText(s) {
  if (!s) return '—'
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, '0')}s`
}
