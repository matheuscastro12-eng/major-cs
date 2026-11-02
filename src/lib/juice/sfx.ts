// SFX sintetizados em WebAudio — zero arquivo de áudio, zero byte no bundle
// além deste módulo. Cada som é uma "receita" pura (lista de vozes com
// frequência, envelope e tempo), e o player só agenda osciladores a partir
// dela. A receita é testável sem DOM (scripts/test-juice.mts).
//
// Regras de etiqueta:
//  - O AudioContext só nasce DEPOIS de um gesto do usuário (pointerdown,
//    keydown, touchend). Antes disso playSfx() é no-op silencioso: nada de
//    aviso "AudioContext was not allowed to start" no console.
//  - Mudo (explícito, volume 0 ou reduced-motion sem escolha explícita) → no-op.
//  - O mesmo som não empilha em menos de SFX_MIN_GAP_MS (tick de timer em
//    re-render não vira metralhadora).

import { juicePrefs, prefersReducedMotion, soundMuted } from './prefs';

export type SfxName =
  | 'click'       // toque de UI / tick de decisão
  | 'lockIn'      // confirmação de escolha (call travada, lance, escalação)
  | 'reveal'      // revelação crescente de pack/walkout (use `tier`)
  | 'win'         // round/série/partida vencida
  | 'loss'        // derrota
  | 'achievement' // conquista, título, carta rara
  | 'timerTick'   // contagem regressiva (use `urgent` nos últimos segundos)
  | 'error';      // ação recusada

export const SFX_NAMES: readonly SfxName[] = [
  'click', 'lockIn', 'reveal', 'win', 'loss', 'achievement', 'timerTick', 'error',
];

/** Tier do reveal: 0 comum … 4 lendária/ícone. Mais tier = mais longo e mais agudo. */
export type RevealTier = 0 | 1 | 2 | 3 | 4;

export interface SfxOptions {
  tier?: RevealTier;
  urgent?: boolean;
  /** Multiplicador local (0..1) sobre o volume global. */
  gain?: number;
}

export interface SfxVoice {
  wave: OscillatorType;
  /** Hz no início. */
  freq: number;
  /** Hz no fim (glide exponencial). Omitido = constante. */
  freqEnd?: number;
  /** Segundos a partir do disparo. */
  at: number;
  /** Duração total em segundos (ataque + decaimento). */
  dur: number;
  /** Pico do envelope, 0..1 (antes do ganho mestre). */
  peak: number;
  /** Ataque em segundos (padrão 5 ms). */
  attack?: number;
}

export const SFX_MIN_GAP_MS = 40;

// Notas (Hz) usadas nas receitas — escala temperada, A4 = 440.
const N = {
  C4: 261.63, E4: 329.63, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, E6: 1318.5, G6: 1568.0,
  Eb4: 311.13, Ab3: 207.65, F3: 174.61, C3: 130.81,
};

