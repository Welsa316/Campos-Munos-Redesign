// Contacts (server/contacts/contacts.js): a caller's history across Calls
// and the website inbox, internal call notes, and staff decisions about
// which website leads share a number with the same person.
//
//   GET    /api/contacts/history?callId=|submissionId=&cursor=&limit=
//                                     cursor: the page's `next`; the older
//                                     before=<an event's at> still works
//   PUT    /api/contacts/matches      { callId | submissionId, lead, state }
//   GET    /api/contacts/notes?callId=
//   POST   /api/contacts/notes        { callId, body }
//   PATCH  /api/contacts/notes/:id    { body }
//   DELETE /api/contacts/notes/:id
//
// The number is always read from the call or lead the request names, never
// taken from the client, and each kind of history entry is shown only to an
// account that may open its section.
import { Router } from 'express'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import { can, requireAnyCapability as any } from '../middleware/requireCapability.js'
import { route } from '../middleware/route.js'
import { accountLimiter } from '../middleware/accountLimiter.js'
import { contactHistory, contactMatches, decideMatch, listCallNotes, addCallNote, changeCallNote, ContactError } from '../contacts/contacts.js'

const ID = /^\d{1,15}$/

// Note writes and match decisions per account in ten minutes (the portal
// sends one decision per lead of a person, so a few at once is normal).
export const CONTACT_WRITES_PER_10_MIN = 120

export function createContactsRouter({ db = null, writeLimit = CONTACT_WRITES_PER_10_MIN } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  router.use(requireAuth)
  const writes = accountLimiter({
    name: 'contact-writes', windowMs: 10 * 60 * 1000, max: writeLimit,
    error: 'Too many changes in a few minutes. Wait a moment and try again.', code: 'too_many_changes',
  })

  const wrap = route('Contacts error', { errors: [ContactError] })

  // The number behind a call (calls.view) or a website lead (crm.view).
  async function keyFor(req, { callId, submissionId }) {
    if (callId != null && callId !== '') {
      if (!ID.test(String(callId))) throw new ContactError('not_found', 'Call not found', 404)
      if (!can(req, 'calls.view')) throw new ContactError('forbidden', 'Your account cannot perform this action', 403)
      const r = (await pool().query('SELECT counterpart_key FROM rc_calls WHERE id = $1', [callId])).rows[0]
      if (!r) throw new ContactError('not_found', 'Call not found', 404)
      return r.counterpart_key || ''
    }
    if (submissionId != null && submissionId !== '') {
      if (!ID.test(String(submissionId))) throw new ContactError('not_found', 'Lead not found', 404)
      if (!can(req, 'crm.view')) throw new ContactError('forbidden', 'Your account cannot perform this action', 403)
      const r = (await pool().query('SELECT cm_phone_key(phone) AS key FROM submissions WHERE id = $1', [submissionId])).rows[0]
      if (!r) throw new ContactError('not_found', 'Lead not found', 404)
      return r.key || ''
    }
    throw new ContactError('missing_contact', 'Name a call or a lead')
  }

  router.get('/history', any('calls.view', 'crm.view'), wrap(async (req, res) => {
    const key = await keyFor(req, req.query)
    const before = typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? req.query.before : null
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null
    const [page, matches] = await Promise.all([
      contactHistory(pool(), { key, can: (n) => can(req, n), cursor, before, limit: req.query.limit }),
      can(req, 'crm.view') ? contactMatches(pool(), { key }) : [],
    ])
    res.json({ hasNumber: Boolean(key), ...page, matches })
  }))

  // "Same person" / "someone else" / undecided, for a lead sharing the number.
  router.put('/matches', any('calls.exclude', 'crm.manage'), writes, wrap(async (req, res) => {
    const b = req.body || {}
    if (!can(req, 'crm.view')) throw new ContactError('forbidden', 'Your account cannot perform this action', 403)
    const key = await keyFor(req, { callId: b.callId, submissionId: b.submissionId })
    if (!key) throw new ContactError('no_number', 'This contact has no number to match on')
    if (!ID.test(String(b.lead ?? ''))) throw new ContactError('not_found', 'Lead not found', 404)
    res.json(await decideMatch(pool(), { key, submissionId: Number(b.lead), state: b.state, accountId: req.account.id }))
  }))

  router.get('/notes', any('calls.view'), wrap(async (req, res) => {
    if (!ID.test(String(req.query.callId ?? ''))) throw new ContactError('not_found', 'Call not found', 404)
    res.json({ notes: await listCallNotes(pool(), { callId: Number(req.query.callId), accountId: req.account.id }) })
  }))

  router.post('/notes', any('calls.exclude'), writes, wrap(async (req, res) => {
    const b = req.body || {}
    if (!ID.test(String(b.callId ?? ''))) throw new ContactError('not_found', 'Call not found', 404)
    const note = await addCallNote(pool(), { callId: Number(b.callId), body: b.body, accountId: req.account.id })
    res.status(201).json({ ...note, author: req.account.name || null })
  }))

  router.patch('/notes/:id(\\d{1,15})', any('calls.exclude'), writes, wrap(async (req, res) => {
    res.json(await changeCallNote(pool(), { noteId: Number(req.params.id), body: req.body?.body, accountId: req.account.id }))
  }))

  router.delete('/notes/:id(\\d{1,15})', any('calls.exclude', 'team.manage'), writes, wrap(async (req, res) => {
    await changeCallNote(pool(), { noteId: Number(req.params.id), accountId: req.account.id, remove: true, mayDeleteAny: can(req, 'team.manage') })
    res.json({ ok: true })
  }))

  return router
}
