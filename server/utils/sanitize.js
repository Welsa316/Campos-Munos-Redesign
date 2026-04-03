export function stripHtml(str) {
  if (typeof str !== 'string') return ''
  return str.replace(/<[^>]*>?/g, '').trim()
}

export function escapeHtml(str) {
  if (typeof str !== 'string') return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function escapeCsvField(str) {
  if (typeof str !== 'string') return ''
  const escaped = str.replace(/"/g, '""').replace(/\n/g, ' ')
  if (/^[=+\-@\t\r]/.test(escaped)) {
    return `"'${escaped}"`
  }
  return `"${escaped}"`
}
