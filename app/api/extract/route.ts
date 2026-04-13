import { NextRequest } from 'next/server';
import { extractCards } from '@/lib/gemini';
import { getCached, setCached } from '@/lib/cache';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const ExtractBody = z.object({
  transcript: z.string().min(1, 'transcript is required'),
  videoId: z.string().optional(),
});

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro allows up to 300s

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { ok } = rateLimit(ip, 60_000, 10);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'rate_limited', message: 'Too many requests. Please wait a moment.' }), { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = ExtractBody.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'invalid_request', message: parsed.error.issues[0]?.message ?? 'Invalid request body.' }),
      { status: 400 }
    );
  }
  const { transcript, videoId } = parsed.data;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Send SSE comment pings every 10s to keep the connection alive while
      // Gemini is thinking. Browsers and proxies may drop idle SSE streams.
      // SSE comment lines (": ...") are ignored by the client parser.
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')); } catch { /* stream closed */ }
      }, 10_000);

      try {
        // Cache hit — skip Gemini entirely
        if (videoId) {
          const cached = getCached(videoId);
          if (cached) {
            console.log(`[extract] cache hit for ${videoId}`);
            send({ type: 'done', cards: cached.cards, takeaways: cached.takeaways });
            return;
          }
        }

        send({ type: 'progress' });

        const { cards, takeaways } = await extractCards(transcript);

        if (cards.length === 0) {
          send({ type: 'error', message: "Couldn't extract any cards. The video may not have enough content, or try again in a moment." });
        } else {
          if (videoId) setCached(videoId, { cards, takeaways });
          send({ type: 'done', cards, takeaways });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Log in chunks so Vercel doesn't truncate the error
        console.error('[extract] err(0-200):', msg.slice(0, 200));
        if (msg.length > 200) console.error('[extract] err(200+):', msg.slice(200, 500));
        const isTransient = msg.includes('429') || msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('overloaded');
        send({
          type: 'error',
          message: isTransient
            ? "We're a bit busy right now — please try again in a moment."
            : 'Extraction failed. Please try again.',
        });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
