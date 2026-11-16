import { describe, expect, it } from 'vitest';
import { tick, type SimState } from '../../sim';
import { ROT_TIPPING } from '../../sim/config';
import { DEMOS } from './demos';

/** Run a demo for `secs` sim seconds exactly as the tutorial does (incl. its scripting). */
function run(id: string, secs: number): SimState {
  const d = DEMOS[id];
  const s = d.build();
  for (let t = 0; t < secs; t += 0.1) {
    tick(s, 0.1);
    d.step?.(s);
  }
  return s;
}

describe('tutorial demos show what their text claims', () => {
  it('line / merge: ichor reaches the Heart', () => {
    expect(run('line', 20).intake[0]).toBeGreaterThan(0.8);
    expect(run('merge', 20).intake[0]).toBeGreaterThan(2.5);
  });
  it('sides: two resources through different sides, never mixed', () => {
    const s = run('sides', 30);
    expect(s.intake[0]).toBeGreaterThan(0.5);
    expect(s.intake[1]).toBeGreaterThan(0.3);
  });
  it('refine: bile reaches the Heart', () => {
    expect(run('refine', 30).intake[2]).toBeGreaterThan(0.3);
  });
  it('split: both routes carry ichor to the Heart without strain', () => {
    const s = run('split', 30);
    expect(s.intake[0]).toBeGreaterThan(0.8);
    expect(s.tiles.some((t) => t.building?.strained)).toBe(false);
  });
  it('cross: ichor and spores cross without mixing', () => {
    const s = run('cross', 30);
    expect(s.intake[0]).toBeGreaterThan(0.5);
    expect(s.intake[1]).toBeGreaterThan(0.3);
    expect(s.stats.run.ruptures).toBe(0);
  });
  it('pressure: the dead end strains and bursts within the demo loop', () => {
    const s = run('pressure', DEMOS.pressure.resetAfter);
    expect(s.stats.run.rupturesByCause.pressure).toBeGreaterThan(0);
  });
  it('rot: the infection creeps along structures and stops at the rock gap', () => {
    const s = run('rot', DEMOS.rot.resetAfter);
    const r = (x: number) => s.tiles[1 * s.w + x].rot;
    expect(r(2)).toBeGreaterThan(ROT_TIPPING);
    expect(r(5)).toBeLessThan(0.05);
  });
  it('leech: the ward keeps killing leeches and survives', () => {
    const s = run('leech', DEMOS.leech.resetAfter);
    expect(s.stats.run.leechesKilled).toBeGreaterThanOrEqual(3);
    expect(s.tiles[2].building?.kind).toBe('ward');
    expect(s.stats.run.ruptures).toBe(0);
  });
});
