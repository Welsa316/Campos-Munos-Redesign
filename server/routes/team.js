// /api/team — the portal's Team tab: staff accounts and what each may do
// (docs/staff-accounts.md). Administrators only (team.manage). The rules
// live in server/auth/team.js, shared with scripts/staff.js; the activity
// log records each request with who made it.
//
//   GET  /                              every account, roles and capabilities
//   POST /                              create (returns a one-time password)
//   PUT  /:id/role | /:id/name
//   PUT  /:id/extension                 { extensionId } RingCentral extension that is this person (null unlinks)
//   PUT  /:id/capabilities/:capability  { state: grant | revoke | default }
//   POST /:id/clear-overrides | disable | enable | sign-out | reset-password
import { Router } from 'express'
import { param } from 'express-validator'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import requireCapability from '../middleware/requireCapability.js'
import validate from '../middleware/validate.js'
import { CAPABILITIES, ROLES, ADMIN_ONLY } from '../auth/capabilities.js'
import * as team from '../auth/team.js'
import { loadDirectory } from '../integrations/ringcentral/extensionDirectory.js'

const idParam = param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid id')

export function createTeamRouter({ db = null } = {}) {
  const router = Router()
  const pool = () => db || getPool()

  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof team.TeamError) return res.status(err.status).json({ error: err.message })
      req.log?.error({ err }, 'Team route error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
  const actor = (req) => ({ via: 'portal', id: req.account.id })
  // The account the request is about, with its email on the log line.
  const target = async (req) => {
    const row = await team.findAccount(pool(), { id: Number(req.params.id) })
    req.activityDetails = { account: row.email }
    return row
  }

  router.use(requireAuth, requireCapability('team.manage'))

  router.get('/', wrap(async (_req, res) => {
    const rows = await team.listAccounts(pool())
    res.json({
      accounts: rows.map(team.accountJson),
      roles: Object.entries(ROLES).map(([key, r]) => ({ key, label: r.label, capabilities: r.capabilities })),
      capabilities: Object.entries(CAPABILITIES).map(([key, description]) => ({ key, description, adminOnly: ADMIN_ONLY.includes(key) })),
      // RingCentral's people extensions, to link accounts to (empty until the
      // call import has read the extension list).
      extensions: (await loadDirectory(pool())).people
        .map((p) => ({ id: p.id, number: p.number, name: p.name }))
        .sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true })),
    })
  }))

  router.post('/', wrap(async (req, res) => {
    const b = req.body || {}
    const { row, password } = await team.createAccount(pool(), { email: b.email, name: b.name, role: b.role }, actor(req))
    req.activityDetails = { account: row.email }
    res.status(201).json({ account: team.accountJson(row), password })
  }))

  router.put('/:id/role', idParam, validate, wrap(async (req, res) => {
    const row = await target(req)
    req.activityDetails.from = row.role
    res.json(team.accountJson(await team.setRole(pool(), row, req.body?.role, actor(req))))
  }))

  router.put('/:id/name', idParam, validate, wrap(async (req, res) => {
    res.json(team.accountJson(await team.setName(pool(), await target(req), req.body?.name, actor(req))))
  }))

  router.put('/:id/extension', idParam, validate, wrap(async (req, res) => {
    res.json(team.accountJson(await team.setExtension(pool(), await target(req), req.body?.extensionId ?? null, actor(req))))
  }))

  router.put('/:id/capabilities/:capability', idParam, validate, wrap(async (req, res) => {
    res.json(team.accountJson(await team.setCapability(pool(), await target(req), req.params.capability, req.body?.state, actor(req))))
  }))

  router.post('/:id/clear-overrides', idParam, validate, wrap(async (req, res) => {
    res.json(team.accountJson(await team.clearOverrides(pool(), await target(req), actor(req))))
  }))

  router.post('/:id/disable', idParam, validate, wrap(async (req, res) => {
    res.json(team.accountJson(await team.setDisabled(pool(), await target(req), true, actor(req))))
  }))

  router.post('/:id/enable', idParam, validate, wrap(async (req, res) => {
    res.json(team.accountJson(await team.setDisabled(pool(), await target(req), false, actor(req))))
  }))

  router.post('/:id/sign-out', idParam, validate, wrap(async (req, res) => {
    await team.signOutEverywhere(pool(), await target(req), actor(req))
    res.json({ ok: true })
  }))

  router.post('/:id/reset-password', idParam, validate, wrap(async (req, res) => {
    const password = await team.resetPassword(pool(), await target(req), undefined, actor(req))
    res.json({ password })
  }))

  return router
}
