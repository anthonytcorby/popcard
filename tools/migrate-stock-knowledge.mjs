// Stock Knowledge Framework — schema migration.
// Run with: node tools/migrate-stock-knowledge.mjs   (idempotent)
//
// Builds Popcard's "Layer 1" stock-content store, kept entirely separate from
// users' personal decks/cards. Everything seeded here starts as `unverified`
// and is NEVER served to the public site until a reviewer (human or a future
// AI agent) promotes it to `verified` — see api/_lib/stock.js.
//
// Review pipeline (the `review_status` column moves along this):
//   unverified -> ai_reviewed -> human_reviewed -> verified
//                                          \-> rejected
//
// The `stock_review_log` table is the "socket" a future review agent plugs
// into: it reads items needing review and writes a verdict row here.
//
// Reads POSTGRES_URL from .env.local
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) throw new Error('POSTGRES_URL not found in .env.local');

const sql = neon(url);

console.log('[migrate] stock_modules — curriculum coordinates for a module');
await sql`
  CREATE TABLE IF NOT EXISTS stock_modules (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          text UNIQUE NOT NULL,
    subject       text NOT NULL,
    level         text NOT NULL,
    qualification text,
    exam_board    text,
    module        text,
    topic         text,
    subtopic      text,
    title         text NOT NULL,
    description   text,
    position      int  NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
  )
`;

console.log('[migrate] stock_cards — atomic study cards (start unverified)');
await sql`
  CREATE TABLE IF NOT EXISTS stock_cards (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id     uuid NOT NULL REFERENCES stock_modules(id) ON DELETE CASCADE,
    position      int  NOT NULL,
    card_type     text NOT NULL DEFAULT 'definition',
    question      text NOT NULL,
    answer        text NOT NULL,
    hint          text,
    difficulty    text NOT NULL DEFAULT 'core',
    tags          text[] NOT NULL DEFAULT '{}',
    source_note   text,
    source_ids    text[] NOT NULL DEFAULT '{}',
    review_status text NOT NULL DEFAULT 'unverified',
    version       int  NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (module_id, position)
  )
`;

console.log('[migrate] stock_quiz_questions — MCQs for a module (start unverified)');
await sql`
  CREATE TABLE IF NOT EXISTS stock_quiz_questions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id     uuid NOT NULL REFERENCES stock_modules(id) ON DELETE CASCADE,
    position      int  NOT NULL,
    question      text NOT NULL,
    options       jsonb NOT NULL,
    correct_index int  NOT NULL,
    explanation   text,
    difficulty    text NOT NULL DEFAULT 'core',
    review_status text NOT NULL DEFAULT 'unverified',
    version       int  NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (module_id, position)
  )
`;

console.log('[migrate] stock_review_log — audit trail + the review-agent socket');
await sql`
  CREATE TABLE IF NOT EXISTS stock_review_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type    text NOT NULL,                 -- 'card' | 'quiz' | 'module'
    item_id      uuid NOT NULL,
    reviewer     text NOT NULL,                 -- 'ai:<model>' | 'human:<email>' | 'system'
    verdict      text NOT NULL,                 -- 'approve' | 'reject' | 'edit' | 'flag'
    confidence   numeric,                       -- 0..1 (AI reviewers)
    issues       text,
    suggested_fix text,
    status_from  text,
    status_to    text,
    created_at   timestamptz NOT NULL DEFAULT now()
  )
`;

console.log('[migrate] indexes');
await sql`CREATE INDEX IF NOT EXISTS idx_stock_cards_module ON stock_cards(module_id, position)`;
await sql`CREATE INDEX IF NOT EXISTS idx_stock_cards_review ON stock_cards(review_status)`;
await sql`CREATE INDEX IF NOT EXISTS idx_stock_quiz_module ON stock_quiz_questions(module_id, position)`;
await sql`CREATE INDEX IF NOT EXISTS idx_stock_quiz_review ON stock_quiz_questions(review_status)`;
await sql`CREATE INDEX IF NOT EXISTS idx_stock_review_item ON stock_review_log(item_type, item_id)`;

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name LIKE 'stock_%'
  ORDER BY table_name
`;
console.log('[migrate] stock tables present:', tables.map((t) => t.table_name));
console.log('[migrate] done');
