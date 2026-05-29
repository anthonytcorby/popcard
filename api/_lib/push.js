// Browser push helpers (web-push library).
//
// VAPID keys live in env (see tools/gen-vapid.mjs). The public key is
// surfaced via GET /api/push/key so the client doesn't have to hardcode it.
// All sends are best-effort: a 410 from the push service means the
// subscription is dead → we delete the row so we stop trying.

import webpush from 'web-push';
import { sql } from './db.js';

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || 'mailto:hello@popcard.me';
  if (!pub || !priv) {
    console.warn('[push] VAPID keys not set — push disabled. Run `npm run gen:vapid` and add to .env.local.');
    return false;
  }
  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
  return true;
}

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

// Upsert a subscription row for this user. Idempotent on (user_id, endpoint).
export async function saveSubscription(userId, sub, userAgent = null) {
  if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error('Invalid subscription shape');
  }
  const rows = await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES (${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${userAgent})
    ON CONFLICT (user_id, endpoint) DO UPDATE SET
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent
    RETURNING id
  `;
  return rows[0];
}

export async function removeSubscription(userId, endpoint) {
  await sql`DELETE FROM push_subscriptions WHERE user_id = ${userId} AND endpoint = ${endpoint}`;
}

export async function listSubscriptions(userId) {
  return await sql`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}`;
}

// Send a payload to every device a user has subscribed. Dead subscriptions
// (410 Gone, 404) are auto-purged. Returns { sent, failed }.
export async function sendToUser(userId, payload) {
  if (!configure()) return { sent: 0, failed: 0, reason: 'no_vapid' };

  const subs = await listSubscriptions(userId);
  if (!subs.length) return { sent: 0, failed: 0, reason: 'no_subscriptions' };

  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  let sent = 0, failed = 0;

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: 60 * 60 * 24 }   // 24h max — yesterday's reminder is useless today
      );
      await sql`UPDATE push_subscriptions SET last_success_at = now(), last_error = NULL WHERE id = ${s.id}`;
      sent++;
    } catch (err) {
      failed++;
      const status = err?.statusCode;
      if (status === 410 || status === 404) {
        // Subscription is gone — stop trying
        await sql`DELETE FROM push_subscriptions WHERE id = ${s.id}`;
      } else {
        await sql`UPDATE push_subscriptions SET last_error = ${String(err?.message || err).slice(0, 500)}, last_error_at = now() WHERE id = ${s.id}`;
      }
    }
  }));

  return { sent, failed };
}
