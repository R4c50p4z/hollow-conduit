import type { Kind, MutationId, Terrain } from './types';

/**
 * Every tunable number lives here. See docs/DESIGN.md for the reasoning behind each.
 * Rates are per second; the engine multiplies by dt.
 */
export const TICK = 0.1; // fixed simulation step (s)

export const GRID = { w: 9, h: 13, veins: 6, sporebeds: 4, burrows: 3 } as const;

export const START_ESSENCE = 40;

/** Heart synthesis weights: E/s = M · (Π (1+x_r)^(w_r·α) − 1). */
export const HEART_WEIGHTS = [1.0, 0.5, 1.5, 2.2] as const; // ichor, spore, bile, vitriol
export const HEART_INTAKE_BASE = 8; // units/s per resource at tier 0
export const HEART_BUFFER_SECONDS = 3;
export const INTAKE_EMA_TAU = 2; // s
/** Residual heartbeat so a fully collapsed network can always crawl back (anti-softlock), never enough to idle on. */
export const HEART_PULSE = 0.25;

export interface KindSpec {
  name: string;
  cost: number; // base build cost
  costGrowth: number; // multiplicative per building of this kind owned
  tierBase: number; // tier-up cost = cost · tierBase · tierGrowth^tier
  tierGrowth: number;
  terrain: Terrain; // terrain it must be placed on
  storeCap: number; // base input/transit capacity (scales with 2^tier)
  outCap: number; // base output buffer capacity
  blurb: string;
}

export const KINDS: Record<Kind, KindSpec> = {
  tap: {
    name: 'Vein Tap', cost: 10, costGrowth: 1.18, tierBase: 5, tierGrowth: 8, terrain: 'vein',
    storeCap: 0, outCap: 4, blurb: 'Bleeds ichor from a vein. Blocked taps build pressure.',
  },
  sporangium: {
    name: 'Sporangium', cost: 25, costGrowth: 1.22, tierBase: 5, tierGrowth: 8, terrain: 'sporebed',
    storeCap: 0, outCap: 4, blurb: 'Fruits spores from a spore bed.',
  },
  conduit: {
    name: 'Conduit', cost: 2, costGrowth: 1.04, tierBase: 6, tierGrowth: 7, terrain: 'rock',
    storeCap: 12, outCap: 0, blurb: 'Directional vessel. Holds one fluid at a time.',
  },
  router: {
    name: 'Ganglion', cost: 8, costGrowth: 1.1, tierBase: 6, tierGrowth: 7, terrain: 'rock',
    storeCap: 6, outCap: 0, blurb: 'Splits flow to every side not feeding into it.',
  },
  junction: {
    name: 'Junction', cost: 12, costGrowth: 1.12, tierBase: 6, tierGrowth: 7, terrain: 'rock',
    storeCap: 6, outCap: 0, blurb: 'Two flows cross at right angles without mixing.',
  },
  digester: {
    name: 'Digester', cost: 60, costGrowth: 1.25, tierBase: 5, tierGrowth: 9, terrain: 'rock',
    storeCap: 8, outCap: 4, blurb: '2 ichor → 1 bile.',
  },
  reactor: {
    name: 'Catalytic Womb', cost: 400, costGrowth: 1.3, tierBase: 5, tierGrowth: 10, terrain: 'rock',
    storeCap: 8, outCap: 4, blurb: '1 bile + 2 spore → 1 vitriol.',
  },
  cauterizer: {
    name: 'Cauterizer', cost: 250, costGrowth: 1.5, tierBase: 4, tierGrowth: 8, terrain: 'rock',
    storeCap: 4, outCap: 0, blurb: 'Burns bile to scour rot within 2 tiles.',
  },
  ward: {
    name: 'Thorn Ward', cost: 150, costGrowth: 1.45, tierBase: 4, tierGrowth: 8, terrain: 'rock',
    storeCap: 4, outCap: 0, blurb: 'Feeds on spores to impale leeches within 2 tiles.',
  },
  heart: {
    name: 'The Heart', cost: 0, costGrowth: 1, tierBase: 150, tierGrowth: 45, terrain: 'rock',
    storeCap: 0, outCap: 0, blurb: 'Synthesises essence. Diversity of feed multiplies yield.',
  },
};

export const BUILDABLE: Kind[] = ['conduit', 'router', 'junction', 'tap', 'sporangium', 'digester', 'reactor', 'ward', 'cauterizer'];

// --- Rates (tier multiplies by 2^tier) -------------------------------------------------
export const TAP_RATE = 1.0;
export const SPORANGIUM_RATE = 0.8;
export const CONDUIT_THROUGHPUT = 6;
export const ROUTER_THROUGHPUT = 8;
export const PUSH_RATE = 20; // producers/processors → neighbour
export const DIGESTER_CRAFTS = 0.5; // crafts/s
export const REACTOR_CRAFTS = 0.25;
export const RECIPES = {
  digester: { in: [2, 0, 0, 0], out: [0, 0, 1, 0] },
  reactor: { in: [0, 2, 1, 0], out: [0, 0, 0, 1] },
} as const;
export const TIER_RATE_BASE = 2;

