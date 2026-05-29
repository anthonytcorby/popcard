import crypto from 'node:crypto';
import { sql } from './db.js';
import { generateLessonsForDeck } from './lessons.js';

// Per-tier, per-mode monthly quota. Free users get a generous quick-pop bucket
// plus a single study-mode generation per month as a trial. Paid tiers get a
// generous shared cap across both modes (still high enough that no real user
// hits it, but caps runaway costs).
export const QUOTA = {
  free:  { simple: 10,  study: 1   },
  study: { simple: 100, study: 100 },
  // Legacy aliases — existing customers on these plans still get serviced.
  pro:   { simple: 100, study: 100 },
  team:  { simple: 100, study: 100 },
};

const DEFAULT_TYPE = 'idea';
const DEFAULT_IMPORTANCE = 'good_to_know';

function normalizeCard(c, i) {
  return {
    position: i,
    type: c.type || DEFAULT_TYPE,
    importance: c.importance || DEFAULT_IMPORTANCE,
    question: c.question,
    answer: c.answer,
    hint: c.hint || null,
    sourceTimestampSeconds:
      typeof c.sourceTimestampSeconds === 'number' && Number.isFinite(c.sourceTimestampSeconds)
        ? Math.max(0, Math.round(c.sourceTimestampSeconds))
        : null,
  };
}

// Bump PROMPT_VERSION when changing llm.js prompt/sizing so cached decks
// don't shadow the new generation behaviour.
const PROMPT_VERSION = 'v13';

