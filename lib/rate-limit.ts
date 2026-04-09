// Simple in-memory rate limiter using sliding window
const hits = new Map<string, number[]>();

export function rateLimit(key: string, windowMs: number, maxHits: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  let timestamps = hits.get(key) ?? [];
  timestamps = timestamps.filter(t => t > windowStart);

  if (timestamps.length >= maxHits) {
    return { ok: false, remaining: 0 };
  }

  timestamps.push(now);
  hits.set(key, timestamps);

  // Cleanup old keys periodically
  if (hits.size > 10000) {
    for (const [k, v] of hits) {
      if (v.every(t => t < windowStart)) hits.delete(k);
    }
  }

  return { ok: true, remaining: maxHits - timestamps.length };
}
