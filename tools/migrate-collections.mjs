// Knowledge-deck (collections) schema migration. Run with: node tools/migrate-collections.mjs
// Adds `collections` + `collection_cards` tables so users can curate cards from
// any source deck into custom "knowledge decks".
//
// collection_cards stores a SNAPSHOT of the card content at save time, plus
// a soft reference to the original card/deck. That way if the source is later
// deleted, the user's curated card survives.
//
// Reads POSTGRES_URL from .env.local
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) throw new Error('POSTGRES_URL not found in .env.local');

const sql = neon(url);

console.log('[migrate] creating collections table');
await sql`
  CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

console.log('[migrate] index: collections(user_id, created_at)');
await sql`CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id, created_at DESC)`;

console.log('[migrate] creating collection_cards table');
await sql`
  CREATE TABLE IF NOT EXISTS collection_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    source_card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
    source_deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,
    position INT NOT NULL DEFAULT 0,
    -- Snapshot of card content at save time
    type TEXT NOT NULL DEFAULT 'idea',
    importance TEXT NOT NULL DEFAULT 'good_to_know',
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    hint TEXT,
    source_timestamp_seconds INT,
    -- Provenance label shown in UI (e.g. "From 'Build' by Tony Fadell")
    source_label TEXT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

console.log('[migrate] index: collection_cards(collection_id, position)');
await sql`CREATE INDEX IF NOT EXISTS idx_collection_cards_collection ON collection_cards(collection_id, position)`;

console.log('[migrate] unique: prevent saving the same card to the same collection twice');
await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_card_source ON collection_cards(collection_id, source_card_id) WHERE source_card_id IS NOT NULL`;

const counts = await sql`
  SELECT
    (SELECT count(*)::int FROM collections) AS collections,
    (SELECT count(*)::int FROM collection_cards) AS collection_cards
`;
console.log('[migrate] done', counts[0]);
