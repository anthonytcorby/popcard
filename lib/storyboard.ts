/**
 * YouTube storyboard frame extraction.
 *
 * YouTube exposes sprite-sheet "storyboards" — grids of thumbnail frames
 * sampled at regular intervals throughout the video.  The spec lives in the
 * InnerTube player response under
 *   storyboards.playerStoryboardSpecRenderer.spec
 *
 * Format (pipe-delimited segments, one per quality level):
 *   baseUrl#width#height#count#cols#rows#interval#…#sigh=<token>
 *
 * We always pick the LAST (highest-res) segment.
 */

export interface StoryboardSpec {
  baseUrl: string;
  width: number;
  height: number;
  count: number;
  cols: number;
  rows: number;
  /** Interval in milliseconds between frames */
  interval: number;
  /** How many frames per sheet image */
  framesPerSheet: number;
}

/**
 * Fetch storyboard spec by scraping the YouTube watch page.
 * The InnerTube API is locked down, but the watch page HTML
 * contains ytInitialPlayerResponse with the storyboard spec.
 */
export async function fetchStoryboardSpec(
  videoId: string,
): Promise<StoryboardSpec | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Extract ytInitialPlayerResponse from the page
    const match = html.match(
      /var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});/,
    );
    if (!match) return null;

    const data = JSON.parse(match[1]);
    const specStr: string | undefined =
      data?.storyboards?.playerStoryboardSpecRenderer?.spec;

    if (!specStr) return null;

    return parseStoryboardSpec(specStr);
  } catch {
    return null;
  }
}

/**
 * Parse the pipe-delimited storyboard spec string.
 * Returns info for the highest-quality level (last segment).
 *
 * Segment format:  width#height#count#cols#rows#interval#namePattern#sigh
 *   namePattern: e.g. "M$M" where $M is the sheet index, or "default"
 *   sigh: e.g. "rs$AOn4CL..." — authentication token
 *
 * Base URL (segment 0): has $L for level index, $N for sheet name.
 */
export function parseStoryboardSpec(spec: string): StoryboardSpec | null {
  const segments = spec.split('|');
  if (segments.length < 2) return null;

  const baseSegment = segments[0];
  const lastSegment = segments[segments.length - 1];

  const parts = lastSegment.split('#');
  if (parts.length < 8) return null;

  const width = parseInt(parts[0], 10);
  const height = parseInt(parts[1], 10);
  const count = parseInt(parts[2], 10);
  const cols = parseInt(parts[3], 10);
  const rows = parseInt(parts[4], 10);
  const interval = parseInt(parts[5], 10); // ms
  const namePattern = parts[6]; // e.g. "M$M"
  const sigh = parts.slice(7).join('#'); // e.g. "rs$AOn4CL..."

  if ([width, height, count, cols, rows, interval].some(isNaN)) return null;

  const levelIndex = segments.length - 1;

  // Replace $L with level index, $N with the namePattern (keeps $M for per-sheet replacement)
  let baseUrl = baseSegment
    .replace('$L', String(levelIndex))
    .replace('$N', namePattern);

  // Append sigh token
  if (sigh) {
    baseUrl += (baseUrl.includes('?') ? '&' : '?') + sigh;
  }

  const framesPerSheet = cols * rows;

  return { baseUrl, width, height, count, cols, rows, interval, framesPerSheet };
}

/**
 * Convert a "MM:SS" or "H:MM:SS" timestamp to milliseconds.
 */
export function timestampToMs(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return (parts[0] ?? 0) * 1000;
}

/**
 * For a given timestamp (ms), compute which sheet image to fetch
 * and the crop region within that sheet.
 */
export function getFramePosition(
  spec: StoryboardSpec,
  timestampMs: number,
): { sheetIndex: number; x: number; y: number; w: number; h: number } {
  const frameIndex = Math.min(
    Math.floor(timestampMs / spec.interval),
    spec.count - 1,
  );
  const sheetIndex = Math.floor(frameIndex / spec.framesPerSheet);
  const indexInSheet = frameIndex % spec.framesPerSheet;
  const col = indexInSheet % spec.cols;
  const row = Math.floor(indexInSheet / spec.cols);

  return {
    sheetIndex,
    x: col * spec.width,
    y: row * spec.height,
    w: spec.width,
    h: spec.height,
  };
}

/**
 * Build the URL for a specific sheet image.
 * The baseUrl contains "$M" which is the sheet index placeholder.
 */
export function getSheetUrl(spec: StoryboardSpec, sheetIndex: number): string {
  return spec.baseUrl.replace('$M', String(sheetIndex));
}
