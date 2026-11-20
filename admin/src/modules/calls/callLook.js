// How a call looks in the list: its icon, badge and label, by the server's
// classification (incoming) or RingCentral's result (outgoing). The label is
// in the language asked for (English by default).
import { formatPhone } from '../../utils/phone.js'
import { classLabel } from './callEvidenceText.js'
import { tc } from '../../i18n/calls.js'

const LOOK = {
  answered: { icon: 'phone', badge: 'bg-green-100 text-green-700' },
  not_answered: { icon: 'phone-slash', badge: 'bg-red-100 text-brand-red' },
  caller_hung_up: { icon: 'phone-slash', badge: 'bg-orange-100 text-orange-800' },
  ended_before_ringing: { icon: 'phone-slash', badge: 'bg-orange-100 text-orange-800' },
  voicemail: { icon: 'voicemail', badge: 'bg-amber-100 text-amber-700' },
  system: { icon: 'ban', badge: 'bg-gray-100 text-gray-600' },
  unknown: { icon: 'circle-question', badge: 'bg-gray-100 text-gray-600' },
  connected: { icon: 'arrow-turn-up', badge: 'bg-brand-navy/10 text-brand-navy' },
  no_answer: { icon: 'arrow-turn-up', badge: 'bg-gray-100 text-gray-500' },
  other: { icon: 'phone', badge: 'bg-gray-100 text-gray-500' },
}
const has = (k) => Object.hasOwn(LOOK, k)

export function look(c, lang = 'en') {
  const key = c.direction === 'inbound' ? (has(c.classification) ? c.classification : 'unknown') : (has(c.outcome) ? c.outcome : 'other')
  return { ...LOOK[key], label: classLabel(key, lang) || tc(lang, `look.${key}`) }
}

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
