// Whether the portal is running inside the Campos Muños desktop app (its
// preload sets window.campos.desktop). The app shows notifications itself,
// from GET /api/notifications/feed, so the page must not show its own too.
export const inDesktopApp = (w = typeof window !== 'undefined' ? window : undefined) => w?.campos?.desktop === true
