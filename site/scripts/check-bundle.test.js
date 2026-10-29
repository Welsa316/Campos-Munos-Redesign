// The bundle guard must actually catch portal code. Feed it a fake build that
// contains one portal marker and one that does not.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import { join } from 'path'
import { scan, ADMIN_MARKERS } from './check-bundle.js'

function build(files) {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'cm-bundle-'))
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(join(dir, name, '..'), { recursive: true })
    fs.writeFileSync(join(dir, name), text)
  }
  return dir
}

test('a bundle with a portal chunk is flagged', () => {
  const dir = build({
    'index.html': '<html></html>',
    'assets/AdminDashboard-x.js': 'fetch("/api/submissions/export/csv");const t="Client Messages"',
  })
  const { hits } = scan(dir)
  assert.ok(hits.length >= 2, hits.join('\n'))
})

test('a clean public bundle passes', () => {
  const dir = build({ 'index.html': '<html></html>', 'assets/index-x.js': 'fetch("/api/submissions",{method:"POST"})' })
  assert.deepEqual(scan(dir).hits, [])
})

test('markers are specific to the portal (the public form posts to /api/submissions, which is not a marker)', () => {
  assert.ok(!ADMIN_MARKERS.includes('/api/submissions'))
})
