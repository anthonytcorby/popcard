'use client';

import { motion } from 'framer-motion';
import { PopCard as PopCardType, CardType } from '@/types/card';
import PopCard from './PopCard';

interface CardGridProps {
  cards: PopCardType[];
  filter: CardType | 'ALL';
  videoUrl?: string;
  searchQuery?: string;
}

export default function CardGrid({ cards, filter, videoUrl, searchQuery = '' }: CardGridProps) {
  const query = searchQuery.toLowerCase().trim();

  // Apply type filter first, then search filter
  let visible = filter === 'ALL'
    ? cards
    : cards.filter(c => c.type === filter);

  if (query) {
    visible = visible.filter(c =>
      c.type === 'SECTION_HEADER' ||
      c.headline.toLowerCase().includes(query) ||
      c.body.toLowerCase().includes(query) ||
      (c.boldPhrase && c.boldPhrase.toLowerCase().includes(query))
    );
  }

  const filterable = visible.filter(c => c.type !== 'SECTION_HEADER');

  if (filterable.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <div className="text-5xl mb-4">🫧</div>
        <p className="text-base">{query ? 'No cards match your search.' : 'No cards of this type yet.'}</p>
      </div>
    );
  }

  // Track card index separately (for animation stagger) excluding section headers
  let cardIndex = 0;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((card) => {
        if (card.type === 'SECTION_HEADER') {
          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="col-span-full flex items-center gap-3 pt-4 pb-1"
            >
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-bold uppercase tracking-widest text-gray-400 px-2 whitespace-nowrap">
                {card.headline}
                {card.timestamp && (
                  <span className="ml-2 font-normal opacity-60">{card.timestamp}</span>
                )}
              </span>
              <div className="h-px flex-1 bg-gray-200" />
            </motion.div>
          );
        }

        const idx = cardIndex++;
        return (
          <PopCard
            key={card.id}
            card={card}
            index={idx}
            videoUrl={videoUrl}
          />
        );
      })}
    </div>
  );
}
