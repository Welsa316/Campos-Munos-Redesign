// Read-only RingCentral REST calls with a bearer token. GET only: nothing in
// this file can change anything in the firm's RingCentral account.
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

export async function rcGet(config, accessToken, path, query = {}, { fetchImpl = globalThis.fetch } = {}) {
  if (!path.startsWith('/restapi/')) throw new Error('RingCentral path must start with /restapi/')
  const url = new URL(`${config.serverUrl}${path}`)
  for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, String(v))
  let res
  try {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined
    res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal,
    })
  } catch {
    throw new RingCentralApiError('network_error', { retryable: true })
  }
  const text = await res.text().catch(() => '')
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (res.status >= 200 && res.status < 300) return body ?? {}

  const first = Array.isArray(body?.errors) ? body.errors[0] : null
  const code = safeCode(body?.errorCode, /^[A-Z]{2,5}-\d{1,4}$/) || safeCode(first?.errorCode, /^[A-Z]{2,5}-\d{1,4}$/)
    || safeCode(body?.error, /^[a-z_]{1,40}$/) || `http_${res.status}`
  const retryAfterSecs = Number(res.headers?.get?.('retry-after'))
  throw new RingCentralApiError(code, {
    status: res.status,
    retryable: res.status === 429 || res.status >= 500,
    retryAfterMs: Number.isFinite(retryAfterSecs) && retryAfterSecs >= 0 ? retryAfterSecs * 1000 : null,
    permission: safeCode(first?.permissionName, /^[A-Za-z]{1,60}$/),
  })
}

export default { rcGet, RingCentralApiError }
