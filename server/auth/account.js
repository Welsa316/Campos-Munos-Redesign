// One staff account as the API sees it, read fresh from the database on every
// request so a role change, a revoked capability or a disabled account takes
// effect on the next click rather than when the 8-hour token expires.
import { resolveCapabilities, ROLES } from './capabilities.js'
import { avatarFor } from './avatars.js'
import { themeFor } from './themes.js'

export async function loadAccount(db, id) {
  const { rows } = await db.query(
    `SELECT id, email, display_name, role, token_version, capability_grants, capability_revokes, disabled_at, avatar, avatar_bg, theme
       FROM admin_users WHERE id = $1`,
    [id]
  )
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    email: r.email,
    name: displayName(r),
    // Only what was set with staff.js set-name; null when none (name above
    // then falls back to the email's first part).
    displayName: (r.display_name && String(r.display_name).trim()) || null,
    role: r.role,
    tokenVersion: r.token_version,
    disabled: Boolean(r.disabled_at),
    avatar: avatarFor(r),
    theme: themeFor(r.theme),
    capabilities: capsOfRow(r),
  }
}

/** The capabilities an admin_users row (role, capability_grants, capability_revokes) resolves to. */
export const capsOfRow = (r) => resolveCapabilities({ role: r.role, grants: r.capability_grants, revokes: r.capability_revokes })

/**
 * Active accounts holding a capability: their ids, or the rows themselves
 * (id, email, display_name) with { rows: true }, in name order.
 */
export async function accountsWith(db, capability, { rows: wantRows = false } = {}) {
  const rows = (await db.query(
    `SELECT id, email, display_name, role, capability_grants, capability_revokes FROM admin_users
      WHERE disabled_at IS NULL ORDER BY COALESCE(NULLIF(TRIM(display_name), ''), email), id`
  )).rows.filter((r) => capsOfRow(r).has(capability))
  return wantRows ? rows : rows.map((r) => Number(r.id))
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
    displayName: account.displayName,
    role: account.role,
    roleLabel: ROLES[account.role]?.label ?? account.role,
    capabilities: [...account.capabilities].sort(),
    avatar: account.avatar,
    theme: account.theme,
  }
}

export default { loadAccount, displayName, tokenMatches, profileJson, capsOfRow, accountsWith }
