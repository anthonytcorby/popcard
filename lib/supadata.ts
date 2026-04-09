/**
 * YouTube transcript fetcher — durable, multi-strategy.
 * Strategy 1: Supadata.ai API (reliable paid service, free tier available).
 * Strategy 2: InnerTube ANDROID client (fast, works from most IPs).
 * Strategy 3: Direct timedtext API (bypasses watch-page bot detection).
 * Strategy 4: YouTube watch-page scraping with cookie bypass (last resort).
 *
 * Set SUPADATA_API_KEY env var for production reliability.
 */

export class TranscriptError extends Error {
  constructor(public code: 'no_transcript' | 'private' | 'invalid_url') {
    super(code);
    this.name = 'TranscriptError';
  }
}

// ─── Shared helpers ────────────────────────────────────────────────────────

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n/g, ' ');
}

function parseTimedTextXml(xml: string): string {
  // Format 3: <p t="ms" d="ms"><s>word</s><s t="offset">word</s></p>
  const paragraphs = [...xml.matchAll(/<p\s[^>]*>([\s\S]*?)<\/p>/g)];
  if (paragraphs.length > 0) {
    return paragraphs
      .map(m =>
        [...m[1].matchAll(/<s[^>]*>([^<]*)<\/s>/g)]
          .map(w => w[1])
          .join('')
          .trim()
      )
      .filter(Boolean)
      .map(decodeEntities)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Fallback: older <text start="..." dur="...">content</text> format
  return [...xml.matchAll(/<text[^>]*>([^<]+)<\/text>/g)]
    .map(m => decodeEntities(m[1]))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchCaptionXml(
  captionTracks: Array<{ languageCode: string; baseUrl: string }>,
  videoId: string
): Promise<string> {
  const track =
    captionTracks.find(t => t.languageCode === 'en') ??
    captionTracks.find(t => t.languageCode?.startsWith('en')) ??
    captionTracks[0];

  if (!track?.baseUrl) throw new TranscriptError('no_transcript');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(track.baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `https://www.youtube.com/watch?v=${videoId}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new TranscriptError('no_transcript');
    return res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Strategy 1: Supadata.ai API ───────────────────────────────────────────

interface SupadataSegment {
  text: string;
  offset: number; // milliseconds from start
  duration: number;
  lang: string;
}

function msToTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Interleave [MM:SS] markers every ~30 seconds so Gemini can reference them. */
function formatSegmentsWithTimestamps(segments: SupadataSegment[]): string {
  if (!segments.length) return '';

  const parts: string[] = [];
  let lastMarkerMs = -1;
  const MARKER_INTERVAL_MS = 30_000;

  for (const seg of segments) {
    if (seg.offset - lastMarkerMs >= MARKER_INTERVAL_MS) {
      parts.push(`[${msToTimestamp(seg.offset)}]`);
      lastMarkerMs = seg.offset;
    }
    parts.push(seg.text.trim());
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

async function fetchViaSupadata(videoId: string): Promise<string | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) return null; // key not configured — skip to fallbacks

  // Omit text=true to get segment objects with offset timestamps
  const url = `https://api.supadata.ai/v1/youtube/transcript?videoId=${encodeURIComponent(videoId)}&lang=en`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'x-api-key': apiKey },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
  clearTimeout(timeout);

  if (res.status === 401 || res.status === 429) {
    // Auth issue or quota exceeded — fall through to free fallbacks
    console.warn(`[transcript] Supadata returned ${res.status}, falling back`);
    return null;
  }

  const body = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    const code = (body?.error as string) ?? '';
    if (code === 'not-found' || code === 'transcript-unavailable' || res.status === 206) {
      throw new TranscriptError('no_transcript');
    }
    if (code === 'forbidden' || res.status === 403) {
      throw new TranscriptError('private');
    }
    return null; // unknown error — try fallbacks
  }

  const content = body?.content;

  // Segment array (default response) — embed [MM:SS] markers
  if (Array.isArray(content)) {
    const text = formatSegmentsWithTimestamps(content as SupadataSegment[]);
    return text || null;
  }

  // Plain string fallback (shouldn't happen without text=true, but handle gracefully)
  if (typeof content === 'string') {
    return content.trim() || null;
  }

  return null;
}

// ─── Strategy 2: InnerTube ANDROID client ──────────────────────────────────

async function fetchViaInnerTube(
  videoId: string
): Promise<Array<{ languageCode: string; baseUrl: string }> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(
      'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
          'X-YouTube-Client-Name': '3',
          'X-YouTube-Client-Version': '20.10.38',
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34 },
          },
        }),
        signal: controller.signal,
      }
    );
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
  clearTimeout(timeout);

  if (!res.ok) return null;
  const data = await res.json() as Record<string, unknown>;

  const status = (data?.playabilityStatus as Record<string, string>)?.status;
  if (status === 'ERROR') throw new TranscriptError('no_transcript');
  // LOGIN_REQUIRED from datacenter IPs can be a false-positive — fall through
  if (status !== 'OK') return null;

  const tracks = (
    (data?.captions as Record<string, unknown>)
      ?.playerCaptionsTracklistRenderer as Record<string, unknown>
  )?.captionTracks as Array<{ languageCode: string; baseUrl: string }> | undefined;

  return tracks?.length ? tracks : null;
}

