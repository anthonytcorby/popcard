// Stock Knowledge Framework — serving + review helpers (Layer 1).
//
// TWO HARD RULES enforced here:
//   1. SERVING IS VERIFIED-ONLY. Every public read filters
//      review_status = 'verified'. Unverified/AI-generated stock content can
//      never reach the site through these functions. (Today nothing is
//      verified, so the serving functions return nothing — by design.)
//   2. REVIEW IS A PLUGGABLE SOCKET. A future reviewer — a human dashboard or
//      an AI agent — uses exactly two calls: getStockReviewQueue() to pull the
//      next items needing review, and recordStockReview() to submit a verdict.
//      The system is reviewer-agnostic: it does not care who calls them.
//
// This module is intentionally NOT wired to any route yet, so there is no
// surface that exposes unverified content.

import { sql } from './db.js';

const TERMINAL = ['verified', 'rejected'];   // statuses that exit the review queue

// =====================================================================
// SERVING (public) — verified content only
// =====================================================================

// Modules that have at least one verified card. Empty until review happens.
export async function listVerifiedModules() {
  return sql`
    SELECT m.id, m.slug, m.subject, m.level, m.qualification, m.exam_board,
           m.module, m.topic, m.title, m.description,
           (SELECT count(*) FROM stock_cards c
              WHERE c.module_id = m.id AND c.review_status = 'verified')::int AS card_count
    FROM stock_modules m
    WHERE EXISTS (
      SELECT 1 FROM stock_cards c
      WHERE c.module_id = m.id AND c.review_status = 'verified'
    )
    ORDER BY m.subject, m.position, m.title
  `;
}

// A single module with ONLY its verified cards + quizzes. Returns null if the
// module doesn't exist or has no verified cards (so it can't be surfaced yet).
export async function getVerifiedModule(slugOrId) {
  const byId = /^[0-9a-fA-F-]{16,}$/.test(slugOrId || '');
  const rows = byId
    ? await sql`SELECT * FROM stock_modules WHERE id = ${slugOrId} LIMIT 1`
    : await sql`SELECT * FROM stock_modules WHERE slug = ${slugOrId} LIMIT 1`;
  const module = rows[0];
  if (!module) return null;

  const cards = await sql`
    SELECT position, card_type AS type, question, answer, hint, difficulty
    FROM stock_cards
    WHERE module_id = ${module.id} AND review_status = 'verified'
    ORDER BY position
  `;
  if (!cards.length) return null;

  const quizzes = await sql`
    SELECT position, question, options, correct_index, explanation
    FROM stock_quiz_questions
    WHERE module_id = ${module.id} AND review_status = 'verified'
    ORDER BY position
  `;
  return { module, cards, quizzes };
}

// =====================================================================
// REVIEW SOCKET (admin / future AI agent) — the two calls a reviewer uses
// =====================================================================

// CALL 1 — pull the next batch of items still needing review.
export async function getStockReviewQueue({ limit = 20, itemType = 'card' } = {}) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  if (itemType === 'quiz') {
    return sql`
      SELECT q.id, 'quiz'::text AS item_type, q.module_id, q.question,
             q.options, q.correct_index, q.explanation, q.review_status, q.version,
             m.title AS module_title, m.subject, m.exam_board
      FROM stock_quiz_questions q JOIN stock_modules m ON m.id = q.module_id
      WHERE q.review_status NOT IN ('verified', 'rejected')
      ORDER BY q.module_id, q.position
      LIMIT ${lim}
    `;
  }
  return sql`
    SELECT c.id, 'card'::text AS item_type, c.module_id, c.card_type, c.question,
           c.answer, c.hint, c.difficulty, c.source_note, c.review_status, c.version,
           m.title AS module_title, m.subject, m.exam_board
    FROM stock_cards c JOIN stock_modules m ON m.id = c.module_id
    WHERE c.review_status NOT IN ('verified', 'rejected')
    ORDER BY c.module_id, c.position
    LIMIT ${lim}
  `;
}

