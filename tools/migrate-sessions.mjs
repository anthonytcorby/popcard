// Study sessions migration.
//
// Adds:
//   study_sessions table — one row per completed study/quiz/lesson session.
//     id              uuid       PK
//     user_id         text       FK users.id, ON DELETE CASCADE
//     deck_id         uuid       FK decks.id, ON DELETE SET NULL (nullable for cross-deck sessions)
//     source          text       'practice' | 'quiz' | 'lesson'
//     mode            text       'simple' | 'study' | 'mixed'
//     cards_reviewed  int        how many cards were graded in this session
//     correct_count   int        for quiz sessions, how many were right
//     sparks_earned   int        XP awarded (server is source of truth)
//     duration_ms     int        nullable; total time in session
//     started_at      timestamptz default now()
//     completed_at    timestamptz default now()
//
// Also defensively re-runs the dashboard column adds + daily_activity table
// create, so a fresh DB only needs this one migration to be ready for Sprint 1.
//
// Idempotent — safe to run multiple times.
//
// Run from project root:  node tools/migrate-sessions.mjs

import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) {
  console.error('POSTGRES_URL not found in .env.local');
  process.exit(1);
}

const sql = neon(url);

async function run() {
  // -------- Dashboard prereqs (defensive — these come from migrate-dashboard.mjs) --------
  console.log('Ensuring dashboard columns on users…');
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_days       integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak    integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_shields    integer NOT NULL DEFAULT 2`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS sparks_total      integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_goal        integer NOT NULL DEFAULT 20`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at    date`;

  console.log('Ensuring daily_activity table…');
  await sql`
    CREATE TABLE IF NOT EXISTS daily_activity (
      user_id         text     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_date   date     NOT NULL,
      cards_reviewed  integer  NOT NULL DEFAULT 0,
      decks_popped    integer  NOT NULL DEFAULT 0,
      sparks_earned   integer  NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, activity_date)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS daily_activity_user_date_idx ON daily_activity (user_id, activity_date DESC)`;

  // Newer column: session_count per day (added separately so existing rows backfill to 0)
  await sql`ALTER TABLE daily_activity ADD COLUMN IF NOT EXISTS session_count integer NOT NULL DEFAULT 0`;

  // -------- Study sessions (the new bit) --------
  console.log('Creating study_sessions table…');
  await sql`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deck_id         uuid        REFERENCES decks(id) ON DELETE SET NULL,
      source          text        NOT NULL,
      mode            text,
      cards_reviewed  integer     NOT NULL DEFAULT 0,
      correct_count   integer     NOT NULL DEFAULT 0,
      sparks_earned   integer     NOT NULL DEFAULT 0,
      duration_ms     integer,
      started_at      timestamptz NOT NULL DEFAULT now(),
      completed_at    timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sessions_user_completed_idx ON study_sessions (user_id, completed_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS sessions_user_day_idx ON study_sessions (user_id, ((completed_at AT TIME ZONE 'UTC')::date))`;

  console.log('Done.');
}

run().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
