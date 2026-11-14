import Decimal from 'break_eternity.js';

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function fmt(v: Decimal | number, digits = 2): string {
  const d = v instanceof Decimal ? v : new Decimal(v);
  if (d.lt(0)) return '-' + fmt(d.neg(), digits);
  if (d.lt(1000)) {
    const n = d.toNumber();
    return n < 10 ? n.toFixed(digits === 0 ? 0 : 1) : Math.floor(n).toString();
  }
  const e = Math.floor(d.log10().toNumber());
  const tier = Math.floor(e / 3);
  if (tier < SUFFIX.length) return d.div(Decimal.pow(10, tier * 3)).toNumber().toFixed(digits) + SUFFIX[tier];
  return d.toExponential(digits).replace('+', '');
}

export const fmtTime = (s: number) => {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};
