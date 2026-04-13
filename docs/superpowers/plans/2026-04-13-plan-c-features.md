# Plan C — Features Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three user-facing features: (1) session history persisted to localStorage, (2) multi-source merge so users can combine cards from multiple URLs/files, (3) shareable deck URLs via Vercel KV.

**Architecture:**
- History lives entirely in the browser (localStorage, no backend). A `useHistory` hook manages it.
- Multi-source merge extends `app/page.tsx` state: users queue multiple sources before extracting; cards from each are merged and deduplicated.
- Shareable decks add one new API route (`/api/deck`) backed by Vercel KV. The deck ID is a nanoid short hash stored with a 7-day TTL.

**Tech Stack:** localStorage, Vercel KV (`@vercel/kv`), nanoid

**Prerequisites for shareable decks:**
- Run `vercel link` to connect your local project to Vercel
- Run `vercel env pull` to get KV credentials locally
- Or add `KV_REST_API_URL` and `KV_REST_API_TOKEN` to `.env.local` manually from the Vercel dashboard after enabling the KV integration

---

## Chunk 1: Session History (localStorage)

### Task 1: Create the `useHistory` hook

**Files:**
- Create: `lib/useHistory.ts`

**Design:** Each history entry stores the video/source title, URL, thumbnail, card count, and the full cards+takeaways arrays. Capped at 10 entries (oldest removed first). Uses `JSON.stringify`/`JSON.parse` with a try/catch for quota errors.

- [ ] **Step 1: Create `lib/useHistory.ts`**

```ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { PopCard } from '@/types/card';

export interface HistoryEntry {
  id: string;         // nanoid-style: timestamp + random
  savedAt: number;    // Date.now()
  title: string;
  url?: string;
  thumbnailUrl?: string | null;
  cardCount: number;
  cards: PopCard[];
  takeaways: string[];
}

const STORAGE_KEY = 'popcard_history';
const MAX_ENTRIES = 10;

function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage quota exceeded — silently skip
  }
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const addEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'savedAt'>) => {
    setHistory(prev => {
      const newEntry: HistoryEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        savedAt: Date.now(),
      };
      const updated = [newEntry, ...prev].slice(0, MAX_ENTRIES);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.filter(e => e.id !== id);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  }, []);

  return { history, addEntry, removeEntry, clearHistory };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/useHistory.ts
git commit -m "feat: add useHistory hook for localStorage session persistence"
```

---

### Task 2: Create the `HistoryPanel` component

**Files:**
- Create: `components/HistoryPanel.tsx`

**Design:** A horizontal scrollable strip shown on the landing page beneath the input. Each card shows the thumbnail (or a placeholder), title, card count, and a time-ago label. Clicking a card restores the session.

- [ ] **Step 1: Create `components/HistoryPanel.tsx`**

**Important:** Do not nest a `<button>` inside another `<button>` — this is invalid HTML and causes accessibility issues. Use a `<div>` with `role="button"` for the outer card, and a true `<button>` only for the remove action.

```tsx
'use client';

import { Clock, X } from 'lucide-react';
import { HistoryEntry } from '@/lib/useHistory';

interface HistoryPanelProps {
  history: HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function HistoryPanel({ history, onRestore, onRemove }: HistoryPanelProps) {
  if (history.length === 0) return null;

  return (
    <div className="w-full max-w-2xl mx-auto mt-5">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Clock size={13} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Recent</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {history.map(entry => (
          // Use div+role="button" as the outer card so the remove <button> inside is valid HTML
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => onRestore(entry)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onRestore(entry); }}
            className="group relative flex-shrink-0 w-44 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden text-left cursor-pointer"
          >
            {/* Thumbnail */}
            <div className="h-20 bg-gray-100 overflow-hidden">
              {entry.thumbnailUrl ? (
                <img
                  src={entry.thumbnailUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
                  <span className="text-2xl">📄</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="px-3 py-2">
              <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-tight mb-1">
                {entry.title}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{entry.cardCount} cards</span>
                <span className="text-xs text-gray-400">{timeAgo(entry.savedAt)}</span>
              </div>
            </div>

            {/* Remove button — valid: <button> inside <div>, not inside <button> */}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
              aria-label="Remove from history"
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/HistoryPanel.tsx
git commit -m "feat: add HistoryPanel component for recent sessions"
```