export function hashSource({ sourceUrl, text, mode, language = 'en' }) {
  const key = `${PROMPT_VERSION}::${mode}::${language}::${sourceUrl || `text:${text}`}`;
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function monthlyPopCount(userId) {
  const rows = await sql`
    SELECT count(*)::int AS n
    FROM decks
    WHERE user_id = ${userId}
      AND created_at >= date_trunc('month', now())
  `;
  return rows[0]?.n || 0;
}

// Per-mode monthly pop count. Used for the per-mode quota check. 'simple' and
// 'study' are the two known modes; anything else falls through to a 0 count
// (defensive — shouldn't happen because pop.js normalises mode first).
export async function monthlyPopCountByMode(userId, mode) {
  const rows = await sql`
    SELECT count(*)::int AS n
    FROM decks
    WHERE user_id = ${userId}
      AND mode = ${mode}
      AND created_at >= date_trunc('month', now())
  `;
  return rows[0]?.n || 0;
}

export async function findCachedDeck({ sourceHash, mode }) {
  const rows = await sql`
    SELECT d.*,
      json_agg(
        json_build_object(
          'position', c.position,
          'type', c.type,
          'importance', c.importance,
          'question', c.question,
          'answer', c.answer,
          'hint', c.hint,
          'sourceTimestampSeconds', c.source_timestamp_seconds
        ) ORDER BY c.position
      ) AS cards
    FROM decks d
    JOIN cards c ON c.deck_id = d.id
    WHERE d.source_hash = ${sourceHash}
      AND d.mode = ${mode}
      AND d.from_cache = false
      AND d.created_at >= now() - interval '30 days'
    GROUP BY d.id
    ORDER BY d.created_at DESC
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function createDeck({
  userId,
  sourceType,
  sourceUrl,
  sourceHash,
  title,
  mode,
  model,
  fromCache,
  cards,
}) {
  const normalized = cards.map(normalizeCard);

  const deckRows = await sql`
    INSERT INTO decks (user_id, source_type, source_url, source_hash, title, mode, card_count, model, from_cache)
    VALUES (${userId}, ${sourceType}, ${sourceUrl}, ${sourceHash}, ${title}, ${mode}, ${normalized.length}, ${model}, ${fromCache})
    RETURNING *
  `;
  const deck = deckRows[0];

  if (normalized.length) {
    const values = normalized.map((c) => ({
      deck_id: deck.id,
      position: c.position,
      type: c.type,
      importance: c.importance,
      question: c.question,
      answer: c.answer,
      hint: c.hint,
      source_timestamp_seconds: c.sourceTimestampSeconds,
    }));
    await sql`
      INSERT INTO cards (deck_id, position, type, importance, question, answer, hint, source_timestamp_seconds)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb)
        AS t(deck_id uuid, position int, type text, importance text, question text, answer text, hint text, source_timestamp_seconds int)
    `;
  }

  // Auto-chunk into lessons (the Sprint 3 "path"). Reads the just-inserted
  // cards back by deck_id, so it runs after the card INSERT. Non-fatal: a
  // deck without lessons still works as a flat list.
  try { await generateLessonsForDeck(deck.id); }
  catch (e) { console.error('lesson generation failed for deck', deck.id, e?.message || e); }

  return { deck, cards: normalized };
}

// Cache a generated quiz on the deck row (jsonb). Owner-scoped.
export async function saveDeckQuiz(deckId, userId, quiz) {
  if (!/^[\w-]{8,}$/.test(deckId || '')) return null;
  const rows = await sql`
    UPDATE decks SET quiz = ${JSON.stringify(quiz)}::jsonb
    WHERE id = ${deckId} AND user_id = ${userId}
    RETURNING id
  `;
  return rows[0] || null;
}

// Persist a critique pass (the trust pass). `flagged` is an array of
// { cardId, confidence, issue } for the non-high cards only — high-confidence
// cards keep the default. Owner-scoped. Sets the deck's review_status +
// summary so the "Pop-checked" badge can render.
export async function saveDeckReview(deckId, userId, { flagged = [], total = 0 }) {
  if (!/^[\w-]{8,}$/.test(deckId || '')) return null;

  // Ownership check up front.
  const own = await sql`SELECT id FROM decks WHERE id = ${deckId} AND user_id = ${userId} LIMIT 1`;
  if (!own.length) return null;

  // Reset all this deck's cards to high (idempotent re-review), then flag.
  await sql`UPDATE cards SET confidence = 'high', flag_reason = NULL WHERE deck_id = ${deckId}`;
  for (const f of flagged) {
    if (!/^[\w-]{8,}$/.test(f.cardId || '')) continue;
    const conf = ['medium', 'low'].includes(f.confidence) ? f.confidence : 'high';
    if (conf === 'high') continue;
    await sql`
      UPDATE cards SET confidence = ${conf}, flag_reason = ${(f.issue || '').slice(0, 200) || null}
      WHERE id = ${f.cardId} AND deck_id = ${deckId}
    `;
  }

  const flaggedCount = flagged.filter((f) => f.confidence === 'medium' || f.confidence === 'low').length;
  const status = flaggedCount > 0 ? 'flagged' : 'checked';
  const summary = { reviewedAt: new Date().toISOString(), flaggedCount, total };

  const rows = await sql`
    UPDATE decks SET review_status = ${status}, review_data = ${JSON.stringify(summary)}::jsonb
    WHERE id = ${deckId} AND user_id = ${userId}
    RETURNING id, review_status
  `;
  return { ...(rows[0] || {}), flaggedCount, status };
}

export async function getDeckWithCards(deckId, userId) {
  // Validate it looks like a uuid before hitting Postgres (avoids 22P02 errors on bad input).
  if (!/^[\w-]{8,}$/.test(deckId || '')) return null;
  const rows = await sql`
    SELECT d.*,
      json_agg(
        json_build_object(
          'id', c.id,
          'position', c.position,
          'type', c.type,
          'importance', c.importance,
          'question', c.question,
          'answer', c.answer,
          'hint', c.hint,
          'sourceTimestampSeconds', c.source_timestamp_seconds,
          'mastery', c.mastery,
          'reviewCount', c.review_count,
          'intervalDays', c.interval_days,
          'nextReviewAt', c.next_review_at,
          'confidence', c.confidence,
          'flagReason', c.flag_reason
        ) ORDER BY c.position
      ) FILTER (WHERE c.id IS NOT NULL) AS cards
    FROM decks d
    LEFT JOIN cards c ON c.deck_id = d.id
    WHERE d.id = ${deckId}
      AND d.user_id = ${userId}
    GROUP BY d.id
  `;
  return rows[0] || null;
}

// Lightweight study-card fetch (id + position + Q/A) for the critique pass.
// Ordered, overview card excluded. Owner-scoped.
export async function getStudyCardsForReview(deckId, userId) {
  if (!/^[\w-]{8,}$/.test(deckId || '')) return [];
  return await sql`
    SELECT c.id, c.position, c.question, c.answer
    FROM cards c JOIN decks d ON d.id = c.deck_id
    WHERE c.deck_id = ${deckId} AND d.user_id = ${userId} AND c.position > 0
    ORDER BY c.position
  `;
}
