// CONCLUDE CIRCUIT ROUND (circuit.ts) — as fases puras do fechamento de etapa
// (seams internos) + a interface externa dirigida por temporadas inteiras.
// Antes deste arquivo o concludeCircuitRound (8 conceitos, ~200 linhas) não
// tinha NENHUM teste. Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tierMove, evaluateBoard, resolveEventOutcome, historyAfterEvent,
  autoSimCircuitRound, EVENTS_PER_SEASON,
} from '../src/engine/rtp/circuit.ts';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import type { RoadToProSave } from '../src/engine/rtp/types.ts';

function fixture(seed = 21): RoadToProSave {
  return createRtpSave({
    nick: 'cr', country: 'br', role: 'Rifler',
    personality: 'resilient', archetype: 'allrounder', age: 17,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 }, seed,
  });
}

test('tierMove: finalista sobe, 4º de grupo cai, academia/pisos não movem', () => {
  assert.deepEqual(tierMove('access', 1), { newTier: 'challenger', promoted: true, relegated: false });
  assert.deepEqual(tierMove('challenger', 2), { newTier: 'elite', promoted: true, relegated: false });
  assert.deepEqual(tierMove('elite', 1), { newTier: 'elite', promoted: false, relegated: false });    // topo
  assert.deepEqual(tierMove('challenger', 7), { newTier: 'access', promoted: false, relegated: true });
  assert.deepEqual(tierMove('access', 7), { newTier: 'access', promoted: false, relegated: false });  // piso do pro
  assert.deepEqual(tierMove('academy', 1), { newTier: 'academy', promoted: false, relegated: false }); // vai pro pro por PROPOSTA
  assert.deepEqual(tierMove('elite', 5), { newTier: 'elite', promoted: false, relegated: false });     // meio de tabela não move
});

test('evaluateBoard: confiança clampa 0..100 e demissão exige meta falhada + fundo do poço', () => {
  const s = fixture();
  // meta padrão do fixture existe (objective definido no createRtpSave).
  assert.ok(s.world.objective);
  // título cumpre qualquer meta → confiança sobe, nunca sackable.
  const champ = evaluateBoard(s, 1);
  assert.equal(champ.verdict?.met, true);
  assert.ok(champ.boardConfidence > (s.world.boardConfidence ?? 55));
  assert.equal(champ.sackable, false);
  // último com confiança já no chão → sackable…
  const doomed = { ...s, world: { ...s.world, boardConfidence: 2 } };
  const sacked = evaluateBoard(doomed, 7);
  assert.equal(sacked.verdict?.met, false);
  assert.ok(sacked.boardConfidence <= 5);
  assert.equal(sacked.sackable, true);
  // …mas EMPRESTADO nunca é cortado pelo clube atual (quem manda é o clube-mãe).
  const loaned = { ...doomed, world: { ...doomed.world, loanReturn: { realTeamId: 'x', tier: 'access' as const, contract: s.team.contract } } };
  assert.equal(evaluateBoard(loaned, 7).sackable, false);
  // clamp inferior: confiança nunca fica negativa.
  const floor = evaluateBoard({ ...s, world: { ...s.world, boardConfidence: 0 } }, 7);
  assert.ok(floor.boardConfidence >= 0 && floor.boardConfidence <= 100);
});

test('resolveEventOutcome: troféu só pro campeão, timeline coerente, rating 2 casas', () => {
  const s = { ...fixture(), world: { ...fixture().world, eventRatingSum: 3.777, eventSeries: 3 } };
  const won = resolveEventOutcome(s, 1);
  assert.equal(won.eventTrophy, won.finishedName);
  assert.equal(won.wonEvent, true);
  assert.equal(won.eventRating, 1.26);                       // 3.777/3 arredondado
  assert.equal(won.timelineEntry.place, 1);
  assert.equal(won.timelineEntry.tier, s.team.tier);
  assert.equal(won.timelineEntry.teamTag, s.team.tag);
  const lost = resolveEventOutcome(s, 5);
  assert.equal(lost.eventTrophy, null);
  assert.equal(lost.wonEvent, false);
  // sem séries jogadas → rating neutro 1.0 (sem divisão por zero).
  assert.equal(resolveEventOutcome(fixture(), 3).eventRating, 1);
});

test('historyAfterEvent: troféu + timeline entram; imutável; dinastia progride', () => {
  const s = { ...fixture(), world: { ...fixture().world, eventRatingSum: 4.5, eventSeries: 3 } };
  const out = resolveEventOutcome(s, 1);
  const h = historyAfterEvent(s, out, false);
  assert.equal(h.trophies.length, s.history.trophies.length + 1);
  assert.equal(h.timeline?.[h.timeline.length - 1], out.timelineEntry);
  assert.ok(h.records);
  // derrota: nada de troféu, timeline mesmo assim (todo campeonato conta a história).
  const out5 = resolveEventOutcome(s, 5);
  const h5 = historyAfterEvent(s, out5, false);
  assert.equal(h5.trophies.length, s.history.trophies.length);
  assert.equal(h5.timeline?.length, (s.history.timeline?.length ?? 0) + 1);
  // o save original não muda.
  assert.equal(s.history.timeline?.length ?? 0, 0);
});

test('concludeCircuitRound (integração): temporadas inteiras pela interface externa', () => {
  let s = fixture(33);
  const age0 = s.player.age;
  let eventEnds = 0;
  let seasonEnds = 0;
  let rounds = 0;
  // joga no automático até fechar UMA temporada inteira (3 etapas) ou esgotar o guard.
  while (seasonEnds < 1 && rounds < 80) {
    const tickBefore = s.rng.tick;
    const r = autoSimCircuitRound(s);
    assert.ok(r, `rodada ${rounds}: sem partida pendente`);
    const next = r!.conclusion.save;
    // invariantes de TODA virada: tick avança (outcome + virada), ações resetam,
    // medidores válidos.
    assert.ok(next.rng.tick > tickBefore, 'tick não avançou');
    assert.equal(next.world.actionsLeft, 3);
    assert.ok(next.life.money >= 0);
    assert.ok((next.world.boardConfidence ?? 55) >= 0 && (next.world.boardConfidence ?? 55) <= 100);
    assert.ok((next.world.seasonEvent ?? 1) >= 1 && (next.world.seasonEvent ?? 1) <= EVENTS_PER_SEASON);
    if (r!.conclusion.eventEnd) {
      eventEnds++;
      // etapa fechada no meio do ano: semana reseta e a liga nova existe.
      assert.equal(next.world.week, 1);
      assert.ok(next.world.league);
      assert.ok(next.world.objective, 'toda etapa nova tem meta da diretoria');
    }
    if (r!.conclusion.seasonEnd) {
      seasonEnds++;
      // fim do ano: envelhece +1, temporada avança, etapa volta pra 1.
      assert.equal(next.player.age, age0 + 1);
      assert.equal(next.world.season, s.world.season + 1);
      assert.equal(next.world.seasonEvent ?? 1, 1);
      assert.ok(next.history.timeline!.length >= EVENTS_PER_SEASON, 'timeline registra cada etapa');
    }
    s = next;
    rounds++;
  }
  assert.equal(seasonEnds, 1, `não fechou a temporada em ${rounds} rodadas`);
  assert.equal(eventEnds, EVENTS_PER_SEASON - 1, 'etapas de meio de ano = 2 num ano de 3');
  // determinismo do ano inteiro: repetir do mesmo fixture dá o MESMO save.
  let s2 = fixture(33);
  for (let i = 0; i < rounds; i++) s2 = autoSimCircuitRound(s2)!.conclusion.save;
  assert.deepEqual(s2, s);
});
