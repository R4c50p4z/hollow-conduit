import type { SimState } from '../../sim';

/**
 * Assisted routing for conduits (Mindustry-style line placement): cheapest 4-neighbour path from
 * `from` to `to` over free rock. Costs: step 1, turn +8, vein/spore bed 12 (keep them free for
 * producers); occupied tiles, burrows and rotten tiles are walls — except `to` itself, which may be
 * a structure we want to connect into. Returns the tiles after `from`, or null if unreachable.
 */
export function routePath(s: SimState, from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] | null {
  const W = s.w, H = s.h, N = W * H;
  const goal = to.y * W + to.x;
  const cost = new Float64Array(N * 4).fill(Infinity);
  const prev = new Int32Array(N * 4).fill(-1);
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const passable = (i: number) => {
    if (i === goal) return true;
    const t = s.tiles[i];
    return !t.building && t.terrain !== 'burrow' && t.rot < 0.5;
  };
  const tileCost = (i: number) => (s.tiles[i].terrain === 'vein' || s.tiles[i].terrain === 'sporebed' ? 12 : 1);
  // Dijkstra over (tile, heading); tiny grid, so a simple array-scan frontier is plenty.
  const start = from.y * W + from.x;
  const open: number[] = [];
  for (let d = 0; d < 4; d++) {
    cost[start * 4 + d] = 0;
    open.push(start * 4 + d);
  }
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (cost[open[k]] < cost[open[bi]]) bi = k;
    const cur = open.splice(bi, 1)[0];
    const i = cur >> 2, h = cur & 3;
    if (i === goal) {
      const out: { x: number; y: number }[] = [];
      for (let c = cur; c !== -1 && c >> 2 !== start; c = prev[c]) out.push({ x: (c >> 2) % W, y: ((c >> 2) / W) | 0 });
      return out.reverse();
    }
    const x = i % W, y = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (!passable(ni)) continue;
      const nc = cost[cur] + tileCost(ni) + (i !== start && d !== h ? 8 : 0);
      const key = ni * 4 + d;
      if (nc < cost[key]) {
        cost[key] = nc;
        prev[key] = cur;
        open.push(key);
      }
    }
  }
  return null;
}
