'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Lightning, Target, ArrowSquareOut, MagnifyingGlass } from '@phosphor-icons/react';
import Logo from '@/components/Logo';
import UrlInput, { SubmitPayload } from '@/components/UrlInput';
import LoadingBubbles from '@/components/LoadingBubbles';
import CardGrid from '@/components/CardGrid';
import FilterBar from '@/components/FilterBar';
import ExportPanel from '@/components/ExportPanel';
import VideoHeaderCard from '@/components/VideoHeaderCard';
import TakeawaysSection from '@/components/TakeawaysSection';
import ErrorBoundary from '@/components/ErrorBoundary';
import { PopCard, CardType } from '@/types/card';
import { useSession } from 'next-auth/react';
import AuthModal from '@/components/AuthModal';
import PaywallModal from '@/components/PaywallModal';
import AccountMenu from '@/components/AccountMenu';

type AppState = 'landing' | 'loading' | 'results' | 'error';

interface AppError {
  code: string;
  message: string;
}

const FEATURE_CARDS = [
  {
    color: '#4A90D9',
    textColor: 'white' as const,
    Icon: Clock,
    headline: 'Save Time',
    body: 'Summarize hours of content in seconds. Get the gist without the fluff.',
  },
  {
    color: '#FFB6C1',
    textColor: '#1a1a2e' as const,
    Icon: Target,
    headline: 'Stay Focused',
    body: 'Distraction-free learning layout. Just the facts, organized for clarity.',
  },
  {
    color: '#FFD93D',
    textColor: '#1a1a2e' as const,
    Icon: Lightning,
    headline: 'Learn Fast',
    body: 'Retain more information with visual cards and AI-powered highlights.',
  },
];

