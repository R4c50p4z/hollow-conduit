import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import * as C from './config';
import * as F from './formulas';
import { applyCommand } from './commands';
import { simulate, tick } from './engine';
import { deserialize, serialize } from './save';
import type { Dir, Kind, SimState } from './types';
import { createState, idx, newBuilding } from './world';

/** A blank lab: all rock, no burrows, no waves, no entropy. */
function lab(): SimState {
  const s = createState(42);
  for (const t of s.tiles) {
    if (t.building?.kind !== 'heart') t.building = null;
    t.terrain = 'rock';
    t.richness = 1;
    t.rot = 0;
  }
  s.waveTimer = 1e9;
  s.essence = new Decimal(1e12);
  return s;
}
const put = (s: SimState, x: number, y: number, kind: Kind, dir: Dir) => {
  const t = s.tiles[idx(s, x, y)];
  if (kind === 'tap') t.terrain = 'vein';
  if (kind === 'sporangium') t.terrain = 'sporebed';
  const r = applyCommand(s, { t: 'build', x, y, kind, dir });
  expect(r).toEqual({ ok: true });
  return t.building!;
};
/** Vertical line of conduits pointing south from (x, y0) to the Heart row. */
const line = (s: SimState, x: number, y0: number) => {
  for (let y = y0; y < s.heartY; y++) put(s, x, y, 'conduit', 2);
};
const noEntropy = (s: SimState) => { s.depth = -1000; }; // hazardScale → 0 so entropy never fires

describe('formulas', () => {
  it('heart synthesis is the product form, zero when starved', () => {
    expect(F.heartRate([0, 0, 0, 0], 1, new Decimal(1)).toNumber()).toBe(0);
    expect(F.heartRate([1, 0, 0, 0], 1, new Decimal(1)).toNumber()).toBeCloseTo(1);
    const mixed = F.heartRate([1, 1, 1, 1], 1, new Decimal(1)).toNumber();
    expect(mixed).toBeCloseTo(Math.pow(2, 1 + 0.5 + 1.5 + 2.2) - 1, 6);
  });
  it('heart synthesis survives values far beyond 1e308', () => {
    const r = F.heartRate([1e200, 1e200, 1e200, 1e200], 3, new Decimal(1));
    expect(r.log10().toNumber()).toBeGreaterThan(3000);
  });
  it('diversified feed beats a single line of equal volume', () => {
    const one = F.heartRate([4, 0, 0, 0], 1, new Decimal(1));
    const div = F.heartRate([2, 0, 1, 0.5], 1, new Decimal(1));
    expect(div.gt(one)).toBe(true);
  });
  it('mutagen yield is gated and grows sub-linearly', () => {
    expect(F.mutagenYield(new Decimal(C.META_THRESHOLD / 10), 0).toNumber()).toBe(0);
    expect(F.mutagenYield(new Decimal(C.META_THRESHOLD), 0).toNumber()).toBe(1);
    const a = F.mutagenYield(new Decimal(C.META_THRESHOLD * 1e6), 0).toNumber();
    expect(a).toBeGreaterThan(10);
    expect(a).toBeLessThan(1e6); // sub-linear
  });
});

describe('flow network', () => {
  it('delivers ichor from a tap to the Heart and produces essence', () => {
    const s = lab();
    noEntropy(s);
    put(s, 4, 4, 'tap', 2);
    line(s, 4, 5);
    simulate(s, 30);
    expect(s.intake[0]).toBeGreaterThan(0.9);
    expect(s.rate.toNumber()).toBeGreaterThan(0.8);
  });

  it('conserves mass in transit (nothing created or lost in conduits)', () => {
    const s = lab();
    noEntropy(s);
    const tap = put(s, 4, 1, 'tap', 2);
    for (let y = 2; y <= 6; y++) put(s, 4, y, 'conduit', 2); // dead end with 60 units of room
    simulate(s, 10);
    let total = tap.out[0];
    for (const t of s.tiles) if (t.building?.kind === 'conduit') total += t.building.store[0];
    expect(total).toBeCloseTo(F.extractionRate('tap', 0, 1, 0, s.mutations) * 10, 3);
  });

  it('back-pressure fills a dead-end line and eventually ruptures it, spawning rot', () => {
    const s = lab();
    noEntropy(s);
    s.depth = 0;
    put(s, 4, 2, 'tap', 2);
    put(s, 4, 3, 'conduit', 2);
    put(s, 4, 4, 'conduit', 2); // dead end: (4,5) is empty rock
    simulate(s, 60);
    const end = s.tiles[idx(s, 4, 4)];
    expect(end.building!.pressure).toBeGreaterThan(0.99);
    for (let i = 0; i < 4000 && !s.stats.run.ruptures; i++) tick(s, C.TICK);
    expect(s.stats.run.ruptures).toBeGreaterThan(0);
    expect(s.events.some((e) => e.kind === 'rupture')).toBe(true);
    expect(s.tiles.some((t) => t.rot > 0.3)).toBe(true);
  });

  it('conduits refuse to mix fluids', () => {
    const s = lab();
    noEntropy(s);
    put(s, 3, 4, 'tap', 1); // pushes east into (4,4)
    put(s, 5, 4, 'sporangium', 3); // pushes west into (4,4)
    put(s, 4, 4, 'conduit', 2);
    line(s, 4, 5);
    for (let i = 0; i < 200; i++) {
      tick(s, C.TICK);
      const st = s.tiles[idx(s, 4, 4)].building!.store;
      expect(st.filter((v) => v > 1e-9).length).toBeLessThanOrEqual(1);
    }
  });

  it('a digester refines ichor into bile, multiplying output', () => {
    const s = lab();
    noEntropy(s);
    for (const x of [3, 5]) { put(s, x, 1, 'tap', 2); put(s, x, 2, 'conduit', 2); put(s, x, 3, 'conduit', x === 3 ? 1 : 3); }
    put(s, 4, 3, 'conduit', 2);
    put(s, 4, 4, 'digester', 2);
    line(s, 4, 5);
    simulate(s, 60);
    expect(s.intake[2]).toBeGreaterThan(0.4);
  });

  it('a router splits flow across outputs', () => {
    const s = lab();
    noEntropy(s);
    put(s, 4, 2, 'tap', 2);
    put(s, 4, 3, 'router', 0);
    put(s, 3, 3, 'conduit', 2);
    put(s, 5, 3, 'conduit', 2);
    simulate(s, 5);
    const l = s.tiles[idx(s, 3, 3)].building!.store[0];
    const r = s.tiles[idx(s, 5, 3)].building!.store[0];
    expect(l).toBeGreaterThan(0.5);
    expect(Math.abs(l - r)).toBeLessThan(0.6);
  });
});

