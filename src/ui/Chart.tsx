import { useState } from 'react';
import { fmtTime } from './format';
import { CHART_INK } from './palette';

interface Props {
  title: string;
  xs: number[];
  ys: number[];
  color?: string;
  fmtY: (v: number) => string;
  yMin?: number;
  yMax?: number;
  /** X-axis / tooltip label formatter (defaults to time). */
  fmtX?: (x: number) => string;
}

const W = 340, H = 128, PL = 40, PR = 8, PT = 8, PB = 20;

/**
 * Single-series line chart (one axis, 2px line, recessive grid) with a crosshair + tooltip
 * on hover/touch. Multi-series data is shown as small multiples of this, never overlaid.
 */
export function LineChart({ title, xs, ys, color = CHART_INK, fmtY, yMin, yMax, fmtX = fmtTime }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  if (xs.length < 2) return null;
  let lo = yMin ?? Math.min(...ys);
  let hi = yMax ?? Math.max(...ys);
  if (hi - lo < 1e-9) { hi = lo + 1; if (yMin === undefined) lo = Math.max(0, lo - 1); }
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const sx = (x: number) => PL + ((x - x0) / Math.max(1e-9, x1 - x0)) * (W - PL - PR);
  const sy = (y: number) => PT + (1 - (y - lo) / (hi - lo)) * (H - PT - PB);
  const d = xs.map((x, i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join('');
  const grid = [lo, (lo + hi) / 2, hi];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const tx = x0 + ((px - PL) / (W - PL - PR)) * (x1 - x0);
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - tx) < Math.abs(xs[best] - tx)) best = i;
    setHover(best);
  };

  const hx = hover !== null ? sx(xs[hover]) : 0;
  const hy = hover !== null ? sy(ys[hover]) : 0;
  const tipRight = hx > W / 2;
  // Keep the tooltip off the line: put it in the half of the plot away from the point.
  const tipY = hy < (PT + H - PB) / 2 ? H - PB - 34 : PT + 2;

  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={sy(g)} y2={sy(g)} className="grid" />
            <text x={PL - 4} y={sy(g) + 3} className="axis" textAnchor="end">
              {fmtY(g)}
            </text>
          </g>
        ))}
        <text x={PL} y={H - 4} className="axis">
          {fmtX(x0)}
        </text>
        <text x={W - PR} y={H - 4} className="axis" textAnchor="end">
          {fmtX(x1)}
        </text>
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={hx} x2={hx} y1={PT} y2={H - PB} className="cross" />
            <circle cx={hx} cy={hy} r={4} fill={color} stroke="#120e0b" strokeWidth={2} />
            <g transform={`translate(${tipRight ? hx - 8 : hx + 8}, ${tipY})`}>
              <rect x={tipRight ? -92 : 0} y={0} width={92} height={30} rx={3} className="tip" />
              <text x={tipRight ? -86 : 6} y={13} className="tip-v">
                {fmtY(ys[hover])}
              </text>
              <text x={tipRight ? -86 : 6} y={25} className="tip-t">
                {fmtX(xs[hover])}
              </text>
            </g>
          </g>
        )}
      </svg>
    </figure>
  );
}

/** Horizontal part-to-whole bar with 2px gaps and direct labels underneath. */
export function ShareBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (total <= 0) return null;
  let acc = 0;
  const live = parts.filter((p) => p.value > 0);
  return (
    <div className="share">
      <svg viewBox="0 0 340 16" preserveAspectRatio="none" aria-hidden>
        {live.map((p, i) => {
          const w = (p.value / total) * 340;
          const x = acc;
          acc += w;
          return <rect key={p.label} x={x + (i ? 1 : 0)} y={0} width={Math.max(0, w - (i ? 2 : 0) - (i < live.length - 1 ? 1 : 0))} height={16} rx={3} fill={p.color} />;
        })}
      </svg>
      <div className="share-legend">
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} <b>{((p.value / total) * 100).toFixed(0)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}
