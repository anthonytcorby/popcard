import './_lib/env.js';
import { sql } from './_lib/db.js';
import { getSession } from './_lib/session.js';

// Returns cards due for review.
//   GET /api/review-queue                → cards due across ALL user's decks
//   GET /api/review-queue?deckId=<uuid>  → cards due in a specific deck
//
// "Due" = next_review_at IS NULL (never reviewed) OR next_review_at <= now.
// Capped at 50 cards per request so the UI session is finite.

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });

  const deckId = req.query?.deckId;
  const limit = 50;

  let rows;
  try {
  if (deckId) {
    if (!/^[\w-]{8,}$/.test(deckId)) return res.status(400).json({ error: 'Invalid deckId' });
    rows = await sql`
      SELECT c.id, c.deck_id, c.position, c.type, c.importance, c.question, c.answer,
             c.hint, c.source_timestamp_seconds, c.mastery, c.next_review_at,
             d.title AS deck_title, d.mode AS deck_mode, d.source_type AS deck_source_type,
             d.source_url AS deck_source_url
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      WHERE d.user_id = ${session.uid}
        AND d.id = ${deckId}
        AND (c.next_review_at IS NULL OR c.next_review_at <= NOW())
      ORDER BY c.next_review_at NULLS FIRST, c.position
      LIMIT ${limit}
    `;
  } else {
    rows = await sql`
      SELECT c.id, c.deck_id, c.position, c.type, c.importance, c.question, c.answer,
             c.hint, c.source_timestamp_seconds, c.mastery, c.next_review_at,
             d.title AS deck_title, d.mode AS deck_mode, d.source_type AS deck_source_type,
             d.source_url AS deck_source_url
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      WHERE d.user_id = ${session.uid}
        AND (c.next_review_at IS NULL OR c.next_review_at <= NOW())
      ORDER BY c.next_review_at NULLS FIRST, RANDOM()
      LIMIT ${limit}
    `;
  }

  // Also surface a quick summary: total due across all decks (for the
  // account-page badge).
  const summary = await sql`
    SELECT
      count(*)::int AS total_due,
      count(*) FILTER (WHERE c.mastery = 'new')::int        AS new_due,
      count(*) FILTER (WHERE c.mastery = 'learning')::int   AS learning_due,
      count(*) FILTER (WHERE c.mastery = 'reviewing')::int  AS reviewing_due
    FROM cards c
    JOIN decks d ON d.id = c.deck_id
    WHERE d.user_id = ${session.uid}
      AND (c.next_review_at IS NULL OR c.next_review_at <= NOW())
  `;

  res.status(200).json({
    cards: rows.map((r) => ({
      id: r.id,
      deckId: r.deck_id,
      deckTitle: r.deck_title,
      deckMode: r.deck_mode,
      sourceType: r.deck_source_type,
      sourceUrl: r.deck_source_url,
      position: r.position,
      type: r.type,
      importance: r.importance,
      question: r.question,
      answer: r.answer,
      hint: r.hint,
      sourceTimestampSeconds: r.source_timestamp_seconds,
      mastery: r.mastery,
      nextReviewAt: r.next_review_at,
    })),
    summary: summary[0] || { total_due: 0, new_due: 0, learning_due: 0, reviewing_due: 0 },
  });
  } catch (e) {
    // Most likely cause: the migration hasn't been run yet, so cards.mastery
    // (et al.) don't exist in the DB. Surface a friendly hint instead of
    // crashing the dev server.
    if (e?.code === '42703' || /column .* does not exist/i.test(e?.message || '')) {
      return res.status(503).json({
        error: 'migration_required',
        message: 'Spaced-repetition columns are missing. Run `node tools/migrate-spaced-rep.mjs` to enable review mode.',
      });
    }
    console.error('review-queue error', e);
    return res.status(500).json({ error: 'server_error', message: e.message || String(e) });
  }
}
