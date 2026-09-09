// PÓS-JOGO COM EVIDÊNCIA (engine/roundLog.ts) — as duas réguas separadas:
// sorte (luckAdjusted) e decisão (decisionGrade), com casos fixos. Também
// garante que a Sala registra um evento por lock-in SEM mudar o placar.
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  luckAdjusted, decisionGrade, bestCall, worstCall, luckLine, recordByStakes,
  type DecisionEvent,
} from '../src/engine/roundLog.ts';
import { createRoom, lockIn, advance, currentMoment, skipRest } from '../src/engine/rtp/room.ts';
import { generateMoments } from '../src/engine/rtp/moments.ts';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import { ALL_ATTRS } from '../src/engine/attributes.ts';
import type { MatchPrep } from '../src/engine/rtp/matchSim.ts';

const ev = (pWin: number, won: boolean, over: Partial<DecisionEvent> = {}): DecisionEvent => ({
  source: 'career', map: 'mirage', label: 'x', pWin, won, ...over,
});

test('luckAdjusted: esperado = Σ pWin, delta em rounds e em pontos percentuais', () => {
  const l = luckAdjusted([ev(0.5, true), ev(0.5, true), ev(0.5, false), ev(0.5, true)]);
  assert.equal(l.n, 4);
  assert.equal(l.expected, 2);
  assert.equal(l.actual, 3);
  assert.equal(l.delta, 1);
  assert.equal(l.deltaPct, 25);
  assert.equal(luckLine(l), '+25% acima do dado');
  const z = luckAdjusted([]);
  assert.deepEqual(z, { n: 0, expected: 0, actual: 0, delta: 0, deltaPct: 0 });
  assert.equal(luckLine(z), 'sem chamadas');
  const neg = luckAdjusted([ev(0.8, false), ev(0.7, false)]);
  assert.equal(neg.delta, -1.5);
  assert.equal(neg.deltaPct, -75);
  assert.equal(luckLine(neg), '−75% abaixo do dado');
  // pWin fora de 0..1 é clampado — nunca um "esperado" impossível
  assert.equal(luckAdjusted([ev(1.4, true)]).expected, 1);
});

test('bestCall/worstCall: maior upset que pegou e favorito que tropeçou', () => {
  const es = [ev(0.3, true, { label: 'upset' }), ev(0.6, true), ev(0.8, false, { label: 'fav' }), ev(0.5, false)];
  assert.equal(bestCall(es)?.label, 'upset');
  assert.equal(worstCall(es)?.label, 'fav');
  assert.equal(bestCall([ev(0.4, false)]), null);
  assert.equal(worstCall([ev(0.4, true)]), null);
});

test('decisionGrade: nota pela escolha vs alternativas, IGNORANDO o resultado', () => {
  // escolhe sempre a melhor opção do leque (+10pp) e perde tudo → S mesmo assim
  const smart = [ev(0.6, false, { alternatives: [0.5, 0.5] }), ev(0.55, false, { alternatives: [0.45, 0.45] })];
  assert.equal(decisionGrade(smart).grade, 'S');
  assert.equal(decisionGrade(smart).edge, 10);
  // escolhe sempre a pior (−10pp) e ganha tudo → D
  const gamble = [ev(0.4, true, { alternatives: [0.5, 0.5] }), ev(0.35, true, { alternatives: [0.45, 0.45] })];
  assert.equal(decisionGrade(gamble).grade, 'D');
  // pBase manda quando existe (a execução não conta como decisão)
  const exec = [ev(0.7, true, { pBase: 0.5, alternatives: [0.5, 0.5] })];
  assert.equal(decisionGrade(exec).edge, 0);
  assert.equal(decisionGrade(exec).grade, 'B');
  // sem alternativas: régua absoluta da % escolhida
  assert.equal(decisionGrade([ev(0.7, false)]).grade, 'S');
  assert.equal(decisionGrade([ev(0.3, true)]).grade, 'D');
  assert.equal(decisionGrade([ev(0.7, false)]).altAvg, null);
  assert.equal(decisionGrade([]).grade, 'C');
});

test('recordByStakes: só conta o que tem evento', () => {
  const es = [ev(0.5, true, { stakes: 'pistol' }), ev(0.5, false, { stakes: 'pistol' }), ev(0.5, true, { stakes: 'clutch' })];
  assert.deepEqual(recordByStakes(es, 'pistol'), { made: 2, won: 1 });
  assert.deepEqual(recordByStakes(es, 'matchpoint'), { made: 0, won: 0 });
});

// ── Sala: o log é ADITIVO — mesmo placar, um evento por lock-in ──────────────
function fixturePrep(matchSeed: number): MatchPrep {
  const effAttrs = Object.fromEntries(ALL_ATTRS.map((k, i) => [k, 8 + ((matchSeed + i) % 9)])) as MatchPrep['effAttrs'];
  return {
    matchSeed,
    opp: { name: 'Rival', tag: 'RVL', colors: ['#111', '#eee'], strength: 60, players: [] },
    maps: [{ map: 'mirage', pickedBy: 0 }, { map: 'inferno', pickedBy: 1 }, { map: 'nuke', pickedBy: -1 }],
    bestOf: 3, conditionMod: 1, factors: [], effAttrs, moments: generateMoments('Rifler'), confidence: 0, grudge: 0,
  };
}

test('Sala: registra um DecisionEvent por lock-in com a odds mostrada e o veredito do roll', () => {
  const save = createRtpSave({
    nick: 'sala', country: 'br', role: 'Rifler', personality: 'resilient', archetype: 'allrounder', age: 17,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 }, seed: 7,
  });
  const prep = fixturePrep(42);
  let s = createRoom(save, prep);
  assert.deepEqual(s.log, []);
  let locks = 0;
  while (s.phase !== 'done') {
    const opt = currentMoment(s).options[locks % 3];
    const r = lockIn(s, opt.id, locks % 2 === 0 ? 0.8 : null);
    locks++;
    const e = r.state.log[r.state.log.length - 1];
    assert.equal(r.state.log.length, locks, 'um evento por lock-in');
    assert.equal(e.source, 'rtp');
    assert.equal(e.label, opt.label);
    assert.ok(Math.abs(e.pWin - r.beat.odds.total) < 1e-9, 'pWin == odds mostrada');
    assert.ok(Math.abs((e.pBase ?? -1) - r.beat.baseTotal) < 1e-9, 'pBase == odds antes da execução');
    assert.equal(e.won, r.beat.outcome.result === 'success');
    assert.equal(e.result, r.beat.outcome.result);
    assert.equal(e.alternatives?.length, currentMoment(s).options.length - 1);
    assert.equal(e.execPerf, r.beat.execPerf ?? undefined);
    s = advance(r.state);
  }
  // varrida 2-0 pula beats: o log cobre TODOS os beats jogados (clutch = 1 por passo)
  assert.ok(s.log.length >= s.outcomes.length, 'todos os beats jogados ficaram no log');
  const luck = luckAdjusted(s.log);
  assert.equal(luck.n, s.log.length);
  assert.equal(luck.actual, s.log.filter((e) => e.won).length);
  // skip não inventa decisão do jogador: log só com o que ele lock-inou
  const s2 = skipRest(createRoom(save, prep));
  assert.equal(s2.log.length, 0);
});
