import { ACHIEVEMENT_BONUS } from './config';
import type { SimState } from './types';
import { pushEvent } from './world';

/**
 * Achievements ("Logros"). Each one unlocked adds ACHIEVEMENT_BONUS to the Heart's global
 * multiplier, permanently — so they're a small, real reward for exploring every system,
 * not just badges. Text lives in the i18n dictionaries under `ach.<id>.name/desc`.
 */
export interface AchievementDef {
  id: string;
  /** Rough grouping for the UI. */
  group: 'flow' | 'power' | 'hazard' | 'defence' | 'meta' | 'craft';
  check: (s: SimState) => boolean;
}

const heartTier = (s: SimState) => s.tiles[s.heartY * s.w + s.heartX].building?.tier ?? 0;
const anyTier = (s: SimState, n: number) => s.tiles.some((t) => t.building && t.building.kind !== 'heart' && t.building.tier >= n);
const L = (s: SimState) => s.stats.life;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_flow', group: 'flow', check: (s) => s.intake[0] > 0.5 },
  { id: 'spores', group: 'flow', check: (s) => s.intake[1] > 0.5 },
  { id: 'bile', group: 'craft', check: (s) => L(s).consumed[2] > 1 },
  { id: 'vitriol', group: 'craft', check: (s) => L(s).consumed[3] > 1 },
  { id: 'all_four', group: 'craft', check: (s) => s.intake.every((x) => x > 0.2) },
  { id: 'junction', group: 'flow', check: (s) => (L(s).builtByKind.junction ?? 0) > 0 },
  { id: 'saturated', group: 'flow', check: (s) => {
      const cap = 8 * Math.pow(2, heartTier(s));
      return s.intake.some((x) => x >= cap * 0.98);
    } },
  { id: 'rate_1k', group: 'power', check: (s) => s.stats.bestRate.gte(1e3) },
  { id: 'rate_1m', group: 'power', check: (s) => s.stats.bestRate.gte(1e6) },
  { id: 'rate_1b', group: 'power', check: (s) => s.stats.bestRate.gte(1e9) },
  { id: 'rate_1t', group: 'power', check: (s) => s.stats.bestRate.gte(1e12) },
  { id: 'rate_1e30', group: 'power', check: (s) => s.stats.bestRate.gte(1e30) },
  { id: 'heart_t3', group: 'power', check: (s) => heartTier(s) >= 3 },
  { id: 'heart_t6', group: 'power', check: (s) => heartTier(s) >= 6 },
  { id: 'tier_8', group: 'power', check: (s) => anyTier(s, 8) },
  { id: 'crafts_1k', group: 'craft', check: (s) => L(s).crafts.digester + L(s).crafts.reactor >= 1000 },
  { id: 'first_rupture', group: 'hazard', check: (s) => L(s).ruptures >= 1 },
  { id: 'ruptures_50', group: 'hazard', check: (s) => L(s).ruptures >= 50 },
  { id: 'steady_30', group: 'hazard', check: (s) => s.stats.run.time >= 1800 && s.stats.run.ruptures === 0 },
  { id: 'cleanser', group: 'hazard', check: (s) => L(s).rotCleansed + L(s).rotScoured >= 25 },
  { id: 'kills_10', group: 'defence', check: (s) => L(s).leechesKilled >= 10 },
  { id: 'kills_100', group: 'defence', check: (s) => L(s).leechesKilled >= 100 },
  { id: 'kills_1000', group: 'defence', check: (s) => L(s).leechesKilled >= 1000 },
  { id: 'striker', group: 'defence', check: (s) => L(s).strikes >= 500 },
  { id: 'warden', group: 'defence', check: (s) => L(s).killsByWard >= 50 },
  { id: 'swarm', group: 'defence', check: (s) => s.stats.peakLeeches >= 10 },
  { id: 'meta_1', group: 'meta', check: (s) => s.stats.metamorphoses >= 1 },
  { id: 'meta_10', group: 'meta', check: (s) => s.stats.metamorphoses >= 10 },
  { id: 'depth_5', group: 'meta', check: (s) => s.depth >= 5 },
  { id: 'fast_meta', group: 'meta', check: (s) => s.stats.fastestMeta !== null && s.stats.fastestMeta <= 20 * 60 },
  { id: 'clean_meta', group: 'meta', check: (s) => s.stats.runs.some((r) => r.ruptures === 0) },
  { id: 'hypertrophy_5', group: 'meta', check: (s) => s.mutations.hypertrophy >= 5 },
];

/** Check all locked achievements; unlock and announce new ones. Cheap enough to run once per sim-second. */
export function checkAchievements(s: SimState) {
  for (const a of ACHIEVEMENTS) {
    if (s.achievements.includes(a.id)) continue;
    if (a.check(s)) {
      s.achievements.push(a.id);
      pushEvent(s, { kind: 'achievement', params: { id: a.id } });
    }
  }
}

export const achievementMult = (s: SimState) => 1 + ACHIEVEMENT_BONUS * s.achievements.length;
