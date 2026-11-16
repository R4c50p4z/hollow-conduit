import Decimal from 'break_eternity.js';
import * as C from './config';
import * as F from './formulas';
import { checkAchievements } from './achievements';
import { addRuin, processPlans } from './plans';
import { rand, randInt } from './rng';
import { count, countE, countKind, countRes, tickStats } from './stats';
import { DX, DY, R, opposite, type Building, type Buf, type Dir, type Leech, type RuptureCause, type SimState } from './types';
import { idx, inBounds, pushEvent, tileAt } from './world';

/**
 * One fixed-timestep simulation step. Pure function of (state, dt) + seeded RNG:
 * no DOM, no wall clock, no React. Safe to run in a Web Worker or headless for
 * offline catch-up and balance probes.
 *
 * Phase order:
 *   1. Production & processing   (fills `out` buffers)
 *   2. Transfer                  (out/store → neighbour.incoming; then incoming → store)
 *   3. Heart synthesis           (consumes store → essence)
 *   4. Pressure & integrity      (fill fraction → damage → ruptures)
 *   5. Rot field                 (logistic growth + diffusion + stagnation + entropy seeding)
 *   6. Parasites                 (waves, movement, latching, wards)
 *   7. Statistics                (peaks, time series)
 */
export function tick(s: SimState, dt: number) {
  const prevSecond = Math.floor(s.time);
  s.time += dt;
  const pushed = produce(s, dt);
  transfer(s, dt, pushed);
  synthesise(s, dt);
  pressure(s, dt, pushed);
  rotField(s, dt);
  parasites(s, dt);
  tickStats(s, dt);
  if (Math.floor(s.time) !== prevSecond) {
    checkAchievements(s);
    processPlans(s);
  }
}

const sum = (b: number[]) => b[0] + b[1] + b[2] + b[3];
/** The resource each inline sink burns. */
const FUEL = { ward: R.spore, cauterizer: R.bile, mender: R.ichor } as const;

// --- 1. Production -----------------------------------------------------------------------

function produce(s: SimState, dt: number): Float64Array {
  const m = s.mutations;
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i];
    const b = t.building;
    if (!b || !b.enabled) continue;
    switch (b.kind) {
      case 'tap':
      case 'sporangium': {
        const r = b.kind === 'tap' ? R.ichor : R.spore;
        const amt = F.extractionRate(b.kind, b.tier, t.richness, t.rot, m) * dt;
        const space = F.outCap(b.kind, b.tier) - sum(b.out);
        const got = Math.max(0, Math.min(amt, space));
        b.out[r] += got;
        countRes(s, 'produced', r, got);
        break;
      }
      case 'digester':
      case 'reactor': {
        const rec = C.RECIPES[b.kind];
        let crafts = F.craftRate(b.kind, b.tier, t.rot, m) * dt;
        const oc = F.outCap(b.kind, b.tier);
        for (let r = 0; r < 4; r++) {
          if (rec.in[r] > 0) crafts = Math.min(crafts, b.store[r] / rec.in[r]);
          if (rec.out[r] > 0) crafts = Math.min(crafts, (oc - sum(b.out)) / rec.out[r]);
        }
        if (crafts <= 1e-12) break;
        for (let r = 0; r < 4; r++) {
          b.store[r] -= rec.in[r] * crafts;
          b.out[r] += rec.out[r] * crafts;
          if (rec.in[r]) countRes(s, 'refinedIn', r, rec.in[r] * crafts);
          if (rec.out[r]) countRes(s, 'produced', r, rec.out[r] * crafts);
        }
        b.progress += crafts;
        s.stats.run.crafts[b.kind] += crafts;
        s.stats.life.crafts[b.kind] += crafts;
        break;
      }
      case 'cauterizer': {
        const x = i % s.w, y = (i / s.w) | 0;
        if (!anyRotNear(s, x, y, C.CAUTERIZER_RADIUS)) break;
        const need = C.CAUTERIZER_BURN * Math.pow(1.5, b.tier) * dt;
        const frac = Math.min(1, b.store[R.bile] / need);
        if (frac <= 0) break;
        b.store[R.bile] -= need * frac;
        countRes(s, 'burned', R.bile, need * frac);
        const clean = C.CAUTERIZER_CLEANSE * F.tierMul(b.tier) * frac * dt;
        let removed = 0;
        forRadius(s, x, y, C.CAUTERIZER_RADIUS, (tt) => {
          const d = Math.min(tt.rot, clean);
          tt.rot -= d;
          removed += d;
        });
        count(s, 'rotScoured', removed);
        break;
      }
      case 'mender': {
        const x = i % s.w, y = (i / s.w) | 0;
        const targets: Building[] = [];
        forRadius(s, x, y, C.MENDER_RADIUS, (tt) => {
          const nb = tt.building;
          if (nb && nb.kind !== 'heart' && !nb.strained && nb.integrity < 1) targets.push(nb);
        });
        if (!targets.length) break;
        const need = C.MENDER_BURN * Math.pow(1.5, b.tier) * dt;
        const frac = Math.min(1, b.store[R.ichor] / need);
        if (frac <= 0) break;
        b.store[R.ichor] -= need * frac;
        countRes(s, 'burned', R.ichor, need * frac);
        const heal = C.MENDER_HEAL * F.tierMul(b.tier) * frac * dt;
        for (const nb of targets) nb.integrity = Math.min(1, nb.integrity + heal);
        break;
      }
      // ward handled in parasites(); conduit/router/junction/heart have no production
    }
  }
  return new Float64Array(s.tiles.length);
}

