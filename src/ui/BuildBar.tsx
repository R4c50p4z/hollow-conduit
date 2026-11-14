import { host } from '../game/host';
import { useUI } from '../game/store';
import { nextBuildCost, type Dir } from '../sim';
import { BUILDABLE, KINDS } from '../sim/config';
import { fmt } from './format';

const ARROWS = ['↑', '→', '↓', '←'];
const SHORT: Partial<Record<string, string>> = { reactor: 'Womb', cauterizer: 'Cauterizer', sporangium: 'Sporangium', ward: 'Ward' };

export function BuildBar() {
  useUI((u) => u.frame);
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
              <span className="tool-name">{SHORT[k] ?? KINDS[k].name}</span>
              <span className="tool-cost">{fmt(cost)}</span>
            </button>
          );
        })}
      </div>
      <div className="bar-row">
        <span className="hint">{tool ? KINDS[tool].blurb + (tool === 'conduit' ? ' Drag to lay a line.' : '') : 'Pick a structure, or tap the cavern to inspect.'}</span>
        <button className="sq" aria-label="Facing" onClick={() => set({ dir: ((dir + 1) % 4) as Dir })}>
          {ARROWS[dir]}
        </button>
        <button
          className={`sq ${overlay !== 'none' ? 'on' : ''}`}
          onClick={() => set({ overlay: overlay === 'none' ? 'pressure' : overlay === 'pressure' ? 'rot' : 'none' })}
        >
          {overlay === 'none' ? '◎' : overlay === 'pressure' ? 'P' : 'R'}
        </button>
        <button className="sq" onClick={() => set({ panel: 'help' })}>
          ?
        </button>
      </div>
    </div>
  );
}
