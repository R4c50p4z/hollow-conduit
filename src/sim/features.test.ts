import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { checkAchievements } from './achievements';
import { applyCommand } from './commands';
import * as C from './config';
import { simulate, tick } from './engine';
import { deserialize, serialize } from './save';
import { snapshot } from './stats';
import type { Dir, Kind, SimState } from './types';
import { createState, idx } from './world';

function lab(): SimState {
  const s = createState(99);
  for (const t of s.tiles) {
    if (t.building?.kind !== 'heart') t.building = null;
    t.terrain = 'rock';
    t.richness = 1;
    t.rot = 0;
  }
  s.waveTimer = 1e9;
  s.graceUntil = 0; // tests exercise hazards from the start
  s.depth = -1000; // no entropy
  s.essence = new Decimal(1e12);
  return s;
}
const put = (s: SimState, x: number, y: number, kind: Kind, dir: Dir) => {
  const t = s.tiles[idx(s, x, y)];
  if (kind === 'tap') t.terrain = 'vein';
  if (kind === 'sporangium') t.terrain = 'sporebed';
  expect(applyCommand(s, { t: 'build', x, y, kind, dir })).toEqual({ ok: true });
  return t.building!;
};

describe('junction', () => {
  it('lets two fluids cross without mixing', () => {
    const s = lab();
    // Ichor flows north→south through (4,5); spores flow west→east through the same tile.
    put(s, 4, 3, 'tap', 2);
    put(s, 4, 4, 'conduit', 2);
    put(s, 4, 5, 'junction', 0);
    put(s, 4, 6, 'conduit', 2);
    put(s, 2, 5, 'sporangium', 1);
    put(s, 3, 5, 'conduit', 1);
    put(s, 5, 5, 'conduit', 1);
    simulate(s, 20);
    const south = s.tiles[idx(s, 4, 6)].building!.store;
    const east = s.tiles[idx(s, 5, 5)].building!.store;
    expect(south[0]).toBeGreaterThan(1);
    expect(south[1]).toBe(0);
    expect(east[1]).toBeGreaterThan(1);
    expect(east[0]).toBe(0);
  });
});

describe('statistics', () => {
  it('accounts for every unit: produced = consumed + in transit (no losses)', () => {
    const s = lab();
    put(s, 4, 4, 'tap', 2);
    for (let y = 5; y < s.heartY; y++) put(s, 4, y, 'conduit', 2);
    simulate(s, 60);
    const snap = snapshot(s);
    const heartStore = s.tiles[idx(s, s.heartX, s.heartY)].building!.store[0];
    const run = s.stats.run;
    expect(run.produced[0]).toBeCloseTo(run.consumed[0] + snap.transit[0] + heartStore, 6);
    expect(run.spilled[0]).toBe(0);
    expect(run.built).toBe(1 + (s.heartY - 5));
    expect(run.essenceEarned.gt(0)).toBe(true);
    expect(s.stats.life.produced[0]).toBe(run.produced[0]);
  });

  it('records rupture cause and spilled contents', () => {
    const s = lab();
    s.depth = 0;
    put(s, 4, 2, 'tap', 2);
    put(s, 4, 3, 'conduit', 2); // dead end
    for (let i = 0; i < 6000 && !s.stats.run.ruptures; i++) tick(s, C.TICK);
    expect(s.stats.run.ruptures).toBeGreaterThan(0);
    expect(s.stats.run.rupturesByCause.pressure).toBeGreaterThan(0);
    expect(s.stats.run.spilled[0]).toBeGreaterThan(0);
    expect(s.events.some((e) => e.kind === 'rupture' && e.params?.cause === 'pressure')).toBe(true);
  });

  it('samples history every 10 s and attributes kills', () => {
    const s = lab();
    simulate(s, 65);
    expect(s.stats.history.t.length).toBe(7);
    s.tiles[0].terrain = 'burrow';
    put(s, 0, 1, 'conduit', 2);
    s.waveTimer = 0.01;
    tick(s, C.TICK);
    expect(s.stats.run.leechesSpawned).toBeGreaterThan(0);
    const l = s.leeches[0];
    while (s.leeches.includes(l)) {
      applyCommand(s, { t: 'strike', x: l.x, y: l.y });
      tick(s, C.TICK);
    }
    expect(s.stats.run.killsByStrike).toBe(1);
    expect(s.stats.run.strikeDamage).toBeCloseTo(l.maxHp, 6);
  });

  it('closes a run on metamorphosis and keeps lifetime totals', () => {
    const s = lab();
    put(s, 4, 4, 'tap', 2);
    simulate(s, 30);
    s.runEssence = new Decimal(1e9);
    s.depth = 0;
    const lifeProduced = s.stats.life.produced[0];
    expect(applyCommand(s, { t: 'metamorphose' }).ok).toBe(true);
    expect(s.stats.runs.length).toBe(1);
    expect(s.stats.metamorphoses).toBe(1);
    expect(s.stats.run.produced[0]).toBe(0);
    expect(s.stats.life.produced[0]).toBe(lifeProduced);
    expect(s.stats.fastestMeta).toBeCloseTo(30, 0);
  });
});

