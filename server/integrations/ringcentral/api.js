// RingCentral REST calls with a bearer token. GET reads; rcSend is used only
// to place, and cancel, a RingOut call a staff member asked for, and to
// create, renew or delete the one event subscription an administrator
// registered (telephonyEvents.js). Nothing here changes numbers, routing,
// queues, extensions, greetings or settings.
//
// Errors (RingCentral API reference, "Errors" and "Rate limits"): a JSON body
// with errorCode (e.g. CMN-408 missing permission, CMN-301 rate limited,
// OAU-xxx token problems) and an errors[] array; 429 carries Retry-After in
// seconds. Only codes and statuses are kept: messages can echo request values.
const TIMEOUT_MS = 20_000

export class RingCentralApiError extends Error {
  constructor(code, { status = null, retryable = false, retryAfterMs = null, permission = null } = {}) {
    super(`RingCentral API error (${status ?? 'network'} ${code})`)
    this.name = 'RingCentralApiError'
    this.code = code
    this.status = status
    this.retryable = retryable
    this.retryAfterMs = retryAfterMs
    // The permission RingCentral says is missing, when it names one.
    this.permission = permission
  }
}

const safeCode = (v, re) => (typeof v === 'string' && re.test(v) ? v : null)

export async function rcGet(config, accessToken, path, query = {}, deps = {}) {
  return rcRequest(config, accessToken, 'GET', path, { query }, deps)
}

/** POST / DELETE (RingOut, and the event subscription). */
export async function rcSend(config, accessToken, method, path, body, deps = {}) {
  if (!['POST', 'DELETE'].includes(method)) throw new Error('rcSend is for POST and DELETE')
  return rcRequest(config, accessToken, method, path, { body }, deps)
}

async function rcRequest(config, accessToken, method, path, { query = {}, body } = {}, { fetchImpl = globalThis.fetch } = {}) {
  if (!path.startsWith('/restapi/')) throw new Error('RingCentral path must start with /restapi/')
  const url = new URL(`${config.serverUrl}${path}`)
  for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, String(v))
  let res
  try {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined
    res = await fetchImpl(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`, Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal,
    })
  } catch {
    throw new RingCentralApiError('network_error', { retryable: true })
  }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  if (res.status >= 200 && res.status < 300) return json ?? {}

  const first = Array.isArray(json?.errors) ? json.errors[0] : null
  const code = safeCode(json?.errorCode, /^[A-Z]{2,5}-\d{1,4}$/) || safeCode(first?.errorCode, /^[A-Z]{2,5}-\d{1,4}$/)
    || safeCode(json?.error, /^[a-z_]{1,40}$/) || `http_${res.status}`
  const retryAfterSecs = Number(res.headers?.get?.('retry-after'))
  throw new RingCentralApiError(code, {
    status: res.status,
    retryable: res.status === 429 || res.status >= 500,
    retryAfterMs: Number.isFinite(retryAfterSecs) && retryAfterSecs >= 0 ? retryAfterSecs * 1000 : null,
    permission: safeCode(first?.permissionName, /^[A-Za-z]{1,60}$/),
  })
}

export default { rcGet, rcSend, RingCentralApiError }
