// MUNDO EM SEGUNDO PLANO (fase 4 · frente J): os eventos que você não joga.
//
//   - o modelo de força calibrado bate com o motor de partida (vitória × Δforça);
//   - formatos: GSL 16 → playoffs 8, suíço 16, Major (RMRs → 3 stages → playoffs);
//   - o que o usuário jogou de verdade entra no Major; o resto completa;
//   - determinístico (mesmo save, mesmo mundo) e RÁPIDO (avanço de semana);
//   - semeadura: save migrado/carreira nova nascem com ranking e passado.
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateSeries } from '../src/engine/match.ts';
import { autoVeto } from '../src/engine/veto.ts';
import { makeRng } from '../src/engine/rng.ts';
import { realTeams } from './calibrate-engine.mts';
import {
  pSeriesWin, quickSeries, quickGslEvent, quickSwiss, completeMajor, seedRng, QUICK_MAP_K,
} from '../src/engine/mundo/mundoSim.ts';
import {
  simulateEtapaWorld, leaguePlacements, majorFieldFromVrs, majorRouteOf, majorResults, seedWorld, userRecordsFromHistory,
  worldHeadlines, splitEtapaOf, closeWorld, graftPlacement, USER_ID,
} from '../src/engine/mundo/mundoCarreira.ts';
import { buildEtapaEvents, etapaTime, isMajorSplit, RMR_SLOTS, MAJOR_S1, EVENTS_PER_SPLIT } from '../src/engine/mundo/circuito.ts';
import { T1_EVENTS, T2_EVENTS, MAJOR_NAMES, t1EventName } from '../src/data/tournaments.ts';
import { computeVrs, publishVrs } from '../src/engine/mundo/vrs.ts';
import { aiPool, strengthMap } from './measure-circuito.mts';
import type { MundoState } from '../src/engine/mundo/model.ts';

test('modelo calibrado: vitória de série MD3 × Δforça acompanha o motor de partida', () => {
  const teams = realTeams().sort((a, b) => b.strength - a.strength).slice(0, 100);
  const rng = makeRng(20260929);
  const bins = new Map<number, [number, number, number]>(); // Δ → [vitórias no motor, p do modelo, n]
  for (let i = 0; i < 700; i++) {
    const a = teams[Math.floor(rng() * teams.length)], b = teams[Math.floor(rng() * teams.length)];
    const d = a.strength - b.strength;
    if (a.id === b.id || Math.abs(d) > 12) continue;
    const k = Math.sign(d) * Math.min(3, Math.floor(Math.abs(d) / 4)); // faixas de 4 pontos
    const r = simulateSeries(makeRng(9000 + i), a, b, autoVeto([a, b], makeRng(i + 1), 3), 3);
    const cur = bins.get(k) ?? [0, 0, 0];
    bins.set(k, [cur[0] + (r.winner === 0 ? 1 : 0), cur[1] + pSeriesWin(d, 3), cur[2] + 1]);
  }
  for (const [k, [w, p, n]] of [...bins.entries()].sort((x, y) => x[0] - y[0])) {
    if (n < 40) continue;
    const eng = w / n, mod = p / n;
    console.log(`  Δ ${k * 4 >= 0 ? '+' : ''}${k * 4}…: motor ${(eng * 100).toFixed(0)}% · modelo ${(mod * 100).toFixed(0)}% (n=${n})`);
    assert.ok(Math.abs(eng - mod) < 0.12, `faixa ${k}: motor ${eng.toFixed(2)} × modelo ${mod.toFixed(2)}`);
  }
  assert.ok(QUICK_MAP_K > 0.1 && QUICK_MAP_K < 0.2);
  // a série sai mapa a mapa: MD5 amplia a vantagem do favorito
  assert.ok(pSeriesWin(4, 5) > pSeriesWin(4, 3) && pSeriesWin(4, 3) > pSeriesWin(4, 1));
  assert.equal(pSeriesWin(0, 3), 0.5);
  const s = quickSeries(seedRng('x'), { id: 'a', s: 90 }, { id: 'b', s: 80 }, 3);
  assert.ok(Math.max(...s.score) === 2 && Math.min(...s.score) <= 1);
});

