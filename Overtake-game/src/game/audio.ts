import type { EngineSpec } from "./cars";

/* ------------------------------------------------------------------ */
/* deterministic noise                                                 */
/* ------------------------------------------------------------------ */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Renders one complete four-stroke engine cycle (two crank revolutions) as a
 * looping wavetable. Each cylinder contributes a damped, resonant exhaust
 * pulse; looping the table and varying `playbackRate` reproduces the real
 * relationship between firing frequency and RPM, which is what makes the
 * result sound like an engine rather than a sawtooth oscillator.
 */
const BASE_RPM = 3000;

function renderEngineCycle(
  ctx: BaseAudioContext,
  spec: EngineSpec,
  loaded: boolean,
  seed: number,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const cycleSec = 120 / BASE_RPM; // 4-stroke -> 2 revolutions per cycle
  const len = Math.max(128, Math.round(cycleSec * sr));
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const rnd = makeRng(seed);
  const N = spec.cylinders;

  // decay rates: under load the pulse rings longer and harder
  const ring = loaded ? 108 : 168;
  const crack = loaded ? 760 : 1150;
  const res = spec.resonance;

  for (let c = 0; c < N; c++) {
    // firing position within the cycle, with crossplane unevenness
    let frac = c / N;
    if (spec.lope > 0) frac += ((c % 2 === 0 ? 1 : -1) * spec.lope) / (N * 2);
    frac += (rnd() - 0.5) * 0.004; // mechanical scatter
    const start = Math.round(frac * len);
    // per-cylinder amplitude and detune variance keeps it from sounding looped
    const amp = 0.82 + rnd() * 0.36;
    const det = 1 + (rnd() - 0.5) * 0.045;
    const phase = rnd() * Math.PI * 2;
    const dur = Math.min(len, Math.round(sr * (loaded ? 0.030 : 0.022)));

    for (let i = 0; i < dur; i++) {
      const t = i / sr;
      const env = Math.exp(-t * ring);
      const fast = Math.exp(-t * crack);
      const f = res * det;
      let s = Math.sin(2 * Math.PI * f * t + phase);
      s += Math.sin(2 * Math.PI * f * 2 * t + phase * 1.7) * (loaded ? 0.62 : 0.34);
      s += Math.sin(2 * Math.PI * f * 3 * t + phase * 2.3) * (loaded ? 0.38 : 0.15);
      s += Math.sin(2 * Math.PI * f * 4.5 * t + phase * 0.9) * (loaded ? 0.2 : 0.06) * spec.harshness;
      s += Math.sin(2 * Math.PI * f * 0.5 * t + phase) * spec.bass * 0.55;
      s *= env;
      // combustion crack / valve clatter
      s += (rnd() * 2 - 1) * fast * (loaded ? 0.6 : 0.34) * (0.35 + spec.harshness);
      d[(start + i) % len] += s * amp;
    }
  }

  // DC removal + normalise
  let mean = 0;
  for (let i = 0; i < len; i++) mean += d[i];
  mean /= len;
  let peak = 1e-6;
  for (let i = 0; i < len; i++) {
    d[i] -= mean;
    peak = Math.max(peak, Math.abs(d[i]));
  }
  const g = 0.92 / peak;
  for (let i = 0; i < len; i++) d[i] *= g;
  return buf;
}

function makeNoiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rnd = makeRng(seed);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd() * 2 - 1;
    last = last * 0.35 + w * 0.65; // gently coloured
    d[i] = last;
  }
  return buf;
}

function makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = amount * 42;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/* ------------------------------------------------------------------ */
/* engine voice                                                        */
/* ------------------------------------------------------------------ */
class EngineVoice {
  private ctx: AudioContext;
  private spec: EngineSpec;
  out: GainNode;

  private srcLoad: AudioBufferSourceNode;
  private srcCoast: AudioBufferSourceNode;
  private gLoad: GainNode;
  private gCoast: GainNode;
  private lp: BiquadFilterNode;
  private body: BiquadFilterNode;
  private hp: BiquadFilterNode;
  private shaper: WaveShaperNode;
  private post: GainNode;

