// Staff accounts: the rules for creating and changing them, shared by the
// portal's Team tab (routes/team.js, team.manage) and scripts/staff.js so
// both refuse the same things (docs/staff-accounts.md).
//
// Every change is audited with who made it. A change that should end open
// sessions (password, revoked access, sign-out) bumps token_version, which
// requireAuth checks on every request.
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { ADMIN_ONLY, ROLES, ROLE_NAMES, resolveCapabilities, isCapability, isRole } from './capabilities.js'
import { audit } from '../billing/audit.js'
import { avatarFor } from './avatars.js'

export class TeamError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

// bcrypt reads only the first 72 bytes of a password.
export const PASSWORD_MAX_BYTES = 72

export function generatePassword() {
  // 18 random bytes → 24 URL-safe characters.
  return crypto.randomBytes(18).toString('base64url')
}

/** One account as the Team tab shows it. Never the password hash. */
export function accountJson(row) {
  const grants = row.capability_grants || []
  const revokes = row.capability_revokes || []
  return {
    id: row.id,
    email: row.email,
    displayName: (row.display_name && String(row.display_name).trim()) || null,
    role: row.role,
    roleLabel: ROLES[row.role]?.label ?? row.role,
    disabled: Boolean(row.disabled_at),
    disabledAt: row.disabled_at ?? null,
    grants,
    revokes,
    capabilities: [...resolveCapabilities({ role: row.role, grants, revokes })].sort(),
    createdAt: row.created_at ?? null,
    passwordUpdatedAt: row.password_updated_at ?? null,
    lastActiveAt: row.last_active_at ?? null,
    avatar: avatarFor(row),
    // The RingCentral extension that is this person (call log names).
    rcExtensionId: row.rc_extension_id ?? null,
  }
}

export async function listAccounts(db) {
  const { rows } = await db.query(
    `SELECT u.*, (SELECT MAX(a.created_at) FROM staff_activity a WHERE a.actor_id = u.id AND a.outcome = 'ok') AS last_active_at
       FROM admin_users u ORDER BY u.disabled_at IS NOT NULL, u.id`
  )
  return rows
}

export async function findAccount(db, { id, email }) {
  const row = id != null
    ? (await db.query('SELECT * FROM admin_users WHERE id = $1', [id])).rows[0]
    : (await db.query('SELECT * FROM admin_users WHERE LOWER(email) = LOWER($1)', [email])).rows[0]
  if (!row) throw new TeamError(id != null ? 'No such account' : `No account with email ${email}`, 404)
  return row
}

// Someone must always be able to administer.
async function otherEnabledAdmins(db, userId) {
  return (await db.query("SELECT COUNT(*)::int AS n FROM admin_users WHERE role = 'admin' AND disabled_at IS NULL AND id <> $1", [userId])).rows[0].n
}

// From the portal, nobody changes their own role or access: one wrong click
// would lock them out with nobody left to undo it.
function notSelf(actor, row, what) {
  if (actor?.via === 'portal' && actor.id === row.id) throw new TeamError(`You can't ${what} your own account here.`, 409)
}

const auditFor = (actor) => (db, row, action, details = {}) => audit(db, {
  actorId: actor?.via === 'portal' ? actor.id : null,
  action, entityType: 'admin_user', entityId: row.id,
  details: actor?.via === 'cli' ? { via: 'scripts/staff.js', osUser: actor.osUser ?? null, ...details } : details,
})

export async function createAccount(db, { email, name, role, password }, actor) {
  email = String(email || '').trim().toLowerCase()
  if (!isRole(role)) throw new TeamError(`Unknown role ${role}. Roles: ${ROLE_NAMES.join(', ')}`)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 255) throw new TeamError('That is not an email address')
  const displayName = name == null ? null : String(name).trim() || null
  if (displayName && displayName.length > 60) throw new TeamError('Name: up to 60 characters')
  const exists = (await db.query('SELECT 1 FROM admin_users WHERE LOWER(email) = LOWER($1)', [email])).rowCount
  if (exists) throw new TeamError(`An account with ${email} already exists.`, 409)
  const generated = password == null
  const pw = generated ? generatePassword() : password
  const hash = await bcrypt.hash(pw, 12)
  const row = (await db.query(
    'INSERT INTO admin_users (email, password_hash, role, display_name, password_updated_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
    [email, hash, role, displayName]
  )).rows[0]
  await auditFor(actor)(db, row, 'staff.created', { role })
  return { row, password: generated ? pw : null }
}

export async function setRole(db, row, role, actor) {
  if (!isRole(role)) throw new TeamError(`Unknown role ${role}. Roles: ${ROLE_NAMES.join(', ')}`)
  notSelf(actor, row, 'change the role of')
  if (row.role === 'admin' && role !== 'admin' && !row.disabled_at && (await otherEnabledAdmins(db, row.id)) === 0) {
    throw new TeamError('That is the last enabled administrator; make another account an administrator first.', 409)
  }
  const updated = (await db.query('UPDATE admin_users SET role = $2 WHERE id = $1 RETURNING *', [row.id, role])).rows[0]
  await auditFor(actor)(db, row, 'staff.role_changed', { from: row.role, to: role })
  return updated
}