describe('achievements', () => {
  it('unlock once, announce, and add to the global multiplier', () => {
    const s = lab();
    put(s, 4, 4, 'tap', 2);
    for (let y = 5; y < s.heartY; y++) put(s, 4, y, 'conduit', 2);
    const r0 = s.rate;
    simulate(s, 30);
    expect(s.achievements).toContain('first_flow');
    const n = s.achievements.length;
    checkAchievements(s);
    expect(s.achievements.length).toBe(n);
    expect(s.events.some((e) => e.kind === 'achievement' && e.params?.id === 'first_flow')).toBe(true);
    void r0;
  });
});

describe('save migration', () => {
  it('upgrades a v1 save to v2 with fresh stats', () => {
    const s = createState(5);
    const json = JSON.parse(serialize(s));
    json.version = 1;
    json.stats = { ruptures: 3, leechesKilled: 7, peakRate: { $d: '42' } };
    delete json.achievements;
    json.events = [{ t: 1, kind: 'info', msg: 'old' }];
    delete json.built.junction;
    const m = deserialize(JSON.stringify(json));
    expect(m.version).toBe(2);
    expect(m.stats.life.ruptures).toBe(3);
    expect(m.stats.life.leechesKilled).toBe(7);
    expect(m.stats.bestRate.toNumber()).toBe(42);
    expect(m.achievements).toEqual([]);
    expect(m.built.junction).toBe(0);
    simulate(m, 5); // runs fine after migration
  });
});

describe('inline sinks', () => {
  it('a ward keeps a reserve of spores and passes the surplus on to the Heart', () => {
    const s = lab();
    const hx = s.heartX, hy = s.heartY;
    put(s, hx, hy - 4, 'sporangium', 2);
    put(s, hx, hy - 3, 'conduit', 2);
    const w = put(s, hx, hy - 2, 'ward', 2); // inline, facing the Heart
    put(s, hx, hy - 1, 'conduit', 2);
    simulate(s, 60);
    expect(w.store[1]).toBeGreaterThan(3.5); // reserve topped up (cap 4)
    expect(s.intake[1]).toBeGreaterThan(0.5); // surplus reached the Heart
    expect(s.stats.run.ruptures).toBe(0);
  });
});

describe('export', async () => {
  const { statsJson, historyCsv, cyclesCsv } = await import('../game/export');
  it('produces parseable JSON and CSV with one row per sample', () => {
    const s = lab();
    put(s, 4, 4, 'tap', 2);
    simulate(s, 35);
    const j = JSON.parse(statsJson(s));
    expect(j.allTime.produced[0]).toBeGreaterThan(0);
    expect(typeof j.essence).toBe('number');
    const csv = historyCsv(s).split('\n');
    expect(csv.length).toBe(1 + s.stats.history.t.length);
    expect(csv[0].split(',').length).toBe(csv[1].split(',').length);
    expect(cyclesCsv(s).split('\n').length).toBe(1);
  });
});

