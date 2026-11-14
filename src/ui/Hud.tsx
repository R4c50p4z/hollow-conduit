import { host } from '../game/host';
import { useUI } from '../game/store';
import { useT } from '../i18n';
import { resName } from '../i18n/game';
import { Formulas as F, stabilityOf } from '../sim';
import { HEART_WEIGHTS, META_THRESHOLD } from '../sim/config';
import { fmt, fmtTime } from './format';
import { Objective } from './Objective';
import { RES_COLOR } from './palette';

export function Hud() {
  useUI((u) => u.frame);
  const t = useT();
  const set = useUI((u) => u.set);
  const s = host.state;
  const alpha = F.heartAlpha(s.mutations);
  const heart = s.tiles[s.heartY * s.w + s.heartX].building!;
  const cap = F.heartIntakeCap(heart.tier);
  const metaReady = s.runEssence.gte(META_THRESHOLD);
  const latched = s.leeches.filter((l) => l.latched).length;

  return (
    <header className="hud">
      <div className="hud-row">
        <div className="essence">
          <span className="essence-val">{fmt(s.essence)}</span>
          <span className="essence-rate">+{fmt(s.rate)}/s</span>
        </div>
        <div className="hud-right">
          {s.leeches.length > 0 ? (
            <span className="threat live">
              {t('hud.leeches', { n: s.leeches.length })}
              {latched ? ` · ${t('hud.feeding', { n: latched })}` : ''}
            </span>
          ) : (
            <span className="threat">{t('hud.waveIn', { wave: s.wave + 1, time: fmtTime(s.waveTimer) })}</span>
          )}
          <div className="hud-btns">
            <StabilityChip />
            <button className="chip" aria-label={t('hud.stats')} onClick={() => set({ panel: 'stats' })}>
              ▤
            </button>
            <button className={`chip ${metaReady ? 'glow' : ''}`} onClick={() => set({ panel: 'mutations' })}>
              {s.depth > 0 || s.mutagen.gt(0) ? `☣ ${fmt(s.mutagen, 0)} · d${s.depth}` : t('hud.meta')}
            </button>
          </div>
        </div>
      </div>
      <div className="intake">
        {[0, 1, 2, 3].map((r) => {
          const x = s.intake[r];
          const mult = Math.pow(1 + x, HEART_WEIGHTS[r] * alpha);
          return (
            <div key={r} className="res" style={{ ['--c' as string]: RES_COLOR[r] }}>
              <span className="res-top">
                <span className="res-name">{resName(r)}</span>
                <span className="res-mult">×{fmt(mult)}</span>
              </span>
              <span className="res-bar">
                <i style={{ width: `${Math.min(100, (x / cap) * 100)}%` }} />
              </span>
            </div>
          );
        })}
      </div>
      <Objective />
    </header>
  );
}

/** At-a-glance AFK readiness. Tapping it opens the stats panel, whose first section explains it. */
function StabilityChip() {
  const t = useT();
  const set = useUI((u) => u.set);
  const st = stabilityOf(host.state);
  const issues = st.strained + st.infected;
  return (
    <button className={`chip stab ${st.stable ? 'ok' : 'warn'}`} onClick={() => set({ panel: 'stats' })}>
      {st.stable ? t('hud.stable') : t('hud.unstable', { n: issues || '…' })}
    </button>
  );
}
