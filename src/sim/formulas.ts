import Decimal from 'break_eternity.js';
import * as C from './config';
import type { Buf, Kind, MutationId, Mutations } from './types';

/**
 * Pure, side-effect-free formulas. Everything that defines the shape of the
 * progression curve lives here so it can be unit-tested and plotted in isolation.
 *
 * Split of numeric domains:
 *   - Physical layer (flows, buffers, rot, integrity) → f64. Bounded by tier caps.
 *   - Economic layer (essence, costs, mutagen)       → break_eternity Decimal.
 * The Heart synthesis is the bridge and is computed in log10-space.
 */

export const tierMul = (tier: number) => Math.pow(C.TIER_RATE_BASE, tier);

export const rotPenalty = (rot: number) => 1 - C.ROT_THROUGHPUT_PENALTY * rot;

export function buildCost(kind: Kind, owned: number): Decimal {
  const s = C.KINDS[kind];
  return new Decimal(s.cost).mul(Decimal.pow(s.costGrowth, owned));
}

export function tierCost(kind: Kind, tier: number): Decimal {
  const s = C.KINDS[kind];
  const base = new Decimal(Math.max(1, s.cost)).mul(s.tierBase).mul(Decimal.pow(s.tierGrowth, tier));
  // The Heart governs everything; its cost ramps super-exponentially so a wall always returns.
  return kind === 'heart' ? base.mul(Decimal.pow(C.HEART_COST_RAMP, (tier * (tier - 1)) / 2)) : base;
}

/** Heart exponent α. */
export const heartAlpha = (m: Mutations) => 1 + 0.05 * m.hypertrophy;

/** Global multiplier M = (1 + 0.1·unspent mutagen) · (1 + 0.02·achievements). */
export function mutagenMult(unspent: Decimal): Decimal {
  const cap = C.UNSPENT_MUTAGEN_SOFTCAP;
  if (unspent.lte(cap)) return unspent.mul(C.UNSPENT_MUTAGEN_BONUS).add(1);
  return new Decimal(1 + C.UNSPENT_MUTAGEN_BONUS * cap).mul(unspent.div(cap).sqrt());
}
export const globalMult = (unspentMutagen: Decimal, achievements = 0) =>
  mutagenMult(unspentMutagen).mul(1 + C.ACHIEVEMENT_BONUS * achievements);

/**
 * Heart synthesis:  E/s = M · ( Π_r (1 + x_r)^(w_r · α) − 1 )
 *
 * Product form = each refinement stage is a *multiplier on everything else*,
 * so diversifying the feed is exponentially better than scaling one line.
 * Computed in log10 space so huge intakes never overflow f64.
 */
export function heartRate(intake: Buf, alpha: number, mult: Decimal): Decimal {
  let log10P = 0;
  for (let r = 0; r < 4; r++) log10P += C.HEART_WEIGHTS[r] * alpha * Math.log10(1 + Math.max(0, intake[r]));
  if (log10P <= 0) return new Decimal(0);
  return Decimal.pow(10, log10P).sub(1).mul(mult);
}

export const heartIntakeCap = (tier: number) => C.HEART_INTAKE_BASE * tierMul(tier);

export const conduitThroughput = (kind: 'conduit' | 'router', tier: number, rot: number, m: Mutations) =>
  (kind === 'conduit' ? C.CONDUIT_THROUGHPUT : C.ROUTER_THROUGHPUT) *
  tierMul(tier) *
  Math.pow(1.5, m.vascular) *
  rotPenalty(rot);

export const extractionRate = (kind: 'tap' | 'sporangium', tier: number, richness: number, rot: number, m: Mutations) =>
  (kind === 'tap' ? C.TAP_RATE : C.SPORANGIUM_RATE) * richness * tierMul(tier) * Math.pow(1.4, m.fecundity) * rotPenalty(rot);

export const craftRate = (kind: 'digester' | 'reactor', tier: number, rot: number, m: Mutations) =>
  (kind === 'digester' ? C.DIGESTER_CRAFTS : C.REACTOR_CRAFTS) * tierMul(tier) * Math.pow(1.35, m.catalysis) * rotPenalty(rot);

/** Buffer capacities grow with throughput so that "seconds of buffering" stays constant per tier. */
export const storeCap = (kind: Kind, tier: number, m: Mutations) =>
  C.KINDS[kind].storeCap * tierMul(tier) * (kind === 'conduit' || kind === 'router' || kind === 'junction' || kind === 'reservoir' ? Math.pow(1.5, m.vascular) : 1);
export const outCap = (kind: Kind, tier: number) => C.KINDS[kind].outCap * tierMul(tier);

/** Integrity loss per second from pressure (fill ∈ [0,1]) and rot. */
export function integrityLoss(fill: number, rot: number, m: Mutations): number {
  let loss = 0;
  if (fill > C.PRESSURE_SAFE) {
    const over = (fill - C.PRESSURE_SAFE) / (1 - C.PRESSURE_SAFE);
    loss += C.PRESSURE_DAMAGE * over * over;
  }
  if (rot > C.ROT_DAMAGE_THRESHOLD) loss += C.ROT_DAMAGE;
  return loss * (1 + C.ROT_INTEGRITY_AMP * rot) * Math.pow(0.85, m.chitin);
}

// --- Hazard pacing ----------------------------------------------------------------------

export const hazardScale = (depth: number) => Math.pow(C.DEPTH_HAZARD, depth);

/** Orders of magnitude of current output — hazards scale with *log* of power so they keep pace with exponential growth. */
export const powerLevel = (rate: Decimal) => Math.max(0, rate.add(1).log10().toNumber());

export const entropyChance = (rate: Decimal, depth: number) =>
  C.ENTROPY_BASE * (1 + C.ENTROPY_LOG_SCALE * powerLevel(rate)) * hazardScale(depth);

export const waveInterval = (wave: number) =>
  Math.max(C.WAVE_MIN_INTERVAL, C.WAVE_INTERVAL * Math.pow(C.WAVE_DECAY, wave));

export const waveCount = (wave: number, rate: Decimal) =>
  1 + Math.floor(Math.min(wave, C.WAVE_COUNT_CAP) / 3) + Math.floor(powerLevel(rate) / 2);

/** Leech HP: follows your output and chosen depth only — time alone never makes them stronger. */
export const leechHp = (_wave: number, depth: number, rate: Decimal) =>
  C.LEECH_HP * Math.pow(1 + powerLevel(rate), C.LEECH_HP_POWER_EXP) * hazardScale(depth);

export const strikeDamage = (m: Mutations) => C.STRIKE_DAMAGE * Math.pow(1.6, m.talons);

// --- Metamorphosis ----------------------------------------------------------------------

export function mutagenYield(runEssence: Decimal, depth: number): Decimal {
  if (runEssence.lt(C.META_THRESHOLD)) return new Decimal(0);
  return runEssence.div(C.META_THRESHOLD).pow(C.META_EXPONENT).mul(Math.pow(C.DEPTH_YIELD, depth)).floor();
}

export const mutationCost = (id: MutationId, level: number) => {
  const m = C.MUTATIONS[id];
  return new Decimal(m.base).mul(Decimal.pow(m.growth, level)).mul(Decimal.pow(m.ramp, (level * (level - 1)) / 2)).floor();
};
