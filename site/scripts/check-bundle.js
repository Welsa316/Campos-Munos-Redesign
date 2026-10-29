// Post-build guard: the public bundle must never contain the staff portal.
//
// The portal moved to its own app (admin/), but nothing at the module level
// stops a future import from pulling an admin component, the auth client or
// the operations demo back into this bundle, where it would be downloadable by
// anyone. This scans the built output for markers that only the portal has and
// fails the build if any appear. Run automatically by `npm run build`.
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

// Each marker is a string literal from the portal's source that a minifier
// keeps verbatim (API paths and UI copy), and that the public site never uses.
export const ADMIN_MARKERS = [
  '/api/auth/login',
  '/api/auth/verify',
  '/api/auth/change-password',
  '/api/submissions/export/csv',
  // Portal modules planned next (docs/billing-automation-plan.md).
  '/api/billing/',
  'Client Messages',
  'Change password',
  'Sign Out',
  'Operations Demo',
  'Missed-call recovery',
]

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

export function scan(distDir = DIST) {
  const files = walk(distDir).filter((f) => /\.(js|html|css|json)$/.test(f))
  const hits = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const marker of ADMIN_MARKERS) {
      if (text.includes(marker)) hits.push(`"${marker}" in ${file.slice(distDir.length + 1)}`)
    }
  }
  return { files: files.length, hits }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(DIST)) {
    console.error('site/dist does not exist — build first.')
    process.exit(1)
  }
  const { files, hits } = scan()
  if (hits.length) {
    console.error('Public bundle contains staff-portal code:\n  ' + hits.join('\n  '))
    process.exit(1)
  }
  console.log(`Public bundle check passed: no staff-portal code in ${files} files.`)
}
