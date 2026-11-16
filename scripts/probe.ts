/**
 * Headless balance probe. Builds a fixed reference layout in a blank cavern and lets a
 * greedy "attentive player" bot run for N minutes: it buys the cheapest upgrade it can,
 * repairs anything below 50% integrity, cleanses heavy rot and strikes leeches.
 *
 *   npm run probe -- [minutes=60] [seed=1]
 *
 * Output is a pacing table. Use it after touching config.ts to see whether the curve
 * still has walls (payback growing) and whether hazards still bite.
 */
import Decimal from 'break_eternity.js';
import { applyCommand } from '../src/sim/commands';
import { TICK } from '../src/sim/config';
import { tick } from '../src/sim/engine';
import * as F from '../src/sim/formulas';
import type { Dir, Kind, SimState } from '../src/sim/types';
import { createState, idx } from '../src/sim/world';

const minutes = Number(process.argv[2] ?? 60);
const seed = Number(process.argv[3] ?? 1);

const s = createState(seed);
s.graceUntil = 0; // measure the full hazard model
for (const t of s.tiles) {
  if (t.building?.kind !== 'heart') t.building = null;
  t.terrain = 'rock';
  t.richness = 1;
}
s.tiles[idx(s, 0, 0)].terrain = 'burrow';
s.tiles[idx(s, 8, 0)].terrain = 'burrow';

// Reference layout (heart at 4,10). Ichor trunk from north, bile from west, spores from east,
// vitriol from south via a reactor fed by a ganglion split.
const plan: [number, number, Kind, Dir][] = [
  ...[3, 4, 5, 6, 7, 8, 9].map((y) => [4, y, 'conduit', 2] as [number, number, Kind, Dir]),
  [3, 3, 'tap', 1], [5, 3, 'tap', 3], [3, 4, 'tap', 1], [5, 4, 'tap', 3],
  [0, 5, 'tap', 1], [0, 6, 'tap', 1], [1, 5, 'conduit', 2], [1, 6, 'conduit', 2], [1, 7, 'digester', 2],
  [1, 8, 'conduit', 2], [1, 9, 'conduit', 2], [1, 10, 'conduit', 1], [2, 10, 'conduit', 1], [3, 10, 'conduit', 1],
  [8, 6, 'sporangium', 3], [8, 7, 'sporangium', 3], [7, 7, 'conduit', 2], [7, 8, 'conduit', 2], [7, 9, 'conduit', 2],
  [7, 10, 'conduit', 3], [6, 10, 'conduit', 3], [5, 10, 'conduit', 3],
  [8, 8, 'sporangium', 3], [7, 6, 'ward', 0] /* fed by the sporangium at 8,6 */, [2, 3, 'ward', 0],
];
const order = [...plan];

const terrainFor = (k: Kind) => (k === 'tap' ? 'vein' : k === 'sporangium' ? 'sporebed' : 'rock');
const fmt = (d: Decimal) => (d.lt(1e4) ? d.toNumber().toFixed(1) : d.toExponential(2));

let lastBuy = 0;
const rows: string[] = [];
const steps = Math.round((minutes * 60) / TICK);
for (let i = 0; i < steps; i++) {
  tick(s, TICK);
  if (s.time - lastBuy < 1) continue;
  lastBuy = s.time;
  if (Math.round(s.time) % 300 === 0 && rows.length < Math.round(s.time) / 300) {
    const heart = s.tiles[idx(s, s.heartX, s.heartY)].building!;
    rows.push(
      [
        `${(s.time / 60).toFixed(0).padStart(3)}m`,
        `E/s ${fmt(s.rate).padStart(9)}`,
        `run ${fmt(s.runEssence).padStart(9)}`,
        `heart t${heart.tier}`,
        `in [${s.intake.map((v) => v.toFixed(1)).join(', ')}]`,
        `rupt ${s.stats.run.ruptures}`,
        `kills ${s.stats.run.leechesKilled}/${s.wave}w`,
        `mutagen→${F.mutagenYield(s.runEssence, s.depth).toString()}`,
      ].join('  '),
    );
  }


  // Attentive player chores.
  for (const l of s.leeches) for (let k = 0; k < 3; k++) applyCommand(s, { t: 'strike', x: l.x, y: l.y });
  s.tiles.forEach((t, j) => {
    const x = j % s.w, y = (j / s.w) | 0;
    if (t.building && t.building.integrity < 0.5) applyCommand(s, { t: 'repair', x, y });
    if (t.rot > 0.55) applyCommand(s, { t: 'cleanse', x, y });
  });

  // Build the plan in order, rebuild anything lost.
  for (const [x, y, k, d] of order) {
    const t = s.tiles[idx(s, x, y)];
    if (t.building) continue;
    t.terrain = terrainFor(k);
    if (applyCommand(s, { t: 'build', x, y, kind: k, dir: d }).ok) continue;
    break;
  }
  if (order.some(([x, y]) => !s.tiles[idx(s, x, y)].building)) continue;

  // Heart first whenever affordable — it is the global intake governor.
  const hb = s.tiles[idx(s, s.heartX, s.heartY)].building!;
  if (s.essence.gte(F.tierCost('heart', hb.tier).mul(1.5))) applyCommand(s, { t: 'upgrade', x: s.heartX, y: s.heartY });

  // Then greedy: cheapest upgrade first.
  let best: [number, number, Decimal] | null = null;
  s.tiles.forEach((t, j) => {
    if (!t.building) return;
    const c = F.tierCost(t.building.kind, t.building.tier);
    if (!best || c.lt(best[2])) best = [j % s.w, (j / s.w) | 0, c];
  });
  // Save up: only buy small upgrades while they're cheap relative to the next Heart tier.
  const heartNext = F.tierCost('heart', hb.tier);
  if (best && (best as [number, number, Decimal])[2].lt(heartNext.mul(0.2))) applyCommand(s, { t: 'upgrade', x: best[0], y: best[1] });

}
console.log(rows.join('\n'));
void (null as unknown as SimState);
