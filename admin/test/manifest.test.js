// The portal can be installed as its own app (so its notifications carry its
// name and icon, not the browser's): the manifest must be linked, name the
// app, open standalone, and point at icons that exist at the sizes it says.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(fs.readFileSync(join(ROOT, 'public', 'manifest.webmanifest'), 'utf8'))
const pngSize = (file) => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)] }

test('the page links the manifest', () => {
  assert.match(fs.readFileSync(join(ROOT, 'index.html'), 'utf8'), /<link rel="manifest" href="%BASE_URL%manifest\.webmanifest"/)
})

test('the app has the firm’s name and opens in its own window', () => {
  assert.equal(manifest.short_name, 'Campos Muños')
  assert.match(manifest.name, /Campos Muños/)
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
})

test('icons exist at 192 and 512 pixels, as the manifest says', () => {
  const sizes = manifest.icons.map((i) => i.sizes)
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'installable needs both')
  for (const icon of manifest.icons) {
    const file = join(ROOT, 'public', icon.src)
    assert.ok(fs.existsSync(file), `${icon.src} exists`)
    assert.equal(pngSize(file).join('x'), icon.sizes, `${icon.src} is ${icon.sizes}`)
  }
})
