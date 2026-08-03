// Google Analytics 4 helpers.
//
// The gtag snippet lives in index.html with send_page_view disabled: this is a
// single-page app, so gtag would otherwise only ever record the first page a
// visitor landed on. We send a page_view on every route change instead.
//
// Every call goes through the guard below, so analytics being blocked (ad
// blocker, consent tooling, tests, SSR/prerender) can never throw into the app.

const ADMIN_PREFIX = '/admin'

function gtag(...args) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  try {
    window.gtag(...args)
  } catch { /* analytics must never break the page */ }
}

/** Send a custom GA4 event. */
export function trackEvent(name, params = {}) {
  gtag('event', name, params)
}

/**
 * A prospect made contact. `method` distinguishes the channel (form, phone,
 * whatsapp, chat) so the firm can see which one actually produces clients.
 * Mark generate_lead as a Key event in GA4 → Admin → Events.
 */
export function trackLead(method, params = {}) {
  trackEvent('generate_lead', { method, ...params })
}

export function initAnalytics(router) {
  if (typeof window === 'undefined') return

  // --- Pageviews on client-side navigation ---
  router.afterEach((to) => {
    // The staff's own dashboard use shouldn't pollute the firm's traffic data.
    if (to.path.startsWith(ADMIN_PREFIX)) return
    // Defer a tick so views that set their own title (service + team pages do it
    // on mount) are reflected in page_title.
    setTimeout(() => {
      gtag('event', 'page_view', {
        page_path: to.fullPath,
        page_title: document.title,
        page_location: window.location.href,
      })
    }, 0)
  })

  // --- Phone + WhatsApp taps ---
  // Delegated on the document rather than annotating each link: tel: and wa.me
  // links appear in a dozen components (header, footer, popup, mobile widget,
  // every service page), and any added later are covered automatically.
  document.addEventListener('click', (event) => {
    const link = event.target?.closest?.('a[href]')
    if (!link) return
    const href = link.getAttribute('href') || ''

    if (href.startsWith('tel:')) {
      trackLead('phone', { link_url: href })
    } else if (/(?:^|\/\/|\.)(?:wa\.me|api\.whatsapp\.com|whatsapp\.com)/i.test(href)) {
      trackLead('whatsapp', { link_url: href })
    }
  }, { capture: true })
}
