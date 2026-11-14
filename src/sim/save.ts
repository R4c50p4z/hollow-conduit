import Decimal from 'break_eternity.js';
import type { SimState } from './types';
import { SAVE_VERSION } from './world';

/** Decimal fields are serialised as strings; everything else is plain JSON. */
export function serialize(s: SimState): string {
  // `this[k]` is the raw value; `v` has already been through Decimal#toJSON.
  return JSON.stringify(s, function (this: Record<string, unknown>, k, v) {
    const raw = this[k];
    return raw instanceof Decimal ? { $d: raw.toString() } : v;
  });
}

export function deserialize(json: string): SimState {
  const s = JSON.parse(json, (_k, v) => (v && typeof v === 'object' && '$d' in v ? new Decimal(v.$d) : v)) as SimState;
  if (s.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${s.version}`);
  return s;
}
