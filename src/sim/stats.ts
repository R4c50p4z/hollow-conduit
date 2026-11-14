import Decimal from 'break_eternity.js';
import * as C from './config';
import * as F from './formulas';
import { ALL_KINDS, emptyBuf, type Counters, type History, type Kind, type RunSummary, type SimState, type Stats } from './types';

/**
 * Statistics. Counters are additive and updated from the engine/commands through the
 * `count*` helpers, which write to both the current cycle and the lifetime totals.
 * `snapshot()` derives live network metrics on demand (never stored).
 */

export const zeroCounters = (): Counters => ({
  time: 0,
  produced: emptyBuf(),
  consumed: emptyBuf(),
  refinedIn: emptyBuf(),
  burned: emptyBuf(),
  drained: emptyBuf(),
  spilled: emptyBuf(),
  crafts: { digester: 0, reactor: 0 },
  essenceEarned: new Decimal(0),
  spentBuild: new Decimal(0),
  spentUpgrade: new Decimal(0),
  spentRepair: new Decimal(0),
  spentCleanse: new Decimal(0),
  refunded: new Decimal(0),
  heartLeeched: new Decimal(0),
  built: 0,
  builtByKind: {},
  razed: 0,
  upgrades: 0,
  repairs: 0,
  vents: 0,
  cleanses: 0,
  seals: 0,
  rotations: 0,
  ruptures: 0,
  rupturesByKind: {},
  rupturesByCause: { pressure: 0, rot: 0, leech: 0 },
  waves: 0,
  leechesSpawned: 0,
  leechesKilled: 0,
  killsByStrike: 0,
  killsByWard: 0,
  leechesSated: 0,
  strikes: 0,
  strikeDamage: 0,
  wardDamage: 0,
  rotCleansed: 0,
  rotScoured: 0,
  rotFlushed: 0,
  entropySeeds: 0,
  overpressureSeconds: 0,
  rotTileSeconds: 0,
});

export const HISTORY_EVERY = 10; // s
export const HISTORY_CAP = 360; // 1 h of samples

export const zeroHistory = (): History => ({
  every: HISTORY_EVERY,
  next: 0,
  t: [],
  rateLog: [],
  essenceLog: [],
  intake: [[], [], [], []],
  rot: [],
  pressure: [],
  integrity: [],
  leeches: [],
  structures: [],
});

export const zeroStats = (): Stats => ({
  run: zeroCounters(),
  life: zeroCounters(),
  peakRate: new Decimal(0),
  peakEssence: new Decimal(0),
  peakIntake: emptyBuf(),
  peakLeeches: 0,
  bestRate: new Decimal(0),
  metamorphoses: 0,
  mutagenEarned: new Decimal(0),
  fastestMeta: null,
  longestRun: 0,
  offlineSeconds: 0,
  sessions: 0,
  history: zeroHistory(),
  runs: [],
});

type NumKey = { [K in keyof Counters]: Counters[K] extends number ? K : never }[keyof Counters];
type BufKey = { [K in keyof Counters]: Counters[K] extends number[] ? K : never }[keyof Counters];
type DecKey = { [K in keyof Counters]: Counters[K] extends Decimal ? K : never }[keyof Counters];

export function count(s: SimState, k: NumKey, v = 1) {
  s.stats.run[k] += v;
  s.stats.life[k] += v;
}
export function countRes(s: SimState, k: BufKey, r: number, v: number) {
  s.stats.run[k][r] += v;
  s.stats.life[k][r] += v;
}
export function countE(s: SimState, k: DecKey, v: Decimal) {
  s.stats.run[k] = s.stats.run[k].add(v);
  s.stats.life[k] = s.stats.life[k].add(v);
}
export function countKind(s: SimState, k: 'builtByKind' | 'rupturesByKind', kind: Kind) {
  s.stats.run[k][kind] = (s.stats.run[k][kind] ?? 0) + 1;
  s.stats.life[k][kind] = (s.stats.life[k][kind] ?? 0) + 1;
}

const log10 = (d: Decimal) => (d.lte(0) ? 0 : d.log10().toNumber());

/** Per-tick bookkeeping that isn't tied to a single event. */
export function tickStats(s: SimState, dt: number) {
  const st = s.stats;
  count(s, 'time', dt);
  if (s.rate.gt(st.peakRate)) st.peakRate = s.rate;
  if (s.rate.gt(st.bestRate)) st.bestRate = s.rate;
  if (s.essence.gt(st.peakEssence)) st.peakEssence = s.essence;
  for (let r = 0; r < 4; r++) if (s.intake[r] > st.peakIntake[r]) st.peakIntake[r] = s.intake[r];
  if (s.leeches.length > st.peakLeeches) st.peakLeeches = s.leeches.length;

  if (s.time >= st.history.next) {
    sampleHistory(s);
    st.history.next = s.time + st.history.every;
  }
}

