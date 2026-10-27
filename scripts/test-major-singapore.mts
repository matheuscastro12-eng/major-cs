// Modo Major Singapore 2026: lista única válida, formato 3 Stages + playoffs,
// Monte Carlo reprodutível e probabilidades coerentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildField, monteCarlo, simulateMajor, validateConfig } from '../src/engine/majorSingapore/index.ts';
import { MAJOR_SG_CONFIG, MAJOR_SG_DATASET } from '../src/engine/majorSingapore/data.ts';
import { makeRng } from '../src/engine/rng.ts';

test('lista do Major é válida (32 times, 16/8/8, ids da base bo3.gg, elencos completos)', () => {
  assert.deepEqual(validateConfig(MAJOR_SG_CONFIG, MAJOR_SG_DATASET), []);
});

test('lista inválida é rejeitada', () => {
  const bad = { ...MAJOR_SG_CONFIG, teams: MAJOR_SG_CONFIG.teams.slice(0, 31) };
  assert.ok(validateConfig(bad, MAJOR_SG_DATASET).length > 0);
  assert.throws(() => buildField(bad, MAJOR_SG_DATASET));
});

test('um Major simulado respeita o formato', () => {
  const field = buildField(MAJOR_SG_CONFIG, MAJOR_SG_DATASET);
  const r = simulateMajor(field, makeRng(7));
  const s1 = new Set(field.s1.map((t) => t.id));
  const s2in = new Set([...field.s2.map((t) => t.id), ...r.passedS1]);
  const s3in = new Set([...field.s3.map((t) => t.id), ...r.passedS2]);
  assert.equal(r.passedS1.length, 8); assert.ok(r.passedS1.every((id) => s1.has(id)));
  assert.equal(r.passedS2.length, 8); assert.ok(r.passedS2.every((id) => s2in.has(id)));
  assert.equal(r.playoffs.length, 8); assert.ok(r.playoffs.every((id) => s3in.has(id)));
  assert.equal(new Set(r.playoffs).size, 8);
  assert.equal(r.semis.length, 4); assert.equal(r.finalists.length, 2);
  assert.ok(r.finalists.includes(r.championId));
  assert.equal(r.stages.length, 4);
});

test('Monte Carlo: reprodutível e probabilidades coerentes', () => {
  const a = monteCarlo(MAJOR_SG_CONFIG, MAJOR_SG_DATASET, 12, 99);
  const b = monteCarlo(MAJOR_SG_CONFIG, MAJOR_SG_DATASET, 12, 99);
  assert.deepEqual(a, b);
  const sum = (k: 'title' | 'playoffs' | 'final' | 'semis') => a.teams.reduce((s, t) => s + t[k], 0);
  assert.ok(Math.abs(sum('title') - 1) < 1e-9);
  assert.ok(Math.abs(sum('final') - 2) < 1e-9);
  assert.ok(Math.abs(sum('semis') - 4) < 1e-9);
  assert.ok(Math.abs(sum('playoffs') - 8) < 1e-9);
  for (const t of a.teams) {
    assert.ok(t.title <= t.final && t.final <= t.semis && t.semis <= t.playoffs);
    if (t.entryStage === 1) assert.ok(t.playoffs <= t.passStage2! && t.passStage2! <= t.passStage1!);
    if (t.entryStage === 3) { assert.equal(t.passStage1, null); assert.equal(t.passStage2, null); }
  }
});

// ---- predição publicada × lista: sem time a mais/a menos, mesmo Stage e status
import predJson from '../src/data/major-singapore-2026-prediction.json' with { type: 'json' };
import { majorCardData } from '../src/state/majorShareCard.ts';

test('odds/predição batem com a lista de times (sem time a mais nem a menos)', () => {
  const pred = predJson as { listStatus: string; teams: { id: string; entryStage: number; provisional: boolean; stageGuess?: boolean }[] };
  const list = new Map(MAJOR_SG_CONFIG.teams.map((t) => [t.bo3Id, t]));
  const predIds = pred.teams.map((t) => t.id);
  assert.equal(new Set(predIds).size, predIds.length, 'id repetido na predição');
  assert.deepEqual([...predIds].sort(), [...list.keys()].sort(), 'predição desatualizada: rode scripts/major-singapore-predict.mts');
  for (const t of pred.teams) {
    const e = list.get(t.id)!;
    assert.equal(t.entryStage, e.stage, `${e.team}: Stage diferente na predição`);
    assert.equal(t.provisional, e.provisional, `${e.team}: provisório diferente na predição`);
    assert.equal(!!t.stageGuess, !!e.stageGuess, `${e.team}: Stage palpite diferente na predição`);
  }
  assert.equal(pred.listStatus, MAJOR_SG_CONFIG.listStatus);
});

test('times com Stage chutado estão marcados como palpite (não aparecem como confirmados)', () => {
  const guess = MAJOR_SG_CONFIG.teams.filter((t) => /chute|indefinido/i.test(t.note ?? ''));
  assert.ok(guess.length > 0);
  for (const t of guess) assert.equal(t.stageGuess, true, `${t.team} deveria ter stageGuess`);
  const field = buildField(MAJOR_SG_CONFIG, MAJOR_SG_DATASET);
  assert.equal(field.stageGuess.size, guess.length);
});

