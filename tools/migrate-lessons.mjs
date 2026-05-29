// Lessons migration — the Sprint 3 "Duolingo path" backbone.
//
// A lesson is an ordered slice of a deck's study cards (≈8 per lesson) that
// the user works through as a focused unit. Crown level (0–5) tracks mastery:
// each clean pass bumps the crown until it's gold (5).
//
//   lessons
//     id            uuid PK
//     deck_id       uuid FK decks(id) CASCADE
//     position      int   (0-based order within the deck)
//     title         text  ("Lesson 1", or first-card-derived later)
//     card_ids      jsonb (ordered array of card uuids in this lesson)
//     card_count    int
//     created_at    timestamptz
//     UNIQUE (deck_id, position)
//
//   lesson_progress  (per user per lesson)
//     user_id       text FK users(id) CASCADE
//     lesson_id     uuid FK lessons(id) CASCADE
//     crown         int  default 0   (0..5)
//     attempts      int  default 0
//     best_correct  int  default 0   (best #correct in one pass)
//     last_score    int             (most recent #correct)
//     completed_at  timestamptz     (first time crown reached 1)
//     updated_at    timestamptz
//     PRIMARY KEY (user_id, lesson_id)
//
// Reads POSTGRES_URL from .env.local. Idempotent.

import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) { console.error('POSTGRES_URL not in .env.local'); process.exit(1); }
const sql = neon(url);

console.log('Creating lessons table…');
await sql`
  CREATE TABLE IF NOT EXISTS lessons (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id     uuid        NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    position    int         NOT NULL,
    title       text        NOT NULL,
    card_ids    jsonb       NOT NULL,
    card_count  int         NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (deck_id, position)
  )
`;
await sql`CREATE INDEX IF NOT EXISTS lessons_deck_idx ON lessons (deck_id, position)`;

console.log('Creating lesson_progress table…');
await sql`
  CREATE TABLE IF NOT EXISTS lesson_progress (
    user_id       text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id     uuid        NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    crown         int         NOT NULL DEFAULT 0,
    attempts      int         NOT NULL DEFAULT 0,
    best_correct  int         NOT NULL DEFAULT 0,
    last_score    int,
    completed_at  timestamptz,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lesson_id)
  )
`;
await sql`CREATE INDEX IF NOT EXISTS lesson_progress_user_idx ON lesson_progress (user_id)`;

console.log('Done.');
