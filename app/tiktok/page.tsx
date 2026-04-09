'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DownloadSimple, Copy, Check,
  ArrowLeft, CaretLeft, CaretRight, Trash,
} from '@phosphor-icons/react';
import { Sparkles, Link2, X } from 'lucide-react';
import Logo from '@/components/Logo';
import TikTokSlide, { SlideData, getSlideColor } from '@/components/tiktok/TikTokSlide';
import { PopCard, CardType } from '@/types/card';

type PageState = 'input' | 'loading' | 'results' | 'error';

/* ─── Card selection: pick 10 BEST with enforced variety ── */
const TYPE_PRIORITY: Record<CardType, number> = {
  STAT_OR_DATA: 10,
  KEY_INSIGHT: 9,
  QUOTE: 8,
  WATCH_OUT: 8,
  ACTIONABLE_TIP: 7,
  KEY_THEME: 5,
  RESOURCE_LINK: 3,
  TOOL_MENTIONED: 3,
  TLDR: 0,
  SECTION_HEADER: 0,
};

/** Max slots per type — prevents any single type dominating */
const TYPE_CAPS: Partial<Record<CardType, number>> = {
  QUOTE: 3,
  KEY_INSIGHT: 3,
  STAT_OR_DATA: 3,
  ACTIONABLE_TIP: 2,
  WATCH_OUT: 2,
  KEY_THEME: 2,
};

