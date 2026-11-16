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
  | 'junction'
  | 'digester'
  | 'reactor'
  | 'cauterizer'
  | 'ward'
  | 'heart';

export const ALL_KINDS: Kind[] = ['tap', 'sporangium', 'conduit', 'router', 'junction', 'digester', 'reactor', 'cauterizer', 'ward', 'heart'];

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
  /** Junctions only: one lane per exit direction (N,E,S,W), each a single-fluid buffer. */
  lanes?: [Buf, Buf, Buf, Buf];
  lanesIn?: [Buf, Buf, Buf, Buf];
  /** Total crafts performed (processors). */
  progress: number;
  /** EMA of units pushed out per second — for UI and stagnation checks. */
  flowEma: number;
  /** Round-robin cursor for routers. */
  rr: number;
  /** Total essence spent on this building (for refunds/repair pricing). */
  invested: Decimal;
  /** Last computed fill fraction 0..1 (pressure). */
  pressure: number;
  /**
   * Under strain: full AND being forced by a blocked pump upstream. Only strained structures take
   * pressure damage. A full overflow branch that its feeder can route around is at rest, and safe.
   */
  strained?: boolean;
  /** Sim time when built — for age stats. */
  bornAt?: number;
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
  /** Who dealt the last blow — for kill attribution. */
  lastHit?: 'strike' | 'ward';
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

export type EventKind = 'rupture' | 'wave' | 'leech_killed' | 'leech_sated' | 'metamorphosis' | 'achievement';
export type EventParams = Record<string, string | number>;

/** Events carry a code + params; the UI turns them into text in the player's language. */
export interface GameEvent {
  t: number;
  kind: EventKind;
  params?: EventParams;
  x?: number;
  y?: number;
}

export type RuptureCause = 'pressure' | 'rot' | 'leech';

/** Additive counters. Kept twice: once for the current cycle, once for the whole save. */
export interface Counters {
  time: number;
  produced: Buf; // extracted or crafted
  consumed: Buf; // eaten by the Heart
  refinedIn: Buf; // fed into recipes
  burned: Buf; // fuel burned by wards / cauterizers
  drained: Buf; // stolen by leeches
  spilled: Buf; // lost to ruptures, vents, razing
  crafts: { digester: number; reactor: number };
  essenceEarned: Decimal;
  spentBuild: Decimal;
  spentUpgrade: Decimal;
  spentRepair: Decimal;
  spentCleanse: Decimal;
  refunded: Decimal;
  heartLeeched: Decimal;
  built: number;
  builtByKind: Partial<Record<Kind, number>>;
  razed: number;
  upgrades: number;
  repairs: number;
  vents: number;
  cleanses: number;
  seals: number;
  rotations: number;
  ruptures: number;
  rupturesByKind: Partial<Record<Kind, number>>;
  rupturesByCause: Record<RuptureCause, number>;
  waves: number;
  leechesSpawned: number;
  leechesKilled: number;
  killsByStrike: number;
  killsByWard: number;
  leechesSated: number;
  strikes: number;
  strikeDamage: number;
  wardDamage: number;
  rotCleansed: number; // rot removed by hand
  rotScoured: number; // rot removed by cauterizers
  rotFlushed: number; // rot washed out by flow
  entropySeeds: number;
  overpressureSeconds: number; // structure-seconds above the safe threshold
  rotTileSeconds: number; // tile-seconds with rot > 0.5
}

/** Time series, sampled every `every` seconds of sim time. log10 values for anything Decimal. */
export interface History {
  every: number;
  next: number;
  t: number[];
  rateLog: number[];
  essenceLog: number[];
  intake: [number[], number[], number[], number[]];
  rot: number[]; // average rot over all tiles
  pressure: number[]; // average pressure over vessels
  integrity: number[]; // average integrity over structures
  leeches: number[];
  structures: number[];
}

export interface RunSummary {
  depth: number;
  duration: number;
  peakRateLog: number;
  essenceLog: number;
  mutagen: number;
  ruptures: number;
  kills: number;
  waves: number;
  endedAt: number; // lifetime seconds
}

export interface Stats {
  run: Counters;
  life: Counters;
  // Run peaks
  peakRate: Decimal;
  peakEssence: Decimal;
  peakIntake: Buf;
  peakLeeches: number;
  // Lifetime records
  bestRate: Decimal;
  metamorphoses: number;
  mutagenEarned: Decimal;
  fastestMeta: number | null;
  longestRun: number;
  offlineSeconds: number;
  sessions: number;
  /** Cycle time of the last rupture / last leech that escaped sated (for the stability check). */
  lastRuptureAt?: number;
  lastSatedAt?: number;
  history: History;
  runs: RunSummary[];
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
  achievements: string[];
  /** Lifetime seconds until which no leeches attack (undefined → GRACE_SECONDS). */
  graceUntil?: number;

  stats: Stats;
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
  | { t: 'metamorphose'; /** Go one depth deeper (default) or stay at the current depth. */ descend?: boolean }
  | { t: 'endGrace' };

export type ReasonCode =
  | 'outOfBounds'
  | 'occupied'
  | 'burrow'
  | 'needsTerrain'
  | 'tooRotten'
  | 'noEssence'
  | 'oneHeart'
  | 'nothingThere'
  | 'healthy'
  | 'noRot'
  | 'noLeech'
  | 'maxed'
  | 'noMutagen'
  | 'metaThreshold';

export type CommandResult = { ok: true } | { ok: false; reason: ReasonCode; params?: EventParams };