test('formatos: GSL 16 → playoffs 8 (colocações reais) e suíço de 16 (3-x)', () => {
  const teams = Array.from({ length: 16 }, (_, i) => ({ id: `t${i}`, s: 90 - i }));
  const g = quickGslEvent(seedRng('gsl'), teams);
  const count = (p: number) => g.placements.filter((x) => x.place === p).length;
  assert.equal(g.placements.length, 16);
  assert.deepEqual([count(1), count(2), count(3), count(5), count(9), count(13)], [1, 1, 2, 4, 4, 4]);
  assert.equal(new Set(g.placements.map((x) => x.teamId)).size, 16);
  // qualquer tamanho de field: TODO time sai com colocação (o segundo plano roda
  // com 15 — a 16ª vaga é a do usuário — e antes 5 times sumiam do evento)
  for (let n = 4; n <= 20; n++) {
    for (let k = 0; k < 25; k++) {
      const field = Array.from({ length: n }, (_, i) => ({ id: `f${i}`, s: 88 - i * 0.7 }));
      const r = quickGslEvent(seedRng(`gsl:${n}:${k}`), field);
      assert.equal(r.placements.length, n, `${n} times: ${r.placements.length} colocados`);
      assert.equal(new Set(r.placements.map((x) => x.teamId)).size, n, `${n} times: colocação duplicada`);
      assert.equal(r.placements.filter((x) => x.place === 1).length, 1, `${n} times: um campeão`);
      assert.equal(r.placements.filter((x) => x.place === 2).length, 1, `${n} times: um vice`);
    }
  }
  const sw = quickSwiss(seedRng('sw'), teams);
  assert.equal(sw.order.length, 16);
  for (const id of sw.order.slice(0, 8)) assert.equal(sw.record[id][0], 3, `${id} classificado com 3 vitórias`);
  for (const id of sw.order.slice(8)) assert.equal(sw.record[id][1], 3, `${id} eliminado com 3 derrotas`);
  // o favorito vai longe mais vezes que o azarão
  let fav = 0, dog = 0;
  for (let i = 0; i < 300; i++) {
    const r = quickGslEvent(seedRng(`gsl${i}`), teams);
    if (r.placements.find((p) => p.teamId === 't0')!.place <= 2) fav++;
    if (r.placements.find((p) => p.teamId === 't15')!.place <= 2) dog++;
  }
  assert.ok(fav > dog * 4, `favorito ${fav} × azarão ${dog}`);
});