---

### Task 3: Wire history into `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Import `useHistory` and `HistoryPanel` in `app/page.tsx`**

Add to the imports section:
```ts
import { useHistory, HistoryEntry } from '@/lib/useHistory';
import HistoryPanel from '@/components/HistoryPanel';
```

- [ ] **Step 2: Call the hook inside `HomePage`**

After the existing `useState` declarations, add:
```ts
const { history, addEntry, removeEntry } = useHistory();
```

- [ ] **Step 3: Save to history when extraction completes**

In `streamExtraction`, find the `done` event handler (around line 119-123):
```ts
} else if (event.type === 'done') {
  receivedTerminalEvent = true;
  setCards(event.cards);
  if (Array.isArray(event.takeaways)) setTakeaways(event.takeaways);
  setAppState('results');
  transitionedToResults = true;
}
```

After `setAppState('results')`, add:
```ts
// Save to history (access videoInfo via ref to avoid stale closure)
// We use a ref so we can access the current videoInfo inside streamExtraction
```

**Better approach — use a ref for videoInfo:**

After the existing `const abortRef = useRef<...>` line, add:
```ts
const videoInfoRef = useRef<typeof videoInfo>(null);
```

After `setVideoInfo(...)` calls in `handleSubmit`, also call:
```ts
videoInfoRef.current = { title, thumbnailUrl: thumbnailUrl ?? null };
```
(repeat for the upload mode `setVideoInfo` call)

Then in the `done` handler:
```ts
} else if (event.type === 'done') {
  receivedTerminalEvent = true;
  setCards(event.cards);
  if (Array.isArray(event.takeaways)) setTakeaways(event.takeaways);
  setAppState('results');
  transitionedToResults = true;
  // Persist to localStorage history
  // Note: use `currentUrl` (the React state variable in scope) as the source URL.
  // `contentId` is not a variable — the URL for the current submission is `currentUrl`.
  const info = videoInfoRef.current;
  if (info) {
    addEntry({
      title: info.title,
      url: currentUrl.startsWith('paste-') || !currentUrl ? undefined : currentUrl,
      thumbnailUrl: info.thumbnailUrl,
      cardCount: event.cards.filter((c: PopCard) => c.type !== 'TLDR' && c.type !== 'SECTION_HEADER').length,
      cards: event.cards,
      takeaways: event.takeaways ?? [],
    });
  }
}
```

- [ ] **Step 4: Add a `handleRestore` function**

After `handleReset`, add:
```ts
const handleRestore = useCallback((entry: HistoryEntry) => {
  setCards(entry.cards);
  setTakeaways(entry.takeaways);
  setVideoInfo({ title: entry.title, thumbnailUrl: entry.thumbnailUrl ?? null });
  setCurrentUrl(entry.url ?? '');
  setActiveFilter('ALL');
  setSearchQuery('');
  setAppState('results');
  setTimeout(() => {
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}, []);
```

- [ ] **Step 5: Render `HistoryPanel` on the landing page**

Inside the hero section, after the `<UrlInput ... />` motion block, add:
```tsx
{appState === 'landing' && (
  <HistoryPanel
    history={history}
    onRestore={handleRestore}
    onRemove={removeEntry}
  />
)}
```

- [ ] **Step 6: Verify by running the dev server**

```bash
npm run dev
```

