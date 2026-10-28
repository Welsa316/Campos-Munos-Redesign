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

      -- Lead pipeline status, so the front desk can see at a glance whether a
      -- lead booked a consultation without keeping a separate spreadsheet.
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'new';

      -- Dropped and recreated rather than guarded by IF NOT EXISTS: a guard
      -- keyed on the constraint name can never widen the list on a database
      -- that already has it, so a newly added status would be rejected in
      -- production while passing locally. Keep in sync with LEAD_STATUSES in
      -- server/routes/submissions.js and site/src/data/leadStatuses.js.
      ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_chk;
      ALTER TABLE submissions ADD CONSTRAINT submissions_status_chk
        CHECK (status IN ('new', 'contacted', 'no_response', 'scheduled', 'retained', 'closed'));

      CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);

      -- Internal running log per lead. A table rather than a single text column
      -- so entries are timestamped and append-only — staff can see the history
      -- of a lead instead of overwriting each other's note.
      CREATE TABLE IF NOT EXISTS lead_notes (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_lead_notes_submission_id ON lead_notes(submission_id);

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

      -- Every event delivered to the WhatsApp Cloud API webhook, one row per
      -- inbound message or per status change of an outbound one. event_key is
      -- the dedupe key (message:<wamid> or status:<wamid>:<status>): Meta
      -- redelivers anything it did not see a 200 for, and the UNIQUE index
      -- makes a redelivery a no-op across restarts and instances.
      CREATE TABLE IF NOT EXISTS whatsapp_events (
        id SERIAL PRIMARY KEY,
        -- TEXT throughout: Meta documents no maximum for wamids, names or
        -- types, and an oversize value would make the insert throw after the
        -- 200 has already gone back, losing the event.
        event_key TEXT UNIQUE NOT NULL,
        kind VARCHAR(10) NOT NULL CHECK (kind IN ('message', 'status')),
        wa_message_id TEXT NOT NULL,
        status TEXT,
        from_wa_id TEXT,
        contact_name TEXT,
        recipient_wa_id TEXT,
        message_type TEXT,
        phone_number_id TEXT,
        display_phone_number TEXT,
        waba_id TEXT,
        event_timestamp TIMESTAMPTZ,
        payload JSONB NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_whatsapp_events_received_at ON whatsapp_events(received_at DESC);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_events_from ON whatsapp_events(from_wa_id, received_at DESC);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_events_message_id ON whatsapp_events(wa_message_id);
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
