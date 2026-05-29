// Backfill lessons for every existing deck that doesn't have them yet.
// Safe to re-run — generateLessonsForDeck() no-ops on already-chunked decks.
//
// Run: node tools/backfill-lessons.mjs

import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) { console.error('POSTGRES_URL not in .env.local'); process.exit(1); }
const sql = neon(url);

const LESSON_SIZE = 8;
const MIN_LAST_LESSON = 4;

function chunkCardIds(cardIds) {
  const out = [];
  for (let i = 0; i < cardIds.length; i += LESSON_SIZE) out.push(cardIds.slice(i, i + LESSON_SIZE));
  if (out.length >= 2) {
    const last = out[out.length - 1];
    if (last.length < MIN_LAST_LESSON) {
      const merged = out.pop();
      out[out.length - 1] = out[out.length - 1].concat(merged);
    }
  }
  return out;
}

const decks = await sql`SELECT id, title FROM decks ORDER BY created_at`;
console.log(`Found ${decks.length} decks.`);

let created = 0, skipped = 0;
for (const deck of decks) {
  const existing = await sql`SELECT 1 FROM lessons WHERE deck_id = ${deck.id} LIMIT 1`;
  if (existing.length) { skipped++; continue; }

  const cards = await sql`SELECT id FROM cards WHERE deck_id = ${deck.id} AND position > 0 ORDER BY position`;
  const cardIds = cards.map((c) => c.id);
  if (cardIds.length < 2) { skipped++; continue; }

  const chunks = chunkCardIds(cardIds);
  const rows = chunks.map((ids, i) => ({
    deck_id: deck.id, position: i, title: `Lesson ${i + 1}`,
    card_ids: JSON.stringify(ids), card_count: ids.length,
  }));
  await sql`
    INSERT INTO lessons (deck_id, position, title, card_ids, card_count)
    SELECT deck_id, position, title, card_ids::jsonb, card_count
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      AS t(deck_id uuid, position int, title text, card_ids text, card_count int)
  `;
  console.log(`  + ${deck.title || deck.id}: ${chunks.length} lessons from ${cardIds.length} cards`);
  created++;
}

console.log(`\nDone. ${created} decks chunked, ${skipped} skipped (already chunked / too small).`);
