import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

import getPool from './pool.js'
import logger from '../logger.js'

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

      -- token_version: bumped on password change so older JWTs become invalid
      -- password_updated_at: audit trail for password rotation
      ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ;

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

      -- Add is_archived column if missing
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

      -- Add source column (contact | chat) to distinguish chat sessions from contact form submissions
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'contact';

      -- Add consultation type + client location (both required for new submissions)
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS consultation_type VARCHAR(50) NOT NULL DEFAULT 'other';
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS location VARCHAR(255) NOT NULL DEFAULT '';

      -- chat_token gates POST /:id/chat-message so sequential IDs aren't enough to spoof a chat session
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS chat_token VARCHAR(64);

      CREATE INDEX IF NOT EXISTS idx_submissions_consultation_type ON submissions(consultation_type);
      CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_submissions_list ON submissions(is_archived, is_read, created_at DESC);

      -- CHECK constraints enforce the same whitelists the API does (defense in depth).
      -- Wrapped in DO $$ so re-running the migration doesn't error if the constraint already exists.
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submissions_source_chk') THEN
          ALTER TABLE submissions ADD CONSTRAINT submissions_source_chk CHECK (source IN ('contact', 'chat'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submissions_consultation_type_chk') THEN
          ALTER TABLE submissions ADD CONSTRAINT submissions_consultation_type_chk CHECK (consultation_type IN (
            'greenCard','ciudadania','asilo','vawa','visaU','visaT','daca','tps',
            'tramiteConsular','visasPrometido','visasJovenes','peticionesFamiliares',
            'ead','defensaDeportacion','other'
          ));
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS replies (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        sent_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_replies_submission_id ON replies(submission_id);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        sent_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_submission_id ON chat_messages(submission_id);
    `)
    logger.info('Migration complete — tables created.')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  logger.fatal({ err }, 'Migration failed')
  process.exit(1)
})
