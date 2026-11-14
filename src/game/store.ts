import { create } from 'zustand';
import type { Dir, Kind } from '../sim';
import type { OfflineReport } from './host';

export type Overlay = 'none' | 'pressure' | 'rot';

interface UIState {
  tool: Kind | null;
  dir: Dir;
  selected: { x: number; y: number } | null;
  overlay: Overlay;
  panel: 'none' | 'mutations' | 'help';
  toast: { msg: string; at: number } | null;
  offline: OfflineReport | null;
  loading: number | null;
  /** Bumped ~8×/s so React HUD re-renders at a calm rate; the canvas draws every frame on its own. */
  frame: number;
  set: (p: Partial<UIState>) => void;
  say: (msg: string) => void;
}

export const useUI = create<UIState>((set) => ({
  tool: null,
  dir: 2,
  selected: null,
  overlay: 'none',
  panel: 'none',
  toast: null,
  offline: null,
  loading: null,
  frame: 0,
  set: (p) => set(p),
  say: (msg) => set({ toast: { msg, at: Date.now() } }),
}));
