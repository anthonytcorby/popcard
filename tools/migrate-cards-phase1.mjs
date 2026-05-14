// One-off Phase 1 schema migration. Run with: node tools/migrate-cards-phase1.mjs
// Reads POSTGRES_URL from .env.local
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) throw new Error('POSTGRES_URL not found in .env.local');

const sql = neon(url);

console.log('[migrate] cards: adding type, importance, source_timestamp_seconds');
await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'idea'`;
await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS importance TEXT NOT NULL DEFAULT 'good_to_know'`;
await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS source_timestamp_seconds INT`;

const counts = await sql`
  SELECT
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM decks) AS decks,
    (SELECT count(*)::int FROM cards) AS cards
`;
console.log('[migrate] done', counts[0]);

// Inspect new columns to confirm
const cols = await sql`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'cards' AND column_name IN ('type', 'importance', 'source_timestamp_seconds')
`;
console.log('[migrate] new columns:', cols);
