import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Lazily instantiated so the module doesn't throw at import time if env vars are missing
let limiter: Ratelimit | null = null;

function getLimiter(): Ratelimit | null {
  if (limiter) return limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    analytics: false,
  });
  return limiter;
}

export async function rateLimit(
  key: string,
): Promise<{ ok: boolean; remaining: number }> {
  const l = getLimiter();
  // If Upstash isn't configured (local dev without .env), allow all requests
  if (!l) return { ok: true, remaining: 999 };
  const { success, remaining } = await l.limit(key);
  return { ok: success, remaining };
}
