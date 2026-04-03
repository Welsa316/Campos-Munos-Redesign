import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

import getPool from './pool.js'

async function migrate() {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Migration: rename name to first_name/last_name if upgrading
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'submissions' AND column_name = 'name') THEN
          ALTER TABLE submissions ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
          ALTER TABLE submissions ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);
          UPDATE submissions SET first_name = split_part(name, ' ', 1), last_name = substring(name from position(' ' in name) + 1) WHERE first_name IS NULL;
          ALTER TABLE submissions ALTER COLUMN first_name SET NOT NULL;
          ALTER TABLE submissions ALTER COLUMN last_name SET NOT NULL;
          ALTER TABLE submissions DROP COLUMN name;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS replies (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        sent_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)
    console.log('Migration complete — tables created.')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
