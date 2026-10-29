#!/usr/bin/env node
// Staff accounts, from the command line, by an administrator with database
// access. There is deliberately no screen for this (docs/staff-accounts.md).
//
//   node scripts/staff.js list
//   node scripts/staff.js roles
//   node scripts/staff.js create  --email a@b.com --name Yoletty --role front_desk
//   node scripts/staff.js set-role --email a@b.com --role billing_paralegal
//   node scripts/staff.js grant   --email a@b.com --capability billing.configure
//   node scripts/staff.js revoke  --email a@b.com --capability crm.export
//   node scripts/staff.js clear-overrides --email a@b.com
//   node scripts/staff.js set-name --email a@b.com --name "Yoletty"
//   node scripts/staff.js reset-password --email a@b.com
//   node scripts/staff.js sign-out --email a@b.com
//   node scripts/staff.js disable --email a@b.com   |   enable --email a@b.com
//
// Passwords are never taken on the command line (shell history, process
// lists). create and reset-password generate one and print it once; to choose
// it instead, put it in STAFF_PASSWORD for that one command. Every change is
// written to the audit log, and any change that should end open sessions
// (password, disable, sign-out) bumps token_version.
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import crypto from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

const { default: bcrypt } = await import('bcrypt')
const { default: getPool } = await import('../db/pool.js')
const { CAPABILITIES, ROLES, ROLE_NAMES, resolveCapabilities, isCapability, isRole } = await import('../auth/capabilities.js')

export function parseArgs(argv) {
  const [command, ...rest] = argv
  const opts = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`)
    const key = a.slice(2)
    if (key === 'password') throw new Error('Passwords are not accepted on the command line. Use STAFF_PASSWORD=... for this one command, or let the script generate one.')
    const value = rest[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key} needs a value`)
    opts[key] = value
    i++
  }
  return { command, opts }
}

export function generatePassword() {
  // 18 random bytes → 24 URL-safe characters.
  return crypto.randomBytes(18).toString('base64url')
}

function choosePassword() {
  const given = process.env.STAFF_PASSWORD
  if (given != null) {
    if (given.length < 12) throw new Error('STAFF_PASSWORD must be at least 12 characters')
    return { password: given, generated: false }
  }
  return { password: generatePassword(), generated: true }
}

const need = (opts, key) => {
  if (!opts[key]) throw new Error(`--${key} is required`)
  return opts[key]
}

async function findUser(db, email) {
  const row = (await db.query('SELECT * FROM admin_users WHERE LOWER(email) = LOWER($1)', [email])).rows[0]
  if (!row) throw new Error(`No account with email ${email}`)
  return row
}

async function auditCli(db, userId, action, details = {}) {
  // actor_id NULL: the change came from the command line, not a portal session.
  await db.query(
    `INSERT INTO billing_audit_events (actor_id, action, entity_type, entity_id, details) VALUES (NULL, $1, 'admin_user', $2, $3)`,
    [action, String(userId), JSON.stringify({ via: 'scripts/staff.js', osUser: process.env.USER || process.env.USERNAME || null, ...details })]
  )
}

function describe(row) {
  const caps = resolveCapabilities({ role: row.role, grants: row.capability_grants, revokes: row.capability_revokes })
  const extra = [
    row.capability_grants?.length ? `+${row.capability_grants.join(' +')}` : '',
    row.capability_revokes?.length ? `-${row.capability_revokes.join(' -')}` : '',
  ].filter(Boolean).join(' ')
  return `${row.disabled_at ? '[DISABLED] ' : ''}${row.email}  name=${row.display_name || '-'}  role=${row.role}${extra ? `  overrides: ${extra}` : ''}\n    ${[...caps].sort().join(', ') || '(no capabilities)'}`
}

