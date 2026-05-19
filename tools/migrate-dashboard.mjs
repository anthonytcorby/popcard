// Dashboard / gamification migration.
//
// Adds:
//   users.streak_days        integer   - current consecutive-day streak
//   users.longest_streak     integer   - best streak ever
//   users.streak_shields     integer   - "freezes" remaining (free=2, paid=more)
//   users.sparks_total       integer   - Popcard's XP equivalent (per-card / per-deck rewards)
//   users.daily_goal         integer   - 10 / 20 / 30 / 50 (cards reviewed per day)
//   users.last_active_at     date      - last day the user did anything
//
//   daily_activity table (one row per user per day):
//     user_id           text  (FK users.id)
//     activity_date     date
//     cards_reviewed    integer
//     decks_popped      integer
//     sparks_earned     integer
//     PRIMARY KEY (user_id, activity_date)
//
// Idempotent — safe to run multiple times.
//
// Run from project root:  node tools/migrate-dashboard.mjs
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const url = process.env.POSTGRES_URL;
if (!url) {
  console.error('POSTGRES_URL not set. Make sure .env.local has it.');
  process.exit(1);
}

const sql = neon(url);

async function run() {
  console.log('Adding dashboard columns to users…');
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_days       integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak    integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_shields    integer NOT NULL DEFAULT 2`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS sparks_total      integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_goal        integer NOT NULL DEFAULT 20`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at    date`;

  console.log('Creating daily_activity table…');
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

  console.log('Done.');
}

run().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
