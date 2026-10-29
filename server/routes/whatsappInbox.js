// /api/whatsapp — the shared WhatsApp inbox (server/whatsapp/inbox.js).
//
// Reading needs whatsapp.view; replying whatsapp.send; assigning, notes and
// closing whatsapp.manage. Payment status beside a conversation is included
// only for accounts with billing.status. The webhook that receives messages
// is a separate router (routes/whatsapp.js) at /webhooks/whatsapp.
import { Router } from 'express'
import { param } from 'express-validator'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import requireCapability, { can } from '../middleware/requireCapability.js'
import validate from '../middleware/validate.js'
import { createWhatsAppProvider, whatsappSendingEnabled, whatsappProviderMode } from '../billing/providers/whatsapp/index.js'
import {
  listConversations, getConversation, sendReply, addNote, assign, setStatus, listAssignees, InboxError,
} from '../whatsapp/inbox.js'

const idParam = param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid id')

export function createWhatsappInboxRouter({ db = null, env = process.env, whatsappProvider = null, now = () => new Date() } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  const need = requireCapability

  // One sender per process. Created on first use so a misconfigured
  // provider only affects sending, never reading.
  let provider = whatsappProvider
  const getProvider = () => {
    if (provider) return provider
    try {
      provider = createWhatsAppProvider(env)
    } catch (err) {
      throw new InboxError(`WhatsApp is misconfigured: ${err.message}`, 503, 'whatsapp_config')
    }
    return provider
  }

  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof InboxError) return res.status(err.status).json({ error: err.message, code: err.code })
      req.log?.error({ err }, 'WhatsApp inbox route error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  router.use(requireAuth)

  router.get('/status', need('whatsapp.view'), wrap(async (_req, res) => {
    let mode = null
    try { mode = whatsappProviderMode(env) } catch { /* reported as null */ }
    res.json({ mode, sendingEnabled: whatsappSendingEnabled(env) })
  }))

  router.get('/assignees', need('whatsapp.view'), wrap(async (_req, res) => {
    res.json(await listAssignees(pool()))
  }))

  router.get('/conversations', need('whatsapp.view'), wrap(async (req, res) => {
    res.json(await listConversations(pool(), { view: String(req.query.view || 'open'), accountId: req.account.id }))
  }))

  router.get('/conversations/:id', need('whatsapp.view'), idParam, validate, wrap(async (req, res) => {
    res.json(await getConversation(pool(), Number(req.params.id), { canSeeBilling: can(req, 'billing.status'), env, now: now() }))
  }))

  router.post('/conversations/:id/messages', need('whatsapp.send'), idParam, validate, wrap(async (req, res) => {
    const result = await sendReply(pool(), getProvider(), {
      conversationId: Number(req.params.id), body: req.body?.body, clientKey: req.body?.clientKey,
      account: req.account, env, now: now(), log: req.log,
    })
    res.status(result.duplicate ? 200 : 201).json(result)
  }))

  router.post('/conversations/:id/notes', need('whatsapp.manage'), idParam, validate, wrap(async (req, res) => {
    res.status(201).json(await addNote(pool(), Number(req.params.id), req.body?.body, { account: req.account }))
  }))

  router.put('/conversations/:id/assignee', need('whatsapp.manage'), idParam, validate, wrap(async (req, res) => {
    const raw = req.body?.accountId
    const assigneeId = raw == null ? null : Number(raw)
    if (assigneeId != null && !(Number.isInteger(assigneeId) && assigneeId > 0)) throw new InboxError('Invalid account')
    await assign(pool(), Number(req.params.id), assigneeId, { account: req.account })
    res.json({ ok: true })
  }))

  router.put('/conversations/:id/status', need('whatsapp.manage'), idParam, validate, wrap(async (req, res) => {
    await setStatus(pool(), Number(req.params.id), req.body?.status, { account: req.account })
    res.json({ ok: true })
  }))

  return router
}

export default createWhatsappInboxRouter
