// Deck review (trust pass) migration.
//
// Adds:
//   decks.review_status   text  'unreviewed' (default) | 'checked' | 'flagged'
//       unreviewed — no critique pass has run yet
//       checked    — critique ran, every card cleared (earns the Pop-checked badge)
//       flagged    — critique ran, ≥1 card flagged low-confidence
//   decks.review_data     jsonb  { reviewedAt, flaggedCount, total } summary
//
//   cards.confidence      text  'high' (default) | 'medium' | 'low'
//   cards.flag_reason     text   short reason when confidence < high (nullable)
//
// The critique is a second LLM pass (see api/_lib/llm.js reviewDeckCards) run
// lazily from the deck view, like the quiz warm. Low-confidence cards get a
// subtle "check this" marker; a clean deck earns the "Pop-checked" badge.
//
// Reads POSTGRES_URL from .env.local. Idempotent.

import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) { console.error('POSTGRES_URL not in .env.local'); process.exit(1); }
const sql = neon(url);

console.log('Adding review columns to decks…');
await sql`ALTER TABLE decks ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'unreviewed'`;
await sql`ALTER TABLE decks ADD COLUMN IF NOT EXISTS review_data jsonb`;

console.log('Adding confidence columns to cards…');
await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'high'`;
await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS flag_reason text`;

console.log('Done.');
