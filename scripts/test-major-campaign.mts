// Modo Major JOGADO (engine/majorCampaign.ts): replay determinístico do Major
// com as séries do usuário vindas da Sala, e pick'em com 3-0/0-3.
// Roda `tsx --test scripts/test-major-campaign.mts`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/major-singapore-2026.json' with { type: 'json' };
import { simulateMajor, emptyPicks, normalizePicks, encodePicks, decodePicks, scorePicks, type MajorData } from '../src/engine/majorSingapore.ts';
import {
  newCampaign, campaignView, recordSeries, simulatePending, majorSeriesSetup, parseCampaign,
  teamStats, campaignSummary, type MajorCampaign,
} from '../src/engine/majorCampaign.ts';
import { createRoom, skipRest } from '../src/engine/rtp/room.ts';

const D = data as unknown as MajorData;

function runAll(c: MajorCampaign, viaRoom: boolean): MajorCampaign {
  for (let i = 0; i < 20; i++) {
    const v = campaignView(D, c);
    if (!v.next) return c;
    if (viaRoom) {
      const { save, prep } = majorSeriesSetup(D, c, v.next);
      const done = skipRest(createRoom(save, prep));
      c = recordSeries(D, c, v.next, done.final!.outcomes, done.final!.liveMaps);
    } else c = simulatePending(c, D, v.next);
  }
  throw new Error('campanha não terminou');
}

test('a primeira série pendente é do time escolhido, no stage de entrada', () => {
  const c = newCampaign(42, 'mibr', 'Rifler');
  const v = campaignView(D, c);
  assert.ok(v.next);
  assert.ok([v.next!.a, v.next!.b].includes('mibr'));
  assert.equal(v.next!.phase, 1);
  assert.equal(v.result, null);
});

test('time de seed 1-8 entra no Stage 3', () => {
  const v = campaignView(D, newCampaign(7, 'team-vitality', 'AWP'));
  assert.equal(v.next!.phase, 3);
  assert.equal(v.next!.bestOf, 3);
});

test('campanha jogada pela Sala termina com Major completo e coerente', () => {
  const c = runAll(newCampaign(99, 'furia', 'Entry'), true);
  const v = campaignView(D, c);
  assert.ok(v.result);
  assert.equal(v.next, null);
  assert.ok(c.played.length >= 3 && c.played.length <= 18);
  for (const p of c.played) {
    const need = Math.max(...p.score);
    assert.ok([p.a, p.b].includes(p.winner));
    assert.ok(need >= 1 && need <= 3);
    assert.ok(p.heroRating > 0);
  }
  const first = c.played[0];
  const m = v.result!.stages[first.phase - 1].rounds[0].find((x) => x.a === first.a && x.b === first.b)!;
  assert.equal(m.winner, first.winner);
});

test('replay determinístico: mesma campanha, mesmo Major', () => {
  const c = runAll(newCampaign(5, 'pain-gaming', 'IGL'), true);
  assert.deepEqual(campaignView(D, c), campaignView(D, structuredClone(c)));
  assert.deepEqual(runAll(newCampaign(5, 'pain-gaming', 'IGL'), true), c);
});

test('as outras séries da rodada 1 não mudam por causa da série do usuário', () => {
  const c = runAll(newCampaign(1234, 'mibr', 'Rifler'), false);
  const v = campaignView(D, c);
  assert.ok(v.result);
  const pure = simulateMajor(D, 1234).stages[0].rounds[0];
  const mine = v.result!.stages[0].rounds[0];
  // antes da série da MIBR, o rng é o mesmo: os jogos anteriores batem
  const idx = mine.findIndex((m) => m.a === 'mibr' || m.b === 'mibr');
  assert.deepEqual(mine.slice(0, idx), pure.slice(0, idx));
});

test('parseCampaign rejeita lixo e aceita campanha válida', () => {
  assert.equal(parseCampaign(D, null), null);
  assert.equal(parseCampaign(D, { v: 1, seed: 1, teamId: 'nao-existe', played: [] }), null);
  const c = newCampaign(3, 'furia', 'AWP');
  assert.deepEqual(parseCampaign(D, JSON.parse(JSON.stringify(c))), c);
});

test('estatísticas por time: 1 campeão, vitórias = derrotas no total', () => {
  const st = teamStats(D, simulateMajor(D, 77));
  assert.equal(st.filter((x) => x.finish === 'Campeão').length, 1);
  assert.equal(st.filter((x) => x.finish === '').length, 0);
  assert.equal(st.reduce((a, x) => a + x.series[0], 0), st.reduce((a, x) => a + x.series[1], 0));
});

test('resumo da campanha bate com as séries jogadas', () => {
  const c = runAll(newCampaign(99, 'furia', 'Entry'), true);
  const s = campaignSummary(c, campaignView(D, c).result!.playoffs.champion);
  assert.equal(s.record[0] + s.record[1], c.played.length);
  assert.ok(s.avgRating! > 0);
});

test("pick'em 3-0/0-3: normaliza, pontua e sobrevive ao link", () => {
  const r = simulateMajor(D, 11);
  const s1 = r.stages[0].advanced;
  const x30 = r.stages[0].records.filter((x) => x.w === 3 && x.l === 0).map((x) => x.id).slice(0, 2);
  const x03 = r.stages[0].records.filter((x) => x.w === 0 && x.l === 3).map((x) => x.id).slice(0, 2);
  const p = normalizePicks(D, { ...emptyPicks(), s1, x30: [x30, [], []], x03: [x03, [], []] });
  assert.deepEqual(p.x30[0], x30);
  assert.deepEqual(p.x03[0], x03);
  const sc = scorePicks(p, r);
  assert.equal(sc.x30[0], x30.length);
  assert.equal(sc.x03[0], x03.length);
  assert.equal(sc.points, 8 + (x30.length + x03.length) * 2);
  // 3-0 tem que estar entre os classificados; 0-3 fora deles
  const bad = normalizePicks(D, { ...p, x30: [[x03[0] ?? 'x'], [], []], x03: [[s1[0]], [], []] });
  assert.deepEqual(bad.x30[0], []);
  assert.deepEqual(bad.x03[0], []);
  const back = decodePicks(D, encodePicks(D, p))!;
  assert.deepEqual(back.x30, p.x30);
  assert.deepEqual(back.x03, p.x03);
  const old = encodePicks(D, { ...p, x30: [[], [], []], x03: [[], [], []] });
  assert.equal(old.split('.').length, 2);
  assert.ok(decodePicks(D, old));
});
