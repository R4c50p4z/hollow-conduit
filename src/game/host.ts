import { applyCommand, createState, deserialize, serialize, tick, type Command, type CommandResult, type GameEvent, type SimState } from '../sim';
import { runOffline, type OfflineResult } from '../sim/offline';
import { audio } from './audio';
import { haptic, prefGet, prefRemove, prefSet } from './native';
import { TICK } from '../sim/config';

const SAVE_KEY = 'hollow-conduit/save/v1';
const MAX_TICKS_PER_FRAME = 30;
const AUTOSAVE_EVERY = 10_000; // ms

export type OfflineReport = OfflineResult;

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
    audio.rateSource = () => this.state.rate;
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
      if (n) this.feelEvents();
      if (now - this.lastSave > AUTOSAVE_EVERY) this.save();
    };
    this.raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => document.hidden && this.save());
    window.addEventListener('pagehide', () => this.save());
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  /** Haptic feedback for events that happened since the last frame (live play only, not catch-up). */
  private seen: GameEvent | null = null;
  private feelEvents() {
    const ev = this.state.events;
    const from = this.seen ? ev.lastIndexOf(this.seen) + 1 : ev.length;
    for (let i = from; i < ev.length; i++) {
      const k = ev[i].kind;
      if (k === 'rupture') { haptic('heavy'); audio.play('rupture'); }
      else if (k === 'achievement') { haptic('medium'); audio.play('achievement'); }
      else if (k === 'wave') { haptic('medium'); audio.play('wave'); }
      else if (k === 'leech_killed') audio.play('kill');
    }
    this.seen = ev[ev.length - 1] ?? null;
  }

  save() {
    this.lastSave = performance.now();
    prefSet(SAVE_KEY, JSON.stringify({ at: Date.now(), state: serialize(this.state) }));
  }

  /** Load the save and simulate the time spent away. Returns a report if meaningful time passed. */
  async load(onProgress?: (f: number) => void): Promise<OfflineReport | null> {
    const raw = await prefGet(SAVE_KEY);
    if (!raw) return null;
    try {
      const { at, state } = JSON.parse(raw) as { at: number; state: string };
      this.state = deserialize(state);
      this.seen = this.state.events[this.state.events.length - 1] ?? null;
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
    const run = runOffline(s, seconds);
    let r = run.next();
    while (!r.done) {
      onProgress?.(r.value);
      await new Promise((res) => setTimeout(res, 0));
      r = run.next();
    }
    const report = r.value;
    s.stats.offlineSeconds += report.seconds;
    this.last = performance.now();
    this.acc = 0;
    this.busy = false;
    this.seen = s.events[s.events.length - 1] ?? null; // don't buzz for what happened while away
    this.emit();
    this.save();
    if (this.onOffline && report.seconds > 30) this.onOffline(report);
    return report;
  }

  onOffline: ((r: OfflineReport) => void) | null = null;

  hardReset() {
    prefRemove(SAVE_KEY);
    this.state = createState((Math.random() * 2 ** 32) >>> 0);
    this.seen = null;
    this.emit();
  }

}

export const host = new SimHost();
