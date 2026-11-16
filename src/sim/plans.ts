import Decimal from 'break_eternity.js';
import { applyCommand, canPlace, nextBuildCost } from './commands';
import * as C from './config';
import * as F from './formulas';
import type { BlueprintEntry, Building, CommandResult, Kind, Plan, RuptureCause, SimState } from './types';
import { inBounds } from './world';

/**
 * Plans: queued constructions. Two sources share one mechanism:
 *  - ruins: what a rupture destroyed (kind, rotation, tier, mode), rebuildable for RUIN_TTL seconds,
 *    with one tap or automatically (rot/leech causes only — never pressure, which would loop — and
 *    capped at AUTO_REBUILD_BUDGET of essence per hour);
 *  - blueprints: a saved layout re-applied in a new cavern; built in order as essence allows,
 *    always at tier 0. Placements that don't fit the new terrain wait as invalid plans.
 */

export const plansOf = (s: SimState): Plan[] => (s.plans ??= []);

export function addRuin(s: SimState, x: number, y: number, b: Building, cause: RuptureCause) {
  s.plans = plansOf(s).filter((p) => p.x !== x || p.y !== y);
  s.plans.push({ x, y, kind: b.kind, dir: b.dir, tier: b.tier, mode: b.mode, src: 'ruin', at: s.time, cause });
}

/** Full price to put the plan back: build cost now plus the tier-ups it had. */
export function planCost(s: SimState, p: Plan): Decimal {
  let c = F.buildCost(p.kind, s.built[p.kind] ?? 0);
  for (let t = 0; t < p.tier; t++) c = c.add(F.tierCost(p.kind, t));
  return c;
}

/** Why the plan can't be placed right now (terrain/rot/occupied), or null. */
export const planBlocked = (s: SimState, p: Plan): CommandResult | null => canPlace(s, p.x, p.y, p.kind);

const recentAutoSpend = (s: SimState) => {
  const now = s.stats.life.time;
  s.autoSpend = (s.autoSpend ?? []).filter((e) => now - e.t < 3600);
  return s.autoSpend.reduce((a, e) => a.add(e.cost), new Decimal(0));
};

export function executePlan(s: SimState, p: Plan, auto: boolean): CommandResult {
  const t = s.tiles[p.y * s.w + p.x];
  if (t.building?.kind === p.kind) {
    s.plans = plansOf(s).filter((q) => q !== p);
    return { ok: true };
  }
  const blocked = planBlocked(s, p);
  if (blocked) return blocked;
  const cost = planCost(s, p);
  if (s.essence.lt(cost)) return { ok: false, reason: 'noEssence', params: { cost: cost.toString() } };
  if (auto && p.src === 'ruin' && recentAutoSpend(s).add(cost).gt(s.essence.mul(C.AUTO_REBUILD_BUDGET)))
    return { ok: false, reason: 'rebuildCap' };
  const r = applyCommand(s, { t: 'build', x: p.x, y: p.y, kind: p.kind, dir: p.dir });
  if (!r.ok) return r;
  for (let k = 0; k < p.tier; k++) applyCommand(s, { t: 'upgrade', x: p.x, y: p.y });
  const b = t.building!;
  if (p.mode) b.mode = p.mode;
  if (auto && p.src === 'ruin') (s.autoSpend ??= []).push({ t: s.stats.life.time, cost });
  s.plans = plansOf(s).filter((q) => q !== p);
  return { ok: true };
}

/** Once per sim-second: expire old ruins, auto-rebuild what's allowed, advance the blueprint queue. */
export function processPlans(s: SimState) {
  const plans = plansOf(s);
  if (!plans.length) return;
  s.plans = plans.filter((p) => p.src !== 'ruin' || s.time - p.at <= C.RUIN_TTL);
  for (const p of [...s.plans]) {
    if (p.src === 'ruin') {
      if (s.autoRebuild && p.cause !== 'pressure') executePlan(s, p, true);
    } else {
      if (planBlocked(s, p)) continue; // waits (red ghost) — doesn't hold up the rest
      const r = executePlan(s, p, true);
      if (!r.ok) break; // keep the blueprint's order: wait for essence
    }
  }
}

const ORDER: Kind[] = ['tap', 'sporangium', 'conduit', 'junction', 'router', 'reservoir', 'digester', 'reactor', 'ward', 'cauterizer', 'mender'];

/** Save the current layout relative to the Heart, in a sensible build order. */
export function saveBlueprint(s: SimState) {
  const entries: (BlueprintEntry & { d: number })[] = [];
  s.tiles.forEach((t, i) => {
    const b = t.building;
    if (!b || b.kind === 'heart') return;
    const x = i % s.w, y = (i / s.w) | 0;
    entries.push({ dx: x - s.heartX, dy: y - s.heartY, kind: b.kind, dir: b.dir, tier: b.tier, mode: b.mode, d: Math.abs(x - s.heartX) + Math.abs(y - s.heartY) });
  });
  if (!entries.length) return;
  entries.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.d - b.d);
  s.blueprint = entries.map(({ d: _d, ...e }) => e);
}

/** Queue the saved layout as plans (tier 0) on this cavern. */
export function applyBlueprint(s: SimState) {
  s.plans = plansOf(s).filter((p) => p.src !== 'blueprint');
  for (const e of s.blueprint ?? []) {
    const x = s.heartX + e.dx, y = s.heartY + e.dy;
    if (!inBounds(s, x, y)) continue;
    if (s.tiles[y * s.w + x].building) continue;
    s.plans.push({ x, y, kind: e.kind, dir: e.dir, tier: 0, mode: e.mode, src: 'blueprint', at: s.time });
  }
}

export { nextBuildCost };
