/**
 * Procedural Audio System for Neon Sprint
 * Uses Web Audio API for real-time synthesized sound effects.
 * No audio files needed - all sounds are generated mathematically.
 */

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private _volume = 0.5;
  private _muted = false;

  get volume() { return this._volume; }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(
        this._muted ? 0 : this._volume,
        this.ctx!.currentTime,
      );
    }
    this.saveSettings();
  }

  get muted() { return this._muted; }
  set muted(m: boolean) {
    this._muted = m;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(
        m ? 0 : this._volume,
        this.ctx!.currentTime,
      );
    }
    this.saveSettings();
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._muted ? 0 : this._volume;
      this.masterGain.connect(this.ctx.destination);
      this.loadSettings();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private loadSettings() {
    try {
      const data = localStorage.getItem('neon-sprint-audio');
      if (data) {
        const s = JSON.parse(data);
        if (typeof s.volume === 'number') this._volume = s.volume;
        if (typeof s.muted === 'boolean') this._muted = s.muted;
        if (this.masterGain) {
          this.masterGain.gain.value = this._muted ? 0 : this._volume;
        }
      }
    } catch { /* ignore */ }
  }

  private saveSettings() {
    try {
      localStorage.setItem('neon-sprint-audio', JSON.stringify({
        volume: this._volume,
        muted: this._muted,
      }));
    } catch { /* ignore */ }
  }

  /** Bright ascending chime for orb collection */
  playOrbCollect(multiplier: number = 1) {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    const baseFreq = 600 + Math.min(multiplier, 10) * 60;

    // Two-tone chime
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * (1 + i * 0.5), now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * (1.5 + i * 0.5), now + 0.08);
      gain.gain.setValueAtTime(0.15, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15 + i * 0.06);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.06);
      osc.stop(now + 0.2 + i * 0.06);
    }
  }

  /** Impact sound for obstacle hit */
  playHit() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Noise burst + low thud
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.1);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain!);
    noise.start(now);
    noise.stop(now + 0.15);

    // Low thud
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  /** Shield break sound */
  playShieldBreak() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Glass-like shatter
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const freq = 2000 + Math.random() * 3000;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.3, now + 0.3);
      gain.gain.setValueAtTime(0.08, now + i * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25 + i * 0.02);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.02);
      osc.stop(now + 0.3 + i * 0.02);
    }
  }

  /** Power-up pickup sound */
  playPowerUp(type: string) {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Ascending arpeggio
    const baseFreqs: Record<string, number> = {
      shield: 400,
      magnet: 500,
      slow_mo: 300,
    };
    const base = baseFreqs[type] || 400;

    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i < 2 ? 'sine' : 'triangle';
      const freq = base * Math.pow(1.26, i); // minor third intervals
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.12, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2 + i * 0.08);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.08);
      osc.stop(now + 0.3 + i * 0.08);
    }
  }

  /** Countdown beep (higher pitch for GO) */
  playCountdown(value: number) {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const freq = value > 0 ? 440 : 880; // GO is higher
    const duration = value > 0 ? 0.12 : 0.25;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.15, now + duration * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  /** Menu button click */
  playClick() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.04);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  /** Multiplier increase sound */
  playMultiplierUp(level: number) {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const freq = 500 + level * 100;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** Game over sound */
  playGameOver() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Descending minor arpeggio
    const freqs = [660, 554, 440, 330];
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], now + i * 0.15);
      gain.gain.setValueAtTime(0.15, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25 + i * 0.15);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.15);
      osc.stop(now + 0.3 + i * 0.15);
    }
  }

  /** New record fanfare */
  playNewRecord() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Ascending major arpeggio with harmonics
    const freqs = [523, 659, 784, 1047]; // C5 E5 G5 C6
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc2.type = 'triangle';
      osc.frequency.setValueAtTime(freqs[i], now + i * 0.12);
      osc2.frequency.setValueAtTime(freqs[i] * 2, now + i * 0.12);
      gain.gain.setValueAtTime(0.12, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.15 + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4 + i * 0.12);
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.12);
      osc.stop(now + 0.45 + i * 0.12);
      osc2.start(now + i * 0.12);
      osc2.stop(now + 0.45 + i * 0.12);
    }
  }

  /** Achievement unlock jingle */
  playAchievement() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const freqs = [880, 1109, 1319]; // A5 C#6 E6 major triad
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], now + i * 0.07);
      gain.gain.setValueAtTime(0.1, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25 + i * 0.07);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.07);
      osc.stop(now + 0.3 + i * 0.07);
    }
  }

  /** Lane switch whoosh */
  playLaneSwitch() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 0.06;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(1500, now + 0.05);
    filter.Q.value = 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    noise.start(now);
    noise.stop(now + 0.07);
  }
}

/** Singleton audio manager */
export const audioManager = new AudioManager();
