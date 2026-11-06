// /api/reminders — callback reminders (server/reminders/). Any signed-in
// account; each request is checked against the target's capabilities
// (reminders.js: calls.exclude to set one on a caller, crm.view with
// crm.manage or calls.exclude on a website lead; seeing them needs calls.view
// or crm.view).
//
//   GET   /api/reminders/mine            my open and due reminders, soonest first
//   GET   /api/reminders?kind=call       every caller's open reminders (Calls page)
//   GET   /api/reminders?call=<id>       one episode's (by its first call)
//   GET   /api/reminders?lead=<id>       one website lead's
//   GET   /api/reminders/assignees?kind=call|submission
//                                        who a reminder can be assigned to
//   POST  /api/reminders                 { target: { kind, id }, dueAt, assignee?, note?, allowDuplicate? }
//                                        409 'duplicate' with the existing one
//   PATCH /api/reminders/:id             { version, dueAt?, assignee?, note? }
//                                        409 'conflict' with the current one
//   POST  /api/reminders/:id/complete    { version? }
//   POST  /api/reminders/:id/cancel      { version? }
//   POST  /api/reminders/:id/snooze      { version?, minutes | until }
//
// dueAt: an ISO time with a zone, or 'in_30', 'in_60', 'tomorrow_morning'
// (9:00 AM New Orleans time, next business day), worked out on the server.
import { Router } from 'express'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import { route } from '../middleware/route.js'
import { accountLimiter } from '../middleware/accountLimiter.js'
import {
  ReminderError, createReminder, updateReminder, completeReminder, cancelReminder, snoozeReminder,
  listMine, listForTargets, assignableAccounts, canSeeKind, getReminder,
} from '../reminders/reminders.js'

// Changes per account in ten minutes: far more than anyone sets, snoozes
// and finishes by hand, few enough that a script cannot flood a colleague.
export const REMINDER_WRITES_PER_10_MIN = 120

export function createRemindersRouter({ db = null, now, writeLimit = REMINDER_WRITES_PER_10_MIN } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  const clock = () => (now ? now() : new Date())

  router.use(requireAuth)
  const writes = accountLimiter({
    name: 'reminder-writes', windowMs: 10 * 60 * 1000, max: writeLimit,
    error: 'Too many reminder changes in a few minutes. Wait a moment and try again.', code: 'too_many_changes',
  })

  const wrap = route('Reminder error', { errors: [ReminderError] })
  const forbidden = () => new ReminderError('forbidden', 'Your account cannot see these reminders', 403)
  const idOf = (v) => {
    const n = Number(v)
    return Number.isSafeInteger(n) && n > 0 ? n : null
  }

  router.get('/mine', wrap(async (req, res) => {
    res.json({ reminders: await listMine(pool(), { accountId: req.account.id, caps: req.capabilities }), now: clock() })
  }))

  router.get('/assignees', wrap(async (req, res) => {
    const kind = req.query.kind === 'submission' ? 'submission' : 'call'
    if (!canSeeKind(req.capabilities, kind)) throw forbidden()
    res.json({ accounts: await assignableAccounts(pool(), kind), me: req.account.id })
  }))

  router.get('/', wrap(async (req, res) => {
    if (req.query.lead != null) {
      const id = idOf(req.query.lead)
      if (!id) throw new ReminderError('invalid_target', 'Invalid lead')
      if (!canSeeKind(req.capabilities, 'submission')) throw forbidden()
      return res.json({ reminders: await listForTargets(pool(), { kind: 'submission', submissionId: id }) })
    }
    if (!canSeeKind(req.capabilities, 'call')) throw forbidden()
    if (req.query.call != null) {
      const id = idOf(req.query.call)
      if (!id) throw new ReminderError('invalid_target', 'Invalid call')
      return res.json({ reminders: await listForTargets(pool(), { kind: 'call', callIds: [id] }) })
    }
    res.json({ reminders: await listForTargets(pool(), { kind: 'call' }) })
  }))

  router.post('/', writes, wrap(async (req, res) => {
    const b = req.body || {}
    const reminder = await createReminder(pool(), {
      target: b.target, dueAt: b.dueAt, assignee: b.assignee, note: b.note, allowDuplicate: b.allowDuplicate === true,
      accountId: req.account.id, caps: req.capabilities, now: clock(),
    })
    res.status(201).json({ reminder })
  }))

  router.patch('/:id(\\d{1,15})', writes, wrap(async (req, res) => {
    const b = req.body || {}
    const pick = (k) => (Object.hasOwn(b, k) ? b[k] : undefined)
    const reminder = await updateReminder(pool(), {
      id: Number(req.params.id), version: b.version, dueAt: pick('dueAt'), assignee: pick('assignee'), note: pick('note'),
      caps: req.capabilities, now: clock(),
    })
    res.json({ reminder })
  }))

  router.post('/:id(\\d{1,15})/complete', writes, wrap(async (req, res) => {
    res.json({ reminder: await completeReminder(pool(), { id: Number(req.params.id), version: req.body?.version, accountId: req.account.id, caps: req.capabilities }) })
  }))

  router.post('/:id(\\d{1,15})/cancel', writes, wrap(async (req, res) => {
    res.json({ reminder: await cancelReminder(pool(), { id: Number(req.params.id), version: req.body?.version, accountId: req.account.id, caps: req.capabilities }) })
  }))

  router.post('/:id(\\d{1,15})/snooze', writes, wrap(async (req, res) => {
    const b = req.body || {}
    res.json({ reminder: await snoozeReminder(pool(), { id: Number(req.params.id), version: b.version, minutes: b.minutes, until: b.until, caps: req.capabilities, now: clock() }) })
  }))

  // One reminder, for a link from the email that lands somewhere it is not listed.
  router.get('/:id(\\d{1,15})', wrap(async (req, res) => {
    const r = await getReminder(pool(), Number(req.params.id))
    if (!r || !canSeeKind(req.capabilities, r.target.kind)) throw new ReminderError('not_found', 'Reminder not found', 404)
    res.json({ reminder: r })
  }))

  return router
}

export default createRemindersRouter
