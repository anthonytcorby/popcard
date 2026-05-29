// Notifications helpers — used by event sources (/api/session, /api/pop, the
// scheduled-session cron in Sprint 2 #23, lesson crowns in Sprint 3) to drop
// a row into the user's notifications inbox.
//
// Server-side rule of thumb: ONLY create notifications for things the user
// would genuinely want to know about. We dedupe aggressively (same kind +
// same data within 24h is treated as a duplicate and dropped) so the bell
// doesn't become noise.

import { sql } from './db.js';

// Streak days that fire a milestone notification. Picked to feel rewarding
// without being constant (no 1/2/4/5-day spam).
export const STREAK_MILESTONES = new Set([3, 7, 14, 30, 50, 100, 200, 365]);

// Generic insert. Returns { id } or null if deduped/skipped.
export async function createNotification({ userId, kind, title, body = null, link = null, data = null }) {
  if (!userId || !kind || !title) return null;

  // Dedupe: same kind + same key fields (deckId / streak number / sessionId)
  // within the last 24h. We treat `data` as the dedupe key. Compare jsonb-to-
  // jsonb (not text-to-text) so spacing/key-ordering doesn't break the match.
  if (data) {
    const dataStr = JSON.stringify(data);
    const existing = await sql`
      SELECT id FROM notifications
      WHERE user_id = ${userId}
        AND kind = ${kind}
        AND data = ${dataStr}::jsonb
        AND created_at > now() - INTERVAL '24 hours'
      LIMIT 1
    `;
    if (existing.length) return null;
  }

  const rows = await sql`
    INSERT INTO notifications (user_id, kind, title, body, link, data)
    VALUES (${userId}, ${kind}, ${title}, ${body}, ${link}, ${data ? JSON.stringify(data) : null}::jsonb)
    RETURNING id
  `;
  return rows[0] || null;
}

// Streak milestone helper — called from /api/session after the streak update.
// Only fires when:
//   - dayChanged is true (the streak actually moved today)
//   - newStreakDays is in STREAK_MILESTONES
export async function maybeCreateStreakMilestone(userId, newStreakDays, dayChanged) {
  if (!dayChanged) return null;
  if (!STREAK_MILESTONES.has(newStreakDays)) return null;

  const titles = {
    3:   `3-day streak!`,
    7:   `One week. You're locked in.`,
    14:  `Two weeks straight. Pop is proud.`,
    30:  `30 days. You're a different person.`,
    50:  `50 days. Officially a streak nerd.`,
    100: `100 days. Triple digits.`,
    200: `200 days. Untouchable.`,
    365: `One full year. Maximum respect.`,
  };
  const bodies = {
    3:   'You showed up three days in a row. The hardest part is over.',
    7:   'A whole week. This is how habits stick.',
    14:  'Two weeks. Your brain is reorganising itself.',
    30:  'A full month. Whatever you studied this month, you remember.',
    50:  'Half a hundred. Few people make it this far.',
    100: 'Hundred-day club. Take a screenshot.',
    200: 'Two hundred days. You\'re in rare air.',
    365: 'A year of daily learning. There\'s nothing left to teach you about consistency.',
  };

  return createNotification({
    userId,
    kind: 'streak_milestone',
    title: titles[newStreakDays] || `${newStreakDays}-day streak!`,
    body:  bodies[newStreakDays] || `You\'ve studied ${newStreakDays} days in a row.`,
    link:  '/account',
    data:  { streak: newStreakDays },
  });
}

// Deck-ready helper — called from /api/pop after a successful generation.
// Surfaces the new deck so the user can jump in from the bell.
export async function createDeckReadyNotification(userId, deck) {
  if (!deck || !deck.id) return null;
  return createNotification({
    userId,
    kind: 'deck_ready',
    title: deck.title || 'Your deck is ready',
    body:  `${deck.card_count || deck.cardCount || ''} cards waiting${deck.from_cache ? ' (cached)' : ''}.`,
    link:  '/deck/' + deck.id,
    data:  { deckId: deck.id },
  });
}

// List inbox for the bell. Returns latest N (default 20), with unread count.
export async function listNotifications(userId, limit = 20) {
  const rows = await sql`
    SELECT id, kind, title, body, link, data, read_at, created_at
    FROM notifications
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${Math.min(50, Math.max(1, limit | 0))}
  `;
  const unread = await sql`
    SELECT count(*)::int AS n
    FROM notifications
    WHERE user_id = ${userId} AND read_at IS NULL
  `;
  return { items: rows, unreadCount: unread[0]?.n || 0 };
}

// Mark all unread as read for a user. Used when the bell dropdown opens.
export async function markAllRead(userId) {
  await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${userId} AND read_at IS NULL`;
}

// Mark a single notification read (e.g. user clicked through).
export async function markOneRead(userId, id) {
  await sql`UPDATE notifications SET read_at = now() WHERE id = ${id} AND user_id = ${userId} AND read_at IS NULL`;
}
