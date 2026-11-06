// The activity log: who did what in the portal, and when
// (docs/staff-accounts.md, "Activity log"). One row per request that changes
// something, written after the response so it records what actually
// happened (done, refused or failed) and never slows the person down.
import getPool from '../db/pool.js'
import { actionFor } from './actions.js'

const READS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** The route as Express matched it ('/api/submissions/:id/status'). */
export function routePattern(req) {
  let p = req.route
    ? `${req.baseUrl}${req.route.path}`.replace(/\([^)]*\)/g, '')
    // Refused before a route matched (a router-wide requireAuth): ids by shape.
    : String(req.originalUrl || '').split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id')
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

export function outcomeOf(status) {
  if (status < 400) return 'ok'
  if (status === 401 || status === 403) return 'denied'
  return 'failed'
}

// Short primitives only; anything else is dropped.
function clean(details) {
  const out = {}
  for (const [k, v] of Object.entries(details || {})) {
    if (v == null || v === '') continue
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v
    else if (typeof v === 'string') out[k] = v.slice(0, 120)
  }
  return out
}

/** The row to write for this request, or null when it is not logged. */
export function describeRequest(req, res) {
  const pattern = routePattern(req)
  const def = actionFor(req.method, pattern)
  if (def?.skip) return null
  if (READS.has(req.method) && !def) return null
  const actor = req.activityActor || req.account || null
  // Without an account there is nobody to attribute it to; sign-in is the
  // exception (a failed attempt is worth seeing).
  if (!actor && !def?.anonymous) return null
  // A rate-limited or malformed attempt says nothing about anyone, and a
  // script hammering the sign-in form would otherwise fill the log.
  if (!actor && (res.statusCode === 429 || res.statusCode === 400)) return null
  if (!pattern.startsWith('/api/')) return null

  let details = {}
  try { details = def?.details ? def.details(req) : {} } catch { details = {} }
  const params = req.params || {}
  const entityId = params.id ?? params.clientId ?? params.jobId ?? params.key ?? (def?.entity === 'account' && actor ? actor.id : null)
  return {
    actorId: actor?.id ?? null,
    actorEmail: actor?.email ?? null,
    actorRole: actor?.role ?? null,
    action: def?.key ?? 'request',
    label: def?.label ?? `${req.method} ${pattern}`,
    method: req.method,
    path: pattern,
    entityType: def?.entity ?? null,
    entityId: entityId == null ? null : String(entityId),
    outcome: outcomeOf(res.statusCode),
    statusCode: res.statusCode,
    ip: req.clientIp || req.ip || null,
    source: 'portal',
    details: clean({ ...details, ...req.activityDetails }),
  }
}

export async function recordActivity(db, e) {
  await db.query(
    `INSERT INTO staff_activity (actor_id, actor_email, actor_role, action, label, method, path, entity_type, entity_id, outcome, status_code, ip, source, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [e.actorId ?? null, e.actorEmail ?? null, e.actorRole ?? null, e.action, e.label, e.method ?? null, e.path ?? null,
      e.entityType ?? null, e.entityId ?? null, e.outcome ?? 'ok', e.statusCode ?? null, e.ip ?? null, e.source ?? 'portal',
      JSON.stringify(clean(e.details))]
  )
}

export const ACTIVITY_RETENTION_DAYS = 400

/** Delete rows older than ACTIVITY_RETENTION_DAYS. Returns how many went. */
export async function purgeActivity(db, now = new Date()) {
  const cutoff = new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const { rowCount } = await db.query('DELETE FROM staff_activity WHERE created_at < $1', [cutoff])
  return rowCount
}

/** Express middleware: mount once on /api, before the routers. */
export function activityRecorder({ db = () => getPool() } = {}) {
  return (req, res, next) => {
    res.on('finish', () => {
      let entry
      try { entry = describeRequest(req, res) } catch (err) {
        req.log?.error({ err }, 'Activity log: could not describe request')
        return
      }
      if (!entry) return
      recordActivity(db(), entry).catch((err) => req.log?.error({ err }, 'Activity log write failed'))
    })
    next()
  }
}
