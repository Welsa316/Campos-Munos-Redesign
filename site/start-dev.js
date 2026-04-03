import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
process.chdir(__dirname)

// Import vite CLI directly to avoid env shim issues
await import('./node_modules/vite/dist/node/cli.js')