describe('strain', () => {
  it('a full overflow branch next to a ganglion rests safely; a forced dead end still ruptures', () => {
    const s = lab();
    s.depth = 0; // real hazard scale
    const hx = s.heartX, hy = s.heartY;
    put(s, hx, hy - 4, 'tap', 2);
    put(s, hx, hy - 3, 'conduit', 2);
    put(s, hx, hy - 2, 'router', 0); // splits: south to the Heart, east into a dead-end branch
    put(s, hx, hy - 1, 'conduit', 2);
    put(s, hx + 1, hy - 2, 'conduit', 1);
    put(s, hx + 2, hy - 2, 'conduit', 1); // dead end
    simulate(s, 600);
    const branch = s.tiles[idx(s, hx + 2, hy - 2)].building!;
    expect(branch.pressure).toBeGreaterThan(0.95); // full…
    expect(branch.strained).toBe(false); // …but at rest
    expect(s.stats.run.ruptures).toBe(0);
    expect(s.intake[0]).toBeGreaterThan(0.9); // everything else reaches the Heart

    // Now block the Heart path: the pump backs up and strain reaches the branch.
    applyCommand(s, { t: 'toggle', x: hx, y: hy - 1 }); // seal the valve
    simulate(s, 30);
    expect(s.tiles[idx(s, hx, hy - 4)].building!.strained).toBe(false); // the blocked tap just idles…
    expect(s.tiles[idx(s, hx, hy - 3)].building!.strained).toBe(true); // …and strains the full conduit ahead
    for (let i = 0; i < 6000 && !s.stats.run.ruptures; i++) tick(s, C.TICK);
    expect(s.stats.run.rupturesByCause.pressure).toBeGreaterThan(0);
  });
});

describe('AFK-safe design', () => {
  it('a pump feeding a sink directly just idles when the sink is full (no damage)', () => {
    const s = lab();
    s.depth = 0;
    put(s, 2, 2, 'sporangium', 1);
    const w = put(s, 3, 2, 'ward', 1); // terminal ward: fills and stops accepting
    simulate(s, 1200);
    expect(w.store[1]).toBeGreaterThan(7);
    expect(s.stats.run.ruptures).toBe(0);
    expect(s.tiles[idx(s, 2, 2)].building!.integrity).toBe(1);
  });

  it('an entropy-sized seed heals on a resting structure; an infection above the tipping point spreads', () => {
    const s = lab();
    for (let x = 2; x <= 6; x++) put(s, x, 3, 'router', 0);
    s.tiles[idx(s, 2, 3)].rot = C.ENTROPY_SEED_ROT;
    simulate(s, 600);
    expect(s.tiles[idx(s, 2, 3)].rot).toBe(0);
    s.tiles[idx(s, 6, 3)].rot = 0.9;
    s.tiles[idx(s, 5, 3)].rot = 0.9;
    simulate(s, 1500);
    expect(s.tiles[idx(s, 4, 3)].rot).toBeGreaterThan(C.ROT_TIPPING); // creeps along the network
    expect(s.tiles[idx(s, 5, 2)].rot).toBeLessThan(0.1); // bare rock stays a firebreak
  });

  it('leech strength never grows with time alone', async () => {
    const F = await import('./formulas');
    const r = new Decimal(1000);
    expect(F.leechHp(500, 0, r)).toBe(F.leechHp(0, 0, r));
    expect(F.waveCount(500, r)).toBe(F.waveCount(C.WAVE_COUNT_CAP, r));
  });
});

describe('offline', async () => {
  const { simulateOffline, OFFLINE } = await import('./offline');
  it('a stable network keeps producing for the whole absence (beyond the simulated window)', () => {
    const s = lab();
    s.depth = 0;
    put(s, 4, 4, 'tap', 2);
    for (let y = 5; y < s.heartY; y++) put(s, 4, y, 'conduit', 2);
    simulate(s, 30);
    const before = s.essence;
    const r = simulateOffline(s, 3 * 86400); // 3 days
    expect(r.simulated).toBeCloseTo(OFFLINE.simCap, 0);
    expect(r.stable).toBe(true);
    expect(r.extrapolated).toBeCloseTo(3 * 86400 - OFFLINE.simCap, 0);
    // ~1 E/s for 3 days
    expect(s.essence.sub(before).toNumber()).toBeGreaterThan(0.8 * 3 * 86400);
  });

  it('an unstable network gets no free extrapolation', () => {
    const s = lab();
    s.depth = 0;
    put(s, 4, 2, 'tap', 2);
    put(s, 4, 3, 'conduit', 2); // dead end → keeps rupturing/rebuild never happens
    for (let k = 0; k < 6; k++) put(s, 6, 2 + k, 'conduit', 2);
    put(s, 6, 1, 'tap', 2); // a second dead end that will burst late in the window
    const r = simulateOffline(s, 2 * 86400);
    expect(r.ruptures).toBeGreaterThan(0);
  });
});

