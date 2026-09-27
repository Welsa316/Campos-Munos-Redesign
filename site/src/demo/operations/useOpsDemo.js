// State and actions for the operations demo.
//
// ISOLATION: this module never imports useApi, never calls fetch, and never
// touches the production inbox. Every "sent" message and "placed" call is a
// timeline entry in browser memory, mirrored to localStorage so a page reload
// mid-presentation keeps its place. Reset restores the seeded fixtures.

import { reactive, computed, watch } from 'vue'
import { buildLeads, demoDay, demoNow } from './data/leads.js'
import { CHANNELS } from './data/model.js'

const STORAGE_KEY = 'cm-ops-demo:v1'
const MIN = 60000

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

// Seeded times are relative to "today", so state saved on another day would
// read wrong ("3 minutes ago" from last Tuesday). Reseed when the day changes.
function load() {
  const today = demoDay()
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved && saved.day === dayKey(today) && Array.isArray(saved.leads)) return saved.leads
  } catch { /* storage blocked or corrupt — fall through to fresh fixtures */ }
  return buildLeads(today)
}

function save(leads) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ day: dayKey(demoDay()), leads }))
  } catch { /* private mode: the demo still works, it just won't survive a reload */ }
}

// Module-level so the dashboard and lead views share one source of truth.
const state = reactive({
  leads: load(),
  view: 'dashboard',
  selectedId: null,
  // Set by dashboard shortcuts ("4 missed calls unresolved") to pre-filter the list.
  listPreset: null,
  toast: null,
})

watch(() => state.leads, save, { deep: true })

let seq = 0
const newId = () => `live-${Date.now().toString(36)}-${++seq}`

function leadById(id) {
  return state.leads.find(l => l.id === id)
}

// Actions are stamped a few minutes after the lead's latest event, so a story
// performed live reads like a realistic morning rather than all at 10:37.
function lastAt(lead) {
  const past = lead.events.filter(e => e.kind !== 'upcoming').map(e => new Date(e.at).getTime())
  return Math.max(new Date(lead.receivedAt).getTime(), ...past)
}

function push(lead, atMs, kind, title, extra = {}) {
  const event = { id: newId(), at: new Date(atMs).toISOString(), kind, title, ...extra }
  lead.events.push(event)
  return event
}

let toastTimer = null
function toast(title, body) {
  state.toast = { id: newId(), title, body }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { state.toast = null }, 4200)
}

export function displayName(lead) {
  return lead.name || lead.phone
}

