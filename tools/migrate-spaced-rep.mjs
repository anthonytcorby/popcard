// Spaced-repetition schema migration. Run with: node tools/migrate-spaced-rep.mjs
// Adds per-card mastery / review tracking so Popcard can surface a daily
// review pile and compute weak-areas across all of a user's decks.
//
// Reads POSTGRES_URL from .env.local
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) throw new Error('POSTGRES_URL not found in .env.local');

const sql = neon(url);

console.log('[migrate] cards: adding spaced-repetition columns');
await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS mastery TEXT NOT NULL DEFAULT 'new'`;
await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS review_count INT NOT NULL DEFAULT 0`;
await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS interval_days NUMERIC NOT NULL DEFAULT 0`;
await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS ease NUMERIC NOT NULL DEFAULT 2.5`;
await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ`;
await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ`;

console.log('[migrate] index: cards(next_review_at) for the daily-due query');
await sql`CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(next_review_at) WHERE next_review_at IS NOT NULL`;

const cols = await sql`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'cards' AND column_name IN ('mastery', 'review_count', 'interval_days', 'ease', 'next_review_at', 'last_reviewed_at')
  ORDER BY column_name
`;
console.log('[migrate] new columns:', cols);
console.log('[migrate] done');
