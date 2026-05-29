// /api/cron/notify — fired by Vercel cron every 5 min.
//
// Does two things, both idempotent (won't double-fire):
//
// 1. STREAK-AT-RISK reminder
//    Once per user per day, between 18:00–22:00 in the user's local hour,
//    if they have an active streak (≥1) but no session today, ping them.
//    Tracked via notifications dedupe (kind=streak_at_risk, data={date}).
//
// 2. SCHEDULED-SESSION reminder
//    For every scheduled_session with scheduled_at in the next 10 minutes
//    (and notified_at IS NULL), send the push + in-app notif, then stamp
//    notified_at so we don't re-fire.
//
// Auth: requires `Authorization: Bearer <CRON_SECRET>` header. Vercel cron
// auto-sets this when the cron's path is configured here. Local dev: pass
// the same header manually to test.

import '../_lib/env.js';
import { sql } from '../_lib/db.js';
import { sendToUser } from '../_lib/push.js';
import { createNotification } from '../_lib/notifications.js';

const CRON_SECRET = process.env.CRON_SECRET || 'dev-cron-secret';

export default async function handler(req, res) {
  // Vercel cron sends `Authorization: Bearer <CRON_SECRET>`
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const out = { streak: { sent: 0, skipped: 0 }, scheduled: { sent: 0, skipped: 0 } };

  // ---------- STREAK-AT-RISK reminders ----------
  // Pick users with an active streak who haven't logged a session today.
  // We don't know each user's timezone yet, so for v1 we send once anyone
  // hits this window in UTC — fine for the UK-launch audience (BST = UTC+1).
  // Sprint 4+ will add user_timezone column.
  try {
    const utcHour = new Date().getUTCHours();
    if (utcHour >= 17 && utcHour <= 21) {  // 6pm–10pm BST
      const candidates = await sql`
        SELECT u.id
        FROM users u
        WHERE u.streak_days > 0
          AND u.last_active_at < (now() AT TIME ZONE 'UTC')::date
          AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)
        LIMIT 500
      `;
      for (const u of candidates) {
        const today = new Date().toISOString().slice(0, 10);
        // Dedupe via notifications: createNotification returns null if a
        // matching streak_at_risk + same date already exists in 24h.
        const inserted = await createNotification({
          userId: u.id,
          kind:   'streak_at_risk',
          title:  'Streak at risk!',
          body:   'Pop a quick deck before midnight — your streak is on the line.',
          link:   '/account',
          data:   { date: today },
        });
        if (!inserted) { out.streak.skipped++; continue; }
        const pushRes = await sendToUser(u.id, {
          title: 'Don\'t break your streak',
          body:  'A 3-minute session is enough. Pop is rooting for you.',
          link:  '/practice',
        });
        if (pushRes.sent) out.streak.sent++; else out.streak.skipped++;
      }
    }
  } catch (e) { console.error('cron streak loop:', e); }

  // ---------- SCHEDULED-SESSION reminders ----------
  try {
    const due = await sql`
      SELECT s.id, s.user_id, s.scheduled_at, s.source_kind, s.source_deck_id, s.label,
             d.title AS deck_title
      FROM scheduled_sessions s
      LEFT JOIN decks d ON d.id = s.source_deck_id
      WHERE s.notified_at IS NULL
        AND s.cancelled_at IS NULL
        AND s.completed_at IS NULL
        AND s.scheduled_at <= now() + INTERVAL '10 minutes'
        AND s.scheduled_at >= now() - INTERVAL '5 minutes'
      LIMIT 200
    `;
    for (const s of due) {
      const label = s.label || s.deck_title || 'your scheduled session';
      const when = new Date(s.scheduled_at);
      const inMin = Math.max(0, Math.round((when.getTime() - Date.now()) / 60000));
      const body = inMin <= 0
        ? `${label} starts now.`
        : `${label} starts in ${inMin} min.`;
      await createNotification({
        userId: s.user_id,
        kind:   'session_starting',
        title:  'Heads up — study time',
        body,
        link:   s.source_deck_id ? `/deck/${s.source_deck_id}` : '/calendar',
        data:   { sessionId: s.id },
      });
      const pushRes = await sendToUser(s.user_id, {
        title: 'Study time soon ⏰',
        body,
        link:  s.source_deck_id ? `/deck/${s.source_deck_id}` : '/calendar',
      });
      await sql`UPDATE scheduled_sessions SET notified_at = now() WHERE id = ${s.id}`;
      if (pushRes.sent) out.scheduled.sent++; else out.scheduled.skipped++;
    }
  } catch (e) { console.error('cron scheduled loop:', e); }

  return res.status(200).json({ ok: true, ...out });
}
