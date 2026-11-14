import type Decimal from 'break_eternity.js';
import type { ReactNode } from 'react';
import { host } from '../game/host';
import { useUI } from '../game/store';
import { useT } from '../i18n';
import { kindBlurb, kindName, reasonText, resName, terrainName } from '../i18n/game';
import { cleanseCost, contentsOf, Formulas as F, repairCost, upgradeCost, type Command } from '../sim';
import { REFUND_FRACTION } from '../sim/config';
import { fmt, fmtDuration, int, num } from './format';
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
  const t = useT();
  const { set, say } = useUI();
  const s = host.state;
  const tile = s.tiles[y * s.w + x];
  const b = tile.building;
  const run = (c: Command) => {
    const r = host.dispatch(c);
    if (!r.ok) say(reasonText(r));
    return r.ok;
  };
  const Btn = ({ c, children, cost, danger }: { c: Command; children: ReactNode; cost?: Decimal; danger?: boolean }) => (
    <button className={`act ${danger ? 'danger' : ''} ${cost && s.essence.lt(cost) ? 'poor' : ''}`} onClick={() => run(c)}>
      {children}
      {cost && <small>{fmt(cost)}</small>}
    </button>
  );

  const contents = b ? contentsOf(b) : [0, 0, 0, 0];
  const isHeart = b?.kind === 'heart';
  const sub: string[] = [];
  if (b) sub.push(t('insp.tier', { tier: b.tier }));
  if (tile.terrain === 'vein' || tile.terrain === 'sporebed') sub.push(t('insp.richness', { v: num(tile.richness, 2) }));
  if (b && !isHeart) sub.push(t('insp.out', { v: num(b.flowEma, 2) }));
  if (b && (b.kind === 'digester' || b.kind === 'reactor')) sub.push(t('insp.crafts', { n: int(b.progress) }));
  if (b && !isHeart && b.bornAt !== undefined) sub.push(t('insp.age', { time: fmtDuration(s.time - b.bornAt) }));
  if (isHeart) sub.push(t('insp.intakeCap', { v: fmt(F.heartIntakeCap(b!.tier)) }));
  if (b && !b.enabled) sub.push(t('insp.sealed'));

  return (
    <div className="inspector">
      <div className="insp-head">
        <div>
          <h3>{b ? kindName(b.kind) : terrainName(tile.terrain)}</h3>
          <p className="sub" title={b ? kindBlurb(b.kind) : undefined}>
            {sub.join(' · ')}
          </p>
        </div>
        <button className="x" aria-label="✕" onClick={() => set({ selected: null })}>
          ✕
        </button>
      </div>

      {b && !isHeart && (
        <>
          <Bar v={b.integrity} color={b.integrity < 0.3 ? '#ff3b3b' : '#d9cfbf'} label={t('insp.integrity')} />
          <Bar v={b.pressure} color={b.pressure > 0.85 ? '#ff7a2b' : '#8a7a63'} label={t('insp.pressure')} />
        </>
      )}
      <Bar v={tile.rot} color="#6f8f30" label={t('insp.rot')} />
      {b && contents.some((v) => v > 0.01) && (
        <div className="contents">
          {contents.map(
            (v, r) =>
              v > 0.01 && (
                <span key={r} style={{ color: RES_COLOR[r] }}>
                  {resName(r)} {num(v)}
                </span>
              ),
          )}
        </div>
      )}

      <div className="actions">
        {b && (
          <Btn c={{ t: 'upgrade', x, y }} cost={upgradeCost(s, x, y)!}>
            {t('insp.upgrade')}
          </Btn>
        )}
        {b && !isHeart && b.kind !== 'junction' && <Btn c={{ t: 'rotate', x, y }}>{t('insp.rotate')}</Btn>}
        {b && !isHeart && b.integrity < 0.999 && (
          <Btn c={{ t: 'repair', x, y }} cost={repairCost(s, x, y)}>
            {t('insp.mend')}
          </Btn>
        )}
        {b && !isHeart && <Btn c={{ t: 'toggle', x, y }}>{b.enabled ? t('insp.seal') : t('insp.unseal')}</Btn>}
        {b && !isHeart && (
          <Btn c={{ t: 'vent', x, y }} danger>
            {t('insp.vent')}
          </Btn>
        )}
        {tile.rot > 0.01 && (
          <Btn c={{ t: 'cleanse', x, y }} cost={cleanseCost(s)}>
            {t('insp.cleanse')}
          </Btn>
        )}
        {b && !isHeart && (
          <button className="act danger" onClick={() => run({ t: 'demolish', x, y }) && set({ selected: null })}>
            {t('insp.raze')}
            <small>+{fmt(b.invested.mul(REFUND_FRACTION))}</small>
          </button>
        )}
      </div>
    </div>
  );
}