export async function run(db, command, opts, out = console.log) {
  switch (command) {
    case 'roles': {
      for (const [name, r] of Object.entries(ROLES)) out(`${name} (${r.label}):\n    ${r.capabilities.join(', ')}`)
      out('\nCapabilities:')
      for (const [k, v] of Object.entries(CAPABILITIES)) out(`  ${k.padEnd(20)} ${v}`)
      return
    }
    case 'list': {
      const rows = (await db.query('SELECT * FROM admin_users ORDER BY id')).rows
      for (const r of rows) out(describe(r))
      return
    }
    case 'create': {
      const email = need(opts, 'email').trim().toLowerCase()
      const role = need(opts, 'role')
      if (!isRole(role)) throw new Error(`Unknown role ${role}. Roles: ${ROLE_NAMES.join(', ')}`)
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That is not an email address')
      const exists = (await db.query('SELECT 1 FROM admin_users WHERE LOWER(email) = LOWER($1)', [email])).rowCount
      if (exists) throw new Error(`An account with ${email} already exists. Use set-role or reset-password.`)
      const { password, generated } = choosePassword()
      const hash = await bcrypt.hash(password, 12)
      const row = (await db.query(
        `INSERT INTO admin_users (email, password_hash, role, display_name, password_updated_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
        [email, hash, role, opts.name?.trim() || null]
      )).rows[0]
      await auditCli(db, row.id, 'staff.created', { role })
      out(`Created ${describe(row)}`)
      if (generated) out(`\nTemporary password (shown once; give it to them in person and ask them to change it with the Password button):\n  ${password}\n`)
      return
    }
    case 'set-role': {
      const u = await findUser(db, need(opts, 'email'))
      const role = need(opts, 'role')
      if (!isRole(role)) throw new Error(`Unknown role ${role}. Roles: ${ROLE_NAMES.join(', ')}`)
      const row = (await db.query('UPDATE admin_users SET role = $2 WHERE id = $1 RETURNING *', [u.id, role])).rows[0]
      await auditCli(db, u.id, 'staff.role_changed', { from: u.role, to: role })
      out(describe(row))
      return
    }
    case 'grant':
    case 'revoke': {
      const u = await findUser(db, need(opts, 'email'))
      const cap = need(opts, 'capability')
      if (!isCapability(cap)) throw new Error(`Unknown capability ${cap}. Run "roles" for the list.`)
      // A grant cancels an earlier revoke of the same capability and the
      // other way round, so the two lists never disagree.
      const [add, remove] = command === 'grant' ? ['capability_grants', 'capability_revokes'] : ['capability_revokes', 'capability_grants']
      const row = (await db.query(
        `UPDATE admin_users SET ${add} = ARRAY(SELECT DISTINCT unnest(array_append(${add}, $2::text))),
                                ${remove} = array_remove(${remove}, $2::text)
          WHERE id = $1 RETURNING *`,
        [u.id, cap]
      )).rows[0]
      await auditCli(db, u.id, `staff.capability_${command === 'grant' ? 'granted' : 'revoked'}`, { capability: cap })
      out(describe(row))
      return
    }
    case 'clear-overrides': {
      const u = await findUser(db, need(opts, 'email'))
      const row = (await db.query("UPDATE admin_users SET capability_grants = '{}', capability_revokes = '{}' WHERE id = $1 RETURNING *", [u.id])).rows[0]
      await auditCli(db, u.id, 'staff.overrides_cleared')
      out(describe(row))
      return
    }
    case 'set-name': {
      const u = await findUser(db, need(opts, 'email'))
      const name = need(opts, 'name').trim()
      if (name.length > 60) throw new Error('Name: up to 60 characters')
      const row = (await db.query('UPDATE admin_users SET display_name = $2 WHERE id = $1 RETURNING *', [u.id, name])).rows[0]
      await auditCli(db, u.id, 'staff.renamed')
      out(describe(row))
      return
    }
    case 'reset-password': {
      const u = await findUser(db, need(opts, 'email'))
      const { password, generated } = choosePassword()
      const hash = await bcrypt.hash(password, 12)
      await db.query('UPDATE admin_users SET password_hash = $2, password_updated_at = NOW(), token_version = token_version + 1 WHERE id = $1', [u.id, hash])
      await auditCli(db, u.id, 'staff.password_reset')
      out(`Password reset for ${u.email}; their open sessions are signed out.`)
      if (generated) out(`\nTemporary password (shown once):\n  ${password}\n`)
      return
    }
    case 'sign-out': {
      const u = await findUser(db, need(opts, 'email'))
      await db.query('UPDATE admin_users SET token_version = token_version + 1 WHERE id = $1', [u.id])
      await auditCli(db, u.id, 'staff.signed_out')
      out(`Every open session for ${u.email} is signed out.`)
      return
    }
    case 'disable':
    case 'enable': {
      const u = await findUser(db, need(opts, 'email'))
      if (command === 'disable') {
        const admins = (await db.query("SELECT COUNT(*)::int AS n FROM admin_users WHERE role = 'admin' AND disabled_at IS NULL AND id <> $1", [u.id])).rows[0].n
        if (u.role === 'admin' && admins === 0) throw new Error('That is the last enabled administrator; enable or create another first.')
      }
      const row = (await db.query(
        command === 'disable'
          ? 'UPDATE admin_users SET disabled_at = NOW(), token_version = token_version + 1 WHERE id = $1 RETURNING *'
          : 'UPDATE admin_users SET disabled_at = NULL WHERE id = $1 RETURNING *',
        [u.id]
      )).rows[0]
      await auditCli(db, u.id, `staff.${command}d`)
      out(describe(row))
      return
    }
    default:
      throw new Error(`Unknown command ${command ?? '(none)'}. Commands: list, roles, create, set-role, grant, revoke, clear-overrides, set-name, reset-password, sign-out, disable, enable`)
  }
}

// Run only when executed directly, so tests can import run().
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = getPool()
  try {
    const { command, opts } = parseArgs(process.argv.slice(2))
    try {
      const u = new URL(process.env.DATABASE_URL || '')
      console.error(`Database: ${u.hostname}${u.pathname}`)
    } catch { /* pool.js reports a missing DATABASE_URL */ }
    await run(pool, command, opts)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
