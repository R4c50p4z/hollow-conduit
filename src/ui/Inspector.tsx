import type { ReactNode } from 'react';
import { host } from '../game/host';
import { useUI } from '../game/store';
import { cleanseCost, Formulas as F, repairCost, RES_NAMES, upgradeCost, type Command } from '../sim';
import { KINDS, REFUND_FRACTION } from '../sim/config';
import { fmt } from './format';
import { RES_COLOR } from './palette';

const Bar = ({ v, color, label }: { v: number; color: string; label: string }) => (
  <div className="stat">
    <span>{label}</span>
    <span className="meter">
      <i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: color }} />
    </span>
    <span className="num">{Math.round(v * 100)}%</span>
  </div>
);

export function Inspector({ x, y }: { x: number; y: number }) {
  useUI((u) => u.frame);
  const { set, say } = useUI();
  const s = host.state;
  const t = s.tiles[y * s.w + x];
  const b = t.building;
  const run = (c: Command) => {
    const r = host.dispatch(c);
    if (!r.ok) say(r.reason);
    return r.ok;
  };
  const Btn = ({ c, children, cost, danger }: { c: Command; children: ReactNode; cost?: ReturnType<typeof cleanseCost>; danger?: boolean }) => (
    <button className={`act ${danger ? 'danger' : ''} ${cost && s.essence.lt(cost) ? 'poor' : ''}`} onClick={() => run(c)}>
      {children}
      {cost && <small>{fmt(cost)}</small>}
    </button>
  );

  const contents = b ? b.store.map((v, r) => v + b.out[r]) : [0, 0, 0, 0];
  const isHeart = b?.kind === 'heart';

  return (
    <div className="inspector">
      <div className="insp-head">
        <div>
          <h3>{b ? KINDS[b.kind].name : t.terrain === 'rock' ? 'Bare rock' : t.terrain === 'vein' ? 'Ichor vein' : t.terrain === 'sporebed' ? 'Spore bed' : 'Burrow'}</h3>
          <p className="sub" title={b ? KINDS[b.kind].blurb : undefined}>
            {b ? `Tier ${b.tier}` : ''}
            {(t.terrain === 'vein' || t.terrain === 'sporebed') && ` · richness ${t.richness.toFixed(2)}`}
            {b && !isHeart && ` · ${b.flowEma.toFixed(2)}/s out`}
            {isHeart && ` · intake cap ${fmt(F.heartIntakeCap(b!.tier))}/s each`}
            {b && !b.enabled && ' · SEALED'}
          </p>
        </div>
        <button className="x" onClick={() => set({ selected: null })}>✕</button>
      </div>

      {b && !isHeart && (
        <>
          <Bar v={b.integrity} color={b.integrity < 0.3 ? '#ff3b3b' : '#d9cfbf'} label="Integrity" />
          <Bar v={b.pressure} color={b.pressure > 0.85 ? '#ff7a2b' : '#8a7a63'} label="Pressure" />
        </>
      )}
      <Bar v={t.rot} color="#6f8f30" label="Rot" />
      {b && contents.some((v) => v > 0.01) && (
        <div className="contents">
          {contents.map((v, r) => v > 0.01 && (
            <span key={r} style={{ color: RES_COLOR[r] }}>
              {RES_NAMES[r]} {v.toFixed(1)}
            </span>
          ))}
        </div>
      )}

      <div className="actions">
        {b && (
          <Btn c={{ t: 'upgrade', x, y }} cost={upgradeCost(s, x, y)!}>
            Upgrade
          </Btn>
        )}
        {b && !isHeart && <Btn c={{ t: 'rotate', x, y }}>Rotate</Btn>}
        {b && !isHeart && b.integrity < 0.999 && (
          <Btn c={{ t: 'repair', x, y }} cost={repairCost(s, x, y)}>
            Mend
          </Btn>
        )}
        {b && !isHeart && <Btn c={{ t: 'toggle', x, y }}>{b.enabled ? 'Seal' : 'Unseal'}</Btn>}
        {b && !isHeart && (
          <Btn c={{ t: 'vent', x, y }} danger>
            Vent
          </Btn>
        )}
        {t.rot > 0.01 && (
          <Btn c={{ t: 'cleanse', x, y }} cost={cleanseCost(s)}>
            Cleanse
          </Btn>
        )}
        {b && !isHeart && (
          <button
            className="act danger"
            onClick={() => run({ t: 'demolish', x, y }) && set({ selected: null })}
          >
            Raze<small>+{fmt(b.invested.mul(REFUND_FRACTION))}</small>
          </button>
        )}
      </div>
    </div>
  );
}
