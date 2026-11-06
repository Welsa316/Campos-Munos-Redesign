// Production hardening must not depend on NODE_ENV alone: Railway's own
// environment name counts too. The seed's 'changeme' admin exists only for
// development and tests (that part needs TEST_DATABASE_URL; own database
// <name>_seed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync, execFileSync } from 'child_process'
import pg from 'pg'
import bcrypt from 'bcrypt'
import { isProductionEnv, bootEnvProblems } from './utils/productionEnv.js'
import { resolveOrigins, sessionCookieOptions } from './httpSecurity.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STRONG = 'a-strong-random-secret-0123456789abcdef'

test('production is NODE_ENV or either of Railway’s environment names', () => {
  assert.equal(isProductionEnv({ NODE_ENV: 'production' }), true)
  assert.equal(isProductionEnv({ RAILWAY_ENVIRONMENT: 'production' }), true)
  assert.equal(isProductionEnv({ RAILWAY_ENVIRONMENT_NAME: 'production', NODE_ENV: 'development' }), true)
  assert.equal(isProductionEnv({ RAILWAY_ENVIRONMENT_NAME: 'staging' }), false)
  assert.equal(isProductionEnv({ NODE_ENV: 'test' }), false)
  assert.equal(isProductionEnv({}), false)
})

test('Railway production without NODE_ENV keeps Secure cookies and closed CORS', () => {
  const env = { RAILWAY_ENVIRONMENT: 'production' }
  assert.equal(sessionCookieOptions(env).secure, true)
  assert.equal(resolveOrigins(env).openDev, false)
})

test('open CORS only when NODE_ENV is development and nothing is configured', () => {
  assert.equal(resolveOrigins({ NODE_ENV: 'development' }).openDev, true)
  assert.equal(resolveOrigins({ NODE_ENV: 'development', ADMIN_ORIGINS: 'http://localhost:5175' }).openDev, false)
  assert.equal(resolveOrigins({ NODE_ENV: 'development', RAILWAY_ENVIRONMENT_NAME: 'production' }).openDev, false)
  assert.equal(resolveOrigins({ NODE_ENV: 'test' }).openDev, false)
  assert.equal(resolveOrigins({}).openDev, false, 'an unset NODE_ENV is not development')
})

test('boot: missing production settings are fatal under NODE_ENV=production, a warning when only Railway says so', () => {
  const strict = bootEnvProblems({ NODE_ENV: 'production' })
  assert.equal(strict.fatal.length, 1)
  assert.match(strict.fatal[0], /JWT_SECRET, DATABASE_URL, ADMIN_ORIGINS/)

  const railway = bootEnvProblems({ RAILWAY_ENVIRONMENT: 'production', JWT_SECRET: 'short' })
  assert.deepEqual(railway.fatal, [], 'never exits on Railway’s word alone')
  assert.ok(railway.warn.some((w) => /NODE_ENV is not set/.test(w)))
  assert.ok(railway.warn.some((w) => /Missing required env vars in production: DATABASE_URL/.test(w)))
  assert.ok(railway.warn.some((w) => /JWT_SECRET is too short/.test(w)))

  const ok = bootEnvProblems({ NODE_ENV: 'production', JWT_SECRET: STRONG, DATABASE_URL: 'postgres://u:p@postgres.railway.internal:5432/railway', ADMIN_ORIGINS: 'https://admin.camulaw.com' })
  assert.deepEqual(ok, { fatal: [], warn: [] })
})

test('boot: production warns, never stops, on unverified Postgres TLS and a derived RingCentral key', () => {
  const base = { NODE_ENV: 'production', JWT_SECRET: STRONG, ADMIN_ORIGINS: 'https://admin.camulaw.com' }
  const publicDb = bootEnvProblems({ ...base, DATABASE_URL: 'postgres://u:p@roundhouse.proxy.rlwy.net:41234/railway' })
  assert.deepEqual(publicDb.fatal, [])
  assert.ok(publicDb.warn.some((w) => /Postgres TLS .* not verified/.test(w)), publicDb.warn.join(' | '))
  assert.deepEqual(bootEnvProblems({ ...base, DATABASE_URL: 'postgres://u:p@roundhouse.proxy.rlwy.net:41234/railway', PG_CA_CERT: '-----BEGIN CERTIFICATE-----' }).warn, [], 'with the CA it is verified')
  assert.deepEqual(bootEnvProblems({ ...base, NODE_ENV: 'development', DATABASE_URL: 'postgres://localhost/x' }).warn, [], 'no TLS outside production')

  const db = { DATABASE_URL: 'postgres://u:p@postgres.railway.internal:5432/railway' }
  const derived = bootEnvProblems({ ...base, ...db, RINGCENTRAL_CLIENT_SECRET: 'rc-secret' })
  assert.deepEqual(derived.fatal, [], 'the saved connection must stay readable')
  assert.ok(derived.warn.some((w) => /derived from RINGCENTRAL_CLIENT_SECRET/.test(w)))
  assert.deepEqual(bootEnvProblems({ ...base, ...db, RINGCENTRAL_CLIENT_SECRET: 'rc-secret', RINGCENTRAL_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64) }).warn, [])
  assert.deepEqual(bootEnvProblems({ NODE_ENV: 'test', RINGCENTRAL_CLIENT_SECRET: 'rc-secret' }).warn, [], 'only production')
})

