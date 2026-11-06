// /api/test-channel — the administrator's test forms (testChannel/).
// Administrators only (forms.test, ADMIN_ONLY).
//
//   POST   /link    a test link for the website, valid for an hour
//   GET    /        the test forms received, newest first
//   GET    /:id     one, with its chat messages
//   DELETE /:id     remove one
//   DELETE /        clear them all
//
// The tests themselves arrive through the public form route
// (routes/submissions.js) carrying the link's token.
import { Router } from 'express'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import requireCapability from '../middleware/requireCapability.js'
import { parseOrigins } from '../httpSecurity.js'
import { mintTestToken, TEST_CAPABILITY } from '../testChannel/token.js'
import { listTestSubmissions, getTestSubmission } from '../testChannel/store.js'

const ID = /^\d{1,9}$/

/** Where the website lives: its first public origin, preferring the bare domain. */
export function websiteOrigin(env = process.env) {
  const list = parseOrigins(env.PUBLIC_ORIGINS)
  return list.find((o) => !/^https?:\/\/www\./.test(o)) || list[0] || 'https://camulaw.com'
}

export function createTestChannelRouter({ db = null, env = process.env } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  router.use(requireAuth, requireCapability(TEST_CAPABILITY))

  router.post('/link', (req, res) => {
    try {
      const { token, expiresAt } = mintTestToken({ accountId: req.account.id, tokenVersion: req.account.tokenVersion }, { secret: env.JWT_SECRET || process.env.JWT_SECRET })
      // In the fragment, so it never reaches a server log or a Referer; the
      // website reads it and takes it out of the address (site/src/utils/testMode.js).
      const site = websiteOrigin(env)
      res.json({ expiresAt, contactUrl: `${site}/consulta#cm-test=${token}`, siteUrl: `${site}/#cm-test=${token}` })
    } catch (err) {
      req.log?.error({ err }, 'Test link error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.get('/', async (req, res) => {
    try {
      res.json({ items: await listTestSubmissions(pool()) })
    } catch (err) {
      req.log?.error({ err }, 'Test channel list error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.get('/:id', async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid test ID' })
    try {
      const row = await getTestSubmission(pool(), Number(req.params.id))
      if (!row) return res.status(404).json({ error: 'Test form not found' })
      res.json(row)
    } catch (err) {
      req.log?.error({ err }, 'Test channel read error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.delete('/:id', async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid test ID' })
    try {
      const r = await pool().query('DELETE FROM test_submissions WHERE id = $1 RETURNING id', [Number(req.params.id)])
      if (!r.rowCount) return res.status(404).json({ error: 'Test form not found' })
      res.json({ ok: true, id: r.rows[0].id })
    } catch (err) {
      req.log?.error({ err }, 'Test channel delete error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.delete('/', async (req, res) => {
    try {
      const r = await pool().query('DELETE FROM test_submissions')
      req.activityDetails = { count: r.rowCount }
      res.json({ ok: true, removed: r.rowCount })
    } catch (err) {
      req.log?.error({ err }, 'Test channel clear error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}
