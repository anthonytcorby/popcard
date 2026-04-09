/**
 * Spotify podcast episode integration.
 * - URL detection and episode ID extraction
 * - Metadata via oEmbed (free, no auth)
 * - Transcript via anonymous token + internal API (best-effort)
 */

export class SpotifyError extends Error {
  constructor(public code: 'no_transcript' | 'invalid_url' | 'not_episode') {
    super(code);
    this.name = 'SpotifyError';
  }
}

/** Check if a URL is a Spotify episode link */
export function isSpotifyUrl(url: string): boolean {
  return /open\.spotify\.com\/episode\//.test(url);
}

/** Extract Spotify episode ID from URL */
export function extractSpotifyEpisodeId(url: string): string | null {
  const match = url.match(/open\.spotify\.com\/episode\/([a-zA-Z0-9]{22})/);
  return match ? match[1] : null;
}

/** Fetch episode metadata via oEmbed (free, no auth needed) */
export async function fetchSpotifyMetadata(episodeId: string): Promise<{
  title: string;
  thumbnailUrl: string | null;
} | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `https://open.spotify.com/oembed?url=https://open.spotify.com/episode/${episodeId}`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      thumbnail_url?: string;
    };
    return {
      title: data.title ?? 'Unknown Episode',
      thumbnailUrl: data.thumbnail_url ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/* ─── Transcript fetching (best-effort) ─────────────────────────────────── */

/** Get an anonymous Spotify access token */
async function getAnonymousToken(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      'https://open.spotify.com/get_access_token?reason=transport&productType=web-player',
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        },
        signal: controller.signal,
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken?: string };
    return data.accessToken ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

interface TranscriptSegment {
  startMs: number;
  endMs: number;
  words: Array<{ word: string; startMs: number }> | string;
}

function msToTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Format transcript segments with [MM:SS] markers every ~30s */
function formatTranscriptSegments(segments: TranscriptSegment[]): string {
  const parts: string[] = [];
  let lastMarkerMs = -1;
  const MARKER_INTERVAL_MS = 30_000;

  for (const seg of segments) {
    if (seg.startMs - lastMarkerMs >= MARKER_INTERVAL_MS) {
      parts.push(`[${msToTimestamp(seg.startMs)}]`);
      lastMarkerMs = seg.startMs;
    }
    if (Array.isArray(seg.words)) {
      parts.push(seg.words.map((w) => w.word).join(' '));
    } else if (typeof seg.words === 'string') {
      parts.push(seg.words);
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Try to fetch transcript via Spotify's internal transcript API */
async function fetchViaInternalApi(
  episodeId: string,
  token: string
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    // Try the transcript-read-along endpoint
    const res = await fetch(
      `https://spclient.wg.spotify.com/transcript-read-along/v2/episode/${episodeId}?format=json`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'App-Platform': 'WebPlayer',
        },
        signal: controller.signal,
      }
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      section?: TranscriptSegment[];
      transcript?: { section?: TranscriptSegment[] };
    };

    const segments = data.section ?? data.transcript?.section;
    if (!segments?.length) return null;

    return formatTranscriptSegments(segments);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Main entry: fetch Spotify episode transcript (best-effort) */
export async function fetchSpotifyTranscript(
  episodeId: string
): Promise<string> {
  // Step 1: Get anonymous access token
  const token = await getAnonymousToken();
  if (!token) {
    console.warn('[spotify] Could not obtain anonymous token');
    throw new SpotifyError('no_transcript');
  }

  // Step 2: Try internal transcript API
  const transcript = await fetchViaInternalApi(episodeId, token);
  if (transcript && transcript.length > 100) {
    console.log(
      `[spotify] Got transcript (${transcript.length} chars) via internal API`
    );
    return transcript;
  }

  console.warn('[spotify] No transcript available via internal API');
  throw new SpotifyError('no_transcript');
}
