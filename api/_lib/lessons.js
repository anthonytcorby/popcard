// Lessons — the Sprint 3 "path" layer over a deck's flat card list.
//
// A deck's study cards (position > 0; position 0 is the overview/summary) are
// chunked into ordered lessons of ~8 cards. Each lesson tracks a per-user
// crown level 0–5: every clean pass (≥ PASS_RATIO correct) bumps the crown.
//
// generateLessonsForDeck() is idempotent — it no-ops if the deck already has
// lessons, so it's safe to call on every deck create + as a backfill.

import { sql } from './db.js';

export const LESSON_SIZE = 8;          // target cards per lesson
export const MIN_LAST_LESSON = 4;      // merge a tiny trailing lesson up into the previous one
export const MAX_CROWN = 5;
export const PASS_RATIO = 0.85;        // ≥85% correct in a pass bumps the crown

// Split an ordered array of card ids into lesson-sized buckets. A trailing
// bucket smaller than MIN_LAST_LESSON is merged into the previous bucket so we
// never strand a lonely 1–3 card lesson at the end.
export function chunkCardIds(cardIds) {
  const out = [];
  for (let i = 0; i < cardIds.length; i += LESSON_SIZE) {
    out.push(cardIds.slice(i, i + LESSON_SIZE));
  }
  if (out.length >= 2) {
    const last = out[out.length - 1];
    if (last.length < MIN_LAST_LESSON) {
      const merged = out.pop();
      out[out.length - 1] = out[out.length - 1].concat(merged);
    }
  }
  return out;
}

// Build lessons for a deck if it doesn't have them yet. Returns the number of
// lessons created (0 if already chunked or not enough cards).
export async function generateLessonsForDeck(deckId) {
  if (!/^[\w-]{8,}$/.test(deckId || '')) return 0;

  // Already chunked? Bail (idempotent).
  const existing = await sql`SELECT 1 FROM lessons WHERE deck_id = ${deckId} LIMIT 1`;
  if (existing.length) return 0;

  // Ordered study cards (skip overview card at position 0).
  const cards = await sql`
    SELECT id FROM cards
    WHERE deck_id = ${deckId} AND position > 0
    ORDER BY position
  `;
  const cardIds = cards.map((c) => c.id);
  if (cardIds.length < 2) return 0;   // too small to be a "path"

  const chunks = chunkCardIds(cardIds);
  const rows = chunks.map((ids, i) => ({
    deck_id: deckId,
    position: i,
    title: `Lesson ${i + 1}`,
    card_ids: JSON.stringify(ids),
    card_count: ids.length,
  }));

  await sql`
    INSERT INTO lessons (deck_id, position, title, card_ids, card_count)
    SELECT deck_id, position, title, card_ids::jsonb, card_count
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      AS t(deck_id uuid, position int, title text, card_ids text, card_count int)
  `;
  return chunks.length;
}

// Replace a deck's positional lessons with SEMANTIC, named ones from a
// grouping pass (see llm.js groupCardsIntoLessons). `groups` is an ordered
// array of { title, count } whose counts tile the ordered study cards exactly.
//
// Guarded so it only runs once: if the deck already has at least one lesson
// whose title isn't the generic "Lesson N", we assume it's been grouped and
// skip — so we never clobber semantic lessons or churn crown progress.
//
// Returns the number of lessons created, or 0 if skipped/invalid.
export async function regroupDeckLessons(deckId, groups) {
  if (!/^[\w-]{8,}$/.test(deckId || '')) return 0;
  if (!Array.isArray(groups) || !groups.length) return 0;

  // Already semantically grouped? (any non-"Lesson N" title) → skip.
  const titles = await sql`SELECT title FROM lessons WHERE deck_id = ${deckId}`;
  if (titles.some((t) => !/^Lesson \d+$/.test(t.title || ''))) return 0;

  // Ordered study cards (skip overview at position 0) — must match the order
  // the grouping pass saw.
  const cards = await sql`
    SELECT id FROM cards WHERE deck_id = ${deckId} AND position > 0 ORDER BY position
  `;
  const cardIds = cards.map((c) => c.id);
  const total = groups.reduce((s, g) => s + (g.count | 0), 0);
  if (!cardIds.length || total !== cardIds.length) return 0;   // counts must tile exactly

  // Build new lesson rows by slicing the ordered card list per group.
  const rows = [];
  let cursor = 0;
  groups.forEach((g, i) => {
    const ids = cardIds.slice(cursor, cursor + g.count);
    cursor += g.count;
    rows.push({
      deck_id: deckId, position: i,
      title: (g.title || `Lesson ${i + 1}`).slice(0, 80),
      card_ids: JSON.stringify(ids), card_count: ids.length,
    });
  });

  // Swap atomically-ish: delete old, insert new. (lesson_progress rows
  // reference the old lesson ids via FK CASCADE, so they clear — acceptable
  // pre-launch when there's no real progress yet; a future version would map
  // progress across by card overlap.)
  await sql`DELETE FROM lessons WHERE deck_id = ${deckId}`;
  await sql`
    INSERT INTO lessons (deck_id, position, title, card_ids, card_count)
    SELECT deck_id, position, title, card_ids::jsonb, card_count
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      AS t(deck_id uuid, position int, title text, card_ids text, card_count int)
  `;
  return rows.length;
}

