import Decimal from 'break_eternity.js';
import * as C from './config';
import * as F from './formulas';
import { rand, randInt } from './rng';
import { DX, DY, R, opposite, type Building, type Dir, type Leech, type SimState } from './types';
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
 */
export function tick(s: SimState, dt: number) {
  s.time += dt;
  const pushed = produce(s, dt);
  transfer(s, dt, pushed);
  synthesise(s, dt);
  pressure(s, dt, pushed);
  rotField(s, dt);
  parasites(s, dt);
}

const sum = (b: number[]) => b[0] + b[1] + b[2] + b[3];

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
        b.out[r] += Math.max(0, Math.min(amt, space));
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
        }
        b.progress += crafts;
        break;
      }
      case 'cauterizer': {
        const x = i % s.w, y = (i / s.w) | 0;
        if (!anyRotNear(s, x, y, C.CAUTERIZER_RADIUS)) break;
        const need = C.CAUTERIZER_BURN * Math.pow(1.5, b.tier) * dt;
        const frac = Math.min(1, b.store[R.bile] / need);
        if (frac <= 0) break;
        b.store[R.bile] -= need * frac;
        const clean = C.CAUTERIZER_CLEANSE * F.tierMul(b.tier) * frac * dt;
        forRadius(s, x, y, C.CAUTERIZER_RADIUS, (tt) => { tt.rot = Math.max(0, tt.rot - clean); });
        break;
      }
      // ward handled in parasites(); conduit/router/heart have no production
    }
  }
  return new Float64Array(s.tiles.length);
}

// --- 2. Transfer -------------------------------------------------------------------------

