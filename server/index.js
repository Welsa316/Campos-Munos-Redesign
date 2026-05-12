import dotenv from 'dotenv'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '.env') })

import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import crypto from 'crypto'
import authRoutes from './routes/auth.js'
import submissionRoutes from './routes/submissions.js'
import getPool from './db/pool.js'
import logger from './logger.js'

const isProduction = process.env.NODE_ENV === 'production'

if (isProduction) {
  const required = ['JWT_SECRET', 'DATABASE_URL', 'FRONTEND_URL']
  const missing = required.filter(k => !process.env[k])
  if (missing.length) {
    logger.fatal({ missing }, 'Missing required env vars in production')
    process.exit(1)
  }
  if (process.env.JWT_SECRET.length < 32 || /change[-_ ]?me/i.test(process.env.JWT_SECRET)) {
    logger.fatal('JWT_SECRET is too short or contains a placeholder value. Generate at least 32 random chars.')
    process.exit(1)
  }
}

const app = express()
const PORT = process.env.PORT || 3000

// Railway / any reverse proxy terminates TLS in front of us — needed so
// express-rate-limit sees the real client IP instead of every request
// appearing to come from the proxy.
app.set('trust proxy', 1)

app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || (isProduction ? false : true),
  credentials: true,
}))
app.use(cookieParser())
app.use(express.json({ limit: '100kb' }))

// Structured request logging with a per-request id so traces can be
// correlated across log lines and surfaced to clients on 500s.
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}))

app.get('/healthz', (_req, res) => res.json({ ok: true }))
app.get('/readyz', async (_req, res) => {
  try {
    await getPool().query('SELECT 1')
    res.json({ ok: true })
  } catch {
    res.status(503).json({ ok: false })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/submissions', submissionRoutes)

// API 404s — must be registered before the static + SPA fallback so an
// unknown /api/* path returns JSON instead of the SPA's index.html.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

// Serve the built Vue frontend from one Railway service. In dev this
// directory doesn't exist (Vite handles the frontend on :5174) — the
// existsSync guard keeps `npm run dev` working without a prior build.
const distDir = join(__dirname, '..', 'site', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, {
    index: false,
    maxAge: '1y',
    setHeaders: (res, path) => {
      // index.html must always be revalidated so a redeploy is picked up
      // on the next request instead of being served from cache for a year.
      if (path.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  }))

  app.get('*', (_req, res) => res.sendFile(join(distDir, 'index.html')))
} else {
  app.use((req, res) => res.status(404).json({ error: 'Not found' }))
}

app.use((err, req, res, _next) => {
  req.log?.error({ err }, 'Unhandled error in request')
  res.status(500).json({ error: 'Internal server error', requestId: req.id })
})

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server listening')
})

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully')
  server.close(async () => {
    try { await getPool().end() } catch { /* ignore */ }
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
