import { host } from '../game/host';
import { useUI } from '../game/store';
import { useT } from '../i18n';
import { kindBlurb, kindShort } from '../i18n/game';
import { nextBuildCost, type Dir } from '../sim';
import { BUILDABLE } from '../sim/config';
import { fmt } from './format';

const ARROWS = ['↑', '→', '↓', '←'];

export function BuildBar() {
  useUI((u) => u.frame);
  const t = useT();
  const { tool, dir, overlay, set } = useUI();
  const s = host.state;
  return (
    <div className="buildbar">
      <div className="tools">
        {BUILDABLE.map((k) => {
          const cost = nextBuildCost(s, k);
          const afford = s.essence.gte(cost);
          return (
            <button
              key={k}
              className={`tool ${tool === k ? 'on' : ''} ${afford ? '' : 'poor'}`}
              onClick={() => set({ tool: tool === k ? null : k, selected: null })}
            >
              <span className="tool-name">{kindShort(k)}</span>
              <span className="tool-cost">{fmt(cost)}</span>
            </button>
          );
        })}
      </div>
      <div className="bar-row">
        <span className="hint">{tool ? kindBlurb(tool) : t('build.idle')}</span>
        <button className="sq" aria-label={t('build.facing')} onClick={() => set({ dir: ((dir + 1) % 4) as Dir })}>
          {ARROWS[dir]}
        </button>
        <button
          className={`sq ${overlay !== 'none' ? 'on' : ''}`}
          aria-label={t('build.overlay')}
          onClick={() => set({ overlay: overlay === 'none' ? 'pressure' : overlay === 'pressure' ? 'rot' : 'none' })}
        >
          {overlay === 'none' ? '◎' : overlay === 'pressure' ? 'P' : 'R'}
        </button>
        <button className="sq" aria-label={t('settings.title')} onClick={() => set({ panel: 'settings' })}>
          ⚙
        </button>
        <button className="sq" aria-label="?" onClick={() => set({ panel: 'tutorial' })}>
          ?
        </button>
      </div>
    </div>
  );
}
