// /api/activity — the activity log, newest first (docs/staff-accounts.md).
// Administrators only (activity.view). Reading it is not itself logged.
//
//   GET /?actor=<id|cli>&outcome=ok|problems&q=<text>&from=YYYY-MM-DD&to=YYYY-MM-DD&before=<row id>
//
// Dates are the firm's calendar days (America/Chicago). Pages of 100 rows;
// pass the last row's id as `before` for the next page.
import { Router } from 'express'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import requireCapability from '../middleware/requireCapability.js'
import { ROLES, CAPABILITIES } from '../auth/capabilities.js'

const PAGE = 100
const TZ = 'America/Chicago'
const DAY = /^\d{4}-\d{2}-\d{2}$/

export function createActivityRouter({ db = null } = {}) {
  const router = Router()
  const pool = () => db || getPool()

  router.use(requireAuth, requireCapability('activity.view'))

  router.get('/', async (req, res) => {
    try {
      const q = req.query
      const where = []
      const args = []
      const add = (sql, v) => { args.push(v); where.push(sql.replace('?', `$${args.length}`)) }
      if (q.actor === 'cli') where.push("a.source = 'cli'")
      else if (/^\d+$/.test(String(q.actor || ''))) add('a.actor_id = ?', Number(q.actor))
      if (q.outcome === 'ok') where.push("a.outcome = 'ok'")
      else if (q.outcome === 'problems') where.push("a.outcome <> 'ok'")
      // Words in the description, the person or the details; or an exact id.
      const text = typeof q.q === 'string' ? q.q.trim().slice(0, 80) : ''
      if (text) {
        args.push(`%${text.replace(/[%_\\]/g, '\\$&')}%`)
        const like = `$${args.length}`
        args.push(text)
        where.push(`(a.label ILIKE ${like} OR a.actor_email ILIKE ${like} OR a.details::text ILIKE ${like} OR a.entity_id = $${args.length})`)
      }
      if (DAY.test(String(q.from || ''))) add(`a.created_at >= (?::date)::timestamp AT TIME ZONE '${TZ}'`, q.from)
      if (DAY.test(String(q.to || ''))) add(`a.created_at < ((?::date) + 1)::timestamp AT TIME ZONE '${TZ}'`, q.to)
      if (/^\d{1,15}$/.test(String(q.before || ''))) add('a.id < ?', String(q.before))

      const { rows } = await pool().query(
        `SELECT a.*, u.display_name, u.email AS current_email
           FROM staff_activity a LEFT JOIN admin_users u ON u.id = a.actor_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY a.id DESC LIMIT ${PAGE + 1}`,
        args
      )
      const page = rows.slice(0, PAGE)
      const out = {
        items: page.map((r) => ({
          id: String(r.id),
          at: r.created_at,
          actor: r.actor_id == null && !r.actor_email ? null : {
            id: r.actor_id,
            email: r.actor_email ?? r.current_email ?? null,
            name: (r.display_name && r.display_name.trim()) || null,
            role: r.actor_role,
          },
          action: r.action,
          label: r.label,
          method: r.method,
          path: r.path,
          entityType: r.entity_type,
          entityId: r.entity_id,
          outcome: r.outcome,
          statusCode: r.status_code,
          ip: r.ip,
          source: r.source,
          details: r.details || {},
        })),
        nextBefore: rows.length > PAGE ? String(page[page.length - 1].id) : null,
      }
      // The filter's list of people: everyone with an account, on the first page.
      if (!q.before) {
        out.people = (await pool().query('SELECT id, email, display_name, disabled_at FROM admin_users ORDER BY LOWER(COALESCE(display_name, email))')).rows
          .map((u) => ({ id: u.id, email: u.email, name: (u.display_name && u.display_name.trim()) || null, disabled: Boolean(u.disabled_at) }))
        out.roles = Object.fromEntries(Object.entries(ROLES).map(([key, r]) => [key, r.label]))
        out.capabilities = CAPABILITIES
      }
      res.json(out)
    } catch (err) {
      req.log?.error({ err }, 'Activity log read error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}