test('Major: RMRs → Stage 1/2/3 → playoffs; o que o usuário jogou de verdade é respeitado', () => {
  const pool = aiPool(4);
  const str = strengthMap(pool);
  const sOf = (id: string) => str.get(id) ?? 75;
  const vrs = publishVrs(computeVrs([], 0));
  const plan = majorFieldFromVrs(vrs, pool, { region: 'americas' });
  assert.equal(plan.s3.length, 8);
  assert.equal(plan.s2.length, 8);
  assert.equal(plan.s1Invites.length, 8);
  for (const reg of ['europe', 'americas', 'asia'] as const) assert.ok((plan.rmr[reg]?.field.length ?? 0) >= 8, `RMR ${reg}`);
  const w = completeMajor(plan, sOf, 'm1');
  assert.equal(w.major.length, 32);
  assert.equal(w.major.filter((p) => p.place === 1).length, 1);
  assert.equal(w.major.filter((p) => p.place === 25).length, 8, 'Stage 1: 8 eliminados');
  assert.equal(w.major.filter((p) => p.place === 17).length, 8, 'Stage 2: 8 eliminados');
  assert.equal(w.major.filter((p) => p.place === 9).length, 8, 'Stage 3: 8 eliminados');
  for (const reg of ['europe', 'americas', 'asia'] as const) assert.equal(w.rmrQualified[reg]?.length, RMR_SLOTS[reg]);
  assert.equal(new Set(w.major.map((p) => p.teamId)).size, 32);
  assert.deepEqual(completeMajor(plan, sOf, 'm1'), w, 'determinístico');
  // o usuário ganhou o Major de verdade: o mundo mostra o usuário campeão
  const po = w.stageFields[3].slice(0, 8);
  const forced = completeMajor({ ...plan, playoffs: { seeds: po, places: Object.fromEntries(po.map((id, i) => [id, i === 3 ? 1 : i === 0 ? 2 : 5])) } }, sOf, 'm1');
  assert.equal(forced.champion, po[3]);
  // rota pelo ranking
  assert.deepEqual(majorRouteOf({ ...plan, ranked: [USER_ID, ...plan.ranked] }), { kind: 'stage', stage: 3 });
  const late = plan.ranked.filter((id) => id !== USER_ID); late.splice(MAJOR_S1 + 2, 0, USER_ID);
  const withUser = majorFieldFromVrs(Object.fromEntries(late.map((id, i) => [id, { teamId: id, points: 5000 - i, history: [] }])), pool, { region: 'americas' });
  assert.deepEqual(majorRouteOf(withUser), { kind: 'rmr', region: 'americas' });
  assert.equal(majorResults(4, w).length, 4, '3 RMRs + o Major');
});

test('etapa em segundo plano: determinística, pula o SEU evento, e é rápida (avanço de semana)', () => {
  const pool = aiPool(2);
  const str = strengthMap(pool);
  const sOf = (id: string) => str.get(id) ?? 75;
  const events = buildEtapaEvents(pool, 2, 1, null);
  const all = simulateEtapaWorld(events, 2, 1, sOf);
  assert.equal(all.length, events.length);
  assert.deepEqual(simulateEtapaWorld(events, 2, 1, sOf), all);
  const skip = simulateEtapaWorld(events, 2, 1, sOf, new Set([events[0].id]));
  assert.equal(skip.length, events.length - 1);
  assert.ok(all.every((r) => r.t === etapaTime(2, 1) && r.prizePool! > 0 && r.placements.length === r.field));
  // desempenho: etapa inteira (8 eventos) + publicar o VRS, e o Major completo
  let m: MundoState = { v: 1, calendar: [], results: [], vrs: {}, newgens: {}, intake: [], databaseId: null };
  const t0 = performance.now();
  for (let split = 1; split <= 6; split++) {
    for (let e = 1; e <= 3; e++) m = closeWorld(m, simulateEtapaWorld(buildEtapaEvents(pool, split, e, m.vrs), split, e, sOf), etapaTime(split, e)).mundo;
  }
  const perEtapa = (performance.now() - t0) / 18;
  const t1 = performance.now();
  for (let i = 0; i < 10; i++) completeMajor(majorFieldFromVrs(m.vrs, pool, null), sOf, `perf${i}`);
  const perMajor = (performance.now() - t1) / 10;
  console.log(`  etapa em segundo plano + VRS: ${perEtapa.toFixed(2)} ms · Major completo: ${perMajor.toFixed(2)} ms`);
  assert.ok(perEtapa < 25, `etapa lenta: ${perEtapa} ms`);
  assert.ok(perMajor < 25, `Major lento: ${perMajor} ms`);
});

