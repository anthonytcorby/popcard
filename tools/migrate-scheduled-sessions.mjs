// Scheduled sessions migration.
//
// Adds the scheduled_sessions table — one row per "I want to study X at Y time"
// commitment a user makes from the calendar. These power:
//   1. The visual dots on the calendar (so you can see what's coming)
//   2. The dashboard "Study plan" empty-state replacement
//   3. The browser-push reminder fired ~10 min before scheduled_at
//
// source_kind = 'deck'  → source_deck_id = a real deck id (study that deck)
// source_kind = 'text'  → source_text = raw pasted text, fed to /api/pop on demand
// source_kind = 'url'   → source_url  = a YouTube/article link, fed to /api/pop
//
// Reads POSTGRES_URL from .env.local. Idempotent.

import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) { console.error('POSTGRES_URL not in .env.local'); process.exit(1); }
const sql = neon(url);

console.log('Creating scheduled_sessions table…');
await sql`
  CREATE TABLE IF NOT EXISTS scheduled_sessions (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_at     timestamptz NOT NULL,
    source_kind      text        NOT NULL,
    source_deck_id   uuid        REFERENCES decks(id) ON DELETE SET NULL,
    source_url       text,
    source_text      text,
    label            text,
    notified_at      timestamptz,
    completed_at     timestamptz,
    cancelled_at     timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS scheduled_user_when_idx ON scheduled_sessions (user_id, scheduled_at)`;
await sql`CREATE INDEX IF NOT EXISTS scheduled_pending_idx ON scheduled_sessions (scheduled_at) WHERE completed_at IS NULL AND cancelled_at IS NULL`;

console.log('Done.');