// --- Hazards ---------------------------------------------------------------------------
export const PRESSURE_SAFE = 0.85;
export const PRESSURE_DAMAGE = 1 / 180; // integrity/s at 100% fill (3 min to rupture)
export const INTEGRITY_REGEN = 1 / 300; // integrity/s when fill < 0.5
export const ROT_DAMAGE_THRESHOLD = 0.6;
export const ROT_DAMAGE = 1 / 400;
export const ROT_INTEGRITY_AMP = 2; // decay × (1 + amp·rot)
export const ROT_THROUGHPUT_PENALTY = 0.75; // throughput × (1 − p·rot)
export const ROT_GROWTH = 0.01; // logistic growth on *stagnant* structures (idle, sealed or over-pressured)
export const ROT_FLUSH = 0.002; // rot/s washed out of structures with healthy flow
export const FLOW_HEALTHY = 0.05; // units/s of outflow that counts as 'flowing' // logistic r' = g·r(1−r)
export const ROT_DIFFUSION = 0.0015; // keep 4·D < g so seeds on structures still grow
export const ROT_BARE_DECAY = 0.004; // rot/s lost on bare rock → gaps act as firebreaks
export const ROT_STAGNATION = 0.004; // rot/s on tiles with fill > PRESSURE_SAFE
export const ROT_FLOOR = 0.005; // rot below this evaporates
export const ROT_NO_BUILD = 0.5;
export const RUPTURE_ROT = 0.5;
export const RUPTURE_ROT_SPLASH = 0.2;
export const ENTROPY_BASE = 0.004; // P(seed)/s
export const ENTROPY_LOG_SCALE = 0.5; // × (1 + s·log10(1+E/s))
export const ENTROPY_SEED_ROT = 0.25;

export const CAUTERIZER_RADIUS = 2;
export const CAUTERIZER_CLEANSE = 0.05; // rot/s per tile
export const CAUTERIZER_BURN = 0.25; // bile/s

export const WARD_RADIUS = 2;
export const WARD_DPS = 1;
export const WARD_BURN = 0.3; // spore/s

export const WAVE_FIRST = 240;
export const WAVE_INTERVAL = 200;
export const WAVE_DECAY = 0.96;
export const WAVE_MIN_INTERVAL = 75;
export const LEECH_HP = 4;
export const LEECH_HP_GROWTH = 1.05; // per wave (time pressure)
export const LEECH_HP_POWER_EXP = 1.5; // × (1 + log10(E/s))^exp — threat tracks your network
export const LEECH_MOVE_CD = 1.5;
export const LEECH_DRAIN = 0.25; // fraction of contents/s
export const LEECH_BITE = 1 / 100; // integrity/s
export const LEECH_ROT = 0.01;
export const LEECH_HEART_DRAIN = 0.01; // fraction of essence/s
export const LEECH_SATIATION = 45; // s of feeding before a leech is sated and burrows away (bounds per-wave damage, prevents softlock)

// --- Manual actions --------------------------------------------------------------------
export const STRIKE_DAMAGE = 1;
export const CLEANSE_SECONDS_OF_OUTPUT = 15;
export const CLEANSE_MIN_COST = 5;
export const REPAIR_FRACTION = 0.2;
export const REFUND_FRACTION = 0.5;
export const VENT_ROT = 0.15;

// --- Metamorphosis ---------------------------------------------------------------------
export const META_THRESHOLD = 1e6;
export const META_EXPONENT = 0.35;
export const DEPTH_HAZARD = 1.15; // hazard intensity × DEPTH_HAZARD^depth
export const DEPTH_YIELD = 1.2; // mutagen yield × DEPTH_YIELD^depth
export const UNSPENT_MUTAGEN_BONUS = 0.1; // global ×(1 + b·unspent)
export const ACHIEVEMENT_BONUS = 0.02; // global ×(1 + b·achievements)

export interface MutationSpec {
  name: string;
  blurb: string;
  base: number;
  growth: number;
  max: number;
}
export const MUTATIONS: Record<MutationId, MutationSpec> = {
  hypertrophy: { name: 'Hypertrophy', blurb: 'Heart exponent α +0.05', base: 1, growth: 3, max: 20 },
  vascular: { name: 'Vascular Memory', blurb: 'Conduit & ganglion throughput ×1.5', base: 1, growth: 2.2, max: 30 },
  fecundity: { name: 'Fecundity', blurb: 'Extraction ×1.4', base: 1, growth: 2.5, max: 30 },
  catalysis: { name: 'Catalysis', blurb: 'Processor speed ×1.35', base: 2, growth: 2.5, max: 30 },
  chitin: { name: 'Chitin', blurb: 'Integrity loss ×0.85', base: 1, growth: 2, max: 15 },
  talons: { name: 'Talons', blurb: 'Strike damage ×1.6', base: 1, growth: 2, max: 25 },
};
