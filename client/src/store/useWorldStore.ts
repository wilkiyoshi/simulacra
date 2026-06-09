/**
 * useWorldStore.ts
 * ----------------
 * Estado global (zustand). Mantém o último snapshot do mundo recebido via
 * Socket.IO. A cena Phaser e o dashboard leem daqui.
 */
import { create } from 'zustand';
import type { WorldSnapshot } from '../types';

interface WorldStore {
  snapshot: WorldSnapshot | null;
  setSnapshot: (snap: WorldSnapshot) => void;
}

export const useWorldStore = create<WorldStore>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
}));
