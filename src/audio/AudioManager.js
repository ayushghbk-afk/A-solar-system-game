// WebAudio sound manager: engine loop, UI blips and one-shot SFX, plus a very
// subtle ambient drone. All synthesized — no audio files to download.
export class AudioManager {
  constructor() {
    this.enabled = true;
    this.music = false;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engine = null;
    this._noiseBuf = null;
    this._started = false;
    this._lastBeep = 0;
  }

  // Must be called from a user gesture at least once.
  ensure() {
    if (this._started) {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 1 : 0;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.music ? 0.16 : 0;
      this.musicGain.connect(this.master);
      this._buildNoise();
      this._buildEngine();
      if (this.music) this._startAmbient();
      this._started = true;
    } catch (e) {
      this.ctx = null;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.03);
    }
    if (!on && this.engine) this.engine.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.music = on;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(on ? 0.14 : 0, this.ctx.currentTime, 0.5);
    }
    if (on && !this._ambientOn) this._startAmbient();
  }

  _buildNoise() {
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
  }

  _buildEngine() {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0;
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 62;
    const osc2 = c.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = 124;
    const noise = c.createBufferSource();
    noise.buffer = this._noiseBuf;
    noise.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 420;
    bp.Q.value = 0.8;
    const nGain = c.createGain();
    nGain.gain.value = 0.35;
    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(g);
    osc.connect(g);
    osc2.connect(g);
    g.connect(this.sfxGain);
    osc.start(); osc2.start(); noise.start();
    this.engine = { gain: g, osc, osc2, noise, bp };
  }

  // throttle 0..1, boost bool
  updateEngine(throttle, boost, dt) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const on = throttle > 0.005;
    const vol = on ? 0.05 + throttle * 0.05 + (boost ? 0.08 : 0) : 0;
    this.engine.gain.gain.setTargetAtTime(vol, t, 0.08);
    if (on) {
      const f = 55 + throttle * 60 + (boost ? 55 : 0) + Math.sin(t * 30) * 3;
      this.engine.osc.frequency.setTargetAtTime(f, t, 0.1);
      this.engine.osc2.frequency.setTargetAtTime(f * 2.01, t, 0.1);
      this.engine.bp.frequency.setTargetAtTime(300 + throttle * 900, t, 0.15);
    }
  }

  stopEngine() {
    if (this.engine) this.engine.gain.gain.setTargetAtTime(0, this.ctx ? this.ctx.currentTime : 0, 0.06);
  }

  /* ---------------- one-shots ---------------- */

  play(name, { vol = 1, rate = 1 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const fn = {
      click: () => this._blip(1100, 0.05, "square", 0.05),
      ui: () => this._blip(660, 0.06, "sine", 0.06),
      back: () => this._blip(330, 0.07, "sine", 0.05),
      scanTick: () => this._blip(1500 + Math.random() * 500, 0.02, "square", 0.03),
      scanDone: () => { this._arp([660, 880, 1320], 0.07, "triangle", 0.09); },
      scan: () => { this._blip(1800, 0.4, "sine", 0.05, 300); },
      discover: () => { this._arp([523, 659, 784, 1046], 0.12, "triangle", 0.12); },
      mineTick: () => this._blip(220 + Math.random() * 80, 0.04, "square", 0.05),
      mineDone: () => this._blip(140, 0.1, "square", 0.08, 60),
      complete: () => { this._arp([523, 659, 784, 1046, 1318], 0.13, "triangle", 0.13); this._arp([523, 659, 784, 1046, 1318], 0.13, "sine", 0.09, 0.5); },
      money: () => { this._blip(1046, 0.07, "square", 0.07); setTimeout(() => this._blip(1568, 0.12, "square", 0.07), 70); },
      alarm: () => this._alarm(),
      boost: () => { this._blip(90, 0.3, "sawtooth", 0.06, 180); },
      crash: () => { this._noiseBurst(0.5, 0.3, 240); this._blip(70, 0.4, "sine", 0.2, 40); },
      dock: () => this._arp([392, 523, 659], 0.09, "sine", 0.1),
      undock: () => this._arp([659, 523, 392], 0.08, "sine", 0.08),
      arrive: () => this._arp([523, 784], 0.16, "sine", 0.11),
      error: () => this._blip(180, 0.12, "square", 0.08),
      land: () => { this._noiseBurst(0.18, 0.12, 160); this._blip(110, 0.1, "sine", 0.06, 60); },
    }[name];
    if (fn) { try { fn(); } catch (e) { /* never break game on audio */ } }
  }

  _blip(freq, dur, type, gain, freqEnd) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _arp(freqs, step, type, gain, offset = 0) {
    const c = this.ctx;
    freqs.forEach((f, i) => {
      const t = c.currentTime + offset + i * step;
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.6);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + step * 1.8);
    });
  }

  _alarm() {
    const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.22;
      const o = c.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(760, tt);
      o.frequency.setValueAtTime(620, tt + 0.11);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.035, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.2);
      o.connect(g); g.connect(this.sfxGain);
      o.start(tt); o.stop(tt + 0.24);
    }
  }

  _noiseBurst(dur, gain, freq) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.value = freq || 400;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur + 0.05);
  }

  /* ---------------- ambient ---------------- */

  _startAmbient() {
    if (!this.ctx || this._ambientOn) return;
    const c = this.ctx;
    this._ambientOn = true;
    const chords = [
      [110, 164.8, 220, 329.6],
      [98, 146.8, 196, 293.7],
      [87.3, 130.8, 174.6, 261.6],
      [123.5, 185, 246.9, 370],
    ];
    let idx = 0;
    const pad = () => {
      if (!this._ambientOn) return;
      const ch = chords[idx % chords.length];
      idx++;
      const t = c.currentTime;
      ch.forEach((f, i) => {
        const o = c.createOscillator();
        o.type = i === 0 ? "sine" : "triangle";
        o.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05 / (i + 1), t + 2.5);
        g.gain.linearRampToValueAtTime(0.0001, t + 12);
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + 13);
      });
      setTimeout(pad, 11000);
    };
    pad();
  }
}
