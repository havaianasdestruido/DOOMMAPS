// ============================================================
// DOOMMAPS — Audio: synthesized SFX + procedural metal sequencer
// No audio assets: everything is generated with Web Audio API.
// ============================================================
import { clamp, rand } from "../config.js";

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.started = false;
    this.musicMode = "off"; // off | explore | combat | boss | lowhp | title
    this._seqTimer = null;
    this._step = 0;
    this._bar = 0;
    this._nextTime = 0;
    this._channels = 0;
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.55; this.musicBus.connect(this.master);
      // shared noise buffer
      const len = this.ctx.sampleRate * 1.2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.started = true;
      this._startSequencer();
    } catch (e) { console.warn("Audio init failed", e); }
  }

  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); }
  setVolumes(music, sfx) {
    if (!this.started) return;
    this.musicBus.gain.value = music * 0.9;
    this.sfxBus.gain.value = sfx;
  }

  // ---------------- low-level helpers ----------------
  _env(gainNode, t, a, peak, dec, sus = 0.0001) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dec);
  }

  _noise(dur, filterType, freq, q, peak, pan = 0, when = 0, rate = 1) {
    if (!this.started || this._channels > 28) return;
    this._channels++;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = rate;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    this._env(g, t, 0.004, peak, dur);
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    src.connect(f); f.connect(g); g.connect(p); p.connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.1);
    src.onended = () => this._channels--;
  }

  _tone(type, freq, dur, peak, pan = 0, when = 0, slideTo = null, slideT = null) {
    if (!this.started || this._channels > 28) return;
    this._channels++;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + (slideT || dur));
    const g = this.ctx.createGain();
    this._env(g, t, 0.005, peak, dur);
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    o.connect(g); g.connect(p); p.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.15);
    o.onended = () => this._channels--;
  }

  /** positional helper: convert dist/pan to params */
  _pp(dist = 0, side = 0) {
    const vol = clamp(1 - dist / 60, 0.05, 1);
    return [vol, clamp(side, -1, 1)];
  }

  // ---------------- weapon SFX ----------------
  pistol()  { this._noise(0.14, "lowpass", 900, 1, 0.9); this._tone("square", 220, 0.1, 0.5, 0, 0, 60); }
  shotgun() {
    this._noise(0.32, "lowpass", 700, 1.2, 1.1);
    this._tone("sawtooth", 130, 0.22, 0.7, 0, 0, 40);
    this._noise(0.1, "highpass", 2500, 1, 0.3, 0, 0.01);
  }
  superShotgun() {
    this._noise(0.5, "lowpass", 480, 1.4, 1.35);
    this._tone("sawtooth", 100, 0.34, 0.9, 0, 0, 30);
    this._noise(0.5, "highpass", 1800, 1, 0.35, 0, 0.03);
  }
  pump()    { this._noise(0.09, "bandpass", 500, 4, 0.5, 0, 0.05); this._noise(0.08, "bandpass", 800, 4, 0.4, 0, 0.16); }
  chaingun(){ this._noise(0.09, "lowpass", 1100, 1, 0.65); this._tone("square", 180, 0.06, 0.4, 0, 0, 80); }
  chainSpin(){ this._noise(0.3, "bandpass", 300, 3, 0.25, 0, 0, 2.2); }
  rocketFire(){ this._noise(0.5, "lowpass", 500, 1, 0.8); this._tone("sawtooth", 90, 0.4, 0.5, 0, 0, 300, 0.4); }
  plasma()  { this._tone("square", 880, 0.12, 0.35, 0, 0, 180); this._tone("sawtooth", 1760, 0.07, 0.18, 0, 0, 220); }
  bfg()     { this._tone("sawtooth", 60, 0.8, 0.8, 0, 0, 900, 0.7); this._noise(0.8, "lowpass", 400, 1, 0.7, 0, 0.05); }
  punch(hit) {
    if (hit) { this._noise(0.12, "lowpass", 350, 1, 1.0); this._tone("sine", 80, 0.14, 0.8, 0, 0, 45); }
    else this._noise(0.06, "highpass", 1200, 1, 0.22);
  }
  explosion(dist = 0) {
    const [v] = this._pp(dist, 0);
    this._noise(0.85, "lowpass", 260 * v + 80, 1, 1.3 * v);
    this._tone("sine", 70, 0.7, 0.9 * v, 0, 0, 25);
  }
  ricochet(){ if (Math.random() < 0.3) this._tone("square", rand(1400, 2400), 0.06, 0.12, rand(-0.5, 0.5), 0, rand(400, 800)); }

  // ---------------- pickups / world ----------------
  itemPickup() { this._tone("square", 660, 0.07, 0.32); this._tone("square", 990, 0.09, 0.32, 0, 0.07); }
  healthPickup(){ this._tone("triangle", 520, 0.1, 0.3); this._tone("triangle", 780, 0.14, 0.3, 0, 0.09); }
  weaponPickup() {
    [392, 523, 659, 784].forEach((f, i) => this._tone("square", f, 0.1, 0.3, 0, i * 0.07));
  }
  powerup() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this._tone("sawtooth", f * 0.5, 0.16, 0.25, 0, i * 0.06));
  }
  keyPickup() {
    [880, 1174, 880, 1318].forEach((f, i) => this._tone("triangle", f, 0.11, 0.3, 0, i * 0.09));
  }
  secret() { [233, 311, 415, 622, 830].forEach((f, i) => this._tone("triangle", f, 0.22, 0.22, 0, i * 0.12)); }
  doorOpen(dist = 0, pan = 0) {
    const [v, p] = this._pp(dist, pan);
    this._noise(0.55, "lowpass", 240, 1.5, 0.55 * v, p);
    this._tone("sawtooth", 55, 0.5, 0.3 * v, p, 0, 90);
    this._noise(0.1, "bandpass", 900, 5, 0.3 * v, p, 0.48);
  }
  doorLocked() { this._tone("square", 130, 0.16, 0.4); this._tone("square", 98, 0.22, 0.4, 0, 0.17); }
  teleport() {
    this._tone("sawtooth", 1200, 0.35, 0.3, 0, 0, 100);
    this._noise(0.3, "highpass", 2000, 1, 0.25);
  }
  gib() { this._noise(0.2, "lowpass", 400, 1, 0.8); this._noise(0.12, "lowpass", 220, 1, 0.6, 0, 0.05); }

  // ---------------- enemies ----------------
  alert(kind, dist = 0, pan = 0) {
    const [v, p] = this._pp(dist, pan);
    if (v < 0.1) return;
    switch (kind) {
      case "shambler": this._tone("sawtooth", 90, 0.5, 0.5 * v, p, 0, 60); this._noise(0.4, "lowpass", 300, 2, 0.4 * v, p); break;
      case "hellhound": this._tone("sawtooth", 300, 0.28, 0.4 * v, p, 0, 520); this._noise(0.2, "bandpass", 800, 3, 0.35 * v, p); break;
      case "bruiser": case "wraith": this._tone("sawtooth", 140, 0.55, 0.6 * v, p, 0, 70); this._noise(0.5, "lowpass", 400, 1.5, 0.5 * v, p); break;
      case "gunner": this._tone("square", 220, 0.2, 0.4 * v, p, 0, 160); break;
      case "reaper": this._tone("sine", 500, 0.5, 0.4 * v, p, 0, 900); this._tone("sine", 505, 0.5, 0.4 * v, p, 0, 880); break;
      case "warlord": this._tone("sawtooth", 80, 0.9, 0.65 * v, p, 0, 55); this._noise(0.8, "lowpass", 250, 1.5, 0.55 * v, p); break;
      case "archdevil": this._noise(1.3, "lowpass", 200, 1, 0.9 * v, p); this._tone("sawtooth", 50, 1.3, 0.8 * v, p, 0, 30); break;
      default: this._tone("sawtooth", 160, 0.4, 0.4 * v, p, 0, 90);
    }
  }
  enemyPain(dist = 0, pan = 0) {
    const [v, p] = this._pp(dist, pan);
    this._tone("square", rand(140, 260), 0.14, 0.35 * v, p, 0, 90);
  }
  enemyShot(dist = 0, pan = 0) { const [v, p] = this._pp(dist, pan); this._noise(0.12, "lowpass", 800, 1, 0.6 * v, p); }
  enemyShotgun(dist = 0, pan = 0) { const [v, p] = this._pp(dist, pan); this._noise(0.28, "lowpass", 600, 1, 0.75 * v, p); }
  fireball(dist = 0, pan = 0) { const [v, p] = this._pp(dist, pan); this._noise(0.3, "bandpass", 600, 2, 0.4 * v, p); this._tone("sawtooth", 200, 0.28, 0.3 * v, p, 0, 90); }
  enemyDeath(kind, dist = 0, pan = 0) {
    const [v, p] = this._pp(dist, pan);
    if (kind === "bruiser" || kind === "warlord") {
      this._tone("sawtooth", 120, 0.8, 0.6 * v, p, 0, 35); this._noise(0.8, "lowpass", 300, 1, 0.6 * v, p);
    } else if (kind === "reaper") {
      this._tone("sine", 700, 0.7, 0.45 * v, p, 0, 80); this.explosion(dist);
    } else {
      this._tone("sawtooth", rand(150, 220), 0.5, 0.5 * v, p, 0, 50); this._noise(0.35, "lowpass", 350, 1, 0.45 * v, p);
    }
  }

  // ---------------- player ----------------
  playerPain(hpPercent) {
    const base = hpPercent < 30 ? 100 : 160;
    this._tone("sawtooth", base + rand(-20, 30), 0.18, 0.5, 0, 0, 70);
  }
  playerDeath() {
    this._tone("sawtooth", 220, 1.4, 0.6, 0, 0, 40);
    this._noise(1.2, "lowpass", 300, 1, 0.5, 0, 0.2);
  }
  grunt() { if (Math.random() < 0.5) this._tone("square", rand(90, 130), 0.1, 0.25, 0, 0, 70); }
  landThud() { this._noise(0.08, "lowpass", 250, 1, 0.3); }
  noAmmo() { this._tone("square", 800, 0.05, 0.15); }
  faceQuip() { [150, 130, 110, 140].forEach((f, i) => this._tone("square", f, 0.09, 0.3, 0, i * 0.1)); }

  // ================= Music sequencer =================
  setMusic(mode) {
    if (this.musicMode !== mode) { this.musicMode = mode; }
  }

  _startSequencer() {
    if (this._seqTimer) return;
    this._nextTime = this.ctx.currentTime + 0.1;
    this._seqTimer = setInterval(() => this._schedule(), 40);
  }

  _schedule() {
    if (!this.started) return;
    const mode = this.musicMode;
    if (mode === "off") { this._nextTime = this.ctx.currentTime + 0.1; return; }
    const bpm = mode === "boss" ? 172 : mode === "combat" ? 152 : mode === "lowhp" ? 120 : mode === "title" ? 96 : 104;
    const spb = 60 / bpm / 4; // 16th note
    while (this._nextTime < this.ctx.currentTime + 0.18) {
      this._playStep(this._step, this._bar, this._nextTime, spb, mode);
      this._nextTime += spb;
      this._step++;
      if (this._step >= 16) { this._step = 0; this._bar++; }
    }
  }

  _mtone(type, freq, t, dur, peak, bus, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _mkick(t, v) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.25);
  }
  _msnare(t, v) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = 1.4;
    const f = this.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t); src.stop(t + 0.16);
  }
  _mhat(t, v, open = false) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = 2;
    const f = this.ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.18 : 0.04));
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t); src.stop(t + 0.2);
  }
  _chord(t, root, dur, v) {
    // power chord: root + fifth + octave, detuned saws
    this._mtone("sawtooth", root, t, dur, v * 0.5, this.musicBus, -7);
    this._mtone("sawtooth", root * 1.4983, t, dur, v * 0.45, this.musicBus, 6);
    this._mtone("square", root * 2, t, dur, v * 0.2, this.musicBus, 0);
  }

  _playStep(step, bar, t, spb, mode) {
    // E-phrygian-ish riff patterns (Hz, E2=82.4)
    const E2 = 82.41, F2 = 87.31, G2 = 98.0, A2 = 110.0, B2 = 123.47, D3 = 146.83, E1 = 41.2;
    const RIFF_EXPLORE = [E2, 0, 0, 0, E2, 0, F2, 0, E2, 0, 0, 0, G2, 0, F2, 0];
    const RIFF_COMBAT  = [E2, E2, 0, E2, 0, E2, F2, 0, E2, E2, 0, E2, G2, 0, F2, D3];
    const RIFF_BOSS    = [E2, E2, F2, E2, G2, E2, F2, E2, E2, E2, A2, G2, F2, E2, D3, F2];
    const RIFF_TITLE   = [E2, 0, 0, 0, 0, 0, F2, 0, 0, 0, D3, 0, 0, 0, 0, 0];
    const riff = mode === "boss" ? RIFF_BOSS : mode === "combat" ? RIFF_COMBAT
               : mode === "title" ? RIFF_TITLE : RIFF_EXPLORE;
    const note = riff[step];

    const driving = mode === "combat" || mode === "boss";
    const v = driving ? 1 : mode === "title" ? 0.8 : 0.65;

    if (note) {
      this._chord(t, note * 0.5, spb * (driving ? 1.9 : 3.6), 0.30 * v);
      // bass follows
      this._mtone("sawtooth", note * 0.25, t, spb * 1.8, 0.30 * v);
    }
    // bass pulse on 8ths in combat
    if (driving && step % 2 === 0 && !note) this._mtone("sawtooth", (note || E2) * 0.25, t, spb * 1.4, 0.22);

    // drums
    if (driving) {
      if (step % 4 === 0) this._mkick(t, 0.5);
      if (mode === "boss" && step % 2 === 0) this._mkick(t, 0.32);
      if (step === 4 || step === 12) this._msnare(t, 0.4);
      this._mhat(t, step % 4 === 2 ? 0.16 : 0.08, step === 14);
    } else if (mode === "explore" || mode === "lowhp") {
      if (step === 0) this._mkick(t, 0.3);
      if (step === 8) this._mkick(t, 0.22);
      if (step % 8 === 6) this._msnare(t, 0.14);
      if (step % 4 === 2) this._mhat(t, 0.06);
    } else if (mode === "title") {
      if (step === 0) this._mkick(t, 0.4);
      if (step % 8 === 4) this._msnare(t, 0.2);
    }

    // melody lead every 2 bars in explore/title (eerie high line)
    if ((mode === "explore" || mode === "title") && bar % 2 === 1) {
      const MEL = { 0: 329.6, 3: 311.1, 6: 293.7, 9: 261.6, 12: 246.9, 15: 293.7 }; // E4 Eb4 D4 C4 B3 D4
      const f = MEL[step];
      if (f) this._mtone("triangle", f, t, spb * 2.6, 0.12);
    }
    // lowhp heartbeat-ish
    if (mode === "lowhp" && (step === 0 || step === 3)) this._mkick(t, 0.5);
  }
}

export const AUDIO = new AudioEngine();
