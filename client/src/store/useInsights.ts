/**
 * useInsights.ts
 * --------------
 * Feed de Insights gerados pelo observador da cidade.
 */
import { create } from 'zustand';
import { nanoid } from 'nanoid';

export interface Insight {
  id: string;
  at: number; // epoch ms (relógio real)
  text: string;
}

interface InsightsState {
  items: Insight[];
  generating: boolean;
  add: (texts: string[]) => void;
  setGenerating: (v: boolean) => void;
  clear: () => void;
}

export const useInsights = create<InsightsState>((set) => ({
  items: [],
  generating: false,
  add: (texts) =>
    set((s) => ({
      items: [
        ...texts.map((text) => ({ id: nanoid(), at: Date.now(), text })),
        ...s.items,
      ].slice(0, 60),
    })),
  setGenerating: (generating) => set({ generating }),
  clear: () => set({ items: [] }),
}));