function sampleHistory(s: SimState) {
  const h = s.stats.history;
  const snap = snapshot(s);
  const push = (a: number[], v: number) => {
    a.push(Math.round(v * 1000) / 1000);
    if (a.length > HISTORY_CAP) a.shift();
  };
  push(h.t, s.time);
  push(h.rateLog, log10(s.rate.add(1)));
  push(h.essenceLog, log10(s.essence.add(1)));
  for (let r = 0; r < 4; r++) push(h.intake[r], s.intake[r]);
  push(h.rot, snap.rotAvg);
  push(h.pressure, snap.pressureAvg);
  push(h.integrity, snap.integrityAvg);
  push(h.leeches, s.leeches.length);
  push(h.structures, snap.structures);
}

/** Record the finished cycle and reset per-run stats. Called by Metamorphosis. */
export function closeRun(s: SimState, mutagen: Decimal) {
  const st = s.stats;
  const summary: RunSummary = {
    depth: s.depth,
    duration: s.time,
    peakRateLog: log10(st.peakRate.add(1)),
    essenceLog: log10(s.runEssence.add(1)),
    mutagen: mutagen.toNumber(),
    ruptures: st.run.ruptures,
    kills: st.run.leechesKilled,
    waves: st.run.waves,
    endedAt: st.life.time,
  };
  st.runs.push(summary);
  if (st.runs.length > 100) st.runs.shift();
  st.metamorphoses++;
  st.mutagenEarned = st.mutagenEarned.add(mutagen);
  if (st.fastestMeta === null || s.time < st.fastestMeta) st.fastestMeta = s.time;
  if (s.time > st.longestRun) st.longestRun = s.time;
  st.run = zeroCounters();
  st.peakRate = new Decimal(0);
  st.peakEssence = new Decimal(0);
  st.peakIntake = emptyBuf();
  st.peakLeeches = 0;
  st.lastRuptureAt = undefined;
  st.lastSatedAt = undefined;
  st.history = zeroHistory();
}

// --- Live snapshot ----------------------------------------------------------------------------

export interface Snapshot {
  structures: number;
  byKind: Record<Kind, number>;
  tiersByKind: Record<Kind, number>; // sum of tiers
  maxTier: number;
  sealed: number;
  flowing: number;
  stagnant: number;
  pressured: number; // under strain (full and forced by a blocked pump)
  pressureAvg: number;
  pressureMax: number;
  integrityAvg: number;
  integrityMin: number;
  cracked: number; // integrity < 0.5
  rotAvg: number;
  rotMax: number;
  rotTiles: number; // rot > 0.05
  rotHeavy: number; // rot > 0.5
  rotOnStructures: number;
  invested: Decimal;
  transit: number[]; // resource units sitting in the network
  conduitCapacity: number; // total units/s of conduit throughput
  extraction: number[]; // theoretical units/s from taps/sporangia
  heartCap: number;
  heartShare: number[]; // fraction of log10(E) contributed by each resource
  heartFactor: number[]; // (1+x)^(wα)
  heartUtil: number[]; // intake / cap
  alpha: number;
  mult: Decimal;
  bottlenecks: { x: number; y: number; kind: Kind; pressure: number; integrity: number }[];
  leechHpTotal: number;
  nextLeechHp: number;
  nextWaveCount: number;
  entropyPerMin: number;
  mutagenIfNow: Decimal;
  /** AFK readiness: every check must pass for the network to be left alone safely. */
  stability: { strained: number; infected: number; sinceRupture: number; sinceSated: number; stable: boolean };
  veinsUsed: number;
  veinsTotal: number;
  bedsUsed: number;
  bedsTotal: number;
}

