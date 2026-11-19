// /api/colors — entry colours (server/colors/). Any signed-in account; each
// request is checked against the entry's capabilities (entryColors.js).
//
//   PUT /api/colors   { kind: 'caller' | 'lead' | 'reminder', id, color | null }
//                     → { kind, id, color }
//
// The colours are read with each page's own data (calls, leads, reminders).
import { Router } from 'express'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import { route } from '../middleware/route.js'
import { accountLimiter } from '../middleware/accountLimiter.js'
import { ColorError, setEntryColor } from '../colors/entryColors.js'

// Changes per account in ten minutes: far more than anyone colours by hand.
export const COLOR_WRITES_PER_10_MIN = 300

export function createColorsRouter({ db = null, writeLimit = COLOR_WRITES_PER_10_MIN } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  router.use(requireAuth)
  const writes = accountLimiter({
    name: 'color-writes', windowMs: 10 * 60 * 1000, max: writeLimit,
    error: 'Too many color changes in a few minutes. Wait a moment and try again.', code: 'too_many_changes',
  })
  const wrap = route('Entry colour error', { errors: [ColorError] })

  router.put('/', writes, wrap(async (req, res) => {
    const b = req.body || {}
    // null (or '') clears it; leaving color out is a mistake, not a clear.
    const color = b.color === null || b.color === '' ? null : (b.color ?? false)
    res.json(await setEntryColor(pool(), { kind: b.kind, id: b.id, color, accountId: req.account.id, caps: req.capabilities }))
  }))

  return router
}

export default createColorsRouter
