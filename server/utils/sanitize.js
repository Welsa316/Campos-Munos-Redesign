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
  // Check formula prefix on the ORIGINAL string before quote escaping, so that
  // inputs like `=cmd(...)` or unusual leading whitespace are reliably neutralised.
  const needsFormulaPrefix = /^[=+\-@\t\r]/.test(str)
  const escaped = str.replace(/"/g, '""').replace(/[\r\n]/g, ' ')
  return needsFormulaPrefix ? `"'${escaped}"` : `"${escaped}"`
}
