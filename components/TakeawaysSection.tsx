'use client';

import { motion } from 'framer-motion';

// Cycle through the app's card palette
const ACCENT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#6C63FF', '#FFD93D', '#FF9A3C',
  '#A78BFA', '#34D399', '#3B82F6', '#FF6B6B', '#4ECDC4',
  '#6C63FF', '#FFD93D', '#FF9A3C', '#A78BFA', '#34D399',
  '#3B82F6', '#FF6B6B', '#4ECDC4', '#6C63FF', '#FFD93D',
];

interface TakeawaysSectionProps {
  takeaways: string[];
}

export default function TakeawaysSection({ takeaways }: TakeawaysSectionProps) {
  if (!takeaways.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.15 }}
      className="mt-6 rounded-3xl overflow-hidden shadow-md"
      style={{ backgroundColor: '#1a1a2e' }}
    >
      {/* Header */}
      <div className="px-6 pt-5 pb-4 flex items-center gap-3 border-b border-white/10">
        <span
          className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
        >
          Summary
        </span>
        <h2 className="text-sm font-bold text-white/80">
          {takeaways.length} Quick Takeaways
        </h2>
      </div>

      {/* Takeaways grid */}
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        {takeaways.map((takeaway, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.04, duration: 0.25 }}
            className="flex items-start gap-2.5"
          >
            {/* Colored bullet */}
            <span
              className="mt-1.5 w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: ACCENT_COLORS[i % ACCENT_COLORS.length] }}
            />
            <p className="text-sm leading-snug text-white/75">{takeaway}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
