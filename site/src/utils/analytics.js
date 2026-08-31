// Google Analytics 4 helpers.
//
// The gtag snippet lives in index.html with send_page_view disabled: this is a
// single-page app, so gtag would otherwise only ever record the first page a
// visitor landed on. We send a page_view on every route change instead.
//
// Every call goes through the guard below, so analytics being blocked (ad
// blocker, consent tooling, tests, SSR/prerender) can never throw into the app.

const ADMIN_PREFIX = '/admin'
// How long to hold a same-tab navigation while the analytics hit goes out.
const NAV_TIMEOUT_MS = 500
const WHATSAPP_HREF = /(?:^|\/\/|\.)(?:wa\.me|api\.whatsapp\.com|whatsapp\.com)/i

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
    if (event.defaultPrevented) return
    // Primary button only; auxiliary clicks open a new tab and keep this page alive.
    if (typeof event.button === 'number' && event.button !== 0) return

    const link = event.target?.closest?.('a[href]')
    if (!link) return
    const href = link.getAttribute('href') || ''

    const method = href.startsWith('tel:') || href.startsWith('sms:')
      ? 'phone'
      : WHATSAPP_HREF.test(href) ? 'whatsapp' : null
    if (!method) return

    // A click that opens a NEW tab leaves this page loaded, so the hit has all
    // the time it needs. Crucially we must NOT preventDefault here: re-opening
    // the tab later from gtag's async callback loses the user-gesture context
    // and gets caught by popup blockers, which would break the link outright.
    const opensNewTab = link.target === '_blank'
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    if (opensNewTab) {
      trackLead(method, { link_url: href })
      return
    }

    // Same-tab navigation: the page can unload before the beacon leaves, which
    // is what was undercounting WhatsApp. Hold the navigation until GA4
    // acknowledges the hit, then continue.
    if (typeof window.gtag !== 'function') return // analytics blocked — let the link behave normally

    event.preventDefault()
    let navigated = false
    const proceed = () => {
      if (navigated) return
      navigated = true
      window.location.href = href
    }

    trackLead(method, {
      link_url: href,
      event_callback: proceed,
      event_timeout: NAV_TIMEOUT_MS,
    })
    // Failsafe: event_callback never fires if the request is blocked outright,
    // so the visitor is never left stuck on the page.
    setTimeout(proceed, NAV_TIMEOUT_MS)
  }, { capture: true })
}
