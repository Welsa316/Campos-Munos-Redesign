// One staff account as the API sees it, read fresh from the database on every
// request so a role change, a revoked capability or a disabled account takes
// effect on the next click rather than when the 8-hour token expires.
import { resolveCapabilities, ROLES } from './capabilities.js'

export async function loadAccount(db, id) {
  const { rows } = await db.query(
    `SELECT id, email, display_name, role, token_version, capability_grants, capability_revokes, disabled_at
       FROM admin_users WHERE id = $1`,
    [id]
  )
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    email: r.email,
    name: displayName(r),
    role: r.role,
    tokenVersion: r.token_version,
    disabled: Boolean(r.disabled_at),
    capabilities: resolveCapabilities({ role: r.role, grants: r.capability_grants, revokes: r.capability_revokes }),
  }
}

/** The name colleagues see beside a message or note: "Yoletty", else the email's first part. */
export function displayName({ display_name: name, email }) {
  return (name && String(name).trim()) || String(email || '').split('@')[0] || 'Staff'
}

/**
 * Tokens issued before token_version existed carry no `tv` claim; they count
 * as version 1, the column default. A password change bumps the version and
 * ends every older session.
 */
export function tokenMatches(decoded, account) {
  const tv = typeof decoded?.tv === 'number' ? decoded.tv : 1
  return tv === account.tokenVersion
}

/** What the portal needs to draw its navigation. */
export function profileJson(account) {
  return {
    authenticated: true,
    email: account.email,
    name: account.name,
    role: account.role,
    roleLabel: ROLES[account.role]?.label ?? account.role,
    capabilities: [...account.capabilities].sort(),
  }
}

export default { loadAccount, displayName, tokenMatches, profileJson }
