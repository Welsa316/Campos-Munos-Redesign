// Shape of the demo's records, and the vocabularies they draw from.
//
// Everything here is presentation-only fixture data for the operations demo.
// Nothing in this folder talks to the API — see useOpsDemo.js.

import {
  faPhone, faPhoneSlash, faFileLines, faBolt, faUserTie, faUser, faCalendarCheck,
  faLocationDot, faMagnifyingGlass, faArrowPointer,
} from '@fortawesome/free-solid-svg-icons'
import { faWhatsapp, faGoogle } from '@fortawesome/free-brands-svg-icons'
import { LEAD_STATUSES } from '../../../data/leadStatuses.js'

/**
 * @typedef {'missed_call'|'new'|'contacted'|'no_response'|'scheduled'|'retained'|'closed'} DemoStatus
 * @typedef {'missed_call'|'phone_call'|'website_form'|'whatsapp'} LeadMethod
 * @typedef {'google_ads'|'lsa'|'organic'|'direct'|'whatsapp'} Channel
 * @typedef {'client'|'auto'|'staff'|'upcoming'} EventKind
 *
 * @typedef {Object} TimelineEvent
 * @property {string} id
 * @property {string} at            ISO timestamp
 * @property {EventKind} kind       who caused it
 * @property {string} title
 * @property {string} [detail]
 * @property {string} [quote]       message text shown verbatim
 * @property {string} [quoteNote]   e.g. translation of the quote
 * @property {string} [channel]     'SMS', 'Email'… for automatic sends
 *
 * @typedef {Object} Attribution
 * @property {Channel} channel
 * @property {string} [campaign]
 * @property {string} [adGroup]
 * @property {string} [keyword]
 * @property {string} [landingPage]
 *
 * @typedef {Object} DemoLead
 * @property {string} id
 * @property {string} name
 * @property {string} phone
 * @property {string} [email]
 * @property {LeadMethod} method
 * @property {string} practice
 * @property {string} [country]
 * @property {string} language
 * @property {DemoStatus} status
 * @property {string} receivedAt
 * @property {boolean} unread
 * @property {string} [message]
 * @property {Attribution} attribution
 * @property {boolean} [inRecovery]    missed call acknowledged + queued for callback
 * @property {string} [consultationAt]
 * @property {string} [consultationMode]
 * @property {TimelineEvent[]} events
 */

// The production pipeline plus one demo-only stage in front of it. The real
// statuses are imported rather than copied so the pills can never drift.
const MISSED_CALL = {
  key: 'missed_call', label: 'Missed Call', hint: 'Called in and nobody picked up',
  pill: 'bg-orange-100 text-orange-800 ring-orange-200', dot: 'bg-orange-500',
}

export const DEMO_STATUSES = [LEAD_STATUSES[0], MISSED_CALL, ...LEAD_STATUSES.slice(1)]
const STATUS_BY_KEY = Object.fromEntries(DEMO_STATUSES.map(s => [s.key, s]))
export const demoStatusMeta = (key) => STATUS_BY_KEY[key] || STATUS_BY_KEY.new

export const LEAD_METHODS = {
  missed_call:  { label: 'Missed Call',  icon: faPhoneSlash, tone: 'text-orange-700 bg-orange-50 ring-orange-200' },
  phone_call:   { label: 'Phone Call',   icon: faPhone,      tone: 'text-brand-navy bg-brand-navy/[0.06] ring-brand-navy/15' },
  website_form: { label: 'Website Form', icon: faFileLines,  tone: 'text-brand-navy bg-brand-navy/[0.06] ring-brand-navy/15' },
  whatsapp:     { label: 'WhatsApp',     icon: faWhatsapp,   tone: 'text-green-800 bg-green-50 ring-green-200' },
}

export const CHANNELS = {
  google_ads: { label: 'Google Ads',          short: 'Google Ads', icon: faGoogle },
  lsa:        { label: 'Local Services Ads',  short: 'LSA',        icon: faLocationDot },
  organic:    { label: 'Organic Search',      short: 'Organic',    icon: faMagnifyingGlass },
  direct:     { label: 'Direct',              short: 'Direct',     icon: faArrowPointer },
  whatsapp:   { label: 'WhatsApp',            short: 'WhatsApp',   icon: faWhatsapp },
}

export const EVENT_KINDS = {
  client:   { label: 'Client',    icon: faUser,          node: 'bg-white text-gray-500 ring-1 ring-gray-200',         tag: 'text-gray-500' },
  auto:     { label: 'Automatic', icon: faBolt,          node: 'bg-brand-navy text-white ring-1 ring-brand-navy',     tag: 'text-brand-navy' },
  staff:    { label: 'Staff',     icon: faUserTie,       node: 'bg-green-100 text-green-800 ring-1 ring-green-200',  tag: 'text-green-800' },
  upcoming: { label: 'Upcoming',  icon: faCalendarCheck, node: 'bg-white text-brand-navy border border-dashed border-brand-navy/50', tag: 'text-brand-navy' },
}
