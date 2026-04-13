# Plan A — Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five independent bugs/quality issues: `.env.local` gitignore, Spotify URL regex, CardGrid re-render, extraction progress UX, and TikTok image fetch concurrency.

**Architecture:** All changes are isolated to existing files — no new files, no new dependencies. Each task is a surgical edit.

**Tech Stack:** TypeScript, React, Next.js 14 App Router, Tailwind CSS

---

## Chunk 1: Security & Simple Fixes

### Task 1: Add `.env.local` to `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Check current `.gitignore`**

Run: `cat .gitignore`
Expected: See if `.env.local` is already listed.

- [ ] **Step 2: Add `.env.local` if missing**

Open `.gitignore`. If `.env.local` is not present, add these lines after the existing env entries (or at the end of the env section):

```
# local env files — never commit secrets
.env.local
.env*.local
```

- [ ] **Step 3: Verify git status**

Run: `git status`
Expected: `.env.local` should NOT appear as a tracked or modified file going forward. If it is currently tracked, run:
```bash
git rm --cached .env.local
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: prevent .env.local from being committed"
```

---

### Task 2: Fix Spotify URL Regex (rejects shared links with `?si=` params)

**Files:**
- Modify: `components/UrlInput.tsx:29`

**Problem:** The regex `/^(https?:\/\/)?open\.spotify\.com\/episode\/[a-zA-Z0-9]{22}/` rejects real shared Spotify links like `https://open.spotify.com/episode/ABC123DEF456GHI789JKL0?si=abc123` because `?si=...` isn't matched.

- [ ] **Step 1: Open `components/UrlInput.tsx` and locate line 29**

The current regex is:
```ts
/^(https?:\/\/)?open\.spotify\.com\/episode\/[a-zA-Z0-9]{22}/
```

- [ ] **Step 2: Replace the regex**

Change the Spotify line inside `isValidUrl` from:
```ts
/^(https?:\/\/)?open\.spotify\.com\/episode\/[a-zA-Z0-9]{22}/
```
to:
```ts
/^(https?:\/\/)?open\.spotify\.com\/episode\/[a-zA-Z0-9]{22}(\?.*)?$/
```