/** How much of resource r `target` will take from a source located in direction `fromDir` (relative to the target). */
function accept(s: SimState, tx: number, ty: number, r: number, amount: number, fromDir: Dir): number {
  const t = tileAt(s, tx, ty);
  const b = t?.building;
  if (!b || amount <= 0) return 0;
  const m = s.mutations;
  let space = 0;
  switch (b.kind) {
    case 'conduit': {
      if (!b.enabled) return 0; // sealed valve
      if (b.dir === fromDir) return 0; // never accept from its own output face
      for (let k = 0; k < 4; k++) if (k !== r && b.store[k] + b.incoming[k] > 1e-9) return 0; // one fluid per vessel
      space = F.storeCap('conduit', b.tier, m) - sum(b.store) - sum(b.incoming);
      break;
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
      if (r !== R.bile) return 0;
      space = F.storeCap(b.kind, b.tier, m) - b.store[r] - b.incoming[r];
      break;
    case 'ward':
      if (r !== R.spore) return 0;
      space = F.storeCap(b.kind, b.tier, m) - b.store[r] - b.incoming[r];
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
  if (!b || b.kind === 'router' || b.kind === 'heart') return false;
  return nx + DX[b.dir] === x && ny + DY[b.dir] === y;
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
      case 'conduit': {
        if (!b.enabled) break;
        let budget = F.conduitThroughput('conduit', b.tier, t.rot, m) * dt;
        const tx = x + DX[b.dir], ty = y + DY[b.dir];
        for (let r = 0; r < 4 && budget > 0; r++) {
          if (b.store[r] <= 0) continue;
          const got = accept(s, tx, ty, r, Math.min(b.store[r], budget), opposite(b.dir));
          b.store[r] -= got;
          budget -= got;
          pushed[i] += got;
        }
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
        // Two passes: even split first, then let leftovers flow to whoever still has room.
        for (let pass = 0; pass < 2 && budget > 1e-12; pass++) {
          const share = budget / outs.length;
          for (const d of outs) {
            let quota = share;
            for (let r = 0; r < 4 && quota > 0; r++) {
              if (b.store[r] <= 0) continue;
              const got = accept(s, x + DX[d], y + DY[d], r, Math.min(b.store[r], quota), opposite(d));
              b.store[r] -= got;
              quota -= got;
              budget -= got;
              pushed[i] += got;
            }
          }
        }
        break;
      }
      case 'tap':
      case 'sporangium':
      case 'digester':
      case 'reactor': {
        let budget = C.PUSH_RATE * F.tierMul(b.tier) * dt;
        const tx = x + DX[b.dir], ty = y + DY[b.dir];
        for (let r = 0; r < 4 && budget > 0; r++) {
          if (b.out[r] <= 0) continue;
          const got = accept(s, tx, ty, r, Math.min(b.out[r], budget), opposite(b.dir));
          b.out[r] -= got;
          budget -= got;
          pushed[i] += got;
        }
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
    s.intake[r] += (c / dt - s.intake[r]) * k;
    if (s.intake[r] < 1e-6) s.intake[r] = 0;
  }
  const unspent = s.mutagen;
  s.rate = F.heartRate(s.intake, F.heartAlpha(s.mutations), F.globalMult(unspent));
  const gain = s.rate.add(C.HEART_PULSE).mul(dt);
  s.essence = s.essence.add(gain);
  s.runEssence = s.runEssence.add(gain);
  s.totalEssence = s.totalEssence.add(gain);
  if (s.rate.gt(s.stats.peakRate)) s.stats.peakRate = s.rate;
}

// --- 4. Pressure & integrity ---------------------------------------------------------------

/** Fill fraction that counts as "pressure" for a building. Sinks (ward/cauterizer/heart) are valved and never over-pressurise. */
export function fillOf(s: SimState, b: Building): number {
  const m = s.mutations;
  switch (b.kind) {
    case 'conduit':
    case 'router':
      return sum(b.store) / F.storeCap(b.kind, b.tier, m);
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

function pressure(s: SimState, dt: number, pushed: Float64Array) {
  const m = s.mutations;
  const hz = F.hazardScale(s.depth);
  const k = 1 - Math.exp(-dt / 1.5);
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i];
    const b = t.building;
    if (!b || b.kind === 'heart') continue;
    b.flowEma += (pushed[i] / dt - b.flowEma) * k;
    const fill = fillOf(s, b);
    b.pressure = fill;
    const loss = F.integrityLoss(fill, t.rot, m) * hz;
    if (loss > 0) b.integrity -= loss * dt;
    else if (fill < 0.5) b.integrity = Math.min(1, b.integrity + C.INTEGRITY_REGEN * dt);
    if (fill > C.PRESSURE_SAFE) t.rot = Math.min(1, t.rot + C.ROT_STAGNATION * dt);
    if (b.integrity <= 0) rupture(s, i);
  }
}

export function rupture(s: SimState, i: number) {
  const t = s.tiles[i];
  const b = t.building;
  if (!b || b.kind === 'heart') return;
  const x = i % s.w, y = (i / s.w) | 0;
  t.building = null;
  s.built[b.kind] = Math.max(0, s.built[b.kind] - 1);
  t.rot = Math.min(1, t.rot + C.RUPTURE_ROT);
  for (let d = 0; d < 4; d++) {
    const n = tileAt(s, x + DX[d], y + DY[d]);
    if (n) n.rot = Math.min(1, n.rot + C.RUPTURE_ROT_SPLASH);
  }
  s.stats.ruptures++;
  pushEvent(s, { kind: 'rupture', msg: `${C.KINDS[b.kind].name} ruptured`, x, y });
}

// --- 5. Rot ----------------------------------------------------------------------------------

function rotField(s: SimState, dt: number) {
  const { w, h } = s;
  const next = new Float64Array(s.tiles.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = s.tiles[i].rot;
      let lap = 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) lap += s.tiles[ny * w + nx].rot - r;
      }
      const b = s.tiles[i].building;
      const onStructure = !!b;
      let local: number;
      if (!b) local = -C.ROT_BARE_DECAY;
      else if (isFlowing(s, b)) local = -C.ROT_FLUSH; // moving fluid scours its vessel
      else if (b.kind === 'ward' || b.kind === 'cauterizer') local = 0; // valved sinks: inert
      else local = C.ROT_GROWTH * r * (1 - r); // stagnation breeds rot
      let v = r + (local + C.ROT_DIFFUSION * lap) * dt;
      // Only bare rock evaporates small amounts; on structures even traces are seeds.
      if (v < (onStructure ? 1e-6 : C.ROT_FLOOR)) v = 0;
      next[i] = Math.min(1, Math.max(0, v));
    }
  }
  for (let i = 0; i < next.length; i++) s.tiles[i].rot = next[i];

  // Entropy: random corruption, more frequent the more powerful the network.
  if (rand(s) < F.entropyChance(s.rate, s.depth) * dt) {
    const cands: number[] = [];
    s.tiles.forEach((t, i) => t.building && t.building.kind !== 'heart' && cands.push(i));
    const i = cands.length ? cands[randInt(s, cands.length)] : randInt(s, s.tiles.length);
    s.tiles[i].rot = Math.min(1, s.tiles[i].rot + C.ENTROPY_SEED_ROT);
  }
}