// --- 2. Transfer -------------------------------------------------------------------------

/**
 * Room for fluid r in a one-fluid vessel. Another fluid blocks it, unless only a residue below
 * FLUID_SWITCH_EPS of capacity is left: then the residue is spilled and the vessel switches.
 */
function singleFluidSpace(s: SimState, store: Buf, incoming: Buf, r: number, cap: number): number {
  let other = 0;
  for (let k = 0; k < 4; k++) if (k !== r) other += store[k] + incoming[k];
  if (other > C.FLUID_SWITCH_EPS * cap) return 0;
  if (other > 0)
    for (let k = 0; k < 4; k++)
      if (k !== r && store[k] + incoming[k] > 0) {
        countRes(s, 'spilled', k, store[k] + incoming[k]);
        store[k] = 0;
        incoming[k] = 0;
      }
  return cap - sum(store) - sum(incoming);
}

/** How much of resource r `target` will take from a source located in direction `fromDir` (relative to the target). */
function accept(s: SimState, tx: number, ty: number, r: number, amount: number, fromDir: Dir): number {
  const t = tileAt(s, tx, ty);
  const b = t?.building;
  if (!b || amount <= 0) return 0;
  const m = s.mutations;
  let space = 0;
  switch (b.kind) {
    case 'conduit':
    case 'reservoir': {
      if (!b.enabled) return 0; // sealed valve
      if (b.dir === fromDir) return 0; // never accept from its own output face
      space = singleFluidSpace(s, b.store, b.incoming, r, F.storeCap(b.kind, b.tier, m));
      break;
    }
    case 'junction': {
      if (!b.enabled || !b.lanes || !b.lanesIn) return 0;
      const lane = opposite(fromDir); // keeps travelling the way it was going
      const got = Math.max(0, Math.min(amount, singleFluidSpace(s, b.lanes[lane], b.lanesIn[lane], r, F.storeCap('junction', b.tier, m))));
      b.lanesIn[lane][r] += got;
      return got;
    }
    case 'router':
      if (!b.enabled) return 0;
      space = F.storeCap('router', b.tier, m) - sum(b.store) - sum(b.incoming);
      break;
    case 'digester':
    case 'reactor':
      if (C.RECIPES[b.kind].in[r] === 0) return 0;
      space = F.storeCap(b.kind, b.tier, m) - b.store[r] - b.incoming[r];
      break;
    case 'cauterizer':
    case 'ward':
    case 'mender':
      // Inline sinks: keep a reserve of their fuel and let the surplus pass through (see transfer()).
      if (r !== FUEL[b.kind]) return 0;
      space = 2 * F.storeCap(b.kind, b.tier, m) - b.store[r] - b.incoming[r];
      break;
    case 'heart':
      space = F.heartIntakeCap(b.tier) * C.HEART_BUFFER_SECONDS - b.store[r] - b.incoming[r];
      break;
    default:
      return 0;
  }
  const got = Math.max(0, Math.min(amount, space));
  b.incoming[r] += got;
  return got;
}

