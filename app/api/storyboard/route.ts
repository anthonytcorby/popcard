import { NextRequest, NextResponse } from 'next/server';
import {
  fetchStoryboardSpec,
  timestampToMs,
  getFramePosition,
  getSheetUrl,
} from '@/lib/storyboard';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Returns storyboard spec + per-timestamp frame positions + sheet URLs.
 * The CLIENT handles the actual image fetching (YouTube blocks server-side requests).
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { ok } = rateLimit(ip, 60_000, 10);
  if (!ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const { videoId, timestamps } = (await req.json()) as {
    videoId: string;
    timestamps: string[];
  };

  if (!videoId || !timestamps?.length) {
    return NextResponse.json(
      { error: 'missing_params', message: 'videoId and timestamps required' },
      { status: 400 },
    );
  }

  const spec = await fetchStoryboardSpec(videoId);
  if (!spec) {
    return NextResponse.json(
      { error: 'no_storyboard', message: 'Could not fetch storyboard data for this video.' },
      { status: 422 },
    );
  }

  // Compute frame positions for each timestamp
  const frames = timestamps.map((ts) => {
    const ms = timestampToMs(ts);
    const pos = getFramePosition(spec, ms);
    return {
      timestamp: ts,
      sheetUrl: getSheetUrl(spec, pos.sheetIndex),
      x: pos.x,
      y: pos.y,
      w: pos.w,
      h: pos.h,
    };
  });

  return NextResponse.json({
    frameWidth: spec.width,
    frameHeight: spec.height,
    frames,
  });
}
