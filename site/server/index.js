// Entry point for the standalone public website (camulaw.com).
// `npm start` in site/ after `npm run build`.
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import { createSiteApp } from './app.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')

if (!fs.existsSync(join(distDir, 'index.html'))) {
  console.error('site/dist is missing — run `npm run build` first.')
  process.exit(1)
}

const env = process.env
const app = createSiteApp({
  distDir,
  adminUrl: env.ADMIN_URL || '',
  apiOrigin: env.API_ORIGIN || '',
  apiProxyTarget: env.API_PROXY_TARGET || '',
  proxySecret: env.SITE_PROXY_SECRET || '',
})

const port = env.PORT || 4173
const server = app.listen(port, () => console.log(`Public site listening on :${port}`))

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
