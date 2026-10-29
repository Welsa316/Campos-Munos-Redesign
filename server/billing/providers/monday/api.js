// monday.com GraphQL provider. Implements the provider interface documented in
// billing/model.js. Every network call goes through the injected fetchImpl, so
// tests never reach the real API.
//
// References (checked 2026-10-29):
//   Endpoint, auth, versioning
//     https://developer.monday.com/api-reference/docs/api-versioning
//     "Current" (stable, the default when no header is sent) is 2026-07,
//     "Maintenance" is 2026-04, 2026-10 is a release candidate (not for
//     production). The version is sent in the API-Version header. We pin the
//     Current version so a monday release never changes behaviour underneath
//     us; MONDAY_API_VERSION overrides it.
//   Errors
//     https://developer.monday.com/api-reference/docs/errors
//     Application errors come back as HTTP 200 with an errors[] array whose
//     entries carry extensions.code and extensions.status_code. Transport
//     errors use real HTTP codes: 401 Unauthorized / "Your ip is restricted",
//     403 UserUnauthorizedException / USER_ACCESS_DENIED, 429 for
//     maxConcurrencyExceeded, "Rate Limit Exceeded",
//     COMPLEXITY_BUDGET_EXHAUSTED and IP_RATE_LIMIT_EXCEEDED, 500 for
//     server-side failures. A Retry-After header may be present.
//   Rate limits
//     https://developer.monday.com/api-reference/docs/rate-limits
//     "Every rate limit error returns a retry_in_seconds field" (the page does
//     not say where, so we look in extensions and at the top level).
//     DAILY_LIMIT_EXCEEDED resets at midnight UTC, so it is NOT retried.
//     REQUEST_MAX_COMPLEXITY_EXCEEDED (older versions: maxComplexityExceeded)
//     means a single query is too expensive; retrying the same query cannot
//     help, so it is NOT retried either.
//     Older API versions answered complexity exhaustion with a top-level
//     { error_code: 'ComplexityException', status_code: 429, error_message:
//     '... reset in N seconds' }; that legacy shape is still understood.
//   Pagination: items_page(limit <= 500, cursor) on boards, then the root
//     query next_items_page(cursor, limit). Writes use
//     change_multiple_column_values(board_id, item_id, column_values: JSON),
//     where column_values is a JSON *string*.

export const MONDAY_API_URL = 'https://api.monday.com/v2'
export const DEFAULT_MONDAY_API_VERSION = '2026-07'
export const MAX_ITEMS_PAGE_LIMIT = 500
const DEFAULT_ITEMS_PAGE_LIMIT = 100
const MAX_BACKOFF_MS = 30_000
// A server-requested wait longer than this is not slept through inside a
// request; the error is surfaced as retryable for the caller to schedule.
const MAX_HONOURED_WAIT_MS = 60_000
const REQUEST_TIMEOUT_MS = 30_000

const RETRYABLE_CODES = new Set([
  'COMPLEXITY_BUDGET_EXHAUSTED',
  'ComplexityException',
  'maxConcurrencyExceeded',
  'Rate Limit Exceeded',
  'RATE_LIMIT_EXCEEDED',
  'IP_RATE_LIMIT_EXCEEDED',
  'Resource is currently locked, please try again later',
])
const NEVER_RETRY_CODES = new Set([
  'DAILY_LIMIT_EXCEEDED',
  'REQUEST_MAX_COMPLEXITY_EXCEEDED',
  'maxComplexityExceeded',
])

