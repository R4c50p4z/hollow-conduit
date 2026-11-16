import Decimal from 'break_eternity.js';
import { zeroStats } from './stats';
import { ALL_KINDS, type SimState } from './types';
import { SAVE_VERSION } from './world';

/** Decimal fields are serialised as {$d: string}; everything else is plain JSON. */
export function serialize(s: SimState): string {
  // `this[k]` is the raw value; `v` has already been through Decimal#toJSON.
  return JSON.stringify(s, function (this: Record<string, unknown>, k, v) {
    const raw = this[k];
    return raw instanceof Decimal ? { $d: raw.toString() } : v;
  });
}

export function deserialize(json: string): SimState {
  const s = JSON.parse(json, (_k, v) => (v && typeof v === 'object' && '$d' in v ? new Decimal(v.$d) : v)) as SimState;
  const m = migrate(s);
  // Structures added after a save was made start at 0 built.
  for (const k of ALL_KINDS) (m.built as Record<string, number>)[k] ??= 0;
  return m;
}

/** Bring older saves up to the current shape. Each step is idempotent. */
export function migrate(s: SimState): SimState {
  const v = s.version ?? 1;
  if (v > SAVE_VERSION) throw new Error(`Save from a newer version (${v})`);
  if (v < 2) {
    // v1 → v2: full statistics, achievements, coded events, junctions.
    const old = s.stats as unknown as { ruptures?: number; leechesKilled?: number; peakRate?: Decimal };
    const st = zeroStats();
    st.run.ruptures = st.life.ruptures = old?.ruptures ?? 0;
    st.run.leechesKilled = st.life.leechesKilled = old?.leechesKilled ?? 0;
    if (old?.peakRate) st.peakRate = st.bestRate = old.peakRate;
    s.stats = st;
    s.achievements = [];
    s.events = [];
    (s.built as Record<string, number>).junction ??= 0;
    s.version = 2;
  }
  return s;
}
