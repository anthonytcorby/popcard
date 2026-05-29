// Run EVERY migration in order, idempotently. One command to make a fresh or
// existing database fully current. Safe to re-run any time — each migration
// uses CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
//
// Usage:  node tools/migrate-all.mjs   (or: npm run db:migrate:all)
//
// Order matters where a later migration references an earlier table/column.
// Base schema (users/decks/cards) is assumed to already exist from the
// initial Neon setup; migrate-cards-phase1 is the earliest additive one.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Ordered list. Backfills run after their schema migration.
const MIGRATIONS = [
  'migrate-cards-phase1.mjs',
  'migrate-pinned.mjs',
  'migrate-onboarding.mjs',
  'migrate-dashboard.mjs',
  'migrate-spaced-rep.mjs',
  'migrate-stock-knowledge.mjs',
  'migrate-deck-quiz.mjs',
  'migrate-sessions.mjs',
  'migrate-scheduled-sessions.mjs',
  'migrate-notifications.mjs',
  'migrate-push.mjs',
  'migrate-lessons.mjs',
  'migrate-deck-review.mjs',
];

console.log(`\n=== Popcard: running ${MIGRATIONS.length} migrations ===\n`);

let failed = 0;
for (const m of MIGRATIONS) {
  process.stdout.write(`→ ${m} … `);
  const res = spawnSync(process.execPath, [path.join(here, m)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (res.status === 0) {
    console.log('ok');
  } else {
    failed++;
    console.log('FAILED');
    if (res.stdout) console.log(res.stdout.trim());
    if (res.stderr) console.log(res.stderr.trim());
  }
}

console.log('');
if (failed === 0) {
  console.log('=== All migrations applied cleanly. Database is current. ===\n');
  console.log('Optional backfills (run once, after deploy, if you have existing decks):');
  console.log('  npm run db:backfill:quiz      # generate quizzes for old decks');
  console.log('  npm run db:backfill:lessons   # chunk old decks into lessons');
} else {
  console.log(`=== ${failed} migration(s) failed — see output above. ===`);
  process.exit(1);
}
