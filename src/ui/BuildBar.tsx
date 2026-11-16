import { useEffect, useState } from 'react';
import { host } from '../game/host';
import { useUI } from '../game/store';
import { useT } from '../i18n';
import { kindName, kindShort, reasonText } from '../i18n/game';
import { Formulas as F, nextBuildCost, type Dir, type Kind } from '../sim';
import { BUILDABLE, REGRET_SECONDS } from '../sim/config';
import { fmt, num } from './format';
import { toolInfo } from './lib/toolInfo';

const ARROWS = ['↑', '→', '↓', '←'];

/** Build-bar hint for the selected tool, with its real numbers (and the 2:1 bile warning). */
function toolHint(t: ReturnType<typeof useT>, k: Kind) {
  const info = toolInfo(k, host.state.mutations);
  const p: Record<string, string> = {};
  for (const [key, v] of Object.entries(info)) p[key] = num(v, v < 1 ? 2 : 1);
  return t(`tool.${k}`, p);
}

export function BuildBar() {
  useUI((u) => u.frame);
  const t = useT();
  const { tool, dir, overlay, set, lastStroke, say } = useUI();
  const s = host.state;
  // Re-render once the undo window closes so the button disappears on time.
  const [, bump] = useState(0);
  useEffect(() => {
    if (!lastStroke) return;
    const id = setTimeout(() => bump((n) => n + 1), REGRET_SECONDS * 1000 + 50);
    return () => clearTimeout(id);
  }, [lastStroke]);

  const undoable = lastStroke && Date.now() - lastStroke.at < REGRET_SECONDS * 1000 ? lastStroke.cells.filter((i) => s.tiles[i].building) : [];
  const undo = () => {
    for (const i of [...undoable].reverse()) host.dispatch({ t: 'demolish', x: i % s.w, y: (i / s.w) | 0 });
    set({ lastStroke: null });
  };
  const empty = !s.tiles.some((tt) => tt.building && tt.building.kind !== 'heart');
  const bpReady = empty && (s.blueprint?.length ?? 0) > 0 && !(s.plans ?? []).some((p) => p.src === 'blueprint');

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
              onClick={() => set({ tool: tool === k ? null : k, selected: null, upgradeMode: false, upgradeSel: [] })}
            >
              <span className="tool-name">{kindShort(k)}</span>
              <span className="tool-cost">{fmt(cost)}</span>
            </button>
          );
        })}
      </div>
      <div className="bar-row">
        {undoable.length > 0 ? (
          <button className="act undo" onClick={undo}>
            ↶ {t('build.undo', { n: undoable.length })}
          </button>
        ) : bpReady ? (
          <button
            className="act glow undo"
            onClick={() => {
              const r = host.dispatch({ t: 'applyBlueprint' });
              if (!r.ok) say(reasonText(r));
            }}
          >
            {t('bp.apply', { n: s.blueprint!.length })}
          </button>
        ) : (
          <span className="hint">{tool ? kindName(tool) : t('build.idle')}</span>
        )}
        <button className="sq" aria-label={t('build.facing')} onClick={() => set({ dir: ((dir + 1) % 4) as Dir })}>
          {ARROWS[dir]}
        </button>
        <button className="sq" aria-label={t('build.upgradeMode')} onClick={() => set({ upgradeMode: true, upgradeSel: [], tool: null, selected: null })}>
          ⇧
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

/** Dock while upgrading by drag: selection count, total cost, confirm/cancel. */
export function UpgradeBar() {
  useUI((u) => u.frame);
  const t = useT();
  const { upgradeSel, set, say } = useUI();
  const s = host.state;
  const sel = upgradeSel.filter((i) => s.tiles[i].building);
  const total = sel.reduce((a, i) => {
    const b = s.tiles[i].building!;
    return a.add(F.tierCost(b.kind, b.tier));
  }, F.tierCost('conduit', 0).mul(0));
  const go = () => {
    let done = 0;
    for (const i of sel) {
      const r = host.dispatch({ t: 'upgrade', x: i % s.w, y: (i / s.w) | 0 });
      if (!r.ok) {
        say(reasonText(r));
        break;
      }
      done++;
    }
    if (done) say(t('up.done', { n: done }));
    set({ upgradeMode: false, upgradeSel: [] });
  };
  return (
    <div className="upgradebar">
      <p className="sub">{sel.length ? t('up.summary', { n: sel.length, cost: fmt(total) }) : t('up.hint')}</p>
      <div className="up-actions">
        <button className="act" onClick={() => set({ upgradeMode: false, upgradeSel: [] })}>
          {t('up.cancel')}
        </button>
        <button className={`act glow ${s.essence.lt(total) ? 'poor' : ''}`} disabled={!sel.length} onClick={go}>
          {t('up.go')}
          {sel.length > 0 && <small>{fmt(total)}</small>}
        </button>
      </div>
    </div>
  );
}

/** Full explanation of the selected tool, shown over the bottom of the cavern while placing. */
export function ToolHint() {
  const t = useT();
  const tool = useUI((u) => u.tool);
  useUI((u) => u.frame);
  if (!tool) return null;
  return <div className="tool-hint">{toolHint(t, tool)}</div>;
}
