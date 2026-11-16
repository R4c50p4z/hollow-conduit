import { describe, expect, it } from 'vitest';
import { createState, Formulas as F } from '../../sim';
import { zeroMutations } from '../../sim/world';
import { routePath } from './path';
import { toolInfo } from './toolInfo';

describe('tool info matches the formulas', () => {
  const m = zeroMutations();
  it('extraction, throughput and recipes', () => {
    expect(toolInfo('tap', m).rate).toBe(F.extractionRate('tap', 0, 1, 0, m));
    expect(toolInfo('conduit', m).thr).toBe(F.conduitThroughput('conduit', 0, 0, m));
    expect(toolInfo('reservoir', m).cap).toBe(48);
    const d = toolInfo('digester', m);
    expect(d.inIchor).toBeCloseTo(1, 9);
    expect(d.outBile).toBeCloseTo(0.5, 9);
    expect(d.wombBile).toBeCloseTo(0.25, 9); // the 2:1 surplus the hint warns about
    const r = toolInfo('reactor', m);
    expect([r.inBile, r.inSpore, r.outVit]).toEqual([0.25, 0.5, 0.25]);
  });
});

describe('assisted routing', () => {
  const blank = () => {
    const s = createState(1);
    for (const t of s.tiles) { if (t.building?.kind !== 'heart') t.building = null; t.terrain = 'rock'; t.rot = 0; }
    return s;
  };
  it('prefers straight lines with a single bend', () => {
    const s = blank();
    const p = routePath(s, { x: 0, y: 0 }, { x: 3, y: 3 })!;
    expect(p.length).toBe(6);
    let turns = 0;
    const all = [{ x: 0, y: 0 }, ...p];
    for (let k = 2; k < all.length; k++) {
      const a = [all[k - 1].x - all[k - 2].x, all[k - 1].y - all[k - 2].y], b = [all[k].x - all[k - 1].x, all[k].y - all[k - 1].y];
      if (a[0] !== b[0] || a[1] !== b[1]) turns++;
    }
    expect(turns).toBe(1);
  });
  it('goes around obstacles and may end on a structure', () => {
    const s = blank();
    s.tiles[1 * s.w + 1].terrain = 'burrow';
    s.tiles[1 * s.w + 2].building = { kind: 'conduit' } as never;
    const p = routePath(s, { x: 0, y: 1 }, { x: 3, y: 1 })!;
    expect(p.at(-1)).toEqual({ x: 3, y: 1 });
    expect(p.some((q) => q.x === 1 && q.y === 1)).toBe(false);
    expect(routePath(s, { x: 0, y: 1 }, { x: 2, y: 1 })!.at(-1)).toEqual({ x: 2, y: 1 });
  });
  it('returns null when walled in', () => {
    const s = blank();
    s.tiles[1].terrain = 'burrow';
    s.tiles[s.w].terrain = 'burrow';
    expect(routePath(s, { x: 0, y: 0 }, { x: 5, y: 5 })).toBeNull();
  });
});
