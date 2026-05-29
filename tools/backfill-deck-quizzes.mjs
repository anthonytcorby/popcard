// Backfill: generate + cache an MCQ quiz for existing decks that don't have one.
// Run with: node tools/backfill-deck-quizzes.mjs [limit]
//   limit (optional): max decks to process this run (default 500).
//
// Each quiz uses purpose-built, same-concept distractors (see generateQuiz) and
// is stored on decks.quiz so the quiz page reuses it. Makes one OpenAI call per
// deck — reads OPENAI_API_KEY + POSTGRES_URL from .env.local.
import { sql } from '../api/_lib/db.js';
import { generateQuiz } from '../api/_lib/llm.js';

const limit = Math.max(1, Number(process.argv[2]) || 500);

const totalNeeding = (await sql`SELECT count(*)::int AS n FROM decks WHERE quiz IS NULL AND card_count >= 4`)[0].n;
console.log(`[backfill] ${totalNeeding} total deck(s) need a quiz across the DB`);

const decks = await sql`
  SELECT id, title, card_count FROM decks
  WHERE quiz IS NULL AND card_count >= 4
  ORDER BY created_at DESC
  LIMIT ${limit}
`;
console.log(`[backfill] ${decks.length} deck(s) need a quiz (limit ${limit})`);

let done = 0, skipped = 0, failed = 0;
for (const d of decks) {
  const cards = await sql`
    SELECT question, answer, hint FROM cards
    WHERE deck_id = ${d.id} AND position <> 0 AND answer IS NOT NULL
    ORDER BY position
  `;
  if (cards.length < 4) { skipped++; console.log(`  – skip "${d.title}" (${cards.length} usable cards)`); continue; }
  try {
    const { questions, model } = await generateQuiz({ deckTitle: d.title, cards });
    if (!questions.length) { failed++; console.log(`  ✗ "${d.title}": model returned no questions`); continue; }
    const quiz = { questions, model, generatedAt: new Date().toISOString() };
    await sql`UPDATE decks SET quiz = ${JSON.stringify(quiz)}::jsonb WHERE id = ${d.id}`;
    done++;
    console.log(`  ✓ "${d.title}": ${questions.length} questions`);
  } catch (e) {
    failed++;
    console.log(`  ✗ "${d.title}": ${e.message}`);
  }
}
console.log(`[backfill] done — ${done} generated, ${skipped} skipped, ${failed} failed`);