describe('hazards', () => {
  it('rot grows logistically and spreads to neighbours', () => {
    const s = lab();
    noEntropy(s);
    for (let y = 3; y <= 5; y++) for (let x = 4; x <= 6; x++) put(s, x, y, 'router', 0); // inert structure block
    s.tiles[idx(s, 5, 4)].rot = 0.3;
    simulate(s, 400);
    expect(s.tiles[idx(s, 5, 4)].rot).toBeGreaterThan(0.4);
    expect(s.tiles[idx(s, 5, 5)].rot).toBeGreaterThan(0.1); // spreads along the structure
    expect(s.tiles[idx(s, 3, 4)].rot).toBeLessThan(0.05); // bare rock acts as a firebreak
  });

  it('cauterizer burns bile to scour rot', () => {
    const s = lab();
    noEntropy(s);
    const c = put(s, 4, 4, 'cauterizer', 0);
    s.tiles[idx(s, 5, 5)].rot = 0.6;
    c.store[2] = 4;
    simulate(s, 15);
    expect(s.tiles[idx(s, 5, 5)].rot).toBeLessThan(0.2);
    expect(c.store[2]).toBeLessThan(4);
  });

  it('leeches hunt structures; strikes and wards kill them', () => {
    const s = lab();
    noEntropy(s);
    s.depth = 0;
    s.tiles[idx(s, 0, 0)].terrain = 'burrow';
    put(s, 2, 2, 'conduit', 2);
    s.waveTimer = 0.01;
    tick(s, C.TICK);
    expect(s.leeches.length).toBeGreaterThan(0);
    simulate(s, 15);
    const l = s.leeches[0];
    expect([l.x, l.y]).toEqual([2, 2]);
    while (s.leeches.length) applyCommand(s, { t: 'strike', x: 2, y: 2 }), tick(s, C.TICK);
    expect(s.stats.run.leechesKilled).toBeGreaterThan(0);

    const w = put(s, 3, 3, 'ward', 0);
    w.store[1] = 4;
    s.waveTimer = 0.01;
    simulate(s, 40);
    expect(s.leeches.length).toBe(0);
  });
});

describe('meta', () => {
  it('metamorphosis converts run essence to mutagen and resets the grid', () => {
    const s = lab();
    s.runEssence = new Decimal(1e12);
    put(s, 2, 2, 'conduit', 0);
    expect(applyCommand(s, { t: 'metamorphose' })).toEqual({ ok: true });
    expect(s.mutagen.toNumber()).toBe(F.mutagenYield(new Decimal(1e12), 0).toNumber());
    expect(s.depth).toBe(1);
    expect(s.tiles.filter((t) => t.building).length).toBe(1);
    expect(applyCommand(s, { t: 'mutate', id: 'hypertrophy' })).toEqual({ ok: true });
    expect(F.heartAlpha(s.mutations)).toBeCloseTo(1.05);
  });

  it('is deterministic and survives a save/load round trip', () => {
    const play = (s: SimState) => {
      const veins = s.tiles.map((t, i) => [t, i] as const).filter(([t]) => t.terrain === 'vein');
      for (const [, i] of veins) applyCommand(s, { t: 'build', x: i % s.w, y: (i / s.w) | 0, kind: 'tap', dir: 2 });
      simulate(s, 120);
    };
    const a = createState(7), b = createState(7);
    play(a); play(b);
    expect(serialize(a)).toBe(serialize(b));
    const c = deserialize(serialize(a));
    simulate(a, 300);
    simulate(c, 300);
    expect(serialize(c)).toBe(serialize(a));
    expect(c.essence instanceof Decimal).toBe(true);
  });

  it('newBuilding starts healthy', () => {
    expect(newBuilding('conduit', 0).integrity).toBe(1);
  });
});
