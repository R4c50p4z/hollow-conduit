import type Decimal from 'break_eternity.js';
import type { ReactNode } from 'react';
import { host } from '../game/host';
import { useUI } from '../game/store';
import { useT } from '../i18n';
import { kindBlurb, kindName, reasonText, resName, terrainName } from '../i18n/game';
import { cleanseCost, contentsOf, Formulas as F, planBlocked, planCost, repairCost, statusOf, upgradeCost, type Building, type Command, type SimState } from '../sim';
import { RUIN_TTL } from '../sim/config';
import { REFUND_FRACTION } from '../sim/config';
import { fmt, fmtDuration, int, num } from './format';
import { RES_COLOR, STATUS_COLOR } from './palette';

const Bar = ({ v, color, label }: { v: number; color: string; label: string }) => (
  <div className="stat">
    <span>{label}</span>
    <span className="meter">
      <i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: color }} />
    </span>
    <span className="num">{Math.round(v * 100)}%</span>
  </div>
);

/**
 * Defined at module level on purpose: the inspector re-renders 8×/s, and a component declared
 * inside it would be a *new type* each render, so React would remount the <button> mid-tap and
 * swallow most touches.
 */
function Btn({ onPress, children, cost, poor, danger }: { onPress: () => void; children: ReactNode; cost?: Decimal; poor?: boolean; danger?: boolean }) {
  return (
    <button className={`act ${danger ? 'danger' : ''} ${poor ? 'poor' : ''}`} onClick={onPress}>
      {children}
      {cost && <small>{fmt(cost)}</small>}
    </button>
  );
}

const ARROWS = ['↑', '→', '↓', '←'];

/** "● Blocked: nothing ahead": colour + words, so it never relies on colour alone. */
function StatusLine({ x, y }: { x: number; y: number }) {
  const t = useT();
  const st = statusOf(host.state, x, y);
  if (!st) return null;
  let text = t(`status.${st.code}`);
  if (st.reason) text += ': ' + t(`status.reason.${st.reason}`);
  if (st.missing?.length) text += ': ' + st.missing.map((r) => resName(r)).join(', ');
  return (
    <p className="status-line">
      <i style={{ background: STATUS_COLOR[st.code] }} />
      {text}
    </p>
  );
}

/** What it could make vs what actually leaves it (Mindustry shows neither; players ask for it). */
function RateLine({ s, b, rot }: { s: SimState; b: Building; rot: number }) {
  const t = useT();
  const m = s.mutations;
  const tile = s.tiles.find((tt) => tt.building === b)!;
  let line: string | null = null;
  if (b.kind === 'tap' || b.kind === 'sporangium')
    line = t('insp.rates', { a: num(F.extractionRate(b.kind, b.tier, tile.richness, rot, m), 2), b: num(b.flowEma, 2) });
  else if (b.kind === 'digester' || b.kind === 'reactor')
    // Both recipes yield one unit (bile / vitriol) per craft.
    line = t('insp.rates', { a: num(F.craftRate(b.kind, b.tier, rot, m), 2), b: num(b.flowEma, 2) });
  else if (b.kind === 'conduit' || b.kind === 'reservoir' || b.kind === 'junction' || b.kind === 'router')
    line = t('insp.flow', { a: num(F.conduitThroughput(b.kind === 'router' ? 'router' : 'conduit', b.tier, rot, m), 1), b: num(b.flowEma, 2) });
  return line ? <p className="sub rate-line">{line}</p> : null;
}

/** An empty tile with a ruin or blueprint plan on it: what it was, cost, build now / discard. */
function PlanView({ x, y }: { x: number; y: number }) {
  const t = useT();
  const say = useUI((u) => u.say);
  const s = host.state;
  const p = (s.plans ?? []).find((q) => q.x === x && q.y === y);
  if (!p) return null;
  const cost = planCost(s, p);
  const blocked = planBlocked(s, p);
  const go = (c: Command) => {
    const r = host.dispatch(c);
    if (!r.ok) say(reasonText(r));
  };
  return (
    <div className="plan-view">
      <p className="status-line">
        <i style={{ background: blocked ? '#e0465a' : '#c9a24a' }} />
        {t(p.src === 'ruin' ? 'plan.ruin' : 'plan.blueprint', { kind: kindName(p.kind) })}
        {p.tier > 0 ? ` · ${t('insp.tier', { tier: p.tier })}` : ''}
      </p>
      <p className="sub">
        {p.src === 'ruin'
          ? t('plan.cause', { cause: t(`st.cause.${p.cause ?? 'pressure'}`), time: fmtDuration(Math.max(0, RUIN_TTL - (s.time - p.at))) })
          : t('plan.queued')}
      </p>
      {blocked && <p className="sub bad-text">{t('plan.blocked', { why: reasonText(blocked) })}</p>}
      <div className="actions">
        <Btn onPress={() => go({ t: 'buildPlan', x, y })} cost={cost} poor={s.essence.lt(cost) || !!blocked}>
          {t('plan.build')}
        </Btn>
        <Btn onPress={() => go({ t: 'dropPlan', x, y })} danger>
          {t('plan.drop')}
        </Btn>
      </div>
    </div>
  );
}

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
  const act = (c: Command, cost?: Decimal) => ({ onPress: () => run(c), cost, poor: !!cost && s.essence.lt(cost) });

  const contents = b ? contentsOf(b) : [0, 0, 0, 0];
  const isHeart = b?.kind === 'heart';
  const sub: string[] = [];
  if (b) sub.push(t('insp.tier', { tier: b.tier }));
  if (tile.terrain === 'vein' || tile.terrain === 'sporebed') sub.push(t('insp.richness', { v: num(tile.richness, 2) }));
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

      {b && <StatusLine x={x} y={y} />}
      {b && !isHeart && <RateLine s={s} b={b} rot={tile.rot} />}
      {b?.kind === 'router' && b.mode === 'priority' && <p className="sub">{t('insp.prioritySide', { dir: ARROWS[b.dir] })}</p>}
      {!b && <PlanView x={x} y={y} />}
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
          <Btn {...act({ t: 'upgrade', x, y }, upgradeCost(s, x, y)!)}>
            {t('insp.upgrade')}
          </Btn>
        )}
        {b && !isHeart && b.kind !== 'junction' && <Btn {...act({ t: 'rotate', x, y })}>{t('insp.rotate')}</Btn>}
        {b && !isHeart && b.integrity < 0.999 && (
          <Btn {...act({ t: 'repair', x, y }, repairCost(s, x, y))}>
            {t('insp.mend')}
          </Btn>
        )}
        {b?.kind === 'router' && (
          <Btn {...act({ t: 'setMode', x, y })}>
            {b.mode === 'priority' ? t('insp.modePriority', { dir: ARROWS[b.dir] }) : t('insp.modeSplit')}
          </Btn>
        )}
        {b && !isHeart && <Btn {...act({ t: 'toggle', x, y })}>{b.enabled ? t('insp.seal') : t('insp.unseal')}</Btn>}
        {b && !isHeart && (
          <Btn {...act({ t: 'vent', x, y })} danger>
            {t('insp.vent')}
          </Btn>
        )}
        {tile.rot > 0.01 && (
          <Btn {...act({ t: 'cleanse', x, y }, cleanseCost(s))}>
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
