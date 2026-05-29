// Notifications migration.
//
// One row per "thing the user should know" — streak milestones, completed
// scheduled sessions, new decks ready, crown level-ups (Sprint 3).
//
// `kind` enum (string, not pg ENUM so we can add new kinds without DDL):
//   streak_milestone     — hit a notable streak day (3/7/14/30/100)
//   deck_ready           — a freshly popped deck finished generating
//   session_starting     — 10 min before a scheduled_session.scheduled_at (Sprint 2 #23 cron)
//   session_missed       — a scheduled_session.scheduled_at passed with no completion
//   crown_levelled       — a lesson crown bumped (Sprint 3)
//
// `link` is a relative URL to navigate the user to on click. `data` is
// kind-specific JSON (e.g. {streak: 7} for milestones, {deckId: '…'} for
// deck_ready). Both are nullable.
//
// Reads POSTGRES_URL from .env.local. Idempotent.

import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) { console.error('POSTGRES_URL not in .env.local'); process.exit(1); }
const sql = neon(url);

console.log('Creating notifications table…');
await sql`
  CREATE TABLE IF NOT EXISTS notifications (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        text        NOT NULL,
    title       text        NOT NULL,
    body        text,
    link        text,
    data        jsonb,
    read_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS notif_user_created_idx ON notifications (user_id, created_at DESC)`;
await sql`CREATE INDEX IF NOT EXISTS notif_user_unread_idx ON notifications (user_id) WHERE read_at IS NULL`;

console.log('Done.');