export function formatConsultation(iso) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date} — ${time}`
}

/** Minutes from a missed call to the callback that reached them, if any. */
export function callbackMinutes(lead) {
  const cb = lead.events.find(e => e.marker === 'callback')
  if (!cb) return null
  return Math.round((new Date(cb.at) - new Date(lead.receivedAt)) / MIN)
}

const ACK_SMS_ES = 'Lamentamos no haber contestado su llamada. Un miembro de nuestro equipo se comunicará con usted en breve.'
const ACK_SMS_EN = 'Sorry we missed your call. A member of our team will contact you shortly.'

export const actions = {
  open(id) {
    state.view = 'leads'
    state.selectedId = id
    const lead = leadById(id)
    if (lead) lead.unread = false
  },

  close() {
    state.selectedId = null
  },

  setView(view, preset = null) {
    state.view = view
    state.listPreset = preset
  },

  simulateRecovery(id) {
    const lead = leadById(id)
    if (!lead || lead.inRecovery || lead.status !== 'missed_call') return
    const t = lastAt(lead) + MIN
    push(lead, t, 'auto', 'Automatic acknowledgement sent', {
      channel: 'SMS', quote: ACK_SMS_ES, quoteNote: ACK_SMS_EN,
    })
    push(lead, t, 'auto', 'Reception team notified', { detail: 'Desktop and phone alert to the front desk' })
    push(lead, t, 'auto', 'Added to the recovery queue', { detail: 'Callback due within 10 minutes' })
    lead.inRecovery = true
    toast('Recovery started', `${displayName(lead)} was acknowledged and the front desk was alerted.`)
  },

  markContacted(id) {
    const lead = leadById(id)
    if (!lead || !['missed_call', 'new', 'no_response'].includes(lead.status)) return
    let t = lastAt(lead)
    if (lead.status === 'missed_call') {
      t += 7 * MIN
      push(lead, t, 'staff', 'Outbound callback placed', { marker: 'callback', detail: 'From the recovery queue' })
      push(lead, t, 'client', 'Client answered')
      t += 5 * MIN
    } else {
      t += 6 * MIN
      push(lead, t, 'staff', lead.status === 'no_response' ? 'Second follow-up call — client answered' : 'Reception called — spoke with the client')
    }
    push(lead, t, 'staff', 'Status changed to Contacted')
    lead.status = 'contacted'
    lead.inRecovery = false
    toast('Marked contacted', `${displayName(lead)} is now Contacted.`)
  },

  markNoResponse(id) {
    const lead = leadById(id)
    if (!lead || lead.status !== 'contacted') return
    const t = lastAt(lead) + 30 * MIN
    push(lead, t, 'staff', 'Called — no answer, voicemail left')
    push(lead, t, 'staff', 'Status changed to No Response')
    push(lead, t, 'auto', 'Second follow-up scheduled', { detail: 'Reminder for reception tomorrow at 9:00 AM' })
    lead.status = 'no_response'
    toast('Marked no response', 'A second follow-up was put on tomorrow’s list.')
  },

  scheduleConsultation(id, { at, mode }) {
    const lead = leadById(id)
    if (!lead) return
    const t = lastAt(lead) + 2 * MIN
    lead.events = lead.events.filter(e => e.kind !== 'upcoming')
    const rescheduling = lead.status === 'scheduled'
    push(lead, t, 'staff', rescheduling ? 'Consultation rescheduled' : 'Consultation scheduled', {
      detail: `${mode} · ${formatConsultation(at)}`,
    })
    push(lead, t, 'auto', 'Confirmation sent', {
      channel: lead.method === 'whatsapp' ? 'WhatsApp' : 'SMS',
      quote: `Su consulta con Campos Muños Law está confirmada para el ${new Date(at).toLocaleDateString('es-US', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${new Date(at).toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit' })}.`,
      quoteNote: `Your consultation with Campos Muños Law is confirmed for ${formatConsultation(at).replace(' — ', ' at ')}.`,
    })
    push(lead, t, 'auto', 'Reminder queued', { detail: 'Sent the day before at 9:00 AM' })
    push(lead, new Date(at).getTime(), 'upcoming', 'Consultation', { detail: mode })
    if (!rescheduling) push(lead, t, 'staff', 'Status changed to Scheduled')
    lead.status = 'scheduled'
    lead.consultationAt = at
    lead.consultationMode = mode
    lead.inRecovery = false
    toast(rescheduling ? 'Consultation rescheduled' : 'Consultation scheduled', formatConsultation(at))
  },

  markRetained(id) {
    const lead = leadById(id)
    if (!lead || lead.status !== 'scheduled') return
    let t = lastAt(lead)
    const upcoming = lead.events.find(e => e.kind === 'upcoming')
    if (upcoming) {
      // The consultation happened: the placeholder becomes a record of it.
      upcoming.kind = 'staff'
      upcoming.title = 'Consultation held'
      t = Math.max(t, new Date(upcoming.at).getTime())
    }
    t += 45 * MIN
    push(lead, t, 'staff', 'Engagement signed — status Retained')
    const a = lead.attribution
    const chain = [CHANNELS[a.channel]?.label, a.campaign, lead.practice, 'Retained client'].filter(Boolean).join(' → ')
    push(lead, t, 'auto', 'Attribution closed', { detail: chain, tone: 'win' })
    lead.status = 'retained'
    toast('Client retained', `${chain}`)
  },

  closeLead(id) {
    const lead = leadById(id)
    if (!lead || ['retained', 'closed'].includes(lead.status)) return
    const t = lastAt(lead) + 5 * MIN
    lead.events = lead.events.filter(e => e.kind !== 'upcoming')
    push(lead, t, 'staff', 'Status changed to Closed')
    lead.status = 'closed'
    lead.inRecovery = false
    toast('Lead closed', displayName(lead))
  },

  reset() {
    state.leads = buildLeads(demoDay())
    state.selectedId = null
    state.listPreset = null
    state.view = 'dashboard'
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    toast('Demo reset', 'Every lead is back to its starting state.')
  },

  dismissToast() {
    state.toast = null
  },
}

// --- Derived views ------------------------------------------------------------

const now = () => demoNow()

const sameDay = (iso, ref) => new Date(iso).toDateString() === ref.toDateString()

export const selectedLead = computed(() => state.leads.find(l => l.id === state.selectedId) || null)

export const attention = computed(() => {
  const ref = now()
  const leads = state.leads
  return {
    missedUnresolved: leads.filter(l => l.status === 'missed_call'),
    awaitingFollowUp: leads.filter(l => l.status === 'no_response'),
    consultsToday: leads.filter(l => l.status === 'scheduled' && l.consultationAt && sameDay(l.consultationAt, ref)),
    staleNew: leads.filter(l => l.status === 'new' && ref - new Date(l.receivedAt) > 60 * MIN),
  }
})

// Today's missed calls, newest first, with where each one stands now.
export const missedCallLog = computed(() => {
  const ref = now()
  return state.leads
    .filter(l => l.method === 'missed_call' && sameDay(l.receivedAt, ref))
    .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
    .map(l => {
      const mins = callbackMinutes(l)
      let outcome
      let tone
      if (l.status === 'missed_call') {
        outcome = l.inRecovery ? 'In recovery queue' : 'Callback pending'
        tone = l.inRecovery ? 'navy' : 'orange'
      } else if (l.status === 'scheduled' || l.status === 'retained') {
        outcome = mins != null ? `Recovered in ${mins}m · ${l.status === 'retained' ? 'Retained' : 'Scheduled'}` : 'Scheduled'
        tone = 'green'
      } else if (l.status === 'closed') {
        outcome = 'Closed'
        tone = 'gray'
      } else {
        outcome = mins != null ? `Recovered in ${mins}m` : 'Contacted'
        tone = 'green'
      }
      return { lead: l, outcome, tone }
    })
})

export function useOpsDemo() {
  return { state, actions, selectedLead, attention, missedCallLog }
}

export function relativeTime(iso) {
  const diff = now() - new Date(iso)
  const mins = Math.round(diff / MIN)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  const d = new Date(iso)
  if (sameDay(iso, now())) return hours === 1 ? '1h ago' : `${hours}h ago`
  const y = new Date(now()); y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  const days = Math.round((demoDay(now()) - demoDay(d)) / (24 * 60 * MIN))
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function clockTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
