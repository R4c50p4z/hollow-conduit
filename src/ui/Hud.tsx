import { host } from '../game/host';
import { useUI } from '../game/store';
import { Formulas as F, RES_NAMES } from '../sim';
import { HEART_WEIGHTS, META_THRESHOLD } from '../sim/config';
import { fmt, fmtTime } from './format';
import { RES_COLOR } from './palette';

export function Hud() {
  useUI((u) => u.frame);
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
              {s.leeches.length} leech{s.leeches.length > 1 ? 'es' : ''}
              {latched ? ` · ${latched} feeding` : ''}
            </span>
          ) : (
            <span className="threat">wave {s.wave + 1} in {fmtTime(s.waveTimer)}</span>
          )}
          <button className={`chip ${metaReady ? 'glow' : ''}`} onClick={() => set({ panel: 'mutations' })}>
            {s.depth > 0 || s.mutagen.gt(0) ? `☣ ${fmt(s.mutagen, 0)} · d${s.depth}` : 'Metamorphosis'}
          </button>
        </div>
      </div>
      <div className="intake">
        {RES_NAMES.map((n, r) => {
          const x = s.intake[r];
          const mult = Math.pow(1 + x, HEART_WEIGHTS[r] * alpha);
          return (
            <div key={n} className="res" style={{ ['--c' as string]: RES_COLOR[r] }} title={`${n}: ${x.toFixed(2)}/s of ${fmt(cap)}/s, ×${fmt(mult)}`}>
              <span className="res-name">{n}</span>
              <span className="res-bar">
                <i style={{ width: `${Math.min(100, (x / cap) * 100)}%` }} />
              </span>
              <span className="res-mult">×{fmt(mult)}</span>
            </div>
          );
        })}
      </div>
    </header>
  );
}
