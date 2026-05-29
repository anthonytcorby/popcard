// Per-deck stored quiz. Run with: node tools/migrate-deck-quiz.mjs   (idempotent)
//
// Adds decks.quiz (jsonb): a cached set of generated multiple-choice questions
// { questions: [{ question, options[4], correctIndex, explanation }], model, generatedAt }.
// Quizzes are generated once (lazily, on first play) by api/quiz.js and reused,
// so the quiz uses purpose-built same-concept distractors instead of recycling
// other cards' answers.
//
// Reads POSTGRES_URL from .env.local
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) throw new Error('POSTGRES_URL not found in .env.local');
const sql = neon(url);

console.log('[migrate] decks: adding quiz jsonb column');
await sql`ALTER TABLE decks ADD COLUMN IF NOT EXISTS quiz jsonb`;

const col = await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'decks' AND column_name = 'quiz'
`;
console.log('[migrate] column:', col);
console.log('[migrate] done');