  private intakeSrc: AudioBufferSourceNode;
  private intakeBp: BiquadFilterNode;
  private intakeGain: GainNode;

  private turboOsc: OscillatorNode;
  private turboGain: GainNode;
  private whineOsc: OscillatorNode;
  private whineGain: GainNode;

  private rpm = 800;
  private boostSpool = 0;
  private lastThrottle = 0;
  private limiterPhase = 0;

  constructor(ctx: AudioContext, spec: EngineSpec, destination: AudioNode) {
    this.ctx = ctx;
    this.spec = spec;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);

    // --- combustion wavetables -------------------------------------
    this.post = ctx.createGain();
    this.post.gain.value = 1;

    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = makeDriveCurve(0.35 + spec.harshness * 0.5);
    this.shaper.oversample = "2x";

    this.hp = ctx.createBiquadFilter();
    this.hp.type = "highpass";
    this.hp.frequency.value = 34;

    this.body = ctx.createBiquadFilter();
    this.body.type = "peaking";
    this.body.frequency.value = spec.resonance * 1.5;
    this.body.Q.value = 1.1;
    this.body.gain.value = 4 + spec.bass * 5;

    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 1400;
    this.lp.Q.value = 0.8;

    this.gLoad = ctx.createGain();
    this.gCoast = ctx.createGain();
    this.gLoad.gain.value = 0;
    this.gCoast.gain.value = 1;

    this.srcLoad = ctx.createBufferSource();
    this.srcLoad.buffer = renderEngineCycle(ctx, spec, true, 0x51f3 + spec.cylinders * 97);
    this.srcLoad.loop = true;
    this.srcCoast = ctx.createBufferSource();
    this.srcCoast.buffer = renderEngineCycle(ctx, spec, false, 0x9d21 + spec.cylinders * 31);
    this.srcCoast.loop = true;

    this.srcLoad.connect(this.gLoad);
    this.srcCoast.connect(this.gCoast);
    this.gLoad.connect(this.hp);
    this.gCoast.connect(this.hp);
    this.hp.connect(this.body);
    this.body.connect(this.shaper);
    this.shaper.connect(this.lp);
    this.lp.connect(this.post);
    this.post.connect(this.out);

    // --- intake / induction roar -----------------------------------
    this.intakeSrc = ctx.createBufferSource();
    this.intakeSrc.buffer = makeNoiseBuffer(ctx, 2.5, 0x1234);
    this.intakeSrc.loop = true;
    this.intakeBp = ctx.createBiquadFilter();
    this.intakeBp.type = "bandpass";
    this.intakeBp.frequency.value = 420;
    this.intakeBp.Q.value = 0.9;
    this.intakeGain = ctx.createGain();
    this.intakeGain.gain.value = 0;
    this.intakeSrc.connect(this.intakeBp);
    this.intakeBp.connect(this.intakeGain);
    this.intakeGain.connect(this.out);

    // --- turbo / supercharger --------------------------------------
    this.turboOsc = ctx.createOscillator();
    this.turboOsc.type = "sine";
    this.turboOsc.frequency.value = 2400;
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turboOsc.connect(this.turboGain);
    this.turboGain.connect(this.out);

    // --- straight-cut gear whine -----------------------------------
    this.whineOsc = ctx.createOscillator();
    this.whineOsc.type = "sawtooth";
    this.whineOsc.frequency.value = 900;
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    const whineFilter = ctx.createBiquadFilter();
    whineFilter.type = "bandpass";
    whineFilter.frequency.value = 3000;
    whineFilter.Q.value = 4;
    this.whineOsc.connect(whineFilter);
    whineFilter.connect(this.whineGain);
    this.whineGain.connect(this.out);

