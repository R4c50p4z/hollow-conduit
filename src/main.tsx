import { createRoot } from 'react-dom/client';
import { App } from './App';
import { audio } from './game/audio';
import { host } from './game/host';
import { useUI } from './game/store';
import './styles.css';

async function boot() {
  createRoot(document.getElementById('root')!).render(<App />);
  useUI.setState({ loading: 0 });
  const report = await host.load((f) => useUI.setState({ loading: f }));
  useUI.setState({ loading: null, offline: report && report.seconds > 30 ? report : null });
  host.state.stats.sessions++;
  // Audio needs a user gesture on iOS; unlock on the first touch and follow the setting.
  audio.enabled = useUI.getState().sound;
  useUI.subscribe((u) => audio.setEnabled(u.sound));
  window.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
  document.documentElement.lang = useUI.getState().lang;
  host.start();
  if (!report && host.state.time === 0) useUI.setState({ panel: 'help' });
}

void boot();

// Debug handle for console / automated playtests.
(window as unknown as { hollow: typeof host }).hollow = host;
