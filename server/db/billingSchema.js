// Billing schema (docs/billing-automation-plan.md, section 3).
//
// Additive only: CREATE ... IF NOT EXISTS and ADD COLUMN IF NOT EXISTS, so it
// is safe to run on every deploy (server/db/migrate.js) and on a database that
// already has it. Nothing here alters or drops an existing table's data.
//
// Money columns are BIGINT cents. Dates from reports are DATE (no time zone),
// timestamps are TIMESTAMPTZ.
export const BILLING_SCHEMA_SQL = `
  -- Staff roles. The existing account(s) default to 'admin', so nothing
  -- changes for them; 'staff' can view billing but not approve or sync.
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'admin';
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