/** Receita pura de um SFX. Mesmo input → mesma lista (sem aleatório). */
export function sfxRecipe(name: SfxName, opts: SfxOptions = {}): SfxVoice[] {
  switch (name) {
    case 'click':
      return [{ wave: 'triangle', freq: 1800, freqEnd: 1200, at: 0, dur: 0.045, peak: 0.35, attack: 0.002 }];

    case 'timerTick':
      return opts.urgent
        ? [
            { wave: 'square', freq: 1320, at: 0, dur: 0.06, peak: 0.22, attack: 0.002 },
            { wave: 'sine', freq: 660, at: 0, dur: 0.08, peak: 0.25, attack: 0.002 },
          ]
        : [{ wave: 'sine', freq: 990, at: 0, dur: 0.05, peak: 0.25, attack: 0.002 }];

    case 'lockIn':
      // "Thump" grave + estalo agudo: a sensação de travar.
      return [
        { wave: 'sine', freq: 180, freqEnd: 55, at: 0, dur: 0.18, peak: 0.8, attack: 0.003 },
        { wave: 'triangle', freq: 2400, freqEnd: 1600, at: 0, dur: 0.05, peak: 0.25, attack: 0.001 },
        { wave: 'sine', freq: N.A5, at: 0.05, dur: 0.16, peak: 0.18 },
      ];

    case 'reveal': {
      // Varredura subindo + notas de uma escala maior, uma por degrau de tier,
      // fechando num acorde que fica mais brilhante (oitava extra) no topo.
      const tier = Math.max(0, Math.min(4, Math.trunc(opts.tier ?? 0))) as RevealTier;
      const ladder = [N.C5, N.E5, N.G5, N.C6, N.E6];
      const steps = 2 + tier;              // 2..6 notas na subida
      const stepGap = 0.11 + tier * 0.015; // mais suspense nos tiers altos
      const voices: SfxVoice[] = [
        { wave: 'sawtooth', freq: 120, freqEnd: 480 + tier * 240, at: 0, dur: steps * stepGap + 0.1, peak: 0.08, attack: 0.05 },
      ];
      for (let i = 0; i < steps; i++) {
        const f = ladder[i % ladder.length] * (i >= ladder.length ? 2 : 1);
        voices.push({ wave: 'triangle', freq: f, at: i * stepGap, dur: 0.14, peak: 0.28 });
      }
      const hit = steps * stepGap;
      const chord = tier >= 3 ? [N.C5, N.E5, N.G5, N.C6, N.E6] : tier >= 1 ? [N.C5, N.E5, N.G5] : [N.C5, N.G5];
      for (const f of chord) voices.push({ wave: 'triangle', freq: f, at: hit, dur: 0.5 + tier * 0.15, peak: 0.22 });
      if (tier >= 4) voices.push({ wave: 'sine', freq: N.G6, at: hit + 0.08, dur: 0.9, peak: 0.12 });
      return voices;
    }

    case 'win':
      // Arpejo maior ascendente com a última nota sustentada.
      return [
        { wave: 'triangle', freq: N.C5, at: 0, dur: 0.14, peak: 0.3 },
        { wave: 'triangle', freq: N.E5, at: 0.09, dur: 0.14, peak: 0.3 },
        { wave: 'triangle', freq: N.G5, at: 0.18, dur: 0.14, peak: 0.3 },
        { wave: 'triangle', freq: N.C6, at: 0.27, dur: 0.45, peak: 0.32 },
        { wave: 'sine', freq: N.C4, at: 0.27, dur: 0.45, peak: 0.25 },
      ];

    case 'loss':
      // Descida menor, grave e curta — dói sem irritar.
      return [
        { wave: 'triangle', freq: N.G4, at: 0, dur: 0.22, peak: 0.28 },
        { wave: 'triangle', freq: N.Eb4, at: 0.18, dur: 0.22, peak: 0.28 },
        { wave: 'triangle', freq: N.C4, at: 0.36, dur: 0.5, peak: 0.28, attack: 0.01 },
        { wave: 'sine', freq: N.C3, freqEnd: N.Ab3 / 2, at: 0.36, dur: 0.55, peak: 0.25 },
      ];

    case 'achievement':
      // Fanfarra curta + brilho agudo (shimmer) — reservado para o dourado.
      return [
        { wave: 'triangle', freq: N.G4, at: 0, dur: 0.12, peak: 0.28 },
        { wave: 'triangle', freq: N.C5, at: 0.1, dur: 0.12, peak: 0.28 },
        { wave: 'triangle', freq: N.E5, at: 0.2, dur: 0.12, peak: 0.28 },
        { wave: 'triangle', freq: N.G5, at: 0.3, dur: 0.7, peak: 0.3 },
        { wave: 'triangle', freq: N.C5, at: 0.3, dur: 0.7, peak: 0.2 },
        { wave: 'sine', freq: N.E6, at: 0.38, dur: 0.25, peak: 0.1 },
        { wave: 'sine', freq: N.G6, at: 0.46, dur: 0.25, peak: 0.1 },
        { wave: 'sine', freq: N.C6 * 2, at: 0.54, dur: 0.4, peak: 0.08 },
      ];

    case 'error':
      return [
        { wave: 'square', freq: 220, at: 0, dur: 0.09, peak: 0.16, attack: 0.002 },
        { wave: 'square', freq: 165, at: 0.1, dur: 0.14, peak: 0.16, attack: 0.002 },
      ];
  }
}

