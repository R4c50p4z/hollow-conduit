/**
 * Multi-cycle balance probe. A bot builds the full four-resource refinery (incl. vitriol),
 * upgrades greedily, defends, metamorphoses when its mutagen-per-minute peaks, and spends
 * mutagen (Hypertrophy first). Prints one line per cycle.
 *
 *   npm run probe:deep -- [hours=4] [seed=1]
 */
import Decimal from 'break_eternity.js';
import { applyCommand } from '../src/sim/commands';
import { MUTATIONS, TICK } from '../src/sim/config';
import { tick } from '../src/sim/engine';
import * as F from '../src/sim/formulas';
import type { Dir, Kind, MutationId, SimState } from '../src/sim/types';
import { createState, idx } from '../src/sim/world';

const hours = Number(process.argv[2] ?? 4);
const seed = Number(process.argv[3] ?? 1);
const verbose = process.argv.includes('-v');
/** --afk=MIN: play actively for MIN minutes of the first cycle, then stop touching anything. */
const afkArg = process.argv.find((a) => a.startsWith('--afk='));
const afkAfter = afkArg ? Number(afkArg.slice(6)) * 60 : Infinity;
let afkReport = 0;

type P = [number, number, Kind, Dir];
// Heart at (4,10): N = ichor, W = bile, E = spores, S = vitriol.
const PLAN: P[] = [
  // 1. ichor trunk
  ...[3, 4, 5, 6, 7, 8, 9].map((y) => [4, y, 'conduit', 2] as P),
  [3, 3, 'tap', 1], [5, 3, 'tap', 3],
  // 2. spores straight to the Heart (E), with inline wards
  [8, 5, 'sporangium', 3], [7, 5, 'conduit', 2], [7, 6, 'conduit', 2], [7, 7, 'conduit', 2], [7, 8, 'conduit', 2],
  [7, 9, 'conduit', 2], [7, 10, 'router', 0], [6, 10, 'conduit', 3], [5, 10, 'conduit', 3],
  // 3. bile: taps → digester → ganglion → Heart (W) through the junction
  [0, 2, 'tap', 1], [0, 3, 'tap', 1], [1, 2, 'conduit', 2], [1, 3, 'conduit', 2], [1, 4, 'conduit', 2],
  [1, 5, 'digester', 2], [1, 6, 'router', 0],
  [1, 7, 'conduit', 2], [1, 8, 'conduit', 2], [1, 9, 'conduit', 2], [1, 10, 'conduit', 1],
  [2, 10, 'junction', 0], [3, 10, 'conduit', 1],
  // 4. more ichor + spores
  [3, 4, 'tap', 1], [5, 4, 'tap', 3], [8, 6, 'sporangium', 3], [7, 6, 'ward', 2],
  // 5. vitriol: womb first, then the two branches that feed it
  [3, 11, 'reactor', 1], [4, 11, 'conduit', 0],
  [2, 6, 'conduit', 2], [2, 7, 'conduit', 2], [2, 8, 'conduit', 2], [2, 9, 'conduit', 2], [2, 11, 'conduit', 1],
  [7, 11, 'conduit', 2], [7, 12, 'conduit', 3], [6, 12, 'conduit', 3], [5, 12, 'conduit', 3], [4, 12, 'conduit', 3], [3, 12, 'conduit', 0],
  [7, 8, 'ward', 2],
  // 6. a defensive outpost at each burrow: sporangium feeding a terminal ward (it fills, then the pump idles)
  [2, 0, 'sporangium', 3], [1, 0, 'ward', 3],
  [6, 1, 'sporangium', 1], [7, 1, 'ward', 1],
];
const terrainFor = (k: Kind) => (k === 'tap' ? 'vein' : k === 'sporangium' ? 'sporebed' : 'rock');

function prepare(s: SimState) {
  for (const t of s.tiles) {
    if (t.building?.kind !== 'heart') t.building = null;
    t.terrain = 'rock';
    t.richness = 1;
    t.rot = 0;
  }
  s.tiles[idx(s, 0, 0)].terrain = 'burrow';
  s.tiles[idx(s, 8, 0)].terrain = 'burrow';
  s.tiles[idx(s, 8, 8)].terrain = 'burrow';
  for (const [x, y, k] of PLAN) s.tiles[idx(s, x, y)].terrain = terrainFor(k);
}

const s = createState(seed);
s.graceUntil = 0; // measure the full hazard model
prepare(s);
let cycleStart = 0;
let bestRatio = 0;
let lastAct = 0;
const total = hours * 3600;
const fmt = (d: Decimal) => (d.lt(1e4) ? d.toNumber().toFixed(1) : d.toExponential(2));
console.log('cyc depth   time   peak E/s   cycle ess  mut   α     ruptures kills  intake[i,s,b,v]');

