// Modo Major (PGL Major Singapore 2026): o motor é puro e determinístico.
// Roda `tsx --test scripts/test-major-singapore.mts`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/major-singapore-2026.json' with { type: 'json' };
import {
  validateMajorData, simulateMajor, stageEntrants, swissBestOf, seriesWinP, mapWinP,
  emptyPicks, pickPool, normalizePicks, bracketSides, picksComplete, scorePicks, phaseOdds,
  encodePicks, decodePicks, listVersion, type MajorData, type MajorPicks,
} from '../src/engine/majorSingapore.ts';

const D = data as unknown as MajorData;

test('o JSON do Major é válido: 32 times, ids e seeds únicos', () => {
  assert.deepEqual(validateMajorData(D), []);
});

test('mesma seed, mesmo Major', () => {
  for (const s of [1, 42, 99999]) assert.deepEqual(simulateMajor(D, s), simulateMajor(D, s));
});

test('cada stage tem 16 times e classifica exatamente 8 com 3 vitórias', () => {
  for (let s = 1; s <= 200; s++) {
    const r = simulateMajor(D, s);
    for (const st of r.stages) {
      assert.equal(st.teams.length, 16);
      assert.equal(st.advanced.length, 8);
      assert.equal(st.eliminated.length, 8);
      for (const rec of st.records) assert.ok((rec.w === 3) !== (rec.l === 3), `record ${rec.w}-${rec.l}`);
      // ninguém joga duas vezes na mesma rodada
      for (const round of st.rounds) {
        const ids = round.flatMap((m) => [m.a, m.b]);
        assert.equal(new Set(ids).size, ids.length);
      }
    }
    // stage 2 = 8 do stage 1 + seeds 9–16; stage 3 = 8 do stage 2 + seeds 1–8
    const s2 = new Set(r.stages[1].teams);
    for (const id of r.stages[0].advanced) assert.ok(s2.has(id));
    for (const t of stageEntrants(D, 2)) assert.ok(s2.has(t.id));
    const s3 = new Set(r.stages[2].teams);
    for (const t of stageEntrants(D, 3)) assert.ok(s3.has(t.id));
    assert.deepEqual([...r.playoffs.seeds].sort(), [...r.stages[2].advanced].sort());
    assert.ok(r.playoffs.seeds.includes(r.playoffs.champion));
    assert.equal(r.playoffs.final.bestOf, 5);
    assert.equal(Math.max(...r.playoffs.final.score), 3);
  }
});

test('MD1 no meio do suíço, MD3 nas partidas que classificam/eliminam e no Stage 3', () => {
  assert.equal(swissBestOf(1, 0, 0), 1);
  assert.equal(swissBestOf(1, 2, 1), 3);
  assert.equal(swissBestOf(2, 1, 2), 3);
  assert.equal(swissBestOf(3, 0, 0), 3);
});

test('probabilidade de série é coerente', () => {
  assert.equal(seriesWinP(0.5, 3), 0.5);
  assert.ok(seriesWinP(0.6, 5) > seriesWinP(0.6, 3));
  assert.ok(Math.abs(mapWinP(1600, 1500) + mapWinP(1500, 1600) - 1) < 1e-12);
});

function fullPicks(): MajorPicks {
  let p = emptyPicks();
  p.s1 = pickPool(D, p, 1).slice(0, 8).map((t) => t.id);
  p.s2 = pickPool(D, p, 2).slice(0, 8).map((t) => t.id);
  p.s3 = pickPool(D, p, 3).slice(0, 8).map((t) => t.id);
  for (let i = 0; i < 7; i++) { p.bracket[i] = bracketSides(D, p)[i][0]; }
  p = normalizePicks(D, p);
  return p;
}

