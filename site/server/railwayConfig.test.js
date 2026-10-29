// The live Railway service runs with Root Directory = site/ and auto-loads a
// railway.json there. A per-service config with that name once replaced the
// live service's start command and took the API down. Keep the per-service
// configs under a name Railway never auto-loads.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('no app directory carries an auto-loaded railway.json or railway.toml', () => {
  for (const dir of ['', 'site', 'admin', 'server']) {
    for (const name of ['railway.json', 'railway.toml']) {
      assert.ok(!fs.existsSync(join(ROOT, dir, name)), `${join(dir || '.', name)} would be auto-loaded by Railway`)
    }
  }
})