/** Duração total (s) de uma receita — útil para sincronizar animação com som. */
export function sfxDuration(voices: readonly SfxVoice[]): number {
  return voices.reduce((m, v) => Math.max(m, v.at + v.dur), 0);
}

// ── Player (browser) ───────────────────────────────────────────────────────

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;
let unlockInstalled = false;
const lastPlayed = new Map<SfxName, number>();

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function applyVolume(): void {
  if (master && ctx) master.gain.setTargetAtTime(juicePrefs.get().volume, ctx.currentTime, 0.02);
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = audioCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    // Compressor evita clip quando vários sons se sobrepõem (reveal + conquista).
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = juicePrefs.get().volume;
    master.connect(comp);
    comp.connect(ctx.destination);
    juicePrefs.subscribe(applyVolume);
    return ctx;
  } catch {
    ctx = null;
    master = null;
    return null;
  }
}

function onGesture(): void {
  unlocked = true;
  const c = ensureContext();
  // iOS/Safari: o contexto nasce "suspended" e só retoma dentro do gesto.
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

/**
 * Instala (uma vez) os ouvintes de gesto que destravam o áudio. Chamado
 * sozinho no primeiro import no browser; exportado para testes/telas que
 * queiram garantir cedo. Os ouvintes ficam (não são `once`): o iOS volta a
 * suspender o contexto quando o app vai para o fundo.
 */
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener('pointerdown', onGesture, opts);
  window.addEventListener('keydown', onGesture, opts);
  window.addEventListener('touchend', onGesture, opts);
}

installAudioUnlock();

/** true se já houve gesto e o WebAudio existe (o som pode tocar). */
export function audioReady(): boolean {
  return unlocked && audioCtor() !== null;
}

function scheduleVoice(c: AudioContext, out: AudioNode, v: SfxVoice, t0: number, gainMul: number): void {
  const osc = c.createOscillator();
  const env = c.createGain();
  const start = t0 + v.at;
  const attack = Math.min(v.attack ?? 0.005, v.dur * 0.5);
  const end = start + v.dur;
  osc.type = v.wave;
  osc.frequency.setValueAtTime(v.freq, start);
  if (v.freqEnd && v.freqEnd > 0 && v.freqEnd !== v.freq) {
    osc.frequency.exponentialRampToValueAtTime(v.freqEnd, end);
  }
  // Envelope: 0 → pico (ataque linear) → ~0 (decaimento exponencial).
  env.gain.setValueAtTime(0.0001, start);
  env.gain.linearRampToValueAtTime(Math.max(0.0001, v.peak * gainMul), start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(env);
  env.connect(out);
  osc.start(start);
  osc.stop(end + 0.02);
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
}

/**
 * Toca um SFX. Nunca lança: sem gesto, sem WebAudio, mudo ou repetido rápido
 * demais → no-op. Devolve true se agendou o som.
 */
export function playSfx(name: SfxName, opts: SfxOptions = {}): boolean {
  if (!unlocked || soundMuted()) return false;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const last = lastPlayed.get(name);
  if (last !== undefined && now - last < SFX_MIN_GAP_MS) return false;
  const c = ensureContext();
  if (!c || !master) return false;
  try {
    if (c.state === 'suspended') void c.resume().catch(() => {});
    lastPlayed.set(name, now);
    let voices = sfxRecipe(name, opts);
    // Reduced-motion com som ligado explicitamente: corta o "show" do reveal
    // (fica só o acorde final), mantém a informação sonora.
    if (name === 'reveal' && prefersReducedMotion()) {
      const hit = Math.max(...voices.map((v) => v.at));
      voices = voices.filter((v) => v.at >= hit - 0.09).map((v) => ({ ...v, at: Math.max(0, v.at - hit + 0.09) }));
    }
    const g = Math.max(0, Math.min(1, opts.gain ?? 1));
    const t0 = c.currentTime + 0.005;
    for (const v of voices) scheduleVoice(c, master, v, t0, g);
    return true;
  } catch {
    return false;
  }
}
