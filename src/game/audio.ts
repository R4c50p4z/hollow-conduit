import Decimal from 'break_eternity.js';

/**
 * Procedural sound: no audio files, everything is synthesised with Web Audio. Atmosphere
 * over spectacle: a low heartbeat whose tempo follows log10(essence/s), and short organic
 * one-shots for strikes, ruptures, waves, builds and achievements.
 *
 * iOS only allows audio after a user gesture, so the context is created lazily by `unlock()`
 * (called from the first pointerdown). Everything is a no-op until then, or when muted.
 */
export type Sfx = 'strike' | 'rupture' | 'wave' | 'achievement' | 'build' | 'kill';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private beatTimer = 0;
  enabled = true;
  /** Supplies the current essence/s for the heartbeat tempo. */
  rateSource: () => Decimal = () => new Decimal(0);

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.55 : 0;
    this.master.connect(this.ctx.destination);
    // One second of white noise, reused for every noisy sound.
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    this.scheduleBeat();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
  }

  // --- primitives -----------------------------------------------------------------------------

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(freq: number, toFreq: number, t: number, peak: number, attack: number, decay: number, type: OscillatorType = 'sine') {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), t + attack + decay);
    this.env(g, t, peak, attack, decay);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  private hiss(t: number, peak: number, attack: number, decay: number, filter: BiquadFilterType, f0: number, f1: number, q = 1) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const bq = c.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t);
    bq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
    const g = c.createGain();
    this.env(g, t, peak, attack, decay);
    src.connect(bq).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + decay + 0.05);
  }

  // --- heartbeat ------------------------------------------------------------------------------

  private scheduleBeat() {
    const lvl = Math.max(0, this.rateSource().add(1).log10().toNumber());
    const bpm = Math.min(132, 38 + 7 * lvl);
    if (this.ctx && this.enabled && this.ctx.state === 'running') {
      const t = this.ctx.currentTime + 0.02;
      const vol = Math.min(0.5, 0.18 + 0.02 * lvl);
      this.tone(62, 38, t, vol, 0.012, 0.16); // lub
      this.hiss(t, vol * 0.25, 0.005, 0.08, 'lowpass', 180, 60);
      this.tone(55, 34, t + 0.22, vol * 0.7, 0.012, 0.14); // dub
    }
    this.beatTimer = window.setTimeout(() => this.scheduleBeat(), 60000 / bpm);
  }

  // --- one-shots ------------------------------------------------------------------------------

  play(kind: Sfx) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    switch (kind) {
      case 'strike': // wet squelch
        this.hiss(t, 0.35, 0.004, 0.09, 'bandpass', 1400, 300, 4);
        this.tone(220, 90, t, 0.12, 0.004, 0.07, 'triangle');
        break;
      case 'kill':
        this.hiss(t, 0.4, 0.004, 0.18, 'bandpass', 900, 120, 3);
        this.tone(160, 50, t, 0.2, 0.006, 0.2, 'triangle');
        break;
      case 'rupture': // crack + low boom
        this.hiss(t, 0.6, 0.002, 0.25, 'highpass', 2500, 600);
        this.tone(90, 28, t, 0.55, 0.005, 0.6);
        this.hiss(t + 0.05, 0.25, 0.02, 0.8, 'lowpass', 400, 80);
        break;
      case 'wave': // distant rumble swelling up
        this.hiss(t, 0.3, 0.6, 1.4, 'lowpass', 90, 160);
        this.tone(41, 36, t, 0.18, 0.5, 1.5);
        break;
      case 'achievement': // two soft bell partials
        this.tone(659, 655, t, 0.12, 0.01, 1.4);
        this.tone(988, 980, t + 0.12, 0.08, 0.01, 1.6);
        break;
      case 'build':
        this.tone(140, 70, t, 0.18, 0.003, 0.09, 'triangle');
        this.hiss(t, 0.08, 0.002, 0.05, 'lowpass', 1200, 300);
        break;
    }
  }

  dispose() {
    clearTimeout(this.beatTimer);
    void this.ctx?.close();
  }
}

export const audio = new AudioEngine();
