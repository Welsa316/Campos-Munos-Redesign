// Capability gate (server/auth/capabilities.js). Runs after requireAuth,
// which loads req.capabilities from the database. With several names the
// account needs every one of them.
import { isCapability } from '../auth/capabilities.js'

export default function requireCapability(...names) {
  // A misspelt capability would deny everyone forever; fail at boot instead.
  for (const n of names) {
    if (!isCapability(n)) throw new Error(`Unknown capability: ${n}`)
  }
  return (req, res, next) => {
    const have = req.capabilities
    if (!have || !names.every((n) => have.has(n))) {
      return res.status(403).json({ error: 'Your account cannot perform this action', code: 'forbidden' })
    }
    next()
  }
}

/** True when the signed-in account has the capability (for shaping a response). */
export const can = (req, name) => Boolean(req.capabilities?.has(name))
