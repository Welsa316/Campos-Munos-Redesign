import pg from 'pg'
import logger from '../logger.js'

let pool

export default function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      // Verify the DB server certificate when a CA is provided (set PG_CA_CERT to
      // Railway's CA to close the MITM gap); otherwise fall back to encrypted-but-
      // unverified TLS, which is the Railway default when no CA is pinned.
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: !!process.env.PG_CA_CERT, ca: process.env.PG_CA_CERT || undefined }
        : false,
      connectionTimeoutMillis: 10000,
      max: 10,
      // Opening a connection costs several round trips to the database
      // (TCP, TLS, auth). Keep idle ones for five minutes, so the portal's
      // 15-second polling keeps a warm connection instead of reopening one.
      idleTimeoutMillis: 5 * 60 * 1000,
      keepAlive: true,
    })
    // A dropped idle connection emits 'error' on the pool; without a listener
    // that would surface as an uncaught exception and crash the process.
    pool.on('error', (err) => logger.error({ err }, 'Idle pg client error'))
  }
  return pool
}
