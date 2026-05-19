import './_lib/env.js';
import { sql } from './_lib/db.js';
import { getSession } from './_lib/session.js';

// Simplified SM-2 spaced-repetition algorithm. Maps user rating (after seeing
// the answer) to a next-review interval and updates the card's mastery state.
// Ratings:
//   'again' — got it wrong, see again very soon (10 min)
//   'hard'  — got it but it was hard (short interval)
//   'good'  — got it, standard interval
//   'easy'  — got it easily, push out further

const RATINGS = new Set(['again', 'hard', 'good', 'easy']);
const MIN_EASE = 1.3;

function applyRating(card, rating) {
  // Card shape (from DB): { mastery, review_count, interval_days, ease }
  let { review_count = 0, interval_days = 0, ease = 2.5 } = card;
  let mastery;
  let intervalDays;

  if (rating === 'again') {
    mastery = 'new';
    intervalDays = 10 / (60 * 24); // 10 minutes in days
    ease = Math.max(MIN_EASE, ease - 0.2);
  } else if (rating === 'hard') {
    mastery = 'learning';
    intervalDays = Math.max(0.5, (interval_days || 1) * 1.2);
    ease = Math.max(MIN_EASE, ease - 0.15);
  } else if (rating === 'good') {
    mastery = review_count >= 2 ? 'reviewing' : 'learning';
    intervalDays = review_count === 0 ? 1 : Math.max(1, (interval_days || 1) * ease);
  } else {
    // easy
    mastery = review_count >= 1 ? 'mastered' : 'reviewing';
    intervalDays = review_count === 0 ? 3 : Math.max(3, (interval_days || 1) * ease * 1.5);
    ease = ease + 0.15;
  }

  return {
    mastery,
    review_count: review_count + 1,
    interval_days: intervalDays,
    ease,
    next_review_at: new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000),
    last_reviewed_at: new Date(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });

  const { cardId, rating } = req.body || {};
  if (!cardId) return res.status(400).json({ error: 'Missing cardId' });
  if (!RATINGS.has(rating)) return res.status(400).json({ error: 'Invalid rating' });

  try {
    // Ownership check + load existing state
    const rows = await sql`
      SELECT c.id, c.mastery, c.review_count, c.interval_days, c.ease
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      WHERE c.id = ${cardId} AND d.user_id = ${session.uid}
      LIMIT 1
    `;
    if (!rows.length) return res.status(404).json({ error: 'Card not found' });
    const card = rows[0];

    const next = applyRating(card, rating);

    await sql`
      UPDATE cards
      SET mastery = ${next.mastery},
          review_count = ${next.review_count},
          interval_days = ${next.interval_days},
          ease = ${next.ease},
          next_review_at = ${next.next_review_at.toISOString()},
          last_reviewed_at = ${next.last_reviewed_at.toISOString()}
      WHERE id = ${cardId}
    `;

    res.status(200).json({
      cardId,
      mastery: next.mastery,
      nextReviewAt: next.next_review_at.toISOString(),
      intervalDays: next.interval_days,
    });
  } catch (e) {
    if (e?.code === '42703' || /column .* does not exist/i.test(e?.message || '')) {
      return res.status(503).json({
        error: 'migration_required',
        message: 'Spaced-repetition columns are missing. Run `node tools/migrate-spaced-rep.mjs` to enable review mode.',
      });
    }
    console.error('review error', e);
    return res.status(500).json({ error: 'server_error', message: e.message || String(e) });
  }
}
