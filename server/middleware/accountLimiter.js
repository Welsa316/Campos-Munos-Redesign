// A rate limit per signed-in account (mounted after requireAuth), for
// requests a slip or a script could repeat. The key is the account, never
// the address, so colleagues behind the office's one IP never share a
// budget. In memory, per process: a ceiling against floods, not a quota.
import rateLimit from 'express-rate-limit'

export function accountLimiter({ name, windowMs, max, error, code = 'rate_limited' }) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => `${name}:${req.account?.id}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error, code },
  })
}

export default accountLimiter
