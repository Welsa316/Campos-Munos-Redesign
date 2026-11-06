// The firm's images, under the router base: '/' on admin.camulaw.com and
// '/admin/' in the single-service deployment, where a bare '/logo.png'
// would ask the public site for it.
const BASE = import.meta.env.BASE_URL

export const LOGO_SRC = `${BASE}logo.png`
export const NOTIFY_ICON = `${BASE}favicon-512.png`