/** Does the building at (nx,ny) push into (x,y)? Routers never push back into their feeders. */
function feedsInto(s: SimState, nx: number, ny: number, x: number, y: number): boolean {
  const b = tileAt(s, nx, ny)?.building;
  if (!b || b.kind === 'router' || b.kind === 'heart' || b.kind === 'junction') return false;
  return nx + DX[b.dir] === x && ny + DY[b.dir] === y;
}

/** Push from a single-resource-agnostic buffer toward (tx,ty). Returns amount moved. */
function pushBuf(s: SimState, buf: Buf, budget: number, tx: number, ty: number, fromDir: Dir): number {
  let moved = 0;
  for (let r = 0; r < 4 && budget > 0; r++) {
    if (buf[r] <= 0) continue;
    const got = accept(s, tx, ty, r, Math.min(buf[r], budget), fromDir);
    buf[r] -= got;
    budget -= got;
    moved += got;
  }
  return moved;
}

function transfer(s: SimState, dt: number, pushed: Float64Array) {
  const m = s.mutations;
  const n = s.tiles.length;
  // Rotate the iteration origin every tick so no tile systematically wins merges.
  const offset = Math.floor(s.time / dt) % n;
  for (let k = 0; k < n; k++) {
    const i = (k + offset) % n;
    const t = s.tiles[i];
    const b = t.building;
    if (!b) continue;
    const x = i % s.w, y = (i / s.w) | 0;
    switch (b.kind) {
      case 'conduit':
      case 'reservoir': {
        if (!b.enabled) break;
        const budget = F.conduitThroughput('conduit', b.tier, t.rot, m) * dt;
        pushed[i] += pushBuf(s, b.store, budget, x + DX[b.dir], y + DY[b.dir], opposite(b.dir));
        break;
      }
      case 'junction': {
        if (!b.enabled || !b.lanes) break;
        const budget = F.conduitThroughput('conduit', b.tier, t.rot, m) * dt;
        for (let d = 0; d < 4; d++) pushed[i] += pushBuf(s, b.lanes[d], budget, x + DX[d], y + DY[d], opposite(d as Dir));
        break;
      }
      case 'router': {
        if (!b.enabled) break;
        const outs: Dir[] = [];
        for (let d = 0; d < 4; d++) {
          const dd = ((d + b.rr) % 4) as Dir;
          const nx = x + DX[dd], ny = y + DY[dd];
          if (inBounds(s, nx, ny) && s.tiles[idx(s, nx, ny)].building && !feedsInto(s, nx, ny, x, y)) outs.push(dd);
        }
        b.rr = (b.rr + 1) % 4;
        if (!outs.length) break;
        let budget = F.conduitThroughput('router', b.tier, t.rot, m) * dt;
        // Priority mode: the facing side gets first claim on the whole budget (overflow gate).
        if (b.mode === 'priority' && outs.includes(b.dir)) {
          const got = pushBuf(s, b.store, budget, x + DX[b.dir], y + DY[b.dir], opposite(b.dir));
          budget -= got;
          pushed[i] += got;
          outs.splice(outs.indexOf(b.dir), 1);
          if (!outs.length) break;
        }
        // Two passes: even split first, then let leftovers flow to whoever still has room.
        for (let pass = 0; pass < 2 && budget > 1e-12; pass++) {
          const share = budget / outs.length;
          for (const d of outs) {
            const got = pushBuf(s, b.store, share, x + DX[d], y + DY[d], opposite(d));
            budget -= got;
            pushed[i] += got;
          }
        }
        break;
      }
      case 'ward':
      case 'cauterizer':
      case 'mender': {
        const r = FUEL[b.kind];
        const surplus = b.store[r] - F.storeCap(b.kind, b.tier, m);
        if (surplus <= 1e-9) break;
        const budget = Math.min(surplus, F.conduitThroughput('conduit', b.tier, t.rot, m) * dt);
        const got = accept(s, x + DX[b.dir], y + DY[b.dir], r, budget, opposite(b.dir));
        b.store[r] -= got;
        pushed[i] += got;
        break;
      }
      case 'tap':
      case 'sporangium':
      case 'digester':
      case 'reactor': {
        const budget = C.PUSH_RATE * F.tierMul(b.tier) * dt;
        pushed[i] += pushBuf(s, b.out, budget, x + DX[b.dir], y + DY[b.dir], opposite(b.dir));
        break;
      }
    }
  }
  for (const t of s.tiles) {
    const b = t.building;
    if (!b) continue;
    for (let r = 0; r < 4; r++) {
      b.store[r] += b.incoming[r];
      b.incoming[r] = 0;
    }
    if (b.lanes && b.lanesIn)
      for (let d = 0; d < 4; d++)
        for (let r = 0; r < 4; r++) {
          b.lanes[d][r] += b.lanesIn[d][r];
          b.lanesIn[d][r] = 0;
        }
  }
}

