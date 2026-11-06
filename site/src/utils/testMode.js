// Test mode: the firm's administrator sending test forms through the real
// website. The portal's Test channel hands out a link ending in
// #cm-test=<token>; the forms then pass that token to the API, which keeps
// the submission out of the office inbox and sends no email or staff
// notification (server/testChannel/). Nobody else ever sees this.
//
// A small script at the top of index.html takes the token out of the address
// before any analytics tag loads, so it is never in a bookmark, a shared
// link, a page view or a tag's history event. It is kept for this tab only
// (sessionStorage) and dropped when it expires. This module repeats the
// capture in case that script did not run; main.js imports it first, before
// the router, which would otherwise put the address back as it found it.
import { ref } from 'vue'

const KEY = 'cm-test-token'
const SHAPE = /^t1\.\d{1,10}\.\d{1,10}\.(\d{10,11})\.[A-Za-z0-9_-]{43}$/

const expiresAt = (token) => {
  const m = SHAPE.exec(token || '')
  return m ? Number(m[1]) * 1000 : 0
}
const usable = (token) => expiresAt(token) > Date.now()

function stored() {
  try {
    const token = sessionStorage.getItem(KEY)
    if (usable(token)) return token
    if (token) sessionStorage.removeItem(KEY)
  } catch { /* storage blocked: no test mode */ }
  return null
}

export const testToken = ref(null)

function captureTestToken() {
  const m = /(?:^#|&)cm-test=([^&]+)/.exec(window.location.hash)
  if (m) {
    const token = decodeURIComponent(m[1])
    try { if (usable(token)) sessionStorage.setItem(KEY, token) } catch { /* ignore */ }
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  }
  testToken.value = stored()
}

if (typeof window !== 'undefined') captureTestToken()

/** The token to send with a form, or null outside test mode (or once it expired). */
export function currentTestToken() {
  if (testToken.value && !usable(testToken.value)) endTestMode()
  return testToken.value
}

export function endTestMode() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
  testToken.value = null
}

/** The API refused the link (expired, or the account changed). */
export const isTestLinkRefusal = (status, data) => status === 400 && data?.code === 'test_link_invalid'
