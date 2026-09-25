// Lightweight synthesized audio — no external assets. Everything here is
// generated with plain oscillators so the game isn't silent, without
// shipping any audio files. Must be started from a user gesture (browsers
// block autoplay), so callers wait for the Start Flight click.

type OscType = OscillatorType;

const MELODY = [
  659, 659, 659, 659, 659, 659, 659, 784, 523, 587, 659, 0,
  698, 698, 698, 698, 698, 659, 659, 659, 659, 587, 587, 659, 587, 784, 0, 0,
];

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private _muted = false;

  get muted() {
    return this._muted;
  }

  private ensureContext() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this._muted ? 0 : 0.6;
    this.masterGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.masterGain);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.masterGain);
  }

  /** Call from a click handler so the AudioContext unlocks under browser autoplay rules. */
  unlock() {
    this.ensureContext();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this._muted = muted;
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : 0.6;
  }

  private tone(freq: number, duration: number, type: OscType, dest: GainNode, startOffset = 0, peakGain = 0.3) {
    if (!this.ctx || freq <= 0) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = this.ctx.currentTime + startOffset;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peakGain, t0 + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(dest);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  playDeliver(comboLevel = 1) {
    this.ensureContext();
    if (!this.ctx || !this.sfxGain) return;
    const base = 660 + Math.min(comboLevel - 1, 6) * 42;
    this.tone(base, 0.12, 'triangle', this.sfxGain, 0, 0.32);
    this.tone(base * 1.5, 0.18, 'triangle', this.sfxGain, 0.05, 0.22);
    if (comboLevel >= 3) this.tone(base * 2, 0.16, 'sine', this.sfxGain, 0.1, 0.18);
  }

  playHit() {
    this.ensureContext();
    if (!this.ctx || !this.sfxGain) return;
    this.tone(140, 0.25, 'sawtooth', this.sfxGain, 0, 0.4);
    this.tone(85, 0.3, 'square', this.sfxGain, 0.03, 0.3);
  }

  playGameOver() {
    this.ensureContext();
    if (!this.ctx || !this.sfxGain) return;
    const notes = [440, 392, 349, 261];
    notes.forEach((f, i) => this.tone(f, 0.4, 'triangle', this.sfxGain!, i * 0.18, 0.28));
  }

  playUiClick() {
    this.ensureContext();
    if (!this.ctx || !this.sfxGain) return;
    this.tone(880, 0.06, 'square', this.sfxGain, 0, 0.12);
  }

  startMusic() {
    this.ensureContext();
    if (!this.ctx || !this.musicGain) return;
    if (this.musicTimer !== null) return;
    const stepDur = 0.17;
    const playStep = () => {
      if (!this.ctx || !this.musicGain) return;
      const note = MELODY[this.musicStep % MELODY.length];
      if (note > 0) this.tone(note, stepDur * 0.85, 'triangle', this.musicGain, 0, 0.16);
      this.musicStep++;
    };
    playStep();
    this.musicTimer = window.setInterval(playStep, stepDur * 1000);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
      this.musicStep = 0;
    }
  }
}
