import { PopCard } from '@/types/card';

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;

  const wordsA = na.split(' ');
  const wordsB = nb.split(' ');
  const setB = new Set(wordsB);
  const intersectionSize = wordsA.filter(w => setB.has(w)).length;
  const unionSize = new Set(wordsA.concat(wordsB)).size;

  return intersectionSize / unionSize;
}

export function deduplicateCards(cards: PopCard[], threshold = 0.6): PopCard[] {
  const kept: PopCard[] = [];

  for (const card of cards) {
    const isDuplicate = kept.some(
      k => k.type === card.type && similarity(k.headline + k.body, card.headline + card.body) > threshold
    );
    if (!isDuplicate) {
      kept.push(card);
    }
  }

  return kept;
}
