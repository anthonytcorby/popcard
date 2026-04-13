# Plan B — Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Zod request validation to all API routes, replace the in-memory rate limiter with a production-grade Upstash Redis sliding-window limiter, and add unit tests for core utility functions.

**Architecture:** Zod schemas live alongside the routes that use them. The rate-limit module gets a drop-in replacement backed by `@upstash/ratelimit`. Tests use Vitest (zero-config with Next.js, runs outside the browser).

**Tech Stack:** Zod 3, @upstash/ratelimit, @upstash/redis, Vitest

**Prerequisites:**
- Create a free [Upstash](https://upstash.com) Redis database
- Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to `.env.local` and Vercel environment variables

---

## Chunk 1: Install dependencies & Zod validation

### Task 1: Install new packages

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install Zod and Upstash packages**

```bash
npm install zod @upstash/redis @upstash/ratelimit
```

- [ ] **Step 2: Install Vitest for testing**

```bash
npm install --save-dev vitest @vitest/coverage-v8
```

- [ ] **Step 3: Add a test script to `package.json`**

In `package.json`, add to the `"scripts"` section:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create `vitest.config.ts` at the project root**

Without this, the `@/` path aliases from `tsconfig.json` won't resolve during test runs — any test that (directly or transitively) uses `@/` imports will fail.

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add zod, upstash, vitest dependencies and vitest config"
```

---

### Task 2: Add Zod schema to `/api/extract`

**Files:**
- Modify: `app/api/extract/route.ts`

**Problem:** `await req.json()` is called without validating the shape. If `transcript` is missing or `videoId` is the wrong type, the error is unhandled.

- [ ] **Step 1: Add Zod import and schema at the top of `app/api/extract/route.ts`**

After the existing imports, add:
```ts
import { z } from 'zod';

const ExtractBody = z.object({
  transcript: z.string().min(1, 'transcript is required'),
  videoId: z.string().optional(),
});
```

- [ ] **Step 2: Replace the raw `req.json()` call with validated parsing**

Find (around line 16-20):
```ts
const { transcript, videoId } = await req.json();

if (!transcript) {
  return new Response(JSON.stringify({ error: 'No transcript provided.' }), { status: 400 });
}
```

Replace with:
```ts
const body = await req.json().catch(() => null);
const parsed = ExtractBody.safeParse(body);
if (!parsed.success) {
  return new Response(
    JSON.stringify({ error: 'invalid_request', message: parsed.error.issues[0]?.message ?? 'Invalid request body.' }),
    { status: 400 }
  );
}
const { transcript, videoId } = parsed.data;
```

- [ ] **Step 3: Commit**

```bash
git add app/api/extract/route.ts
git commit -m "feat: add Zod validation to /api/extract"
```

---

### Task 3: Add Zod schema to `/api/transcript`

**Files:**
- Modify: `app/api/transcript/route.ts`

- [ ] **Step 1: Read the current request parsing in `app/api/transcript/route.ts`**

Find the `req.json()` call and the `url` extraction.

- [ ] **Step 2: Add Zod import and schema**

```ts
import { z } from 'zod';

const TranscriptBody = z.object({
  url: z.string().url('Must be a valid URL'),
});
```

- [ ] **Step 3: Replace the raw `req.json()` call**

```ts
const body = await req.json().catch(() => null);
const parsed = TranscriptBody.safeParse(body);
if (!parsed.success) {
  return Response.json(
    { error: 'invalid_request', message: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
    { status: 400 }
  );
}
const { url } = parsed.data;
```

- [ ] **Step 4: Commit**

```bash
git add app/api/transcript/route.ts
git commit -m "feat: add Zod validation to /api/transcript"
```

---

### Task 4: Add Zod schema to `/api/tiktok/caption`

**Files:**
- Modify: `app/api/tiktok/caption/route.ts`

- [ ] **Step 1: Read the request parsing in `app/api/tiktok/caption/route.ts`**

Identify what fields are expected from `req.json()`.

- [ ] **Step 2: Add Zod import and schema**

The route uses `title`, `channelName`, and `cards` from the request body. `channelName` is included in the AI prompt and must not be dropped. Only validate the fields the route actually uses:

```ts
import { z } from 'zod';

const CaptionBody = z.object({
  title: z.string().min(1),
  channelName: z.string().optional(),
  cards: z.array(z.object({
    type: z.string(),
    headline: z.string(),
    body: z.string(),
  })).min(1, 'At least one card is required'),
});
```

Note: `id`, `boldPhrase`, and `timestamp` are omitted — this route doesn't use them. `channelName` is optional since not all sources have a channel name.

- [ ] **Step 3: Replace raw parsing with validated parsing**

```ts
const body = await req.json().catch(() => null);
const parsed = CaptionBody.safeParse(body);
if (!parsed.success) {
  return Response.json(
    { error: 'invalid_request', message: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
    { status: 400 }
  );
}
const { title, channelName, cards } = parsed.data;
```

- [ ] **Step 4: Commit**

```bash
git add app/api/tiktok/caption/route.ts
git commit -m "feat: add Zod validation to /api/tiktok/caption"
```

---

## Chunk 2: Upstash Redis Rate Limiter

### Task 5: Replace in-memory rate limiter with Upstash Redis

**Files:**
- Modify: `lib/rate-limit.ts`
- Modify: `app/api/extract/route.ts` (update call site)

**Problem:** `lib/rate-limit.ts` uses a `Map` that resets on cold starts and doesn't span Vercel serverless instances.

**Goal:** Drop-in replacement using `@upstash/ratelimit` with the same call signature.

- [ ] **Step 1: Add Upstash credentials to `.env.local`**

```
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

Get these from the [Upstash Console](https://console.upstash.com) after creating a free Redis database.

- [ ] **Step 2: Rewrite `lib/rate-limit.ts`**

Replace the entire file contents with:

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Lazily instantiated so the module doesn't throw at import time if env vars are missing
let limiter: Ratelimit | null = null;

function getLimiter(): Ratelimit | null {
  if (limiter) return limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    analytics: false,
  });
  return limiter;
}

export async function rateLimit(
  key: string,
): Promise<{ ok: boolean; remaining: number }> {
  const l = getLimiter();
  // If Upstash isn't configured (e.g. local dev without .env), allow all requests
  if (!l) return { ok: true, remaining: 999 };
  const { success, remaining } = await l.limit(key);
  return { ok: success, remaining };
}
```

**Note:** The new `rateLimit` is async. All call sites must be updated with `await`.

- [ ] **Step 3: Update all three API routes that call `rateLimit`**

There are exactly three call sites. Update each one:

**`app/api/extract/route.ts` (line 11):**
Find: `const { ok } = rateLimit(ip, 60_000, 10);`
Replace with: `const { ok } = await rateLimit(ip);`

**`app/api/transcript/route.ts`** — find the `rateLimit(...)` call (around line 30):
Find: `const { ok } = rateLimit(ip, 60_000, 10);` (or similar)
Replace with: `const { ok } = await rateLimit(ip);`

**`app/api/tiktok/caption/route.ts`** — find the `rateLimit(...)` call (around line 56):
Find: `const { ok } = rateLimit(ip, 60_000, 10);` (or similar)
Replace with: `const { ok } = await rateLimit(ip);`

Confirm no other usages:
```bash
grep -r "rateLimit(" app/api --include="*.ts"
```
Expected: only these three files, now all using `await rateLimit(ip)`.

- [ ] **Step 5: Verify local dev still works without Upstash credentials**

With `UPSTASH_REDIS_REST_URL` unset, `getLimiter()` returns `null` and all requests pass through. Confirm this by running `npm run dev` and submitting a URL.

- [ ] **Step 6: Commit**

```bash
git add lib/rate-limit.ts app/api/extract/route.ts
git commit -m "feat: replace in-memory rate limiter with Upstash Redis sliding window"
```

---

## Chunk 3: Unit Tests

### Task 6: Tests for `lib/rate-limit.ts` (in-memory fallback path)

**Files:**
- Create: `lib/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Create the test file**

```ts
// lib/__tests__/rate-limit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the fallback path (no Upstash env vars) by ensuring the module
// resolves without throwing and returns ok:true when unconfigured.

describe('rateLimit (fallback mode)', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
  });

  it('returns ok:true when Upstash is not configured', async () => {
    const { rateLimit } = await import('../rate-limit');
    const result = await rateLimit('test-ip');
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(999);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npm test lib/__tests__/rate-limit.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/__tests__/rate-limit.test.ts
git commit -m "test: unit test for rate-limit fallback mode"
```

---

### Task 7: Tests for `lib/chunker.ts`

**Files:**
- Create: `lib/__tests__/chunker.test.ts`

- [ ] **Step 1: Read `lib/chunker.ts` to understand its API**

Run: `cat lib/chunker.ts`
Note the exported function name, input type, and return type.

- [ ] **Step 2: Write tests covering the key behaviours**

```ts
// lib/__tests__/chunker.test.ts
import { describe, it, expect } from 'vitest';
import { chunkTranscript } from '../chunker'; // actual export name is chunkTranscript

describe('chunkTranscript', () => {
  it('returns a single chunk for short input', () => {
    const text = 'Hello world. This is a short transcript.';
    const chunks = chunkTranscript(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Hello world');
  });

  it('splits long text into multiple chunks', () => {
    // ~6000 words — exceeds WORDS_PER_CHUNK (1100) so must produce multiple chunks
    const sentence = 'This is a test sentence with six words. ';
    const text = sentence.repeat(800);
    const chunks = chunkTranscript(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('does not produce empty chunks', () => {
    const text = 'Word '.repeat(2000);
    const chunks = chunkTranscript(text);
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
npm test lib/__tests__/chunker.test.ts
```

Expected: PASS (adjust if chunker's export name differs)

- [ ] **Step 4: Commit**

```bash
git add lib/__tests__/chunker.test.ts
git commit -m "test: unit tests for chunker"
```

---

### Task 8: Tests for `lib/deduplicator.ts`

**Files:**
- Create: `lib/__tests__/deduplicator.test.ts`

- [ ] **Step 1: Read `lib/deduplicator.ts` to understand its API**

Run: `cat lib/deduplicator.ts`

- [ ] **Step 2: Write tests**

```ts
// lib/__tests__/deduplicator.test.ts
import { describe, it, expect } from 'vitest';
import { deduplicateCards } from '../deduplicator'; // adjust to actual export

const makeCard = (id: string, headline: string, body: string) => ({
  id,
  type: 'KEY_INSIGHT' as const,
  headline,
  body,
});

describe('deduplicateCards', () => {
  it('returns all cards when there are no duplicates', () => {
    const cards = [
      makeCard('1', 'First insight', 'Some unique body text here'),
      makeCard('2', 'Second insight', 'Completely different content'),
    ];
    expect(deduplicateCards(cards)).toHaveLength(2);
  });

  it('removes near-duplicate cards', () => {
    const cards = [
      makeCard('1', 'Focus is the superpower', 'Deep work is essential for success in modern knowledge work.'),
      makeCard('2', 'Focus is the superpower of 21st century', 'Deep work is essential for success in modern knowledge work.'),
    ];
    const result = deduplicateCards(cards);
    expect(result.length).toBeLessThan(2);
  });

  it('preserves cards that are sufficiently different', () => {
    const cards = [
      makeCard('1', 'Exercise improves cognition', 'Physical activity increases BDNF and neuroplasticity.'),
      makeCard('2', 'Sleep is critical for memory', 'During REM sleep the brain consolidates learning into long-term memory.'),
    ];
    expect(deduplicateCards(cards)).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
npm test lib/__tests__/deduplicator.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/__tests__/deduplicator.test.ts
git commit -m "test: unit tests for deduplicator"
```

---
