// A call log import soon after a call ends, so it reaches Calls within about
// a minute instead of at the next five-minute import. Triggered by
// RingCentral's live events (routes/ringcentralWebhook.js) when every party
// of a call has left. RingCentral writes the record some seconds after the
// call (its docs: 15 to 30), so the import runs twice: at about 25 s and
// 90 s. Calls ending close together share the same runs.
//
// Only where the scheduled import runs (RINGCENTRAL_CALL_SYNC, production by
// default): elsewhere nothing is fetched.
import getPool from '../../db/pool.js'
import logger from '../../logger.js'
import { loadRingCentralConfig } from './config.js'
import { syncCallLog } from './callLog.js'
import { isProductionEnv } from '../../utils/productionEnv.js'

export const QUICK_DELAYS_MS = [25 * 1000, 90 * 1000]
const timers = new Map()

const enabled = (env) => (env.RINGCENTRAL_CALL_SYNC ? env.RINGCENTRAL_CALL_SYNC === 'true' : isProductionEnv(env))

/** Ask for the soon imports. `run` is the import (replaced in tests). */
export function requestQuickSync({ env = process.env, run = defaultRun, delays = QUICK_DELAYS_MS } = {}) {
  if (!enabled(env)) return false
  for (const delay of delays) {
    if (timers.has(delay)) continue
    const t = setTimeout(async () => {
      timers.delete(delay)
      try { await run(env) } catch (err) { logger.warn({ provider: 'ringcentral', err: { name: err?.name, code: err?.code } }, 'Quick call log import failed') }
    }, delay)
    t.unref?.()
    timers.set(delay, t)
  }
  return true
}

async function defaultRun(env) {
  const cfg = loadRingCentralConfig(env)
  if (!cfg.configured) return
  const r = await syncCallLog(getPool(), cfg, { trigger: 'live' })
  if (r.status === 'ok' && r.new) logger.info({ provider: 'ringcentral', new: r.new }, 'Call log imported after a call ended')
}

/** Whether a live delivery says this party left the call. */
export const endsCall = (payload) => Array.isArray(payload?.body?.parties)
  && payload.body.parties.some((p) => ['Disconnected', 'Gone'].includes(p?.status?.code))

export function cancelQuickSyncs() {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
}

export default { requestQuickSync, endsCall, cancelQuickSyncs }
