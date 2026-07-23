// Atualização gigante (jul/2026) — testes dos engines novos. Roda via
// `npm run test:sim`.
//
// Cobertura:
//   - legendStatus (#49): bandas por peakOvr, fase legacy, null pra comum
//   - proSetup (#52): determinístico por nick, eDPI = dpi × sens
//   - analystReport (#25): win-rate real vira pick/ban + realRecord exposto
//   - scrim real (#6/#21): banda de força, fail-safe de disponibilidade,
//     partida MD1 com relatório coerente (5 linhas, placar, MVP)
//   - jobHunt (#19): chance honesta nos limites, nunca oferece o clube que
//     demitiu, sempre ≥2 opções viáveis, candidatura determinística

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legendStatus, legendTier } from '../src/engine/legend.ts';
import { rollProSetup } from '../src/engine/proSetup.ts';
import { generateAnalystReport } from '../src/engine/analystReport.ts';
import { listScrimOpponents, runScrimVs, SCRIM_STRENGTH_BAND } from '../src/engine/scrim.ts';
import { jobChance, listJobOffers, applyForJob } from '../src/engine/career/jobHunt.ts';
import { teamSeasonToTTeam } from '../src/engine/ratings.ts';
import { makeRng } from '../src/engine/rng.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';

const realTeams = CS2_REAL_2026.filter((t) => t.id !== '__free__' && t.players.length >= 5);

test('legendStatus: bandas, legacy e jogador comum', () => {
  assert.equal(legendTier(96), 'goat');
  assert.equal(legendTier(92), 'legend');
  assert.equal(legendTier(88), 'great');
  assert.equal(legendTier(81), 'rising');
  assert.equal(legendTier(79), null);
  // ativo no pico
  const active = legendStatus(95, 95);
  assert.equal(active?.tier, 'goat');
  assert.equal(active?.legacy, false);
  // veterano em declínio = legacy (com 1pt de folga pra oscilação)
  assert.equal(legendStatus(94, 95)?.legacy, false);
  assert.equal(legendStatus(90, 95)?.legacy, true);
  // comum não tem aura
  assert.equal(legendStatus(75, 78), null);
});

test('proSetup: determinístico e internamente consistente', () => {
  const a = rollProSetup('KSCERATO');
  const b = rollProSetup('kscerato');
  assert.deepEqual(a, b); // case-insensitive
  assert.equal(a.edpi, Math.round(a.dpi * a.sens));
  assert.ok(a.edpi >= 400 && a.edpi <= 1300, `edpi ${a.edpi}`);
  // nicks diferentes variam (amostra: 20 nicks → mais de 3 eDPIs distintos)
  const edpis = new Set(realTeams.slice(0, 4).flatMap((t) => t.players.map((p) => rollProSetup(p.nick).edpi)));
  assert.ok(edpis.size > 3);
});

test('analystReport: win-rate real dirige pick/ban e aparece no realRecord', () => {
  const opp = teamSeasonToTTeam(realTeams[0]);
  const me = teamSeasonToTTeam(realTeams[1]);
  // run 100% de vitória na nuke, 0% na mirage (amostra >= 2)
  const rec = { nuke: { w: 5, l: 0 }, mirage: { w: 0, l: 5 } };
  const report = generateAnalystReport(opp, me, rec);
  assert.deepEqual(report.realRecord?.nuke, { w: 5, l: 0 });
  assert.notEqual(report.recommendedPick, 'mirage'); // 0% de WR nunca é a pick
  // sem histórico, o campo vem vazio mas o report continua íntegro
  const plain = generateAnalystReport(opp, me);
  assert.equal(Object.keys(plain.realRecord ?? {}).length, 0);
  assert.ok(plain.recommendedBans.length === 2);
});

test('scrim: banda de força + fail-safe de disponibilidade', () => {
  const world = realTeams.map(teamSeasonToTTeam);
  const myStrength = world[10].strength;
  const opts = listScrimOpponents(myStrength, world, 3, 0);
  assert.ok(opts.length > 0 && opts.length <= 6);
  for (const o of opts) assert.ok(Math.abs(o.strength - myStrength) <= SCRIM_STRENGTH_BAND + 0.5, `${o.tag} fora da banda`);
  assert.ok(opts.filter((o) => o.avail === 'available').length >= 2, 'fail-safe de disponibilidade');
  // determinístico: mesma semana → mesma lista
  assert.deepEqual(opts, listScrimOpponents(myStrength, world, 3, 0));
  // jogar uma scrim (used+1) pode reabrir o sorteio (lista pode mudar, mas nunca quebra)
  assert.ok(listScrimOpponents(myStrength, world, 3, 1).length > 0);
});

test('scrim: partida real MD1 com relatório coerente', () => {
  const me = teamSeasonToTTeam(realTeams[5]);
  const opp = teamSeasonToTTeam(realTeams[6]);
  const state = {
    split: 2, budget: 100_000, scrimsThisSplit: 0,
    starterIds: me.players.map((p) => p.id),
    pairChem: {}, fatigue: { [me.players[0].id]: 50 },
  };
  const { report, patch } = runScrimVs(state, me, opp, makeRng(42));
  assert.equal(report.lines.length, 5);
  assert.ok(report.mvp != null);
  assert.equal(report.lines[0].nick, report.mvp); // ordenado por rating
  const winnerScore = Math.max(report.myScore, report.oppScore);
  assert.ok(winnerScore >= 13, `placar CS2 válido (${report.myScore}-${report.oppScore})`);
  assert.equal(report.won, report.myScore > report.oppScore);
  assert.ok(report.chemGain > 0);
  assert.ok(patch.budgetDelta < 0);
  assert.equal(patch.scrimsThisSplitNext, 1);
  assert.ok(patch.fatigue[me.players[0].id] < 50); // recuperou fadiga
});

test('jobHunt: chance honesta, lista sã e candidatura determinística', () => {
  // chance nos limites: dream shot é difícil, descer de tier é o caminho
  assert.ok(jobChance(50, 1, 2) < 0.2);            // subir de tier = aposta
  assert.ok(jobChance(50, 3, 2) >= 0.6);           // descer = provável
  assert.ok(jobChance(0, 3, 3) >= 0.05 && jobChance(100, 1, 3) <= 0.92); // clamps
  const tierOf = (tw: number) => (tw >= 82 ? 1 : tw >= 77 ? 2 : 3);
  const world = realTeams.map((t) => ({ t, tier: tierOf(t.teamwork) }));
  const firedFrom = realTeams[0].team;
  const offers = listJobOffers(world, firedFrom, 2, [], 7);
  assert.ok(offers.length >= 2, `só ${offers.length} ofertas`);
  assert.ok(offers.every((o) => o.name !== firedFrom), 'ofereceu o clube que demitiu');
  assert.ok(offers.filter((o) => o.dream).length <= 1);
  assert.ok(offers.filter((o) => o.tier >= 2).length >= 2, 'precisa de ≥2 viáveis (tier ≤ último)');
  for (const o of offers) assert.ok(o.chance > 0 && o.chance < 1);
  // determinístico: mesma demissão → mesmas ofertas e mesmo veredito
  assert.deepEqual(offers, listJobOffers(world, firedFrom, 2, [], 7));
  assert.equal(applyForJob(offers[0], 7), applyForJob(offers[0], 7));
});
