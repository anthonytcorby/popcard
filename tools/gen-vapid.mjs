// Generate a VAPID keypair for browser push notifications.
//
// One-time: run this, paste the two values into .env.local (and into the
// Vercel project env vars when deploying):
//   VAPID_PUBLIC_KEY=<base64url>
//   VAPID_PRIVATE_KEY=<base64url>
//   VAPID_SUBJECT=mailto:hello@popcard.me
//
// VAPID_PUBLIC_KEY is exposed to the browser (it's safe — it's literally a
// public key). VAPID_PRIVATE_KEY MUST stay server-only.
//
// Run: node tools/gen-vapid.mjs

import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('# Add these three lines to .env.local + Vercel env:');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:hello@popcard.me`);
console.log('');
console.log('# Once set, restart the dev server. The client picks up the public');
console.log('# key from /api/push/key on first push-enable.');
