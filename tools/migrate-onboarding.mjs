// Adds onboarding-preference columns to the users table.
//
//   topic_interests    text  (JSON-encoded array; small enough to skip JSONB)
//   default_mode       text  (enum: 'quick' | 'study')
//   preferred_language text  (enum: 'en' | 'es' | ... 10 supported languages)
//
// Idempotent — uses ADD COLUMN IF NOT EXISTS so re-running is safe.
//
// Run: `node tools/migrate-onboarding.mjs` from the project root.
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

// Read POSTGRES_URL from .env.local (consistent with the other migrations and
// works when spawned by migrate-all.mjs). Falls back to process.env if set.
let url = process.env.POSTGRES_URL;
if (!url) {
  try {
    const env = fs.readFileSync('.env.local', 'utf8');
    url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
  } catch {}
}
if (!url) {
  console.error('POSTGRES_URL not set. Make sure .env.local has it.');
  process.exit(1);
}

const sql = neon(url);

async function run() {
  console.log('Adding onboarding columns to users…');
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS topic_interests text`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_mode text`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language text`;
  console.log('Done.');
}

run().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
