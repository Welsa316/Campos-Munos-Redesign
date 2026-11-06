// The error path the API routers share. Wrap an async handler with
// route(label, { errors }):
//
//   const wrap = route('Reminder error', { errors: [ReminderError] })
//   router.post('/', wrap(async (req, res) => { ... }))
//
// A thrown instance of one of `errors` (a domain error carrying .status and
// .code, and optionally .extra) answers with that status and
// { error, code, ...extra }. Anything else is logged under `label` and
// answers 500 without detail. brief: log only the error's name and code,
// for routers whose errors could carry something that must not reach the
// logs (a push endpoint, a token).
export function route(label, { errors = [], brief = false } = {}) {
  return (fn) => async (req, res, next) => {
    try {
      await fn(req, res, next)
    } catch (err) {
      if (errors.some((E) => err instanceof E)) {
        return res.status(err.status || 400).json({ error: err.message, code: err.code, ...(err.extra || {}) })
      }
      req.log?.error({ err: brief ? { name: err?.name, code: err?.code } : err }, label)
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
    }
  }
}

export default route