    const t = ctx.currentTime;
    this.srcLoad.start(t);
    this.srcCoast.start(t + 0.0007); // tiny offset avoids phase cancellation
    this.intakeSrc.start(t);
    this.turboOsc.start(t);
    this.whineOsc.start(t);
  }

  /**
   * @param rpm     actual crank RPM
   * @param throttle 0..1
   * @param volume  master engine volume 0..1
   * @param dt      seconds since last update
   */
  update(rpm: number, throttle: number, volume: number, dt: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const spec = this.spec;
    const smooth = 0.055;

    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 14);
    const r = this.rpm;
    const revFrac = Math.min(1.06, (r - spec.idleRpm) / (spec.redlineRpm - spec.idleRpm));

    // rev limiter stutter
    let limiterCut = 1;
    if (r > spec.redlineRpm * 0.985) {
      this.limiterPhase += dt * 42;
      limiterCut = Math.sin(this.limiterPhase) > 0 ? 1 : 0.25;
    }

    // playback rate maps directly to firing frequency
    const rate = Math.max(0.18, Math.min(3.6, r / BASE_RPM));
    this.srcLoad.playbackRate.setTargetAtTime(rate, t, smooth * 0.6);
    this.srcCoast.playbackRate.setTargetAtTime(rate * 0.999, t, smooth * 0.6);

    // crossfade combustion character with engine load
    const load = Math.min(1, throttle);
    this.gLoad.gain.setTargetAtTime(0.25 + load * 0.85, t, smooth);
    this.gCoast.gain.setTargetAtTime(0.85 - load * 0.6, t, smooth);

    // brightness opens up with revs and throttle
    const cutoff = 380 + revFrac * 3400 * (0.42 + load * 0.72) + spec.harshness * 500;
    this.lp.frequency.setTargetAtTime(Math.min(15000, cutoff), t, smooth);
    this.body.frequency.setTargetAtTime(spec.resonance * (1.35 + revFrac * 0.55), t, smooth);

    // overall level: idle is quiet, full throttle at the limiter is loudest
    const level =
      (0.16 + revFrac * 0.3 + load * 0.36) * limiterCut * volume * (0.55 + spec.bass * 0.4);
    this.out.gain.setTargetAtTime(Math.max(0, level), t, smooth);

    // induction noise rises hard with throttle
    this.intakeBp.frequency.setTargetAtTime(300 + revFrac * 1500, t, smooth);
    this.intakeGain.gain.setTargetAtTime(load * (0.05 + revFrac * 0.11) * volume, t, smooth);

    // turbo spools with sustained throttle, dumps on lift
    const targetSpool = load * revFrac;
    this.boostSpool += (targetSpool - this.boostSpool) * Math.min(1, dt * (load > 0.5 ? 1.6 : 5));
    if (spec.turbo > 0) {
      this.turboOsc.frequency.setTargetAtTime(1800 + this.boostSpool * 6200, t, 0.09);
      this.turboGain.gain.setTargetAtTime(this.boostSpool * spec.turbo * 0.035 * volume, t, 0.09);
      // blow-off valve on throttle lift
      if (this.lastThrottle > 0.55 && load < 0.15 && this.boostSpool > 0.35) this.blowOff();
    }

    // gear / supercharger whine tracks engine order
    if (spec.whine > 0) {
      this.whineOsc.frequency.setTargetAtTime(Math.min(9000, 160 + r * 0.62), t, smooth);
      this.whineGain.gain.setTargetAtTime(
        (0.1 + load * 0.5) * revFrac * spec.whine * 0.03 * volume,
        t,
        smooth,
      );
    }

    this.lastThrottle = load;
  }

  private lastBov = 0;
  private blowOff() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (t - this.lastBov < 0.6) return;
    this.lastBov = t;
    this.boostSpool = 0;
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, 0.35, (Math.random() * 1e6) | 0);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(4200, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.28);
    bp.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * this.spec.turbo, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.out);
    src.start(t);
    src.stop(t + 0.36);
  }

  /** brief ignition-cut pop when changing gear */
  shiftPop() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.post.gain.cancelScheduledValues(t);
    this.post.gain.setValueAtTime(1, t);
    this.post.gain.linearRampToValueAtTime(0.25, t + 0.02);
    this.post.gain.linearRampToValueAtTime(1, t + 0.12);
    if (this.spec.harshness > 0.5) {
      const src = ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(ctx, 0.12, (Math.random() * 1e6) | 0);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1400;
      bp.Q.value = 2.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.out);
      src.start(t + 0.02);
      src.stop(t + 0.16);
    }
  }

  dispose() {
    try {
      this.srcLoad.stop();
      this.srcCoast.stop();
      this.intakeSrc.stop();
      this.turboOsc.stop();
      this.whineOsc.stop();
    } catch {
      /* noop */
    }
    this.out.disconnect();
  }
}