let elapsed = 0;
while (elapsed < total) {
  tick(s, TICK);
  elapsed += TICK;
  if (elapsed >= afkAfter) {
    if (elapsed >= afkReport) {
      const st = s.stats.run;
      const n = s.tiles.filter((t) => t.building && t.building.kind !== 'heart').length;
      console.log(
        `AFK ${((elapsed - afkAfter) / 3600).toFixed(1).padStart(5)}h  E/s ${fmt(s.rate).padStart(9)}  structures ${String(n).padStart(3)}  ruptures ${st.ruptures} (p${st.rupturesByCause.pressure}/r${st.rupturesByCause.rot}/l${st.rupturesByCause.leech})  wave ${s.wave}  leechHP ${F.leechHp(s.wave, s.depth, s.rate).toFixed(0)}  killed ${st.leechesKilled} sated ${st.leechesSated}  rotAvg ${(s.tiles.reduce((a, t) => a + t.rot, 0) / s.tiles.length).toFixed(3)}  strained ${s.tiles.filter((t) => t.building?.strained).length}`,
      );
      afkReport = elapsed + (elapsed - afkAfter < 1800 || (elapsed - afkAfter > 4 * 3600 && elapsed - afkAfter < 8 * 3600) ? 300 : 1800);
    }
    continue;
  }
  if (s.time - lastAct < 1) continue;
  lastAct = s.time;

  // Chores
  for (const l of s.leeches) for (let k = 0; k < 3; k++) applyCommand(s, { t: 'strike', x: l.x, y: l.y });
  s.tiles.forEach((t, j) => {
    const x = j % s.w, y = (j / s.w) | 0;
    if (t.building && t.building.integrity < 0.5) applyCommand(s, { t: 'repair', x, y });
    if (t.rot > 0.55) applyCommand(s, { t: 'cleanse', x, y });
  });

  // Build / rebuild in order
  let complete = true;
  for (const [x, y, k, d] of PLAN) {
    const b = s.tiles[idx(s, x, y)].building;
    // A conduit slot is satisfied by anything; an inline ward replaces the conduit it sits on.
    if (b && (b.kind === k || k === 'conduit')) continue;
    complete = false;
    if (b && b.kind === 'conduit' && s.essence.gte(F.buildCost(k, s.built[k]).add(10))) applyCommand(s, { t: 'demolish', x, y });
    if (!applyCommand(s, { t: 'build', x, y, kind: k, dir: d }).ok) break;
  }

  // Before going AFK, prepare like a careful player: wards to tier 3, and every strained bottleneck fixed.
  if (elapsed > afkAfter - 600) {
    s.tiles.forEach((t, j) => {
      const b = t.building;
      if (b?.kind === 'ward' && b.tier < 3) applyCommand(s, { t: 'upgrade', x: j % s.w, y: (j / s.w) | 0 });
      if (b?.strained) applyCommand(s, { t: 'upgrade', x: j % s.w, y: (j / s.w) | 0 });
    });
  }
  // Upgrades: Heart first when affordable; else fix the worst bottleneck; else cheapest producer/processor.
  const hb = s.tiles[idx(s, s.heartX, s.heartY)].building!;
  const heartCost = F.tierCost('heart', hb.tier);
  if (complete) {
    if (s.essence.gte(heartCost.mul(1.2))) applyCommand(s, { t: 'upgrade', x: s.heartX, y: s.heartY });
    // True bottleneck = the first structure downstream of a full vessel that is NOT itself full.
    const DXs = [0, 1, 0, -1], DYs = [-1, 0, 1, 0];
    const targets: [number, number][] = [];
    let lineBlocked = false;
    s.tiles.forEach((t, j) => {
      const b = t.building;
      if (!b || b.kind === 'heart' || !b.strained) return;
      lineBlocked = true;
      const x = j % s.w, y = (j / s.w) | 0;
      const nx = x + DXs[b.dir], ny = y + DYs[b.dir];
      const nb = s.tiles[idx(s, nx, ny)]?.building;
      if (b.kind === 'router' || b.kind === 'junction') return;
      if (!nb) return;
      if (nb.kind === 'heart') return void targets.push([x, y]); // last vessel into a full Heart
      // The last strained vessel before free space is the bottleneck; a processor ahead of it is.
      if (nb.kind === 'digester' || nb.kind === 'reactor') targets.push([nx, ny]);
      else if (!nb.strained) targets.push([x, y]);
    });
    for (const [tx, ty] of targets) {
      const b = s.tiles[idx(s, tx, ty)].building!;
      const c = F.tierCost(b.kind, b.tier);
      if (c.lt(heartCost.mul(0.6))) applyCommand(s, { t: 'upgrade', x: tx, y: ty });
    }
    // Only widen production when nothing is backed up.
    let cheapest: [number, number, Decimal] | null = null;
    s.tiles.forEach((t, j) => {
      const b = t.building;
      if (!b || !['tap', 'sporangium', 'digester', 'reactor', 'ward'].includes(b.kind)) return;
      const c = F.tierCost(b.kind, b.tier);
      if (!cheapest || c.lt(cheapest[2])) cheapest = [j % s.w, (j / s.w) | 0, c];
    });
    const ch = cheapest as [number, number, Decimal] | null;
    if (!lineBlocked && ch && ch[2].lt(heartCost.mul(0.25))) applyCommand(s, { t: 'upgrade', x: ch[0], y: ch[1] });
  }

  // Metamorphosis when mutagen-per-minute stops improving (or after 90 min).
  const y = F.mutagenYield(s.runEssence, s.depth).toNumber();
  const cycTime = s.time;
  if (y >= 1 && cycTime > 300) {
    const ratio = y / cycTime;
    if (ratio > bestRatio) bestRatio = ratio;
    if (ratio < bestRatio * 0.85 || cycTime > 90 * 60) {
      const st = s.stats;
      console.log(
        [
          String(st.metamorphoses + 1).padStart(3),
          String(s.depth).padStart(5),
          `${(cycTime / 60).toFixed(1).padStart(5)}m`,
          fmt(st.peakRate).padStart(10),
          fmt(s.runEssence).padStart(11),
          String(y).padStart(4),
          F.heartAlpha(s.mutations).toFixed(2).padStart(5),
          String(st.run.ruptures).padStart(8),
          String(st.run.leechesKilled).padStart(6),
          `  [${st.peakIntake.map((v) => v.toFixed(0)).join(',')}]`,
        ].join(' '),
      );
      // Descend only after a clean cycle; otherwise consolidate at this depth.
      applyCommand(s, { t: 'metamorphose', descend: st.run.ruptures <= 2 });
      prepare(s);
      bestRatio = 0;
      lastAct = 0;
      cycleStart = elapsed;
      // Spend: Hypertrophy whenever affordable, then cheapest other.
      for (let guard = 0; guard < 200; guard++) {
        const ids = Object.keys(MUTATIONS) as MutationId[];
        const hyp = F.mutationCost('hypertrophy', s.mutations.hypertrophy);
        if (s.mutagen.gte(hyp) && s.mutations.hypertrophy < MUTATIONS.hypertrophy.max) { applyCommand(s, { t: 'mutate', id: 'hypertrophy' }); continue; }
        const cands = ids.filter((id) => id !== 'hypertrophy' && s.mutations[id] < MUTATIONS[id].max).sort((a, b) => F.mutationCost(a, s.mutations[a]).cmp(F.mutationCost(b, s.mutations[b])));
        const c = cands[0];
        if (c && s.mutagen.gte(F.mutationCost(c, s.mutations[c]))) applyCommand(s, { t: 'mutate', id: c });
        else break;
      }
      if (verbose) console.log('   mutations', JSON.stringify(s.mutations), 'unspent', s.mutagen.toString());
    }
  }
}
void cycleStart;
if (process.argv.includes('-d')) {
  for (let y = 0; y < s.h; y++) {
    let line = '';
    for (let x = 0; x < s.w; x++) {
      const t = s.tiles[idx(s, x, y)];
      const b = t.building;
      line += (b ? b.kind.slice(0, 2) + b.tier + (b.pressure > 0.8 ? '!' : ' ') : t.terrain.slice(0, 2) + '  ') + ((t.rot * 9) | 0) + ' ';
    }
    console.log(line);
  }
  const r = s.stats.run;
  console.log('essence', fmt(s.essence), 'rate', fmt(s.rate), 'intake', s.intake.map((v) => v.toFixed(2)).join(','));
  console.log('spent repair', fmt(r.spentRepair), 'cleanse', fmt(r.spentCleanse), 'upgrade', fmt(r.spentUpgrade), 'build', fmt(r.spentBuild), 'heartLeeched', fmt(r.heartLeeched));
  console.log('ruptures', JSON.stringify(r.rupturesByCause), 'overpressure s', r.overpressureSeconds.toFixed(0));
  console.log('recent ruptures', s.events.filter((e) => e.kind === 'rupture').map((e) => `${e.params?.kind}@${e.x},${e.y}:${e.params?.cause} t=${e.t.toFixed(0)}`).join('  '));
}
console.log(`\nfinal: depth ${s.depth}, α ${F.heartAlpha(s.mutations).toFixed(2)}, best E/s ${fmt(s.stats.bestRate)}, total ${fmt(s.totalEssence)}, achievements ${s.achievements.length}`);
console.log('mutations', JSON.stringify(s.mutations));
