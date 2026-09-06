// The lead pipeline is defined in three places that must agree: the API
// whitelist, the database CHECK constraint, and the admin UI. They drifted
// once already — the CHECK constraint was wrapped in an IF NOT EXISTS guard
// keyed on its own name, so widening the list could never reach a database
// that already had it. Adding a status passed locally and would have been
// rejected in production.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { LEAD_STATUSES as API_STATUSES } from './routes/submissions.js'
import { STATUS_KEYS as UI_STATUSES } from '../site/src/data/leadStatuses.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(join(__dirname, 'db', 'migrate.js'), 'utf8')

function constraintStatuses() {
  const m = migration.match(
    /ADD CONSTRAINT submissions_status_chk\s*\n?\s*CHECK \(status IN \(([^)]*)\)\)/
  )
  assert.ok(m, 'could not find the submissions_status_chk definition in migrate.js')
  return m[1].split(',').map(v => v.trim().replace(/^'|'$/g, ''))
}

test('the API whitelist and the admin UI list the same statuses, in the same order', () => {
  assert.deepEqual(API_STATUSES, UI_STATUSES)
})

test('the database CHECK constraint accepts exactly the statuses the API allows', () => {
  assert.deepEqual(constraintStatuses(), API_STATUSES)
})

test('the status constraint is recreated, not guarded by IF NOT EXISTS', () => {
  // A name-keyed guard makes the constraint permanently un-widenable on any
  // database that already has it, which is silent in dev and fatal in prod.
  assert.match(
    migration,
    /ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_chk;/,
    'submissions_status_chk must be dropped before being re-added'
  )
  const guarded = /conname = 'submissions_status_chk'/.test(migration)
  assert.equal(guarded, false, 'submissions_status_chk must not sit behind an IF NOT EXISTS name check')
})

test('every status key is snake_case, so it survives the URL and the CHECK list', () => {
  for (const key of API_STATUSES) assert.match(key, /^[a-z]+(_[a-z]+)*$/, `bad key: ${key}`)
})
