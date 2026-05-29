import { getUser } from './_lib/db.js';
import { getSession } from './_lib/session.js';
import { detectYouTubeId, fetchYouTubeTranscript, normalizeText } from './_lib/sources.js';
import { generateCards } from './_lib/llm.js';
import {
  QUOTA,
  hashSource,
  monthlyPopCountByMode,
  findCachedDeck,
  createDeck,
} from './_lib/decks.js';
import { recordDeckPop } from './_lib/sessions.js';
import { createDeckReadyNotification } from './_lib/notifications.js';

// Was 80_000 — far too small for a book. Atomic Habits is ~480K chars; that
// cap dropped 83% of it before chunked generation could run. The LLM layer
// has its own TEXT_CHAR_BUDGET (800K) which kicks in as the real ceiling.
const MAX_INPUT_CHARS = 800_000;

// Accounts that bypass the monthly pop quota — for testing / owner use.
const UNLIMITED_EMAILS = new Set([
  'anthonycorby@gmail.com',
]);

// Languages we explicitly support for card output. The LLM can output in any
// language natively; we whitelist these so the picker and the LLM stay in sync.
const SUPPORTED_LANGUAGES = {
  en: 'English',
  es: 'Spanish',
  zh: 'Mandarin Chinese (Simplified)',
  hi: 'Hindi',
  ar: 'Arabic',
  pt: 'Portuguese',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ru: 'Russian',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });

  const user = await getUser(session.uid);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const { input, mode, language } = req.body || {};
  if (typeof input !== 'string' || !input.trim()) {
    return res.status(400).json({ error: 'Missing input' });
  }
  const safeMode = mode === 'study' ? 'study' : 'simple';
  const safeLang = SUPPORTED_LANGUAGES[language] ? language : 'en';
  const languageName = SUPPORTED_LANGUAGES[safeLang];

  // Quota check (bypassed for unlimited-access accounts). Per-mode: free users
  // get 10 quick pops + 1 study pop / month. Study mode is the premium feature,
  // so the trial gate fires there first for most free users.
  if (!UNLIMITED_EMAILS.has((user.email || '').toLowerCase())) {
    const tierQuota = QUOTA[user.tier] || QUOTA.free;
    const limit = tierQuota[safeMode] ?? 0;
    const used = await monthlyPopCountByMode(user.id, safeMode);
    if (used >= limit) {
      const modeLabel = safeMode === 'study' ? 'study' : 'quick';
      const message = user.tier === 'free' && safeMode === 'study'
        ? `Your free study pop for the month is used. Upgrade to keep generating study decks — your allowance refills next month.`
        : `You've hit ${used} of ${limit} ${modeLabel} pops this month. Upgrade for more, or your allowance resets next month.`;
      return res.status(402).json({
        error: 'quota_exceeded',
        message,
        tier: user.tier,
        mode: safeMode,
      });
    }
  }

  // Resolve source
  let source;
  try {
    const ytId = detectYouTubeId(input);
    if (ytId) {
      source = await fetchYouTubeTranscript(ytId);
    } else {
      source = normalizeText(input);
    }
  } catch (e) {
    return res.status(400).json({
      error: 'source_unavailable',
      message: e.message?.includes('Transcript is disabled')
        ? 'This video has no captions. Try a different one or paste the text.'
        : `Could not fetch source: ${e.message}`,
    });
  }

  if (!source.text || source.text.length < 80) {
    return res.status(400).json({
      error: 'source_too_short',
      message: 'Need at least ~80 characters to make meaningful cards.',
    });
  }
  const trimmed = source.text.slice(0, MAX_INPUT_CHARS);

  const sourceHash = hashSource({
    sourceUrl: source.sourceUrl,
    text: trimmed,
    mode: safeMode,
    language: safeLang,
  });

  // Cache lookup
  const cached = await findCachedDeck({ sourceHash, mode: safeMode });
  if (cached) {
    const { deck } = await createDeck({
      userId: user.id,
      sourceType: source.sourceType,
      sourceUrl: source.sourceUrl,
      sourceHash,
      title: cached.title,
      mode: safeMode,
      model: cached.model,
      fromCache: true,
      cards: cached.cards,
    });
    // Daily quest: count this pop toward today's activity.
    try { await recordDeckPop(user.id); } catch (_) { /* non-fatal */ }
    return res.status(200).json({
      deck: {
        id: deck.id,
        title: deck.title,
        mode: deck.mode,
        cardCount: deck.card_count,
        sourceUrl: deck.source_url,
        sourceType: deck.source_type,
        fromCache: true,
      },
      cards: cached.cards,
    });
  }

  // Generate fresh
  let generated;
  try {
    generated = await generateCards({
      text: trimmed,
      mode: safeMode,
      sourceUrl: source.sourceUrl,
      segments: source.segments,
      language: languageName,
    });
  } catch (e) {
    console.error('LLM error', e);
    return res.status(502).json({ error: 'llm_error', message: e.message });
  }

  const { deck, cards: normalized } = await createDeck({
    userId: user.id,
    sourceType: source.sourceType,
    sourceUrl: source.sourceUrl,
    sourceHash,
    title: generated.title,
    mode: safeMode,
    model: generated.model,
    fromCache: false,
    cards: generated.cards,
  });

  // Daily quest: count this pop toward today's activity.
  try { await recordDeckPop(user.id); } catch (_) { /* non-fatal */ }
  // In-app bell: surface the fresh deck.
  try { await createDeckReadyNotification(user.id, deck); } catch (_) { /* non-fatal */ }

  res.status(200).json({
    deck: {
      id: deck.id,
      title: deck.title,
      summary: generated.summary,
      mode: deck.mode,
      cardCount: deck.card_count,
      sourceUrl: deck.source_url,
      sourceType: deck.source_type,
      fromCache: false,
    },
    cards: normalized,
  });
}
