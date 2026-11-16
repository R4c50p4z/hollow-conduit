import * as C from './config';
import { contentsOf } from './engine';
import { deserialize, serialize } from './save';
import { stabilityOf } from './stats';
import { DX, DY, R, opposite, type Building, type SimState } from './types';
import { tileAt } from './world';

/**
 * Per-structure diagnosis (what Mindustry shows as a status light, plus the *why*), and a
 * deterministic "will it hold without me?" forecast. Pure: reads state, never mutates it.
 */
export type StatusCode =
  | 'working' // producing / moving / consuming normally
  | 'blocked' // a producer or processor can't get rid of its output
  | 'noInput' // a processor or sink is waiting for what it needs
  | 'strained' // a vessel forced past its limit (taking damage)
  | 'resting' // a full vessel that its feeder can route around (safe)
  | 'idle' // empty and still
  | 'sealed';

export type BlockReason = 'deadEnd' | 'wrongFluid' | 'refuses' | 'full';

export interface Status {
  code: StatusCode;
  /** For 'blocked': what's wrong with the tile ahead. */
  reason?: BlockReason;
  /** For 'noInput': which resources are missing (indices). */
  missing?: number[];
}

const sum = (b: number[]) => b[0] + b[1] + b[2] + b[3];
const FUEL: Partial<Record<Building['kind'], number>> = { ward: R.spore, cauterizer: R.bile, mender: R.ichor };

/** Why can't (x,y) push resource r forward? (Read-only mirror of the engine's accept rules.) */
function whyBlocked(s: SimState, x: number, y: number, b: Building, r: number): BlockReason {
  const t = tileAt(s, x + DX[b.dir], y + DY[b.dir]);
  const nb = t?.building;
  if (!nb) return 'deadEnd';
  const from = opposite(b.dir);
  if (nb.kind === 'conduit' || nb.kind === 'reservoir') {
    if (nb.dir === from || !nb.enabled) return 'refuses';
    if (nb.store.some((v, k) => k !== r && v > 1e-6)) return 'wrongFluid';
    return 'full';
  }
  if (nb.kind === 'junction') {
    const lane = nb.lanes?.[b.dir];
    if (lane && lane.some((v, k) => k !== r && v > 1e-6)) return 'wrongFluid';
    return 'full';
  }
  if (nb.kind === 'digester' || nb.kind === 'reactor') return C.RECIPES[nb.kind].in[r] ? 'full' : 'refuses';
  if (nb.kind === 'ward' || nb.kind === 'cauterizer' || nb.kind === 'mender') return FUEL[nb.kind] === r ? 'full' : 'refuses';
  if (nb.kind === 'tap' || nb.kind === 'sporangium') return 'refuses';
  return 'full';
}

export function statusOf(s: SimState, x: number, y: number): Status | null {
  const b = tileAt(s, x, y)?.building;
  if (!b) return null;
  if (b.kind === 'heart') return { code: s.intake.some((v) => v > C.FLOW_HEALTHY) ? 'working' : 'idle' };
  if (!b.enabled) return { code: 'sealed' };
  if (b.strained) return { code: 'strained' };
  const main = (buf: number[]) => buf.reduce((best, v, k) => (v > buf[best] ? k : best), 0);
  switch (b.kind) {
    case 'tap':
    case 'sporangium':
      return b.pressure > C.PRESSURE_SAFE ? { code: 'blocked', reason: whyBlocked(s, x, y, b, main(b.out)) } : { code: 'working' };
    case 'digester':
    case 'reactor': {
      if (b.pressure > C.PRESSURE_SAFE) return { code: 'blocked', reason: whyBlocked(s, x, y, b, main(b.out)) };
      const rec = C.RECIPES[b.kind];
      const missing = [0, 1, 2, 3].filter((r) => rec.in[r] > 0 && b.store[r] < rec.in[r]);
      if (missing.length && b.flowEma < C.FLOW_HEALTHY) return { code: 'noInput', missing };
      return { code: 'working' };
    }
    case 'ward':
    case 'cauterizer':
    case 'mender': {
      const r = FUEL[b.kind]!;
      return b.store[r] > 0.01 ? { code: 'working' } : { code: 'noInput', missing: [r] };
    }
    default: {
      // conduit / router / junction
      if (b.flowEma > C.FLOW_HEALTHY) return { code: 'working' };
      if (b.pressure > C.PRESSURE_SAFE) return { code: 'resting' };
      return sum(contentsOf(b)) > 0.01 ? { code: 'working' } : { code: 'idle' };
    }
  }
}

export interface Forecast {
  seconds: number;
  ruptures: number;
  byCause: { pressure: number; rot: number; leech: number };
  lostStructures: number;
  leechesKilled: number;
  leechesSated: number;
  waves: number;
  rateStart: number; // log10(E/s + 1)
  rateEnd: number;
  strainedEnd: number;
  infectedEnd: number;
  stable: boolean;
}

/**
 * Clone the cavern and run it for `seconds` with nobody touching anything — *with leeches active*,
 * even during the grace period, so the defences are tested too. Deterministic (seeded RNG in state).
 */
export function forecast(s: SimState, seconds = 1800, dt = 0.5, tick: (st: SimState, dt: number) => void): Forecast {
  const c = deserialize(serialize(s));
  c.graceUntil = 0;
  const count = (st: SimState) => st.tiles.filter((t) => t.building && t.building.kind !== 'heart').length;
  const r0 = { ...c.stats.life.rupturesByCause };
  const k0 = c.stats.life.leechesKilled, sat0 = c.stats.life.leechesSated, w0 = c.stats.life.waves, n0 = count(c);
  const lg = (st: SimState) => st.rate.add(1).log10().toNumber();
  const rateStart = lg(c);
  for (let t = 0; t < seconds; t += dt) tick(c, dt);
  const byCause = {
    pressure: c.stats.life.rupturesByCause.pressure - r0.pressure,
    rot: c.stats.life.rupturesByCause.rot - r0.rot,
    leech: c.stats.life.rupturesByCause.leech - r0.leech,
  };
  const ruptures = byCause.pressure + byCause.rot + byCause.leech;
  const st = stabilityOf(c);
  const leechesSated = c.stats.life.leechesSated - sat0;
  return {
    seconds,
    ruptures,
    byCause,
    lostStructures: Math.max(0, n0 - count(c)),
    leechesKilled: c.stats.life.leechesKilled - k0,
    leechesSated,
    waves: c.stats.life.waves - w0,
    rateStart,
    rateEnd: lg(c),
    strainedEnd: st.strained,
    infectedEnd: st.infected,
    stable: ruptures === 0 && leechesSated === 0 && st.strained === 0 && st.infected === 0,
  };
}
