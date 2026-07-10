// US phone formatting for the contact + chat forms and the admin display.
// The firm's clients are US-based, so we format toward (XXX) XXX-XXXX. Anyone
// entering an international number (a leading "+") is left untouched.

// Live input mask — reformats as the user types toward (XXX) XXX-XXXX.
export function maskPhone(raw) {
  if (!raw) return ''
  // Preserve international entry: once a "+" is present, don't force a US shape.
  if (raw.trim().startsWith('+')) return raw.replace(/[^\d+\-() ]/g, '')
  let d = raw.replace(/\D/g, '')
  // Strip a US country-code 1 so an 11-digit paste still yields a clean mask.
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  d = d.slice(0, 10)
  if (d.length === 0) return ''
  if (d.length < 4) return `(${d}`
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

// Display formatter for stored values (older rows may be bare digits).
export function formatPhone(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  if (s.startsWith('+')) return s
  let d = s.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (d.length !== 10) return s // leave anything non-standard exactly as stored
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

// Digits (with an optional leading +) for a tel: link.
export function telHref(raw) {
  return 'tel:' + String(raw || '').replace(/[^\d+]/g, '')
}
