'use client';

import { CardType, FILTER_OPTIONS, CARD_COLORS } from '@/types/card';

interface FilterBarProps {
  active: CardType | 'ALL';
  onChange: (value: CardType | 'ALL') => void;
  counts: Partial<Record<CardType | 'ALL', number>>;
}

export default function FilterBar({ active, onChange, counts }: FilterBarProps) {
  return (
    <div role="tablist" className="flex flex-wrap gap-2">
      {FILTER_OPTIONS.map(opt => {
        const count = counts[opt.value] ?? 0;
        if (opt.value !== 'ALL' && count === 0) return null; // hide empty filters

        const isActive = active === opt.value;
        const color = opt.value === 'ALL' ? '#6C63FF' : CARD_COLORS[opt.value as CardType].bg;

        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.value)}
            className={`
              flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold
              transition-all duration-150 border-2
              ${isActive
                ? 'text-white shadow-md scale-105'
                : 'text-gray-600 bg-white border-gray-200 hover:border-gray-300'
              }
            `}
            style={isActive ? { backgroundColor: color, borderColor: color } : { borderColor: 'transparent' }}
          >
            {opt.label}
            {count > 0 && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/25' : 'bg-gray-100'}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
