// Premium ambient WebAudio synth for the Crash game — Aviator / Lucky Jet
// profile. Sounds are generated procedurally so no binary assets are needed,
// but each routine is tuned for soft, low-amplitude, non-fatiguing output:
//
//  - Background music: slow evolving minor pad (replaces sharp chord stack)
//  - Flight hum: soft ascending drone that follows the multiplier
//  - Bet click: gentle low-bass coin / chip tick
//  - Cashout: warm bell-like harmonic chime
//  - Bust: smooth descending whistle / vacuum drop-off (no explosion)
//
// The exported surface (sfx.*, startHum/updateHum/stopHum, startBgm/stopBgm,
// getSettings/setSettings, CrashSettingsTopic) is preserved so the Sound /
// Music toggle controls in the rest of the app keep working unchanged.

import { bus } from './bus';

const SETTINGS_KEY = 'b4bet.crash.ui.v1';
export type CrashUiSettings = { sound: boolean; music: boolean; animation: boolean };

export const CrashSettingsTopic = 'crash:ui:settings';

function read(): CrashUiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { sound: true, music: true, animation: true, ...JSON.parse(raw) };
  } catch { /* */ }
  return { sound: true, music: true, animation: true };
}

let current: CrashUiSettings = read();
export const getSettings = () => current;
export function setSettings(next: CrashUiSettings) {
  current = next;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* */ }
  bus.emit(CrashSettingsTopic, next);
  if (next.music) startBgm(); else stopBgm();
}

// When the Crash view is not mounted, silence every source unconditionally so
// leaving the game (route change / unmount) instantly stops music, hum and sfx.
let active = false;
export function setCrashAudioActive(v: boolean) {
  active = v;
  if (!v) { stopBgm(); stopHum(); }
}


let ctx: AudioContext | null = null;
let master: GainNode | null = null;
function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      ctx = new Ctor();
      master = ctx.createGain();
      // Global soft ceiling — keeps all sources low-amplitude.
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    } catch { return null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => { /* */ });
  return ctx;
}
function dest(): AudioNode | null {
  const a = ac();
  return a && master ? master : null;
}

// ---- Helpers -------------------------------------------------------------
function envTone(opts: {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  sweepTo?: number;
  attack?: number;
  release?: number;
  lp?: number;
}) {
  if (!active || !current.sound) return;

  const a = ac(); const out = dest(); if (!a || !out) return;
  const o = a.createOscillator();
  const g = a.createGain();
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = opts.lp ?? 4200;
  o.type = opts.type || 'sine';
  o.frequency.setValueAtTime(opts.freq, a.currentTime);
  if (opts.sweepTo) {
    o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.sweepTo), a.currentTime + opts.dur);
  }
  const peak = opts.gain ?? 0.12;
  const attack = opts.attack ?? 0.012;
  const release = opts.release ?? opts.dur;
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(peak, a.currentTime + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + attack + release);
  o.connect(lp).connect(g).connect(out);
  o.start();
  o.stop(a.currentTime + opts.dur + 0.05);
}

// ---- SFX -----------------------------------------------------------------
export const sfx = {
  // Soft, low-bass coin / chip click for stake changes & bet placement.
  bet() {
    envTone({ freq: 180, dur: 0.07, type: 'sine', gain: 0.18, attack: 0.005, release: 0.06, lp: 1800 });
    setTimeout(() => envTone({ freq: 360, dur: 0.09, type: 'triangle', gain: 0.09, attack: 0.004, release: 0.08, lp: 2400 }), 18);
  },
  // Warm bell-like chime — pleasant cashout jingle.
  cashout() {
    const base = 523.25; // C5
    [1, 1.5, 2.0].forEach((mult, i) => {
      setTimeout(() => envTone({
        freq: base * mult,
        dur: 0.55,
        type: 'sine',
        gain: 0.14 - i * 0.025,
        attack: 0.008,
        release: 0.5,
        lp: 5200,
      }), i * 90);
    });
    // gentle sub-shimmer
    setTimeout(() => envTone({ freq: 1568, dur: 0.4, type: 'sine', gain: 0.05, attack: 0.02, release: 0.38, lp: 7200 }), 60);
  },
  // Smooth whistle / vacuum drop-off — no explosion.
  crash() {
    envTone({ freq: 880, sweepTo: 90, dur: 0.7, type: 'sine', gain: 0.16, attack: 0.02, release: 0.65, lp: 2400 });
    envTone({ freq: 440, sweepTo: 55, dur: 0.85, type: 'triangle', gain: 0.08, attack: 0.04, release: 0.8, lp: 1400 });
  },
  // Subtle launch tick — round starts ascending.
  start() {
    envTone({ freq: 320, dur: 0.18, type: 'sine', gain: 0.1, attack: 0.01, release: 0.16, lp: 3000 });
  },
};

