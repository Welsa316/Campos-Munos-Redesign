// The login screen returns staff to the page they were sent away from. The
// target comes from the query string, so only an in-app path is honoured:
// '//evil.example' and 'https://…' would otherwise be an open redirect.
export function safeNextPath(value) {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  if (value === '/login' || value.startsWith('/login?')) return null
  return value
}
