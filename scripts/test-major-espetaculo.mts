// [super atualização 2 · Major como espetáculo] lógica pura da apresentação:
// pick'em (palpite, correção, sequência), momentos, quadro suíço, segmentação
// dos stages, números do torneio e chance de título. Roda via `npm run test:sim`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addPick, emptyBook, gradePicks, hubPicks, momentOf, pickKey, segmentStages, swissBoard, titleOdds, majorNumbers, eventDay,
  type HistoryItem,
} from '../src/pages/career/major/logic.ts';
import type { Pairing, SeriesResult, TTeam } from '../src/types.ts';

const res = (winner: 0 | 1, maps: [number, number][] = [[13, 7]]): SeriesResult => ({
  teamIds: ['x', 'y'], winner, mapScore: winner === 0 ? [1, 0] : [0, 1],
  maps: maps.map((score) => ({ map: 'mirage', pickedBy: -1, score, halves: '', ot: score[0] + score[1] > 24, winner: score[0] > score[1] ? 0 : 1, roundLog: [], killFeed: [], stats: {} })),
} as unknown as SeriesResult);
const P = (a: string, b: string, label: string, r?: SeriesResult): Pairing => ({ a, b, label, ...(r ? { result: r } : {}) });
const H = (phase: string, p: Pairing): HistoryItem => ({ phase, pairing: p });

test("pick'em: palpite em confronto pendente, acerto contado depois", () => {
  const pend = P('a', 'b', '0-0');
  let book = addPick(emptyBook(), 1, pend, 'a', []);
  assert.equal(book.picks[pickKey(1, pend)].pick, 'a');
  assert.deepEqual(gradePicks(book, []), { score: 0, total: 0, pending: 1, streak: 0, rows: gradePicks(book, []).rows });
  const hist = [H('Suíça - Rodada 1', P('a', 'b', '0-0', res(0)))];
  const g = gradePicks(book, hist);
  assert.equal(g.score, 1); assert.equal(g.total, 1); assert.equal(g.pending, 0); assert.equal(g.streak, 1);
  // troca de palpite substitui (mesma chave)
  book = addPick(book, 1, pend, 'b', []);
  assert.equal(gradePicks(book, hist).score, 0);
});

test("pick'em: não aceita palpite em jogo do usuário, jogo resolvido ou time de fora", () => {
  const b0 = emptyBook();
  assert.equal(addPick(b0, 1, P('user', 'b', '0-0'), 'b', []), b0);
  assert.equal(addPick(b0, 1, P('a', 'b', '0-0', res(0)), 'a', []), b0);
  assert.equal(addPick(b0, 1, P('a', 'b', '0-0'), 'z', []), b0);
});

test("pick'em: mesmo confronto em stages diferentes casa com a ocorrência certa", () => {
  const s1 = [H('Suíça - Rodada 1', P('a', 'b', '0-0', res(0)))];
  // no Stage 2 o mesmo par (mesmo rótulo) volta a se enfrentar: o palpite é feito depois do 1º
  const book = addPick(emptyBook(), 2, P('a', 'b', '0-0'), 'b', s1);
  assert.equal(gradePicks(book, s1).pending, 1, 'o jogo do Stage 1 não conta pro palpite do Stage 2');
  const s2 = [...s1, H('Suíça - Rodada 1', P('a', 'b', '0-0', res(1)))];
  assert.equal(gradePicks(book, s2).score, 1);
});

test("pick'em: hubPicks traduz pra chave a|b do stage atual", () => {
  const p = P('c', 'd', '1-0');
  const book = addPick(addPick(emptyBook(), 1, p, 'd', []), 2, p, 'c', []);
  assert.deepEqual(hubPicks(book, 2, [p]), { 'c|d': 'c' });
});

test('momentos: elimination, decider, advancement e playoffs', () => {
  const sw = { phase: 'swiss' as const };
  assert.equal(momentOf(sw, { label: '0-0' }), 'opener');
  assert.equal(momentOf(sw, { label: '0-2' }), 'elimination');
  assert.equal(momentOf(sw, { label: '1-2' }), 'elimination');
  assert.equal(momentOf(sw, { label: '2-2' }), 'decider');
  assert.equal(momentOf(sw, { label: '2-0' }), 'advancement');
  assert.equal(momentOf({ phase: 'semis' }, { label: 'SF1' }), 'semis');
  assert.equal(momentOf({ phase: 'final' }, { label: 'FINAL' }), 'final');
});

