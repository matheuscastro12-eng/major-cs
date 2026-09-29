// INTEGRAÇÃO DA FASE 2 (treino × tática × comissão). `npm run test:sim`.
//
//   - neutralidade: quem nunca mexe em treino/tática/comissão ganha o mesmo que
//     antes da fase 2 (±2 pp) numa temporada modelo da Carreira;
//   - encaixes: o treino usa gainFamiliarity da tática (e não decai), o VOD
//     prepara o anti-strat, o vazamento de scrim vira prontidão da IA, o
//     analista estuda no automático com a mesma regra da IA.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureNeutrality } from './measure-neutralidade.mts';
import { defaultTrainingState, runTrainingWeek, defaultCondition, vodPrepPoints, VOD_PREP } from '../src/engine/gestao/treino.ts';
import {
  aiTactics, antiStratReadOf, autoAntiStratReadiness, defaultTactics, matchTacticsFor, prepareAntiStrat, FAM_DEFAULT, SCRIM_LEAK_READ,
} from '../src/engine/gestao/tatica.ts';
import { realTeams } from './calibrate-engine.mts';

test('neutralidade: agenda padrão + tática padrão ≈ antes da fase 2 (±2 pp)', () => {
  const r = measureNeutrality(80);
  assert.ok(Math.abs(r.diff) <= 0.02, `antes ${(r.before * 100).toFixed(1)}% × depois ${(r.after * 100).toFixed(1)}% (Δ ${(r.diff * 100).toFixed(1)} pp)`);
  assert.ok(r.injuredShare < 0.06, `lesionados demais com a agenda padrão: ${(r.injuredShare * 100).toFixed(1)}%`);
  assert.ok(r.avgFit > 45, `a agenda padrão não pode queimar o elenco: fitness ${r.avgFit.toFixed(1)}`);
});

test('treino → tática: familiaridade dos mapas priorizados parte do padrão da tática e cresce; o treino não decai', () => {
  const t = { ...defaultTrainingState(), mapFocus: ['nuke' as const] };
  const r = runTrainingWeek({ training: t, condition: { a: defaultCondition() }, tactics: defaultTactics(), players: [{ id: 'a', nick: 'a' }], maps: {}, split: 1 });
  assert.ok(r.tactics.maps.nuke!.familiarity > FAM_DEFAULT, 'mapa priorizado ganha a partir de 50');
  assert.equal(r.tactics.maps.inferno, undefined, 'mapa fora do foco não é tocado pelo treino');
});

test('VOD da agenda prepara o anti-strat (na semana e ao preparar)', () => {
  const t = defaultTrainingState();
  const vod = vodPrepPoints(t);
  assert.equal(vod, VOD_PREP * t.week.filter((x) => x === 'vod').length);
  const tac = prepareAntiStrat(defaultTactics(), 'rival', 0.35, vod);
  assert.equal(tac.antiStrat!.readiness, Math.round(20 + 40 * 0.35 + vod));
  const r = runTrainingWeek({ training: t, condition: { a: defaultCondition() }, tactics: tac, players: [{ id: 'a', nick: 'a' }], maps: {}, split: 1 });
  assert.equal(r.tactics.antiStrat!.readiness, tac.antiStrat!.readiness + vod);
});

test('vazamento de scrim vira prontidão de anti-strat da IA que te viu; analista automático segue a regra da IA', () => {
  const team = realTeams()[3];
  const base = aiTactics(team, { id: 'user', scouting: 0.6 }).antiStrat!.readiness;
  const leaked = aiTactics(team, { id: 'user', scouting: 0.6, leak: 1 }).antiStrat!.readiness;
  assert.equal(leaked, Math.min(100, base + SCRIM_LEAK_READ));
  const auto = matchTacticsFor(defaultTactics(), 'disciplined', 'rival', autoAntiStratReadiness(0.6));
  assert.equal(auto.tactics.antiStrat!.readiness, base, 'mesma prontidão que a IA com o mesmo scouting');
  // a preparação manual vence a automática, e o plano "Anti-strat" só perde o genérico com preparação manual
  const manual = prepareAntiStrat(defaultTactics(), 'rival', 0.8, 8);
  assert.ok(antiStratReadOf(matchTacticsFor(manual, 'disciplined', 'rival', autoAntiStratReadiness(0.6)).tactics, 'rival') > antiStratReadOf(auto.tactics, 'rival'));
  assert.equal(matchTacticsFor(defaultTactics(), 'antistrat', 'rival', autoAntiStratReadiness(0.6)).genericAntiStrat, true);
});
