// Post-build guard for the staff portal: the bundle must not carry the public
// site's analytics, ad pixels or chat widget. Fails the build if it does.
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const FORBIDDEN = [
  ['googletagmanager.com', 'Google Analytics loader'],
  ['bzrcdn.openai.com', 'OpenAI ads pixel'],
  ['elfsight', 'Elfsight widget'],
  ['generate_lead', 'GA4 lead event'],
]

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const files = walk(DIST).filter((f) => /\.(js|html|css)$/.test(f))
const hits = []
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const [needle, what] of FORBIDDEN) {
    if (text.includes(needle)) hits.push(`${what} ("${needle}") in ${file.slice(DIST.length + 1)}`)
  }
}

if (hits.length) {
  console.error('Admin bundle check failed:\n  ' + hits.join('\n  '))
  process.exit(1)
}
console.log(`Admin bundle check passed (${files.length} files scanned).`)