export function snapshot(s: SimState): Snapshot {
  const byKind = Object.fromEntries(ALL_KINDS.map((k) => [k, 0])) as Record<Kind, number>;
  const tiersByKind = Object.fromEntries(ALL_KINDS.map((k) => [k, 0])) as Record<Kind, number>;
  let structures = 0, sealed = 0, flowing = 0, stagnant = 0, pressured = 0;
  let pSum = 0, pN = 0, pMax = 0, iSum = 0, iMin = 1, cracked = 0, maxTier = 0;
  let rotSum = 0, rotMax = 0, rotTiles = 0, rotHeavy = 0, rotOnStructures = 0;
  let invested = new Decimal(0);
  const transit = [0, 0, 0, 0];
  const extraction = [0, 0, 0, 0];
  let conduitCapacity = 0;
  const bottlenecks: Snapshot['bottlenecks'] = [];
  let veinsUsed = 0, veinsTotal = 0, bedsUsed = 0, bedsTotal = 0;
  const m = s.mutations;

  s.tiles.forEach((t, i) => {
    rotSum += t.rot;
    if (t.rot > rotMax) rotMax = t.rot;
    if (t.rot > 0.05) rotTiles++;
    if (t.rot > 0.5) rotHeavy++;
    if (t.terrain === 'vein') { veinsTotal++; if (t.building) veinsUsed++; }
    if (t.terrain === 'sporebed') { bedsTotal++; if (t.building) bedsUsed++; }
    const b = t.building;
    if (!b) return;
    byKind[b.kind]++;
    tiersByKind[b.kind] += b.tier;
    if (b.tier > maxTier) maxTier = b.tier;
    if (b.kind === 'heart') return;
    structures++;
    if (t.rot > 0.05) rotOnStructures++;
    invested = invested.add(b.invested);
    if (!b.enabled) sealed++;
    const flows = b.enabled && !b.strained && b.flowEma > C.FLOW_HEALTHY;
    if (flows) flowing++; else stagnant++;
    if (b.strained) pressured++;
    iSum += b.integrity;
    if (b.integrity < iMin) iMin = b.integrity;
    if (b.integrity < 0.5) cracked++;
    for (let r = 0; r < 4; r++) transit[r] += b.store[r] + b.out[r];
    if (b.lanes) for (const l of b.lanes) for (let r = 0; r < 4; r++) transit[r] += l[r];
    if (b.kind === 'conduit' || b.kind === 'router' || b.kind === 'junction' || b.kind === 'tap' || b.kind === 'sporangium' || b.kind === 'digester' || b.kind === 'reactor') {
      pSum += b.pressure;
      pN++;
      if (b.pressure > pMax) pMax = b.pressure;
      if (b.strained) bottlenecks.push({ x: i % s.w, y: (i / s.w) | 0, kind: b.kind, pressure: b.pressure, integrity: b.integrity });
    }
    if (b.kind === 'conduit' || b.kind === 'router' || b.kind === 'junction') conduitCapacity += F.conduitThroughput(b.kind === 'router' ? 'router' : 'conduit', b.tier, t.rot, m);
    if (b.enabled && (b.kind === 'tap' || b.kind === 'sporangium')) extraction[b.kind === 'tap' ? 0 : 1] += F.extractionRate(b.kind, b.tier, t.richness, t.rot, m);
  });

  bottlenecks.sort((a, b) => b.pressure - a.pressure || a.integrity - b.integrity);

  const heart = s.tiles[s.heartY * s.w + s.heartX].building!;
  const heartCap = F.heartIntakeCap(heart.tier);
  const alpha = F.heartAlpha(m);
  const logs = s.intake.map((x, r) => C.HEART_WEIGHTS[r] * alpha * Math.log10(1 + x));
  const total = logs.reduce((a, b) => a + b, 0);

  return {
    structures,
    byKind,
    tiersByKind,
    maxTier,
    sealed,
    flowing,
    stagnant,
    pressured,
    pressureAvg: pN ? pSum / pN : 0,
    pressureMax: pMax,
    integrityAvg: structures ? iSum / structures : 1,
    integrityMin: structures ? iMin : 1,
    cracked,
    rotAvg: rotSum / s.tiles.length,
    rotMax,
    rotTiles,
    rotHeavy,
    rotOnStructures,
    invested,
    transit,
    conduitCapacity,
    extraction,
    heartCap,
    heartShare: logs.map((l) => (total > 0 ? l / total : 0)),
    heartFactor: logs.map((l) => Math.pow(10, l)),
    heartUtil: s.intake.map((x) => x / heartCap),
    alpha,
    mult: F.globalMult(s.mutagen, s.achievements.length),
    bottlenecks: bottlenecks.slice(0, 5),
    leechHpTotal: s.leeches.reduce((a, l) => a + Math.max(0, l.hp), 0),
    nextLeechHp: F.leechHp(s.wave, s.depth, s.rate),
    nextWaveCount: F.waveCount(s.wave, s.rate),
    entropyPerMin: F.entropyChance(s.rate, s.depth) * 60,
    mutagenIfNow: F.mutagenYield(s.runEssence, s.depth),
    stability: stabilityOf(s),
    veinsUsed,
    veinsTotal,
    bedsUsed,
    bedsTotal,
  };
}

export const STABLE_WINDOW = 600; // s without ruptures or sated leeches

/** Is this network safe to leave alone? Cheap enough to call every UI frame. */
export function stabilityOf(s: SimState) {
  let strained = 0, infected = 0;
  for (const t of s.tiles) {
    if (!t.building) continue;
    if (t.building.strained) strained++;
    if (t.rot > C.ROT_TIPPING) infected++;
  }
  const since = (at?: number) => (at === undefined ? Infinity : Math.max(0, s.time - at));
  const sinceRupture = since(s.stats.lastRuptureAt);
  const sinceSated = since(s.stats.lastSatedAt);
  const stable = strained === 0 && infected === 0 && sinceRupture >= STABLE_WINDOW && sinceSated >= STABLE_WINDOW;
  return { strained, infected, sinceRupture, sinceSated, stable };
}
