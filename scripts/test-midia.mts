// [MÍDIA VIVA] coletivas, narrativas, feed derivado, rumores e tamanho do bloco.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMidia, PRESS_TONES, type MidiaState, type PressTone } from '../src/engine/midia/model.ts';
import {
  recordSeries, pressEffects, preMatchConference, narrativesOf, koStageOf, refreshRumors, FX, FX_CAP, type SeriesInput,
} from '../src/engine/midia/midia.ts';
import { buildFeed, trendingOf } from '../src/engine/midia/feed.ts';
import { answerPress, midiaAfterSeries } from '../src/engine/midia/carreira.ts';
import { QUESTION, ANSWER, fill } from '../src/engine/midia/texto.ts';

const squad = [
  { id: 'p1', nick: 'alpha', avg: 1.22 }, { id: 'p2', nick: 'bravo', avg: 0.84 }, { id: 'p3', nick: 'charlie', avg: 1.0 },
  { id: 'p4', nick: 'delta', avg: 1.02 }, { id: 'p5', nick: 'echo', avg: 0.99 },
];
const ev = (o: Partial<SeriesInput>): SeriesInput => ({
  split: 1, oid: 'navi', o: 'NAVI', label: 'IEM · Rodada 1', shortLabel: 'IEM', won: true, sc: '2-0', rivalScore: 0, squad, board: 60, ...o,
});

test('confronto direto: 3 vitórias seguidas = freguês; quebra do tabu', () => {
  let m: MidiaState = defaultMidia();
  for (let i = 0; i < 3; i++) m = recordSeries(m, ev({})).midia;
  assert.equal(m.h2h!.navi.s, 3);
  const n = narrativesOf(m, {}, () => 'NAVI');
  assert.equal(n[0].kind, 'fregUs');
  // 3 derrotas: vira tabu; a vitória seguinte quebra
  for (let i = 0; i < 3; i++) m = recordSeries(m, ev({ won: false, sc: '0-2' })).midia;
  assert.equal(narrativesOf(m, {}, () => 'NAVI')[0].kind, 'fregThem');
  const out = recordSeries({ ...m, cn: undefined }, ev({}));
  assert.equal(out.breaker, 3);
  assert.ok(out.conf, 'quebra de tabu chama coletiva');
});

test('maldição das quartas e coletivas de crise e glória', () => {
  assert.equal(koStageOf('BLAST · QF2'), 'qf');
  assert.equal(koStageOf('IEM · Semifinal'), 'sf');
  assert.equal(koStageOf('IEM · Final'), 'f');
  assert.equal(koStageOf('IEM · Rodada 3'), undefined);
  let m = defaultMidia();
  m = recordSeries(m, ev({ label: 'A · Quartas de final', won: false, sc: '1-2', oid: 'a', o: 'A' })).midia;
  const r = recordSeries({ ...m, cn: undefined }, ev({ label: 'B · QF1', won: false, sc: '0-2', oid: 'b', o: 'B' }));
  assert.ok(narrativesOf(r.midia, {}, (x) => x).some((n) => n.kind === 'curse' && n.k === 'qf'));
  assert.ok(r.conf && r.conf.qs.some((q) => q.t === 'curse'), 'pergunta da maldição');
  // terceira derrota seguida = crise
  // ritmo: logo depois de uma coletiva não sai outra (só a de título)
  assert.equal(recordSeries(r.midia, ev({ won: false, sc: '0-2', oid: 'c', o: 'C' })).conf, null);
  const c = recordSeries({ ...r.midia, cn: undefined }, ev({ won: false, sc: '0-2', oid: 'c', o: 'C' }));
  assert.equal(c.conf?.kind, 'crisis');
  assert.ok(c.conf!.qs.some((q) => q.t === 'streak'));
  assert.ok(c.conf!.qs.some((q) => q.t === 'player' && q.n === 'bravo'), 'jogador em má fase citado');
  const g = recordSeries(c.midia, ev({ label: 'IEM · Final', won: true, sc: '3-1', oid: 'd', o: 'D' }));
  assert.equal(g.conf?.kind, 'glory');
  assert.equal(g.conf!.qs[0].t, 'title');
  // série comum, sem narrativa: sem coletiva
  assert.equal(recordSeries(defaultMidia(), ev({})).conf, null);
});

