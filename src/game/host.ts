import { applyCommand, createState, deserialize, serialize, tick, type Command, type CommandResult, type SimState } from '../sim';
import { TICK } from '../sim/config';

const SAVE_KEY = 'hollow-conduit/save/v1';
const OFFLINE_CAP = 2 * 3600; // s — the cavern keeps living while you're gone, up to 2h
const OFFLINE_DT = 0.5; // coarser step for catch-up; the sim is clamp-stable at this dt
const MAX_TICKS_PER_FRAME = 30;
const AUTOSAVE_EVERY = 10_000; // ms

export interface OfflineReport {
  seconds: number;
  essenceBefore: SimState['essence'];
  essenceAfter: SimState['essence'];
  ruptures: number;
  leechesKilled: number;
  waves: number;
}

/**
 * Owns the SimState and drives it with a fixed-timestep accumulator.
 * The UI never mutates state directly — it calls `dispatch(cmd)`.
 *
 * This runs on the main thread for prototype simplicity; because the sim is a pure
 * (state, dt) → state function and commands are plain data, moving it into a Web
 * Worker later means only replacing this class with a message-passing proxy.
 */
export class SimHost {
  state: SimState;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private lastSave = 0;
  private listeners = new Set<() => void>();
  busy = false;

  constructor() {
    this.state = createState((Math.random() * 2 ** 32) >>> 0);
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }

  dispatch(cmd: Command): CommandResult {
    const r = applyCommand(this.state, cmd);
    if (r.ok) this.emit();
    return r;
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      if (this.busy) return;
      const elapsed = (now - this.last) / 1000;
      this.last = now;
      if (elapsed > 5) {
        // Returned from background: run a catch-up instead of a spiral of death.
        void this.catchUp(elapsed);
        return;
      }
      this.acc += elapsed;
      let n = 0;
      while (this.acc >= TICK && n < MAX_TICKS_PER_FRAME) {
        tick(this.state, TICK);
        this.acc -= TICK;
        n++;
      }
      if (n === MAX_TICKS_PER_FRAME) this.acc = 0;
      if (now - this.lastSave > AUTOSAVE_EVERY) this.save();
    };
    this.raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => document.hidden && this.save());
    window.addEventListener('pagehide', () => this.save());
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  save() {
    this.lastSave = performance.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ at: Date.now(), state: serialize(this.state) }));
    } catch {
      /* storage unavailable (private mode) — play continues unsaved */
    }
  }

  /** Load the save and simulate the time spent away. Returns a report if meaningful time passed. */
  async load(onProgress?: (f: number) => void): Promise<OfflineReport | null> {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const { at, state } = JSON.parse(raw) as { at: number; state: string };
      this.state = deserialize(state);
      const away = (Date.now() - at) / 1000;
      if (away < 30) return null;
      return await this.catchUp(away, onProgress);
    } catch (e) {
      console.warn('Save unreadable, starting fresh', e);
      return null;
    }
  }

  async catchUp(seconds: number, onProgress?: (f: number) => void): Promise<OfflineReport> {
    this.busy = true;
    const s = this.state;
    const secs = Math.min(seconds, OFFLINE_CAP);
    const report: OfflineReport = {
      seconds: secs,
      essenceBefore: s.essence,
      essenceAfter: s.essence,
      ruptures: s.stats.life.ruptures,
      leechesKilled: s.stats.life.leechesKilled,
      waves: s.wave,
    };
    const steps = Math.floor(secs / OFFLINE_DT);
    const CHUNK = 400;
    for (let i = 0; i < steps; i += CHUNK) {
      for (let k = i; k < Math.min(steps, i + CHUNK); k++) tick(s, OFFLINE_DT);
      onProgress?.(Math.min(1, (i + CHUNK) / steps));
      await new Promise((r) => setTimeout(r, 0));
    }
    report.essenceAfter = s.essence;
    report.ruptures = s.stats.life.ruptures - report.ruptures;
    report.leechesKilled = s.stats.life.leechesKilled - report.leechesKilled;
    report.waves = s.wave - report.waves;
    s.stats.offlineSeconds += secs;
    this.last = performance.now();
    this.acc = 0;
    this.busy = false;
    this.emit();
    this.save();
    if (this.onOffline && secs > 30) this.onOffline(report);
    return report;
  }

  onOffline: ((r: OfflineReport) => void) | null = null;

  hardReset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    this.state = createState((Math.random() * 2 ** 32) >>> 0);
    this.emit();
  }
}

export const host = new SimHost();