// CALL 2 — submit a verdict on one item.
//   verdict: 'approve' | 'reject' | 'edit' | 'flag'
//   reviewer: e.g. 'ai:gpt-5-mini', 'human:teacher@school.uk', 'system'
//   edit (optional): { question, answer, hint, difficulty } for cards, or
//                    { question, options, correctIndex, explanation } for quizzes.
// Logs to stock_review_log and moves the item's review_status. 'edit' bumps the
// item's version. Returns the updated item's { id, review_status, version }.
export async function recordStockReview({
  itemType, itemId, reviewer, verdict,
  confidence = null, issues = null, suggestedFix = null,
  statusTo = null, edit = null,
}) {
  if (!['card', 'quiz', 'module'].includes(itemType)) throw new Error('bad itemType');
  if (!itemId || !reviewer || !verdict) throw new Error('itemId, reviewer, verdict required');

  const nextStatus = statusTo || ({
    approve: 'verified', reject: 'rejected', edit: 'human_reviewed', flag: null,
  })[verdict] || null;

  let statusFrom = null;
  let result = null;

  if (itemType === 'card') {
    const cur = (await sql`SELECT review_status, version FROM stock_cards WHERE id = ${itemId} LIMIT 1`)[0];
    if (!cur) throw new Error('card not found');
    statusFrom = cur.review_status;
    const bump = verdict === 'edit' ? cur.version + 1 : cur.version;
    const e = edit || {};
    result = (await sql`
      UPDATE stock_cards SET
        question   = COALESCE(${e.question ?? null}, question),
        answer     = COALESCE(${e.answer ?? null}, answer),
        hint       = COALESCE(${e.hint ?? null}, hint),
        difficulty = COALESCE(${e.difficulty ?? null}, difficulty),
        review_status = COALESCE(${nextStatus}, review_status),
        version    = ${bump},
        updated_at = now()
      WHERE id = ${itemId}
      RETURNING id, review_status, version
    `)[0];
  } else if (itemType === 'quiz') {
    const cur = (await sql`SELECT review_status, version FROM stock_quiz_questions WHERE id = ${itemId} LIMIT 1`)[0];
    if (!cur) throw new Error('quiz not found');
    statusFrom = cur.review_status;
    const bump = verdict === 'edit' ? cur.version + 1 : cur.version;
    const e = edit || {};
    result = (await sql`
      UPDATE stock_quiz_questions SET
        question      = COALESCE(${e.question ?? null}, question),
        options       = COALESCE(${e.options ? JSON.stringify(e.options) : null}::jsonb, options),
        correct_index = COALESCE(${e.correctIndex ?? null}, correct_index),
        explanation   = COALESCE(${e.explanation ?? null}, explanation),
        review_status = COALESCE(${nextStatus}, review_status),
        version       = ${bump}
      WHERE id = ${itemId}
      RETURNING id, review_status, version
    `)[0];
  } else {
    const cur = (await sql`SELECT 1 FROM stock_modules WHERE id = ${itemId} LIMIT 1`)[0];
    if (!cur) throw new Error('module not found');
    result = { id: itemId };
  }

  await sql`
    INSERT INTO stock_review_log (item_type, item_id, reviewer, verdict, confidence, issues, suggested_fix, status_from, status_to)
    VALUES (${itemType}, ${itemId}, ${reviewer}, ${verdict}, ${confidence}, ${issues}, ${suggestedFix}, ${statusFrom}, ${nextStatus})
  `;

  return result;
}

// Small dashboard helper: how much of each module is through the pipeline.
export async function stockReviewStats() {
  return sql`
    SELECT m.title, m.subject, m.exam_board,
           count(c.*)::int AS total,
           count(*) FILTER (WHERE c.review_status = 'verified')::int AS verified,
           count(*) FILTER (WHERE c.review_status = 'rejected')::int AS rejected,
           count(*) FILTER (WHERE c.review_status NOT IN ('verified','rejected'))::int AS pending
    FROM stock_modules m LEFT JOIN stock_cards c ON c.module_id = m.id
    GROUP BY m.id ORDER BY m.subject, m.title
  `;
}
