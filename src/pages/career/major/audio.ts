// [Major espetáculo] Som OPCIONAL, sintetizado na hora em Web Audio (nenhum
// arquivo de terceiros). Desligado por padrão; a escolha fica neste navegador.
import { useSyncExternalStore } from 'react';

const KEY = 'rtm-major-sound';
const listeners = new Set<() => void>();
let enabled = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
let ctx: AudioContext | null = null;

export function soundOn(): boolean { return enabled; }
export function setSound(on: boolean): void {
  enabled = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* sem storage: vale só nesta sessão */ }
  listeners.forEach((l) => l());
  if (on) play('tick');
}
export function useSound(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, soundOn, () => false);
  return [on, setSound];
}

function ac(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) { try { ctx = new Ctor(); } catch { return null; } }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, gain: number): void {
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at); o.stop(at + dur + 0.05);
}

/** torcida: ruído rosa filtrado subindo e descendo */
function crowd(c: AudioContext, at: number, dur: number, peak: number): void {
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0; let b1 = 0; let b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
    d[i] = (b0 + b1 + b2) * 0.35;
  }
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(at); src.stop(at + dur);
}

export type Cue = 'tick' | 'go' | 'intro' | 'walkout' | 'fanfare' | 'consolation' | 'hit' | 'miss';

export function play(cue: Cue): void {
  const c = ac(); if (!c) return;
  const t = c.currentTime + 0.01;
  switch (cue) {
    case 'tick': tone(c, 880, t, 0.08, 'square', 0.04); break;
    case 'go': tone(c, 1320, t, 0.35, 'square', 0.06); crowd(c, t, 1.6, 0.25); break;
    case 'hit': tone(c, 660, t, 0.09, 'triangle', 0.08); tone(c, 990, t + 0.08, 0.14, 'triangle', 0.08); break;
    case 'miss': tone(c, 300, t, 0.18, 'sawtooth', 0.04); break;
    case 'intro':
      [196, 247, 294, 392].forEach((f, i) => tone(c, f, t + i * 0.22, 0.5, 'sawtooth', 0.05));
      crowd(c, t + 0.4, 2.4, 0.18); break;
    case 'walkout':
      [110, 110, 147, 165].forEach((f, i) => tone(c, f, t + i * 0.3, 0.28, 'square', 0.06));
      crowd(c, t, 2, 0.22); break;
    case 'fanfare':
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.16, i === 5 ? 0.9 : 0.2, 'triangle', 0.09));
      crowd(c, t, 3.2, 0.32); break;
    case 'consolation':
      [392, 330, 392, 494].forEach((f, i) => tone(c, f, t + i * 0.28, 0.5, 'sine', 0.07)); break;
  }
}

/** prefers-reduced-motion como hook (com assinatura do media query) */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (l) => {
      const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
      mq?.addEventListener('change', l);
      return () => mq?.removeEventListener('change', l);
    },
    () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    () => false,
  );
}

/** "já vi esta abertura/walkout": por navegador, para não repetir a cada render */
export function seenOnce(key: string): boolean {
  try { return localStorage.getItem(`rtm-major-seen:${key}`) === '1'; } catch { return false; }
}
export function markSeen(key: string): void {
  try { localStorage.setItem(`rtm-major-seen:${key}`, '1'); } catch { /* ok */ }
}