export class MondayApiError extends Error {
  constructor({ code, status = null, retryable = false, message }) {
    super(message || code)
    this.name = 'MondayApiError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }

  toJSON() {
    return { name: this.name, code: this.code, status: this.status, retryable: this.retryable, message: this.message }
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function makeLogger(log) {
  const emit = (level, data, msg) => {
    if (!log) return
    if (typeof log[level] === 'function') log[level](data, msg)
    else if (typeof log === 'function') log(level, msg, data)
  }
  return { info: (d, m) => emit('info', d, m), warn: (d, m) => emit('warn', d, m) }
}

function parseJsonSafe(text) {
  if (text == null || text === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function retryAfterMsFromHeader(res) {
  const raw = res?.headers?.get?.('retry-after')
  if (!raw) return null
  const secs = Number(raw)
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000
  const at = Date.parse(raw)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null
}

function retryInSecondsFrom(body, gqlError) {
  const candidates = [
    gqlError?.extensions?.retry_in_seconds,
    gqlError?.extensions?.error_data?.retry_in_seconds,
    gqlError?.retry_in_seconds,
    body?.retry_in_seconds,
    body?.extensions?.retry_in_seconds,
  ]
  for (const c of candidates) {
    const n = Number(c)
    if (c != null && Number.isFinite(n) && n >= 0) return n
  }
  // Legacy ComplexityException message: "... reset in 12 seconds"
  const legacy = typeof body?.error_message === 'string' && body.error_message.match(/reset in (\d+) seconds?/i)
  return legacy ? Number(legacy[1]) : null
}

/** Pull a { code, message, statusCode, retryInSeconds } out of any monday error body. */
function describeErrorBody(body) {
  if (!body || typeof body !== 'object') return null
  if (Array.isArray(body.errors) && body.errors.length) {
    const first = body.errors[0] || {}
    // Prefer an error whose code decides retry behaviour.
    const decisive =
      body.errors.find((e) => RETRYABLE_CODES.has(e?.extensions?.code) || NEVER_RETRY_CODES.has(e?.extensions?.code)) || first
    return {
      code: decisive?.extensions?.code || 'graphql_error',
      message: decisive?.message || 'GraphQL error',
      statusCode: Number(decisive?.extensions?.status_code) || null,
      retryInSeconds: retryInSecondsFrom(body, decisive),
    }
  }
  if (body.error_code || body.error_message) {
    return {
      code: body.error_code || 'api_error',
      message: body.error_message || String(body.error_code),
      statusCode: Number(body.status_code) || null,
      retryInSeconds: retryInSecondsFrom(body, null),
    }
  }
  return null
}

/**
 * @param {Object} opts
 * @param {string} opts.token            personal API token; sent only in the Authorization header
 * @param {string} [opts.apiVersion]
 * @param {Function} [opts.fetchImpl]
 * @param {(ms:number)=>Promise<void>} [opts.sleep]
 * @param {number} [opts.maxRetries]     retries after the first attempt
 * @param {Object|Function} [opts.log]   pino-like logger; receives ids and counts only
 * @param {string} [opts.url]
 */
export function createMondayApiProvider({
  token,
  apiVersion = DEFAULT_MONDAY_API_VERSION,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  maxRetries = 3,
  log,
  url = MONDAY_API_URL,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  if (!token || typeof token !== 'string') {
    throw new MondayApiError({ code: 'not_configured', message: 'monday API token is not configured' })
  }
  if (typeof fetchImpl !== 'function') {
    throw new MondayApiError({ code: 'not_configured', message: 'No fetch implementation available' })
  }
  const logger = makeLogger(log)
  const version = apiVersion || DEFAULT_MONDAY_API_VERSION

  // Never let the token leave in an error message, whatever the upstream echoed.
  const scrub = (text) => {
    let s = String(text ?? '')
    if (token) s = s.split(token).join('[redacted]')
    return s.length > 500 ? `${s.slice(0, 500)}…` : s
  }
  const fail = ({ code, status = null, retryable = false, message }) =>
    new MondayApiError({ code, status, retryable, message: scrub(message || code) })

  const backoffMs = (attempt, serverWaitMs) =>
    serverWaitMs != null ? serverWaitMs : Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt)

  async function attemptOnce(op, query, variables) {
    let res
    try {
      const signal = typeof AbortSignal?.timeout === 'function' && timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
      res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'API-Version': version,
        },
        body: JSON.stringify({ query, variables }),
        signal,
      })
    } catch (err) {
      return { error: fail({ code: 'network_error', retryable: true, message: `Network error calling monday.com: ${err?.message || err}` }) }
    }

    const status = res.status
    let text = ''
    try {
      text = await res.text()
    } catch {
      text = ''
    }
    const body = parseJsonSafe(text)
    const described = describeErrorBody(body)
    const headerWaitMs = retryAfterMsFromHeader(res)
    const waitFor = (d) => (d?.retryInSeconds != null ? d.retryInSeconds * 1000 : headerWaitMs)

    if (status === 401 || status === 403) {
      return {
        error: fail({
          code: described?.code || (status === 401 ? 'unauthorized' : 'forbidden'),
          status,
          retryable: false,
          message: `monday.com rejected the credentials (${status}): ${described?.message || 'unauthorized'}`,
        }),
      }
    }
    if (status === 429 || status >= 500) {
      if (described && NEVER_RETRY_CODES.has(described.code)) {
        return { error: fail({ code: described.code, status, retryable: false, message: described.message }) }
      }
      return {
        error: fail({
          code: described?.code || (status === 429 ? 'rate_limited' : 'server_error'),
          status,
          retryable: true,
          message: described?.message || `monday.com returned HTTP ${status}`,
        }),
        waitMs: waitFor(described),
      }
    }
    if (status < 200 || status >= 300) {
      return {
        error: fail({ code: described?.code || 'http_error', status, retryable: false, message: described?.message || `monday.com returned HTTP ${status}` }),
      }
    }
    if (!body || typeof body !== 'object') {
      return { error: fail({ code: 'invalid_response', status, retryable: false, message: 'monday.com returned a non-JSON response' }) }
    }
    if (described) {
      const throttled =
        !NEVER_RETRY_CODES.has(described.code) && (RETRYABLE_CODES.has(described.code) || described.statusCode === 429)
      return {
        error: fail({ code: described.code, status: described.statusCode || status, retryable: throttled, message: described.message }),
        waitMs: throttled ? waitFor(described) : null,
      }
    }
    return { data: body.data ?? null }
  }

  async function request(op, query, variables = {}) {
    for (let attempt = 0; ; attempt++) {
      const { data, error, waitMs } = await attemptOnce(op, query, variables)
      if (!error) return data
      const wait = backoffMs(attempt, waitMs ?? null)
      const canRetry = error.retryable && attempt < maxRetries && wait <= MAX_HONOURED_WAIT_MS
      logger.warn({ provider: 'monday', op, attempt, code: error.code, status: error.status, retrying: canRetry, waitMs: canRetry ? wait : undefined }, 'monday request failed')
      if (!canRetry) throw error
      await sleep(wait)
    }
  }

  const ITEM_FIELDS = 'cursor items { id name column_values { id text value } }'

  function mapItems(page) {
    const items = (page?.items || []).map((item) => {
      const columns = {}
      for (const cv of item.column_values || []) {
        columns[cv.id] = { text: cv.text ?? '', value: typeof cv.value === 'string' ? parseJsonSafe(cv.value) : cv.value ?? null }
      }
      return { id: String(item.id), name: item.name, columns }
    })
    return { items, cursor: page?.cursor || null }
  }

  return {
    mode: 'api',
    apiVersion: version,

    async validateConnection() {
      try {
        const data = await request('validateConnection', 'query { me { id name email } account { id name } }')
        const me = data?.me
        const account = data?.account
        logger.info({ provider: 'monday', op: 'validateConnection', accountId: account?.id ?? null }, 'monday connection ok')
        return {
          ok: true,
          account: account ? { id: String(account.id), name: account.name } : undefined,
          user: me ? { id: String(me.id), name: me.name, email: me.email } : undefined,
        }
      } catch (err) {
        if (!(err instanceof MondayApiError)) throw err
        return { ok: false, error: { code: err.code, status: err.status, retryable: err.retryable, message: err.message } }
      }
    },

    async listBoards({ maxPages = 20, pageSize = 100 } = {}) {
      const boards = []
      for (let page = 1; page <= maxPages; page++) {
        const data = await request(
          'listBoards',
          'query ($limit: Int!, $page: Int!) { boards(limit: $limit, page: $page, state: active) { id name items_count type } }',
          { limit: pageSize, page },
        )
        const batch = data?.boards || []
        for (const b of batch) {
          // Subitem boards are an implementation detail of their parent board.
          if (b.type && b.type !== 'board') continue
          boards.push({ id: String(b.id), name: b.name, itemsCount: b.items_count ?? null })
        }
        if (batch.length < pageSize) break
      }
      logger.info({ provider: 'monday', op: 'listBoards', count: boards.length }, 'monday boards listed')
      return boards
    },

    async getBoardColumns(boardId) {
      const data = await request(
        'getBoardColumns',
        'query ($ids: [ID!]) { boards(ids: $ids) { id name items_count columns { id title type settings_str } } }',
        { ids: [String(boardId)] },
      )
      const board = data?.boards?.[0]
      if (!board) throw fail({ code: 'board_not_found', message: `Board ${boardId} was not found or is not accessible` })
      const columns = (board.columns || []).map((c) => ({
        id: c.id,
        title: c.title,
        type: c.type,
        settings: parseJsonSafe(c.settings_str) || {},
      }))
      logger.info({ provider: 'monday', op: 'getBoardColumns', boardId: String(boardId), count: columns.length }, 'monday columns listed')
      return columns
    },

    async listItems(boardId, { cursor = null, limit = DEFAULT_ITEMS_PAGE_LIMIT } = {}) {
      const lim = Math.max(1, Math.min(MAX_ITEMS_PAGE_LIMIT, Math.trunc(Number(limit)) || DEFAULT_ITEMS_PAGE_LIMIT))
      let page
      if (cursor) {
        const data = await request(
          'listItems',
          `query ($cursor: String!, $limit: Int!) { next_items_page(cursor: $cursor, limit: $limit) { ${ITEM_FIELDS} } }`,
          { cursor, limit: lim },
        )
        page = data?.next_items_page
      } else {
        const data = await request(
          'listItems',
          `query ($ids: [ID!], $limit: Int!) { boards(ids: $ids) { items_page(limit: $limit) { ${ITEM_FIELDS} } } }`,
          { ids: [String(boardId)], limit: lim },
        )
        const board = data?.boards?.[0]
        if (!board) throw fail({ code: 'board_not_found', message: `Board ${boardId} was not found or is not accessible` })
        page = board.items_page
      }
      const result = mapItems(page)
      logger.info({ provider: 'monday', op: 'listItems', boardId: String(boardId), count: result.items.length, more: Boolean(result.cursor) }, 'monday items page')
      return result
    },

    /**
     * Writes only the given columns. Failures are returned (per the interface)
     * rather than thrown, so a batch apply can record a per-item outcome.
     */
    async updateItemColumns(boardId, itemId, columnValues) {
      const ids = Object.keys(columnValues || {})
      if (!ids.length) return { ok: true, itemId: String(itemId), noop: true }
      try {
        const data = await request(
          'updateItemColumns',
          'mutation ($boardId: ID!, $itemId: ID!, $values: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $values) { id } }',
          { boardId: String(boardId), itemId: String(itemId), values: JSON.stringify(columnValues) },
        )
        const id = data?.change_multiple_column_values?.id
        logger.info({ provider: 'monday', op: 'updateItemColumns', boardId: String(boardId), itemId: String(itemId), columns: ids.length }, 'monday item updated')
        return { ok: true, itemId: String(id ?? itemId) }
      } catch (err) {
        if (!(err instanceof MondayApiError)) throw err
        return { ok: false, itemId: String(itemId), error: { code: err.code, status: err.status, retryable: err.retryable, message: err.message } }
      }
    },
  }
}

/**
 * Walk every page of a board. Stops after maxPages; `complete` is false when
 * a cursor was left unread (monday cursors expire after 60 minutes, so a
 * truncated walk should be restarted rather than resumed later).
 */
export async function listAllItems(provider, boardId, { maxPages = 50, limit = MAX_ITEMS_PAGE_LIMIT } = {}) {
  const items = []
  let cursor = null
  let pages = 0
  do {
    const page = await provider.listItems(boardId, { cursor, limit })
    items.push(...page.items)
    cursor = page.cursor || null
    pages++
  } while (cursor && pages < maxPages)
  return { items, pages, complete: !cursor }
}

export default createMondayApiProvider
