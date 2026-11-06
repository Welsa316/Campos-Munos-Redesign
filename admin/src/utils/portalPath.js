// Whether a path handed to the portal from outside the page (a clicked push
// notification, the desktop app's notification) is one of the portal's own
// screens, so the router may open it in place. Only a same-origin absolute
// path: never another site ("//host", "https:"), never a backslash (which
// browsers treat as "/", so "/\host" is another site too), never absurdly long.
export const MAX_PORTAL_PATH = 500

export const isPortalPath = (p) =>
  typeof p === 'string' && p.length <= MAX_PORTAL_PATH && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\')