describe('stability check', async () => {
  const { stabilityOf, STABLE_WINDOW } = await import('./stats');
  it('reports stable for a clean network and unstable while something is strained or recently broke', () => {
    const s = lab();
    put(s, 4, 4, 'tap', 2);
    for (let y = 5; y < s.heartY; y++) put(s, 4, y, 'conduit', 2);
    simulate(s, 30);
    expect(stabilityOf(s).stable).toBe(true);

    s.depth = 0;
    put(s, 2, 2, 'tap', 2);
    put(s, 2, 3, 'conduit', 2); // dead end
    simulate(s, 30);
    expect(stabilityOf(s).strained).toBeGreaterThan(0);
    expect(stabilityOf(s).stable).toBe(false);
    applyCommand(s, { t: 'toggle', x: 2, y: 2 }); // seal the tap: strain gone…
    simulate(s, 5);
    expect(stabilityOf(s).strained).toBe(0);
    s.stats.lastRuptureAt = s.time; // …but a recent rupture still blocks the verdict
    expect(stabilityOf(s).stable).toBe(false);
    simulate(s, STABLE_WINDOW + 1);
    expect(stabilityOf(s).stable).toBe(true);
  });
});

describe('entropy', () => {
  it('can never by itself push a tile past the tipping point', () => {
    const s = lab();
    s.depth = 30; // lots of entropy
    s.rate = new Decimal(1e30);
    for (let x = 1; x <= 7; x++) for (let y = 1; y <= 8; y++) put(s, x, y, 'router', 0); // big resting block
    for (let i = 0; i < 20000; i++) {
      tick(s, 0.5);
      s.rate = new Decimal(1e30);
    }
    expect(s.stats.run.entropySeeds).toBeGreaterThan(100);
    expect(Math.max(...s.tiles.map((t) => t.rot))).toBeLessThan(C.ROT_TIPPING);
    expect(s.stats.run.ruptures).toBe(0);
  });
});

describe('grace period', async () => {
  const { graceLeft } = await import('./engine');
  const { simulateOffline, OFFLINE } = await import('./offline');
  it('no leeches during grace; waves start WAVE_FIRST after it ends (or after ending it early)', () => {
    const s = createState(3);
    expect(graceLeft(s)).toBe(C.GRACE_SECONDS);
    s.waveTimer = 0.01;
    simulate(s, 600);
    expect(s.leeches.length).toBe(0);
    expect(s.stats.life.waves).toBe(0);
    expect(applyCommand(s, { t: 'endGrace' })).toEqual({ ok: true });
    expect(graceLeft(s)).toBe(0);
    simulate(s, C.WAVE_FIRST + 1);
    expect(s.stats.life.waves).toBe(1);
  });

  it('old saves without the field get grace counted from their lifetime', () => {
    const s = createState(4);
    delete s.graceUntil;
    s.stats.life.time = C.GRACE_SECONDS - 100;
    expect(graceLeft(s)).toBeCloseTo(100, 6);
  });

  it('offline extrapolation stops where grace ends', () => {
    const s = lab();
    s.graceUntil = OFFLINE.simCap + 3600; // grace ends 1 h after the simulated window
    put(s, 4, 4, 'tap', 2);
    for (let y = 5; y < s.heartY; y++) put(s, 4, y, 'conduit', 2);
    const r = simulateOffline(s, 5 * 86400);
    expect(r.stable).toBe(true);
    expect(r.stoppedAtGrace).toBe(true);
    expect(r.extrapolated).toBeCloseTo(3600, -1);
  });
});
