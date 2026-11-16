import { create } from 'zustand';
import type { Dir, Kind } from '../sim';
import type { OfflineReport } from './host';

export type Overlay = 'none' | 'pressure' | 'rot';
export type Lang = 'en' | 'es';
export type Notation = 'suffix' | 'sci';
export type Panel = 'none' | 'mutations' | 'help' | 'stats' | 'settings' | 'tutorial';

const PREF = 'hollow-conduit/';
const load = (k: string) => {
  try {
    return localStorage.getItem(PREF + k);
  } catch {
    return null;
  }
};
const store = (k: string, v: string) => {
  try {
    localStorage.setItem(PREF + k, v);
  } catch {
    /* ignore */
  }
};

function initialLang(): Lang {
  const saved = load('lang');
  if (saved === 'es' || saved === 'en') return saved;
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return nav.toLowerCase().startsWith('es') ? 'es' : 'en';
}

interface UIState {
  tool: Kind | null;
  dir: Dir;
  selected: { x: number; y: number } | null;
  overlay: Overlay;
  panel: Panel;
  toast: { msg: string; at: number } | null;
  offline: OfflineReport | null;
  loading: number | null;
  lang: Lang;
  notation: Notation;
  tutorial: boolean;
  sound: boolean;
  /** Bumped ~8×/s so React HUD re-renders at a calm rate; the canvas draws every frame on its own. */
  frame: number;
  set: (p: Partial<UIState>) => void;
  say: (msg: string) => void;
  setLang: (l: Lang) => void;
  setNotation: (n: Notation) => void;
  setTutorial: (on: boolean) => void;
  setSound: (on: boolean) => void;
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
  lang: initialLang(),
  notation: load('notation') === 'sci' ? 'sci' : 'suffix',
  tutorial: load('tutorial') !== 'off',
  sound: load('sound') !== 'off',
  frame: 0,
  set: (p) => set(p),
  say: (msg) => set({ toast: { msg, at: Date.now() } }),
  setLang: (lang) => {
    store('lang', lang);
    document.documentElement.lang = lang;
    set({ lang });
  },
  setNotation: (notation) => {
    store('notation', notation);
    set({ notation });
  },
  setTutorial: (tutorial) => {
    store('tutorial', tutorial ? 'on' : 'off');
    set({ tutorial });
  },
  setSound: (sound) => {
    store('sound', sound ? 'on' : 'off');
    set({ sound });
  },
}));
