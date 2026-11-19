// Entry colours (server/colors/). Additive and safe to run on every deploy.
// Needs admin_users.
//
// One row per coloured entry: (kind, key) → colour. Clearing a colour keeps
// the row with color NULL, so updated_at still moves and the Calls page's
// change stamp (callsStamp) sees the change on everyone's screen.
import { ENTRY_COLORS, ENTRY_KINDS } from '../colors/palette.js'

const list = (xs) => xs.map((x) => `'${x}'`).join(', ')

export const COLORS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS entry_colors (
    kind TEXT NOT NULL,
    key TEXT NOT NULL CHECK (char_length(key) BETWEEN 1 AND 64),
    color TEXT,
    set_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (kind, key)
  );

  -- Dropped and recreated rather than guarded: a guard keyed on the name
  -- could never widen the list on a database that already has it. Keep in
  -- sync with server/colors/palette.js (constants only, never input).
  ALTER TABLE entry_colors DROP CONSTRAINT IF EXISTS entry_colors_kind_chk;
  ALTER TABLE entry_colors ADD CONSTRAINT entry_colors_kind_chk CHECK (kind IN (${list(ENTRY_KINDS)}));
  ALTER TABLE entry_colors DROP CONSTRAINT IF EXISTS entry_colors_color_chk;
  ALTER TABLE entry_colors ADD CONSTRAINT entry_colors_color_chk CHECK (color IS NULL OR color IN (${list(ENTRY_COLORS)}));

  -- The Calls page's change stamp reads MAX(updated_at) of caller and reminder colours.
  CREATE INDEX IF NOT EXISTS idx_entry_colors_updated ON entry_colors(kind, updated_at);
`

export async function applyColorsSchema(client) {
  await client.query(COLORS_SCHEMA_SQL)
}
