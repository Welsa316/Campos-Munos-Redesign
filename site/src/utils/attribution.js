// Campaign tags on a link into the site (?utm_source=…&utm_campaign=…).
//
// An ad's link to a service page carries utm_ tags. GA4 reads them from the
// page address by itself. This module remembers them, so a form or a chat
// sent later, usually from another page, can say which campaign brought the
// person; the API stores that with the lead (server/utils/attribution.js).
//
// Kept in this browser for 30 days: someone who clicks an ad often comes back
// days later to write. A newer tagged link replaces an older one, and a visit
// without tags leaves what is stored alone. Nothing here identifies a person.

const KEY = 'cm-campaign'
export const KEEP_MS = 30 * 24 * 60 * 60 * 1000
const MAX = 150
const MAX_PATH = 300
const TAGS = {
  utm_source: 'source',
  utm_medium: 'medium',
  utm_campaign: 'campaign',
  utm_content: 'content',
  utm_term: 'term',
}
const FIELDS = [...Object.values(TAGS), 'landingPath']

const tidy = (value, max) => (typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
  : '')

/** The campaign a landing address names, or null when it carries no tags. */
export function campaignFromAddress(search, path) {
  let params
  try { params = new URLSearchParams(search || '') } catch { return null }
  const found = {}
  for (const [tag, field] of Object.entries(TAGS)) {
    const value = tidy(params.get(tag), MAX)
    if (value) found[field] = value
  }
  // A campaign link says where it was placed or which campaign it belongs to.
  // utm_content or utm_term alone names neither.
  if (!found.source && !found.campaign) return null
  const landingPath = tidy(path, MAX_PATH)
  if (landingPath.startsWith('/') && !landingPath.startsWith('//')) found.landingPath = landingPath
  return found
}

const browserStorage = () => {
  try { return window.localStorage } catch { return null }
}

// Storage blocked (private windows, strict settings): the tags still hold
// for as long as this page stays loaded.
let remembered = null

/** Remember the campaign on the address the visitor arrived at, if it has one. */
export function captureCampaign({ search, path, storage = browserStorage(), now = Date.now() } = {}) {
  const found = campaignFromAddress(search, path)
  if (!found) return null
  remembered = { ...found, at: now }
  try { storage?.setItem(KEY, JSON.stringify(remembered)) } catch { /* kept in memory only */ }
  return found
}

function stored(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || 'null')
    return saved && typeof saved === 'object' && Number.isFinite(saved.at) ? saved : null
  } catch { return null }
}

/** The campaign to send with a form, or null when there is none (or it is over 30 days old). */
export function currentCampaign({ storage = browserStorage(), now = Date.now() } = {}) {
  const saved = stored(storage)
  // Another tab may have landed on a newer link since this one loaded.
  const latest = saved && (!remembered || saved.at > remembered.at) ? saved : remembered
  if (!latest) return null
  // Too old, or stamped far in the future by a clock that has since been set right.
  if (Math.abs(now - latest.at) >= KEEP_MS) {
    if (latest === remembered) remembered = null
    try { storage?.removeItem(KEY) } catch { /* ignore */ }
    return null
  }
  const campaign = {}
  for (const field of FIELDS) {
    const value = tidy(latest[field], field === 'landingPath' ? MAX_PATH : MAX)
    if (value) campaign[field] = value
  }
  return campaign.source || campaign.campaign ? campaign : null
}

if (typeof window !== 'undefined') {
  captureCampaign({ search: window.location.search, path: window.location.pathname })
}
