import Decimal from 'break_eternity.js';
import { graceLeft, tick } from './engine';
import { count, countE } from './stats';
import type { SimState } from './types';

/**
 * Time away. The cavern really keeps living: up to OFFLINE.simCap of genuine simulation
 * (fine steps first, coarser later). If the player was away longer than that and the network
 * was *stable* during the last simulated hour (no ruptures, nothing lost), it keeps producing
 * at that hour's average rate for the rest of the absence, up to OFFLINE.totalCap.
 *
 * So a well-built network lasts "forever" (a week, until the next session), while a fragile one
 * still collapses for real inside the simulated window.
 */
export const OFFLINE = {
  simCap: 12 * 3600,
  fineSpan: 2 * 3600,
  fineDt: 0.5,
  coarseDt: 1,
  stableWindow: 3600,
  totalCap: 7 * 86400,
};

export interface OfflineResult {
  seconds: number; // total time away credited
  simulated: number;
  extrapolated: number;
  stable: boolean;
  /** Extrapolation stopped where the grace period ended: the network hasn't faced leeches yet. */
  stoppedAtGrace: boolean;
  essenceBefore: Decimal;
  essenceAfter: Decimal;
  ruptures: number;
  leechesKilled: number;
  waves: number;
}

const structures = (s: SimState) => s.tiles.reduce((n, t) => n + (t.building && t.building.kind !== 'heart' ? 1 : 0), 0);

/** Generator so callers can yield to the UI between chunks; yields progress 0..1. */
export function* runOffline(s: SimState, awaySeconds: number, chunk = 400): Generator<number, OfflineResult> {
  const away = Math.min(Math.max(0, awaySeconds), OFFLINE.totalCap);
  const simTarget = Math.min(away, OFFLINE.simCap);
  const r0 = s.stats.life.ruptures;
  const k0 = s.stats.life.leechesKilled;
  const w0 = s.stats.life.waves;
  const essenceBefore = s.essence;

  let simulated = 0;
  let windowStart: { at: number; ruptures: number; structures: number; earned: Decimal } | null = null;
  let n = 0;
  while (simulated < simTarget - 1e-9) {
    const dt = simulated < OFFLINE.fineSpan ? OFFLINE.fineDt : OFFLINE.coarseDt;
    if (!windowStart && simTarget - simulated <= OFFLINE.stableWindow)
      windowStart = { at: simulated, ruptures: s.stats.life.ruptures, structures: structures(s), earned: s.stats.life.essenceEarned };
    tick(s, Math.min(dt, simTarget - simulated));
    simulated += Math.min(dt, simTarget - simulated);
    if (++n % chunk === 0) yield simulated / simTarget;
  }

  let extrapolated = 0;
  let stable = false;
  let stoppedAtGrace = false;
  const rest = away - simulated;
  if (rest > 1 && windowStart) {
    const span = simulated - windowStart.at;
    stable = span >= OFFLINE.stableWindow - 1 && s.stats.life.ruptures === windowStart.ruptures && structures(s) >= windowStart.structures;
    if (stable) {
      const avg = s.stats.life.essenceEarned.sub(windowStart.earned).div(span);
      // Stability measured without leeches doesn't prove anything past the end of grace.
      const grace = graceLeft(s);
      const credit = grace > 0 && grace < rest ? grace : rest;
      stoppedAtGrace = credit < rest;
      const gain = avg.mul(credit);
      s.essence = s.essence.add(gain);
      s.runEssence = s.runEssence.add(gain);
      s.totalEssence = s.totalEssence.add(gain);
      countE(s, 'essenceEarned', gain);
      count(s, 'time', credit);
      extrapolated = credit;
    }
  }

  return {
    seconds: simulated + extrapolated,
    simulated,
    extrapolated,
    stable,
    stoppedAtGrace,
    essenceBefore,
    essenceAfter: s.essence,
    ruptures: s.stats.life.ruptures - r0,
    leechesKilled: s.stats.life.leechesKilled - k0,
    waves: s.stats.life.waves - w0,
  };
}

/** Synchronous convenience (tests, probes). */
export function simulateOffline(s: SimState, awaySeconds: number): OfflineResult {
  const g = runOffline(s, awaySeconds);
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}

export { Decimal };
