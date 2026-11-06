// Contacts: internal notes written from Calls, and staff decisions about
// which website leads are the same person as a phone number
// (server/contacts/). Additive; nothing here copies calls or submissions —
// a contact's history is read from their own tables.
export async function applyContactsSchema(client) {
  await client.query(`
  -- Internal notes about a caller, written from a call. Seen by staff only,
  -- never sent anywhere. phone_key is cm_phone_key() of the number, so a
  -- note shows wherever that number does; call_key ties it to the call it
  -- was written on (a withheld number has only that).
  CREATE TABLE IF NOT EXISTS call_notes (
    id SERIAL PRIMARY KEY,
    phone_key TEXT CHECK (phone_key IS NULL OR phone_key <> ''),
    call_key TEXT,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
    author_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (phone_key IS NOT NULL OR call_key IS NOT NULL)
  );
  CREATE INDEX IF NOT EXISTS idx_call_notes_phone ON call_notes (phone_key, created_at) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_call_notes_call ON call_notes (call_key) WHERE deleted_at IS NULL;

  -- Every edit and deletion of a call note, with the text it replaced.
  CREATE TABLE IF NOT EXISTS call_note_revisions (
    id SERIAL PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES call_notes(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('edit', 'delete')),
    previous_body TEXT NOT NULL,
    changed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_call_note_revisions_note ON call_note_revisions (note_id, changed_at);

  -- A website lead with the same number is a possible match, never assumed
  -- to be the same person. Staff confirm it, or say it is someone else (a
  -- shared family phone, a reassigned number); a rejected lead leaves that
  -- number's history.
  CREATE TABLE IF NOT EXISTS contact_links (
    phone_key TEXT NOT NULL CHECK (phone_key <> ''),
    submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('confirmed', 'rejected')),
    decided_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (phone_key, submission_id)
  );
  `)
}
