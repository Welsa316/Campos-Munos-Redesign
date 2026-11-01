// /api/integrations — third-party accounts an administrator connects with
// OAuth. Today: RingCentral (docs/ringcentral-oauth.md).
//
//   GET  /ringcentral             connection status (no tokens, no secrets)
//   POST /ringcentral/authorize   start: returns RingCentral's authorize URL and
//                                 sets the httpOnly browser-binding cookie
//   GET  /ringcentral/callback    RingCentral redirects here (registered as
//                                 https://api.camulaw.com/api/integrations/ringcentral/callback);
//                                 always answers with a redirect to the portal
//   POST /ringcentral/refresh     refresh now, to confirm the connection works
//   POST /ringcentral/disconnect  revoke and delete the stored tokens
//
// Every route except the callback needs a portal session with
// integrations.manage (administrators only). The callback is reached by a
// top-level redirect from RingCentral, so it checks the same session itself
// and, instead of JSON errors, redirects to the portal with a fixed outcome
// code. The POSTs are covered by the cross-origin write check in
// httpSecurity.js like every cookie-authenticated write.
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import requireCapability from '../middleware/requireCapability.js'
import { loadAccount, tokenMatches } from '../auth/account.js'
import { clientKey, sessionCookieOptions } from '../httpSecurity.js'
import { loadRingCentralConfig } from '../integrations/ringcentral/config.js'
import {
  startAuthorization, completeAuthorization, getConnectionStatus, maintainConnection, disconnect,
  RingCentralFlowError, RingCentralNotConnectedError, STATE_TTL_MS, CALLBACK_OUTCOMES,
} from '../integrations/ringcentral/service.js'
import { RingCentralOAuthError } from '../integrations/ringcentral/oauth.js'

export const BINDING_COOKIE = 'cm_rc_oauth'
const COOKIE_PATH = '/api/integrations/ringcentral'

/** The signed-in, enabled portal account behind the session cookie, or null. */
async function sessionAccount(req, db, env) {
  const token = req.cookies?.token
  if (!token) return null
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET || process.env.JWT_SECRET)
    const account = await loadAccount(db, decoded.id)
    if (!account || account.disabled || !tokenMatches(decoded, account)) return null
    return account
  } catch {
    return null
  }
}

function bindingCookieOptions(env) {
  const session = sessionCookieOptions(env)
  return {
    httpOnly: true,
    secure: session.secure,
    // Lax: sent on RingCentral's top-level redirect back (a GET navigation),
    // never on a cross-site subrequest. 'none' only mirrors staging setups.
    sameSite: session.sameSite === 'none' ? 'none' : 'lax',
    path: COOKIE_PATH,
  }
}

export function createIntegrationsRouter({ db = null, env = process.env, fetchImpl, now } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  // Read per request: a variable changed on Railway applies on the next deploy
  // either way, and tests can vary it.
  const config = () => loadRingCentralConfig(env)
  const deps = { ...(fetchImpl ? { fetchImpl } : {}), ...(now ? { now } : {}) }

  // Nothing here may be cached by a browser or proxy.
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  // --- callback (no requireAuth: it answers with redirects) ------------------

  const callbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientKey,
    handler: (_req, res) => res.status(429).type('text/plain').send('Too many attempts. Try again later.'),
  })

  router.get('/ringcentral/callback', callbackLimiter, async (req, res) => {
    const cfg = config()
    // The administrator's own address in the portal; the outcome is one of a
    // fixed list, never text from the query string.
    const back = (outcome) => {
      const safe = CALLBACK_OUTCOMES.includes(outcome) ? outcome : 'error'
      res.setHeader('Referrer-Policy', 'no-referrer')
      res.clearCookie(BINDING_COOKIE, bindingCookieOptions(env))
      return res.redirect(303, `${cfg.adminAppUrl}/integrations?ringcentral=${safe}`)
    }
    try {
      const q = req.query
      const str = (v) => (typeof v === 'string' ? v : undefined)
      const account = await sessionAccount(req, pool(), env)
      const result = await completeAuthorization(pool(), cfg, {
        state: str(q.state),
        bindingNonce: str(req.cookies?.[BINDING_COOKIE]),
        account,
        code: str(q.code),
        error: str(q.error),
      }, deps)
      req.log?.info({ provider: 'ringcentral', outcome: result.outcome }, 'RingCentral authorization completed')
      return back(result.outcome)
    } catch (err) {
      if (err instanceof RingCentralFlowError) {
        req.log?.warn({ provider: 'ringcentral', outcome: err.outcome }, 'RingCentral authorization refused')
        return back(err.outcome)
      }
      req.log?.error({ err: { name: err?.name, code: err?.code } }, 'RingCentral callback error')
      return back('error')
    }
  })

  // --- everything else: administrators only -----------------------------------

  router.use(requireAuth, requireCapability('integrations.manage'))

  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof RingCentralFlowError) return res.status(err.status).json({ error: err.message, code: err.outcome })
      if (err instanceof RingCentralNotConnectedError) return res.status(409).json({ error: 'RingCentral is not connected', code: err.code })
      if (err instanceof RingCentralOAuthError) {
        req.log?.warn({ provider: 'ringcentral', code: err.code, status: err.status }, 'RingCentral token call failed')
        return res.status(502).json({ error: 'RingCentral did not accept the request. Try again shortly.', code: err.code })
      }
      req.log?.error({ err }, 'Integrations route error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  router.get('/ringcentral', wrap(async (_req, res) => {
    res.json(await getConnectionStatus(pool(), config()))
  }))

  router.post('/ringcentral/authorize', wrap(async (req, res) => {
    const { authorizeUrl, bindingNonce } = await startAuthorization(pool(), config(), {
      adminUserId: req.account.id,
      now: now ? now() : new Date(),
    })
    res.cookie(BINDING_COOKIE, bindingNonce, { ...bindingCookieOptions(env), maxAge: STATE_TTL_MS })
    res.json({ authorizeUrl })
  }))

  router.post('/ringcentral/refresh', wrap(async (_req, res) => {
    const { refreshed } = await maintainConnection(pool(), config(), { force: true }, deps)
    res.json({ refreshed, ...(await getConnectionStatus(pool(), config())) })
  }))

  router.post('/ringcentral/disconnect', wrap(async (req, res) => {
    const out = await disconnect(pool(), config(), { actorId: req.account.id }, deps)
    res.json({ ...out, ...(await getConnectionStatus(pool(), config())) })
  }))

  return router
}

export default createIntegrationsRouter