test('time sem dados no bo3.gg gera erro legível (vira aviso no error boundary)', () => {
  const bad = { ...MAJOR_SG_CONFIG, teams: MAJOR_SG_CONFIG.teams.map((t, i) => (i === 0 ? { ...t, bo3Id: 'bo3_team_999999' } : t)) };
  assert.throws(() => buildField(bad, MAJOR_SG_DATASET), /bo3Id desconhecido/);
});

test('card da chave: QF/SF/Final completos e time sem dados não quebra', () => {
  const field = buildField(MAJOR_SG_CONFIG, MAJOR_SG_DATASET);
  const run = simulateMajor(field, makeRng(7));
  const byId = new Map(MAJOR_SG_DATASET.map((t) => [t.id, t]));
  const d = majorCardData(run, (id) => (id === run.championId ? undefined : { name: byId.get(id)!.team, tag: byId.get(id)!.tag }));
  assert.deepEqual(d.rounds.map((r) => r.series.length), [4, 2, 1]);
  assert.equal(d.champion.id, run.championId);
  assert.equal(d.champion.name, run.championId); // fallback: id, sem exceção
  const f = d.rounds[2].series[0];
  assert.equal((f.winner === 0 ? f.a : f.b).id, run.championId);
});

// Formato OFICIAL (Valve Major Supplemental Rulebook + PGL/Liquipedia, checado em 26/10/2026)
import { buchholz, createValveSwissStage, resolveRound as rr, stageAdvancers as adv } from '../src/engine/swiss.ts';
test('Swiss oficial: R1 1v9..8v16, MD1 na abertura, MD3 só em decisão, sem rematch, 8 avançam', () => {
  const field = buildField(MAJOR_SG_CONFIG, MAJOR_SG_DATASET);
  for (const seed of [1, 2, 3, 7, 42]) {
    const t = createValveSwissStage(field.s1, 'S1');
    assert.deepEqual(t.pairings.map((p) => [p.a, p.b]), field.s1.slice(0, 8).map((x, i) => [x.id, field.s1[i + 8].id]));
    assert.ok(t.pairings.every((p) => p.bestOf === 1));
    const rng = makeRng(seed); const seen = new Set<string>();
    let g = 0;
    while (t.phase !== 'done' && g++ < 10) {
      for (const p of t.pairings) {
        const a = t.teams.find((x) => x.id === p.a)!;
        assert.equal(p.bestOf, a.wins === 2 || a.losses === 2 ? 3 : 1);
        const k = [p.a, p.b].sort().join('|'); assert.ok(!seen.has(k), 'rematch'); seen.add(k);
      }
      rr(t, rng);
    }
    const a8 = adv(t);
    assert.equal(a8.length, 8); assert.ok(a8.every((x) => x.wins === 3 && x.losses < 3));
    assert.equal(t.teams.filter((x) => x.losses === 3).length, 8);
    for (let i = 1; i < 8; i++) {
      const p = a8[i - 1], q = a8[i];
      assert.ok(p.losses < q.losses || (p.losses === q.losses && buchholz(t, p.id) >= buchholz(t, q.id)));
    }
  }
});
test('playoffs: 1v8, 4v5 | 2v7, 3v6, MD3 e final MD5', () => {
  const field = buildField(MAJOR_SG_CONFIG, MAJOR_SG_DATASET);
  const r = simulateMajor(field, makeRng(3));
  const po = r.stages[3];
  const qf = po.history.filter((h) => /QF/.test(h.pairing.label));
  const s = r.playoffs;
  assert.deepEqual(qf.map((h) => [h.pairing.a, h.pairing.b]), [[s[0], s[7]], [s[3], s[4]], [s[1], s[6]], [s[2], s[5]]]);
  assert.ok(po.history.every((h) => h.pairing.bestOf === (h.pairing.label === 'FINAL' ? 5 : 3)));
});

import { bo3PhotoPath, initials, BO3_PHOTOS_ON } from '../src/data/bo3Photos.ts';
test('fotos bo3.gg: flag OFF por padrão, caminho local same-origin, placeholder', () => {
  assert.equal(BO3_PHOTOS_ON, false);
  assert.equal(bo3PhotoPath('arT'), null);
  assert.equal(bo3PhotoPath('arT', true), '/players/bo3/art.webp');
  assert.equal(bo3PhotoPath('ninguem_xyz', true), null);
  assert.equal(initials('n1ssim'), 'N1');
  const field = buildField(MAJOR_SG_CONFIG, MAJOR_SG_DATASET);
  const run = simulateMajor(field, makeRng(7));
  const d = majorCardData(run, () => ({ name: 'X', tag: 'X', players: ['a', 'b', 'c', 'd', 'e', 'f'] }));
  assert.equal(d.champion.players?.length, 5);
});
test('Legacy 2026: dumau, latto, try, n1ssim, arT (coach RiVAS)', () => {
  const l = MAJOR_SG_DATASET.find((t) => t.id === 'bo3_team_8118')!;
  assert.deepEqual(l.players.map((p) => p.nick).sort(), ['arT', 'dumau', 'latto', 'n1ssim', 'try'].sort());
  assert.equal(l.coach?.nick, 'RiVAS');
});
