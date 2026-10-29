// Consultation types are listed in four places that must agree: the API
// whitelist, the database CHECK constraint, the public site's form, and the
// staff portal's labels. Since the split the portal keeps its own copy, so this
// is what notices if one drifts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { CONSULTATION_KEYS as SITE_KEYS } from '../site/src/data/consultationTypes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(__dirname, p), 'utf8')

function listAfter(source, anchor) {
  const start = source.indexOf(anchor)
  assert.ok(start >= 0, `could not find ${anchor}`)
  const body = source.slice(start + anchor.length - 1).match(/[[(]([^\])]*)[\])]/)[1]
  return body.split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
}

test('the API whitelist matches the public site form', () => {
  assert.deepEqual(listAfter(read('routes/submissions.js'), 'const CONSULTATION_TYPES ='), SITE_KEYS)
})

test('the database CHECK constraint matches the public site form', () => {
  assert.deepEqual(listAfter(read('db/migrate.js'), 'CHECK (consultation_type IN'), SITE_KEYS)
})

test('the staff portal labels every consultation type, in both languages', async () => {
  // The portal module reads navigator at call time only; importing it in Node is safe.
  const portal = await import('../admin/src/data/consultationTypes.js')
  assert.deepEqual(portal.CONSULTATION_KEYS, SITE_KEYS)
  for (const key of SITE_KEYS) {
    for (const locale of ['en', 'es']) {
      const label = portal.consultationLabel(key, locale)
      assert.ok(label && label !== key, `${key} has no ${locale} label in the portal`)
    }
  }
})
