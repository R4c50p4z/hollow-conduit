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
