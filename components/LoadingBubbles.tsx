'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STAGES = [
  { message: 'Reading transcript...', target: 8 },
  { message: 'Identifying speaker...', target: 15 },
  { message: 'Finding key insights...', target: 28 },
  { message: 'Pulling exact quotes...', target: 42 },
  { message: 'Spotting tools & resources...', target: 55 },
  { message: 'Checking the stats...', target: 68 },
  { message: 'Building takeaways...', target: 80 },
  { message: 'Popping cards...', target: 92 },
];

const BUBBLE_COLORS = ['#FF6B6B', '#4ECDC4', '#6C63FF', '#FFD93D', '#FF9A3C'];

export default function LoadingBubbles() {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // Advance stages every ~2.5s
    const stageTimer = setInterval(() => {
      setStageIndex(i => Math.min(i + 1, STAGES.length - 1));
    }, 2500);

    // Smooth progress tick every 200ms
    const progressTimer = setInterval(() => {
      setProgress(prev => {
        // Asymptotically approach 95% — never hits 100 until real completion
        const target = 95;
        const remaining = target - prev;
        const increment = remaining * 0.04; // ease out
        return Math.min(prev + Math.max(increment, 0.1), target);
      });
    }, 200);

    const elapsedTimer = setInterval(() => {
      setElapsed(s => s + 1);
    }, 1000);

    return () => {
      clearInterval(stageTimer);
      clearInterval(progressTimer);
      clearInterval(elapsedTimer);
    };
  }, []);

  // Jump progress toward current stage target
  useEffect(() => {
    if (stageIndex < STAGES.length) {
      const target = STAGES[stageIndex].target;
      setProgress(prev => Math.max(prev, target - 5));
    }
  }, [stageIndex]);

  const currentMessage = STAGES[Math.min(stageIndex, STAGES.length - 1)].message;
  const displayPercent = Math.round(progress);

  return (
    <div className="flex flex-col items-center gap-5 py-12">
      {/* Bouncy bubbles */}
      <div className="flex items-end gap-3">
        {BUBBLE_COLORS.map((color, i) => (
          <motion.div
            key={i}
            className="rounded-full"
            animate={{ y: [0, -24, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
            style={{ width: 16 + (i % 3) * 4, height: 16 + (i % 3) * 4, backgroundColor: color }}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-64 sm:w-80">
        <div className="relative h-2 rounded-full bg-gray-200 overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: 'linear-gradient(90deg, #FF6B6B, #4ECDC4, #6C63FF, #FFD93D, #FF9A3C)',
              backgroundSize: '200% 100%',
            }}
            animate={{
              width: `${progress}%`,
              backgroundPosition: ['0% 0%', '100% 0%'],
            }}
            transition={{
              width: { duration: 0.5, ease: 'easeOut' },
              backgroundPosition: { duration: 3, repeat: Infinity, ease: 'linear' },
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          {/* Cycling message */}
          <div className="h-6 flex items-center overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={stageIndex}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="text-gray-500 text-sm font-medium"
              >
                {currentMessage}
              </motion.p>
            </AnimatePresence>
          </div>
          <span className="text-sm font-semibold text-gray-400 tabular-nums ml-3">
            {displayPercent}%
          </span>
        </div>
      </div>

      {/* Elapsed time — appears after 5s */}
      {elapsed >= 5 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-gray-400 tabular-nums"
        >
          {elapsed}s elapsed · longer videos take up to 30s
        </motion.p>
      )}
    </div>
  );
}