// --- 3. Heart ----------------------------------------------------------------------------

function synthesise(s: SimState, dt: number) {
  const ht = s.tiles[idx(s, s.heartX, s.heartY)];
  const heart = ht.building!;
  const cap = F.heartIntakeCap(heart.tier) * F.rotPenalty(ht.rot) * dt;
  const k = 1 - Math.exp(-dt / C.INTAKE_EMA_TAU);
  for (let r = 0; r < 4; r++) {
    const c = Math.min(heart.store[r], cap);
    heart.store[r] -= c;
    countRes(s, 'consumed', r, c);
    s.intake[r] += (c / dt - s.intake[r]) * k;
    if (s.intake[r] < 1e-6) s.intake[r] = 0;
  }
  s.rate = F.heartRate(s.intake, F.heartAlpha(s.mutations), F.globalMult(s.mutagen, s.achievements.length));
  const gain = s.rate.add(C.HEART_PULSE).mul(dt);
  s.essence = s.essence.add(gain);
  s.runEssence = s.runEssence.add(gain);
  s.totalEssence = s.totalEssence.add(gain);
  countE(s, 'essenceEarned', gain);
}

// --- 4. Pressure & integrity ---------------------------------------------------------------

/** Fill fraction that counts as "pressure" for a building. Sinks (ward/cauterizer/heart) are valved and never over-pressurise. */
export function fillOf(s: SimState, b: Building): number {
  const m = s.mutations;
  switch (b.kind) {
    case 'conduit':
    case 'router':
    case 'reservoir':
      return sum(b.store) / F.storeCap(b.kind, b.tier, m);
    case 'junction': {
      if (!b.lanes) return 0;
      const cap = F.storeCap('junction', b.tier, m);
      return Math.max(...b.lanes.map((l) => sum(l) / cap));
    }
    case 'tap':
    case 'sporangium':
      return b.enabled ? sum(b.out) / F.outCap(b.kind, b.tier) : 0;
    case 'digester':
    case 'reactor':
      return sum(b.out) / F.outCap(b.kind, b.tier);
    default:
      return 0;
  }
}

const isPump = (k: string) => k === 'tap' || k === 'sporangium' || k === 'digester' || k === 'reactor';
const isVessel = (k: string) => k === 'conduit' || k === 'router' || k === 'junction' || k === 'reservoir';

/**
 * Strain propagation. Pressure is born at a *blocked pump* (a producer or processor whose output
 * is full) and travels downstream through vessels that are themselves full, stopping at the first
 * one with room. Routers forward strain to every full output only when they are full themselves.
 */
function computeStrain(s: SimState) {
  const n = s.tiles.length;
  const queue: number[] = [];
  const mark = (x: number, y: number) => {
    if (!inBounds(s, x, y)) return;
    const j = idx(s, x, y);
    const nb = s.tiles[j].building;
    if (!nb || !isVessel(nb.kind) || nb.strained || nb.pressure <= C.PRESSURE_SAFE) return;
    nb.strained = true;
    queue.push(j);
  };
  for (let i = 0; i < n; i++) {
    const b = s.tiles[i].building;
    if (b) b.strained = false;
  }
  // A blocked pump simply idles (it is never damaged itself) but forces strain into the full vessel ahead.
  for (let i = 0; i < n; i++) {
    const b = s.tiles[i].building;
    if (b && isPump(b.kind) && b.enabled && b.pressure > C.PRESSURE_SAFE) mark((i % s.w) + DX[b.dir], ((i / s.w) | 0) + DY[b.dir]);
  }
  while (queue.length) {
    const i = queue.pop()!;
    const b = s.tiles[i].building!;
    const x = i % s.w, y = (i / s.w) | 0;
    if (b.kind === 'conduit' || b.kind === 'reservoir') mark(x + DX[b.dir], y + DY[b.dir]);
    else if (b.kind === 'junction' && b.lanes) {
      const cap = F.storeCap('junction', b.tier, s.mutations);
      for (let d = 0; d < 4; d++) if (sum(b.lanes[d]) / cap > C.PRESSURE_SAFE) mark(x + DX[d], y + DY[d]);
    } else if (b.kind === 'router') for (let d = 0; d < 4; d++) if (!feedsInto(s, x + DX[d], y + DY[d], x, y)) mark(x + DX[d], y + DY[d]);
  }
}

