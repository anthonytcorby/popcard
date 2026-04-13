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

const TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Cache version — bump to invalidate all cached results after prompt/model changes */
const CACHE_VERSION = 3;

function versionedKey(videoId: string): string {
  return `v${CACHE_VERSION}:${videoId}`;
}

export function getCached(videoId: string): CachedResult | null {
  const entry = cache.get(versionedKey(videoId));
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    cache.delete(versionedKey(videoId));
    return null;
  }
  return entry.result;
}

export function setCached(videoId: string, result: CachedResult): void {
  cache.set(versionedKey(videoId), { result, ts: Date.now() });
}
