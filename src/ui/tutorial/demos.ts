import Decimal from 'break_eternity.js';
import { applyCommand, createState, spawnWave, type Dir, type Kind, type SimState } from '../../sim';
import { newBuilding } from '../../sim/world';

/**
 * Tiny scripted caverns for the in-game tutorial. They run the real simulation, so what the
 * player sees is exactly how the game behaves. Each demo restarts every `resetAfter` sim-seconds
 * (or when `done` says so) so it is always mid-illustration.
 */
export interface Demo {
  build: () => SimState;
  speed: number; // sim seconds per real second
  resetAfter: number; // sim seconds
  /** Optional per-frame scripting (e.g. keep leeches coming). */
  step?: (s: SimState) => void;
  done?: (s: SimState) => boolean;
}

function blank(w: number, h: number, hx: number, hy: number, seed = 7): SimState {
  const s = createState(seed);
  s.w = w;
  s.h = h;
  s.tiles = Array.from({ length: w * h }, () => ({ terrain: 'rock' as const, richness: 1, rot: 0, building: null }));
  s.heartX = hx;
  s.heartY = hy;
  s.tiles[hy * w + hx].building = newBuilding('heart', 0);
  s.essence = new Decimal(1e12);
  s.waveTimer = 1e9;
  s.graceUntil = 0;
  s.depth = -1000; // no entropy noise in demos unless asked for
  return s;
}

type P = [number, number, Kind, Dir];
function place(s: SimState, list: P[]) {
  for (const [x, y, kind, dir] of list) {
    const t = s.tiles[y * s.w + x];
    if (kind === 'tap') t.terrain = 'vein';
    if (kind === 'sporangium') t.terrain = 'sporebed';
    applyCommand(s, { t: 'build', x, y, kind, dir });
  }
  return s;
}

const E: Dir = 1, S: Dir = 2, W: Dir = 3, N: Dir = 0;

export const DEMOS: Record<string, Demo> = {
  // A tap bleeding ichor down a conduit into the Heart.
  line: {
    build: () => place(blank(6, 3, 5, 1), [[0, 1, 'tap', E], [1, 1, 'conduit', E], [2, 1, 'conduit', E], [3, 1, 'conduit', E], [4, 1, 'conduit', E]]),
    speed: 1.5,
    resetAfter: 40,
  },
  // Several taps joining one line from the sides.
  merge: {
    build: () =>
      place(blank(6, 3, 5, 1), [
        [0, 1, 'tap', E], [1, 0, 'tap', S], [2, 2, 'tap', N],
        [1, 1, 'conduit', E], [2, 1, 'conduit', E], [3, 1, 'conduit', E], [4, 1, 'conduit', E],
      ]),
    speed: 1.5,
    resetAfter: 40,
  },
  // One fluid per conduit: ichor from the west, spores from the north.
  sides: {
    build: () =>
      place(blank(5, 4, 2, 3), [
        [0, 3, 'tap', E], [1, 3, 'conduit', E],
        [2, 0, 'sporangium', S], [2, 1, 'conduit', S], [2, 2, 'conduit', S],
        [4, 1, 'tap', S], [4, 2, 'conduit', S], [4, 3, 'conduit', W], [3, 3, 'conduit', W],
      ]),
    speed: 1.5,
    resetAfter: 50,
  },
  // Ichor → Digester → bile into the Heart.
  refine: {
    build: () => place(blank(6, 3, 5, 1), [[0, 1, 'tap', E], [1, 1, 'conduit', E], [2, 1, 'digester', E], [3, 1, 'conduit', E], [4, 1, 'conduit', E]]),
    speed: 2,
    resetAfter: 50,
  },
  // A ganglion splitting one line into two routes to the Heart.
  split: {
    build: () =>
      place(blank(5, 5, 4, 2), [
        [0, 2, 'tap', E], [1, 2, 'conduit', E], [2, 2, 'router', N], [3, 2, 'conduit', E],
        [2, 3, 'conduit', S], [2, 4, 'conduit', E], [3, 4, 'conduit', E], [4, 4, 'conduit', N], [4, 3, 'conduit', N],
      ]),
    speed: 1.5,
    resetAfter: 50,
  },
  // A junction: ichor crosses spores without mixing.
  cross: {
    build: () =>
      place(blank(5, 5, 2, 4), [
        [2, 0, 'tap', S], [2, 1, 'conduit', S], [2, 2, 'junction', N], [2, 3, 'conduit', S],
        [0, 2, 'sporangium', E], [1, 2, 'conduit', E], [3, 2, 'conduit', S], [3, 3, 'conduit', S], [3, 4, 'conduit', W],
      ]),
    speed: 1.5,
    resetAfter: 50,
  },
  // A dead end: the line fills, strain builds, it cracks and bursts.
  pressure: {
    build: () => {
      const s = place(blank(5, 3, 4, 2), [[0, 1, 'tap', E], [1, 1, 'conduit', E], [2, 1, 'conduit', E], [3, 1, 'conduit', E]]);
      s.depth = 0;
      for (const t of s.tiles) if (t.building && t.building.kind === 'conduit') t.building.integrity = 0.45;
      return s;
    },
    speed: 5,
    resetAfter: 160,
    done: (s) => s.stats.run.ruptures > 0 && s.time > 8 + (s.stats.lastRuptureAt ?? 0),
  },
  // An infection creeping along resting structures, stopped by a gap of bare rock.
  rot: {
    build: () => {
      const s = place(blank(7, 3, 6, 2), [
        [0, 1, 'router', N], [1, 1, 'router', N], [2, 1, 'router', N], [3, 1, 'router', N], [5, 1, 'router', N], [6, 1, 'router', N],
      ]);
      s.tiles[1 * 7 + 0].rot = 0.95;
      s.tiles[1 * 7 + 1].rot = 0.9;
      return s;
    },
    speed: 40,
    resetAfter: 2400,
  },
  // A ward next to a burrow, fed by a sporangium, impaling every leech that crawls out.
  leech: {
    build: () => {
      const s = place(blank(6, 3, 5, 2), [[3, 0, 'sporangium', W], [2, 0, 'ward', W]]);
      s.tiles[0].terrain = 'burrow';
      s.depth = 0;
      s.wave = 6;
      const ward = s.tiles[2].building!;
      ward.store[1] = 4;
      return s;
    },
    speed: 1.5,
    resetAfter: 120,
    step: (s) => {
      if (!s.leeches.length && s.time % 12 < 0.2) spawnWave(s);
    },
  },
};