const PREVIEW_CARDS = [
  { color: '#FF6B6B', label: 'Key Insight', text: 'Focus is the superpower of the 21st century', dark: false },
  { color: '#4ECDC4', label: 'Actionable Tip', text: 'Schedule deep work before checking email', dark: false },
  { color: '#6C63FF', label: 'Stat / Data', text: '400% more productive than average performers', dark: false },
  { color: '#FFD93D', label: 'Quote', text: '"A distracted mind is never a happy mind."', dark: true },
  { color: '#FF9A3C', label: 'Watch Out', text: '23 minutes lost after every interruption', dark: false },
];

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>('landing');
  const [cards, setCards] = useState<PopCard[]>([]);
  const [takeaways, setTakeaways] = useState<string[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [activeFilter, setActiveFilter] = useState<CardType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<{ title: string; thumbnailUrl: string | null } | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: session, update: updateSession } = useSession();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<SubmitPayload | null>(null);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setAppState('landing');
    setCards([]);
    setTakeaways([]);
  }, []);

  /** Shared SSE reader — streams cards from /api/extract */
  const streamExtraction = async (transcript: string, contentId: string, abort: AbortController) => {
    const extractRes = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, videoId: contentId }),
      signal: abort.signal,
    });

    if (!extractRes.ok || !extractRes.body) {
      setError({ code: 'extract_failed', message: 'Card extraction failed. Please try again.' });
      setAppState('error');
      return;
    }

    const reader = extractRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let transitionedToResults = false;
    let receivedTerminalEvent = false;

    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'card') {
              setCards(prev => {
                if (prev.some(c => c.id === event.card.id)) return prev;
                return [...prev, event.card];
              });
              if (!transitionedToResults) {
                transitionedToResults = true;
                setAppState('results');
              }
            } else if (event.type === 'done') {
              receivedTerminalEvent = true;
              setCards(event.cards);
              if (Array.isArray(event.takeaways)) setTakeaways(event.takeaways);
              setAppState('results');
              transitionedToResults = true;
            } else if (event.type === 'error') {
              receivedTerminalEvent = true;
              setError({ code: 'extraction_error', message: event.message });
              setAppState('error');
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }

      if (done) break;
    }

    if (!receivedTerminalEvent && !transitionedToResults) {
      setError({ code: 'no_cards', message: 'Connection dropped before cards arrived. Please try again.' });
      setAppState('error');
    }
  };

  /** Check auth & usage before allowing extraction */
  const checkAccessAndSubmit = async (payload: SubmitPayload) => {
    // Must be signed in
    if (!session) {
      setPendingPayload(payload);
      setShowAuthModal(true);
      return;
    }

    // Check usage
    const usageRes = await fetch('/api/usage');
    const usage = await usageRes.json();

    if (!usage.canExtract) {
      setShowPaywallModal(true);
      return;
    }

    // Increment usage counter (fire-and-forget for non-subscribers)
    const isSubscribed = usage.subscriptionStatus === 'active' || usage.subscriptionStatus === 'past_due';
    if (!isSubscribed) {
      await fetch('/api/usage', { method: 'POST' });
    }

    // Refresh session to get updated count
    await updateSession();

    // Proceed with extraction
    handleSubmit(payload);
  };

  // After signing in via magic link, retry the pending payload
  useEffect(() => {
    if (session && pendingPayload) {
      const payload = pendingPayload;
      setPendingPayload(null);
      setShowAuthModal(false);
      checkAccessAndSubmit(payload);
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear ?subscribed=true from URL after checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscribed') === 'true') {
      window.history.replaceState({}, '', '/');
      updateSession();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (payload: SubmitPayload) => {
    setCurrentUrl(payload.url ?? '');
    setAppState('loading');
    setCards([]);
    setTakeaways([]);
    setError(null);
    setVideoInfo(null);

    const abort = new AbortController();
    abortRef.current = abort;

    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);

    try {
      if (payload.mode === 'link' && payload.url) {
        /* ── Link mode: YouTube ────────────────────── */
        const transcriptRes = await fetch('/api/transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: payload.url }),
          signal: abort.signal,
        });

        if (!transcriptRes.ok) {
          const err = await transcriptRes.json();
          setError({ code: err.error, message: err.message });
          setAppState('error');
          return;
        }

        const { transcript, videoId, title, thumbnailUrl } = await transcriptRes.json();
        if (title) setVideoInfo({ title, thumbnailUrl: thumbnailUrl ?? null });

        await streamExtraction(transcript, videoId, abort);

      } else if (payload.mode === 'upload' && payload.file) {
        /* ── Upload mode: PDF / TXT ─────────────────── */
        const formData = new FormData();
        formData.append('file', payload.file);

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          signal: abort.signal,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          setError({ code: err.error, message: err.message });
          setAppState('error');
          return;
        }

        const { transcript, contentId, title } = await uploadRes.json();
        setVideoInfo({ title: title ?? payload.file.name, thumbnailUrl: null });

        await streamExtraction(transcript, contentId, abort);

      } else if (payload.mode === 'paste' && payload.text) {
        /* ── Paste mode: raw text ───────────────────── */
        const hash = payload.text.slice(0, 200).replace(/\s+/g, '').slice(0, 32);
        const contentId = `paste-${hash}`;
        setVideoInfo({ title: 'Pasted Text', thumbnailUrl: null });

        await streamExtraction(payload.text, contentId, abort);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error(err);
      setError({ code: 'network', message: 'Network error. Check your connection and try again.' });
      setAppState('error');
    }
  };

  const handleReset = () => {
    setAppState('landing');
    setCards([]);
    setTakeaways([]);
    setError(null);
    setActiveFilter('ALL');
    setSearchQuery('');
    setVideoInfo(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Extract TL;DR and section headers from the main card stream
  const tldrCard = cards.find(c => c.type === 'TLDR');
  const mainCards = cards.filter(c => c.type !== 'TLDR');

  // Counts exclude meta-types (TLDR, SECTION_HEADER) so filter numbers are accurate
  const filterableCards = cards.filter(c => c.type !== 'TLDR' && c.type !== 'SECTION_HEADER');
  const counts: Partial<Record<PopCard['type'] | 'ALL', number>> = {
    ALL: filterableCards.length,
  };
  for (const card of filterableCards) {
    counts[card.type] = (counts[card.type] ?? 0) + 1;
  }

  const showResults = appState === 'results' || (appState === 'loading' && cards.length > 0);

  return (
    <div className="min-h-screen bg-dot-grid flex flex-col">
      {/* ── NAV ─────────────────────────────────────── */}
      <nav role="navigation" aria-label="Main" className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={handleReset} aria-label="Go to homepage" className="select-none">
            <Logo size="md" />
          </button>
          <div className="flex items-center gap-5">
            <a
              href="/tiktok"
              className="text-sm font-medium text-gray-600 hover:text-[#4A90D9] transition-colors hidden sm:block"
            >
              TikTok Slides
            </a>
            <a
              href="#how-it-works"
              aria-label="How it works"
              className="text-sm font-medium text-gray-600 hover:text-[#4A90D9] transition-colors hidden sm:block"
            >
              How it works
            </a>
            <AccountMenu onSignIn={() => setShowAuthModal(true)} />
          </div>
        </div>
      </nav>

      {/* Remaining uses banner for free-tier users */}
      {session && !(['active', 'past_due'].includes(session.user.subscriptionStatus ?? '')) && (
        <div className="bg-blue-50 border-b border-blue-100 py-1.5 text-center">
          <p className="text-xs text-blue-600 font-medium">
            {Math.max(0, 3 - session.user.extractionCount)} of 3 free extractions remaining
            {session.user.extractionCount >= 2 && (
              <button
                onClick={() => setShowPaywallModal(true)}
                className="ml-2 text-[#4A90D9] font-bold hover:underline"
              >
                Upgrade
              </button>
            )}
          </p>
        </div>
      )}

      {/* flex-1 keeps the footer pinned to the bottom even when content is short */}
      <main role="main" className="flex-1">

      {/* ── HERO ────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-16 px-6">
        {/* Decorative blobs */}
        <div
          className="absolute top-0 left-1/4 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: '#4A90D9', filter: 'blur(130px)', opacity: 0.1 }}
        />
        <div
          className="absolute top-10 right-1/4 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: '#FF6B6B', filter: 'blur(110px)', opacity: 0.09 }}
        />
        <div
          className="absolute bottom-0 left-1/2 w-64 h-64 rounded-full pointer-events-none"
          style={{ background: '#4ECDC4', filter: 'blur(100px)', opacity: 0.08, transform: 'translateX(-50%)' }}
        />

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="mb-5"
          >
            <Logo size="hero" className="block mb-2" />
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight">
              <span style={{ color: '#4A90D9' }} className="font-black">Watch less.</span>
              <br />
              <span className="text-gray-800">Know more.</span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="text-gray-500 text-lg mb-10 max-w-xl mx-auto leading-relaxed"
          >
            Turn videos, PDFs, and articles into crisp, interactive cards. Ready to save your time?
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2 }}
          >
            <UrlInput onSubmit={(p: SubmitPayload) => checkAccessAndSubmit(p)} loading={appState === 'loading'} />
          </motion.div>
        </div>
      </section>

      {/* ── PROCESSING / RESULTS ────────────────────── */}
      <div ref={resultsRef} aria-live="polite" className="max-w-6xl mx-auto px-6">
        <ErrorBoundary handleReset={handleReset}>
        <AnimatePresence mode="wait">
          {appState === 'loading' && cards.length === 0 && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
            >
              <LoadingBubbles />
              <div className="flex justify-center">
                <button
                  onClick={handleCancel}
                  className="mt-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}

          {appState === 'error' && error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-5 py-20 text-center"
            >
              <div className="text-6xl">😬</div>
              <p className="text-gray-700 text-lg font-semibold max-w-md">{error.message}</p>
              <button
                onClick={handleReset}
                aria-label="Try another video"
                className="px-7 py-2.5 rounded-full bg-[#4A90D9] text-white font-semibold text-sm hover:bg-[#3a7fc8] active:scale-95 transition-all"
              >
                Try another video
              </button>
            </motion.div>
          )}

          {showResults && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="pb-20"
            >
              {/* Controls bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 py-4 mb-2">
                <FilterBar active={activeFilter} onChange={setActiveFilter} counts={counts} />
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <MagnifyingGlass
                      size={14}
                      weight="bold"
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                    />
                    <input
                      type="text"
                      placeholder="Search cards..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-full border-2 border-gray-200 text-sm font-medium text-gray-700 placeholder:text-gray-400 focus:border-[#4A90D9] focus:outline-none transition-colors w-40 sm:w-48"
                    />
                  </div>
                  <ExportPanel cards={cards} videoUrl={currentUrl} />
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-5">
                {filterableCards.length} card{filterableCards.length !== 1 ? 's' : ''} popped
                {appState === 'loading' && ' · loading more…'}
              </p>

              {videoInfo && (
                <VideoHeaderCard
                  title={videoInfo.title}
                  thumbnailUrl={videoInfo.thumbnailUrl ?? null}
                  videoUrl={currentUrl}
                />
              )}

              {/* TL;DR summary card — full-width, below video header */}
              {tldrCard && (
                <div
                  className="col-span-full rounded-3xl p-5 mt-4 mb-2 shadow-md"
                  style={{ backgroundColor: '#1a1a2e' }}
                >
                  <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">TL;DR</p>
                  <p className="text-sm leading-relaxed text-white/90">{tldrCard.body}</p>
                </div>
              )}

              <div className="mt-4">
                <CardGrid cards={mainCards} filter={activeFilter} videoUrl={currentUrl} searchQuery={searchQuery} />
              </div>

              {takeaways.length > 0 && (
                <TakeawaysSection takeaways={takeaways} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </ErrorBoundary>
      </div>

      {/* ── FEATURE CARDS ───────────────────────────── */}
      {appState === 'landing' && (
        <>
          <section aria-label="Features" className="max-w-6xl mx-auto px-6 py-8 pb-16">
            <h2 className="sr-only">Why use Popcard</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {FEATURE_CARDS.map((card, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.3 + i * 0.1 }}
                  className="rounded-3xl p-7 shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
                  style={{ backgroundColor: card.color }}
                >
                  <div
                    className="flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
                    style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                  >
                    <card.Icon size={22} weight="fill" color={card.textColor} />
                  </div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: card.textColor }}>
                    {card.headline}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: card.textColor, opacity: 0.85 }}>
                    {card.body}
                  </p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ── DASHBOARD PREVIEW ───────────────────── */}
          <section id="how-it-works" aria-label="Example output" className="max-w-6xl mx-auto px-6 pb-24">
            <h2 className="sr-only">How it works</h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-center text-sm font-semibold text-gray-400 uppercase tracking-widest mb-6"
            >
              Example output
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.65 }}
              className="rounded-3xl bg-gray-900 p-6 sm:p-8 shadow-2xl"
            >
              {/* Browser chrome */}
              <div className="flex items-center gap-2 mb-6">
                <div className="w-3 h-3 rounded-full bg-red-400 opacity-80" />
                <div className="w-3 h-3 rounded-full bg-yellow-400 opacity-80" />
                <div className="w-3 h-3 rounded-full bg-green-400 opacity-80" />
                <div className="flex-1 h-6 rounded-full bg-white/10 mx-4" />
              </div>

              {/* Mock cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PREVIEW_CARDS.map((c, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      delay: 0.8 + i * 0.18,
                      type: 'spring',
                      stiffness: 420,
                      damping: 14,
                    }}
                    className="rounded-2xl p-4"
                    style={{ backgroundColor: c.color }}
                  >
                    <div
                      className="text-xs font-bold uppercase tracking-wide mb-2"
                      style={{ color: c.dark ? '#1a1a2e' : 'white', opacity: 0.7 }}
                    >
                      {c.label}
                    </div>
                    <div
                      className="text-sm font-semibold leading-snug"
                      style={{ color: c.dark ? '#1a1a2e' : 'white' }}
                    >
                      {c.text}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </section>
        </>
      )}

      </main>

      {/* ── FOOTER ──────────────────────────────────── */}
      <footer className="border-t border-gray-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size="sm" />
          <p className="text-sm text-gray-400">© 2026 Popcard AI. All rights reserved.</p>
          <nav aria-label="Footer">
          <div className="flex items-center gap-5 text-sm text-gray-500">
            <a href="#" aria-label="Privacy policy" className="hover:text-gray-800 transition-colors">Privacy</a>
            <a href="#" aria-label="Terms of service" className="hover:text-gray-800 transition-colors">Terms</a>
            <a href="#" aria-label="Get Chrome Extension" className="flex items-center gap-1.5 hover:text-gray-800 transition-colors">
              Chrome Extension <ArrowSquareOut size={12} weight="bold" />
            </a>
          </div>
          </nav>
        </div>
      </footer>
      {/* Modals */}
      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message={pendingPayload ? 'Sign in to start extracting knowledge cards.' : undefined}
      />
      <PaywallModal
        open={showPaywallModal}
        onClose={() => setShowPaywallModal(false)}
      />
    </div>
  );
}
