// Juice kit (UX-07) — lógica pura de preferências, receitas de SFX, padrões
// hápticos e física do confete. Roda via `npm run test:sim` ou
// `npx tsx --test scripts/test-juice.mts`. Sem DOM: o storage é injetado e os
// módulos se protegem de `window` ausente.
//
// Cobertura:
//   - prefs: padrão, sanitização, storage que lança, "segue o sistema"
//   - store: persiste, notifica, não notifica sem mudança
//   - sfx: todas as receitas válidas, reveal cresce com o tier, determinismo
//   - haptics: padrões ímpares (terminam em vibração), teto, tier no reveal
//   - celebrate: RNG determinístico, spawn respeita teto, física cai e morre
//   - no Node, playSfx/haptic/celebrate/withViewTransition são no-op seguros

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JUICE_STORAGE_KEY,
  DEFAULT_JUICE_PREFS,
  loadJuicePrefs,
  saveJuicePrefs,
  createJuiceStore,
  isEffectivelyMuted,
  isHapticsOn,
  clampVolume,
  type KVStorage,
} from '../src/lib/juice/prefs.ts';
import { SFX_NAMES, sfxRecipe, sfxDuration, playSfx, audioReady } from '../src/lib/juice/sfx.ts';
import { HAPTIC_PATTERNS, HAPTIC_MAX_TOTAL_MS, hapticPattern, haptic, type HapticEvent } from '../src/lib/juice/haptics.ts';
import { seededRng, spawnParticles, stepParticles, MAX_PARTICLES, celebrate } from '../src/lib/juice/celebrate.ts';
import { withViewTransition, viewTransitionsSupported } from '../src/lib/juice/viewTransition.ts';

function memStorage(init: Record<string, string> = {}): KVStorage & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
  };
}

const throwingStorage: KVStorage = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

// ── prefs ──────────────────────────────────────────────────────────────────

test('prefs: sem storage ou vazio → padrão', () => {
  assert.deepEqual(loadJuicePrefs(null), DEFAULT_JUICE_PREFS);
  assert.deepEqual(loadJuicePrefs(memStorage()), DEFAULT_JUICE_PREFS);
});

test('prefs: JSON inválido, storage que lança e campos estranhos caem no padrão', () => {
  assert.deepEqual(loadJuicePrefs(memStorage({ [JUICE_STORAGE_KEY]: '{oops' })), DEFAULT_JUICE_PREFS);
  assert.deepEqual(loadJuicePrefs(memStorage({ [JUICE_STORAGE_KEY]: 'null' })), DEFAULT_JUICE_PREFS);
  assert.deepEqual(loadJuicePrefs(throwingStorage), DEFAULT_JUICE_PREFS);
  const weird = loadJuicePrefs(memStorage({ [JUICE_STORAGE_KEY]: JSON.stringify({ muted: 'sim', volume: 7, haptics: 0 }) }));
  assert.deepEqual(weird, { muted: null, volume: 1, haptics: null });
});

test('prefs: roundtrip save/load; save em storage que lança devolve false sem lançar', () => {
  const s = memStorage();
  assert.equal(saveJuicePrefs(s, { muted: true, volume: 0.3, haptics: false }), true);
  assert.deepEqual(loadJuicePrefs(s), { muted: true, volume: 0.3, haptics: false });
  assert.equal(saveJuicePrefs(throwingStorage, DEFAULT_JUICE_PREFS), false);
});

test('prefs: clampVolume', () => {
  assert.equal(clampVolume(-1), 0);
  assert.equal(clampVolume(2), 1);
  assert.equal(clampVolume(Number.NaN), DEFAULT_JUICE_PREFS.volume);
  assert.equal(clampVolume('0.5'), DEFAULT_JUICE_PREFS.volume);
});

test('prefs: "segue o sistema" — reduced-motion muta e desliga háptico só sem escolha explícita', () => {
  const auto = { ...DEFAULT_JUICE_PREFS };
  assert.equal(isEffectivelyMuted(auto, false), false);
  assert.equal(isEffectivelyMuted(auto, true), true);
  assert.equal(isHapticsOn(auto, false), true);
  assert.equal(isHapticsOn(auto, true), false);
  // Escolha explícita vence o sistema.
  assert.equal(isEffectivelyMuted({ ...auto, muted: false }, true), false);
  assert.equal(isEffectivelyMuted({ ...auto, muted: true }, false), true);
  assert.equal(isHapticsOn({ ...auto, haptics: true }, true), true);
  // Volume 0 é mudo mesmo com muted=false.
  assert.equal(isEffectivelyMuted({ ...auto, muted: false, volume: 0 }, false), true);
});

test('store: persiste, notifica e ignora set sem mudança', () => {
  const s = memStorage();
  const store = createJuiceStore(s);
  let calls = 0;
  const unsub = store.subscribe(() => { calls++; });
  const before = store.get();
  store.set({ muted: true });
  assert.equal(calls, 1);
  assert.notEqual(store.get(), before, 'snapshot novo a cada mudança (useSyncExternalStore)');
  assert.equal(JSON.parse(s.data[JUICE_STORAGE_KEY]).muted, true);
  store.set({ muted: true });
  assert.equal(calls, 1, 'sem mudança, sem notificação');
  store.set({ volume: 5 });
  assert.equal(store.get().volume, 1);
  unsub();
  store.set({ muted: false });
  assert.equal(calls, 2);
  // Um store novo no mesmo storage recupera o estado.
  assert.deepEqual(createJuiceStore(s).get(), store.get());
});

