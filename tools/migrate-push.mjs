// push_subscriptions migration — one row per device that's opted in to push.
// A user can have multiple subscriptions (phone + laptop + tablet).
//
// We store the raw subscription JSON the browser hands us (endpoint, p256dh,
// auth keys) so api/_lib/push.js can hand it straight to web-push.
//
// Reads POSTGRES_URL from .env.local. Idempotent.

import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) { console.error('POSTGRES_URL not in .env.local'); process.exit(1); }
const sql = neon(url);

console.log('Creating push_subscriptions table…');
await sql`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint         text        NOT NULL,
    p256dh           text        NOT NULL,
    auth             text        NOT NULL,
    user_agent       text,
    last_success_at  timestamptz,
    last_error       text,
    last_error_at    timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, endpoint)
  )
`;
await sql`CREATE INDEX IF NOT EXISTS push_user_idx ON push_subscriptions (user_id)`;

console.log('Done.');