/* ------------------------------------------------------------------ */
/* music                                                               */
/* ------------------------------------------------------------------ */
const MUSIC_BASE = "https://archive.org/download/royalty-free-music/";

export interface MusicTrack {
  title: string;
  file: string;
}

/**
 * "Royalty Free Music" by Nver Avetyan — archive.org, free for any use.
 * Streamed directly so the build stays a single small HTML file.
 */
export const MUSIC_TRACKS: MusicTrack[] = [
  { title: "Synthwave", file: "Synthwave.mp3" },
  { title: "Midnight Synthwave", file: "Midnight Synthwave.mp3" },
  { title: "Synthwave Phonk", file: "Synthwave Phonk.mp3" },
  { title: "Phonk Drift", file: "Phonk Drift (Royalty Free Music).mp3" },
  { title: "Titan Zone", file: "Titan Zone (Synthwave House).mp3" },
  { title: "Aggressive Action", file: "Aggressive Action (Cyberpunk).mp3" },
  { title: "Unity Terminal", file: "Unity Terminal (Synthwave Cyberpunk).mp3" },
  { title: "Blade Voltage", file: "Blade Voltage (Dark Cyberpunk).mp3" },
  { title: "System Interface", file: "System Interface (Synthwave House).mp3" },
  { title: "Outrun Click", file: "Outrun Click (Ibiza House).mp3" },
  { title: "Synthwave 80", file: "Synthwave 80.mp3" },
  { title: "Warm Retrowave", file: "Warm Retrowave.mp3" },
];

export type MusicStatus = "idle" | "loading" | "playing" | "error";

export class MusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private order: number[] = [];
  private cursor = 0;
  private failures = 0;
  private volume = 0.5;
  private masterMul = 1;
  private enabled = true;
  private wanted = false;
  private fadeTimer = 0;
  status: MusicStatus = "idle";
  title = "";
  onChange: (() => void) | null = null;

  constructor() {
    this.reshuffle(true);
  }

  private notify() {
    this.onChange?.();
  }

  reshuffle(shuffle: boolean) {
    this.order = MUSIC_TRACKS.map((_, i) => i);
    if (shuffle) {
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
    }
    this.cursor = 0;
  }

  private ensure(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const a = new Audio();
    a.preload = "auto";
    a.loop = false;
    a.volume = 0;
    a.addEventListener("ended", () => this.next());
    a.addEventListener("error", () => {
      this.failures++;
      this.status = "error";
      this.notify();
      if (this.failures < MUSIC_TRACKS.length) this.next();
    });
    a.addEventListener("playing", () => {
      this.failures = 0;
      this.status = "playing";
      this.notify();
    });
    a.addEventListener("waiting", () => {
      this.status = "loading";
      this.notify();
    });
    this.audio = a;
    return a;
  }

  private load(play: boolean) {
    const a = this.ensure();
    const track = MUSIC_TRACKS[this.order[this.cursor % this.order.length]];
    this.title = track.title;
    this.status = "loading";
    a.src = MUSIC_BASE + encodeURIComponent(track.file);
    a.load();
    this.notify();
    if (play) void this.tryPlay();
  }

  private async tryPlay() {
    const a = this.ensure();
    try {
      await a.play();
      this.fadeTo(this.enabled ? this.volume * this.masterMul : 0);
    } catch {
      // autoplay blocked — will retry on the next user gesture
      this.status = "idle";
      this.notify();
    }
  }

  start() {
    this.wanted = true;
    if (!this.enabled) return;
    if (!this.audio || !this.audio.src) this.load(true);
    else if (this.audio.paused) void this.tryPlay();
    else this.fadeTo(this.volume * this.masterMul);
  }

  stop() {
    this.wanted = false;
    this.fadeTo(0, () => this.audio?.pause());
  }

  next() {
    this.cursor = (this.cursor + 1) % this.order.length;
    this.load(this.wanted && this.enabled);
  }

  prev() {
    this.cursor = (this.cursor - 1 + this.order.length) % this.order.length;
    this.load(this.wanted && this.enabled);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) {
      this.fadeTo(0, () => this.audio?.pause());
      this.status = "idle";
      this.notify();
    } else if (this.wanted) {
      this.start();
    }
  }

  setVolume(v: number, masterMul = this.masterMul) {
    this.volume = v;
    this.masterMul = masterMul;
    if (this.audio && !this.audio.paused && this.enabled) {
      window.clearInterval(this.fadeTimer);
      this.audio.volume = Math.max(0, Math.min(1, v * masterMul));
    }
  }

  private fadeTo(target: number, done?: () => void) {
    const a = this.audio;
    if (!a) return;
    window.clearInterval(this.fadeTimer);
    const clamped = Math.max(0, Math.min(1, target));
    this.fadeTimer = window.setInterval(() => {
      const diff = clamped - a.volume;
      if (Math.abs(diff) < 0.02) {
        a.volume = clamped;
        window.clearInterval(this.fadeTimer);
        done?.();
        return;
      }
      a.volume = Math.max(0, Math.min(1, a.volume + Math.sign(diff) * 0.02));
    }, 30);
  }

  dispose() {
    window.clearInterval(this.fadeTimer);
    this.audio?.pause();
    this.audio = null;
  }
}