/** state: 'grant' | 'revoke' | 'default' (back to what the role gives). */
export async function setCapability(db, row, capability, state, actor) {
  if (!isCapability(capability)) throw new TeamError(`Unknown capability ${capability}. `)
  if (!['grant', 'revoke', 'default'].includes(state)) throw new TeamError('state must be grant, revoke or default')
  // resolveCapabilities ignores such a grant anyway; refusing it keeps the
  // account list from suggesting otherwise.
  if (state === 'grant' && ADMIN_ONLY.includes(capability)) {
    throw new TeamError(`${capability} belongs to the admin role only and cannot be granted to one account; only administrators have it.`)
  }
  if (state === 'revoke') notSelf(actor, row, 'remove permissions from')
  // A grant cancels an earlier revoke of the same capability and the other
  // way round, so the two lists never disagree.
  const sql = state === 'default'
    ? 'UPDATE admin_users SET capability_grants = array_remove(capability_grants, $2::text), capability_revokes = array_remove(capability_revokes, $2::text) WHERE id = $1 RETURNING *'
    : (() => {
        const [add, remove] = state === 'grant' ? ['capability_grants', 'capability_revokes'] : ['capability_revokes', 'capability_grants']
        return `UPDATE admin_users SET ${add} = ARRAY(SELECT DISTINCT unnest(array_append(${add}, $2::text))),
                                       ${remove} = array_remove(${remove}, $2::text)
                 WHERE id = $1 RETURNING *`
      })()
  const updated = (await db.query(sql, [row.id, capability])).rows[0]
  const action = { grant: 'staff.capability_granted', revoke: 'staff.capability_revoked', default: 'staff.capability_reset' }[state]
  await auditFor(actor)(db, row, action, { capability })
  return updated
}

export async function clearOverrides(db, row, actor) {
  const updated = (await db.query("UPDATE admin_users SET capability_grants = '{}', capability_revokes = '{}' WHERE id = $1 RETURNING *", [row.id])).rows[0]
  await auditFor(actor)(db, row, 'staff.overrides_cleared')
  return updated
}

export async function setName(db, row, name, actor) {
  const n = String(name ?? '').trim()
  if (!n) throw new TeamError('Name is required')
  if (n.length > 60) throw new TeamError('Name: up to 60 characters')
  const updated = (await db.query('UPDATE admin_users SET display_name = $2 WHERE id = $1 RETURNING *', [row.id, n])).rows[0]
  await auditFor(actor)(db, row, 'staff.renamed')
  return updated
}

/**
 * Link the account to the RingCentral extension that is this person, or
 * unlink it (null). The extension must be in the stored extension directory;
 * one account per extension.
 */
export async function setExtension(db, row, extensionId, actor) {
  const id = extensionId == null || extensionId === '' ? null : String(extensionId).trim()
  if (id !== null) {
    if (!/^\d{1,20}$/.test(id)) throw new TeamError('Choose an extension from the list')
    const ext = (await db.query('SELECT id FROM rc_extensions WHERE id = $1', [id])).rows[0]
    if (!ext) throw new TeamError('That extension is not in RingCentral’s extension list', 404)
    const taken = (await db.query('SELECT email FROM admin_users WHERE rc_extension_id = $1 AND id <> $2', [id, row.id])).rows[0]
    if (taken) throw new TeamError(`That extension is already linked to ${taken.email}`, 409)
  }
  const updated = (await db.query('UPDATE admin_users SET rc_extension_id = $2 WHERE id = $1 RETURNING *', [row.id, id])).rows[0]
  await auditFor(actor)(db, row, 'staff.extension_linked', { extensionId: id })
  return updated
}

export async function setDisabled(db, row, disabled, actor) {
  if (disabled) {
    notSelf(actor, row, 'revoke access for')
    if (row.role === 'admin' && (await otherEnabledAdmins(db, row.id)) === 0) {
      throw new TeamError('That is the last enabled administrator; enable or create another first.', 409)
    }
  }
  const updated = (await db.query(
    disabled
      ? 'UPDATE admin_users SET disabled_at = NOW(), token_version = token_version + 1 WHERE id = $1 RETURNING *'
      : 'UPDATE admin_users SET disabled_at = NULL WHERE id = $1 RETURNING *',
    [row.id]
  )).rows[0]
  await auditFor(actor)(db, row, disabled ? 'staff.disabled' : 'staff.enabled')
  return updated
}

export async function signOutEverywhere(db, row, actor) {
  notSelf(actor, row, 'sign out')
  await db.query('UPDATE admin_users SET token_version = token_version + 1 WHERE id = $1', [row.id])
  await auditFor(actor)(db, row, 'staff.signed_out')
}

/** Returns the new password when one was generated (shown once). */
export async function resetPassword(db, row, password, actor) {
  notSelf(actor, row, 'reset the password of (use the Password button)')
  const generated = password == null
  const pw = generated ? generatePassword() : password
  const hash = await bcrypt.hash(pw, 12)
  await db.query('UPDATE admin_users SET password_hash = $2, password_updated_at = NOW(), token_version = token_version + 1 WHERE id = $1', [row.id, hash])
  await auditFor(actor)(db, row, 'staff.password_reset')
  return generated ? pw : null
}