// List a deck's lessons with this user's crown/progress + lock state.
// A lesson is "unlocked" if it's the first, or the previous lesson has crown ≥ 1.
export async function listLessonsWithProgress(deckId, userId) {
  if (!/^[\w-]{8,}$/.test(deckId || '')) return [];
  const rows = await sql`
    SELECT l.id, l.position, l.title, l.card_count,
           COALESCE(p.crown, 0)        AS crown,
           COALESCE(p.attempts, 0)     AS attempts,
           COALESCE(p.best_correct, 0) AS best_correct,
           p.last_score, p.completed_at
    FROM lessons l
    LEFT JOIN lesson_progress p
      ON p.lesson_id = l.id AND p.user_id = ${userId}
    WHERE l.deck_id = ${deckId}
    ORDER BY l.position
  `;
  // Compute unlock: first lesson always unlocked; others need prev crown ≥ 1.
  let prevCrown = 1; // seeds the first lesson as unlocked
  return rows.map((r, i) => {
    const unlocked = i === 0 || prevCrown >= 1;
    prevCrown = r.crown;
    return {
      id: r.id,
      position: r.position,
      title: r.title,
      cardCount: r.card_count,
      crown: r.crown,
      attempts: r.attempts,
      bestCorrect: r.best_correct,
      lastScore: r.last_score,
      completedAt: r.completed_at,
      unlocked,
    };
  });
}

// Fetch a single lesson's cards (full card rows) for the lesson screen.
// Ownership-checked via the deck join.
export async function getLessonCards(lessonId, userId) {
  if (!/^[\w-]{8,}$/.test(lessonId || '')) return null;
  const lrows = await sql`
    SELECT l.id, l.title, l.position, l.card_ids, l.deck_id, d.title AS deck_title, d.mode AS deck_mode
    FROM lessons l
    JOIN decks d ON d.id = l.deck_id
    WHERE l.id = ${lessonId} AND d.user_id = ${userId}
    LIMIT 1
  `;
  if (!lrows.length) return null;
  const lesson = lrows[0];
  const ids = Array.isArray(lesson.card_ids) ? lesson.card_ids : JSON.parse(lesson.card_ids || '[]');
  if (!ids.length) return { lesson, cards: [] };

  // Fetch the cards, preserving lesson order.
  const cards = await sql`
    SELECT id, position, type, importance, question, answer, hint, source_timestamp_seconds,
           mastery, review_count, interval_days, next_review_at
    FROM cards
    WHERE id = ANY(${ids})
  `;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  return { lesson, cards: ordered };
}

// Record a lesson attempt. Bumps crown when the pass clears PASS_RATIO.
// Returns the updated progress { crown, crownedUp, completedFirstTime }.
export async function recordLessonResult(userId, lessonId, correct, total) {
  if (!/^[\w-]{8,}$/.test(lessonId || '')) return null;
  // Confirm ownership + that the lesson exists.
  const own = await sql`
    SELECT l.id FROM lessons l JOIN decks d ON d.id = l.deck_id
    WHERE l.id = ${lessonId} AND d.user_id = ${userId} LIMIT 1
  `;
  if (!own.length) return null;

  const ratio = total > 0 ? correct / total : 0;
  const passed = ratio >= PASS_RATIO;

  // Read current progress
  const cur = (await sql`
    SELECT crown, attempts, best_correct, completed_at
    FROM lesson_progress WHERE user_id = ${userId} AND lesson_id = ${lessonId}
  `)[0] || { crown: 0, attempts: 0, best_correct: 0, completed_at: null };

  const newCrown = passed ? Math.min(MAX_CROWN, cur.crown + 1) : cur.crown;
  const crownedUp = newCrown > cur.crown;
  const completedFirstTime = !cur.completed_at && newCrown >= 1;

  await sql`
    INSERT INTO lesson_progress (user_id, lesson_id, crown, attempts, best_correct, last_score, completed_at, updated_at)
    VALUES (
      ${userId}, ${lessonId}, ${newCrown}, 1, ${correct}, ${correct},
      ${completedFirstTime ? new Date().toISOString() : null}, now()
    )
    ON CONFLICT (user_id, lesson_id) DO UPDATE SET
      crown        = ${newCrown},
      attempts     = lesson_progress.attempts + 1,
      best_correct = GREATEST(lesson_progress.best_correct, ${correct}),
      last_score   = ${correct},
      completed_at = COALESCE(lesson_progress.completed_at, ${completedFirstTime ? new Date().toISOString() : null}),
      updated_at   = now()
  `;

  return { crown: newCrown, crownedUp, completedFirstTime, passed };
}

// Deck-level summary for the deck list / dashboard: total lessons + crowns earned.
export async function deckLessonSummary(deckId, userId) {
  if (!/^[\w-]{8,}$/.test(deckId || '')) return { lessons: 0, crowns: 0, maxCrowns: 0 };
  const rows = await sql`
    SELECT count(l.id)::int AS lessons,
           COALESCE(SUM(COALESCE(p.crown, 0)), 0)::int AS crowns,
           (count(l.id) * ${MAX_CROWN})::int AS max_crowns
    FROM lessons l
    LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ${userId}
    WHERE l.deck_id = ${deckId}
  `;
  const r = rows[0] || {};
  return { lessons: r.lessons || 0, crowns: r.crowns || 0, maxCrowns: r.max_crowns || 0 };
}
