/**
 * In-memory card cache keyed by YouTube video ID.
 * Lives for the lifetime of the serverless function instance — eliminates
 * repeat Gemini calls for the same video within a warm instance.
 */

import { PopCard } from '@/types/card';

export interface CachedResult {
  cards: PopCard[];
  takeaways: string[];
}

const cache = new Map<string, { result: CachedResult; ts: number }>();

const TTL_MS = 60 * 60 * 1000; // 1 hour

export function getCached(videoId: string): CachedResult | null {
  const entry = cache.get(videoId);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    cache.delete(videoId);
    return null;
  }
  return entry.result;
}

export function setCached(videoId: string, result: CachedResult): void {
  cache.set(videoId, { result, ts: Date.now() });
}
