'use client';

import { Clock, X } from 'lucide-react';
import { HistoryEntry } from '@/lib/useHistory';

interface HistoryPanelProps {
  history: HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function HistoryPanel({ history, onRestore, onRemove }: HistoryPanelProps) {
  if (history.length === 0) return null;

  return (
    <div className="w-full max-w-2xl mx-auto mt-5">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Clock size={13} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Recent</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {history.map(entry => (
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => onRestore(entry)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onRestore(entry); }}
            className="group relative flex-shrink-0 w-44 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden text-left cursor-pointer"
          >
            <div className="h-20 bg-gray-100 overflow-hidden">
              {entry.thumbnailUrl ? (
                <img
                  src={entry.thumbnailUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
                  <span className="text-2xl">📄</span>
                </div>
              )}
            </div>

            <div className="px-3 py-2">
              <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-tight mb-1">
                {entry.title}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{entry.cardCount} cards</span>
                <span className="text-xs text-gray-400">{timeAgo(entry.savedAt)}</span>
              </div>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
              aria-label="Remove from history"
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