test('boot: a weak JWT_SECRET is reported in any environment; fatal only in production', () => {
  assert.match(bootEnvProblems({ NODE_ENV: 'development', JWT_SECRET: 'changeme-please-0123456789abcdef0123' }).warn[0], /placeholder/)
  assert.deepEqual(bootEnvProblems({ NODE_ENV: 'development', JWT_SECRET: 'short' }).fatal, [])
  assert.equal(bootEnvProblems({ NODE_ENV: 'production', JWT_SECRET: 'short', DATABASE_URL: 'x', FRONTEND_URL: 'https://x' }).fatal.length, 1)
  assert.deepEqual(bootEnvProblems({ NODE_ENV: 'test', JWT_SECRET: STRONG }), { fatal: [], warn: [] })
  assert.deepEqual(bootEnvProblems({ NODE_ENV: 'development' }), { fatal: [], warn: [] }, 'no secret, nothing to check')
})

// --- the seed's admin password --------------------------------------------------

const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_seed`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()

// Every variable the seed reads is passed explicitly (empty means unset), so
// nothing from a developer's server/.env can reach it: dotenv never
// overrides a variable that is already present.
function runSeed(vars) {
  const env = {
    ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent',
    NODE_ENV: '', RAILWAY_ENVIRONMENT: '', RAILWAY_ENVIRONMENT_NAME: '', ADMIN_EMAIL: '', ADMIN_INITIAL_PASSWORD: '',
    ...vars,
  }
  return spawnSync(process.execPath, [join(__dirname, 'db', 'seed.js')], { env, encoding: 'utf8' })
}

test('seed: the changeme admin only for development and tests', { skip: SKIP }, async () => {
  const admin = new pg.Client({ connectionString: BASE_URL })
  await admin.connect()
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME])).rowCount) await admin.query(`CREATE DATABASE "${DB_NAME}"`)
  await admin.end()
  const db = new pg.Client({ connectionString: URL_ })
  await db.connect()
  try {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })
    const admins = async () => (await db.query('SELECT email, password_hash FROM admin_users')).rows
    const reset = () => db.query('TRUNCATE admin_users, submissions RESTART IDENTITY CASCADE')

    for (const vars of [{}, { NODE_ENV: 'staging' }, { RAILWAY_ENVIRONMENT: 'production' }, { RAILWAY_ENVIRONMENT_NAME: 'production', ADMIN_EMAIL: 'office@example.test' }]) {
      await reset()
      const r = runSeed(vars)
      assert.notEqual(r.status, 0, `${JSON.stringify(vars)}: refuses to seed without a password`)
      assert.deepEqual(await admins(), [], `${JSON.stringify(vars)}: no admin created`)
    }

    for (const NODE_ENV of ['development', 'test']) {
      await reset()
      const r = runSeed({ NODE_ENV })
      assert.equal(r.status, 0, r.stderr)
      const [row] = await admins()
      assert.equal(row.email, 'admin@camulaw.com')
      assert.ok(await bcrypt.compare('changeme', row.password_hash), `${NODE_ENV}: the local default`)
    }

    // A real password works anywhere outside production.
    await reset()
    const r = runSeed({ NODE_ENV: 'staging', ADMIN_INITIAL_PASSWORD: 'a-real-password-123' })
    assert.equal(r.status, 0, r.stderr)
    assert.ok(await bcrypt.compare('a-real-password-123', (await admins())[0].password_hash))
  } finally {
    await db.end()
  }
})
