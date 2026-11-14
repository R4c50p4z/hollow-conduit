import { useEffect } from 'react';
import { host } from './game/host';
import { useUI } from './game/store';
import { Board } from './ui/Board';
import { BuildBar } from './ui/BuildBar';
import { Hud } from './ui/Hud';
import { Inspector } from './ui/Inspector';
import { HelpPanel, MutationsPanel, OfflineModal } from './ui/Panels';

function Feed() {
  useUI((u) => u.frame);
  const toast = useUI((u) => u.toast);
  const s = host.state;
  const recent = s.events.filter((e) => s.time - e.t < 6 && e.t <= s.time).slice(-3);
  const showToast = toast && Date.now() - toast.at < 2200;
  return (
    <div className="feed">
      {recent.map((e, i) => (
        <div key={`${e.t}-${i}`} className={`ev ev-${e.kind}`}>
          {e.msg}
        </div>
      ))}
      {showToast && <div className="ev ev-toast">{toast!.msg}</div>}
    </div>
  );
}

export function App() {
  const { selected, panel, loading, set } = useUI();

  useEffect(() => {
    host.onOffline = (r) => set({ offline: r });
    const id = setInterval(() => useUI.setState((u) => ({ frame: u.frame + 1 })), 125);
    const unsub = host.subscribe(() => useUI.setState((u) => ({ frame: u.frame + 1 })));
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [set]);

  return (
    <div className="app">
      <Hud />
      <main className="stage">
        <Board />
        <Feed />
      </main>
      <footer className="dock">{selected ? <Inspector x={selected.x} y={selected.y} /> : <BuildBar />}</footer>
      {panel === 'mutations' && <MutationsPanel />}
      {panel === 'help' && <HelpPanel />}
      <OfflineModal />
      {loading !== null && (
        <div className="modal">
          <div className="sheet">
            <h2>The cavern stirs…</h2>
            <p className="sub">Simulating the time you were away.</p>
            <div className="meter wide">
              <i style={{ width: `${loading * 100}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