test('o SEU evento: colocações da liga GSL + playoffs viram resultado do mundo', () => {
  const league = { teams: Array.from({ length: 16 }, (_, i) => ({ id: i === 0 ? USER_ID : `t${i}` })), gsl: { place: {} as Record<string, number> } };
  ['t9', 't10', 't11', 't12'].forEach((id) => { league.gsl.place[id] = 3; });
  ['t13', 't14', 't15', 't8'].forEach((id) => { league.gsl.place[id] = 4; });
  const m = (a: string, b: string, winner: 0 | 1) => ({ a, b, result: { winner } });
  const playoff = {
    seeds: [USER_ID, 't1', 't2', 't3', 't4', 't5', 't6', 't7'],
    qf: [m(USER_ID, 't5', 0), m('t2', 't7', 0), m('t1', 't4', 1), m('t3', 't6', 0)],
    sf: [m(USER_ID, 't2', 0), m('t4', 't3', 1)],
    final: m(USER_ID, 't3', 1), champion: 't3', runnerUp: USER_ID,
  };
  const pl = leaguePlacements(league, playoff);
  const place = (id: string) => pl.find((p) => p.teamId === id)!.place;
  assert.equal(place('t3'), 1);
  assert.equal(place(USER_ID), 2);
  assert.equal(place('t2'), 3);
  assert.equal(place('t4'), 3);
  assert.equal(place('t5'), 5);
  assert.equal(place('t9'), 9);
  assert.equal(place('t8'), 13);
  assert.equal(pl.length, 16);
});

test('semeadura: o mundo nasce com passado, ranking e (no takeover) a sua posição herdada', () => {
  const pool = aiPool(1);
  const str = strengthMap(pool);
  const sOf = (id: string) => str.get(id) ?? 75;
  const s = seedWorld({ pool, strengthOf: sOf, now: 0 });
  assert.ok(Object.keys(s.vrs).length >= 80, 'ranking com o mundo inteiro');
  assert.ok(s.results.some((r) => r.kind === 'major'), 'o Major passado está no histórico');
  // o split 0 é de Major: o Major semeado (majorTime = −0,5) já passou, então o
  // ranking semeado é publicado depois dele
  assert.equal(s.vrsAt, -0.5);
  const strong = [...pool].sort((a, b) => b.teamwork - a.teamwork)[0];
  const tk = seedWorld({ pool, strengthOf: sOf, now: 0, takeoverId: strong.id });
  assert.ok(tk.vrs[USER_ID] && !tk.vrs[strong.id], 'assumir um time herda a posição dele');
  assert.ok((tk.vrs[USER_ID].rank ?? 99) <= 25, `a elite assumida segue perto do topo (#${tk.vrs[USER_ID].rank})`);
  // save migrado: os resultados reais das últimas etapas entram no mundo
  const recs = userRecordsFromHistory([
    { circuit: 'ESEA Advanced Season', position: 1 }, { circuit: 'CCT Open Series', position: 2 }, { circuit: 'European Pro League', position: 1 },
  ], 9, () => 3);
  assert.equal(recs.length, 3);
  assert.equal(recs[0].t, 8);
  const mig = seedWorld({ pool, strengthOf: sOf, now: 9, userRecords: recs });
  assert.ok(mig.vrs[USER_ID], 'o usuário migrado tem ranking');
  assert.ok(mig.results.filter((r) => r.placements.some((p) => p.teamId === USER_ID)).length >= 3);
  assert.deepEqual(splitEtapaOf(etapaTime(5, 2)), { split: 5, etapa: 2 });
  assert.deepEqual(splitEtapaOf(-1), { split: 0, etapa: 3 });
});

