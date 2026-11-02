#!/usr/bin/env node
// Staff accounts, from the command line, by an administrator with database
// access. The portal's Team tab does the same through the same rules
// (server/auth/team.js); this script is for when nobody can sign in as an
// administrator, and for the first administrator (docs/staff-accounts.md).
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

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

const { default: getPool } = await import('../db/pool.js')
const { CAPABILITIES, ROLES, resolveCapabilities } = await import('../auth/capabilities.js')
const team = await import('../auth/team.js')
const { recordActivity } = await import('../activity/recorder.js')
const { ACTIONS } = await import('../activity/actions.js')

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

export const generatePassword = team.generatePassword

// undefined: let the shared code generate one (and return it to print).
function chosenPassword() {
  const given = process.env.STAFF_PASSWORD
  if (given == null) return undefined
  if (given.length < 12) throw new Error('STAFF_PASSWORD must be at least 12 characters')
  return given
}

const need = (opts, key) => {
  if (!opts[key]) throw new Error(`--${key} is required`)
  return opts[key]
}

const osUser = () => process.env.USER || process.env.USERNAME || null
const CLI = { via: 'cli', get osUser() { return osUser() } }

// The same line the portal's Team tab writes, marked as from the command line.
async function logCli(db, routeKey, row, details = {}) {
  const def = ACTIONS[routeKey]
  await recordActivity(db, {
    actorEmail: osUser() ? `${osUser()} (command line)` : 'command line',
    action: def.key, label: def.label, entityType: 'account', entityId: String(row.id),
    source: 'cli', details: { account: row.email, ...details },
  })
}

function describe(row) {
  const caps = resolveCapabilities({ role: row.role, grants: row.capability_grants, revokes: row.capability_revokes })
  const extra = [
    row.capability_grants?.length ? `+${row.capability_grants.join(' +')}` : '',
    row.capability_revokes?.length ? `-${row.capability_revokes.join(' -')}` : '',
  ].filter(Boolean).join(' ')
  return `${row.disabled_at ? '[DISABLED] ' : ''}${row.email}  name=${row.display_name || '-'}  role=${row.role}${extra ? `  overrides: ${extra}` : ''}\n    ${[...caps].sort().join(', ') || '(no capabilities)'}`
}

const find = (db, opts) => team.findAccount(db, { email: need(opts, 'email') })

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
      const { row, password } = await team.createAccount(db, { email: need(opts, 'email'), name: opts.name, role: need(opts, 'role'), password: chosenPassword() }, CLI)
      await logCli(db, 'POST /api/team', row, { role: row.role })
      out(`Created ${describe(row)}`)
      if (password) out(`\nTemporary password on the next line, shown once. Copy only the password itself; give it to them in person and ask them to change it with the Password button:\n${password}\n`)
      return
    }
    case 'set-role': {
      const u = await find(db, opts)
      const row = await team.setRole(db, u, need(opts, 'role'), CLI)
      await logCli(db, 'PUT /api/team/:id/role', row, { role: row.role })
      out(describe(row))
      return
    }
    case 'grant':
    case 'revoke': {
      const u = await find(db, opts)
      const cap = need(opts, 'capability')
      const row = await team.setCapability(db, u, cap, command, CLI)
      await logCli(db, 'PUT /api/team/:id/capabilities/:capability', row, { capability: cap, state: command })
      out(describe(row))
      return
    }
    case 'clear-overrides': {
      const row = await team.clearOverrides(db, await find(db, opts), CLI)
      await logCli(db, 'POST /api/team/:id/clear-overrides', row)
      out(describe(row))
      return
    }
    case 'set-name': {
      const row = await team.setName(db, await find(db, opts), need(opts, 'name'), CLI)
      await logCli(db, 'PUT /api/team/:id/name', row)
      out(describe(row))
      return
    }
    case 'reset-password': {
      const u = await find(db, opts)
      const password = await team.resetPassword(db, u, chosenPassword(), CLI)
      await logCli(db, 'POST /api/team/:id/reset-password', u)
      out(`Password reset for ${u.email}; their open sessions are signed out.`)
      if (password) out(`\nTemporary password on the next line, shown once. Copy only the password itself:\n${password}\n`)
      return
    }
    case 'sign-out': {
      const u = await find(db, opts)
      await team.signOutEverywhere(db, u, CLI)
      await logCli(db, 'POST /api/team/:id/sign-out', u)
      out(`Every open session for ${u.email} is signed out.`)
      return
    }
    case 'disable':
    case 'enable': {
      const row = await team.setDisabled(db, await find(db, opts), command === 'disable', CLI)
      await logCli(db, `POST /api/team/:id/${command}`, row)
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
