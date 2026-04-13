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

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

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
