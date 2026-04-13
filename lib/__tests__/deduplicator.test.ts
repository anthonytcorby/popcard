import { describe, it, expect } from 'vitest';
import { deduplicateCards } from '../deduplicator';

const makeCard = (id: string, headline: string, body: string) => ({
  id,
  type: 'KEY_INSIGHT' as const,
  headline,
  body,
});

describe('deduplicateCards', () => {
  it('returns all cards when there are no duplicates', () => {
    const cards = [
      makeCard('1', 'First insight', 'Some unique body text here about productivity'),
      makeCard('2', 'Second insight', 'Completely different content about health habits'),
    ];
    expect(deduplicateCards(cards)).toHaveLength(2);
  });

  it('removes near-duplicate cards with identical body text', () => {
    const cards = [
      makeCard('1', 'Focus is the superpower', 'Deep work is essential for success in modern knowledge work.'),
      makeCard('2', 'Focus is the superpower of 21st century', 'Deep work is essential for success in modern knowledge work.'),
    ];
    const result = deduplicateCards(cards);
    expect(result.length).toBeLessThan(2);
  });

  it('preserves cards that are sufficiently different', () => {
    const cards = [
      makeCard('1', 'Exercise improves cognition', 'Physical activity increases BDNF and neuroplasticity significantly.'),
      makeCard('2', 'Sleep consolidates memory', 'During REM sleep the brain consolidates learning into long-term memory.'),
    ];
    expect(deduplicateCards(cards)).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateCards([])).toHaveLength(0);
  });
});
