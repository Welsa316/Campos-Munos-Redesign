// Billing schema (docs/billing-automation-plan.md, section 3).
//
// Additive only: CREATE ... IF NOT EXISTS and ADD COLUMN IF NOT EXISTS, so it
// is safe to run on every deploy (server/db/migrate.js) and on a database that
// already has it. Nothing here alters or drops an existing table's data.
//
// Money columns are BIGINT cents. Dates from reports are DATE (no time zone),
// timestamps are TIMESTAMPTZ.
export const BILLING_SCHEMA_SQL = `
  -- Staff roles. Adding the column backfills existing accounts as 'admin',
  -- so nothing changes for them; every account created afterwards is
  -- 'staff' (view only) unless created as admin on purpose (db/seed.js).
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'admin';
  ALTER TABLE admin_users ALTER COLUMN role SET DEFAULT 'staff';
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_role_chk') THEN
      ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_chk CHECK (role IN ('admin', 'staff'));
    END IF;
  END $$;

  -- One row per eImmigration client seen in a report.
  CREATE TABLE IF NOT EXISTS billing_clients (
    id BIGSERIAL PRIMARY KEY,
    eimmigration_client_id TEXT UNIQUE,
    display_name TEXT,
    normalized_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_billing_clients_normalized_name ON billing_clients(normalized_name);

  -- Approved links between a billing client and an external record. A monday
  -- item belongs to exactly one client; a client may have several items (one
  -- per case).
  CREATE TABLE IF NOT EXISTS billing_client_links (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES billing_clients(id) ON DELETE CASCADE,
    system VARCHAR(20) NOT NULL CHECK (system IN ('monday')),
    external_id TEXT NOT NULL,
    external_label TEXT,
    method VARCHAR(20) NOT NULL CHECK (method IN ('external_id', 'manual')),
    approved_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (system, external_id)
  );
  CREATE INDEX IF NOT EXISTS idx_billing_client_links_client ON billing_client_links(client_id);

  -- Every uploaded report. raw_file is purged after the retention window; the
  -- metadata, staged rows and outcome stay for the audit trail.
  CREATE TABLE IF NOT EXISTS billing_import_jobs (
    id BIGSERIAL PRIMARY KEY,
    source VARCHAR(30) NOT NULL DEFAULT 'manual_upload',
    filename TEXT NOT NULL,
    file_sha256 CHAR(64) NOT NULL,
    file_size INTEGER NOT NULL,
    raw_file BYTEA,
    raw_purged_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'uploaded'
      CHECK (status IN ('uploaded', 'previewed', 'applied', 'failed', 'cancelled')),
    headers JSONB,
    mapping JSONB,
    report_type VARCHAR(30) CHECK (report_type IN ('invoice_summary', 'outstanding_only', 'payment_transactions', 'mixed')),
    report_date DATE,
    stats JSONB,
    errors JSONB,
    preview_fingerprint TEXT,
    uploaded_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    approved_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previewed_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_billing_import_jobs_created ON billing_import_jobs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_billing_import_jobs_sha ON billing_import_jobs(file_sha256);

  -- Staged rows of a job: what the file said, what it means, what we propose.
  CREATE TABLE IF NOT EXISTS billing_import_rows (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES billing_import_jobs(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('invoice', 'payment')),
    record JSONB NOT NULL,
    issues JSONB NOT NULL DEFAULT '[]',
    action VARCHAR(20) NOT NULL,
    changes JSONB NOT NULL DEFAULT '[]',
    match_status VARCHAR(20),
    UNIQUE (job_id, row_number, kind)
  );
  CREATE INDEX IF NOT EXISTS idx_billing_import_rows_job ON billing_import_rows(job_id, action);

  -- Current state of each invoice, keyed by eImmigration's invoice id.
  CREATE TABLE IF NOT EXISTS billing_invoices (
    id BIGSERIAL PRIMARY KEY,
    external_invoice_id TEXT NOT NULL UNIQUE,
    client_id BIGINT REFERENCES billing_clients(id) ON DELETE SET NULL,
    client_name TEXT,
    invoice_date DATE,
    due_date DATE,
    total_cents BIGINT,
    paid_cents BIGINT,
    balance_cents BIGINT,
    balance_source VARCHAR(15) NOT NULL DEFAULT 'unknown' CHECK (balance_source IN ('authoritative', 'computed', 'unknown')),
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    source_status TEXT,
    status VARCHAR(15) NOT NULL CHECK (status IN ('paid', 'partial', 'unpaid', 'overdue', 'void', 'needs_review')),
    review_reason TEXT,
    payment_plan_text TEXT,
    next_installment_date DATE,
    next_installment_cents BIGINT,
    last_payment_date DATE,
    last_report_date DATE,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_import_job_id BIGINT REFERENCES billing_import_jobs(id) ON DELETE SET NULL,
    not_in_latest_report BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_billing_invoices_client ON billing_invoices(client_id);
  CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices(status);

  -- Every change to an invoice, so a later correction never erases history.
  CREATE TABLE IF NOT EXISTS billing_invoice_revisions (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
    import_job_id BIGINT REFERENCES billing_import_jobs(id) ON DELETE SET NULL,
    before JSONB,
    after JSONB NOT NULL,
    changes JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_billing_invoice_revisions_invoice ON billing_invoice_revisions(invoice_id, created_at DESC);

  -- Payments, credits, adjustments and refunds as the source reports them.
  CREATE TABLE IF NOT EXISTS billing_payments (
    id BIGSERIAL PRIMARY KEY,
    dedupe_key TEXT NOT NULL UNIQUE,
    external_payment_id TEXT,
    external_invoice_id TEXT,
    invoice_id BIGINT REFERENCES billing_invoices(id) ON DELETE SET NULL,
    client_id BIGINT REFERENCES billing_clients(id) ON DELETE SET NULL,
    payment_date DATE,
    amount_cents BIGINT NOT NULL,
    payment_type VARCHAR(12) NOT NULL CHECK (payment_type IN ('payment', 'credit', 'adjustment', 'refund')),
    method TEXT,
    reference TEXT,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    import_job_id BIGINT REFERENCES billing_import_jobs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_billing_payments_invoice ON billing_payments(external_invoice_id);

  -- Staff decisions in the matching review.
  CREATE TABLE IF NOT EXISTS billing_match_decisions (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES billing_clients(id) ON DELETE CASCADE,
    decision VARCHAR(10) NOT NULL CHECK (decision IN ('approve', 'unlink')),
    system VARCHAR(20) NOT NULL,
    external_id TEXT NOT NULL,
    decided_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Column mappings confirmed for a header layout, reused on the next upload.
  CREATE TABLE IF NOT EXISTS billing_mapping_templates (
    header_signature CHAR(64) PRIMARY KEY,
    headers JSONB NOT NULL,
    mapping JSONB NOT NULL,
    report_type VARCHAR(30),
    updated_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- monday.com sync runs: preview first, apply separately.
  CREATE TABLE IF NOT EXISTS billing_sync_jobs (
    id BIGSERIAL PRIMARY KEY,
    provider_mode VARCHAR(10) NOT NULL CHECK (provider_mode IN ('mock', 'api')),
    board_id TEXT NOT NULL,
    status VARCHAR(15) NOT NULL DEFAULT 'previewed'
      CHECK (status IN ('previewed', 'applying', 'applied', 'dry_run', 'failed', 'superseded')),
    dry_run BOOLEAN NOT NULL DEFAULT TRUE,
    stats JSONB,
    error TEXT,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    applied_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_at TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS billing_sync_items (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES billing_sync_jobs(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    item_name TEXT,
    client_id BIGINT REFERENCES billing_clients(id) ON DELETE SET NULL,
    changes JSONB NOT NULL,
    column_values JSONB NOT NULL,
    outcome VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'written', 'dry_run', 'failed', 'skipped')),
    error TEXT,
    UNIQUE (job_id, item_id)
  );

  -- Settings (monday board + column map, retention, …).
  CREATE TABLE IF NOT EXISTS billing_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Who did what. details carry ids and counts, never names or amounts.
  CREATE TABLE IF NOT EXISTS billing_audit_events (
    id BIGSERIAL PRIMARY KEY,
    actor_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_billing_audit_events_created ON billing_audit_events(created_at DESC);

  -- WhatsApp contact for a billing client. Opt-in is recorded explicitly,
  -- with who recorded it and how the client agreed: Meta requires consent
  -- before business-initiated messages, and nothing is sent without it.
  CREATE TABLE IF NOT EXISTS billing_client_contacts (
    client_id BIGINT PRIMARY KEY REFERENCES billing_clients(id) ON DELETE CASCADE,
    phone_e164 VARCHAR(15),
    first_name TEXT,
    language CHAR(2) NOT NULL DEFAULT 'es' CHECK (language IN ('es', 'en')),
    opted_in_at TIMESTAMPTZ,
    opt_in_source TEXT,
    opt_in_recorded_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    opted_out_at TIMESTAMPTZ,
    opt_out_source TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_billing_client_contacts_phone ON billing_client_contacts(phone_e164);
  -- IANA zone for the sending window (America/Chicago when unset).
  ALTER TABLE billing_client_contacts ADD COLUMN IF NOT EXISTS timezone TEXT;

  -- Reminder rules and message templates, editable in the portal. Seeded
  -- switched off (server/billing/reminderModel.js).
  CREATE TABLE IF NOT EXISTS billing_reminder_rules (
    key VARCHAR(40) PRIMARY KEY,
    label TEXT NOT NULL,
    trigger VARCHAR(12) NOT NULL CHECK (trigger IN ('before_due', 'after_due')),
    days INTEGER NOT NULL CHECK (days BETWEEN 0 AND 60),
    action VARCHAR(16) NOT NULL CHECK (action IN ('whatsapp', 'staff_followup')),
    template_key VARCHAR(40),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS billing_message_templates (
    key VARCHAR(40) PRIMARY KEY,
    meta_name TEXT NOT NULL,
    params JSONB NOT NULL,
    languages JSONB NOT NULL,
    meta_approved BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- One reminder per obligation (invoice at a due date) and rule. The
  -- UNIQUE pair is what stops a second reminder for the same payment and
  -- stage, across restarts and instances.
  CREATE TABLE IF NOT EXISTS billing_reminders (
    id BIGSERIAL PRIMARY KEY,
    obligation_key TEXT NOT NULL,
    rule_key VARCHAR(40) NOT NULL,
    invoice_id BIGINT REFERENCES billing_invoices(id) ON DELETE SET NULL,
    client_id BIGINT REFERENCES billing_clients(id) ON DELETE SET NULL,
    action VARCHAR(16) NOT NULL CHECK (action IN ('whatsapp', 'staff_followup')),
    state VARCHAR(12) NOT NULL CHECK (state IN ('draft', 'approved', 'queued', 'sent', 'delivered', 'read', 'failed', 'unknown', 'cancelled')),
    template_key VARCHAR(40),
    language CHAR(2),
    to_phone VARCHAR(15),
    params JSONB NOT NULL DEFAULT '{}',
    preview TEXT,
    due_date DATE,
    balance_cents BIGINT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    last_error_retryable BOOLEAN,
    simulated BOOLEAN NOT NULL DEFAULT FALSE,
    cancel_reason VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    queued_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    cancelled_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    cancelled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (obligation_key, rule_key)
  );
  CREATE INDEX IF NOT EXISTS idx_billing_reminders_state ON billing_reminders(state, created_at DESC);

  -- Every send attempt. The row is written BEFORE the provider is called,
  -- so a crash mid-send leaves a 'pending' row that is later marked
  -- 'unknown' (never resent automatically) instead of being forgotten.
  CREATE TABLE IF NOT EXISTS billing_messages (
    id BIGSERIAL PRIMARY KEY,
    reminder_id BIGINT REFERENCES billing_reminders(id) ON DELETE SET NULL,
    provider_mode VARCHAR(8) NOT NULL CHECK (provider_mode IN ('mock', 'meta')),
    simulated BOOLEAN NOT NULL,
    to_phone VARCHAR(15) NOT NULL,
    template_name TEXT NOT NULL,
    language_code TEXT NOT NULL,
    body_params JSONB NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    status VARCHAR(10) NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'unknown')),
    provider_message_id TEXT UNIQUE,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Receipts that arrived before we stored the message id they refer to
  -- (Meta can answer the webhook faster than our own write lands). Applied
  -- as soon as the dispatcher records the id.
  CREATE TABLE IF NOT EXISTS billing_early_receipts (
    event_key TEXT PRIMARY KEY,
    provider_message_id TEXT NOT NULL,
    status VARCHAR(10) NOT NULL,
    raw JSONB NOT NULL DEFAULT '{}',
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_billing_early_receipts_msg ON billing_early_receipts(provider_message_id);

  -- Client replies that need a person (and opt-outs, for the record).
  CREATE TABLE IF NOT EXISTS billing_inbound_reviews (
    id BIGSERIAL PRIMARY KEY,
    event_key TEXT NOT NULL UNIQUE,
    client_id BIGINT REFERENCES billing_clients(id) ON DELETE SET NULL,
    from_phone VARCHAR(15),
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('reply', 'opt_out', 'opt_in')),
    body TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    handled_at TIMESTAMPTZ,
    handled_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
  );
  ALTER TABLE billing_inbound_reviews ADD COLUMN IF NOT EXISTS body TEXT;

  -- Which webhook events billing has handled. A failure while handling
  -- (say, a database blip during a STOP) leaves it NULL and a sweep retries
  -- it. Added with every existing row marked handled, so history from before
  -- billing existed is never replayed.
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_events' AND column_name = 'billing_processed_at') THEN
      ALTER TABLE whatsapp_events ADD COLUMN billing_processed_at TIMESTAMPTZ;
      ALTER TABLE whatsapp_events ADD COLUMN billing_attempts INTEGER NOT NULL DEFAULT 0;
      UPDATE whatsapp_events SET billing_processed_at = NOW();
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS idx_whatsapp_events_billing_pending ON whatsapp_events(received_at) WHERE billing_processed_at IS NULL;

  -- Last connectivity check per integration (Settings cards).
  CREATE TABLE IF NOT EXISTS billing_integration_checks (
    provider TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    ok BOOLEAN NOT NULL,
    detail JSONB NOT NULL DEFAULT '{}',
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`

export async function applyBillingSchema(db) {
  await db.query(BILLING_SCHEMA_SQL)
}