Submit a URL → wait for cards → refresh the page → the "Recent" strip should appear with the session.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat: persist sessions to localStorage and restore from history"
```

---

## Chunk 2: Multi-Source Merge

### Task 4: Add a source queue to `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/UrlInput.tsx`

**Design:** Add an "Add another source" button after the first submission enters loading. Each source's cards are extracted independently and merged (existing deduplicator handles overlap). The UI shows a queue of sources with checkmarks as each completes.

- [ ] **Step 1: Add queue state and a `mergeModeRef` to `HomePage`**

After the existing state declarations in `app/page.tsx`, add:
```ts
const [sourceQueue, setSourceQueue] = useState<Array<{ label: string; status: 'pending' | 'done' | 'error' }>>([]);
const [mergeMode, setMergeMode] = useState(false);
// Ref mirrors mergeMode so it can be read inside SSE stream closures without stale capture
const mergeModeRef = useRef(false);
```

**Important:** `mergeMode` is a React state value — reading it inside an `async` SSE handler will always see the stale value from when the closure was created. `mergeModeRef.current` is always live. Always set both together:
```ts
setMergeMode(true);
mergeModeRef.current = true;
// and on reset:
setMergeMode(false);
mergeModeRef.current = false;
```

- [ ] **Step 2: Modify `handleSubmit` to support append mode**

Change the `handleSubmit` signature to accept an optional `append` parameter:
```ts
const handleSubmit = async (payload: SubmitPayload, append = false) => {
```

When `append` is `true`:
- Don't reset `cards` to `[]` — instead merge new cards into existing ones
- Don't reset `appState` to `'loading'` if already in `'results'`
- Add the new source to `sourceQueue` with `status: 'pending'`

Replace the `setCards([])` and `setAppState('loading')` block at the start of `handleSubmit` with:

```ts
if (!append) {
  setCurrentUrl(payload.url ?? '');
  setAppState('loading');
  setCards([]);
  setTakeaways([]);
  setError(null);
  setVideoInfo(null);
  setSourceQueue([]);
  setMergeMode(false);
} else {
  setSourceQueue(prev => [...prev, {
    label: payload.url ?? payload.file?.name ?? 'Pasted text',
    status: 'pending',
  }]);
  setMergeMode(true);
  mergeModeRef.current = true;
}
```

- [ ] **Step 3: Merge cards instead of replacing on subsequent submissions**

In `streamExtraction`, change the `done` handler to merge when in append mode:

```ts
} else if (event.type === 'done') {
  receivedTerminalEvent = true;
  if (mergeModeRef.current) {
    // Append new cards, dedup by id
    // Use mergeModeRef.current (not mergeMode state) — the SSE handler is a closure
    // that would otherwise capture the stale mergeMode value from when it was created.
    setCards(prev => {
      const existingIds = new Set(prev.map(c => c.id));
      const newCards = (event.cards as PopCard[]).filter(c => !existingIds.has(c.id));
      return [...prev, ...newCards];
    });
    setSourceQueue(prev => prev.map((s, i) =>
      i === prev.length - 1 ? { ...s, status: 'done' } : s
    ));
  } else {
    setCards(event.cards);
    if (Array.isArray(event.takeaways)) setTakeaways(event.takeaways);
  }
  setAppState('results');
  transitionedToResults = true;
}
```

- [ ] **Step 4: Add "Add another source" button to the results controls bar**

In the results section controls bar (around line 380), after the search input, add:
```tsx
{appState === 'results' && (
  <button
    onClick={() => setMergeMode(true)}
    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-[#4A90D9] border-2 border-[#4A90D9]/30 hover:border-[#4A90D9] transition-colors"
  >
    + Add source
  </button>
)}
```

When `mergeMode` is true, show a floating `UrlInput` overlay or inline input for the next source. Also sync the `mergeModeRef` when closing the overlay:
```tsx
{mergeMode && appState === 'results' && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4">
    <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700">Add another source</span>
        <button
          onClick={() => { setMergeMode(false); mergeModeRef.current = false; }}
          className="text-gray-400 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      </div>
      <UrlInput
        onSubmit={(p) => { setMergeMode(false); handleSubmit(p, true); }}
        loading={appState === 'loading'}
      />
    </div>
  </div>
)}
```

Also update the SSE `error` handler to set the `'error'` status on the queue entry (this is the only place where `status: 'error'` gets set — without it the error branch in the status strip never renders):

In `streamExtraction`, find:
```ts
} else if (event.type === 'error') {
  receivedTerminalEvent = true;
  setError({ code: 'extraction_error', message: event.message });
  setAppState('error');
}
```

Replace with:
```ts
} else if (event.type === 'error') {
  receivedTerminalEvent = true;
  if (mergeModeRef.current) {
    setSourceQueue(prev => prev.map((s, i) =>
      i === prev.length - 1 ? { ...s, status: 'error' } : s
    ));
  } else {
    setError({ code: 'extraction_error', message: event.message });
    setAppState('error');
  }
}
```

- [ ] **Step 5: Show source queue status**

In the results controls bar, if `sourceQueue.length > 0`, show a small status strip above the filter bar:
```tsx
{sourceQueue.length > 0 && (
  <div className="col-span-full flex gap-2 flex-wrap mb-2">
    {sourceQueue.map((s, i) => (
      <span
        key={i}
        className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium ${
          s.status === 'done' ? 'bg-green-50 text-green-700' :
          s.status === 'error' ? 'bg-red-50 text-red-700' :
          'bg-blue-50 text-blue-600 animate-pulse'
        }`}
      >
        {s.status === 'done' ? '✓' : s.status === 'error' ? '✗' : '…'} {s.label}
      </span>
    ))}
  </div>
)}
```

- [ ] **Step 6: Verify the merge flow**

1. Submit a YouTube URL → wait for cards
2. Click "+ Add source" → paste a different URL
3. Cards from both sources appear in the grid
4. Both source labels appear in the queue strip with checkmarks

- [ ] **Step 7: Commit**

Note: `components/UrlInput.tsx` is not modified in this task — it's used as-is. Do not include it in the commit.

```bash
git add app/page.tsx
git commit -m "feat: multi-source merge — combine cards from multiple URLs/files"
```

---

## Chunk 3: Shareable Decks via Vercel KV

### Task 5: Install Vercel KV and create `/api/deck` route

**Files:**
- Create: `app/api/deck/route.ts`

**Prerequisites:**
1. In Vercel dashboard → Storage → Create KV database
2. Run `vercel env pull .env.local` to get `KV_REST_API_URL` and `KV_REST_API_TOKEN`

- [ ] **Step 1: Install `@vercel/kv`**

```bash
npm install @vercel/kv
```

- [ ] **Step 2: Create `app/api/deck/route.ts`**

```ts
import { NextRequest } from 'next/server';
import { kv } from '@vercel/kv';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const DeckBody = z.object({
  title: z.string().min(1).max(200),
  cards: z.array(z.any()).min(1).max(50),
  takeaways: z.array(z.string()).max(30),
  videoUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
});

/** Generate a short random ID: 8 alphanumeric chars */
function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// POST /api/deck — save a deck, return { id }
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { ok } = await rateLimit(ip);
  if (!ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = DeckBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const id = shortId();
  await kv.set(`deck:${id}`, parsed.data, { ex: TTL_SECONDS });

  return Response.json({ id });
}

// GET /api/deck?id=xxx — retrieve a deck
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[a-z0-9]{8}$/.test(id)) {
    return Response.json({ error: 'invalid_id' }, { status: 400 });
  }

  const deck = await kv.get(`deck:${id}`);
  if (!deck) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  return Response.json(deck);
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/deck/route.ts package.json package-lock.json
git commit -m "feat: add /api/deck route for shareable decks via Vercel KV"
```

---

### Task 6: Create the shared deck view page

**Files:**
- Create: `app/deck/[id]/page.tsx`

- [ ] **Step 1: Create `app/deck/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import CardGrid from '@/components/CardGrid';
import VideoHeaderCard from '@/components/VideoHeaderCard';
import TakeawaysSection from '@/components/TakeawaysSection';
import Logo from '@/components/Logo';
import { PopCard } from '@/types/card';

interface DeckData {
  title: string;
  cards: PopCard[];
  takeaways: string[];
  videoUrl?: string;
  thumbnailUrl?: string;
}

async function getDeck(id: string): Promise<DeckData | null> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/deck?id=${id}`,
    { cache: 'no-store' }
  );
  if (!res.ok) return null;
  return res.json();
}

export default async function SharedDeckPage({ params }: { params: { id: string } }) {
  const deck = await getDeck(params.id);
  if (!deck) notFound();

  const tldrCard = deck.cards.find(c => c.type === 'TLDR');
  const mainCards = deck.cards.filter(c => c.type !== 'TLDR');

  return (
    <div className="min-h-screen bg-dot-grid">
      <nav className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/"><Logo size="md" /></a>
          <a
            href="/"
            className="text-sm font-semibold text-[#4A90D9] hover:text-[#3a7fc8] transition-colors"
          >
            Try Popcard →
          </a>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10 pb-20">
        {deck.videoUrl && (
          <VideoHeaderCard
            title={deck.title}
            thumbnailUrl={deck.thumbnailUrl ?? null}
            videoUrl={deck.videoUrl}
          />
        )}

        {tldrCard && (
          <div className="col-span-full rounded-3xl p-5 mt-4 mb-2 shadow-md" style={{ backgroundColor: '#1a1a2e' }}>
            <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">TL;DR</p>
            <p className="text-sm leading-relaxed text-white/90">{tldrCard.body}</p>
          </div>
        )}

        <div className="mt-4">
          <CardGrid cards={mainCards} filter="ALL" videoUrl={deck.videoUrl} />
        </div>

        {deck.takeaways.length > 0 && <TakeawaysSection takeaways={deck.takeaways} />}

        <p className="text-center text-xs text-gray-400 mt-12">
          This deck was shared via Popcard · links expire after 7 days
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/deck/
git commit -m "feat: shared deck view page at /deck/[id]"
```

---

### Task 7: Add "Share" button to the results toolbar

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add missing imports and share state**

`app/page.tsx` currently imports `useState, useRef, useCallback` from React but not `useEffect`. Add `useEffect` to the React import:
```ts
import { useState, useRef, useCallback, useEffect } from 'react';
```

Also, `Check` is not currently imported from `@phosphor-icons/react` (line 5 only imports `Clock, Lightning, Target, ArrowSquareOut, MagnifyingGlass`). Add `Check`:
```ts
import { Clock, Lightning, Target, ArrowSquareOut, MagnifyingGlass, Check } from '@phosphor-icons/react';
```

Then add share state to `HomePage`:
```ts
const [shareUrl, setShareUrl] = useState<string | null>(null);
const [sharing, setSharing] = useState(false);
```

- [ ] **Step 2: Add `handleShare` function**

```ts
const handleShare = useCallback(async () => {
  if (sharing || cards.length === 0) return;
  setSharing(true);
  try {
    const res = await fetch('/api/deck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: videoInfo?.title ?? 'Untitled',
        cards,
        takeaways,
        videoUrl: currentUrl || undefined,
        thumbnailUrl: videoInfo?.thumbnailUrl ?? undefined,
      }),
    });
    if (!res.ok) throw new Error('Failed to create share link');
    const { id } = await res.json();
    const url = `${window.location.origin}/deck/${id}`;
    setShareUrl(url);
    await navigator.clipboard.writeText(url).catch(() => {});
  } catch {
    // silently fail — share is not critical
  } finally {
    setSharing(false);
  }
}, [sharing, cards, takeaways, videoInfo, currentUrl]);
```

- [ ] **Step 3: Add the Share button to the results controls bar**

Next to the `ExportPanel`, add:
```tsx
<button
  onClick={handleShare}
  disabled={sharing}
  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-white border-2 border-gray-200 text-gray-700 hover:border-gray-300 transition-all disabled:opacity-60"
>
  {sharing ? (
    <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
  ) : shareUrl ? (
    <Check size={14} className="text-green-500" />
  ) : (
    <ArrowSquareOut size={14} weight="bold" />
  )}
  {shareUrl ? 'Link copied!' : 'Share'}
</button>
```

Don't forget to import `ArrowSquareOut` from `@phosphor-icons/react` if not already imported (it's already imported in the file).

Also reset `shareUrl` to `null` after 3 seconds:
```ts
useEffect(() => {
  if (!shareUrl) return;
  const t = setTimeout(() => setShareUrl(null), 3000);
  return () => clearTimeout(t);
}, [shareUrl]);
```

- [ ] **Step 4: Add `NEXT_PUBLIC_BASE_URL` to `.env.local`**

```
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

And in Vercel: `NEXT_PUBLIC_BASE_URL=https://your-domain.vercel.app`

- [ ] **Step 5: Verify the full share flow**

1. Submit a URL → wait for cards
2. Click "Share" → button shows spinner then "Link copied!"
3. Paste the URL in a new tab → should see the read-only deck view with all cards

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat: share button generates /deck/[id] link via Vercel KV"
```

---

## Note on Scheduled Digest

The scheduled digest feature (weekly email of cards from favourite channels) requires:
1. User authentication (email capture or account creation)
2. Email delivery service (Resend or similar)
3. Vercel Cron jobs
4. YouTube channel subscription tracking
5. Significant API cost implications (auto-extracting videos)

This is effectively a standalone product feature. Recommend a dedicated discovery/design session before planning implementation.

---
