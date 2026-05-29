// Study session helpers.
//
// A "session" is one completed unit of learning activity:
//   - practice: an N-card flip/grade run from /practice
//   - quiz:     a round in /quizzes
//   - lesson:   an 8-card lesson run (Sprint 3+)
//
// Everything that drives gamification (streaks, sparks, daily quest) starts
// from a row in study_sessions. The pop flow itself doesn't create a session
// row (popping a deck isn't "studying"); it bumps daily_activity.decks_popped
// separately via recordDeckPop().
//
// The server is the source of truth: clients suggest cards_reviewed and
// correct_count, the server decides sparks_earned. This stops a malicious
// client from inflating its own XP.

import { sql } from './db.js';

// Valid source values for study_sessions.source — kept in sync with the
// places that POST to /api/session.
export const SESSION_SOURCES = new Set(['practice', 'quiz', 'lesson']);

// Sparks award table. Keep these conservative for now — we can tune up after
// we see real session distributions. Sparks are integers; no fractional XP.
//
//   practice: 1 spark per card graded (cap at 30 to discourage marathon runs)
//   quiz:     2 sparks per correct answer (no participation points)
//   lesson:   3 sparks per card on first completion, 1 spark on strengthen
//             (Sprint 3 — lesson logic computes this client-side then submits)
//
// All paths get a small completion bonus so finishing matters more than
// quitting halfway through.
export function computeSparks({ source, cardsReviewed = 0, correctCount = 0, fresh = true }) {
  const reviewed = Math.max(0, Math.min(60, cardsReviewed | 0));
  const correct  = Math.max(0, Math.min(reviewed, correctCount | 0));
  let base = 0;
  if (source === 'practice') base = Math.min(30, reviewed);
  else if (source === 'quiz') base = correct * 2;
  else if (source === 'lesson') base = (fresh ? 3 : 1) * reviewed;
  const completion = reviewed >= 5 ? 5 : 0;
  return base + completion;
}

// Record a completed session. Inserts the row, returns { id, sparksEarned }.
// Caller is expected to then call applyStreakAndDaily() (Sprint 1 #27/#28)
// to update aggregates — done in api/session.js so this helper stays simple.
export async function recordSession({
  userId,
  deckId = null,
  source,
  mode = null,
  cardsReviewed = 0,
  correctCount = 0,
  durationMs = null,
  fresh = true,
}) {
  if (!SESSION_SOURCES.has(source)) {
    throw new Error(`Invalid session source: ${source}`);
  }
  const sparksEarned = computeSparks({ source, cardsReviewed, correctCount, fresh });

  const rows = await sql`
    INSERT INTO study_sessions
      (user_id, deck_id, source, mode, cards_reviewed, correct_count, sparks_earned, duration_ms)
    VALUES
      (${userId}, ${deckId}, ${source}, ${mode}, ${cardsReviewed | 0}, ${correctCount | 0},
       ${sparksEarned}, ${durationMs == null ? null : durationMs | 0})
    RETURNING id, sparks_earned
  `;
  return { id: rows[0].id, sparksEarned: rows[0].sparks_earned };
}

// Today's session count for a user (used by quest progress + cooldowns).
export async function todaySessionCount(userId) {
  const rows = await sql`
    SELECT count(*)::int AS n
    FROM study_sessions
    WHERE user_id = ${userId}
      AND completed_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
  `;
  return rows[0]?.n || 0;
}

// Bump today's decks_popped counter. Popping a deck isn't a "session" (no
// cards graded yet), but it IS daily activity that the quest ring should
// reflect. Called from /api/pop after a successful create.
export async function recordDeckPop(userId) {
  await sql`
    INSERT INTO daily_activity (user_id, activity_date, decks_popped)
    VALUES (${userId}, (now() AT TIME ZONE 'UTC')::date, 1)
    ON CONFLICT (user_id, activity_date) DO UPDATE SET
      decks_popped = daily_activity.decks_popped + 1
  `;
}

// Most-recent sessions, newest first. Used by the in-app bell + dashboard.
export async function recentSessions(userId, limit = 10) {
  const rows = await sql`
    SELECT s.id, s.deck_id, s.source, s.mode, s.cards_reviewed,
           s.correct_count, s.sparks_earned, s.completed_at,
           d.title AS deck_title
    FROM study_sessions s
    LEFT JOIN decks d ON d.id = s.deck_id
    WHERE s.user_id = ${userId}
    ORDER BY s.completed_at DESC
    LIMIT ${Math.min(50, Math.max(1, limit | 0))}
  `;
  return rows;
}