test('palpite completo, link de ida e volta', () => {
  const p = fullPicks();
  assert.ok(picksComplete(p));
  const code = encodePicks(D, p);
  assert.ok(code.startsWith(`${listVersion(D)}.`));
  assert.deepEqual(decodePicks(D, code), p);
  assert.equal(decodePicks(D, `zzzz.${code.slice(5)}`), null, 'lista diferente não decodifica');
  assert.equal(decodePicks(D, 'lixo'), null);
});

test('trocar um classificado do Stage 1 limpa o que dependia dele', () => {
  const p = fullPicks();
  const out = pickPool(D, emptyPicks(), 1).find((t) => !p.s1.includes(t.id))!;
  const changed = normalizePicks(D, { ...p, s1: [...p.s1.slice(1), out.id] });
  assert.ok(!changed.s2.includes(p.s1[0]));
  for (const id of changed.s2) assert.ok(pickPool(D, changed, 2).some((t) => t.id === id));
});

test('pontuação: palpite igual ao resultado faz o máximo', () => {
  const r = simulateMajor(D, 7);
  const sides = (i: number) => r.playoffs.seeds;
  void sides;
  const all = [...r.playoffs.qf, ...r.playoffs.sf, r.playoffs.final].map((m) => m.winner);
  const rec = (i: number, w: number, l: number) => r.stages[i].records.filter((x) => x.w === w && x.l === l).map((x) => x.id).slice(0, 2);
  const p: MajorPicks = {
    s1: r.stages[0].advanced, s2: r.stages[1].advanced, s3: r.stages[2].advanced, bracket: all,
    x30: [rec(0, 3, 0), rec(1, 3, 0), rec(2, 3, 0)], x03: [rec(0, 0, 3), rec(1, 0, 3), rec(2, 0, 3)],
  };
  const sc = scorePicks(p, r);
  // o máximo assume 2 times em 3-0 e 2 em 0-3 por stage; o suíço sempre tem exatamente 2 de cada
  assert.equal(sc.points, sc.max);
  assert.ok(sc.champion);
  assert.equal(scorePicks(emptyPicks(), r).points, 0);
});

test('suíço Valve: Buchholz, sem revanche e classificados em ordem W-L/Buchholz', () => {
  for (const seed of [1, 2, 3, 42, 99]) {
    const r = simulateMajor(D, seed);
    for (const st of r.stages) {
      const seen = new Set<string>();
      for (const round of st.rounds) for (const m of round) {
        const k = [m.a, m.b].sort().join('|');
        assert.ok(!seen.has(k), `revanche no stage ${st.stage}`);
        seen.add(k);
      }
      const rec = new Map(st.records.map((x) => [x.id, x]));
      for (let i = 1; i < st.advanced.length; i++) {
        const a = rec.get(st.advanced[i - 1])!, b = rec.get(st.advanced[i])!;
        assert.ok(a.l < b.l || (a.l === b.l && (a.buchholz ?? 0) >= (b.buchholz ?? 0)), 'ordem dos classificados');
      }
    }
  }
});

test('previsões: probabilidades somam o esperado', () => {
  const o = phaseOdds(D, 300);
  const sum = (f: (x: (typeof o)[number]) => number) => o.reduce((s, x) => s + f(x), 0);
  assert.ok(Math.abs(sum((x) => x.title) - 1) < 1e-9);
  assert.ok(Math.abs(sum((x) => x.playoffs) - 8) < 1e-9);
  assert.ok(Math.abs(sum((x) => x.s1 ?? 0) - 8) < 1e-9);
});

test('Legacy: dumau, latto, try, n1ssim, arT + coach RiVAS', async () => {
  const bo3 = (await import('../src/data/bo3-2026.json', { with: { type: 'json' } })).default as { id: string; players: { nick: string }[]; coach?: { nick: string } }[];
  const lg = D.teams.find((t) => t.name === 'Legacy')!;
  const team = bo3.find((t) => t.id === lg.bo3Id)!;
  assert.deepEqual(team.players.map((p) => p.nick), ['dumau', 'latto', 'try', 'n1ssim', 'arT']);
  assert.equal(team.coach?.nick, 'RiVAS');
});