function pressure(s: SimState, dt: number, pushed: Float64Array) {
  const m = s.mutations;
  const hz = F.hazardScale(s.depth);
  const k = 1 - Math.exp(-dt / 1.5);
  for (let i = 0; i < s.tiles.length; i++) {
    const b = s.tiles[i].building;
    if (!b || b.kind === 'heart') continue;
    b.flowEma += (pushed[i] / dt - b.flowEma) * k;
    b.pressure = fillOf(s, b);
  }
  computeStrain(s);
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i];
    if (t.rot > 0.5) count(s, 'rotTileSeconds', dt);
    const b = t.building;
    if (!b || b.kind === 'heart') continue;
    // Only strained structures feel their fill as pressure.
    const loss = F.integrityLoss(b.strained ? b.pressure : 0, t.rot, m) * hz;
    if (loss > 0) b.integrity -= loss * dt;
    else if (!b.strained) b.integrity = Math.min(1, b.integrity + C.INTEGRITY_REGEN * dt);
    if (b.strained) {
      t.rot = Math.min(1, t.rot + C.ROT_STAGNATION * dt);
      count(s, 'overpressureSeconds', dt);
    }
    if (b.integrity <= 0) rupture(s, i, b.strained ? 'pressure' : 'rot');
  }
}

/** Everything a building holds, in one buffer. */
export function contentsOf(b: Building): Buf {
  const c: Buf = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) c[r] = b.store[r] + b.out[r];
  if (b.lanes) for (const l of b.lanes) for (let r = 0; r < 4; r++) c[r] += l[r];
  return c;
}

export function rupture(s: SimState, i: number, cause: RuptureCause) {
  const t = s.tiles[i];
  const b = t.building;
  if (!b || b.kind === 'heart') return;
  const x = i % s.w, y = (i / s.w) | 0;
  const lost = contentsOf(b);
  for (let r = 0; r < 4; r++) countRes(s, 'spilled', r, lost[r]);
  t.building = null;
  s.built[b.kind] = Math.max(0, s.built[b.kind] - 1);
  t.rot = Math.min(1, t.rot + C.RUPTURE_ROT);
  for (let d = 0; d < 4; d++) {
    const n = tileAt(s, x + DX[d], y + DY[d]);
    if (n) n.rot = Math.min(1, n.rot + C.RUPTURE_ROT_SPLASH);
  }
  count(s, 'ruptures');
  s.stats.lastRuptureAt = s.time;
  countKind(s, 'rupturesByKind', b.kind);
  s.stats.run.rupturesByCause[cause]++;
  addRuin(s, x, y, b, cause);
  s.stats.life.rupturesByCause[cause]++;
  pushEvent(s, { kind: 'rupture', params: { kind: b.kind, cause }, x, y });
}

// --- 5. Rot ----------------------------------------------------------------------------------