test('quadro suíço: colunas por rodada, recordes e classificados 3-0', () => {
  const h: HistoryItem[] = [];
  // a vence 3 seguidas, d perde 3 seguidas
  h.push(H('Suíça - Rodada 1', P('a', 'd', '0-0', res(0))), H('Suíça - Rodada 1', P('b', 'c', '0-0', res(0))));
  h.push(H('Suíça - Rodada 2', P('a', 'b', '1-0', res(0))), H('Suíça - Rodada 2', P('d', 'c', '0-1', res(1))));
  h.push(H('Suíça - Rodada 3', P('a', 'b', '2-0', res(0))));
  const bd = swissBoard(h, { round: 3, pairings: [P('d', 'c', '0-2')] });
  assert.equal(bd.columns.length, 3);
  assert.deepEqual(bd.columns[1].cells.map((c) => c.label), ['1-0', '0-1']);
  assert.ok(bd.columns[2].cells.some((c) => c.matches.some((m) => m.pending)));
  assert.deepEqual(bd.qualified, [{ id: 'a', rec: '3-0' }]);
});

test('segmentação: cada suíço recomeça na rodada 1; o mata-mata vira o último stage', () => {
  const r = (n: number) => H(`Suíça - Rodada ${n}`, P('a', 'b', '0-0', res(0)));
  const segs = segmentStages([r(1), r(1), r(2), r(5), r(1), r(3), H('Quartas de final', P('a', 'b', 'QF1', res(0))), H('Semifinal', P('a', 'c', 'SF1', res(0)))]);
  assert.deepEqual(segs.map((s) => s.length), [4, 2, 2]);
});

test('números: séries, mapas, OT, jogo mais apertado e campanha do usuário', () => {
  const h = [
    H('Suíça - Rodada 1', P('user', 'b', '0-0', res(0, [[16, 14]]))),
    H('Suíça - Rodada 2', P('c', 'user', '1-0', res(0, [[13, 2], [11, 13], [13, 9]]))),
  ];
  const n = majorNumbers(h, [] as TTeam[]);
  assert.equal(n.series, 2); assert.equal(n.maps, 4); assert.equal(n.overtimes, 1);
  assert.deepEqual(n.userSeries, { w: 1, l: 1 });
  assert.deepEqual(n.userMaps, { w: 2, l: 2 });
  assert.deepEqual(n.blowout?.score, [13, 2]);
});

test('chance de título: determinística, soma ≤ 1 e o mais forte é favorito', () => {
  const teams = Array.from({ length: 16 }, (_, i) => ({ id: i === 0 ? 'user' : `t${i}`, s: 60 + i * 2, w: 0, l: 0, status: 'alive' as const }));
  const inp = { teams, phase: 'swiss' as const, stageOnly: true, laterSeeds: [] };
  const a = titleOdds(inp, 'user', 400, 'k');
  const b = titleOdds(inp, 'user', 400, 'k');
  assert.deepEqual(a, b);
  assert.equal(a.favorites[0].id, 't15');
  assert.ok(a.title < a.favorites[0].p);
  assert.ok(a.playoffs >= a.title && a.playoffs <= 1);
  // mata-mata: sem o usuário vivo, chance zero
  const po = titleOdds({ ...inp, stageOnly: false, phase: 'semis', bracketAlive: ['t1', 't2', 't3', 't4'] }, 'user', 200);
  assert.equal(po.title, 0);
});

test('dia de evento cresce com o stage e a rodada', () => {
  assert.equal(eventDay(1, { phase: 'swiss', swissRound: 1 }), 1);
  assert.equal(eventDay(3, { phase: 'swiss', swissRound: 5 }), 15);
  assert.equal(eventDay(4, { phase: 'final', swissRound: 5 }), 18);
});