// ─── Strategy 3: Direct timedtext API ──────────────────────────────────────

async function fetchViaTimedTextApi(videoId: string): Promise<string | null> {
  // Fetch available track list first
  const listController = new AbortController();
  const listTimeout = setTimeout(() => listController.abort(), 10_000);
  let listRes: Response;
  try {
    listRes = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&type=list`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Referer': `https://www.youtube.com/watch?v=${videoId}`,
        },
        signal: listController.signal,
      }
    );
  } catch (err) {
    clearTimeout(listTimeout);
    throw err;
  }
  clearTimeout(listTimeout);

  let langCode = 'en';
  if (listRes.ok) {
    const listXml = await listRes.text();
    const enTrack = listXml.match(/lang_code="(en[^"]*)"/);
    const anyTrack = listXml.match(/lang_code="([^"]+)"/);
    if (enTrack) langCode = enTrack[1];
    else if (anyTrack) langCode = anyTrack[1];
    else return null; // no tracks in list
  }

  for (const lang of [langCode, `a.${langCode}`, 'en', 'a.en']) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(
        `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Referer': `https://www.youtube.com/watch?v=${videoId}`,
          },
          signal: controller.signal,
        }
      );
      if (!res.ok) continue;
      const xml = await res.text();
      if (xml?.trim() && xml.includes('<text')) return xml;
    } catch {
      continue; // timeout or network error — try next lang
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

// ─── Strategy 4: Web page scraping ─────────────────────────────────────────

async function fetchViaWebPage(
  videoId: string
): Promise<Array<{ languageCode: string; baseUrl: string }>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en&gl=US`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cookie': 'CONSENT=YES+cb; GPS=1; VISITOR_INFO1_LIVE=; PREF=f4=4000000',
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
  clearTimeout(timeout);

  if (!res.ok) throw new TranscriptError('no_transcript');
  const html = await res.text();

  // Only treat as truly private if LOGIN_REQUIRED and no player data at all
  if (
    html.includes('"status":"LOGIN_REQUIRED"') &&
    !html.includes('ytInitialPlayerResponse')
  ) {
    throw new TranscriptError('private');
  }
  if (html.includes('"status":"ERROR"') && !html.includes('ytInitialPlayerResponse')) {
    throw new TranscriptError('no_transcript');
  }

  const match =
    html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;[\s\S]*?<\/script>/) ??
    html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\});/);

  if (!match) throw new TranscriptError('no_transcript');

  const player = JSON.parse(match[1]) as Record<string, unknown>;
  const tracks = (
    (player?.captions as Record<string, unknown>)
      ?.playerCaptionsTracklistRenderer as Record<string, unknown>
  )?.captionTracks as Array<{ languageCode: string; baseUrl: string }> | undefined;

  if (!tracks?.length) throw new TranscriptError('no_transcript');
  return tracks;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function fetchTranscript(videoId: string): Promise<string> {
  // Strategy 1: Supadata.ai (requires SUPADATA_API_KEY, most reliable)
  try {
    const text = await fetchViaSupadata(videoId);
    if (text) return text;
  } catch (err) {
    if (err instanceof TranscriptError) throw err;
  }

  // Strategy 2: InnerTube ANDROID (works from residential IPs)
  try {
    const tracks = await fetchViaInnerTube(videoId);
    if (tracks?.length) {
      const xml = await fetchCaptionXml(tracks, videoId);
      if (xml?.trim() && xml.includes('<')) {
        const transcript = parseTimedTextXml(xml);
        if (transcript) return transcript;
      }
    }
  } catch (err) {
    if (err instanceof TranscriptError && err.code === 'no_transcript') throw err;
  }

  // Strategy 3: Direct timedtext API (bypasses watch-page bot detection)
  try {
    const xml = await fetchViaTimedTextApi(videoId);
    if (xml) {
      const transcript = parseTimedTextXml(xml);
      if (transcript) return transcript;
    }
  } catch {
    // Network error → try next strategy
  }

  // Strategy 4: Web page scraping with cookie bypass
  try {
    const tracks = await fetchViaWebPage(videoId);
    const xml = await fetchCaptionXml(tracks, videoId);
    if (!xml?.trim() || !xml.includes('<')) throw new TranscriptError('no_transcript');
    const transcript = parseTimedTextXml(xml);
    if (!transcript) throw new TranscriptError('no_transcript');
    return transcript;
  } catch (err) {
    if (err instanceof TranscriptError) throw err;
    throw new TranscriptError('no_transcript');
  }
}
