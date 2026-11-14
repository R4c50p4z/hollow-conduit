import Decimal from 'break_eternity.js';
import { useUI } from '../game/store';

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Localised decimal separator (Spanish uses a comma). */
const loc = (s: string) => (useUI.getState().lang === 'es' ? s.replace('.', ',') : s);

/** Format a quantity: plain below 1000, then suffixes or scientific per the player's setting. */
export function fmt(v: Decimal | number, digits = 2): string {
  const d = v instanceof Decimal ? v : new Decimal(v);
  if (d.lt(0)) return '-' + fmt(d.neg(), digits);
  if (!Number.isFinite(d.mag) && d.layer === 0) return '∞';
  if (d.lt(1000)) {
    const n = d.toNumber();
    return loc(n < 10 ? n.toFixed(digits === 0 ? 0 : 1) : Math.floor(n).toString());
  }
  const e = Math.floor(d.log10().toNumber());
  const tier = Math.floor(e / 3);
  if (useUI.getState().notation === 'suffix' && tier < SUFFIX.length)
    return loc(d.div(Decimal.pow(10, tier * 3)).toNumber().toFixed(digits)) + SUFFIX[tier];
  if (d.layer === 0 || e < 1e15) {
    const mant = d.div(Decimal.pow(10, e)).toNumber();
    return loc(mant.toFixed(digits)) + 'e' + e;
  }
  return d.toString();
}

/** Plain number with fixed decimals, localised. */
export const num = (n: number, digits = 1) => loc(n.toFixed(digits));
export const pct = (f: number, digits = 0) => loc((f * 100).toFixed(digits)) + '%';
/** Thousands-grouped integer. */
export const int = (n: number) => Math.round(n).toLocaleString(useUI.getState().lang === 'es' ? 'es-ES' : 'en-US');

export const fmtTime = (s: number) => {
  s = Math.max(0, Math.ceil(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

/** Long durations: "3 h 12 min", "4 d 2 h". */
export const fmtDuration = (s: number) => {
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
};