test('store: storage que lança não quebra o set (vale em memória)', () => {
  const store = createJuiceStore(throwingStorage);
  store.set({ muted: true });
  assert.equal(store.get().muted, true);
});

// ── sfx ────────────────────────────────────────────────────────────────────

test('sfx: todas as receitas têm vozes válidas e curtas', () => {
  assert.ok(SFX_NAMES.length >= 6 && SFX_NAMES.length <= 8, 'ULTRAPLAN: 6 a 8 SFX');
  for (const name of SFX_NAMES) {
    const vs = sfxRecipe(name, { tier: 4, urgent: true });
    assert.ok(vs.length > 0, name);
    for (const v of vs) {
      assert.ok(v.freq > 20 && v.freq < 20000, `${name} freq`);
      if (v.freqEnd !== undefined) assert.ok(v.freqEnd > 0, `${name} freqEnd > 0 (ramp exponencial)`);
      assert.ok(v.at >= 0 && v.dur > 0, `${name} tempo`);
      assert.ok(v.peak > 0 && v.peak <= 1, `${name} pico`);
    }
    assert.ok(sfxDuration(vs) < 2.5, `${name} não passa de 2,5 s`);
  }
  assert.ok(sfxDuration(sfxRecipe('click')) < 0.1, 'click é instantâneo');
});

test('sfx: reveal cresce com o tier (mais longo e mais notas)', () => {
  let prevDur = 0;
  let prevLen = 0;
  for (const tier of [0, 1, 2, 3, 4] as const) {
    const vs = sfxRecipe('reveal', { tier });
    assert.ok(sfxDuration(vs) > prevDur, `tier ${tier} mais longo`);
    assert.ok(vs.length > prevLen, `tier ${tier} mais vozes`);
    prevDur = sfxDuration(vs);
    prevLen = vs.length;
  }
});

test('sfx: receitas são determinísticas e timerTick urgente difere do normal', () => {
  assert.deepEqual(sfxRecipe('achievement'), sfxRecipe('achievement'));
  assert.notDeepEqual(sfxRecipe('timerTick'), sfxRecipe('timerTick', { urgent: true }));
});

test('sfx: fora do browser playSfx é no-op', () => {
  assert.equal(audioReady(), false);
  assert.equal(playSfx('win'), false);
});

// ── haptics ────────────────────────────────────────────────────────────────

test('haptics: todo padrão termina em vibração e respeita o teto', () => {
  for (const ev of Object.keys(HAPTIC_PATTERNS) as HapticEvent[]) {
    for (const tier of [0, 4]) {
      const p = hapticPattern(ev, tier);
      assert.ok(p.length > 0 && p.length % 2 === 1, `${ev} ímpar`);
      assert.ok(p.every((ms) => ms > 0), `${ev} positivo`);
      assert.ok(p.reduce((a, b) => a + b, 0) <= HAPTIC_MAX_TOTAL_MS, `${ev} teto`);
    }
  }
  assert.deepEqual(hapticPattern('lockIn'), [20], 'UX-07: vibrate(20) no lock-in');
});

test('haptics: reveal ganha pulsos com o tier; padrão base não é mutado', () => {
  assert.ok(hapticPattern('reveal', 4).length > hapticPattern('reveal', 0).length);
  assert.deepEqual(hapticPattern('reveal', 9), hapticPattern('reveal', 4), 'tier limitado a 4');
  const before = [...HAPTIC_PATTERNS.reveal];
  hapticPattern('reveal', 4);
  assert.deepEqual([...HAPTIC_PATTERNS.reveal], before);
});

test('haptics: fora do browser haptic é no-op', () => {
  assert.equal(haptic('lockIn'), false);
});

// ── celebrate ──────────────────────────────────────────────────────────────

test('celebrate: RNG semeado é determinístico e em [0,1)', () => {
  const a = seededRng(42);
  const b = seededRng(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(seededRng(1)(), seededRng(2)());
});

test('celebrate: spawn respeita contagem, teto e cone para cima', () => {
  const opts = { count: 50, colors: ['#fff', '#000'], spread: 60, power: 800 };
  const ps = spawnParticles(100, 500, opts, seededRng(7));
  assert.equal(ps.length, 50);
  assert.ok(ps.every((p) => p.vy < 0), 'cone de 60° aponta para cima');
  assert.ok(ps.every((p) => p.color === '#fff' || p.color === '#000'));
  assert.deepEqual(ps, spawnParticles(100, 500, opts, seededRng(7)));
  assert.equal(spawnParticles(0, 0, { ...opts, count: 10_000 }, seededRng(1)).length, MAX_PARTICLES);
});

test('celebrate: física sobe, cai e todas morrem em poucos segundos', () => {
  let ps = spawnParticles(200, 600, { count: 40, colors: ['#fff'], spread: 30, power: 900 }, seededRng(3));
  const y0 = ps[0].y;
  ps = stepParticles(ps, 0.05);
  assert.ok(ps[0].y < y0, 'primeiro frame sobe');
  let t = 0;
  while (ps.length && t < 10) { ps = stepParticles(ps, 1 / 60, 800); t += 1 / 60; }
  assert.equal(ps.length, 0);
  assert.ok(t < 3, `terminou em ${t.toFixed(2)} s`);
});

test('celebrate e view transition: fora do browser resolvem sem lançar', async () => {
  await celebrate({ count: 10 });
  assert.equal(viewTransitionsSupported(), false);
  let ran = false;
  await withViewTransition(() => { ran = true; });
  assert.equal(ran, true, 'fallback roda o update direto');
});
