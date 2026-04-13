import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchTranscript, TranscriptError } from '@/lib/supadata';

const TranscriptBody = z.object({
  url: z.string().url('Must be a valid URL'),
});
import {
  isSpotifyUrl,
  extractSpotifyEpisodeId,
  fetchSpotifyMetadata,
  fetchSpotifyTranscript,
  SpotifyError,
} from '@/lib/spotify';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function extractVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { ok } = await rateLimit(ip);
  if (!ok) {
    return new Response(
      JSON.stringify({
        error: 'rate_limited',
        message: 'Too many requests. Please wait a moment.',
      }),
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = TranscriptBody.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_request', message: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
      { status: 400 }
    );
  }
  const { url } = parsed.data;

  /* ─── Spotify episode ─────────────────────────────────────── */
  if (isSpotifyUrl(url)) {
    const episodeId = extractSpotifyEpisodeId(url);
    if (!episodeId) {
      return NextResponse.json(
        { error: 'invalid_url', message: 'Could not parse Spotify episode ID.' },
        { status: 400 }
      );
    }

    try {
      const [transcript, metadata] = await Promise.all([
        fetchSpotifyTranscript(episodeId),
        fetchSpotifyMetadata(episodeId),
      ]);

      return NextResponse.json({
        transcript,
        videoId: `spotify-${episodeId}`,
        title: metadata?.title ?? null,
        thumbnailUrl: metadata?.thumbnailUrl ?? null,
        sourceType: 'spotify',
      });
    } catch (err) {
      if (err instanceof SpotifyError) {
        const messages: Record<string, string> = {
          no_transcript:
            "This Spotify episode doesn't have an accessible transcript. Try uploading a PDF or pasting the text instead.",
          invalid_url: "That doesn't look like a valid Spotify episode link.",
          not_episode:
            'Only Spotify podcast episodes are supported (not tracks or albums).',
        };
        return NextResponse.json(
          {
            error: err.code,
            message: messages[err.code] ?? 'Something went wrong.',
          },
          { status: 422 }
        );
      }
      console.error('[transcript:spotify]', err);
      return NextResponse.json(
        { error: 'unknown', message: 'Failed to fetch Spotify transcript.' },
        { status: 500 }
      );
    }
  }

  /* ─── YouTube video ───────────────────────────────────────── */
  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json(
      { error: 'invalid_url', message: 'Could not parse video ID.' },
      { status: 400 }
    );
  }

  try {
    const oEmbedController = new AbortController();
    const oEmbedTimeout = setTimeout(() => oEmbedController.abort(), 15_000);
    const [transcript, oEmbed] = await Promise.all([
      fetchTranscript(videoId),
      fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { signal: oEmbedController.signal }
      )
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ title: string; thumbnail_url: string; author_name: string }>)
            : null
        )
        .catch(() => null)
        .finally(() => clearTimeout(oEmbedTimeout)),
    ]);
    return NextResponse.json({
      transcript,
      videoId,
      title: oEmbed?.title ?? null,
      thumbnailUrl: oEmbed?.thumbnail_url ?? null,
      channelName: oEmbed?.author_name ?? null,
      sourceType: 'youtube',
    });
  } catch (err) {
    if (err instanceof TranscriptError) {
      const messages: Record<string, string> = {
        no_transcript:
          "Oops! This video doesn't have a transcript. Try another one?",
        private: "We can't access this video. Make sure it's public!",
        invalid_url: "That URL doesn't look right. Try again?",
      };
      return NextResponse.json(
        {
          error: err.code,
          message: messages[err.code] ?? 'Something went wrong.',
        },
        { status: 422 }
      );
    }
    console.error('[transcript]', err);
    return NextResponse.json(
      { error: 'unknown', message: 'Something went wrong.' },
      { status: 500 }
    );
  }
}