test('semeadura de save migrado: enxerto empurra as colocações (um só campeão)', () => {
  const ev = Array.from({ length: 16 }, (_, i) => ({ teamId: `a${i}`, place: [1, 2, 3, 3, 5, 5, 5, 5, 9, 9, 9, 9, 13, 13, 13, 13][i] }));
  const g = graftPlacement(ev, USER_ID, 1);
  assert.equal(g.length, 16, 'o field não cresce');
  assert.deepEqual(g.filter((p) => p.place === 1).map((p) => p.teamId), [USER_ID], 'um só campeão');
  assert.equal(g.find((p) => p.teamId === 'a0')!.place, 2, 'o campeão simulado vira vice');
  assert.equal(g.find((p) => p.teamId === 'a1')!.place, 3);
  assert.ok(!g.some((p) => p.teamId === 'a15'), 'o último sai');
  assert.deepEqual(g.map((p) => p.place).sort((a, b) => a - b), ev.map((p) => p.place));
  const mid = graftPlacement(ev, USER_ID, 5);
  assert.equal(mid.find((p) => p.teamId === USER_ID)!.place, 5);
  assert.equal(mid.filter((p) => p.place === 1).length, 1);
  assert.equal(mid.find((p) => p.teamId === 'a0')!.place, 1, 'acima de você nada muda');
  // o Major do histórico vira a sua colocação real
  const recs = userRecordsFromHistory([
    { split: 3, circuit: 'x', position: 3 }, { split: 4, circuit: 'x', position: 1 }, { split: 4, circuit: 'x', position: 1, major: { placement: 'champion' } },
  ], 12, () => 1);
  assert.deepEqual(recs[0].major, { split: 4, place: 1 });
  assert.equal(recs[1].major, undefined);
});

test('save migrado dominante (6 últimos T1 + último Major): #1 em qualquer etapa, #2 da IA < 1700', () => {
  const tierOf = (name: string): 1 | 2 | 3 => (T1_EVENTS.includes(name) || MAJOR_NAMES.includes(name) ? 1 : T2_EVENTS.includes(name) ? 2 : 3);
  for (const [split, etapa] of [[21, 1], [21, 2], [21, 3], [20, 3], [22, 2]] as const) {
    const pool = aiPool(split);
    const str = strengthMap(pool);
    const sOf = (id: string) => str.get(id) ?? 75;
    const history: { split: number; circuit: string; position: number; major?: { placement: string } }[] = [];
    for (let s = 1; s <= split; s++) {
      for (let e = 1; e <= EVENTS_PER_SPLIT && (s < split || e < etapa); e++) {
        history.push({ split: s, circuit: t1EventName(s, e), position: 1, ...(e === EVENTS_PER_SPLIT && isMajorSplit(s) ? { major: { placement: 'champion' } } : {}) });
      }
    }
    const now = etapaTime(split, etapa);
    const seeded = seedWorld({ pool, strengthOf: sOf, now, userRecords: userRecordsFromHistory(history, now, tierOf) });
    const order = Object.values(seeded.vrs).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    assert.equal(order[0].teamId, USER_ID, `split ${split} etapa ${etapa}: #1 é ${order[0].teamId}`);
    assert.ok(order[1].points < 1700, `split ${split} etapa ${etapa}: #2 da IA com ${order[1].points}`);
    for (const r of seeded.results.filter((x) => x.placements.some((p) => p.teamId === USER_ID))) {
      assert.equal(r.placements.filter((p) => p.place === 1).length, 1, `${r.eventId}: um só campeão`);
    }
    const major = seeded.results.find((r) => r.kind === 'major' && r.split === 20);
    if (major && now - 6 <= 59) assert.equal(major.placements.find((p) => p.place === 1)?.teamId, USER_ID, 'o Major que você venceu é seu');
  }
});

test('manchetes do mundo: campeões do tier 1, zebra e resumo do tier 2 (no máximo 3)', () => {
  const pool = aiPool(1);
  const str = strengthMap(pool);
  const events = buildEtapaEvents(pool, 1, 1, null);
  const res = simulateEtapaWorld(events, 1, 1, (id) => str.get(id) ?? 75);
  const h = worldHeadlines(res, 1, (id) => id.toUpperCase());
  assert.ok(h.length >= 2 && h.length <= 3);
  assert.ok(h.every((x) => x.title && x.body && x.id.startsWith('1:world')));
  assert.equal(new Set(h.map((x) => x.id)).size, h.length);
});
