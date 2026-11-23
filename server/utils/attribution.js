// Which campaign brought a lead: the utm_ tags on the link they arrived by,
// remembered by the website (site/src/utils/attribution.js) and sent with
// the form or chat.
//
// The text is written by whoever built the link, and anyone can type an
// address, so it is treated as untrusted: tags and control characters
// removed, cut to size. It is never a reason to refuse a form. A lead matters
// more than its label, so whatever cannot be used is dropped and the form
// goes through as if it had no tags.
import { stripHtml } from './sanitize.js'

const MAX = 150
const MAX_PATH = 300

const NONE = Object.freeze({ source: null, medium: null, campaign: null, content: null, term: null, landingPath: null })

function text(value, max) {
  if (typeof value !== 'string') return null
  const clean = stripHtml(value.replace(/[\u0000-\u001f\u007f]/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, max).trim()
  return clean || null
}

// The page they landed on: a path on this site, never an address elsewhere.
function path(value) {
  const clean = text(value, MAX_PATH)
  if (!clean || !clean.startsWith('/') || clean.startsWith('//') || /[\s\\]/.test(clean)) return null
  return clean.split(/[?#]/)[0] || null
}

/** The form's `attribution`, cleaned the way it is stored. Every field is a string or null. */
export function cleanAttribution(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...NONE }
  const out = {
    source: text(raw.source, MAX),
    medium: text(raw.medium, MAX),
    campaign: text(raw.campaign, MAX),
    content: text(raw.content, MAX),
    term: text(raw.term, MAX),
    landingPath: path(raw.landingPath),
  }
  // Without a source or a campaign there is nothing to attribute the lead to.
  return out.source || out.campaign ? out : { ...NONE }
}

/** "youtube / paid_video · daca-nov · sitelink-daca", for the office email and the export. */
export function attributionLine(a) {
  if (!a || (!a.source && !a.campaign)) return ''
  const origin = [a.source, a.medium].filter(Boolean).join(' / ')
  return [origin, a.campaign, a.content, a.term].filter(Boolean).join(' · ')
}