test('pré-jogo só em jogo grande, e não repete depois de respondida', () => {
  const m = defaultMidia();
  const base = { split: 1, oid: 'navi', o: 'NAVI', rivalScore: 0, squad, board: 60, rumor: null, matchKey: 'x' };
  assert.equal(preMatchConference(m, { ...base, label: 'IEM · Rodada 2' }), null);
  const c = preMatchConference(m, { ...base, label: 'IEM · Semifinal', k: 'sf' });
  assert.ok(c);
  const done = answerPress({ midia: m, morale: {}, board: 60, split: 1 }, c!, c!.qs.map(() => 'calm'), squad.map((s) => s.id), 'Coletiva').patch.midia;
  assert.equal(preMatchConference(done, { ...base, label: 'IEM · Semifinal', k: 'sf' }), null);
  assert.ok(preMatchConference(m, { ...base, label: 'IEM · Rodada 2', rivalScore: 5 }), 'clássico tem coletiva');
});

test('repercussão: pequena, com teto, e os tons se equilibram no elenco', () => {
  for (const [topic, tones] of Object.entries(FX)) {
    const sum = PRESS_TONES.reduce((s, t) => s + tones[t][0], 0);
    assert.ok(Math.abs(sum) <= 1, `${topic}: soma do elenco ${sum}`);
    const best = Math.max(...PRESS_TONES.map((t) => tones[t][0]));
    assert.ok(best <= 2, `${topic}: melhor tom ${best}`);
  }
  const c = recordSeries(recordSeries(recordSeries(defaultMidia(), ev({ won: false })).midia, ev({ won: false })).midia, ev({ won: false })).conf!;
  for (const tone of PRESS_TONES) {
    const fx = pressEffects(c, c.qs.map(() => tone));
    assert.ok(Math.abs(fx.squad) <= FX_CAP.squad && Math.abs(fx.board) <= FX_CAP.board && Math.abs(fx.rep) <= FX_CAP.rep);
    for (const v of Object.values(fx.players)) assert.ok(Math.abs(v) <= FX_CAP.player);
  }
  // cobrar o jogador em público derruba a moral DELE; proteger levanta
  const pi = c.qs.findIndex((q) => q.t === 'player');
  const picks = (t: PressTone) => c.qs.map((_, i) => (i === pi ? t : 'calm')) as PressTone[];
  const r1 = answerPress({ midia: defaultMidia(), morale: { p2: 60 }, board: 50, split: 1 }, c, picks('aggressive'), squad.map((s) => s.id), 'Coletiva');
  const r2 = answerPress({ midia: defaultMidia(), morale: { p2: 60 }, board: 50, split: 1 }, c, picks('calm'), squad.map((s) => s.id), 'Coletiva');
  assert.ok(r1.patch.morale.p2 < 60 && r2.patch.morale.p2 > 60);
  assert.ok(r1.patch.midia.log![0].picks[pi] === 'aggressive');
  // dispensar: diretoria −1, imprensa −3
  const sk = answerPress({ midia: defaultMidia(), morale: {}, board: 50, split: 1 }, c, null, [], 'x');
  assert.equal(sk.patch.board, 49);
  assert.equal(sk.patch.midia.rep, 47);
  assert.equal(sk.patch.midia.log!.length, 0);
});

test('rumores: confirmam quando o jogador vai mesmo para o clube', () => {
  const stars = Array.from({ length: 10 }, (_, i) => ({ pid: `s${i}`, nick: `star${i}`, teamId: `t${i % 4}`, tag: `T${i % 4}` }));
  const buyers = [0, 1, 2, 3].map((i) => ({ id: `t${i}`, tag: `T${i}` }));
  let m = refreshRumors(defaultMidia(), { split: 1, seed: 's', offers: [{ pid: 'p1', nick: 'alpha', toId: 't2', to: 'T2' }], stars, buyers, teamOf: () => null, userTag: 'ORG' });
  assert.equal(m.rum!.length, 3);
  assert.equal(m.rum![0].fromId, 'user');
  const target = m.rum![1];
  m = refreshRumors(m, { split: 2, seed: 's', offers: [], stars, buyers, teamOf: (pid) => (pid === target.pid ? target.toId : 'user'), userTag: 'ORG' });
  const old = m.rum!.filter((r) => r.split === 1);
  assert.equal(old.find((r) => r.pid === target.pid)!.st, 'ok');
  assert.equal(old.find((r) => r.pid === 'p1')!.st, 'no');
  // idempotente no mesmo split
  assert.equal(refreshRumors(m, { split: 2, seed: 's', offers: [], stars, buyers, teamOf: () => null, userTag: 'ORG' }), m);
});