The `(\?.*)?$` suffix allows (but doesn't require) a query string at the end.

- [ ] **Step 3: Verify by tracing logic**

Mentally check these cases:
- `https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk` → should match ✓
- `https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk?si=abc123` → should now match ✓
- `https://open.spotify.com/track/abc` → should NOT match ✓

- [ ] **Step 4: Commit**

```bash
git add components/UrlInput.tsx
git commit -m "fix: accept Spotify URLs with ?si= query params"
```

---

### Task 3: Memoize CardGrid filter computation

**Files:**
- Modify: `components/CardGrid.tsx:14-31`

**Problem:** `visible.filter()` and `filterable.filter()` run on every render. With 30+ cards this fires on every keystroke in the search box.

- [ ] **Step 1: Add `useMemo` import**

`components/CardGrid.tsx` has no existing React import (it uses `'use client'` at the top but only imports from `framer-motion` and local files). Add a new import **after line 1** (`'use client';`):

```ts
import { useMemo } from 'react';
```

Do NOT try to change an existing React import — there isn't one. Just insert this line between `'use client';` and the `framer-motion` import.

- [ ] **Step 2: Wrap the filter logic in `useMemo`**

Replace lines 14–31 (the `query`, `visible`, and `filterable` derivations) with:

```tsx
export default function CardGrid({ cards, filter, videoUrl, searchQuery = '' }: CardGridProps) {
  const query = searchQuery.toLowerCase().trim();

  const { visible, filterable } = useMemo(() => {
    let v = filter === 'ALL' ? cards : cards.filter(c => c.type === filter);

    if (query) {
      v = v.filter(c =>
        c.type === 'SECTION_HEADER' ||
        c.headline.toLowerCase().includes(query) ||
        c.body.toLowerCase().includes(query) ||
        (c.boldPhrase && c.boldPhrase.toLowerCase().includes(query))
      );
    }

    return { visible: v, filterable: v.filter(c => c.type !== 'SECTION_HEADER') };
  }, [cards, filter, query]);
```

- [ ] **Step 3: Verify the rest of the component still references `visible` and `filterable` correctly**

The `if (filterable.length === 0)` block and the `visible.map(...)` call should work unchanged.

- [ ] **Step 4: Commit**

```bash
git add components/CardGrid.tsx
git commit -m "perf: memoize CardGrid filter+search computation"
```

---

## Chunk 2: UX Improvements

### Task 4: Show card count during loading (extraction progress)

**Files:**
- Modify: `app/page.tsx:333-350` (the loading spinner section)

**Problem:** During the initial loading phase (before the first card arrives), users see a generic spinner with no feedback. Once cards stream in, the count appears but the transition is abrupt.

**Goal:** Show a status line like "Analyzing transcript..." → "3 cards found so far..." as cards arrive.

- [ ] **Step 1: Add a `progressCount` derived value**

In `app/page.tsx`, the `filterableCards` count is already computed on line 236. We just need to surface it during loading.

Locate the loading block (around line 333):
```tsx
{appState === 'loading' && cards.length === 0 && (
  <motion.div ...>
    <LoadingBubbles />
    <div className="flex justify-center">
      <button onClick={handleCancel} ...>Cancel</button>
    </div>
  </motion.div>
)}
```

- [ ] **Step 2: Replace the loading block with a version that shows progress**

```tsx
{appState === 'loading' && cards.length === 0 && (
  <motion.div
    key="loading"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0, transition: { duration: 0.2 } }}
    className="flex flex-col items-center gap-3 py-16"
  >
    <LoadingBubbles />
    <p className="text-sm text-gray-400 animate-pulse">Analyzing transcript...</p>
    <button
      onClick={handleCancel}
      className="mt-1 text-sm text-gray-400 hover:text-gray-600 transition-colors"
    >
      Cancel
    </button>
  </motion.div>
)}
```

- [ ] **Step 3: Update the "loading more" counter line to be more informative**

Find the count line around line 401:
```tsx
<p className="text-xs text-gray-400 mb-5">
  {filterableCards.length} card{filterableCards.length !== 1 ? 's' : ''} popped
  {appState === 'loading' && ' · loading more…'}
</p>
```

Replace with:
```tsx
<p className="text-xs text-gray-400 mb-5">
  {filterableCards.length} card{filterableCards.length !== 1 ? 's' : ''} found
  {appState === 'loading' ? (
    <span className="animate-pulse"> · extracting more...</span>
  ) : null}
</p>
```

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "ux: show extraction progress and card count during streaming"
```

---

### Task 5: Concurrency-limit TikTok storyboard image loading

**Files:**
- Modify: `app/tiktok/page.tsx` (around line 157–165, inside `fetchStoryboardFrames`)

**Problem:** `await Promise.all(sheetUrls.map(url => loadImage(url)))` fires all sheet image loads simultaneously. For a 10-slide deck this could be 10+ parallel image requests, overwhelming the browser and causing CORS timeouts.

**Goal:** Limit concurrent image loads to 3 at a time using a worker pool pattern (no new dependency needed).

- [ ] **Step 1: Add a `withConcurrency` helper above `fetchStoryboardFrames`**

In `app/tiktok/page.tsx`, before the `fetchStoryboardFrames` function, add:

```ts
/** Run `fn` on each item with at most `limit` concurrent executions. */
async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const queue = items.map((item, i) => ({ item, i }));
  let next = 0;

  async function worker() {
    while (next < queue.length) {
      const { item, i } = queue[next++];
      results[i] = await fn(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
```

- [ ] **Step 2: Replace the unconstrained `Promise.all` in `fetchStoryboardFrames`**

Find the code that loads sheet images (around line 157-164 in `fetchStoryboardFrames`):
```ts
const sheetUrls = [...new Set(frames.map(f => f.sheetUrl))];
const sheetImages = new Map<string, HTMLImageElement>();

await Promise.all(
  sheetUrls.map(async url => {
    const img = await loadImage(url);
    sheetImages.set(url, img);
  })
);
```

Replace the `await Promise.all(...)` block with:
```ts
const sheetUrls = [...new Set(frames.map(f => f.sheetUrl))];
const sheetImages = new Map<string, HTMLImageElement>();

await withConcurrency(sheetUrls, 3, async (url) => {
  try {
    const img = await loadImage(url);
    sheetImages.set(url, img);
  } catch { /* skip sheets that fail to load */ }
});
```

**Important:** The `try/catch` inside the callback is required. The original code had per-item error handling so a single bad URL doesn't abort the rest. The `withConcurrency` helper does not swallow errors — without this guard, one failed image load would propagate and cancel the remaining worker slots.

- [ ] **Step 3: Verify no other unconstrained `Promise.all` on image loads**

Search for other `Promise.all` usages in the file and confirm they're either already sequential or don't involve image loading.

- [ ] **Step 4: Commit**

```bash
git add app/tiktok/page.tsx
git commit -m "perf: limit TikTok storyboard image loads to 3 concurrent"
```

---