// ---- Flight hum (ascending drone) ----------------------------------------
// Two detuned oscillators through a lowpass filter create a soft, breathy
// drone that opens up and rises in pitch as the multiplier grows.
let humOscA: OscillatorNode | null = null;
let humOscB: OscillatorNode | null = null;
let humGain: GainNode | null = null;
let humFilter: BiquadFilterNode | null = null;
export function startHum() {
  if (!active || !current.sound) return;
  const a = ac(); const out = dest(); if (!a || !out || humOscA) return;
  humOscA = a.createOscillator();
  humOscB = a.createOscillator();
  humGain = a.createGain();
  humFilter = a.createBiquadFilter();
  humFilter.type = 'lowpass';
  humFilter.frequency.value = 700;
  humFilter.Q.value = 0.6;
  humOscA.type = 'sine';
  humOscB.type = 'triangle';
  humOscA.frequency.value = 110;
  humOscB.frequency.value = 110 * 1.005; // gentle detune
  humGain.gain.value = 0.0001;
  humGain.gain.exponentialRampToValueAtTime(0.045, a.currentTime + 0.35);
  humOscA.connect(humFilter);
  humOscB.connect(humFilter);
  humFilter.connect(humGain).connect(out);
  humOscA.start();
  humOscB.start();
}
export function updateHum(multiplier: number) {
  if (!humOscA || !humOscB || !humGain || !humFilter) return;
  const a = ac(); if (!a) return;
  const base = 110 + Math.min(360, Math.log2(Math.max(1, multiplier)) * 180);
  humOscA.frequency.setTargetAtTime(base, a.currentTime, 0.08);
  humOscB.frequency.setTargetAtTime(base * 1.005, a.currentTime, 0.08);
  // Filter opens with multiplier for a "lifting" sensation.
  const cutoff = Math.min(3800, 700 + multiplier * 220);
  humFilter.frequency.setTargetAtTime(cutoff, a.currentTime, 0.1);
  // Gentle volume swell — capped low.
  const peak = Math.min(0.08, 0.04 + Math.log2(Math.max(1, multiplier)) * 0.012);
  humGain.gain.setTargetAtTime(current.sound ? peak : 0.0001, a.currentTime, 0.1);
}
export function stopHum() {
  if (!humOscA || !humOscB || !humGain) return;
  const a = ac();
  if (a) humGain.gain.setTargetAtTime(0.0001, a.currentTime, 0.08);
  const oA = humOscA; const oB = humOscB;
  setTimeout(() => { try { oA.stop(); oB.stop(); } catch { /* */ } }, 260);
  humOscA = null; humOscB = null; humGain = null; humFilter = null;
}

// ---- Background music (slow ambient pad) ---------------------------------
// Evolving A-minor pad. Each voice has its own LFO; a shared lowpass keeps it
// warm and behind the action so it never fatigues the listener.
interface PadVoice { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode; }
let bgmVoices: PadVoice[] = [];
let bgmBus: { filter: BiquadFilterNode; gain: GainNode } | null = null;
export function startBgm() {
  if (!active || !current.music) return;
  if (bgmVoices.length) return;
  const a = ac(); const out = dest(); if (!a || !out) return;

  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  filter.Q.value = 0.4;
  const busGain = a.createGain();
  busGain.gain.value = 0.0001;
  busGain.gain.exponentialRampToValueAtTime(0.18, a.currentTime + 2.5);
  filter.connect(busGain).connect(out);
  bgmBus = { filter, gain: busGain };

  // A minor chord voiced low + soft fifth on top.
  const chord = [
    { f: 110, type: 'sine' as OscillatorType, g: 0.05 },     // A2
    { f: 164.81, type: 'sine' as OscillatorType, g: 0.04 },  // E3
    { f: 261.63, type: 'triangle' as OscillatorType, g: 0.03 }, // C4
    { f: 329.63, type: 'sine' as OscillatorType, g: 0.025 }, // E4
  ];
  bgmVoices = chord.map((v, i) => {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = v.type;
    osc.frequency.value = v.f;
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(v.g, a.currentTime + 3.0 + i * 0.4);
    osc.connect(gain).connect(filter);
    osc.start();

    // Slow LFO for organic frequency drift.
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.05 + i * 0.018;
    lfoGain.gain.value = 0.6 + i * 0.2;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start();

    return { osc, gain, lfo };
  });
}
export function stopBgm() {
  const a = ac();
  if (bgmBus && a) {
    bgmBus.gain.gain.setTargetAtTime(0.0001, a.currentTime, 0.6);
  }
  const voices = bgmVoices;
  const busRef = bgmBus;
  bgmVoices = [];
  bgmBus = null;
  setTimeout(() => {
    voices.forEach(({ osc, lfo }) => {
      try { osc.stop(); } catch { /* */ }
      try { lfo.stop(); } catch { /* */ }
    });
    if (busRef) {
      try { busRef.filter.disconnect(); } catch { /* */ }
      try { busRef.gain.disconnect(); } catch { /* */ }
    }
  }, 1200);
}