function rotField(s: SimState, dt: number) {
  const { w, h } = s;
  const next = new Float64Array(s.tiles.length);
  let flushed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = s.tiles[i].rot;
      let lap = 0;
      let contagion = 0;
      const b = s.tiles[i].building;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nt = s.tiles[ny * w + nx];
        lap += nt.rot - r;
        if (b && nt.building && nt.rot > C.ROT_TIPPING && nt.rot > r) contagion += nt.rot - r;
      }
      const onStructure = !!b;
      let local: number;
      if (!b) local = -C.ROT_BARE_DECAY;
      else if (b.strained) local = C.ROT_GROWTH * r * (1 - r); // forced stagnation breeds rot
      else if (isFlowing(s, b)) {
        local = -C.ROT_FLUSH; // moving fluid scours its vessel
        flushed += Math.min(r, C.ROT_FLUSH * dt);
      } else if (r > C.ROT_TIPPING) local = C.ROT_GROWTH * r * (1 - r); // an established infection spreads
      else {
        local = -C.ROT_REST_DECAY; // small seeds on a healthy, resting structure heal
        flushed += Math.min(r, C.ROT_REST_DECAY * dt);
      }
      let v = r + (local + C.ROT_DIFFUSION * lap + C.ROT_CONTAGION * contagion) * dt;
      // Only bare rock evaporates small amounts; on structures even traces are seeds.
      if (v < (onStructure ? 1e-6 : C.ROT_FLOOR)) v = 0;
      next[i] = Math.min(1, Math.max(0, v));
    }
  }
  for (let i = 0; i < next.length; i++) s.tiles[i].rot = next[i];
  if (flushed > 0) count(s, 'rotFlushed', flushed);

  // Entropy: random corruption, more frequent the more powerful the network.
  if (rand(s) < F.entropyChance(s.rate, s.depth) * dt) {
    // Falls anywhere in the cavern (on rock it evaporates, so small outposts aren't singled out), except
    // on the Heart: a random cut to its intake cap is a shock no design could anticipate.
    const i = randInt(s, s.tiles.length);
    // Random wear is visible and heals, but can never by itself push a tile past the tipping point:
    // only avoidable causes (strain, ruptures, leeches) start a real infection.
    const t = s.tiles[i];
    if (i !== idx(s, s.heartX, s.heartY)) t.rot = Math.max(t.rot, Math.min(t.rot + C.ENTROPY_SEED_ROT, C.ROT_TIPPING - 0.05));
    count(s, 'entropySeeds');
  }
}

/** A structure is 'flowing' if it is moving goods and isn't backed up. */
export function isFlowing(s: SimState, b: Building): boolean {
  if (b.kind === 'heart') return s.intake.some((v) => v > C.FLOW_HEALTHY);
  return b.enabled && !b.strained && b.flowEma > C.FLOW_HEALTHY;
}

// --- 6. Parasites ------------------------------------------------------------------------------

/** Seconds of grace left (0 once leeches are active). */
export const graceLeft = (s: SimState) => Math.max(0, (s.graceUntil ?? C.GRACE_SECONDS) - s.stats.life.time);

function parasites(s: SimState, dt: number) {
  if (graceLeft(s) > 0) {
    // Grace: the burrows stay quiet. The first wave comes WAVE_FIRST after grace ends.
    s.leeches = [];
    s.waveTimer = C.WAVE_FIRST;
    return;
  }
  s.waveTimer -= dt;
  if (s.waveTimer <= 0) spawnWave(s);

  // Wards
  for (let i = 0; i < s.tiles.length; i++) {
    const b = s.tiles[i].building;
    if (!b || b.kind !== 'ward' || !b.enabled || !s.leeches.length) continue;
    const x = i % s.w, y = (i / s.w) | 0;
    let target: Leech | null = null;
    for (const l of s.leeches) {
      if (l.hp > 0 && Math.max(Math.abs(l.x - x), Math.abs(l.y - y)) <= C.WARD_RADIUS && (!target || l.hp < target.hp)) target = l;
    }
    if (!target) continue;
    const need = C.WARD_BURN * Math.pow(1.5, b.tier) * dt;
    const frac = Math.min(1, b.store[R.spore] / need);
    if (frac <= 0) continue;
    b.store[R.spore] -= need * frac;
    countRes(s, 'burned', R.spore, need * frac);
    const dmg = Math.min(target.hp, C.WARD_DPS * F.tierMul(b.tier) * frac * dt);
    target.hp -= dmg;
    target.lastHit = 'ward';
    count(s, 'wardDamage', dmg);
  }

  for (const l of s.leeches) {
    if (l.hp <= 0) continue;
    const t = tileAt(s, l.x, l.y)!;
    const b = t.building;
    if (b) {
      l.latched = true;
      l.fed += dt;
      if (b.kind === 'heart') {
        const lost = s.essence.mul(C.LEECH_HEART_DRAIN * dt);
        s.essence = s.essence.sub(lost);
        countE(s, 'heartLeeched', lost);
      } else {
        const thorns = b.kind === 'ward';
        const keep = thorns ? 1 : 1 - C.LEECH_DRAIN * dt;
        const bufs = [b.store, b.out, ...(b.lanes ?? [])];
        for (const buf of bufs)
          for (let r = 0; r < 4; r++) {
            countRes(s, 'drained', r, buf[r] * (1 - keep));
            buf[r] *= keep;
          }
        b.integrity -= C.LEECH_BITE * (thorns ? C.WARD_BITE_MULT : 1) * dt;
        t.rot = Math.min(1, t.rot + C.LEECH_ROT * (thorns ? C.WARD_BITE_MULT : 1) * dt);
        if (b.integrity <= 0) {
          rupture(s, idx(s, l.x, l.y), 'leech');
          l.latched = false;
        }
      }
      continue;
    }
    l.latched = false;
    l.moveCd -= dt;
    if (l.moveCd > 0) continue;
    l.moveCd = C.LEECH_MOVE_CD;
    const [tx, ty] = nearestBuilding(s, l.x, l.y);
    const dx = Math.sign(tx - l.x), dy = Math.sign(ty - l.y);
    if (Math.abs(tx - l.x) >= Math.abs(ty - l.y)) l.x += dx; else l.y += dy;
  }

  let slain = 0;
  s.leeches = s.leeches.filter((l) => {
    if (l.hp <= 0) {
      slain++;
      count(s, 'leechesKilled');
      count(s, l.lastHit === 'ward' ? 'killsByWard' : 'killsByStrike');
      return false;
    }
    if (l.fed >= C.LEECH_SATIATION) {
      count(s, 'leechesSated');
      s.stats.lastSatedAt = s.time;
      pushEvent(s, { kind: 'leech_sated', x: l.x, y: l.y });
      return false;
    }
    return true;
  });
  if (slain) pushEvent(s, { kind: 'leech_killed', params: { n: slain } });
}

