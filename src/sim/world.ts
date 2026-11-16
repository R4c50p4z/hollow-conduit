import Decimal from 'break_eternity.js';
import * as C from './config';
import { rand, randInt } from './rng';
import { zeroStats } from './stats';
import { emptyBuf, type Building, type Dir, type GameEvent, type Kind, type Mutations, type SimState, type Tile } from './types';

export const SAVE_VERSION = 2;

export const idx = (s: { w: number }, x: number, y: number) => y * s.w + x;
export const inBounds = (s: { w: number; h: number }, x: number, y: number) => x >= 0 && y >= 0 && x < s.w && y < s.h;
export const tileAt = (s: SimState, x: number, y: number): Tile | null => (inBounds(s, x, y) ? s.tiles[idx(s, x, y)] : null);

export function newBuilding(kind: Kind, dir: Dir, invested: Decimal = new Decimal(0), bornAt = 0): Building {
  const b: Building = {
    kind, dir, tier: 0, integrity: 1, enabled: true,
    store: emptyBuf(), out: emptyBuf(), incoming: emptyBuf(),
    progress: 0, flowEma: 0, rr: 0, invested, pressure: 0, bornAt,
  };
  if (kind === 'junction') {
    b.lanes = [emptyBuf(), emptyBuf(), emptyBuf(), emptyBuf()];
    b.lanesIn = [emptyBuf(), emptyBuf(), emptyBuf(), emptyBuf()];
  }
  return b;
}

const zeroBuilt = (): Record<Kind, number> => ({
  tap: 0, sporangium: 0, conduit: 0, router: 0, junction: 0, reservoir: 0, digester: 0, reactor: 0, cauterizer: 0, ward: 0, mender: 0, heart: 1,
});

export const zeroMutations = (): Mutations => ({ hypertrophy: 0, vascular: 0, fecundity: 0, chitin: 0, talons: 0, catalysis: 0 });

/**
 * Procedural cavern. Heart sits low-centre; burrows (leech spawns) on the top/side edges;
 * veins and spore beds are scattered at least 2 tiles from the Heart so routing is never free.
 */
function generateMap(s: SimState) {
  const { w, h } = s;
  s.tiles = Array.from({ length: w * h }, () => ({ terrain: 'rock' as const, richness: 1, rot: 0, building: null }));
  s.heartX = Math.floor(w / 2);
  s.heartY = h - 3;
  const heart = newBuilding('heart', 0);
  s.tiles[idx(s, s.heartX, s.heartY)].building = heart;

  const farFromHeart = (x: number, y: number) => Math.abs(x - s.heartX) + Math.abs(y - s.heartY) >= 3;
  const place = (terrain: Tile['terrain'], n: number, pick: () => [number, number], rich: () => number) => {
    let guard = 0;
    while (n > 0 && guard++ < 1000) {
      const [x, y] = pick();
      const t = s.tiles[idx(s, x, y)];
      if (t.terrain !== 'rock' || t.building || !farFromHeart(x, y)) continue;
      t.terrain = terrain;
      t.richness = rich();
      n--;
    }
  };

  // Burrows on edges, never the bottom row (the Heart's side of the cavern).
  place('burrow', C.GRID.burrows, () => {
    const side = randInt(s, 3);
    if (side === 0) return [randInt(s, w), 0];
    if (side === 1) return [0, randInt(s, h - 4)];
    return [w - 1, randInt(s, h - 4)];
  }, () => 1);
  place('vein', C.GRID.veins, () => [1 + randInt(s, w - 2), 1 + randInt(s, h - 2)], () => 0.6 + rand(s) * 0.9);
  place('sporebed', C.GRID.sporebeds, () => [1 + randInt(s, w - 2), 1 + randInt(s, h - 2)], () => 0.7 + rand(s) * 0.6);
}

export function createState(seed: number): SimState {
  const s: SimState = {
    version: SAVE_VERSION,
    seed, rng: seed >>> 0, time: 0,
    w: C.GRID.w, h: C.GRID.h, heartX: 0, heartY: 0,
    tiles: [], leeches: [], nextLeechId: 1,
    wave: 0, waveTimer: C.WAVE_FIRST,
    essence: new Decimal(C.START_ESSENCE),
    runEssence: new Decimal(0),
    rate: new Decimal(0),
    intake: emptyBuf(),
    built: zeroBuilt(),
    mutagen: new Decimal(0),
    mutations: zeroMutations(),
    depth: 0,
    totalEssence: new Decimal(0),
    achievements: [],
    graceUntil: C.GRACE_SECONDS,
    stats: zeroStats(),
    events: [],
  };
  generateMap(s);
  return s;
}

/** Wipe the physical world for a new run, keeping persistent progression. */
export function resetRun(s: SimState, newSeed: number) {
  s.seed = newSeed;
  s.rng = newSeed >>> 0;
  s.time = 0;
  s.leeches = [];
  s.wave = 0;
  s.waveTimer = C.WAVE_FIRST;
  s.essence = new Decimal(C.START_ESSENCE);
  s.runEssence = new Decimal(0);
  s.rate = new Decimal(0);
  s.intake = emptyBuf();
  s.built = zeroBuilt();
  s.plans = [];
  s.autoSpend = [];
  generateMap(s);
}

export function pushEvent(s: SimState, e: Omit<GameEvent, 't'>) {
  s.events.push({ t: s.time, ...e });
  if (s.events.length > 40) s.events.splice(0, s.events.length - 40);
}