/* ------------------------------------------------------------------ */
/* main SFX bus                                                        */
/* ------------------------------------------------------------------ */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private engineBus: GainNode | null = null;

  private engine: EngineVoice | null = null;
  private engineKey = "";

  private skidGain: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private noiseSrc: AudioBufferSourceNode | null = null;

  music = new MusicPlayer();

  private vol = { master: 0.85, engine: 0.8, sfx: 0.85, music: 0.5 };
  private muted = false;
  private started = false;

  get ready() {
    return this.started;
  }

  resume() {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.started = true;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 22;
      comp.ratio.value = 5;
      comp.attack.value = 0.005;
      comp.release.value = 0.2;
      comp.connect(ctx.destination);

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.vol.master;
      master.connect(comp);
      this.master = master;

      const sfxBus = ctx.createGain();
      sfxBus.gain.value = this.vol.sfx;
      sfxBus.connect(master);
      this.sfxBus = sfxBus;

      const engineBus = ctx.createGain();
      engineBus.gain.value = this.vol.engine;
      engineBus.connect(master);
      this.engineBus = engineBus;

      // shared rolling noise source for tyres / wind
      const noise = ctx.createBufferSource();
      noise.buffer = makeNoiseBuffer(ctx, 3, 0xbeef);
      noise.loop = true;

      const skidF = ctx.createBiquadFilter();
      skidF.type = "bandpass";
      skidF.frequency.value = 1500;
      skidF.Q.value = 2.4;
      const skidG = ctx.createGain();
      skidG.gain.value = 0;
      noise.connect(skidF);
      skidF.connect(skidG);
      skidG.connect(sfxBus);
      this.skidFilter = skidF;
      this.skidGain = skidG;

      const rollF = ctx.createBiquadFilter();
      rollF.type = "lowpass";
      rollF.frequency.value = 700;
      const rollG = ctx.createGain();
      rollG.gain.value = 0;
      noise.connect(rollF);
      rollF.connect(rollG);
      rollG.connect(sfxBus);
      this.rollFilter = rollF;
      this.rollGain = rollG;

      const windF = ctx.createBiquadFilter();
      windF.type = "highpass";
      windF.frequency.value = 2200;
      const windG = ctx.createGain();
      windG.gain.value = 0;
      noise.connect(windF);
      windF.connect(windG);
      windG.connect(sfxBus);
      this.windGain = windG;

      noise.start();
      this.noiseSrc = noise;
    } catch {
      this.started = false;
    }
  }

  setVolumes(v: { master: number; engine: number; sfx: number; music: number }) {
    this.vol = v;
    const mul = this.muted ? 0 : 1;
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(v.master * mul, t, 0.05);
      this.sfxBus?.gain.setTargetAtTime(v.sfx, t, 0.05);
      this.engineBus?.gain.setTargetAtTime(v.engine, t, 0.05);
    }
    this.music.setVolume(v.music, v.master * mul);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.setVolumes(this.vol);
  }

  /** (re)build the engine voice for a specific car */
  setEngineSpec(spec: EngineSpec, key: string) {
    if (!this.ctx || !this.engineBus) return;
    if (this.engineKey === key && this.engine) return;
    this.engine?.dispose();
    this.engine = new EngineVoice(this.ctx, spec, this.engineBus);
    this.engineKey = key;
  }

  updateEngine(rpm: number, throttle: number, dt: number, active: boolean) {
    if (!this.engine) return;
    this.engine.update(rpm, active ? throttle : 0, active ? 1 : 0, dt);
  }

  shiftPop() {
    this.engine?.shiftPop();
  }

  /** tyre slip 0..1, surface roughness 0..1, road speed 0..1 */
  setTyres(slip: number, rough: number, speed: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.skidFilter?.frequency.setTargetAtTime(900 + slip * 1400, t, 0.08);
    this.skidGain?.gain.setTargetAtTime(slip * 0.22, t, 0.06);
    this.rollFilter?.frequency.setTargetAtTime(240 + speed * 900 + rough * 500, t, 0.1);
    this.rollGain?.gain.setTargetAtTime(speed * (0.05 + rough * 0.16), t, 0.1);
    this.windGain?.gain.setTargetAtTime(Math.pow(speed, 2.2) * 0.09, t, 0.12);
  }

  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.skidGain?.gain.setTargetAtTime(0, t, 0.05);
    this.rollGain?.gain.setTargetAtTime(0, t, 0.05);
    this.windGain?.gain.setTargetAtTime(0, t, 0.05);
    this.engine?.update(800, 0, 0, 0.016);
  }

  beep(freq: number, dur = 0.18, type: OscillatorType = "triangle") {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o2.type = "sine";
    o2.frequency.value = freq * 2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o2.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  uiClick() {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(920, t);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.08);
    o2.type = "sine";
    o2.frequency.setValueAtTime(1480, t);
    o2.frequency.exponentialRampToValueAtTime(880, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g);
    o2.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.11);
    o2.stop(t + 0.11);
  }

  uiHover() {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(950, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.065);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.08);
  }

  uiWhoosh(dir: number) {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(this.ctx, 0.4, (Math.random() * 1e6) | 0);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(dir > 0 ? 2200 : 350, t + 0.25);
    bp.Q.value = 1.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.32);
  }

  private lastThud = 0;
  thud(strength = 1) {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    if (t - this.lastThud < 0.14) return;
    this.lastThud = t;
    const len = Math.floor(this.ctx.sampleRate * 0.3);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    const rnd = makeRng((Math.random() * 1e9) | 0);
    for (let i = 0; i < len; i++) {
      const k = 1 - i / len;
      d[i] = (rnd() * 2 - 1) * k * k * k;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(160, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.value = 0.55 * strength;
    // metallic ring on top of the impact
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.2);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.16 * strength, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    o.connect(og);
    og.connect(this.sfxBus);
    src.start(t);
    o.start(t);
    o.stop(t + 0.26);
  }

  nitro() {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(this.ctx, 0.6, (Math.random() * 1e6) | 0);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + 0.35);
    bp.Q.value = 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.55);
  }

  dispose() {
    try {
      this.engine?.dispose();
      this.noiseSrc?.stop();
      this.music.dispose();
      void this.ctx?.close();
    } catch {
      /* noop */
    }
  }
}
