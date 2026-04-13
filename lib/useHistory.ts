'use client';

import { useState, useEffect, useCallback } from 'react';
import { PopCard } from '@/types/card';

export interface HistoryEntry {
  id: string;
  savedAt: number;
  title: string;
  url?: string;
  thumbnailUrl?: string | null;
  cardCount: number;
  cards: PopCard[];
  takeaways: string[];
}

const STORAGE_KEY = 'popcard_history';
const MAX_ENTRIES = 10;

function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage quota exceeded — silently skip
  }
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const addEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'savedAt'>) => {
    setHistory(prev => {
      const newEntry: HistoryEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        savedAt: Date.now(),
      };
      const updated = [newEntry, ...prev].slice(0, MAX_ENTRIES);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.filter(e => e.id !== id);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  }, []);

  return { history, addEntry, removeEntry, clearHistory };
}