function selectBestCards(cards: PopCard[], max = 10): PopCard[] {
  const eligible = cards
    .filter(c => c.type !== 'TLDR' && c.type !== 'SECTION_HEADER')
    .map(c => ({
      card: c,
      score: (TYPE_PRIORITY[c.type] ?? 0) * 10
        + Math.min(c.body?.length ?? 0, 200) / 20
        + (c.boldPhrase ? 2 : 0)
        + (/\d/.test(c.body ?? '') ? 3 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  const selected: PopCard[] = [];
  const typeCounts: Partial<Record<CardType, number>> = {};

  for (const { card } of eligible) {
    if (selected.length >= max) break;
    const cap = TYPE_CAPS[card.type] ?? max;
    const count = typeCounts[card.type] ?? 0;
    if (count >= cap) continue; // skip — this type already has enough
    selected.push(card);
    typeCounts[card.type] = count + 1;
  }

  return selected;
}

/** Pre-fetch an image and convert to data URL (needed for html-to-image) */
async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Fetch the best quality YouTube thumbnail as a data URL.
 *  Tries maxresdefault (1280x720) first, then sddefault (640x480), then hqdefault (480x360). */
async function prefetchThumbnail(videoId: string): Promise<string | null> {
  const candidates = [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  ];
  for (const url of candidates) {
    const result = await fetchAsDataUrl(url);
    if (result) return result;
  }
  return null;
}

/* ─── Fetch storyboard frames (client-side crop via canvas) ─ */

/** Load an image URL into an HTMLImageElement */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Crop a region from a loaded image and return as data URL */
function cropFrame(
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Fetch unique video frames for each card's timestamp.
 *
 * Strategy:
 * 1. Try YouTube storyboard sprite sheets (client-side via canvas) — gives unique frames per timestamp
 * 2. Fall back to YouTube's auto-generated numbered thumbnails (distinct frames at ~25%, 50%, 75%)
 * 3. Final fallback: all slides share the main thumbnail
 */
async function fetchStoryboardFrames(
  videoId: string,
  timestamps: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // ── Attempt 1: Storyboard sprite sheets ──
  try {
    const res = await fetch('/api/storyboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, timestamps }),
    });
    if (res.ok) {
      const { frames } = await res.json() as {
        frameWidth: number;
        frameHeight: number;
        frames: Array<{
          timestamp: string;
          sheetUrl: string;
          x: number; y: number; w: number; h: number;
        }>;
      };

      const sheetUrls = [...new Set(frames.map(f => f.sheetUrl))];
      const sheetImages = new Map<string, HTMLImageElement>();

      await Promise.all(
        sheetUrls.map(async (url) => {
          try {
            const img = await loadImage(url);
            sheetImages.set(url, img);
          } catch { /* skip */ }
        }),
      );

      for (const f of frames) {
        const img = sheetImages.get(f.sheetUrl);
        if (!img) continue;
        try {
          map.set(f.timestamp, cropFrame(img, f.x, f.y, f.w, f.h));
        } catch { /* skip */ }
      }
    }
  } catch { /* non-critical */ }

  // ── Attempt 2: Numbered thumbnails as fallback ──
  // YouTube generates frames at ~25%, ~50%, ~75% of the video
  if (map.size < timestamps.length) {
    const thumbVariants = [
      `https://img.youtube.com/vi/${videoId}/maxres1.jpg`,
      `https://img.youtube.com/vi/${videoId}/maxres2.jpg`,
      `https://img.youtube.com/vi/${videoId}/maxres3.jpg`,
      `https://img.youtube.com/vi/${videoId}/hq1.jpg`,
      `https://img.youtube.com/vi/${videoId}/hq2.jpg`,
      `https://img.youtube.com/vi/${videoId}/hq3.jpg`,
    ];

    const variantDataUrls: string[] = [];
    for (const url of thumbVariants) {
      const dataUrl = await fetchAsDataUrl(url);
      if (dataUrl) {
        variantDataUrls.push(dataUrl);
        // We want 3 distinct frames (maxres preferred, hq fallback)
        if (variantDataUrls.length >= 3) break;
      }
    }

    if (variantDataUrls.length > 0) {
      // Distribute variant frames across timestamps that don't have storyboard frames
      for (let i = 0; i < timestamps.length; i++) {
        if (!map.has(timestamps[i])) {
          map.set(timestamps[i], variantDataUrls[i % variantDataUrls.length]);
        }
      }
    }
  }

  return map;
}

/* ─── Build slides from cards + metadata ─────────────── */
function buildSlides(
  cards: PopCard[],
  videoTitle: string,
  hookLine: string,
  channelName: string,
  thumbnail: string | null,
  rewrittenHeadlines: string[],
  frameMap?: Map<string, string>,
  slideOrder?: number[],
): SlideData[] {
  const selected = selectBestCards(cards);

  // Apply AI-suggested story order if available
  let ordered = selected;
  let orderedHeadlines = rewrittenHeadlines;
  if (slideOrder && slideOrder.length === selected.length) {
    // Validate all indices exist
    const valid = slideOrder.every(i => i >= 0 && i < selected.length);
    if (valid) {
      ordered = slideOrder.map(i => selected[i]);
      orderedHeadlines = slideOrder.map(i => rewrittenHeadlines[i]);
    }
  }

  const total = ordered.length + 2; // +hook +cta

  const slides: SlideData[] = [
    {
      id: 'hook',
      variant: 'hook',
      hookLine,
      videoTitle,
      channelName,
      thumbnailDataUrl: thumbnail ?? undefined,
      slideNumber: 1,
      totalSlides: total,
    },
    ...ordered.map((card, i) => {
      // Use storyboard frame for this card's timestamp, fallback to main thumbnail
      const frame = card.timestamp && frameMap?.get(card.timestamp);
      return {
        id: card.id,
        variant: 'content' as const,
        cardType: card.type,
        headline: orderedHeadlines[i] || card.headline,
        body: card.body,
        boldPhrase: card.boldPhrase,
        timestamp: card.timestamp,
        channelName,
        thumbnailDataUrl: frame || thumbnail || undefined,
        colorIndex: i,
        slideNumber: i + 2,
        totalSlides: total,
      };
    }),
    {
      id: 'cta',
      variant: 'cta',
      slideNumber: total,
      totalSlides: total,
    },
  ];

  return slides;
}

/* ─── YouTube URL validation ───────────────────────────── */
function isValidYouTubeUrl(url: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/.test(url.trim());
}

function extractVideoId(url: string): string | null {
  const m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ?? url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/* ═══════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════ */
export default function TikTokPage() {
  const [state, setState] = useState<PageState>('input');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [caption, setCaption] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState('');

  const slideRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  /* ── Generate slides ─────────────────────────────────── */
  const handleGenerate = useCallback(async () => {
    if (!url.trim()) { setUrlError('Paste a YouTube link to get started!'); return; }
    if (!isValidYouTubeUrl(url)) { setUrlError("That doesn't look like a YouTube link."); return; }

    setUrlError('');
    setState('loading');
    setSlides([]);
    setCaption('');
    setErrorMsg('');
    setLoadingStage('Fetching video...');

    const abort = new AbortController();
    abortRef.current = abort;
    const videoId = extractVideoId(url.trim());

    try {
      // 1. Fetch transcript + pre-fetch thumbnails in parallel
      setLoadingStage('Fetching transcript & video frames...');
      const [transcriptRes, thumbnail] = await Promise.all([
        fetch('/api/transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
          signal: abort.signal,
        }),
        videoId ? prefetchThumbnail(videoId) : Promise.resolve(null),
      ]);

      if (!transcriptRes.ok) {
        const err = await transcriptRes.json();
        throw new Error(err.message || 'Failed to fetch transcript');
      }

      const { transcript, videoId: vid, title, channelName } = await transcriptRes.json();
      const vTitle = title || 'Untitled Video';
      const vChannel = channelName || '';
      setVideoTitle(vTitle);

      // 2. Extract cards
      setLoadingStage('Extracting key insights...');
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, videoId: vid }),
        signal: abort.signal,
      });

      if (!extractRes.ok || !extractRes.body) throw new Error('Card extraction failed');

      let cards: PopCard[] = [];
      const reader = extractRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
              if (event.type === 'done') cards = event.cards;
              else if (event.type === 'error') throw new Error(event.message);
            } catch (e) {
              if (e instanceof Error && !e.message.includes('Unexpected end')) throw e;
            }
          }
        }
        if (done) break;
      }

      if (!cards.length) throw new Error('No cards extracted');

      // 3. Generate clickbait caption + rewritten headlines
      setLoadingStage('Writing slide copy...');
      const selectedCards = selectBestCards(cards);
      const cardData = selectedCards.map(c => ({
        headline: c.headline,
        body: c.body,
        type: c.type,
      }));
      let hookLine = vTitle;
      let captionText = '';
      let rewrittenHeadlines: string[] = [];
      let slideOrder: number[] | undefined;

      try {
        const captionRes = await fetch('/api/tiktok/caption', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: vTitle, cards: cardData, channelName: vChannel }),
          signal: abort.signal,
        });
        if (captionRes.ok) {
          const data = await captionRes.json();
          hookLine = data.hookLine || hookLine;
          captionText = data.caption || '';
          rewrittenHeadlines = data.rewrittenHeadlines || [];
          slideOrder = data.slideOrder;
        }
      } catch { /* non-critical */ }

      if (!captionText) {
        captionText = `${vTitle}\n\nKey takeaways you need to know \u{1F447}\n\nSave this for later!\n\n#knowledge #learning #education #fyp #tips #productivity`;
      }

      // 4. Fetch storyboard frames for each card's timestamp
      setLoadingStage('Fetching video frames...');
      const selectedForFrames = selectBestCards(cards);
      const timestamps = selectedForFrames
        .map(c => c.timestamp)
        .filter((t): t is string => !!t);
      let frameMap: Map<string, string> | undefined;
      if (videoId && timestamps.length > 0) {
        frameMap = await fetchStoryboardFrames(videoId, timestamps);
      }

      // 5. Build slides with storyboard frames and rewritten headlines
      setLoadingStage('Building slides...');
      const builtSlides = buildSlides(cards, vTitle, hookLine, vChannel, thumbnail, rewrittenHeadlines, frameMap, slideOrder);
      setSlides(builtSlides);
      setCaption(captionText);
      setState('results');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') { setState('input'); return; }
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      setState('error');
    }
  }, [url]);

  /* ── Get the background color for a slide ────────────── */
  const getSlideBgColor = useCallback((slide: SlideData): string => {
    if (slide.variant === 'hook' || slide.variant === 'cta') return '#1a1a2e';
    if (slide.colorIndex != null) return getSlideColor(slide.colorIndex).bg;
    return '#1a1a2e';
  }, []);

  /* ── Download single slide ───────────────────────────── */
  const downloadSlide = useCallback(async (slideId: string, index: number) => {
    const el = slideRefs.current.get(slideId);
    const slide = slides.find(s => s.id === slideId);
    if (!el || !slide) return;
    setDownloading(slideId);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(el, {
        pixelRatio: 4,
        cacheBust: true,
        backgroundColor: getSlideBgColor(slide),
      });
      const link = document.createElement('a');
      link.download = `popcard-slide-${index + 1}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(null);
    }
  }, [slides, getSlideBgColor]);

  /* ── Download all as zip ─────────────────────────────── */
  const downloadAll = useCallback(async () => {
    setDownloading('all');
    try {
      const { toPng } = await import('html-to-image');
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (let i = 0; i < slides.length; i++) {
        const el = slideRefs.current.get(slides[i].id);
        if (!el) continue;
        const dataUrl = await toPng(el, {
          pixelRatio: 4,
          cacheBust: true,
          backgroundColor: getSlideBgColor(slides[i]),
        });
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        zip.file(`popcard-slide-${i + 1}.png`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.download = 'popcard-tiktok-slides.zip';
      link.href = URL.createObjectURL(zipBlob);
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error('Batch download failed:', err);
    } finally {
      setDownloading(null);
    }
  }, [slides]);

  /* ── Copy caption ────────────────────────────────────── */
  const handleCopyCaption = useCallback(async () => {
    try { await navigator.clipboard.writeText(caption); } catch {
      const ta = document.createElement('textarea');
      ta.value = caption; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  }, [caption]);

  /* ── Slide controls ──────────────────────────────────── */
  const removeSlide = useCallback((id: string) => {
    setSlides(prev => {
      const filtered = prev.filter(s => s.id !== id);
      return filtered.map((s, i) => ({ ...s, slideNumber: i + 1, totalSlides: filtered.length }));
    });
  }, []);

  const moveSlide = useCallback((id: string, direction: -1 | 1) => {
    setSlides(prev => {
      const idx = prev.findIndex(s => s.id === id);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr.map((s, i) => ({ ...s, slideNumber: i + 1, totalSlides: arr.length }));
    });
  }, []);

  const handleReset = () => {
    abortRef.current?.abort();
    setState('input'); setSlides([]); setCaption(''); setUrl(''); setErrorMsg('');
  };

  return (
    <div className="min-h-screen bg-dot-grid flex flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="select-none"><Logo size="md" /></a>
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400 hidden sm:block">/ TikTok Slides</span>
          </div>
          <a href="/" className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-[#4A90D9] transition-colors">
            <ArrowLeft size={14} weight="bold" />
            Back to Popcard
          </a>
        </div>
      </nav>

      <main className="flex-1">
        {/* ── INPUT ─────────────────────────────────── */}
        {state === 'input' && (
          <section className="relative overflow-hidden pt-16 pb-16 px-6">
            <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full pointer-events-none" style={{ background: '#6C63FF', filter: 'blur(130px)', opacity: 0.08 }} />
            <div className="absolute top-10 right-1/4 w-72 h-72 rounded-full pointer-events-none" style={{ background: '#FF6B6B', filter: 'blur(110px)', opacity: 0.06 }} />

            <div className="max-w-2xl mx-auto text-center relative z-10">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight mb-4">
                  <span className="text-gray-800">TikTok Slides</span><br />
                  <span style={{ color: '#4A90D9' }}>in seconds.</span>
                </h1>
                <p className="text-gray-500 text-lg mb-10 max-w-lg mx-auto">
                  Paste a YouTube link. Get branded carousel slides with video screenshots, ready to post.
                </p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
                <div className={`flex items-center gap-3 bg-white rounded-full px-5 py-3 shadow-lg border-2 transition-all ${urlError ? 'border-red-400 shadow-red-100' : 'border-gray-200 hover:border-blue-300 focus-within:border-blue-400'}`}>
                  <Link2 className="text-gray-400 shrink-0" size={20} />
                  <input
                    type="url" value={url}
                    onChange={e => { setUrl(e.target.value); setUrlError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                    placeholder="Paste a YouTube link..."
                    className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 text-base outline-none min-w-0"
                  />
                  {url && <button onClick={() => { setUrl(''); setUrlError(''); }} className="text-gray-300 hover:text-gray-500 transition-colors"><X size={16} /></button>}
                  <button
                    onClick={handleGenerate}
                    className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm bg-[#4A90D9] text-white hover:bg-[#3a7fc8] active:scale-95 transition-all"
                  >
                    <Sparkles size={15} /> Generate
                  </button>
                </div>
                {urlError && <p className="mt-2 text-sm text-red-500 text-center">{urlError}</p>}
              </motion.div>

              {/* Preview mockup */}
              <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="mt-16 flex justify-center gap-3">
                {['#FF6B6B', '#4ECDC4', '#6C63FF', '#FFD93D'].map((color, i) => (
                  <div key={i} className="rounded-xl shadow-lg" style={{
                    width: 60, height: 107,
                    background: `linear-gradient(160deg, #0c0c1d 0%, ${color}20 50%, #0c0c1d 100%)`,
                    border: '1px solid rgba(255,255,255,0.05)',
                    transform: `rotate(${(i - 1.5) * 3}deg)`,
                  }}>
                    <div className="p-2">
                      <div className="h-5 w-full rounded bg-white/5 mb-2" />
                      <div className="h-1 w-8 rounded-full mb-2" style={{ backgroundColor: color, opacity: 0.6 }} />
                      <div className="h-1 w-12 rounded-full bg-white/10 mb-1" />
                      <div className="h-1 w-10 rounded-full bg-white/10" />
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          </section>
        )}

        {/* ── LOADING ──────────────────────────────── */}
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center py-32 px-6">
            <div className="w-12 h-12 border-4 border-[#4A90D9] border-t-transparent rounded-full animate-spin mb-6" />
            <p className="text-gray-600 font-medium mb-2">{loadingStage}</p>
            <p className="text-sm text-gray-400">This usually takes 15-30 seconds</p>
            <button onClick={handleReset} className="mt-6 text-sm text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
          </div>
        )}

        {/* ── ERROR ────────────────────────────────── */}
        {state === 'error' && (
          <div className="flex flex-col items-center justify-center py-32 px-6 text-center">
            <div className="text-5xl mb-4">😬</div>
            <p className="text-gray-700 font-semibold text-lg mb-2">{errorMsg}</p>
            <button onClick={handleReset} className="mt-4 px-6 py-2.5 rounded-full bg-[#4A90D9] text-white font-semibold text-sm hover:bg-[#3a7fc8] transition-all">Try again</button>
          </div>
        )}

        {/* ── RESULTS ──────────────────────────────── */}
        {state === 'results' && (
          <div className="max-w-6xl mx-auto px-6 py-8">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800">{videoTitle}</h2>
                <p className="text-sm text-gray-400 mt-1">{slides.length} slides &middot; 1080&times;1920px &middot; TikTok ready</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={downloadAll}
                  disabled={downloading === 'all'}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#4A90D9] text-white font-semibold text-sm hover:bg-[#3a7fc8] active:scale-95 disabled:opacity-60 transition-all"
                >
                  {downloading === 'all' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <DownloadSimple size={16} weight="bold" />}
                  Download All
                </button>
                <button onClick={handleReset} className="px-4 py-2.5 rounded-full border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:border-gray-300 transition-all">New video</button>
              </div>
            </div>

            {/* Slides grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-10">
              <AnimatePresence>
                {slides.map((slide, i) => (
                  <motion.div
                    key={slide.id} layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ delay: i * 0.05 }}
                    className="group relative"
                  >
                    <div className="rounded-xl overflow-hidden shadow-lg">
                      <TikTokSlide
                        ref={el => { if (el) slideRefs.current.set(slide.id, el); else slideRefs.current.delete(slide.id); }}
                        slide={slide}
                      />
                    </div>

                    {/* Hover controls */}
                    <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button onClick={() => downloadSlide(slide.id, i)} disabled={downloading === slide.id}
                        className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-800 transition-all shadow-sm" title="Download">
                        {downloading === slide.id ? <span className="w-4 h-4 border-2 border-gray-800 border-t-transparent rounded-full animate-spin block" /> : <DownloadSimple size={16} weight="bold" />}
                      </button>
                      {slide.variant === 'content' && (
                        <>
                          <button onClick={() => moveSlide(slide.id, -1)} className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-800 transition-all shadow-sm" title="Move left"><CaretLeft size={16} weight="bold" /></button>
                          <button onClick={() => moveSlide(slide.id, 1)} className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-800 transition-all shadow-sm" title="Move right"><CaretRight size={16} weight="bold" /></button>
                          <button onClick={() => removeSlide(slide.id)} className="p-2 rounded-full bg-red-500/90 hover:bg-red-500 text-white transition-all shadow-sm" title="Remove"><Trash size={16} weight="bold" /></button>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Caption panel */}
            <div className="rounded-3xl bg-gray-900 p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-white/50">TikTok Caption</h3>
                <button onClick={handleCopyCaption} className="flex items-center gap-1.5 text-sm font-medium text-white/60 hover:text-white transition-colors">
                  {copiedCaption ? <><Check size={14} weight="bold" className="text-green-400" /> Copied!</> : <><Copy size={14} weight="bold" /> Copy</>}
                </button>
              </div>
              <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{caption}</p>
            </div>

            {/* Tips */}
            <div className="mt-8 rounded-2xl bg-blue-50 border border-blue-100 p-5">
              <h4 className="text-sm font-bold text-blue-900 mb-2">Tips for posting</h4>
              <ul className="text-sm text-blue-800/80 space-y-1">
                <li>&bull; Download all slides and upload as a TikTok photo carousel</li>
                <li>&bull; Copy the caption and paste it in the TikTok caption field</li>
                <li>&bull; Reorder or remove slides using the hover controls</li>
                <li>&bull; Each slide includes a video screenshot at the relevant timecode</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <Logo size="sm" />
          <p className="text-sm text-gray-400">&copy; 2026 Popcard AI</p>
        </div>
      </footer>
    </div>
  );
}
