import type Decimal from 'break_eternity.js';

/**
 * Resource indices. Buffers are fixed-length numeric arrays indexed by these,
 * which keeps the hot tick loop allocation-free and trivially serialisable.
 */
export const R = { ichor: 0, spore: 1, bile: 2, vitriol: 3 } as const;
export type ResId = (typeof R)[keyof typeof R];
export const RES_COUNT = 4;
export const RES_NAMES = ['ichor', 'spore', 'bile', 'vitriol'] as const;
export type ResName = (typeof RES_NAMES)[number];

/** 0=N 1=E 2=S 3=W */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;

export type Terrain = 'rock' | 'vein' | 'sporebed' | 'burrow';

export type Kind =
  | 'tap'
  | 'sporangium'
  | 'conduit'
  | 'router'
  | 'digester'
  | 'reactor'
  | 'cauterizer'
  | 'ward'
  | 'heart';

export type Buf = [number, number, number, number];
export const emptyBuf = (): Buf => [0, 0, 0, 0];

export interface Building {
  kind: Kind;
  dir: Dir;
  tier: number;
  /** 0..1 — reaching 0 ruptures the building. */
  integrity: number;
  enabled: boolean;
  /** Input / transit contents. For conduits only one resource may be non-zero. */
  store: Buf;
  /** Produced goods waiting to be pushed out (producers & processors). */
  out: Buf;
  /** Received this tick — merged into `store` at the end of the transfer phase (prevents multi-hop per tick). */
  incoming: Buf;
  /** Crafting progress in crafts (fractional). */
  progress: number;
  /** EMA of units pushed out per second — for UI and stagnation checks. */
  flowEma: number;
  /** Round-robin cursor for routers. */
  rr: number;
  /** Total essence spent on this building (for refunds/repair pricing). Stored as a string-able Decimal. */
  invested: Decimal;
  /** Last computed fill fraction 0..1 (pressure). */
  pressure: number;
}

export interface Tile {
  terrain: Terrain;
  /** Extraction multiplier for veins / spore beds. */
  richness: number;
  /** Rot / corrosion 0..1. */
  rot: number;
  building: Building | null;
}

export interface Leech {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  moveCd: number;
  latched: boolean;
  /** Seconds spent feeding. */
  fed: number;
}

export interface Mutations {
  hypertrophy: number; // +α exponent on the Heart synthesis
  vascular: number; // conduit throughput
  fecundity: number; // extraction rate
  chitin: number; // integrity decay reduction
  talons: number; // manual strike damage
  catalysis: number; // processor speed
}
export type MutationId = keyof Mutations;

export interface GameEvent {
  t: number;
  kind: 'rupture' | 'wave' | 'leech_killed' | 'building_lost' | 'metamorphosis' | 'info';
  msg: string;
  x?: number;
  y?: number;
}

export interface RunStats {
  ruptures: number;
  leechesKilled: number;
  peakRate: Decimal;
}

export interface SimState {
  version: number;
  seed: number;
  rng: number;
  time: number;
  w: number;
  h: number;
  heartX: number;
  heartY: number;
  tiles: Tile[];
  leeches: Leech[];
  nextLeechId: number;
  wave: number;
  waveTimer: number;

  essence: Decimal;
  /** Essence produced this run (drives Metamorphosis yield). */
  runEssence: Decimal;
  /** Current essence per second. */
  rate: Decimal;
  /** EMA of Heart intake per resource, units/s. */
  intake: Buf;
  /** Number of each kind built (drives build-cost scaling). */
  built: Record<Kind, number>;

  // Persistent (survive Metamorphosis)
  mutagen: Decimal;
  mutations: Mutations;
  depth: number;
  totalEssence: Decimal;

  stats: RunStats;
  events: GameEvent[];
}

export type Command =
  | { t: 'build'; x: number; y: number; kind: Kind; dir: Dir }
  | { t: 'rotate'; x: number; y: number }
  | { t: 'demolish'; x: number; y: number }
  | { t: 'upgrade'; x: number; y: number }
  | { t: 'repair'; x: number; y: number }
  | { t: 'vent'; x: number; y: number }
  | { t: 'cleanse'; x: number; y: number }
  | { t: 'toggle'; x: number; y: number }
  | { t: 'strike'; x: number; y: number }
  | { t: 'mutate'; id: MutationId }
  | { t: 'metamorphose' };

export type CommandResult = { ok: true } | { ok: false; reason: string };