function longCareer(seed = 'save'): MidiaState {
  let m: MidiaState | undefined;
  const world = () => Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, tag: `T${i}`, players: Array.from({ length: 5 }, (_, j) => ({ id: `t${i}p${j}`, nick: `n${i}x${j}`, ovr: 60 + ((i * 7 + j * 3) % 30) })) }));
  for (let i = 0; i < 400; i++) {
    const split = 1 + Math.floor(i / 12);
    const oi = (i * 7) % 90;
    const labels = ['Liga · Rodada 1', 'Liga · QF2', 'Liga · Semifinal', 'Liga · Final', 'Major · 2-1'];
    const r = midiaAfterSeries(m, {
      lang: (['pt', 'en', 'es'] as const)[i % 3], seed, split, tag: 'ORG', opp: { id: `t${oi}`, tag: `T${oi}`, nicks: ['a', 'b'] },
      label: labels[i % 5], shortLabel: 'Liga', won: (i * 13) % 5 < 3, sc: '2-1', upset: i % 11 === 0, mvp: 'alpha', rivalScore: (i % 9),
      squad, board: 50, offers: i % 12 === 0 ? [{ pid: 'p2', nick: 'bravo', toId: 't3', to: 'T3' }] : [], world, teamOf: () => null,
    });
    m = r.midia;
    if (m.pend && i % 2 === 0) m = answerPress({ midia: m, morale: {}, board: 50, split }, m.pend, m.pend.qs.map((_, k) => PRESS_TONES[(i + k) % 4]), ['p1', 'p2'], 'x').patch.midia;
  }
  return m!;
}

test('bloco podado: carreira longa não infla o save', () => {
  const m = longCareer();
  const bytes = JSON.stringify(m).length;
  assert.ok(bytes < 12_000, `bloco da mídia ${bytes} bytes`);
  assert.ok(Object.keys(m.h2h!).length <= 40);
  assert.ok(m.log!.length <= 8 && m.tl!.length <= 16 && m.rum!.length <= 10 && m.done!.length <= 30);
});

test('feed determinístico por seed, nos três idiomas, sem variável sobrando', () => {
  const m = longCareer('A');
  const results = [{ eventId: 'ev:30:1:t1', split: 34, name: 'IEM Cologne', tier: 1, placements: [{ teamId: 't1', place: 1 }, { teamId: 'user', place: 2 }] }];
  const mk = (lang: 'pt' | 'en' | 'es', seed = 'A') => buildFeed({
    lang, seed, split: 34, org: { name: 'Org', tag: 'ORG' }, m, rivalries: { t5: 6 }, results, tagOf: (id) => id.toUpperCase(),
    playerOf: () => 'zywoo', lastMoves: [{ nick: 'm0nesy', from: 'G2', to: 'FaZe' }],
  });
  const a = mk('pt'), b = mk('pt');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((p) => p.likes), mk('pt', 'B').map((p) => p.likes));
  for (const lang of ['pt', 'en', 'es'] as const) {
    const f = mk(lang);
    assert.ok(f.length >= 20, `${lang}: ${f.length} posts`);
    for (const p of [...f, ...f.flatMap((x) => x.thread ?? [])]) assert.ok(!/[{}]/.test(p.text), `${lang}: ${p.text}`);
    assert.ok(f.some((p) => p.scope === 'world') && f.some((p) => p.scope === 'market') && f.some((p) => p.quote));
    assert.ok(trendingOf(f).length >= 3);
  }
});

test('todas as perguntas e respostas existem nos três idiomas', () => {
  for (const [t, q] of Object.entries(QUESTION)) {
    for (const lang of ['pt', 'en', 'es'] as const) {
      assert.ok(q[lang].length >= 1, `${t}/${lang}`);
      for (const tone of PRESS_TONES) assert.ok(fill(lang, ANSWER[t as keyof typeof ANSWER][tone], 0).length > 3);
    }
  }
});