/** A structure is 'flowing' if it is moving goods and isn't backed up. */
export function isFlowing(s: SimState, b: Building): boolean {
  if (b.kind === 'heart') return s.intake.some((v) => v > C.FLOW_HEALTHY);
  return b.enabled && b.pressure < 0.5 && b.flowEma > C.FLOW_HEALTHY;
}

// --- 6. Parasites ------------------------------------------------------------------------------

function parasites(s: SimState, dt: number) {
  s.waveTimer -= dt;
  if (s.waveTimer <= 0) spawnWave(s);

  // Wards
  for (let i = 0; i < s.tiles.length; i++) {
    const b = s.tiles[i].building;
    if (!b || b.kind !== 'ward' || !b.enabled || !s.leeches.length) continue;
    const x = i % s.w, y = (i / s.w) | 0;
    let target: Leech | null = null;
    for (const l of s.leeches) {
      if (Math.max(Math.abs(l.x - x), Math.abs(l.y - y)) <= C.WARD_RADIUS && (!target || l.hp < target.hp)) target = l;
    }
    if (!target) continue;
    const need = C.WARD_BURN * Math.pow(1.5, b.tier) * dt;
    const frac = Math.min(1, b.store[R.spore] / need);
    if (frac <= 0) continue;
    b.store[R.spore] -= need * frac;
    target.hp -= C.WARD_DPS * F.tierMul(b.tier) * frac * dt;
  }

  for (const l of s.leeches) {
    if (l.hp <= 0) continue;
    const t = tileAt(s, l.x, l.y)!;
    const b = t.building;
    if (b) {
      l.latched = true;
      l.fed += dt;
      if (b.kind === 'heart') {
        s.essence = s.essence.mul(1 - C.LEECH_HEART_DRAIN * dt);
      } else {
        const keep = 1 - C.LEECH_DRAIN * dt;
        for (let r = 0; r < 4; r++) { b.store[r] *= keep; b.out[r] *= keep; }
        b.integrity -= C.LEECH_BITE * dt;
        t.rot = Math.min(1, t.rot + C.LEECH_ROT * dt);
        if (b.integrity <= 0) {
          rupture(s, idx(s, l.x, l.y));
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
    if (l.hp <= 0) { slain++; s.stats.leechesKilled++; return false; }
    if (l.fed >= C.LEECH_SATIATION) {
      pushEvent(s, { kind: 'info', msg: 'A gorged leech burrows away', x: l.x, y: l.y });
      return false;
    }
    return true;
  });
  if (slain) pushEvent(s, { kind: 'leech_killed', msg: `${slain} leech${slain > 1 ? 'es' : ''} slain` });
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
  const count = F.waveCount(s.wave, s.rate);
  const hp = F.leechHp(s.wave, s.depth, s.rate);
  for (let k = 0; k < count && burrows.length; k++) {
    const i = burrows[randInt(s, burrows.length)];
    s.leeches.push({ id: s.nextLeechId++, x: i % s.w, y: (i / s.w) | 0, hp, maxHp: hp, moveCd: C.LEECH_MOVE_CD * (1 + k * 0.3), latched: false, fed: 0 });
  }
  pushEvent(s, { kind: 'wave', msg: `Wave ${s.wave + 1}: ${count} leech${count > 1 ? 'es' : ''} stir` });
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
  const r0 = s.stats.ruptures;
  const k0 = s.stats.leechesKilled;
  const steps = Math.floor(seconds / dt);
  for (let i = 0; i < steps; i++) tick(s, dt);
  return {
    seconds: steps * dt,
    essenceGained: s.essence.sub(e0).max(new Decimal(0)),
    ruptures: s.stats.ruptures - r0,
    leechesKilled: s.stats.leechesKilled - k0,
  };
}
