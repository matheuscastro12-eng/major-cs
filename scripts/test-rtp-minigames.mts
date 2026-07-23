// RTP — minigames (pool expandido + rotação + spotlights da Sala). Roda via
// `npm run test:sim`.
//
// Cobertura:
//   - MINIGAMES: todo id tem def coerente (id bate, duração e blurb presentes)
//   - scoreToPerf: floor > 0 (ação nunca é inútil), teto 1.0, monotônica
//   - gameForAction: rotação determinística por variant; instantâneas → null
//   - buildBeatPlan: todo spotlight referencia um jogo existente; sempre há
//     ≥5 execuções por série; situação casa com o jogo (retake=nade,
//     postPlant=holdangle, entry=prefire)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINIGAMES, ACTION_GAMES, gameForAction, AUTO_PERF, type MiniGameId } from '../src/engine/rtp/minigames.ts';
import { buildBeatPlan } from '../src/engine/rtp/roundModel.ts';
import type { Role, MapId } from '../src/types.ts';

const IDS = Object.keys(MINIGAMES) as MiniGameId[];

test('todo minigame tem def coerente', () => {
  assert.equal(IDS.length, 8); // 5 originais + prefire/nade/holdangle
  for (const id of IDS) {
    const def = MINIGAMES[id];
    assert.equal(def.id, id);
    assert.ok(def.title.length > 0 && def.blurb.length > 0);
    assert.ok(def.durationMs >= 5000 && def.durationMs <= 20000, `${id}: durationMs ${def.durationMs}`);
  }
});

test('scoreToPerf: floor > 0, teto 1.0, monotônica', () => {
  for (const id of IDS) {
    const f = MINIGAMES[id].scoreToPerf;
    const floor = f(0);
    assert.ok(floor >= 0.35 && floor <= 0.55, `${id}: floor ${floor}`);
    assert.equal(f(1), 1);
    let prev = -1;
    for (let r = 0; r <= 1.001; r += 0.1) {
      const v = f(r);
      assert.ok(v >= prev, `${id}: não-monotônica em ${r}`);
      prev = v;
    }
    // fora do range é clampado
    assert.equal(f(-1), floor);
    assert.equal(f(2), 1);
  }
});

test('gameForAction: rotação determinística por variant', () => {
  // mecânico alterna mira ↔ prefire; demos alterna memória ↔ segurar o ângulo
  assert.equal(gameForAction('train:mechanical', 0)?.id, 'flick');
  assert.equal(gameForAction('train:mechanical', 1)?.id, 'prefire');
  assert.equal(gameForAction('train:mechanical', 2)?.id, 'flick');
  assert.equal(gameForAction('demos', 0)?.id, 'memory');
  assert.equal(gameForAction('demos', 1)?.id, 'holdangle');
  // pool de 1 jogo é estável em qualquer variant
  assert.equal(gameForAction('train:physical', 7)?.id, 'reaction');
  // sem variant = primeiro do pool (back-compat com auto-sim)
  assert.equal(gameForAction('train:mechanical')?.id, 'flick');
  // instantâneas seguem sem minijogo
  assert.equal(gameForAction('rest'), null);
  assert.equal(gameForAction('social'), null);
  assert.equal(gameForAction('stream'), null);
  // todo id de pool existe no catálogo
  for (const pool of Object.values(ACTION_GAMES)) {
    for (const id of pool) assert.ok(MINIGAMES[id], `pool referencia ${id} inexistente`);
  }
  assert.ok(AUTO_PERF > 0.5 && AUTO_PERF < 1);
});

test('buildBeatPlan: spotlights válidos, ≥5 execuções, situação casa com o jogo', () => {
  const roles: Role[] = ['Entry', 'AWP', 'Rifler', 'Support', 'Lurker', 'IGL'];
  const maps: MapId[] = ['mirage', 'inferno', 'nuke'];
  for (const role of roles) {
    for (let seed = 1; seed <= 40; seed++) {
      const plan = buildBeatPlan(role, maps, seed * 7919);
      const spots = plan.filter((b) => b.spotlight);
      assert.ok(spots.length >= 5, `${role}/seed${seed}: só ${spots.length} execuções`);
      for (const b of plan) {
        if (!b.spotlight) continue;
        assert.ok(MINIGAMES[b.spotlight], `${role}/seed${seed}: spotlight ${b.spotlight} inexistente`);
        if (b.kind === 'retake') assert.equal(b.spotlight, 'nade');
        if (b.kind === 'postPlant') assert.equal(b.spotlight, 'holdangle');
        if (b.kind === 'entry') assert.equal(b.spotlight, 'prefire');
        if (b.kind === 'lastHalf') assert.equal(b.spotlight, 'prefire');
      }
    }
  }
});