/** Leeches hunt the nearest structure; the Heart only when nothing else stands. */
function nearestBuilding(s: SimState, x: number, y: number): [number, number] {
  let best: [number, number] = [s.heartX, s.heartY];
  let bd = Infinity;
  for (let i = 0; i < s.tiles.length; i++) {
    const b = s.tiles[i].building;
    if (!b || b.kind === 'heart') continue;
    const bx = i % s.w, by = (i / s.w) | 0;
    const d = Math.abs(bx - x) + Math.abs(by - y);
    if (d < bd) { bd = d; best = [bx, by]; }
  }
  return best;
}

export function spawnWave(s: SimState) {
  const burrows: number[] = [];
  s.tiles.forEach((t, i) => t.terrain === 'burrow' && burrows.push(i));
  const n = F.waveCount(s.wave, s.rate);
  const hp = F.leechHp(s.wave, s.depth, s.rate);
  let spawned = 0;
  for (let k = 0; k < n && burrows.length; k++) {
    const i = burrows[randInt(s, burrows.length)];
    s.leeches.push({ id: s.nextLeechId++, x: i % s.w, y: (i / s.w) | 0, hp, maxHp: hp, moveCd: C.LEECH_MOVE_CD * (1 + k * 0.3), latched: false, fed: 0 });
    spawned++;
  }
  count(s, 'waves');
  count(s, 'leechesSpawned', spawned);
  pushEvent(s, { kind: 'wave', params: { wave: s.wave + 1, n: spawned } });
  s.wave++;
  s.waveTimer = F.waveInterval(s.wave);
}

// --- helpers ---------------------------------------------------------------------------------

function forRadius(s: SimState, x: number, y: number, rad: number, fn: (t: SimState['tiles'][number]) => void) {
  for (let yy = y - rad; yy <= y + rad; yy++)
    for (let xx = x - rad; xx <= x + rad; xx++) if (inBounds(s, xx, yy)) fn(s.tiles[idx(s, xx, yy)]);
}

function anyRotNear(s: SimState, x: number, y: number, rad: number) {
  let found = false;
  forRadius(s, x, y, rad, (t) => { if (t.rot > 0) found = true; });
  return found;
}

/** Run many ticks (offline catch-up / probes). Returns a summary diff. */
export function simulate(s: SimState, seconds: number, dt = C.TICK) {
  const e0 = s.essence;
  const r0 = s.stats.life.ruptures;
  const k0 = s.stats.life.leechesKilled;
  const steps = Math.floor(seconds / dt);
  for (let i = 0; i < steps; i++) tick(s, dt);
  return {
    seconds: steps * dt,
    essenceGained: s.essence.sub(e0).max(new Decimal(0)),
    ruptures: s.stats.life.ruptures - r0,
    leechesKilled: s.stats.life.leechesKilled - k0,
  };
}
