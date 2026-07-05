import pg from 'pg'
import logger from '../logger.js'

let pool

export default function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
      max: 10,
      idleTimeoutMillis: 30000,
    })
    // A dropped idle connection emits 'error' on the pool; without a listener
    // that would surface as an uncaught exception and crash the process.
    pool.on('error', (err) => logger.error({ err }, 'Idle pg client error'))
  }
  return pool
}
