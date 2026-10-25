// OpenAI ads Conversions API — the server-side copy of the pixel's
// lead_created event. Ad blockers and closed tabs drop browser events; this one
// still arrives. The browser and server send the same event id, so OpenAI
// deduplicates the pair into a single conversion.

const ENDPOINT = 'https://bzr.openai.com/v1/events'
const DEFAULT_PIXEL_ID = 'NshoMD9T8va4mtuWzuZwPr'
const TIMEOUT_MS = 5000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function buildLeadEvent({ eventId, sourceUrl, timestampMs }) {
  return {
    validate_only: false,
    events: [
      {
        id: eventId,
        type: 'lead_created',
        timestamp_ms: timestampMs,
        source_url: sourceUrl,
        action_source: 'web',
        data: { type: 'customer_action' },
      },
    ],
  }
}

/**
 * Send one lead_created conversion. Returns a short outcome string for logging
 * and never throws — a failed conversion must not affect the visitor's
 * submission, which has already been saved and answered by the time this runs.
 */
export async function sendLeadConversion({
  eventId,
  sourceUrl,
  timestampMs = Date.now(),
  env = process.env,
  fetchImpl = globalThis.fetch,
  log,
}) {
  const apiKey = env.OPENAI_CONVERSIONS_API_KEY
  if (!apiKey) return 'skipped:no_api_key'
  // Without the browser's id the pair can't be deduplicated, and we'd count
  // the lead twice. Better to send nothing than inflate the numbers.
  if (typeof eventId !== 'string' || !UUID_RE.test(eventId)) return 'skipped:no_event_id'

  const pixelId = env.OPENAI_PIXEL_ID || DEFAULT_PIXEL_ID
  try {
    const res = await fetchImpl(`${ENDPOINT}?pid=${encodeURIComponent(pixelId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildLeadEvent({ eventId, sourceUrl, timestampMs })),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      log?.error({ status: res.status, detail: detail.slice(0, 500) }, 'OpenAI conversion rejected')
      return `failed:${res.status}`
    }
    return 'sent'
  } catch (err) {
    log?.error({ err }, 'OpenAI conversion request failed')
    return 'failed:network'
  }
}
