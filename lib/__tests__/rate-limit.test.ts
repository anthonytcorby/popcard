import { describe, it, expect, beforeEach, vi } from 'vitest';

// Test the fallback path — when Upstash env vars are absent, all requests pass
describe('rateLimit (fallback mode, no Upstash)', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
  });

  it('returns ok:true when Upstash is not configured', async () => {
    const { rateLimit } = await import('../rate-limit');
    const result = await rateLimit('test-ip');
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(999);
  });

  it('returns ok:true for multiple calls when unconfigured', async () => {
    const { rateLimit } = await import('../rate-limit');
    const results = await Promise.all([
      rateLimit('ip-1'),
      rateLimit('ip-2'),
      rateLimit('ip-3'),
    ]);
    expect(results.every(r => r.ok)).toBe(true);
  });
});
